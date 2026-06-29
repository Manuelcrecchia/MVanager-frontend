import { Component, OnDestroy, OnInit, ElementRef, HostListener, Renderer2 } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { QuoteModelService } from '../../service/quote-model.service';
import { Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthServiceService } from '../../auth-service.service';
import { TenantService } from '../../service/tenant.service';
import { SocketService } from '../../service/soket.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, filter } from 'rxjs';
import { Capacitor } from '@capacitor/core';

type DeadlineStatus = 'ok' | 'warning' | 'expired';

interface DeadlineSummary {
  expiredCount: number;
  warningCount: number;
  alertCount: number;
  totalCount: number;
  status: DeadlineStatus;
}

interface HomeButton {
  label: string;
  icon: string;
  permission: string;
  permissionsAny?: string[];
  feature?: string;
  action: () => void;
  desktopPath?: string;
  queryParams?: Record<string, string>;
  badgeCount?: () => number;
  badgeClass?: () => string;
}

interface HomeCategory {
  id: string;
  label: string;
  icon: string;
  buttons: HomeButton[];
}

interface AdminTodo {
  id: number;
  title: string;
  completed: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface PermissionOption {
  key: string;
  label: string;
}

@Component({
  selector: 'app-homeadmin',
  templateUrl: './homeadmin.component.html',
  styleUrls: ['./homeadmin.component.css'],
})
export class HomeAdminComponent implements OnInit, OnDestroy {
  private quoteAcceptanceSubscription?: Subscription;
  private employeeContractSubscription?: Subscription;
  private routerEventsSubscription?: Subscription;
  private adminTodoSubscription?: Subscription;
  private emailUnreadIntervalId?: ReturnType<typeof setInterval>;
  private readonly desktopEmbeddedRootPaths = new Set([
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
    'employee-contracts',
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
    'invoices',
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
  isIos = Capacitor.getPlatform() === 'ios';
  isDesktopHome = false;
  isDesktopContentActive = false;

  constructor(
    private el: ElementRef,
    private router: Router,
    public global: GlobalService,
    private popup: PopupServiceService,
    public quoteModelService: QuoteModelService,
    private location: Location,
    private http: HttpClient,
    private authService: AuthServiceService,
    public tenantService: TenantService,
    private socketService: SocketService,
    private snackBar: MatSnackBar,
    private renderer: Renderer2,
  ) {}

  isMenuOpen: boolean = false;
  selectedHomeCategoryId = '';
  expandedHomeCategoryId = '';
  permessiInAttesa: number = 0;
  pendingQuoteReviews: number = 0;
  pendingEmployeeContractReviews: number = 0;
  emailUnreadCount: number = 0;
  internalWarehouseLowStockCount: number = 0;
  internalWarehousePendingRequestCount: number = 0;
  employeeDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();
  vehicleDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();
  equipmentDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();
  customerDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();
  internalDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();
  sidebarCollapsed = false;
  settingsMenuOpen = false;
  adminTodos: AdminTodo[] = [];
  newTodoTitle = '';
  todoLoading = false;
  todoSaving = false;
  todoError = '';
  unassignedPermissionLabels: string[] = [];

  ngOnInit(): void {
    this.global.loadTenantConfig().finally(() => {
      this.checkPermessiInAttesa();
      this.loadDeadlineSummary();
      this.loadPendingQuoteReviews();
      this.loadPendingEmployeeContractReviews();
      this.loadEmailUnreadSummary();
      this.loadInternalWarehouseSummary();
      this.loadUnassignedPermissionNotice();
      if (this.canUseTodoView()) {
        this.loadAdminTodos();
      }
      setTimeout(() => this.loadEmailUnreadSummary(), 1500);
    }).catch((err) => {
      console.error('Errore caricamento config tenant:', err);
    });
    this.updateDesktopHomeState();
    this.bindRouterState();
    this.bindQuoteAcceptanceUpdates();
    this.bindEmployeeContractUpdates();
    if (this.canUseTodoView()) {
      this.bindAdminTodoUpdates();
    }
    this.bindEmailUnreadPolling();
  }

  ngOnDestroy(): void {
    this.quoteAcceptanceSubscription?.unsubscribe();
    this.employeeContractSubscription?.unsubscribe();
    this.routerEventsSubscription?.unsubscribe();
    this.adminTodoSubscription?.unsubscribe();
    if (this.emailUnreadIntervalId) {
      clearInterval(this.emailUnreadIntervalId);
    }
    this.renderer.removeClass(document.body, 'is-desktop');
  }

  checkPermessiInAttesa(): void {
    if (!this.canUsePermission('EMPLOYEE_PERMITS_MANAGE')) {
      this.permessiInAttesa = 0;
      return;
    }

    this.http
      .get<{ pending: number }>(this.global.url + 'permission/notify')
      .subscribe({
        next: (res) => {
          this.permessiInAttesa = res.pending;
          console.log('Permessi in attesa:', this.permessiInAttesa);
        },
        error: (err) => {
          console.error('Errore controllo permessi in attesa:', err);
        },
      });
  }

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    if (this.sidebarCollapsed) {
      this.settingsMenuOpen = false;
    }
  }

  toggleSettingsMenu(): void {
    this.settingsMenuOpen = !this.settingsMenuOpen;
  }

  loadDeadlineSummary(): void {
    if (
      !this.canUsePermission('EMPLOYEE_DEADLINES_VIEW') &&
      !this.canUsePermission('VEHICLE_DEADLINES_VIEW') &&
      !this.canUsePermission('EQUIPMENT_DEADLINES_VIEW') &&
      !this.canUsePermission('CUSTOMER_DEADLINES_VIEW') &&
      !this.canUsePermission('INTERNAL_DEADLINES_VIEW')
    ) {
      this.employeeDeadlineSummary = this.emptyDeadlineSummary();
      this.vehicleDeadlineSummary = this.emptyDeadlineSummary();
      this.equipmentDeadlineSummary = this.emptyDeadlineSummary();
      this.customerDeadlineSummary = this.emptyDeadlineSummary();
      this.internalDeadlineSummary = this.emptyDeadlineSummary();
      return;
    }

    this.http
      .get<any>(this.global.url + 'admin/deadlines/summary')
      .subscribe({
        next: (res) => {
          this.employeeDeadlineSummary = this.normalizeDeadlineSummary(
            res?.employees,
          );
          this.vehicleDeadlineSummary = this.normalizeDeadlineSummary(
            res?.vehicles,
          );
          this.equipmentDeadlineSummary = this.normalizeDeadlineSummary(
            res?.equipment,
          );
          this.customerDeadlineSummary = this.normalizeDeadlineSummary(
            res?.customers,
          );
          this.internalDeadlineSummary = this.normalizeDeadlineSummary(
            res?.internal,
          );
        },
        error: (err) => {
          console.error('Errore caricamento riepilogo scadenze:', err);
        },
      });
  }

  loadPendingQuoteReviews(): void {
    if (!this.canUsePermission('QUOTES_VIEW')) {
      this.pendingQuoteReviews = 0;
      return;
    }

    this.http
      .get<{ count: number }>(
        this.global.url + 'quotes/pendingOfficeReviewCount',
        {
          headers: this.global.headers,
        },
      )
      .subscribe({
        next: (res) => {
          this.pendingQuoteReviews = Number(res?.count) || 0;
        },
        error: (err) => {
          console.error(
            'Errore caricamento preventivi da verificare:',
            err,
          );
        },
      });
  }

  loadPendingEmployeeContractReviews(): void {
    if (
      !this.canUsePermission('EMPLOYEE_VIEW') ||
      !this.global.isFeatureAvailableInApp('employeeContracts')
    ) {
      this.pendingEmployeeContractReviews = 0;
      return;
    }

    this.http
      .get<{ count: number }>(
        this.global.url + 'employee-contracts/pendingOfficeReviewCount',
        {
          headers: this.global.headers,
        },
      )
      .subscribe({
        next: (res) => {
          this.pendingEmployeeContractReviews = Number(res?.count) || 0;
        },
        error: (err) => {
          console.error(
            'Errore caricamento contratti da verificare:',
            err,
          );
        },
      });
  }

  loadEmailUnreadSummary(): void {
    if (!this.canUsePermission('EMAIL_VIEW')) {
      this.emailUnreadCount = 0;
      return;
    }

    this.http
      .get<{ count: number }>(this.global.url + 'admin/email/unread-summary')
      .subscribe({
        next: (res) => {
          this.emailUnreadCount = Number(res?.count) || 0;
        },
        error: (err) => {
          console.error('Errore caricamento email non lette:', err);
        },
      });
  }

  loadInternalWarehouseSummary(): void {
    if (!this.canUsePermission('INTERNAL_WAREHOUSE_VIEW', 'internalWarehouse')) {
      this.internalWarehouseLowStockCount = 0;
      this.internalWarehousePendingRequestCount = 0;
      return;
    }

    this.http
      .get<{ lowStockCount: number; pendingRequestCount: number }>(this.global.url + 'admin/internal-warehouse/summary')
      .subscribe({
        next: (res) => {
          this.internalWarehouseLowStockCount = Number(res?.lowStockCount) || 0;
          this.internalWarehousePendingRequestCount = Number(res?.pendingRequestCount) || 0;
        },
        error: (err) => {
          console.error('Errore caricamento riepilogo magazzino:', err);
          this.internalWarehouseLowStockCount = 0;
          this.internalWarehousePendingRequestCount = 0;
        },
      });
  }

  private bindEmailUnreadPolling(): void {
    if (this.emailUnreadIntervalId) {
      return;
    }

    this.emailUnreadIntervalId = setInterval(() => {
      if (this.canUsePermission('EMAIL_VIEW')) {
        this.loadEmailUnreadSummary();
      }
    }, 30000);
  }

  private bindQuoteAcceptanceUpdates(): void {
    if (this.quoteAcceptanceSubscription) {
      return;
    }

    this.quoteAcceptanceSubscription = this.socketService
      .onQuoteAcceptanceUpdate()
      .subscribe((update: any) => {
        this.loadPendingQuoteReviews();

        const numeroPreventivo = update?.numeroPreventivo || '';
        if (update?.kind === 'accepted') {
          this.snackBar.open(
            `Preventivo ${numeroPreventivo} accettato dal cliente`,
            'Chiudi',
            { duration: 5000 },
          );
        } else if (update?.kind === 'office_confirmed') {
          this.snackBar.open(
            `Preventivo ${numeroPreventivo} verificato dall'ufficio`,
            'Chiudi',
            { duration: 5000 },
          );
        }
      });
  }

  private bindEmployeeContractUpdates(): void {
    if (this.employeeContractSubscription) {
      return;
    }

    this.employeeContractSubscription = this.socketService
      .onEmployeeContractUpdate()
      .subscribe((update: any) => {
        this.loadPendingEmployeeContractReviews();

        const contractNumber = update?.contractNumber || '';
        if (update?.kind === 'accepted') {
          this.snackBar.open(
            `Contratto ${contractNumber} firmato dal candidato`,
            'Chiudi',
            { duration: 5000 },
          );
        } else if (update?.kind === 'office_confirmed') {
          this.snackBar.open(
            `Contratto ${contractNumber} verificato dall'ufficio`,
            'Chiudi',
            { duration: 5000 },
          );
        }
      });
  }

  navigateToCalendarHome() {
    this.navigateInHome('calendarHome');
  }

  navigateToInternalDocuments() {
    this.navigateInHome('internal-documents');
  }

  navigateToUserSettings() {
    this.navigateInHome('userSettings');
  }

  navigateToGestioneUsers() {
    this.navigateInHome('gestioneusers');
  }

  navigateToSettingsEmployees() {
    this.navigateInHome('settingsemployees');
  }

  navigateToQuotesHome() {
    this.navigateInHome('quotesHome');
  }

  navigateToServiceOrders() {
    this.navigateInHome('service-orders');
  }

  navigateToInvoices(view: string = 'invoices', direction: string = 'outbound') {
    const queryParams: Record<string, string> = { view };
    if (direction) queryParams['direction'] = direction;
    this.navigateInHome('invoices', queryParams);
  }

  navigateToAccounting(view: string = 'dashboard') {
    this.navigateInHome('accounting', { view });
  }

  navigateToGestionePermessi() {
    this.navigateInHome('gestionepermessi');
  }

  navigateToListCustomer() {
    this.navigateInHome('listCustomer');
  }

  navigateToAddCustomer() {
    this.navigateInHome('addCustomer');
  }

  goToShifts() {
    if (this.isDesktopHome) {
      this.navigateInHome('shifts');
      return;
    }

    this.router.navigate(['/admin/shifts']);
  }
  navigateToTimbrature() {
    this.navigateInHome('timbratureHome');
  }

  goToEditableHours() {
    this.navigateInHome('riepilogo-presenze-editabile');
  }

  goToRiepilogoOreClienti() {
    this.navigateInHome('riepilogo-ore-clienti');
  }

  back() {
    this.global.logout();
  }

  changeTenant(): void {
    this.tenantService.clearTenant();
    this.global.logout();
  }

  navigateToCambiapassword() {
    this.navigateInHome('cambiapassword');
  }
  navigateToGestioneemployees() {
    this.navigateInHome('gestioneemployees');
  }

  navigateToEmployeeContracts() {
    this.navigateInHome('employee-contracts');
  }

  navigateToEmployeeDeadlines() {
    this.navigateInHome('employee-deadlines');
  }

  navigateToVehicleDeadlines() {
    this.navigateInHome('vehicle-deadlines');
  }

  navigateToEquipmentDeadlines() {
    this.navigateInHome('equipment-deadlines');
  }

  navigateToCustomerDeadlines() {
    this.navigateInHome('customer-deadlines');
  }

  navigateToInternalDeadlines() {
    this.navigateInHome('internal-deadlines');
  }

  navigateToLeaveSettings() {
    this.navigateInHome('leave-settings');
  }

  navigateToVehiclesSettings() {
    this.navigateInHome('vehiclesSettings');
  }

  navigateToEquipmentSettings() {
    this.navigateInHome('equipmentSettings');
  }

  navigateToQuoteSettings() {
    this.navigateInHome('quoteSettings');
  }

  navigateToEmailSettings() {
    this.navigateInHome('emailSettings');
  }

  navigateToNotificationSettings() {
    this.navigateInHome('notificationSettings');
  }

  navigateToWorkCompletionStats() {
    this.navigateInHome('statistiche');
  }

  navigateToInternalWarehouse(tab: string = 'list') {
    const commands = this.isDesktopHome
      ? ['/homeAdmin', 'internal-warehouse']
      : ['/internal-warehouse'];
    this.router.navigate(commands, {
      queryParams: { tab },
    });
  }

  get standaloneHomeButtons(): HomeButton[] {
    return [
      {
        label: 'Calendario',
        icon: 'fas fa-calendar',
        permission: 'CALENDAR_VIEW',
        action: () => this.navigateToCalendarHome(),
        desktopPath: 'calendarHome',
      },
      {
        label: 'Email',
        icon: 'fas fa-envelope',
        permission: 'EMAIL_VIEW',
        permissionsAny: ['EMAIL_VIEW', 'EMAIL_SETTINGS'],
        action: () => {
          if (this.canUsePermission('EMAIL_VIEW')) {
            this.navigateInHome('email');
            return;
          }

          this.navigateToEmailSettings();
        },
        desktopPath: this.canUsePermission('EMAIL_VIEW') ? 'email' : undefined,
        badgeCount: () => this.emailUnreadCount,
        badgeClass: () => 'badge bg-danger ms-1',
      },
      {
        label: 'Invio notifiche dipendenti',
        icon: 'fas fa-users-cog',
        permission: 'ADMIN_VIEW',
        feature: 'administrators',
        action: () => this.navigateToGestioneUsers(),
        desktopPath: 'gestioneusers',
      },
      {
        label: 'Documenti interni',
        icon: 'fas fa-file',
        permission: 'INTERNAL_DOCS_ACCESS',
        feature: 'internalDocuments',
        action: () => this.navigateToInternalDocuments(),
        desktopPath: 'internal-documents',
      },
      {
        label: 'Statistiche',
        icon: 'fas fa-chart-line',
        permission: 'STATS_VIEW',
        feature: 'stats',
        action: () => this.navigateToWorkCompletionStats(),
        desktopPath: 'statistiche',
      },
    ].filter((button) => this.canUseHomeButton(button));
  }

  get homeCategories(): HomeCategory[] {
    return [
      {
        id: 'personale',
        label: 'Dipendenti',
        icon: 'fas fa-user-friends',
        buttons: [
          {
            label: 'Turni',
            icon: 'fas fa-tasks',
            permission: 'SHIFTS_VIEW',
            feature: 'shifts',
            action: () => this.goToShifts(),
            desktopPath: 'shifts',
          },
          {
            label: 'Gestione Timbrature',
            icon: 'fas fa-fingerprint',
            permission: 'STAMPING_VIEW',
            feature: 'stamping',
            action: () => this.navigateToTimbrature(),
            desktopPath: 'timbratureHome',
          },
          {
            label: 'Riepilogo ore clienti',
            icon: 'fas fa-user-clock',
            permission: 'CUSTOMERS_HOURS_VIEW',
            feature: 'customers',
            action: () => this.goToRiepilogoOreClienti(),
            desktopPath: 'riepilogo-ore-clienti',
          },
          {
            label: 'Riepilogo ore personalizzabile',
            icon: 'fas fa-clock',
            permission: 'ATTENDANCE_MANAGE',
            feature: 'attendance',
            action: () => this.goToEditableHours(),
            desktopPath: 'riepilogo-presenze-editabile',
          },
          {
            label: 'Gestione Dipendenti',
            icon: 'fas fa-user',
            permission: 'EMPLOYEE_VIEW',
            feature: 'employees',
            action: () => this.navigateToGestioneemployees(),
            desktopPath: 'gestioneemployees',
          },
          {
            label: 'Contratti',
            icon: 'fas fa-file-signature',
            permission: 'EMPLOYEE_VIEW',
            feature: 'employeeContracts',
            action: () => this.navigateToEmployeeContracts(),
            desktopPath: 'employee-contracts',
            badgeCount: () => this.pendingEmployeeContractReviews,
            badgeClass: () => 'badge bg-danger ms-1',
          },
          {
            label: 'Gestione permessi e dipendenti',
            icon: 'fas fa-clipboard-check',
            permission: 'EMPLOYEE_PERMITS_MANAGE',
            feature: 'leaveRequests',
            action: () => this.navigateToGestionePermessi(),
            desktopPath: 'gestionepermessi',
            badgeCount: () => this.permessiInAttesa,
            badgeClass: () => 'badge bg-danger ms-1',
          },
        ],
      },
      {
        id: 'commerciale',
        label: 'Clienti',
        icon: 'fas fa-handshake',
        buttons: [
          {
            label: 'Gestione Clienti',
            icon: 'fas fa-users',
            permission: 'CUSTOMERS_VIEW',
            feature: 'customers',
            action: () => this.navigateToListCustomer(),
            desktopPath: 'listCustomer',
          },
          {
            label: 'Nuovo cliente',
            icon: 'fas fa-user-plus',
            permission: 'CUSTOMERS_MANAGE',
            feature: 'customers',
            action: () => this.navigateToAddCustomer(),
            desktopPath: 'addCustomer',
          },
          {
            label: 'Gestione Preventivi',
            icon: 'fas fa-file-alt',
            permission: 'QUOTES_VIEW',
            feature: 'quotes',
            action: () => this.navigateToQuotesHome(),
            desktopPath: 'quotesHome',
            badgeCount: () => this.pendingQuoteReviews,
            badgeClass: () => 'badge bg-danger ms-1',
          },
          {
            label: 'Ordini di servizio',
            icon: 'fas fa-clipboard-list',
            permission: 'SERVICE_ORDERS_VIEW',
            feature: 'serviceOrders',
            action: () => this.navigateToServiceOrders(),
            desktopPath: 'service-orders',
          },
        ],
      },
      {
        id: 'billing',
        label: 'Pagamenti e fatture',
        icon: 'fas fa-file-invoice-dollar',
        buttons: [
          {
            label: 'Fatture vendita',
            icon: 'fas fa-file-invoice-dollar',
            permission: 'INVOICES_VIEW',
            feature: 'invoices',
            action: () => this.navigateToInvoices('invoices', 'outbound'),
            desktopPath: 'invoices',
            queryParams: { view: 'invoices', direction: 'outbound' },
          },
          {
            label: 'Fatture acquisto',
            icon: 'fas fa-file-download',
            permission: 'INVOICES_VIEW',
            feature: 'invoices',
            action: () => this.navigateToInvoices('invoices', 'inbound'),
            desktopPath: 'invoices',
            queryParams: { view: 'invoices', direction: 'inbound' },
          },
          {
            label: 'Pagamenti',
            icon: 'fas fa-calendar-check',
            permission: 'INVOICES_VIEW',
            feature: 'invoices',
            action: () => this.navigateToInvoices('payments', ''),
            desktopPath: 'invoices',
            queryParams: { view: 'payments' },
          },
          {
            label: 'Economia',
            icon: 'fas fa-chart-line',
            permission: 'INVOICES_VIEW',
            feature: 'invoices',
            action: () => this.navigateToInvoices('economics', ''),
            desktopPath: 'invoices',
            queryParams: { view: 'economics' },
          },
          {
            label: 'DDT',
            icon: 'fas fa-truck',
            permission: 'INVOICES_VIEW',
            feature: 'invoices',
            action: () => this.navigateToInvoices('ddt', ''),
            desktopPath: 'invoices',
            queryParams: { view: 'ddt' },
          },
          {
            label: 'Fornitori',
            icon: 'fas fa-building',
            permission: 'INVOICES_VIEW',
            feature: 'invoices',
            action: () => this.navigateToInvoices('suppliers', ''),
            desktopPath: 'invoices',
            queryParams: { view: 'suppliers' },
          },
          {
            label: 'Impostazioni',
            icon: 'fas fa-cog',
            permission: 'INVOICES_MANAGE',
            feature: 'invoices',
            action: () => this.navigateToInvoices('settings', ''),
            desktopPath: 'invoices',
            queryParams: { view: 'settings' },
          },
        ],
      },
      {
        id: 'accounting',
        label: 'Contabilita',
        icon: 'fas fa-balance-scale',
        buttons: [
          {
            label: 'Cruscotto',
            icon: 'fas fa-chart-pie',
            permission: 'ACCOUNTING_VIEW',
            feature: 'invoices',
            action: () => this.navigateToAccounting('dashboard'),
            desktopPath: 'accounting',
            queryParams: { view: 'dashboard' },
          },
          {
            label: 'Piano dei conti',
            icon: 'fas fa-list-ol',
            permission: 'ACCOUNTING_VIEW',
            feature: 'invoices',
            action: () => this.navigateToAccounting('accounts'),
            desktopPath: 'accounting',
            queryParams: { view: 'accounts' },
          },
          {
            label: 'Prima nota',
            icon: 'fas fa-book',
            permission: 'ACCOUNTING_VIEW',
            feature: 'invoices',
            action: () => this.navigateToAccounting('entries'),
            desktopPath: 'accounting',
            queryParams: { view: 'entries' },
          },
          {
            label: 'Mastri',
            icon: 'fas fa-stream',
            permission: 'ACCOUNTING_VIEW',
            feature: 'invoices',
            action: () => this.navigateToAccounting('ledger'),
            desktopPath: 'accounting',
            queryParams: { view: 'ledger' },
          },
          {
            label: 'Registro IVA',
            icon: 'fas fa-percent',
            permission: 'ACCOUNTING_VIEW',
            feature: 'invoices',
            action: () => this.navigateToAccounting('vat'),
            desktopPath: 'accounting',
            queryParams: { view: 'vat' },
          },
          {
            label: 'Report',
            icon: 'fas fa-balance-scale',
            permission: 'ACCOUNTING_VIEW',
            feature: 'invoices',
            action: () => this.navigateToAccounting('reports'),
            desktopPath: 'accounting',
            queryParams: { view: 'reports' },
          },
        ],
      },
      {
        id: 'internalWarehouse',
        label: 'Magazzino interno',
        icon: 'fas fa-warehouse',
        buttons: [
          {
            label: 'Lista prodotti',
            icon: 'fas fa-boxes',
            permission: 'INTERNAL_WAREHOUSE_VIEW',
            feature: 'internalWarehouse',
            action: () => this.navigateToInternalWarehouse('list'),
            desktopPath: 'internal-warehouse',
            queryParams: { tab: 'list' },
            badgeCount: () => this.internalWarehouseLowStockCount,
            badgeClass: () => 'badge bg-danger ms-1',
          },
          {
            label: 'Richieste prodotti',
            icon: 'fas fa-clipboard-list',
            permission: 'INTERNAL_WAREHOUSE_VIEW',
            feature: 'internalWarehouse',
            action: () => this.navigateToInternalWarehouse('requests'),
            desktopPath: 'internal-warehouse',
            queryParams: { tab: 'requests' },
            badgeCount: () => this.internalWarehousePendingRequestCount,
            badgeClass: () => 'badge bg-danger ms-1',
          },
          {
            label: 'Entrata prodotti',
            icon: 'fas fa-arrow-down',
            permission: 'INTERNAL_WAREHOUSE_IN',
            feature: 'internalWarehouse',
            action: () => this.navigateToInternalWarehouse('in'),
            desktopPath: 'internal-warehouse',
            queryParams: { tab: 'in' },
          },
          {
            label: 'Uscita prodotti',
            icon: 'fas fa-arrow-up',
            permission: 'INTERNAL_WAREHOUSE_OUT',
            feature: 'internalWarehouse',
            action: () => this.navigateToInternalWarehouse('out'),
            desktopPath: 'internal-warehouse',
            queryParams: { tab: 'out' },
          },
          {
            label: 'Movimenti / report',
            icon: 'fas fa-chart-bar',
            permission: 'INTERNAL_WAREHOUSE_HISTORY_VIEW',
            feature: 'internalWarehouse',
            action: () => this.navigateToInternalWarehouse('movements'),
            desktopPath: 'internal-warehouse',
            queryParams: { tab: 'movements' },
          },
          {
            label: 'Impostazioni prodotti',
            icon: 'fas fa-tags',
            permission: 'INTERNAL_WAREHOUSE_PRODUCTS_MANAGE',
            feature: 'internalWarehouse',
            action: () => this.navigateToInternalWarehouse('products'),
            desktopPath: 'internal-warehouse',
            queryParams: { tab: 'products' },
          },
          {
            label: 'Import / export',
            icon: 'fas fa-file-export',
            permission: 'INTERNAL_WAREHOUSE_EXPORT',
            feature: 'internalWarehouse',
            action: () => this.navigateToInternalWarehouse('tools'),
            desktopPath: 'internal-warehouse',
            queryParams: { tab: 'tools' },
          },
        ],
      },
      {
        id: 'operativo',
        label: 'Sicurezza e scadenze',
        icon: 'fas fa-briefcase',
        buttons: [
          {
            label: 'Scadenze dipendenti',
            icon: 'fas fa-id-card',
            permission: 'EMPLOYEE_DEADLINES_VIEW',
            feature: 'deadlines',
            action: () => this.navigateToEmployeeDeadlines(),
            desktopPath: 'employee-deadlines',
            badgeCount: () => this.employeeDeadlineSummary.alertCount,
            badgeClass: () => this.deadlineBadgeClass(this.employeeDeadlineSummary),
          },
          {
            label: 'Scadenze mezzi',
            icon: 'fas fa-car',
            permission: 'VEHICLE_DEADLINES_VIEW',
            feature: 'deadlines',
            action: () => this.navigateToVehicleDeadlines(),
            desktopPath: 'vehicle-deadlines',
            badgeCount: () => this.vehicleDeadlineSummary.alertCount,
            badgeClass: () => this.deadlineBadgeClass(this.vehicleDeadlineSummary),
          },
          {
            label: 'Scadenze attrezzature',
            icon: 'fas fa-toolbox',
            permission: 'EQUIPMENT_DEADLINES_VIEW',
            feature: 'deadlines',
            action: () => this.navigateToEquipmentDeadlines(),
            desktopPath: 'equipment-deadlines',
            badgeCount: () => this.equipmentDeadlineSummary.alertCount,
            badgeClass: () => this.deadlineBadgeClass(this.equipmentDeadlineSummary),
          },
          {
            label: 'Scadenze clienti',
            icon: 'fas fa-user-shield',
            permission: 'CUSTOMER_DEADLINES_VIEW',
            feature: 'deadlines',
            action: () => this.navigateToCustomerDeadlines(),
            desktopPath: 'customer-deadlines',
            badgeCount: () => this.customerDeadlineSummary.alertCount,
            badgeClass: () => this.deadlineBadgeClass(this.customerDeadlineSummary),
          },
          {
            label: 'Scadenze interne',
            icon: 'fas fa-building-shield',
            permission: 'INTERNAL_DEADLINES_VIEW',
            feature: 'deadlines',
            action: () => this.navigateToInternalDeadlines(),
            desktopPath: 'internal-deadlines',
            badgeCount: () => this.internalDeadlineSummary.alertCount,
            badgeClass: () => this.deadlineBadgeClass(this.internalDeadlineSummary),
          },
        ],
      },
    ];
  }

  get visibleHomeCategories(): HomeCategory[] {
    return this.homeCategories.filter(
      (category) => this.visibleHomeButtons(category).length > 0,
    );
  }

  get shouldShowHomeCategories(): boolean {
    return (
      !this.isDesktopHome &&
      this.mainMenuItemsCount > 1 &&
      !this.selectedHomeCategoryId
    );
  }

  get mainMenuItemsCount(): number {
    return this.standaloneHomeButtons.length + this.visibleHomeCategories.length;
  }

  get currentHomeButtons(): HomeButton[] {
    if (this.visibleHomeCategories.length === 1) {
      return this.visibleHomeButtons(this.visibleHomeCategories[0]);
    }

    const selectedId = this.selectedHomeCategoryId || "";

    const selectedCategory = this.visibleHomeCategories.find(
      (category) => category.id === selectedId,
    );

    return selectedCategory ? this.visibleHomeButtons(selectedCategory) : [];
  }

  get selectedHomeCategory(): HomeCategory | undefined {
    const selectedId = this.selectedHomeCategoryId || "";
    return this.visibleHomeCategories.find((category) => category.id === selectedId);
  }

  selectHomeCategory(categoryId: string): void {
    if (this.isDesktopHome) {
      this.expandedHomeCategoryId =
        this.expandedHomeCategoryId === categoryId ? '' : categoryId;
      this.selectedHomeCategoryId = this.expandedHomeCategoryId;
      return;
    }

    this.selectedHomeCategoryId = categoryId;
  }

  clearHomeCategory(): void {
    this.selectedHomeCategoryId = '';
  }

  activateHomeButton(button: HomeButton): void {
    if (this.isDesktopHome && button.desktopPath) {
      this.isDesktopContentActive = true;
      this.setExpandedCategoryForButton(button);
      this.router.navigate(['/homeAdmin', button.desktopPath], {
        queryParams: button.queryParams,
      });
      return;
    }

    button.action();
  }

  showDesktopMainMenu(): void {
    this.selectedHomeCategoryId = '';
    this.expandedHomeCategoryId = '';
    this.isDesktopContentActive = false;
    this.router.navigate(['/homeAdmin']);
  }

  loadAdminTodos(): void {
    if (!this.canUseTodoView()) {
      this.adminTodos = [];
      return;
    }

    this.todoLoading = true;
    this.todoError = '';

    this.http
      .get<AdminTodo[]>(this.global.url + 'admin/todos', {
        headers: this.global.headers,
      })
      .subscribe({
        next: (todos) => {
          this.adminTodos = this.dedupeAdminTodos(Array.isArray(todos) ? todos : []);
          this.todoLoading = false;
        },
        error: (err) => {
          console.error('Errore caricamento todo admin:', err);
          this.todoError = 'Non riesco a caricare la lista attività.';
          this.todoLoading = false;
        },
      });
  }

  addAdminTodo(): void {
    const title = this.newTodoTitle.trim();
    if (!title || this.todoSaving || !this.canUseTodoManage()) return;

    this.todoSaving = true;
    this.todoError = '';

    this.http
      .post<AdminTodo>(
        this.global.url + 'admin/todos',
        { title },
        { headers: this.global.headers },
      )
      .subscribe({
        next: (todo) => {
          this.upsertAdminTodo(todo);
          this.newTodoTitle = '';
          this.todoSaving = false;
        },
        error: (err) => {
          console.error('Errore creazione todo admin:', err);
          this.todoError = 'Non riesco ad aggiungere questa attività.';
          this.todoSaving = false;
        },
      });
  }

  toggleAdminTodo(todo: AdminTodo): void {
    if (!this.canUseTodoManage()) return;

    const completed = !todo.completed;
    this.todoError = '';

    this.http
      .patch<AdminTodo>(
        this.global.url + `admin/todos/${todo.id}`,
        { completed },
        { headers: this.global.headers },
      )
      .subscribe({
        next: (updatedTodo) => {
          this.upsertAdminTodo(updatedTodo);
        },
        error: (err) => {
          console.error('Errore aggiornamento todo admin:', err);
          this.todoError = 'Non riesco ad aggiornare questa attività.';
        },
      });
  }

  deleteAdminTodo(todo: AdminTodo): void {
    if (!this.canUseTodoManage()) return;

    this.todoError = '';

    this.http
      .delete(this.global.url + `admin/todos/${todo.id}`, {
        headers: this.global.headers,
      })
      .subscribe({
        next: () => {
          this.adminTodos = this.adminTodos.filter((item) => item.id !== todo.id);
        },
        error: (err) => {
          console.error('Errore eliminazione todo admin:', err);
          this.todoError = 'Non riesco a eliminare questa attività.';
        },
      });
  }

  private bindAdminTodoUpdates(): void {
    if (this.adminTodoSubscription || !this.canUseTodoView()) {
      return;
    }

    this.adminTodoSubscription = this.socketService
      .onAdminTodoUpdate()
      .subscribe((update: any) => {
        if (update?.tenantId && update.tenantId !== this.tenantService.tenant) {
          return;
        }

        const todo = update?.todo as AdminTodo | null;
        if (!todo?.id) {
          return;
        }

        if (update.action === 'deleted') {
          this.adminTodos = this.adminTodos.filter((item) => item.id !== todo.id);
          return;
        }

        this.upsertAdminTodo(todo);
      });
  }

  private upsertAdminTodo(todo: AdminTodo): void {
    if (!todo?.id) return;

    const existingIndex = this.adminTodos.findIndex((item) => item.id === todo.id);
    if (existingIndex >= 0) {
      this.adminTodos = this.adminTodos.map((item) =>
        item.id === todo.id ? todo : item,
      );
      return;
    }

    this.adminTodos = [todo, ...this.adminTodos];
  }

  private dedupeAdminTodos(todos: AdminTodo[]): AdminTodo[] {
    const seen = new Set<number>();
    return todos.filter((todo) => {
      if (!todo?.id || seen.has(todo.id)) return false;
      seen.add(todo.id);
      return true;
    });
  }

  get openAdminTodosCount(): number {
    return this.adminTodos.filter((todo) => !todo.completed).length;
  }

  get completedAdminTodosCount(): number {
    return this.adminTodos.filter((todo) => todo.completed).length;
  }

  canUseTodoView(): boolean {
    return this.canUsePermission('TODOS_VIEW', 'todos');
  }

  canUseTodoManage(): boolean {
    return this.canUsePermission('TODOS_MANAGE', 'todos');
  }

  get unassignedPermissionsPreview(): string {
    const visible = this.unassignedPermissionLabels.slice(0, 8);
    const remaining = this.unassignedPermissionLabels.length - visible.length;
    return remaining > 0
      ? `${visible.join(', ')} e altri ${remaining}`
      : visible.join(', ');
  }

  get showPermissionSetupNotice(): boolean {
    return (
      this.canUsePermission('ADMIN_EDIT', 'administrators') &&
      this.unassignedPermissionLabels.length > 0
    );
  }

  private loadUnassignedPermissionNotice(): void {
    if (!this.canUsePermission('ADMIN_VIEW', 'administrators')) {
      this.unassignedPermissionLabels = [];
      return;
    }

    Promise.all([
      this.http
        .get<any>(this.global.url + 'admin/permissions/list', {
          headers: this.global.headers,
        })
        .toPromise(),
      this.http
        .get<any>(this.global.url + 'admin/getAll', {
          headers: this.global.headers,
        })
        .toPromise(),
    ])
      .then(([catalog, adminsResponse]) => {
        const permissions = this.extractPermissionOptions(catalog);
        const availableKeys = new Set(permissions.map((permission) => permission.key));
        const assignedKeys = new Set<string>();
        const admins = Array.isArray(adminsResponse)
          ? adminsResponse
          : Array.isArray(adminsResponse?.data)
            ? adminsResponse.data
            : Array.isArray(adminsResponse?.admins)
              ? adminsResponse.admins
              : [];

        admins.forEach((admin: any) => {
          this.parseAdminPermissions(admin?.permissions).forEach((permission) => {
            assignedKeys.add(permission);
          });
        });

        this.unassignedPermissionLabels = permissions
          .filter((permission) => availableKeys.has(permission.key))
          .filter((permission) => !assignedKeys.has(permission.key))
          .map((permission) => permission.label || permission.key);
      })
      .catch((err) => {
        console.error('Errore controllo permessi non assegnati:', err);
        this.unassignedPermissionLabels = [];
      });
  }

  private extractPermissionOptions(catalog: any): PermissionOption[] {
    const groups = Array.isArray(catalog?.groups) ? catalog.groups : [];
    if (groups.length) {
      return groups
        .flatMap((group: any) => Array.isArray(group?.items) ? group.items : [])
        .map((permission: any) => ({
          key: String(permission?.key || '').trim(),
          label: String(permission?.label || permission?.key || '').trim(),
        }))
        .filter((permission: PermissionOption) => permission.key);
    }

    const rawPermissions = Array.isArray(catalog)
      ? catalog
      : Array.isArray(catalog?.data)
        ? catalog.data
        : Array.isArray(catalog?.permissions)
          ? catalog.permissions
          : [];

    return rawPermissions
      .map((permission: any) => {
        if (typeof permission === 'string') {
          return { key: permission, label: permission };
        }
        return {
          key: String(permission?.key || '').trim(),
          label: String(permission?.label || permission?.key || '').trim(),
        };
      })
      .filter((permission: PermissionOption) => permission.key);
  }

  private parseAdminPermissions(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((permission) => String(permission || '').trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value || '[]');
        return this.parseAdminPermissions(parsed);
      } catch {
        return [];
      }
    }

