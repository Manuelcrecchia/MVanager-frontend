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
  version = '4.3';

  constructor(
    private authService: AuthServiceService,
    private tenantService: TenantService,
  ) {}

  get forMobile(): boolean {
    return Capacitor.getPlatform() !== 'web';
  }

  get url(): string {
    return environment.apiUrl || environment.mobileDevApiUrl;
  }

  checkVersion(): Promise<boolean> {
    return new Promise((resolve) => {
      const platform = this.forMobile ? 'mobile' : 'web';
      const url =
        this.url +
        `api/version?app=MVanager&platform=${platform}&version=${encodeURIComponent(this.version)}`;

      fetch(url, {
        headers: {
          'X-Tenant-Id': this.tenantService.tenant,
        },
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          const supported =
            typeof data.supported === 'boolean'
              ? data.supported
              : data.version === this.version;

          if (!supported) {
            const allowed = Array.isArray(data.allowedVersions)
              ? data.allowedVersions.join(', ')
              : data.version;
            alert(
              `Versione non valida!\nApp: ${this.version}\nVersioni consentite: ${allowed}`,
            );
            resolve(false);
            this.logout();
          } else {
            resolve(true);
          }
        })
        .catch((error) => {
          console.error('Errore verifica versione server', url, error);
          alert(`Impossibile verificare la versione del server.\n${url}`);
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
  selectedCompanyServerUrl?: string | null;
}): string {
  return environment.apiUrl || environment.mobileDevApiUrl;
}
