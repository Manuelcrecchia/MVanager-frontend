import { Component, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../../service/global.service';
import { Router } from '@angular/router';
import { AutomaticAddInspectionToCalendarService } from '../../../service/automatic-add-inspection-to-calendar.service';
import { PopupServiceService } from '../../../componenti/popup/popup-service.service';
import { TenantService } from '../../../service/tenant.service';
import { InspectionAlarmSyncService } from '../../../service/inspection-alarm-sync.service';

interface RawEvent {
  id: number;
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
}

interface CalEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  description: string;
  categories: string;
  recurrenceRule: string;
  recurrenceException: string[];
  dayLong: boolean;
  isRecurring?: boolean;
  originalId?: number;
  inspectionAdminIds?: number[];
  inspectionReminderMinutes?: number | null;
}

interface AdminOption {
  id: number;
  nome: string;
  cognome: string;
  email: string;
}

interface DayCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  events: CalEvent[];
  eventLayout?: Map<number, {col: number, totalCols: number}>;
}

@Component({
  selector: 'app-calendar-home',
  templateUrl: './calendar-home.component.html',
  styleUrl: './calendar-home.component.css',
})
export class CalendarHomeComponent implements OnInit {
  rawEvents: RawEvent[] = [];
  activeFilter = 'all';
  currentView: 'month' | 'week' | 'day' = 'month';
  currentDate = new Date();

  showMiniCal = false;
  miniCalDate = new Date();

  showPopup = false;
  isNewEvent = true;
  editingEventId: number | null = null;
  isRecurringInstance = false;
  hasRecurrenceRule = false;

  popupTitle = '';
  popupDescription = '';
  popupStartDate = '';
  popupEndDate = '';
  popupCategory = '';
  popupInspectionAdminIds: number[] = [];
  popupInspectionReminderMinutes: number | null = 30;

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

  categories: { id: string; text: string }[] = [];

  constructor(
    private http: HttpClient,
    private globalService: GlobalService,
    private router: Router,
    private autoInspectionService: AutomaticAddInspectionToCalendarService,
    private popupService: PopupServiceService,
    public tenantService: TenantService,
    private inspectionAlarmSync: InspectionAlarmSyncService,
  ) {}

  ngOnInit() {
    this.categories = this.getCategoriesForTenant();
    this.loadAll();
  }

  private quotesMap: Map<string, any> = new Map();

  loadAll() {
    this.http.get(this.globalService.url + 'appointments/getAll', {
      headers: this.globalService.headers, responseType: 'text',
    }).subscribe((res) => {
      this.rawEvents = JSON.parse(res);
      this.buildGrid();
      if (this.autoInspectionService.pass) {
        this.autoInspectionService.pass = false;
        this.openNewPopup(
          new Date(), 'sopralluogo',
          `${this.autoInspectionService.numeroPreventivo} - ${this.autoInspectionService.nominativo}`,
          `Contatto ${this.autoInspectionService.nominativo}   Telefono: ${this.autoInspectionService.telefono}`,
        );
      }
    });

    this.http.get(this.globalService.url + 'quotes/getAll', {
      headers: this.globalService.headers, responseType: 'text',
    }).subscribe((res) => {
      const data = JSON.parse(res);
      this.quotesMap.clear();
      data.forEach((q: any) => {
        this.quotesMap.set(this.normalize(q.numeroPreventivo), q);
      });
      this.nPreventiviArray = data.filter((q: any) => !q.complete)
        .map((q: any) => `${q.numeroPreventivo} - ${q.nominativo}`);
    });

    this.http.get(this.globalService.url + 'customers/getAll', {
      headers: this.globalService.headers, responseType: 'text',
    }).subscribe((res) => {
      this.clientiArray = JSON.parse(res);
    });

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
    return this.activeFilter === 'all'
      ? result
      : result.filter((e) => e.categories === this.activeFilter);
  }

