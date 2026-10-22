import { GlobalService } from './global.service';

describe('GlobalService', () => {
  it('should be exported', () => {
    expect(GlobalService).toBeTruthy();
  });

  it('uses the tenant feature catalog as the source of truth for invoices', () => {
    const service = new GlobalService(
      { token: '', userCode: '', permissions: [] } as any,
      { tenant: 'test', tenantLabel: 'Test' } as any,
      {} as any,
    );
    (service as any).tenantConfig = { features: ['invoices'] };

    expect(service.isFeatureAvailableInApp('invoices')).toBeTrue();
  });

  it('still hides invoices when the tenant has not purchased the feature', () => {
    const service = new GlobalService(
      { token: '', userCode: '', permissions: [] } as any,
      { tenant: 'test', tenantLabel: 'Test' } as any,
      {} as any,
    );
    (service as any).tenantConfig = { features: ['customers'] };

    expect(service.isFeatureAvailableInApp('invoices')).toBeFalse();
  });

  it('riconosce clienti e preventivi anonimizzati senza esporre valori mappati', () => {
    const service = new GlobalService(
      { token: '', userCode: '', permissions: [] } as any,
      { tenant: 'test', tenantLabel: 'Test' } as any,
      {} as any,
    );
    const anonymousCustomer = {
      numeroCliente: 'X-000042',
      ragioneSociale: 'dato che non deve comparire',
    };

    expect(service.isAnonymizedRecord(anonymousCustomer)).toBeTrue();
    expect(service.isAnonymizedRecord({ customerId: 'X-000043' })).toBeTrue();
    expect(service.isAnonymizedRecord({ customer: { numeroCliente: 'X-000044' } })).toBeTrue();
    expect(service.isAnonymizedRecord({ entityType: 'customer', targetKey: 'X-000045' })).toBeTrue();
    expect(service.isAnonymizedRecord({ numeroCliente: '42' })).toBeFalse();
    expect(service.getRecordDisplayName('customer', anonymousCustomer)).toBe('');
  });
  function addressService(workSameAsBilling = false): GlobalService {
    const service = new GlobalService({ token: '', userCode: '', permissions: [] } as any,
      { tenant: 'test', tenantLabel: 'Test' } as any, {} as any);
    (service as any).tenantConfig = {
      addressConfig: { workSameAsBilling,
        work: { address: 'via', city: 'citta', zip: 'cap' },
        billing: { address: 'viaDiFatturazione', city: 'cittaDiFatturazione', zip: 'capDiFatturazione' } },
      quoteConfig: { fieldMapping: {
        customer: { fields: [
          { key: 'via', dbColumn: 'sede_operativa', label: 'Via del lavoro' },
          { key: 'citta', dbColumn: 'citta_lavoro', label: 'Citta lavoro' },
          { key: 'cap', dbColumn: 'cap_lavoro', label: 'CAP lavoro' },
          { key: 'viaDiFatturazione', dbColumn: 'viaDiFatturazione', label: 'Via fatturazione', displayRole: 'customerAddress' },
          { key: 'cittaDiFatturazione', dbColumn: 'cittaDiFatturazione', label: 'Citta fatturazione', displayRole: 'customerCity' },
        ] },
        quote: { fields: [
          { key: 'via', dbColumn: 'indirizzo_sopralluogo', label: 'Via' },
          { key: 'citta', dbColumn: 'comune_sopralluogo', label: 'Citta' },
          { key: 'cap', dbColumn: 'cap_sopralluogo', label: 'CAP' },
        ] },
      } },
    };
    return service;
  }

  it('uses only the configured work fields, even when generic roles point at billing', () => {
    const service = addressService();
    const record = { sede_operativa: 'Roma 12', selettorePrefissoVia: 'Via', citta_lavoro: 'Modena', cap_lavoro: '41100',
      viaDiFatturazione: 'Via Fatture 99', cittaDiFatturazione: 'Milano', capDiFatturazione: '20100' };
    expect(service.buildCalendarWorkAddress(record)).toBe('Via Roma 12, 41100 Modena');
    expect(record.viaDiFatturazione).toBe('Via Fatture 99');
  });

  it('keeps a missing work street blank rather than navigating to billing or just a city', () => {
    const service = addressService();
    expect(service.buildCalendarWorkAddress({ sede_operativa: '', citta_lavoro: 'Modena',
      viaDiFatturazione: 'Via Fatture 99', cittaDiFatturazione: 'Milano' })).toBe('');
  });

  it('reads quote work addresses through their field mapping instead of raw legacy columns', () => {
    const service = addressService();
    expect(service.buildCalendarWorkAddress({ indirizzo_sopralluogo: 'Via Roma 12',
      comune_sopralluogo: 'Modena', cap_sopralluogo: '41100', viaDiFatturazione: 'Via Fatture 99',
      selettorePrefissoVia: 'Via' }, 'quote')).toBe('Via Roma 12, 41100 Modena');
  });

  it('uses billing fields only when the configuration explicitly declares a shared address', () => {
    const service = addressService(true);
    expect(service.buildCalendarWorkAddress({ viaDiFatturazione: 'Roma 12', selettorePrefissoViaDiFatturazione: 'Via',
      cittaDiFatturazione: 'Modena', capDiFatturazione: '41100' })).toBe('Via Roma 12, 41100 Modena');
  });

  it('does not infer a shared address from generic billing roles when the mode is unconfigured', () => {
    const service = addressService();
    delete (service as any).tenantConfig.addressConfig;
    expect(service.buildCalendarWorkAddress({ viaDiFatturazione: 'Via Fatture 99', cittaDiFatturazione: 'Milano' })).toBe('');
  });

  it('does not expose an anonymized customer address', () => {
    expect(addressService().buildCalendarWorkAddress({ numeroCliente: 'X-000042', sede_operativa: 'Via Roma 12' })).toBe('');
  });

});
