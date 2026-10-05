import { operationId } from './offline-codec';

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
  async claim(id: string, expectedHash?: string): Promise<string | false> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite'), store = tx.objectStore('queue');
      let claimed: string | false = false;
      const request = store.get(id);
      request.onsuccess = () => {
        const row = request.result;
        if (row && row.state === 'waiting' && (expectedHash === undefined || row.hash === expectedHash) && (row.leaseUntil || 0) < Date.now()) {
          row.leaseUntil = Date.now() + 180000;
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
        const rows = request.result, previous = rows.find(row => row.id === previousId);
        if (!previous || previous.owner !== value.owner || (previous.leaseUntil || 0) > Date.now() || (previous.state === 'archived' || (previous.state === 'done' && !allowDone))) return;
        if (rows.some(row => row.id !== previousId && row.intent === value.intent && row.owner === value.owner && row.state !== 'archived')) return;
        const metadata = tx.objectStore('cache'), counter = metadata.get('queue-sequence');
        counter.onsuccess = () => {
          const sequence = Math.max(Date.now(), Number(counter.result?.value || 0) + 1);
          metadata.put({ id: 'queue-sequence', value: sequence, savedAt: Date.now() });
          store.put({ ...previous, state: 'archived', dedup: `archived:${previous.id}` });
          result = { ...value, sequence }; store.add(result);
        };
      };
      tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async markConfirmed<T extends { id: string; owner: string }>(value: T): Promise<'done' | 'archived' | 'missing'> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite'), store = tx.objectStore('queue'); let state: 'done' | 'archived' | 'missing' = 'missing';
      const request = store.get(value.id);
      request.onsuccess = () => { const current = request.result; if (!current || current.owner !== value.owner) return; state = current.state === 'archived' ? 'archived' : 'done'; store.put({ ...value, state, dedup: state === 'archived' ? current.dedup : (value as any).dedup }); };
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
  async archiveSuperseded(id: string, owner: string): Promise<boolean> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite'), store = tx.objectStore('queue'); let archived = false;
      const request = store.get(id);
      request.onsuccess = () => { const row = request.result; if (!row || row.owner !== owner || (row.leaseUntil || 0) > Date.now()) return; store.put({ ...row, state: 'archived', dedup: `archived:${row.id}` }); archived = true; };
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
