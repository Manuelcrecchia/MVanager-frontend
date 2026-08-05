import {
  adminRouteRequiresRealtimeConfirmation,
  adminRouteUsesResource,
  RealtimeSyncService,
} from './realtime-sync.service';
import { BehaviorSubject } from 'rxjs';

describe('RealtimeSyncService route matching', () => {
  it('refreshes the dashboard for every changed resource', () => {
    expect(adminRouteUsesResource('/homeAdmin', 'appointments')).toBeTrue();
    expect(adminRouteUsesResource('/homeAdmin', 'invoices')).toBeTrue();
  });

  it('matches the main realtime areas', () => {
    expect(adminRouteUsesResource('/homeAdmin/calendarHome', 'appointments')).toBeTrue();
    expect(adminRouteUsesResource('/homeAdmin/listCustomer', 'customers')).toBeTrue();
    expect(adminRouteUsesResource('/homeAdmin/quotesHome', 'quotes')).toBeTrue();
    expect(adminRouteUsesResource('/homeAdmin/gestionepermessi', 'leave_requests')).toBeTrue();
    expect(adminRouteUsesResource('/homeAdmin/invoices', 'invoices')).toBeTrue();
    expect(adminRouteUsesResource('/homeAdmin/accounting', 'invoices')).toBeTrue();
    expect(adminRouteUsesResource('/homeAdmin/service-orders', 'service_orders')).toBeTrue();
    expect(adminRouteUsesResource('/homeAdmin/customer-assets', 'deadlines')).toBeTrue();
    expect(adminRouteUsesResource('/homeAdmin/internal-warehouse', 'internal_warehouse')).toBeTrue();
  });

  it('does not confuse the homeAdmin shell with an admins change', () => {
    expect(adminRouteUsesResource('/homeAdmin/invoices', 'admins')).toBeFalse();
    expect(adminRouteUsesResource('/homeAdmin/gestioneusers', 'admins')).toBeTrue();
  });

  it('delegates customer-list changes to its silent granular refresh', () => {
    const service = Object.create(RealtimeSyncService.prototype) as RealtimeSyncService;
    (service as any).router = { url: '/homeAdmin/listCustomer' };

    expect((service as any).hasGranularHandler({
      tenantId: 'sami',
      resource: 'customers',
      action: 'archived',
    })).toBeTrue();
  });

  it('aggiorna silenziosamente tutte le schermate di consultazione anche con filtri attivi', () => {
    expect(adminRouteRequiresRealtimeConfirmation('/homeAdmin/listCustomer')).toBeFalse();
    expect(adminRouteRequiresRealtimeConfirmation('/homeAdmin/invoices?search=rossi')).toBeFalse();
    expect(adminRouteRequiresRealtimeConfirmation('/homeAdmin/calendarHome')).toBeFalse();
    expect(adminRouteRequiresRealtimeConfirmation('/homeAdmin/internal-warehouse')).toBeFalse();
  });

  it('mostra la conferma solo sulle schermate che possono contenere modifiche non salvate', () => {
    expect(adminRouteRequiresRealtimeConfirmation('/homeAdmin/customer/edit/42')).toBeTrue();
    expect(adminRouteRequiresRealtimeConfirmation('/homeAdmin/invoices/new')).toBeTrue();
    expect(adminRouteRequiresRealtimeConfirmation('/homeAdmin/shifts/create')).toBeTrue();
    expect(adminRouteRequiresRealtimeConfirmation('/homeAdmin/settings')).toBeTrue();
  });

  it('su una lista pianifica il refresh e non pubblica un aggiornamento pendente', () => {
    const service = Object.create(RealtimeSyncService.prototype) as RealtimeSyncService;
    const pending = new BehaviorSubject<any>(null);
    const schedule = jasmine.createSpy('scheduleCurrentRouteRefresh');
    Object.assign(service as any, {
      router: { url: '/homeAdmin/invoices' },
      pendingChange$: pending,
      currentRouteUses: () => true,
      hasGranularHandler: () => false,
      isEditingRoute: () => false,
      scheduleCurrentRouteRefresh: schedule,
    });

    (service as any).handleChange({ tenantId: 'sami', resource: 'invoices', action: 'updated' });

    expect(schedule).toHaveBeenCalledWith(250);
    expect(pending.value).toBeNull();
  });

  it('su una scheda di modifica non forza il refresh e protegge i dati inseriti', () => {
    const service = Object.create(RealtimeSyncService.prototype) as RealtimeSyncService;
    const pending = new BehaviorSubject<any>(null);
    const schedule = jasmine.createSpy('scheduleCurrentRouteRefresh');
    Object.assign(service as any, {
      router: { url: '/homeAdmin/customer/edit/42' },
      pendingChange$: pending,
      currentRouteUses: () => true,
      hasGranularHandler: () => false,
      isEditingRoute: () => true,
      scheduleCurrentRouteRefresh: schedule,
    });
    const change = { tenantId: 'sami', resource: 'customers', action: 'updated' };

    (service as any).handleChange(change);

    expect(schedule).not.toHaveBeenCalled();
    expect(pending.value).toEqual(change);
  });

  it('distingue i filtri dai controlli di un modulo di modifica', () => {
    const service = Object.create(RealtimeSyncService.prototype) as RealtimeSyncService;
    const search = document.createElement('input');
    search.type = 'search';
    const filter = document.createElement('select');
    const form = document.createElement('form');
    const editor = document.createElement('input');
    form.appendChild(editor);
    document.body.append(search, filter, form);

    try {
      search.focus();
      expect((service as any).hasFocusedEditorControl()).toBeFalse();
      filter.focus();
      expect((service as any).hasFocusedEditorControl()).toBeFalse();
      editor.focus();
      expect((service as any).hasFocusedEditorControl()).toBeTrue();
    } finally {
      search.remove();
      filter.remove();
      form.remove();
    }
  });
});
