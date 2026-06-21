import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { GlobalService } from './service/global.service';
import { TenantService } from './service/tenant.service';
import { PopupServiceService } from './componenti/popup/popup-service.service';

@Injectable({
  providedIn: 'root'
})
export class AuthInterceptorService implements HttpInterceptor {
  constructor(
    private globalService: GlobalService,
    private tenantService: TenantService,
    private popup: PopupServiceService,
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

}
