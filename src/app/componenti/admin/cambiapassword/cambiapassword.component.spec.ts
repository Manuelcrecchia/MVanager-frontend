import { CambiapasswordComponent } from './cambiapassword.component';

describe('CambiapasswordComponent', () => {
  it('should be exported', () => {
    expect(CambiapasswordComponent).toBeTruthy();
  });
});

import { of } from 'rxjs';

it('clears the current admin session after a successful password change', () => {
  const global = { url: '/api/', headers: {}, logout: jasmine.createSpy('logout') };
  const router = { navigateByUrl: jasmine.createSpy('navigateByUrl') };
  const component = new CambiapasswordComponent(global as any, { post: () => of('OK') } as any, router as any, {} as any);
  component.changePassword('NewPassword123');
  expect(global.logout).toHaveBeenCalled();
  expect(router.navigateByUrl).toHaveBeenCalledWith('/loginPrivateArea');
});
