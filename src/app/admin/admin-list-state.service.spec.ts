import { ViewportScroller } from '@angular/common';
import { fakeAsync, tick } from '@angular/core/testing';
import { NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthServiceService } from '../auth-service.service';
import { AdminListStateService } from './admin-list-state.service';

describe('AdminListStateService', () => {
  let service: AdminListStateService;
  let events: Subject<NavigationStart>;
  let viewport: jasmine.SpyObj<ViewportScroller>;
  let auth: { token: string };

  beforeEach(() => {
    events = new Subject<NavigationStart>();
    viewport = jasmine.createSpyObj<ViewportScroller>('ViewportScroller', ['getScrollPosition', 'scrollToPosition']);
    viewport.getScrollPosition.and.returnValue([0, 620]);
    auth = { token: 'prima-sessione' };
    const router = { events, url: '/homeAdmin/listCustomer', getCurrentNavigation: () => null };
    service = new AdminListStateService(router as unknown as Router, viewport, auth as AuthServiceService);
  });

  it('ripristina ricerca, archivio, ordinamento e scheda aperta prima di riposizionare la lista', fakeAsync(() => {
    const filters = {
      customerSearch: 'rossi', showArchived: true, customerSort: 'numberDesc' as const, openCustomers: new Set(['42']),
    };
    const first = service.connect('customers', () => filters, () => fail('Primo accesso alla lista'));
    events.next(new NavigationStart(1, '/homeAdmin/schedaCliente/42'));
    first.disconnect();
    viewport.getScrollPosition.and.returnValue([0, 0]);

    const applyFilters = jasmine.createSpy('applyFilters');
    const returned = service.connect('customers', () => filters, applyFilters);
    expect(applyFilters).toHaveBeenCalledOnceWith(filters);
    tick(100);
    expect(viewport.scrollToPosition).not.toHaveBeenCalled();

    returned.restoreScroll();
    tick(100);
    expect(viewport.scrollToPosition).toHaveBeenCalledOnceWith([0, 620]);

    returned.restoreScroll();
    tick(100);
    expect(viewport.scrollToPosition).toHaveBeenCalledTimes(1);
    returned.disconnect();
  }));

  it('cancella uno scorrimento programmato quando la lista viene chiusa', fakeAsync(() => {
    const filters = { employeeSearch: 'verdi', showArchived: true, openEmployees: new Set([42]) };
    const first = service.connect('employees', () => filters, () => {});
    events.next(new NavigationStart(1, '/homeAdmin/schedaDipendente/42'));
    first.disconnect();

    const returned = service.connect('employees', () => filters, () => {});
    returned.restoreScroll();
    returned.disconnect();
    tick(100);

    expect(viewport.scrollToPosition).not.toHaveBeenCalled();
  }));

  it('mantiene le liste indipendenti e non riusa i filtri di una sessione precedente', () => {
    const quotes = { quoteSearch: 'rossi', showCompletedQuotes: true, openQuotes: new Set(['21']) };
    const first = service.connect('quotes', () => quotes, () => {});
    events.next(new NavigationStart(1, '/view-pdf?numeroPreventivo=21'));
    first.disconnect();

    const employees = { employeeSearch: '', showArchived: false, openEmployees: new Set<number>() };
    const applyFilters = jasmine.createSpy('applyFilters');
    const otherList = service.connect('employees', () => employees, applyFilters);
    expect(applyFilters).not.toHaveBeenCalled();
    otherList.disconnect();

    auth.token = 'seconda-sessione';
    const newSession = service.connect('quotes', () => quotes, applyFilters);
    expect(applyFilters).not.toHaveBeenCalled();
    newSession.disconnect();
  });
});
