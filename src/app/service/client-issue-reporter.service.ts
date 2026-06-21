import { HttpBackend, HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AuthServiceService } from '../auth-service.service';
import { environment } from '../../environments/environment';
import { TenantService } from './tenant.service';

@Injectable({ providedIn: 'root' })
export class ClientIssueReporterService {
  private readonly http: HttpClient;
  private lastKey = '';
  private lastAt = 0;

  constructor(
    httpBackend: HttpBackend,
    private auth: AuthServiceService,
    private tenantService: TenantService,
  ) {
    this.http = new HttpClient(httpBackend);
  }

  report(
    kind: string,
    message: string,
    details: Record<string, unknown> = {},
    level: 'error' | 'warning' | 'info' = 'warning',
  ): void {
    const key = `${kind}:${message}:${window.location.pathname}`;
    const now = Date.now();
    if (key === this.lastKey && now - this.lastAt < 2000) return;
    this.lastKey = key;
    this.lastAt = now;

    const token = this.auth.token || '';
    let headers = new HttpHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      'X-Tenant-Id': this.tenantService.tenant,
    });
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);

    this.http.post(
      `${this.apiUrl}client-reports`,
      {
        kind,
        level,
        message,
        path: `${window.location.pathname}${window.location.search}`,
        userCode: this.auth.userCode || '',
        details,
      },
      { headers },
    ).subscribe({ error: () => undefined });
  }

  private get apiUrl(): string {
    return environment.apiUrl || environment.mobileDevApiUrl;
  }
}
