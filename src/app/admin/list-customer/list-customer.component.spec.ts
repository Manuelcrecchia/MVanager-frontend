import {numberingServiceStub} from '../../shared/numbering.spec-support';
import { ListCustomerComponent } from './list-customer.component';
import { of } from 'rxjs';

describe('ListCustomerComponent', () => {
  it('should be exported', () => {
    expect(ListCustomerComponent).toBeTruthy();
  });

  it('filtra i clienti con problemi di indirizzo e ripristina la lista quando sono corretti', () => {
    const component = new ListCustomerComponent({ get: () => of({ issues: {} }) } as any, { ...numberingServiceStub(), getRecordDisplayName: (_scope: string, customer: any) => customer.numeroCliente, url: '/api/', hasTenantFeature: () => true } as any, null as any, null as any, null as any, null as any, null as any, null as any, null as any);
    component.customers = [{ numeroCliente: '1' }, { numeroCliente: '2' }];
    component.workplaceIssues = { '2': [{ code: 'CIVIC_MISSING', label: 'Civico da verificare', tone: 'warning' }] };
    component.onlyWorkplaceIssues = true;
    component.applyCustomerSearch();
    expect(component.customersFrEnd.map(customer => customer.numeroCliente)).toEqual(['2']);
    component.showArchived = true;
    component.applyCustomerSearch();
    expect(component.customersFrEnd.length).toBe(2);
    component.showArchived = false;
    component.loadWorkplaceIssues();
    expect(component.workplaceIssueCount).toBe(0);
    expect(component.onlyWorkplaceIssues).toBeFalse();
    expect(component.customersFrEnd.length).toBe(2);
  });

  it('ordina alfabeticamente per impostazione predefinita e usa il numero cliente come spareggio', () => {
    const component = new ListCustomerComponent(null as any, numberingServiceStub() as any, null as any, null as any, null as any, null as any, null as any, null as any, null as any);
    spyOn(component, 'getCustomerDisplayName').and.callFake((customer: any) => customer.name);

    component.customers = [
      { numeroCliente: '10', name: 'Zeta' },
      { numeroCliente: '12', name: 'Alfa' },
      { numeroCliente: '2', name: 'Alfa' },
    ];
    component.applyCustomerSearch();

    expect(component.customersFrEnd.map((customer) => customer.numeroCliente)).toEqual(['2', '12', '10']);
  });

  it('ordina il numero cliente in modo numerico crescente e decrescente', () => {
    const component = new ListCustomerComponent(null as any, numberingServiceStub() as any, null as any, null as any, null as any, null as any, null as any, null as any, null as any);
    component.customers = [{ numeroCliente: '101' }, { numeroCliente: '11' }, { numeroCliente: '2' }];

    component.customerSort = 'numberAsc';
    component.applyCustomerSearch();
    expect(component.customersFrEnd.map((customer) => customer.numeroCliente)).toEqual(['2', '11', '101']);

    component.customerSort = 'numberDesc';
    component.applyCustomerSearch();
    expect(component.customersFrEnd.map((customer) => customer.numeroCliente)).toEqual(['101', '11', '2']);
  });
});

describe('Prezzo del profilo dal campo cliente', () => {
  let component: ListCustomerComponent;
  const line = { priceSource: 'customerField', priceField: 'tariffa', unitPriceInput: 100 };

  beforeEach(() => {
    component = new ListCustomerComponent(null as any, { getRecordValueByRole: () => undefined } as any, null as any, null as any, null as any, null as any, null as any, null as any, null as any);
  });

  it('segnala subito testo e valori vuoti senza usare il vecchio prezzo fisso', () => {
    for (const value of ['marco', '12 euro', '', null, true]) {
      component.profileCustomer = { tariffa: value };
      expect(component.invoiceProfileFieldError('priceField', line)).not.toBe('');
      expect(component.invoiceProfileCustomerPrice(line)).toBeNull();
      expect(line.unitPriceInput).toBe(100);
    }
  });

  it('mostra numeri e decimali con virgola e accetta zero', () => {
    for (const [value, expected] of [[125, 125], ['12,50', 12.5], ['12.50', 12.5], [0, 0]]) {
      component.profileCustomer = { tariffa: value };
      expect(component.invoiceProfileFieldError('priceField', line)).toBe('');
      expect(component.invoiceProfileCustomerPrice(line)).toBe(expected as number);
    }
  });

  it('rifiuta prezzi negativi e ignora il campo cliente in modalità prezzo fisso', () => {
    component.profileCustomer = { tariffa: -10 };
    expect(component.invoiceProfileFieldError('priceField', line)).toContain('maggiore o uguale a zero');
    expect(component.invoiceProfileFieldError('priceField', { ...line, priceSource: 'fixed' })).toBe('');
  });

  it('impedisce il salvataggio quando il profilo ha errori', () => {
    component.profileCustomer = { numeroCliente: '42', tariffa: 'marco' };
    spyOn(component, 'invoiceProfileHasErrors').and.returnValue(true);
    component.saveInvoiceProfile();
    expect(component.invoiceProfileSaving).toBeFalse();
  });
});

describe('Tipo anagrafica del profilo cliente', () => {
  const makeComponent = (mapped?: string) => new ListCustomerComponent(null as any, {
    getRecordValueByRole: (_scope: string, _customer: any, role: string) => role === 'customerRecipientType' ? mapped : undefined,
  } as any, null as any, null as any, null as any, null as any, null as any, null as any, null as any);

  it('legge il ruolo configurato anche da un campo personalizzato', () => {
    const component = makeComponent('Privato');
    component.profileCustomer = { tipoAnagrafica: 'Azienda privata' };
    expect(component.invoiceProfileCustomerRecipientType()).toBe('private');
  });

  it('distingue azienda privata, privato e pubblica amministrazione', () => {
    const component = makeComponent();
    for (const [value, expected] of [['Azienda privata', 'business'], ['Privato', 'private'], ['Pubblica amministrazione', 'pa']]) {
      component.profileCustomer = { tipoAnagrafica: value };
      expect(component.invoiceProfileCustomerRecipientType()).toBe(expected as any);
    }
  });

  it('deduce il privato dal codice fiscale se manca il tipo', () => {
    const component = makeComponent();
    component.profileCustomer = { cfpi: 'RSSMRA80A01H501U' };
    expect(component.invoiceProfileCustomerRecipientType()).toBe('private');
  });
});
