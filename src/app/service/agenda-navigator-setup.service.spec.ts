import { Subject } from 'rxjs';
import { AgendaNavigatorSetupService } from './agenda-navigator-setup.service';

describe('AgendaNavigatorSetupService', () => {
  let service: AgendaNavigatorSetupService;
  let auth: any;
  let widget: any;
  let dialog: any;
  let closed: Subject<boolean>;
  beforeEach(() => {
    auth = { token: 'signed-in', permissions: ['CALENDAR_VIEW'] };
    widget = { navigationAvailable: true, getNavigationPreferences: jasmine.createSpy('preferences').and.resolveTo({
      available: [{ id: 'google', label: 'Google Maps' }], preferred: '', selected: '',
    }) };
    closed = new Subject<boolean>();
    dialog = { open: jasmine.createSpy('open').and.returnValue({ afterClosed: () => closed }) };
    service = new AgendaNavigatorSetupService(widget, auth, dialog);
  });
  it('asks on an existing installation when no native choice is saved and coalesces simultaneous login paths', async () => {
    const first = service.showAfterLogin();
    const second = service.showAfterLogin();
    await Promise.resolve();
    expect(first).toBe(second);
    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialog.open.calls.mostRecent().args[1].data.available[0].id).toBe('google');
    closed.next(true);
    await first;
    widget.getNavigationPreferences.and.resolveTo({ available: [{ id: 'google' }], preferred: 'google', selected: 'google' });
    auth.token = 'another-login-or-company';
    await service.showAfterLogin();
    expect(dialog.open).toHaveBeenCalledTimes(1);
  });
  it('does not mark a deferred choice as saved and asks on the next login', async () => {
    const first = service.showAfterLogin(); await Promise.resolve(); closed.next(false); await first;
    auth.token = 'next-login';
    const next = service.showAfterLogin(); await Promise.resolve();
    expect(dialog.open).toHaveBeenCalledTimes(2);
    closed.next(false); await next;
  });
  it('does not prompt on Android/web, before login or without calendar access', async () => {
    widget.navigationAvailable = false;
    await service.showAfterLogin();
    widget.navigationAvailable = true; auth.token = '';
    await service.showAfterLogin();
    auth.token = 'signed-in'; auth.permissions = [];
    await service.showAfterLogin();
    expect(widget.getNavigationPreferences).not.toHaveBeenCalled();
    expect(dialog.open).not.toHaveBeenCalled();
  });
  it('does not show a stale prompt after logout while native preferences are loading', async () => {
    let resolve!: (value: any) => void;
    widget.getNavigationPreferences.and.returnValue(new Promise(r => resolve = r));
    const task = service.showAfterLogin();
    auth.token = '';
    resolve({ available: [{ id: 'apple' }], selected: '' });
    await task;
    expect(dialog.open).not.toHaveBeenCalled();
  });
  it('allows login to continue after a native failure and retries next time', async () => {
    spyOn(console, 'warn');
    widget.getNavigationPreferences.and.rejectWith(new Error('Native unavailable'));
    await service.showAfterLogin();
    widget.getNavigationPreferences.and.resolveTo({ available: [{ id: 'waze' }], selected: '' });
    const retry = service.showAfterLogin(); await Promise.resolve();
    expect(dialog.open).toHaveBeenCalledTimes(1);
    closed.next(true); await retry;
  });
});
