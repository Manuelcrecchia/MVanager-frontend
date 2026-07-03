import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { firstValueFrom, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { AssignDialogComponent } from '../assign-dialog/assign-dialog.component';
import { VehicleAssignDialogComponent } from '../vehicle-assign-dialog/vehicle-assign-dialog.component';
import { EquipmentAssignDialogComponent } from '../equipment-assign-dialog/equipment-assign-dialog.component';
import { GlobalService } from '../../service/global.service';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { SocketService } from '../../service/soket.service';
import { TenantService } from '../../service/tenant.service';

interface RoutePlannerStop {
  id: string;
  appRef: any;
  customer: Record<string, any> | null;
  title: string;
  label: string;
  address: string;
  numeroCliente: string;
  duration: number;
  requiredEmployees: number;
  staffRequirements: RouteStaffRequirement[];
  startDate: Date | null;
  accessEndDate: Date | null;
  accessDays: string[];
  plannedStart: string;
  plannedEnd: string;
  travelBefore: number;
  mapX: number;
  mapY: number;
  lat: number | null;
  lng: number | null;
  coordinateSource: string;
  teamIndex: number;
  routeOrder: number;
  assignedTo: string;
  assignedEmployeeIds: number[];
  lockedEmployeeIds: number[];
  assignmentWarnings: string[];
  hasSplit: boolean;
}

interface RouteStaffRequirement {
  categoryId: number;
  categoryName: string;
  requiredCount: number;
}

interface EquipmentAssignment {
  targetKey: string;
  quantity: number;
}

interface RoutePlannerTeam {
  index: number;
  name: string;
  employees: any[];
  employeeNames: string;
  requiredEmployees: number;
  splitCount: number;
  warnings: string[];
  stops: RoutePlannerStop[];
  totalWorkMinutes: number;
  totalTravelMinutes: number;
  totalMinutes: number;
}

interface RouteMapTeam {
  index: number;
  name: string;
  color: string;
  stops: RoutePlannerStop[];
  points: string;
}

interface RouteTeamEmployeeSummary {
  id: number;
  name: string;
  workMinutes: number;
  stopsCount: number;
}

type RouteDurationMatrix = Record<string, Record<string, number | null>>;

interface RouteMatrixResponse {
  points?: Array<{
    id: string;
    lat: number | null;
    lng: number | null;
    source?: string;
  }>;
  matrix?: RouteDurationMatrix;
  source?: string;
  geocodedCount?: number;
  unresolvedCount?: number;
}

interface RoutePlannerEmployeeState {
  employee: any;
  id: number;
  name: string;
  automunito: boolean;
  capacityMinutes: number;
  loadMinutes: number;
  intervals: Array<{ start: number; end: number; stopId: string }>;
  partialLeaves: Array<{ start: number; end: number; label: string }>;
}

interface RoutePlannerContext {
  leavesByEmployee: Map<number, any[]>;
  staffContextByCustomer: Map<string, any>;
  customerByCode: Map<string, any>;
  planningPreferences: RoutePlannerPreference[];
}

type RoutePlannerStopOrderMode = 'timeline' | 'deadline' | 'duration' | 'preference';

interface RoutePlannerBuildOptions {
  teamsCount?: number;
  stopOrderMode?: RoutePlannerStopOrderMode;
}

interface RoutePlannerPreference {
  id?: number | null;
  employeeId: number | null;
  employeeName?: string;
  scope: 'customer' | 'category' | 'keyword' | 'coworker' | string;
  targetKey: string;
  targetLabel?: string;
  weight: number;
  evidenceCount?: number;
  source?: string;
  note?: string;
  validDate?: string;
}

interface RoutePlannerAiMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface RoutePlannerConflict {
  key: string;
  type: 'overlap' | 'capacity' | 'missing';
  message: string;
  employeeId: number;
  employeeName: string;
  stopIds: string[];
  stopTitles: string[];
  preferenceKeys: string[];
}

type RoutePlannerConflictAction = 'adjust_times_keep_assignments' | 'auto_compromise';

@Component({
  selector: 'app-create-shift',
  templateUrl: './create-shift.component.html',
  styleUrls: ['./create-shift.component.css'],
})
export class CreateShiftComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  selectedDate: Date = new Date();

  showMiniCal = false;
  miniCalDate = new Date();
  readonly DAYS_SHORT = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  readonly MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

  get miniCalTitle(): string { return `${this.MONTHS_IT[this.miniCalDate.getMonth()]} ${this.miniCalDate.getFullYear()}`; }

  get miniCalGrid(): Date[][] {
    const year = this.miniCalDate.getFullYear(), month = this.miniCalDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const dow = (firstDay.getDay() + 6) % 7;
    const cur = new Date(firstDay); cur.setDate(cur.getDate() - dow);
    const grid: Date[][] = [];
    for (let w = 0; w < 6; w++) {
      const week: Date[] = [];
      for (let d = 0; d < 7; d++) { week.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
      grid.push(week);
      if (cur.getMonth() !== month && w >= 3) break;
    }
    return grid;
  }

  isSameDay(a: Date, b: Date): boolean { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
  toggleMiniCal() { this.showMiniCal = !this.showMiniCal; this.miniCalDate = new Date(this.selectedDate); }
  miniPrev() { const d = new Date(this.miniCalDate); d.setMonth(d.getMonth()-1); this.miniCalDate = d; }
  miniNext() { const d = new Date(this.miniCalDate); d.setMonth(d.getMonth()+1); this.miniCalDate = d; }
  miniSelectDay(date: Date) { this.selectedDate = new Date(date); this.showMiniCal = false; this.loadAppointments(); this.loadVehiclesCache(); this.loadEquipmentTargetsCache(); }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const t = event.target as HTMLElement;
    if (!t.closest('.shift-mini-cal-wrapper') && !t.closest('.shift-date-btn')) this.showMiniCal = false;
  }

  appointments: any[] = [];
  assignedShifts: { [appointmentId: string]: number[] } = {};
  assignedCapisquadra: { [appointmentId: string]: number[] } = {};
  assignedCapisquadraNotes: { [appointmentId: string]: { [employeeId: number]: string } } = {};
  assignedVehicles: { [appointmentId: string]: number[] } = {};
  assignedEquipment: { [appointmentId: string]: EquipmentAssignment[] } = {};
  vehiclesCache: any[] = [];
  equipmentTargetsCache: any[] = [];
  loading = false;
  employeeList: any[] = [];
  previousWeekShiftList: { cliente: string; dipendenti: string[] }[] = [];
  durationOptions: number[] = Array.from({ length: 33 }, (_, i) => i * 15);
  postponePopupOpen = false;
  postponing = false;
  postponeError = '';
  postponeTarget: any = null;
  postponeForm = {
    date: '',
    time: '',
    duration: 60,
  };
  routePlannerOpen = false;
  routePlannerAutoTeams = true;
  routePlannerTeamsCount = 2;
  routePlannerRecommendedTeamsCount = 2;
  routePlannerAvailableEmployeesCount = 0;
  routePlannerStartTime = '08:00';
  routePlannerTeams: RoutePlannerTeam[] = [];
  routePlannerLoading = false;
  routePlannerMessage = 'Premi Genera giri per creare e applicare automaticamente i turni.';
  routePlannerApplyMessage = '';
  routePlannerWarnings: string[] = [];
  routePlannerMatrixSource = '';
  routePlannerUnresolvedCount = 0;
  routePlannerAiInput = '';
  routePlannerAiLoading = false;
  routePlannerAiMessages: RoutePlannerAiMessage[] = [
    {
      role: 'assistant',
      text: 'Dimmi preferenze tipo: evita Marco nei condomini, ricorda che Sara e brava al Panificio, oppure replica il piu possibile i turni precedenti.',
    },
  ];
  routePlannerAiDirectives: RoutePlannerPreference[] = [];
  routePlannerLearnedPreferences: RoutePlannerPreference[] = [];
  routePlannerActivePreferences: RoutePlannerPreference[] = [];
  routePlannerAiContextStop: RoutePlannerStop | null = null;
  routePlannerAiEngine = 'locale';

  private autosaveTimers: { [jobId: string]: any } = {};
  private autosaveDelayMs = 700;
  private routePlannerRequestId = 0;
  private routePlannerManagedAppointmentIds = new Set<string>();
  private routePlannerManualEmployeeIdsByAppointment = new Map<string, Set<number>>();
  routePlannerSelectedPreferenceKeys = new Set<string>();
  private routePlannerHiddenPreferenceKeys = new Set<string>();
  private routePlannerConflictPromptKey = '';
  private pendingRoutePlannerConflicts: RoutePlannerConflict[] = [];
  private routePlannerLeavesByEmployee = new Map<number, any[]>();
  private routePlannerTimeResolvedEmployeeIds = new Set<number>();
  routePlannerDeletingPreferences = false;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog,
    private globalService: GlobalService,
    private socketService: SocketService,
    public tenantService: TenantService,
  ) {}

  ngOnInit(): void {
    const queryDate = this.route.snapshot.queryParamMap.get('date');
    if (queryDate) this.selectedDate = this.parseLocalDate(queryDate);

    this.loadAppointments();
    this.loadVehiclesCache();
    this.loadEquipmentTargetsCache();

    this.socketService.onShiftUpdate().pipe(takeUntil(this.destroy$)).subscribe((update: any) => {
      if (update.date && update.date !== this.formatDate(this.selectedDate)) {
        return;
      }

      console.log('📡 Aggiornamento ricevuto:', update);

      switch (update.type) {
        case 'addExtra':
          if (!this.appointments.some((a) => a.id === update.data.id)) {
            this.appointments.push(update.data);
            this.sortAppointments();
          }
          break;

        case 'removeExtra':
          this.appointments = this.appointments.filter(
            (a) => a.id !== update.data.id,
          );
          break;

        case 'changeDuration':
        case 'updateDuration': {
          const jobDur = this.appointments.find((a) => a.id === update.data.id);
          if (jobDur) {
            jobDur.duration = update.data.duration;
            jobDur.durationDisplay = this.formatDuration(update.data.duration);
          }
          break;
        }

        case 'updateTitle': {
          const jobTitle = this.appointments.find(
            (a) => a.id === update.data.id,
          );
          if (jobTitle) jobTitle.title = update.data.title;
          break;
        }

        case 'updateDescription': {
          const jobDesc = this.appointments.find(
            (a) => a.id === update.data.id,
          );
          if (jobDesc) jobDesc.description = update.data.description;
          break;
        }

        case 'updateStartDate': {
          const job = this.appointments.find((a) => a.id === update.data.id);
          if (job) {
            job.startDate = update.data.startDate
              ? new Date(update.data.startDate)
              : null;
          }
          break;
        }

        case 'assignEmployees':
          this.assignedShifts[update.data.id] = update.data.employees;
          this.markAppointmentManualForRoutePlanner(update.data.id);
          break;

        case 'reorderGeneral':
          this.appointments.sort(
            (a, b) =>
              update.data.find((o: any) => o.id === a.id)?.order -
              update.data.find((o: any) => o.id === b.id)?.order,
          );
          break;

        case 'reorderEmployee':
          update.data.jobs.forEach((j: any) => {
            const job = this.appointments.find((a) => a.id === j.id);
            if (job) {
              if (!job.sortOrderByEmployee) job.sortOrderByEmployee = {};
              job.sortOrderByEmployee[update.data.empId] = j.order;
            }
          });
          break;

        case 'reload':
          this.loadAppointments();
          this.loadVehiclesCache();
          this.loadEquipmentTargetsCache();
          break;
      }

      this.appointments = [...this.appointments];
      if (this.routePlannerOpen) {
        this.generateRoutePlan();
      }
    });

    this.http
      .get<any[]>(this.globalService.url + 'employees/getAll')
      .subscribe({
        next: (res) => (this.employeeList = res),
        error: (err) => {
          console.error('Errore caricamento dipendenti:', err);
          alert('Errore durante il caricamento dei dipendenti');
        },
      });

    this.showPreviousWeekShifts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    Object.values(this.autosaveTimers).forEach((t) => { if (t) clearTimeout(t); });
    this.autosaveTimers = {};
  }

  private shouldIncludeAppointment(a: any): boolean {
    if (!a) return false;
    if (a.isExtra) return true;

    const category = String(a.categories || '').toLowerCase();
    const configured = this.globalService.getAppointmentCategoryDetails();
    const shiftCategories = configured
      .filter((item) => item.forShifts === true)
      .map((item) => String(item.key || '').toLowerCase());

    return shiftCategories.includes(category);
  }

  private scheduleAutosave(app: any, includeAssignments = false): void {
    if (!app) return;
    const id = String(app.id);

    if (this.autosaveTimers[id]) {
      clearTimeout(this.autosaveTimers[id]);
    }

    this.autosaveTimers[id] = setTimeout(() => {
      this.autosaveTimers[id] = null;
      this.autosave(app, includeAssignments);
    }, this.autosaveDelayMs);
  }

  private autosave(app: any, includeAssignments = false): void {
    const dateStr = this.formatDate(this.selectedDate);

    let start: string | null = null;
    if (app.startDate instanceof Date && !isNaN(app.startDate.getTime())) {
      start = this.toSqlDateTime(app.startDate);
    }

    const payload: any = {
      shiftId: app.shiftId || null,
      appointmentId: app.isExtra ? null : app.originalAppointmentId || app.id,
      data: dateStr,
      title: app.title,
      description: app.description,
      startDate: start,
      duration: app.duration ?? 0,
      sortOrderByEmployee: app.sortOrderByEmployee || {},
      vehicleIds: this.assignedVehicles[app.id] || [],
      equipmentKeys: this.normalizeEquipmentAssignments(this.assignedEquipment[app.id] || []),
    };

    if (includeAssignments) {
      payload.updateEmployees = true;
      payload.employeeIds = this.assignedShifts[app.id] || [];
      payload.capisquadra = this.assignedCapisquadra[app.id] || [];
      payload.capisquadraNotesMap = this.assignedCapisquadraNotes[app.id] || {};
    }

    console.log('AUTOSAVE PAYLOAD ->', payload);
    console.log('assignedCapisquadraNotes[' + app.id + '] =', this.assignedCapisquadraNotes[app.id]);

    this.http
	      .post<any>(this.globalService.url + 'shifts/autosave', payload)
	      .subscribe({
        next: (res) => {
          if (!app.shiftId && res?.shiftId) {
            app.shiftId = res.shiftId;
          }
        },
	        error: (err) => {
          console.error('Autosave fallito:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  private normalizeEquipmentAssignments(value: any): EquipmentAssignment[] {
    const rawItems = Array.isArray(value) ? value : [];
    const byTarget = new Map<string, number>();

    for (const item of rawItems) {
      const targetKey = item && typeof item === 'object'
        ? String(item.targetKey || item.id || '').trim()
        : String(item || '').trim();
      if (!targetKey) continue;
      const rawQuantity = item && typeof item === 'object'
        ? item.quantity ?? item.assignedQuantity
        : 1;
      const quantity = Math.max(1, Math.floor(Number(rawQuantity || 1)) || 1);
      byTarget.set(targetKey, (byTarget.get(targetKey) || 0) + quantity);
    }

    return [...byTarget.entries()].map(([targetKey, quantity]) => ({ targetKey, quantity }));
  }

  changeDuration(app: any, delta: number) {
    this.applyDuration(app);
    if (!app.duration) app.duration = 0;
    app.duration = Math.max(0, Math.min(480, app.duration + delta));
    app.durationDisplay = this.formatDuration(app.duration);
    this.markAppointmentManualForRoutePlanner(app.id);
    this.scheduleAutosave(app);

    this.socketService.emitUpdate({
      type: 'changeDuration',
      date: this.formatDate(this.selectedDate),
      data: { id: app.id, duration: app.duration },
    });
  }

  applyDuration(app: any) {
    if (!app.durationDisplay) {
      app.duration = 0;
      app.durationDisplay = '00.00';
      return;
    }

    const parts = app.durationDisplay.split('.');
    if (parts.length === 2) {
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      app.duration = h * 60 + m;
    } else {
      app.duration = parseInt(app.durationDisplay, 10) || 0;
    }

    app.duration = Math.max(0, Math.min(480, app.duration));
    app.durationDisplay = this.formatDuration(app.duration);
  }

  formatDuration(minutes: number): string {
    if (!minutes) return '00.00';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}.${m.toString().padStart(2, '0')}`;
  }

  canUseRoutePlanning(): boolean {
    return this.globalService.hasTenantFeature('routePlanning');
  }

  async toggleRoutePlanner(): Promise<void> {
    await this.generateAndApplyRoutePlan();
  }

  async generateAndApplyRoutePlan(): Promise<void> {
    if (this.routePlannerLoading) return;

    this.routePlannerOpen = true;
    try {
      await this.generateRoutePlan();
    } catch (error) {
      console.error('Generazione giri fallita:', error);
      this.routePlannerLoading = false;
      this.routePlannerTeams = this.createEmptyRouteTeams(1);
      this.routePlannerMessage = 'Non sono riuscito a generare i giri. Controlla la console o riprova dopo aver ricaricato la pagina.';
      this.routePlannerWarnings = [
        ...new Set([
          ...this.routePlannerWarnings,
          'Generazione giri interrotta da un errore.',
        ]),
      ];
      return;
    }

    if (this.hasRoutePlannerPlan) {
      this.applyRoutePlanToAssignments();
    }
  }

  get totalAssignedJobs(): number {
    return this.appointments.filter((app) => (this.assignedShifts[app.id] || []).length > 0).length;
  }

  get routePlannerStopsCount(): number {
    return this.routePlannerTeams.reduce((total, team) => total + team.stops.length, 0);
  }

  get routeMapStops(): RoutePlannerStop[] {
    return this.spreadRouteMapStops(this.routePlannerTeams.flatMap((team) => team.stops));
  }

  get routeMapTeams(): RouteMapTeam[] {
    const displayStops = this.routeMapStops;
    return this.routePlannerTeams
      .map((team) => {
        const stops = displayStops
          .filter((stop) => stop.teamIndex === team.index)
          .sort((a, b) => (a.routeOrder || 0) - (b.routeOrder || 0));
        return {
          index: team.index,
          name: team.name,
          color: this.routeTeamColor(team.index),
          stops,
          points: this.routePolylinePointsFromStops(stops),
        };
      })
      .filter((team) => team.stops.length > 0);
  }

  get hasRoutePlannerPlan(): boolean {
    return this.routePlannerTeams.some((team) => team.stops.length > 0);
  }

  private markAppointmentManualForRoutePlanner(appId: any): void {
    const id = String(appId || '');
    if (id) {
      this.routePlannerManagedAppointmentIds.delete(id);
      const assigned = [
        ...new Set((this.assignedShifts[id] || []).map((employeeId: any) => Number(employeeId)).filter(Boolean)),
      ];
      if (assigned.length) {
        this.routePlannerManualEmployeeIdsByAppointment.set(id, new Set(assigned));
      } else {
        this.routePlannerManualEmployeeIdsByAppointment.delete(id);
      }
    }
  }

  private isAppointmentManagedByRoutePlanner(app: any): boolean {
    return this.routePlannerManagedAppointmentIds.has(String(app?.id || ''));
  }

  private isAppointmentProtectedFromRoutePlanner(app: any): boolean {
    const id = String(app?.id || '');
    if (!id || this.isAppointmentManagedByRoutePlanner(app)) return false;
    const assigned = this.getRoutePlannerManualEmployeeIds(app);
    return assigned.length >= this.getAppointmentRequiredEmployees(app);
  }

  private getRoutePlannerProtectedAppointments(): any[] {
    return (this.appointments || []).filter((app) => this.isAppointmentProtectedFromRoutePlanner(app));
  }

  private getRoutePlannerManualEmployeeIds(app: any): number[] {
    const id = String(app?.id || '');
    if (!id) return [];

    const stored = this.routePlannerManualEmployeeIdsByAppointment.get(id);
    if (stored?.size) {
      return [...stored].map((employeeId) => Number(employeeId)).filter(Boolean);
    }

    return [];
  }

  get visibleRoutePlannerPreferences(): RoutePlannerPreference[] {
    return this.routePlannerActivePreferences
      .filter((preference) =>
        (preference.employeeId || this.isRoutePlannerCustomerClassification(preference)) &&
        preference.targetKey &&
        preference.weight,
      );
  }

  get selectedRoutePlannerPreferenceCount(): number {
    return this.routePlannerSelectedPreferenceKeys.size;
  }

  isRoutePlannerPreferenceSaved(preference: RoutePlannerPreference): boolean {
    return !!this.getRoutePlannerPreferenceId(preference);
  }

  isRoutePlannerPreferenceSelected(preference: RoutePlannerPreference): boolean {
    const key = this.getRoutePlannerPreferenceKey(preference);
    return !!key && this.routePlannerSelectedPreferenceKeys.has(key);
  }

  toggleRoutePlannerPreferenceSelection(preference: RoutePlannerPreference, checked: boolean): void {
    const key = this.getRoutePlannerPreferenceKey(preference);
    if (!key) return;
    if (checked) {
      this.routePlannerSelectedPreferenceKeys.add(key);
    } else {
      this.routePlannerSelectedPreferenceKeys.delete(key);
    }
    this.routePlannerSelectedPreferenceKeys = new Set(this.routePlannerSelectedPreferenceKeys);
  }

  async deleteRoutePlannerPreference(preference: RoutePlannerPreference): Promise<void> {
    if (this.routePlannerDeletingPreferences) return;
    if (!window.confirm(`Togliere questa preferenza attiva?\n${this.routePlannerPreferenceLabel(preference)}`)) return;
    await this.deleteRoutePlannerPreferences([preference]);
  }

  async deleteSelectedRoutePlannerPreferences(): Promise<void> {
    const selected = this.routePlannerActivePreferences
      .filter((preference) => this.routePlannerSelectedPreferenceKeys.has(this.getRoutePlannerPreferenceKey(preference)));
    if (!selected.length || this.routePlannerDeletingPreferences) return;
    if (!window.confirm(`Togliere ${selected.length} preferenze attive?`)) return;
    await this.deleteRoutePlannerPreferences(selected);
  }

  async deleteAllRoutePlannerPreferences(confirm = true): Promise<void> {
    const preferences = this.visibleRoutePlannerPreferences;
    if (!preferences.length || this.routePlannerDeletingPreferences) return;
    if (confirm && !window.confirm(`Togliere tutte le ${preferences.length} preferenze attive?`)) return;
    await this.deleteRoutePlannerPreferences(preferences, true);
  }

  async sendRoutePlannerAiMessage(): Promise<void> {
    const message = String(this.routePlannerAiInput || '').trim();
    if (!message || this.routePlannerAiLoading) return;

    this.routePlannerAiInput = '';
    this.routePlannerAiMessages = [
      ...this.routePlannerAiMessages,
      { role: 'user', text: message },
    ];

    this.routePlannerAiLoading = true;

    try {
      const conflictAction = this.detectRoutePlannerConflictAction(message);
      if (conflictAction) {
        const reply = await this.resolveRoutePlannerConflictAction(conflictAction, message);
        this.routePlannerAiMessages = [
          ...this.routePlannerAiMessages,
          { role: 'assistant', text: reply },
        ];
        return;
      }

      const response = await firstValueFrom(
        this.http.post<any>(this.globalService.url + 'shifts/ai/chat', {
          date: this.formatDate(this.selectedDate),
          message,
          conversation: this.routePlannerAiMessages.slice(-8),
          jobs: this.buildRoutePlannerAiJobsContext(),
          contextStop: this.routePlannerAiContextStop
            ? {
                id: this.routePlannerAiContextStop.id,
                title: this.routePlannerAiContextStop.title,
                numeroCliente: this.routePlannerAiContextStop.numeroCliente,
              }
            : null,
        }),
      );
      if (response?.clearPreferences === true) {
        this.routePlannerAiEngine = response?.engine || response?.mode || 'locale';
        this.routePlannerAiLoading = false;
        this.clearRoutePlannerPreferencesLocally(
          response?.reply || `Ho eliminato ${Number(response?.deletedCount) || 0} preferenze attive.`,
        );
        if (this.routePlannerOpen) {
          await this.generateAndApplyRoutePlan();
        }
        return;
      }
      const savedDirectives = [
        ...(Array.isArray(response?.persistedPreferences) ? response.persistedPreferences : []),
        ...(Array.isArray(response?.persistedClassifications) ? response.persistedClassifications : []),
      ]
        .map((item: any) => this.normalizeRoutePlannerPreference(item))
        .filter(Boolean) as RoutePlannerPreference[];
      const runtimeDirectives = [
        ...(Array.isArray(response?.directives) ? response.directives : []),
        ...(Array.isArray(response?.classifications) ? response.classifications : []),
      ]
        .map((item: any) => this.normalizeRoutePlannerPreference({
          ...item,
          validDate: item?.validDate || response?.temporaryForDate || '',
        }))
        .filter(Boolean) as RoutePlannerPreference[];
      const directives = savedDirectives.length ? savedDirectives : runtimeDirectives;
      const directiveKeys = new Set(
        directives
          .map((preference) => this.getRoutePlannerPreferenceKey(preference))
          .filter(Boolean),
      );
      if (directiveKeys.size) {
        this.routePlannerHiddenPreferenceKeys = new Set(
          [...this.routePlannerHiddenPreferenceKeys].filter((key) => !directiveKeys.has(key)),
        );
      }
      this.routePlannerAiDirectives = this.mergeRoutePlannerPreferences([
        ...this.routePlannerAiDirectives,
        ...directives,
      ]);
      this.routePlannerAiEngine = response?.engine || response?.mode || 'locale';
      this.refreshRoutePlannerActivePreferences();
      this.routePlannerAiMessages = [
        ...this.routePlannerAiMessages,
        {
          role: 'assistant',
          text: response?.reply ||
            (directives.length ? 'Ho aggiornato le preferenze. Rigenero e riapplico i turni.' : 'Non ho capito una preferenza precisa. Rigenero comunque i turni.'),
        },
      ];
      if (!response?.answerOnly && (directives.length || response?.regenerate === true)) {
        if (directives.length) {
          this.releaseRoutePlannerProtectionForPreferences(directives);
        }
        await this.generateAndApplyRoutePlan();
      }
    } catch (error) {
      console.error('Assistente turni non disponibile:', error);
      this.routePlannerAiMessages = [
        ...this.routePlannerAiMessages,
        { role: 'assistant', text: 'Assistente locale non disponibile in questo momento.' },
      ];
    } finally {
      this.routePlannerAiLoading = false;
    }
  }

  private buildRoutePlannerAiJobsContext(): any[] {
    return (this.appointments || []).map((app) => {
      const customer = this.getAppointmentCustomer(app);
      const assignedIds = [
        ...new Set((this.assignedShifts[app.id] || []).map((id: any) => Number(id)).filter(Boolean)),
      ];
      return {
        id: String(app.id || ''),
        appointmentId: String(app.originalAppointmentId || app.appointmentId || app.appointment?.id || ''),
        shiftId: String(app.shiftId || ''),
        title: String(app.title || ''),
        description: String(app.description || ''),
        numeroCliente: this.getAppointmentNumeroCliente(app),
        category: String(app.categories || app.appointment?.categories || ''),
        customerLabel: this.getAppointmentCustomerLabel(customer),
        customerDescription: String(customer?.descrizioneImmobile || customer?.description || ''),
        address: this.getAppointmentRouteAddress(app, customer),
        customerSearchText: this.getRoutePlannerCustomerSearchValues(customer).join(' '),
        startTime: this.getShiftTime(app),
        duration: Number(app.duration) || 0,
        requiredEmployees: this.getAppointmentRequiredEmployees(app),
        assignedEmployeeIds: assignedIds,
        assignedEmployees: assignedIds
          .map((id) => this.employeeList.find((employee) => Number(employee?.id) === id))
          .filter(Boolean)
          .map((employee) => this.formatEmployeeName(employee)),
        vehicles: this.getVehicleLabel(String(app.id || ''))
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean),
        equipment: this.getEquipmentLabel(String(app.id || ''))
          .split(',')
          .map((label) => label.trim())
          .filter(Boolean),
      };
    });
  }

  private getAppointmentCustomerLabel(customer: any): string {
    return String(
      customer?.nominativo ||
      customer?.nome ||
      customer?.ragioneSociale ||
      customer?.title ||
      '',
    ).trim();
  }

  async clearRoutePlannerAiPreferences(): Promise<void> {
    this.routePlannerAiDirectives = [];
    this.routePlannerAiContextStop = null;
    this.refreshRoutePlannerActivePreferences();
    if (this.routePlannerOpen) {
      await this.generateAndApplyRoutePlan();
    }
  }

  private getRoutePlannerPreferenceId(preference: RoutePlannerPreference): number | null {
    const id = Number(preference?.id);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private getRoutePlannerPreferenceKey(preference: RoutePlannerPreference): string {
    const normalized = this.normalizeRoutePlannerPreference(preference);
    if (!normalized) return '';
    return `${normalized.employeeId || 0}:${normalized.scope}:${normalized.targetKey.toLowerCase()}:${(normalized.targetLabel || '').toLowerCase()}:${normalized.validDate || ''}`;
  }

  private clearRoutePlannerPreferencesLocally(reply: string): void {
    const currentKeys = this.visibleRoutePlannerPreferences
      .map((preference) => this.getRoutePlannerPreferenceKey(preference))
      .filter(Boolean);
    this.routePlannerHiddenPreferenceKeys = new Set([
      ...this.routePlannerHiddenPreferenceKeys,
      ...currentKeys,
    ]);
    this.routePlannerSelectedPreferenceKeys = new Set();
    this.routePlannerLearnedPreferences = [];
    this.routePlannerAiDirectives = [];
    this.refreshRoutePlannerActivePreferences();
    this.routePlannerAiMessages = [
      ...this.routePlannerAiMessages,
      { role: 'assistant', text: reply },
    ];
  }

  private async deleteRoutePlannerPreferences(preferences: RoutePlannerPreference[], deleteAll = false): Promise<void> {
    const targets = (preferences || [])
      .map((preference) => this.normalizeRoutePlannerPreference(preference))
      .filter(Boolean) as RoutePlannerPreference[];
    if (!targets.length) return;
    const targetKeys = new Set(targets.map((preference) => this.getRoutePlannerPreferenceKey(preference)).filter(Boolean));
    const savedIds = [
      ...new Set(targets.map((preference) => this.getRoutePlannerPreferenceId(preference)).filter(Boolean) as number[]),
    ];

    this.routePlannerDeletingPreferences = true;
    try {
      let deletedIds = new Set<number>();
      if (deleteAll || savedIds.length) {
        const response = await firstValueFrom(
          this.http.request<any>('delete', this.globalService.url + 'shifts/ai/preferences', {
            body: deleteAll ? { all: true } : { ids: savedIds },
          }),
        );
        deletedIds = new Set(
          (Array.isArray(response?.deletedIds) ? response.deletedIds : savedIds)
            .map((id: any) => Number(id))
            .filter((id: number) => Number.isFinite(id) && id > 0),
        );
      }

      this.routePlannerHiddenPreferenceKeys = new Set([
        ...this.routePlannerHiddenPreferenceKeys,
        ...targetKeys,
      ]);
      this.routePlannerSelectedPreferenceKeys = new Set(
        [...this.routePlannerSelectedPreferenceKeys].filter((key) => !targetKeys.has(key)),
      );
      this.routePlannerLearnedPreferences = this.routePlannerLearnedPreferences
        .filter((preference) => {
          const id = this.getRoutePlannerPreferenceId(preference);
          const key = this.getRoutePlannerPreferenceKey(preference);
          return (!id || !deletedIds.has(id)) && !targetKeys.has(key);
        });
      this.routePlannerAiDirectives = this.routePlannerAiDirectives
        .filter((preference) => {
          const id = this.getRoutePlannerPreferenceId(preference);
          const key = this.getRoutePlannerPreferenceKey(preference);
          return (!id || !deletedIds.has(id)) && !targetKeys.has(key);
        });
      this.refreshRoutePlannerActivePreferences();
      this.routePlannerAiMessages = [
        ...this.routePlannerAiMessages,
        {
          role: 'assistant',
          text: `Ho tolto ${targetKeys.size} preferenze attive e aggiorno i turni.`,
        },
      ];
      if (targetKeys.size && this.routePlannerOpen) {
        await this.generateAndApplyRoutePlan();
      }
    } catch (error) {
      console.error('Errore cancellazione preferenze AI:', error);
      this.routePlannerAiMessages = [
        ...this.routePlannerAiMessages,
        { role: 'assistant', text: 'Non sono riuscito a togliere le preferenze attive.' },
      ];
    } finally {
      this.routePlannerDeletingPreferences = false;
    }
  }

  setRoutePlannerAiContext(stop: RoutePlannerStop): void {
    this.routePlannerAiContextStop = stop;
    this.routePlannerAiMessages = [
      ...this.routePlannerAiMessages,
      { role: 'assistant', text: `Ok, sto guardando: ${stop.title}.` },
    ];
  }

  clearRoutePlannerAiContext(): void {
    this.routePlannerAiContextStop = null;
  }

  get routePlannerConflictActionButtons(): Array<{
    action: RoutePlannerConflictAction;
    label: string;
    icon: string;
    title: string;
  }> {
    if (!this.pendingRoutePlannerConflicts.length) return [];
    const hasOverlap = this.pendingRoutePlannerConflicts.some((conflict) => conflict.type === 'overlap');
    return [
      ...(hasOverlap
        ? [{
            action: 'adjust_times_keep_assignments' as const,
            label: 'Sposta orari',
            icon: 'fa-clock',
            title: 'Mantiene i dipendenti obbligatori e prova a spostare gli orari sovrapposti',
          }]
        : []),
      {
        action: 'auto_compromise' as const,
        label: 'Trova soluzione',
        icon: 'fa-magic',
        title: 'Lascia al planner la scelta del vincolo meno sicuro da sospendere per questo piano',
      },
    ];
  }

  async applyRoutePlannerConflictAction(action: RoutePlannerConflictAction): Promise<void> {
    if (!this.pendingRoutePlannerConflicts.length || this.routePlannerAiLoading || this.routePlannerLoading) return;
    const label = action === 'adjust_times_keep_assignments'
      ? 'Sposta gli orari e lascia i dipendenti obbligatori'
      : 'Trova tu la soluzione';
    this.routePlannerAiMessages = [
      ...this.routePlannerAiMessages,
      { role: 'user', text: label },
    ];
    this.routePlannerAiLoading = true;
    try {
      const reply = await this.resolveRoutePlannerConflictAction(action, label);
      this.routePlannerAiMessages = [
        ...this.routePlannerAiMessages,
        { role: 'assistant', text: reply },
      ];
    } finally {
      this.routePlannerAiLoading = false;
    }
  }

  private detectRoutePlannerConflictAction(message: string): RoutePlannerConflictAction | null {
    if (!this.pendingRoutePlannerConflicts.length) return null;
    if (this.isRoutePlannerTimeResolveRequest(message)) return 'adjust_times_keep_assignments';
    if (this.isRoutePlannerAutoResolveRequest(message)) return 'auto_compromise';
    return null;
  }

  private async resolveRoutePlannerConflictAction(
    action: RoutePlannerConflictAction,
    message: string,
  ): Promise<string> {
    if (action === 'adjust_times_keep_assignments') {
      return this.resolveRoutePlannerConflictsByChangingTimes(message);
    }
    return this.resolveRoutePlannerConflictsAutomatically();
  }

  private isRoutePlannerAutoResolveRequest(message: string): boolean {
    const text = this.normalizeRoutePlannerSearchText(message);
    const asksDelegation = /(trova tu|decidi tu|fai tu|scegli tu|risolvi tu|sistema tu|sistemalo tu|in automatico|automaticamente|vedi tu|fai al meglio|miglior compromesso|qualunque soluzione|risolvi il conflitto)/.test(text);
    if (!asksDelegation) return false;
    return !this.isRoutePlannerTimeResolveRequest(message);
  }

  private isRoutePlannerTimeResolveRequest(message: string): boolean {
    const text = this.normalizeRoutePlannerSearchText(message);
    const hasOverlapConflict = this.pendingRoutePlannerConflicts.some((conflict) => conflict.type === 'overlap');
    if (!hasOverlapConflict) return false;

    const timeWords = /\b(orari|orario|ora|ore|arrivo|arrivi|inizio|inizi|partenza|partenze|agenda|fasce|sovrapposizione|sovrapposti|sovrappongono|sequenza|dopo|prima)\b/.test(text);
    const changeWords = /\b(cambia|sposta|modifica|sistema|aggiusta|ricalcola|ritarda|anticipa|scagliona|separa|metti|mettili|organizza|ordina|incastra)\b/.test(text);
    const keepWords = /\b(lascia|mantieni|tieni|tenere|resta|restino|rimane|rimangano|non togliere|senza togliere|non cambiare dipendent[ei]|stessi dipendenti|stesso dipendente|quei posti|quei lavori|su quei)\b/.test(text);
    const mentionsConflictEmployee = this.getRoutePlannerConflictEmployeeIdsForTimeResolve(message).length > 0;

    return (timeWords && changeWords && (keepWords || mentionsConflictEmployee)) ||
      (timeWords && keepWords) ||
      (changeWords && keepWords && mentionsConflictEmployee);
  }

  private async resolveRoutePlannerConflictsByChangingTimes(message: string): Promise<string> {
    const employeeIds = this.getRoutePlannerConflictEmployeeIdsForTimeResolve(message);
    if (!employeeIds.length) {
      return 'Ho capito che vuoi cambiare gli orari, ma non ho trovato il dipendente del conflitto da mantenere sui lavori.';
    }

    this.routePlannerTimeResolvedEmployeeIds = new Set([
      ...this.routePlannerTimeResolvedEmployeeIds,
      ...employeeIds,
    ]);
    this.pendingRoutePlannerConflicts = [];
    this.routePlannerConflictPromptKey = '';

    if (this.routePlannerOpen) {
      await this.generateAndApplyRoutePlan();
    }

    const names = employeeIds
      .map((employeeId) => this.getRoutePlannerEmployeeName(employeeId))
      .join(', ');
    return `Ok, tengo ${names} sui lavori obbligatori e cambio gli orari di arrivo per evitare sovrapposizioni. Ho rigenerato e riapplicato il piano.`;
  }

  private getRoutePlannerConflictEmployeeIdsForTimeResolve(message: string): number[] {
    const overlapEmployeeIds = [
      ...new Set(
        (this.pendingRoutePlannerConflicts || [])
          .filter((conflict) => conflict.type === 'overlap')
          .map((conflict) => Number(conflict.employeeId))
          .filter(Boolean),
      ),
    ];
    if (!overlapEmployeeIds.length) return [];

    const mentionedEmployeeIds = new Set(this.findRoutePlannerEmployeesMentionedInMessage(message));
    const filtered = overlapEmployeeIds.filter((employeeId) => mentionedEmployeeIds.has(employeeId));
    return filtered.length ? filtered : overlapEmployeeIds;
  }

  private findRoutePlannerEmployeesMentionedInMessage(message: string): number[] {
    const text = this.normalizeRoutePlannerSearchText(message);
    if (!text) return [];

    return (this.employeeList || [])
      .filter((employee) => {
        const name = this.normalizeRoutePlannerSearchText(this.formatEmployeeName(employee));
        if (!name) return false;
        const tokens = name.split(' ').filter((token) => token.length >= 3);
        return text.includes(name) || tokens.some((token) => text.includes(token));
      })
      .map((employee) => Number(employee?.id))
      .filter(Boolean);
  }

  private async resolveRoutePlannerConflictsAutomatically(): Promise<string> {
    const preferences = this.pickRoutePlannerConflictPreferencesToSuspend(this.pendingRoutePlannerConflicts);
    if (!preferences.length) {
      return 'Ho visto il conflitto, ma non ho trovato un vincolo sicuro da sospendere automaticamente. Dimmi quale regola vuoi togliere o ammorbidire.';
    }

    const suspendedKeys = new Set(
      preferences
        .map((preference) => this.getRoutePlannerPreferenceKey(preference))
        .filter(Boolean),
    );
    this.routePlannerHiddenPreferenceKeys = new Set([
      ...this.routePlannerHiddenPreferenceKeys,
      ...suspendedKeys,
    ]);
    this.routePlannerSelectedPreferenceKeys = new Set(
      [...this.routePlannerSelectedPreferenceKeys].filter((key) => !suspendedKeys.has(key)),
    );
    this.pendingRoutePlannerConflicts = [];
    this.routePlannerConflictPromptKey = '';
    this.refreshRoutePlannerActivePreferences();

    if (this.routePlannerOpen) {
      await this.generateAndApplyRoutePlan();
    }

    const labels = preferences
      .map((preference) => this.routePlannerPreferenceLabel(preference))
      .slice(0, 4)
      .join(', ');
    return `Ho sospeso per questo piano: ${labels}. Ho rigenerato i turni cercando il compromesso migliore.`;
  }

  private pickRoutePlannerConflictPreferencesToSuspend(
    conflicts: RoutePlannerConflict[],
  ): RoutePlannerPreference[] {
    const activeByKey = new Map(
      this.routePlannerActivePreferences
        .map((preference) => [this.getRoutePlannerPreferenceKey(preference), preference] as const)
        .filter(([key]) => !!key),
    );
    const selected = new Map<string, RoutePlannerPreference>();

    for (const conflict of conflicts || []) {
      const candidates = [
        ...new Set(conflict.preferenceKeys || []),
      ]
        .map((key) => activeByKey.get(key))
        .filter(Boolean) as RoutePlannerPreference[];
      if (!candidates.length) continue;

      const candidate = candidates
        .sort((a, b) =>
          this.getRoutePlannerConflictPreferenceKeepScore(a) -
          this.getRoutePlannerConflictPreferenceKeepScore(b),
        )[0];
      const key = this.getRoutePlannerPreferenceKey(candidate);
      if (key) selected.set(key, candidate);
    }

    return [...selected.values()];
  }

  private getRoutePlannerConflictPreferenceKeepScore(preference: RoutePlannerPreference): number {
    const scope = String(preference.scope || '').toLowerCase();
    const scopeScore = scope === 'customer'
      ? 500
      : scope === 'category'
        ? 350
        : scope === 'keyword'
          ? 200
          : scope === 'coworker'
            ? 120
            : 0;
    return scopeScore +
      (Math.abs(Number(preference.weight) || 0) * 2) +
      (this.getRoutePlannerPreferencePriority(preference) * 35) +
      (Number(preference.evidenceCount || 0) * 3);
  }

  private updateRoutePlannerConflictPrompt(stops: RoutePlannerStop[]): void {
    const conflicts = this.collectRoutePlannerConflicts(stops);
    this.pendingRoutePlannerConflicts = conflicts;

    const promptKey = conflicts
      .map((conflict) => `${conflict.key}:${[...(conflict.preferenceKeys || [])].sort().join(',')}`)
      .sort()
      .join('|');

    if (!promptKey) {
      this.routePlannerConflictPromptKey = '';
      return;
    }

    if (promptKey === this.routePlannerConflictPromptKey) return;
    this.routePlannerConflictPromptKey = promptKey;

    const details = conflicts
      .slice(0, 3)
      .map((conflict) => `- ${conflict.message}`)
      .join('\n');
    const extra = conflicts.length > 3
      ? `\nAltri conflitti: ${conflicts.length - 3}.`
      : '';

    this.routePlannerAiMessages = [
      ...this.routePlannerAiMessages,
      {
        role: 'assistant',
        text:
          `Ho trovato un conflitto nei vincoli obbligatori:\n${details}${extra}\n` +
          'Puoi farmi cambiare gli orari mantenendo i dipendenti obbligatori, oppure chiedermi di trovare il miglior compromesso.',
      },
    ];
  }

  private collectRoutePlannerConflicts(stops: RoutePlannerStop[]): RoutePlannerConflict[] {
    const conflicts = new Map<string, RoutePlannerConflict>();
    const addConflict = (conflict: RoutePlannerConflict) => {
      const existing = conflicts.get(conflict.key);
      if (!existing) {
        conflicts.set(conflict.key, {
          ...conflict,
          stopIds: [...new Set(conflict.stopIds)],
          stopTitles: [...new Set(conflict.stopTitles)],
          preferenceKeys: [...new Set(conflict.preferenceKeys)],
        });
        return;
      }

      existing.stopIds = [...new Set([...existing.stopIds, ...conflict.stopIds])];
      existing.stopTitles = [...new Set([...existing.stopTitles, ...conflict.stopTitles])];
      existing.preferenceKeys = [...new Set([...existing.preferenceKeys, ...conflict.preferenceKeys])];
    };

    const assignmentsByEmployee = new Map<number, Array<{
      stop: RoutePlannerStop;
      start: number;
      end: number;
      routeLoadMinutes: number;
      preferenceKeys: string[];
    }>>();

    for (const stop of stops || []) {
      const assignedIds = [
        ...new Set((stop.assignedEmployeeIds || []).map((id) => Number(id)).filter(Boolean)),
      ];
      const assignedSet = new Set(assignedIds);

      for (const preference of this.getMandatoryRoutePreferencesForStop(stop)) {
        const employeeId = Number(preference.employeeId);
        if (!employeeId || assignedSet.has(employeeId)) continue;
        addConflict({
          key: `missing:${employeeId}:${stop.id}`,
          type: 'missing',
          message: this.buildMissingMandatoryRoutePreferenceMessage(stop, preference, stops),
          employeeId,
          employeeName: preference.employeeName || this.getRoutePlannerEmployeeName(employeeId),
          stopIds: [String(stop.id)],
          stopTitles: [stop.title],
          preferenceKeys: [this.getRoutePlannerPreferenceKey(preference)].filter(Boolean),
        });
      }

      const start = this.routeTimeToMinutes(stop.plannedStart);
      const end = start + stop.duration;
      const routeLoadMinutes = this.getRouteStopEmployeeLoadMinutes(stop, Math.max(1, assignedIds.length));

      for (const employeeId of assignedIds) {
        const preferences = this.getMandatoryRoutePreferencesForEmployeeStop(stop, employeeId);
        const locked = (stop.lockedEmployeeIds || []).map((id) => Number(id)).includes(employeeId);
        if (!preferences.length && !locked) continue;
        const items = assignmentsByEmployee.get(employeeId) || [];
        items.push({
          stop,
          start,
          end,
          routeLoadMinutes,
          preferenceKeys: preferences
            .map((preference) => this.getRoutePlannerPreferenceKey(preference))
            .filter(Boolean),
        });
        assignmentsByEmployee.set(employeeId, items);
      }
    }

    for (const [employeeId, assignments] of assignmentsByEmployee) {
      const employeeName = this.getRoutePlannerEmployeeName(employeeId);
      const ordered = [...assignments].sort((a, b) => a.start - b.start);

      for (let i = 0; i < ordered.length; i++) {
        for (let j = i + 1; j < ordered.length; j++) {
          const first = ordered[i];
          const second = ordered[j];
          if (first.end <= second.start) continue;

          addConflict({
            key: `overlap:${employeeId}:${[first.stop.id, second.stop.id].sort().join(':')}`,
            type: 'overlap',
            message: `${employeeName} e obbligato su ${first.stop.title} (${first.stop.plannedStart}) e ${second.stop.title} (${second.stop.plannedStart}), ma gli orari si sovrappongono.`,
            employeeId,
            employeeName,
            stopIds: [String(first.stop.id), String(second.stop.id)],
            stopTitles: [first.stop.title, second.stop.title],
            preferenceKeys: [...first.preferenceKeys, ...second.preferenceKeys],
          });
        }
      }

      const employee = this.employeeList.find((item) => Number(item.id) === employeeId);
      const capacityMinutes = employee ? this.getEmployeeDailyCapacityMinutes(employee) : 8 * 60;
      const routeMinutes = ordered.reduce((sum, assignment) => sum + assignment.routeLoadMinutes, 0);
      const preferenceKeys = ordered.flatMap((assignment) => assignment.preferenceKeys);
      if (routeMinutes > capacityMinutes && preferenceKeys.length) {
        addConflict({
          key: `capacity:${employeeId}`,
          type: 'capacity',
          message: `${employeeName} supera le ore per vincoli obbligatori: ${this.formatDuration(routeMinutes)} su ${this.formatDuration(capacityMinutes)}.`,
          employeeId,
          employeeName,
          stopIds: ordered.map((assignment) => String(assignment.stop.id)),
          stopTitles: ordered.map((assignment) => assignment.stop.title),
          preferenceKeys,
        });
      }
    }

    return [...conflicts.values()];
  }

  private buildMissingMandatoryRoutePreferenceMessage(
    stop: RoutePlannerStop,
    preference: RoutePlannerPreference,
    stops: RoutePlannerStop[] = [],
  ): string {
    const employeeId = Number(preference.employeeId);
    const employee = this.employeeList.find((item) => Number(item?.id) === employeeId);
    const employeeName = preference.employeeName ||
      (employee ? this.formatEmployeeName(employee) : this.getRoutePlannerEmployeeName(employeeId));
    const reasons: string[] = [];

    if (!employee) {
      reasons.push('dipendente non trovato nell\'elenco');
    } else {
      if (employee.active === false) {
        reasons.push('dipendente disattivato');
      }
      const capacityMinutes = this.getEmployeeDailyCapacityMinutes(employee);
      if (capacityMinutes <= 0) {
        reasons.push('0 ore giornaliere impostate');
      }
    }

    const leaves = this.routePlannerLeavesByEmployee.get(employeeId) || [];
    const fullDayLeave = leaves.find((leave) => String(leave?.tipoPermesso || '').toLowerCase() !== 'parziale');
    if (fullDayLeave) {
      reasons.push(`assenza intera: ${fullDayLeave.categoria || 'assenza'}`);
    }

    const start = this.routeTimeToMinutes(stop.plannedStart);
    const end = start + stop.duration;
    const partialLeave = leaves
      .filter((leave) => String(leave?.tipoPermesso || '').toLowerCase() === 'parziale')
      .find((leave) => {
        const interval = this.buildPartialLeaveInterval(leave);
        return interval && start < interval.end && end > interval.start;
      });
    if (partialLeave) {
      reasons.push(`permesso parziale ${partialLeave.categoria || 'Permesso'} nell'orario ${stop.plannedStart}-${stop.plannedEnd}`);
    }

    const overlappingStop = (stops || []).find((other) => {
      if (String(other.id) === String(stop.id)) return false;
      const assignedIds = new Set((other.assignedEmployeeIds || []).map((id) => Number(id)).filter(Boolean));
      if (!assignedIds.has(employeeId)) return false;
      const otherStart = this.routeTimeToMinutes(other.plannedStart);
      const otherEnd = otherStart + other.duration;
      return start < otherEnd && end > otherStart;
    });
    if (overlappingStop) {
      reasons.push(`gia assegnato a ${overlappingStop.title} nello stesso orario`);
    }

    if (employee && this.getEmployeeDailyCapacityMinutes(employee) > 0) {
      const capacityMinutes = this.getEmployeeDailyCapacityMinutes(employee);
      const assignedLoadMinutes = (stops || []).reduce((sum, other) => {
        if (String(other.id) === String(stop.id)) return sum;
        const assignedIds = (other.assignedEmployeeIds || []).map((id) => Number(id)).filter(Boolean);
        if (!assignedIds.includes(employeeId)) return sum;
        return sum + this.getRouteStopEmployeeLoadMinutes(other, Math.max(1, assignedIds.length));
      }, 0);
      const projectedLoadMinutes = assignedLoadMinutes +
        this.getRouteStopEmployeeLoadMinutes(stop, Math.max(this.getRouteStopRequiredEmployees(stop), 1));
      if (projectedLoadMinutes > capacityMinutes) {
        reasons.push(`supererebbe le ore giornaliere (${this.formatDuration(projectedLoadMinutes)} su ${this.formatDuration(capacityMinutes)})`);
      }
    }

    const normalizedEmployeeNames = [
      employeeName,
      preference.employeeName,
      employee ? this.formatEmployeeName(employee) : '',
    ]
      .map((name) => this.normalizeRoutePlannerSearchText(name))
      .filter(Boolean);
    for (const warning of stop.assignmentWarnings || []) {
      const normalizedWarning = this.normalizeRoutePlannerSearchText(warning);
      const namesEmployee = normalizedEmployeeNames.some((name) => normalizedWarning.includes(name));
      if (!namesEmployee) continue;
      reasons.push(
        String(warning)
          .replace(/^Vincolo non rispettato:\s*/i, '')
          .replace(/^Vincolo forzato:\s*/i, '')
          .trim(),
      );
    }

    for (const warning of stop.assignmentWarnings || []) {
      if (warning === 'Giorno non tra quelli di accesso cliente') {
        reasons.push('giorno non tra quelli di accesso cliente');
      }
    }

    if ((stop.assignedEmployeeIds || []).length < this.getRouteStopRequiredEmployees(stop)) {
      reasons.push(`lo stop e rimasto con ${(stop.assignedEmployeeIds || []).length}/${this.getRouteStopRequiredEmployees(stop)} operatori`);
    }

    const uniqueReasons = [...new Set(reasons.map((reason) => reason.trim()).filter(Boolean))];
    const reasonText = uniqueReasons.length
      ? ` Motivo: ${uniqueReasons.slice(0, 3).join('; ')}.`
      : ' Motivo non dettagliato: controlla ore giornaliere, assenze e orari del lavoro.';

    return `${employeeName} dovrebbe andare su ${stop.title}, ma non e assegnabile.${reasonText}`;
  }

  private getMandatoryRoutePreferencesForEmployeeStop(
    stop: RoutePlannerStop,
    employeeId: number,
  ): RoutePlannerPreference[] {
    return this.getMandatoryRoutePreferencesForStop(stop)
      .filter((preference) => Number(preference.employeeId) === Number(employeeId));
  }

  private getRoutePlannerEmployeeName(employeeId: number): string {
    const employee = this.employeeList.find((item) => Number(item.id) === Number(employeeId));
    return employee ? this.formatEmployeeName(employee) : `Dipendente ${employeeId}`;
  }

  routePlannerPreferenceLabel(preference: RoutePlannerPreference): string {
    if (this.isRoutePlannerCustomerClassification(preference)) {
      return `Cliente ${preference.targetKey}: ${preference.targetLabel}`;
    }
    const employee = preference.employeeName || `Dip. ${preference.employeeId}`;
    if (this.isRoutePlannerNoWorkPreference(preference)) {
      return preference.validDate
        ? `Non far lavorare ${employee} il ${preference.validDate}`
        : `Non far lavorare ${employee}`;
    }
    const weight = Number(preference.weight) || 0;
    const sign = weight <= -95
      ? 'Vieta'
      : weight < 0
        ? 'Evita'
        : weight >= 95
          ? 'Obbliga'
          : 'Preferisci';
    const target = preference.targetLabel || preference.targetKey;
    return `${sign} ${employee} su ${target}`;
  }

  private normalizeRoutePlannerPreference(input: any): RoutePlannerPreference | null {
    const id = Number(input?.id);
    const employeeId = Number(input?.employeeId);
    const targetKey = String(input?.targetKey || '').trim();
    const scope = String(input?.scope || 'keyword').trim().toLowerCase();
    const weight = Math.max(-100, Math.min(100, Math.round(Number(input?.weight) || 0)));
    const validDate = String(input?.validDate || input?.temporaryForDate || '').trim();
    if (!targetKey || !weight) return null;
    if (!employeeId && scope !== 'customerkeyword') return null;
    return {
      id: Number.isFinite(id) && id > 0 ? id : null,
      employeeId: employeeId || null,
      employeeName: String(input?.employeeName || '').trim(),
      scope,
      targetKey,
      targetLabel: String(input?.targetLabel || targetKey).trim(),
      weight,
      evidenceCount: Math.max(0, Number(input?.evidenceCount) || 0),
      source: String(input?.source || '').trim(),
      note: String(input?.note || '').trim(),
      validDate,
    };
  }

  private refreshRoutePlannerActivePreferences(): void {
    const selectedDateKey = this.formatDate(this.selectedDate);
    const assignableEmployeeIds = new Set(
      (this.employeeList || [])
        .filter((employee) => employee?.active !== false)
        .map((employee) => Number(employee?.id))
        .filter(Boolean),
    );
    const active = this.mergeRoutePlannerPreferences([
      ...this.routePlannerLearnedPreferences,
      ...this.routePlannerAiDirectives,
    ]).filter((preference) => (
      this.isRoutePlannerCustomerClassification(preference) ||
      (Number(preference.employeeId) && assignableEmployeeIds.has(Number(preference.employeeId)))
    ) &&
      (!preference.validDate || preference.validDate === selectedDateKey) &&
      !this.routePlannerHiddenPreferenceKeys.has(this.getRoutePlannerPreferenceKey(preference)));
    this.routePlannerActivePreferences = active;
    const activeKeys = new Set(active.map((preference) => this.getRoutePlannerPreferenceKey(preference)));
    this.routePlannerSelectedPreferenceKeys = new Set(
      [...this.routePlannerSelectedPreferenceKeys].filter((key) => activeKeys.has(key)),
    );
  }

  private mergeRoutePlannerPreferences(preferences: RoutePlannerPreference[]): RoutePlannerPreference[] {
    const merged = new Map<string, RoutePlannerPreference>();
    for (const preference of preferences || []) {
      const normalized = this.normalizeRoutePlannerPreference(preference);
      if (!normalized) continue;
      const key = `${normalized.employeeId || 0}:${normalized.scope}:${normalized.targetKey.toLowerCase()}:${(normalized.targetLabel || '').toLowerCase()}:${normalized.validDate || ''}`;
      const current = merged.get(key);
      merged.set(key, current
        ? {
            ...current,
            id: normalized.id || current.id || null,
            weight: Math.max(-100, Math.min(100, current.weight + normalized.weight)),
            evidenceCount: Math.max(current.evidenceCount || 0, normalized.evidenceCount || 0),
            source: normalized.source || current.source,
            note: normalized.note || current.note,
          }
        : normalized);
    }
    return [...merged.values()]
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
  }

  private isRoutePlannerCustomerClassification(preference: RoutePlannerPreference): boolean {
    return String(preference.scope || '').toLowerCase() === 'customerkeyword' && !preference.employeeId;
  }

  private isRoutePlannerNoWorkPreference(preference: RoutePlannerPreference | null | undefined): boolean {
    return String(preference?.scope || '').toLowerCase() === 'availability' &&
      this.normalizeRoutePlannerSearchText(preference?.targetKey || '') === 'no_work' &&
      Number(preference?.employeeId) > 0 &&
      Number(preference?.weight) < 0;
  }

  private isRoutePlannerEmployeeDisabledByPreference(employeeId: number): boolean {
    return this.routePlannerActivePreferences.some((preference) =>
      this.isRoutePlannerNoWorkPreference(preference) &&
      Number(preference.employeeId) === Number(employeeId),
    );
  }

  private releaseRoutePlannerProtectionForPreferences(preferences: RoutePlannerPreference[]): number {
    const actionable = (preferences || [])
      .map((preference) => this.normalizeRoutePlannerPreference(preference))
      .filter(Boolean) as RoutePlannerPreference[];
    if (!actionable.length) return 0;

    let released = 0;
    for (const app of this.appointments || []) {
      if (!actionable.some((preference) => this.routePlannerPreferenceMatchesAppointment(preference, app))) {
        continue;
      }
      const id = String(app?.id || '');
      if (!id) continue;
      this.routePlannerManualEmployeeIdsByAppointment.delete(id);
      this.routePlannerManagedAppointmentIds.add(id);
      released++;
    }

    return released;
  }

  private routePlannerPreferenceMatchesAppointment(preference: RoutePlannerPreference, app: any): boolean {
    const targetKey = this.normalizeRoutePlannerSearchText(preference.targetKey);
    if (!targetKey || !app) return false;

    const scope = String(preference.scope || 'keyword').toLowerCase();
    if (this.isRoutePlannerNoWorkPreference(preference)) {
      const employeeId = Number(preference.employeeId);
      const assigned = (this.assignedShifts?.[app.id] || [])
        .map((id: any) => Number(id))
        .filter(Boolean);
      return !!employeeId && assigned.includes(employeeId);
    }

    const customerCode = this.getRoutePlannerAppointmentCustomerCode(app);
    if (scope === 'customer' || scope === 'customerkeyword') {
      const targetCustomerCode = this.extractRoutePlannerCustomerCode(targetKey);
      return !!customerCode && !!targetCustomerCode && customerCode === targetCustomerCode;
    }

    if (scope === 'category') {
      const category = this.normalizeRoutePlannerSearchText(app?.categories || app?.appointment?.categories);
      return category === targetKey || category.includes(targetKey);
    }

    if (scope === 'coworker') return false;

    const classifiedCustomerCodes = this.getRoutePlannerClassifiedCustomerCodesForKeyword(targetKey);
    const customer = this.getAppointmentCustomer(app);
    const haystack = this.normalizeRoutePlannerSearchText([
      app?.title,
      app?.description,
      app?.appointment?.description,
      this.getAppointmentRouteAddress(app, customer),
      ...this.getRoutePlannerCustomerSearchValues(customer),
    ].join(' '));
    const matchesText = haystack.includes(targetKey);
    if (!classifiedCustomerCodes.size) return matchesText;
    if (classifiedCustomerCodes.has(customerCode)) return true;
    return !this.shouldRoutePlannerClassificationsRestrictKeyword(targetKey) && matchesText;
  }

  async generateRoutePlan(): Promise<void> {
    const requestId = ++this.routePlannerRequestId;
    this.routePlannerLoading = true;
    this.routePlannerApplyMessage = '';
    this.routePlannerWarnings = [];
    this.routePlannerLeavesByEmployee = new Map<number, any[]>();

    try {
      let protectedCount = this.getRoutePlannerProtectedAppointments().length;
      let baseStops = this.buildRoutePlannerStops();

      if (!baseStops.length) {
        this.routePlannerTeams = this.createEmptyRouteTeams(1);
        this.routePlannerTeamsCount = 1;
        this.routePlannerRecommendedTeamsCount = 1;
        this.routePlannerAvailableEmployeesCount = 0;
        this.routePlannerMessage = protectedCount
          ? `${protectedCount} lavori gia assegnati lasciati invariati. Nessun lavoro scoperto da generare.`
          : 'Nessun lavoro pianificabile per questa data.';
        return;
      }

      this.routePlannerMessage = 'Calcolo automatico di dipendenti, squadre e distanze...';
      this.routePlannerMatrixSource = '';
      this.routePlannerUnresolvedCount = 0;
      if (protectedCount) {
        this.routePlannerWarnings.push(`${protectedCount} lavori gia assegnati da te lasciati invariati.`);
      }

      let plannerContext = await this.loadRoutePlannerContext(baseStops);
      if (requestId !== this.routePlannerRequestId) return;

      this.routePlannerLeavesByEmployee = plannerContext.leavesByEmployee;
      this.routePlannerLearnedPreferences = plannerContext.planningPreferences || [];
      this.refreshRoutePlannerActivePreferences();
      const noWorkPreferences = this.routePlannerActivePreferences
        .filter((preference) => this.isRoutePlannerNoWorkPreference(preference));
      if (noWorkPreferences.length && this.releaseRoutePlannerProtectionForPreferences(noWorkPreferences) > 0) {
        protectedCount = this.getRoutePlannerProtectedAppointments().length;
        baseStops = this.buildRoutePlannerStops();
        if (!baseStops.length) {
          this.routePlannerTeams = this.createEmptyRouteTeams(1);
          this.routePlannerTeamsCount = 1;
          this.routePlannerRecommendedTeamsCount = 1;
          this.routePlannerAvailableEmployeesCount = 0;
          this.routePlannerMessage = protectedCount
            ? `${protectedCount} lavori gia assegnati lasciati invariati. Nessun lavoro scoperto da generare.`
            : 'Nessun lavoro pianificabile per questa data.';
          return;
        }
        plannerContext = await this.loadRoutePlannerContext(baseStops);
        if (requestId !== this.routePlannerRequestId) return;
        this.routePlannerLeavesByEmployee = plannerContext.leavesByEmployee;
        this.routePlannerLearnedPreferences = plannerContext.planningPreferences || [];
        this.refreshRoutePlannerActivePreferences();
      }
      let stops = this.applyRoutePlannerCustomerContext(baseStops, plannerContext.customerByCode);
      stops = this.applyRoutePlannerStaffContext(stops, plannerContext.staffContextByCustomer);
      const availableEmployees = this.buildRoutePlannerEmployeeStates(plannerContext.leavesByEmployee, true);
      this.routePlannerAvailableEmployeesCount = availableEmployees.length;
      this.routePlannerRecommendedTeamsCount = this.calculateRecommendedTeamsCount(stops, availableEmployees);

      if (this.routePlannerAutoTeams) {
        this.routePlannerTeamsCount = this.routePlannerRecommendedTeamsCount;
      }

      const teamsCount = Math.max(1, Math.min(12, Math.floor(Number(this.routePlannerTeamsCount) || 1)));
      this.routePlannerTeamsCount = teamsCount;

      let resolvedStops = stops;
      let matrix = this.buildLocalRouteMatrix(stops);
      let matrixSource = 'fallback';
      let unresolvedCount = 0;

      this.routePlannerTeams = this.buildRoutePlannerTeams(
        stops,
        matrix,
        this.buildRoutePlannerEmployeeStates(plannerContext.leavesByEmployee, false),
      );
      this.routePlannerMessage = 'Stima provvisoria pronta. Sto completando il calcolo dei giri.';
      await this.yieldRoutePlannerUi();

      try {
        const response = await firstValueFrom(
          this.http.post<RouteMatrixResponse>(this.globalService.url + 'shifts/route-matrix', {
            stops: stops.map((stop) => ({
              id: stop.id,
              address: stop.address,
              lat: stop.lat,
              lng: stop.lng,
            })),
          }),
        );

        resolvedStops = this.applyResolvedRoutePoints(stops, response?.points || []);
        matrix = this.completeRouteMatrix(resolvedStops, response?.matrix || {});
        matrixSource = response?.source || 'automatico';
        unresolvedCount = Number(response?.unresolvedCount) || 0;
      } catch (error) {
        console.warn('Calcolo distanze automatico non disponibile:', error);
        resolvedStops = stops;
        matrix = this.buildLocalRouteMatrix(stops);
        matrixSource = 'fallback';
        unresolvedCount = stops.length;
      }

      if (requestId !== this.routePlannerRequestId) return;
      await this.yieldRoutePlannerUi();

      this.routePlannerTeams = this.buildOptimizedRoutePlannerTeams(
        resolvedStops,
        matrix,
        this.buildRoutePlannerEmployeeStates(plannerContext.leavesByEmployee, false),
      );
      this.routePlannerMatrixSource = matrixSource;
      this.routePlannerUnresolvedCount = unresolvedCount;
      this.routePlannerMessage = this.buildRoutePlannerMessage(matrixSource, unresolvedCount);
    } catch (error) {
      if (requestId !== this.routePlannerRequestId) return;

      console.error('Generazione giri fallita:', error);
      this.routePlannerTeams = this.createEmptyRouteTeams(1);
      this.routePlannerMessage = 'Non sono riuscito a generare i giri. Riprova dopo aver ricaricato la pagina.';
      this.routePlannerWarnings = [
        ...new Set([
          ...this.routePlannerWarnings,
          'Generazione giri interrotta da un errore.',
        ]),
      ];
    } finally {
      if (requestId === this.routePlannerRequestId) {
        this.routePlannerLoading = false;
      }
    }
  }

  private yieldRoutePlannerUi(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  private createEmptyRouteTeams(count: number): RoutePlannerTeam[] {
    return Array.from({ length: count }, (_, index) => ({
      index,
      name: `Squadra ${index + 1}`,
      employees: [],
      employeeNames: '',
      requiredEmployees: 0,
      splitCount: 0,
      warnings: [],
      stops: [],
      totalWorkMinutes: 0,
      totalTravelMinutes: 0,
      totalMinutes: 0,
    }));
  }

  private async loadRoutePlannerContext(stops: RoutePlannerStop[]): Promise<RoutePlannerContext> {
    const date = this.formatDate(this.selectedDate);
    const leavesByEmployee = new Map<number, any[]>();
    const staffContextByCustomer = new Map<string, any>();
    const customerByCode = new Map<string, any>();
    let planningPreferences: RoutePlannerPreference[] = [];

    if (this.canLoadLeavesForRoutePlanner()) {
      try {
        const leaves = await firstValueFrom(
          this.http.get<any[]>(this.globalService.url + `permission/byDate?date=${encodeURIComponent(date)}`),
        );
        for (const leave of leaves || []) {
          const employeeId = Number(leave.employeeId);
          if (!employeeId) continue;
          if (!leavesByEmployee.has(employeeId)) leavesByEmployee.set(employeeId, []);
          leavesByEmployee.get(employeeId)!.push(leave);
        }
      } catch {
        this.routePlannerWarnings.push('Non riesco a leggere ferie e permessi: il piano non li considera.');
      }
    }

    const customerCodes = [
      ...new Set(stops.map((stop) => stop.numeroCliente).filter(Boolean)),
    ];
    await Promise.all(customerCodes.map(async (numeroCliente) => {
      try {
        const context = await firstValueFrom(
          this.http.get<any>(
            this.globalService.url +
              `admin/employee-categories/shift-context/${encodeURIComponent(numeroCliente)}?date=${encodeURIComponent(date)}`,
          ),
        );
        staffContextByCustomer.set(numeroCliente, context || null);
      } catch {
        staffContextByCustomer.set(numeroCliente, null);
      }

      try {
        const customerRows = await firstValueFrom(
          this.http.post<any[]>(
            this.globalService.url + 'customers/getCustomer',
            { numeroCliente },
            { headers: this.globalService.headers },
          ),
        );
        const customer = Array.isArray(customerRows) ? customerRows[0] : customerRows;
        if (customer) customerByCode.set(numeroCliente, customer);
      } catch {}
    }));

    try {
      const preferenceResponse = await firstValueFrom(
        this.http.get<any>(
          this.globalService.url + `shifts/ai/preferences?date=${encodeURIComponent(date)}`,
        ),
      );
      planningPreferences = Array.isArray(preferenceResponse?.preferences)
        ? preferenceResponse.preferences.map((item: any) => this.normalizeRoutePlannerPreference(item)).filter(Boolean) as RoutePlannerPreference[]
        : [];
    } catch {
      planningPreferences = [];
    }

    return { leavesByEmployee, staffContextByCustomer, customerByCode, planningPreferences };
  }

  private canLoadLeavesForRoutePlanner(): boolean {
    return (
      this.globalService.hasTenantFeature('leaveRequests') &&
      (
        this.globalService.hasPermission('EMPLOYEE_PERMITS_MANAGE') ||
        this.globalService.hasPermission('SHIFTS_VIEW')
      )
    );
  }

  private applyRoutePlannerStaffContext(
    stops: RoutePlannerStop[],
    staffContextByCustomer: Map<string, any>,
  ): RoutePlannerStop[] {
    return stops.map((stop) => {
      const context = staffContextByCustomer.get(stop.numeroCliente);
      const staffRequirements: RouteStaffRequirement[] = Array.isArray(context?.requirements)
        ? context.requirements
          .map((item: any) => ({
            categoryId: Number(item.categoryId) || 0,
            categoryName: String(item.categoryName || '').trim(),
            requiredCount: Math.max(0, Math.floor(Number(item.requiredCount) || 0)),
          }))
          .filter((item: RouteStaffRequirement) => item.categoryId && item.requiredCount > 0)
        : [];
      const requiredFromCategories = staffRequirements.reduce((sum, item) => sum + item.requiredCount, 0);

      return {
        ...stop,
        staffContext: context || null,
        staffRequirements,
        requiredEmployees: Math.max(1, requiredFromCategories || stop.requiredEmployees || 1),
      };
    });
  }

  private applyRoutePlannerCustomerContext(
    stops: RoutePlannerStop[],
    customerByCode: Map<string, any>,
  ): RoutePlannerStop[] {
    return stops.map((stop) => {
      const customer = customerByCode.get(stop.numeroCliente) || stop.customer || this.getAppointmentCustomer(stop.appRef);
      if (!customer) return stop;

      const address = this.getAppointmentRouteAddress(stop.appRef, customer);
      const coords = this.getAppointmentRouteCoords(stop.appRef, customer);
      const point = this.buildPseudoMapPoint(`${address}-${stop.title}-${stop.id}`);
      const accessDays = this.getAppointmentAccessDays(stop.appRef, customer);

      return {
        ...stop,
        customer,
        address,
        duration: this.getAppointmentWorkDuration(stop.appRef, customer),
        startDate: this.getRoutePlannerRequestedStart(stop.appRef, customer),
        accessEndDate: this.getRoutePlannerAccessEnd(stop.appRef, customer),
        accessDays,
        assignmentWarnings: this.getRoutePlannerAccessDayWarnings(accessDays),
        mapX: point.x,
        mapY: point.y,
        lat: coords.lat,
        lng: coords.lng,
        coordinateSource: coords.lat !== null && coords.lng !== null ? 'customer' : 'fallback',
      };
    });
  }

  private buildRoutePlannerEmployeeStates(
    leavesByEmployee: Map<number, any[]>,
    recordWarnings = false,
  ): RoutePlannerEmployeeState[] {
    const states: RoutePlannerEmployeeState[] = [];
    const excluded: string[] = [];

    for (const employee of this.employeeList || []) {
      const id = Number(employee?.id);
      if (!id || employee?.active === false) continue;

      const leaves = leavesByEmployee.get(id) || [];
      const fullDayLeave = leaves.find((leave) => String(leave?.tipoPermesso || '').toLowerCase() !== 'parziale');
      const name = this.formatEmployeeName(employee);

      if (this.isRoutePlannerEmployeeDisabledByPreference(id)) {
        excluded.push(`${name} (escluso dalle preferenze AI)`);
        continue;
      }

      if (fullDayLeave) {
        excluded.push(`${name} (${fullDayLeave.categoria || 'assenza'})`);
        continue;
      }

      const capacityMinutes = this.getEmployeeDailyCapacityMinutes(employee);
      if (capacityMinutes <= 0) {
        excluded.push(`${name} (0 ore)`);
        continue;
      }

      states.push({
        employee,
        id,
        name,
        automunito: this.globalService.isEmployeeSelfTransported(employee),
        capacityMinutes,
        loadMinutes: 0,
        intervals: [],
        partialLeaves: leaves
          .filter((leave) => String(leave?.tipoPermesso || '').toLowerCase() === 'parziale')
          .map((leave) => this.buildPartialLeaveInterval(leave))
          .filter(Boolean) as Array<{ start: number; end: number; label: string }>,
      });
    }

    if (recordWarnings && excluded.length) {
      this.routePlannerWarnings.push(`Esclusi dal planner: ${excluded.slice(0, 6).join(', ')}${excluded.length > 6 ? '...' : ''}.`);
    }

    this.seedRoutePlannerEmployeeStatesFromProtectedAssignments(states);
    return states;
  }

  private seedRoutePlannerEmployeeStatesFromProtectedAssignments(states: RoutePlannerEmployeeState[]): void {
    if (!states.length) return;
    const stateById = new Map(states.map((state) => [state.id, state]));

    for (const app of this.getRoutePlannerProtectedAppointments()) {
      const employeeIds = [
        ...new Set((this.assignedShifts[app.id] || []).map((id: any) => Number(id)).filter(Boolean)),
      ];
      if (!employeeIds.length) continue;

      const duration = Math.max(0, Number(app?.duration) || 0);
      const start = app?.startDate instanceof Date && !isNaN(app.startDate.getTime())
        ? app.startDate.getHours() * 60 + app.startDate.getMinutes()
        : null;
      const end = start !== null ? start + duration : null;

      for (const employeeId of employeeIds) {
        const state = stateById.get(employeeId);
        if (!state) continue;
        state.loadMinutes += duration;
        if (start !== null && end !== null && end > start) {
          state.intervals.push({ start, end, stopId: String(app.id) });
        }
      }
    }
  }

  private buildPartialLeaveInterval(leave: any): { start: number; end: number; label: string } | null {
    const start = this.routeTimeToMinutes(leave?.oraInizioModificata || leave?.oraInizio);
    const end = this.routeTimeToMinutes(leave?.oraFineModificata || leave?.oraFine);
    if (!end || end <= start) return null;
    return {
      start,
      end,
      label: leave?.categoria || 'Permesso',
    };
  }

  private getEmployeeDailyCapacityMinutes(employee: any): number {
    const raw = employee?.oreGiornaliereDefault;
    if (raw === null || raw === undefined || raw === '') {
      return 8 * 60;
    }

    const hours = Number(String(raw ?? '').replace(',', '.'));
    if (Number.isFinite(hours) && hours >= 0) {
      return Math.max(0, Math.min(Math.round(hours * 60), 14 * 60));
    }
    return 8 * 60;
  }

  private calculateRecommendedTeamsCount(
    stops: RoutePlannerStop[],
    availableEmployees: RoutePlannerEmployeeState[],
  ): number {
    if (!stops.length) return 1;
    if (!availableEmployees.length) {
      this.routePlannerWarnings.push('Nessun dipendente disponibile: creo una sola squadra vuota.');
      return 1;
    }

    const totalWorkMinutes = stops.reduce((sum, stop) => sum + stop.duration, 0);
    const totalEffortMinutes = stops.reduce(
      (sum, stop) => sum + stop.duration * this.getRouteStopRequiredEmployees(stop),
      0,
    );
    const weightedRequirement = Math.max(1, Math.round(totalEffortMinutes / Math.max(1, totalWorkMinutes)));
    const routeCountByWork = Math.ceil(totalWorkMinutes / (6 * 60));
    const employeesNeeded = Math.ceil(
      totalEffortMinutes /
      Math.max(1, availableEmployees.reduce((sum, item) => sum + item.capacityMinutes, 0) / availableEmployees.length),
    );
    const routeCountByPeople = Math.ceil(employeesNeeded / weightedRequirement);
    const maxTeamsByEmployees = Math.max(1, Math.floor(availableEmployees.length / weightedRequirement));
    const maxTeams = Math.max(1, Math.min(stops.length, availableEmployees.length, maxTeamsByEmployees));
    const recommended = Math.max(routeCountByWork, routeCountByPeople, 1);

    return Math.max(1, Math.min(maxTeams, recommended));
  }

  private buildOptimizedRoutePlannerTeams(
    stops: RoutePlannerStop[],
    matrix: RouteDurationMatrix,
    employeeStates: RoutePlannerEmployeeState[],
  ): RoutePlannerTeam[] {
    const candidateCounts = this.getRoutePlannerCandidateTeamCounts(stops, employeeStates);
    const modes = this.getRoutePlannerOptimizationModes(stops);
    const startedAt = Date.now();
    const budgetMs = stops.length > 30 ? 700 : stops.length > 18 ? 1200 : 2400;
    let best: { teams: RoutePlannerTeam[]; score: number; teamsCount: number; mode: RoutePlannerStopOrderMode } | null = null;

    outer:
    for (const teamsCount of candidateCounts) {
      for (const mode of modes) {
        if (best && Date.now() - startedAt > budgetMs) break outer;
        const candidateStates = this.cloneRoutePlannerEmployeeStates(employeeStates);
        const teams = this.buildRoutePlannerTeams(stops, matrix, candidateStates, {
          teamsCount,
          stopOrderMode: mode,
        });
        const score = this.scoreRoutePlannerPlan(teams);
        if (
          !best ||
          score < best.score ||
          (score === best.score && teamsCount < best.teamsCount)
        ) {
          best = { teams, score, teamsCount, mode };
        }
      }
    }

    if (best) {
      this.routePlannerTeamsCount = best.teamsCount;
      return best.teams;
    }

    return this.buildRoutePlannerTeams(stops, matrix, this.cloneRoutePlannerEmployeeStates(employeeStates));
  }

  private getRoutePlannerOptimizationModes(stops: RoutePlannerStop[]): RoutePlannerStopOrderMode[] {
    const hasActivePreferences = this.routePlannerActivePreferences.some((preference) =>
      Number(preference.employeeId) && Number(preference.weight) > 0,
    );

    if (stops.length > 30) {
      return hasActivePreferences ? ['preference'] : ['timeline'];
    }

    if (stops.length > 18) {
      return hasActivePreferences ? ['preference', 'timeline'] : ['timeline', 'deadline'];
    }

    return hasActivePreferences
      ? ['timeline', 'deadline', 'preference', 'duration']
      : ['timeline', 'deadline', 'duration'];
  }

  private getRoutePlannerCandidateTeamCounts(
    stops: RoutePlannerStop[],
    employeeStates: RoutePlannerEmployeeState[],
  ): number[] {
    const selected = Math.max(1, Math.min(12, Math.floor(Number(this.routePlannerTeamsCount) || 1)));
    if (!this.routePlannerAutoTeams) return [selected];

    const maxByStops = Math.max(1, stops.length);
    const maxByEmployees = Math.max(1, employeeStates.length || 1);
    const max = Math.min(12, maxByStops, maxByEmployees);
    const candidates = new Set<number>([
      selected,
      this.routePlannerRecommendedTeamsCount,
      selected - 1,
      selected + 1,
      selected + 2,
    ]);

    return [...candidates]
      .map((value) => Math.max(1, Math.min(max, Math.floor(Number(value) || 1))))
      .filter((value, index, list) => list.indexOf(value) === index)
      .sort((a, b) => a - b)
      .slice(0, stops.length > 30 ? 2 : stops.length > 18 ? 3 : 5);
  }

  private cloneRoutePlannerEmployeeStates(
    states: RoutePlannerEmployeeState[],
  ): RoutePlannerEmployeeState[] {
    return (states || []).map((state) => ({
      ...state,
      intervals: (state.intervals || []).map((interval) => ({ ...interval })),
      partialLeaves: (state.partialLeaves || []).map((leave) => ({ ...leave })),
    }));
  }

  private scoreRoutePlannerPlan(teams: RoutePlannerTeam[]): number {
    const stops = teams.flatMap((team) => team.stops);
    const employeeTotals = new Map<number, {
      name: string;
      capacityMinutes: number;
      routeMinutes: number;
      intervals: Array<{ start: number; end: number }>;
    }>();
    let score = 0;

    for (const team of teams) {
      if (!team.stops.length) score += 120;
      score += team.totalTravelMinutes * 12;
      score += Math.max(0, team.totalMinutes - this.getRoutePlannerTargetDayMinutes()) * 900;
    }

    for (const stop of stops) {
      const assignedIds = [
        ...new Set((stop.assignedEmployeeIds || []).map((id) => Number(id)).filter(Boolean)),
      ];
      const required = this.getRouteStopRequiredEmployees(stop);
      const start = this.routeTimeToMinutes(stop.plannedStart);
      const end = start + stop.duration;
      const crewSize = Math.max(1, assignedIds.length);
      const routeLoadMinutes = this.getRouteStopEmployeeLoadMinutes(stop, crewSize);

      score += Math.abs(assignedIds.length - required) * 120000;
      if ((stop.assignmentWarnings || []).includes('Giorno non tra quelli di accesso cliente')) score += 90000;
      if ((stop.assignmentWarnings || []).includes("Prima dell'orario di accesso")) score += 40000;
      if ((stop.assignmentWarnings || []).includes('Fuori orario accesso cliente')) score += 80000;
      if ((stop.assignmentWarnings || []).includes('Tratta singola senza dipendente automunito')) score += 20000;
      score += (stop.assignmentWarnings || []).filter((warning) => warning.includes('Manca categoria')).length * 95000;

      for (const employeeId of assignedIds) {
        const employee = this.employeeList.find((item) => Number(item.id) === employeeId);
        const current = employeeTotals.get(employeeId) || {
          name: employee ? this.formatEmployeeName(employee) : `Dipendente ${employeeId}`,
          capacityMinutes: employee ? this.getEmployeeDailyCapacityMinutes(employee) : 8 * 60,
          routeMinutes: 0,
          intervals: [],
        };
        if (current.intervals.some((interval) => start < interval.end && end > interval.start)) {
          score += 150000;
        }
        current.routeMinutes += routeLoadMinutes;
        current.intervals.push({ start, end });
        employeeTotals.set(employeeId, current);
      }

      score += this.scoreRoutePlannerStopPreferences(stop, assignedIds);
    }

    for (const total of employeeTotals.values()) {
      score += Math.max(0, total.routeMinutes - total.capacityMinutes) * 1200;
      score += (total.routeMinutes / Math.max(1, total.capacityMinutes)) * 40;
    }

    const loads = [...employeeTotals.values()].map((item) => item.routeMinutes);
    if (loads.length > 1) {
      const average = loads.reduce((sum, value) => sum + value, 0) / loads.length;
      score += loads.reduce((sum, value) => sum + Math.abs(value - average), 0) * 0.6;
    }

    return Math.round(score);
  }

  private scoreRoutePlannerStopPreferences(stop: RoutePlannerStop, assignedIds: number[]): number {
    if (!this.routePlannerActivePreferences.length) return 0;
    const assignedSet = new Set(assignedIds);
    const selectedStates = assignedIds
      .map((employeeId) => {
        const employee = this.employeeList.find((item) => Number(item.id) === employeeId);
        return employee
          ? {
              employee,
              id: employeeId,
              name: this.formatEmployeeName(employee),
              automunito: this.globalService.isEmployeeSelfTransported(employee),
              capacityMinutes: this.getEmployeeDailyCapacityMinutes(employee),
              loadMinutes: 0,
              intervals: [],
              partialLeaves: [],
            } as RoutePlannerEmployeeState
          : null;
      })
      .filter(Boolean) as RoutePlannerEmployeeState[];

    return this.routePlannerActivePreferences
      .filter((preference) =>
        Number(preference.employeeId) &&
        this.routePlannerPreferenceMatchesStop(preference, stop, selectedStates),
      )
      .reduce((sum, preference) => {
        const employeeId = Number(preference.employeeId);
        const weight = Number(preference.weight) || 0;
        const assigned = assignedSet.has(employeeId);
        if (weight >= 95 && !assigned) return sum + 110000;
        if (weight < 0 && assigned) return sum + Math.abs(weight) * 1200;
        if (weight > 0 && assigned) return sum - weight * 220;
        if (weight > 0 && !assigned) return sum + weight * 160;
        return sum;
      }, 0);
  }

  private buildRoutePlannerTeams(
    stops: RoutePlannerStop[],
    matrix: RouteDurationMatrix,
    employeeStates: RoutePlannerEmployeeState[],
    options: RoutePlannerBuildOptions = {},
  ): RoutePlannerTeam[] {
    const teamsCount = Math.max(1, Math.min(12, Math.floor(Number(options.teamsCount ?? this.routePlannerTeamsCount) || 1)));
    const teams = this.createEmptyRouteTeams(teamsCount);
    const targetDayMinutes = this.getRoutePlannerTargetDayMinutes(employeeStates);
    const clusters = this.balanceRouteStopsAcrossTeams(stops, teamsCount, matrix, employeeStates, options);

    clusters.forEach((cluster, teamIndex) => {
      const team = teams[teamIndex];
      const orderedStops = this.orderClusterStops(cluster, matrix, options.stopOrderMode || 'timeline');

      for (const stop of orderedStops) {
        const previous = team.stops[team.stops.length - 1];
        const travelBefore = previous ? this.getRouteTravelMinutes(matrix, previous, stop) : 0;
        const startMinutes = this.resolveRoutePlannerStartMinutes(team, stop, travelBefore);
        const plannedStop: RoutePlannerStop = {
          ...stop,
          travelBefore,
          plannedStart: this.minutesToRouteTime(startMinutes),
          plannedEnd: this.minutesToRouteTime(startMinutes + stop.duration),
          teamIndex: team.index,
          routeOrder: team.stops.length + 1,
        };
        plannedStop.assignmentWarnings = [
          ...(plannedStop.assignmentWarnings || []),
          ...this.getRoutePlannerAccessWindowWarnings(plannedStop, startMinutes),
        ];

        team.stops.push(plannedStop);
        team.totalWorkMinutes += plannedStop.duration;
        team.totalTravelMinutes += travelBefore;
        team.totalMinutes = (startMinutes + plannedStop.duration) - this.baseRoutePlannerStartMinutes();
      }
    });

    for (const team of teams) {
      team.totalMinutes = team.totalWorkMinutes + team.totalTravelMinutes;
      if (team.stops.length && team.totalMinutes > targetDayMinutes) {
        team.warnings.push(
          `${team.name} supera le ore giornaliere: ${this.formatDuration(team.totalMinutes)} su ${this.formatDuration(targetDayMinutes)}.`,
        );
      }
    }

    this.assignEmployeesToRouteTeams(teams, employeeStates);
    this.resolveRoutePlannerMandatoryTimingConflicts(teams, matrix);
    return teams;
  }

  private resolveRoutePlannerMandatoryTimingConflicts(
    teams: RoutePlannerTeam[],
    matrix: RouteDurationMatrix,
  ): void {
    if (!this.routePlannerTimeResolvedEmployeeIds.size) return;

    const stops = teams.flatMap((team) => team.stops);
    const adjustedStopIds = new Set<string>();

    for (const employeeId of this.routePlannerTimeResolvedEmployeeIds) {
      const employeeName = this.getRoutePlannerEmployeeName(employeeId);
      const assignments = stops
        .filter((stop) =>
          (stop.assignedEmployeeIds || []).map((id) => Number(id)).includes(employeeId) &&
          this.routeStopHasHardEmployee(stop, employeeId),
        )
        .sort((a, b) =>
          this.routeTimeToMinutes(a.plannedStart) - this.routeTimeToMinutes(b.plannedStart) ||
          a.title.localeCompare(b.title, 'it'),
        );

      let previous: RoutePlannerStop | null = null;
      let cursorEnd = 0;
      for (const stop of assignments) {
        let start = this.routeTimeToMinutes(stop.plannedStart);
        const originalStart = start;
        if (previous) {
          const travel = this.getRouteTravelMinutes(matrix, previous, stop);
          start = Math.max(start, cursorEnd + travel);
        }

        const accessStart = this.routeMinutesFromDate(stop.startDate);
        if (accessStart !== null) {
          start = Math.max(start, accessStart);
        }

        if (start !== originalStart) {
          stop.plannedStart = this.minutesToRouteTime(start);
          stop.plannedEnd = this.minutesToRouteTime(start + stop.duration);
          stop.assignmentWarnings = [
            ...new Set([
              ...this.cleanRoutePlannerTimingWarnings(stop.assignmentWarnings || [], employeeName, true),
              ...this.getRoutePlannerAccessWindowWarnings(stop, start),
              `Orario spostato per mantenere ${employeeName} sui lavori obbligatori`,
            ]),
          ];
          adjustedStopIds.add(stop.id);
        } else {
          stop.assignmentWarnings = this.cleanRoutePlannerTimingWarnings(stop.assignmentWarnings || [], employeeName);
        }

        previous = stop;
        cursorEnd = start + stop.duration;
      }
    }

    if (!adjustedStopIds.size) return;
    this.recalculateRoutePlannerTeamTotals(teams);
  }

  private routeStopHasHardEmployee(stop: RoutePlannerStop, employeeId: number): boolean {
    return (stop.lockedEmployeeIds || []).map((id) => Number(id)).includes(employeeId) ||
      this.getMandatoryRoutePreferenceEmployeeIdsForStop(stop).has(employeeId);
  }

  private cleanRoutePlannerTimingWarnings(
    warnings: string[],
    employeeName: string,
    removeAccessWarnings = false,
  ): string[] {
    const normalizedName = this.normalizeRoutePlannerSearchText(employeeName);
    return (warnings || []).filter((warning) => {
      const normalizedWarning = this.normalizeRoutePlannerSearchText(warning);
      if (
        normalizedName &&
        normalizedWarning.includes(normalizedName) &&
        (
          normalizedWarning.includes('gia occupato') ||
          normalizedWarning.includes('occupato in quell orario') ||
          normalizedWarning.includes('orari si sovrappongono')
        )
      ) {
        return false;
      }
      return !removeAccessWarnings ||
        (warning !== "Prima dell'orario di accesso" && warning !== 'Fuori orario accesso cliente');
    });
  }

  private recalculateRoutePlannerTeamTotals(teams: RoutePlannerTeam[]): void {
    for (const team of teams) {
      const ordered = [...team.stops].sort((a, b) => a.routeOrder - b.routeOrder);
      team.totalWorkMinutes = ordered.reduce((sum, stop) => sum + (Number(stop.duration) || 0), 0);
      team.totalTravelMinutes = ordered.reduce((sum, stop) => sum + (Number(stop.travelBefore) || 0), 0);
      const latestEnd = ordered.reduce((max, stop) => {
        const start = this.routeTimeToMinutes(stop.plannedStart);
        return Math.max(max, start + (Number(stop.duration) || 0));
      }, this.baseRoutePlannerStartMinutes());
      team.totalMinutes = Math.max(0, latestEnd - this.baseRoutePlannerStartMinutes());
      team.warnings = [
        ...new Set([
          ...team.stops.flatMap((stop) => stop.assignmentWarnings || []),
        ]),
      ];
    }
  }

  private assignEmployeesToRouteTeams(
    teams: RoutePlannerTeam[],
    employeeStates: RoutePlannerEmployeeState[],
  ): void {
    if (!employeeStates.length) {
      for (const team of teams) {
        team.warnings.push('Nessun dipendente disponibile.');
        for (const stop of team.stops) {
          stop.assignedEmployeeIds = [];
          stop.assignedTo = '';
          stop.assignmentWarnings = ['Nessun dipendente disponibile'];
        }
      }
      return;
    }

    const primaryTeamByEmployee = new Map<number, number>();
    const stateById = new Map(employeeStates.map((state) => [state.id, state]));
    const teamsByNeed = [...teams].sort((a, b) =>
      this.getTeamRequiredEmployees(b) - this.getTeamRequiredEmployees(a) ||
      b.totalWorkMinutes - a.totalWorkMinutes,
    );

    for (const team of teamsByNeed) {
      const required = this.getTeamRequiredEmployees(team);
      const baseCrew: RoutePlannerEmployeeState[] = [];
      while (baseCrew.length < required) {
        const candidate = this.pickBaseCrewEmployee(employeeStates, primaryTeamByEmployee, baseCrew);
        if (!candidate) break;
        baseCrew.push(candidate);
        if (!primaryTeamByEmployee.has(candidate.id)) {
          primaryTeamByEmployee.set(candidate.id, team.index);
        }
      }
      team.employees = baseCrew.map((state) => state.employee);
      team.requiredEmployees = required;
    }

    const orderedStops = teams
      .flatMap((team) => team.stops.map((stop) => ({ team, stop })))
      .sort((a, b) =>
        this.routeTimeToMinutes(a.stop.plannedStart) - this.routeTimeToMinutes(b.stop.plannedStart),
      );

    for (const { team, stop } of orderedStops) {
      const selected = this.selectEmployeesForStop(
        stop,
        team,
        employeeStates,
        stateById,
      );
      const start = this.routeTimeToMinutes(stop.plannedStart);
      const end = start + stop.duration;

      stop.assignedEmployeeIds = selected.map((state) => state.id);
      stop.assignedTo = selected.map((state) => state.name).join(', ');
      stop.hasSplit = team.employees.length > 0 && selected.some((state) =>
        !team.employees.some((employee) => Number(employee.id) === state.id),
      );

      const stopLoadMinutes = this.getRouteStopEmployeeLoadMinutes(stop, selected.length);
      for (const state of selected) {
        state.loadMinutes += stopLoadMinutes;
        state.intervals.push({ start, end, stopId: stop.id });
      }
    }

    for (const team of teams) {
      const employeeIds = [
        ...new Set(team.stops.flatMap((stop) => stop.assignedEmployeeIds || [])),
      ];
      team.employees = employeeIds
        .map((id) => stateById.get(id)?.employee)
        .filter(Boolean);
      team.employeeNames = team.employees
        .map((employee) => this.formatEmployeeName(employee))
        .join(', ');
      team.splitCount = team.stops.filter((stop) =>
        (stop.assignedEmployeeIds || []).length > 0 &&
        (stop.assignedEmployeeIds || []).length < Math.max(1, team.employees.length),
      ).length;
      team.warnings = [
        ...new Set([
          ...team.warnings,
          ...team.stops.flatMap((stop) => stop.assignmentWarnings || []),
        ]),
      ];
    }
  }

  private getTeamRequiredEmployees(team: RoutePlannerTeam): number {
    return Math.max(
      1,
      ...team.stops.map((stop) => this.getRouteStopRequiredEmployees(stop)),
    );
  }

  private getRouteStopRequiredEmployees(stop: RoutePlannerStop): number {
    const configuredCount = Math.max(1, Math.floor(Number(stop.requiredEmployees) || 1));
    const lockedCount = [
      ...new Set((stop.lockedEmployeeIds || []).map((id) => Number(id)).filter(Boolean)),
    ].length;
    const mandatoryCount = this.getMandatoryRoutePreferenceEmployeeIdsForStop(stop).size;
    return Math.max(configuredCount, lockedCount, mandatoryCount);
  }

  private pickBaseCrewEmployee(
    employeeStates: RoutePlannerEmployeeState[],
    primaryTeamByEmployee: Map<number, number>,
    selected: RoutePlannerEmployeeState[],
  ): RoutePlannerEmployeeState | null {
    const selectedIds = new Set(selected.map((state) => state.id));
    return employeeStates
      .filter((state) => !selectedIds.has(state.id))
      .map((state) => ({
        state,
        score:
          (primaryTeamByEmployee.has(state.id) ? 500 : 0) +
          (state.loadMinutes / Math.max(1, state.capacityMinutes)) * 100 -
          (state.automunito ? 5 : 0),
      }))
      .sort((a, b) => a.score - b.score || a.state.name.localeCompare(b.state.name, 'it'))[0]?.state || null;
  }

  private selectEmployeesForStop(
    stop: RoutePlannerStop,
    team: RoutePlannerTeam,
    employeeStates: RoutePlannerEmployeeState[],
    stateById: Map<number, RoutePlannerEmployeeState>,
  ): RoutePlannerEmployeeState[] {
    const warnings: string[] = [...(stop.assignmentWarnings || [])];
    const targetCount = this.getRouteStopRequiredEmployees(stop);
    const lockedEmployeeIds = new Set((stop.lockedEmployeeIds || []).map((id) => Number(id)).filter(Boolean));
    const mandatoryPreferences = this.getMandatoryRoutePreferencesForStop(stop);
    const mandatoryTargetIds = new Set([
      ...lockedEmployeeIds,
      ...mandatoryPreferences.map((preference) => Number(preference.employeeId)).filter(Boolean),
    ]);
    const selected: RoutePlannerEmployeeState[] = this.getLockedRouteEmployeesForStop(
      stop,
      employeeStates,
      stateById,
      warnings,
    ).slice(0, targetCount);
    const mandatoryEmployeeIds = new Set<number>(lockedEmployeeIds);

    for (const preference of mandatoryPreferences) {
      if (selected.length >= targetCount) break;
      const candidate = this.resolveMandatoryRouteEmployee(stop, preference, employeeStates, selected);
      if (candidate.state) {
        selected.push(candidate.state);
        mandatoryEmployeeIds.add(candidate.state.id);
      }
      if (candidate.warning) {
        warnings.push(candidate.warning);
      }
    }

    const missingMandatoryCount = [...mandatoryTargetIds]
      .filter((employeeId) => !selected.some((state) => state.id === employeeId))
      .length;
    const fillLimit = Math.max(selected.length, targetCount - missingMandatoryCount);

    for (const requirement of stop.staffRequirements || []) {
      for (let i = 0; i < requirement.requiredCount; i++) {
        if (selected.length >= fillLimit) break;
        const candidate = this.pickEmployeeForStop(stop, team, employeeStates, selected, requirement.categoryId, true);
        if (candidate) {
          selected.push(candidate);
        } else {
          warnings.push(`Manca categoria ${requirement.categoryName || requirement.categoryId}`);
        }
      }
    }

    while (selected.length < fillLimit) {
      const candidate = this.pickEmployeeForStop(stop, team, employeeStates, selected, null, true);
      if (!candidate) break;
      selected.push(candidate);
    }

    const config = this.globalService.getTenantRoutePlanningConfig();
    if (
      config?.requireSelfTransportForSoloLegs !== false &&
      targetCount === 1 &&
      selected.length === 1 &&
      !selected[0].automunito &&
      !mandatoryEmployeeIds.has(selected[0].id)
    ) {
      const replacement = this.pickEmployeeForStop(stop, team, employeeStates, [], null, true, {
        requireSelfTransport: true,
        avoidIds: new Set(selected.map((state) => state.id)),
      });
      if (replacement) {
        selected.splice(0, 1, replacement);
      } else {
        warnings.push('Tratta singola senza dipendente automunito');
      }
    }

    const capacitySafeSelection = this.enforceRouteCapacityForSelection(stop, selected, warnings, mandatoryEmployeeIds);
    selected.splice(0, selected.length, ...capacitySafeSelection);

    if (selected.length < targetCount) {
      warnings.push(`Servono ${targetCount} dipendenti, assegnati ${selected.length}`);
    }

    const teamEmployeeIds = new Set(team.employees.map((employee) => Number(employee.id)));
    if (selected.some((state) => !teamEmployeeIds.has(state.id))) {
      warnings.push('Richiede aggancio da altra squadra');
    }

    stop.assignmentWarnings = [...new Set(warnings)];
    return selected
      .map((state) => stateById.get(state.id) || state)
      .filter(Boolean);
  }

  private getLockedRouteEmployeesForStop(
    stop: RoutePlannerStop,
    employeeStates: RoutePlannerEmployeeState[],
    stateById: Map<number, RoutePlannerEmployeeState>,
    warnings: string[],
  ): RoutePlannerEmployeeState[] {
    const lockedIds = [
      ...new Set((stop.lockedEmployeeIds || []).map((id) => Number(id)).filter(Boolean)),
    ];
    if (!lockedIds.length) return [];

    const selected: RoutePlannerEmployeeState[] = [];
    const start = this.routeTimeToMinutes(stop.plannedStart);
    const end = start + stop.duration;
    const crewSize = Math.max(this.getRouteStopRequiredEmployees(stop), lockedIds.length);
    const extraLoadMinutes = this.getRouteStopEmployeeLoadMinutes(stop, crewSize);

    for (const employeeId of lockedIds) {
      let state = stateById.get(employeeId) || employeeStates.find((item) => item.id === employeeId) || null;

      if (!state) {
        const employee = this.employeeList.find((item) => Number(item?.id) === employeeId);
        if (!employee) {
          warnings.push(`Dipendente manuale ${employeeId} non trovato`);
          continue;
        }
        state = {
          employee,
          id: employeeId,
          name: this.formatEmployeeName(employee),
          automunito: this.globalService.isEmployeeSelfTransported(employee),
          capacityMinutes: this.getEmployeeDailyCapacityMinutes(employee),
          loadMinutes: 0,
          intervals: [],
          partialLeaves: [],
        };
        stateById.set(employeeId, state);
      }

      if (this.isEmployeeBusyForRouteStop(state, start, end)) {
        warnings.push(`${state.name} gia assegnato manualmente ma occupato in quell'orario`);
      }
      if (this.wouldExceedRouteCapacity(state, extraLoadMinutes)) {
        warnings.push(`${state.name} gia assegnato manualmente supera le ore giornaliere`);
      }

      selected.push(state);
    }

    return selected;
  }

  private getMandatoryRoutePreferencesForStop(stop: RoutePlannerStop): RoutePlannerPreference[] {
    return this.routePlannerActivePreferences
      .filter((preference) =>
        Number(preference.employeeId) &&
        Number(preference.weight) >= 95 &&
        this.routePlannerPreferenceMatchesStop(preference, stop),
      )
      .sort((a, b) =>
        Number(b.weight) - Number(a.weight) ||
        this.getRoutePlannerPreferencePriority(b) - this.getRoutePlannerPreferencePriority(a) ||
        Number(b.evidenceCount || 0) - Number(a.evidenceCount || 0),
      );
  }

  private getMandatoryRoutePreferenceEmployeeIdsForStop(stop: RoutePlannerStop): Set<number> {
    return new Set(
      this.getMandatoryRoutePreferencesForStop(stop)
        .map((preference) => Number(preference.employeeId))
        .filter(Boolean),
    );
  }

  private getRoutePlannerPreferencePriority(preference: RoutePlannerPreference): number {
    const source = String(preference.source || '').toLowerCase();
    if (source.includes('history-replica')) return 4;
    if (source.includes('ai')) return 3;
    if (source.includes('manual')) return 2;
    if (source.includes('learned')) return 1;
    return 0;
  }

  private resolveMandatoryRouteEmployee(
    stop: RoutePlannerStop,
    preference: RoutePlannerPreference,
    employeeStates: RoutePlannerEmployeeState[],
    selected: RoutePlannerEmployeeState[],
  ): { state: RoutePlannerEmployeeState | null; warning: string } {
    const employeeId = Number(preference.employeeId);
    const label = preference.employeeName || `Dipendente ${employeeId}`;
    if (!employeeId) return { state: null, warning: '' };
    if (selected.some((state) => state.id === employeeId)) return { state: null, warning: '' };

    const state = employeeStates.find((item) => item.id === employeeId);
    if (!state) {
      return { state: null, warning: `Vincolo non rispettato: ${label} non disponibile` };
    }

    const start = this.routeTimeToMinutes(stop.plannedStart);
    const end = start + stop.duration;
    if (this.hasPartialLeaveOverlap(state, start, end)) {
      return { state: null, warning: `Vincolo non rispettato: ${label} ha un permesso in quell'orario` };
    }

    const warnings: string[] = [];
    if (state.intervals.some((interval) => start < interval.end && end > interval.start)) {
      warnings.push(`Vincolo forzato: ${label} risulta gia occupato in quell'orario`);
    }
    const expectedCrewSize = Math.max(this.getRouteStopRequiredEmployees(stop), selected.length + 1);
    const extraLoadMinutes = this.getRouteStopEmployeeLoadMinutes(stop, expectedCrewSize);
    if (this.wouldExceedRouteCapacity(state, extraLoadMinutes)) {
      warnings.push(`Vincolo forzato: ${label} supera le ore giornaliere`);
    }

    return { state, warning: warnings.join('. ') };
  }

  private pickEmployeeForStop(
    stop: RoutePlannerStop,
    team: RoutePlannerTeam,
    employeeStates: RoutePlannerEmployeeState[],
    selected: RoutePlannerEmployeeState[],
    requiredCategoryId: number | null,
    strictAvailability: boolean,
    options: { requireSelfTransport?: boolean; avoidIds?: Set<number> } = {},
  ): RoutePlannerEmployeeState | null {
    const selectedIds = new Set(selected.map((state) => state.id));
    const teamEmployeeIds = new Set(team.employees.map((employee) => Number(employee.id)));
    const config = this.globalService.getTenantRoutePlanningConfig();
    const splitPenalty = Number(config?.splitPenaltyMinutes) || 25;
    const start = this.routeTimeToMinutes(stop.plannedStart);
    const end = start + stop.duration;
    const targetCount = this.getRouteStopRequiredEmployees(stop);
    const expectedCrewSize = Math.max(targetCount, selected.length + 1);
    const extraLoadMinutes = this.getRouteStopEmployeeLoadMinutes(stop, expectedCrewSize);

    return employeeStates
      .filter((state) => {
        if (selectedIds.has(state.id) || options.avoidIds?.has(state.id)) return false;
        if (options.requireSelfTransport && !state.automunito) return false;
        if (requiredCategoryId && !this.employeeMatchesRouteCategory(state, stop, requiredCategoryId)) return false;
        if (strictAvailability && this.isEmployeeBusyForRouteStop(state, start, end)) return false;
        if (this.wouldExceedRouteCapacity(state, extraLoadMinutes)) return false;
        return true;
      })
      .map((state) => {
        const outsideTeam = !teamEmployeeIds.has(state.id);
        const partialLeaveOverlap = this.hasPartialLeaveOverlap(state, start, end) ? 300 : 0;
        const preferenceScore = this.getRoutePlannerPreferenceScore(state, stop, selected);
        return {
          state,
          score:
            (outsideTeam ? splitPenalty : 0) +
            partialLeaveOverlap +
            (-preferenceScore * 4) +
            (state.loadMinutes / Math.max(1, state.capacityMinutes)) * 90 +
            (state.automunito ? -4 : 0),
        };
      })
      .sort((a, b) => a.score - b.score || a.state.name.localeCompare(b.state.name, 'it'))[0]?.state || null;
  }

  private getRoutePlannerPreferenceScore(
    state: RoutePlannerEmployeeState,
    stop: RoutePlannerStop,
    selected: RoutePlannerEmployeeState[] = [],
  ): number {
    const employeeId = Number(state.id);
    if (!employeeId || !this.routePlannerActivePreferences.length) return 0;

    return this.routePlannerActivePreferences
      .filter((preference) => Number(preference.employeeId) === employeeId)
      .reduce((score, preference) => {
        return score + (this.routePlannerPreferenceMatchesStop(preference, stop, selected)
          ? Number(preference.weight) || 0
          : 0);
      }, 0);
  }

  private getRouteStopPreferenceStrength(stop: RoutePlannerStop): number {
    if (!this.routePlannerActivePreferences.length) return 0;
    return this.routePlannerActivePreferences
      .filter((preference) =>
        Number(preference.employeeId) &&
        Number(preference.weight) > 0 &&
        this.routePlannerPreferenceMatchesStop(preference, stop),
      )
      .reduce((sum, preference) => sum + Math.abs(Number(preference.weight) || 0), 0);
  }

  private routePlannerPreferenceMatchesStop(
    preference: RoutePlannerPreference,
    stop: RoutePlannerStop,
    selected: RoutePlannerEmployeeState[] = [],
  ): boolean {
    const targetKey = this.normalizeRoutePlannerSearchText(preference.targetKey);
    if (!targetKey) return false;

    const scope = String(preference.scope || 'keyword').toLowerCase();
    if (this.isRoutePlannerNoWorkPreference(preference)) return true;

    const customerCode = this.getRoutePlannerStopCustomerCode(stop);
    if (scope === 'customer') {
      const targetCustomerCode = this.extractRoutePlannerCustomerCode(targetKey);
      return !!customerCode && !!targetCustomerCode && customerCode === targetCustomerCode;
    }

    if (scope === 'category') {
      const category = this.normalizeRoutePlannerSearchText(
        stop.appRef?.categories || stop.appRef?.appointment?.categories,
      );
      return category === targetKey || category.includes(targetKey);
    }

    if (scope === 'coworker') {
      return selected.some((employee) => String(employee.id) === String(preference.targetKey));
    }

    const classifiedCustomerCodes = this.getRoutePlannerClassifiedCustomerCodesForKeyword(targetKey);
    const haystack = this.normalizeRoutePlannerSearchText([
      stop.title,
      stop.address,
      stop.appRef?.description,
      stop.appRef?.appointment?.description,
      ...this.getRoutePlannerCustomerSearchValues(stop.customer),
      ...this.getRoutePlannerCustomerClassificationKeywords(stop),
    ].join(' '));
    const matchesText = haystack.includes(targetKey);
    if (!classifiedCustomerCodes.size) return matchesText;
    if (classifiedCustomerCodes.has(customerCode)) return true;
    return !this.shouldRoutePlannerClassificationsRestrictKeyword(targetKey) && matchesText;
  }

  private getRoutePlannerCustomerSearchValues(customer: Record<string, any> | null): any[] {
    if (!customer) return [];
    const fieldSet = this.globalService.getEffectiveCustomerAddressFields('work');
    const explicitValues = [
      this.globalService.buildCustomerAddress(customer, 'work'),
      this.globalService.buildCustomerAddress(customer, 'billing'),
      this.globalService.getRecordValueByRole('customer', customer, 'customerAddress'),
      this.globalService.getRecordValueByRole('customer', customer, 'customerZip'),
      this.globalService.getRecordValueByRole('customer', customer, 'customerCity'),
      this.globalService.getRecordValueByRole('customer', customer, 'customerProvince'),
      this.globalService.getRecordValueByRole('customer', customer, 'customerCountry'),
      customer[fieldSet.address || ''],
      customer[fieldSet.zip || ''],
      customer[fieldSet.city || ''],
      customer[fieldSet.province || ''],
      customer[fieldSet.country || ''],
      customer['indirizzo'],
      customer['indirizzoLavoro'],
      customer['workAddress'],
      customer['address'],
      customer['via'],
      customer['citta'],
      customer['city'],
      customer['comune'],
      customer['localita'],
      customer['provincia'],
      customer['province'],
      customer['descrizione'],
      customer['descrizioneImmobile'],
      customer['description'],
      customer['tipologia'],
      customer['tipoCliente'],
      customer['tipoLuogo'],
      customer['luogo'],
      customer['servizi'],
    ];

    return [
      ...explicitValues,
      ...this.collectRoutePlannerCustomerSearchValues(customer),
    ].filter((value, index, list) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() &&
      list.findIndex((candidate) => String(candidate || '').trim() === String(value || '').trim()) === index,
    );
  }

  private collectRoutePlannerCustomerSearchValues(value: any, depth = 0): any[] {
    if (value === null || value === undefined || depth > 2) return [];
    if (typeof value !== 'object') {
      return String(value || '').trim() ? [value] : [];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.collectRoutePlannerCustomerSearchValues(item, depth + 1));
    }

    const searchableKeyFragments = [
      'indirizzo',
      'address',
      'via',
      'strada',
      'citta',
      'city',
      'comune',
      'localita',
      'cap',
      'zip',
      'provincia',
      'province',
      'paese',
      'country',
      'immobile',
      'descrizione',
      'description',
      'tipocliente',
      'tipoluogo',
      'tipologia',
      'luogo',
      'servizi',
      'zona',
      'quartiere',
    ];

    return Object.entries(value).flatMap(([key, item]) => {
      const normalizedKey = this.normalizeRoutePlannerSearchText(key);
      const keyIsSearchable = searchableKeyFragments.some((fragment) => normalizedKey.includes(fragment));
      if (!keyIsSearchable && (item === null || typeof item !== 'object')) return [];
      if (keyIsSearchable && (item === null || typeof item !== 'object')) {
        return String(item || '').trim() ? [item] : [];
      }
      return this.collectRoutePlannerCustomerSearchValues(item, depth + 1);
    });
  }

  private getRoutePlannerCustomerClassificationKeywords(stop: RoutePlannerStop): string[] {
    const customerCode = this.getRoutePlannerStopCustomerCode(stop);
    if (!customerCode) return [];
    return this.routePlannerActivePreferences
      .filter((preference) =>
        this.isRoutePlannerCustomerClassification(preference) &&
        Number(preference.weight) > 0 &&
        this.extractRoutePlannerCustomerCode(preference.targetKey) === customerCode,
      )
      .map((preference) => String(preference.targetLabel || preference.targetKey || '').trim())
      .filter(Boolean);
  }

  private getRoutePlannerAppointmentCustomerCode(app: any): string {
    return [
      this.getAppointmentNumeroCliente(app),
      app?.title,
      app?.appointment?.title,
    ]
      .map((value) => this.extractRoutePlannerCustomerCode(value))
      .find((value) => /^\d+$/.test(value)) || '';
  }

  private getRoutePlannerStopCustomerCode(stop: RoutePlannerStop): string {
    return [
      stop?.numeroCliente,
      stop?.title,
      stop?.appRef ? this.getAppointmentNumeroCliente(stop.appRef) : '',
      stop?.appRef?.title,
      stop?.appRef?.appointment?.title,
    ]
      .map((value) => this.extractRoutePlannerCustomerCode(value))
      .find((value) => /^\d+$/.test(value)) || '';
  }

  private getRoutePlannerClassifiedCustomerCodesForKeyword(keyword: string): Set<string> {
    const normalizedKeyword = this.normalizeRoutePlannerSearchText(keyword);
    if (!normalizedKeyword) return new Set();

    return new Set(
      this.routePlannerActivePreferences
        .filter((preference) =>
          this.isRoutePlannerCustomerClassification(preference) &&
          Number(preference.weight) > 0 &&
          this.routePlannerClassificationLabelMatchesKeyword(preference, normalizedKeyword),
        )
        .map((preference) => this.extractRoutePlannerCustomerCode(preference.targetKey))
        .filter(Boolean),
    );
  }

  private shouldRoutePlannerClassificationsRestrictKeyword(keyword: string): boolean {
    const normalizedKeyword = this.normalizeRoutePlannerSearchText(keyword);
    const controlledWorkTypes = new Set([
      'condominio',
      'condomini',
      'ufficio',
      'uffici',
      'bar',
      'ristorante',
      'panificio',
      'panifici',
      'negozio',
      'scale',
      'vetri',
      'industriale',
      'studio',
      'palestra',
      'scuola',
      'albergo',
      'alberghi',
      'hotel',
      'pastificio',
      'pastifici',
      'comune',
      'biblioteca',
      'mediateca',
    ]);
    return controlledWorkTypes.has(normalizedKeyword);
  }

  private routePlannerClassificationLabelMatchesKeyword(
    preference: RoutePlannerPreference,
    normalizedKeyword: string,
  ): boolean {
    const label = this.normalizeRoutePlannerSearchText(preference.targetLabel || '');
    if (!label || !normalizedKeyword) return false;
    if (label === normalizedKeyword) return true;
    if (label.includes(normalizedKeyword) || normalizedKeyword.includes(label)) return true;

    const labelTokens = new Set(label.split(' ').filter((token) => token.length >= 4));
    return normalizedKeyword
      .split(' ')
      .filter((token) => token.length >= 4)
      .some((token) => labelTokens.has(token));
  }

  private normalizeRoutePlannerSearchText(value: any): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractRoutePlannerCustomerCode(value: any): string {
    const normalized = this.normalizeRoutePlannerSearchText(value);
    const match = /^(\d+)/.exec(normalized);
    return match ? match[1] : normalized;
  }

  private enforceRouteCapacityForSelection(
    stop: RoutePlannerStop,
    selected: RoutePlannerEmployeeState[],
    warnings: string[],
    lockedEmployeeIds: Set<number> = new Set(),
  ): RoutePlannerEmployeeState[] {
    const remaining = [...selected];
    let changed = true;

    while (changed) {
      changed = false;
      const crewSize = Math.max(1, remaining.length);
      const extraLoadMinutes = this.getRouteStopEmployeeLoadMinutes(stop, crewSize);
      const overloaded = remaining.find((state) =>
        !lockedEmployeeIds.has(state.id) &&
        this.wouldExceedRouteCapacity(state, extraLoadMinutes),
      );

      if (overloaded) {
        warnings.push(`${overloaded.name} supera le ore giornaliere`);
        remaining.splice(remaining.indexOf(overloaded), 1);
        changed = true;
      }
    }

    return remaining;
  }

  private getRouteStopEmployeeLoadMinutes(stop: RoutePlannerStop, crewSize: number): number {
    const normalizedCrewSize = Math.max(1, Math.floor(Number(crewSize) || 1));
    return stop.duration + Math.round((Number(stop.travelBefore) || 0) / normalizedCrewSize);
  }

  private wouldExceedRouteCapacity(
    state: RoutePlannerEmployeeState,
    extraLoadMinutes: number,
  ): boolean {
    return state.loadMinutes + extraLoadMinutes > state.capacityMinutes;
  }

  private employeeMatchesRouteCategory(
    state: RoutePlannerEmployeeState,
    stop: RoutePlannerStop,
    categoryId: number,
  ): boolean {
    if (!categoryId) return true;
    const context = (stop as any).staffContext;
    const status = context?.employeeCategoryStatus?.[state.id]?.[categoryId];
    return status?.valid === true;
  }

  private isEmployeeBusyForRouteStop(
    state: RoutePlannerEmployeeState,
    start: number,
    end: number,
  ): boolean {
    return state.intervals.some((interval) => start < interval.end && end > interval.start) ||
      this.hasPartialLeaveOverlap(state, start, end);
  }

  private hasPartialLeaveOverlap(
    state: RoutePlannerEmployeeState,
    start: number,
    end: number,
  ): boolean {
    return state.partialLeaves.some((leave) => start < leave.end && end > leave.start);
  }

  private formatEmployeeName(employee: any): string {
    return `${employee?.nome || ''} ${employee?.cognome || ''}`.trim() ||
      employee?.email ||
      `Dipendente ${employee?.id || ''}`.trim();
  }

  routeTeamColor(index: number): string {
    const colors = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#be123c'];
    return colors[index % colors.length];
  }

  routePolylinePoints(team: RoutePlannerTeam): string {
    return this.routePolylinePointsFromStops(team.stops);
  }

  private routePolylinePointsFromStops(stops: RoutePlannerStop[]): string {
    return stops
      .map((stop) => `${Math.max(0, Math.min(100, stop.mapX))},${Math.max(0, Math.min(100, stop.mapY))}`)
      .join(' ');
  }

  routeMarkerTitle(stop: RoutePlannerStop): string {
    return `${this.routeStopSequenceLabel(stop)}. ${stop.title} - ${stop.plannedStart}/${stop.plannedEnd}`;
  }

  routeStopSequenceLabel(stop: RoutePlannerStop): string {
    return stop.routeOrder ? `${stop.teamIndex + 1}.${stop.routeOrder}` : stop.label;
  }

  routeStopRequirementLabel(stop: RoutePlannerStop): string {
    const requirements = (stop.staffRequirements || [])
      .filter((item) => item.requiredCount > 0)
      .map((item) => `${item.requiredCount} ${item.categoryName || 'operatore'}`);
    if (requirements.length) return requirements.join(', ');
    const required = this.getRouteStopRequiredEmployees(stop);
    return `${required} operator${required === 1 ? 'e' : 'i'} richiesto${required === 1 ? '' : 'i'}`;
  }

  routeStopAssignedEmployees(stop: RoutePlannerStop): string[] {
    return String(stop.assignedTo || '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
  }

  routeStopDisplayWarnings(stop: RoutePlannerStop): string[] {
    return (stop.assignmentWarnings || [])
      .filter((warning) => warning !== 'Richiede aggancio da altra squadra');
  }

  routeTeamEmployeeSummaries(team: RoutePlannerTeam): RouteTeamEmployeeSummary[] {
    const summaries = new Map<number, RouteTeamEmployeeSummary>();
    for (const stop of team.stops) {
      const employeeIds = [...new Set((stop.assignedEmployeeIds || []).map((id) => Number(id)).filter(Boolean))];
      for (const employeeId of employeeIds) {
        const employee =
          team.employees.find((item) => Number(item?.id) === employeeId) ||
          this.employeeList.find((item) => Number(item?.id) === employeeId);
        const current = summaries.get(employeeId) || {
          id: employeeId,
          name: employee ? this.formatEmployeeName(employee) : `Dipendente ${employeeId}`,
          workMinutes: 0,
          stopsCount: 0,
        };
        current.workMinutes += Number(stop.duration) || 0;
        current.stopsCount += 1;
        summaries.set(employeeId, current);
      }
    }
    return [...summaries.values()];
  }

  routeStopFlowLabel(team: RoutePlannerTeam, stop: RoutePlannerStop, index: number): string {
    const type = this.getRouteStopFlowType(team, stop, index);
    const labels: Record<string, string> = {
      start: 'Inizio giro',
      same: 'Prosegue',
      split: 'Si dividono',
      merge: 'Si ricongiungono',
      partial: 'Cambio parziale',
      handoff: 'Cambio operatore',
      external: 'Aggancio esterno',
    };
    return labels[type] || 'Cambio operatore';
  }

  routeStopFlowIcon(team: RoutePlannerTeam, stop: RoutePlannerStop, index: number): string {
    const type = this.getRouteStopFlowType(team, stop, index);
    const icons: Record<string, string> = {
      start: 'fa-play',
      same: 'fa-arrow-down',
      split: 'fa-code-branch',
      merge: 'fa-compress-arrows-alt',
      partial: 'fa-random',
      handoff: 'fa-exchange-alt',
      external: 'fa-link',
    };
    return icons[type] || 'fa-exchange-alt';
  }

  routeStopFlowClass(team: RoutePlannerTeam, stop: RoutePlannerStop, index: number): string {
    return `route-stop-flow--${this.getRouteStopFlowType(team, stop, index)}`;
  }

  routeTeamCrewLabel(team: RoutePlannerTeam): string {
    const requirements = team.stops
      .map((stop) => this.getRouteStopRequiredEmployees(stop))
      .filter((value) => value > 0);
    if (!requirements.length) return 'Nessun lavoro assegnato';
    const min = Math.min(...requirements);
    const max = Math.max(...requirements);
    return min === max
      ? `Squadra da ${max} operator${max === 1 ? 'e' : 'i'}`
      : `Giro misto: lavori da ${min} a ${max} operatori`;
  }

  private buildRoutePlannerStops(): RoutePlannerStop[] {
    return this.appointments
      .filter((app) => app?.title || app?.description)
      .filter((app) => !this.isAppointmentProtectedFromRoutePlanner(app))
      .map((app, index) => {
        const title = String(app.title || `Lavoro ${index + 1}`).trim();
        const address = this.getAppointmentRouteAddress(app);
        const coords = this.getAppointmentRouteCoords(app);
        const point = this.buildPseudoMapPoint(`${address}-${title}-${app.id || index}`);
        const numeroCliente = this.getAppointmentNumeroCliente(app);
        const customer = this.getAppointmentCustomer(app);
        const accessDays = this.getAppointmentAccessDays(app, customer);
        const lockedEmployeeIds = this.getRoutePlannerManualEmployeeIds(app);

        return {
          id: String(app.id || index),
          appRef: app,
          customer,
          title,
          label: String(index + 1),
          address,
          numeroCliente,
          duration: this.getAppointmentWorkDuration(app, customer),
          requiredEmployees: this.getAppointmentRequiredEmployees(app),
          staffRequirements: [],
          startDate: this.getRoutePlannerRequestedStart(app, customer),
          accessEndDate: this.getRoutePlannerAccessEnd(app, customer),
          accessDays,
          plannedStart: '--:--',
          plannedEnd: '--:--',
          travelBefore: 0,
          mapX: point.x,
          mapY: point.y,
          lat: coords.lat,
          lng: coords.lng,
          coordinateSource: coords.lat !== null && coords.lng !== null ? 'customer' : 'fallback',
          teamIndex: 0,
          routeOrder: 0,
          assignedTo: this.getAssignedEmployeeNames(app),
          assignedEmployeeIds: lockedEmployeeIds,
          lockedEmployeeIds,
          assignmentWarnings: this.getRoutePlannerAccessDayWarnings(accessDays),
          hasSplit: false,
        };
      });
  }

  private getRoutePlannerRequestedStart(app: any, customer: Record<string, any> | null = null): Date | null {
    const explicitTime = [
      app?.routeEarliestStart,
      app?.accessStart,
      app?.accessWindowStart,
      app?.orarioAccessoDa,
      app?.oraAccessoDa,
      app?.workWindowStart,
      ...this.getRoutePlannerWeekdayAccessValues(customer, 'start'),
      this.globalService.getRecordValueByRole('customer', customer || {}, 'customerAccessStart'),
      customer?.['orarioAccessoDa'],
      customer?.['accessStart'],
      customer?.['accessWindowStart'],
    ]
      .map((value) => String(value || '').trim())
      .find(Boolean);

    if (!explicitTime) {
      return null;
    }

    const parsed = this.combineLocalDateAndTime(
      this.formatDate(this.selectedDate),
      explicitTime.length === 5 ? explicitTime : this.minutesToRouteTime(this.routeTimeToMinutes(explicitTime)),
    );

    return parsed && !isNaN(parsed.getTime()) ? parsed : null;
  }

  private getRoutePlannerAccessEnd(app: any, customer: Record<string, any> | null = null): Date | null {
    const explicitTime = [
      app?.routeLatestEnd,
      app?.accessEnd,
      app?.accessWindowEnd,
      app?.orarioAccessoA,
      app?.oraAccessoA,
      app?.workWindowEnd,
      ...this.getRoutePlannerWeekdayAccessValues(customer, 'end'),
      this.globalService.getRecordValueByRole('customer', customer || {}, 'customerAccessEnd'),
      customer?.['orarioAccessoA'],
      customer?.['accessEnd'],
      customer?.['accessWindowEnd'],
    ]
      .map((value) => String(value || '').trim())
      .find(Boolean);

    if (!explicitTime) {
      return null;
    }

    const parsed = this.combineLocalDateAndTime(
      this.formatDate(this.selectedDate),
      explicitTime.length === 5 ? explicitTime : this.minutesToRouteTime(this.routeTimeToMinutes(explicitTime)),
    );

    return parsed && !isNaN(parsed.getTime()) ? parsed : null;
  }

  private getAppointmentWorkDuration(app: any, customer: Record<string, any> | null = null): number {
    const configuredDuration = [
      this.parseRouteCustomerWorkDurationMinutes(
        this.globalService.getRecordValueByRole('customer', customer || {}, 'customerWorkDurationMinutes'),
      ),
      this.parseRouteCustomerWorkDurationMinutes(customer?.['durataLavoroMinuti']),
      this.parseRouteCustomerWorkDurationMinutes(customer?.['durataLavoro']),
      this.parseRouteCustomerWorkDurationMinutes(customer?.['durataIntervento']),
      this.parseRouteCustomerWorkDurationMinutes(customer?.['durataStandard']),
      app?.workDurationMinutes,
      app?.durataLavoroMinuti,
    ]
      .map((value) => typeof value === 'number' ? value : this.parseRouteDurationMinutes(value))
      .find((value) => value > 0);
    const appointmentDuration = this.parseRouteDurationMinutes(app?.duration);
    return Math.max(15, configuredDuration || appointmentDuration || 60);
  }

  private parseRouteDurationMinutes(value: any): number {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;
    const raw = String(value || '').trim();
    if (!raw) return 0;

    const timeMatch = /^(\d{1,2})[:.](\d{2})$/.exec(raw);
    if (timeMatch) {
      return Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
    }

    const normalized = raw.replace(',', '.');
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return 0;
    return Math.round(parsed);
  }

  private parseRouteCustomerWorkDurationMinutes(value: any): number {
    if (value === null || value === undefined || value === '') return 0;
    const raw = String(value || '').trim();
    const timeMatch = /^(\d{1,2})[:.](\d{2})$/.exec(raw);
    if (timeMatch) {
      return Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
    }
    const parsed = Number(raw.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return parsed <= 24 ? Math.round(parsed * 60) : Math.round(parsed);
  }

  private getAppointmentAccessDays(app: any, customer: Record<string, any> | null = null): string[] {
    const rawValue = this.globalService.getRecordValueByRole('customer', customer || {}, 'customerAccessDays') ??
      customer?.['giorniAccesso'] ??
      customer?.['accessDays'] ??
      app?.accessDays;
    if (!rawValue) {
      return this.getConfiguredWeekdayAccessDays(customer);
    }
    let values = Array.isArray(rawValue)
      ? rawValue
      : String(rawValue || '').split(/[;,|]/);
    if (!Array.isArray(rawValue) && String(rawValue || '').trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(String(rawValue || ''));
        if (Array.isArray(parsed)) values = parsed;
      } catch {}
    }
    return values
      .map((value) => this.normalizeWeekdayName(value))
      .filter(Boolean);
  }

  private getRoutePlannerAccessDayWarnings(accessDays: string[]): string[] {
    if (!accessDays.length) return [];
    const selectedDay = this.normalizeWeekdayName(
      this.selectedDate.toLocaleDateString('it-IT', { weekday: 'long' }),
    );
    return selectedDay && !accessDays.includes(selectedDay)
      ? ['Giorno non tra quelli di accesso cliente']
      : [];
  }

  private normalizeWeekdayName(value: any): string {
    const normalized = String(value || '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const aliases: Record<string, string> = {
      lun: 'lunedi',
      lunedi: 'lunedi',
      monday: 'lunedi',
      mon: 'lunedi',
      mar: 'martedi',
      martedi: 'martedi',
      tuesday: 'martedi',
      tue: 'martedi',
      mer: 'mercoledi',
      mercoledi: 'mercoledi',
      wednesday: 'mercoledi',
      wed: 'mercoledi',
      gio: 'giovedi',
      giovedi: 'giovedi',
      thursday: 'giovedi',
      thu: 'giovedi',
      ven: 'venerdi',
      venerdi: 'venerdi',
      friday: 'venerdi',
      fri: 'venerdi',
      sab: 'sabato',
      sabato: 'sabato',
      saturday: 'sabato',
      sat: 'sabato',
      dom: 'domenica',
      domenica: 'domenica',
      sunday: 'domenica',
      sun: 'domenica',
    };
    return aliases[normalized] || '';
  }

  private getRoutePlannerWeekdayAccessValues(
    customer: Record<string, any> | null,
    mode: 'start' | 'end',
  ): any[] {
    if (!customer) return [];
    const day = this.getSelectedRouteWeekdayConfig();
    if (!day) return [];
    const suffix = mode === 'start' ? 'Da' : 'A';
    const englishSuffix = mode === 'start' ? 'Start' : 'End';
    return this.readCustomerValuesByKeys(customer, [
      `accesso${day.it}${suffix}`,
      `${day.normalized}Accesso${suffix}`,
      `${day.normalized}Access${englishSuffix}`,
      `access${day.en}${englishSuffix}`,
    ]);
  }

  private getConfiguredWeekdayAccessDays(customer: Record<string, any> | null): string[] {
    if (!customer) return [];
    return this.routeWeekdayConfigs()
      .filter((day) => this.readCustomerValuesByKeys(customer, [
        `accesso${day.it}Da`,
        `accesso${day.it}A`,
        `${day.normalized}AccessoDa`,
        `${day.normalized}AccessoA`,
        `${day.normalized}AccessStart`,
        `${day.normalized}AccessEnd`,
        `access${day.en}Start`,
        `access${day.en}End`,
      ]).some((value) => String(value || '').trim()))
      .map((day) => day.normalized);
  }

  private getSelectedRouteWeekdayConfig(): { normalized: string; it: string; en: string } | null {
    const selected = this.normalizeWeekdayName(
      this.selectedDate.toLocaleDateString('it-IT', { weekday: 'long' }),
    );
    return this.routeWeekdayConfigs().find((day) => day.normalized === selected) || null;
  }

  private routeWeekdayConfigs(): Array<{ normalized: string; it: string; en: string }> {
    return [
      { normalized: 'lunedi', it: 'Lunedi', en: 'Monday' },
      { normalized: 'martedi', it: 'Martedi', en: 'Tuesday' },
      { normalized: 'mercoledi', it: 'Mercoledi', en: 'Wednesday' },
      { normalized: 'giovedi', it: 'Giovedi', en: 'Thursday' },
      { normalized: 'venerdi', it: 'Venerdi', en: 'Friday' },
      { normalized: 'sabato', it: 'Sabato', en: 'Saturday' },
      { normalized: 'domenica', it: 'Domenica', en: 'Sunday' },
    ];
  }

  private readCustomerValuesByKeys(customer: Record<string, any>, keys: string[]): any[] {
    const lookup = new Map(
      Object.keys(customer || {}).map((key) => [key.toLowerCase(), key]),
    );
    return keys.map((key) => {
      const direct = customer[key];
      if (direct !== undefined && direct !== null && direct !== '') return direct;
      const actualKey = lookup.get(key.toLowerCase());
      return actualKey ? customer[actualKey] : undefined;
    });
  }

  private getRoutePlannerAccessWindowWarnings(stop: RoutePlannerStop, startMinutes: number): string[] {
    const warnings: string[] = [];
    const accessStart = this.routeMinutesFromDate(stop.startDate);
    const accessEnd = this.routeMinutesFromDate(stop.accessEndDate);
    if (accessStart !== null && startMinutes < accessStart) {
      warnings.push("Prima dell'orario di accesso");
    }
    if (accessEnd !== null && startMinutes + stop.duration > accessEnd) {
      warnings.push('Fuori orario accesso cliente');
    }
    return warnings;
  }

  private clusterRouteStops(stops: RoutePlannerStop[], teamsCount: number): RoutePlannerStop[][] {
    const center = { x: 50, y: 50 };
    const sorted = [...stops].sort((a, b) => {
      const angleA = Math.atan2(a.mapY - center.y, a.mapX - center.x);
      const angleB = Math.atan2(b.mapY - center.y, b.mapX - center.x);
      return angleA - angleB;
    });

    const totalWork = sorted.reduce((sum, stop) => sum + stop.duration, 0);
    const targetWork = Math.max(1, totalWork / Math.max(1, teamsCount));
    const clusters: RoutePlannerStop[][] = [];
    let current: RoutePlannerStop[] = [];
    let currentWork = 0;

    for (const stop of sorted) {
      if (clusters.length < teamsCount - 1 && current.length && currentWork >= targetWork) {
        clusters.push(current);
        current = [];
        currentWork = 0;
      }
      current.push(stop);
      currentWork += stop.duration;
    }

    clusters.push(current);
    while (clusters.length < teamsCount) clusters.push([]);
    return clusters.slice(0, teamsCount);
  }

  private orderClusterStops(
    stops: RoutePlannerStop[],
    matrix: RouteDurationMatrix,
    mode: RoutePlannerStopOrderMode = 'timeline',
  ): RoutePlannerStop[] {
    const remaining = [...stops];
    const ordered: RoutePlannerStop[] = [];
    let previous: RoutePlannerStop | null = null;
    let currentMinutes = this.baseRoutePlannerStartMinutes();

    while (remaining.length) {
      const nextIndex = remaining
        .map((candidate, index) => ({
          index,
          score: this.routeCandidateTimelineScore(previous, currentMinutes, candidate, matrix, mode),
        }))
        .sort((a, b) => a.score - b.score)[0].index;
      const next = remaining.splice(nextIndex, 1)[0];
      const travelBefore = previous ? this.getRouteTravelMinutes(matrix, previous, next) : 0;
      const startMinutes = this.estimateRoutePlannerStartMinutes(
        currentMinutes,
        next,
        travelBefore,
        !previous,
      );
      ordered.push(next);
      previous = next;
      currentMinutes = startMinutes + next.duration;
    }

    return ordered;
  }

  private routeCandidateTimelineScore(
    previous: RoutePlannerStop | null,
    currentMinutes: number,
    candidate: RoutePlannerStop,
    matrix: RouteDurationMatrix,
    mode: RoutePlannerStopOrderMode = 'timeline',
  ): number {
    const travelBefore = previous ? this.getRouteTravelMinutes(matrix, previous, candidate) : 0;
    const startMinutes = this.estimateRoutePlannerStartMinutes(
      currentMinutes,
      candidate,
      travelBefore,
      !previous,
    );
    const arrivalMinutes = previous ? currentMinutes + travelBefore : this.baseRoutePlannerStartMinutes();
    const waitMinutes = Math.max(0, startMinutes - arrivalMinutes);
    const accessStart = this.routeMinutesFromDate(candidate.startDate);
    const latestStart = this.getRoutePlannerLatestStartMinutes(candidate);
    const windowPenalty = this.getRoutePlannerWindowPenalty(candidate, startMinutes, arrivalMinutes);
    const urgencyScore = latestStart === null ? 24 * 60 : latestStart;
    const timeScore = accessStart === null ? startMinutes : accessStart;

    const latestStartBonus = latestStart === null ? 0 : -Math.max(0, (24 * 60) - latestStart);
    const preferenceBonus = -this.getRouteStopPreferenceStrength(candidate) * 12;
    const durationBonus = -Math.max(0, Number(candidate.duration) || 0) * 2;

    if (!previous) {
      const centerDistance = Math.hypot(candidate.mapX - 50, candidate.mapY - 50);
      const baseScore = windowPenalty + centerDistance * 6 + waitMinutes * 2 + urgencyScore / 3 + timeScore / 12;
      return baseScore +
        (mode === 'deadline' ? latestStartBonus * 2 : 0) +
        (mode === 'preference' ? preferenceBonus : 0) +
        (mode === 'duration' ? durationBonus : 0);
    }

    const baseScore = windowPenalty + travelBefore * 8 + waitMinutes * 2 + urgencyScore / 3 + timeScore / 12;
    return baseScore +
      (mode === 'deadline' ? latestStartBonus * 2 : 0) +
      (mode === 'preference' ? preferenceBonus : 0) +
      (mode === 'duration' ? durationBonus : 0);
  }

  private getRouteTravelMinutes(
    matrix: RouteDurationMatrix,
    from: RoutePlannerStop,
    to: RoutePlannerStop,
  ): number {
    const value = matrix?.[from.id]?.[to.id];
    if (Number.isFinite(value)) return Math.max(0, Math.round(Number(value)));
    return this.estimateTravelMinutesFromMap(from, to);
  }

  private estimateTravelMinutesFromMap(from: RoutePlannerStop, to: RoutePlannerStop): number {
    const distance = Math.hypot(from.mapX - to.mapX, from.mapY - to.mapY);
    return Math.max(3, Math.round(distance / 2.6));
  }

  private buildLocalRouteMatrix(stops: RoutePlannerStop[]): RouteDurationMatrix {
    const matrix: RouteDurationMatrix = {};
    for (const from of stops) {
      matrix[from.id] = {};
      for (const to of stops) {
        matrix[from.id][to.id] = from.id === to.id
          ? 0
          : this.estimateTravelMinutesFromMap(from, to);
      }
    }
    return matrix;
  }

  private completeRouteMatrix(
    stops: RoutePlannerStop[],
    matrix: RouteDurationMatrix,
  ): RouteDurationMatrix {
    const local = this.buildLocalRouteMatrix(stops);
    const completed: RouteDurationMatrix = {};
    for (const from of stops) {
      completed[from.id] = {};
      for (const to of stops) {
        completed[from.id][to.id] =
          matrix?.[from.id]?.[to.id] ??
          local[from.id]?.[to.id] ??
          null;
      }
    }
    return completed;
  }

  private applyResolvedRoutePoints(
    stops: RoutePlannerStop[],
    points: RouteMatrixResponse['points'],
  ): RoutePlannerStop[] {
    const pointById = new Map((points || []).map((point) => [String(point.id), point]));
    const merged = stops.map((stop) => {
      const point = pointById.get(stop.id);
      const lat = this.toNullableNumber(point?.lat) ?? stop.lat;
      const lng = this.toNullableNumber(point?.lng) ?? stop.lng;
      return {
        ...stop,
        lat,
        lng,
        coordinateSource: lat !== null && lng !== null
          ? String(point?.source || stop.coordinateSource || 'geocoded')
          : 'fallback',
      };
    });
    return this.normalizeRouteMapPoints(merged);
  }

  private normalizeRouteMapPoints(stops: RoutePlannerStop[]): RoutePlannerStop[] {
    const withCoords = stops.filter((stop) => stop.lat !== null && stop.lng !== null);
    if (withCoords.length < 2) return stops;

    const lats = withCoords.map((stop) => Number(stop.lat));
    const lngs = withCoords.map((stop) => Number(stop.lng));
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const rawLatRange = maxLat - minLat;
    const rawLngRange = maxLng - minLng;
    if (rawLatRange < 0.0005 && rawLngRange < 0.0005) return stops;
    const latRange = Math.max(0.0001, rawLatRange);
    const lngRange = Math.max(0.0001, rawLngRange);

    return stops.map((stop) => {
      if (stop.lat === null || stop.lng === null) return stop;
      return {
        ...stop,
        mapX: 10 + ((Number(stop.lng) - minLng) / lngRange) * 80,
        mapY: 90 - ((Number(stop.lat) - minLat) / latRange) * 80,
      };
    });
  }

  private spreadRouteMapStops(stops: RoutePlannerStop[]): RoutePlannerStop[] {
    if (stops.length <= 1) return stops;
    const normalized = stops.map((stop) => ({
      ...stop,
      mapX: Math.max(7, Math.min(93, Number(stop.mapX) || 50)),
      mapY: Math.max(8, Math.min(92, Number(stop.mapY) || 50)),
    }));
    const xs = normalized.map((stop) => stop.mapX);
    const ys = normalized.map((stop) => stop.mapY);
    const compressed = Math.max(...xs) - Math.min(...xs) < 8 && Math.max(...ys) - Math.min(...ys) < 8;

    if (compressed) {
      const columns = Math.ceil(Math.sqrt(normalized.length));
      const rows = Math.ceil(normalized.length / columns);
      return normalized.map((stop, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        return {
          ...stop,
          mapX: columns === 1 ? 50 : 10 + (column / (columns - 1)) * 80,
          mapY: rows === 1 ? 50 : 12 + (row / (rows - 1)) * 76,
        };
      });
    }

    const groups = new Map<string, RoutePlannerStop[]>();
    for (const stop of normalized) {
      const key = `${Math.round(stop.mapX / 3)}:${Math.round(stop.mapY / 3)}`;
      groups.set(key, [...(groups.get(key) || []), stop]);
    }

    const spread = new Map<string, RoutePlannerStop>();
    for (const group of groups.values()) {
      if (group.length === 1) {
        spread.set(`${group[0].teamIndex}:${group[0].routeOrder}:${group[0].id}`, group[0]);
        continue;
      }
      const radius = Math.min(7, 2.5 + group.length * 0.45);
      group.forEach((stop, index) => {
        const angle = (-Math.PI / 2) + (index / group.length) * Math.PI * 2;
        spread.set(`${stop.teamIndex}:${stop.routeOrder}:${stop.id}`, {
          ...stop,
          mapX: Math.max(7, Math.min(93, stop.mapX + Math.cos(angle) * radius)),
          mapY: Math.max(8, Math.min(92, stop.mapY + Math.sin(angle) * radius)),
        });
      });
    }

    return normalized.map((stop) => spread.get(`${stop.teamIndex}:${stop.routeOrder}:${stop.id}`) || stop);
  }

  private getRouteStopFlowType(team: RoutePlannerTeam, stop: RoutePlannerStop, index: number): string {
    if (index <= 0) return 'start';

    const previous = team.stops[index - 1];
    const previousIds = new Set((previous?.assignedEmployeeIds || []).map((id) => Number(id)).filter(Boolean));
    const currentIds = new Set((stop.assignedEmployeeIds || []).map((id) => Number(id)).filter(Boolean));
    if (!previousIds.size || !currentIds.size) return 'handoff';

    const same =
      previousIds.size === currentIds.size &&
      [...previousIds].every((id) => currentIds.has(id));
    if (same) return 'same';

    const overlap = [...currentIds].some((id) => previousIds.has(id));
    if (!overlap) return 'handoff';
    if (currentIds.size < previousIds.size) return 'split';
    if (currentIds.size > previousIds.size) return 'merge';
    return 'partial';
  }

  private resolveRoutePlannerStartMinutes(
    team: RoutePlannerTeam,
    stop: RoutePlannerStop,
    travelBefore: number,
  ): number {
    const previous = team.stops[team.stops.length - 1];
    const currentMinutes = previous
      ? this.routeTimeToMinutes(previous.plannedEnd)
      : this.baseRoutePlannerStartMinutes();
    return this.estimateRoutePlannerStartMinutes(currentMinutes, stop, travelBefore, !previous);
  }

  private estimateRoutePlannerStartMinutes(
    currentMinutes: number,
    stop: RoutePlannerStop,
    travelBefore: number,
    isFirstStop: boolean,
  ): number {
    const baseStart = this.baseRoutePlannerStartMinutes();
    const accessStart = this.routeMinutesFromDate(stop.startDate);
    const latestStart = this.getRoutePlannerLatestStartMinutes(stop);
    const arrival = isFirstStop ? baseStart : Math.max(0, currentMinutes) + Math.max(0, travelBefore);
    let start = Math.max(arrival, accessStart ?? baseStart);

    if (isFirstStop && accessStart !== null) {
      start = accessStart;
    }

    if (latestStart !== null && start > latestStart) {
      const earliestAllowed = accessStart ?? 0;
      const fittedStart = Math.max(0, Math.max(earliestAllowed, latestStart));
      if (isFirstStop || fittedStart >= arrival) {
        start = fittedStart;
      }
    }

    if (accessStart !== null && start < accessStart) {
      start = accessStart;
    }

    return Math.max(0, Math.round(start));
  }

  private getRoutePlannerWindowPenalty(
    stop: RoutePlannerStop,
    startMinutes: number,
    arrivalMinutes: number,
  ): number {
    const accessStart = this.routeMinutesFromDate(stop.startDate);
    const accessEnd = this.routeMinutesFromDate(stop.accessEndDate);
    let penalty = 0;

    if (accessStart !== null && startMinutes < accessStart) {
      penalty += (accessStart - startMinutes) * 500;
    }

    if (accessEnd !== null && startMinutes + stop.duration > accessEnd) {
      penalty += (startMinutes + stop.duration - accessEnd) * 1000;
    }

    if (accessEnd !== null && arrivalMinutes > accessEnd) {
      penalty += (arrivalMinutes - accessEnd) * 1500;
    }

    return penalty;
  }

  private getRoutePlannerLatestStartMinutes(stop: RoutePlannerStop): number | null {
    const accessEnd = this.routeMinutesFromDate(stop.accessEndDate);
    if (accessEnd === null) return null;
    return accessEnd - Math.max(0, Number(stop.duration) || 0);
  }

  private getAppointmentRouteAddress(app: any, customerOverride: Record<string, any> | null = null): string {
    const customer = customerOverride || this.getAppointmentCustomer(app);
    const customerAddress = customer ? this.globalService.buildCustomerAddress(customer, 'work') : '';
    if (customerAddress) return customerAddress;

    const directAddress = [
      app?.routeAddress,
      app?.workAddress,
      app?.indirizzoLavoro,
      app?.luogoLavoro,
      app?.address,
      app?.indirizzo,
      app?.via,
    ]
      .map((value) => String(value || '').trim())
      .find(Boolean);
    const cityLine = [
      app?.cap,
      app?.zip,
      app?.citta,
      app?.city,
      app?.provincia,
      app?.province,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' ');

    const composed = [directAddress, cityLine]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(', ');

    return composed || 'Indirizzo da configurare';
  }

  private getAppointmentRouteCoords(
    app: any,
    customerOverride: Record<string, any> | null = null,
  ): { lat: number | null; lng: number | null } {
    const customer = customerOverride || this.getAppointmentCustomer(app);
    const fieldSet = this.globalService.getEffectiveCustomerAddressFields('work');
    const lat = this.firstCoordinateValue(customer, [
      fieldSet.latitude,
      'latitude',
      'latitudine',
      'lat',
      'workLatitude',
      'customerWorkLatitude',
    ]);
    const lng = this.firstCoordinateValue(customer, [
      fieldSet.longitude,
      'longitude',
      'longitudine',
      'lng',
      'lon',
      'workLongitude',
      'customerWorkLongitude',
    ]);

    return {
      lat: lat ?? this.firstCoordinateValue(app, ['latitude', 'latitudine', 'lat']),
      lng: lng ?? this.firstCoordinateValue(app, ['longitude', 'longitudine', 'lng', 'lon']),
    };
  }

  private getAppointmentCustomer(app: any): any {
    return (
      app?.customer ||
      app?.Customer ||
      app?.appointment?.customer ||
      app?.appointment?.Customer ||
      null
    );
  }

  private getAppointmentNumeroCliente(app: any): string {
    const customer = this.getAppointmentCustomer(app);
    const direct = [
      app?.numeroCliente,
      app?.appointment?.numeroCliente,
      customer?.numeroCliente,
    ]
      .map((value) => String(value || '').trim())
      .find(Boolean);
    if (direct) return direct;

    const match = String(app?.title || '').match(/^(\d+)\s*-/);
    return match ? match[1] : '';
  }

  private getAppointmentRequiredEmployees(app: any): number {
    const customer = this.getAppointmentCustomer(app);
    const values = [
      app?.requiredEmployees,
      app?.nOperatori,
      app?.appointment?.requiredEmployees,
      app?.appointment?.nOperatori,
      customer?.nOperatori,
    ];

    for (const value of values) {
      const parsed = Number(String(value ?? '').replace(',', '.'));
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.max(1, Math.min(Math.round(parsed), 20));
      }
    }

    return 1;
  }

  private firstCoordinateValue(record: any, keys: Array<string | undefined>): number | null {
    if (!record) return null;
    for (const key of keys) {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey) continue;
      const value = this.toNullableNumber(record[normalizedKey]);
      if (value !== null) return value;
    }
    return null;
  }

  private toNullableNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(String(value).replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  }

  private getAssignedEmployeeNames(app: any): string {
    const ids = this.assignedShifts[app.id] || [];
    if (!ids.length) return '';
    return ids
      .map((id: number) => {
        const employee = this.employeeList.find((item) => Number(item.id) === Number(id));
        return employee ? `${employee.nome || ''} ${employee.cognome || ''}`.trim() : '';
      })
      .filter(Boolean)
      .join(', ');
  }

  private buildPseudoMapPoint(seed: string): { x: number; y: number } {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
    }
    const positive = Math.abs(hash || 1);
    return {
      x: 10 + (positive % 80),
      y: 10 + (Math.floor(positive / 97) % 80),
    };
  }

  private balanceRouteStopsAcrossTeams(
    stops: RoutePlannerStop[],
    teamsCount: number,
    matrix: RouteDurationMatrix,
    employeeStates: RoutePlannerEmployeeState[],
    options: RoutePlannerBuildOptions = {},
  ): RoutePlannerStop[][] {
    const targetDayMinutes = this.getRoutePlannerTargetDayMinutes(employeeStates);
    const teamStates = Array.from({ length: teamsCount }, () => ({
      stops: [] as RoutePlannerStop[],
      totalWorkMinutes: 0,
      totalTravelMinutes: 0,
      currentMinutes: this.baseRoutePlannerStartMinutes(),
      requiredEmployees: 0,
    }));

    const mode = options.stopOrderMode || 'timeline';
    const orderedStops = [...stops].sort((a, b) => {
      const startA = this.routeMinutesFromDate(a.startDate);
      const startB = this.routeMinutesFromDate(b.startDate);
      const latestA = this.getRoutePlannerLatestStartMinutes(a);
      const latestB = this.getRoutePlannerLatestStartMinutes(b);
      if (mode === 'preference') {
        const preferenceDiff = this.getRouteStopPreferenceStrength(b) - this.getRouteStopPreferenceStrength(a);
        if (preferenceDiff) return preferenceDiff;
      }
      if (mode === 'deadline') {
        if (latestA !== null && latestB !== null && latestA !== latestB) return latestA - latestB;
        if (latestA !== null) return -1;
        if (latestB !== null) return 1;
      }
      if (mode === 'duration' && a.duration !== b.duration) return b.duration - a.duration;
      if (startA !== null && startB !== null) return startA - startB;
      if (startA !== null) return -1;
      if (startB !== null) return 1;
      return b.duration - a.duration;
    });

    for (const stop of orderedStops) {
      const bestTeam = teamStates
        .map((team, index) => {
          const previous = team.stops[team.stops.length - 1] || null;
          const stopRequiredEmployees = this.getRouteStopRequiredEmployees(stop);
          const currentRequiredEmployees = team.requiredEmployees || stopRequiredEmployees;
          const projectedRequiredEmployees = Math.max(currentRequiredEmployees, stopRequiredEmployees);
          const travelBefore = previous ? this.getRouteTravelMinutes(matrix, previous, stop) : 0;
          const startMinutes = this.estimateRoutePlannerStartMinutes(
            team.currentMinutes,
            stop,
            travelBefore,
            !previous,
          );
          const endMinutes = startMinutes + stop.duration;
          const arrivalMinutes = previous
            ? team.currentMinutes + travelBefore
            : this.baseRoutePlannerStartMinutes();
          const projectedTotal = team.totalWorkMinutes + team.totalTravelMinutes + stop.duration + travelBefore;
          const overtime = Math.max(0, projectedTotal - targetDayMinutes);
          const windowPenalty = this.getRoutePlannerWindowPenalty(stop, startMinutes, arrivalMinutes);
          const emptyBonus = team.stops.length ? 0 : -60;
          const currentLoadPenalty = (team.totalWorkMinutes + team.totalTravelMinutes) / Math.max(1, targetDayMinutes);
          const distancePenalty = previous ? travelBefore : this.routeDistanceFromCenter(stop);
          const lateDayPenalty = Math.max(0, endMinutes - (this.baseRoutePlannerStartMinutes() + targetDayMinutes));
          const mixedCrewPenalty = team.stops.length && currentRequiredEmployees !== stopRequiredEmployees
            ? Math.abs(currentRequiredEmployees - stopRequiredEmployees) * targetDayMinutes * 8
            : 0;
          const wastedOperatorMinutes = Math.max(0, projectedRequiredEmployees - stopRequiredEmployees) * stop.duration;
          const raisedCrewWaste = Math.max(0, projectedRequiredEmployees - currentRequiredEmployees) * team.totalWorkMinutes;

          return {
            index,
            travelBefore,
            endMinutes,
            projectedRequiredEmployees,
            projectedTotal,
            score:
              windowPenalty +
              mixedCrewPenalty +
              wastedOperatorMinutes * 4 +
              raisedCrewWaste * 4 +
              overtime * 1000 +
              lateDayPenalty * 40 +
              currentLoadPenalty * 120 +
              projectedTotal +
              distancePenalty * 3 +
              emptyBonus,
          };
        })
        .sort((a, b) => a.score - b.score || a.projectedTotal - b.projectedTotal)[0];

      const target = teamStates[bestTeam.index];
      target.stops.push(stop);
      target.totalWorkMinutes += stop.duration;
      target.totalTravelMinutes += bestTeam.travelBefore;
      target.currentMinutes = bestTeam.endMinutes;
      target.requiredEmployees = bestTeam.projectedRequiredEmployees;
    }

    return this.refineRouteStopBalance(
      teamStates.map((team) => team.stops),
      matrix,
      targetDayMinutes,
    );
  }

  private refineRouteStopBalance(
    clusters: RoutePlannerStop[][],
    matrix: RouteDurationMatrix,
    targetDayMinutes: number,
  ): RoutePlannerStop[][] {
    const result = clusters.map((cluster) => [...cluster]);
    const stopCount = result.reduce((sum, cluster) => sum + cluster.length, 0);
    if (result.length < 2 || stopCount > 36) return result;

    const maxIterations = stopCount > 24 ? 4 : stopCount > 16 ? 10 : 24;
    const maxMoveEvaluations = stopCount > 24 ? 120 : stopCount > 16 ? 260 : 700;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const totals = result.map((cluster) => this.estimateRouteClusterMinutes(cluster, matrix));
      const overloadedIndex = totals
        .map((total, index) => ({ total, index }))
        .filter((item) => item.total > targetDayMinutes)
        .sort((a, b) => b.total - a.total)[0]?.index;

      if (overloadedIndex === undefined) break;

      let bestMove: {
        stopIndex: number;
        targetIndex: number;
        score: number;
      } | null = null;
      let moveEvaluations = 0;
      let exhaustedBudget = false;

      for (let stopIndex = 0; stopIndex < result[overloadedIndex].length; stopIndex++) {
        const stop = result[overloadedIndex][stopIndex];

        for (let targetIndex = 0; targetIndex < result.length; targetIndex++) {
          if (targetIndex === overloadedIndex) continue;
          moveEvaluations += 1;
          if (moveEvaluations > maxMoveEvaluations) {
            exhaustedBudget = true;
            break;
          }

          const fromCluster = result[overloadedIndex].filter((_, index) => index !== stopIndex);
          const toCluster = [...result[targetIndex], stop];
          const fromTotal = this.estimateRouteClusterMinutes(fromCluster, matrix);
          const toTotal = this.estimateRouteClusterMinutes(toCluster, matrix);
          const maxOvertime = Math.max(0, fromTotal - targetDayMinutes) + Math.max(0, toTotal - targetDayMinutes);
          const balance = Math.abs(fromTotal - toTotal);
          const crewMismatch =
            this.estimateRouteClusterCrewMismatchMinutes(fromCluster) +
            this.estimateRouteClusterCrewMismatchMinutes(toCluster);
          const score = maxOvertime * 10000 + crewMismatch * 500 + balance;

          if (!bestMove || score < bestMove.score) {
            bestMove = { stopIndex, targetIndex, score };
          }
        }
        if (exhaustedBudget) break;
      }

      if (!bestMove) break;

      const [moved] = result[overloadedIndex].splice(bestMove.stopIndex, 1);
      result[bestMove.targetIndex].push(moved);
    }

    return result;
  }

  private estimateRouteClusterCrewMismatchMinutes(stops: RoutePlannerStop[]): number {
    if (stops.length < 2) return 0;
    const maxRequired = Math.max(...stops.map((stop) => this.getRouteStopRequiredEmployees(stop)));
    return stops.reduce(
      (sum, stop) => sum + Math.max(0, maxRequired - this.getRouteStopRequiredEmployees(stop)) * stop.duration,
      0,
    );
  }

  private estimateRouteClusterMinutes(
    stops: RoutePlannerStop[],
    matrix: RouteDurationMatrix,
  ): number {
    const ordered = this.orderClusterStops(stops, matrix);
    let total = 0;
    let previous: RoutePlannerStop | null = null;

    for (const stop of ordered) {
      total += stop.duration;
      if (previous) {
        total += this.getRouteTravelMinutes(matrix, previous, stop);
      }
      previous = stop;
    }

    return total;
  }

  private getRoutePlannerTargetDayMinutes(employeeStates: RoutePlannerEmployeeState[] = []): number {
    const capacities = (employeeStates.length ? employeeStates : this.buildRoutePlannerEmployeeStates(new Map(), false))
      .map((state) => Number(state.capacityMinutes) || 0)
      .filter((minutes) => minutes > 0)
      .sort((a, b) => a - b);

    if (!capacities.length) return 8 * 60;

    const middle = Math.floor(capacities.length / 2);
    const median = capacities.length % 2
      ? capacities[middle]
      : Math.round((capacities[middle - 1] + capacities[middle]) / 2);

    return Math.max(60, median || 8 * 60);
  }

  private routeDistanceFromCenter(stop: RoutePlannerStop): number {
    return Math.hypot((Number(stop.mapX) || 50) - 50, (Number(stop.mapY) || 50) - 50);
  }

  private baseRoutePlannerStartMinutes(): number {
    return this.routeTimeToMinutes(this.routePlannerStartTime) || 8 * 60;
  }

  private routeTimeToMinutes(value: string | null | undefined): number {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return 0;
    const hours = Math.max(0, Math.min(23, Number(match[1]) || 0));
    const minutes = Math.max(0, Math.min(59, Number(match[2]) || 0));
    return hours * 60 + minutes;
  }

  private routeMinutesFromDate(value: Date | null): number | null {
    if (!value || isNaN(value.getTime())) return null;
    return value.getHours() * 60 + value.getMinutes();
  }

  private minutesToRouteTime(value: number): string {
    const dayMinutes = ((Math.floor(value) % 1440) + 1440) % 1440;
    const hours = Math.floor(dayMinutes / 60);
    const minutes = dayMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private buildRoutePlannerMessage(source: string, unresolvedCount: number): string {
    if (source === 'osrm') {
      return unresolvedCount
        ? `Giri generati. ${unresolvedCount} indirizzi non risolti usano una stima approssimata.`
        : 'Giri generati in base a lavori, orari e tempi di spostamento.';
    }

    if (source === 'haversine') {
      return unresolvedCount
        ? `Giri generati. ${unresolvedCount} indirizzi non hanno una posizione precisa e usano una stima approssimata.`
        : 'Giri generati in base a lavori, orari e tempi di spostamento.';
    }

    return 'Giri generati con una stima locale approssimata dei tempi di spostamento.';
  }

  applyRoutePlanToAssignments(): boolean {
    const stops = this.routePlannerTeams.flatMap((team) => team.stops);
    this.routePlannerApplyMessage = '';

    if (!stops.length) {
      this.routePlannerApplyMessage = 'Nessun piano da applicare.';
      return false;
    }

    const teamCapacityIssues = this.buildRouteTeamCapacityIssues();
    const accessIssues = this.buildRoutePlanAccessIssues(stops);
    const nonBlockingIssues = [...teamCapacityIssues, ...accessIssues];

    if (nonBlockingIssues.length) {
      this.routePlannerWarnings = [
        ...new Set([
          ...this.routePlannerWarnings,
          ...nonBlockingIssues.slice(0, 8),
        ]),
      ];
    }

    const incompleteStops = stops.filter((stop) =>
      (stop.assignedEmployeeIds || []).length < this.getRouteStopRequiredEmployees(stop),
    );
    const overstaffedStops = stops.filter((stop) =>
      (stop.assignedEmployeeIds || []).length > this.getRouteStopRequiredEmployees(stop),
    );
    const directlyApplicableStops = stops.filter((stop) => {
      const assignedCount = (stop.assignedEmployeeIds || []).length;
      const requiredCount = this.getRouteStopRequiredEmployees(stop);
      return assignedCount === requiredCount;
    });
    const capacitySelection = this.filterRouteStopsWithinEmployeeCapacity(directlyApplicableStops);
    const applicableStops = capacitySelection.stops;
    const skippedCount = stops.length - applicableStops.length;

    if (incompleteStops.length) {
      const details = incompleteStops
        .slice(0, 5)
        .map((stop) => {
          const summary = this.buildRouteStopAssignmentIssueSummary(stop);
          return `${stop.title}: ${(stop.assignedEmployeeIds || []).length}/${this.getRouteStopRequiredEmployees(stop)}${summary ? ` (${summary})` : ''}`;
        })
        .join(' • ');
      this.routePlannerWarnings = [
        ...new Set([
          ...this.routePlannerWarnings,
          `Non applicati per operatori mancanti: ${details}${incompleteStops.length > 5 ? '...' : ''}.`,
        ]),
      ];
    }

    if (overstaffedStops.length) {
      const details = overstaffedStops
        .slice(0, 5)
        .map((stop) => `${stop.title}: ${(stop.assignedEmployeeIds || []).length}/${this.getRouteStopRequiredEmployees(stop)}`)
        .join(' • ');
      this.routePlannerWarnings = [
        ...new Set([
          ...this.routePlannerWarnings,
          `Non applicati per operatori in eccesso: ${details}${overstaffedStops.length > 5 ? '...' : ''}.`,
        ]),
      ];
    }

    if (capacitySelection.skipped.length) {
      this.routePlannerWarnings = [
        ...new Set([
          ...this.routePlannerWarnings,
          ...capacitySelection.skipped.slice(0, 6),
        ]),
      ];
    }

    this.updateRoutePlannerConflictPrompt(stops);

    if (!applicableStops.length) {
      this.routePlannerApplyMessage = 'Piano non applicato: nessun lavoro ha un assegnamento valido entro le ore disponibili.';
      return false;
    }

    const orderByEmployee: Record<number, number> = {};
    let applied = 0;

    for (const stop of applicableStops) {
      const app = stop.appRef || this.appointments.find((item) => String(item.id) === String(stop.id));
      if (!app) continue;

      const employeeIds = [...new Set((stop.assignedEmployeeIds || []).map((id) => Number(id)).filter(Boolean))];
      this.assignedShifts[app.id] = employeeIds;
      this.routePlannerManagedAppointmentIds.add(String(app.id));
      this.assignedCapisquadra[app.id] = employeeIds.length ? [employeeIds[0]] : [];
      this.assignedCapisquadraNotes[app.id] = this.assignedCapisquadraNotes[app.id] || {};
      app.startDate = this.combineLocalDateAndTime(this.formatDate(this.selectedDate), stop.plannedStart);
      app.duration = stop.duration;
      app.durationDisplay = this.formatDuration(stop.duration);

      if (!app.sortOrderByEmployee || typeof app.sortOrderByEmployee !== 'object') {
        app.sortOrderByEmployee = {};
      }

      for (const employeeId of employeeIds) {
        app.sortOrderByEmployee[employeeId] = orderByEmployee[employeeId] || 0;
        orderByEmployee[employeeId] = (orderByEmployee[employeeId] || 0) + 1;
      }

      this.scheduleAutosave(app, true);
      applied += 1;
    }

    this.appointments = [...this.appointments];
    this.employeeList = [...this.employeeList];
    const warningCount = nonBlockingIssues.length + skippedCount;
    this.routePlannerApplyMessage = warningCount
      ? `Piano applicato a ${applied} lavori. ${skippedCount} lavori da controllare. Premi Salva Turni dopo la verifica.`
      : `Piano applicato a ${applied} lavori. Controlla e premi Salva Turni.`;
    return true;
  }

  private filterRouteStopsWithinEmployeeCapacity(stops: RoutePlannerStop[]): {
    stops: RoutePlannerStop[];
    skipped: string[];
  } {
    const totals = new Map<number, {
      name: string;
      capacityMinutes: number;
      routeMinutes: number;
    }>();
    const accepted: RoutePlannerStop[] = [];
    const skipped: string[] = [];
    const orderedStops = [...stops].sort((a, b) =>
      this.routeTimeToMinutes(a.plannedStart) - this.routeTimeToMinutes(b.plannedStart),
    );

    for (const stop of orderedStops) {
      const employeeIds = [
        ...new Set((stop.assignedEmployeeIds || []).map((id) => Number(id)).filter(Boolean)),
      ];
      const hardEmployeeIds = new Set([
        ...this.getMandatoryRoutePreferenceEmployeeIdsForStop(stop),
        ...(stop.lockedEmployeeIds || []).map((id) => Number(id)).filter(Boolean),
      ]);
      const crewSize = Math.max(1, employeeIds.length);
      const routeLoadMinutes = this.getRouteStopEmployeeLoadMinutes(stop, crewSize);
      const exceeded = employeeIds
        .map((employeeId) => {
          const employee = this.employeeList.find((item) => Number(item.id) === employeeId);
          const current = totals.get(employeeId) || {
            name: employee ? this.formatEmployeeName(employee) : `Dipendente ${employeeId}`,
            capacityMinutes: employee ? this.getEmployeeDailyCapacityMinutes(employee) : 8 * 60,
            routeMinutes: 0,
          };
          return {
            employeeId,
            ...current,
            projectedMinutes: current.routeMinutes + routeLoadMinutes,
          };
        })
        .filter((item) => item.projectedMinutes > item.capacityMinutes);

      if (exceeded.length) {
        const details = exceeded
          .map((item) => `${item.name} ${this.formatDuration(item.projectedMinutes)}/${this.formatDuration(item.capacityMinutes)}`)
          .join(', ');

        if (!exceeded.some((item) => hardEmployeeIds.has(item.employeeId))) {
          skipped.push(`${stop.title}: non applicato per ore giornaliere ${details}`);
          continue;
        }

        skipped.push(`${stop.title}: applicato per vincolo obbligatorio, ma supera le ore giornaliere ${details}`);
      }

      for (const employeeId of employeeIds) {
        const employee = this.employeeList.find((item) => Number(item.id) === employeeId);
        const current = totals.get(employeeId) || {
          name: employee ? this.formatEmployeeName(employee) : `Dipendente ${employeeId}`,
          capacityMinutes: employee ? this.getEmployeeDailyCapacityMinutes(employee) : 8 * 60,
          routeMinutes: 0,
        };
        current.routeMinutes += routeLoadMinutes;
        totals.set(employeeId, current);
      }
      accepted.push(stop);
    }

    return { stops: accepted, skipped };
  }

  private buildRouteStopAssignmentIssueSummary(stop: RoutePlannerStop): string {
    return (stop.assignmentWarnings || [])
      .filter((warning) => warning && !/^Servono\s+\d+\s+dipendenti/i.test(String(warning)))
      .slice(0, 2)
      .join('; ');
  }

  private buildRoutePlanAccessIssues(stops: RoutePlannerStop[]): string[] {
    const blockingWarnings = new Set([
      "Prima dell'orario di accesso",
      'Fuori orario accesso cliente',
      'Giorno non tra quelli di accesso cliente',
    ]);

    return stops
      .filter((stop) => (stop.assignmentWarnings || []).some((warning) => blockingWarnings.has(warning)))
      .map((stop) => {
        const warnings = (stop.assignmentWarnings || [])
          .filter((warning) => blockingWarnings.has(warning))
          .join(', ');
        return `${stop.title}: ${warnings}`;
      });
  }

  private buildRouteTeamCapacityIssues(): string[] {
    const targetDayMinutes = this.getRoutePlannerTargetDayMinutes();
    return this.routePlannerTeams
      .filter((team) => team.stops.length && team.totalMinutes > targetDayMinutes)
      .map((team) =>
        `${team.name}: ${this.formatDuration(team.totalMinutes)} su ${this.formatDuration(targetDayMinutes)} disponibili`,
      );
  }

  private buildRoutePlanCapacityIssues(stops: RoutePlannerStop[]): string[] {
    const totals = new Map<number, {
      name: string;
      capacityMinutes: number;
      workMinutes: number;
      routeMinutes: number;
    }>();

    for (const stop of stops) {
      const employeeIds = [
        ...new Set((stop.assignedEmployeeIds || []).map((id) => Number(id)).filter(Boolean)),
      ];
      const crewSize = Math.max(1, employeeIds.length);
      const routeLoadMinutes = this.getRouteStopEmployeeLoadMinutes(stop, crewSize);

      for (const employeeId of employeeIds) {
        const employee = this.employeeList.find((item) => Number(item.id) === employeeId);
        const current = totals.get(employeeId) || {
          name: employee ? this.formatEmployeeName(employee) : `Dipendente ${employeeId}`,
          capacityMinutes: employee ? this.getEmployeeDailyCapacityMinutes(employee) : 8 * 60,
          workMinutes: 0,
          routeMinutes: 0,
        };
        current.workMinutes += Number(stop.duration) || 0;
        current.routeMinutes += routeLoadMinutes;
        totals.set(employeeId, current);
      }
    }

    return [...totals.values()]
      .filter((item) => item.routeMinutes > item.capacityMinutes)
      .map((item) => {
        return `${item.name}: ${this.formatDuration(item.routeMinutes)} lavori + strada su ${this.formatDuration(item.capacityMinutes)} disponibili`;
      });
  }

  dropGeneral(event: CdkDragDrop<any[]>): void {
    moveItemInArray(this.appointments, event.previousIndex, event.currentIndex);
    this.appointments.forEach((a, i) => (a.generalOrder = i));
    this.appointments = [...this.appointments];

    this.socketService.emitUpdate({
      type: 'reorderGeneral',
      date: this.formatDate(this.selectedDate),
      data: this.appointments.map((a, i) => ({ id: a.id, order: i })),
    });
  }

  dropForEmployee(event: CdkDragDrop<any[]>, empId: number) {
    moveItemInArray(
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );

    event.container.data.forEach((job, i) => {
      if (typeof job.sortOrderByEmployee === 'string') {
        try {
          job.sortOrderByEmployee = JSON.parse(job.sortOrderByEmployee);
        } catch {
          job.sortOrderByEmployee = {};
        }
      }

      if (
        !job.sortOrderByEmployee ||
        typeof job.sortOrderByEmployee !== 'object'
      ) {
        job.sortOrderByEmployee = {};
      }

      job.sortOrderByEmployee[empId] = i;
      this.markAppointmentManualForRoutePlanner(job.id);
    });

    this.employeeList = [...this.employeeList];
    event.container.data.forEach((job) => this.scheduleAutosave(job));

    this.socketService.emitUpdate({
      type: 'reorderEmployee',
      date: this.formatDate(this.selectedDate),
      data: {
        empId,
        jobs: event.container.data.map((j, i) => ({ id: j.id, order: i })),
      },
    });
  }

  onTitleChange(app: any, value: string) {
    app.title = value;
    this.markAppointmentManualForRoutePlanner(app.id);
    this.scheduleAutosave(app);

    this.socketService.emitUpdate({
      type: 'updateTitle',
      date: this.formatDate(this.selectedDate),
      data: { id: app.id, title: value },
    });
  }

  onDescriptionChange(app: any, value: string) {
    app.description = value;
    this.markAppointmentManualForRoutePlanner(app.id);
    this.scheduleAutosave(app);

    this.socketService.emitUpdate({
      type: 'updateDescription',
      date: this.formatDate(this.selectedDate),
      data: { id: app.id, description: value },
    });
  }

  onTimeTextChange(app: any, value: string) {
    const d = this.parseHourInput(value);
    app.startDate = d;
    this.markAppointmentManualForRoutePlanner(app.id);
    this.scheduleAutosave(app);

    this.socketService.emitUpdate({
      type: 'updateStartDate',
      date: this.formatDate(this.selectedDate),
      data: { id: app.id, startDate: d },
    });
  }

  onDurationChange(app: any, value: number) {
    app.duration = value;
    app.durationDisplay = this.formatDuration(value);
    this.markAppointmentManualForRoutePlanner(app.id);
    this.scheduleAutosave(app);

    this.socketService.emitUpdate({
      type: 'updateDuration',
      date: this.formatDate(this.selectedDate),
      data: { id: app.id, duration: value },
    });
  }

  openPostponePopup(app: any): void {
    const baseDate = app.startDate instanceof Date && !isNaN(app.startDate.getTime())
      ? new Date(app.startDate)
      : new Date(this.selectedDate);
    const nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + 1);

    this.postponeTarget = app;
    this.postponeForm = {
      date: this.formatDate(nextDate),
      time: this.getShiftTime(app) || '08:00',
      duration: Number(app.duration) > 0 ? Number(app.duration) : 60,
    };
    this.postponeError = '';
    this.postponePopupOpen = true;
  }

  closePostponePopup(): void {
    if (this.postponing) return;
    this.postponePopupOpen = false;
    this.postponeTarget = null;
    this.postponeError = '';
  }

  savePostponedAppointment(): void {
    const app = this.postponeTarget;
    if (!app) return;

    const startDate = this.combineLocalDateAndTime(
      this.postponeForm.date,
      this.postponeForm.time,
    );
    const duration = Math.max(15, Number(this.postponeForm.duration) || 60);

    if (!startDate) {
      this.postponeError = 'Inserisci una data e un orario validi.';
      return;
    }

    const currentStart = app.startDate instanceof Date && !isNaN(app.startDate.getTime())
      ? app.startDate
      : new Date(this.selectedDate);

    if (startDate.getTime() <= currentStart.getTime()) {
      this.postponeError = 'La nuova data deve essere successiva al lavoro originale.';
      return;
    }

    const endDate = new Date(startDate.getTime() + duration * 60000);
    const body = {
      title: app.title,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      recurrenceRule: '',
      dayLong: false,
      description: app.description || '',
      categories: app.categories,
      recurrenceException: null,
      inspectionAdminIds: [],
      inspectionReminderMinutes: null,
    };

    this.postponing = true;
    this.postponeError = '';

    this.http
      .post(this.globalService.url + 'appointments/add', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.postponing = false;
          this.postponePopupOpen = false;
          this.postponeTarget = null;
          alert(`Lavoro posticipato al ${this.postponeForm.date} alle ${this.postponeForm.time}.`);
        },
        error: (err) => {
          console.error('Errore posticipo appuntamento:', err);
          this.postponing = false;
          this.postponeError = this.parseServerError(err);
        },
      });
  }

  finalSave(forceSave = false): void {
    const dateStr = this.formatDate(this.selectedDate);

    const payload = this.appointments.map((app) => {
      let start: string | null = null;

      if (app.startDate instanceof Date && !isNaN(app.startDate.getTime())) {
        start = this.toSqlDateTime(app.startDate);
      }

      return {
        shiftId: app.shiftId || null,
        appointmentId: app.isExtra ? null : app.originalAppointmentId || app.id,
        data: dateStr,
        employeeIds: this.assignedShifts[app.id] || [],
        capisquadra: this.assignedCapisquadra[app.id] || [],
        capisquadraNotesMap: this.assignedCapisquadraNotes[app.id] || {},
        title: app.title,
        description: app.description,
        startDate: start,
        duration: app.duration || 60,
        sortOrderByEmployee: app.sortOrderByEmployee || {},
        vehicleIds: this.assignedVehicles[app.id] || [],
        equipmentKeys: this.normalizeEquipmentAssignments(this.assignedEquipment[app.id] || []),
      };
    });

    this.http
      .post(this.globalService.url + 'shifts/saveMultiple', { shifts: payload, forceSave })
      .subscribe({
        next: () => {
          this.socketService.emitUpdate({
            type: 'reload',
            date: this.formatDate(this.selectedDate),
          });
          alert('Turni salvati');
          this.router.navigate(['/homeAdmin/shifts'], { queryParams: { date: this.formatDate(this.selectedDate) } });
        },
        error: (err) => {
          console.error('Errore salvataggio turni:', err);
          if (err?.status === 409) {
            const issues = err?.error?.validationIssues || [];
            const message = this.formatShiftValidationIssues(issues);
            const proceed = confirm(
              `${message}\n\nVuoi salvare comunque i turni con queste incongruenze?`,
            );
            if (proceed) {
              this.finalSave(true);
            }
            return;
          }
          alert(this.parseServerError(err));
        },
      });
  }

  private formatShiftValidationIssues(issues: any[]): string {
    if (!Array.isArray(issues) || !issues.length) {
      return 'Sono state trovate incongruenze nei turni.';
    }

    const lines = issues
      .slice(0, 12)
      .map((issue, index) => `${index + 1}. ${issue?.message || 'Incongruenza turno'}`);
    if (issues.length > 12) {
      lines.push(`... altre ${issues.length - 12} incongruenze`);
    }

    return `Sono state trovate incongruenze nei turni:\n\n${lines.join('\n')}`;
  }

  loadVehiclesCache() {
    this.http.get<any[]>(this.globalService.url + 'vehicles/getAll').subscribe({
      next: (res) => (this.vehiclesCache = res || []),
      error: () => (this.vehiclesCache = []),
    });
  }

  loadEquipmentTargetsCache() {
    this.http.get<any[]>(this.globalService.url + 'admin/deadlines/equipment/targets').subscribe({
      next: (res) => (this.equipmentTargetsCache = res || []),
      error: () => (this.equipmentTargetsCache = []),
    });
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseLocalDate(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return new Date(value);

    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  private getShiftEmployeeLink(emp: any): any {
    return (
      emp?.ShiftEmployees ||
      emp?.shiftEmployees ||
      emp?.ShiftEmployee ||
      emp?.shiftEmployee ||
      {}
    );
  }

  parseHourInput(value: string): Date | null {
    if (!value) return null;

    const clean = value.replace(/\D/g, '');
    const d = new Date(this.selectedDate);

    if (clean.length === 4) {
      d.setHours(+clean.slice(0, 2), +clean.slice(2, 4), 0, 0);
      return d;
    }

    if (clean.length === 2) {
      d.setHours(+clean, 0, 0, 0);
      return d;
    }

    if (value.includes(':')) {
      const [h, m] = value.split(':').map(Number);
      d.setHours(h, m, 0, 0);
      return d;
    }

    return null;
  }

  private combineLocalDateAndTime(dateValue: string, timeValue: string): Date | null {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue || '');
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeValue || '');
    if (!dateMatch || !timeMatch) return null;

    const [, year, month, day] = dateMatch;
    const [, hour, minute] = timeMatch;
    const h = Number(hour);
    const m = Number(minute);
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;

    return new Date(Number(year), Number(month) - 1, Number(day), h, m, 0, 0);
  }

  toSqlDateTime(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  }

  isComplete(app: any): boolean {
    if (app.forceConfirmed) return true;
    const assigned = this.assignedShifts[app.id] || [];
    return assigned.length > 0;
  }

  goBack(): void {
    this.router.navigate(['/homeAdmin/shifts'], { queryParams: { date: this.formatDate(this.selectedDate) } });
  }

  showPreviousWeekShifts(): void {
    const prevDate = new Date(this.selectedDate);
    prevDate.setDate(prevDate.getDate() - 7);
    const dateStr = this.formatDate(prevDate);

    this.http
      .get<any[]>(this.globalService.url + `shifts/byDate/${dateStr}`)
      .subscribe((data) => {
        const mappa: { [cliente: string]: string[] } = {};

        for (const s of data) {
          const title = s.appointment?.title || s.title || '---';
          const fullNames =
            s.employees?.map((e: any) => `${e.nome} ${e.cognome}`) || [];

          if (!mappa[title]) mappa[title] = [];
          mappa[title].push(...fullNames);
        }

        this.previousWeekShiftList = Object.entries(mappa).map(
          ([cliente, dipendenti]) => ({ cliente, dipendenti }),
        );
      });
  }

  loadAppointments(): void {
    this.loading = true;
    this.refreshRoutePlannerActivePreferences();
    const dateStr = this.formatDate(this.selectedDate);

    this.appointments = [];
    this.assignedShifts = {};
    this.assignedCapisquadra = {};
    this.assignedCapisquadraNotes = {};
    this.assignedVehicles = {};
    this.assignedEquipment = {};
    this.routePlannerManagedAppointmentIds.clear();
    this.routePlannerManualEmployeeIdsByAppointment.clear();

    this.http
      .post<any[]>(this.globalService.url + 'appointments/byDate', {
        date: dateStr,
      })
      .subscribe({
        next: (data) => {
          let counter = 100000;

          this.appointments = (Array.isArray(data) ? data : [])
            .map((a) =>
              a.isRecurringInstance
                ? {
                    ...a,
                    id: counter++,
                    originalAppointmentId: a.id,
                    description: a.description || '',
                  }
                : { ...a },
            )
            .filter((a) => this.shouldIncludeAppointment(a))
            .map((a) => {
              if (a.startDate && a.startDate !== 'null' && a.startDate !== '') {
                a.startDate = new Date(a.startDate);
              } else {
                a.startDate = null;
              }

              if (a.endDate && a.endDate !== 'null' && a.endDate !== '') {
                a.endDate = new Date(a.endDate);

                if (a.startDate && a.endDate) {
                  const diffMinutes = Math.floor(
                    (a.endDate.getTime() - a.startDate.getTime()) / 60000,
                  );
                  a.duration = diffMinutes > 0 ? diffMinutes : 0;
                }
              }

              if (typeof a.duration !== 'number') {
                a.duration = 0;
              }

              a.durationDisplay = this.formatDuration(a.duration);

              if (typeof a.sortOrderByEmployee === 'string') {
                try {
                  a.sortOrderByEmployee = JSON.parse(a.sortOrderByEmployee);
                } catch {
                  a.sortOrderByEmployee = {};
                }
              }

              if (
                !a.sortOrderByEmployee ||
                typeof a.sortOrderByEmployee !== 'object'
              ) {
                a.sortOrderByEmployee = {};
              }

              return a;
            });

          this.sortAppointments();
          this.loading = false;
          this.loadExistingShifts();
        },
        error: (err) => {
          console.error('Errore caricamento appuntamenti:', err);
          this.loading = false;
          alert('Errore nel caricamento degli appuntamenti.');
        },
      });
  }

  loadExistingShifts(): void {
    const dateStr = this.formatDate(this.selectedDate);

    this.http
      .get<any[]>(this.globalService.url + `shifts/byDate/${dateStr}`)
      .subscribe((existing) => {
        for (const s of existing) {
          if (!s.appointmentId) {
            const extraId = `extra-${s.id}`;

            if (
              !this.appointments.some((a) => a.isExtra && a.shiftId === s.id)
            ) {
              let sortMap = s.sortOrderByEmployee;

              if (typeof sortMap === 'string') {
                try {
                  sortMap = JSON.parse(sortMap);
                } catch {
                  sortMap = {};
                }
              }

              if (!sortMap || typeof sortMap !== 'object') {
                sortMap = {};
              }

              this.appointments.push({
                id: extraId,
                shiftId: s.id,
                appointmentId: null,
                isExtra: true,
                title: s.title,
                description: s.description,
                startDate:
                  s.startDate && s.startDate !== 'null' && s.startDate !== ''
                    ? new Date(s.startDate)
                    : null,
                duration: s.duration ?? 60,
                durationDisplay: this.formatDuration(s.duration ?? 60),
                requiredEmployees: 0,
                sortOrderByEmployee: sortMap,
              });
            }

            this.assignedShifts[extraId] = (s.employees || []).map(
              (e: any) => e.id,
            );

            // Carica caposquadra e note
            this.assignedCapisquadra[extraId] = (s.employees || [])
              .filter((e: any) => this.getShiftEmployeeLink(e)?.isCaposquadra)
              .map((e: any) => e.id);
            this.assignedCapisquadraNotes[extraId] = {};
            (s.employees || []).forEach((e: any) => {
              const link = this.getShiftEmployeeLink(e);
              if (link?.caposquadraNote) {
                this.assignedCapisquadraNotes[extraId][e.id] = link.caposquadraNote;
              }
            });

            this.assignedVehicles[extraId] = Array.isArray(s.vehicleIds) ? s.vehicleIds : (s.vehicleId != null ? [s.vehicleId] : []);
            this.assignedEquipment[extraId] = this.normalizeEquipmentAssignments(s.equipmentAssignments || s.equipmentKeys);
          } else {
            const app = this.appointments.find(
              (a) =>
                a.id === s.appointmentId ||
                a.originalAppointmentId === s.appointmentId,
            );

            if (!app) {
              const newId = `existing-${s.appointmentId}`;

              if (!this.appointments.some((a) => a.id === newId)) {
                let sortMap = s.sortOrderByEmployee;

                if (typeof sortMap === 'string') {
                  try {
                    sortMap = JSON.parse(sortMap);
                  } catch {
                    sortMap = {};
                  }
                }

                if (!sortMap || typeof sortMap !== 'object') sortMap = {};

                const title = s.appointment?.title || s.title || '';
                const description =
                  s.appointment?.description || s.description || '';
                const customer =
                  s.appointment?.customer ||
                  s.appointment?.Customer ||
                  null;

                this.appointments.push({
                  id: newId,
                  shiftId: s.id,
                  originalAppointmentId: s.appointmentId,
                  appointmentId: s.appointmentId,
                  isExtra: false,
                  title,
                  description,
                  numeroCliente: s.appointment?.numeroCliente || null,
                  customer,
                  categories: s.appointment?.categories || '',
                  startDate:
                    s.startDate && s.startDate !== 'null' && s.startDate !== ''
                      ? new Date(s.startDate)
                      : null,
                  duration: typeof s.duration === 'number' ? s.duration : 60,
                  durationDisplay: this.formatDuration(
                    typeof s.duration === 'number' ? s.duration : 60,
                  ),
                  requiredEmployees:
                    s.appointment?.requiredEmployees ??
                    s.requiredEmployees ??
                    0,
                  sortOrderByEmployee: sortMap,
                });
              }

              this.assignedShifts[newId] = (s.employees || []).map(
                (e: any) => e.id,
              );

              // Carica caposquadra e note
              this.assignedCapisquadra[newId] = (s.employees || [])
                .filter((e: any) => this.getShiftEmployeeLink(e)?.isCaposquadra)
                .map((e: any) => e.id);
              this.assignedCapisquadraNotes[newId] = {};
              (s.employees || []).forEach((e: any) => {
                const link = this.getShiftEmployeeLink(e);
                if (link?.caposquadraNote) {
                  this.assignedCapisquadraNotes[newId][e.id] = link.caposquadraNote;
                }
              });

              this.assignedVehicles[newId] = Array.isArray(s.vehicleIds) ? s.vehicleIds : (s.vehicleId != null ? [s.vehicleId] : []);
              this.assignedEquipment[newId] = this.normalizeEquipmentAssignments(s.equipmentAssignments || s.equipmentKeys);
              continue;
            }

            app.shiftId = s.id;
            app.customer =
              app.customer ||
              s.appointment?.customer ||
              s.appointment?.Customer ||
              null;

            if ('startDate' in s) {
              app.startDate =
                s.startDate && s.startDate !== 'null' && s.startDate !== ''
                  ? new Date(s.startDate)
                  : null;
            }

            if (typeof s.duration === 'number') {
              app.duration = s.duration;
              app.durationDisplay = this.formatDuration(s.duration);
            }

            if (s.description !== undefined) {
              app.description = s.description ?? '';
            }

            if (typeof s.sortOrderByEmployee === 'string') {
              try {
                s.sortOrderByEmployee = JSON.parse(s.sortOrderByEmployee);
              } catch {
                s.sortOrderByEmployee = {};
              }
            }

            if (!s.sortOrderByEmployee) s.sortOrderByEmployee = {};
            app.sortOrderByEmployee = s.sortOrderByEmployee || {};
            this.assignedShifts[app.id] = (s.employees || []).map(
              (e: any) => e.id,
            );

            // Carica caposquadra e note
            this.assignedCapisquadra[app.id] = (s.employees || [])
              .filter((e: any) => this.getShiftEmployeeLink(e)?.isCaposquadra)
              .map((e: any) => e.id);
            this.assignedCapisquadraNotes[app.id] = {};
            (s.employees || []).forEach((e: any) => {
              const link = this.getShiftEmployeeLink(e);
              if (link?.caposquadraNote) {
                this.assignedCapisquadraNotes[app.id][e.id] = link.caposquadraNote;
              }
            });

            this.assignedVehicles[app.id] = Array.isArray(s.vehicleIds) ? s.vehicleIds : (s.vehicleId != null ? [s.vehicleId] : []);
            this.assignedEquipment[app.id] = this.normalizeEquipmentAssignments(s.equipmentAssignments || s.equipmentKeys);
          }
        }

        this.sortAppointments();
        if (this.routePlannerOpen) {
          this.generateRoutePlan();
        }
      });
  }

  openVehicleDialog(app: any): void {
    if (!this.vehiclesCache || this.vehiclesCache.length === 0) {
      this.loadVehiclesCache();
      alert(
        'Nessun mezzo trovato. Se li hai appena creati, riprova tra 1 secondo.',
      );
      return;
    }

    const dialogRef = this.dialog.open(VehicleAssignDialogComponent, {
      width: '520px',
      data: {
        assignedVehicleIds: this.assignedVehicles[app.id] || [],
        vehicles: this.vehiclesCache || [],
      },
      panelClass: 'glass-dialog',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.assignedVehicles[app.id] = result.vehicleIds || [];
        this.scheduleAutosave(app);
      }
    });
  }

  getVehicleLabel(appId: string): string {
    const ids = this.assignedVehicles[appId] || [];
    if (!ids.length) return '';
    return ids
      .map((id: number) => {
        const v = (this.vehiclesCache || []).find((x: any) => x.id === id);
        return v ? (v.plate ? `${v.name} (${v.plate})` : v.name) : '';
      })
      .filter(Boolean)
      .join(', ');
  }

  openEquipmentDialog(app: any): void {
    if (!this.equipmentTargetsCache || this.equipmentTargetsCache.length === 0) {
      this.loadEquipmentTargetsCache();
      alert(
        'Nessuna attrezzatura trovata. Aggiungila da Gestione attrezzature.',
      );
      return;
    }

    const dialogRef = this.dialog.open(EquipmentAssignDialogComponent, {
      width: '520px',
      data: {
        assignedEquipmentAssignments: this.assignedEquipment[app.id] || [],
        equipment: this.equipmentTargetsCache || [],
      },
      panelClass: 'glass-dialog',
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.assignedEquipment[app.id] = this.normalizeEquipmentAssignments(
          result.equipmentAssignments || result.equipmentKeys,
        );
        this.scheduleAutosave(app);
      }
    });
  }

  getEquipmentLabel(appId: string): string {
    const assignments = this.normalizeEquipmentAssignments(this.assignedEquipment[appId] || []);
    if (!assignments.length) return '';
    return assignments
      .map((assignment) => {
        const item = (this.equipmentTargetsCache || []).find((x: any) => x.targetKey === assignment.targetKey);
        const label = item ? (item.targetLabel || item.targetKey) : assignment.targetKey;
        return assignment.quantity > 1 ? `${label} x ${assignment.quantity}` : label;
      })
      .filter(Boolean)
      .join(', ');
  }

  openAssignmentDialog(app: any): void {
    const dialogRef = this.dialog.open(AssignDialogComponent, {
      width: '700px',
      maxHeight: '90vh',
      data: {
        ...app,
        assigned: this.assignedShifts[app.id] || [],
        capisquadra: this.assignedCapisquadra[app.id] || [],
        capisquadraNotes: this.assignedCapisquadraNotes[app.id] || {},
        busyDetails: this.getBusyDetails(app),
        requiredEmployees: app.requiredEmployees,
        selectedDate: this.formatDate(this.selectedDate),
        numeroCliente: app.numeroCliente || app.appointment?.numeroCliente || null,
      },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.assignedShifts[app.id] = result.employees || result;
        this.assignedCapisquadra[app.id] = result.capisquadra || [];
        this.assignedCapisquadraNotes[app.id] = result.capisquadraNotesMap || {};
        this.markAppointmentManualForRoutePlanner(app.id);
        this.scheduleAutosave(app, true);

        this.socketService.emitUpdate({
          type: 'assignEmployees',
          date: this.formatDate(this.selectedDate),
          data: { id: app.id, employees: this.assignedShifts[app.id] },
        });

        if (result.forceConfirmed) {
          app.forceConfirmed = true;
        }

        if (this.routePlannerOpen) {
          this.generateRoutePlan();
        }
      }
    });
  }

  getEmployeeTotalDuration(empId: number): string {
    return this.formatDuration(this.getEmployeeTotalMinutes(empId));
  }

  getEmployeeTotalMinutes(empId: number): number {
    const jobs = this.getEmployeeShifts(empId);
    return jobs.reduce(
      (sum, job) => sum + (job.duration || 0),
      0,
    );
  }

  getEmployeeDailyCapacityDuration(employee: any): string {
    return this.formatDuration(this.getEmployeeDailyCapacityMinutes(employee));
  }

  isEmployeeOverDailyCapacity(employee: any): boolean {
    return this.getEmployeeTotalMinutes(Number(employee?.id)) > this.getEmployeeDailyCapacityMinutes(employee);
  }

  getEmployeeShifts(empId: number): any[] {
    const jobs = this.appointments.filter((app) =>
      (this.assignedShifts[app.id] || []).includes(empId),
    );

    return jobs.sort((a, b) => {
      const sa = a.sortOrderByEmployee?.[empId];
      const sb = b.sortOrderByEmployee?.[empId];

      if (sa != null && sb != null) return sa - sb;
      if (sa != null) return -1;
      if (sb != null) return 1;

      if (a.startDate && b.startDate)
        return a.startDate.getTime() - b.startDate.getTime();
      if (a.startDate && !b.startDate) return -1;
      if (!a.startDate && b.startDate) return 1;
      return 0;
    });
  }

  getShiftTime(app: any): string {
    if (!app.startDate) return '';
    const d = new Date(app.startDate);
    if (isNaN(d.getTime())) return '';
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private sortAppointments(): void {
    const baseDate = new Date(this.selectedDate);

    const normalize = (val: any): Date | null => {
      if (val instanceof Date) return val;

      if (typeof val === 'string') {
        if (/^\d{1,2}:\d{2}$/.test(val)) {
          const [h, m] = val.split(':').map(Number);
          const d = new Date(baseDate);
          d.setHours(h, m, 0, 0);
          return d;
        }

        const d = new Date(
          val.includes(' ') && !val.includes('T') ? val.replace(' ', 'T') : val,
        );
        return isNaN(d.getTime()) ? null : d;
      }

      if (typeof val === 'number') return new Date(val);
      return null;
    };

    for (const a of this.appointments) {
      a.startDate =
        a.startDate != null ? (normalize(a.startDate) ?? null) : null;

      if (typeof a.duration !== 'number') a.duration = 0;
      a.durationDisplay = this.formatDuration(a.duration);
    }

    this.appointments.sort((a, b) => {
      if (a.startDate && b.startDate)
        return a.startDate.getTime() - b.startDate.getTime();
      if (a.startDate && !b.startDate) return -1;
      if (!a.startDate && b.startDate) return 1;
      return 0;
    });
  }

  prevDay(): void {
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() - 1);
    this.selectedDate = d;
    this.loadAppointments();
    this.loadVehiclesCache();
    this.showPreviousWeekShifts();
  }

  nextDay(): void {
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() + 1);
    this.selectedDate = d;
    this.loadAppointments();
    this.loadVehiclesCache();
    this.showPreviousWeekShifts();
  }

  addExtra(): void {
    const newId = 'extra-' + Date.now();
    const newJob = {
      id: newId,
      appointmentId: null,
      isExtra: true,
      title: 'Nuovo lavoro extra',
      description: '',
      startDate: null,
      duration: 0,
      durationDisplay: this.formatDuration(0),
      requiredEmployees: 0,
    };

    this.appointments.push(newJob);
    this.sortAppointments();
    this.scheduleAutosave(newJob);

    this.socketService.emitUpdate({
      type: 'addExtra',
      date: this.formatDate(this.selectedDate),
      data: newJob,
    });
  }

  removeExtra(app: any): void {
    const dateStr = this.formatDate(this.selectedDate);
    const payload: any = { appointmentId: app.appointmentId, data: dateStr };
    if (app.shiftId) payload.shiftId = app.shiftId;
    this.routePlannerManagedAppointmentIds.delete(String(app.id || ''));

    if (app.isExtra) {
      this.socketService.emitUpdate({
        type: 'removeExtra',
        date: this.formatDate(this.selectedDate),
        data: { id: app.id },
      });
    }

    if (app.isExtra && !payload.shiftId) {
      this.appointments = this.appointments.filter((a) => a.id !== app.id);
      return;
    }

    this.http
      .post(this.globalService.url + 'shifts/delete', payload)
      .subscribe({
        next: () => {
          this.appointments = this.appointments.filter((a) => a.id !== app.id);
        },
        error: (err) => {
          console.error('Errore eliminazione turno:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  private parseServerError(err: any): string {
    try {
      const body = typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
      if (body?.error) return body.error;
    } catch {}
    if (err.status === 0) return 'Impossibile connettersi al server';
    return 'Errore imprevisto. Riprova.';
  }

  getBusyDetails(currentApp: any): any[] {
    if (!currentApp?.startDate) return [];

    const currentStartDate = new Date(currentApp.startDate);
    if (isNaN(currentStartDate.getTime())) return [];

    const conflicts: any[] = [];
    const currentStart = currentStartDate.getTime();
    const currentEnd = currentStart + (currentApp.duration || 60) * 60000;

    for (const a of this.appointments) {
      if (a.id === currentApp.id || !a?.startDate) continue;

      const startDate = new Date(a.startDate);
      if (isNaN(startDate.getTime())) continue;

      const start = startDate.getTime();
      const end = start + (a.duration || 60) * 60000;

      if (currentStart < end && currentEnd > start) {
        const empIds = this.assignedShifts[a.id] || [];
        empIds.forEach((empId) => {
          conflicts.push({
            employeeId: empId,
            title: a.title,
            start: this.getShiftTime(a),
            duration: a.duration || 60,
          });
        });
      }
    }

    return conflicts;
  }
}
