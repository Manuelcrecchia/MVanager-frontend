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
  feature?: string;
  action: () => void;
  desktopPath?: string;
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

@Component({
  selector: 'app-homeadmin',
  templateUrl: './homeadmin.component.html',
  styleUrls: ['./homeadmin.component.css'],
})
export class HomeAdminComponent implements OnInit, OnDestroy {
  private quoteAcceptanceSubscription?: Subscription;
  private routerEventsSubscription?: Subscription;
  private adminTodoSubscription?: Subscription;
  private emailUnreadIntervalId?: ReturnType<typeof setInterval>;
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
  permessiInAttesa: number = 0;
  pendingQuoteReviews: number = 0;
  emailUnreadCount: number = 0;
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

  ngOnInit(): void {
    this.global.loadTenantConfig().finally(() => {
      this.checkPermessiInAttesa();
      this.loadDeadlineSummary();
      this.loadPendingQuoteReviews();
      this.loadEmailUnreadSummary();
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
    if (this.canUseTodoView()) {
      this.bindAdminTodoUpdates();
    }
    this.bindEmailUnreadPolling();
  }

  ngOnDestroy(): void {
    this.quoteAcceptanceSubscription?.unsubscribe();
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

  navigateToCalendarHome() {
    this.router.navigateByUrl('/calendarHome');
  }

  navigateToInternalDocuments() {
    this.router.navigateByUrl('/internal-documents');
  }

  navigateToUserSettings() {
    this.router.navigateByUrl('/userSettings');
  }

  navigateToGestioneUsers() {
    this.router.navigateByUrl('/gestioneusers');
  }

  navigateToSettingsEmployees() {
    this.router.navigateByUrl('/settingsemployees');
  }

  navigateToQuotesHome() {
    this.router.navigateByUrl('/quotesHome');
  }

  navigateToServiceOrders() {
    this.router.navigateByUrl('/service-orders');
  }

  navigateToGestionePermessi() {
    this.router.navigateByUrl('/gestionepermessi');
  }

  navigateToListCustomer() {
    this.router.navigateByUrl('/listCustomer');
  }

  goToShifts() {
    this.router.navigate(['/admin/shifts']);
  }
  navigateToTimbrature() {
    this.router.navigateByUrl('/timbratureHome');
  }

  goToEditableHours() {
    this.router.navigate(['/riepilogo-presenze-editabile']);
  }

  goToRiepilogoOreClienti() {
    this.router.navigate(['/riepilogo-ore-clienti']);
  }

  back() {
    this.global.logout();
  }

  changeTenant(): void {
    this.tenantService.clearTenant();
    this.global.logout();
  }

  navigateToCambiapassword() {
    this.router.navigateByUrl('/cambiapassword');
  }
  navigateToGestioneemployees() {
    this.router.navigateByUrl('/gestioneemployees');
  }

  navigateToEmployeeDeadlines() {
    this.router.navigateByUrl('/employee-deadlines');
  }

  navigateToVehicleDeadlines() {
    this.router.navigateByUrl('/vehicle-deadlines');
  }

  navigateToEquipmentDeadlines() {
    this.router.navigateByUrl('/equipment-deadlines');
  }

  navigateToCustomerDeadlines() {
    this.router.navigateByUrl('/customer-deadlines');
  }

  navigateToInternalDeadlines() {
    this.router.navigateByUrl('/internal-deadlines');
  }

  navigateToLeaveSettings() {
    this.router.navigateByUrl('/leave-settings');
  }

  navigateToVehiclesSettings() {
    this.router.navigateByUrl('/vehiclesSettings');
  }

  navigateToQuoteSettings() {
    this.router.navigateByUrl('/quoteSettings');
  }

  navigateToEmailSettings() {
    this.router.navigateByUrl('/emailSettings');
  }

  navigateToNotificationSettings() {
    this.router.navigateByUrl('/notificationSettings');
  }

  navigateToWorkCompletionStats() {
    this.router.navigateByUrl('/work-completion-stats');
  }

  get homeCategories(): HomeCategory[] {
    return [
      {
        id: 'personale',
        label: 'Ufficio tecnico',
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
            label: 'Scadenze Mezzi',
            icon: 'fas fa-car',
            permission: 'VEHICLE_DEADLINES_VIEW',
            feature: 'deadlines',
            action: () => this.navigateToVehicleDeadlines(),
            desktopPath: 'vehicle-deadlines',
            badgeCount: () => this.vehicleDeadlineSummary.alertCount,
            badgeClass: () => this.deadlineBadgeClass(this.vehicleDeadlineSummary),
          },
          {
            label: 'Scadenze Attrezzature',
            icon: 'fas fa-toolbox',
            permission: 'EQUIPMENT_DEADLINES_VIEW',
            feature: 'deadlines',
            action: () => this.navigateToEquipmentDeadlines(),
            desktopPath: 'equipment-deadlines',
            badgeCount: () => this.equipmentDeadlineSummary.alertCount,
            badgeClass: () => this.deadlineBadgeClass(this.equipmentDeadlineSummary),
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
            feature: 'customers',
            action: () => this.goToRiepilogoOreClienti(),
            desktopPath: 'riepilogo-ore-clienti',
          },
        ],
      },
      {
        id: 'commerciale',
        label: 'Commerciale',
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
            label: 'Scadenze Clienti',
            icon: 'fas fa-user-shield',
            permission: 'CUSTOMER_DEADLINES_VIEW',
            feature: 'deadlines',
            action: () => this.navigateToCustomerDeadlines(),
            desktopPath: 'customer-deadlines',
            badgeCount: () => this.customerDeadlineSummary.alertCount,
            badgeClass: () => this.deadlineBadgeClass(this.customerDeadlineSummary),
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
            label: 'Calendario',
            icon: 'fas fa-calendar',
            permission: 'CALENDAR_VIEW',
            feature: 'calendar',
            action: () => this.navigateToCalendarHome(),
            desktopPath: 'calendarHome',
          },
          {
            label: 'Email',
            icon: 'fas fa-envelope',
            permission: 'EMAIL_VIEW',
            feature: 'email',
            action: () => this.router.navigateByUrl('/email'),
            desktopPath: 'email',
            badgeCount: () => this.emailUnreadCount,
            badgeClass: () => 'badge bg-danger ms-1',
          },
        ],
      },
      {
        id: 'operativo',
        label: 'Risorse umane',
        icon: 'fas fa-briefcase',
        buttons: [
          {
            label: 'Gestione Dipendenti',
            icon: 'fas fa-user',
            permission: 'EMPLOYEE_VIEW',
            feature: 'employees',
            action: () => this.navigateToGestioneemployees(),
            desktopPath: 'gestioneemployees',
          },
          {
            label: 'Scadenze Dipendenti',
            icon: 'fas fa-id-card',
            permission: 'EMPLOYEE_DEADLINES_VIEW',
            feature: 'deadlines',
            action: () => this.navigateToEmployeeDeadlines(),
            desktopPath: 'employee-deadlines',
            badgeCount: () => this.employeeDeadlineSummary.alertCount,
            badgeClass: () => this.deadlineBadgeClass(this.employeeDeadlineSummary),
          },
          {
            label: 'Scadenze Interne',
            icon: 'fas fa-building-shield',
            permission: 'INTERNAL_DEADLINES_VIEW',
            feature: 'deadlines',
            action: () => this.navigateToInternalDeadlines(),
            desktopPath: 'internal-deadlines',
            badgeCount: () => this.internalDeadlineSummary.alertCount,
            badgeClass: () => this.deadlineBadgeClass(this.internalDeadlineSummary),
          },
          {
            label: 'Riepilogo presenze personalizzabile',
            icon: 'fas fa-clock',
            permission: 'ATTENDANCE_MANAGE',
            feature: 'attendance',
            action: () => this.goToEditableHours(),
            desktopPath: 'riepilogo-presenze-editabile',
          },
          {
            label: 'Gestione permessi e assenze',
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
        id: 'amministrazione',
        label: 'Amministrazione',
        icon: 'fas fa-building',
        buttons: [
          {
            label: 'Gestione Users',
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
            feature: 'documents',
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
      this.visibleHomeCategories.length > 1 &&
      !this.selectedHomeCategoryId
    );
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
    this.selectedHomeCategoryId = categoryId;
    if (this.isDesktopHome) {
      this.isDesktopContentActive = false;
      this.router.navigate(['/homeAdmin']);
    }
  }

  clearHomeCategory(): void {
    this.selectedHomeCategoryId = '';
  }

  activateHomeButton(button: HomeButton): void {
    if (this.isDesktopHome && button.desktopPath) {
      this.isDesktopContentActive = true;
      this.router.navigate(['/homeAdmin', button.desktopPath]);
      return;
    }

    button.action();
  }

  showDesktopMainMenu(): void {
    this.selectedHomeCategoryId = '';
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

  get missingNewDeadlinePermissionLabels(): string[] {
    const missing = [
      {
        permission: 'EQUIPMENT_DEADLINES_VIEW',
        label: 'Scadenze attrezzature',
      },
      {
        permission: 'CUSTOMER_DEADLINES_VIEW',
        label: 'Scadenze clienti',
      },
      {
        permission: 'INTERNAL_DEADLINES_VIEW',
        label: 'Scadenze interne',
      },
    ].filter((item) => !this.canUsePermission(item.permission, 'deadlines'));

    return missing.map((item) => item.label);
  }

  get showDeadlinePermissionSetupNotice(): boolean {
    return (
      this.global.hasTenantFeature('deadlines') &&
      this.canUsePermission('ADMIN_EDIT', 'administrators') &&
      this.missingNewDeadlinePermissionLabels.length > 0
    );
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

  canUsePermission(permission: string, feature?: string): boolean {
    return (
      this.global.hasPermission(permission) &&
      (!feature || this.global.hasTenantFeature(feature))
    );
  }

  private canUseHomeButton(button: HomeButton): boolean {
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
      this.isDesktopContentActive = this.isDesktopHome;
    }
  }

  private activeDesktopChildPath(): string {
    const cleanUrl = this.router.url.split('?')[0].split('#')[0];
    if (!cleanUrl.startsWith('/homeAdmin/')) {
      return '';
    }

    return cleanUrl.replace('/homeAdmin/', '').split('/')[0];
  }
}
