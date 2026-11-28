import { isCustomerPortalHost, localCustomerPortalTenant } from './customer-portal-host';

describe('Customer portal host routing', () => {
  it('recognizes local customer hosts for any valid tenant, separately from the internal login', () => {
    for (const host of ['sami.customer.local', 'emmeci.customer.localhost', 'nuova-ditta.customer.localhost', 'SAMI.CUSTOMER.LOCAL.']) {
      expect(isCustomerPortalHost(host)).toBeTrue();
      expect(localCustomerPortalTenant(host)).toBe(host.split('.')[0].toLowerCase());
    }
    for (const host of ['sami.local', 'localhost', 'unknown.customer.local.example.com', 'bad_id.customer.local', 'a.b.customer.local']) {
      expect(isCustomerPortalHost(host)).toBeFalse();
      expect(localCustomerPortalTenant(host)).toBe('');
    }
    expect(isCustomerPortalHost('sami.clienti.mvtechcore.it')).toBeTrue();
    expect(localCustomerPortalTenant('sami.clienti.mvtechcore.it')).toBe('');
  });
});
