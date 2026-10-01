import { of } from 'rxjs';
import { UserSettingsComponent } from './user-settings.component';

describe('UserSettingsComponent permission dependencies', () => {
  function component() {
    const keys = ['QUOTES_VIEW', 'QUOTES_NOTES_VIEW', 'QUOTES_NOTES_MANAGE', 'QUOTES_MANAGE'];
    const catalog = {
      permissions: keys,
      groups: [{ title: 'Preventivi', items: keys.map(key => ({ key, label: key })) }],
      permissionDependencies: {
        QUOTES_MANAGE: { permissions: ['QUOTES_VIEW'] },
        QUOTES_NOTES_VIEW: { permissions: ['QUOTES_VIEW'] },
        QUOTES_NOTES_MANAGE: { permissions: ['QUOTES_NOTES_VIEW'] },
      },
    };
    const http = { get: () => of(JSON.stringify(catalog)) };
    const result = new UserSettingsComponent(http as any, { url: '/', headers: {} } as any, {} as any);
    result.fetchPermissionOptions();
    return result;
  }

  it('selects transitive prerequisites from the backend catalogue', () => {
    const settings = component();
    const target = { permissions: [] as string[] };
    settings.togglePermission(target, 'QUOTES_NOTES_MANAGE');
    expect(target.permissions).toEqual(['QUOTES_NOTES_MANAGE', 'QUOTES_NOTES_VIEW', 'QUOTES_VIEW']);
    expect(target.permissions).not.toContain('QUOTES_MANAGE');
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
});
