import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { TenantService } from '../../service/tenant.service';
import { Subscription } from 'rxjs';
import { ContactRequirementPromptService } from '../../service/contact-requirement-prompt.service';

interface ShiftRow {
  empId: number;
  title: string;
  numeroCliente?: string | null;
  description: string;
  start: string | null;
  duration: number;
  appointmentId: number;
  keyRequired: boolean;
  cellulare?: string | null;
  colleghi?: string[];
  published: boolean;
  vehicleName?: string | null;
  vehiclePlate?: string | null;
  vehicles?: { name: string; plate?: string | null }[];
  sortOrder?: number | null;
}

interface ClientRow {
  empId: number;
  empName: string;
  numeroCliente?: string | null;
  start: string | null;
  duration: number;
  published: boolean;
  cellulare?: string | null;
  description: string;
  vehicleName?: string | null;
  vehiclePlate?: string | null;
  vehicles?: { name: string; plate?: string | null }[];
  keyRequired: boolean;
  appointmentId: number;
}

interface RoutePlannerStop {
  id: string;
  shiftId: number;
  title: string;
  label: string;
  address: string;
  start: string | null;
  plannedStart: string;
  plannedEnd: string;
  duration: number;
  travelBefore: number;
  mapX: number;
  mapY: number;
  teamIndex: number;
}

interface RoutePlannerTeam {
  index: number;
  name: string;
  stops: RoutePlannerStop[];
  totalWorkMinutes: number;
  totalTravelMinutes: number;
  totalMinutes: number;
  googleMapsUrl: string;
}

@Component({
  selector: 'app-shift-home',
  templateUrl: './shift-home.component.html',
  styleUrl: './shift-home.component.css',
})
export class ShiftHomeComponent implements OnInit, OnDestroy {
  @ViewChild('routePlannerMap') routePlannerMap?: ElementRef<HTMLDivElement>;

  selectedDate: Date = new Date();

  // Mini calendar
  showMiniCal = false;
  miniCalDate = new Date();

  readonly DAYS_SHORT = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  readonly MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
    'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

  get miniCalTitle(): string {
    return `${this.MONTHS_IT[this.miniCalDate.getMonth()]} ${this.miniCalDate.getFullYear()}`;
  }

  get miniCalGrid(): Date[][] {
    const year = this.miniCalDate.getFullYear();
    const month = this.miniCalDate.getMonth();
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

  isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  }

  toggleMiniCal() { this.showMiniCal = !this.showMiniCal; this.miniCalDate = new Date(this.selectedDate); }
  miniPrev() { const d = new Date(this.miniCalDate); d.setMonth(d.getMonth()-1); this.miniCalDate = d; }
  miniNext() { const d = new Date(this.miniCalDate); d.setMonth(d.getMonth()+1); this.miniCalDate = d; }

  miniSelectDay(date: Date) {
    this.showMiniCal = false;
    this.setSelectedDate(date);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const t = event.target as HTMLElement;
    if (!t.closest('.shift-mini-cal-wrapper') && !t.closest('.shift-date-btn')) {
      this.showMiniCal = false;
    }
  }

  viewMode: 'employee' | 'client' = 'employee';

  toggleViewMode() {
    this.viewMode = this.viewMode === 'employee' ? 'client' : 'employee';
  }

