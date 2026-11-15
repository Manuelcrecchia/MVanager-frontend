import { DOCUMENT_UPLOAD_CLIENT_TIMEOUT_MS, isDocumentUploadPath } from './http-response-deadline';
import { operationId } from './offline-codec';
import { compactCompletion, COMPLETION_PREFIX, COMPLETION_TTL, MAX_RECENT_COMPLETIONS } from './offline-completion';
import type { PendingOperation } from './offline.service';
import { shiftOperationDay } from './offline-policy';

export class OfflineStore {
  private opening?: Promise<IDBDatabase>;
  private open(): Promise<IDBDatabase> {
    if (!this.opening) this.opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('mvanager-offline-v1', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const queue = db.createObjectStore('queue', { keyPath: 'id' });
        queue.createIndex('dedup', 'dedup', { unique: true });
        db.createObjectStore('cache', { keyPath: 'id' });
        db.createObjectStore('drafts', { keyPath: 'id' });
      };
      request.onerror = () => { this.opening = undefined; reject(request.error); };
      request.onblocked = () => { this.opening = undefined; reject(new Error('Archivio locale bloccato da un’altra scheda.')); };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.opening = undefined; };
        resolve(db);
      };
    });
    return this.opening;
  }
  async get<T = any>(store: string, id: string): Promise<T | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store).objectStore(store).get(id);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  }
  async all<T = any>(store: string): Promise<T[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  }
  async getOperation(id: string): Promise<PendingOperation | undefined> {
    return await this.get<PendingOperation>('queue', id) || (await this.get('cache', COMPLETION_PREFIX + id))?.operation;
  }
  async allOperations(): Promise<PendingOperation[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      // Read requests and receipts from the same snapshot during cross-tab completion.
      const tx = db.transaction(['queue', 'cache']);
      const queue = tx.objectStore('queue').getAll(), cache = tx.objectStore('cache').getAll();
      tx.oncomplete = () => {
        const ids = new Set(queue.result.map(row => row.id));
        resolve(queue.result.concat(cache.result.filter(entry => entry.id.startsWith(COMPLETION_PREFIX) && !ids.has(entry.operation.id)).map(entry => entry.operation)));
      };
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  /** Keep only bounded receipts, or IDs still needed by an unsaved editor/dependency. */
  async pruneCompletions(owner: string, activePages: string[]): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['queue', 'cache', 'drafts'], 'readwrite');
      const queue = tx.objectStore('queue').getAll(), drafts = tx.objectStore('drafts').getAll();
      const cache = tx.objectStore('cache'), receipts = cache.getAll();
      let ready = 0;
      const prune = () => {
        if (++ready !== 3) return;
        const referenced = new Set(queue.result.map(row => row.predecessor).filter(Boolean));
        const pages = new Set([...activePages, ...drafts.result.filter(draft => draft.id.startsWith(owner + '|')).map(draft => draft.id.slice(owner.length + 1))]);
        let recent = 0;
        for (const entry of receipts.result.filter(entry => entry.id.startsWith(COMPLETION_PREFIX) && entry.owner === owner).sort((a, b) => b.savedAt - a.savedAt)) {
          const row: PendingOperation = entry.operation;
          const day = shiftOperationDay(row.path, row.body);
          if (referenced.has(row.id) || pages.has(row.page) || (day && Array.from(pages).some(page => page.endsWith('|shift-day:' + day)))) continue;
          // Recent shift IDs can also be needed when a form is reopened.
          // Ordinary confirmed mutations (including stamps and uploads) leave no disk copy.
          const useful = row.path.startsWith('/shifts/');
          if (!useful || Date.now() - entry.savedAt > COMPLETION_TTL || ++recent > MAX_RECENT_COMPLETIONS) cache.delete(entry.id);
        }
      };
      queue.onsuccess = prune; drafts.onsuccess = prune; receipts.onsuccess = prune;
      tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async forgetCompletion(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['queue', 'cache'], 'readwrite'), cache = tx.objectStore('cache');
      const request = tx.objectStore('queue').getAll();
      request.onsuccess = () => {
        if (request.result.some(row => row.predecessor === id)) return;
        const receipt = cache.get(COMPLETION_PREFIX + id);
        receipt.onsuccess = () => { if (receipt.result?.operation.state !== 'archived') cache.delete(COMPLETION_PREFIX + id); };
      };
      tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async put(store: string, value: any): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async remove(store: string, id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async removeDraftVersion(id: string, expected?: { revision?: string; savedAt: number } | null): Promise<boolean> {
    if (expected === null) return false;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['drafts', 'cache'], 'readwrite'), drafts = tx.objectStore('drafts');
      let removed = false;
      const read = drafts.get(id);
      read.onsuccess = () => {
        const current = read.result;
        if (expected && (!current || current.revision !== expected.revision || current.savedAt !== expected.savedAt)) return;
        drafts.delete(id);
        tx.objectStore('cache').delete(`editor|${id}`);
        removed = true;
      };
      tx.oncomplete = () => resolve(removed); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async enqueue<T extends { dedup: string }>(value: T): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['queue', 'cache'], 'readwrite'), store = tx.objectStore('queue');
      let result = value; let intentConflict = false;
      const previous = store.index('dedup').get(value.dedup);
      previous.onsuccess = () => {
        if (previous.result) { result = previous.result; return; }
        const metadata = tx.objectStore('cache'), counter = metadata.get('queue-sequence');
        counter.onsuccess = () => {
          const check = store.getAll();
          check.onsuccess = () => {
          const intent = (value as any).intent;
          if (intent && check.result.some(row => row.owner === (value as any).owner && row.intent === intent && row.state !== 'archived')) { intentConflict = true; return; }
          const sequence = Math.max(Date.now(), Number(counter.result?.value || 0) + 1);
          metadata.put({ id: 'queue-sequence', value: sequence, savedAt: Date.now() });
          result = { ...value, sequence }; store.add(result);
          };
        };
      };
      tx.oncomplete = () => intentConflict ? reject({ code: 'OFFLINE_BUSY' }) : resolve(result); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async claim(id: string, expectedHash?: string, leaseOwner?: string, abandonedOwner?: string): Promise<string | false> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite'), store = tx.objectStore('queue');
      let claimed: string | false = false;
      const request = store.get(id);
      request.onsuccess = () => {
        const row = request.result;
        if (row && row.state === 'waiting' && (expectedHash === undefined || row.hash === expectedHash) && ((row.leaseUntil || 0) < Date.now() || !!abandonedOwner && row.leaseOwner === abandonedOwner)) {
          row.leaseOwner = leaseOwner;
          const longUpload = row.body?.type === 'form' && /^(POST|PUT)$/i.test(row.method) && isDocumentUploadPath(row.url || row.path);
          // Keep a live upload owned by this tab until its client deadline expires.
          row.leaseUntil = Date.now() + (longUpload ? DOCUMENT_UPLOAD_CLIENT_TIMEOUT_MS + 30000 : 330000);
          row.attempted = true;
          row.leaseToken = operationId(); store.put(row); claimed = row.leaseToken;
        }
      };
      tx.oncomplete = () => resolve(claimed); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async removeQueued(owner: string, ids: string[]): Promise<number> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite'), store = tx.objectStore('queue');
      let removed = 0;
      for (const id of new Set(ids)) {
        const request = store.get(id);
        request.onsuccess = () => {
          const row = request.result;
          // The same transaction serializes deletion with claims from other tabs.
          if (!row || row.owner !== owner || row.state === 'archived' || (row.leaseUntil || 0) > Date.now()) return;
          store.delete(id);
          removed++;
        };
      }
      tx.oncomplete = () => resolve(removed);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async saveFailure(value: { id: string; owner: string; state: string; hash: string }, leaseToken?: string, remove = false): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite'), store = tx.objectStore('queue');
      const request = store.get(value.id);
      request.onsuccess = () => {
        const current = request.result;
        // A delayed error cannot undo payload preparation or release another
        // tab's claim. Only the sender holding this exact lease may finish it.
        const ownsLease = leaseToken ? current?.leaseToken === leaseToken : (current?.leaseUntil || 0) <= Date.now();
        if (current?.owner === value.owner && current.hash === value.hash && ownsLease && !['done', 'archived'].includes(current.state)) {
          if (remove) store.delete(value.id); else store.put(value);
        }
      };
      tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  /** Compare and replace in one transaction, including the recovery copy. */
  async replaceQueued<T extends { id: string; owner: string; dedup: string; intent?: string }>(value: T, previousId: string, allowDone = false): Promise<T | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['queue', 'cache'], 'readwrite'), store = tx.objectStore('queue');
      let result: T | undefined;
      const request = store.getAll();
      request.onsuccess = () => {
        const rows = request.result;
        const receipt = tx.objectStore('cache').get(COMPLETION_PREFIX + previousId);
        receipt.onsuccess = () => {
          const previous = rows.find(row => row.id === previousId) || receipt.result?.operation;
          if (!previous || previous.owner !== value.owner || (previous.leaseUntil || 0) > Date.now() || (previous.state === 'archived' || (previous.state === 'done' && !allowDone))) return;
          if (rows.some(row => row.id !== previousId && row.intent === value.intent && row.owner === value.owner && row.state !== 'archived')) return;
          const metadata = tx.objectStore('cache'), counter = metadata.get('queue-sequence');
          counter.onsuccess = () => {
            const sequence = Math.max(Date.now(), Number(counter.result?.value || 0) + 1);
            metadata.put({ id: 'queue-sequence', value: sequence, savedAt: Date.now() });
            const archived = compactCompletion({ ...previous, state: 'archived', dedup: `archived:${previous.id}` });
            metadata.put({ id: COMPLETION_PREFIX + previous.id, owner: previous.owner, savedAt: Date.now(), operation: archived });
            store.delete(previous.id);
            result = { ...value, sequence }; store.add(result);
          };
        };
      };
      tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async markConfirmed(value: PendingOperation): Promise<'done' | 'archived' | 'missing'> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['queue', 'cache'], 'readwrite'), store = tx.objectStore('queue'), cache = tx.objectStore('cache'); let state: 'done' | 'archived' | 'missing' = 'missing';
      const request = store.get(value.id);
      request.onsuccess = () => {
        const receipt = cache.get(COMPLETION_PREFIX + value.id);
        receipt.onsuccess = () => {
          const current = request.result || receipt.result?.operation;
          if (!current || current.owner !== value.owner) return;
          state = current.state === 'archived' ? 'archived' : 'done';
          cache.put({ id: COMPLETION_PREFIX + value.id, owner: value.owner, savedAt: Date.now(), operation: compactCompletion({ ...value, state, dedup: state === 'archived' ? current.dedup : value.dedup }) });
          store.delete(value.id);
        };
      };
      tx.oncomplete = () => resolve(state); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async prepareQueued<T extends { id: string; owner: string; hash: string }>(value: T, expectedHash: string): Promise<boolean> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite'), store = tx.objectStore('queue'); let prepared = false;
      const request = store.get(value.id);
      request.onsuccess = () => { const current = request.result; if (!current || current.owner !== value.owner || current.state !== 'waiting' || current.hash !== expectedHash || (current.leaseUntil || 0) > Date.now()) return; store.put(value); prepared = true; };
      tx.oncomplete = () => resolve(prepared); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async archiveSuperseded(id: string, owner: string, recoveredShifts?: { clientId: string; shiftId: number }[], expectedState?: string): Promise<boolean> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['queue', 'cache'], 'readwrite'), store = tx.objectStore('queue'), cache = tx.objectStore('cache'); let archived = false;
      const request = store.get(id);
      request.onsuccess = () => {
        const receipt = cache.get(COMPLETION_PREFIX + id);
        receipt.onsuccess = () => {
          const row = request.result || receipt.result?.operation;
          if (!row || row.owner !== owner || (row.leaseUntil || 0) > Date.now()) return;
          if (expectedState && row.state !== expectedState) return;
          cache.put({ id: COMPLETION_PREFIX + id, owner, savedAt: Date.now(), operation: compactCompletion({ ...row, ...(recoveredShifts ? { recoveredShifts } : {}), state: 'archived', dedup: `archived:${row.id}` }) });
          store.delete(id); archived = true;
        };
      };
      tx.oncomplete = () => resolve(archived); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async editorId(owner: string, page: string, id: string): Promise<string> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cache', 'readwrite'), store = tx.objectStore('cache'), key = `editor|${owner}|${page}`;
      let value = id;
      const request = store.get(key);
      request.onsuccess = () => { if (request.result) value = request.result.value; else store.add({ id: key, value, owner, savedAt: Date.now() }); };
      tx.oncomplete = () => resolve(value); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
}
