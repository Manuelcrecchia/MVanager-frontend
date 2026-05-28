import { Injectable } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import { AuthServiceService } from '../auth-service.service';
import { TenantService } from './tenant.service';
import { Capacitor } from '@capacitor/core';
import { TenantId } from './tenant.service';
import { environment } from '../../environments/environment';

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

function isLocalWebHost(host: string, port?: string): boolean {
  const normalizedPort = String(port || '').trim();
  const isAngularDevPort =
    normalizedPort === '4200' || normalizedPort === '4300' || normalizedPort === '4301';

  return (
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('sami.local') ||
    host.includes('emmeci.local') ||
    (isAngularDevPort && host.includes('sami.mvtechcore.it')) ||
    (isAngularDevPort && host.includes('emmeci.mvtechcore.it'))
  );
}

export function resolveApiBaseUrl(params: {
  forMobile: boolean;
  tenant: TenantId;
  host?: string;
  port?: string;
}): string {
  const host = (params.host || '').toLowerCase();

  if (params.forMobile && environment.mobileDevApiUrl.trim()) {
    return ensureTrailingSlash(environment.mobileDevApiUrl.trim());
  }

  if (!params.forMobile && isLocalWebHost(host, params.port)) {
    return 'http://localhost:5001/';
  }

  if (params.tenant === 'emmeci') {
    return 'https://nodeemmeci.mvtechcore.it/';
  }

  return 'https://nodesami.mvtechcore.it/';
}

@Injectable({
  providedIn: 'root',
})
export class GlobalService {
  version = '3.8';
  forMobile = Capacitor.getPlatform() !== 'web';

  constructor(
    private authService: AuthServiceService,
    private tenantService: TenantService,
  ) {}

  get url(): string {
    const host =
      typeof window === 'undefined'
        ? ''
        : window.location.hostname.toLowerCase();
    const port =
      typeof window === 'undefined' ? '' : window.location.port || '';

    return resolveApiBaseUrl({
      forMobile: this.forMobile,
      tenant: this.tenantService.tenant,
      host,
      port,
    });
  }

  checkVersion(): Promise<boolean> {
    return new Promise((resolve) => {
      fetch(this.url + 'api/version', {
        headers: {
          'X-Tenant-Id': this.tenantService.tenant,
        },
      })
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
          console.error('[GlobalService] checkVersion failed', {
            url: this.url + 'api/version',
            tenant: this.tenantService.tenant,
            forMobile: this.forMobile,
            error,
          });
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
