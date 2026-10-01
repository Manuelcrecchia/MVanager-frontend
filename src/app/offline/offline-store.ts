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
      let result = value;
      const previous = store.index('dedup').get(value.dedup);
      previous.onsuccess = () => {
        if (previous.result) { result = previous.result; return; }
        const metadata = tx.objectStore('cache'), counter = metadata.get('queue-sequence');
        counter.onsuccess = () => {
          const sequence = Math.max(Date.now(), Number(counter.result?.value || 0) + 1);
          metadata.put({ id: 'queue-sequence', value: sequence, savedAt: Date.now() });
          result = { ...value, sequence }; store.add(result);
        };
      };
      tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async claim(id: string): Promise<boolean> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('queue', 'readwrite'), store = tx.objectStore('queue');
      let claimed = false;
      const request = store.get(id);
      request.onsuccess = () => {
        const row = request.result;
        if (row && row.state !== 'done' && (row.leaseUntil || 0) < Date.now()) {
          row.leaseUntil = Date.now() + 180000; store.put(row); claimed = true;
        }
      };
      tx.oncomplete = () => resolve(claimed); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
}
