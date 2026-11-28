import { GlobalService } from './global.service';

describe('GlobalService', () => {
  it('mantiene prefisso e civico nel percorso di configurazione dell’indirizzo operativo',()=>{
    const service=addressService();
    Object.assign((service as any).tenantConfig.addressConfig.work,{prefix:'tipoVia',number:'civico'});
    (service as any).tenantConfig.quoteConfig.fieldMapping.customer.fields.push({key:'tipoVia',dbColumn:'prefisso_sede'},{key:'civico',dbColumn:'numero_sede'});
    const fields=service.getEffectiveCustomerAddressFields('work');
    expect(fields.prefix).toBe('tipoVia');expect(fields.number).toBe('civico');
    expect(service.buildCustomerAddress({prefisso_sede:'PIAZZA',sede_operativa:'Roma',numero_sede:'12/A',citta_lavoro:'Pescara',cap_lavoro:'65100'},'work')).toBe('PIAZZA Roma 12/A, 65100 Pescara');
  });
  it('un prefisso o la nazione predefinita da soli non diventano un indirizzo completo',()=>{
    const service=addressService();
    const config=(service as any).tenantConfig.addressConfig;
    config.work={prefix:'tipoVia',number:'civico',country:'paese'};config.billing={};
    expect(service.buildCustomerAddress({tipoVia:'VIA',civico:'9',paese:'IT'},'work')).toBe('');
  });
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

describe('automatic web quote summaries', () => {
  it('calculates and displays two decimals for both monetary and other formulas', () => {
    const service = new GlobalService(
      { token: '', userCode: '', permissions: [] } as any,
      { tenant: 'test', tenantLabel: 'Test' } as any,
      {} as any,
    );
    const result = (key: string, type: string, decimals: number, displayRole = '') => ({
      key, dbColumn: key, type, displayRole,
      calculation: { mode: 'sum', sourceFields: ['base'], decimals },
    });
    const money = result('amount', 'money', 0);
    const total = result('total', 'number', 4, 'quoteTotal');
    const ordinary = result('measure', 'number', 3);
    const text = result('subtotal', 'text', 0);
    const fields = [{ key: 'base', dbColumn: 'base', type: 'number' }, money, total, ordinary, text];
    (service as any).tenantConfig = { quoteConfig: { fieldMapping: { quote: { fields } } } };

    const data: Record<string, unknown> = { base: '12,126' };
    service.applyCalculatedFields('quote', data);
    expect(data).toEqual({ base: '12,126', amount: 12.13, total: 12.13, measure: 12.13, subtotal: 12.13 });
    expect(service.getRecordDisplayValueForField({ amount: 12 }, money as any)).toBe('12,00');
    expect(service.getRecordDisplayValueForField({ measure: 12 }, ordinary as any)).toBe('12,00');
    expect(service.getRecordDisplayValueForField({ subtotal: 12 }, text as any)).toBe('12,00');
  });

  it('updates campaign quantity, monthly/annual renewals and VAT when inputs change', () => {
    const service = new GlobalService({ token:'', userCode:'', permissions:[] } as any, {tenant:'test',tenantLabel:'Test'} as any, {} as any);
    const term = (field:string, quantityField='', whenField='', whenValue='') => ({field,quantityField,whenField,whenValue});
    const make = (key:string, terms:any[], vatField='') => ({key,dbColumn:key,type:'money',calculation:{mode:vatField?'sum_with_vat':'sum',sourceFields:[...new Set(terms.flatMap(t=>[t.field,t.quantityField,t.whenField].filter(Boolean)))],terms,vatField,decimals:2}});
    const fields:any[]=[...['sito','campagna','numero','dominio','email','gestione','periodoEmail','periodoGestione','iva'].map(key=>({key,dbColumn:key})),
      make('primo',[term('sito'),term('campagna','numero'),term('dominio'),term('email'),term('gestione')]),
      make('mensile',[term('email','','periodoEmail','Mensile'),term('gestione','','periodoGestione','Mensile')]),
      make('annuale',[term('dominio'),term('email','','periodoEmail','Annuale'),term('gestione','','periodoGestione','Annuale')]),
      make('lordo',[term('primo')],'iva')];
    (service as any).tenantConfig={quoteConfig:{fieldMapping:{quote:{fields}}}};
    const data:any={sito:1000,campagna:50,numero:2,dominio:120,email:10,gestione:200,periodoEmail:'Mensile',periodoGestione:'Annuale',iva:'22%'};
    service.applyCalculatedFields('quote',data);
    expect([data.primo,data.mensile,data.annuale,data.lordo]).toEqual([1430,10,320,1744.6]);
    data.numero=3; data.periodoEmail='Annuale'; data.periodoGestione='Mensile';
    service.applyCalculatedFields('quote',data);
    expect([data.primo,data.mensile,data.annuale,data.lordo]).toEqual([1480,200,130,1805.6]);
    data.numero=0; data.email=0; data.gestione=0; data.dominio=0;
    service.applyCalculatedFields('quote',data);
    expect([data.primo,data.mensile,data.annuale,data.lordo]).toEqual([1000,0,0,1220]);
  });
});

describe('service selection checkboxes', () => {
  it('shows only selected service fields, respects type scope and excludes stale amounts', () => {
    const service=new GlobalService({token:'',userCode:'',permissions:[]} as any,{tenant:'test',tenantLabel:'Test'} as any,{} as any);
    const fields:any[]=[{key:'websiteSelected',dbColumn:'websiteSelected',type:'boolean',visibleWhen:{field:'tipoPreventivo',value:'WEB'}},{key:'websitePrice',dbColumn:'websitePrice',type:'money',required:true,visibleWhen:{field:'websiteSelected',value:'true'}},{key:'total',dbColumn:'total',type:'money',calculation:{mode:'sum',sourceFields:['websitePrice']}}];
    (service as any).tenantConfig={quoteConfig:{fieldMapping:{quote:{fields}}}};
    const value:any={tipoPreventivo:'WEB',websiteSelected:false,websitePrice:500};
    service.applyCalculatedFields('quote',value);expect(value.total).toBe(0);
    expect(service.getVisibleFieldMappingFields('quote',value).map(f=>f.key)).not.toContain('websitePrice');
    expect(service.getMissingRequiredFields('quote',{...value,websitePrice:''})).toEqual([]);
    value.websiteSelected=true;service.applyCalculatedFields('quote',value);expect(value.total).toBe(500);
    expect(service.getVisibleFieldMappingFields('quote',value).map(f=>f.key)).toContain('websitePrice');
    expect(service.getMissingRequiredFields('quote',{...value,websitePrice:''})).toEqual(['websitePrice']);
    value.tipoPreventivo='MVanager';service.applyCalculatedFields('quote',value);expect(value.total).toBe(0);
    expect(service.getVisibleFieldMappingFields('quote',value).map(f=>f.key)).not.toContain('websitePrice');
  });
});
