import { Injector } from '@angular/core';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { NotificationNavigationService } from './notification-navigation.service';

describe('NotificationNavigationService company isolation', () => {
  let router: jasmine.SpyObj<Router>;
  let auth: any;
  let service: NotificationNavigationService;
  const key = 'pendingNotificationRoute';
  const token = (tenantId: string) => `${btoa('{}')}.${btoa(JSON.stringify({ tenantId }))}.test`;
  beforeEach(async () => {
    await Preferences.remove({ key });
    router = jasmine.createSpyObj('Router', ['navigateByUrl']);
    router.navigateByUrl.and.resolveTo(true);
    auth = { token: token('push-b'), getTokenRemainingTime: () => 60000,
      logout: jasmine.createSpy('logout').and.callFake(() => { auth.token = null; }) };
    service = new NotificationNavigationService(router, { get: () => auth } as unknown as Injector);
  });
  afterEach(async () => { await Preferences.remove({ key }); });

  it('requires login to the notified company and consumes its route only after that login', async () => {
    await service.navigateFromPayload({ notification: { data: { tenantId: 'push-a', route: '/calendar?appointmentId=1' } } });
    expect(auth.logout).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true });
    expect(await service.getPendingTenantId()).toBe('push-a');
    auth.token = token('push-b');
    await service.consumePendingOrNavigate();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/homeAdmin', { replaceUrl: true });
    expect(await service.getPendingTenantId()).toBe('push-a');
    auth.token = token('push-a');
    await service.consumePendingOrNavigate();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/calendarHome?appointmentId=1', { replaceUrl: true });
    expect(await service.getPendingTenantId()).toBeNull();
  });
  it('opens a notification directly only within its current authenticated company', async () => {
    await service.navigateFromPayload({ notification: { data: { tenantId: 'push-b', route: '/homeAdmin' } } });
    expect(router.navigateByUrl).toHaveBeenCalledOnceWith('/homeAdmin');
    expect(auth.logout).not.toHaveBeenCalled();
  });
  it('retains a notification until a new session exists when authentication has expired', async () => {
    auth.getTokenRemainingTime = () => 0;
    await service.navigateFromPayload({ data: { tenantId: 'push-b', route: '/homeAdmin' } });
    expect(auth.logout).toHaveBeenCalled();
    expect(await service.navigatePendingIfAny()).toBeFalse();
    expect(await service.getPendingTenantId()).toBe('push-b');
  });
  it('rejects malformed company IDs and native notifications with no company', async () => {
    expect(await service.navigateFromPayload({ notification: { data: { tenantId: '../push-a', route: '/homeAdmin' } } })).toBeFalse();
    expect(await service.navigateFromPayload({ notification: { data: { route: '/homeAdmin' } } })).toBeFalse();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
  it('migrates old unscoped pending links by discarding them rather than opening another company', async () => {
    await Preferences.set({ key, value: '/calendar?appointmentId=1' });
    expect(await service.navigatePendingIfAny()).toBeFalse();
    expect((await Preferences.get({ key })).value).toBeNull();
  });
  it('binds local widget links to the current authenticated company', async () => {
    await service.saveFromPayload({ route: '/calendarHome?widgetAccount=push-b%3A1' });
    expect(await service.getPendingTenantId()).toBe('push-b');
    expect(await service.navigatePendingIfAny()).toBeTrue();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/calendarHome?widgetAccount=push-b%3A1', { replaceUrl: true });
  });
});
