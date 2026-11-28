import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GlobalService } from '../../service/global.service';

interface RecurringCategory {
  key: string;
  label: string;
  intervalCount: number | null;
  intervalUnit: IntervalUnit;
  firstDueRule: 'service_start' | 'fixed_day';
  fixedDay: number | null;
  configured: boolean;
  enabled?: boolean;
}

type IntervalUnit = 'days' | 'weeks' | 'months' | 'years';
type ScheduleKind = 'work_completion' | 'quality_control';
type ScheduleDefaults = {
  intervalMonths?: number | null;
  intervalCount?: number;
  intervalUnit?: IntervalUnit;
  fixedDay: number | null;
  firstDueRule: RecurringCategory['firstDueRule'] | null;
  enabled?: boolean;
};
type CategoryDefaults = ScheduleDefaults & Pick<RecurringCategory, 'key' | 'label'>;

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="standard-management-page">
      <header class="mv-entity-toolbar">
        <div class="mv-entity-toolbar__title"><h1>Valutazioni periodiche</h1></div>
        <div class="mv-entity-toolbar__controls">
          <a class="btn mv-toolbar-back" routerLink="/homeAdmin">← Torna indietro</a>
        </div>
      </header>
      <section class="container">
        <p>Imposta frequenza e prima scadenza per categoria. Puoi personalizzarle nella scheda del cliente.</p>
        <p *ngIf="loading" role="status">Caricamento programmazione…</p>
        <p *ngIf="error" class="alert alert-danger" role="alert">{{ error }}</p>
        <p *ngIf="message" class="alert alert-success" role="status">{{ message }}</p>
        <ng-container *ngFor="let section of sections">
        <section class="mb-4" *ngIf="canView(section.kind) && !loading">
          <h2 class="h4">{{ section.title }}</h2>
          <p *ngIf="section.kind === 'work_completion'">Valutazioni da far compilare al cliente durante i servizi ricorrenti.</p>
          <p *ngIf="section.kind === 'quality_control'">Verifiche periodiche da far compilare al personale abilitato.</p>
          <p *ngIf="!error && !categoriesFor(section.kind).length">Nessuna categoria disponibile.</p>
        <form *ngFor="let category of categoriesFor(section.kind)" class="card p-3 mb-3" (ngSubmit)="save(category, section.kind)">
          <h3 class="h5">{{ category.label }}</h3>
          <label *ngIf="section.kind === 'quality_control'" class="mb-3">
            <input type="checkbox" name="enabled" [(ngModel)]="category.enabled" [disabled]="!canEdit(section.kind) || !!savingKey">
            Programma i controlli per questa categoria
          </label>
          <div class="d-flex flex-wrap gap-3 align-items-end">
            <label class="flex-grow-1">
              <span class="d-block">Ripeti ogni</span>
              <input class="form-control" type="number" min="1" [max]="intervalLimits[category.intervalUnit]" step="1" required
                name="intervalCount" [(ngModel)]="category.intervalCount" [disabled]="!canEdit(section.kind) || !!savingKey">
            </label>
            <label>Unità della frequenza
              <select class="form-select" name="intervalUnit" [ngModel]="category.intervalUnit" (ngModelChange)="setIntervalUnit(category, $event)" [disabled]="!canEdit(section.kind) || !!savingKey">
                <option value="days">Giorni</option><option value="weeks">Settimane</option>
                <option value="months">Mesi</option><option value="years">Anni</option>
              </select>
            </label>
            <label class="flex-grow-1">
              <span class="d-block">Calcola la prima scadenza</span>
              <select class="form-select" name="firstDueRule" [(ngModel)]="category.firstDueRule" [disabled]="!canEdit(section.kind) || !!savingKey">
                <option value="service_start">Alla fine del periodo, a partire dall’inizio del servizio</option>
                <option *ngIf="allowsFixedDay(category)" value="fixed_day">In un giorno fisso del mese</option>
              </select>
            </label>
            <label *ngIf="category.firstDueRule === 'fixed_day'">
              <span class="d-block">Giorno del mese</span>
              <input class="form-control" type="number" min="1" max="31" step="1" required
                name="fixedDay" [(ngModel)]="category.fixedDay" [disabled]="!canEdit(section.kind) || !!savingKey">
            </label>
            <button *ngIf="canEdit(section.kind)" class="btn btn-primary" type="submit" [disabled]="!!savingKey">
              {{ savingKey === section.kind + '/' + category.key ? 'Salvataggio…' : 'Salva programmazione' }}
            </button>
          </div>
          <small class="text-muted mt-2" *ngIf="category.firstDueRule === 'service_start' && category.intervalUnit === 'months'">
            Esempio con frequenza di 2 mesi. Se il servizio inizia il 13 novembre, la prima scadenza è il 12 gennaio.
          </small>
          <small class="text-muted mt-2" *ngIf="!allowsFixedDay(category)">Se manca la data di inizio del servizio, il conteggio parte dalla creazione della scheda cliente.</small>
          <small class="text-muted mt-2" *ngIf="category.firstDueRule === 'fixed_day'">Nei mesi più corti vale l’ultimo giorno del mese. Se manca l’inizio del servizio, vale il mese di creazione della scheda cliente.</small>
          <small class="text-muted mt-2" *ngIf="section.kind === 'work_completion' && !category.configured">Salva per attivare il calcolo automatico per questa categoria.</small>
        </form>
        </section>
        </ng-container>
      </section>
    </main>
  `,
})
export class PeriodicAssessmentSettingsComponent implements OnInit {
  readonly intervalLimits = { days: 730, weeks: 104, months: 24, years: 10 };
  readonly sections: { kind: ScheduleKind; title: string }[] = [
    { kind: 'work_completion', title: 'Valutazioni dei clienti' },
    { kind: 'quality_control', title: 'Controlli qualità interni' },
  ];
  categories: RecurringCategory[] = [];
  qualityCategories: RecurringCategory[] = [];
  loading = true;
  savingKey = '';
  error = '';
  message = '';

  constructor(private http: HttpClient, private global: GlobalService) {}

  canView(kind: ScheduleKind): boolean {
    return this.global.hasPermission(kind === 'quality_control' ? 'QUALITY_CONTROL_VIEW' : 'WORK_COMPLETION_VIEW');
  }

  canEdit(kind: ScheduleKind): boolean {
    return this.global.hasPermission(kind === 'quality_control' ? 'QUALITY_CONTROL_MANAGE' : 'WORK_COMPLETION_MANAGE');
  }

  categoriesFor(kind: ScheduleKind): RecurringCategory[] {
    return kind === 'quality_control' ? this.qualityCategories : this.categories;
  }

  ngOnInit(): void {
    this.http.get<{ categories: CategoryDefaults[]; qualityCategories?: CategoryDefaults[] }>(this.api).subscribe({
      next: ({ categories, qualityCategories }) => {
        this.categories = categories.map(category => this.editableCategory(category));
        this.qualityCategories = (qualityCategories || []).map(category => this.editableCategory(category));
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.error = error?.error?.error || 'Impossibile caricare la programmazione aziendale.';
      },
    });
  }

  private editableCategory(category: CategoryDefaults): RecurringCategory {
    return {
      ...category, intervalUnit: category.intervalUnit || 'months',
      intervalCount: category.intervalCount ?? category.intervalMonths ?? null, configured: Boolean(category.firstDueRule),
      firstDueRule: category.firstDueRule || 'service_start', fixedDay: category.fixedDay ?? 1,
    };
  }

  allowsFixedDay(category: RecurringCategory): boolean {
    return category.intervalUnit === 'months' || category.intervalUnit === 'years';
  }

  setIntervalUnit(category: RecurringCategory, unit: IntervalUnit): void {
    category.intervalUnit = unit;
    if (!this.allowsFixedDay(category)) category.firstDueRule = 'service_start';
  }

  save(category: RecurringCategory, kind: ScheduleKind = 'work_completion'): void {
    if (!this.canEdit(kind) || this.savingKey) return;
    this.error = '';
    this.message = '';
    const intervalCount = category.intervalCount ?? 0;
    if (!Number.isInteger(intervalCount) || intervalCount < 1 || intervalCount > this.intervalLimits[category.intervalUnit]) {
      this.error = 'Inserisci una frequenza valida per l’unità scelta.';
      return;
    }
    const firstDueRule = category.firstDueRule;
    const fixedDay = firstDueRule === 'fixed_day' ? category.fixedDay ?? 0 : null;
    if (fixedDay !== null && (!Number.isInteger(fixedDay) || fixedDay < 1 || fixedDay > 31)) {
      this.error = 'Inserisci un giorno del mese compreso tra 1 e 31.';
      return;
    }
    const internal = kind === 'quality_control';
    const url = `${this.api}/${encodeURIComponent(category.key)}${internal ? '/quality_control' : ''}`;
    this.savingKey = `${kind}/${category.key}`;
    const interval = category.intervalUnit === 'months' ? { intervalMonths: intervalCount } : { intervalCount, intervalUnit: category.intervalUnit };
    this.http.put<ScheduleDefaults>(url, { ...interval, firstDueRule, fixedDay, ...(internal ? { enabled: category.enabled === true } : {}) }).subscribe({
      next: (updated) => {
        category.intervalCount = updated.intervalCount ?? updated.intervalMonths ?? null;
        category.intervalUnit = updated.intervalUnit || 'months';
        category.firstDueRule = updated.firstDueRule || firstDueRule;
        category.fixedDay = updated.fixedDay ?? 1;
        if (internal) category.enabled = updated.enabled === true;
        category.configured = true;
        this.savingKey = '';
        const section = internal ? 'controlli qualità interni' : 'valutazioni dei clienti';
        this.message = `Programmazione salvata per «${category.label}» · ${section}.`;
      },
      error: (error) => {
        this.savingKey = '';
        this.error = error?.error?.error || 'Impossibile salvare la programmazione.';
      },
    });
  }

  private get api(): string { return this.global.url + 'admin/customer-quality/schedule-defaults'; }
}