  toCalEvent(raw: RawEvent): CalEvent {
    return {
      id: raw.id,
      title: raw.title,
      start: new Date(raw.startDate),
      end: new Date(raw.endDate),
      description: raw.description,
      categories: raw.categories,
      recurrenceRule: raw.recurrenceRule || '',
      recurrenceException: this.parseExceptions(raw.recurrenceException),
      dayLong: raw.dayLong,
      inspectionAdminIds: Array.isArray(raw.inspectionAdminIds)
        ? raw.inspectionAdminIds.map((id) => Number(id)).filter(Boolean)
        : [],
      inspectionReminderMinutes:
        raw.inspectionReminderMinutes !== null &&
        raw.inspectionReminderMinutes !== undefined
          ? Number(raw.inspectionReminderMinutes)
          : null,
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

    while (current <= rangeEnd && occurrenceCount < 730) {
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
        eventLayout: this.computeOverlapLayout(dayEvs),
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
      eventLayout: this.computeOverlapLayout(dayEvs),
    }];
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

  openNewPopup(date: Date, category = '', title = '', description = '') {
    const start = new Date(date); start.setSeconds(0,0);
    const end = new Date(start.getTime()+30*60000);
    this.isNewEvent=true; this.editingEventId=null; this.isRecurringInstance=false; this.hasRecurrenceRule=false;
    this.popupTitle=title; this.popupDescription=description;
    this.popupStartDate=this.toInputDatetime(start); this.popupEndDate=this.toInputDatetime(end);
    this.popupCategory=category||this.categories[0]?.id||'';
    this.popupInspectionAdminIds = [];
    this.popupInspectionReminderMinutes = 30;
    this.recurrenceEnabled=false; this.recurrenceFreq='DAILY'; this.recurrenceInterval=1;
    this.recurrenceDays=[]; this.recurrenceEndType='never'; this.recurrenceUntil=''; this.recurrenceCount=1;
    this.autocompleteOpen=false; this.showDeleteConfirm=false; this.showPopup=true;
  }

  openEditPopup(ev: CalEvent) {
    this.isNewEvent=false; this.editingEventId=ev.originalId??ev.id;
    this.isRecurringInstance=!!ev.isRecurring; this.hasRecurrenceRule=!!(ev.recurrenceRule&&ev.recurrenceRule.trim()!=='');
    this.popupTitle=ev.title; this.popupDescription=ev.description||'';
    this.popupStartDate=this.toInputDatetime(ev.start); this.popupEndDate=this.toInputDatetime(ev.end);
    this.popupCategory=ev.categories; this.recurrenceEnabled=this.hasRecurrenceRule; this.showDeleteConfirm=false;
    this.popupInspectionAdminIds = Array.isArray(ev.inspectionAdminIds)
      ? [...ev.inspectionAdminIds]
      : [];
    this.popupInspectionReminderMinutes =
      ev.inspectionReminderMinutes !== null && ev.inspectionReminderMinutes !== undefined
        ? Number(ev.inspectionReminderMinutes)
        : 30;
    if (this.recurrenceEnabled) {
      const parts = this.parseRRule(ev.recurrenceRule);
      this.recurrenceFreq=(parts['FREQ'] as any)||'DAILY';
      this.recurrenceInterval=parseInt(parts['INTERVAL']||'1');
      this.recurrenceDays=parts['BYDAY']?parts['BYDAY'].split(','):[];
      if (parts['UNTIL']) { this.recurrenceEndType='until'; const u=parts['UNTIL']; this.recurrenceUntil=`${u.substring(0,4)}-${u.substring(4,6)}-${u.substring(6,8)}`; }
      else if (parts['COUNT']) { this.recurrenceEndType='count'; this.recurrenceCount=parseInt(parts['COUNT']); }
      else this.recurrenceEndType='never';
    }
    this.autocompleteOpen=false; this.showPopup=true;
  }

  closePopup() { this.showPopup=false; this.showDeleteConfirm=false; }

  onDblClickCell(date: Date, slot?: string) {
    const d = new Date(date);
    if (slot) { const [h,m]=slot.split(':'); d.setHours(parseInt(h),parseInt(m),0,0); }
    else d.setHours(9,0,0,0);
    this.openNewPopup(d);
  }

  onEventClick(ev: CalEvent, event: MouseEvent) {
    event.stopPropagation();
    const codice = ev.title?.split(' - ')[0];
    if (ev.categories==='sopralluogo') { this.router.navigate(['/editQuote',codice]); return; }
    if (ev.categories==='ordinario'||ev.categories==='straordinario') this.router.navigate(['/editCustomer',codice]);
  }

  onEventDblClick(ev: CalEvent, event: MouseEvent) { event.stopPropagation(); this.openEditPopup(ev); }

  // ── AUTOCOMPLETE ───────────────────────────────────────────────────────

  onTitleInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.popupTitle = val;
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

    const codice = val.split(' - ')[0];

    // Se la categoria è "sopralluogo", cerca il preventivo
    if (this.popupCategory === 'sopralluogo') {
      const preventivoData = this.quotesMap.get(this.normalize(codice));
      if (preventivoData) {
        this.popupDescription = `Sopralluogo – Contatto: ${preventivoData.nominativo} Telefono: ${preventivoData.telefono}`;
        return;
      }
    }

    // Se la categoria è "ordinario" o "straordinario", cerca il cliente
    if (this.popupCategory === 'ordinario' || this.popupCategory === 'straordinario') {
      const cliente = this.clientiArray.find(c=>this.normalize(`${c.numeroCliente} - ${c.nominativo}`)===this.normalize(val));
      if (cliente) {
        // Categoria già impostata, non cambiarla
        return;
      }
    }
  }

