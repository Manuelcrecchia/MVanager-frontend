import { TenantService } from './tenant.service';

describe('TenantService', () => {
  it('should be exported', () => {
    expect(TenantService).toBeTruthy();
  });

  it('recognizes private network addresses used for mobile browser testing', () => {
    const service = new TenantService();
    const isPrivateNetworkHost = (service as any).isPrivateNetworkHost.bind(service);

    expect(isPrivateNetworkHost('192.168.1.69')).toBeTrue();
    expect(isPrivateNetworkHost('10.0.0.8')).toBeTrue();
    expect(isPrivateNetworkHost('172.16.0.4')).toBeTrue();
    expect(isPrivateNetworkHost('172.31.255.4')).toBeTrue();
    expect(isPrivateNetworkHost('172.32.0.4')).toBeFalse();
    expect(isPrivateNetworkHost('8.8.8.8')).toBeFalse();
  });

  it('reads the tenant query parameter when opened through a private IP', () => {
    const originalPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState({}, '', '/?tenant=sami');

    try {
      const service = new TenantService();
      spyOn<any>(service, 'resolveHost').and.returnValue('192.168.1.69');

      expect(service.selectedTenant).toBe('sami');
      expect(service.tenant).toBe('sami');
    } finally {
      window.history.replaceState({}, '', originalPath);
    }
  });
});
