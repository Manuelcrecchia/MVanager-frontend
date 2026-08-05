import { HomeAdminComponent } from './homeadmin.component';

describe('HomeAdminComponent', () => {
  function createComponent(router: any = {}, global: any = {}): HomeAdminComponent {
    const renderer = {
      addClass: jasmine.createSpy('addClass'),
      removeClass: jasmine.createSpy('removeClass'),
      setStyle: jasmine.createSpy('setStyle'),
      removeStyle: jasmine.createSpy('removeStyle'),
    };
    return new HomeAdminComponent(
      { nativeElement: document.createElement('div') } as any,
      router,
      global,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      renderer as any,
      {} as any,
    );
  }

  it('should be exported', () => {
    expect(HomeAdminComponent).toBeTruthy();
  });

  it('activates a mobile submenu button', () => {
    const component = createComponent();
    const action = jasmine.createSpy('action');
    const button = {
      label: 'Lista prodotti',
      icon: 'fas fa-boxes',
      permission: 'INTERNAL_WAREHOUSE_VIEW',
      action,
    } as any;
    component.activateHomeButton(button);

    expect(action).toHaveBeenCalledTimes(1);
  });

  it('opens a mobile category', () => {
    const component = createComponent();

    component.selectHomeCategory('internalWarehouse');

    expect(component.selectedHomeCategoryId).toBe('internalWarehouse');
  });

  it('keeps the mobile todo collapsed by default and toggles it on demand', () => {
    const component = createComponent();

    expect(component.mobileTodoExpanded).toBeFalse();
    component.toggleMobileTodo();
    expect(component.mobileTodoExpanded).toBeTrue();
    component.toggleMobileTodo();
    expect(component.mobileTodoExpanded).toBeFalse();
  });

  it('keeps the mobile submenu open when the browser viewport resizes while scrolling', () => {
    const component = createComponent({ url: '/homeAdmin' });
    component.isDesktopHome = false;
    component.selectedHomeCategoryId = 'deadlines';
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    const routeSync = spyOn<any>(component, 'syncDesktopRouteState');

    component.onWindowResize();

    expect(component.selectedHomeCategoryId).toBe('deadlines');
    expect(routeSync).not.toHaveBeenCalled();
  });

  it('redirects an embedded desktop route to its standalone mobile page', () => {
    const router = {
      url: '/homeAdmin/customer-asset-deadlines/guided-update?tenant=sami',
      navigateByUrl: jasmine.createSpy('navigateByUrl'),
    };
    const component = createComponent(router);
    component.isDesktopHome = false;

    const redirected = (component as any).redirectEmbeddedRouteOutOfMobileHome();

    expect(redirected).toBeTrue();
    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/customer-asset-deadlines/guided-update?tenant=sami',
      { replaceUrl: true },
    );
  });

  it('maps embedded shift routes to their existing mobile route', () => {
    const router = {
      url: '/homeAdmin/shifts/create?date=2026-07-28',
      navigateByUrl: jasmine.createSpy('navigateByUrl'),
    };
    const component = createComponent(router);
    component.isDesktopHome = false;

    (component as any).redirectEmbeddedRouteOutOfMobileHome();

    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/admin/shifts/create?date=2026-07-28',
      { replaceUrl: true },
    );
  });

  it('keeps billing and accounting visible when invoices are enabled for the tenant', () => {
    const component = createComponent({}, {
      hasPermission: () => true,
      isFeatureAvailableInApp: () => true,
      getTenantCustomerAssetsConfig: () => ({}),
    });

    const categoryIds = component.visibleHomeCategories.map((category) => category.id);

    expect(categoryIds).toContain('billing');
    expect(categoryIds).toContain('accounting');
    expect(component.visibleHomeCategories.find((category) => category.id === 'billing')?.buttons.length)
      .toBeGreaterThan(0);
    expect(component.visibleHomeCategories.find((category) => category.id === 'accounting')?.buttons.length)
      .toBeGreaterThan(0);
  });
});
