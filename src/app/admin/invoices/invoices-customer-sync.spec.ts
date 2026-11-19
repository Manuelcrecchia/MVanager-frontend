import { of, throwError } from 'rxjs';
import { InvoicesComponent } from './invoices.component';
import { GlobalService } from '../../service/global.service';

describe('Sincronizzazione anagrafica dalla fattura', () => {
  let component: InvoicesComponent;
  let http: jasmine.SpyObj<any>;
  let dialog: jasmine.SpyObj<any>;
  const conflict = {
    status: 409,
    error: { customerSync: { customerId: '42', changes: [
      { label: 'Email', previous: 'old@example.com', value: 'new@example.com' },
      { label: 'Codice SDI', previous: '', value: 'ABC1234' },
    ] } },
  };
  beforeEach(() => {
    http = jasmine.createSpyObj('HttpClient', ['post']);
    dialog = jasmine.createSpyObj('Dialog', ['confirm', 'chooseThree', 'chooseCustomerMatch']);
    component = new InvoicesComponent(http, {} as any, {} as any, {} as any,
      { url: '/api/', hasTenantFeature: () => false } as any, dialog);
    component.selected.customerEmail = 'new@example.com';
  });

  it('usa in fattura l’indirizzo di fatturazione completo e non quello del lavoro', () => {
    const global = new GlobalService({token:'',userCode:'',permissions:[]} as any,{tenant:'test',tenantLabel:'Test'} as any,{} as any);
    const billing = {prefix:'billingPrefix',address:'billingStreet',number:'billingNumber',city:'billingCity',zip:'billingZip'};
    (global as any).tenantConfig = {quoteConfig:{addressConfig:{workSameAsBilling:false,billingLink:{enabled:true,billing:{customer:billing,quote:billing},sources:[]}},fieldMapping:{customer:{fields:[...Object.values(billing),'workStreet'].map(key=>({key,dbColumn:key,type:'text'}))}}}};
    component = new InvoicesComponent(http,{} as any,{} as any,{} as any,global,dialog);
    (component as any).applyCustomerToInvoice({numeroCliente:'42',nome:'Test',billingPrefix:'VIA',billingStreet:'Roma',billingNumber:'10',billingCity:'Pescara',billingZip:'65100',workStreet:'Lavoro 99'});
    expect(component.selected.customerAddress).toBe('VIA Roma 10'); expect(component.selected.customerCity).toBe('Pescara'); expect(component.selected.customerZip).toBe('65100');
    expect((component as any).customerAddressPart({workStreet:'Lavoro 99'},'billing','address','customerAddress')).toBe('');
  });

  it('passando a privato elimina la partita IVA dalla fattura e mantiene il codice fiscale', () => {
    component.selected.customerRecipientType = 'private';
    component.selected.customerVatNumber = '12345678903';
    component.selected.customerFiscalCode = 'RSSMRA80A01H501U';
    component.onCustomerRecipientTypeChange();
    expect(component.selected.customerVatNumber).toBe('');
    expect(component.selected.customerFiscalCode).toBe('RSSMRA80A01H501U');
    expect(component.selected.customerSdiCode).toBe('0000000');
  });

  it('esclude una partita IVA residua anche prima di salvare una bozza privata', () => {
    component.selected.customerRecipientType = 'private';
    component.selected.customerVatNumber = '12345678903';
    (component as any).prepareRecipientForSubmit();
    expect(component.selected.customerVatNumber).toBe('');
    expect(component.invoiceFieldError('customerFiscalCode')).toBe('Codice fiscale obbligatorio per il privato');
  });

  it('imposta lo SDI automatico dei privati prima del salvataggio anche con un codice residuo', () => {
    component.selected.customerRecipientType = 'private';
    component.selected.customerCountry = 'IT';
    component.selected.customerSdiCode = 'ABC1234';
    (component as any).prepareRecipientForSubmit();
    expect(component.selected.customerSdiCode).toBe('0000000');
    component.selected.customerCountry = 'FR';
    component.onCustomerCountryChange();
    expect(component.selected.customerSdiCode).toBe('XXXXXXX');
    component.selected.customerSdiCode = 'ABC1234';
    (component as any).prepareRecipientForSubmit();
    expect(component.selected.customerSdiCode).toBe('XXXXXXX');
  });

  it('mantiene la partita IVA per aziende e PA', () => {
    for (const type of ['business', 'pa'] as const) {
      component.selected.customerRecipientType = type;
      component.selected.customerVatNumber = '12345678903';
      component.onCustomerRecipientTypeChange();
      (component as any).prepareRecipientForSubmit();
      expect(component.selected.customerVatNumber).toBe('12345678903');
    }
  });

  it('ripropone subito una nuova serie solo dopo il salvataggio riuscito della fattura', async () => {
    component.selected.series = 'NUOVA';
    http.post.and.returnValue(of({ ...component.selected, id: 1 }));
    await (component as any).persistInvoice('add');
    expect(component.seriesCatalog.series.some(item => item.code === 'NUOVA')).toBeTrue();
  });

  it('salva direttamente se non ci sono differenze', async () => {
    http.post.and.returnValue(of({ ...component.selected, id: 1, customerId: '42' }));
    const saved = await (component as any).persistInvoice('add');
    expect(saved.customerId).toBe('42');
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(dialog.confirm).not.toHaveBeenCalled();
  });

  for (const update of [true, false]) {
    it(`${update ? 'aggiorna' : 'mantiene'} l’anagrafica e completa il salvataggio`, async () => {
      http.post.and.returnValues(throwError(() => conflict), of({ ...component.selected, id: 1, customerId: '42' }));
      dialog.confirm.and.resolveTo(update);
      const saved = await (component as any).persistInvoice('edit');
      expect(saved.id).toBe(1);
      expect(http.post).toHaveBeenCalledTimes(2);
      expect(http.post.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
        customerEmail: 'new@example.com', customerSyncDecision: update ? 'update' : 'keep',
      }));
      expect(dialog.confirm.calls.mostRecent().args[0]).toContain('old@example.com → new@example.com');
      expect(dialog.confirm.calls.mostRecent().args[0]).toContain('Codice SDI: (vuoto) → ABC1234');
    });
  }

  for (const [choice, action, decision] of [
    ['primary', 'link', 'update'], ['secondary', 'link', 'keep'], ['tertiary', 'create', 'keep'],
  ]) {
    it(`gestisce il possibile cliente trovato per nome con indirizzo diverso: ${choice}`, async () => {
      http.post.and.returnValues(throwError(() => ({
        ...conflict, error: { customerSync: { ...conflict.error.customerSync,
          matchRequired: true, customerName: 'Mario Rossi', customerAddress: 'Via Roma 1',
        } },
      })), of({ ...component.selected, id: 1, customerId: '42' }));
      component.selected.customerAddress = 'Via Milano 15';
      dialog.chooseThree.and.resolveTo(choice);
      await (component as any).persistInvoice('add');
      expect(http.post.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
        customerSyncDecision: decision, customerMatchDecision: { customerId: '42', action },
      }));
      expect(dialog.chooseThree.calls.mostRecent().args[0]).toContain('Mario Rossi, Via Roma 1');
      expect(dialog.chooseThree.calls.mostRecent().args[0]).toContain('L’indirizzo può essere cambiato o scritto diversamente');
      expect(http.post.calls.mostRecent().args[1].customerAddress).toBe('Via Milano 15');
      expect(dialog.confirm).not.toHaveBeenCalled();
    });
  }

  for (const action of ['update', 'keep', 'create']) {
    it(`sceglie un omonimo nella finestra: ${action}`, async () => {
      const candidates = [
        { customerId: '42', customerName: 'Mario Rossi', customerAddress: 'Via Roma 1', changes: [] },
        { customerId: '43', customerName: 'Mario Rossi', customerAddress: 'Via Milano 2', customerFiscalCode: 'RSSMRA80A01H501U', changes: [] },
      ];
      http.post.and.returnValues(throwError(() => ({ status: 409,
        error: { customerSync: { matchRequired: true, allowCreate: true, changes: [], candidates } },
      })), of({ ...component.selected, id: 1, customerId: '43' }));
      dialog.chooseCustomerMatch.and.resolveTo({ customerId: '43', action });
      await (component as any).persistInvoice('add');
      expect(dialog.chooseCustomerMatch).toHaveBeenCalledWith({ candidates, allowCreate: true });
      expect(http.post.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
        customerSyncDecision: action === 'update' ? 'update' : 'keep',
        customerMatchDecision: { customerId: '43', action: action === 'create' ? 'create' : 'link' },
      }));
      expect(dialog.chooseThree).not.toHaveBeenCalled();
      expect(dialog.confirm).not.toHaveBeenCalled();
    });
  }

  it('annullare la selezione degli omonimi non ripete il salvataggio', async () => {
    http.post.and.returnValue(throwError(() => ({ status: 409,
      error: { customerSync: { changes: [], candidates: [{ customerId: '42' }] } },
    })));
    dialog.chooseCustomerMatch.and.resolveTo(null);
    await expectAsync((component as any).persistInvoice('add')).toBeRejectedWithError('Salvataggio annullato');
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(dialog.chooseCustomerMatch.calls.mostRecent().args[0].allowCreate).toBeFalse();
  });

  it('annullare il riconoscimento non salva e non crea clienti', async () => {
    http.post.and.returnValue(throwError(() => ({
      ...conflict, error: { customerSync: { ...conflict.error.customerSync, matchRequired: true } },
    })));
    dialog.chooseThree.and.resolveTo(null);
    await expectAsync((component as any).persistInvoice('add')).toBeRejectedWithError('Salvataggio annullato');
    expect(http.post).toHaveBeenCalledTimes(1);
  });

  it('aggiorna il selettore clienti dopo aver creato o riconosciuto il cliente', async () => {
    (component as any).global.hasTenantFeature = () => true;
    const refresh = spyOn(component, 'loadCustomers').and.stub();
    http.post.and.returnValue(of({ ...component.selected, id: 1, customerId: '42' }));
    await (component as any).persistInvoice('add');
    expect(component.selectedCustomerCode).toBe('42');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('propaga errori diversi dalla richiesta di conferma senza ritentare', async () => {
    const error = { status: 400 };
    http.post.and.returnValue(throwError(() => error));
    await expectAsync((component as any).persistInvoice('add')).toBeRejectedWith(error);
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(dialog.confirm).not.toHaveBeenCalled();
  });
});
