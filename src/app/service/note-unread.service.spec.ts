import { discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { NoteUnreadService } from './note-unread.service';
import { RealtimeConnectionState, ResourceChange } from './soket.service';

describe('NoteUnreadService realtime recovery', () => {
  it('refreshes after note events, reconnects and the safety interval', fakeAsync(() => {
    const resourceChanges = new Subject<ResourceChange>();
    const connectionStates = new Subject<RealtimeConnectionState>();
    const http = {
      get: jasmine.createSpy('get').and.returnValue(of({ total: 0, byType: {} })),
      post: jasmine.createSpy('post').and.returnValue(of({ ok: true })),
    };
    const socket = {
      onResourceChanged: () => resourceChanges,
      onConnectionState: () => connectionStates,
    };
    const service = new NoteUnreadService(
      http as any,
      { token: 'token', url: 'http://api/', headers: {} } as any,
      socket as any,
      { tenant: 'sami' } as any,
    );

    service.start();
    expect(http.get).toHaveBeenCalledTimes(1);

    resourceChanges.next({ tenantId: 'sami', resource: 'customer_notes', action: 'created' });
    tick(150);
    expect(http.get).toHaveBeenCalledTimes(2);

    connectionStates.next({
      connected: true,
      reconnected: true,
      recovered: false,
      changedAt: new Date().toISOString(),
    });
    tick(0);
    expect(http.get).toHaveBeenCalledTimes(3);

    tick(60_000);
    expect(http.get).toHaveBeenCalledTimes(4);
    discardPeriodicTasks();
  }));
});
