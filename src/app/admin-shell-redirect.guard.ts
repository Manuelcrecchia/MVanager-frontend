import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class AdminShellRedirectGuard implements CanActivate {
  private readonly shellRoutes = new Set([
    'addCustomer',
    'addQuote',
    'calendarHome',
    'cambiapassword',
    'customer-deadlines',
    'customerNotes',
    'documenti',
    'editCustomer',
    'editQuote',
    'email',
    'emailSettings',
    'employee-deadlines',
    'equipment-deadlines',
    'equipmentSettings',
    'gestioneassenze',
    'gestioneemployees',
    'gestionepermessi',
    'gestioneTagCliente',
    'gestioneusers',
    'internal-deadlines',
    'internal-documents',
    'internal-warehouse',
    'leave-settings',
    'listCustomer',
    'notificationSettings',
    'quoteNotes',
    'quoteSettings',
    'quotesHome',
    'riepilogo-ore-clienti',
    'riepilogo-presenze-editabile',
    'schedaCliente',
    'service-orders',
    'settingsemployees',
    'timbratureDettaglio',
    'timbratureHome',
    'userSettings',
    'vehicle-deadlines',
    'vehiclesSettings',
    'view-pdf',
    'work-completion-stats',
  ]);

  constructor(private router: Router) {}

  canActivate(
    _route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): boolean | UrlTree {
    if (!this.shouldUseAdminShell()) {
      return true;
    }

    const [pathAndQuery, fragment] = state.url.split('#');
    const [cleanPath, query] = pathAndQuery.split('?');
    if (cleanPath === '/homeAdmin' || cleanPath.startsWith('/homeAdmin/')) {
      return true;
    }

    if (cleanPath.startsWith('/admin/shifts/create')) {
      return this.router.parseUrl(
        this.appendUrlParts(
          cleanPath.replace('/admin/shifts/create', '/homeAdmin/shifts/create'),
          query,
          fragment,
        ),
      );
    }

    if (cleanPath === '/admin/shifts') {
      return this.router.parseUrl(
        this.appendUrlParts('/homeAdmin/shifts', query, fragment),
      );
    }

    const rootPath = cleanPath.replace(/^\//, '').split('/')[0];
    if (!this.shellRoutes.has(rootPath)) {
      return true;
    }

    return this.router.parseUrl(
      this.appendUrlParts(`/homeAdmin${cleanPath}`, query, fragment),
    );
  }

  private shouldUseAdminShell(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 992px)').matches
    );
  }

  private appendUrlParts(path: string, query?: string, fragment?: string): string {
    return path + (query ? `?${query}` : '') + (fragment ? `#${fragment}` : '');
  }
}
