import { Component, OnDestroy, OnInit, ElementRef, HostListener } from '@angular/core';
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

@Component({
  selector: 'app-homeadmin',
  templateUrl: './homeadmin.component.html',
  styleUrls: ['./homeadmin.component.css'],
})
export class HomeAdminComponent implements OnInit, OnDestroy {
  private quoteAcceptanceSubscription?: Subscription;
  private routerEventsSubscription?: Subscription;
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
  ) {}

  isMenuOpen: boolean = false;
  selectedHomeCategoryId = '';
  permessiInAttesa: number = 0;
  pendingQuoteReviews: number = 0;
  employeeDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();
  vehicleDeadlineSummary: DeadlineSummary = this.emptyDeadlineSummary();

  ngOnInit(): void {
    this.updateDesktopHomeState();
    this.bindRouterState();
    this.checkPermessiInAttesa();
    this.loadDeadlineSummary();
    this.loadPendingQuoteReviews();
    this.bindQuoteAcceptanceUpdates();
  }

  ngOnDestroy(): void {
    this.quoteAcceptanceSubscription?.unsubscribe();
    this.routerEventsSubscription?.unsubscribe();
  }

  checkPermessiInAttesa(): void {
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

  loadDeadlineSummary(): void {
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
        },
        error: (err) => {
          console.error('Errore caricamento riepilogo scadenze:', err);
        },
      });
  }

  loadPendingQuoteReviews(): void {
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

  navigateToLeaveSettings() {
    this.router.navigateByUrl('/leave-settings');
  }

  navigateToVehiclesSettings() {
    this.router.navigateByUrl('/vehiclesSettings');
  }

  navigateToQuoteSettings() {
    this.router.navigateByUrl('/quoteSettings');
  }

  get homeCategories(): HomeCategory[] {
    return [
      {
        id: 'personale',
        label: 'Personale',
        icon: 'fas fa-user-friends',
        buttons: [
          {
            label: 'Gestione Dipendenti',
            icon: 'fas fa-user',
            permission: 'EMPLOYEE_VIEW',
            action: () => this.navigateToGestioneemployees(),
            desktopPath: 'gestioneemployees',
          },
          {
            label: 'Scadenze Dipendenti',
            icon: 'fas fa-id-card',
            permission: 'EMPLOYEE_DEADLINES_VIEW',
            action: () => this.navigateToEmployeeDeadlines(),
            desktopPath: 'employee-deadlines',
            badgeCount: () => this.employeeDeadlineSummary.alertCount,
            badgeClass: () => this.deadlineBadgeClass(this.employeeDeadlineSummary),
          },
          {
            label: 'Turni',
            icon: 'fas fa-tasks',
            permission: 'SHIFTS_VIEW',
            action: () => this.goToShifts(),
            desktopPath: 'shifts',
          },
          {
            label: 'Riepilogo presenze personalizzabile',
            icon: 'fas fa-clock',
            permission: 'ATTENDANCE_MANAGE',
            action: () => this.goToEditableHours(),
            desktopPath: 'riepilogo-presenze-editabile',
          },
          {
            label: 'Gestione permessi e assenze',
            icon: 'fas fa-clipboard-check',
            permission: 'EMPLOYEE_PERMITS_MANAGE',
            action: () => this.navigateToGestionePermessi(),
            desktopPath: 'gestionepermessi',
            badgeCount: () => this.permessiInAttesa,
            badgeClass: () => 'badge bg-danger ms-1',
          },
          {
            label: 'Gestione Timbrature',
            icon: 'fas fa-fingerprint',
            permission: 'STAMPING_VIEW',
            action: () => this.navigateToTimbrature(),
            desktopPath: 'timbratureHome',
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
            action: () => this.navigateToListCustomer(),
            desktopPath: 'listCustomer',
          },
          {
            label: 'Gestione Preventivi',
            icon: 'fas fa-file-alt',
            permission: 'QUOTES_VIEW',
            action: () => this.navigateToQuotesHome(),
            desktopPath: 'quotesHome',
            badgeCount: () => this.pendingQuoteReviews,
            badgeClass: () => 'badge bg-danger ms-1',
          },
        ],
      },
      {
        id: 'operativo',
        label: 'Operativo',
        icon: 'fas fa-briefcase',
        buttons: [
          {
            label: 'Calendario',
            icon: 'fas fa-calendar',
            permission: 'CALENDAR_VIEW',
            action: () => this.navigateToCalendarHome(),
            desktopPath: 'calendarHome',
          },
          {
            label: 'Ordini di servizio',
            icon: 'fas fa-clipboard-list',
            permission: 'SERVICE_ORDERS_VIEW',
            action: () => this.navigateToServiceOrders(),
            desktopPath: 'service-orders',
          },
          {
            label: 'Riepilogo ore clienti',
            icon: 'fas fa-user-clock',
            permission: 'CUSTOMERS_HOURS_VIEW',
            action: () => this.goToRiepilogoOreClienti(),
            desktopPath: 'riepilogo-ore-clienti',
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
            action: () => this.navigateToGestioneUsers(),
            desktopPath: 'gestioneusers',
          },
          {
            label: 'Scadenze Mezzi',
            icon: 'fas fa-car',
            permission: 'VEHICLE_DEADLINES_VIEW',
            action: () => this.navigateToVehicleDeadlines(),
            desktopPath: 'vehicle-deadlines',
            badgeCount: () => this.vehicleDeadlineSummary.alertCount,
            badgeClass: () => this.deadlineBadgeClass(this.vehicleDeadlineSummary),
          },
          {
            label: 'Documenti interni',
            icon: 'fas fa-file',
            permission: 'INTERNAL_DOCS_ACCESS',
            action: () => this.navigateToInternalDocuments(),
            desktopPath: 'internal-documents',
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

    const selectedId =
      this.selectedHomeCategoryId ||
      (this.isDesktopHome ? this.visibleHomeCategories[0]?.id : "");

    const selectedCategory = this.visibleHomeCategories.find(
      (category) => category.id === selectedId,
    );

    return selectedCategory ? this.visibleHomeButtons(selectedCategory) : [];
  }

  get selectedHomeCategory(): HomeCategory | undefined {
    const selectedId =
      this.selectedHomeCategoryId ||
      (this.isDesktopHome ? this.visibleHomeCategories[0]?.id : "");
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
    this.isDesktopContentActive = false;
    this.router.navigate(['/homeAdmin']);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.updateDesktopHomeState();
  }

  visibleHomeButtons(category: HomeCategory): HomeButton[] {
    return category.buttons.filter((button) =>
      this.global.hasPermission(button.permission),
    );
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
    this.authService.logout();
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
