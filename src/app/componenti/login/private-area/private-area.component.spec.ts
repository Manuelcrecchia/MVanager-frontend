import { PrivateAreaComponent } from './private-area.component';
import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpErrorResponse, HttpHeaders, HttpRequest } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AuthInterceptorService } from '../../../auth-interceptor.service';

describe('PrivateAreaComponent', () => {
  it('should be exported', () => {
    expect(PrivateAreaComponent).toBeTruthy();
  });
  it('mostra un solo popup per password errata attraversando l’interceptor', async () => {
    const component: any = Object.create(PrivateAreaComponent.prototype);
    const popup = { text: '', openPopup: jasmine.createSpy('openPopup'), showHttpError: jasmine.createSpy('showHttpError'), scheduleHttpError: jasmine.createSpy('scheduleHttpError') };
    const global = { url: '/', headers: new HttpHeaders(), token: 'previous-session', logout: jasmine.createSpy('logout') };
    const tenant = { tenant: 'test', requiresTenantSelection: false };
    const interceptor = new AuthInterceptorService(global as any, tenant as any, popup as any,
      { intercept: (request: any, send: any) => send(request) } as any);
    component.tenantService = tenant;
    component.globalService = global;
    component.popup = popup;
    component.http = { post: (url: string, body: any) => interceptor.intercept(new HttpRequest('POST', url, body), {
      handle: () => throwError(() => new HttpErrorResponse({ status: 401, error: { response: 'Credenziali non valide' } })),
    }) };
    await component.loginFunction('test@example.test', 'wrong-test');
    expect(popup.openPopup).toHaveBeenCalledTimes(1);
    expect(popup.text).toBe('Credenziali non valide');
    expect(popup.showHttpError).not.toHaveBeenCalled();
    expect(popup.scheduleHttpError).not.toHaveBeenCalled();
    expect(global.logout).not.toHaveBeenCalled();
  });

  it('offers navigator setup after a successful manual login before continuing to the pending destination', fakeAsync(() => {
    const component: any = Object.create(PrivateAreaComponent.prototype);
    let finishSetup!: () => void;
    component.isMobile = true;
    component.tenantService = { tenant: 'test', requiresTenantSelection: false };
    component.globalService = { url: '/', headers: new HttpHeaders(), loadTenantConfig: async () => ({}) };
    component.authService = {};
    component.http = { post: () => of({ token: 'signed-in', permissions: ['CALENDAR_VIEW'] }) };
    component.bio = { storeCredentials: async () => {} };
    component.serviceAnnouncements = { showAfterLogin: jasmine.createSpy('announcements').and.resolveTo() };
    component.navigatorSetup = { showAfterLogin: jasmine.createSpy('setup').and.returnValue(new Promise<void>(resolve => finishSetup = resolve)) };
    component.notificationNavigation = { consumePendingOrNavigate: jasmine.createSpy('navigate').and.resolveTo() };
    void component.loginFunction('fittizio@example.test', 'test-only'); flushMicrotasks();
    expect(component.navigatorSetup.showAfterLogin).toHaveBeenCalledTimes(1);
    expect(component.notificationNavigation.consumePendingOrNavigate).not.toHaveBeenCalled();
    finishSetup(); flushMicrotasks();
    expect(component.notificationNavigation.consumePendingOrNavigate).toHaveBeenCalledOnceWith('/homeAdmin');
  }));
  it('continues a verified manual login when biometric credential storage is unavailable', fakeAsync(() => {
    const component: any = Object.create(PrivateAreaComponent.prototype);
    component.isMobile = true;
    component.tenantService = { tenant: 'test', requiresTenantSelection: false };
    component.globalService = { url: '/', headers: new HttpHeaders(), loadTenantConfig: async () => ({}) };
    component.authService = {};
    component.http = { post: () => of({ token: 'signed-in', permissions: ['NOTIFICATIONS_VIEW'] }) };
    component.bio = { storeCredentials: async () => { throw new Error('Unavailable keychain'); } };
    component.serviceAnnouncements = { showAfterLogin: async () => {} };
    component.navigatorSetup = { showAfterLogin: async () => {} };
    component.notificationNavigation = { consumePendingOrNavigate: jasmine.createSpy('navigate').and.resolveTo() };
    void component.loginFunction('fittizio@example.test', 'test-only'); flushMicrotasks();
    expect(component.biometricAvailable).toBeFalse();
    expect(component.notificationNavigation.consumePendingOrNavigate).toHaveBeenCalledOnceWith('/homeAdmin');
  }));
});
