import { of, throwError } from 'rxjs';
import { InvoicesComponent } from './invoices.component';

describe('Promemoria fatture mai inviate allo SdI', () => {
  let component: InvoicesComponent;
  let http: jasmine.SpyObj<any>;
  let canManage: boolean;
  beforeEach(() => {
    canManage = true;
    http = jasmine.createSpyObj('HttpClient', ['get', 'post']);
    http.get.and.callFake((url: string) => of(url.includes('unsent-sdi-summary') ? { count: 4, overdueCount: 2 } : []));
    component = new InvoicesComponent(http, { snapshot: { queryParamMap: { get: () => null } } } as any,
      {} as any, {} as any, { url: '/api/', hasPermission: () => canManage } as any, {} as any);
  });

  it('carica destinatari e giorni dalle impostazioni salvate', () => {
    http.get.and.returnValue(of({ unsentSdiReminders: { enabled: true, emails: ['one@example.com', 'two@example.com'], days: [2, 5, 10] } }));
    component.loadInvoiceSettings();
    expect(component.unsentReminderEnabled).toBeTrue();
    expect(component.unsentReminderEmails).toBe('one@example.com\ntwo@example.com');
    expect(component.unsentReminderDays).toBe('2, 5, 10');
  });

  it('salva la configurazione e aggiorna il contatore senza inviare email dal browser', () => {
    component.unsentReminderEnabled = true;
    component.unsentReminderEmails = 'one@example.com\ntwo@example.com';
    component.unsentReminderDays = '2, 5, 10, 11, 12';
    http.post.and.returnValue(of({ enabled: true, emails: ['one@example.com', 'two@example.com'], days: [2, 5, 10, 11, 12] }));
    component.saveUnsentSdiReminders();
    expect(http.post).toHaveBeenCalledOnceWith('/api/invoices/settings/unsent-sdi-reminders/save', {
      enabled: true, emails: 'one@example.com\ntwo@example.com', days: '2, 5, 10, 11, 12',
    });
    expect(component.unsentSdiCount).toBe(4);
    expect(component.overdueSdiCount).toBe(2);
    expect(component.savingUnsentReminders).toBeFalse();
  });

  it('mostra gli errori di validazione preservando la configurazione inserita', () => {
    component.unsentReminderDays = '0, 2';
    http.post.and.returnValue(throwError(() => ({ error: { error: 'Giorni non validi' } })));
    component.saveUnsentSdiReminders();
    expect(component.error).toContain('Giorni non validi');
    expect(component.unsentReminderDays).toBe('0, 2');
    expect(component.savingUnsentReminders).toBeFalse();
  });

  it('richiede il permesso di gestione per modificare i promemoria', () => {
    canManage = false;
    component.saveUnsentSdiReminders();
    expect(http.post).not.toHaveBeenCalled();
  });

  it('il filtro del contatore rimuove i filtri incompatibili e carica le non inviate', () => {
    component.showInvoiceArchive = true;
    component.statusFilter = 'sent';
    component.documentKindFilter = 'invoice';
    component.search = 'cliente';
    component.toggleUnsentSdiFilter();
    expect(component.unsentSdiOnly).toBeTrue();
    expect(component.showInvoiceArchive).toBeFalse();
    expect(component.statusFilter).toBe('');
    expect(component.documentKindFilter).toBe('');
    expect(component.search).toBe('');
    expect(http.get).toHaveBeenCalledWith('/api/invoices/getAll?unsentSdi=1&direction=outbound');
    expect(component.unsentSdiCount).toBe(4);
  });

  it('cambiare stato o aprire l’archivio disattiva il filtro delle non inviate', () => {
    component.unsentSdiOnly = true;
    component.statusFilter = 'sent';
    component.onInvoiceStatusFilterChange();
    expect(component.unsentSdiOnly).toBeFalse();
    expect(http.get).toHaveBeenCalledWith('/api/invoices/getAll?status=sent&direction=outbound');
    component.unsentSdiOnly = true;
    component.toggleArchive();
    expect(component.unsentSdiOnly).toBeFalse();
    expect(component.showInvoiceArchive).toBeTrue();
  });

  it('non applica il filtro delle fatture vendita alle fatture acquisto', () => {
    component.unsentSdiOnly = true;
    component.directionFilter = 'inbound';
    component.loadInvoices();
    expect(http.get).toHaveBeenCalledOnceWith('/api/invoices/getAll?direction=inbound');
  });
});