  get groupedByClient(): { [key: string]: ClientRow[] } {
    const result: { [key: string]: ClientRow[] } = {};
    this.clientLabels = {};
    for (const shift of this.shifts) {
      const numeroCliente = this.getShiftNumeroCliente(shift);
      const clientLabel = this.getShiftClientLabel(shift);
      const clientKey = numeroCliente || `appointment-${shift?.appointmentId || shift?.id || clientLabel}`;
      const employees = Array.isArray(shift.employees) ? shift.employees : [];
      if (!result[clientKey]) result[clientKey] = [];
      this.clientLabels[clientKey] = clientLabel;
      for (const emp of employees) {
        const empId = Number(emp?.id) || 0;
        const empName = `${emp?.nome ?? ''} ${emp?.cognome ?? ''}`.trim();
        result[clientKey].push({
          empId,
          empName,
          numeroCliente,
          start: shift?.startDate && shift?.startDate !== 'null' && shift?.startDate !== '' ? shift.startDate : null,
          duration: this.getShiftEmployeeLink(emp)?.durationOverride != null
            ? Number(this.getShiftEmployeeLink(emp).durationOverride) || 0
            : Number(shift?.duration) || 0,
          published: this.getShiftEmployeeLink(emp)?.published === true,
          cellulare: emp?.cellulare ?? null,
          description: shift?.description || '',
          vehicleName: shift?.vehicles?.length ? shift.vehicles[0].name : (shift?.vehicle?.name ?? null),
          vehiclePlate: shift?.vehicles?.length ? shift.vehicles[0].plate : (shift?.vehicle?.plate ?? null),
          vehicles: Array.isArray(shift?.vehicles) ? shift.vehicles : (shift?.vehicle ? [shift.vehicle] : []),
          keyRequired: this.resolveKeyRequired(shift),
          appointmentId: Number(shift?.appointmentId) || 0,
        });
      }
    }
    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => a.empName.localeCompare(b.empName));
    }
    return result;
  }

  clientKeys(): string[] {
    return Object.keys(this.groupedByClient).sort();
  }

  getClientDisplayName(clientKey: string): string {
    return this.clientLabels[clientKey] || clientKey;
  }

  shifts: any[] = [];
  groupedByEmployee: { [key: string]: ShiftRow[] } = {};
  clientLabels: { [key: string]: string } = {};

  selectedEmployees: number[] = [];
  selectAll: boolean = false;
  isSaving: boolean = false;
  routePlannerOpen = false;
  routePlannerTeamsCount = 2;
  routePlannerStartTime = '08:00';
  routePlannerTravelMinutes = 15;
  routePlannerTeams: RoutePlannerTeam[] = [];
  routePlannerMessage = '';
  googleMapsLoading = false;
  googleMapsError = '';
  private googleMapsPromise: Promise<void> | null = null;
  private googleMap: any = null;
  private googleDirectionsRenderers: any[] = [];
  private googleMarkers: any[] = [];
  private queryParamSubscription?: Subscription;
  private tenantConfigLoaded = false;

  tooltipVisible: boolean = false;
  tooltipText: string = '';
  tooltipPosition = { top: 0, left: 0 };
  tooltipTarget: HTMLElement | null = null;

  constructor(
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private globalService: GlobalService,
    public tenantService: TenantService,
    private contactPrompt: ContactRequirementPromptService,
  ) {}

  ngOnInit(): void {
    this.queryParamSubscription = this.route.queryParamMap.subscribe((params) => {
      const dateParam = params.get('date');
      if (!dateParam) return;

      const nextDate = this.parseLocalDate(dateParam);
      if (Number.isNaN(nextDate.getTime()) || this.isSameDay(nextDate, this.selectedDate)) return;

      this.selectedDate = nextDate;
      this.miniCalDate = new Date(nextDate);
      if (this.tenantConfigLoaded) this.loadShifts();
    });

    this.globalService.loadTenantConfig().finally(() => {
      this.tenantConfigLoaded = true;
      this.loadShifts();
    });
  }

  ngOnDestroy(): void {
    this.queryParamSubscription?.unsubscribe();
  }

  groupedKeys(): string[] {
    return Object.keys(this.groupedByEmployee || {}).sort();
  }

  getEmpId(empName: string): number {
    return this.groupedByEmployee[empName]?.[0]?.empId ?? 0;
  }

  private isEmployeePublished(empId: number): boolean {
    if (!empId) return false;

    const rows = Object.values(this.groupedByEmployee || {})
      .flat()
      .filter((r) => r.empId === empId);

    if (rows.length === 0) return false;

    return rows.every((r) => r.published === true);
  }

  private formatDate(date: Date): string {
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

  private resolveKeyRequired(shift: any): boolean {
    if (!this.canShowKeyTag()) return false;

    return (
      shift?.keyRequired === true ||
      shift?.appointment?.keyRequired === true ||
      shift?.appointment?.customer?.key === true
    );
  }

  canShowKeyTag(): boolean {
    return (
      this.globalService.hasTenantFeature('stamping') &&
      this.globalService.hasPermission('STAMPING_VIEW')
    );
  }

  private parseSortMap(value: any): Record<number, number> {
    if (!value) return {};

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }

    if (typeof value === 'object') {
      return value;
    }

    return {};
  }

  private parseStartMillis(value: string | null): number | null {
    if (!value) return null;

    const d = new Date(value);
    if (isNaN(d.getTime())) return null;

    return d.getTime();
  }

  private formatTime(value: string | null): string {
    if (!value) return '--:--';

    const d = new Date(value);
    if (isNaN(d.getTime())) return '--:--';

    return d.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private calculateEndTime(start: string | null, duration: number): string {
    if (!start) return '--:--';

    const d = new Date(start);
    if (isNaN(d.getTime())) return '--:--';

    const end = new Date(d.getTime() + (Number(duration) || 0) * 60000);

    return end.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatLongDate(date: Date): string {
    return date.toLocaleDateString('it-IT', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  formatDuration(minutes: number): string {
    if (!minutes) return '0 minuti';

    const h = Math.floor(minutes / 60);
    const m = minutes % 60;

    if (h > 0 && m > 0) {
      return `${h} ${h === 1 ? 'ora' : 'ore'} e ${m} minuti`;
    }

    if (h > 0) {
      return `${h} ${h === 1 ? 'ora' : 'ore'}`;
    }

    return `${m} minuti`;
  }

  loadShifts(): void {
    const dateStr = this.formatDate(this.selectedDate);

    this.http
      .get<any[]>(`${this.globalService.url}shifts/byDate/${dateStr}`)
      .subscribe({
        next: (data: any[]) => {
          const shiftsArray = Array.isArray(data) ? data : [];

          this.shifts = shiftsArray;
          this.groupedByEmployee = this.organizeByEmployee(shiftsArray);
          if (this.routePlannerOpen) {
            this.generateRoutePreview();
          }

          const allIds = this.groupedKeys()
            .map((name) => this.getEmpId(name))
            .filter((id) => id > 0);

          this.selectedEmployees = allIds.filter((id) =>
            this.isEmployeePublished(id),
          );

          this.updateSelectAllState();
        },
        error: (err) => {
          console.error('Errore caricamento turni:', err);
          alert('Errore nel caricamento dei turni');
        },
      });
  }

  private organizeByEmployee(shifts: any[]): { [key: string]: ShiftRow[] } {
    const result: { [key: string]: ShiftRow[] } = {};

    for (const shift of shifts) {
      const employees = Array.isArray(shift.employees) ? shift.employees : [];
      const sortMap = this.parseSortMap(shift?.sortOrderByEmployee);

      const allNames: string[] = employees.map((e: any) =>
        `${e?.nome ?? ''} ${e?.cognome ?? ''}`.trim(),
      );

      for (const emp of employees) {
        const empId = Number(emp?.id) || 0;
        const key: string = `${emp?.nome ?? ''} ${emp?.cognome ?? ''}`.trim();

        if (!result[key]) result[key] = [];

        const colleghi: string[] = allNames.filter(
          (name: string) => name !== key,
        );

        const link = this.getShiftEmployeeLink(emp);
        const joinPublished: boolean = link?.published === true;

        result[key].push({
          empId,
          title: shift?.appointment?.title || shift?.title || '-',
          numeroCliente: this.getShiftNumeroCliente(shift),
          description: shift?.description || '',
          start:
            shift?.startDate &&
            shift?.startDate !== 'null' &&
            shift?.startDate !== ''
              ? shift.startDate
              : null,
          duration:
            link?.durationOverride != null
              ? Number(link.durationOverride) || 0
              : Number(shift?.duration) || 0,
          appointmentId: Number(shift?.appointmentId) || 0,
          keyRequired: this.resolveKeyRequired(shift),
          cellulare: emp?.cellulare ?? null,
          colleghi,
          published: joinPublished,
          vehicleName: shift?.vehicles?.length ? shift.vehicles[0].name : (shift?.vehicle?.name ?? null),
          vehiclePlate: shift?.vehicles?.length ? shift.vehicles[0].plate : (shift?.vehicle?.plate ?? null),
          vehicles: Array.isArray(shift?.vehicles) ? shift.vehicles : (shift?.vehicle ? [shift.vehicle] : []),
          sortOrder:
            sortMap[empId] != null ? Number(sortMap[empId]) || 0 : null,
        });
      }
    }

    for (const empName of Object.keys(result)) {
      result[empName].sort((a, b) => {
        const orderA = a.sortOrder;
        const orderB = b.sortOrder;

        if (orderA != null && orderB != null && orderA !== orderB) {
          return orderA - orderB;
        }

        if (orderA != null && orderB == null) return -1;
        if (orderA == null && orderB != null) return 1;

        const startA = this.parseStartMillis(a.start);
        const startB = this.parseStartMillis(b.start);

        if (startA != null && startB != null && startA !== startB) {
          return startA - startB;
        }

        if (startA != null && startB == null) return -1;
        if (startA == null && startB != null) return 1;

        return 0;
      });
    }

    return result;
  }

  canUseRoutePlanning(): boolean {
    return (
      this.globalService.hasTenantFeature('routePlanning') &&
      this.globalService.hasPermission('SHIFTS_MANAGE')
    );
  }

  toggleRoutePlanner(): void {
    this.routePlannerOpen = !this.routePlannerOpen;
    if (this.routePlannerOpen) {
      this.googleMapsError = '';
      this.generateRoutePreview();
    } else {
      this.clearGoogleMapOverlays();
      this.googleMap = null;
      this.googleMapsLoading = false;
      this.googleMapsError = '';
    }
  }

  get totalShiftCount(): number {
    return this.shifts.length;
  }

  get totalEmployeeCount(): number {
    const ids = new Set<number>();
    for (const shift of this.shifts) {
      for (const emp of Array.isArray(shift?.employees) ? shift.employees : []) {
        const id = Number(emp?.id);
        if (id) ids.add(id);
      }
    }
    return ids.size;
  }

  get publishedEmployeeCount(): number {
    const ids = new Set<number>();
    for (const shift of this.shifts) {
      for (const emp of Array.isArray(shift?.employees) ? shift.employees : []) {
        const id = Number(emp?.id);
        if (id && this.getShiftEmployeeLink(emp)?.published === true) ids.add(id);
      }
    }
    return ids.size;
  }

  get routePlannerStopsCount(): number {
    return this.routePlannerTeams.reduce((total, team) => total + team.stops.length, 0);
  }

  get mapStops(): RoutePlannerStop[] {
    return this.routePlannerTeams.flatMap((team) => team.stops);
  }

  get hasRoutePlannerPlan(): boolean {
    return this.routePlannerTeams.some((team) => team.stops.length);
  }

  generateRoutePreview(): void {
    const stops = this.buildRoutePlannerStops();
    const teamsCount = Math.max(1, Math.min(12, Math.floor(Number(this.routePlannerTeamsCount) || 1)));
    this.routePlannerTeamsCount = teamsCount;

    const teams: RoutePlannerTeam[] = Array.from({ length: teamsCount }, (_, index) => ({
      index,
      name: `Squadra ${index + 1}`,
      stops: [],
      totalWorkMinutes: 0,
      totalTravelMinutes: 0,
      totalMinutes: 0,
      googleMapsUrl: '',
    }));

    if (!stops.length) {
      this.routePlannerTeams = teams;
      this.routePlannerMessage = 'Nessun lavoro pianificabile per questa data.';
      this.renderGoogleMapSoon();
      return;
    }

    const orderedStops = this.orderStopsForMap(stops);
    for (const stop of orderedStops) {
      const targetTeam = [...teams].sort((a, b) => a.totalMinutes - b.totalMinutes)[0];
      const travelBefore = targetTeam.stops.length ? this.normalizedTravelMinutes() : 0;
      const startMinutes = this.resolvePlannedStartMinutes(targetTeam, stop, travelBefore);
      const plannedStop = {
        ...stop,
        travelBefore,
        plannedStart: this.minutesToTime(startMinutes),
        plannedEnd: this.minutesToTime(startMinutes + stop.duration),
        teamIndex: targetTeam.index,
      };

      targetTeam.stops.push(plannedStop);
      targetTeam.totalWorkMinutes += plannedStop.duration;
      targetTeam.totalTravelMinutes += travelBefore;
      targetTeam.totalMinutes = (startMinutes + plannedStop.duration) - this.basePlannerStartMinutes();
    }

    for (const team of teams) {
      team.totalMinutes = team.totalWorkMinutes + team.totalTravelMinutes;
      team.googleMapsUrl = this.buildGoogleMapsDirectionsUrl(team.stops);
    }

    this.routePlannerTeams = teams;
    this.routePlannerMessage = this.hasGoogleMapsKey()
      ? 'Preview calcolata sui turni del giorno. La mappa usa Google Maps per disegnare i percorsi.'
      : 'Preview calcolata sui turni del giorno. La mappa e schematica e non usa servizi a pagamento.';
    this.renderGoogleMapSoon();
  }

  routeTeamColor(index: number): string {
    const colors = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#be123c'];
    return colors[index % colors.length];
  }

  markerTitle(stop: RoutePlannerStop): string {
    return `${stop.label} - ${stop.plannedStart}/${stop.plannedEnd}`;
  }

  routePolylinePoints(team: RoutePlannerTeam): string {
    return team.stops
      .map((stop) => `${Math.max(0, Math.min(100, stop.mapX))},${Math.max(0, Math.min(100, stop.mapY))}`)
      .join(' ');
  }

  hasGoogleMapsKey(): boolean {
    return !!this.globalService.getGoogleMapsConfig().googleMapsApiKey;
  }

  private renderGoogleMapSoon(): void {
    if (!this.routePlannerOpen) return;
    window.setTimeout(() => this.renderGoogleMap(), 0);
  }

  private renderGoogleMap(): void {
    if (!this.routePlannerOpen) return;

    if (!this.hasGoogleMapsKey()) {
      this.googleMapsLoading = false;
      this.googleMapsError = '';
      this.clearGoogleMapOverlays();
      return;
    }

    if (!this.routePlannerMap?.nativeElement) {
      this.renderGoogleMapSoon();
      return;
    }

    this.googleMapsLoading = true;
    this.googleMapsError = '';

    this.loadGoogleMaps()
      .then(() => {
        this.googleMapsLoading = false;
        this.drawGoogleRoutes();
      })
      .catch((error) => {
        this.googleMapsLoading = false;
        this.googleMapsError =
          error?.message || 'Impossibile caricare Google Maps. Verifica chiave e API abilitate.';
      });
  }

  private loadGoogleMaps(): Promise<void> {
    const win = window as any;
    if (win.google?.maps) {
      return Promise.resolve();
    }
    if (this.googleMapsPromise) {
      return this.googleMapsPromise;
    }

    const config = this.globalService.getGoogleMapsConfig();
    const apiKey = config.googleMapsApiKey;
    if (!apiKey) {
      return Promise.reject(new Error('Chiave Google Maps mancante.'));
    }

    this.googleMapsPromise = new Promise<void>((resolve, reject) => {
      const callbackName = `__mvanagerGoogleMapsReady_${Date.now()}`;
      win[callbackName] = () => {
        delete win[callbackName];
        resolve();
      };

      const params = new URLSearchParams({
        key: apiKey,
        callback: callbackName,
        loading: 'async',
        language: 'it',
        region: 'IT',
      });
      if (config.googleMapsMapId) {
        params.set('map_ids', config.googleMapsMapId);
      }

      const existingScript = document.getElementById('mvanager-google-maps-js');
      existingScript?.remove();

      const script = document.createElement('script');
      script.id = 'mvanager-google-maps-js';
      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => {
        delete win[callbackName];
        this.googleMapsPromise = null;
        script.remove();
        reject(new Error('Caricamento script Google Maps fallito.'));
      };
      document.head.appendChild(script);
    });

    return this.googleMapsPromise;
  }

  private drawGoogleRoutes(): void {
    const google = (window as any).google;
    const mapElement = this.routePlannerMap?.nativeElement;
    if (!google?.maps || !mapElement) return;

    const mapConfig = this.globalService.getGoogleMapsConfig();
    if (!this.googleMap) {
      this.googleMap = new google.maps.Map(mapElement, {
        center: { lat: 41.9028, lng: 12.4964 },
        zoom: 11,
        mapId: mapConfig.googleMapsMapId || undefined,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      });
    }

    this.clearGoogleMapOverlays();

    if (!this.hasRoutePlannerPlan) {
      this.googleMap.setCenter({ lat: 41.9028, lng: 12.4964 });
      this.googleMap.setZoom(11);
      return;
    }

    const directionsService = new google.maps.DirectionsService();
    const geocoder = new google.maps.Geocoder();
    const bounds = new google.maps.LatLngBounds();
    const routePromises = this.routePlannerTeams
      .filter((team) => team.stops.length > 0)
      .map((team) => this.drawTeamRoute(google, directionsService, geocoder, bounds, team));

    Promise.all(routePromises).then((statuses) => {
      const failed = statuses.filter((status) => status !== 'OK');
      if (!bounds.isEmpty()) {
        this.googleMap.fitBounds(bounds, 40);
      }
      this.googleMapsError = failed.length
        ? 'Alcuni indirizzi non sono stati risolti da Google Maps. Controlla le vie salvate sui clienti.'
        : '';
    });
  }

  private drawTeamRoute(
    google: any,
    directionsService: any,
    geocoder: any,
    bounds: any,
    team: RoutePlannerTeam,
  ): Promise<string> {
    const color = this.routeTeamColor(team.index);
    const locations = team.stops
      .map((stop) => stop.address || stop.title)
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    if (!locations.length) return Promise.resolve('ZERO_RESULTS');

    if (locations.length === 1) {
      return this.drawSingleGoogleMarker(google, geocoder, bounds, team.stops[0], color);
    }

    const renderer = new google.maps.DirectionsRenderer({
      map: this.googleMap,
      suppressMarkers: true,
      preserveViewport: true,
      polylineOptions: {
        strokeColor: color,
        strokeOpacity: 0.88,
        strokeWeight: 5,
      },
    });
    this.googleDirectionsRenderers.push(renderer);

    const request = {
      origin: locations[0],
      destination: locations[locations.length - 1],
      waypoints: locations.slice(1, -1).slice(0, 23).map((location) => ({
        location,
        stopover: true,
      })),
      optimizeWaypoints: false,
      travelMode: google.maps.TravelMode.DRIVING,
    };

    return directionsService.route(request)
      .then((response: any) => {
        renderer.setDirections(response);
        this.addRouteMarkersFromDirections(google, bounds, response, team, color);
        return 'OK';
      })
      .catch(() => Promise.all(
        team.stops.map((stop) => this.drawSingleGoogleMarker(google, geocoder, bounds, stop, color)),
      ).then(() => 'PARTIAL'));
  }

  private addRouteMarkersFromDirections(
    google: any,
    bounds: any,
    response: any,
    team: RoutePlannerTeam,
    color: string,
  ): void {
    const legs = response?.routes?.[0]?.legs || [];
    if (!legs.length) return;

    const positions = [
      legs[0].start_location,
      ...legs.map((leg: any) => leg.end_location),
    ];

    positions.slice(0, team.stops.length).forEach((position: any, index: number) => {
      const stop = team.stops[index];
      if (!position || !stop) return;
      bounds.extend(position);
      this.googleMarkers.push(new google.maps.Marker({
        map: this.googleMap,
        position,
        label: {
          text: String(index + 1),
          color: '#ffffff',
          fontWeight: '700',
        },
        title: `${team.name}: ${stop.title}`,
        icon: this.buildMarkerIcon(color),
      }));
    });
  }

  private drawSingleGoogleMarker(
    google: any,
    geocoder: any,
    bounds: any,
    stop: RoutePlannerStop,
    color: string,
  ): Promise<string> {
    const address = stop.address || stop.title;
    return geocoder.geocode({ address, region: 'IT' })
      .then((result: any) => {
        const location = result?.results?.[0]?.geometry?.location;
        if (!location) return 'ZERO_RESULTS';
        bounds.extend(location);
        this.googleMarkers.push(new google.maps.Marker({
          map: this.googleMap,
          position: location,
          label: {
            text: stop.label,
            color: '#ffffff',
            fontWeight: '700',
          },
          title: stop.title,
          icon: this.buildMarkerIcon(color),
        }));
        return 'OK';
      })
      .catch(() => 'ZERO_RESULTS');
  }

  private buildMarkerIcon(color: string): any {
    const google = (window as any).google;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">` +
      `<path fill="${color}" d="M18 2C11.4 2 6 7.3 6 13.9c0 8.6 12 20.1 12 20.1s12-11.5 12-20.1C30 7.3 24.6 2 18 2z"/>` +
      `<circle cx="18" cy="14" r="5" fill="white" opacity=".95"/></svg>`;

    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
      scaledSize: new google.maps.Size(36, 36),
      labelOrigin: new google.maps.Point(18, 14),
    };
  }

  private clearGoogleMapOverlays(): void {
    this.googleDirectionsRenderers.forEach((renderer) => renderer.setMap(null));
    this.googleMarkers.forEach((marker) => marker.setMap(null));
    this.googleDirectionsRenderers = [];
    this.googleMarkers = [];
  }

  private buildRoutePlannerStops(): RoutePlannerStop[] {
    return this.shifts
      .filter((shift) => shift?.appointmentId || shift?.title || shift?.appointment?.title)
      .map((shift, index) => {
        const title = this.cleanShiftTitle(shift?.appointment?.title || shift?.title || `Lavoro ${index + 1}`);
        const address = this.getShiftAddress(shift) || title;
        const point = this.buildPseudoMapPoint(`${address}-${shift?.id || index}`);
        return {
          id: String(shift?.id || shift?.appointmentId || index),
          shiftId: Number(shift?.id) || 0,
          title,
          label: `${index + 1}`,
          address,
          start: shift?.startDate || null,
          plannedStart: '--:--',
          plannedEnd: '--:--',
          duration: Math.max(15, Number(shift?.duration) || this.inferShiftDuration(shift) || 60),
          travelBefore: 0,
          mapX: point.x,
          mapY: point.y,
          teamIndex: 0,
        };
      });
  }

  private orderStopsForMap(stops: RoutePlannerStop[]): RoutePlannerStop[] {
    const center = { x: 50, y: 50 };
    return [...stops].sort((a, b) => {
      const startA = this.timeToMinutesFromDate(a.start);
      const startB = this.timeToMinutesFromDate(b.start);
      if (startA !== null && startB !== null && startA !== startB) return startA - startB;
      if (startA !== null && startB === null) return -1;
      if (startA === null && startB !== null) return 1;

      const angleA = Math.atan2(a.mapY - center.y, a.mapX - center.x);
      const angleB = Math.atan2(b.mapY - center.y, b.mapX - center.x);
      return angleA - angleB;
    });
  }

  private resolvePlannedStartMinutes(
    team: RoutePlannerTeam,
    stop: RoutePlannerStop,
    travelBefore: number,
  ): number {
    const baseStart = this.basePlannerStartMinutes();
    const previous = team.stops[team.stops.length - 1];
    const earliestForTeam = previous
      ? this.timeToMinutes(previous.plannedEnd) + travelBefore
      : baseStart;
    const requestedStart = this.timeToMinutesFromDate(stop.start);
    return Math.max(earliestForTeam, requestedStart ?? baseStart);
  }

  private inferShiftDuration(shift: any): number {
    const start = shift?.startDate ? new Date(shift.startDate) : null;
    const end = shift?.endDate ? new Date(shift.endDate) : null;
    if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  }

  private normalizedTravelMinutes(): number {
    return Math.max(0, Math.min(180, Math.floor(Number(this.routePlannerTravelMinutes) || 0)));
  }

  private basePlannerStartMinutes(): number {
    return this.timeToMinutes(this.routePlannerStartTime) || 8 * 60;
  }

  private timeToMinutes(value: string | null | undefined): number {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return 0;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) return 0;
    return h * 60 + m;
  }

  private timeToMinutesFromDate(value: string | null): number | null {
    if (!value) return null;
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.getHours() * 60 + date.getMinutes();
  }

  private minutesToTime(minutes: number): string {
    const normalized = ((Math.floor(minutes) % 1440) + 1440) % 1440;
    const h = Math.floor(normalized / 60);
    const m = normalized % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private buildPseudoMapPoint(seed: string): { x: number; y: number } {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const x = 12 + (hash % 76);
    const y = 14 + ((Math.floor(hash / 97)) % 70);
    return { x, y };
  }

  private getShiftAddress(shift: any): string {
    const customer = this.getShiftCustomer(shift);
    const dynamicCustomerAddress = this.buildCustomerAddress(customer);
    const candidates = [
      dynamicCustomerAddress,
      shift?.appointment?.customer?.address,
      shift?.appointment?.Customer?.address,
      shift?.appointment?.customer?.indirizzo,
      shift?.appointment?.Customer?.indirizzo,
      shift?.appointment?.customer?.customerAddress,
      shift?.appointment?.Customer?.customerAddress,
      shift?.appointment?.description,
      shift?.description,
      shift?.appointment?.title,
      shift?.title,
    ];
    return candidates
      .map((value) => String(value || '').trim())
      .find((value) => value.length > 3) || '';
  }

  private getShiftCustomer(shift: any): any {
    return (
      shift?.appointment?.customer ||
      shift?.appointment?.Customer ||
      shift?.customer ||
      shift?.Customer ||
      null
    );
  }

  private buildCustomerAddress(customer: any): string {
    if (!customer || typeof customer !== 'object') return '';

    const configuredAddress = this.globalService.buildCustomerAddress(customer, 'work');
    if (configuredAddress) return configuredAddress;

    const preferredKeys = Object.keys(customer).filter((key) => {
      const normalized = key
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      return (
        normalized.includes('indirizzo') ||
        normalized.includes('address') ||
        normalized.includes('via') ||
        normalized.includes('citta') ||
        normalized.includes('city') ||
        normalized.includes('cap') ||
        normalized.includes('zip') ||
        normalized.includes('partenza') ||
        normalized.includes('arrivo')
      );
    });

    const partenza = preferredKeys
      .filter((key) => key.toLowerCase().includes('partenza'))
      .map((key) => String(customer[key] || '').trim())
      .filter(Boolean);
    if (partenza.length) return [...new Set(partenza)].join(', ');

    return [...new Set(
      preferredKeys
        .map((key) => String(customer[key] || '').trim())
        .filter((value) => value && value.length > 2),
    )].slice(0, 5).join(', ');
  }

  private buildGoogleMapsDirectionsUrl(stops: RoutePlannerStop[]): string {
    if (!stops.length) return '';
    const locations = stops
      .map((stop) => stop.address || stop.title)
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (!locations.length) return '';

    const params = new URLSearchParams();
    params.set('api', '1');
    params.set('travelmode', 'driving');
    if (locations.length === 1) {
      params.set('destination', locations[0]);
    } else {
      params.set('origin', locations[0]);
      params.set('destination', locations[locations.length - 1]);
      const waypoints = locations.slice(1, -1).slice(0, 9);
      if (waypoints.length) params.set('waypoints', waypoints.join('|'));
    }
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  toggleEmployeeSelection(empId: number): void {
    if (!empId) return;

    const index = this.selectedEmployees.indexOf(empId);

    if (index >= 0) {
      this.selectedEmployees.splice(index, 1);
    } else {
      this.selectedEmployees.push(empId);
    }

    this.updateSelectAllState();
  }

  toggleSelectAll(): void {
    const allIds = this.groupedKeys()
      .map((name) => this.getEmpId(name))
      .filter((id) => id > 0);

    if (this.selectAll) {
      this.selectedEmployees = [...allIds];
    } else {
      this.selectedEmployees = [];
    }
  }

  private updateSelectAllState(): void {
    const allIds = this.groupedKeys()
      .map((name) => this.getEmpId(name))
      .filter((id) => id > 0);

    this.selectAll =
      allIds.length > 0 &&
      allIds.every((id) => this.selectedEmployees.includes(id));
  }

  savePublication(): void {
    if (this.isSaving) return;

    const dateStr = this.formatDate(this.selectedDate);

    const allIds = this.groupedKeys()
      .map((name) => this.getEmpId(name))
      .filter((id) => id > 0);

    if (allIds.length === 0) {
      alert('Nessun dipendente presente per questa data.');
      return;
    }

    const employees = allIds.map((id) => ({
      id,
      published: this.selectedEmployees.includes(id),
    }));

    this.isSaving = true;

    this.http
      .post(`${this.globalService.url}shifts/publish`, {
        date: dateStr,
        employees,
      })
      .subscribe({
        next: (res: any) => {
          this.isSaving = false;
          this.loadShifts();
          if (res?.message) alert(res.message);
        },
        error: (err) => {
          console.error('Errore pubblicazione:', err);
          this.isSaving = false;
          alert('Errore durante la pubblicazione.');
        },
      });
  }

  prevDay(): void {
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() - 1);
    this.setSelectedDate(d);
  }

  nextDay(): void {
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() + 1);
    this.setSelectedDate(d);
  }

  private setSelectedDate(date: Date): void {
    const nextDate = new Date(date);
    if (Number.isNaN(nextDate.getTime())) return;

    this.selectedDate = nextDate;
    this.miniCalDate = new Date(nextDate);
    this.loadShifts();
    this.syncDateQueryParam();
  }

  private syncDateQueryParam(): void {
    const date = this.formatDate(this.selectedDate);
    if (this.route.snapshot.queryParamMap.get('date') === date) return;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { date },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  createShifts(): void {
    this.router.navigate(['/homeAdmin/shifts/create'], {
      queryParams: { date: this.formatDate(this.selectedDate) },
    });
  }

  back(): void {
    this.router.navigate(['/homeAdmin']);
  }

  handleClick(event: MouseEvent, appointmentId: number): void {
    if (!this.canShowKeyTag()) return;

    const target = event.target as HTMLElement;
    const dateStr = this.formatDate(this.selectedDate);

    if (this.tooltipVisible && this.tooltipTarget === target) {
      this.hideTooltip();
      return;
    }

    this.showPreviousAssignees(appointmentId, dateStr, target);
  }

  private showPreviousAssignees(
    appointmentId: number,
    dateStr: string,
    target: HTMLElement,
  ): void {
    this.tooltipVisible = true;
    this.tooltipText = 'Caricamento...';
    this.tooltipTarget = target;

    const rect = target.getBoundingClientRect();
    const tooltipWidth = 260;
    const tooltipHeight = 44;

    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 8;

    if (left + tooltipWidth > window.innerWidth) {
      left = window.innerWidth - tooltipWidth - 12;
    }

    if (top + tooltipHeight > window.innerHeight + window.scrollY) {
      top = rect.top + window.scrollY - tooltipHeight - 8;
    }

    this.tooltipPosition = { top, left };

    this.http
      .post<any[]>(`${this.globalService.url}shifts/getPreviousAssignees`, {
        appointmentId,
        currentDate: dateStr,
      })
      .subscribe({
        next: (employees: any[]) => {
          if (!Array.isArray(employees) || employees.length === 0) {
            this.tooltipText = 'Nessun assegnato precedente';
            return;
          }

          this.tooltipText = employees
            .map((e: any) => `${e?.nome ?? ''} ${e?.cognome ?? ''}`.trim())
            .filter((name: string) => !!name)
            .join(', ');
        },
        error: () => {
          this.tooltipText = 'Errore nel recupero';
        },
      });
  }

  private hideTooltip(): void {
    this.tooltipVisible = false;
    this.tooltipText = '';
    this.tooltipTarget = null;
  }

  private buildWhatsAppMessage(empName: string, turns: ShiftRow[]): string {
    const lines: string[] = [];

    lines.push(
      `Ciao ${empName}, ecco i tuoi turni del ${this.formatLongDate(this.selectedDate)} 📅`,
    );
    lines.push('');

    if (!turns.length) {
      lines.push('Nessun turno per questa data.');
      return lines.join('\n');
    }

    turns.forEach((turno, index) => {
      const startHour = this.formatTime(turno.start);
      const endHour = this.calculateEndTime(turno.start, turno.duration);
      const colleghiText =
        turno.colleghi && turno.colleghi.length > 0
          ? turno.colleghi.join(', ')
          : 'Da solo';

      lines.push(`${index + 1}. ${this.cleanShiftTitle(turno.title)}`);
      lines.push(`Categoria: ${'-'}`);
      lines.push(`Orario: ${startHour} - ${endHour}`);
      lines.push(`Durata: ${this.formatDuration(turno.duration)}`);
      lines.push(`Con chi: ${colleghiText}`);

      const vehiclesList = turno.vehicles && turno.vehicles.length > 0
        ? turno.vehicles
        : (turno.vehicleName ? [{ name: turno.vehicleName, plate: turno.vehiclePlate }] : []);
      if (vehiclesList.length > 0) {
        const mezziStr = vehiclesList.map((v: any) => v.plate ? `${v.name} (${v.plate})` : v.name).join(', ');
        lines.push(`Mezzo/i: ${mezziStr}`);
      }

      lines.push(`Chiave richiesta: ${turno.keyRequired ? 'Sì' : 'No'}`);
      lines.push(`Descrizione: ${turno.description || 'Nessuna descrizione'}`);
      lines.push('');
    });

    return lines.join('\n').trim();
  }

  sendViaWhatsApp(empName: string): void {
    const phoneRaw = this.groupedByEmployee[empName]?.[0]?.cellulare ?? null;
    const employeeTurns = this.groupedByEmployee[empName] || [];

    if (!phoneRaw) {
      this.contactPrompt.promptEmployeePhoneMissing();
      return;
    }

    if (!employeeTurns.length) {
      alert('Nessun turno trovato per questo dipendente');
      return;
    }

    const phoneDigits = String(phoneRaw).replace(/\D/g, '');

    if (!phoneDigits) {
      alert('Numero di telefono non valido');
      return;
    }

    const phoneWithPrefix = phoneDigits.startsWith('39')
      ? phoneDigits
      : `39${phoneDigits}`;

    const message = this.buildWhatsAppMessage(empName, employeeTurns);
    const encoded = encodeURIComponent(message);

    window.location.href = `https://wa.me/${phoneWithPrefix}?text=${encoded}`;
  }

  private cleanShiftTitle(title: string | null | undefined): string {
    const value = String(title || '').trim();
    if (!value) return 'Sede sconosciuta';

    // Rimuove prefissi tipo:
    // "80 - Pluralis SRLS"
    // "123-Cliente"
    // "45 – Nome cliente"
    return value.replace(/^\s*\d+\s*[-–]\s*/, '').trim() || 'Sede sconosciuta';
  }

  private getShiftNumeroCliente(shift: any): string | null {
    const raw =
      shift?.appointment?.numeroCliente ??
      shift?.appointment?.customer?.numeroCliente ??
      shift?.appointment?.Customer?.numeroCliente ??
      shift?.customer?.numeroCliente ??
      shift?.Customer?.numeroCliente ??
      null;

    if (raw === null || raw === undefined) return null;
    const value = String(raw).trim();
    return value || null;
  }

  private getShiftClientLabel(shift: any): string {
    const numeroCliente = this.getShiftNumeroCliente(shift);
    const cleanedTitle = this.cleanShiftTitle(
      shift?.appointment?.title || shift?.title || '-',
    );

    return numeroCliente ? `${numeroCliente} - ${cleanedTitle}` : cleanedTitle;
  }
}
