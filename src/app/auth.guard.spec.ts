import { ActivatedRouteSnapshot, DefaultUrlSerializer, Router, RouterStateSnapshot } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { GlobalService } from './service/global.service';

describe('AuthGuard', () => {
  function checkRoute(consultationOnly: boolean, allowConsultation?: boolean, inherited = false) {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60, consultationOnly }));
    const serializer = new DefaultUrlSerializer();
    const router = { parseUrl: (url: string) => serializer.parse(url) } as Router;
    const guard = new AuthGuard(router, { token: `e30.${payload}.test` } as GlobalService);
    const route = {
      data: { allowConsultation: inherited || allowConsultation },
      routeConfig: { data: { allowConsultation } },
    } as unknown as ActivatedRouteSnapshot;
    return guard.canActivate(route, {} as RouterStateSnapshot);
  }

  it('allows consultation on a standard route that explicitly supports it', () => {
    expect(checkRoute(true, true)).toBeTrue();
  });

  it('does not inherit consultation access from the admin shell', () => {
    expect(checkRoute(true, undefined, true).toString()).toBe('/homeAdmin');
  });

  it('keeps regular sessions on their requested routes', () => {
    expect(checkRoute(false)).toBeTrue();
    expect(checkRoute(false, true)).toBeTrue();
  });
});
