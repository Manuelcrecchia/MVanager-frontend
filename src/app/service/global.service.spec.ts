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
});
