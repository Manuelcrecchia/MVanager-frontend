import { AppComponent, calendarDayDifference } from './app.component';
import { Capacitor } from '@capacitor/core';

describe('AppComponent', () => {
  it('should be exported', () => {
    expect(AppComponent).toBeTruthy();
  });

  it('recognizes both the admin home and its embedded child routes', () => {
    const component = Object.create(AppComponent.prototype) as AppComponent;
    (component as any).router = { url: '/homeAdmin/customer-asset-deadlines?month=2026-07' };

    expect(component.isAdminShellRoute()).toBeTrue();

    (component as any).router.url = '/customer-asset-deadlines';
    expect(component.isAdminShellRoute()).toBeFalse();
  });

  it('counts calendar dates without turning tomorrow into two days', () => {
    expect(calendarDayDifference('2026-08-03', '2026-08-04')).toBe(1);
    expect(calendarDayDifference('2026-08-03', '2026-07-31')).toBe(-3);
  });
  it('keeps the exact occurrence when opening a widget for the signed-in account', async () => {
    const component: any = Object.create(AppComponent.prototype);
    const token = 'header.' + btoa(JSON.stringify({ tenantId: 'alpha', id: 1 })) + '.signature';
    component.globalService = { token }; component.sessionUnlocked = true;
    component.notificationNavigation = { saveFromPayload: jasmine.createSpy('save').and.resolveTo(), navigatePendingIfAny: jasmine.createSpy('navigate').and.resolveTo(true) };
    await component.handleWidgetUrl('mvanager://agenda?account=alpha%3A1&appointmentId=f%3Abeta%3A7&occurrenceStart=2026-11-01T09%3A00%3A00.000Z');
    const route = component.notificationNavigation.saveFromPayload.calls.mostRecent().args[0].route;
    const params = new URL(route, 'https://example.test').searchParams;
    expect(params.get('appointmentId')).toBe('f:beta:7'); expect(params.get('occurrenceStart')).toBe('2026-11-01T09:00:00.000Z');
    expect(params.get('widgetAccount')).toBe('alpha:1');
  });
  it('an old widget never opens an event in the next user account', async () => {
    const component: any = Object.create(AppComponent.prototype);
    component.globalService = { token: 'header.' + btoa(JSON.stringify({ tenantId: 'alpha', id: 2 })) + '.signature' };
    component.notificationNavigation = { saveFromPayload: jasmine.createSpy('save').and.resolveTo() };
    await component.handleWidgetUrl('mvanager://agenda?account=alpha%3A1&appointmentId=7&newEvent=1');
    expect(component.notificationNavigation.saveFromPayload).toHaveBeenCalledWith({ route: '/calendarHome' });
  });
  it('offers navigator setup when biometrics unlock a remembered session after an app update', async () => {
    spyOn(Capacitor, 'getPlatform').and.returnValue('ios');
    const component: any = Object.create(AppComponent.prototype);
    component.globalService = { token: 'remembered-session', loadTenantConfig: async () => ({}) };
    component.authService = { isBiometricAutoLoginSuppressed: () => false, initializePostLoginServices: () => {} };
    component.biometricService = { verifyIdentity: async () => true };
    component.inspectionAlarmSync = { setToken: () => {}, syncSoon: async () => {} };
    component.serviceAnnouncements = { showAfterLogin: async () => {} };
    component.navigatorSetup = { showAfterLogin: jasmine.createSpy('setup').and.resolveTo() };
    component.notificationNavigation = { navigatePendingIfAny: async () => false };
    component.router = { url: '/', navigateByUrl: jasmine.createSpy('navigate').and.resolveTo(true) };
    await component.unlockExistingSessionWithBiometrics('startup');
    expect(component.navigatorSetup.showAfterLogin).toHaveBeenCalledTimes(1);
    expect(component.router.navigateByUrl).toHaveBeenCalledWith('/homeAdmin', { replaceUrl: true });
  });
});
