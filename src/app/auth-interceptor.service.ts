import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { GlobalService } from './service/global.service';
import { TenantService } from './service/tenant.service';
import { PopupServiceService } from './componenti/popup/popup-service.service';
import { getRealtimeClientId } from './service/realtime-client-id';

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
    let headers = req.headers
      .set('X-Tenant-Id', this.tenantService.tenant)
      .set('X-MV-Realtime-Client', getRealtimeClientId());
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    const cloned = req.clone({ headers });

    return next.handle(cloned).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.popup.showHttpError(err, 'Sessione scaduta. Effettua di nuovo il login.', 'Sessione scaduta');
          return throwError(() => err);
        }
        if (err.status === 403) {
          this.popup.showHttpError(err, this.describeForbidden(cloned.url), 'Accesso non consentito');
          return throwError(() => err);
        }

        if (this.shouldShowGlobalHttpError(cloned, err)) {
          this.popup.scheduleHttpError(
            err,
            this.defaultHttpFallback(err),
            'Operazione non riuscita',
          );
        }

        return throwError(() => err);
      })
    );
  }

  private shouldShowGlobalHttpError(req: HttpRequest<any>, err: HttpErrorResponse): boolean {
    if (!err || req.headers.has('X-Skip-Global-Error-Popup')) {
      return false;
    }

    const url = req.url.toLowerCase();
    const silentPaths = [
      '/login',
      '/sendcode',
      '/verifycode',
      '/restorepassword',
      '/forgot',
    ];

    return !silentPaths.some((path) => url.includes(path));
  }

  private defaultHttpFallback(err: HttpErrorResponse): string {
    if (err.status === 0) {
      return 'Impossibile connettersi al server. Controlla la connessione e riprova.';
    }

    if (err.status >= 500) {
      return 'Il server ha risposto con un errore. Riprova tra poco o contatta l\'assistenza.';
    }

    if (err.status === 404) {
      return 'La risorsa richiesta non e\' stata trovata. Aggiorna la pagina e riprova.';
    }

    return 'Operazione non completata. Controlla i dati inseriti e riprova.';
  }

  private describeForbidden(url: string): string {
    const value = String(url || '').toLowerCase();
    if (value.includes('/vehicles/')) return 'Non hai i permessi per visualizzare o gestire i mezzi.';
    if (value.includes('/equipment/')) return 'Non hai i permessi per visualizzare o gestire le attrezzature.';
    if (value.includes('/employees/')) return 'Non hai i permessi per visualizzare i dipendenti.';
    if (value.includes('/customers/')) return 'Non hai i permessi necessari per questa operazione sui clienti.';
    if (value.includes('/quotes/')) return 'Non hai i permessi necessari per questa operazione sui preventivi.';
    if (value.includes('/calendar')) return 'Non hai i permessi necessari per il calendario.';
    return 'Non hai i permessi necessari per questa operazione.';
  }

}
