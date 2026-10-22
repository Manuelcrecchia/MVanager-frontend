import { fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AgendaWidgetService } from './agenda-widget.service';
import { TenantService } from './tenant.service';

describe('AgendaWidgetService native session', () => {
  let service: AgendaWidgetService;
  let http: HttpTestingController;
  let native: any;
  const token = 'header.' + btoa(JSON.stringify({ id: 1, tenantId: 'widget-test' })) + '.signature';
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [
      { provide: TenantService, useValue: { tenant: 'widget-test', selectedCompanyServerUrl: 'https://example.test/' } },
    ] });
    service = TestBed.inject(AgendaWidgetService); http = TestBed.inject(HttpTestingController);
    native = { configure: jasmine.createSpy('configure').and.resolveTo(), clear: jasmine.createSpy('clear').and.resolveTo(),
      refresh: jasmine.createSpy('refresh').and.resolveTo({ state: 'updated', updatedAt: '2026-10-21T09:00:00Z', eventCount: 1 }) };
    Object.assign(service, { available: true, native });
    spyOn(service as any, 'deviceId').and.resolveTo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    spyOn(service, 'getPreferences').and.resolveTo({ enabled: true, group: 'all', private: true, hiddenTenantIds: [] });
  });
  afterEach(() => http.verify());
  it('gives native code only a widget credential, never the app JWT', fakeAsync(() => {
    let completed = false;
    void service.initialize(token, ['CALENDAR_VIEW']).then(() => completed = true); flushMicrotasks();
    const request = http.expectOne(r => r.url.endsWith('/appointments/widget/session'));
    expect(request.request.headers.get('Authorization')).toBe('Bearer ' + token);
    expect(request.request.body.preferences.private).toBeTrue();
    request.flush({ token: 'dedicated-read-only', expiresAt: Date.now() + 10000, sessionId: 'session-one' }); flushMicrotasks();
    expect(native.configure.calls.mostRecent().args[0].token).toBe('dedicated-read-only');
    expect(JSON.stringify(native.configure.calls.allArgs())).not.toContain(token);
    expect(completed).toBeTrue(); expect(native.refresh).toHaveBeenCalled();
  }));
  it('logging out while the server responds never restores widget data', fakeAsync(() => {
    void service.initialize(token, ['CALENDAR_VIEW']); flushMicrotasks();
    const pending = http.expectOne(r => r.url.endsWith('/appointments/widget/session'));
    service.clear(); flushMicrotasks();
    pending.flush({ token: 'late-widget-credential', expiresAt: Date.now() + 10000, sessionId: 'late-session' }); flushMicrotasks();
    const revoke = http.expectOne(r => r.url.endsWith('/appointments/widget/revoke'));
    expect(revoke.request.body.sessionId).toBe('late-session'); revoke.flush({ revoked: true }); flushMicrotasks();
    expect(native.configure).not.toHaveBeenCalled(); expect(native.clear.calls.count()).toBeGreaterThan(1);
  }));
  it('missing calendar permission clears native data without minting credentials', fakeAsync(() => {
    void service.initialize(token, []); flushMicrotasks();
    http.expectNone(r => r.url.endsWith('/appointments/widget/session'));
    http.expectOne(r => r.url.endsWith('/appointments/widget/revoke')).flush({ revoked: true }); flushMicrotasks();
    expect(native.configure).not.toHaveBeenCalled(); expect(native.clear).toHaveBeenCalled();
  }));
  function initialize(): void {
    void service.initialize(token, ['CALENDAR_VIEW']); flushMicrotasks();
    http.expectOne(r => r.url.endsWith('/appointments/widget/session')).flush({ token: 'widget-credential', expiresAt: Date.now() + 10000, sessionId: 'session' });
    flushMicrotasks();
  }
  it('reports downloaded data and does not call an offline response a successful update', fakeAsync(() => {
    initialize();
    expect(service.status.state).toBe('updated'); expect(service.status.eventCount).toBe(1);
    native.refresh.and.resolveTo({ state: 'offline', updatedAt: '2026-10-20T09:00:00Z', eventCount: 0 });
    void service.refresh(true); flushMicrotasks();
    expect(service.status.state).toBe('offline'); expect(service.status.message).toContain('Senza connessione');
  }));
  it('reconnects a lost native session automatically while the user is signed in', fakeAsync(() => {
    initialize();
    native.refresh.and.returnValues(Promise.resolve({ state: 'unconfigured' }), Promise.resolve({ state: 'updated', eventCount: 2 }));
    void service.refresh(true); flushMicrotasks();
    http.expectOne(r => r.url.endsWith('/appointments/widget/session')).flush({ token: 'recovered', expiresAt: Date.now() + 10000, sessionId: 'recovered-session' });
    flushMicrotasks();
    expect(native.configure.calls.mostRecent().args[0].token).toBe('recovered');
    expect(service.status.state).toBe('updated'); expect(service.status.eventCount).toBe(2);
  }));
  it('rechecks after a save if an earlier download was already in progress', fakeAsync(() => {
    initialize();
    let complete!: (value: unknown) => void;
    native.refresh.and.returnValues(new Promise(resolve => complete = resolve), Promise.resolve({ state: 'updated', eventCount: 2 }));
    void service.refresh(true); flushMicrotasks();
    void service.refresh(true); flushMicrotasks();
    complete({ state: 'updated', eventCount: 1 }); flushMicrotasks();
    expect(service.status.eventCount).toBe(2);
  }));
  it('shows missing server support instead of silently leaving an empty widget', fakeAsync(() => {
    void service.initialize(token, ['CALENDAR_VIEW']).catch(() => {}); flushMicrotasks();
    http.expectOne(r => r.url.endsWith('/appointments/widget/session')).flush({}, { status: 404, statusText: 'Not Found' }); flushMicrotasks();
    expect(service.status.state).toBe('error'); expect(service.status.message).toContain('server deve essere aggiornato');
  }));
});
