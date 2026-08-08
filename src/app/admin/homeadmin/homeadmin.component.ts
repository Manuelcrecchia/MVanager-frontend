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
import { Subscription, filter, firstValueFrom } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { NoteUnreadService } from '../../service/note-unread.service';

type DeadlineStatus = 'ok' | 'warning' | 'expired';

interface DeadlineSummary {
  expiredCount: number;
  warningCount: number;
  pendingCount: number;
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
  action?: () => void;
  desktopPath?: string;
  queryParams?: Record<string, string>;
  badgeCount?: () => number;
  badgeClass?: () => string;
  children?: HomeButton[];
}

interface HomeCategory {
  id: string;
  label: string;
  icon: string;
  buttons: HomeButton[];
}

type HomeNavigationItem =
  | { type: 'button'; key: string; button: HomeButton }
  | { type: 'category'; key: string; category: HomeCategory };

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

interface CustomerArchiveReminder {
  notificationId: number;
  numeroCliente: string;
  clienteNome: string;
  createdAt?: string | null;
}

interface EmailHealthIssue {
  id: number;
  label: string;
  email: string;
  smtpStatus?: string;
  smtpLastError?: string | null;
  smtpLastCheckAt?: string | null;
  imapStatus?: string;
  imapLastError?: string | null;
  imapLastCheckAt?: string | null;
  connectionStatus?: string;
  connectionError?: string | null;
}

