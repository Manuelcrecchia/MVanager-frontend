import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export type TenantId = 'sami' | 'emmeci';

@Injectable({
  providedIn: 'root',
})
export class TenantService {
  private readonly TENANT_KEY = 'selectedTenant';
  private _selectedTenant: TenantId | null = this.readStoredTenantSync();
  readonly ready: Promise<void> = this.restorePersistedTenant();

  private isNative(): boolean {
    return Capacitor.getPlatform() !== 'web';
  }

  private normalizeTenant(value: string | null | undefined): TenantId | null {
    if (!value) return null;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'sami' || normalized === 'emmeci') {
      return normalized;
    }

    return null;
  }

  private readStoredTenantSync(): TenantId | null {
    if (typeof window === 'undefined') return null;

    return this.normalizeTenant(
      localStorage.getItem(this.TENANT_KEY) ||
        sessionStorage.getItem(this.TENANT_KEY),
    );
  }

  private async restorePersistedTenant(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: this.TENANT_KEY });
      const tenant = this.normalizeTenant(value);

      if (!tenant || this._selectedTenant === tenant) {
        return;
      }

      this._selectedTenant = tenant;
      this.persistTenantSync(tenant);
    } catch (error) {
      console.error('[TenantService] Errore ripristino tenant:', error);
    }
  }

  private persistTenantSync(tenant: TenantId | null): void {
    if (typeof window === 'undefined') return;

    if (tenant) {
      localStorage.setItem(this.TENANT_KEY, tenant);
      sessionStorage.setItem(this.TENANT_KEY, tenant);
      return;
    }

    localStorage.removeItem(this.TENANT_KEY);
    sessionStorage.removeItem(this.TENANT_KEY);
  }

  private persistTenantAsync(tenant: TenantId | null): void {
    const action = tenant
      ? Preferences.set({ key: this.TENANT_KEY, value: tenant })
      : Preferences.remove({ key: this.TENANT_KEY });

    action.catch((error) => {
      console.error('[TenantService] Errore persistenza tenant:', error);
    });
  }

  private resolveHost(): string {
    if (typeof window === 'undefined') return '';
    return window.location.hostname.toLowerCase();
  }

  private resolveTenantFromQuery(): TenantId | null {
    if (typeof window === 'undefined') return null;

    const host = this.resolveHost();
    const isLocalHost =
      host.includes('localhost') ||
      host.includes('127.0.0.1') ||
      host.includes('sami.local') ||
      host.includes('emmeci.local');

    if (!isLocalHost) {
      return null;
    }

    const tenant = new URLSearchParams(window.location.search)
      .get('tenant')
      ?.trim()
      .toLowerCase();

    if (tenant === 'sami' || tenant === 'emmeci') {
      return tenant;
    }

    return null;
  }

  private resolveTenantFromHost(): TenantId | null {
    const host = this.resolveHost();

    if (
      host.includes('emmeci') ||
      host.includes('mcmoving') ||
      host.includes('moving')
    ) {
      return 'emmeci';
    }

    if (host.includes('sami')) {
      return 'sami';
    }

    return null;
  }

  get selectedTenant(): TenantId | null {
    const queryTenant = this.resolveTenantFromQuery();
    if (queryTenant) {
      return queryTenant;
    }

    if (this._selectedTenant) {
      return this._selectedTenant;
    }

    return this.isNative() ? null : this.resolveTenantFromHost();
  }

  get tenant(): TenantId {
    return this.selectedTenant || this.resolveTenantFromHost() || 'sami';
  }

  get requiresTenantSelection(): boolean {
    return this.isNative() && !this.selectedTenant;
  }

  get tenantLabel(): string {
    return this.tenant === 'emmeci' ? 'Emmeci' : 'SAMI';
  }

  async setTenant(tenant: TenantId): Promise<void> {
    this._selectedTenant = tenant;
    this.persistTenantSync(tenant);
    this.persistTenantAsync(tenant);
  }

  clearTenant(): void {
    this._selectedTenant = null;
    this.persistTenantSync(null);
    this.persistTenantAsync(null);
  }

  setTenantFromToken(tenant: unknown): void {
    const normalized = this.normalizeTenant(
      typeof tenant === 'string' ? tenant : null,
    );

    if (!normalized) {
      return;
    }

    this._selectedTenant = normalized;
    this.persistTenantSync(normalized);
    this.persistTenantAsync(normalized);
  }

  get isSami(): boolean {
    return this.tenant === 'sami';
  }

  get isEmmeci(): boolean {
    return this.tenant === 'emmeci';
  }
}
