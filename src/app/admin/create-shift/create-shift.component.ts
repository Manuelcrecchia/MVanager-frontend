import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { AssignDialogComponent } from '../assign-dialog/assign-dialog.component';
import { VehicleAssignDialogComponent } from '../vehicle-assign-dialog/vehicle-assign-dialog.component';
import { GlobalService } from '../../service/global.service';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { SocketService } from '../../service/soket.service';
import { TenantService } from '../../service/tenant.service';

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
  miniSelectDay(date: Date) { this.selectedDate = new Date(date); this.showMiniCal = false; this.loadAppointments(); this.loadVehiclesCache(); }

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
  vehiclesCache: any[] = [];
  loading = false;
  employeeList: any[] = [];
  previousWeekShiftList: { cliente: string; dipendenti: string[] }[] = [];
  durationOptions: number[] = Array.from({ length: 33 }, (_, i) => i * 15);

  private autosaveTimers: { [jobId: string]: any } = {};
  private autosaveDelayMs = 700;

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
          break;
      }

      this.appointments = [...this.appointments];
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

  changeDuration(app: any, delta: number) {
    this.applyDuration(app);
    if (!app.duration) app.duration = 0;
    app.duration = Math.max(0, Math.min(480, app.duration + delta));
    app.durationDisplay = this.formatDuration(app.duration);
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
    this.scheduleAutosave(app);

    this.socketService.emitUpdate({
      type: 'updateTitle',
      date: this.formatDate(this.selectedDate),
      data: { id: app.id, title: value },
    });
  }

  onDescriptionChange(app: any, value: string) {
    app.description = value;
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
    this.scheduleAutosave(app);

    this.socketService.emitUpdate({
      type: 'updateDuration',
      date: this.formatDate(this.selectedDate),
      data: { id: app.id, duration: value },
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
    const dateStr = this.formatDate(this.selectedDate);

    this.appointments = [];
    this.assignedShifts = {};
    this.assignedCapisquadra = {};
    this.assignedCapisquadraNotes = {};
    this.assignedVehicles = {};

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

                this.appointments.push({
                  id: newId,
                  shiftId: s.id,
                  originalAppointmentId: s.appointmentId,
                  appointmentId: s.appointmentId,
                  isExtra: false,
                  title,
                  description,
                  numeroCliente: s.appointment?.numeroCliente || null,
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
              continue;
            }

            app.shiftId = s.id;

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
          }
        }

        this.sortAppointments();
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
        this.scheduleAutosave(app, true);

        this.socketService.emitUpdate({
          type: 'assignEmployees',
          date: this.formatDate(this.selectedDate),
          data: { id: app.id, employees: this.assignedShifts[app.id] },
        });

        if (result.forceConfirmed) {
          app.forceConfirmed = true;
        }
      }
    });
  }

  getEmployeeTotalDuration(empId: number): string {
    const jobs = this.getEmployeeShifts(empId);
    const totalMinutes = jobs.reduce(
      (sum, job) => sum + (job.duration || 0),
      0,
    );
    return this.formatDuration(totalMinutes);
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
