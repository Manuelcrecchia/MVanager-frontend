import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { GlobalService } from './service/global.service';
import { TenantService } from './service/tenant.service';
import { PopupServiceService } from './componenti/popup/popup-service.service';
import { ClientIssueReporterService } from './service/client-issue-reporter.service';

@Injectable({
  providedIn: 'root'
})
export class AuthInterceptorService implements HttpInterceptor {
  constructor(
    private globalService: GlobalService,
    private tenantService: TenantService,
    private popup: PopupServiceService,
    private reporter: ClientIssueReporterService,
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const token = this.globalService.token;
    let headers = req.headers.set('X-Tenant-Id', this.tenantService.tenant);
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    const cloned = req.clone({ headers });

    return next.handle(cloned).pipe(
      catchError((err: HttpErrorResponse) => {
        if (!req.url.includes('/client-reports')) {
          this.reporter.report(
            'http_error',
            this.describeHttpError(err),
            {
              status: err.status,
              statusText: err.statusText,
              url: req.url,
              method: req.method,
              response: this.safeErrorBody(err.error),
            },
            err.status >= 500 || err.status === 0 ? 'error' : 'warning',
          );
        }
        if (err.status === 401) {
          this.popup.showHttpError(err, 'Sessione scaduta. Effettua di nuovo il login.');
        }
        if (err.status === 403) {
          this.popup.showHttpError(err, 'Non sei autorizzato a eseguire questa operazione.');
        }
        return throwError(() => err);
      })
    );
  }

  private describeHttpError(err: HttpErrorResponse): string {
    const body = this.safeErrorBody(err.error);
    const bodyMessage = typeof body === 'string'
      ? body
      : String((body as any)?.response || (body as any)?.error || '').trim();
    return bodyMessage || `Richiesta fallita (${err.status || 'rete'})`;
  }

  private safeErrorBody(error: unknown): unknown {
    if (!error) return null;
    if (typeof error === 'string') {
      try {
        return JSON.parse(error);
      } catch {
        return error.slice(0, 1000);
      }
    }
    return error;
  }
}
