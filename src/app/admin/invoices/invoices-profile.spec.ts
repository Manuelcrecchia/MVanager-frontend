import { of } from 'rxjs';
import { InvoicesComponent } from './invoices.component';

describe('Generazione fattura dal profilo cliente', () => {
  let component: InvoicesComponent;
  let http: jasmine.SpyObj<any>;
  let dialog: jasmine.SpyObj<any>;
  let profile: any;
  const apply = () => (component as any).applySavedCustomerInvoiceProfile({ numeroCliente: '42' });

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 10, 1, 12));
    profile = { enabled: true, fixedLines: [{ description: 'Canone', quantity: 1, unitPriceInput: 150, priceSource: 'fixed', vatRate: 22 }] };
    http = jasmine.createSpyObj('HttpClient', ['get']);
    http.get.and.callFake((url: string) => of(url.includes('customer-profile') ? profile : { clienti: [{ numeroCliente: '42', totale: 12.5 }] }));
    dialog = jasmine.createSpyObj('Dialog', ['prompt', 'chooseThree']);
    dialog.chooseThree.and.resolveTo('tertiary');
    component = new InvoicesComponent(http, {} as any, {} as any, {} as any, { url: '/api/', getRecordValueByRole: () => undefined } as any, dialog);
    component.selected.issueDate = '2026-11-02';
    spyOn<any>(component, 'showProfilePrefillMessage').and.stub();
  });

  afterEach(() => jasmine.clock().uninstall());

  it('il tipo nella scheda cliente prevale sul vecchio tipo salvato nel profilo', async () => {
    profile.header = { customerRecipientType: 'business' };
    await (component as any).applySavedCustomerInvoiceProfile({ numeroCliente: '42', tipoAnagrafica: 'Privato' });
    expect(component.selected.customerRecipientType).toBe('private');
  });

  it('riporta il prezzo fisso nella bozza e nei totali', async () => {
    await apply();
    expect(component.selected.lines[0].unitPriceInput).toBe(150);
    expect(component.selected.lines[0].unitPrice).toBe(150);
    expect(component.totals()).toEqual({ subtotal: 150, vatTotal: 33, total: 183 });
    expect(dialog.prompt).not.toHaveBeenCalled();
  });

  it('chiede il periodo anche per le righe fisse e sostituisce mese e anno', async () => {
    profile.fixedLines[0].description = 'Servizio di {{ mese }} {{ANNO}}';
    dialog.prompt.and.resolveTo('2026-10');
    await apply();
    expect(component.selected.lines[0].description).toBe('Servizio di ottobre 2026');
    expect(component.selected.lines[0].unitPriceInput).toBe(150);
    expect(dialog.prompt).toHaveBeenCalledTimes(1);
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  it('sostituisce il solo mese senza aggiungere implicitamente l’anno', async () => {
    profile.fixedLines[0].description = 'Servizio di {{mese}}';
    dialog.prompt.and.resolveTo('2026-11');
    await apply();
    expect(component.selected.lines[0].description).toBe('Servizio di novembre');
  });

  it('converte il prezzo IVA inclusa nel prezzo netto', async () => {
    Object.assign(profile.fixedLines[0], { unitPriceInput: 122, priceIncludesVat: true });
    await apply();
    expect(component.selected.lines[0].unitPriceInput).toBe(122);
    expect(component.selected.lines[0].unitPrice).toBe(100);
    expect(component.totals().total).toBe(122);
  });

  it('supporta i profili con il precedente campo unitPrice', async () => {
    delete profile.fixedLines[0].unitPriceInput;
    profile.fixedLines[0].unitPrice = 80;
    await apply();
    expect(component.selected.lines[0].unitPriceInput).toBe(80);
  });

  it('mantiene le righe fisse quando include le ore del mese', async () => {
    profile.variableLines = [{ description: 'Ore {{mese}} {{anno}}', unitPriceInput: 20, vatRate: 22 }];
    dialog.prompt.and.returnValues(Promise.resolve('dinamica'), Promise.resolve('2026-10'));
    await apply();
    expect(component.selected.lines.length).toBe(2);
    expect(component.selected.lines[0].unitPrice).toBe(150);
    expect(component.selected.lines[1].quantity).toBe(12.5);
    expect(component.selected.lines[1].description).toBe('Ore ottobre 2026');
    expect(component.totals().subtotal).toBe(400);
  });

  for (const choice of ['primary', 'secondary']) {
    it(`usa il mese ${choice === 'primary' ? 'corrente' : 'precedente'} mantenendo la data fattura`, async () => {
      profile.fixedLines[0].description = 'Servizio {{mese}} {{anno}}';
      component.selected.issueDate = '2026-10-30';
      dialog.chooseThree.and.resolveTo(choice);
      await apply();
      expect(component.selected.lines[0].description).toBe(choice === 'primary' ? 'Servizio novembre 2026' : 'Servizio ottobre 2026');
      expect(component.selected.issueDate).toBe('2026-10-30');
      expect(dialog.prompt).not.toHaveBeenCalled();
      expect(dialog.chooseThree).toHaveBeenCalledWith(jasmine.any(String), 'Periodo di competenza', jasmine.objectContaining({
        primaryLabel: 'Mese corrente (novembre 2026)', secondaryLabel: 'Mese precedente (ottobre 2026)', tertiaryLabel: 'Altro mese',
      }));
    });
  }

  it('sceglie dicembre dell’anno precedente a gennaio e usa quel periodo per le ore', async () => {
    jasmine.clock().mockDate(new Date(2027, 0, 1, 12));
    profile.variableLines = [{ description: 'Ore {{mese}} {{anno}}', unitPriceInput: 20, vatRate: 22 }];
    dialog.prompt.and.resolveTo('dinamica');
    dialog.chooseThree.and.resolveTo('secondary');
    await apply();
    expect(component.selected.lines[1].description).toBe('Ore dicembre 2026');
    expect(component.selected.lines[1].quantity).toBe(12.5);
    expect(http.get).toHaveBeenCalledWith('/api/admin/attendance/getMonthlyByCustomer/12/2026');
  });

  it('annulla la scelta del periodo senza applicare il profilo', async () => {
    profile.fixedLines[0].description = 'Servizio {{mese}}';
    const originalLines = component.selected.lines;
    dialog.chooseThree.and.resolveTo(null);
    await apply();
    expect(component.selected.lines).toBe(originalLines);
    expect(dialog.prompt).not.toHaveBeenCalled();
    expect(http.get).toHaveBeenCalledTimes(1);
  });

  for (const input of [null, '2026-13']) {
    it(`non applica parzialmente il profilo con periodo ${input}`, async () => {
      profile.fixedLines[0].description = 'Servizio {{mese}}';
      const originalLines = component.selected.lines;
      dialog.prompt.and.resolveTo(input);
      await apply();
      expect(component.selected.lines).toBe(originalLines);
      if (input !== null) expect(component.error).toContain('Mese non valido');
    });
  }
});
