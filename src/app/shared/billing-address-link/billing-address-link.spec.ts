import { GlobalService } from '../../service/global.service';
import { BillingAddressLinkComponent } from './billing-address-link.component';
import { TestBed } from '@angular/core/testing';

describe('scelta indirizzo di fatturazione', () => {
  it('i vecchi nomi seguono la fatturazione attuale senza riapparire o sovrascrivere le colonne storiche', () => {
    const service = setup(), config = service.getBillingAddressLinkConfig()!;
    config.version = 2;
    (service as any).tenantConfig.quoteConfig.fieldMapping.customer.fields.push({key:'viaDiFatturazione',dbColumn:'viaDiFatturazione',label:'Via precedente',type:'text',required:true,billingAliasOf:'billingStreet'});
    const record:any = {billingAddressSource:'independent',billingStreet:'Via Attuale 9',billingCity:'Roma',billingZip:'00100',viaDiFatturazione:'Via Storica 1'};
    expect(service.getVisibleFieldMappingFields('customer',record).map(f=>f.key)).not.toContain('viaDiFatturazione');
    expect(record.viaDiFatturazione).toBe('Via Attuale 9');
    const payload:any = service.applyFieldMappingToPayload('customer',{},record);
    expect(payload.viaDiFatturazione).toBeUndefined();
    expect(payload.billingStreet).toBe('Via Attuale 9');
    record.billingStreet = ''; service.applyBillingAddressChoice('customer',record);
    expect(record.viaDiFatturazione).toBe('');
    expect(service.getMissingRequiredFields('customer',record)).not.toContain('Via precedente');
  });
  function setup() {
    const service = new GlobalService({ token: '', userCode: '', permissions: [] } as any, { tenant: 'test', tenantLabel: 'Test' } as any, {} as any);
    const billing = { address: 'billingStreet', city: 'billingCity', zip: 'billingZip', country: 'billingCountry' };
    const origin = { address: 'from', city: 'fromCity', zip: 'fromZip', prefix: 'prefix' };
    const destination = { address: 'to', city: 'toCity', zip: 'toZip' };
    const fields = [...new Set([...Object.values(billing), ...Object.values(origin), ...Object.values(destination)])].map(key => ({key, dbColumn: key, type: 'text', visible: true, required: key === 'billingCity'}));
    (service as any).tenantConfig = { quoteConfig: { addressConfig: {workSameAsBilling: false, work: origin, billingLink: { enabled: true, billing: {customer: billing, quote: billing}, sources: [
      {id: 'departure', label: 'Uguale alla partenza', customer: origin, quote: origin},
      {id: 'arrival', label: 'Uguale alla destinazione', customer: destination, quote: destination},
    ]}}, fieldMapping: {customer: {fields}, quote: {fields}}}};
    return service;
  }

  for (const scope of ['customer', 'quote'] as const) {
    it(`nasconde i campi copiati, aggiorna i dati e salva la scelta (${scope})`, () => {
      const service = setup();
      const record: any = {billingAddressSource: 'departure', prefix: 'Via', from: 'Roma 10', fromCity: 'Pescara', fromZip: '65100', to: 'Verdi 20', toCity: 'Milano', toZip: '20100'};
      expect(service.getVisibleFieldMappingFields(scope, record).map(f => f.key)).not.toContain('billingStreet');
      expect(record.billingStreet).toBe('Via Roma 10');
      record.from = 'Bologna 12';
      const payload: any = service.applyFieldMappingToPayload(scope, {}, record);
      expect(payload.billingStreet).toBe('Via Bologna 12');
      expect(payload.billingAddressSource).toBe('departure');
      expect(service.getMissingRequiredFields(scope, record)).toEqual([]);
      record.billingAddressSource = 'arrival';
      service.getVisibleFieldMappingFields(scope, record);
      expect([record.billingStreet, record.billingCity, record.billingZip]).toEqual(['Verdi 20', 'Milano', '20100']);
      record.billingAddressSource = 'independent'; record.billingStreet = 'Separato 1';
      expect(service.getVisibleFieldMappingFields(scope, record).map(f => f.key)).toContain('billingStreet');
      expect(service.applyFieldMappingToPayload(scope, {}, record)).toEqual(jasmine.objectContaining({billingStreet: 'Separato 1', billingAddressSource: 'independent'}));
    });
  }

  it('mantiene gli indirizzi precedenti finché non viene scelta una sorgente', () => {
    const service = setup(), record: any = {billingStreet: 'Vecchio indirizzo', from: 'Nuovo lavoro'};
    service.getVisibleFieldMappingFields('customer', record);
    expect(record.billingAddressSource).toBe('independent'); expect(record.billingStreet).toBe('Vecchio indirizzo');
  });

  it('trasferisce la scelta dal preventivo anche se i campi cliente sono diversi', () => {
    const service = setup(), cfg = service.getBillingAddressLinkConfig()!;
    cfg.billing.customer = {address: 'customerBill', city: 'customerCity', zip: 'customerZip'};
    cfg.sources[1].customer = {address: 'customerTo', city: 'customerToCity', zip: 'customerToZip'};
    (service as any).tenantConfig.quoteConfig.fieldMapping.customer.fields = ['customerBill', 'customerCity', 'customerZip', 'customerTo', 'customerToCity', 'customerToZip'].map(key => ({key,dbColumn:key,type:'text'}));
    const customer: any = {};
    service.copyBillingAddressFromQuote({billingAddressSource:'arrival', to:'Via Arrivo 1',toCity:'Roma',toZip:'00100'}, customer);
    expect(customer).toEqual(jasmine.objectContaining({billingAddressSource:'arrival',customerTo:'Via Arrivo 1',customerBill:'Via Arrivo 1',customerCity:'Roma',customerZip:'00100'}));
  });

  it('la selezione nel pannello aggiorna e notifica il form', () => {
    const component = new BillingAddressLinkComponent(setup());
    component.record = {from:'Test 1',fromCity:'Roma',fromZip:'00100'};
    spyOn(component.selectionChange, 'emit'); component.choose('departure');
    expect(component.record['billingStreet']).toBe('Test 1'); expect(component.selectionChange.emit).toHaveBeenCalled();
  });

  it('mostra i campi manuali una volta sola e usa il titolo configurato per la sezione', async () => {
    const service = setup(), config = service.getBillingAddressLinkConfig()!;
    config.version = 2; config.manualLabels = {customer:'Compila sede fiscale',quote:'Indirizzo diverso del preventivo'};
    config.sources[0].scopes = {customer:false,quote:true};
    await TestBed.configureTestingModule({imports:[BillingAddressLinkComponent],providers:[{provide:GlobalService,useValue:service}]}).compileComponents();
    const fixture = TestBed.createComponent(BillingAddressLinkComponent), component = fixture.componentInstance;
    component.scope = 'customer'; component.record = {billingAddressSource:'independent',billingStreet:'Via Storica 1',billingCity:'Roma',billingZip:'00100'};
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Compila sede fiscale');
    expect(fixture.nativeElement.textContent).not.toContain('Uguale alla partenza');
    expect(fixture.nativeElement.querySelectorAll('.billing-fields').length).toBe(1);
    expect(service.getVisibleFieldMappingFields('customer',component.record).map(f=>f.key)).not.toContain('billingStreet');
    component.update('address','Via Nuova 2');
    expect(service.applyFieldMappingToPayload('customer',{},component.record)).toEqual(jasmine.objectContaining({billingStreet:'Via Nuova 2',billingAddressSource:'independent'}));
    component.choose('arrival'); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.billing-fields')).toBeNull();
    component.choose('independent'); fixture.detectChanges(); expect(fixture.nativeElement.querySelector('.billing-fields')).not.toBeNull();
    fixture.destroy();
  });

  it('un’opzione presente soltanto nel preventivo conserva l’indirizzo quando diventa cliente', () => {
    const service = setup(), config = service.getBillingAddressLinkConfig()!;
    config.version = 2; config.sources[1].scopes = {customer:false,quote:true};
    const customer:any = {};
    service.copyBillingAddressFromQuote({billingAddressSource:'arrival',billingStreet:'Indirizzo fattura 5',billingCity:'Milano',billingZip:'20100',to:'Indirizzo fattura 5'},customer);
    expect(customer.billingAddressSource).toBe('independent'); expect(customer.billingStreet).toBe('Indirizzo fattura 5');
  });

  it('ricava la provincia dal comune anche quando l’indirizzo collegato non ha un campo provincia', () => {
    const service = setup(), config = service.getBillingAddressLinkConfig()!;
    config.version = 2; config.billing.customer.province = 'billingProvince';
    const record:any = {billingAddressSource:'departure',from:'Roma 1',fromCity:'Pescara',fromZip:'65100'};
    service.applyBillingAddressChoice('customer',record);
    expect(record.billingProvince).toBe('PE');
    record.fromCity = 'Milano'; service.applyBillingAddressChoice('customer',record); expect(record.billingProvince).toBe('MI');
  });
});
