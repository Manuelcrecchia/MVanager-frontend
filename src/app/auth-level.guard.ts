import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { GlobalService } from './service/global.service';
import { PopupServiceService } from './componenti/popup/popup-service.service';

@Injectable({
  providedIn: 'root',
})
export class AuthLevelGuard implements CanActivate {
  constructor(
    private global: GlobalService,
    private router: Router,
    private popup: PopupServiceService,
  ) {}

  private readonly permissionFeatureMap: Record<string, string> = {
    ADMIN_VIEW: 'administrators',
    ADMIN_CREATE: 'administrators',
    ADMIN_EDIT: 'administrators',
    ADMIN_DELETE: 'administrators',
    SETTINGS_ADMIN: 'deadlines',
    SHIFTS_VIEW: 'shifts',
    SHIFTS_MANAGE: 'shifts',
    ATTENDANCE_VIEW: 'attendance',
    ATTENDANCE_MANAGE: 'attendance',
    EMPLOYEE_PERMITS_MANAGE: 'leaveRequests',
    STAMPING_VIEW: 'stamping',
    STAMPING_MANAGE: 'stamping',
    CUSTOMERS_VIEW: 'customers',
    CUSTOMERS_MANAGE: 'customers',
    CUSTOMERS_NOTES_VIEW: 'customers',
    CUSTOMERS_NOTES_MANAGE: 'customers',
    CUSTOMERS_HOURS_VIEW: 'customers',
    QUOTES_VIEW: 'quotes',
    QUOTES_MANAGE: 'quotes',
    QUOTES_NOTES_VIEW: 'quotes',
    QUOTES_NOTES_MANAGE: 'quotes',
    SETTINGS_QUOTES: 'quotes',
    CALENDAR_VIEW: 'calendar',
    CALENDAR_EVENT_MANAGE: 'calendar',
    SERVICE_ORDERS_VIEW: 'serviceOrders',
    SERVICE_ORDERS_MANAGE: 'serviceOrders',
    VEHICLE_DEADLINES_VIEW: 'deadlines',
    VEHICLE_DEADLINES_CREATE: 'deadlines',
    VEHICLE_DEADLINES_EDIT: 'deadlines',
    VEHICLE_DEADLINES_DELETE: 'deadlines',
    EQUIPMENT_DEADLINES_VIEW: 'deadlines',
    EQUIPMENT_DEADLINES_CREATE: 'deadlines',
    EQUIPMENT_DEADLINES_EDIT: 'deadlines',
    EQUIPMENT_DEADLINES_DELETE: 'deadlines',
    CUSTOMER_DEADLINES_VIEW: 'deadlines',
    CUSTOMER_DEADLINES_CREATE: 'deadlines',
    CUSTOMER_DEADLINES_EDIT: 'deadlines',
    CUSTOMER_DEADLINES_DELETE: 'deadlines',
    INTERNAL_DEADLINES_VIEW: 'deadlines',
    INTERNAL_DEADLINES_CREATE: 'deadlines',
    INTERNAL_DEADLINES_EDIT: 'deadlines',
    INTERNAL_DEADLINES_DELETE: 'deadlines',
    EMPLOYEE_DEADLINES_VIEW: 'deadlines',
    EMPLOYEE_DEADLINES_CREATE: 'deadlines',
    EMPLOYEE_DEADLINES_EDIT: 'deadlines',
    EMPLOYEE_DEADLINES_DELETE: 'deadlines',
    INTERNAL_DOCS_ACCESS: 'documents',
    EMPLOYEE_DOCS_MANAGE: 'documents',
    STATS_VIEW: 'stats',
    EMAIL_VIEW: 'email',
    EMAIL_SETTINGS: 'email',
    NOTIFICATIONS_VIEW: 'notifications',
    NOTIFICATIONS_MANAGE: 'notifications',
    TODOS_VIEW: 'todos',
    TODOS_MANAGE: 'todos',
    EMPLOYEE_VIEW: 'employees',
    EMPLOYEE_CREATE: 'employees',
    EMPLOYEE_EDIT: 'employees',
    EMPLOYEE_DELETE: 'employees',
  };

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean> {
    const required = route.data['permission'] as string | undefined;
    const requiredAny = route.data['permissionsAny'] as string[] | undefined;

    // non loggato
    if (!this.global.token) {
      this.popup.show('Effettua il login per accedere.', 'Accesso richiesto', 'info');
      this.router.navigate(['/loginPrivateArea']);
      return false;
    }

    // nessun vincolo: solo autenticazione
    if (!required && !requiredAny) return true;

    const tenantConfig =
      await this.global.loadTenantConfig(false) ||
      await this.global.loadTenantConfig(true);
    if (!tenantConfig) {
      this.global.logout();
      this.router.navigate(['/loginPrivateArea']);
      return false;
    }

    const ok =
      (required ? this.canUsePermission(required) : false) ||
      (Array.isArray(requiredAny)
        ? requiredAny.some((p) => this.canUsePermission(p))
        : false);

    if (ok) return true;

    this.popup.showError(
      'Accesso non autorizzato a questa sezione.',
      'Accesso negato',
    );
    return false;
  }

  private canUsePermission(permission: string): boolean {
    const feature = this.permissionFeatureMap[permission];
    return (
      this.global.hasPermission(permission) &&
      (!feature || this.global.hasTenantFeature(feature))
    );
  }
}
