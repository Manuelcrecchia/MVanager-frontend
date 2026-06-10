import { Component, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, ActivatedRoute } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { TenantService } from '../../service/tenant.service';

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

@Component({
  selector: 'app-shift-home',
  templateUrl: './shift-home.component.html',
  styleUrl: './shift-home.component.css',
})
export class ShiftHomeComponent implements OnInit {
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
    this.selectedDate = new Date(date);
    this.showMiniCal = false;
    this.loadShifts();
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
  ) {}

  ngOnInit(): void {
    const dateParam = this.route.snapshot.queryParamMap.get('date');
    if (dateParam) this.selectedDate = this.parseLocalDate(dateParam);
    this.loadShifts();
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
    if (!this.tenantService.isSami) return false;

    return (
      shift?.keyRequired === true ||
      shift?.appointment?.keyRequired === true ||
      shift?.appointment?.customer?.key === true
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
    this.selectedDate = d;
    this.loadShifts();
  }

  nextDay(): void {
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() + 1);
    this.selectedDate = d;
    this.loadShifts();
  }

  createShifts(): void {
    this.router.navigate(['/admin/shifts/create'], {
      queryParams: { date: this.formatDate(this.selectedDate) },
    });
  }

  back(): void {
    this.router.navigate(['/homeAdmin']);
  }

  handleClick(event: MouseEvent, appointmentId: number): void {
    if (!this.tenantService.isSami) return;

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
      alert('Nessun numero di telefono trovato per questo dipendente');
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
      shift?.customer?.numeroCliente ??
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
