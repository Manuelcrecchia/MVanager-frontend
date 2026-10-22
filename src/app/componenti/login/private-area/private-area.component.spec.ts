import { PrivateAreaComponent } from './private-area.component';
import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpHeaders } from '@angular/common/http';
import { of } from 'rxjs';

describe('PrivateAreaComponent', () => {
  it('should be exported', () => {
    expect(PrivateAreaComponent).toBeTruthy();
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
});
