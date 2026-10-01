import { GlobalService } from './global.service';
import { InvoicesComponent } from '../admin/invoices/invoices.component';
import { AccountingComponent } from '../admin/accounting/accounting.component';
import { RiepilogoPresenzeEditabileComponent } from '../admin/riepilogo-presenze-editabile/riepilogo-presenze-editabile.component';

describe('Runtime permission checks', () => {
  const check = (grants: string[], catalog: any, key: string) =>
    GlobalService.prototype.hasPermission.call({ permissions: grants, tenantConfig: { permissions: catalog } } as any, key);

  it('treats an empty published catalogue as no available permissions', () => {
    expect(check(['QUOTES_VIEW'], { permissions: [] }, 'QUOTES_VIEW')).toBeFalse();
  });

  it('expands only available grants and respects explicit exclusions', () => {
    const catalog = {
      permissions: ['QUOTES_MANAGE', 'QUOTES_VIEW'],
      permissionDependencies: { QUOTES_MANAGE: { permissions: ['QUOTES_VIEW'] } },
    };
    expect(check(['QUOTES_MANAGE'], catalog, 'QUOTES_VIEW')).toBeTrue();
    expect(check(['QUOTES_VIEW'], catalog, 'QUOTES_MANAGE')).toBeFalse();
    expect(check(['QUOTES_MANAGE'], { ...catalog, permissions: ['QUOTES_VIEW'] }, 'QUOTES_VIEW')).toBeFalse();
    expect(check(['QUOTES_VIEW'], { ...catalog, disabledPermissions: ['QUOTES_VIEW'] }, 'QUOTES_VIEW')).toBeFalse();
  });

  it('does not submit writes from read-only invoice, accounting and attendance pages', async () => {
    const readonly: any = { canManage: false };
    // No HTTP service is provided: each action must stop before attempting a write.
    InvoicesComponent.prototype.save.call(readonly);
    InvoicesComponent.prototype.send.call(readonly);
    InvoicesComponent.prototype.saveDdt.call(readonly);
    await InvoicesComponent.prototype.registerPayment.call(readonly);
    AccountingComponent.prototype.saveAccount.call(readonly);
    AccountingComponent.prototype.saveManualEntry.call(readonly);
    RiepilogoPresenzeEditabileComponent.prototype.onCellaChange.call(readonly, {}, 0);
    await RiepilogoPresenzeEditabileComponent.prototype.salvaNotaSingola.call(readonly, {}, 'nota');
    expect(InvoicesComponent.prototype.canEdit.call(readonly)).toBeFalse();
  });
});
