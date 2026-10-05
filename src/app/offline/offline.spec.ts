import { sha256 } from './sha256';
import { HttpEventType, HttpBackend, HttpContext, HttpErrorResponse, HttpHeaders, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { firstValueFrom, of, Subject, throwError, toArray } from 'rxjs';
import { OfflineService, OfflineSession, PendingOperation, OFFLINE_SAVE_GROUP } from './offline.service';
import { OfflineStore } from './offline-store';
import { bodyHash, decodeBody, encodeBody } from './offline-codec';
import { canReplayAutomatically, isOfflineRead, isProtectedWrite } from './offline-policy';

describe('Durable offline saves', () => {
  let session: OfflineSession, service: OfflineService, online: jasmine.Spy;
  let requests: HttpRequest<any>[], failure: number;
  const token = (id: number, tenant = 'test') => `e30.${btoa(JSON.stringify({ id, tenantId: tenant, exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
  const backend = () => ({ handle: (req: HttpRequest<any>) => {
    if (req.params.get('connectivityProbe') === '1' && !navigator.onLine) return throwError(() => new HttpErrorResponse({ status: 0 }));
    requests.push(req);
    if (req.url.endsWith('/offline/capabilities')) return of(new HttpResponse({ body: { protocol: 1 } }));
    if (failure) return throwError(() => new HttpErrorResponse({ status: failure, error: { error: 'Rejected' } }));
    return of(new HttpResponse({ status: 201, body: { id: 42 }, headers: new HttpHeaders({ 'X-MV-Operation-Id': req.headers.get('X-MV-Operation-Id') || '' }) }));
  } } as HttpBackend);
  const newService = () => new OfflineService({ get: () => () => session } as unknown as Injector, backend());
  const request = (path = 'quotes/add', body: any = { name: 'Preventivo' }) => new HttpRequest('POST', session.baseUrl + path, body);
  const send = (req = request()) => firstValueFrom(service.intercept(req, value => backend().handle(value)));
  beforeEach(async () => {
    online = spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
    session = { baseUrl: 'https://offline.test/', tenant: 'test', token: token(1), role: 'admin' };
    requests = []; failure = 0; service = newService();
    const store = new OfflineStore();
    for (const name of ['queue', 'cache', 'drafts']) for (const row of await store.all(name)) await store.remove(name, row.id);
  });
  it('sends when the browser says offline but an actual server probe succeeds', async () => {
    online.and.returnValue(false);
    service = new OfflineService({ get: () => () => session } as any, { handle: () => of(new HttpResponse({ body: { protocol: 1 } })) } as any);
    const result: any = await send();
    expect(result.status).toBe(201); expect(requests.length).toBe(1);
    expect(service.connected.value).toBeTrue(); expect(service.operations.value).toEqual([]);
  });
  it('treats a server HTTP error as connectivity and lets the write report its real result', async () => {
    online.and.returnValue(false);
    service = new OfflineService({ get: () => () => session } as any, { handle: () => throwError(() => new HttpErrorResponse({ status: 503 })) } as any);
    await expectAsync(send()).toBeResolved(); expect(service.connected.value).toBeTrue();
  });
  it('automatically resumes despite a stale offline hint when the server is reachable', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    service = new OfflineService({ get: () => () => session } as any, { handle: (req: HttpRequest<any>) => req.url.endsWith('/capabilities')
      ? of(new HttpResponse({ body: { protocol: 1 } })) : backend().handle(req) } as any);
    await service.sync(); expect(service.operations.value[0].state).toBe('done');
  });
  const grouped = (body: any) => new HttpRequest('POST', session.baseUrl + 'shifts/saveMultiple', body, { context: new HttpContext().set(OFFLINE_SAVE_GROUP, 'day:2026-10-05') });
  it('atomically replaces an unsent edited draft without leaving the old version pending', async () => {
    online.and.returnValue(false); await send(grouped({ title: 'Old' })).catch(() => {});
    const id = service.operations.value[0].id;
    await send(grouped({ title: 'New' })).catch(() => {});
    expect(service.operations.value.length).toBe(1); expect(service.operations.value[0].body).toEqual({ type: 'json', value: { title: 'New' } });
    expect((await service.store.get('queue', id)).state).toBe('archived');
    online.and.returnValue(true); await send(grouped({ title: 'New' }));
    expect(requests.filter(req => req.url.endsWith('/saveMultiple')).length).toBe(1);
  });
  it('keeps one current version when two tabs replace a draft concurrently', async () => {
    online.and.returnValue(false); await send(grouped({ title: 'Old' })).catch(() => {});
    const other = newService();
    await Promise.allSettled([send(grouped({ title: 'One' })), firstValueFrom(other.intercept(grouped({ title: 'Two' }), r => backend().handle(r)))]);
    const rows = await service.store.all<PendingOperation>('queue');
    expect(rows.filter(row => row.state !== 'archived').length).toBe(1); expect(requests.length).toBe(0);
  });
  it('requires an atomic server cancellation before replacing an attempted write', async () => {
    let cancelled = false;
    service = new OfflineService({ get: () => () => session } as any, { handle: (req: HttpRequest<any>) => {
      if (req.url.endsWith('/capabilities')) return of(new HttpResponse({ body: { protocol: 1, cancelPending: true } }));
      if (req.url.endsWith('/cancel')) { cancelled = true; expect(req.headers.has('X-MV-Operation-Id')).toBeFalse(); return of(new HttpResponse({ body: { operationId: req.url.split('/').slice(-2)[0], state: 'cancelled' } })); }
      return backend().handle(req);
    } } as any);
    await firstValueFrom(service.intercept(grouped({ title: 'Old' }), () => throwError(() => new HttpErrorResponse({ status: 0 })))).catch(() => {});
    await send(grouped({ title: 'New' }));
    expect(cancelled).toBeTrue(); expect(service.operations.value).toEqual([]);
  });
  it('does not create a second write while the previous attempt is still processing', async () => {
    service = new OfflineService({ get: () => () => session } as any, { handle: (req: HttpRequest<any>) => of(new HttpResponse({ body: req.url.endsWith('/capabilities')
      ? { protocol: 1, cancelPending: true } : { operationId: req.url.split('/').slice(-2)[0], state: 'processing' } })) } as any);
    await firstValueFrom(service.intercept(grouped({ title: 'Old' }), () => throwError(() => new HttpErrorResponse({ status: 0 })))).catch(() => {});
    await expectAsync(send(grouped({ title: 'New' }))).toBeRejectedWith(jasmine.objectContaining({ error: jasmine.objectContaining({ code: 'OFFLINE_PENDING' }) }));
    expect(service.operations.value.length).toBe(1); expect(requests.length).toBe(0);
  });
  it('never replaces clock-in events merely because a draft is open on the page', async () => {
    online.and.returnValue(false); const unregister = service.registerDraftPage(location.pathname + location.search);
    await send(request('mv/stamping/timbra', { action: 'entry' })).catch(() => {});
    await send(request('mv/stamping/timbra', { action: 'exit' })).catch(() => {});
    unregister(); expect(service.operations.value.length).toBe(2);
  });
  it('cannot resurrect a completed row when its form consumes the confirmation immediately', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    const subscription = service.operations.subscribe(rows => { for (const row of rows) if (row.state === 'done') void service.acknowledge(row); });
    online.and.returnValue(true); await service.sync(); subscription.unsubscribe();
    expect(await service.store.all('queue')).toEqual([]);
  });
  it('reports expired authentication without calling it a missing network connection', async () => {
    online.and.returnValue(false); session.token = `e30.${btoa(JSON.stringify({id:1,tenantId:'test',exp:1}))}.signature`;
    await expectAsync(send()).toBeRejectedWith(jasmine.objectContaining({status:401}));
    expect(service.operations.value.length).toBe(1);
  });
  it('keeps the latest attempted draft offline and resumes it after reserving the old key', async () => {
    let oldId = '', cancelled = false;
    service = new OfflineService({ get: () => () => session } as any, { handle: (req: HttpRequest<any>) => {
      if (!navigator.onLine) return throwError(() => new HttpErrorResponse({status:0}));
      if (req.url.endsWith('/capabilities')) return of(new HttpResponse({body:{protocol:1,cancelPending:true}}));
      if (req.url.endsWith('/cancel')) { cancelled = true; expect(req.url).toContain(oldId); return of(new HttpResponse({body:{operationId:oldId,state:'cancelled'}})); }
      expect(cancelled).toBeTrue(); return backend().handle(req);
    } } as any);
    await firstValueFrom(service.intercept(grouped({title:'Old'}), () => throwError(() => new HttpErrorResponse({status:0})))).catch(()=>{});
    oldId = service.operations.value[0].id; online.and.returnValue(false);
    await send(grouped({title:'New'})).catch(()=>{});
    expect(service.operations.value.length).toBe(1); expect(service.operations.value[0].predecessor).toBe(oldId);
    expect(service.operations.value[0].body).toEqual({type:'json',value:{title:'New'}});
    online.and.returnValue(true); await service.sync();
    expect(cancelled).toBeTrue(); expect(requests.filter(req=>req.url.endsWith('/saveMultiple')).map(req=>req.body.title)).toEqual(['New']);
    expect(service.operations.value[0].state).toBe('done');
  });
  it('preserves an archived predecessor when its late success arrives during replacement', async () => {
    online.and.returnValue(false); await send(grouped({title:'Old'})).catch(()=>{});
    const old = service.operations.value[0];
    await service.store.put('queue',{...old,state:'archived',dedup:`archived:${old.id}`});
    await (service as any).finishConfirmed(old,new HttpResponse({body:{savedShifts:[]}}),true);
    const retained = await service.store.get('queue',old.id);
    expect(retained.state).toBe('archived'); expect(retained.response.status).toBe(200);
    expect(service.operations.value).toEqual([]);
  });
  it('hashes identically without WebCrypto, including block boundaries and UTF-8', async () => {
    for (const text of ['', 'abc', 'Firma è valida ✓', 'x'.repeat(55), 'x'.repeat(64), 'x'.repeat(1000)]) {
      const bytes = new TextEncoder().encode(text);
      const expected = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
      expect(sha256(bytes)).toBe(expected);
    }
  });
  it('retains upload progress events before the authoritative response', async () => {
    const events = await firstValueFrom(service.intercept(request(), req => of(
      { type: HttpEventType.UploadProgress as const, loaded: 4, total: 8 },
      new HttpResponse({ body: { id: 1 }, headers: new HttpHeaders({ 'X-MV-Operation-Id': req.headers.get('X-MV-Operation-Id')! }) }),
    )).pipe(toArray()));
    expect(events.length).toBe(2); expect(events[0].type).toBe(HttpEventType.UploadProgress);
    expect(events[1] instanceof HttpResponse).toBeTrue();
  });
  it('falls back to cached reads only for the same identity on network failure', async () => {
    const req = new HttpRequest('GET', session.baseUrl + 'customers/list');
    await firstValueFrom(service.intercept(req, () => of(new HttpResponse({ body: ['Cliente'] }))));
    const result: any = await firstValueFrom(service.intercept(req, () => throwError(() => new HttpErrorResponse({ status: 0 }))));
    expect(result.body).toEqual(['Cliente']); expect(result.headers.get('X-MV-Offline-Cache')).toBe('true');
    session.token = token(2);
    await expectAsync(firstValueFrom(service.intercept(req, () => throwError(() => new HttpErrorResponse({ status: 0 }))))).toBeRejected();
  });
  it('sends with a durable identity and acknowledges only a server receipt', async () => {
    const result: any = await send();
    expect(result.body.id).toBe(42); expect(requests.length).toBe(1);
    expect(requests[0].headers.get('X-MV-Operation-Id')?.length).toBe(48);
    expect((await service.store.all('queue')).length).toBe(0);
  });
  it('does not synthesize offline success and survives a new service instance', async () => {
    online.and.returnValue(false);
    await expectAsync(send()).toBeRejectedWith(jasmine.objectContaining({ error: jasmine.objectContaining({ code: 'OFFLINE_PENDING' }) }));
    expect(requests.length).toBe(0); service = newService(); await service.refresh();
    expect(service.operations.value.length).toBe(1);
    online.and.returnValue(true); await service.sync();
    expect(service.operations.value[0].state).toBe('done'); expect(requests[1].body.name).toBe('Preventivo');
  });
  it('deduplicates repeated save taps across concurrent tabs', async () => {
    online.and.returnValue(false); const other = newService();
    await Promise.allSettled([send(), firstValueFrom(other.intercept(request(), r => backend().handle(r)))]);
    expect((await service.store.all('queue')).length).toBe(1);
  });
  it('removes a queued operation so it cannot be replayed', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    await service.discardOperations([...service.operations.value]);
    expect(service.operations.value).toEqual([]);
    online.and.returnValue(true); await service.sync();
    expect(requests.length).toBe(0);
  });
  it('keeps an operation claimed by another tab and removes only the confirmed snapshot', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    const confirmed = [...service.operations.value];
    await send(request('quotes/add', { name: 'Nuovo salvataggio' })).catch(() => {});
    await service.store.claim(confirmed[0].id);
    await service.discardOperations(confirmed);
    expect(service.operations.value.length).toBe(2);
    expect(service.notice.value).toContain('invii in corso');
    const row = await service.store.get<PendingOperation>('queue', confirmed[0].id);
    await service.store.put('queue', { ...row!, leaseUntil: 0 });
    await service.discardOperations(confirmed);
    expect(service.operations.value.length).toBe(1);
    expect(service.operations.value[0].id).not.toBe(confirmed[0].id);
  });
  it('does not remove another account’s queue after an account switch', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    const confirmed = [...service.operations.value];
    session.token = token(2);
    await service.discardOperations(confirmed);
    expect((await service.store.all('queue')).length).toBe(1);
  });
  it('replays with current credentials and the original operation identity', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    const original = (await service.store.all<PendingOperation>('queue'))[0];
    session.token = `e30.${btoa(JSON.stringify({ id: 1, tenantId: 'test', exp: Math.floor(Date.now() / 1000) + 7200 }))}.new`;
    online.and.returnValue(true); await service.sync();
    const sent = requests.find(req => req.url.endsWith('/quotes/add'))!;
    expect(sent.headers.get('Authorization')).toBe(`Bearer ${session.token}`);
    expect(sent.headers.get('X-MV-Operation-Id')).toBe(original.id);
    expect(JSON.stringify(original)).not.toContain(session.token);
  });
  it('isolates tenants, users and backend environments', async () => {
    online.and.returnValue(false); await send().catch(() => {}); await service.saveDraft({ note: 'private' });
    session.token = token(2); online.and.returnValue(true); await service.sync();
    expect(requests.length).toBe(0); expect(await service.loadDraft()).toBeNull();
    session.token = token(1, 'other'); session.tenant = 'other'; await service.sync();
    expect(service.operations.value.length).toBe(0);
    session.token = token(1); session.tenant = 'test'; session.baseUrl = 'https://another.test/'; await service.sync();
    expect(service.operations.value.length).toBe(0);
  });
  it('returns definitive online validation errors without inventing uncertain saves', async () => {
    failure = 409;
    await expectAsync(send()).toBeRejectedWith(jasmine.objectContaining({ status: 409, error: { error: 'Rejected' } }));
    expect(service.operations.value).toEqual([]);
    const count = requests.length; await service.sync(); expect(requests.length).toBe(count);
  });
  it('preserves shift validation errors for Save anyway without leaving a phantom queue entry', async () => {
    const issues = [{ message: 'Turni sovrapposti' }];
    const req = request('shifts/saveMultiple', { shifts: [], forceSave: false });
    await expectAsync(firstValueFrom(service.intercept(req, value => throwError(() => new HttpErrorResponse({
      status: 409, error: { error: 'Sono state trovate incongruenze nei turni', validationIssues: issues },
      headers: new HttpHeaders({ 'X-MV-Operation-Id': value.headers.get('X-MV-Operation-Id')! }),
    }))))).toBeRejectedWith(jasmine.objectContaining({ status: 409, error: jasmine.objectContaining({ validationIssues: issues }) }));
    expect(service.operations.value).toEqual([]);
    await send(request('shifts/saveMultiple', { shifts: [], forceSave: true }));
    expect(service.operations.value).toEqual([]);
    expect(service.notice.value).toBe('');
  });
  it('archives old rejected shift preflights without resending or losing the recovery copy', async () => {
    online.and.returnValue(false); await send(request('shifts/saveMultiple', { shifts: [], forceSave: false })).catch(() => {});
    const row = service.operations.value[0];
    await service.store.put('queue', { ...row, state: 'blocked', blocksQueue: false, error: 'Sono state trovate incongruenze nei turni' });
    await service.refresh();
    expect(service.operations.value).toEqual([]);
    expect((await service.store.get<PendingOperation>('queue', row.id))?.state).toBe('archived');
    expect(await service.store.claim(row.id)).toBeFalse();
    expect(requests.length).toBe(0);
  });
  it('retains separate ordered clock-ins and their original timestamps', async () => {
    online.and.returnValue(false);
    await send(request('mv/stamping/timbra', { tagId: 'A', capturedAt: '2026-10-01T08:00:00Z' })).catch(() => {});
    await send(request('mv/stamping/timbra', { tagId: 'A', capturedAt: '2026-10-01T09:00:00Z' })).catch(() => {});
    online.and.returnValue(true); await service.sync();
    const rows = requests.filter(req => req.url.endsWith('/timbra'));
    expect(rows.map(req => req.body.capturedAt)).toEqual(['2026-10-01T08:00:00Z', '2026-10-01T09:00:00Z']);
  });
  it('consumes completed background receipts on resubmit without another write', async () => {
    online.and.returnValue(false); await send().catch(() => {}); online.and.returnValue(true); await service.sync();
    const count = requests.length; const result: any = await send(); expect(result.body.id).toBe(42); expect(requests.length).toBe(count);
  });
  it('sends online shifts and notes despite an unrelated manual save', async () => {
    online.and.returnValue(false);
    await send(request('employees/edit', { id: 7 })).catch(() => {});
    online.and.returnValue(true);
    await expectAsync(send(request('shifts/save', { id: 8 }))).toBeResolved();
    await expectAsync(send(request('customers/notes/add', { testo: 'Nota' }))).toBeResolved();
    expect(service.operations.value.length).toBe(1);
    expect(service.operations.value[0].path).toBe('/employees/edit');
  });
  it('syncs independent saves while preserving ordering behind a manual operation', async () => {
    online.and.returnValue(false);
    await send(request('employees/edit', { id: 7 })).catch(() => {});
    await send(request('employees/notes/add', { testo: 'Dopo modifica' })).catch(() => {});
    await send(request('customers/notes/add', { testo: 'Indipendente' })).catch(() => {});
    online.and.returnValue(true); await service.sync();
    expect(service.operations.value.map(row => row.state)).toEqual(['waiting', 'waiting', 'done']);
    expect(requests.filter(req => !req.url.endsWith('/capabilities')).map(req => req.url)).toEqual([session.baseUrl + 'customers/notes/add']);
    await service.sync(service.operations.value[0].id);
    expect(service.operations.value.map(row => row.state)).toEqual(['done', 'done', 'done']);
  });
  it('isolates uncertain saves without replaying later writes in their domain', async () => {
    failure = 503; await send(request('shifts/save', { id: 8 })).catch(() => {});
    expect(service.operations.value[0].blocksQueue).toBeTrue(); failure = 0;
    await expectAsync(send(request('customers/notes/add', { testo: 'Online' }))).toBeResolved();
    online.and.returnValue(false);
    await send(request('shifts/save', { id: 9 })).catch(() => {});
    await send(request('quotes/notes/add', { testo: 'Offline' })).catch(() => {});
    online.and.returnValue(true); await service.sync();
    expect(service.operations.value.map(row => row.state)).toEqual(['blocked', 'waiting', 'done']);
    expect(requests.filter(req => req.url.endsWith('/shifts/save')).length).toBe(1);
  });
  it('continues independent synchronization after a failed request', async () => {
    online.and.returnValue(false);
    await send(request('quotes/add')).catch(() => {});
    await send(request('customers/notes/add', { testo: 'Nota' })).catch(() => {});
    const original = backend();
    service = new OfflineService({ get: () => () => session } as unknown as Injector, {
      handle: (req: HttpRequest<any>) => req.url.endsWith('/quotes/add')
        ? throwError(() => new HttpErrorResponse({ status: 0 })) : original.handle(req),
    } as HttpBackend);
    online.and.returnValue(true); await service.sync();
    expect(service.operations.value.map(row => row.state)).toEqual(['waiting', 'done']);
  });
  it('fails closed offline when local storage is full', async () => {
    online.and.returnValue(false);
    spyOn(service.store, 'enqueue').and.rejectWith(new Error('QuotaExceeded'));
    await expectAsync(send()).toBeRejectedWith(jasmine.objectContaining({ error: jasmine.objectContaining({ code: 'OFFLINE_STORAGE' }) }));
    expect(requests.length).toBe(0);
  });
  it('sends the first online write without depending on the capability endpoint', async () => {
    for (const path of ['shifts/saveMultiple', 'customers/notes/add']) {
      const result: any = await send(request(path, { testo: path }));
      expect(result.status).toBe(201);
    }
    expect(requests.some(req => req.url.endsWith('/capabilities'))).toBeFalse();
    expect(requests.every(req => !!req.headers.get('X-MV-Operation-Id'))).toBeTrue();
    expect((await service.store.all('queue')).length).toBe(0);
  });
  it('allows a confirmed online save when local storage is unavailable', async () => {
    spyOn(service.store, 'enqueue').and.rejectWith(new Error('QuotaExceeded'));
    const result: any = await send(request('shifts/saveMultiple'));
    expect(result.status).toBe(201);
    expect(requests.length).toBe(1);
    expect(requests[0].headers.get('X-MV-Operation-Id')?.length).toBe(48);
    expect(service.notice.value).toBe('');
  });
  it('does not bypass protection if refreshing fails after durable enqueue', async () => {
    spyOn(service, 'refresh').and.rejectWith(new Error('Read failed'));
    await expectAsync(send()).toBeRejectedWith(jasmine.objectContaining({ error: jasmine.objectContaining({ code: 'OFFLINE_STORAGE' }) }));
    expect(requests.length).toBe(0);
    expect((await service.store.all('queue')).length).toBe(1);
  });
  it('reports direct online failures without inventing a pending local copy', async () => {
    spyOn(service.store, 'enqueue').and.rejectWith(new Error('QuotaExceeded'));
    failure = 403;
    await expectAsync(send()).toBeRejectedWith(jasmine.objectContaining({ status: 403, error: { error: 'Rejected' } }));
    expect((await service.store.all('queue')).length).toBe(0);
  });
  it('manual retry probes and sends even when the browser still reports offline', async () => {
    online.and.returnValue(false); await send(request('shifts/saveMultiple')).catch(() => {});
    const row = service.operations.value[0];
    service.connected.next(false);
    await service.sync(row.id);
    expect(requests.length).toBe(2);
    expect(requests[1].headers.get('X-MV-Operation-Id')).toBe(row.id);
    expect(service.operations.value[0].state).toBe('done');
    expect(service.connected.value).toBeTrue();
    expect(service.notice.value).toBe('Salvataggio confermato dal server.');
  });
  it('reports a server capability error without calling it missing Internet', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    service = new OfflineService({ get: () => () => session } as unknown as Injector, {
      handle: (req: HttpRequest<any>) => { requests.push(req); return throwError(() => new HttpErrorResponse({ status: 503 })); },
    } as HttpBackend);
    service.connected.next(false);
    await service.refresh(); await service.sync(service.operations.value[0].id);
    expect(requests.length).toBe(1);
    expect(service.notice.value).toContain('server ha risposto con errore 503');
    expect(service.connected.value).toBeTrue();
    expect(service.operations.value[0].state).toBe('waiting');
  });
  it('explains when a prior manual save prevents the requested retry', async () => {
    online.and.returnValue(false);
    await send(request('shifts/autosave', { id: 1 })).catch(() => {});
    await send(request('shifts/saveMultiple', { id: 2 })).catch(() => {});
    await service.sync(service.operations.value[1].id);
    expect(requests.length).toBe(0);
    expect(service.notice.value).toContain('salvataggio precedente');
  });
  it('explains when the requested retry is already leased by another sender', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    const row = service.operations.value[0]; await service.store.claim(row.id);
    await service.sync(row.id);
    expect(requests.length).toBe(0);
    expect(service.notice.value).toContain('già in invio');
  });
  it('explains expired sessions instead of silently ignoring a retry', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    session.token = `e30.${btoa(JSON.stringify({ id: 1, tenantId: 'test', exp: 1 }))}.signature`;
    await service.sync(service.operations.value[0].id);
    expect(requests.length).toBe(0);
    expect(service.notice.value).toContain('Accedi nuovamente');
  });
  it('accepts real success responses without receipt headers from older routes', async () => {
    for (const status of [200, 201, 204]) {
      const result = await firstValueFrom(service.intercept(request('customers/save', { status }), () => of(new HttpResponse({ status, body: status === 204 ? null : { ok: true } }))));
      expect((result as HttpResponse<any>).status).toBe(status);
      expect(service.operations.value).toEqual([]);
    }
  });
  it('does not report a failed save when cleanup fails after server confirmation', async () => {
    spyOn(service.store, 'remove').and.rejectWith(new Error('disk cleanup'));
    const result: any = await send();
    expect(result.body.id).toBe(42);
    expect(service.operations.value[0].state).toBe('done');
    const count = requests.length;
    const repeated: any = await send();
    expect(repeated.body.id).toBe(42); expect(requests.length).toBe(count);
  });
  it('keeps an in-memory confirmation if persisting the receipt fails', async () => {
    spyOn(service.store, 'markConfirmed').and.rejectWith(new Error('disk full'));
    const result: any = await send();
    expect(result.body.id).toBe(42); expect(service.operations.value[0].state).toBe('done');
    const count = requests.length; await send(); expect(requests.length).toBe(count);
  });
  it('preserves authentication errors so the app can request a new login', async () => {
    failure = 401;
    await expectAsync(send()).toBeRejectedWith(jasmine.objectContaining({ status: 401 }));
    expect(service.operations.value[0].state).toBe('waiting');
    expect(JSON.stringify(service.operations.value)).not.toContain(session.token);
  });
  it('returns known version and clock-in order rejections without treating them as unknown outcomes', async () => {
    for (const code of ['OFFLINE_VERSION_REQUIRED', 'OFFLINE_VERSION_CONFLICT', 'OFFLINE_STAMP_ORDER']) {
      const error = { code, error: 'Correggi il conflitto' };
      await expectAsync(firstValueFrom(service.intercept(request(), () => throwError(() => new HttpErrorResponse({ status: 409, error }))))).toBeRejectedWith(jasmine.objectContaining({ status: 409, error }));
      expect(service.operations.value).toEqual([]);
    }
  });
  it('does not overwrite a confirmation from another tab with a stale failure', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    const row = service.operations.value[0];
    await service.store.put('queue', { ...row, state: 'done', response: { body: { id: 88 }, status: 201, headers: {} } });
    await service.store.saveFailure({ ...row, state: 'blocked' });
    expect((await service.store.get<PendingOperation>('queue', row.id))?.state).toBe('done');
  });
  it('preserves validation payloads and authorization errors across all online modules', async () => {
    for (const status of [400, 403, 404, 409, 412, 422]) {
      const payload = { error: 'Correggi i dati', fields: ['name'], currentRevision: 9 };
      await expectAsync(firstValueFrom(service.intercept(request('customers/save', { status }), () => throwError(() => new HttpErrorResponse({ status, error: payload }))))).toBeRejectedWith(jasmine.objectContaining({ status, error: payload }));
      expect(service.operations.value).toEqual([]);
    }
  });
  it('retains rejected background data for correction without retrying or calling it uncertain', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    online.and.returnValue(true); failure = 422; await service.sync();
    expect(service.operations.value[0].state).toBe('rejected');
    expect(service.operations.value[0].response?.status).toBe(422);
    expect(service.operations.value[0].error).toBe('Rejected');
    const count = requests.length; await service.sync(); expect(requests.length).toBe(count);
  });
  it('never presents pending uncertain writes as a 409 business validation conflict', async () => {
    failure = 503;
    await expectAsync(send()).toBeRejectedWith(jasmine.objectContaining({ status: 0, error: jasmine.objectContaining({ code: 'OFFLINE_PENDING', state: 'blocked' }) }));
  });
  it('keeps version preconditions when replaying an offline save', async () => {
    online.and.returnValue(false);
    await send(new HttpRequest('POST', session.baseUrl + 'quotes/edit', { name: 'Versione' }, { headers: new HttpHeaders({ 'If-Match': 'revision-4', 'If-Unmodified-Since': 'Mon, 05 Oct 2026 08:00:00 GMT' }) })).catch(() => {});
    online.and.returnValue(true); await service.sync();
    const replay = requests.find(req => req.url.endsWith('/quotes/edit'))!;
    expect(replay.headers.get('If-Match')).toBe('revision-4');
    expect(replay.headers.get('If-Unmodified-Since')).toBe('Mon, 05 Oct 2026 08:00:00 GMT');
  });
  async function receiptRecovery(status = 201, state = 'completed', body: any = { id: 88 }) {
    failure = 503; await send(request('customers/save')).catch(() => {});
    const row = service.operations.value[0];
    await service.store.put('queue', { ...row, nextAttempt: 0 });
    const calls: HttpRequest<any>[] = [];
    service = new OfflineService({ get: () => () => session } as unknown as Injector, { handle(req: HttpRequest<any>) {
      calls.push(req);
      if (req.url.endsWith('/capabilities')) return of(new HttpResponse({ body: { protocol: 1, receiptLookup: true } }));
      return of(new HttpResponse({ body: { operationId: row.id, state, status, responseBody: JSON.stringify(body), contentType: 'application/json', bodyEncoding: 'utf8' } }));
    }} as HttpBackend);
    await service.sync(); return { calls, row };
  }
  it('automatically recovers a lost confirmation for manual-only online saves using GET only', async () => {
    const { calls } = await receiptRecovery();
    expect(calls.every(req => req.method === 'GET')).toBeTrue();
    expect(service.operations.value[0].state).toBe('done');
    expect(service.operations.value[0].response?.body).toEqual({ id: 88 });
    expect(calls[1].headers.get('X-Tenant-Id')).toBe('test');
  });
  it('recognizes an older rejected request from the durable server response', async () => {
    const { calls } = await receiptRecovery(409, 'completed', { error: 'Record modificato', currentRevision: 5 });
    expect(service.operations.value[0].state).toBe('rejected');
    expect(service.operations.value[0].response?.body.currentRevision).toBe(5);
    expect(calls.every(req => req.method === 'GET')).toBeTrue();
  });
  it('does not repeat a write whose durable server outcome is still uncertain', async () => {
    const { calls } = await receiptRecovery(500, 'uncertain');
    expect(service.operations.value[0].state).toBe('blocked');
    expect(calls.every(req => req.method === 'GET')).toBeTrue();
  });
  it('does not mark another operation confirmed if the lookup returns a different id', async () => {
    failure = 503; await send().catch(() => {});
    const row = service.operations.value[0]; await service.store.put('queue', { ...row, nextAttempt: 0 });
    service = new OfflineService({ get: () => () => session } as unknown as Injector, { handle(req: HttpRequest<any>) {
      return of(new HttpResponse({ body: req.url.endsWith('/capabilities') ? { protocol: 1, receiptLookup: true } : { operationId: 'wrong', state: 'completed', status: 200, responseBody: '{}' } }));
    }} as HttpBackend);
    await service.sync(); expect(service.operations.value[0].state).toBe('blocked');
  });
  it('never accepts an existing receipt for data rejected with an operation-key conflict', async () => {
    await firstValueFrom(service.intercept(request(), () => throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'OFFLINE_KEY_CONFLICT', error: 'Identificativo già usato per dati diversi' } })))).catch(() => {});
    const row = service.operations.value[0];
    await service.store.put('queue', { ...row, nextAttempt: 0 });
    const calls: HttpRequest<any>[] = [];
    service = new OfflineService({ get: () => () => session } as unknown as Injector, { handle(req: HttpRequest<any>) {
      calls.push(req); return of(new HttpResponse({ body: { operationId: row.id, state: 'completed', status: 200, responseBody: '{"id":99}' } }));
    }} as HttpBackend);
    await service.sync(row.id);
    expect(calls).toEqual([]);
    expect(service.operations.value[0].state).toBe('blocked');
    expect(service.operations.value[0].errorCode).toBe('OFFLINE_KEY_CONFLICT');
  });
  it('reuses an in-memory operation identity on retries when local storage is unavailable', async () => {
    spyOn(service.store, 'enqueue').and.rejectWith(new Error('disk full'));
    failure = 0;
    let calls = 0;
    const handler = (req: HttpRequest<any>) => {
      requests.push(req); calls++;
      return calls === 1 ? throwError(() => new HttpErrorResponse({status: 0})) : of(new HttpResponse({ body: { id: 7 } }));
    };
    await firstValueFrom(service.intercept(request(), handler)).catch(() => {});
    await firstValueFrom(service.intercept(request(), handler));
    expect(requests[0].headers.get('X-MV-Operation-Id')).toBe(requests[1].headers.get('X-MV-Operation-Id'));
  });
  it('does not submit changed data after an unconfirmed direct save when the local archive is full', async () => {
    spyOn(service.store, 'enqueue').and.rejectWith(new Error('disk full'));
    const handler = (req: HttpRequest<any>) => { requests.push(req); return throwError(() => new HttpErrorResponse({ status: 0 })); };
    await firstValueFrom(service.intercept(grouped({ title: 'First' }), handler)).catch(() => {});
    await firstValueFrom(service.intercept(grouped({ title: 'Edited' }), handler)).catch(() => {});
    expect(requests.length).toBe(1);
  });
  it('allows corrected direct data after a definitive server rejection with a full archive', async () => {
    spyOn(service.store, 'enqueue').and.rejectWith(new Error('disk full'));
    failure = 422; await send(grouped({ title: 'Invalid' })).catch(() => {});
    failure = 0; await expectAsync(send(grouped({ title: 'Corrected' }))).toBeResolved();
    expect(requests.length).toBe(2);
  });
  it('validates the receipt even when falling back to a direct online save', async () => {
    spyOn(service.store, 'enqueue').and.rejectWith(new Error('disk full'));
    await expectAsync(firstValueFrom(service.intercept(request(), () => of(new HttpResponse({
      status: 201, headers: new HttpHeaders({ 'X-MV-Operation-Id': 'another-operation' }),
    }))))).toBeRejectedWith(jasmine.objectContaining({ error: jasmine.objectContaining({ code: 'OFFLINE_UNCERTAIN' }) }));
  });
  it('does not overwrite prepared shift identifiers with a stale failure from another tab', async () => {
    online.and.returnValue(false); await send(grouped({ shifts: [{ clientId: 'extra' }] })).catch(() => {});
    const old = service.operations.value[0];
    const body = await encodeBody({ shifts: [{ clientId: 'extra', shiftId: 88 }] }), hash = await bodyHash(body);
    expect(await service.store.prepareQueued({ ...old, body, hash, dedup: old.dedup.replace(old.hash, hash) }, old.hash)).toBeTrue();
    await service.store.saveFailure({ ...old, state: 'blocked' });
    expect((await service.store.get<PendingOperation>('queue', old.id))?.hash).toBe(hash);
    expect((await service.store.get<PendingOperation>('queue', old.id))?.state).toBe('waiting');
    expect(await service.store.claim(old.id, old.hash)).toBeFalse();
  });
  it('does not release an active sender lease from an unclaimed stale failure', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    const old = service.operations.value[0];
    await service.store.claim(old.id);
    const claimed = await service.store.get<PendingOperation>('queue', old.id);
    const stale = { ...old, state: 'blocked', leaseUntil: 0 };
    await service.store.saveFailure(stale);
    expect((await service.store.get<PendingOperation>('queue', old.id))?.leaseUntil).toBe(claimed?.leaseUntil);
    expect((await service.store.get<PendingOperation>('queue', old.id))?.state).toBe('waiting');
  });
  it('prevents a second tab from sending while the first server response is delayed', async () => {
    online.and.returnValue(false); await send().catch(() => {}); online.and.returnValue(true);
    const response = new Subject<HttpResponse<any>>();
    let started!: () => void; const sending = new Promise<void>(resolve => started = resolve);
    const first = firstValueFrom(service.intercept(request(), req => { requests.push(req); started(); return response; }));
    await sending;
    const other = newService(); await other.sync();
    expect(requests.filter(req => req.url.endsWith('/quotes/add')).length).toBe(1);
    response.next(new HttpResponse({ status: 201, body: { id: 42 } })); response.complete(); await first;
    await other.refresh(); expect(other.operations.value).toEqual([]);
  });
  it('keeps another sender’s renewed lease when an expired sender eventually fails', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    const old = service.operations.value[0], firstLease = await service.store.claim(old.id);
    await service.store.put('queue', { ...(await service.store.get('queue', old.id)), leaseUntil: 0 });
    const secondLease = await service.store.claim(old.id);
    expect(secondLease).not.toBe(firstLease);
    await service.store.saveFailure({ ...old, state: 'blocked' }, firstLease || undefined);
    expect((await service.store.get<PendingOperation>('queue', old.id))?.state).toBe('waiting');
    await service.store.saveFailure({ ...old, state: 'blocked' }, secondLease || undefined);
    expect((await service.store.get<PendingOperation>('queue', old.id))?.state).toBe('blocked');
  });
  it('does not delete a renewed claim when an older foreground response rejects the save', async () => {
    const response = new Subject<HttpResponse<any>>();
    let started!: () => void; const sending = new Promise<void>(resolve => started = resolve);
    const first = firstValueFrom(service.intercept(request(), () => { started(); return response; })).catch(error => error);
    await sending;
    const row = (await service.store.all<PendingOperation>('queue'))[0];
    await service.store.put('queue', { ...row, leaseUntil: 0 }); await service.store.claim(row.id);
    const newer = await service.store.get<PendingOperation>('queue', row.id);
    response.error(new HttpErrorResponse({ status: 422, error: { error: 'Old rejection' } }));
    expect((await first).status).toBe(422);
    expect((await service.store.get<PendingOperation>('queue', row.id))?.leaseUntil).toBe(newer?.leaseUntil);
  });
  it('sends the captured payload when caller data changes during a direct-save storage failure', async () => {
    const body = { title: 'Captured' };
    spyOn(service.store, 'enqueue').and.callFake(async () => { body.title = 'Edited later'; throw new Error('disk full'); });
    await send(grouped(body));
    expect(requests[0].body).toEqual({ title: 'Captured' });
    expect(requests[0].headers.get('X-MV-Payload-Hash')).toBe(await bodyHash(await encodeBody({ title: 'Captured' })));
  });
  it('serializes synchronization even while an offline connectivity probe is pending', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    const probe = new Subject<HttpResponse<any>>(); let probes = 0;
    service = new OfflineService({ get: () => () => session } as any, { handle: (req: HttpRequest<any>) => {
      if (req.params.get('connectivityProbe') === '1') { probes++; return probe; }
      return backend().handle(req);
    } } as any);
    const first = service.sync(); await service.sync(); expect(probes).toBe(1);
    probe.next(new HttpResponse({ body: { protocol: 1 } })); probe.complete(); await first;
    expect(service.operations.value[0].state).toBe('done');
    await service.sync(); expect(probes).toBe(2);
  });
  it('uses refreshed credentials if they change while the payload is being persisted', async () => {
    const enqueue = service.store.enqueue.bind(service.store);
    const fresh = token(1) + 'fresh';
    spyOn(service.store, 'enqueue').and.callFake(async value => { session.token = fresh; return enqueue(value); });
    await send(); expect(requests[0].headers.get('Authorization')).toBe('Bearer ' + fresh);
  });
  it('does not combine queued requests with different version preconditions', async () => {
    online.and.returnValue(false);
    for (const version of ['one','two']) await send(new HttpRequest('POST',session.baseUrl+'quotes/edit',{ name:'Same payload' },{headers:new HttpHeaders({'If-Match':version})})).catch(()=>{});
    expect(service.operations.value.length).toBe(2);
  });
  it('retains a write but propagates an expired employee-token 403 for login', async () => {
    await expectAsync(firstValueFrom(service.intercept(request(), () => throwError(() => new HttpErrorResponse({status:403,error:{error:'Token non valido o scaduto'}}))))).toBeRejectedWith(jasmine.objectContaining({status:403}));
    expect(service.operations.value[0].state).toBe('waiting');
  });
  it('does not call disabled-feature capability responses an expired login', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    const row=service.operations.value[0];
    service=new OfflineService({get:()=>()=>session} as unknown as Injector,{handle:()=>throwError(()=>new HttpErrorResponse({status:403,error:{error:'Funzione non abilitata',code:'FEATURE_DISABLED'}}))} as HttpBackend);
    await service.sync(row.id);
    expect(service.operations.value[0].state).toBe('rejected');
    expect(service.operations.value[0].response?.status).toBe(403);
  });
  it('does not mistake textual protocol errors for business validation failures', async () => {
    const error=JSON.stringify({code:'OFFLINE_UNCERTAIN',error:'Conferma mancante'});
    await expectAsync(firstValueFrom(service.intercept(request(),()=>throwError(()=>new HttpErrorResponse({status:409,error}))))).toBeRejectedWith(jasmine.objectContaining({error:jasmine.objectContaining({code:'OFFLINE_PENDING'})}));
    expect(service.operations.value[0].state).toBe('blocked');
  });
  it('does not claim a rejected or uncertain operation from a stale tab snapshot', async () => {
    online.and.returnValue(false); await send().catch(() => {});
    const row = service.operations.value[0];
    for (const state of ['rejected', 'blocked', 'done', 'archived'] as const) {
      await service.store.put('queue', { ...row, state, leaseUntil: 0 });
      expect(await service.store.claim(row.id)).withContext(state).toBeFalse();
    }
  });
  it('recognizes uncertain protocol outcomes even when a file request receives binary JSON errors', async () => {
    for (const responseType of ['blob', 'arraybuffer'] as const) {
      const payload = JSON.stringify({ code: 'OFFLINE_UNCERTAIN', error: 'Conferma mancante' });
      const body = responseType === 'blob' ? new Blob([payload], { type: 'application/json' }) : new TextEncoder().encode(payload).buffer;
      const req = new HttpRequest('POST', session.baseUrl + `documents-${responseType}/save`, { responseType }, { responseType });
      await expectAsync(firstValueFrom(service.intercept(req, () => throwError(() => new HttpErrorResponse({ status: 409, error: body }))))).toBeRejectedWith(jasmine.objectContaining({ error: jasmine.objectContaining({ code: 'OFFLINE_PENDING' }) }));
    }
    expect(service.operations.value.length).toBe(2);
    expect(service.operations.value.every(row => row.state === 'blocked')).toBeTrue();
  });
  it('restores base64 server receipts using the original requested response type', async () => {
    for (const responseType of ['json', 'text', 'blob', 'arraybuffer'] as const) {
      const req = new HttpRequest('POST', session.baseUrl + 'documents/save', { responseType }, { responseType });
      await firstValueFrom(service.intercept(req, () => throwError(() => new HttpErrorResponse({ status: 503 })))).catch(() => {});
      const row = service.operations.value.find(row => row.responseType === responseType)!;
      await service.store.put('queue', { ...row, nextAttempt: 0 });
      const text = '{"name":"Conferma è valida"}';
      const bytes = new TextEncoder().encode(text);
      const base64 = btoa(Array.from(bytes, n => String.fromCharCode(n)).join(''));
      service = new OfflineService({ get: () => () => session } as unknown as Injector, { handle(req: HttpRequest<any>) {
        return of(new HttpResponse({ body: req.url.endsWith('/capabilities') ? { protocol: 1, receiptLookup: true } : { operationId: row.id, state: 'completed', status: 200, responseBody: base64, bodyEncoding: 'base64', contentType: 'application/json' } }));
      }} as HttpBackend);
      await service.sync();
      const result = service.operations.value.find(item => item.id === row.id)!;
      expect(result.state).toBe('done');
      const body = result.response?.body;
      if (responseType === 'json') expect(body).toEqual({ name: 'Conferma è valida' });
      else if (responseType === 'text') expect(body).toBe(text);
      else if (responseType === 'blob') expect(await body.text()).toBe(text);
      else expect(new Uint8Array(body)).toEqual(bytes);
    }
  });
  it('round-trips multipart attachment bytes, filenames and repeated fields', async () => {
    const form = new FormData(); form.append('testo', 'Nota'); form.append('allegati', new File(['one'], 'one.txt')); form.append('allegati', new File(['two'], 'two.txt'));
    const encoded = await encodeBody(form), hash = await bodyHash(encoded);
    await service.store.put('drafts', { id: 'binary', value: encoded });
    const loaded = await service.store.get('drafts', 'binary'); expect(await bodyHash(loaded.value)).toBe(hash);
    const decoded = decodeBody(loaded.value) as FormData, files = decoded.getAll('allegati') as File[];
    expect(decoded.get('testo')).toBe('Nota'); expect(files.map(file => file.name)).toEqual(['one.txt', 'two.txt']); expect(await files[1].text()).toBe('two');
  });
  it('excludes POST reads, passwords, OTPs and the existing warehouse outbox', () => {
    for (const path of ['/quotes/getQuote', '/login/mv', '/mv/finelavoro/signature/requestOtp', '/mv/customer-warehouse/photos', '/employee/restorePassword']) expect(isProtectedWrite('POST', path)).withContext(path).toBeFalse();
    expect(isOfflineRead('POST', '/quotes/getQuote')).toBeTrue(); expect(isProtectedWrite('POST', '/quotes/notes/add')).toBeTrue();
    expect(isProtectedWrite('POST', '/admin/settings/getAll')).toBeFalse();
    expect(isProtectedWrite('POST', '/admin/attendance/saveEditableNote')).toBeTrue();
    expect(canReplayAutomatically('DELETE', '/quotes/1')).toBeFalse(); expect(canReplayAutomatically('POST', '/mv/material-deliveries/signature/confirm')).toBeFalse();
  });
});
