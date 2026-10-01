import { sha256 } from './sha256';
import { HttpEventType, HttpBackend, HttpErrorResponse, HttpHeaders, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { firstValueFrom, of, throwError, toArray } from 'rxjs';
import { OfflineService, OfflineSession, PendingOperation } from './offline.service';
import { OfflineStore } from './offline-store';
import { bodyHash, decodeBody, encodeBody } from './offline-codec';
import { canReplayAutomatically, isOfflineRead, isProtectedWrite } from './offline-policy';

describe('Durable offline saves', () => {
  let session: OfflineSession, service: OfflineService, online: jasmine.Spy;
  let requests: HttpRequest<any>[], failure: number;
  const token = (id: number, tenant = 'test') => `e30.${btoa(JSON.stringify({ id, tenantId: tenant, exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
  const backend = () => ({ handle: (req: HttpRequest<any>) => {
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
    expect(result.body.id).toBe(42); expect(requests.length).toBe(2);
    expect(requests[1].headers.get('X-MV-Operation-Id')?.length).toBe(48);
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
  it('retains rejected operations without automatically repeating them', async () => {
    failure = 409; await send().catch(() => {}); expect(service.operations.value[0].state).toBe('blocked');
    const count = requests.length; await service.sync(); expect(requests.length).toBe(count);
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
  it('fails closed before sending when local storage is full', async () => {
    spyOn(service.store, 'enqueue').and.rejectWith(new Error('QuotaExceeded'));
    await expectAsync(send()).toBeRejectedWith(jasmine.objectContaining({ error: jasmine.objectContaining({ code: 'OFFLINE_STORAGE' }) }));
    expect(requests.length).toBe(0);
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
