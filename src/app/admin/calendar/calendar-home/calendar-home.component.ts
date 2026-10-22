import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Subscription } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { calendarDirectionsUrl, calendarPhoneUrl } from './calendar-contact-links';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../../service/global.service';
import { ActivatedRoute, Router } from '@angular/router';
import { AutomaticAddInspectionToCalendarService } from '../../../service/automatic-add-inspection-to-calendar.service';
import { PopupServiceService } from '../../../componenti/popup/popup-service.service';
import { TenantService } from '../../../service/tenant.service';
import { InspectionAlarmSyncService } from '../../../service/inspection-alarm-sync.service';
import { AgendaWidgetService } from '../../../service/agenda-widget.service';

type CalendarEventId = number | string;
interface CrossTenantShare { tenantId: string; mode: 'all' | 'selected'; visibility: 'busy' | 'details'; adminIds: number[]; }
interface FederationOption { tenantId: string; label: string; userId?: number; personal: boolean; availability: boolean; details: boolean; work?: boolean; users: Array<{ id: number; label: string }>; }
interface RawEvent {
  id: CalendarEventId;
  title: string;
  startDate: string;
  endDate: string;
  recurrenceRule: string;
  recurrenceException: any;
  description: string;
  categories: string;
  dayLong: boolean;
  status: string;
  inspectionAdminIds?: number[];
  inspectionReminderMinutes?: number | null;
  locationAddress?: string | null;
  contactPhone?: string | null;
  numeroCliente?: string | null;
  numeroPreventivo?: string | null;
  calendarScope?: 'work' | 'personal';
  ownerAdminId?: number | null;
  sharedWithWork?: boolean;
  sharedAdminIds?: number[];
  personalCategoryLabel?: string | null;
  personalCategoryColor?: string | null;
  canEdit?: boolean;
  customerWarehouseMode?: 'none' | 'load' | 'unload' | 'load_unload';
  sourceTenantId?: string;
  sourceAppointmentId?: number;
  sourceCompanyLabel?: string;
  isOwnAgenda?: boolean;
  busyOnly?: boolean;
  isSharedPersonal?: boolean;
  crossTenantShares?: CrossTenantShare[];
  personalSharingVisibility?: 'busy' | 'details';
}

interface CalEvent {
  id: CalendarEventId;
  title: string;
  start: Date;
  end: Date;
  description: string;
  categories: string;
  recurrenceRule: string;
  recurrenceException: string[];
  dayLong: boolean;
  isRecurring?: boolean;
  originalId?: CalendarEventId;
  inspectionAdminIds?: number[];
  inspectionReminderMinutes?: number | null;
  locationAddress?: string | null;
  contactPhone?: string | null;
  numeroCliente?: string | null;
  numeroPreventivo?: string | null;
  calendarScope?: 'work' | 'personal';
  ownerAdminId?: number | null;
  sharedWithWork?: boolean;
  sharedAdminIds?: number[];
  personalCategoryLabel?: string | null;
  personalCategoryColor?: string | null;
  canEdit?: boolean;
  customerWarehouseMode?: 'none' | 'load' | 'unload' | 'load_unload';
  sourceTenantId?: string;
  sourceAppointmentId?: number;
  sourceCompanyLabel?: string;
  isOwnAgenda?: boolean;
  busyOnly?: boolean;
  isSharedPersonal?: boolean;
  crossTenantShares?: CrossTenantShare[];
  personalSharingVisibility?: 'busy' | 'details';
}

interface AdminOption {
  id: number;
  nome: string;
  cognome: string;
  email: string;
}

interface CalendarCategoryOption {
  scope?: 'work' | 'personal';
  sharedOnly?: boolean;
  id: string;
  text: string;
  color: string;
  defaultForTenant?: boolean;
  withCustomerLink?: boolean;
  forShifts?: boolean;
  source?: 'none' | 'customers' | 'quotes';
  customerType?: string;
  quoteType?: string;
  inspection?: boolean;
  serviceOrder?: boolean;
  keyRequired?: boolean;
  customerWarehouse?: {
    enabled: boolean;
    allowedOperations: Array<'load' | 'unload' | 'load_unload'>;
    defaultOperation: 'none' | 'load' | 'unload' | 'load_unload';
  };
}

interface DayCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalEvent[];
  eventLayout?: Map<CalendarEventId, {col: number, totalCols: number}>;
}

type EditScope = 'single' | 'series';

@Component({
  selector: 'app-calendar-home',
  templateUrl: './calendar-home.component.html',
  styleUrl: './calendar-home.component.css',
})
export class CalendarHomeComponent implements OnInit, OnDestroy {

  readonly realtimeResources = ["appointments","quotes","customers","shifts"];
  refreshRealtimeData(): void | boolean | Promise<void | boolean> {
    this.loadPersonalCategories();
    this.loadFederationOptions();
    this.loadAll();
  }
  trackCalendarWeek(index: number, week: Date[]): number {
    return week?.[0]?.getTime() ?? index;
  }

  trackCalendarDay(index: number, day: Date): number {
    return day?.getTime() ?? index;
  }

  rawEvents: RawEvent[] = [];
  activeFilter = 'all';
  calendarGroup: 'all' | 'work' | 'personal' = 'all';
  currentAdminId: number | null = null;
  personalSettingsReady = false;
  personalSettingsError = '';
  private ownPersonalCategories: CalendarCategoryOption[] = [{ id: 'personal-event', text: 'Evento', color: '#7c3aed', scope: 'personal', source: 'none' }];
  currentView: 'month' | 'week' | 'day' = 'month';
  currentDate = new Date();

  showMiniCal = false;
  miniCalDate = new Date();

  showPopup = false;
  detailEvent: CalEvent | null = null;
  private detailSelectedDate: Date | null = null;
  showDayPopup = false;
  showEditScopeChoice = false;
  dayPopupDate: Date = new Date();
  dayPopupEvents: CalEvent[] = [];
  pendingEditEvent: CalEvent | null = null;
  pendingEditDate: Date | null = null;
  isNewEvent = true;
  editingEventId: number | null = null;
  isRecurringInstance = false;
  hasRecurrenceRule = false;
  editingSingleOccurrence = false;
  editingOccurrenceStart: Date | null = null;
  editingSelectedDate: Date | null = null;

  readonly MAX_OVERLAP_COLS = Number.POSITIVE_INFINITY;

  popupTitle = '';
  popupDescription = '';
  private popupLocationOverride: string | null = null;
  private popupPhoneOverride: string | null = null;
  private popupCustomerNumero = '';
  popupStartDate = '';
  popupEndDate = '';
  popupCategory = '';
  popupCalendarScope: 'work' | 'personal' = 'work';
  popupSharingMode: 'private' | 'all' | 'selected' = 'private';
  popupSharedAdminIds: number[] = [];
  sharingUsers: Array<{ id: number; label: string }> = [];
  sharingUsersReady = false;
  sharingUsersLoading = false;
  sharingUsersError = '';
  get popupSharedWithWork(): boolean { return this.popupSharingMode === 'all'; }
  set popupSharedWithWork(value: boolean) { this.popupSharingMode = value ? 'all' : 'private'; }
  popupPersonalReminderEnabled = false;
  popupPersonalLinkType: 'none' | 'customer' | 'quote' = 'none';
  popupPersonalLinkNumber = '';
  popupInspectionAdminIds: number[] = [];
  popupInspectionReminderMinutes: number | null = 30;
  popupCustomerWarehouseMode: 'none' | 'load' | 'unload' | 'load_unload' = 'none';

  recurrenceEnabled = false;
  recurrenceFreq: 'DAILY' | 'WEEKLY' | 'MONTHLY' = 'DAILY';
  recurrenceInterval = 1;
  recurrenceDays: string[] = [];
  recurrenceEndType: 'never' | 'until' | 'count' = 'never';
  recurrenceUntil = '';
  recurrenceCount = 1;

  showDeleteConfirm = false;

  autocompleteOpen = false;
  filteredAutocomplete: string[] = [];

  nPreventiviArray: string[] = [];
  descrizioneArray: string[] = [];
  clientiArray: any[] = [];
  adminOptions: AdminOption[] = [];

  monthGrid: DayCell[][] = [];
  weekCells: DayCell[] = [];

