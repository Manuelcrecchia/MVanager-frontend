import { Injectable, InjectionToken, Injector, isDevMode } from '@angular/core';
import { HttpBackend, HttpClient, HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpHeaders, HttpRequest, HttpResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, filter, firstValueFrom, tap, timeout } from 'rxjs';
import { OfflineStore } from './offline-store';
import { StoredBody, bodyHash, decodeBody, digest, encodeBody, operationId } from './offline-codec';
import { canReplayAutomatically, containsCredentials, isOfflineRead, isProtectedWrite, operationLabel } from './offline-policy';

export interface OfflineSession { baseUrl: string; tenant: string; token: string; role: 'admin' | 'employee'; }
export const OFFLINE_SESSION = new InjectionToken<() => OfflineSession>('OFFLINE_SESSION');
export interface PendingOperation {
  id: string; owner: string; dedup: string; hash: string; method: string; url: string; path: string;
  body: StoredBody; headers: Record<string, string>; responseType: 'json' | 'text' | 'blob' | 'arraybuffer';
  createdAt: string; sequence?: number; page: string; label: string; automatic: boolean;
  state: 'waiting' | 'blocked' | 'done' | 'archived'; attempts: number; nextAttempt: number; leaseUntil?: number;
  error?: string; blocksQueue?: boolean; response?: { body: any; status: number; headers: Record<string, string> };
}
export const PENDING_MESSAGE = 'Salvato sul dispositivo, in attesa di sincronizzazione. Puoi controllare l’esito nel pannello Salvataggi.';
export function isOfflinePending(error: any): boolean { return error?.error?.code === 'OFFLINE_PENDING' && error?.error?.state !== 'blocked'; }

@Injectable({ providedIn: 'root' })
export class OfflineService {
  readonly store = new OfflineStore();
  readonly operations = new BehaviorSubject<PendingOperation[]>([]);
  readonly notice = new BehaviorSubject('');
  readonly hasFieldDraft = new BehaviorSubject(false);
  private fields = new Map<string, () => Promise<void>>();
  registerField(key: string, restore: () => Promise<void>): void { this.fields.set(key, restore); }
  unregisterField(key: string): void { this.fields.delete(key); if (!this.fields.size) this.hasFieldDraft.next(false); }
  async restoreFields(): Promise<void> {
    for (const restore of this.fields.values()) await restore();
    this.hasFieldDraft.next(false);
    this.notice.next('Campi recuperati dalla bozza locale. Confrontali con i dati attuali prima di salvare.');
  }
  private async clearSavedFields(row: PendingOperation): Promise<void> {
    for (const draft of await this.store.all('drafts')) {
      if (draft.owner === row.owner && draft.page === row.page && draft.savedAt <= Date.parse(row.createdAt)) await this.store.remove('drafts', draft.id);
    }
  }
  readonly connected = new BehaviorSubject(navigator.onLine);
  private readonly raw: HttpClient;
  private started = false;
  private syncing = false;
  private capability = new Map<string, number>();
  private currentOwner = '';
  private lastCachePrune = 0;
  constructor(private injector: Injector, backend: HttpBackend) { this.raw = new HttpClient(backend); }

