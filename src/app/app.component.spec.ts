import { AppComponent } from './app.component';

describe('AppComponent', () => {
  it('should be exported', () => {
    expect(AppComponent).toBeTruthy();
  });

  it('recognizes both the admin home and its embedded child routes', () => {
    const component = Object.create(AppComponent.prototype) as AppComponent;
    (component as any).router = { url: '/homeAdmin/customer-asset-deadlines?month=2026-07' };

    expect(component.isAdminShellRoute()).toBeTrue();

    (component as any).router.url = '/customer-asset-deadlines';
    expect(component.isAdminShellRoute()).toBeFalse();
  });
});
