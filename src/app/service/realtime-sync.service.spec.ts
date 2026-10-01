import { fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { RealtimeSyncService } from './realtime-sync.service';
import { getRealtimeClientId } from './realtime-client-id';

describe('RealtimeSyncService in-place updates', () => {
  let service: any;
  let child: any;
  let shell: any;
  let router: any;
  const context = (view: any, children?: any): any => ({
    getContext: () => view ? { outlet: { isActivated: true, component: view }, children: children || { getContext: () => null } } : null,
  });
  beforeEach(() => {
    child = { realtimeResources: ['quotes', 'customers'], refreshRealtimeData: jasmine.createSpy('child') };
    shell = { realtimeResources: ['quotes'], refreshRealtimeData: jasmine.createSpy('shell') };
    router = { navigateByUrl: jasmine.createSpy('navigate'), navigate: jasmine.createSpy('navigate') };
    service = new RealtimeSyncService(router, {} as any, { token: 'token' } as any, {} as any, {} as any, context(shell, context(child)));
  });
  it('coalesces different resources without losing a refresh or navigating', fakeAsync(() => {
    service.handleChange({ resource: 'quotes' });
    service.handleChange({ resource: 'customers' });
    tick(120); flushMicrotasks();
    expect(child.refreshRealtimeData).toHaveBeenCalledTimes(1);
    expect(shell.refreshRealtimeData).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  }));
  it('handles standalone/mobile outlets without depending on URL spelling', fakeAsync(() => {
    service.outletContexts = context(child);
    service.handleChange({ resource: 'customers' });
    tick(120);
    expect(child.refreshRealtimeData).toHaveBeenCalledTimes(1);
  }));
  it('does not refresh unrelated resources or echo this client', fakeAsync(() => {
    service.handleChange({ resource: 'invoices' });
    service.handleChange({ resource: 'quotes', originClientId: getRealtimeClientId() });
    tick(120);
    expect(child.refreshRealtimeData).not.toHaveBeenCalled();
  }));
  it('drops pending work for destroyed components', fakeAsync(() => {
    service.handleChange({ resource: 'quotes' });
    service.outletContexts = context(null);
    tick(120);
    expect(child.refreshRealtimeData).not.toHaveBeenCalled();
  }));
  it('retries a busy editor without losing the invalidation', fakeAsync(() => {
    child.refreshRealtimeData.and.returnValues(false, undefined);
    service.handleChange({ resource: 'customers' });
    tick(120); flushMicrotasks();
    tick(1000); flushMicrotasks();
    expect(child.refreshRealtimeData).toHaveBeenCalledTimes(2);
  }));
  it('does not duplicate local handlers but includes them in recovery', fakeAsync(() => {
    child.realtimeHandledLocally = true;
    service.handleChange({ resource: 'customers' });
    tick(120);
    expect(child.refreshRealtimeData).not.toHaveBeenCalled();
    service.handleConnectionState({ connected: true, reconnected: true, recovered: false });
    tick(120); flushMicrotasks();
    expect(child.refreshRealtimeData).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  }));
  it('does not restart the timer indefinitely under continuous events', fakeAsync(() => {
    service.handleChange({ resource: 'customers' });
    tick(100);
    service.handleChange({ resource: 'customers' });
    tick(20); flushMicrotasks();
    expect(child.refreshRealtimeData).toHaveBeenCalledTimes(1);
  }));
});
