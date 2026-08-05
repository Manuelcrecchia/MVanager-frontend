import { inferRecipientTypeFromTaxIds, resolveCustomerTaxIdentifiers } from './customer-tax-id.util';

describe('customer tax id automatic mapping', () => {
  it('maps an 11 digit company value to VAT', () => {
    expect(resolveCustomerTaxIdentifiers({ recipientType: 'business', country: 'IT', combinedTaxId: '12345678901' }))
      .toEqual({ vatNumber: '12345678901', fiscalCode: '' });
  });

  it('maps a 16 character value to fiscal code', () => {
    expect(resolveCustomerTaxIdentifiers({ recipientType: 'business', country: 'IT', combinedTaxId: 'RSSMRA80A01H501U' }))
      .toEqual({ vatNumber: '', fiscalCode: 'RSSMRA80A01H501U' });
  });

  it('always maps a private recipient value to fiscal code', () => {
    expect(resolveCustomerTaxIdentifiers({ recipientType: 'private', country: 'IT', combinedTaxId: '12345678901' }))
      .toEqual({ vatNumber: '', fiscalCode: '12345678901' });
  });

  it('keeps explicit separate fields authoritative', () => {
    expect(resolveCustomerTaxIdentifiers({ recipientType: 'business', country: 'IT', vatNumber: '11111111115', fiscalCode: 'RSSMRA80A01H501U', combinedTaxId: '99999999999' }))
      .toEqual({ vatNumber: '11111111115', fiscalCode: 'RSSMRA80A01H501U' });
  });

  it('infers private recipients from a combined 16 character value', () => {
    expect(inferRecipientTypeFromTaxIds('', '', 'RSSMRA80A01H501U')).toBe('private');
  });
});
