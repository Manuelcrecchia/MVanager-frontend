import { PassworddimenticataComponent } from './passworddimenticata.component';

describe('PassworddimenticataComponent', () => {
  it('should be exported', () => {
    expect(PassworddimenticataComponent).toBeTruthy();
  });
});

import { of } from 'rxjs';

it('clears existing sessions after password recovery but preserves them for an invalid code', () => {
  const global = { url: '/api/', headers: {}, email: 'local@example.invalid', logout: jasmine.createSpy('logout') };
  const router = { navigateByUrl: jasmine.createSpy('navigateByUrl') };
  const popup = { openPopup: jasmine.createSpy('openPopup') };
  let response = 'NOCODE';
  const component = new PassworddimenticataComponent(global as any, { post: () => of(response) } as any, router as any, popup as any);
  component.resetPassword('NewPassword123', 'code');
  expect(global.logout).not.toHaveBeenCalled();
  response = 'OK';
  component.resetPassword('NewPassword123', 'code');
  expect(global.logout).toHaveBeenCalled();
  expect(router.navigateByUrl).toHaveBeenCalledWith('/loginPrivateArea');
});
