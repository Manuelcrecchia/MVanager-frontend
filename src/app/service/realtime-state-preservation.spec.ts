import { fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { EmailHomeComponent } from '../admin/email-home/email-home.component';
import { DeadlinesManagementComponent } from '../admin/deadlines-management/deadlines-management.component';
import { DocumentManagerComponent } from '../admin/document-manager/document-manager.component';
import { InternalDocumentsComponent } from '../admin/internal-documents/internal-documents.component';
import { InternalWarehouseComponent } from '../admin/internal-warehouse/internal-warehouse.component';
import { InvoicesComponent } from '../admin/invoices/invoices.component';
import { RiepilogoPresenzeEditabileComponent } from '../admin/riepilogo-presenze-editabile/riepilogo-presenze-editabile.component';

describe('Realtime state preservation', () => {
  it('keeps attendance intact until all reads finish and rejects a response after a local edit', fakeAsync(() => {
    const component: any = Object.create(RiepilogoPresenzeEditabileComponent.prototype);
    const requests: Subject<any>[] = [];
    const employees = [{ id: 8, note: 'original' }];
    Object.assign(component, {
      globalService: { url: '' }, http: { get: () => { const r = new Subject<any>(); requests.push(r); return r; } },
      meseSelezionato: '10', annoSelezionato: '2026', showArchived: false, giorni: [],
      dipendenti: employees, dipendentiSelezionati: new Set([8]), pendingSaves: 0, pendingNotes: new Set(),
      generaGiorni: () => undefined,
    });
    let result: any;
    component.caricaPresenze(true).then((value: any) => result = value);
    requests[0].next({ dipendenti: [] }); requests[0].complete(); flushMicrotasks();
    expect(component.dipendenti).toBe(employees);
    requests[1].next([]); requests[1].complete(); flushMicrotasks();
    employees[0].note = 'new unsaved note';
    requests[2].next([]); requests[2].complete(); flushMicrotasks();
    expect(result).toBeFalse();
    expect(component.dipendenti).toBe(employees);
    expect(component.dipendentiSelezionati.has(8)).toBeTrue();
  }));
  it('keeps an open email and compose draft while replacing a paginated list atomically', fakeAsync(() => {
    const component: any = Object.create(EmailHomeComponent.prototype);
    const requests: Subject<any>[] = [];
    const open = { id: 99, bodyHtml: 'reading' };
    const draft = { subject: 'unsent' };
    Object.assign(component, {
      globalService: { url: '' },
      http: { get: () => { const response = new Subject<any>(); requests.push(response); return response; } },
      messageLoadToken: 0, messagePageSize: 1, messageSearchQuery: 'rossi',
      selectedAccountId: 1, selectedFolder: 'inbox', messages: [open],
      selectedMessage: open, compose: draft, loading: false,
    });
    component.loadMessages(true);
    expect(component.messages).toEqual([open]);
    expect(component.loading).toBeFalse();
    requests[0].next({ items: [{ id: 1 }], total: 2, hasMore: true });
    expect(component.messages).toEqual([open]);
    tick(80);
    requests[1].next({ items: [{ id: 2 }], total: 2, hasMore: false });
    expect(component.messages.map((m: any) => m.id)).toEqual([1, 2]);
    expect(component.selectedMessage).toBe(open);
    expect(component.compose).toBe(draft);
    expect(component.messageSearchQuery).toBe('rossi');
  }));

  it('discards an email response superseded by a folder change', () => {
    const component: any = Object.create(EmailHomeComponent.prototype);
    const requests: Subject<any>[] = [];
    Object.assign(component, {
      globalService: { url: '' }, http: { get: () => { const r = new Subject<any>(); requests.push(r); return r; } },
      messageLoadToken: 0, messagePageSize: 50, messageSearchQuery: '', selectedFolder: 'inbox', messages: [],
    });
    component.loadMessages(true);
    component.selectFolder('sent');
    requests[1].next([{ id: 2 }]);
    requests[0].next([{ id: 1 }]);
    expect(component.messages).toEqual([{ id: 2 }]);
  });

  it('refreshes deadlines without invoking the selection-resetting initializer', () => {
    const component: any = Object.create(DeadlinesManagementComponent.prototype);
    const selection = new Set([8]);
    Object.assign(component, { kind: 'employee', selectedIds: selection,
      loadAll: jasmine.createSpy(), loadEntities: jasmine.createSpy(), loadDeadlines: jasmine.createSpy() });
    component.refreshRealtimeData();
    expect(component.loadAll).not.toHaveBeenCalled();
    expect(component.loadDeadlines).toHaveBeenCalled();
    expect(component.selectedIds).toBe(selection);
  });

  for (const type of [DocumentManagerComponent, InternalDocumentsComponent]) {
    it(type.name + ' retains the document viewer during directory updates', () => {
      const component: any = Object.create(type.prototype);
      Object.assign(component, { currentFilename: 'open.pdf', selectedFolder: 'contracts',
        refreshDirectory: jasmine.createSpy(), loadFolders: jasmine.createSpy(), loadFiles: jasmine.createSpy() });
      component.refreshRealtimeData();
      expect(component.refreshDirectory).not.toHaveBeenCalled();
      expect(component.currentFilename).toBe('open.pdf');
      expect(component.selectedFolder).toBe('contracts');
    });
  }

  it('does not hydrate the product editor during a warehouse update', () => {
    const component: any = Object.create(InternalWarehouseComponent.prototype);
    Object.assign(component, { activeTab: 'products', loadProducts: jasmine.createSpy(),
      loadSummary: jasmine.createSpy(), loadProductRequests: jasmine.createSpy() });
    component.refreshRealtimeData();
    expect(component.loadProducts).toHaveBeenCalledOnceWith(true);
  });

  it('does not replace invoice settings being edited', () => {
    const component: any = Object.create(InvoicesComponent.prototype);
    Object.assign(component, { activeView: 'settings', loadActiveViewData: jasmine.createSpy() });
    component.refreshRealtimeData();
    expect(component.loadActiveViewData).not.toHaveBeenCalled();
  });
});
