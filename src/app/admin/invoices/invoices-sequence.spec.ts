import { of, Subject, throwError } from 'rxjs';
import { InvoicesComponent } from './invoices.component';

const predecessor = { id: 2, number: '2', year: 2026, series: 'NC', type: 'TD04', status: 'draft', issueDate: '2026-08-10', customerName: 'Cliente' };
const warning = (fingerprint = 'first') => ({ status: 409, error: { code: 'PREVIOUS_INVOICES_UNSENT', sequenceWarning: { documents: [predecessor], fingerprint } } });

describe('Controlli prima dell’invio documenti', () => {
  let component: InvoicesComponent;
  let http: jasmine.SpyObj<any>;
  let dialog: jasmine.SpyObj<any>;
  beforeEach(() => {
    http = jasmine.createSpyObj('HttpClient', ['post', 'get']);
    dialog = jasmine.createSpyObj('Dialog', ['choosePendingInvoices']);
    component = new InvoicesComponent(http, {} as any, {} as any, {} as any,
      { url: '/api/', hasPermission: () => true } as any, dialog);
    component.selected.id = 3;
  });

  it('conta anche l’anno nel limite del numero fiscale e conserva i documenti caricati da un backend precedente', () => {
    component.selected.number='1234567890123456';component.selected.series='';component.selected.year=2027;component.selected.numberFormatVersion=1;
    expect(component.invoiceFieldError('number')).toContain('20 caratteri');
    component.selected.numberFormatVersion=0;expect(component.invoiceFieldError('number')).toBe('');
    expect((component as any).withInvoiceDefaults({id:8,number:'1',year:2026}).numberFormatVersion).toBe(0);
  });

  it('mostra la lista e ripete l’invio solo dopo conferma con il riferimento restituito dal server', async () => {
    const sent = { ...component.selected, status: 'sent' };
    http.post.and.returnValues(throwError(() => warning()), of(sent));
    dialog.choosePendingInvoices.and.resolveTo({ action: 'send' });
    expect(await (component as any).sendWithSequenceConfirmation(3)).toEqual(sent);
    expect(dialog.choosePendingInvoices).toHaveBeenCalledOnceWith({ documents: [predecessor] });
    expect(http.post.calls.allArgs()).toEqual([
      ['/api/invoices/send', { id: 3 }], ['/api/invoices/send', { id: 3, sequenceConfirmation: 'first' }],
    ]);
  });

  it('annullando non ripete la richiesta e non invia nulla', async () => {
    http.post.and.returnValue(throwError(() => warning()));
    dialog.choosePendingInvoices.and.resolveTo(null);
    expect(await (component as any).sendWithSequenceConfirmation(3)).toBeNull();
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('apre il documento precedente senza inviare quello corrente', async () => {
    http.post.and.returnValue(throwError(() => warning()));
    dialog.choosePendingInvoices.and.resolveTo({ action: 'open', invoiceId: 2 });
    const open = spyOn(component, 'selectInvoice');
    expect(await (component as any).sendWithSequenceConfirmation(3)).toBeNull();
    expect(open).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: 2, type: 'TD04' }));
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('richiede una nuova conferma se nel frattempo il server rileva altri documenti o stati diversi', async () => {
    http.post.and.returnValues(throwError(() => warning()), throwError(() => warning('changed')), of(component.selected));
    dialog.choosePendingInvoices.and.resolveTo({ action: 'send' });
    await (component as any).sendWithSequenceConfirmation(3);
    expect(dialog.choosePendingInvoices).toHaveBeenCalledTimes(2);
    expect(http.post.calls.mostRecent().args[1].sequenceConfirmation).toBe('changed');
  });

  it('non consente di ignorare un errore di cronologia', async () => {
    const error = { status: 409, error: { code: 'INVOICE_SEQUENCE_INVALID', error: 'Data non coerente' } };
    http.post.and.returnValue(throwError(() => error));
    await expectAsync((component as any).sendWithSequenceConfirmation(3)).toBeRejectedWith(error);
    expect(dialog.choosePendingInvoices).not.toHaveBeenCalled();
  });

  it('il pulsante Invia usa il controllo e annullando sblocca il form', async () => {
    const send = spyOn<any>(component, 'sendWithSequenceConfirmation').and.resolveTo(null);
    component.send();
    await Promise.resolve(); await Promise.resolve();
    expect(send).toHaveBeenCalledOnceWith(3);
    expect(component.saving).toBeFalse();
    expect(component.success).toBe('');
  });

  it('anche Salva, valida e invia passa dal controllo e non invia email se annullato', async () => {
    const send = spyOn<any>(component, 'sendWithSequenceConfirmation').and.resolveTo(null);
    http.post.and.returnValue(of({ valid: true }));
    component.saving = true;
    (component as any).validateAndSendInvoice(component.selected, 'test@example.com');
    await Promise.resolve(); await Promise.resolve();
    expect(send).toHaveBeenCalledOnceWith(3);
    expect(http.post).toHaveBeenCalledOnceWith('/api/invoices/validate', { id: 3 });
    expect(component.saving).toBeFalse();
  });

  it('mostra l’avviso per un numero troppo alto anche senza precedenti in bozza', async () => {
    const gapWarning = { status: 409, error: { code: 'PREVIOUS_INVOICES_UNSENT', sequenceWarning: {
      documents: [], gaps: [{ from: '11', to: '11' }], currentNumber: 'A/12', fingerprint: 'gap',
    } } };
    http.post.and.returnValue(throwError(() => gapWarning));
    dialog.choosePendingInvoices.and.resolveTo(null);
    expect(await (component as any).sendWithSequenceConfirmation(3)).toBeNull();
    expect(dialog.choosePendingInvoices).toHaveBeenCalledOnceWith({ documents: [], gaps: [{ from: '11', to: '11' }], currentNumber: 'A/12' });
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('ricalcola il numero recuperabile anche cambiando la data nello stesso anno', () => {
    component.selected.id = undefined;
    component.selected.year = 2026;
    component.selected.series = 'A';
    component.selected.type = 'TD01';
    component.selected.issueDate = '2026-08-09';
    http.get.and.returnValue(of({ number: '11' }));
    component.onInvoiceDateChange();
    expect(http.get).toHaveBeenCalledWith('/api/invoices/next-number?year=2026&series=A&type=TD01&issueDate=2026-08-09');
    expect(component.selected.number).toBe('11');
    http.get.and.returnValue(of({ number: '13' }));
    component.selected.issueDate = '2026-08-11';
    component.onInvoiceDateChange();
    expect(component.selected.number).toBe('13');
  });

  it('se nessun numero è compatibile svuota il suggerimento e rimuove l’errore quando cambia la data', () => {
    component.selected.id = undefined;
    component.selected.issueDate = '2026-08-01';
    http.get.and.returnValue(throwError(() => ({ error: { error: 'Nessun numero compatibile' } })));
    component.loadNextNumber();
    expect(component.selected.number).toBe('');
    expect(component.error).toContain('Nessun numero compatibile');
    component.selected.issueDate = '2026-08-10';
    http.get.and.returnValue(of({ number: '11' }));
    component.loadNextNumber();
    expect(component.selected.number).toBe('11');
    expect(component.error).toBe('');
  });

  it('una risposta vecchia non sovrascrive il numero compatibile con la nuova data', () => {
    component.selected.id = undefined;
    component.selected.issueDate = '2026-08-09';
    const old = new Subject<any>();
    http.get.and.returnValue(old);
    component.loadNextNumber();
    component.selected.issueDate = '2026-08-11';
    http.get.and.returnValue(of({ number: '13' }));
    component.loadNextNumber();
    old.next({ number: '11' });
    expect(component.selected.number).toBe('13');
  });

  it('ricalcola il suggerimento cambiando serie solo per i nuovi documenti', () => {
    const next = spyOn(component, 'loadNextNumber');
    component.onInvoiceSeriesChange();
    expect(next).not.toHaveBeenCalled();
    component.selected.id = undefined;
    component.onInvoiceSeriesChange();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('propone un numero anche aprendo direttamente la pagina nuova fattura', () => {
    component.selected.id = undefined;
    component.selected.number = '';
    component.pageMode = 'new';
    const next = spyOn(component, 'loadNextNumber');
    http.get.and.returnValue(of({}));
    component.loadInvoiceSettings();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('usa la serie configurata per il tipo documento e ricalcola il numero', () => {
    component.selected.id = undefined;
    component.selected.type = 'TD04';
    component.seriesCatalog.defaults['TD04'] = 'CRED';
    const next = spyOn(component, 'loadNextNumber');
    component.onDocumentTypeChange();
    expect(component.selected.series).toBe('CRED');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('salva le serie e le descrizioni nelle impostazioni', () => {
    http.post.and.returnValue(of({ series: [{ code: 'A', label: 'Vendite' }], defaults: { TD01: 'A' } }));
    component.saveSeries();
    expect(http.post.calls.mostRecent().args[0]).toBe('/api/invoices/settings/series/save');
    expect(component.seriesForType('TD01')).toBe('A');
    expect(component.savingSeries).toBeFalse();
  });

  it('cambiare anno della data documento aggiorna l’anno di numerazione', () => {
    component.selected.issueDate = '2025-12-31';
    component.onInvoiceDateChange();
    expect(component.selected.year).toBe(2025);
  });
});
