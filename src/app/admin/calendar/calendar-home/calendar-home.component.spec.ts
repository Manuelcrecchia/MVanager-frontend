import { TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { AutomaticAddInspectionToCalendarService } from '../../../service/automatic-add-inspection-to-calendar.service';
import { PopupServiceService } from '../../../componenti/popup/popup-service.service';
import { TenantService } from '../../../service/tenant.service';
import { InspectionAlarmSyncService } from '../../../service/inspection-alarm-sync.service';
import { AgendaWidgetService } from '../../../service/agenda-widget.service';
import { EMPTY, of } from 'rxjs';
import { calendarDirectionsUrl, calendarPhoneUrl } from './calendar-contact-links';
import { GlobalService } from '../../../service/global.service';
import { CalendarHomeComponent } from './calendar-home.component';

describe('CalendarHomeComponent', () => {
  it('should be exported', () => {
    expect(CalendarHomeComponent).toBeTruthy();
  });

  it('loads the calendar without requesting unavailable modules', () => {
    const requests: string[] = [];
    const grants = new Set<string>();
    const component = new CalendarHomeComponent(
      { get: (url: string) => { requests.push(url); return of('[]'); } } as any,
      { url: '/', hasPermission: (key: string) => grants.has(key) } as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    spyOn(component, 'buildGrid');
    component.clientiArray = [{ numeroCliente: 'old' }];
    component.nPreventiviArray = ['old'];
    component.adminOptions = [{ id: 1, nome: 'Old', cognome: '', email: '' }];
    (component as any).quotesMap.set('old', {});

    component.loadAll();

    expect(requests).toEqual(['/appointments/getAll']);
    expect(component.clientiArray).toEqual([]);
    expect(component.nPreventiviArray).toEqual([]);
    expect(component.adminOptions).toEqual([]);
    expect((component as any).quotesMap.size).toBe(0);
    expect(component.buildGrid).toHaveBeenCalled();

    for (const permission of ['QUOTES_VIEW', 'CUSTOMERS_VIEW', 'ADMIN_VIEW']) {
      grants.add(permission);
    }
    requests.length = 0;
    component.loadAll();
    expect(requests).toEqual([
      '/appointments/getAll', '/quotes/getAll', '/customers/getAll', '/admin/getAll',
    ]);
  });

  it('keeps every timed event visible when the filter is set to all', () => {
    const component = new CalendarHomeComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const events = Array.from({ length: 7 }, (_, id) => ({ id })) as any[];
    const cell = { events } as any;

    expect(component.getTimedEvents(cell)).toBe(events);
    expect(component.getTimedEvents(cell).length).toBe(7);
  });

  it('uses the selected customer work duration when the start changes', () => {
    const globalService = {
      getRecordValueByRole: (
        _scope: string,
        customer: any,
        role: string,
      ) => role === 'customerWorkDurationMinutes'
        ? customer.durataLavoroMinuti
        : null,
    };
    const component = new CalendarHomeComponent(
      {} as any,
      globalService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    component.categories = [{
      id: 'ordinario',
      text: 'Ordinario',
      color: '#00aa00',
      source: 'customers',
    }];
    component.clientiArray = [{
      numeroCliente: '004',
      durataLavoroMinuti: 90,
    }];
    component.popupCategory = 'ordinario';
    component.popupTitle = '004 - Cliente di prova';
    component.popupStartDate = '2026-07-27T10:00';

    component.onStartDateChange();

    expect(component.popupEndDate).toBe('2026-07-27T11:30');
  });

  it('falls back to thirty minutes when no customer duration is available', () => {
    const component = new CalendarHomeComponent(
      {} as any,
      { getRecordValueByRole: () => null } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    component.categories = [];
    component.popupStartDate = '2026-07-27T10:00';

    component.onStartDateChange();

    expect(component.popupEndDate).toBe('2026-07-27T10:30');
  });

  it('accepts a customer order progressive such as 454/1 in a linked calendar title', () => {
    const component = new CalendarHomeComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    component.categories = [{
      id: 'ordine-servizio',
      text: 'Ordini di servizio',
      color: '#008577',
      source: 'customers',
    }];
    component.clientiArray = [{ numeroCliente: '454' }];

    expect(component.validateCodice('454/1', 'ordine-servizio')).toBeTrue();
  });
  function contactComponent(): CalendarHomeComponent {
    return new CalendarHomeComponent({} as any, {
      buildCalendarWorkAddress: (record: any, scope: string) => scope === 'customer' ? record.sedeLavoro || ''
        : [record.via && `Via ${record.via}`, [record.cap, record.citta].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      getRecordValueByRole: (_scope: string, record: any, role: string) => ({
        customerPhone: record.telefono, quotePhone: record.telefono, quoteCity: record.citta,
      } as any)[role],
    } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  }

  it('uses the customer work address and phone, including customer order titles', () => {
    const component = contactComponent();
    component.categories = [{ id: 'clienti', text: 'Clienti', color: '#000', source: 'customers' }];
    component.clientiArray = [{ numeroCliente: '454', sedeLavoro: 'Via Roma 10, Modena', telefono: '+39 059 123456' }];
    component.popupCategory = 'clienti';
    component.popupTitle = '454/1 - Cliente';
    expect(component.popupLocationAddress).toBe('Via Roma 10, Modena');
    expect(component.popupContactPhone).toBe('+39 059 123456');
    expect(component.popupPhoneUrl).toBe('tel:+39059123456');
  });

  it('keeps event-specific overrides and allows clearing suggested contact data', () => {
    const component = contactComponent();
    component.categories = [{ id: 'clienti', text: 'Clienti', color: '#000', source: 'customers' }];
    component.clientiArray = [{ numeroCliente: '4', sedeLavoro: 'Via Roma 10', telefono: '059123456' }];
    component.popupCategory = 'clienti'; component.popupTitle = '4 - Cliente';
    component.popupLocationAddress = 'Via Milano 20, Bologna';
    component.popupContactPhone = '051987654';
    expect(component.popupLocationAddress).toBe('Via Milano 20, Bologna');
    expect(component.popupPhoneUrl).toBe('tel:051987654');
    component.popupLocationAddress = ''; component.popupContactPhone = '';
    expect(component.popupDirectionsUrl).toBe('');
    expect(component.popupPhoneUrl).toBe('');
  });

  it('suggests quote contact details and replaces them when another quote is selected', () => {
    const component = contactComponent();
    component.categories = [{ id: 'sopralluogo', text: 'Sopralluogo', color: '#000', source: 'quotes' }];
    component.popupCategory = 'sopralluogo'; component.popupTitle = '12 - Preventivo';
    (component as any).quotesMap.set('12', { via: 'Roma 10', selettorePrefissoVia: 'Via', cap: '41100', citta: 'Modena', telefono: '059123456' });
    expect(component.popupLocationAddress).toBe('Via Roma 10, 41100 Modena');
    expect(component.popupContactPhone).toBe('059123456');
    component.popupTitle = '13 - Altro preventivo';
    expect(component.popupLocationAddress).toBe('');
    expect(component.popupContactPhone).toBe('');
  });

  it('preserves contact details while converting and opening recurring events', () => {
    const component = contactComponent();
    component.categories = [];
    const raw = { id: 12, title: 'Sopralluogo', startDate: '2026-10-20T10:00:00+02:00',
      endDate: '2026-10-20T11:00:00+02:00', categories: 'altro', recurrenceRule: 'FREQ=WEEKLY',
      recurrenceException: [], dayLong: false, status: 'ACTIVE', description: '',
      locationAddress: 'Via Roma 10, Modena', contactPhone: '+39 059 123456' };
    component.rawEvents = [raw];
    const event = component.toCalEvent(raw);
    component.openEditPopup(event, 'single', new Date(event.start));
    expect(component.popupLocationAddress).toBe(raw.locationAddress);
    expect(component.popupContactPhone).toBe(raw.contactPhone);
  });

  it('encodes the complete destination and accepts only a single safe phone number', () => {
    const address = 'Via A & B 12/3, Forlì';
    expect(new URL(calendarDirectionsUrl(address)).searchParams.get('destination')).toBe(address);
    expect(calendarPhoneUrl('+39 (059) 123-456')).toBe('tel:+39059123456');
    for (const invalid of ['', 'javascript:alert(1)', '123#456', '*123', '123/456', 'numero non disponibile']) {
      expect(calendarPhoneUrl(invalid)).toBe('');
    }
    expect(calendarDirectionsUrl('   ')).toBe('');
  });

  it('sends contact details when saving an event and clearing a single occurrence', () => {
    const component = contactComponent();
    const post = jasmine.createSpy('post').and.returnValue(EMPTY);
    (component as any).http = { post };
    (component as any).globalService.url = '/';
    component.categories = [{ id: 'altro', text: 'Altro', color: '#000', source: 'none' }];
    component.popupCategory = 'altro'; component.popupTitle = 'Appuntamento';
    component.popupStartDate = '2026-10-20T10:00'; component.popupEndDate = '2026-10-20T11:00';
    component.popupLocationAddress = 'Via Roma 10, Modena'; component.popupContactPhone = '059123456';
    component.saveEvent();
    expect(post.calls.mostRecent().args[0]).toBe('/appointments/add');
    expect(post.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
      locationAddress: 'Via Roma 10, Modena', contactPhone: '059123456',
    }));
    component.isNewEvent = false; component.editingSingleOccurrence = true; component.editingEventId = 12;
    component.popupLocationAddress = ''; component.popupContactPhone = '';
    component.saveEvent();
    expect(post.calls.mostRecent().args[0]).toBe('/appointments/editSingleOccurrence');
    expect(post.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
      id: 12, locationAddress: '', contactPhone: '',
    }));
  });

  function mappedContactComponent(source: 'customers' | 'quotes'): CalendarHomeComponent {
    const global = new GlobalService({ token: '', userCode: '', permissions: [] } as any,
      { tenant: 'test', tenantLabel: 'Test' } as any, {} as any);
    (global as any).tenantConfig = {
      addressConfig: { workSameAsBilling: false,
        work: { address: 'via', city: 'citta', zip: 'cap' },
        billing: { address: 'viaDiFatturazione', city: 'cittaDiFatturazione' } },
      quoteConfig: { fieldMapping: {
        customer: { fields: [
          { key: 'via', dbColumn: 'indirizzo_lavoro', label: 'Via lavoro' },
          { key: 'citta', dbColumn: 'comune_lavoro', label: 'Comune lavoro' },
          { key: 'cap', dbColumn: 'cap_lavoro', label: 'CAP lavoro' },
          { key: 'telefono', dbColumn: 'telefono', label: 'Telefono', displayRole: 'customerPhone' },
          { key: 'viaDiFatturazione', dbColumn: 'viaDiFatturazione', label: 'Via fatturazione', displayRole: 'customerAddress' },
        ] },
        quote: { fields: [
          { key: 'via', dbColumn: 'luogo_sopralluogo', label: 'Via sopralluogo' },
          { key: 'citta', dbColumn: 'comune_sopralluogo', label: 'Comune sopralluogo' },
          { key: 'cap', dbColumn: 'cap_sopralluogo', label: 'CAP sopralluogo' },
          { key: 'telefono', dbColumn: 'telefono', label: 'Telefono', displayRole: 'quotePhone' },
        ] },
      } },
    };
    const component = new CalendarHomeComponent({} as any, global, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any);
    component.categories = [{ id: 'test', text: 'Evento di prova', color: '#000', source }];
    component.popupCategory = 'test';
    return component;
  }

  it('fills the fictional customer work address on selection without sending a confirmation', () => {
    const component = mappedContactComponent('customers');
    const send = spyOn(component as any, 'sendInspectionConfirmation');
    component.clientiArray = [{ numeroCliente: 'TEST-001', indirizzo_lavoro: 'Via Test Lavoro 10',
      comune_lavoro: 'Comune Prova', cap_lavoro: '00000', telefono: '000123456',
      viaDiFatturazione: 'Via Test Fatturazione 99' }];
    component.selectAutocomplete('TEST-001 - Cliente fittizio');
    expect(component.popupLocationAddress).toBe('Via Test Lavoro 10, 00000 Comune Prova');
    expect(component.popupContactPhone).toBe('000123456');
    expect(component.popupWorkAddressMissing).toBeFalse();
    expect(component.popupLocationAddress).not.toContain('Fatturazione');
    expect(send).not.toHaveBeenCalled();
  });

  it('fills a fictional quote mapped work address instead of its billing address', () => {
    const component = mappedContactComponent('quotes');
    const send = spyOn(component as any, 'sendInspectionConfirmation');
    (component as any).quotesMap.set('test-002', { numeroPreventivo: 'TEST-002',
      luogo_sopralluogo: 'Via Test Sopralluogo 20', comune_sopralluogo: 'Comune Prova', cap_sopralluogo: '00000',
      viaDiFatturazione: 'Via Test Fatturazione 99', telefono: '000123456' });
    component.selectAutocomplete('TEST-002 - Preventivo fittizio');
    expect(component.popupLocationAddress).toBe('Via Test Sopralluogo 20, 00000 Comune Prova');
    expect(component.popupContactPhone).toBe('000123456');
    expect(send).not.toHaveBeenCalled();
  });

  it('reports a missing work address without using the fictional customer billing address', () => {
    const component = mappedContactComponent('customers');
    component.clientiArray = [{ numeroCliente: 'TEST-003', indirizzo_lavoro: '',
      comune_lavoro: 'Comune Prova', viaDiFatturazione: 'Via Test Fatturazione 99' }];
    component.selectAutocomplete('TEST-003 - Cliente fittizio senza sede');
    expect(component.popupLocationAddress).toBe('');
    expect(component.popupDirectionsUrl).toBe('');
    expect(component.popupWorkAddressMissing).toBeTrue();
  });

  function detailFixtureEvent(overrides: any = {}): any {
    return { id: 12, title: 'TEST-001 - Sopralluogo fittizio', start: new Date('2026-10-20T10:00:00'),
      end: new Date('2026-10-20T11:00:00'), categories: 'altro', description: 'Contatto e accesso di prova',
      recurrenceRule: '', recurrenceException: [], dayLong: false,
      locationAddress: 'Via Test Lavoro 10, Comune Prova', contactPhone: '000123456', ...overrides };
  }

  it('opens a read-only card on click without opening an edit or sending a confirmation', () => {
    const component = contactComponent();
    const send = spyOn(component as any, 'sendInspectionConfirmation');
    const event = detailFixtureEvent();
    component.onEventClick(event, new MouseEvent('click'));
    expect(component.detailEvent).toBe(event);
    expect(component.showPopup).toBeFalse();
    expect(component.showEditScopeChoice).toBeFalse();
    expect(component.detailLocationAddress).toBe(event.locationAddress);
    expect(component.detailPhoneUrl).toBe('tel:000123456');
    expect(send).not.toHaveBeenCalled();
    component.onDetailsEscape();
    expect(component.detailEvent).toBeNull();
  });

  it('uses the same read-only card for the day list and double click', () => {
    const component = contactComponent();
    const event = detailFixtureEvent();
    component.showDayPopup = true;
    component.dayPopupDate = new Date(event.start);
    component.onDayPopupEventClick(event, new MouseEvent('click'));
    expect(component.showDayPopup).toBeFalse();
    expect(component.detailEvent).toBe(event);
    component.closeEventDetails();
    component.onEventDblClick(event, new MouseEvent('dblclick'));
    expect(component.detailEvent).toBe(event);
    expect(component.showPopup).toBeFalse();
  });

  it('opens editing only after the explicit action and respects edit permission', () => {
    const component = contactComponent();
    const permission = jasmine.createSpy('permission').and.returnValue(false);
    (component as any).globalService.hasPermission = permission;
    component.openEventDetails(detailFixtureEvent());
    component.editDetailEvent();
    expect(component.showPopup).toBeFalse();
    expect(component.detailEvent).not.toBeNull();
    permission.and.returnValue(true);
    component.editDetailEvent();
    expect(component.detailEvent).toBeNull();
    expect(component.showPopup).toBeTrue();
    expect(component.isNewEvent).toBeFalse();
    expect(component.popupLocationAddress).toBe('Via Test Lavoro 10, Comune Prova');
    expect(permission).toHaveBeenCalledWith('CALENDAR_EVENT_MANAGE');
  });

  it('asks the recurrence scope only after Modifica and keeps the clicked occurrence date', () => {
    const component = contactComponent();
    (component as any).globalService.hasPermission = () => true;
    const event = detailFixtureEvent({ isRecurring: true, originalId: 12, recurrenceRule: 'FREQ=WEEKLY',
      start: new Date('2026-10-27T10:00:00'), end: new Date('2026-10-27T11:00:00') });
    component.onEventClick(event, new MouseEvent('click'), new Date('2026-10-27T00:00:00'));
    expect(component.showEditScopeChoice).toBeFalse();
    component.editDetailEvent();
    expect(component.showEditScopeChoice).toBeTrue();
    expect(component.showPopup).toBeFalse();
    component.chooseEditScope('single');
    expect(component.showPopup).toBeTrue();
    expect(component.editingSingleOccurrence).toBeTrue();
    expect(component.popupStartDate).toBe('2026-10-27T10:00');
    expect(component.editingEventId).toBe(12);
  });

  it('uses the work address in the card and preserves an explicitly empty event address', () => {
    const component = mappedContactComponent('customers');
    component.clientiArray = [{ numeroCliente: 'TEST-001', indirizzo_lavoro: 'Via Test Lavoro 10',
      comune_lavoro: 'Comune Prova', viaDiFatturazione: 'Via Test Fatturazione 99', telefono: '000123456' }];
    const event = detailFixtureEvent({ categories: 'test', locationAddress: null, contactPhone: null });
    component.openEventDetails(event);
    expect(component.detailLocationAddress).toBe('Via Test Lavoro 10, Comune Prova');
    expect(component.detailContactPhone).toBe('000123456');
    component.openEventDetails({ ...event, locationAddress: '', contactPhone: '' });
    expect(component.detailDirectionsUrl).toBe('');
    expect(component.detailPhoneUrl).toBe('');
  });

  it('renders the card without editable fields and switches to the form only on Modifica', async () => {
    const post = jasmine.createSpy('post');
    spyOn(CalendarHomeComponent.prototype, 'ngOnInit').and.stub();
    await TestBed.configureTestingModule({
      declarations: [CalendarHomeComponent], imports: [CommonModule, FormsModule],
      providers: [
        { provide: HttpClient, useValue: { post } },
        { provide: GlobalService, useValue: { hasPermission: () => true } },
        { provide: Router, useValue: {} }, { provide: ActivatedRoute, useValue: {} },
        { provide: AutomaticAddInspectionToCalendarService, useValue: {} },
        { provide: PopupServiceService, useValue: {} }, { provide: TenantService, useValue: {} },
        { provide: InspectionAlarmSyncService, useValue: {} },
        { provide: AgendaWidgetService, useValue: { available: false } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(CalendarHomeComponent);
    const component = fixture.componentInstance;
    component.categories = [{ id: 'altro', text: 'Evento di prova', color: '#1864ac', source: 'none' }];
    component.openEventDetails(detailFixtureEvent());
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(card.textContent).toContain('Dettagli evento');
    expect(card.textContent).toContain('Sopralluogo fittizio');
    expect(card.querySelectorAll('input, textarea, select').length).toBe(0);
    expect(card.querySelector('a[href="tel:000123456"]')).not.toBeNull();
    expect(card.querySelector('a[href*="google.com/maps/dir/"]')).not.toBeNull();
    (Array.from(card.querySelectorAll('button')).find(button => button.textContent?.includes('Modifica')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('.popup-header h3').textContent).toBe('Modifica evento');
    expect(fixture.nativeElement.querySelector('input[placeholder="Cerca preventivo o cliente..."]')).not.toBeNull();
    expect(post).not.toHaveBeenCalled();
    component.categories.push({ id: 'personal-event', text: 'Evento', color: '#7c3aed', scope: 'personal', source: 'none' });
    component.personalSettingsReady = true;
    component.openNewPopup(new Date('2026-10-22T10:00:00'), 'personal-event');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('optgroup[label="Lavoro"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('optgroup[label="Personali"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.personal-event-settings')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.inspection-users-list')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[placeholder="Titolo dell’evento personale"]')).not.toBeNull();
    const sharing = fixture.nativeElement.querySelector('#personal-event-sharing') as HTMLSelectElement;
    expect(Array.from(sharing.options).map(option => option.value)).toEqual(['private', 'all', 'selected']);
    component.sharingUsersReady = true;
    component.sharingUsers = [{ id: 2, label: 'Utente fittizio' }];
    sharing.value = 'selected'; sharing.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const recipient = fixture.nativeElement.querySelector('.personal-sharing-users input') as HTMLInputElement;
    expect(recipient).not.toBeNull();
    recipient.click(); fixture.detectChanges();
    expect(component.popupSharedAdminIds).toEqual([2]);
    expect(fixture.nativeElement.querySelector('.inspection-users-list')).toBeNull();
    expect(post).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('creates a private personal event with a free title and only a self reminder request', () => {
    const component = contactComponent();
    const post = jasmine.createSpy('post').and.returnValue(EMPTY);
    (component as any).http = { post };
    (component as any).globalService.url = '/';
    (component as any).globalService.hasPermission = () => false;
    component.categories = [{ id: 'personal-event', text: 'Evento', color: '#7c3aed', scope: 'personal', source: 'none' }];
    component.personalSettingsReady = true;
    const email = spyOn(component as any, 'sendInspectionConfirmation');
    component.openNewPopup(new Date('2026-10-22T10:00:00'));
    expect(component.popupCategory).toBe('personal-event');
    expect(component.popupSharedWithWork).toBeFalse();
    component.popupTitle = 'Un appuntamento personale senza codici';
    component.popupPersonalReminderEnabled = true; component.popupInspectionReminderMinutes = 25;
    component.popupInspectionAdminIds = [999];
    component.saveEvent();
    expect(post).toHaveBeenCalled();
    const body = post.calls.mostRecent().args[1];
    expect(body).toEqual(jasmine.objectContaining({ calendarScope: 'personal', sharedWithWork: false,
      personalReminderEnabled: true, inspectionReminderMinutes: 25, inspectionAdminIds: [],
      numeroCliente: null, numeroPreventivo: null, customerWarehouseMode: 'none' }));
    expect(email).not.toHaveBeenCalled();
  });
  it('refreshes the widget as soon as a personal event is saved without relying on socket events', () => {
    const component = contactComponent();
    const refresh = jasmine.createSpy('refresh').and.resolveTo();
    (component as any).agendaWidget = { refresh };
    (component as any).http = { post: () => of('{}') };
    (component as any).globalService.url = '/';
    (component as any).globalService.hasPermission = () => false;
    (component as any).inspectionAlarmSync = { setToken: () => {}, syncSoon: () => Promise.resolve() };
    spyOn(component, 'loadAll').and.stub();
    spyOn(component, 'sendInspectionConfirmation').and.stub();
    component.categories = [{ id: 'personal-event', text: 'Evento', color: '#7c3aed', scope: 'personal', source: 'none' }];
    component.personalSettingsReady = true;
    component.openNewPopup(new Date('2026-10-22T10:00:00'));
    component.popupTitle = 'Evento FITTIZIO per widget';
    component.saveEvent();
    expect(refresh).toHaveBeenCalledOnceWith(true);
    expect(component.sendInspectionConfirmation).not.toHaveBeenCalled();
  });
  it('refreshes the widget after edits and deletions of recurring occurrences', () => {
    const component = contactComponent();
    const refresh = jasmine.createSpy('refresh').and.resolveTo();
    (component as any).agendaWidget = { refresh };
    (component as any).http = { post: () => of('{}') };
    (component as any).globalService.url = '/';
    (component as any).inspectionAlarmSync = { setToken: () => {}, syncSoon: () => Promise.resolve() };
    spyOn(component, 'loadAll').and.stub();
    (component as any).saveSingleOccurrence({ calendarScope: 'personal' }, false, false);
    expect(refresh.calls.count()).toBe(1);
    component.deleteSingle(); component.deleteAll();
    expect(refresh.calls.count()).toBe(3);
  });

  it('keeps personal links separate from a free title and uses the work address', () => {
    const component = mappedContactComponent('customers');
    component.categories.push({ id: 'personal-event', text: 'Evento', color: '#7c3aed', scope: 'personal', source: 'none' });
    component.popupCategory = 'personal-event'; component.popupCalendarScope = 'personal';
    component.popupTitle = 'Appuntamento personale';
    component.clientiArray = [{ numeroCliente: 'TEST-1', indirizzo_lavoro: 'Via Test Lavoro 10',
      comune_lavoro: 'Comune Prova', viaDiFatturazione: 'Via Fatture 99' }];
    component.popupPersonalLinkType = 'customer'; component.popupPersonalLinkNumber = 'TEST-1';
    expect(component.popupLocationAddress).toBe('Via Test Lavoro 10, Comune Prova');
    component.popupLocationAddress = 'Luogo modificato per questo evento';
    component.onTitleInput({ target: { value: 'Titolo personale aggiornato' } } as any);
    expect(component.popupLocationAddress).toBe('Luogo modificato per questo evento');
    expect(component.popupPersonalLinkNumber).toBe('TEST-1');
  });

  it('saves selected sharing separately from reminders and clears recipients for all or private', () => {
    const component = contactComponent();
    const post = jasmine.createSpy('post').and.returnValue(EMPTY);
    const showError = jasmine.createSpy('showError');
    (component as any).http = { post };
    (component as any).popupService = { showError };
    (component as any).globalService.url = '/';
    (component as any).globalService.hasPermission = () => false;
    component.categories = [{ id: 'personal-event', text: 'Evento', color: '#7c3aed', scope: 'personal', source: 'none' }];
    component.personalSettingsReady = true;
    component.sharingUsersReady = true;
    component.openNewPopup(new Date('2026-10-22T10:00:00'));
    component.popupTitle = 'Evento fittizio condiviso';
    component.popupSharingMode = 'selected';
    component.saveEvent();
    expect(showError).toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    component.togglePersonalSharingUser(2);
    component.popupPersonalReminderEnabled = true;
    component.saveEvent();
    expect(post.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
      personalSharingMode: 'selected', sharedWithWork: false, sharedAdminIds: [2],
      personalReminderEnabled: true, inspectionAdminIds: [],
    }));
    component.popupSharingMode = 'all'; component.saveEvent();
    expect(post.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
      personalSharingMode: 'all', sharedWithWork: true, sharedAdminIds: [],
    }));
    component.popupSharingMode = 'private'; component.saveEvent();
    expect(post.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
      personalSharingMode: 'private', sharedWithWork: false, sharedAdminIds: [],
    }));
  });

  it('filters own personal events and includes shared personal events in the work view', () => {
    const component = contactComponent();
    component.currentAdminId = 7;
    const base = { title: 'Test', startDate: '2026-10-22T10:00:00', endDate: '2026-10-22T11:00:00',
      recurrenceRule: '', recurrenceException: [], description: '', categories: 'personal-event', dayLong: false, status: 'ACTIVE' };
    component.rawEvents = [{ ...base, id: 1, calendarScope: 'work' },
      { ...base, id: 2, calendarScope: 'personal', ownerAdminId: 7 },
      { ...base, id: 3, calendarScope: 'personal', ownerAdminId: 8, sharedWithWork: true },
      { ...base, id: 4, calendarScope: 'personal', ownerAdminId: 8, sharedAdminIds: [7] }];
    const ids = () => component.expandEvents(new Date('2026-10-22T00:00:00'), new Date('2026-10-22T23:59:59')).map(event => event.id);
    expect(ids()).toEqual([1, 2, 3, 4]);
    component.calendarGroup = 'personal'; expect(ids()).toEqual([2]);
    component.calendarGroup = 'work'; expect(ids()).toEqual([1, 3, 4]);
  });

  it('does not offer editing for a shared personal event owned by another user', () => {
    const component = contactComponent();
    (component as any).globalService.hasPermission = () => true;
    component.openEventDetails(detailFixtureEvent({ calendarScope: 'personal', ownerAdminId: 2,
      sharedWithWork: true, canEdit: false }));
    expect(component.canEditCalendarEvent).toBeFalse();
    component.editDetailEvent();
    expect(component.showPopup).toBeFalse();
  });

  it('edits the original remote personal event and never resolves its contacts against local records', () => {
    const component = mappedContactComponent('customers');
    const get = jasmine.createSpy('get').and.callFake((url: string) => {
      if (url.includes('personalCategories')) return of({ categories: [{ id: 'personal-remote', label: 'Famiglia remota', color: '#123456' }] });
      if (url.includes('sharingUsers')) return of({ users: [{ id: 12, label: 'Collega remoto fittizio' }] });
      return of({ tenants: [{ tenantId: 'alpha', label: 'Altra azienda', personal: true, details: false, availability: true, users: [] }] });
    });
    const post = jasmine.createSpy('post').and.returnValue(EMPTY);
    (component as any).http = { get, post };
    (component as any).globalService.hasPermission = () => true;
    component.personalSettingsReady = true;
    component.clientiArray = [{ numeroCliente: 'TEST-1', indirizzo_lavoro: 'Indirizzo locale errato' }];
    const remote = detailFixtureEvent({ id: 'f:beta:42', sourceTenantId: 'beta', sourceAppointmentId: 42,
      sourceCompanyLabel: 'Azienda fittizia B', calendarScope: 'personal', ownerAdminId: 7, isOwnAgenda: true,
      categories: 'personal-remote', numeroCliente: 'TEST-1', locationAddress: '', canEdit: true,
      sharedAdminIds: [12], crossTenantShares: [{ tenantId: 'alpha', mode: 'all', visibility: 'busy', adminIds: [] }] });
    component.openEditPopup(remote);
    expect(component.editingEventId).toBe(42); expect(component.popupSourceTenantId).toBe('beta');
    expect(component.popupLocationAddress).toBe(''); expect(component.canLinkPersonalCustomer).toBeFalse();
    expect(component.personalCategories[0].id).toBe('personal-remote');
    component.saveEvent();
    expect(post.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ id: 42, sourceTenantId: 'beta',
      categories: 'personal-remote', numeroCliente: 'TEST-1', personalSharingMode: 'selected', sharedAdminIds: [12],
      crossTenantShares: [{ tenantId: 'alpha', mode: 'all', visibility: 'busy', adminIds: [] }] }));
    expect(get.calls.allArgs().every(args => args[0].includes('sourceTenantId=beta'))).toBeTrue();
  });

  it('keeps colliding local and remote ids separate and includes assigned work in the unified agenda', () => {
    const component = contactComponent(); component.currentAdminId = 7;
    const base: any = { title: 'Test', startDate: '2026-10-22T10:00:00', endDate: '2026-10-22T11:00:00', categories: 'altro', status: 'ACTIVE', recurrenceRule: '' };
    component.rawEvents = [{ ...base, id: 42, calendarScope: 'work', isOwnAgenda: true },
      { ...base, id: 'f:beta:42', calendarScope: 'personal', ownerAdminId: 7, isOwnAgenda: true },
      { ...base, id: 43, calendarScope: 'work', isOwnAgenda: false }];
    component.calendarGroup = 'personal';
    const events = component.expandEvents(new Date('2026-10-22T00:00:00'), new Date('2026-10-22T23:59:59'));
    expect(events.map(event => event.id)).toEqual([42, 'f:beta:42']);
    expect((component as any).getOriginalCalEvent(events[1]).id).toBe('f:beta:42');
  });

  it('requires a conflict confirmation before retrying a save with an override', async () => {
    const component = contactComponent();
    const confirm = jasmine.createSpy('confirm').and.returnValue(Promise.resolve(false));
    (component as any).popupService = { confirm };
    const retry = jasmine.createSpy('retry');
    const error = { status: 409, error: JSON.stringify({ conflicts: [{ personLabel: 'Persona fittizia', startDate: '2026-11-20T10:00:00Z', endDate: '2026-11-20T11:00:00Z' }] }) };
    await (component as any).handleSaveError(error, retry); expect(retry).not.toHaveBeenCalled();
    confirm.and.returnValue(Promise.resolve(true)); await (component as any).handleSaveError(error, retry);
    expect(retry).toHaveBeenCalledTimes(1); expect(confirm.calls.mostRecent().args[0]).toContain('Persona fittizia');
  });

  it('offers calendar assignees without exposing or requiring administrator management', () => {
    const component = contactComponent();
    (component as any).globalService.hasPermission = (permission: string) => permission === 'CALENDAR_EVENT_MANAGE';
    component.currentAdminId = 7;
    component.sharingUsers = [{ id: 8, label: 'Collega fittizio' }];
    (component as any).updateCalendarAssignees();
    expect(component.adminOptions).toEqual([{ id: 7, nome: 'Tu', cognome: '', email: '' },
      { id: 8, nome: 'Collega fittizio', cognome: '', email: '' }]);
    component.popupSharingMode = 'all'; component.popupPersonalVisibility = 'busy';
    expect(component.personalSharingHelp).toContain('senza i dettagli');
    component.popupPersonalVisibility = 'details'; expect(component.personalSharingHelp).toContain('potranno vedere i dettagli');
  });

});
