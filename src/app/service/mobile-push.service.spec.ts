import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Capacitor } from '@capacitor/core';
import { MobilePushService, mobilePushNative } from './mobile-push.service';
import { TenantService } from './tenant.service';
import { NotificationNavigationService } from './notification-navigation.service';
import { InspectionAlarmSyncService } from './inspection-alarm-sync.service';
import { AgendaWidgetService } from './agenda-widget.service';

describe('MobilePushService company registrations', () => {
  let service: MobilePushService, http: HttpTestingController;
  let company: any, callbacks: Record<string, (value: any) => void>;
  const enabled = { features: ['notifications'], permissions: { available: ['NOTIFICATIONS_VIEW'] } };
  beforeEach(() => {
    company = { tenant: 'push-a', selectedCompanyServerUrl: null };
    callbacks = {};
    spyOn(Capacitor, 'getPlatform').and.returnValue('ios');
    spyOn(mobilePushNative, 'removeListeners').and.resolveTo();
    spyOn(mobilePushNative, 'on').and.callFake((event: any, listener: any) => {
      callbacks[event] = listener; return Promise.resolve({ remove: async () => {} });
    });
    spyOn(mobilePushNative, 'requestPermissions').and.resolveTo({ receive: 'granted' });
    spyOn(mobilePushNative, 'register').and.resolveTo();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [
      MobilePushService, { provide: TenantService, useValue: company },
      { provide: NotificationNavigationService, useValue: { navigateFromPayload: async () => true, navigatePendingIfAny: async () => false } },
      { provide: InspectionAlarmSyncService, useValue: { setToken: () => {}, syncSoon: async () => {}, clearAll: async () => {} } },
      { provide: AgendaWidgetService, useValue: { initialize: async () => {}, clear: () => {}, refresh: async () => {} } },
    ] });
    http = TestBed.inject(HttpTestingController); service = TestBed.inject(MobilePushService);
  });
  afterEach(() => http.verify());
  function configuration() { return http.expectOne(request => request.url.endsWith('tenant/config?refresh=true')); }
  async function login(token: string, config = enabled) {
    const pending = service.initAfterLogin(token, ['NOTIFICATIONS_VIEW']);
    configuration().flush(config); await pending;
  }
  function registered(tenant: string, jwt: string, token = 'shared-native-token') {
    callbacks['registration']({ value: token });
    const request = http.expectOne(request => request.url.endsWith('admin/notifications/devices/register'));
    expect(request.request.headers.get('X-Tenant-Id')).toBe(tenant);
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${jwt}`);
    expect(request.request.body.push_token).toBe(token); request.flush({ ok: true });
  }
  it('registers the same device for A and B even when listeners were already initialized', async () => {
    await login('jwt-a'); registered('push-a', 'jwt-a');
    const oldCallback = callbacks['registration'];
    company.tenant = 'push-b'; await login('jwt-b'); registered('push-b', 'jwt-b');
    oldCallback({ value: 'late-a-token' });
    http.expectNone(request => request.url.endsWith('devices/register'));
  });
  it('does not register an old login after a later company configuration finishes first', async () => {
    const first = service.initAfterLogin('jwt-a', ['NOTIFICATIONS_VIEW']);
    const requestA = configuration();
    company.tenant = 'push-b';
    const second = service.initAfterLogin('jwt-b', ['NOTIFICATIONS_VIEW']);
    configuration().flush(enabled); await second;
    requestA.flush(enabled); await first;
    expect(mobilePushNative.register).toHaveBeenCalledTimes(1);
    registered('push-b', 'jwt-b');
  });
  it('keeps refreshed native token callbacks valid across repeated initialization of the same session', async () => {
    await login('jwt-a'); registered('push-a', 'jwt-a');
    await login('jwt-a');
    registered('push-a', 'jwt-a', 'refreshed-native-token');
    expect(mobilePushNative.register).toHaveBeenCalledTimes(1);
  });
  it('ignores late registration callbacks after logout', async () => {
    await login('jwt-a'); service.reset();
    callbacks['registration']({ value: 'late-token' });
    expect(http.match(request => request.url.endsWith('devices/register')).length).toBe(0);
  });
  it('respects the company feature and never registers a disabled company', async () => {
    await login('jwt-a', { features: [], permissions: { available: ['NOTIFICATIONS_VIEW'] } });
    expect(mobilePushNative.register).not.toHaveBeenCalled();
    http.expectNone(request => request.url.endsWith('devices/register'));
  });
  it('handles Android refresh tokens once and binds later refreshes to the current company', async () => {
    (Capacitor.getPlatform as jasmine.Spy).and.returnValue('android');
    let refresh!: (event: { token: string }) => void;
    spyOn(mobilePushNative, 'onFirebaseToken').and.callFake(async listener => {
      refresh = listener; return { remove: async () => {} };
    });
    spyOn(mobilePushNative, 'requestFirebasePermissions').and.resolveTo({ receive: 'granted' });
    spyOn(mobilePushNative, 'getFirebaseToken').and.resolveTo({ token: 'android-token' });
    await login('jwt-a');
    const initial = http.expectOne(request => request.url.endsWith('devices/register'));
    refresh({ token: 'android-token' });
    http.expectNone(request => request.url.endsWith('devices/register'));
    initial.flush({ ok: true });
    company.tenant = 'push-b'; await login('jwt-b');
    http.expectOne(request => request.url.endsWith('devices/register')).flush({ ok: true });
    refresh({ token: 'android-refreshed-token' });
    const refreshed = http.expectOne(request => request.url.endsWith('devices/register'));
    expect(refreshed.request.headers.get('X-Tenant-Id')).toBe('push-b');
    expect(refreshed.request.headers.get('Authorization')).toBe('Bearer jwt-b');
    refreshed.flush({ ok: true });
    expect(mobilePushNative.onFirebaseToken).toHaveBeenCalledTimes(1);
    service.reset(); refresh({ token: 'after-logout' });
    http.expectNone(request => request.url.endsWith('devices/register'));
  });
});
