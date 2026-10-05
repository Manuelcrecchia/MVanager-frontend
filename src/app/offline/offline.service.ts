import { Injectable, InjectionToken, Injector, isDevMode } from '@angular/core';
import { HttpBackend, HttpClient, HttpContextToken, HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpHeaders, HttpRequest, HttpResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, filter, firstValueFrom, tap, timeout } from 'rxjs';
import { OfflineStore } from './offline-store';
import { StoredBody, bodyHash, decodeBody, digest, encodeBody, operationId } from './offline-codec';
import { canReplayAutomatically, containsCredentials, isOfflineRead, isProtectedWrite, operationLabel, operationScope } from './offline-policy';

export interface OfflineSession { baseUrl: string; tenant: string; token: string; role: 'admin' | 'employee'; }
export const OFFLINE_SESSION = new InjectionToken<() => OfflineSession>('OFFLINE_SESSION');
export const OFFLINE_SAVE_GROUP = new HttpContextToken<string>(() => '');
export interface PendingOperation {
  id: string; owner: string; dedup: string; hash: string; method: string; url: string; path: string;
  body: StoredBody; headers: Record<string, string>; responseType: 'json' | 'text' | 'blob' | 'arraybuffer';
  intent?: string; predecessor?: string; createdAt: string; sequence?: number; page: string; formScope?: string; label: string; automatic: boolean;
  state: 'waiting' | 'blocked' | 'rejected' | 'done' | 'archived'; attempts: number; nextAttempt: number; leaseUntil?: number;
  error?: string; errorCode?: string; blocksQueue?: boolean; response?: { body: any; status: number; headers: Record<string, string> };
}
export const PENDING_MESSAGE = 'Dati conservati sul dispositivo, in attesa della conferma del server.';
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
    // A page may contain several forms. Only clear fields actually submitted by
    // this form, with unchanged values; retain older drafts without provenance.
    if (row.formScope === undefined || row.body.type !== 'json') return;
    const prefix = `field|${row.owner}|${row.page}|${row.formScope}|`;
    for (const draft of await this.store.all('drafts')) {
      if (draft.owner !== row.owner || draft.page !== row.page || !draft.id.startsWith(prefix) || draft.savedAt > Date.parse(row.createdAt) || !draft.controlPath?.length) continue;
      let value = row.body.value, present = true;
      for (const name of draft.controlPath) {
        if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, name)) { present = false; break; }
        value = value[name];
      }
      if (present && JSON.stringify(value) === JSON.stringify(draft.value)) await this.store.remove('drafts', draft.id);
    }
  }
  readonly connected = new BehaviorSubject(navigator.onLine);
  private readonly raw: HttpClient;
  private started = false;
  private syncing = false;
  private capability = new Map<string, number>();
  private receiptLookup = new Set<string>();
  private cancelPending = new Set<string>();
  private draftPages = new Map<string, number>();
  registerDraftPage(page: string): () => void {
    this.draftPages.set(page, (this.draftPages.get(page) || 0) + 1);
    return () => { const count = (this.draftPages.get(page) || 1) - 1; if (count) this.draftPages.set(page, count); else this.draftPages.delete(page); };
  }
  private confirmed = new Map<string, HttpResponse<any>>();
  private consumeRequested = new Set<string>();
  private volatile = new Map<string, PendingOperation>();
  private currentOwner = '';
  private lastCachePrune = 0;
  private rejectionNotice = '';
  private parsedErrors = new WeakMap<object, any>();
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
    // Older clients kept a rejected preflight as pending even after "Save anyway" succeeded.
    for (const row of rows) {
      if (row.owner === owner && row.state === 'blocked' && !row.blocksQueue &&
          row.path === '/shifts/saveMultiple' && row.error === 'Sono state trovate incongruenze nei turni' &&
          row.body.type === 'json' && !row.body.value?.forceSave) {
        row.state = 'archived';
        await this.store.put('queue', { ...row, dedup: `archived:${row.id}` });
      }
    }
    this.operations.next(rows.filter(row => row.owner === owner && row.state !== 'archived').map(row => this.confirmed.has(row.id) ? { ...row, state: 'done' as const } : row).sort((a, b) => (a.sequence || Date.parse(a.createdAt)) - (b.sequence || Date.parse(b.createdAt))));
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
    return new HttpErrorResponse({ status: 0, url: row.url, error: { code: 'OFFLINE_PENDING', state: row.state, operationId: row.id, error: row.error || PENDING_MESSAGE } });
  }
  private async save(req: HttpRequest<any>, next: HttpHandlerFn, owner: string, path: string): Promise<HttpResponse<any>> {
    const page = location.pathname + location.search;
    const active = document.activeElement;
    const form = (active as HTMLInputElement)?.form || active?.closest('form');
    const formScope = form ? form.id || form.getAttribute('name') || String(Array.from(document.forms).indexOf(form)) : undefined;
    let row: PendingOperation;
    let persisted = false, replacing = false;
    let candidate: PendingOperation | undefined;
    const unconfirmedDirect = () => Array.from(this.volatile.values()).some(item => item.owner === owner && operationScope(item.path) === operationScope(path) && item.dedup !== candidate?.dedup);
    const directConflict = () => this.replacementError('Il tentativo precedente non ha ancora una conferma e l’archivio locale non è disponibile. Attendi la conferma o riprova gli stessi dati prima di inviare modifiche.');
    try {
      const body = await encodeBody(req.body), hash = await bodyHash(body);
      const headers: Record<string, string> = {};
      for (const key of ['Content-Type', 'Accept', 'If-Match', 'If-Unmodified-Since', 'X-Skip-Global-Error-Popup']) if (req.headers.has(key)) headers[key] = req.headers.get(key)!;
      const conditions = [headers['If-Match'], headers['If-Unmodified-Since']];
      const versionKey = conditions.some(Boolean) ? `|${await digest(JSON.stringify(conditions))}` : '';
      candidate = {
        id: operationId(), owner, dedup: `${owner}|${req.method}|${req.urlWithParams}|${hash}${versionKey}`, hash,
        method: req.method, url: req.urlWithParams, path, body, headers, responseType: req.responseType,
        createdAt: new Date().toISOString(), page, formScope,
        label: operationLabel(path), automatic: canReplayAutomatically(req.method, path),
        state: 'waiting', attempts: 0, nextAttempt: 0,
      };
      candidate = this.volatile.get(candidate.dedup) || candidate;
      const group = req.context.get(OFFLINE_SAVE_GROUP);
      if (group) { candidate.intent = `${owner}|${path}|${group}${versionKey}`; candidate.page = `${page}|${group}`; }
      else if (this.draftPages.has(page) && (/\/quotes\/(add|edit)$/.test(path) || /\/(quotes|customers|employees)\/notes\/add$/.test(path) || path === '/mv/finelavoro/submit')) candidate.intent = `${owner}|${path}|editor:${await this.store.editorId(owner, page, operationId())}${versionKey}`;
      else if (body.type === 'json' && (['PUT', 'PATCH'].includes(req.method) || /\/(edit|update)$/.test(path))) {
        const entity = body.value?.id ?? body.value?.numeroPreventivo ?? body.value?.numeroCliente;
        if (entity != null) candidate.intent = `${owner}|${path}|record:${entity}${versionKey}`;
      }
      if (unconfirmedDirect()) throw directConflict();
      const previous = candidate.intent ? (await this.store.all<PendingOperation>('queue')).find(item => item.owner === owner && item.intent === candidate!.intent && item.dedup !== candidate!.dedup && item.state !== 'archived') : undefined;
      replacing = !!previous;
      row = previous ? await this.replacePending(candidate, previous) : await this.store.enqueue(candidate);
      persisted = true;
      await this.refresh();
    } catch (error: any) {
      if (error instanceof HttpErrorResponse) throw error;
      if (error?.code === 'OFFLINE_BUSY') throw this.replacementError('Un invio dello stesso modulo è in corso. Le ultime modifiche restano nella bozza. Attendi la conferma prima di salvare di nuovo.');
      if (unconfirmedDirect()) throw directConflict();
      const unresolved = this.operations.value.some(item => item.owner === owner && operationScope(item.path) === operationScope(path) && (item.state === 'waiting' || item.blocksQueue));
      if (candidate && !persisted && !replacing && !unresolved && navigator.onLine && this.session()?.owner === owner && !this.session()?.expired) {
        this.notice.next('Archivio locale non disponibile. Invio diretto al server: attendi la conferma del salvataggio.');
        this.volatile.set(candidate.dedup, candidate);
        const current = this.session()!;
        try {
          const response = await this.response(req.clone({ body: decodeBody(candidate.body), setHeaders: { ...this.operationHeaders(candidate), Authorization: `Bearer ${current.token}`, 'X-Tenant-Id': current.tenant } }), next);
          this.assertReceipt(candidate, response);
          this.volatile.delete(candidate.dedup);
          this.connected.next(true); this.notice.next('');
          return response;
        } catch (directError) {
          await this.prepareError(directError);
          if (this.isDefinitiveRejection(candidate, directError)) this.volatile.delete(candidate.dedup);
          throw directError;
        }
      }
      this.storageError();
      throw new HttpErrorResponse({ status: 0, error: { code: 'OFFLINE_STORAGE', error: 'Impossibile salvare sul dispositivo. Non chiudere la pagina; libera spazio e riprova.' } });
    }
    const confirmed = this.confirmed.get(row.id) || (row.state === 'done' && row.response ? new HttpResponse({ ...row.response, headers: new HttpHeaders(row.response.headers), url: row.url }) : null);
    if (confirmed) {
      await this.finishConfirmed(row, confirmed, true);
      return confirmed;
    }
    if (row.state === 'rejected' && row.response) throw new HttpErrorResponse({ ...row.response, headers: new HttpHeaders(row.response.headers), error: row.response.body, url: row.url });
    if (row.state === 'blocked') throw this.pending(row);
    const activeSession = this.session();
    if (!activeSession || activeSession.owner !== owner || activeSession.expired) throw new HttpErrorResponse({ status: 401, error: { error: 'Accedi nuovamente con lo stesso account per completare il salvataggio.' } });
    // Preserve chronology within the same domain, including entry/exit clock-ins.
    const earlier = this.operations.value.some(other => other.id !== row.id && operationScope(other.path) === operationScope(row.path) && (other.state === 'waiting' || other.blocksQueue) && (other.sequence || Date.parse(other.createdAt)) < (row.sequence || Date.parse(row.createdAt)));
    if (earlier) { row.error = 'Un salvataggio precedente dello stesso ambito è ancora in corso. Le modifiche sono conservate sul dispositivo.'; throw this.pending(row); }
    if (!navigator.onLine && !await this.serverReachable(owner)) {
      row.error = 'Il server non ha risposto. Dati conservati sul dispositivo, in attesa di invio.';
      throw this.pending(row);
    }
    if (row.predecessor && !await this.resolvePredecessor(row)) { await this.refresh(); if (row.state === 'rejected') throw this.replacementError(row.error || 'Apri il record già salvato per aggiornarlo.'); throw this.pending(row); }
    const leaseToken = await this.store.claim(row.id, row.hash);
    if (!leaseToken) throw this.pending(row);
    let response: HttpResponse<any>;
    try {
      // The write middleware verifies the protocol and returns its receipt.
      // A separate capability request must not gate the first online submission.
      const session = this.session();
      if (!session || session.owner !== owner || session.expired) throw new HttpErrorResponse({ status: 401 });
      response = await this.response(req.clone({ body: decodeBody(row.body), setHeaders: { ...this.operationHeaders(row), Authorization: `Bearer ${session.token}`, 'X-Tenant-Id': session.tenant } }), next);
      this.assertReceipt(row, response);
    } catch (error: any) {
      await this.failed(row, error, true, leaseToken).catch(() => this.storageError());
      await this.refresh().catch(() => this.storageError());
      if (this.isDefinitiveRejection(row, error) || this.needsLogin(error)) throw error;
      throw this.pending(row);
    }
    await this.finishConfirmed(row, response, true);
    return response;
  }
  private replacementError(message: string): HttpErrorResponse {
    return new HttpErrorResponse({ status: 409, error: { code: 'OFFLINE_BUSY', error: message } });
  }
  private async reserveCancellation(row: PendingOperation): Promise<any> {
    await this.ensureCapability(row.owner);
    if (!this.cancelPending.has(row.owner)) throw new Error('Server upgrade required');
    const session = this.session();
    if (!session || session.owner !== row.owner || session.expired) throw new Error('Session changed');
    const target = new URL(row.url);
    const result: any = await firstValueFrom(this.raw.post(session.baseUrl + (session.role === 'employee' ? 'mv/' : '') + `offline/operations/${row.id}/cancel`, { path: target.pathname + target.search }, {
      headers: { Authorization: `Bearer ${session.token}`, 'X-Tenant-Id': session.tenant },
    }).pipe(timeout(10000)));
    if (this.session()?.owner !== row.owner || result.operationId !== row.id) throw new Error('Wrong receipt');
    return result;
  }
  private async replacePending(candidate: PendingOperation, previous: PendingOperation): Promise<PendingOperation> {
    candidate.predecessor = previous.predecessor;
    if ((previous.leaseUntil || 0) > Date.now()) throw this.replacementError('Il salvataggio precedente è ancora in invio. Le ultime modifiche restano nella bozza.');
    if (previous.state !== 'done' && (previous.attempts > 0 || (previous.leaseUntil || 0) > 0 || previous.state === 'blocked')) {
      try {
        const result = await this.reserveCancellation(previous);
        if (result.state === 'completed' && result.status >= 200 && result.status < 300) {
          if (!await this.reconcile(previous)) throw new Error('Receipt unavailable');
          previous = (await this.store.get<PendingOperation>('queue', previous.id))!;
        } else if (result.state !== 'cancelled' && !(result.state === 'completed' && result.status >= 400 && result.status < 500)) throw new Error('Still in progress');
      } catch {
        // Keep one current version, but gate its execution on the old durable key.
        candidate.predecessor = previous.predecessor || previous.id;
        candidate.error = 'Ultime modifiche conservate. Attendo la conferma del tentativo precedente prima di inviarle.';
      }
    }
    const done = previous.state === 'done' || this.confirmed.has(previous.id);
    if (done) {
      let update = ['PUT', 'PATCH'].includes(candidate.method) || /\/(edit|update)$/.test(candidate.path);
      if (candidate.path === '/shifts/saveMultiple' && candidate.body.type === 'json') {
        const receipt = previous.response?.body || this.confirmed.get(previous.id)?.body;
        const mappings = receipt?.savedShifts || [];
        for (const item of candidate.body.value.shifts || []) {
          if (item.shiftId || item.appointmentId) continue;
          const saved = mappings.find((mapping: any) => mapping.clientId && mapping.clientId === item.clientId);
          if (!saved?.shiftId) throw this.replacementError('Il salvataggio precedente è confermato. Riapri i turni salvati per applicare le nuove modifiche; la bozza resta conservata.');
          item.shiftId = saved.shiftId;
        }
        update = true;
        const hash = await bodyHash(candidate.body);
        candidate.dedup = candidate.dedup.replace(candidate.hash, hash); candidate.hash = hash;
      }
      if (!update) throw this.replacementError('Il salvataggio precedente è già confermato. Riapri il record salvato per applicare le nuove modifiche; la bozza resta conservata.');
    }
    const replaced = await this.store.replaceQueued(candidate, previous.id, done);
    if (!replaced) throw this.replacementError('Il salvataggio è cambiato in un’altra scheda. Le ultime modifiche restano nella bozza.');
    return replaced;
  }
  private async resolvePredecessor(row: PendingOperation): Promise<boolean> {
    const expectedHash = row.hash;
    try {
      const previous = await this.store.get<PendingOperation>('queue', row.predecessor!);
      if (!previous || previous.owner !== row.owner) throw new Error('Missing recovery copy');
      const result = await this.reserveCancellation(previous);
      if (result.state === 'completed' && result.status >= 200 && result.status < 300) {
        if (row.path === '/shifts/saveMultiple' && row.body.type === 'json') {
          const text = result.bodyEncoding === 'base64' ? new TextDecoder().decode(Uint8Array.from(atob(result.responseBody || ''), char => char.charCodeAt(0))) : result.responseBody || '';
          const receipt = text ? JSON.parse(text) : null;
          for (const item of row.body.value.shifts || []) {
            if (item.shiftId || item.appointmentId) continue;
            const saved = (receipt?.savedShifts || []).find((mapping: any) => mapping.clientId && mapping.clientId === item.clientId);
            if (!saved?.shiftId) throw this.replacementError('Il tentativo precedente è confermato. Riapri i turni salvati per recuperare il lavoro extra; le ultime modifiche restano conservate.');
            item.shiftId = saved.shiftId;
          }
          const hash = await bodyHash(row.body); row.dedup = row.dedup.replace(row.hash, hash); row.hash = hash;
        } else if (!['PUT', 'PATCH'].includes(row.method) && !/\/(edit|update)$/.test(row.path)) {
          throw this.replacementError('Il record precedente è già salvato. Aprilo per applicare queste modifiche; la copia aggiornata resta conservata.');
        }
      } else if (result.state !== 'cancelled' && !(result.state === 'completed' && result.status >= 400 && result.status < 500)) throw new Error('Previous request still in progress');
      delete row.predecessor; row.error = '';
      return await this.store.prepareQueued(row, expectedHash);
    } catch (error: any) {
      if (error?.error?.code === 'OFFLINE_BUSY') { row.state = 'rejected'; row.blocksQueue = false; row.error = error.error.error; }
      else { row.error = 'Ultime modifiche conservate. L’app ricontrolla il tentativo precedente prima di inviarle.'; row.nextAttempt = Date.now() + 30000; }
      await this.store.saveFailure(row);
      return false;
    }
  }
  /** Retire old per-job autosaves before the single complete shift submission. */
  async retireShiftAutosaves(shifts: any[]): Promise<void> {
    const owner = this.session()?.owner;
    if (!owner || !shifts.length) return;
    const rows = await this.store.all<PendingOperation>('queue');
    for (const row of rows) {
      if (row.owner !== owner || row.path !== '/shifts/autosave' || row.state === 'archived' || row.body.type !== 'json' || !shifts.some(item => item.data === (row.body as { type: 'json'; value: any }).value?.data)) continue;
      if ((row.leaseUntil || 0) > Date.now()) throw this.replacementError('Un precedente salvataggio dei turni è ancora in invio. La bozza resta conservata.');
      let result: any = row.response?.body;
      if (row.state !== 'done' && (row.attempts > 0 || (row.leaseUntil || 0) > 0 || row.state === 'blocked')) {
        const receipt = await this.reserveCancellation(row).catch(() => null);
        if (receipt?.state === 'completed' && receipt.status >= 200 && receipt.status < 300) {
          if (!await this.reconcile(row)) throw this.replacementError('Attendo la conferma dei turni precedenti. La bozza resta conservata.');
          result = (await this.store.get<PendingOperation>('queue', row.id))?.response?.body;
        } else if (receipt?.state !== 'cancelled' && !(receipt?.state === 'completed' && receipt.status >= 400 && receipt.status < 500)) throw this.replacementError('Attendo la conferma dei turni precedenti. La bozza resta conservata.');
      }
      const old = row.body.value;
      if (result?.shiftId && !old.appointmentId && !old.shiftId) {
        const matching = shifts.filter(item => item.shiftId === result.shiftId || (!item.appointmentId && !item.shiftId && item.title === old.title));
        if (matching.length !== 1) throw this.replacementError('Un lavoro extra precedente è già stato salvato. Riapri i turni per recuperarlo prima del nuovo salvataggio; la bozza resta conservata.');
        matching[0].shiftId = result.shiftId;
      }
      if (!await this.store.archiveSuperseded(row.id, owner)) throw this.replacementError('Un salvataggio dei turni è in corso in un’altra scheda. Attendi la conferma.');
    }
    await this.refresh();
  }
  private operationHeaders(row: PendingOperation): Record<string, string> {
    return { 'X-MV-Operation-Id': row.id, 'X-MV-Payload-Hash': row.hash, 'X-MV-Captured-At': row.createdAt };
  }
  private async serverReachable(owner: string): Promise<boolean> {
    const session = this.session();
    if (!session || session.owner !== owner || session.expired) return false;
    try {
      await firstValueFrom(this.raw.get(session.baseUrl + (session.role === 'employee' ? 'mv/' : '') + 'offline/capabilities', {
        params: { connectivityProbe: '1' }, headers: { Authorization: `Bearer ${session.token}`, 'X-Tenant-Id': session.tenant },
      }).pipe(timeout(3000)));
    } catch (error: any) {
      // An HTTP error proves the server answered; it does not prove Internet is absent.
      if (!(error.status > 0)) return false;
    }
    if (this.session()?.owner !== owner) return false;
    this.connected.next(true); return true;
  }
  private assertReceipt(row: PendingOperation, response: HttpResponse<any>): void {
    const receipt = response.headers.get('X-MV-Operation-Id');
    // A real successful response is authoritative, including older routes without receipt headers.
    if (receipt && receipt !== row.id) throw new HttpErrorResponse({ status: 409, error: { code: 'OFFLINE_UNCERTAIN', error: 'La conferma del server non corrisponde al salvataggio. Controllo automatico in attesa.' } });
  }
  private async finishConfirmed(row: PendingOperation, response: HttpResponse<any>, consume = false): Promise<void> {
    this.confirmed.set(row.id, response);
    this.volatile.delete(row.dedup);
    this.clearRejectionNotice();
    this.connected.next(true);
    const headers: Record<string, string> = {};
    response.headers.keys().forEach(key => headers[key] = response.headers.get(key)!);
    const completed: PendingOperation = { ...row, state: 'done', leaseUntil: 0, error: '', blocksQueue: false, response: { body: response.body, status: response.status, headers } };
    this.operations.next(this.operations.value.map(item => item.id === row.id ? completed : item));
    // Local housekeeping must never turn a confirmed server write into a failed save.
    try {
      const storedState = await this.store.markConfirmed(completed);
      this.confirmed.delete(row.id);
      await this.clearSavedFields(row);
      const draft = await this.store.get('drafts', `${row.owner}|${row.page}`);
      if (draft && draft.savedAt <= Date.parse(row.createdAt)) await this.store.remove('drafts', draft.id);
      if ((consume || this.consumeRequested.has(row.id)) && storedState !== 'archived') { await this.store.remove('queue', row.id); this.confirmed.delete(row.id); this.consumeRequested.delete(row.id); }
      await this.refresh();
    } catch {
      this.notice.next('Salvataggio confermato dal server. Pulizia della copia locale da completare.');
    }
  }
  private async ensureCapability(owner: string): Promise<void> {
    const session = this.session();
    if (!session || session.owner !== owner || session.expired) throw new HttpErrorResponse({ status: 401, error: { error: 'Accedi nuovamente con lo stesso account per sincronizzare.' } });
    if ((this.capability.get(owner) || 0) > Date.now()) return;
    let result: any;
    try { result = await firstValueFrom(this.raw.get(session.baseUrl + (session.role === 'employee' ? 'mv/' : '') + 'offline/capabilities', {
      headers: { Authorization: `Bearer ${session.token}`, 'X-Tenant-Id': session.tenant },
    }).pipe(timeout(10000))); } catch (error: any) {
      if (error.status > 0) this.connected.next(true);
      if (error.status === 401 || error.status === 403) throw error;
      const message = error.status === 0 || error.name === 'TimeoutError'
        ? 'Tentativo effettuato: il server non ha risposto. Copia locale conservata.'
        : `Il server ha risposto con errore ${error.status || 503}: sincronizzazione non disponibile. Copia locale conservata.`;
      throw new HttpErrorResponse({ status: 503, error: { code: 'OFFLINE_UNAVAILABLE', error: message } });
    }
    if (result?.protocol !== 1) throw new Error('Aggiornamento del server necessario per sincronizzare in sicurezza.');
    if (result.receiptLookup) this.receiptLookup.add(owner);
    if (result.cancelPending) this.cancelPending.add(owner);
    this.connected.next(true);
    this.capability.set(owner, Date.now() + 60000);
  }
  private isDefinitiveRejection(row: PendingOperation, error: any): boolean {
    const status = error?.status;
    if (!(status >= 400 && status < 500) || this.needsLogin(error) || [425, 429].includes(status)) return false;
    if (['OFFLINE_UNCERTAIN', 'OFFLINE_KEY_CONFLICT', 'OFFLINE_PROCESSING', 'OFFLINE_UNAVAILABLE'].includes(this.errorPayload(error)?.code)) return false;
    return true;
  }
  private errorPayload(error: any): any {
    if (error && this.parsedErrors.has(error)) return this.parsedErrors.get(error);
    if (typeof error?.error === 'string') { try { return JSON.parse(error.error); } catch {} }
    return error?.error;
  }
  private async prepareError(error: any): Promise<void> {
    const body = error?.error;
    try {
      if (body instanceof Blob) this.parsedErrors.set(error, JSON.parse(await body.text()));
      else if (body instanceof ArrayBuffer) this.parsedErrors.set(error, JSON.parse(new TextDecoder().decode(body)));
    } catch { /* Preserve non-JSON error bodies and their original response type. */ }
  }
  private needsLogin(error: any): boolean {
    const payload = this.errorPayload(error);
    return error?.status === 401 || (error?.status === 403 && /token non valido|token scaduto|token mancante|dipendente non trovato|dipendente disattivato|jwt expired|invalid token/i.test(String(payload?.error || payload?.message || payload || '')));
  }
  private clearRejectionNotice(): void {
    if (this.rejectionNotice && this.notice.value === this.rejectionNotice) this.notice.next('');
    this.rejectionNotice = '';
  }
  private async failed(row: PendingOperation, error: any, foreground = false, leaseToken?: string): Promise<void> {
    await this.prepareError(error);
    if (this.isDefinitiveRejection(row, error)) {
      const headers: Record<string, string> = {};
      error.headers?.keys().forEach((key: string) => headers[key] = error.headers.get(key)!);
      row.state = 'rejected'; row.leaseUntil = 0; row.blocksQueue = false;
      row.response = { status: error.status, body: error.error, headers };
      const message = String(this.errorPayload(error)?.error || 'Il server ha rifiutato il salvataggio. Correggi i dati e salva nuovamente.');
      row.error = message;
      await this.store.saveFailure(row, leaseToken, foreground);
      this.rejectionNotice = message;
      this.notice.next(message);
      return;
    }
    row.attempts++; row.leaseUntil = 0;
    row.nextAttempt = Date.now() + Math.min(300000, 15000 * 2 ** Math.min(row.attempts, 5));
    const payload = this.errorPayload(error);
    row.errorCode = payload?.code;
    const status = error?.status;
    const retryable = status === 0 || this.needsLogin(error) || status === 425 || status === 429 || error?.name === 'TimeoutError' || ['OFFLINE_UNAVAILABLE', 'OFFLINE_ROLLED_BACK'].includes(payload?.code);
    row.state = retryable ? 'waiting' : 'blocked';
    row.blocksQueue = !retryable && (status >= 500 || ['OFFLINE_UNCERTAIN', 'OFFLINE_KEY_CONFLICT', 'OFFLINE_STAMP_ORDER'].includes(payload?.code));
    row.error = this.needsLogin(error) ? 'Accedi nuovamente con lo stesso account.' : payload?.error || error?.message || PENDING_MESSAGE;
    if (status === 0 || error?.name === 'TimeoutError') row.error = PENDING_MESSAGE;
    await this.store.saveFailure(row, leaseToken);
  }
  private async reconcile(row: PendingOperation): Promise<boolean> {
    // A receipt rejected for different data cannot confirm this local payload.
    if (row.errorCode === 'OFFLINE_KEY_CONFLICT') return false;
    const session = this.session();
    if (!session || session.owner !== row.owner || session.expired) return false;
    await this.ensureCapability(row.owner);
    if (!this.receiptLookup.has(row.owner)) return false;
    const url = session.baseUrl + (session.role === 'employee' ? 'mv/' : '') + `offline/operations/${row.id}`;
    const target = new URL(row.url);
    const result: any = await firstValueFrom(this.raw.get(url, {
      headers: { Authorization: `Bearer ${session.token}`, 'X-Tenant-Id': session.tenant },
      params: { path: target.pathname + target.search },
    }).pipe(timeout(10000)));
    if (this.session()?.owner !== row.owner || result?.operationId !== row.id) return false;
    if (result.state !== 'completed') return false;
    if (!(result.status >= 200 && result.status < 500)) return false;
    const bytes = result.bodyEncoding === 'base64'
      ? Uint8Array.from(atob(result.responseBody || ''), char => char.charCodeAt(0))
      : new TextEncoder().encode(result.responseBody || '');
    let body: any;
    if (row.responseType === 'arraybuffer') body = bytes.buffer;
    else if (row.responseType === 'blob') body = new Blob([bytes], { type: result.contentType || '' });
    else {
      const text = new TextDecoder().decode(bytes);
      body = row.responseType === 'json' ? (text ? JSON.parse(text) : null) : text;
    }
    const headers = new HttpHeaders({ 'X-MV-Operation-Id': row.id, ...(result.contentType ? { 'Content-Type': result.contentType } : {}) });
    if (result.status < 300) await this.finishConfirmed(row, new HttpResponse({ body, status: result.status, headers, url: row.url }));
    else await this.failed(row, new HttpErrorResponse({ error: body, status: result.status, headers, url: row.url }));
    return true;
  }
  async sync(manualId?: string): Promise<void> {
    if (this.syncing) {
      if (manualId) this.notice.next('Un invio è già in corso. Attendi il suo esito e poi riprova.');
      return;
    }
    // A manual retry probes the server even when the browser reports offline.
    const owner = this.session()?.owner;
    if (!owner || this.session()?.expired) {
      if (manualId) this.notice.next('Accedi nuovamente con lo stesso account per reinviare il salvataggio.');
      return;
    }
    this.syncing = true;
    try {
      if (!manualId && !navigator.onLine && !await this.serverReachable(owner)) return;
      if (manualId) this.notice.next('Tentativo di invio al server in corso…');
      await this.refresh();
      const stalledScopes = new Set<string>();
      for (const item of this.operations.value) {
        const scope = operationScope(item.path);
        if (stalledScopes.has(scope)) {
          if (item.id === manualId) this.notice.next('Invio sospeso: completa o verifica prima il salvataggio precedente dello stesso ambito.');
          continue;
        }
        if (item.state === 'done') continue;
        if (item.state === 'rejected') continue;
        if (item.predecessor) {
          if (!manualId && item.nextAttempt > Date.now()) { stalledScopes.add(scope); continue; }
          if (!await this.resolvePredecessor(item)) { stalledScopes.add(scope); continue; }
        }
        // Read the durable result before asking for another write, including manual-only operations.
        if ((item.state === 'blocked' || item.attempts > 0) && (item.id === manualId || item.nextAttempt <= Date.now())) {
          try {
            if (await this.reconcile(item)) continue;
          } catch { /* A status lookup never authorizes another execution of an uncertain write. */ }
          if (item.state === 'blocked') {
            item.nextAttempt = Date.now() + 30000;
            await this.store.saveFailure(item);
          }
        }
        if (item.state === 'blocked') { if (item.blocksQueue) stalledScopes.add(scope); continue; }
        if ((!item.automatic && item.id !== manualId) || (!manualId && item.nextAttempt > Date.now())) { stalledScopes.add(scope); continue; }
        if (this.session()?.owner !== owner) break;
        const leaseToken = await this.store.claim(item.id, item.hash);
        if (!leaseToken) {
          if (item.id === manualId) this.notice.next('Questo salvataggio risulta già in invio, anche da un’altra scheda. Attendi il suo esito e poi riprova.');
          stalledScopes.add(scope); continue;
        }
        let response: HttpResponse<any>;
        try {
          await this.ensureCapability(owner);
          const session = this.session();
          if (!session || session.owner !== owner) break;
          const request = new HttpRequest(item.method, item.url, decodeBody(item.body), {
            headers: new HttpHeaders({ ...item.headers, ...this.operationHeaders(item), Authorization: `Bearer ${session.token}`, 'X-Tenant-Id': session.tenant }),
            responseType: item.responseType,
          });
          response = await this.response(request, req => this.raw.request(req));
          this.assertReceipt(item, response);
        } catch (error) {
          await this.failed(item, error, false, leaseToken);
          if (item.id === manualId) this.notice.next(item.error || PENDING_MESSAGE);
          stalledScopes.add(scope);
          continue;
        }
        this.connected.next(true);
        await this.finishConfirmed(item, response);
        if (item.id === manualId) this.notice.next('Salvataggio confermato dal server.');
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
    if (this.confirmed.has(row.id)) { this.consumeRequested.add(row.id); return; }
    await this.store.remove('queue', row.id); await this.refresh();
  }
  async discardOperations(rows: PendingOperation[]): Promise<void> {
    const owner = this.session()?.owner;
    if (!owner || rows.some(row => row.owner !== owner)) {
      this.notice.next('Account cambiato: riapri la coda per eliminare i salvataggi del tuo account.');
      return;
    }
    try {
      const removed = await this.store.removeQueued(owner, rows.map(row => row.id));
      await this.refresh();
      this.notice.next(removed === rows.length
        ? `${removed} operazioni eliminate dalla coda locale.`
        : `${removed} operazioni eliminate. Gli invii in corso restano in coda: attendi il loro esito.`);
    } catch {
      this.notice.next('Impossibile eliminare la coda locale. Riprova.');
    }
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
      this.connected.next(true);
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
      if (error.status > 0) this.connected.next(true);
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
  async clearDraft(page = location.pathname + location.search, owner = this.session()?.owner): Promise<void> { if (owner) { await this.store.remove('drafts', `${owner}|${page}`); await this.store.remove('cache', `editor|${owner}|${page}`); }
  }
}
