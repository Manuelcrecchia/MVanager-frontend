import { fillMappedCustomerProvince } from './mapped-customer-province';

describe('Provincia nelle anagrafiche configurabili', () => {
  const fields = [
    { key: 'city', dbColumn: 'comune', displayRole: 'customerCity' },
    { key: 'province', dbColumn: 'provincia', displayRole: 'customerProvince' },
    { key: 'country', dbColumn: 'nazione', displayRole: 'customerCountry' },
    { key: 'workCity', dbColumn: 'comuneLavoro' }, { key: 'workProvince', dbColumn: 'provinciaLavoro' },
  ];
  const global = { getFieldMappingFields: () => fields, getEffectiveCustomerAddressFields: (kind: string) => kind === 'work' ? { city: 'workCity', province: 'workProvince' } : {} };

  it('compila solo la provincia dell’indirizzo modificato rispettando key e colonna DB', () => {
    const target: any = { comune: 'Pescara', nazione: 'IT', comuneLavoro: 'Roma', provinciaLavoro: 'RM' };
    fillMappedCustomerProvince(global, target, fields[0]);
    expect(target.provincia).toBe('PE');
    expect(target.province).toBe('PE');
    expect(target.provinciaLavoro).toBe('RM');
    target.comuneLavoro = 'Chieti';
    fillMappedCustomerProvince(global, target, fields[3]);
    expect(target.provinciaLavoro).toBe('CH');
    expect(target.provincia).toBe('PE');
  });

  it('rimuove un valore calcolato diventato incerto ma conserva le correzioni manuali', () => {
    const target: any = { comune: 'Roma', nazione: 'IT' };
    fillMappedCustomerProvince(global, target, fields[0]);
    target.comune = 'Castro';
    fillMappedCustomerProvince(global, target, fields[0]);
    expect(target.provincia).toBe('');
    target.provincia = 'LE';
    fillMappedCustomerProvince(global, target, fields[0]);
    expect(target.provincia).toBe('LE');
    target.comune = 'Pescara'; target.nazione = 'US';
    fillMappedCustomerProvince(global, target, fields[0]);
    expect(target.provincia).toBe('LE');
  });
});
