import { Injectable } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { AuthServiceService } from '../auth-service.service';
import { TenantService } from './tenant.service';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class GlobalService {
  version = '3.8';

  constructor(
    private authService: AuthServiceService,
    private tenantService: TenantService,
  ) {}

  get forMobile(): boolean {
    return Capacitor.getPlatform() !== 'web';
  }

  get url(): string {
    const tenantUrl = this.tenantService.isEmmeci
      ? 'https://nodeemmeci.mvtechcore.it/'
      : 'https://nodesami.mvtechcore.it/';

    if (this.forMobile) {
      return environment.mobileDevApiUrl || tenantUrl;
    }

    const host = window.location.hostname.toLowerCase();

    if (
      host.includes('localhost') ||
      host.includes('127.0.0.1') ||
      host.includes('emmeci.local') ||
      host.includes('sami.local')
    ) {
      return 'http://localhost:5001/';
    }

    return tenantUrl;
  }

  checkVersion(): Promise<boolean> {
    return new Promise((resolve) => {
      fetch(this.url + 'api/version')
        .then((res) => res.json())
        .then((data) => {
          if (data.version !== this.version) {
            alert(
              `Versione non valida!\nApp: ${this.version}\nServer: ${data.version}`,
            );
            resolve(false);
            this.logout();
          } else {
            resolve(true);
          }
        })
        .catch((error) => {
          console.error('Errore verifica versione server', this.url + 'api/version', error);
          alert('Impossibile verificare la versione del server.');
          resolve(false);
        });
    });
  }

  get token(): string {
    return this.authService.token || '';
  }

  get userCode(): string {
    return this.authService.userCode || '';
  }

  get permissions(): string[] {
    return this.authService.permissions || [];
  }

  hasPermission(key: string): boolean {
    return this.permissions.includes(key);
  }

  get email(): string {
    return this.authService.email || '';
  }

  get headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${this.token}`,
      'X-Tenant-Id': this.tenantService.tenant,
    });
  }

  logout(): void {
    this.authService.logout();
  }
}

export function resolveApiBaseUrl(options: {
  forMobile: boolean;
  tenant: string;
  host: string;
}): string {
  const { host, tenant, forMobile } = options;
  const tenantUrl = tenant === 'emmeci'
    ? 'https://nodeemmeci.mvtechcore.it/'
    : 'https://nodesami.mvtechcore.it/';

  if (forMobile) {
    return environment.mobileDevApiUrl || tenantUrl;
  }

  if (
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('emmeci.local') ||
    host.includes('sami.local')
  ) {
    return 'http://localhost:5001/';
  }

  return tenantUrl;
}