  readonly DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  readonly MONTHS_IT = [
    'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
  ];
  readonly TIME_SLOTS: string[] = Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2).toString().padStart(2, '0');
    const m = i % 2 === 0 ? '00' : '30';
    return `${h}:${m}`;
  });
  readonly WEEK_DAYS_REC = [
    ['MO','Lun'],['TU','Mar'],['WE','Mer'],['TH','Gio'],
    ['FR','Ven'],['SA','Sab'],['SU','Dom'],
  ];

  categories: CalendarCategoryOption[] = [];
  private pendingDeadlineIds: number[] = [];
  private pendingInterventionMode: 'guided' | null = null;
  private pendingInterventionItems: Array<{ assetId: number; fieldKeys: string[]; deadlineIds: number[] }> = [];
  private readonly assetPreparationStorageKey = 'mvanager-customer-asset-intervention-preparation';
  private pendingAppointmentId: CalendarEventId | null = null;
  private routeActionOpened = false;
  private widgetRouteSubscription?: Subscription;
  private routeReady = false;
  private pendingOccurrenceStart = '';

  get isDeadlinePlanning(): boolean {
    return this.pendingDeadlineIds.length > 0 || this.pendingInterventionItems.length > 0;
  }

  constructor(
    private http: HttpClient,
    private globalService: GlobalService,
    private router: Router,
    private route: ActivatedRoute,
    private autoInspectionService: AutomaticAddInspectionToCalendarService,
    private popupService: PopupServiceService,
    public tenantService: TenantService,
    private inspectionAlarmSync: InspectionAlarmSyncService,
    private agendaWidget?: AgendaWidgetService,
  ) {}

  ngOnInit() {
    this.widgetRouteSubscription = this.route.queryParamMap?.subscribe(params => {
      if (this.routeReady && (params.has('appointmentId') || params.get('newEvent') === '1')) {
        this.routeActionOpened = false;
        this.readDeadlineRouteAction();
        this.loadAll();
      }
    });
    this.globalService.loadTenantConfig(false, { showError: false }).then(() => {
      this.categories = this.getCategoriesForTenant();
      this.loadPersonalCategories();
      this.loadSharingUsers();
      this.loadFederationOptions();
      this.readDeadlineRouteAction();
      this.routeReady = true;
      this.loadAll();
    });
  }

  ngOnDestroy(): void { this.widgetRouteSubscription?.unsubscribe(); }
  get widgetSyncWarning(): string {
    return this.agendaWidget?.available && ['error', 'offline'].includes(this.agendaWidget.status.state)
      ? `Widget: ${this.agendaWidget.status.message || 'Aggiornamento non riuscito.'}` : '';
  }

  get workCategories(): CalendarCategoryOption[] { return this.categories.filter(category => category.scope !== 'personal'); }
  get allPersonalCategories(): CalendarCategoryOption[] { return this.categories.filter(category => category.scope === 'personal'); }
  get personalCategories(): CalendarCategoryOption[] { if (this.popupSourceTenantId) return this.popupRemoteCategories; return this.categories.filter(category => category.scope === 'personal' && !category.sharedOnly); }
  get popupIsPersonal(): boolean { return this.getCategoryOption(this.popupCategory)?.scope === 'personal' || this.popupCalendarScope === 'personal'; }
  get canManageWorkCalendar(): boolean { return this.globalService.hasPermission('CALENDAR_EVENT_MANAGE'); }
  get canLinkPersonalCustomer(): boolean { return !this.popupSourceTenantId && this.globalService.hasPermission('CUSTOMERS_VIEW'); }
  get canLinkPersonalQuote(): boolean { return !this.popupSourceTenantId && this.globalService.hasPermission('QUOTES_VIEW'); }

  popupSourceTenantId = '';
  popupSourceCompanyLabel = '';
  popupSourceReady = true;
  popupRemoteCategories: CalendarCategoryOption[] = [];
  popupCrossTenantShares: CrossTenantShare[] = [];
  popupPersonalVisibility: 'busy' | 'details' = 'details';
  federationOptions: FederationOption[] = [];
  federationReady = false;
  federationError = '';
  private sourceQuery(): string { return this.popupSourceTenantId ? '?sourceTenantId=' + encodeURIComponent(this.popupSourceTenantId) : ''; }
  get availableFederationOptions(): FederationOption[] { return this.federationOptions.filter(option => this.popupIsPersonal ? option.personal : option.work); }
  loadFederationOptions(): void {
    this.federationError = '';
    const requestedSource = this.popupSourceTenantId;
    this.http.get<{ tenants: FederationOption[] }>(this.globalService.url + 'appointments/federationOptions' + this.sourceQuery(), { headers: this.globalService.headers })
      .subscribe({ next: response => { if (requestedSource !== this.popupSourceTenantId) return; this.federationOptions = response.tenants || []; this.federationReady = true; if (this.showPopup) this.normalizeCrossShares(); },
        error: () => { this.federationReady = false; this.federationError = 'Impossibile verificare la condivisione con le altre aziende.'; } });
  }
  private normalizeCrossShares(): void {
    const allowed = this.availableFederationOptions;
    this.popupCrossTenantShares = this.popupCrossTenantShares.filter(share => allowed.some(company => company.tenantId === share.tenantId))
      .map(share => { const company = allowed.find(item => item.tenantId === share.tenantId)!;
        return { ...share, visibility: company.details ? share.visibility : 'busy', adminIds: share.adminIds.filter(id => company.users.some(user => user.id === id)) };
      });
  }
  crossShare(tenantId: string): CrossTenantShare | undefined { return this.popupCrossTenantShares.find(share => share.tenantId === tenantId); }
  crossShareMode(tenantId: string): string { return this.crossShare(tenantId)?.mode || 'none'; }
  changeCrossShare(tenantId: string, mode: string): void {
    this.popupCrossTenantShares = this.popupCrossTenantShares.filter(share => share.tenantId !== tenantId);
    if (mode === 'all' || mode === 'selected') this.popupCrossTenantShares.push({ tenantId, mode, visibility: 'busy', adminIds: [] });
  }
  toggleCrossRecipient(share: CrossTenantShare, id: number): void {
    share.adminIds = share.adminIds.includes(id) ? share.adminIds.filter(value => value !== id) : [...share.adminIds, id];
  }
  private async handleSaveError(error: any, retry: () => void): Promise<void> {
    let response = error?.error;
    if (typeof response === 'string') { try { response = JSON.parse(response); } catch {} }
    if (error?.status === 409 && Array.isArray(response?.conflicts)) {
      const entries = response.conflicts.slice(0, 5).map((entry: any) => `${entry.personLabel}: ${new Date(entry.startDate).toLocaleString('it-IT')} – ${new Date(entry.endDate).toLocaleString('it-IT')}`).join('\n');
      if (await this.popupService.confirm('Sono presenti impegni sovrapposti:\n' + entries + '\nVuoi salvare comunque?', 'Sovrapposizione appuntamenti', { confirmLabel: 'Salva comunque', cancelLabel: 'Torna all’evento' })) retry();
      return;
    }
    this.popupService.showError(response?.error || response || 'Impossibile salvare l’appuntamento.');
  }

  loadSharingUsers(): void {
    this.sharingUsersLoading = true; this.sharingUsersError = '';
    const requestedSource = this.popupSourceTenantId;
    this.http.get<{ users: Array<{ id: number; label: string }> }>(this.globalService.url + 'appointments/sharingUsers' + this.sourceQuery(),
      { headers: this.globalService.headers }).subscribe({ next: response => {
        if (requestedSource !== this.popupSourceTenantId) return;
        this.sharingUsers = response.users; this.sharingUsersReady = true; this.sharingUsersLoading = false;
        this.updateCalendarAssignees();
      }, error: () => { this.sharingUsersReady = false; this.sharingUsersLoading = false;
        this.sharingUsersError = 'Impossibile caricare gli utenti del calendario.'; } });
  }

  private updateCalendarAssignees(): void {
    if (this.popupSourceTenantId || this.globalService.hasPermission('ADMIN_VIEW')) return;
    this.adminOptions = this.sharingUsers.map(user => ({ id: user.id, nome: user.label, cognome: '', email: '' }));
    if (this.currentAdminId) this.adminOptions.unshift({ id: this.currentAdminId, nome: 'Tu', cognome: '', email: '' });
  }

  get personalSharingHelp(): string {
    if (this.popupSharingMode === 'private') return 'L’evento è privato e visibile solo a te.';
    const audience = this.popupSharingMode === 'all' ? 'Tutti gli utenti del calendario' : 'Solo gli utenti selezionati';
    const visibility = this.popupPersonalVisibility === 'busy' ? 'vedranno soltanto che sei occupato, senza i dettagli dell’evento.' : 'potranno vedere i dettagli dell’evento.';
    return `${audience} ${visibility} Solo tu potrai modificarlo.`;
  }

  onPersonalSharingChange(): void {
    if (this.popupSharingMode === 'selected' && !this.sharingUsersReady && !this.sharingUsersLoading) this.loadSharingUsers();
  }

  togglePersonalSharingUser(id: number): void {
    this.popupSharedAdminIds = this.popupSharedAdminIds.includes(id)
      ? this.popupSharedAdminIds.filter(value => value !== id) : [...this.popupSharedAdminIds, id];
  }

  get detailSharingLabel(): string {
    if (this.detailEvent?.busyOnly) return 'Disponibilità condivisa';
    if (this.detailEvent?.canEdit === false) return 'Condiviso con te';
    if (this.detailEvent?.sharedWithWork) return 'Condiviso con tutti gli utenti';
    return this.detailEvent?.sharedAdminIds?.length ? 'Condiviso con utenti selezionati' : 'Privato, visibile solo a te';
  }

  get detailSharingRecipients(): string {
    if (this.detailEvent?.sourceTenantId) return '';
    return (this.detailEvent?.sharedAdminIds || []).map(id => this.sharingUsers.find(user => user.id === id)?.label || `Utente ${id}`).join(', ');
  }

  loadPersonalCategories(): void {
    this.personalSettingsError = '';
    this.http.get<{ userId: number; categories: Array<{ id: string; label: string; color: string }> }>(
      this.globalService.url + 'appointments/personalCategories', { headers: this.globalService.headers },
    ).subscribe({ next: response => {
      this.currentAdminId = response.userId;
      this.updateCalendarAssignees();
      this.ownPersonalCategories = response.categories.map(category => ({ id: category.id, text: category.label,
        color: category.color, source: 'none', scope: 'personal' }));
      this.personalSettingsReady = true;
      this.mergeCalendarCategories(); this.buildGrid();
    }, error: () => { this.personalSettingsError = 'Impossibile caricare le categorie personali. Riprova prima di creare eventi personali.'; } });
  }

  private mergeCalendarCategories(): void {
    const merged = [...this.workCategories, ...this.ownPersonalCategories];
    for (const event of this.rawEvents) {
      if (event.calendarScope !== 'personal' || merged.some(category => category.id === event.categories)) continue;
      merged.push({ id: event.categories, text: event.personalCategoryLabel || 'Evento personale',
        color: event.personalCategoryColor || '#7c3aed', scope: 'personal', sharedOnly: true, source: 'none' });
    }
    this.categories = merged;
  }

  setCalendarGroup(value: string): void {
    this.calendarGroup = value === 'work' || value === 'personal' ? value : 'all';
    this.activeFilter = 'all'; this.buildGrid();
  }

  get personalLinkOptions(): Array<{ value: string; label: string }> {
    if (this.popupPersonalLinkType === 'customer' && this.canLinkPersonalCustomer) {
      return this.clientiArray.map(record => ({ value: String(record.numeroCliente), label: this.customerLabel(record) }));
    }
    if (this.popupPersonalLinkType === 'quote' && this.canLinkPersonalQuote) {
      return [...this.quotesMap.values()].map(record => ({ value: String(record.numeroPreventivo), label: this.quoteLabel(record) }));
    }
    return [];
  }

  onPersonalLinkTypeChange(): void { this.popupPersonalLinkNumber = ''; this.onPersonalLinkChange(); }
  onPersonalLinkChange(): void { this.popupLocationOverride = null; this.popupPhoneOverride = null; }

  private readDeadlineRouteAction(): void {
    const widgetAccount = this.route.snapshot.queryParamMap.get('widgetAccount');
    if (widgetAccount) {
      let account = '';
      try {
        const payload = JSON.parse(atob(this.globalService.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        account = `${payload.tenantId}:${payload.id}`;
      } catch { /* Widget links cannot select an event in a different session. */ }
      if (widgetAccount !== account) { this.pendingAppointmentId = null; this.clearRouteActionQuery(); return; }
    }
    const ids = String(this.route.snapshot.queryParamMap.get('deadlineIds') || '')
      .split(',')
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value) && value > 0);
    this.pendingDeadlineIds = [...new Set(ids)];
    const interventionMode = String(this.route.snapshot.queryParamMap.get('interventionMode') || '');
    this.pendingInterventionMode = interventionMode === 'guided' ? 'guided' : null;
    if (this.route.snapshot.queryParamMap.get('assetPreparation') === '1') {
      try {
        const preparation = JSON.parse(sessionStorage.getItem(this.assetPreparationStorageKey) || '{}');
        this.pendingInterventionItems = Array.isArray(preparation?.items)
          ? preparation.items.map((item: any) => ({
              assetId: Number(item.assetId),
              fieldKeys: Array.isArray(item.fieldKeys) ? item.fieldKeys.map(String) : [],
              deadlineIds: Array.isArray(item.deadlineIds) ? item.deadlineIds.map(Number) : [],
            })).filter((item: any) => item.assetId > 0 && item.fieldKeys.length > 0)
          : [];
        if (this.pendingInterventionItems.length) this.pendingInterventionMode = 'guided';
      } catch {
        this.pendingInterventionItems = [];
      }
    }
    const appointmentKey = String(this.route.snapshot.queryParamMap.get('appointmentId') || '');
    this.pendingAppointmentId = /^f:[a-z0-9_-]+:[1-9][0-9]*$/.test(appointmentKey) ? appointmentKey : /^[1-9][0-9]*$/.test(appointmentKey) ? Number(appointmentKey) : null;
    this.pendingOccurrenceStart = this.route.snapshot.queryParamMap.get('occurrenceStart') || '';
    if (this.route.snapshot.queryParamMap.get('newEvent') === '1') {
      this.closeEventDetails();
      this.openNewPopup(new Date());
      this.clearRouteActionQuery();
      return;
    }

    if (!this.isDeadlinePlanning) return;
    const category = String(this.route.snapshot.queryParamMap.get('deadlineCategory') || '');
    if (!this.categories.some((item) => item.id === category)) {
      this.pendingDeadlineIds = [];
      this.pendingInterventionItems = [];
      this.popupService.showError('Categoria calendario della scadenza non configurata in MVControl.');
      this.clearRouteActionQuery();
      return;
    }
    const rawDate = String(this.route.snapshot.queryParamMap.get('planDate') || '');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? new Date(`${rawDate}T09:00:00`)
      : new Date();
    date.setHours(9, 0, 0, 0);
    this.currentView = 'day';
    this.currentDate = new Date(date);
    this.openNewPopup(
      date,
      category,
      String(this.route.snapshot.queryParamMap.get('planTitle') || ''),
      String(this.route.snapshot.queryParamMap.get('planDescription') || ''),
    );
    this.routeActionOpened = true;
    this.clearRouteActionQuery();
  }

  private clearRouteActionQuery(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        deadlineIds: null,
        deadlineCategory: null,
        planTitle: null,
        planDescription: null,
        planDate: null,
        appointmentId: null,
        occurrenceStart: null,
        newEvent: null,
        widgetAccount: null,
        interventionMode: null,
        assetPreparation: null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private quotesMap: Map<string, any> = new Map();
  private popupNumeroPreventivo = '';
  private popupServiceOrderId: number | null = null;

  private quoteLabel(quote: any): string {
    const title = this.globalService.getRecordDisplayName('quote', quote || {});
    return `${quote?.numeroPreventivo || ''} - ${title || 'Preventivo'}`.trim();
  }

  private customerLabel(customer: any): string {
    const title = this.globalService.getRecordDisplayName('customer', customer || {});
    return `${customer?.numeroCliente || ''} - ${title || 'Cliente'}`.trim();
  }

  calendarLoadError = '';
  loadAll() {
    this.calendarLoadError = '';
    this.http.get(this.globalService.url + 'appointments/getAll', {
      headers: this.globalService.headers, responseType: 'text',
    }).subscribe({ next: (res) => {
      this.rawEvents = JSON.parse(res);
      if (this.detailEvent) {
        const latest = this.rawEvents.find(event => event.id === (this.detailEvent!.originalId ?? this.detailEvent!.id));
        if (!latest) this.closeEventDetails();
        else {
          const previous = this.detailEvent;
          this.detailEvent = previous.isRecurring ? { ...this.toCalEvent(latest), start: previous.start, end: previous.end, isRecurring: true, originalId: previous.originalId } : this.toCalEvent(latest);
        }
      }
      this.mergeCalendarCategories();
      this.buildGrid();
      if (this.pendingAppointmentId && !this.routeActionOpened) {
        const raw = this.rawEvents.find((item) => String(item.id) === String(this.pendingAppointmentId));
        this.pendingAppointmentId = null;
        if (raw) {
          let event = this.toCalEvent(raw);
          const occurrence = new Date(this.pendingOccurrenceStart);
          if (event.recurrenceRule && Number.isFinite(occurrence.getTime())) {
            const end = new Date(occurrence.getTime() + event.end.getTime() - event.start.getTime());
            event = { ...event, start: occurrence, end, isRecurring: true, originalId: event.id };
          }
          this.pendingOccurrenceStart = '';
          this.currentDate = new Date(event.start);
          this.currentView = 'day';
          this.buildGrid();
          this.openEventDetails(event);
        } else {
          this.popupService.showError('Evento pianificato non trovato.');
        }
        this.clearRouteActionQuery();
      }
      if (this.autoInspectionService.pass) {
        this.autoInspectionService.pass = false;
        const quoteType = this.normalize(this.autoInspectionService.quoteType);
        const inspectionCategory =
          this.categories.find((category) =>
            category.inspection === true &&
            quoteType &&
            this.normalize(category.quoteType || '') === quoteType,
          )?.id ||
          this.categories.find((category) =>
            category.inspection === true && !String(category.quoteType || '').trim(),
          )?.id ||
          this.categories.find((category) => category.inspection === true)?.id ||
          '';
        this.autoInspectionService.quoteType = '';
        if (!inspectionCategory) {
          this.popupService.text = 'Configura prima una categoria calendario per gli appuntamenti collegati ai preventivi';
          this.popupService.openPopup();
          return;
        }
        this.openNewPopup(
          new Date(), inspectionCategory,
          `${this.autoInspectionService.numeroPreventivo} - ${this.autoInspectionService.displayName}`,
          `Contatto ${this.autoInspectionService.displayName}   Telefono: ${this.autoInspectionService.telefono}`,
          this.autoInspectionService.numeroPreventivo,
        );
      }
    }, error: () => { this.calendarLoadError = 'Impossibile verificare l’agenda completa. Riprova prima di fissare nuovi appuntamenti.'; this.rawEvents = []; this.buildGrid(); } });

    this.quotesMap.clear();
    this.nPreventiviArray = [];
    if (this.globalService.hasPermission('QUOTES_VIEW')) {
      this.http.get(this.globalService.url + 'quotes/getAll', {
        headers: this.globalService.headers, responseType: 'text',
      }).subscribe((res) => {
        const data = JSON.parse(res);
        this.quotesMap.clear();
        data.forEach((q: any) => {
          this.quotesMap.set(this.normalize(q.numeroPreventivo), q);
        });
        this.nPreventiviArray = data.filter((q: any) => !q.complete)
          .map((q: any) => this.quoteLabel(q));
      });
    }

    this.clientiArray = [];
    if (this.globalService.hasPermission('CUSTOMERS_VIEW')) {
      this.http.get(this.globalService.url + 'customers/getAll', {
        headers: this.globalService.headers, responseType: 'text',
      }).subscribe((res) => {
        this.clientiArray = JSON.parse(res);
        this.openPendingCustomerEventIfNeeded();
      });
    }

    this.adminOptions = [];
    this.updateCalendarAssignees();
    if (this.globalService.hasPermission('ADMIN_VIEW')) {
      this.http.get(this.globalService.url + 'admin/getAll', {
        headers: this.globalService.headers, responseType: 'text',
      }).subscribe((res) => {
        const data = JSON.parse(res);
        this.adminOptions = (Array.isArray(data) ? data : []).map((admin: any) => ({
          id: Number(admin.id),
          nome: admin.nome || '',
          cognome: admin.cognome || '',
          email: admin.email || '',
        }));
      });
    }
  }

  // ── RRULE EXPANDER ─────────────────────────────────────────────────────

  expandEvents(rangeStart: Date, rangeEnd: Date): CalEvent[] {
    const result: CalEvent[] = [];
    for (const raw of this.rawEvents) {
      if (raw.status === 'ARCHIVED') continue;
      const ev = this.toCalEvent(raw);
      if (!ev.recurrenceRule || ev.recurrenceRule.trim() === '') {
        if (ev.start <= rangeEnd && ev.end >= rangeStart) result.push(ev);
      } else {
        result.push(...this.expandRule(ev, rangeStart, rangeEnd));
      }
    }
    return result.filter(event => {
      if (this.activeFilter !== 'all' && event.categories !== this.activeFilter) return false;
      if (this.calendarGroup === 'work') return event.calendarScope !== 'personal' || event.sharedWithWork === true || !!event.sharedAdminIds?.length || event.isSharedPersonal === true || !!event.sourceTenantId;
      if (this.calendarGroup === 'personal') return event.isOwnAgenda === true || (event.calendarScope === 'personal' && Number(event.ownerAdminId) === this.currentAdminId);
      return true;
    });
  }

  toCalEvent(raw: RawEvent): CalEvent {
    return {
      id: raw.id, sourceTenantId: raw.sourceTenantId, sourceAppointmentId: raw.sourceAppointmentId,
      sourceCompanyLabel: raw.sourceCompanyLabel, isOwnAgenda: raw.isOwnAgenda, busyOnly: raw.busyOnly,
      isSharedPersonal: raw.isSharedPersonal, crossTenantShares: raw.crossTenantShares,
      personalSharingVisibility: raw.personalSharingVisibility,
      title: raw.title,
      start: new Date(raw.startDate),
      end: new Date(raw.endDate),
      description: raw.description,
      categories: raw.categories,
      recurrenceRule: raw.recurrenceRule || '',
      recurrenceException: this.parseExceptions(raw.recurrenceException),
      dayLong: raw.dayLong,
      calendarScope: raw.calendarScope || 'work', ownerAdminId: raw.ownerAdminId,
      sharedWithWork: raw.sharedWithWork, sharedAdminIds: raw.sharedAdminIds || [], personalCategoryLabel: raw.personalCategoryLabel,
      personalCategoryColor: raw.personalCategoryColor, canEdit: raw.canEdit,
      locationAddress: raw.locationAddress,
      contactPhone: raw.contactPhone,
      numeroCliente: raw.numeroCliente,
      numeroPreventivo: raw.numeroPreventivo,
      inspectionAdminIds: Array.isArray(raw.inspectionAdminIds)
        ? raw.inspectionAdminIds.map((id) => Number(id)).filter(Boolean)
        : [],
      inspectionReminderMinutes:
        raw.inspectionReminderMinutes !== null &&
        raw.inspectionReminderMinutes !== undefined
          ? Number(raw.inspectionReminderMinutes)
          : null,
      customerWarehouseMode: raw.customerWarehouseMode || 'none',
    };
  }

  parseExceptions(val: any): string[] {
    if (!val) return [];
    try {
      const parsed = typeof val === 'string' ? JSON.parse(val) : val;
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  expandRule(ev: CalEvent, rangeStart: Date, rangeEnd: Date): CalEvent[] {
    const parts = this.parseRRule(ev.recurrenceRule);
    const freq = parts['FREQ'] || 'DAILY';
    const interval = parseInt(parts['INTERVAL'] || '1');
    const count = parts['COUNT'] ? parseInt(parts['COUNT']) : null;
    const until = parts['UNTIL'] ? this.parseICSDate(parts['UNTIL']) : null;
    const byDay = parts['BYDAY'] ? parts['BYDAY'].split(',') : null;
    const byMonthDay = parts['BYMONTHDAY'] ? parseInt(parts['BYMONTHDAY']) : null;
    const duration = ev.end.getTime() - ev.start.getTime();
    const evStartDay = new Date(ev.start); evStartDay.setHours(0,0,0,0);
    const results: CalEvent[] = [];
    let current = new Date(evStartDay);
    let occurrenceCount = 0;

    while (current <= rangeEnd && results.length < 730) {
      if (until && current > until) break;
      if (count !== null && occurrenceCount >= count) break;
      const diffDays = Math.round((current.getTime() - evStartDay.getTime()) / 86400000);
      let matches = false;

      if (freq === 'DAILY') {
        matches = diffDays >= 0 && diffDays % interval === 0;
      } else if (freq === 'WEEKLY') {
        const weekDiff = Math.floor(diffDays / 7);
        if (diffDays >= 0 && weekDiff % interval === 0) {
          const dayName = ['SU','MO','TU','WE','TH','FR','SA'][current.getDay()];
          matches = byDay ? byDay.includes(dayName) : current.getDay() === ev.start.getDay();
        }
      } else if (freq === 'MONTHLY') {
        const monthDiff = (current.getFullYear() - ev.start.getFullYear()) * 12
          + current.getMonth() - ev.start.getMonth();
        if (monthDiff >= 0 && monthDiff % interval === 0) {
          matches = byMonthDay
            ? current.getDate() === byMonthDay
            : current.getDate() === ev.start.getDate();
        }
      }

      if (matches) {
        const occStart = new Date(current);
        occStart.setHours(ev.start.getHours(), ev.start.getMinutes(), 0, 0);
        const icsKey = this.toICSDate(occStart);
        const occEnd = new Date(occStart.getTime() + duration);
        if (!ev.recurrenceException.includes(icsKey) && occStart <= rangeEnd && occEnd >= rangeStart) {
          results.push({ ...ev, start: occStart, end: occEnd, isRecurring: true, originalId: ev.id });
        }
        occurrenceCount++;
      }
      current.setDate(current.getDate() + 1);
    }
    return results;
  }

  parseRRule(rule: string): Record<string, string> {
    const parts: Record<string, string> = {};
    (rule || '').split(';').forEach((p) => {
      const [k, v] = p.split('=');
      if (k && v) parts[k.trim()] = v.trim();
    });
    return parts;
  }

  parseICSDate(s: string): Date {
    return new Date(parseInt(s.substring(0,4)), parseInt(s.substring(4,6))-1, parseInt(s.substring(6,8)));
  }

  toICSDate(d: Date): string {
    const pad = (n: number) => n.toString().padStart(2,'0');
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  }

  // ── GRID BUILDERS ──────────────────────────────────────────────────────

  buildGrid() {
    if (this.currentView === 'month') this.buildMonthGrid();
    else if (this.currentView === 'week') this.buildWeekGrid();
    else this.buildDayGrid();
  }

  buildMonthGrid() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month+1, 0);
    const start = new Date(firstDay);
    const dow = (start.getDay()+6) % 7;
    start.setDate(start.getDate() - dow);
    const end = new Date(lastDay);
    const endDow = (end.getDay()+6) % 7;
    end.setDate(end.getDate() + (6-endDow));
    const rangeStart = new Date(start); rangeStart.setHours(0,0,0,0);
    const rangeEnd = new Date(end); rangeEnd.setHours(23,59,59,999);
    const expanded = this.expandEvents(rangeStart, rangeEnd);
    this.monthGrid = [];
    const cur = new Date(start);
    while (cur <= end) {
      const week: DayCell[] = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(cur);
        const dayStart = new Date(day); dayStart.setHours(0,0,0,0);
        const dayEnd = new Date(day); dayEnd.setHours(23,59,59,999);
        week.push({
          date: day,
          isCurrentMonth: day.getMonth() === month,
          isToday: this.isSameDay(day, new Date()),
          events: expanded.filter(e => e.start <= dayEnd && e.end >= dayStart)
            .sort((a,b) => a.start.getTime() - b.start.getTime()),
        });
        cur.setDate(cur.getDate()+1);
      }
      this.monthGrid.push(week);
    }
  }

  buildWeekGrid() {
    const dow = (this.currentDate.getDay()+6) % 7;
    const monday = new Date(this.currentDate); monday.setDate(monday.getDate()-dow); monday.setHours(0,0,0,0);
    const sunday = new Date(monday); sunday.setDate(sunday.getDate()+6); sunday.setHours(23,59,59,999);
    const expanded = this.expandEvents(monday, sunday);
    this.weekCells = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday); day.setDate(day.getDate()+i);
      const dayStart = new Date(day); dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(day); dayEnd.setHours(23,59,59,999);
      const dayEvs = expanded.filter(e => e.start <= dayEnd && e.end >= dayStart)
        .sort((a,b) => a.start.getTime() - b.start.getTime());
      this.weekCells.push({
        date: day, isCurrentMonth: true, isToday: this.isSameDay(day, new Date()),
        events: dayEvs,
        eventLayout: this.computeOverlapLayout(dayEvs, this.MAX_OVERLAP_COLS),
      });
    }
  }

  buildDayGrid() {
    const dayStart = new Date(this.currentDate); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(this.currentDate); dayEnd.setHours(23,59,59,999);
    const dayEvs = this.expandEvents(dayStart, dayEnd).sort((a,b) => a.start.getTime()-b.start.getTime());
    this.weekCells = [{
      date: new Date(this.currentDate), isCurrentMonth: true,
      isToday: this.isSameDay(this.currentDate, new Date()),
      events: dayEvs,
      eventLayout: this.computeOverlapLayout(dayEvs, this.MAX_OVERLAP_COLS),
    }];
  }

  getTimedEvents(cell: DayCell): CalEvent[] {
    return cell.events;
  }

  isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  }

  // ── NAVIGATION ─────────────────────────────────────────────────────────

  get viewTitle(): string {
    if (this.currentView === 'month')
      return `${this.MONTHS_IT[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
    if (this.currentView === 'week') {
      const dow = (this.currentDate.getDay()+6) % 7;
      const mon = new Date(this.currentDate); mon.setDate(mon.getDate()-dow);
      const sun = new Date(mon); sun.setDate(sun.getDate()+6);
      return `${mon.getDate()} ${this.MONTHS_IT[mon.getMonth()]} – ${sun.getDate()} ${this.MONTHS_IT[sun.getMonth()]} ${sun.getFullYear()}`;
    }
    const d = this.currentDate;
    return `${this.DAYS_SHORT[(d.getDay()+6)%7]} ${d.getDate()} ${this.MONTHS_IT[d.getMonth()]} ${d.getFullYear()}`;
  }

  prev() {
    const d = new Date(this.currentDate);
    if (this.currentView==='month') d.setMonth(d.getMonth()-1);
    else if (this.currentView==='week') d.setDate(d.getDate()-7);
    else d.setDate(d.getDate()-1);
    this.currentDate = d; this.buildGrid();
  }

  next() {
    const d = new Date(this.currentDate);
    if (this.currentView==='month') d.setMonth(d.getMonth()+1);
    else if (this.currentView==='week') d.setDate(d.getDate()+7);
    else d.setDate(d.getDate()+1);
    this.currentDate = d; this.buildGrid();
  }

  goToday() { this.currentDate = new Date(); this.buildGrid(); }
  setView(v: 'month'|'week'|'day') { this.currentView = v; this.buildGrid(); }

  // ── MINI CALENDAR ──────────────────────────────────────────────────────

  get miniCalGrid(): Date[][] {
    const year = this.miniCalDate.getFullYear();
    const month = this.miniCalDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const dow = (firstDay.getDay()+6) % 7;
    const cur = new Date(firstDay); cur.setDate(cur.getDate()-dow);
    const grid: Date[][] = [];
    for (let w = 0; w < 6; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) { week.push(new Date(cur)); cur.setDate(cur.getDate()+1); }
      grid.push(week);
      if (cur.getMonth()!==month && w>=3) break;
    }
    return grid;
  }

  get miniCalTitle(): string { return `${this.MONTHS_IT[this.miniCalDate.getMonth()]} ${this.miniCalDate.getFullYear()}`; }
  miniPrev() { const d = new Date(this.miniCalDate); d.setMonth(d.getMonth()-1); this.miniCalDate = d; }
  miniNext() { const d = new Date(this.miniCalDate); d.setMonth(d.getMonth()+1); this.miniCalDate = d; }
  miniSelectDay(date: Date) { this.currentDate=new Date(date); this.currentView='day'; this.showMiniCal=false; this.buildGrid(); }
  toggleMiniCal() { this.showMiniCal=!this.showMiniCal; this.miniCalDate=new Date(this.currentDate); }

  // ── FILTER ─────────────────────────────────────────────────────────────

  onFilterChange(event: Event) {
    this.activeFilter = (event.target as HTMLSelectElement).value;
    this.buildGrid();
  }

  // ── POPUP ──────────────────────────────────────────────────────────────

  openNewPopup(date: Date, category = '', title = '', description = '', numeroPreventivo = '', serviceOrderId: number | null = null) {
    this.closeEventDetails();
    const start = new Date(date); start.setSeconds(0,0);
    const hadSource = !!this.popupSourceTenantId;
    this.popupSourceTenantId = ''; this.popupSourceCompanyLabel = ''; this.popupSourceReady = true;
    this.popupRemoteCategories = []; this.popupCrossTenantShares = []; this.popupPersonalVisibility = 'details';
    if (hadSource) { this.loadSharingUsers(); this.loadFederationOptions(); }
    this.isNewEvent=true; this.editingEventId=null; this.isRecurringInstance=false; this.hasRecurrenceRule=false;
    this.editingSingleOccurrence=false; this.editingOccurrenceStart=null; this.editingSelectedDate=null;
    this.popupTitle=title; this.popupDescription=description;
    this.popupLocationOverride=null; this.popupPhoneOverride=null; this.popupCustomerNumero='';
    this.popupNumeroPreventivo = numeroPreventivo;
    this.popupServiceOrderId = serviceOrderId;
    this.popupStartDate=this.toInputDatetime(start);
    this.popupCategory=category || (this.canManageWorkCalendar
      ? this.globalService.getDefaultAppointmentCategory(this.workCategories[0]?.id || '') : 'personal-event') || 'personal-event';
    this.popupCalendarScope = this.getCategoryOption(this.popupCategory)?.scope === 'personal' ? 'personal' : 'work';
    this.popupSharedWithWork = false; this.popupSharedAdminIds = []; this.popupPersonalReminderEnabled = false;
    this.popupPersonalLinkType = 'none'; this.popupPersonalLinkNumber = '';
    this.resetCustomerWarehouseModeForCategory();
    this.updatePopupEndFromCustomerDuration();
    this.popupInspectionAdminIds = [];
    this.popupInspectionReminderMinutes = 30;
    this.recurrenceEnabled=false; this.recurrenceFreq='DAILY'; this.recurrenceInterval=1;
    this.recurrenceDays=[]; this.recurrenceEndType='never'; this.recurrenceUntil=''; this.recurrenceCount=1;
    this.autocompleteOpen=false; this.showDeleteConfirm=false; this.showPopup=true;
  }

  private openPendingCustomerEventIfNeeded(): void {
    if (!this.autoInspectionService.pendingCustomerEvent) {
      return;
    }

    const numeroCliente = this.autoInspectionService.numeroCliente;
    const displayName = this.autoInspectionService.displayName;
    const customerType = this.autoInspectionService.customerType;
    const category = this.autoInspectionService.customerEventCategory ||
      this.getDefaultCustomerLinkedCategory(customerType);
    const description = this.autoInspectionService.customerEventDescription;
    const serviceOrderId = this.autoInspectionService.pendingServiceOrderEvent
      ? Number(this.autoInspectionService.serviceOrderId) || null
      : null;
    const serviceOrderDisplayId = this.autoInspectionService.pendingServiceOrderEvent
      ? String(this.autoInspectionService.serviceOrderDisplayId || '').trim()
      : '';
    const serviceOrderStart = this.autoInspectionService.serviceOrderStartDate;
    const serviceOrderEnd = this.autoInspectionService.serviceOrderEndDate;

    this.autoInspectionService.pendingCustomerEvent = false;
    this.autoInspectionService.numeroCliente = '';
    this.autoInspectionService.displayName = '';
    this.autoInspectionService.customerType = '';
    this.autoInspectionService.customerEventCategory = '';
    this.autoInspectionService.customerEventDescription = '';
    this.autoInspectionService.pendingServiceOrderEvent = false;
    this.autoInspectionService.serviceOrderId = 0;
    this.autoInspectionService.serviceOrderDisplayId = '';
    this.autoInspectionService.serviceOrderStartDate = '';
    this.autoInspectionService.serviceOrderEndDate = '';

    if (!numeroCliente || !displayName) {
      return;
    }

    this.currentView = 'day';
    const requestedStart = serviceOrderStart ? new Date(serviceOrderStart) : new Date();
    const start = Number.isNaN(requestedStart.getTime()) ? new Date() : requestedStart;
    this.currentDate = new Date(start);
    this.buildGrid();
    this.openNewPopup(
      start,
      category,
      serviceOrderId
        ? `${serviceOrderDisplayId || numeroCliente} ${displayName} - Ordini di servizio`
        : `${numeroCliente} - ${displayName}`,
      description,
      '',
      serviceOrderId,
    );
    if (serviceOrderEnd) {
      const end = new Date(serviceOrderEnd);
      if (!Number.isNaN(end.getTime()) && end > start) this.popupEndDate = this.toInputDatetime(end);
    }
  }

  private getOriginalCalEvent(ev: CalEvent): CalEvent {
    const originalId = ev.originalId ?? ev.id;
    const raw = this.rawEvents.find((item) => String(item.id) === String(originalId));
    return raw ? this.toCalEvent(raw) : ev;
  }

  private spansMultipleDays(ev: CalEvent): boolean {
    return !this.isSameDay(ev.start, ev.end);
  }

  private shouldAskEditScope(ev: CalEvent): boolean {
    return !!ev.isRecurring ||
      !!(ev.recurrenceRule && ev.recurrenceRule.trim()) ||
      this.spansMultipleDays(ev);
  }

  private singleDayView(ev: CalEvent, selectedDate?: Date | null): CalEvent {
    const day = selectedDate ? new Date(selectedDate) : new Date(ev.start);
    const dayStart = new Date(day); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(day); dayEnd.setHours(23,59,0,0);
    const start = ev.start > dayStart ? new Date(ev.start) : dayStart;
    const end = ev.end < dayEnd ? new Date(ev.end) : dayEnd;

    if (end <= start) {
      end.setTime(start.getTime() + 30 * 60000);
    }

    return { ...ev, start, end, recurrenceRule: '' };
  }

  openEventDetails(ev: CalEvent, selectedDate?: Date | null): void {
    this.showPopup = false;
    this.showDeleteConfirm = false;
    this.closeEditScopeChoice();
    this.closeDayPopup();
    this.detailEvent = ev;
    this.detailSelectedDate = new Date(selectedDate || ev.start);
  }

  closeEventDetails(): void {
    this.detailEvent = null;
    this.detailSelectedDate = null;
  }

  get canEditCalendarEvent(): boolean {
    return this.detailEvent?.canEdit ?? this.globalService.hasPermission('CALENDAR_EVENT_MANAGE');
  }

  editDetailEvent(): void {
    if (!this.detailEvent || !this.canEditCalendarEvent) return;
    const ev = this.detailEvent;
    const selectedDate = this.detailSelectedDate;
    this.closeEventDetails();
    this.requestEditPopup(ev, selectedDate);
  }

  get detailCategoryLabel(): string {
    const key = this.detailEvent?.categories || '';
    return this.detailEvent?.personalCategoryLabel || this.getCategoryOption(key)?.text || key;
  }

  private get detailContactRecord(): { scope: 'customer' | 'quote'; record: any } | null {
    const ev = this.detailEvent;
    if (ev?.sourceTenantId) return null;
    if (ev?.calendarScope === 'personal') return this.personalContactRecord(ev.numeroCliente || '', ev.numeroPreventivo || '');
    return ev ? this.findContactRecord(ev.categories, ev.title, ev.numeroCliente || '', ev.numeroPreventivo || '') : null;
  }

  get detailLocationAddress(): string {
    if (!this.detailEvent) return '';
    if (this.detailEvent.locationAddress != null) return this.detailEvent.locationAddress;
    const linked = this.detailContactRecord;
    return linked ? this.globalService.buildCalendarWorkAddress(linked.record, linked.scope) : '';
  }

  get detailContactPhone(): string {
    if (!this.detailEvent) return '';
    if (this.detailEvent.contactPhone != null) return this.detailEvent.contactPhone;
    const linked = this.detailContactRecord;
    return linked ? String(this.globalService.getRecordValueByRole(
      linked.scope, linked.record, linked.scope === 'customer' ? 'customerPhone' : 'quotePhone',
    ) || '').trim() : '';
  }

  get detailDirectionsUrl(): string { return calendarDirectionsUrl(this.detailLocationAddress); }
  get detailPhoneUrl(): string { return calendarPhoneUrl(this.detailContactPhone); }

  get detailReminderRecipients(): string {
    return (this.detailEvent?.inspectionAdminIds || []).map((id) => {
      const admin = this.adminOptions.find((item) => Number(item.id) === Number(id));
      return admin ? [admin.nome, admin.cognome].filter(Boolean).join(' ') || admin.email : `Utente ${id}`;
    }).join(', ');
  }

  requestEditPopup(ev: CalEvent, selectedDate?: Date | null) {
    if (this.shouldAskEditScope(ev)) {
      this.pendingEditEvent = ev;
      this.pendingEditDate = selectedDate ? new Date(selectedDate) : new Date(ev.start);
      this.showEditScopeChoice = true;
      return;
    }

    this.openEditPopup(ev, 'series', selectedDate);
  }

  chooseEditScope(scope: EditScope) {
    if (!this.pendingEditEvent) return;
    const ev = this.pendingEditEvent;
    const selectedDate = this.pendingEditDate ? new Date(this.pendingEditDate) : new Date(ev.start);
    this.showEditScopeChoice = false;
    this.pendingEditEvent = null;
    this.pendingEditDate = null;
    this.openEditPopup(ev, scope, selectedDate);
  }

  closeEditScopeChoice() {
    this.showEditScopeChoice = false;
    this.pendingEditEvent = null;
    this.pendingEditDate = null;
  }

  pendingEditIsRecurring(): boolean {
    const ev = this.pendingEditEvent;
    return !!ev && (!!ev.isRecurring || !!(ev.recurrenceRule && ev.recurrenceRule.trim()));
  }

  openEditPopup(ev: CalEvent, scope: EditScope = 'series', selectedDate?: Date | null) {
    this.closeEventDetails();
    const original = this.getOriginalCalEvent(ev);
    const popupEvent = scope === 'single'
      ? this.singleDayView(ev, selectedDate)
      : original;

    this.popupCalendarScope = popupEvent.calendarScope || 'work';
    const previousSource = this.popupSourceTenantId;
    this.popupSourceTenantId = popupEvent.sourceTenantId || ''; this.popupSourceCompanyLabel = popupEvent.sourceCompanyLabel || '';
    this.popupCrossTenantShares = (popupEvent.crossTenantShares || []).map(share => ({ ...share, adminIds: [...share.adminIds] }));
    this.popupPersonalVisibility = popupEvent.personalSharingVisibility || 'details';
    this.popupSourceReady = !this.popupSourceTenantId;
    if (!this.popupSourceTenantId && previousSource) { this.sharingUsersReady = false; this.federationReady = false; this.loadSharingUsers(); this.loadFederationOptions(); }
    if (this.popupSourceTenantId) {
      this.sharingUsersReady = false; this.federationOptions = []; this.federationReady = false;
      this.loadSharingUsers(); this.loadFederationOptions();
      const requestedSource = this.popupSourceTenantId;
      this.http.get<{ categories: Array<{ id: string; label: string; color: string }> }>(this.globalService.url + 'appointments/personalCategories' + this.sourceQuery(), { headers: this.globalService.headers })
        .subscribe({ next: response => { if (requestedSource !== this.popupSourceTenantId) return; this.popupRemoteCategories = response.categories.map(cat => ({ id: cat.id, text: cat.label, color: cat.color, scope: 'personal', source: 'none' })); this.popupSourceReady = true; },
          error: () => this.popupService.showError('Impossibile caricare le categorie dell’azienda di origine.') });
    }
    this.isNewEvent=false; this.editingEventId=ev.sourceAppointmentId ?? Number(ev.originalId??ev.id); this.popupServiceOrderId=null;
    this.isRecurringInstance=!!ev.isRecurring; this.hasRecurrenceRule=!!(original.recurrenceRule&&original.recurrenceRule.trim()!=='');
    this.editingSingleOccurrence=scope === 'single';
    this.editingOccurrenceStart=new Date(ev.start);
    this.editingSelectedDate=selectedDate ? new Date(selectedDate) : new Date(ev.start);
    this.popupTitle=popupEvent.title; this.popupDescription=popupEvent.description||'';
    this.popupLocationOverride=popupEvent.locationAddress ?? null;
    this.popupPhoneOverride=popupEvent.contactPhone ?? null;
    this.popupCustomerNumero=popupEvent.numeroCliente || '';
    this.popupNumeroPreventivo=popupEvent.numeroPreventivo || '';
    this.popupStartDate=this.toInputDatetime(popupEvent.start); this.popupEndDate=this.toInputDatetime(popupEvent.end);
    this.popupCalendarScope = popupEvent.calendarScope || 'work';
    this.popupSharedAdminIds = [...(popupEvent.sharedAdminIds || [])];
    this.popupSharingMode = popupEvent.sharedWithWork ? 'all' : this.popupSharedAdminIds.length ? 'selected' : 'private';
    this.popupPersonalReminderEnabled = popupEvent.calendarScope === 'personal' && popupEvent.inspectionReminderMinutes != null;
    this.popupPersonalLinkType = popupEvent.numeroCliente ? 'customer' : popupEvent.numeroPreventivo ? 'quote' : 'none';
    this.popupPersonalLinkNumber = String(popupEvent.numeroCliente || popupEvent.numeroPreventivo || '');
    this.popupCategory=popupEvent.categories; this.recurrenceEnabled=this.editingSingleOccurrence ? false : this.hasRecurrenceRule; this.showDeleteConfirm=false;
    this.popupCustomerWarehouseMode = popupEvent.customerWarehouseMode || 'none';
    this.popupInspectionAdminIds = Array.isArray(popupEvent.inspectionAdminIds)
      ? [...popupEvent.inspectionAdminIds]
      : [];
    this.popupInspectionReminderMinutes =
      popupEvent.inspectionReminderMinutes !== null && popupEvent.inspectionReminderMinutes !== undefined
        ? Number(popupEvent.inspectionReminderMinutes)
        : 30;
    if (this.recurrenceEnabled && !this.editingSingleOccurrence) {
      const parts = this.parseRRule(original.recurrenceRule);
      this.recurrenceFreq=(parts['FREQ'] as any)||'DAILY';
      this.recurrenceInterval=parseInt(parts['INTERVAL']||'1');
      this.recurrenceDays=parts['BYDAY']?parts['BYDAY'].split(','):[];
      if (parts['UNTIL']) { this.recurrenceEndType='until'; const u=parts['UNTIL']; this.recurrenceUntil=`${u.substring(0,4)}-${u.substring(4,6)}-${u.substring(6,8)}`; }
      else if (parts['COUNT']) { this.recurrenceEndType='count'; this.recurrenceCount=parseInt(parts['COUNT']); }
      else this.recurrenceEndType='never';
    } else {
      this.recurrenceFreq='DAILY'; this.recurrenceInterval=1;
      this.recurrenceDays=[]; this.recurrenceEndType='never'; this.recurrenceUntil=''; this.recurrenceCount=1;
    }
    this.autocompleteOpen=false; this.showPopup=true;
    if (this.federationReady) this.normalizeCrossShares();
  }

  closePopup() {
    const hadSource = !!this.popupSourceTenantId;
    this.popupSourceTenantId = ''; this.popupSourceReady = true; this.popupRemoteCategories = [];
    if (hadSource) { this.loadSharingUsers(); this.loadFederationOptions(); }
    this.showPopup=false; this.showDeleteConfirm=false;
    this.pendingDeadlineIds = [];
    this.pendingInterventionMode = null;
    this.pendingInterventionItems = [];
    sessionStorage.removeItem(this.assetPreparationStorageKey);
    this.routeActionOpened = false;
    this.editingSingleOccurrence=false; this.editingOccurrenceStart=null; this.editingSelectedDate=null;
    this.popupServiceOrderId = null;
  }

  showDayEventsPopup(cell: DayCell) {
    this.dayPopupDate = cell.date;
    this.dayPopupEvents = cell.events;
    this.showDayPopup = true;
  }

  closeDayPopup() { this.showDayPopup = false; this.dayPopupEvents = []; }

  onDblClickCell(date: Date, slot?: string) {
    const d = new Date(date);
    if (slot) { const [h,m]=slot.split(':'); d.setHours(parseInt(h),parseInt(m),0,0); }
    else d.setHours(9,0,0,0);
    this.openNewPopup(d);
  }

  onEventClick(ev: CalEvent, event: Event, selectedDate?: Date | null) {
    event.stopPropagation();
    event.preventDefault();
    this.openEventDetails(ev, selectedDate);
  }

  onDayPopupEventClick(ev: CalEvent, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    const selectedDate = new Date(this.dayPopupDate);
    this.closeDayPopup();
    this.openEventDetails(ev, selectedDate);
  }

  onEventDblClick(ev: CalEvent, event: MouseEvent, selectedDate?: Date | null) {
    event.stopPropagation();
    event.preventDefault();
    this.openEventDetails(ev, selectedDate);
  }

  // ── AUTOCOMPLETE ───────────────────────────────────────────────────────

  onTitleInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    if (!this.popupIsPersonal && this.popupTitle.split(' - ')[0] !== val.split(' - ')[0]) {
      this.popupLocationOverride=null; this.popupPhoneOverride=null;
    }
    this.popupTitle = val;
    this.popupCustomerNumero=''; this.popupNumeroPreventivo='';
    const allOptions = this.getAutocompleteSource(this.popupCategory);
    const norm = this.normalize(val);
    this.filteredAutocomplete = norm ? allOptions.filter(s => this.normalize(s).includes(norm)) : allOptions;
    this.autocompleteOpen = this.filteredAutocomplete.length > 0;
  }

  onTitleFocus() {
    const allOptions = this.getAutocompleteSource(this.popupCategory);
    this.filteredAutocomplete = allOptions;
    this.autocompleteOpen = allOptions.length > 0;
  }

  selectAutocomplete(val: string) {
    this.popupTitle = val; this.autocompleteOpen = false;
    this.popupLocationOverride=null; this.popupPhoneOverride=null; this.popupCustomerNumero='';

    const codice = val.split(' - ')[0];

    const category = this.getCategoryOption(this.popupCategory);

    if (this.isQuoteCategory(category)) {
      const preventivoData = this.quotesMap.get(this.normalize(codice));
      if (preventivoData) {
        this.popupNumeroPreventivo = String(preventivoData.numeroPreventivo || codice || '');
        const name = this.globalService.getRecordDisplayName('quote', preventivoData);
        const phone = this.globalService.getRecordValueByRole('quote', preventivoData, 'quotePhone') || '';
        this.popupDescription = `${category?.text || 'Preventivo'} - Contatto: ${name || 'Cliente'}${phone ? ` Telefono: ${phone}` : ''}`;
        return;
      }
    }

    if (this.isCustomerCategory(category)) {
      this.popupNumeroPreventivo = '';
      this.updatePopupEndFromCustomerDuration();
      return;
    }
  }

  private get popupContactRecord(): { scope: 'customer' | 'quote'; record: any } | null {
    if (this.popupSourceTenantId) return null;
    if (this.popupIsPersonal) return this.personalContactRecord(
      this.popupPersonalLinkType === 'customer' ? this.popupPersonalLinkNumber : '',
      this.popupPersonalLinkType === 'quote' ? this.popupPersonalLinkNumber : '',
    );
    return this.findContactRecord(this.popupCategory, this.popupTitle,
      this.popupCustomerNumero, this.popupNumeroPreventivo);
  }

  private personalContactRecord(customerNumber: string, quoteNumber: string): { scope: 'customer' | 'quote'; record: any } | null {
    if (customerNumber) {
      const record = this.clientiArray.find(item => this.normalize(String(item.numeroCliente)) === this.normalize(customerNumber));
      return record ? { scope: 'customer', record } : null;
    }
    const record = quoteNumber ? this.quotesMap.get(this.normalize(quoteNumber)) : null;
    return record ? { scope: 'quote', record } : null;
  }

  private findContactRecord(
    categoryId: string, title: string, customerNumero = '', quoteNumero = '',
  ): { scope: 'customer' | 'quote'; record: any } | null {
    const category = this.getCategoryOption(categoryId);
    const titleCode = title.split(' - ')[0].trim();
    if (this.isCustomerCategory(category)) {
      const code = this.normalize(customerNumero || titleCode.split('/')[0]);
      const record = this.clientiArray.find((item) => this.normalize(String(item.numeroCliente || '')) === code);
      return record ? { scope: 'customer', record } : null;
    }
    if (this.isQuoteCategory(category)) {
      const record = this.quotesMap.get(this.normalize(quoteNumero || titleCode));
      return record ? { scope: 'quote', record } : null;
    }
    return null;
  }

  get popupLocationAddress(): string {
    if (this.popupLocationOverride !== null) return this.popupLocationOverride;
    const linked = this.popupContactRecord;
    if (!linked) return '';
    return this.globalService.buildCalendarWorkAddress(linked.record, linked.scope);
  }

  get popupWorkAddressMissing(): boolean {
    return !!this.popupContactRecord && !this.popupLocationAddress.trim();
  }

  set popupLocationAddress(value: string) { this.popupLocationOverride = value; }

  get popupContactPhone(): string {
    if (this.popupPhoneOverride !== null) return this.popupPhoneOverride;
    const linked = this.popupContactRecord;
    return linked ? String(this.globalService.getRecordValueByRole(
      linked.scope, linked.record, linked.scope === 'customer' ? 'customerPhone' : 'quotePhone',
    ) || '').trim() : '';
  }

  set popupContactPhone(value: string) { this.popupPhoneOverride = value; }

  get popupDirectionsUrl(): string { return calendarDirectionsUrl(this.popupLocationAddress); }
  get popupPhoneUrl(): string { return calendarPhoneUrl(this.popupContactPhone); }

  async openContactLink(event: MouseEvent, url: string): Promise<void> {
    if (!url || Capacitor.getPlatform() === 'web') return;
    event.preventDefault();
    try {
      const result = await AppLauncher.openUrl({ url });
      if (!result.completed) this.popupService.showError('Nessuna app disponibile per aprire questo collegamento.');
    } catch {
      this.popupService.showError('Impossibile aprire il collegamento sul dispositivo.');
    }
  }

  getAutocompleteSource(categoria: string): string[] {
    const category = this.getCategoryOption(categoria);
    if (this.isQuoteCategory(category)) {
      return [...this.quotesMap.values()]
        .filter((quote) => !quote?.complete && this.quoteMatchesCategoryType(quote, category))
        .map((quote) => this.quoteLabel(quote));
    }
    if (this.isCustomerCategory(category)) {
      return this.clientiArray
        .filter((customer) => this.customerMatchesCategoryType(customer, category))
        .map(c=>this.customerLabel(c));
    }
    return [];
  }

  onCategoryChange() {
    const previousScope = this.popupCalendarScope;
    this.popupCalendarScope = this.getCategoryOption(this.popupCategory)?.scope === 'personal' ? 'personal' : 'work';
    if (this.popupIsPersonal) { this.popupInspectionAdminIds = []; this.popupCustomerWarehouseMode = 'none'; }
    if (previousScope !== 'personal' || !this.popupIsPersonal) {
      this.popupLocationOverride=null; this.popupPhoneOverride=null;
    }
    this.popupCustomerNumero='';
    if (!this.isQuoteCategory(this.getCategoryOption(this.popupCategory))) this.popupNumeroPreventivo='';
    this.updatePopupEndFromCustomerDuration();
    this.resetCustomerWarehouseModeForCategory();
    this.filteredAutocomplete=this.getAutocompleteSource(this.popupCategory); this.autocompleteOpen=false;
  }

  get selectedCustomerWarehouseCategory(): CalendarCategoryOption | undefined {
    const category = this.getCategoryOption(this.popupCategory);
    return category?.customerWarehouse?.enabled === true ? category : undefined;
  }

  customerWarehouseOperationOptions(): Array<{ value: 'load' | 'unload' | 'load_unload'; label: string }> {
    const allowed = this.selectedCustomerWarehouseCategory?.customerWarehouse?.allowedOperations || [];
    const labels: Record<'load' | 'unload' | 'load_unload', string> = {
      load: 'Carico',
      unload: 'Scarico',
      load_unload: 'Carico e scarico',
    };
    return allowed.map((value) => ({ value, label: labels[value] }));
  }

  private resetCustomerWarehouseModeForCategory(): void {
    const config = this.selectedCustomerWarehouseCategory?.customerWarehouse;
    this.popupCustomerWarehouseMode = config?.defaultOperation && config.defaultOperation !== 'none'
      ? config.defaultOperation
      : 'none';
    this.onCustomerWarehouseModeChange();
  }

  onCustomerWarehouseModeChange(): void {
    if (this.popupCustomerWarehouseMode !== 'none') this.recurrenceEnabled = false;
  }

  toggleInspectionAdmin(adminId: number) {
    const id = Number(adminId);
    const index = this.popupInspectionAdminIds.indexOf(id);
    if (index >= 0) this.popupInspectionAdminIds.splice(index, 1);
    else this.popupInspectionAdminIds.push(id);
  }

  isInspectionAdminSelected(adminId: number): boolean {
    return this.popupInspectionAdminIds.includes(Number(adminId));
  }

  get selectedInspectionAdminsLabel(): string {
    if (!this.popupInspectionAdminIds.length) return 'Nessun utente selezionato';
    const selected = this.adminOptions.filter((admin) =>
      this.popupInspectionAdminIds.includes(admin.id),
    );
    return selected.map((admin) => `${admin.nome} ${admin.cognome}`).join(', ');
  }

  onStartDateChange() {
    this.updatePopupEndFromCustomerDuration();
  }

  updatePopupEndFromCustomerDuration(): void {
    if (!this.popupStartDate) return;

    const start = new Date(this.popupStartDate);
    if (Number.isNaN(start.getTime())) return;

    const durationMinutes = this.getSelectedCustomerWorkDurationMinutes() || 30;
    this.popupEndDate = this.toInputDatetime(
      new Date(start.getTime() + durationMinutes * 60_000),
    );
  }

  private getSelectedCustomerWorkDurationMinutes(): number | null {
    const category = this.getCategoryOption(this.popupCategory);
    if (!this.isCustomerCategory(category)) return null;

    const customerCode = this.normalize(this.popupTitle.split(' - ')[0]);
    if (!customerCode) return null;

    const customer = this.clientiArray.find((item) =>
      this.normalize(String(item?.numeroCliente || '')) === customerCode,
    );
    if (!customer) return null;

    const configuredDuration = this.globalService.getRecordValueByRole(
      'customer',
      customer,
      'customerWorkDurationMinutes',
    );
    const durationValue = configuredDuration !== null &&
      configuredDuration !== undefined &&
      configuredDuration !== ''
      ? configuredDuration
      : customer.durataLavoroMinuti;
    const durationMinutes = Number(durationValue);

    return Number.isFinite(durationMinutes) && durationMinutes > 0
      ? durationMinutes
      : null;
  }

  // ── RECURRENCE ─────────────────────────────────────────────────────────

  buildRRule(): string {
    if (this.isDeadlinePlanning) return '';
    if (!this.recurrenceEnabled) return '';
    let rule = `FREQ=${this.recurrenceFreq}`;
    if (this.recurrenceInterval>1) rule+=`;INTERVAL=${this.recurrenceInterval}`;
    if (this.recurrenceFreq==='WEEKLY'&&this.recurrenceDays.length>0) rule+=`;BYDAY=${this.recurrenceDays.join(',')}`;
    if (this.recurrenceFreq==='MONTHLY') { const d=new Date(this.popupStartDate); rule+=`;BYMONTHDAY=${d.getDate()}`; }
    if (this.recurrenceEndType==='until'&&this.recurrenceUntil) rule+=`;UNTIL=${this.recurrenceUntil.replace(/-/g,'')}`;
    else if (this.recurrenceEndType==='count') rule+=`;COUNT=${this.recurrenceCount}`;
    return rule;
  }

  toggleDay(day: string) { const idx=this.recurrenceDays.indexOf(day); if(idx>=0)this.recurrenceDays.splice(idx,1); else this.recurrenceDays.push(day); }
  isDaySelected(day: string): boolean { return this.recurrenceDays.includes(day); }

  // ── SAVE ───────────────────────────────────────────────────────────────

  saveEvent(allowConflict = false) {
    if (!this.popupSourceReady) { this.popupService.showError('Attendi il caricamento dell’evento originale.'); return; }
    if (!this.popupTitle||!this.popupStartDate||!this.popupEndDate||!this.popupCategory) {
      this.popupService.text='Compilare tutti i campi obbligatori'; this.popupService.openPopup(); return;
    }
    if (this.popupCrossTenantShares.some(share => share.mode === 'selected' && !share.adminIds.length)) { this.popupService.showError('Seleziona almeno un destinatario per ogni azienda condivisa.'); return; }
    const category = this.getCategoryOption(this.popupCategory);
    const isPersonal = this.popupIsPersonal;
    if (isPersonal && !this.personalSettingsReady) { this.popupService.showError('Carica le categorie personali prima di salvare.'); return; }
    const isInspection = !isPersonal && this.isInspectionCategory(category);
    const hasReminder = isPersonal ? this.popupPersonalReminderEnabled : this.popupInspectionAdminIds.length > 0;
    if (hasReminder) {
      if (this.popupInspectionReminderMinutes === null || this.popupInspectionReminderMinutes < 0) {
        this.popupService.text='Specifica quanti minuti prima inviare il promemoria'; this.popupService.openPopup(); return;
      }
    }
    const codice = this.popupTitle.split(' - ')[0];
    if (!isPersonal && !this.validateCodice(codice,this.popupCategory)) {
      this.popupService.text='Codice non valido o non esistente per la categoria selezionata'; this.popupService.openPopup(); return;
    }
    const body: any = {
      calendarScope: isPersonal ? 'personal' : 'work',
      ...(this.popupSourceTenantId ? { sourceTenantId: this.popupSourceTenantId } : {}),
      ...(allowConflict ? { allowConflict: true } : {}),
      ...(this.federationReady ? { crossTenantShares: this.popupCrossTenantShares } : {}),
      title: this.popupTitle,
      startDate: new Date(this.popupStartDate).toISOString(),
      endDate: new Date(this.popupEndDate).toISOString(),
      recurrenceRule: this.buildRRule(),
      dayLong: false, description: this.popupDescription,
      locationAddress: this.popupLocationAddress.trim(),
      contactPhone: this.popupContactPhone.trim(),
      categories: this.popupCategory, recurrenceException: null,
      inspectionAdminIds: isPersonal ? [] : this.popupInspectionAdminIds,
      inspectionReminderMinutes:
        hasReminder
          ? this.popupInspectionReminderMinutes
          : null,
      customerWarehouseMode: this.popupCustomerWarehouseMode,
    };
    // Negli edit il backend conserva il riferimento esistente quando non si
    // sta scegliendo esplicitamente un nuovo preventivo.
    if (this.isNewEvent || this.popupNumeroPreventivo) {
      body.numeroPreventivo = this.popupNumeroPreventivo || null;
    }
    if (isPersonal) {
      body.sharedWithWork = this.popupSharedWithWork;
      body.personalSharingMode = this.popupSharingMode;
      body.sharedAdminIds = this.popupSharingMode === 'selected' ? [...this.popupSharedAdminIds] : [];
      if (this.popupSharingMode === 'selected' && (!this.sharingUsersReady || !body.sharedAdminIds.length)) {
        this.popupService.showError('Seleziona almeno un utente con cui condividere l’evento.'); return;
      }
      body.personalSharingVisibility = this.popupPersonalVisibility;
      body.personalReminderEnabled = this.popupPersonalReminderEnabled;
      body.numeroCliente = this.popupPersonalLinkType === 'customer' ? this.popupPersonalLinkNumber || null : null;
      body.numeroPreventivo = this.popupPersonalLinkType === 'quote' ? this.popupPersonalLinkNumber || null : null;
      body.customerWarehouseMode = 'none';
      if (this.popupPersonalLinkType !== 'none' && !this.popupPersonalLinkNumber) {
        this.popupService.showError('Seleziona il cliente o il preventivo da collegare.'); return;
      }
    }
    if (!isPersonal && this.isNewEvent && this.popupServiceOrderId) {
      body.serviceOrderId = this.popupServiceOrderId;
      body.returnAppointmentId = true;
    }
    if (!this.isNewEvent && this.editingSingleOccurrence) {
      this.saveSingleOccurrence(body, isInspection, hasReminder);
      return;
    }
    if (!this.isNewEvent) body.id = this.editingEventId;
    if (this.isNewEvent && this.isDeadlinePlanning) {
      body.returnAppointmentId = true;
    }
    const wasNewEvent = this.isNewEvent;
    this.http.post(this.globalService.url+(wasNewEvent?'appointments/add':'appointments/edit'), body, {
      headers: this.globalService.headers?.set('X-Skip-Global-Error-Popup', '1'), responseType: 'text',
    }).subscribe({ next: (response)=>{
      void this.agendaWidget?.refresh(true);
      let appointmentId = this.editingEventId;
      if (wasNewEvent) {
        try {
          appointmentId = Number(JSON.parse(response)?.appointmentId) || null;
        } catch {
          appointmentId = null;
        }
      }
      const finish = () => {
        this.pendingDeadlineIds = [];
        this.pendingInterventionMode = null;
        this.pendingInterventionItems = [];
        sessionStorage.removeItem(this.assetPreparationStorageKey);
        this.routeActionOpened = false;
        this.closePopup();
        this.loadAll();
      };
      if (this.isDeadlinePlanning) {
        if (!appointmentId) {
          this.popupService.showError('Evento creato, ma non è stato possibile collegare le scadenze.');
          return;
        }
        this.isNewEvent = false;
        this.editingEventId = appointmentId;
        this.http.post(
          this.globalService.url + 'admin/deadlines/plan',
          {
            deadlineIds: this.pendingDeadlineIds,
            appointmentId,
            interventionMode: this.pendingInterventionMode,
            interventionItems: this.pendingInterventionItems,
          },
        ).subscribe({
          next: finish,
          error: (err) => {
            this.popupService.showError(
              err?.error?.error || 'Evento salvato, ma collegamento alle scadenze non riuscito. Riprova a salvare.',
            );
          },
        });
      } else {
        finish();
      }
      if (hasReminder || body.calendarScope === 'personal') {
        this.inspectionAlarmSync.setToken(this.globalService.token);
        this.inspectionAlarmSync.syncSoon('calendar-save', true).catch((err) => {
          console.error('[Calendar] Errore sync promemoria appuntamento:', err);
        });
      }
      if (isInspection) {
        this.sendInspectionConfirmation(body);
      }
    }, error: (err) => {
      void this.handleSaveError(err, () => this.saveEvent(true));
    }});
  }

  private saveSingleOccurrence(body: any, isInspection: boolean, hasReminder: boolean) {
    const occurrenceStart = this.editingOccurrenceStart || new Date(this.popupStartDate);
    const selectedDate = this.editingSelectedDate || occurrenceStart;
    const payload = {
      ...body,
      id: this.editingEventId,
      recurrenceRule: '',
      recurrenceException: null,
      occurrenceDate: this.toICSDate(occurrenceStart),
      selectedDate: this.toInputDate(selectedDate),
    };

    this.http.post(this.globalService.url + 'appointments/editSingleOccurrence', payload, {
      headers: this.globalService.headers?.set('X-Skip-Global-Error-Popup', '1'),
      responseType: 'text',
    }).subscribe({
      next: () => {
        void this.agendaWidget?.refresh(true);
        this.closePopup();
        this.loadAll();
        if (hasReminder || body.calendarScope === 'personal') {
          this.inspectionAlarmSync.setToken(this.globalService.token);
          this.inspectionAlarmSync.syncSoon('calendar-save-single', true).catch((err) => {
            console.error('[Calendar] Errore sync promemoria occorrenza:', err);
          });
        }
        if (isInspection) {
          this.sendInspectionConfirmation(body);
        }
      },
      error: (err) => {
        void this.handleSaveError(err, () => this.saveSingleOccurrence({ ...body, allowConflict: true }, isInspection, hasReminder));
      },
    });
  }

  validateCodice(codice: string, categoria: string): boolean {
    const category = this.getCategoryOption(categoria);
    if (this.isQuoteCategory(category)) {
      const quote = this.quotesMap.get(this.normalize(codice));
      return !!quote && !quote.complete && this.quoteMatchesCategoryType(quote, category);
    }
    if (this.isCustomerCategory(category)) {
      const customerCode = String(codice || '').split('/', 1)[0];
      return this.clientiArray.some((customer) => {
        const sameCode = this.normalize(customer.numeroCliente?.toString() || '') === this.normalize(customerCode);
        return sameCode && this.customerMatchesCategoryType(customer, category);
      });
    }
    return true;
  }

  sendInspectionConfirmation(body: any) {
    this.http.post(this.globalService.url+'appointments/sendInspectionConfirmation', body, {
      headers: this.globalService.headers, responseType: 'text',
    }).subscribe(res=>{ if(res==='NO'){this.popupService.text="Non è stato possibile inviare la mail di conferma perché non è presente nessuna mail associata al preventivo"; this.popupService.openPopup();} });
  }

  // ── DELETE ─────────────────────────────────────────────────────────────

  requestDelete() {
    if (this.isRecurringInstance||this.hasRecurrenceRule) this.showDeleteConfirm=true;
    else this.deleteAll();
  }

  private refreshNativeCalendarAlarms(): void {
    void this.agendaWidget?.refresh(true);
    this.inspectionAlarmSync.setToken(this.globalService.token);
    void this.inspectionAlarmSync.syncSoon('calendar-delete', true).catch(error => console.error('[Calendar] Sync promemoria', error));
  }

  deleteAll() {
    this.http.post(this.globalService.url+'appointments/delete',{id:this.editingEventId, sourceTenantId:this.popupSourceTenantId || undefined},{
      headers:this.globalService.headers,responseType:'text',
    }).subscribe(()=>{this.closePopup();this.loadAll();this.refreshNativeCalendarAlarms();});
  }

  deleteSingle() {
    const occDate = this.toICSDate(this.editingOccurrenceStart || new Date(this.popupStartDate));
    this.http.post(this.globalService.url+'appointments/deleteSingleOccurrence',{id:this.editingEventId,occurrenceDate:occDate, sourceTenantId:this.popupSourceTenantId || undefined},{
      headers:this.globalService.headers,responseType:'text',
    }).subscribe(()=>{this.closePopup();this.loadAll();this.refreshNativeCalendarAlarms();});
  }

  // ── UTILS ──────────────────────────────────────────────────────────────

  getCategoryClass(cat: string): string {
    return cat ? `cat-${cat}` : 'cat-default';
  }

  getCategoryStyle(cat: string): {[key: string]: string} {
    const color = this.getCategoryColor(cat);
    return {
      background: color,
      color: this.getReadableTextColor(color),
    };
  }

  getEventBlockStyle(ev: CalEvent, layout?: Map<CalendarEventId, {col: number, totalCols: number}>): {[key: string]: string} {
    return {
      ...this.getEventPositionStyle(ev, layout),
      ...this.getCategoryStyle(ev.categories),
    };
  }

  formatTime(date: Date): string { return `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`; }

  toInputDatetime(d: Date): string {
    const pad=(n:number)=>n.toString().padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  toInputDate(d: Date): string {
    const pad=(n:number)=>n.toString().padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  normalize(s: string): string { return (s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim(); }

  getCategoriesForTenant(): CalendarCategoryOption[] {
    const configured = this.globalService.getAppointmentCategoryDetails()
      .filter((category) => category.key)
      .map((category, index) => ({
        id: category.key,
        text: category.label || category.key,
        color: this.normalizeColor(category.color, this.defaultCategoryColor(index)),
        defaultForTenant: category.defaultForTenant === true,
        withCustomerLink: category.withCustomerLink === true,
        forShifts: category.forShifts === true,
        source: category.source || 'none',
        customerType: category.customerType || '',
        quoteType: category.quoteType || '',
        inspection: category.inspection === true,
        serviceOrder: category.serviceOrder === true,
        customerWarehouse: category.customerWarehouse,
        keyRequired: category.keyRequired === true,
      }));

    return configured;
  }

  private getCategoryOption(categoryId: string): CalendarCategoryOption | undefined {
    return this.categories.find((category) => category.id === categoryId);
  }

  private isQuoteCategory(category?: CalendarCategoryOption): boolean {
    return category?.source === 'quotes' || category?.inspection === true;
  }

  private quoteMatchesCategoryType(quote: any, category?: CalendarCategoryOption): boolean {
    const requiredType = String(category?.quoteType || '').trim();
    if (!requiredType) return true;
    const quoteType = String(
      this.globalService.getRecordValueByRole('quote', quote || {}, 'quoteType') ||
      quote?.tipoPreventivo ||
      '',
    ).trim();
    return this.normalize(quoteType) === this.normalize(requiredType);
  }

  private isCustomerCategory(category?: CalendarCategoryOption): boolean {
    return category?.source === 'customers' || category?.withCustomerLink === true || category?.serviceOrder === true;
  }

  private getCustomerType(customer: any): string {
    return String(customer?.tipoCliente || '').trim();
  }

  private customerMatchesCategoryType(
    customer: any,
    category?: CalendarCategoryOption,
  ): boolean {
    const requiredType = String(category?.customerType || '').trim();
    if (!requiredType) return true;

    const customerType = this.getCustomerType(customer);
    if (customerType) {
      return this.normalize(customerType) === this.normalize(requiredType);
    }

    return this.normalize(this.globalService.getDefaultQuoteType('')) ===
      this.normalize(requiredType);
  }

  isInspectionCategory(category?: CalendarCategoryOption | string): boolean {
    const option = typeof category === 'string' ? this.getCategoryOption(category) : category;
    return option?.inspection === true;
  }

  private getDefaultCustomerLinkedCategory(customerType = ''): string {
    const normalizedCustomerType = String(customerType || '').trim().toLowerCase();
    if (normalizedCustomerType) {
      const exactMatch = this.categories.find((category) => (
        this.isCustomerCategory(category) &&
        String(category.customerType || '').trim().toLowerCase() === normalizedCustomerType
      ));
      if (exactMatch?.id) return exactMatch.id;
    }

    return this.categories.find((category) => (
      this.isCustomerCategory(category) &&
      !String(category.customerType || '').trim()
    ))?.id
      || this.categories.find((category) => this.isCustomerCategory(category))?.id
      || '';
  }

  private getCategoryColor(cat: string): string {
    const index = this.categories.findIndex((category) => category.id === cat);
    return index >= 0 ? this.categories[index].color : this.defaultCategoryColor(6);
  }

  private normalizeColor(color: unknown, fallback: string): string {
    const value = String(color || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }

  private defaultCategoryColor(index: number): string {
    const palette = ['#5fa878', '#d6b85a', '#2563eb', '#e86a6a', '#6f8fcf', '#9a7bc2', '#8a949e'];
    return palette[Math.abs(index) % palette.length];
  }

  private getReadableTextColor(color: string): string {
    const normalized = this.normalizeColor(color, '#8a949e').replace('#', '');
    const r = parseInt(normalized.substring(0, 2), 16);
    const g = parseInt(normalized.substring(2, 4), 16);
    const b = parseInt(normalized.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 150 ? '#111827' : '#ffffff';
  }

  getEventTopPx(ev: CalEvent): number { return ((ev.start.getHours()*60+ev.start.getMinutes())/30)*26; }
  getEventHeightPx(ev: CalEvent): number { return Math.max(((ev.end.getTime()-ev.start.getTime())/60000/30)*26,26); }
  getSlotTopPx(slot: string): number { const [h,m]=slot.split(':').map(Number); return ((h*60+m)/30)*26; }
  currentTimeTopPx(): number { const now=new Date(); return ((now.getHours()*60+now.getMinutes())/30)*26; }

  private computeOverlapLayout(events: CalEvent[], maxCols = Infinity): Map<CalendarEventId, {col: number, totalCols: number}> {
    const result = new Map<CalendarEventId, {col: number, totalCols: number}>();
    if (!events.length) return result;
    const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
    const groups: CalEvent[][] = [];
    let group: CalEvent[] = [];
    let groupEnd = 0;
    for (const ev of sorted) {
      if (ev.start.getTime() >= groupEnd) {
        if (group.length) groups.push(group);
        group = [ev];
        groupEnd = ev.end.getTime();
      } else {
        group.push(ev);
        groupEnd = Math.max(groupEnd, ev.end.getTime());
      }
    }
    if (group.length) groups.push(group);
    for (const grp of groups) {
      const colEnds: number[] = [];
      for (const ev of grp) {
        let c = colEnds.findIndex(end => ev.start.getTime() >= end);
        if (c === -1) { c = colEnds.length; colEnds.push(ev.end.getTime()); }
        else colEnds[c] = ev.end.getTime();
        result.set(ev.id, { col: c, totalCols: 0 });
      }
      const rawTotal = colEnds.length;
      const total = Math.min(rawTotal, maxCols);
      for (const ev of grp) {
        const raw = result.get(ev.id)!;
        result.set(ev.id, { col: Math.min(raw.col, total - 1), totalCols: total });
      }
    }
    return result;
  }

  getDayColMinWidth(cell: DayCell): number {
    if (!cell.eventLayout || cell.eventLayout.size === 0) return 0;
    let maxConcurrent = 1;
    for (const entry of cell.eventLayout.values()) {
      maxConcurrent = Math.max(maxConcurrent, entry.totalCols);
    }
    return maxConcurrent > 1 ? maxConcurrent * 110 : 0;
  }

  getEventPositionStyle(ev: CalEvent, layout?: Map<CalendarEventId, {col: number, totalCols: number}>): {[key: string]: string} {
    const entry = layout?.get(ev.id) ?? { col: 0, totalCols: 1 };
    const leftPct = (entry.col / entry.totalCols) * 100;
    const rightPct = ((entry.totalCols - entry.col - 1) / entry.totalCols) * 100;
    return {
      top: `${this.getEventTopPx(ev)}px`,
      height: `${this.getEventHeightPx(ev)}px`,
      left: `calc(${leftPct}% + 2px)`,
      right: `calc(${rightPct}% + 2px)`,
    };
  }

  goBack() { this.router.navigateByUrl('/homeAdmin'); }

  @HostListener('document:keydown.escape')
  onDetailsEscape(): void {
    if (this.detailEvent) this.closeEventDetails();
  }

  @HostListener('document:click',['$event'])
  onDocumentClick(event: MouseEvent) {
    const t = event.target as HTMLElement;
    if (!t.closest('.autocomplete-wrapper')) this.autocompleteOpen=false;
    if (!t.closest('.mini-cal-wrapper')&&!t.closest('.cal-title-btn')) this.showMiniCal=false;
  }
}
