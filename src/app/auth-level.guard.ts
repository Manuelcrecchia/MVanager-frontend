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
    VEHICLE_SETTINGS_MANAGE: 'vehicleDeadlines',
    EQUIPMENT_SETTINGS_MANAGE: 'equipmentDeadlines',
    SHIFTS_VIEW: 'shifts',
    SHIFTS_MANAGE: 'shifts',
    ATTENDANCE_VIEW: 'attendance',
    ATTENDANCE_MANAGE: 'attendance',
    EMPLOYEE_PERMITS_MANAGE: 'leaveRequests',
    STAMPING_VIEW: 'stamping',
    STAMPING_MANAGE: 'stamping',
    STAMPING_WAREHOUSES_MANAGE: 'stamping',
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
    INTERNAL_WAREHOUSE_VIEW: 'internalWarehouse',
    INTERNAL_WAREHOUSE_IN: 'internalWarehouse',
    INTERNAL_WAREHOUSE_OUT: 'internalWarehouse',
    INTERNAL_WAREHOUSE_PRODUCTS_MANAGE: 'internalWarehouse',
    INTERNAL_WAREHOUSE_ADJUST: 'internalWarehouse',
    INTERNAL_WAREHOUSE_HISTORY_VIEW: 'internalWarehouse',
    INTERNAL_WAREHOUSE_EXPORT: 'internalWarehouse',
    VEHICLE_DEADLINES_VIEW: 'vehicleDeadlines',
    VEHICLE_DEADLINES_CREATE: 'vehicleDeadlines',
    VEHICLE_DEADLINES_EDIT: 'vehicleDeadlines',
    VEHICLE_DEADLINES_DELETE: 'vehicleDeadlines',
    EQUIPMENT_DEADLINES_VIEW: 'equipmentDeadlines',
    EQUIPMENT_DEADLINES_CREATE: 'equipmentDeadlines',
    EQUIPMENT_DEADLINES_EDIT: 'equipmentDeadlines',
    EQUIPMENT_DEADLINES_DELETE: 'equipmentDeadlines',
    CUSTOMER_DEADLINES_VIEW: 'customerDeadlines',
    CUSTOMER_DEADLINES_CREATE: 'customerDeadlines',
    CUSTOMER_DEADLINES_EDIT: 'customerDeadlines',
    CUSTOMER_DEADLINES_DELETE: 'customerDeadlines',
    INTERNAL_DEADLINES_VIEW: 'internalDeadlines',
    INTERNAL_DEADLINES_CREATE: 'internalDeadlines',
    INTERNAL_DEADLINES_EDIT: 'internalDeadlines',
    INTERNAL_DEADLINES_DELETE: 'internalDeadlines',
    EMPLOYEE_DEADLINES_VIEW: 'employeeDeadlines',
    EMPLOYEE_DEADLINES_CREATE: 'employeeDeadlines',
    EMPLOYEE_DEADLINES_EDIT: 'employeeDeadlines',
    EMPLOYEE_DEADLINES_DELETE: 'employeeDeadlines',
    INTERNAL_DOCS_ACCESS: 'internalDocuments',
    EMPLOYEE_DOCS_MANAGE: 'employeeDocuments',
    CUSTOMER_DOCS_MANAGE: 'customerDocuments',
    STATS_VIEW: 'stats',
    EMAIL_VIEW: 'email',
    EMAIL_SETTINGS: 'email',
    INVOICES_VIEW: 'invoices',
    INVOICES_MANAGE: 'invoices',
    ACCOUNTING_VIEW: 'invoices',
    ACCOUNTING_MANAGE: 'invoices',
    NOTIFICATIONS_VIEW: 'notifications',
    NOTIFICATIONS_MANAGE: 'notifications',
    TODOS_VIEW: 'todos',
    TODOS_MANAGE: 'todos',
    EMPLOYEE_VIEW: 'employees',
    EMPLOYEE_CREATE: 'employees',
    EMPLOYEE_EDIT: 'employees',
    EMPLOYEE_DELETE: 'employees',
    CANDIDATES_VIEW: 'candidates',
    CANDIDATES_MANAGE: 'candidates',
    CANDIDATES_NOTES_VIEW: 'candidates',
    CANDIDATES_NOTES_MANAGE: 'candidates',
    CANDIDATES_FILES_MANAGE: 'candidates',
    CANDIDATES_CONVERT: 'candidates',
  };

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean> {
    const required = route.data['permission'] as string | undefined;
    const requiredAny = route.data['permissionsAny'] as string[] | undefined;
    const requiredFeature = route.data['feature'] as string | undefined;

    // non loggato
    if (!this.global.token) {
      this.popup.show('Effettua il login per accedere.', 'Accesso richiesto', 'info');
      this.router.navigate(['/loginPrivateArea']);
      return false;
    }

    // nessun vincolo: solo autenticazione
    if (!required && !requiredAny && !requiredFeature) return true;

    const tenantConfig = await this.global.loadTenantConfig(false);
    if (!tenantConfig) {
      this.global.logout();
      this.router.navigate(['/loginPrivateArea']);
      return false;
    }

    const permissionOk = !required && !requiredAny ? true :
      (required ? this.canUsePermission(required) : false) ||
      (Array.isArray(requiredAny)
        ? requiredAny.some((p) => this.canUsePermission(p))
        : false);

    if (permissionOk && (!requiredFeature || this.global.isFeatureAvailableInApp(requiredFeature))) return true;

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
      (!feature || this.global.isFeatureAvailableInApp(feature))
    );
  }
}