  session(): (OfflineSession & { owner: string; expired: boolean }) | null {
    try {
      const session = this.injector.get(OFFLINE_SESSION)();
      const claims = JSON.parse(atob(session.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!claims.id || String(claims.tenantId) !== session.tenant) return null;
      const baseUrl = new URL(session.baseUrl, location.href).href.replace(/\/?$/, '/');
      return { ...session, baseUrl, owner: `${baseUrl}|${session.tenant}|${session.role}|${claims.id}`, expired: Number(claims.exp || 0) * 1000 <= Date.now() };
    } catch { return null; }
  }
  start(): void {
    if (this.started) return;
    this.started = true;
    void navigator.storage?.persist?.().catch(() => false);
    const tick = () => { void this.refresh().then(() => this.sync()).catch(() => this.storageError()); };
    window.addEventListener('online', () => { this.connected.next(true); tick(); });
    window.addEventListener('offline', () => this.connected.next(false));
    window.addEventListener('focus', tick);
    window.addEventListener('mv-offline-cache', () => this.notice.next('Configurazione e dati recuperati dal dispositivo: potrebbero non includere modifiche recenti.'));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    setInterval(tick, 15000);
    tick();
    if (!isDevMode() && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
      void navigator.serviceWorker.register(new URL('offline-worker.js', document.baseURI).href).then(registration => {
        const worker = registration.active || registration.waiting || registration.installing;
        const assets = Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel="stylesheet"],link[rel="modulepreload"]'))
          .map(node => (node as HTMLScriptElement).src || (node as HTMLLinkElement).href)
          .concat(performance.getEntriesByType('resource').map(entry => entry.name));
        const send = () => worker?.postMessage({ type: 'CACHE_SHELL', assets });
        if (worker?.state === 'activated') send(); else worker?.addEventListener('statechange', () => { if (worker.state === 'activated') send(); });
      }).catch(() => this.notice.next('Avvio senza rete non disponibile in questo browser. I salvataggi locali restano protetti.'));
    }
  }
  private storageError(): void { this.notice.next('Archivio locale non disponibile o pieno. Non chiudere la pagina: impossibile garantire il recupero dei dati.'); }
  async refresh(): Promise<void> {
    const owner = this.session()?.owner || '';
    if (owner !== this.currentOwner) { this.currentOwner = owner; this.notice.next(''); this.operations.next([]); }
    if (!owner) return;
    const rows = await this.store.all<PendingOperation>('queue');
    if (this.session()?.owner !== owner) return;
    this.operations.next(rows.filter(row => row.owner === owner && row.state !== 'archived').sort((a, b) => (a.sequence || Date.parse(a.createdAt)) - (b.sequence || Date.parse(b.createdAt))));
  }
  intercept(req: HttpRequest<any>, next: HttpHandlerFn): Observable<HttpEvent<any>> {
    const session = this.session();
    if (!session || !req.url.startsWith(session.baseUrl) || containsCredentials(req.body)) return next(req);
    const path = '/' + req.url.slice(session.baseUrl.length).split('?')[0];
    if (isProtectedWrite(req.method, path)) return this.observeWork(send => this.save(req, send, session.owner, path), next);
    if (isOfflineRead(req.method, path)) return this.observeWork(send => this.read(req, send, session.owner), next);
    return next(req);
  }
  private observeWork(work: (send: HttpHandlerFn) => Promise<HttpResponse<any>>, next: HttpHandlerFn): Observable<HttpEvent<any>> {
    return new Observable(observer => {
      const send: HttpHandlerFn = req => next(req).pipe(tap(event => { if (!(event instanceof HttpResponse)) observer.next(event); }));
      // A saved write must survive destruction of the component that submitted it.
      void work(send).then(response => { observer.next(response); observer.complete(); }, error => observer.error(error));
    });
  }
  private response(req: HttpRequest<any>, next: HttpHandlerFn, deadline = 120000): Promise<HttpResponse<any>> {
    return firstValueFrom(next(req).pipe(timeout({ each: deadline }), filter((event): event is HttpResponse<any> => event instanceof HttpResponse)));
  }
  private pending(row: PendingOperation): HttpErrorResponse {
    return new HttpErrorResponse({ status: row.state === 'blocked' ? 409 : 0, url: row.url, error: { code: 'OFFLINE_PENDING', state: row.state, operationId: row.id, error: row.state === 'blocked' ? row.error : PENDING_MESSAGE } });
  }
  private async save(req: HttpRequest<any>, next: HttpHandlerFn, owner: string, path: string): Promise<HttpResponse<any>> {
    let row: PendingOperation;
    try {
      const body = await encodeBody(req.body), hash = await bodyHash(body);
      const headers: Record<string, string> = {};
      for (const key of ['Content-Type', 'Accept']) if (req.headers.has(key)) headers[key] = req.headers.get(key)!;
      row = await this.store.enqueue<PendingOperation>({
        id: operationId(), owner, dedup: `${owner}|${req.method}|${req.urlWithParams}|${hash}`, hash,
        method: req.method, url: req.urlWithParams, path, body, headers, responseType: req.responseType,
        createdAt: new Date().toISOString(), page: location.pathname + location.search,
        label: operationLabel(path), automatic: canReplayAutomatically(req.method, path),
        state: 'waiting', attempts: 0, nextAttempt: 0,
      });
      await this.refresh();
    } catch (error) {
      this.storageError();
      throw new HttpErrorResponse({ status: 0, error: { code: 'OFFLINE_STORAGE', error: 'Impossibile salvare sul dispositivo. Non chiudere la pagina; libera spazio e riprova.' } });
    }
    if (row.state === 'done' && row.response) {
      await this.store.remove('queue', row.id); await this.refresh();
      return new HttpResponse({ ...row.response, headers: new HttpHeaders(row.response.headers), url: row.url });
    }
    if (row.state === 'blocked') throw this.pending(row);
    // Preserve chronology, including a pair of offline entry/exit clock-ins.
    const earlier = this.operations.value.some(other => other.id !== row.id && (other.state === 'waiting' || other.blocksQueue) && (other.sequence || Date.parse(other.createdAt)) < (row.sequence || Date.parse(row.createdAt)));
    if (!navigator.onLine || earlier) throw this.pending(row);
    if (!(await this.store.claim(row.id))) throw this.pending(row);
    try {
      await this.ensureCapability(owner);
      if (this.session()?.owner !== owner) throw new Error('Accedi con l’utente che ha creato il salvataggio.');
      const response = await this.response(req.clone({ setHeaders: this.operationHeaders(row) }), next);
      this.assertReceipt(row, response);
      await this.clearSavedFields(row);
      await this.store.remove('queue', row.id); await this.refresh();
      return response;
    } catch (error: any) {
      await this.failed(row, error); await this.refresh();
      throw this.pending(row);
    }
  }
  private operationHeaders(row: PendingOperation): Record<string, string> {
    return { 'X-MV-Operation-Id': row.id, 'X-MV-Payload-Hash': row.hash, 'X-MV-Captured-At': row.createdAt };
  }
  private assertReceipt(row: PendingOperation, response: HttpResponse<any>): void {
    if (response.headers.get('X-MV-Operation-Id') !== row.id) throw new HttpErrorResponse({ status: 409, error: { code: 'OFFLINE_UNCERTAIN', error: 'Il server non ha confermato la protezione contro i duplicati. Verificare l’esito prima di un nuovo invio.' } });
  }
  private async ensureCapability(owner: string): Promise<void> {
    const session = this.session();
    if (!session || session.owner !== owner || session.expired) throw new HttpErrorResponse({ status: 401, error: { error: 'Accedi nuovamente con lo stesso account per sincronizzare.' } });
    if ((this.capability.get(owner) || 0) > Date.now()) return;
    let result: any;
    try { result = await firstValueFrom(this.raw.get(session.baseUrl + (session.role === 'employee' ? 'mv/' : '') + 'offline/capabilities', {
      headers: { Authorization: `Bearer ${session.token}`, 'X-Tenant-Id': session.tenant },
    }).pipe(timeout(10000))); } catch (error: any) {
      if (error.status === 401 || error.status === 403) throw new HttpErrorResponse({ status: 401 });
      throw new HttpErrorResponse({ status: 503, error: { code: 'OFFLINE_UNAVAILABLE', error: 'Server non raggiungibile o non ancora aggiornato. Copia locale conservata.' } });
    }
    if (result?.protocol !== 1) throw new Error('Aggiornamento del server necessario per sincronizzare in sicurezza.');
    this.capability.set(owner, Date.now() + 60000);
  }
  private async failed(row: PendingOperation, error: any): Promise<void> {
    row.attempts++; row.leaseUntil = 0;
    row.nextAttempt = Date.now() + Math.min(300000, 15000 * 2 ** Math.min(row.attempts, 5));
    let payload = error?.error;
    if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch {} }
    const status = error?.status;
    const retryable = status === 0 || status === 401 || status === 425 || status === 429 || error?.name === 'TimeoutError' || payload?.code === 'OFFLINE_UNAVAILABLE';
    row.state = retryable ? 'waiting' : 'blocked';
    row.blocksQueue = !retryable && (status >= 500 || ['OFFLINE_UNCERTAIN', 'OFFLINE_KEY_CONFLICT', 'OFFLINE_STAMP_ORDER'].includes(payload?.code));
    row.error = status === 401 ? 'Accedi nuovamente con lo stesso account.' : payload?.error || error?.message || PENDING_MESSAGE;
    if (status === 0 || error?.name === 'TimeoutError') row.error = PENDING_MESSAGE;
    await this.store.put('queue', row);
  }
  async sync(manualId?: string): Promise<void> {
    if (this.syncing || !navigator.onLine) return;
    const owner = this.session()?.owner;
    if (!owner || this.session()?.expired) return;
    this.syncing = true;
    try {
      await this.refresh();
      for (const item of this.operations.value) {
        if (item.state === 'done') continue;
        // A rejected or uncertain operation must be reconciled, never blindly retried.
        if (item.state === 'blocked') { if (item.blocksQueue) break; else continue; }
        if ((!item.automatic && item.id !== manualId) || (!manualId && item.nextAttempt > Date.now())) break;
        if (this.session()?.owner !== owner) break;
        if (!(await this.store.claim(item.id))) break;
        try {
          await this.ensureCapability(owner);
          const session = this.session();
          if (!session || session.owner !== owner) break;
          const request = new HttpRequest(item.method, item.url, decodeBody(item.body), {
            headers: new HttpHeaders({ ...item.headers, ...this.operationHeaders(item), Authorization: `Bearer ${session.token}`, 'X-Tenant-Id': session.tenant }),
            responseType: item.responseType,
          });
          const response = await this.response(request, req => this.raw.request(req));
          this.assertReceipt(item, response);
          const headers: Record<string, string> = {};
          response.headers.keys().forEach(key => headers[key] = response.headers.get(key)!);
          await this.store.put('queue', { ...item, leaseUntil: 0, state: 'done', error: '', response: { body: response.body, status: response.status, headers } });
          await this.clearSavedFields(item);
          // Prevent drafts from resurrecting already synchronized content.
          const draft = await this.store.get('drafts', `${owner}|${item.page}`);
          if (draft && draft.savedAt <= Date.parse(item.createdAt)) await this.store.remove('drafts', draft.id);
        } catch (error) { await this.failed(item, error); break; }
      }
      await this.refresh();
    } catch { this.storageError(); }
    finally { this.syncing = false; }
  }
  async archiveVerified(row: PendingOperation): Promise<void> {
    if (row.owner !== this.session()?.owner || row.state !== 'blocked') return;
    // Keep the recovery copy, but release the chronological queue only after
    // explicit reconciliation by the user. Never offer a new-id blind retry.
    await this.store.put('queue', { ...row, state: 'archived', dedup: `archived:${row.id}` });
    await this.refresh();
  }
  async acknowledge(row: PendingOperation): Promise<void> {
    if (row.owner !== this.session()?.owner || row.state !== 'done') return;
    await this.store.remove('queue', row.id); await this.refresh();
  }
  async exportOperation(row: PendingOperation): Promise<void> {
    if (row.owner !== this.session()?.owner) return;
    // Include actual attachment bytes, not just metadata.
    let body: any = row.body.type === 'form' ? { type: 'form', entries: await Promise.all(row.body.entries.map(async ([name, value, filename]) => {
      if (!(value instanceof Blob)) return [name, value];
      const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(value); });
      return [name, { filename, data }];
    })) } : row.body;
    if (row.body.type === 'binary') {
      const binary = row.body.value instanceof Blob ? row.body.value : new Blob([row.body.value]);
      body = { type: 'binary', data: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(binary); }) };
    }
    const blob = new Blob([JSON.stringify({ ...row, body }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `salvataggio-${row.id}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  private async read(req: HttpRequest<any>, next: HttpHandlerFn, owner: string): Promise<HttpResponse<any>> {
    const key = `${owner}|${req.method}|${req.responseType}|${req.urlWithParams}|${await digest(JSON.stringify(req.body ?? null))}`;
    try {
      const response = await this.response(req, next, 20000);
      if (this.session()?.owner === owner && !containsCredentials(response.body) && (!(response.body instanceof Blob) || response.body.size <= 25 * 1024 * 1024)) {
        try {
          await this.store.put('cache', { id: key, owner, savedAt: Date.now(), status: response.status, body: response.body, contentType: response.headers.get('Content-Type') || '' });
          if (Date.now() - this.lastCachePrune > 3600000) {
            this.lastCachePrune = Date.now();
            const entries = await this.store.all('cache');
            for (const entry of entries) if (Date.now() - entry.savedAt > 7 * 86400000) await this.store.remove('cache', entry.id);
          }
        } catch { /* A failed read cache must not discard a valid online response. */ }
      }
      return response;
    } catch (error: any) {
      if ((error.status === 0 || error.status >= 500 || error.name === 'TimeoutError') && this.session()?.owner === owner) {
        const cached = await this.store.get('cache', key).catch(() => undefined);
        if (cached && Date.now() - cached.savedAt < 7 * 86400000) {
          this.notice.next(`Dati locali: ultimo aggiornamento ${new Date(cached.savedAt).toLocaleString('it-IT')}. Potrebbero esserci modifiche più recenti.`);
          return new HttpResponse({ status: cached.status, body: cached.body, url: req.url, headers: new HttpHeaders({ 'X-MV-Offline-Cache': 'true', ...(cached.contentType ? { 'Content-Type': cached.contentType } : {}) }) });
        }
      }
      throw error;
    }
  }
  async saveDraft(value: any, page = location.pathname + location.search, owner = this.session()?.owner): Promise<void> {
    if (!owner || owner !== this.session()?.owner) return;
    try { await this.store.put('drafts', { id: `${owner}|${page}`, value, savedAt: Date.now() }); }
    catch { this.storageError(); }
  }
  async loadDraft(page = location.pathname + location.search): Promise<any> {
    const owner = this.session()?.owner; if (!owner) return null;
    const saved = await this.store.get('drafts', `${owner}|${page}`).catch(() => undefined);
    if (this.session()?.owner !== owner) return null;
    return saved?.value || null;
  }
  async clearDraft(page = location.pathname + location.search, owner = this.session()?.owner): Promise<void> { if (owner) await this.store.remove('drafts', `${owner}|${page}`);
  }
}