  getAutocompleteSource(categoria: string): string[] {
    if (categoria==='sopralluogo') return this.nPreventiviArray;
    if (categoria==='ordineServizio') return this.clientiArray.map(c=>`${c.numeroCliente} - ${c.nominativo}`);
    if (categoria==='ordinario') {
      if (this.tenantService.isEmmeci) return this.clientiArray.map(c=>`${c.numeroCliente} - ${c.nominativo}`);
      return this.clientiArray.filter(c=>c.tipoCliente==='O').map(c=>`${c.numeroCliente} - ${c.nominativo}`);
    }
    if (categoria==='straordinario'&&this.tenantService.isSami)
      return this.clientiArray.filter(c=>c.tipoCliente==='S').map(c=>`${c.numeroCliente} - ${c.nominativo}`);
    return [];
  }

  onCategoryChange() { this.filteredAutocomplete=this.getAutocompleteSource(this.popupCategory); this.autocompleteOpen=false; }

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
    if (!this.popupStartDate) return;
    this.popupEndDate = this.toInputDatetime(new Date(new Date(this.popupStartDate).getTime()+30*60000));
  }

  // ── RECURRENCE ─────────────────────────────────────────────────────────

  buildRRule(): string {
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

  saveEvent() {
    if (!this.popupTitle||!this.popupStartDate||!this.popupEndDate||!this.popupCategory) {
      this.popupService.text='Compilare tutti i campi obbligatori'; this.popupService.openPopup(); return;
    }
    if (this.popupCategory === 'sopralluogo') {
      if (!this.popupInspectionAdminIds.length) {
        this.popupService.text='Seleziona almeno un utente per il sopralluogo'; this.popupService.openPopup(); return;
      }
      if (this.popupInspectionReminderMinutes === null || this.popupInspectionReminderMinutes < 0) {
        this.popupService.text='Specifica quanti minuti prima inviare il promemoria'; this.popupService.openPopup(); return;
      }
    }
    const codice = this.popupTitle.split(' - ')[0];
    if (!this.validateCodice(codice,this.popupCategory)) {
      this.popupService.text='Codice non valido o non esistente per la categoria selezionata'; this.popupService.openPopup(); return;
    }
    const body: any = {
      title: this.popupTitle,
      startDate: new Date(this.popupStartDate).toISOString(),
      endDate: new Date(this.popupEndDate).toISOString(),
      recurrenceRule: this.buildRRule(),
      dayLong: false, description: this.popupDescription,
      categories: this.popupCategory, recurrenceException: null,
      inspectionAdminIds: this.popupCategory === 'sopralluogo' ? this.popupInspectionAdminIds : [],
      inspectionReminderMinutes:
        this.popupCategory === 'sopralluogo'
          ? this.popupInspectionReminderMinutes
          : null,
    };
    if (!this.isNewEvent) body.id = this.editingEventId;
    this.http.post(this.globalService.url+(this.isNewEvent?'appointments/add':'appointments/edit'), body, {
      headers: this.globalService.headers, responseType: 'text',
    }).subscribe(()=>{
      this.closePopup();
      this.loadAll();
      if (body.categories === 'sopralluogo') {
        this.inspectionAlarmSync.setToken(this.globalService.token);
        this.inspectionAlarmSync.syncSoon('calendar-save', true).catch((err) => {
          console.error('[Calendar] Errore sync sveglie sopralluogo:', err);
        });
        this.sendInspectionConfirmation(body);
      }
    });
  }

  validateCodice(codice: string, categoria: string): boolean {
    if (categoria==='altro'||categoria==='lavoriSvolti') return true;
    if (categoria==='sopralluogo') return this.nPreventiviArray.some(p=>this.normalize(p).startsWith(this.normalize(codice+' -')));
    if (categoria==='ordinario'||categoria==='straordinario'||categoria==='ordineServizio') return this.clientiArray.some(c=>this.normalize(c.numeroCliente.toString())===this.normalize(codice));
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

  deleteAll() {
    this.http.post(this.globalService.url+'appointments/delete',{id:this.editingEventId},{
      headers:this.globalService.headers,responseType:'text',
    }).subscribe(()=>{this.closePopup();this.loadAll();});
  }

  deleteSingle() {
    const occDate = this.toICSDate(new Date(this.popupStartDate));
    this.http.post(this.globalService.url+'appointments/deleteSingleOccurrence',{id:this.editingEventId,occurrenceDate:occDate},{
      headers:this.globalService.headers,responseType:'text',
    }).subscribe(()=>{this.closePopup();this.loadAll();});
  }

  // ── UTILS ──────────────────────────────────────────────────────────────

  getCategoryClass(cat: string): string {
    return ['sopralluogo','ordinario','ordineServizio','straordinario','lavoriSvolti','altro'].includes(cat)?`cat-${cat}`:'cat-default';
  }

  formatTime(date: Date): string { return `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`; }

  toInputDatetime(d: Date): string {
    const pad=(n:number)=>n.toString().padStart(2,'0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  normalize(s: string): string { return (s||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().trim(); }

  getCategoriesForTenant(): {id:string;text:string}[] {
    if (this.tenantService.isEmmeci) return [{id:'ordinario',text:'Ordinario'},{id:'ordineServizio',text:'Ordine di servizio'},{id:'sopralluogo',text:'Sopralluogo'},{id:'altro',text:'Altro'}];
    return [{id:'ordinario',text:'Ordinario'},{id:'straordinario',text:'Straordinario'},{id:'ordineServizio',text:'Ordine di servizio'},{id:'sopralluogo',text:'Sopralluogo'},{id:'lavoriSvolti',text:'Lavori svolti'},{id:'altro',text:'Altro'}];
  }

  getEventTopPx(ev: CalEvent): number { return ((ev.start.getHours()*60+ev.start.getMinutes())/30)*26; }
  getEventHeightPx(ev: CalEvent): number { return Math.max(((ev.end.getTime()-ev.start.getTime())/60000/30)*26,26); }
  getSlotTopPx(slot: string): number { const [h,m]=slot.split(':').map(Number); return ((h*60+m)/30)*26; }
  currentTimeTopPx(): number { const now=new Date(); return ((now.getHours()*60+now.getMinutes())/30)*26; }

  private computeOverlapLayout(events: CalEvent[], maxCols = Infinity): Map<number, {col: number, totalCols: number}> {
    const result = new Map<number, {col: number, totalCols: number}>();
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

  getEventPositionStyle(ev: CalEvent, layout?: Map<number, {col: number, totalCols: number}>): {[key: string]: string} {
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

  goBack() { this.router.navigateByUrl('homeAdmin'); }

  @HostListener('document:click',['$event'])
  onDocumentClick(event: MouseEvent) {
    const t = event.target as HTMLElement;
    if (!t.closest('.autocomplete-wrapper')) this.autocompleteOpen=false;
    if (!t.closest('.mini-cal-wrapper')&&!t.closest('.cal-title-btn')) this.showMiniCal=false;
  }
}