    return [];
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateDesktopHomeState();
  }

  @HostListener('window:emailUnreadChanged')
  onEmailUnreadChanged(): void {
    this.loadEmailUnreadSummary();
  }

  visibleHomeButtons(category: HomeCategory): HomeButton[] {
    return category.buttons.filter((button) => this.canUseHomeButton(button));
  }

  isCategoryExpanded(category: HomeCategory): boolean {
    return this.expandedHomeCategoryId === category.id;
  }

  isStandaloneButtonActive(button: HomeButton): boolean {
    return (
      !!button.desktopPath &&
      this.activeDesktopChildPath() === button.desktopPath &&
      this.buttonQueryParamsMatch(button)
    );
  }

  isHomeButtonActive(button: HomeButton): boolean {
    return (
      !!button.desktopPath &&
      this.activeDesktopChildPath() === button.desktopPath &&
      this.buttonQueryParamsMatch(button)
    );
  }

  private buttonQueryParamsMatch(button: HomeButton): boolean {
    if (!button.queryParams) return true;
    const query = this.router.url.split('?')[1] || '';
    const params = new URLSearchParams(query);
    return Object.entries(button.queryParams).every(
      ([key, value]) => params.get(key) === value,
    );
  }

  canUsePermission(permission: string, feature?: string): boolean {
    return (
      this.global.hasPermission(permission) &&
      (!feature || this.global.isFeatureAvailableInApp(feature))
    );
  }

