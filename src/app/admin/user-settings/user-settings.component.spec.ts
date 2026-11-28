import { of } from 'rxjs';
import { UserSettingsComponent } from './user-settings.component';

describe('UserSettingsComponent permission dependencies', () => {
  function component(currentUserPermissions?: string[]) {
    const quoteKeys = ['QUOTES_VIEW', 'QUOTES_NOTES_VIEW', 'QUOTES_NOTES_MANAGE', 'QUOTES_MANAGE', 'QUOTES_SEND'];
    const warehouseKeys = [
      'INTERNAL_WAREHOUSE_VIEW', 'INTERNAL_WAREHOUSE_PRODUCTS_MANAGE', 'INTERNAL_WAREHOUSE_ADJUST',
      'INTERNAL_WAREHOUSE_IMPORT', 'INTERNAL_WAREHOUSE_EXPORT',
    ];
    const qualityKeys = ['CUSTOMERS_VIEW', 'QUALITY_CONTROL_VIEW', 'QUALITY_CONTROL_MANAGE','CUSTOMER_DOCS_VIEW','CUSTOMER_DOCS_SHARE','CUSTOMER_DOCS_DEFAULTS_MANAGE'];
    const keys = [...quoteKeys, ...warehouseKeys, ...qualityKeys];
    const catalog = {
      permissions: keys,
      currentUserPermissions,
      groups: [
        { title: 'Preventivi', items: quoteKeys.map(key => ({ key, label: key })) },
        { title: 'Magazzino interno', items: warehouseKeys.map(key => ({ key, label: key })) },
        { title: 'Fogli fine lavoro e qualità', items: qualityKeys.map(key => ({ key, label: key })) },
      ],
      permissionDependencies: {
        QUOTES_MANAGE: { permissions: ['QUOTES_VIEW'] },
        QUOTES_SEND: { permissions: ['QUOTES_MANAGE'] },
        QUOTES_NOTES_VIEW: { permissions: ['QUOTES_VIEW'] },
        QUOTES_NOTES_MANAGE: { permissions: ['QUOTES_NOTES_VIEW'] },
        INTERNAL_WAREHOUSE_PRODUCTS_MANAGE: { permissions: ['INTERNAL_WAREHOUSE_VIEW'] },
        INTERNAL_WAREHOUSE_ADJUST: { permissions: ['INTERNAL_WAREHOUSE_VIEW'] },
        INTERNAL_WAREHOUSE_IMPORT: { permissions: ['INTERNAL_WAREHOUSE_PRODUCTS_MANAGE', 'INTERNAL_WAREHOUSE_ADJUST'] },
        INTERNAL_WAREHOUSE_EXPORT: { permissions: ['INTERNAL_WAREHOUSE_VIEW'] },
        QUALITY_CONTROL_VIEW: { permissions: ['CUSTOMERS_VIEW'] },
        QUALITY_CONTROL_MANAGE: { permissions: ['QUALITY_CONTROL_VIEW'] },
        CUSTOMER_DOCS_VIEW:{permissions:['CUSTOMERS_VIEW']},CUSTOMER_DOCS_SHARE:{permissions:['CUSTOMER_DOCS_VIEW']},CUSTOMER_DOCS_DEFAULTS_MANAGE:{permissions:['CUSTOMER_DOCS_SHARE']},
      },
    };
    const http = { get: () => of(JSON.stringify(catalog)) };
    const result = new UserSettingsComponent(http as any, {
      url: '/',
      headers: {},
      token: 'session-token',
      updateSessionPermissions: jasmine.createSpy('updateSessionPermissions'),
      hasPermission: (key: string) => key === 'ADMIN_PERMISSIONS_MANAGE' || [...quoteKeys, ...warehouseKeys].includes(key),
    } as any, {} as any);
    result.fetchPermissionOptions();
    return result;
  }

  it('seleziona le condivisioni cliente e la consultazione scegliendo le cartelle predefinite',()=>{const settings=component();const target={permissions:[] as string[]};settings.togglePermission(target,'CUSTOMER_DOCS_DEFAULTS_MANAGE');expect(target.permissions).toEqual(['CUSTOMER_DOCS_DEFAULTS_MANAGE','CUSTOMER_DOCS_SHARE','CUSTOMER_DOCS_VIEW','CUSTOMERS_VIEW']);settings.togglePermission(target,'CUSTOMER_DOCS_VIEW');expect(target.permissions).toEqual(['CUSTOMERS_VIEW']);});

  it('selects transitive prerequisites from the backend catalogue', () => {
    const settings = component();
    const target = { permissions: [] as string[] };
    settings.togglePermission(target, 'QUOTES_NOTES_MANAGE');
    expect(target.permissions).toEqual(['QUOTES_NOTES_MANAGE', 'QUOTES_NOTES_VIEW', 'QUOTES_VIEW']);
    expect(target.permissions).not.toContain('QUOTES_MANAGE');
  });

  it('lets a permissions manager add and remove quality grants on their own profile', () => {
    const grants = ['ADMIN_VIEW', 'ADMIN_PROFILE_EDIT', 'ADMIN_PERMISSIONS_MANAGE'];
    const settings = component(grants);
    const ownProfile = {
      id: 2, nome: 'Mario', cognome: 'Rossi', email: 'admin@example.test',
      codiceOperatore: 'MR', permissions: [...grants, 'QUOTES_VIEW'],
    };
    settings.startEditAdmin(ownProfile);
    const draft = settings.adminEdit!;
    settings.togglePermission(draft, 'QUALITY_CONTROL_MANAGE');
    expect(draft.permissions).toEqual([...ownProfile.permissions, 'QUALITY_CONTROL_MANAGE', 'QUALITY_CONTROL_VIEW', 'CUSTOMERS_VIEW']);
    settings.togglePermission(draft, 'QUALITY_CONTROL_MANAGE');
    expect(draft.permissions).not.toContain('QUALITY_CONTROL_MANAGE');
    expect(settings.globalService.updateSessionPermissions).toHaveBeenCalledWith('session-token', grants);
  });

  it('does not let a profile editor assign permissions without the management grant', () => {
    const settings = component(['ADMIN_PROFILE_EDIT', 'QUOTES_VIEW']);
    const target = { permissions: ['QUOTES_VIEW'] };
    settings.togglePermission(target, 'QUOTES_MANAGE');
    expect(target.permissions).toEqual(['QUOTES_VIEW']);
  });

  it('removing a prerequisite removes all dependent actions', () => {
    const settings = component();
    const target = { permissions: ['QUOTES_NOTES_MANAGE', 'QUOTES_NOTES_VIEW', 'QUOTES_VIEW', 'QUOTES_MANAGE'] };
    settings.togglePermission(target, 'QUOTES_VIEW');
    expect(target.permissions).toEqual([]);
  });

  it('does not select unavailable permissions', () => {
    const settings = component();
    const target = { permissions: [] as string[] };
    settings.togglePermission(target, 'EMPLOYEE_EDIT');
    expect(target.permissions).toEqual([]);
  });

  it('adds both import prerequisites and preserves independent export', () => {
    const settings = component();
    const target = { permissions: ['INTERNAL_WAREHOUSE_EXPORT', 'INTERNAL_WAREHOUSE_VIEW'] };
    settings.togglePermission(target, 'INTERNAL_WAREHOUSE_IMPORT');
    expect(target.permissions).toEqual([
      'INTERNAL_WAREHOUSE_EXPORT', 'INTERNAL_WAREHOUSE_VIEW', 'INTERNAL_WAREHOUSE_IMPORT',
      'INTERNAL_WAREHOUSE_PRODUCTS_MANAGE', 'INTERNAL_WAREHOUSE_ADJUST',
    ]);
    settings.togglePermission(target, 'INTERNAL_WAREHOUSE_ADJUST');
    expect(target.permissions).toEqual([
      'INTERNAL_WAREHOUSE_EXPORT', 'INTERNAL_WAREHOUSE_VIEW', 'INTERNAL_WAREHOUSE_PRODUCTS_MANAGE',
    ]);
  });
});
