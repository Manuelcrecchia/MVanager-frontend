import { AuthServiceService } from './auth-service.service';
import { fakeAsync, flush, tick } from '@angular/core/testing';
import { Preferences } from '@capacitor/preferences';

describe('AuthServiceService', () => {
  // Load the Capacitor web adapter before fakeAsync advances hours of time;
  // otherwise its dynamic import can hit the simulated chunk timeout.
  beforeAll(async () => { await Preferences.get({ key: 'auth-test-adapter-initialization' }); });
  const jwtValidFor = (milliseconds: number): string => {
    const encode = (value: object) => btoa(JSON.stringify(value))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      exp: Math.floor((Date.now() + milliseconds) / 1000),
      tenantId: 'test',
      permissions: [],
    })}.signature`;
  };

  const createService = () => {
    const router = { navigateByUrl: jasmine.createSpy('navigateByUrl') };
    const mobilePush = {
      reset: jasmine.createSpy('reset'),
      initAfterLogin: jasmine.createSpy('initAfterLogin').and.resolveTo(),
    };
    const tenant = { setTenantFromToken: jasmine.createSpy('setTenantFromToken') };
    return {
      service: new AuthServiceService(router as any, mobilePush as any, tenant as any),
      router,
    };
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    spyOn(Preferences, 'get').and.resolveTo({ value: null });
    spyOn(Preferences, 'set').and.resolveTo();
    spyOn(Preferences, 'remove').and.resolveTo();
  });

  it('should be exported', () => {
    expect(AuthServiceService).toBeTruthy();
  });

  it('effettua il logout dopo 30 minuti senza attività', fakeAsync(() => {
    const { service, router } = createService();
    service.token = jwtValidFor(20 * 60 * 60 * 1000);

    tick(30 * 60 * 1000);

    expect(service.token).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/', { replaceUrl: true });
    flush();
  }));

  it('riparte da zero quando rileva attività dell’utente', fakeAsync(() => {
    const { service } = createService();
    service.token = jwtValidFor(20 * 60 * 60 * 1000);

    tick(29 * 60 * 1000);
    document.dispatchEvent(new Event('pointerdown'));
    tick(29 * 60 * 1000);
    expect(service.token).not.toBeNull();

    tick(60 * 1000);
    expect(service.token).toBeNull();
    flush();
  }));

  it('non permette al primo evento dopo una sospensione di riattivare la sessione', fakeAsync(() => {
    const { service } = createService();
    service.token = jwtValidFor(20 * 60 * 60 * 1000);
    (service as any).clearIdleTimer();

    tick(31 * 60 * 1000);
    document.dispatchEvent(new Event('pointerdown'));

    expect(service.token).toBeNull();
    flush();
  }));
});