@Component({
  selector: 'app-homeadmin',
  templateUrl: './homeadmin.component.html',
  styleUrls: ['./homeadmin.component.css'],
})
export class HomeAdminComponent implements OnInit, OnDestroy {
  private quoteAcceptanceSubscription?: Subscription;
  private employeeContractSubscription?: Subscription;
  private customerArchiveReminderSubscription?: Subscription;
  private routerEventsSubscription?: Subscription;
  private deadlineSummarySubscription?: Subscription;
  private adminTodoSubscription?: Subscription;
  private internalWarehouseSummarySubscription?: Subscription;
  private emailUnreadIntervalId?: ReturnType<typeof setInterval>;
  private internalWarehouseSummaryIntervalId?: ReturnType<typeof setInterval>;
  private readonly desktopEmbeddedRootPaths = new Set([
    'addCustomer',
    'addQuote',
    'accounting',
    'calendarHome',
    'candidates',
    'cambiapassword',
    'customer-asset-deadlines',
    'customer-assets',
    'customer-deadlines',
    'customerNotes',
    'employeeNotes',
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
    'schedaDipendente',
    'service-orders',
    'settingsemployees',
    'shifts',
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
    public noteUnread: NoteUnreadService,
  ) {}

  isMenuOpen: boolean = false;
  selectedHomeCategoryId = '';
  expandedHomeCategoryId = '';
  expandedHomeButtonKey = '';
  permessiInAttesa: number = 0;
  candidatiNonCompletati: number = 0;
  pendingQuoteReviews: number = 0;
  pendingEmployeeContractReviews: number = 0;
  emailUnreadCount: number = 0;
  emailAccountIssueCount: number = 0;
  internalWarehouseLowStockCount: number = 0;
  internalWarehousePendingRequestCount: number = 0;
  internalWarehouseMaterialOrderCounts: Record<string, number> = {};
  employeeDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();
  vehicleDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();
  equipmentDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();
  customerDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();
  customerAssetDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();
  internalDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();
  sidebarCollapsed = false;
  settingsMenuOpen = false;
  adminTodos: AdminTodo[] = [];
  newTodoTitle = '';
  todoLoading = false;
  todoSaving = false;
  todoError = '';
  mobileTodoExpanded = false;
  unassignedPermissionLabels: string[] = [];
  emailHealthIssues: EmailHealthIssue[] = [];
  emailHealthNoticeVisible = false;
  private dismissedEmailHealthIssueKey = '';
  private emailHealthRefreshRunning = false;
  private customerArchiveReminderQueue: CustomerArchiveReminder[] = [];
  private customerArchiveReminderOpen = false;

  ngOnInit(): void {
    this.noteUnread.start();
    // Il menu deve riflettere subito i moduli appena pubblicati da MVControl.
    // Senza refresh la feature fatture poteva restare nascosta fino a una nuova sessione.
    this.global.loadTenantConfig(true, { showError: false }).finally(() => {
      this.checkPermessiInAttesa();
      this.loadActiveCandidatesCount();
      this.loadDeadlineSummary();
      this.loadPendingQuoteReviews();
      this.loadPendingEmployeeContractReviews();
      this.loadEmailUnreadSummary();
      this.loadEmailHealthNotice(false, true);
      this.loadInternalWarehouseSummary();
      this.loadUnassignedPermissionNotice();
      this.loadPendingCustomerArchiveReminders();
      if (this.canUseTodoView()) {
        this.loadAdminTodos();
      }
      setTimeout(() => this.loadEmailUnreadSummary(), 1500);
      setTimeout(() => this.loadEmailHealthNotice(true, true), 600);
    }).catch((err) => {
      console.error('Errore caricamento config tenant:', err);
    });
    this.deadlineSummarySubscription = this.global.deadlineSummaryChanged$.subscribe(() => this.loadDeadlineSummary());
    this.updateDesktopHomeState();
    this.bindRouterState();
    this.bindQuoteAcceptanceUpdates();
    this.bindEmployeeContractUpdates();
    this.bindCustomerArchiveReminderUpdates();
    this.bindInternalWarehouseSummaryUpdates();
    if (this.canUseTodoView()) {
      this.bindAdminTodoUpdates();
    }
    this.bindEmailUnreadPolling();
  }

  ngOnDestroy(): void {
    this.quoteAcceptanceSubscription?.unsubscribe();
    this.employeeContractSubscription?.unsubscribe();
    this.customerArchiveReminderSubscription?.unsubscribe();
    this.routerEventsSubscription?.unsubscribe();
    this.deadlineSummarySubscription?.unsubscribe();
    this.adminTodoSubscription?.unsubscribe();
    this.internalWarehouseSummarySubscription?.unsubscribe();
    if (this.emailUnreadIntervalId) {
      clearInterval(this.emailUnreadIntervalId);
    }
    if (this.internalWarehouseSummaryIntervalId) {
      clearInterval(this.internalWarehouseSummaryIntervalId);
    }
    this.renderer.removeClass(document.body, 'is-desktop');
    this.renderer.removeStyle(document.documentElement, '--admin-sidebar-width');
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

  loadActiveCandidatesCount(): void {
    if (!this.canUsePermission('CANDIDATES_VIEW', 'candidates')) {
      this.candidatiNonCompletati = 0;
      return;
    }

    this.http
      .get<unknown[]>(this.global.url + 'candidates/getAll?scope=active', {
        headers: this.global.headers,
      })
      .subscribe({
        next: (rows) => {
          this.candidatiNonCompletati = Array.isArray(rows) ? rows.length : 0;
        },
        error: (err) => {
          console.error('Errore caricamento candidati non completati:', err);
          this.candidatiNonCompletati = 0;
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
    this.syncAdminSidebarWidth();
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
      this.customerAssetDeadlineSummary = this.emptyDeadlineSummary();
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
          this.customerAssetDeadlineSummary = this.normalizeDeadlineSummary(res?.customerAssets);
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
    if (!this.canUsePermission('EMAIL_VIEW') && !this.canUsePermission('EMAIL_SETTINGS', 'email')) {
      this.emailUnreadCount = 0;
      this.emailAccountIssueCount = 0;
      return;
    }

    this.http
      .get<{ count: number; accountErrorCount?: number }>(this.global.url + 'admin/email/unread-summary')
      .subscribe({
        next: (res) => {
          this.emailUnreadCount = Number(res?.count) || 0;
          this.emailAccountIssueCount = Number(res?.accountErrorCount) || 0;
          if (this.emailAccountIssueCount > 0) {
            this.loadEmailHealthNotice(false, true);
          } else if (!this.emailHealthRefreshRunning) {
            this.emailHealthIssues = [];
            this.emailHealthNoticeVisible = false;
          }
        },
        error: (err) => {
          console.error('Errore caricamento email non lette:', err);
        },
      });
  }

  loadEmailHealthNotice(refresh = false, allowOpen = true): void {
    if (!this.canUsePermission('EMAIL_VIEW') && !this.canUsePermission('EMAIL_SETTINGS', 'email')) {
      this.emailHealthIssues = [];
      this.emailHealthNoticeVisible = false;
      this.emailAccountIssueCount = 0;
      return;
    }
    if (refresh && this.emailHealthRefreshRunning) return;

    if (refresh) this.emailHealthRefreshRunning = true;
    const suffix = refresh ? '?refresh=true' : '';
    this.http
      .get<{ accountErrorCount: number; issues: EmailHealthIssue[] }>(
        this.global.url + `admin/email/health-summary${suffix}`,
      )
      .subscribe({
        next: (res) => {
          if (refresh) this.emailHealthRefreshRunning = false;
          this.emailHealthIssues = Array.isArray(res?.issues) ? res.issues : [];
          this.emailAccountIssueCount = Number(res?.accountErrorCount) || this.emailHealthIssues.length;
          this.applyEmailHealthNoticeVisibility(allowOpen);
        },
        error: (err) => {
          if (refresh) this.emailHealthRefreshRunning = false;
          console.error('Errore controllo stato email:', err);
        },
      });
  }

  private applyEmailHealthNoticeVisibility(allowOpen: boolean): void {
    if (!this.emailHealthIssues.length) {
      this.emailHealthNoticeVisible = false;
      return;
    }

    const key = this.emailHealthIssueKey();
    if (allowOpen && key !== this.dismissedEmailHealthIssueKey) {
      this.emailHealthNoticeVisible = true;
    }
  }

  private emailHealthIssueKey(): string {
    return this.emailHealthIssues
      .map((issue) => `${issue.id}:${issue.smtpStatus || ''}:${issue.imapStatus || ''}:${issue.connectionError || ''}`)
      .sort()
      .join('|');
  }

  closeEmailHealthNotice(): void {
    this.dismissedEmailHealthIssueKey = this.emailHealthIssueKey();
    this.emailHealthNoticeVisible = false;
  }

  goToEmailSettingsFromNotice(): void {
    this.closeEmailHealthNotice();
    this.navigateToEmailSettings();
  }

  emailHealthIssueTitle(issue: EmailHealthIssue): string {
    return issue.label || issue.email || 'Account email';
  }

  emailHealthIssueSummary(issue: EmailHealthIssue): string {
    if (issue.smtpStatus === 'error' && issue.imapStatus === 'error') return 'SMTP e IMAP non funzionano';
    if (issue.smtpStatus === 'error') return 'Invio email non funzionante';
    if (issue.imapStatus === 'error') return 'Ricezione email non funzionante';
    return 'Connessione email non funzionante';
  }

  emailHealthIssueDetail(issue: EmailHealthIssue): string {
    return issue.connectionError || 'Controlla host, porte, sicurezza, username e password.';
  }

  loadInternalWarehouseSummary(): void {
    if (!this.canUsePermission('INTERNAL_WAREHOUSE_VIEW', 'internalWarehouse')) {
      this.internalWarehouseLowStockCount = 0;
      this.internalWarehousePendingRequestCount = 0;
      this.internalWarehouseMaterialOrderCounts = {};
      return;
    }

    this.http
      .get<{
        lowStockCount: number;
        pendingRequestCount: number;
        materialOrderCounts?: Record<string, number>;
      }>(this.global.url + 'admin/internal-warehouse/summary')
      .subscribe({
        next: (res) => {
          this.internalWarehouseLowStockCount = Number(res?.lowStockCount) || 0;
          this.internalWarehousePendingRequestCount = Number(res?.pendingRequestCount) || 0;
          this.internalWarehouseMaterialOrderCounts = res?.materialOrderCounts || {};
        },
        error: (err) => {
          console.error('Errore caricamento riepilogo magazzino:', err);
          this.internalWarehouseLowStockCount = 0;
          this.internalWarehousePendingRequestCount = 0;
          this.internalWarehouseMaterialOrderCounts = {};
        },
      });
  }

  private bindInternalWarehouseSummaryUpdates(): void {
    if (!this.internalWarehouseSummarySubscription) {
      this.internalWarehouseSummarySubscription = this.socketService
        .onResourceChanges(['internal_warehouse', 'material_orders'])
        .subscribe(() => this.loadInternalWarehouseSummary());
    }

    if (!this.internalWarehouseSummaryIntervalId) {
      this.internalWarehouseSummaryIntervalId = setInterval(
        () => this.loadInternalWarehouseSummary(),
        30000,
      );
    }
  }

  private bindEmailUnreadPolling(): void {
    if (this.emailUnreadIntervalId) {
      return;
    }

    this.emailUnreadIntervalId = setInterval(() => {
      if (this.canUsePermission('EMAIL_VIEW') || this.canUsePermission('EMAIL_SETTINGS', 'email')) {
        this.loadEmailUnreadSummary();
      }
    }, 30000);
  }

  private bindQuoteAcceptanceUpdates(): void {
    if (this.quoteAcceptanceSubscription) {
      return;
    }

    this.quoteAcceptanceSubscription = this.socketService
      .onResourceChanges('quotes')
      .subscribe((change) => {
        const update: any = change.metadata || {};
        if (!update.kind) return;
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
      .onResourceChanges('employee_contracts')
      .subscribe((change) => {
        const update: any = change.metadata || {};
        if (!update.kind) return;
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

  private bindCustomerArchiveReminderUpdates(): void {
    if (this.customerArchiveReminderSubscription) return;

    this.customerArchiveReminderSubscription = this.socketService
      .onResourceChanges('customers')
      .subscribe((change) => {
        const update: any = change.metadata || {};
        if (update?.kind === 'resolved') {
          const notificationId = Number(update?.notificationId);
          const numeroCliente = String(update?.numeroCliente || '').trim();
          this.customerArchiveReminderQueue = this.customerArchiveReminderQueue.filter((item) =>
            item.notificationId !== notificationId && item.numeroCliente !== numeroCliente,
          );
          return;
        }
        if (update?.kind !== 'created') return;
        this.enqueueCustomerArchiveReminder({
          notificationId: Number(update?.notificationId),
          numeroCliente: String(update?.numeroCliente || '').trim(),
          clienteNome: String(update?.clienteNome || '').trim(),
        });
      });
  }

  private loadPendingCustomerArchiveReminders(): void {
    if (!this.canUsePermission('CUSTOMERS_MANAGE')) return;
    this.http.get<CustomerArchiveReminder[]>(
      this.global.url + 'admin/notifications/archive-reminders/pending',
      { headers: this.global.headers },
    ).subscribe({
      next: (rows) => (rows || []).forEach((row) => this.enqueueCustomerArchiveReminder(row)),
      error: (err) => console.error('Errore caricamento reminder archiviazione clienti:', err),
    });
  }

  private enqueueCustomerArchiveReminder(reminder: CustomerArchiveReminder): void {
    const notificationId = Number(reminder?.notificationId);
    const numeroCliente = String(reminder?.numeroCliente || '').trim();
    if (!notificationId || !numeroCliente) return;
    const duplicate = this.customerArchiveReminderQueue.some((item) =>
      item.notificationId === notificationId || item.numeroCliente === numeroCliente,
    );
    if (duplicate) return;
    this.customerArchiveReminderQueue.push({
      ...reminder,
      notificationId,
      numeroCliente,
      clienteNome: String(reminder?.clienteNome || '').trim(),
    });
    void this.showNextCustomerArchiveReminder();
  }

  private async showNextCustomerArchiveReminder(): Promise<void> {
    if (this.customerArchiveReminderOpen) return;
    const reminder = this.customerArchiveReminderQueue.shift();
    if (!reminder) return;

    this.customerArchiveReminderOpen = true;
    const customerLabel = reminder.clienteNome
      ? `${reminder.clienteNome} (#${reminder.numeroCliente})`
      : `#${reminder.numeroCliente}`;
    try {
      const archive = await this.popup.confirm(
        `Il cliente ${customerLabel} ha firmato il foglio di fine lavoro. Vuoi archiviarlo?`,
        'Foglio di fine lavoro firmato',
        {
          type: 'success',
          confirmLabel: 'Archivia',
          cancelLabel: 'Annulla',
        },
      );
      await firstValueFrom(this.http.post(
        this.global.url + `admin/notifications/archive-reminders/${reminder.notificationId}/resolve`,
        { action: archive ? 'archive' : 'dismiss' },
        { headers: this.global.headers },
      ));
      if (archive) {
        this.snackBar.open(`Cliente ${customerLabel} archiviato`, 'Chiudi', { duration: 4000 });
      }
    } catch (err) {
      this.popup.showHttpError(err, 'Impossibile gestire il promemoria del cliente.');
    } finally {
      this.customerArchiveReminderOpen = false;
      void this.showNextCustomerArchiveReminder();
    }
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

  navigateToCategorySettings() {
    this.navigateInHome('category-settings');
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

    this.router.navigate(['/homeAdmin/shifts']);
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

  navigateToCandidates() {
    this.navigateInHome('candidates');
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

  navigateToCustomerAssetDeadlines() {
    this.navigateInHome('customer-asset-deadlines');
  }

  navigateToCustomerAssets() {
    this.navigateInHome('customer-assets');
  }

  getCustomerAssetsModuleLabel(): string {
    return this.global.getTenantCustomerAssetsConfig().moduleLabel || 'Presidi presso clienti';
  }

  getCustomerAssetDeadlinesLabel(): string {
    const moduleLabel = this.getCustomerAssetsModuleLabel();
    return `Scadenze ${moduleLabel}${/presso clienti/i.test(moduleLabel) ? '' : ' presso clienti'}`;
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

  navigateToInternalWarehouse(tab: string = 'list', materialStatus?: string) {
    const commands = this.isDesktopHome
      ? ['/homeAdmin', 'internal-warehouse']
      : ['/internal-warehouse'];
    this.router.navigate(commands, {
      queryParams: { tab, materialStatus: materialStatus || null },
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
        badgeCount: () => this.emailUnreadCount + this.emailAccountIssueCount,
        badgeClass: () => this.emailAccountIssueCount > 0 ? 'alert-badge alert-badge-expired' : 'badge bg-danger ms-1',
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
    const categories: HomeCategory[] = [
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
            label: 'Riepilogo ore dipendenti',
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
            badgeCount: () => this.noteUnread.typeTotal('employee'),
            badgeClass: () => 'badge bg-danger ms-1',
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
            label: 'Candidati',
            icon: 'fas fa-user-plus',
            permission: 'CANDIDATES_VIEW',
            feature: 'candidates',
            action: () => this.navigateToCandidates(),
            desktopPath: 'candidates',
            badgeCount: () => this.candidatiNonCompletati + this.noteUnread.typeTotal('candidate'),
            badgeClass: () => 'badge bg-danger ms-1',
          },
          {
            label: 'Gestione permessi',
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
            badgeCount: () => this.noteUnread.typeTotal('customer'),
            badgeClass: () => 'badge bg-danger ms-1',
          },
          {
            label: 'Gestione Preventivi',
            icon: 'fas fa-file-alt',
            permission: 'QUOTES_VIEW',
            feature: 'quotes',
            action: () => this.navigateToQuotesHome(),
            desktopPath: 'quotesHome',
            badgeCount: () => this.pendingQuoteReviews + this.noteUnread.typeTotal('quote'),
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
          {
            label: 'Riepilogo ore clienti',
            icon: 'fas fa-user-clock',
            permission: 'CUSTOMERS_HOURS_VIEW',
            feature: 'customerHours',
            action: () => this.goToRiepilogoOreClienti(),
            desktopPath: 'riepilogo-ore-clienti',
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
            label: 'Ordini materiali',
            icon: 'fas fa-truck-loading',
            permission: 'INTERNAL_WAREHOUSE_OUT',
            feature: 'internalWarehouse',
            badgeCount: () => Number(this.internalWarehouseMaterialOrderCounts['active'] || 0),
            badgeClass: () => 'badge bg-danger ms-1',
            children: [
              {
                label: 'Da preparare',
                icon: 'fas fa-box-open',
                permission: 'INTERNAL_WAREHOUSE_OUT',
                feature: 'internalWarehouse',
                action: () => this.navigateToInternalWarehouse('material-orders', 'to-prepare'),
                desktopPath: 'internal-warehouse',
                queryParams: { tab: 'material-orders', materialStatus: 'to-prepare' },
                badgeCount: () => ['draft', 'requested', 'approved'].reduce(
                  (total, status) => total + Number(this.internalWarehouseMaterialOrderCounts[status] || 0), 0,
                ),
                badgeClass: () => 'badge bg-warning text-dark ms-1',
              },
              {
                label: 'In preparazione',
                icon: 'fas fa-spinner',
                permission: 'INTERNAL_WAREHOUSE_OUT',
                feature: 'internalWarehouse',
                action: () => this.navigateToInternalWarehouse('material-orders', 'preparing'),
                desktopPath: 'internal-warehouse',
                queryParams: { tab: 'material-orders', materialStatus: 'preparing' },
                badgeCount: () => Number(this.internalWarehouseMaterialOrderCounts['preparing'] || 0),
                badgeClass: () => 'badge bg-info text-dark ms-1',
              },
              {
                label: 'Preparati',
                icon: 'fas fa-boxes-stacked',
                permission: 'INTERNAL_WAREHOUSE_OUT',
                feature: 'internalWarehouse',
                action: () => this.navigateToInternalWarehouse('material-orders', 'prepared'),
                desktopPath: 'internal-warehouse',
                queryParams: { tab: 'material-orders', materialStatus: 'prepared' },
                badgeCount: () => Number(this.internalWarehouseMaterialOrderCounts['prepared'] || 0),
                badgeClass: () => 'badge bg-success ms-1',
              },
              {
                label: 'In attesa firma destinatario',
                icon: 'fas fa-signature',
                permission: 'INTERNAL_WAREHOUSE_OUT',
                feature: 'internalWarehouse',
                action: () => this.navigateToInternalWarehouse('material-orders', 'waiting-customer'),
                desktopPath: 'internal-warehouse',
                queryParams: { tab: 'material-orders', materialStatus: 'waiting-customer' },
                badgeCount: () => Number(this.internalWarehouseMaterialOrderCounts['ready'] || 0),
                badgeClass: () => 'badge bg-warning text-dark ms-1',
              },
              {
                label: 'Consegnati in parte',
                icon: 'fas fa-truck-ramp-box',
                permission: 'INTERNAL_WAREHOUSE_OUT',
                feature: 'internalWarehouse',
                action: () => this.navigateToInternalWarehouse('material-orders', 'partially-delivered'),
                desktopPath: 'internal-warehouse',
                queryParams: { tab: 'material-orders', materialStatus: 'partially-delivered' },
                badgeCount: () => Number(this.internalWarehouseMaterialOrderCounts['partially_delivered'] || 0),
                badgeClass: () => 'badge bg-info text-dark ms-1',
              },
              {
                label: 'Completati',
                icon: 'fas fa-circle-check',
                permission: 'INTERNAL_WAREHOUSE_OUT',
                feature: 'internalWarehouse',
                action: () => this.navigateToInternalWarehouse('material-orders', 'completed'),
                desktopPath: 'internal-warehouse',
                queryParams: { tab: 'material-orders', materialStatus: 'completed' },
              },
              {
                label: 'Annullati',
                icon: 'fas fa-ban',
                permission: 'INTERNAL_WAREHOUSE_OUT',
                feature: 'internalWarehouse',
                action: () => this.navigateToInternalWarehouse('material-orders', 'cancelled'),
                desktopPath: 'internal-warehouse',
                queryParams: { tab: 'material-orders', materialStatus: 'cancelled' },
              },
            ],
          },
          {
            label: 'Ordini fornitori',
            icon: 'fas fa-paper-plane',
            permission: 'INTERNAL_WAREHOUSE_IN',
            permissionsAny: ['INTERNAL_WAREHOUSE_IN', 'INTERNAL_WAREHOUSE_PRODUCTS_MANAGE'],
            feature: 'internalWarehouse',
            action: () => this.navigateToInternalWarehouse('orders'),
            desktopPath: 'internal-warehouse',
            queryParams: { tab: 'orders' },
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
            label: 'Prodotti',
            icon: 'fas fa-tags',
            permission: 'INTERNAL_WAREHOUSE_PRODUCTS_MANAGE',
            feature: 'internalWarehouse',
            action: () => this.navigateToInternalWarehouse('products'),
            desktopPath: 'internal-warehouse',
            queryParams: { tab: 'products' },
          },
          {
            label: 'Strumenti',
            icon: 'fas fa-tools',
            permission: 'INTERNAL_WAREHOUSE_EXPORT',
            permissionsAny: ['INTERNAL_WAREHOUSE_EXPORT', 'INTERNAL_WAREHOUSE_PRODUCTS_MANAGE'],
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
            feature: 'employeeDeadlines',
            action: () => this.navigateToEmployeeDeadlines(),
            desktopPath: 'employee-deadlines',
            badgeCount: () => this.deadlineBadgeCount(this.employeeDeadlineSummary),
            badgeClass: () => this.deadlineBadgeClass(this.employeeDeadlineSummary),
          },
          {
            label: 'Scadenze mezzi',
            icon: 'fas fa-car',
            permission: 'VEHICLE_DEADLINES_VIEW',
            feature: 'vehicleDeadlines',
            action: () => this.navigateToVehicleDeadlines(),
            desktopPath: 'vehicle-deadlines',
            badgeCount: () => this.deadlineBadgeCount(this.vehicleDeadlineSummary),
            badgeClass: () => this.deadlineBadgeClass(this.vehicleDeadlineSummary),
          },
          {
            label: 'Scadenze attrezzature',
            icon: 'fas fa-toolbox',
            permission: 'EQUIPMENT_DEADLINES_VIEW',
            feature: 'equipmentDeadlines',
            action: () => this.navigateToEquipmentDeadlines(),
            desktopPath: 'equipment-deadlines',
            badgeCount: () => this.deadlineBadgeCount(this.equipmentDeadlineSummary),
            badgeClass: () => this.deadlineBadgeClass(this.equipmentDeadlineSummary),
          },
          {
            label: 'Scadenze clienti',
            icon: 'fas fa-user-shield',
            permission: 'CUSTOMER_DEADLINES_VIEW',
            feature: 'customerDeadlines',
            action: () => this.navigateToCustomerDeadlines(),
            desktopPath: 'customer-deadlines',
            badgeCount: () => this.deadlineBadgeCount(this.customerDeadlineSummary),
            badgeClass: () => this.deadlineBadgeClass(this.customerDeadlineSummary),
          },
          {
            label: this.getCustomerAssetDeadlinesLabel(),
            icon: 'fas fa-fire-extinguisher',
            permission: 'CUSTOMER_ASSET_DEADLINES_VIEW',
            feature: 'customerAssets',
            action: () => this.navigateToCustomerAssetDeadlines(),
            desktopPath: 'customer-asset-deadlines',
            badgeCount: () => this.deadlineBadgeCount(this.customerAssetDeadlineSummary),
            badgeClass: () => this.deadlineBadgeClass(this.customerAssetDeadlineSummary),
          },
          {
            label: 'Scadenze interne',
            icon: 'fas fa-building-shield',
            permission: 'INTERNAL_DEADLINES_VIEW',
            feature: 'internalDeadlines',
            action: () => this.navigateToInternalDeadlines(),
            desktopPath: 'internal-deadlines',
            badgeCount: () => this.deadlineBadgeCount(this.internalDeadlineSummary),
            badgeClass: () => this.deadlineBadgeClass(this.internalDeadlineSummary),
          },
        ],
      },
    ];

    const categoryOrder = ['commerciale', 'personale', 'billing', 'accounting', 'internalWarehouse', 'operativo'];
    const buttonOrder: Record<string, string[]> = {
      commerciale: ['quotesHome', 'listCustomer', 'service-orders', 'riepilogo-ore-clienti'],
      personale: ['gestioneemployees', 'gestionepermessi', 'shifts', 'timbratureHome', 'riepilogo-presenze-editabile', 'candidates', 'employee-contracts'],
      internalWarehouse: ['list', 'in', 'out', 'requests', 'material-orders', 'orders', 'products', 'movements', 'tools'],
      operativo: ['customer-deadlines', 'customer-asset-deadlines', 'employee-deadlines', 'vehicle-deadlines', 'equipment-deadlines', 'internal-deadlines'],
    };
    const buttonKey = (button: HomeButton): string => (
      button.queryParams?.['tab'] || button.children?.[0]?.queryParams?.['tab'] || button.desktopPath || ''
    );

    for (const category of categories) {
      const order = buttonOrder[category.id];
      if (!order) continue;
      category.buttons.sort((left, right) => {
        const leftIndex = order.indexOf(buttonKey(left));
        const rightIndex = order.indexOf(buttonKey(right));
        return (leftIndex < 0 ? order.length : leftIndex) - (rightIndex < 0 ? order.length : rightIndex);
      });
    }

    return categories.sort(
      (left, right) => categoryOrder.indexOf(left.id) - categoryOrder.indexOf(right.id),
    );
  }

  get visibleHomeCategories(): HomeCategory[] {
    return this.homeCategories.filter(
      (category) => this.visibleHomeButtons(category).length > 0,
    );
  }

  get orderedHomeNavigationItems(): HomeNavigationItem[] {
    const categories = new Map(this.visibleHomeCategories.map((category) => [category.id, category]));
    const buttons = new Map<string, HomeButton>();
    for (const button of this.standaloneHomeButtons) {
      buttons.set(button.desktopPath || button.label.toLowerCase(), button);
      if (button.label === 'Email') buttons.set('email', button);
    }
    const order: Array<{ type: 'button' | 'category'; key: string }> = [
      { type: 'category', key: 'commerciale' },
      { type: 'category', key: 'personale' },
      { type: 'button', key: 'calendarHome' },
      { type: 'button', key: 'email' },
      { type: 'button', key: 'internal-documents' },
      { type: 'category', key: 'billing' },
      { type: 'category', key: 'accounting' },
      { type: 'category', key: 'internalWarehouse' },
      { type: 'category', key: 'operativo' },
      { type: 'button', key: 'statistiche' },
    ];

    return order.flatMap((item): HomeNavigationItem[] => {
      if (item.type === 'category') {
        const category = categories.get(item.key);
        return category ? [{ type: 'category', key: `category:${item.key}`, category }] : [];
      }
      const button = buttons.get(item.key);
      return button ? [{ type: 'button', key: `button:${item.key}`, button }] : [];
    });
  }

  get shouldShowHomeCategories(): boolean {
    return (
      !this.isDesktopHome &&
      this.mainMenuItemsCount > 1 &&
      !this.isMobileHomeChildRouteActive &&
      !this.selectedHomeCategoryId
    );
  }

  get isMobileHomeChildRouteActive(): boolean {
    return !this.isDesktopHome && !!this.activeDesktopChildPath();
  }

  get mainMenuItemsCount(): number {
    return this.orderedHomeNavigationItems.length;
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
      if (this.sidebarCollapsed) {
        this.sidebarCollapsed = false;
        this.syncAdminSidebarWidth();
        this.settingsMenuOpen = false;
        this.expandedHomeCategoryId = categoryId;
        this.selectedHomeCategoryId = categoryId;
        return;
      }
      this.expandedHomeCategoryId =
        this.expandedHomeCategoryId === categoryId ? '' : categoryId;
      this.selectedHomeCategoryId = this.expandedHomeCategoryId;
      return;
    }

    this.selectedHomeCategoryId = categoryId;
    this.scrollMobileHomeToTop();
  }

  clearHomeCategory(): void {
    this.selectedHomeCategoryId = '';
    if (!this.isDesktopHome) this.scrollMobileHomeToTop();
  }

  activateHomeButton(button: HomeButton): void {
    const children = this.visibleHomeButtonChildren(button);
    if (children.length) {
      const key = this.homeButtonKey(button);
      this.expandedHomeButtonKey = this.expandedHomeButtonKey === key ? '' : key;
      return;
    }

    if (this.isDesktopHome && button.desktopPath) {
      this.isDesktopContentActive = true;
      this.setExpandedCategoryForButton(button);
      this.navigateToHomeChild(button.desktopPath, button.queryParams);
      return;
    }

    button.action?.();
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
      .onResourceChanges('todos')
      .subscribe((change) => {
        const update: any = { action: change.action, ...(change.metadata || {}) };
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

  toggleMobileTodo(): void {
    this.mobileTodoExpanded = !this.mobileTodoExpanded;
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

  @HostListener('window:candidatesChanged')
  onCandidatesChanged(): void {
    this.loadActiveCandidatesCount();
  }

  visibleHomeButtons(category: HomeCategory): HomeButton[] {
    return category.buttons.filter((button) => this.canUseHomeButton(button));
  }

  visibleHomeButtonChildren(button: HomeButton): HomeButton[] {
    return (button.children || []).filter((child) => this.canUseHomeButton(child));
  }

  trackByHomeCategory(_index: number, category: HomeCategory): string {
    return category.id;
  }

  trackByHomeButton = (_index: number, button: HomeButton): string => this.homeButtonKey(button);

  homeButtonKey(button: HomeButton): string {
    const query = button.queryParams
      ? Object.entries(button.queryParams)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join('&')
      : '';
    return [
      button.desktopPath || button.label,
      button.permission,
      query,
    ].join('|');
  }

  isHomeButtonGroupExpanded(button: HomeButton): boolean {
    return this.expandedHomeButtonKey === this.homeButtonKey(button);
  }

  trackByHomeNavigationItem(_index: number, item: HomeNavigationItem): string {
    return item.key;
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
    const children = this.visibleHomeButtonChildren(button);
    if (children.length) return children.some((child) => this.isHomeButtonActive(child));
    return (
      !!button.desktopPath &&
      this.activeDesktopChildPath() === button.desktopPath &&
      this.buttonQueryParamsMatch(button)
    );
  }

  private buttonQueryParamsMatch(button: HomeButton): boolean {
    if (!button.queryParams) return true;
    const query = this.router.url.split('#')[0].split('?')[1] || '';
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

  categoryBadgeClass(category: HomeCategory): string {
    if (category.id !== 'operativo') return 'badge bg-danger ms-1';
    const summaries = [
      this.employeeDeadlineSummary,
      this.vehicleDeadlineSummary,
      this.equipmentDeadlineSummary,
      this.customerDeadlineSummary,
      this.internalDeadlineSummary,
    ];
    return this.deadlineBadgeClassFromCounts(
      summaries.reduce((total, summary) => total + summary.expiredCount, 0),
      summaries.reduce((total, summary) => total + summary.warningCount, 0),
      summaries.reduce((total, summary) => total + summary.pendingCount, 0),
    );
  }

  buttonBadgeCount(button: HomeButton): number {
    return button.badgeCount?.() || 0;
  }

  buttonBadgeClass(button: HomeButton): string {
    return button.badgeClass?.() || 'badge bg-danger ms-1';
  }

  deadlineBadgeClass(summary: DeadlineSummary): string {
    return this.deadlineBadgeClassFromCounts(summary.expiredCount, summary.warningCount, summary.pendingCount);
  }

  private deadlineBadgeClassFromCounts(expiredCount: number, warningCount: number, pendingCount: number): string {
    if (expiredCount > 0) return 'alert-badge alert-badge-expired';
    if (warningCount > 0) return 'alert-badge alert-badge-warning';
    if (pendingCount > 0) return 'alert-badge alert-badge-pending';
    return 'alert-badge';
  }

  deadlineBadgeCount(summary: DeadlineSummary): number {
    return summary.alertCount + summary.pendingCount;
  }

  private emptyDeadlineSummary(): DeadlineSummary {
    return {
      expiredCount: 0,
      warningCount: 0,
      pendingCount: 0,
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
      pendingCount: Number(raw.pendingCount) || 0,
      alertCount: Number(raw.alertCount) || 0,
      totalCount: Number(raw.totalCount) || 0,
      status:
        raw.status === 'expired' || raw.status === 'warning'
          ? raw.status
          : 'ok',
    };
  }

  private updateDesktopHomeState(): void {
    const wasDesktopHome = this.isDesktopHome;
    const nextIsDesktopHome =
      typeof window !== 'undefined' && window.matchMedia('(min-width: 992px)').matches;
    this.isDesktopHome = nextIsDesktopHome;
    if (this.isDesktopHome) {
      this.renderer.addClass(document.body, 'is-desktop');
    } else {
      this.renderer.removeClass(document.body, 'is-desktop');
    }
    this.syncAdminSidebarWidth();

    // I browser mobile emettono resize anche durante un normale scroll,
    // quando mostrano o nascondono la barra degli indirizzi. In quel caso non
    // va risincronizzato il menu: azzererebbe il sottomenu attualmente aperto.
    if (wasDesktopHome !== nextIsDesktopHome) {
      this.syncDesktopRouteState();
    }
  }

  private syncAdminSidebarWidth(): void {
    if (!this.isDesktopHome) {
      this.renderer.removeStyle(document.documentElement, '--admin-sidebar-width');
      return;
    }
    this.renderer.setStyle(
      document.documentElement,
      '--admin-sidebar-width',
      this.sidebarCollapsed ? '60px' : '260px',
    );
  }

  private bindRouterState(): void {
    this.routerEventsSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => this.syncDesktopRouteState());

    this.syncDesktopRouteState();
  }

  private syncDesktopRouteState(): void {
    if (this.redirectEmbeddedRouteOutOfMobileHome()) {
      return;
    }
    if (this.redirectStandaloneRouteIntoDesktopHome()) {
      return;
    }

    const activePath = this.activeDesktopChildPath();
    if (!activePath) {
      this.isDesktopContentActive = false;
      this.selectedHomeCategoryId = '';
      this.expandedHomeCategoryId = '';
      return;
    }

    const activeCategory = this.visibleHomeCategories.find((category) =>
      this.visibleHomeButtons(category).some(
        (button) => button.desktopPath === activePath || this.visibleHomeButtonChildren(button).some(
          (child) => child.desktopPath === activePath,
        ),
      ),
    );

    if (activeCategory) {
      this.selectedHomeCategoryId = activeCategory.id;
      this.expandedHomeCategoryId = activeCategory.id;
      this.isDesktopContentActive = this.isDesktopHome;
      const activeGroup = this.visibleHomeButtons(activeCategory).find((button) =>
        this.visibleHomeButtonChildren(button).some((child) => (
          child.desktopPath === activePath && this.buttonQueryParamsMatch(child)
        )),
      );
      if (activeGroup) this.expandedHomeButtonKey = this.homeButtonKey(activeGroup);
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
      this.visibleHomeButtons(category).some((item) => (
        item === button || this.visibleHomeButtonChildren(item).some((child) => child === button)
      )),
    );
    const parent = owner && this.visibleHomeButtons(owner).find((item) =>
      this.visibleHomeButtonChildren(item).some((child) => child === button),
    );
    this.expandedHomeCategoryId = owner?.id || '';
    this.selectedHomeCategoryId = owner?.id || '';
    if (parent) this.expandedHomeButtonKey = this.homeButtonKey(parent);
  }

  private scrollMobileHomeToTop(): void {
    if (typeof window === 'undefined') return;

    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      const mobileLayout = this.el?.nativeElement?.querySelector?.(
        '.mobile-layout',
      ) as HTMLElement | null;
      mobileLayout?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
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
      this.navigateToHomeChild(path, queryParams);
      return;
    }

    this.router.navigate([`/${path}`], { queryParams });
  }

  private navigateToHomeChild(path: string, queryParams?: Record<string, string>): void {
    const tree = this.router.createUrlTree(['/homeAdmin', path], {
      queryParams: queryParams || null,
    });
    const targetUrl = this.router.serializeUrl(tree);
    const currentUrl = this.router.url.split('#')[0];

    if (currentUrl === targetUrl) {
      this.router.navigateByUrl('/homeAdmin', { skipLocationChange: true }).then(() => {
        this.isDesktopContentActive = true;
        this.router.navigateByUrl(targetUrl);
      });
      return;
    }

    this.router.navigateByUrl(targetUrl);
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

  /**
   * Le pagine amministrative hanno una rotta incorporata nel guscio desktop
   * e una rotta autonoma per telefono. Diversi flussi storici puntano ancora
   * a /homeAdmin/...: sul mobile li normalizziamo qui in un solo punto, così
   * ogni pulsante apre davvero la pagina invece di lasciare visibile la home.
   */
  private redirectEmbeddedRouteOutOfMobileHome(): boolean {
    if (this.isDesktopHome) return false;

    const url = this.router.url;
    const [pathAndQuery, fragment] = url.split('#');
    const [cleanPath, query] = pathAndQuery.split('?');
    if (!cleanPath.startsWith('/homeAdmin/')) {
      return false;
    }

    const childPath = cleanPath.slice('/homeAdmin/'.length);
    const standalonePath = childPath === 'shifts' || childPath.startsWith('shifts/')
      ? `/admin/${childPath}`
      : `/${childPath}`;
    const target =
      standalonePath +
      (query ? `?${query}` : '') +
      (fragment ? `#${fragment}` : '');

    this.router.navigateByUrl(target, { replaceUrl: true });
    return true;
  }
}
