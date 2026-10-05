import { HttpBackend, HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injector } from '@angular/core';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuthInterceptorService } from './auth-interceptor.service';
import { OfflineService, OfflineSession } from './offline/offline.service';

describe('AuthInterceptorService online saves', () => {
  let offline: OfflineService;
  let interceptor: AuthInterceptorService;
  let global: any;
  let popup: any;
  const baseUrl = 'https://auth-save.test/';
  const req = () => new HttpRequest('POST', baseUrl + 'customers/save', { name: 'Cliente' });
  beforeEach(async () => {
    global = { token: 'e30.' + btoa(JSON.stringify({ id: 9, tenantId: 'test', exp: Math.floor(Date.now() / 1000) + 3600 })) + '.test', logout: jasmine.createSpy('logout') };
    const session = (): OfflineSession => ({ baseUrl, tenant: 'test', token: global.token, role: 'admin' });
    offline = new OfflineService({ get: () => session } as unknown as Injector, { handle: () => of(new HttpResponse({ body: { protocol: 1 } })) } as HttpBackend);
    for (const row of await offline.store.all('queue')) await offline.store.remove('queue', row.id);
    popup = { showHttpError: jasmine.createSpy(), scheduleHttpError: jasmine.createSpy() };
    interceptor = new AuthInterceptorService(global, { tenant: 'test' } as any, popup, offline);
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(true);
  });
  it('delivers successful online responses without warning popups or residual queue entries', async () => {
    const result = await firstValueFrom(interceptor.intercept(req(), { handle: () => of(new HttpResponse({ body: { id: 7 } })) }));
    expect((result as HttpResponse<any>).body).toEqual({ id: 7 });
    expect(offline.operations.value).toEqual([]);
    expect(popup.scheduleHttpError).not.toHaveBeenCalled();
    expect(global.logout).not.toHaveBeenCalled();
  });
  it('requests a fresh login on 401 while preserving the submitted data', async () => {
    const error = new HttpErrorResponse({ status: 401, error: { error: 'Sessione scaduta' } });
    await expectAsync(firstValueFrom(interceptor.intercept(req(), { handle: () => throwError(() => error) }))).toBeRejectedWith(error);
    expect(global.logout).toHaveBeenCalledTimes(1);
    expect(popup.showHttpError).toHaveBeenCalledWith(error, jasmine.any(String), 'Sessione scaduta');
    expect(offline.operations.value[0].state).toBe('waiting');
  });
  it('returns validation details to the form and respects local error handling', async () => {
    const error = new HttpErrorResponse({ status: 422, error: { error: 'Cliente incompleto', fields: ['name'] } });
    const request = req().clone({ setHeaders: { 'X-Skip-Global-Error-Popup': 'true' } });
    await expectAsync(firstValueFrom(interceptor.intercept(request, { handle: () => throwError(() => error) }))).toBeRejectedWith(error);
    expect(offline.operations.value).toEqual([]);
    expect(popup.scheduleHttpError).not.toHaveBeenCalled();
    expect(global.logout).not.toHaveBeenCalled();
  });
  it('shows pending delivery in the save panel without a generic connection popup', async () => {
    await expectAsync(firstValueFrom(interceptor.intercept(req(), { handle: () => throwError(() => new HttpErrorResponse({ status: 0 })) }))).toBeRejectedWith(jasmine.objectContaining({ error: jasmine.objectContaining({ code: 'OFFLINE_PENDING' }) }));
    expect(offline.operations.value[0].state).toBe('waiting');
    expect(popup.scheduleHttpError).not.toHaveBeenCalled();
    expect(popup.showHttpError).not.toHaveBeenCalled();
  });
});