  private canUseHomeButton(button: HomeButton): boolean {
    if (Array.isArray(button.permissionsAny) && button.permissionsAny.length) {
      return button.permissionsAny.some((permission) =>
        this.canUsePermission(permission, button.feature),
      );
    }

    return this.canUsePermission(button.permission, button.feature);
  }

  categoryBadgeCount(category: HomeCategory): number {
    return this.visibleHomeButtons(category).reduce((total, button) => {
      return total + (button.badgeCount?.() || 0);
    }, 0);
  }

  buttonBadgeCount(button: HomeButton): number {
    return button.badgeCount?.() || 0;
  }

  buttonBadgeClass(button: HomeButton): string {
    return button.badgeClass?.() || 'badge bg-danger ms-1';
  }

  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent) {
    console.log('[AppComponent] Freccia indietro rilevata');
    this.global.logout();
  }

  deadlineBadgeClass(summary: DeadlineSummary): string {
    if (summary.status === 'expired') return 'alert-badge alert-badge-expired';
    if (summary.status === 'warning') return 'alert-badge alert-badge-warning';
    return 'alert-badge';
  }

  private emptyDeadlineSummary(): DeadlineSummary {
    return {
      expiredCount: 0,
      warningCount: 0,
      alertCount: 0,
      totalCount: 0,
      status: 'ok',
    };
  }

  private normalizeDeadlineSummary(raw: any): DeadlineSummary {
    if (!raw) return this.emptyDeadlineSummary();

    return {
      expiredCount: Number(raw.expiredCount) || 0,
      warningCount: Number(raw.warningCount) || 0,
      alertCount: Number(raw.alertCount) || 0,
      totalCount: Number(raw.totalCount) || 0,
      status:
        raw.status === 'expired' || raw.status === 'warning'
          ? raw.status
          : 'ok',
    };
  }

  private updateDesktopHomeState(): void {
    this.isDesktopHome =
      typeof window !== 'undefined' && window.matchMedia('(min-width: 992px)').matches;
    if (this.isDesktopHome) {
      this.renderer.addClass(document.body, 'is-desktop');
    } else {
      this.renderer.removeClass(document.body, 'is-desktop');
    }
    this.syncDesktopRouteState();
  }

  private bindRouterState(): void {
    this.routerEventsSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.syncDesktopRouteState());

    this.syncDesktopRouteState();
  }

  private syncDesktopRouteState(): void {
    if (this.redirectStandaloneRouteIntoDesktopHome()) {
      return;
    }

    const activePath = this.activeDesktopChildPath();
    if (!activePath) {
      this.isDesktopContentActive = false;
      return;
    }

    const activeCategory = this.visibleHomeCategories.find((category) =>
      this.visibleHomeButtons(category).some(
        (button) => button.desktopPath === activePath,
      ),
    );

    if (activeCategory) {
      this.selectedHomeCategoryId = activeCategory.id;
      this.expandedHomeCategoryId = activeCategory.id;
      this.isDesktopContentActive = this.isDesktopHome;
      return;
    }

    const activeStandalone = this.standaloneHomeButtons.some(
      (button) => button.desktopPath === activePath,
    );
    if (activeStandalone) {
      this.selectedHomeCategoryId = '';
      this.expandedHomeCategoryId = '';
      this.isDesktopContentActive = this.isDesktopHome;
      return;
    }

    this.selectedHomeCategoryId = '';
    this.expandedHomeCategoryId = '';
    this.isDesktopContentActive = this.isDesktopHome;
  }

  private setExpandedCategoryForButton(button: HomeButton): void {
    const owner = this.visibleHomeCategories.find((category) =>
      this.visibleHomeButtons(category).some((item) => item === button),
    );
    this.expandedHomeCategoryId = owner?.id || '';
    this.selectedHomeCategoryId = owner?.id || '';
  }

  private activeDesktopChildPath(): string {
    const cleanUrl = this.router.url.split('?')[0].split('#')[0];
    if (!cleanUrl.startsWith('/homeAdmin/')) {
      return '';
    }

    return cleanUrl.replace('/homeAdmin/', '').split('/')[0];
  }

  private navigateInHome(path: string, queryParams?: Record<string, string>): void {
    if (this.isDesktopHome) {
      this.isDesktopContentActive = true;
      this.router.navigate(['/homeAdmin', path], { queryParams });
      return;
    }

    this.router.navigate([`/${path}`], { queryParams });
  }

  private redirectStandaloneRouteIntoDesktopHome(): boolean {
    if (!this.isDesktopHome) return false;

    const url = this.router.url;
    const [pathAndQuery, fragment] = url.split('#');
    const [cleanPath, query] = pathAndQuery.split('?');
    if (cleanPath === '/homeAdmin' || cleanPath.startsWith('/homeAdmin/')) {
      return false;
    }

    const rootPath = cleanPath.replace(/^\//, '').split('/')[0];
    if (cleanPath.startsWith('/admin/shifts/create')) {
      const target =
        cleanPath.replace('/admin/shifts/create', '/homeAdmin/shifts/create') +
        (query ? `?${query}` : '') +
        (fragment ? `#${fragment}` : '');
      this.router.navigateByUrl(target, { replaceUrl: true });
      return true;
    }

    if (!this.desktopEmbeddedRootPaths.has(rootPath)) {
      return false;
    }

    const target =
      `/homeAdmin${cleanPath}` +
      (query ? `?${query}` : '') +
      (fragment ? `#${fragment}` : '');
    this.router.navigateByUrl(target, { replaceUrl: true });
    return true;
  }
}
