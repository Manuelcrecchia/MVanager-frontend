import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export type TenantId = 'sami' | 'emmeci';

export interface CompanyRegistryOption {
  id: number;
  name: string;
  serverUrl: string;
  tenantId?: TenantId | string | null;
}

@Injectable({
  providedIn: 'root',
})
export class TenantService {
  private readonly TENANT_KEY = 'selectedTenant';
  private readonly COMPANY_NAME_KEY = 'selectedCompanyName';
  private readonly COMPANY_SERVER_URL_KEY = 'selectedCompanyServerUrl';
  private _selectedTenant: TenantId | null = this.readStoredTenantSync();
  private _selectedCompanyName: string | null = this.readStoredValueSync(
    this.COMPANY_NAME_KEY,
  );
  private _selectedCompanyServerUrl: string | null = this.normalizeServerUrl(
    this.readStoredValueSync(this.COMPANY_SERVER_URL_KEY),
  );
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

  private normalizeServerUrl(value: string | null | undefined): string | null {
    let url = String(value || '').trim();
    if (!url) return null;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    return url.replace(/\/+$/, '') + '/';
  }

  private readStoredValueSync(key: string): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(key) || sessionStorage.getItem(key);
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
      const company = await Preferences.get({ key: this.COMPANY_NAME_KEY });
      const serverUrl = await Preferences.get({
        key: this.COMPANY_SERVER_URL_KEY,
      });

      if (company.value) {
        this._selectedCompanyName = company.value;
        this.persistValueSync(this.COMPANY_NAME_KEY, company.value);
      }

      const normalizedServerUrl = this.normalizeServerUrl(serverUrl.value);
      if (normalizedServerUrl) {
        this._selectedCompanyServerUrl = normalizedServerUrl;
        this.persistValueSync(
          this.COMPANY_SERVER_URL_KEY,
          normalizedServerUrl,
        );
      }

      if (tenant && this._selectedTenant !== tenant) {
        this._selectedTenant = tenant;
        this.persistTenantSync(tenant);
      }
    } catch (error) {
      console.error('[TenantService] Errore ripristino tenant:', error);
    }
  }

  private persistValueSync(key: string, value: string | null): void {
    if (typeof window === 'undefined') return;

    if (value) {
      localStorage.setItem(key, value);
      sessionStorage.setItem(key, value);
      return;
    }

    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }

  private persistValueAsync(key: string, value: string | null): void {
    const action = value
      ? Preferences.set({ key, value })
      : Preferences.remove({ key });

    action.catch((error) => {
      console.error('[TenantService] Errore persistenza valore:', error);
    });
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

    if (this.isNative()) {
      return this._selectedCompanyServerUrl ? this._selectedTenant : null;
    }

    if (this._selectedTenant) {
      return this._selectedTenant;
    }

    return this.resolveTenantFromHost();
  }

  get tenant(): TenantId {
    return this.selectedTenant || this.resolveTenantFromHost() || 'sami';
  }

  get requiresTenantSelection(): boolean {
    return this.isNative() && !this.selectedCompanyServerUrl;
  }

  get tenantLabel(): string {
    return this._selectedCompanyName || (this.tenant === 'emmeci' ? 'Emmeci' : 'SAMI');
  }

  get selectedCompanyName(): string | null {
    return this._selectedCompanyName;
  }

  get selectedCompanyServerUrl(): string | null {
    return this._selectedCompanyServerUrl;
  }

  async setTenant(tenant: TenantId): Promise<void> {
    this._selectedTenant = tenant;
    this._selectedCompanyName = null;
    this._selectedCompanyServerUrl = null;
    this.persistTenantSync(tenant);
    this.persistTenantAsync(tenant);
    this.persistValueSync(this.COMPANY_NAME_KEY, null);
    this.persistValueSync(this.COMPANY_SERVER_URL_KEY, null);
    this.persistValueAsync(this.COMPANY_NAME_KEY, null);
    this.persistValueAsync(this.COMPANY_SERVER_URL_KEY, null);
  }

  async setCompany(company: CompanyRegistryOption): Promise<void> {
    const tenant = this.normalizeTenant(
      typeof company.tenantId === 'string' ? company.tenantId : null,
    );
    const serverUrl = this.normalizeServerUrl(company.serverUrl);

    if (!tenant || !serverUrl) {
      throw new Error('Azienda non configurata correttamente');
    }

    this._selectedTenant = tenant;
    this._selectedCompanyName = company.name;
    this._selectedCompanyServerUrl = serverUrl;

    this.persistTenantSync(tenant);
    this.persistTenantAsync(tenant);
    this.persistValueSync(this.COMPANY_NAME_KEY, company.name);
    this.persistValueSync(this.COMPANY_SERVER_URL_KEY, serverUrl);
    this.persistValueAsync(this.COMPANY_NAME_KEY, company.name);
    this.persistValueAsync(this.COMPANY_SERVER_URL_KEY, serverUrl);
  }

  clearTenant(): void {
    this._selectedTenant = null;
    this._selectedCompanyName = null;
    this._selectedCompanyServerUrl = null;
    this.persistTenantSync(null);
    this.persistTenantAsync(null);
    this.persistValueSync(this.COMPANY_NAME_KEY, null);
    this.persistValueSync(this.COMPANY_SERVER_URL_KEY, null);
    this.persistValueAsync(this.COMPANY_NAME_KEY, null);
    this.persistValueAsync(this.COMPANY_SERVER_URL_KEY, null);
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
