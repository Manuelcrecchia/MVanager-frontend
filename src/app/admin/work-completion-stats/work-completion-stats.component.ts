import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';

interface FeedbackRecord {
  id: number;
  shiftId: number;
  numeroCliente: string;
  clienteNome: string;
  completedAt: string;
  consulente: string;
  personale: string;
  igienizzazione: string;
  soddisfazione: string;
  averageScore: number;
  note: string;
  submittedByEmployeeName: string;
}

interface StatsResponse {
  total: number;
  averageScore: number;
  satisfactionYesRate: number;
  averages: {
    consulente: number;
    personale: number;
    igienizzazione: number;
    soddisfazione: number;
  };
  dimensions: {
    consulente: Record<string, number>;
    personale: Record<string, number>;
    igienizzazione: Record<string, number>;
    soddisfazione: Record<string, number>;
  };
  best: FeedbackRecord[];
  worst: FeedbackRecord[];
  notes: FeedbackRecord[];
  records: FeedbackRecord[];
}

@Component({
  selector: 'app-work-completion-stats',
  templateUrl: './work-completion-stats.component.html',
  styleUrls: ['./work-completion-stats.component.css'],
})
export class WorkCompletionStatsComponent implements OnInit {
  loading = false;
  error = '';
  from = '';
  to = '';
  numeroCliente = '';
  stats: StatsResponse | null = null;

  readonly ratingLabels: Record<string, string> = {
    eccellente: 'Eccellente',
    buono: 'Buono',
    scadente: 'Scadente',
    si: 'Sì',
    no: 'No',
  };

  constructor(
    private http: HttpClient,
    private router: Router,
    public global: GlobalService,
    private popup: PopupServiceService,
  ) {}

  ngOnInit(): void {
    this.setDefaultRange();
    this.loadStats();
  }

  back(): void {
    this.router.navigateByUrl('/homeAdmin');
  }

  setDefaultRange(): void {
    const today = new Date();
    const from = new Date(today);
    from.setMonth(from.getMonth() - 3);
    this.from = this.toDateInput(from);
    this.to = this.toDateInput(today);
  }

  loadStats(): void {
    this.loading = true;
    this.error = '';
    this.stats = null;

    let params = new HttpParams();
    if (this.from) params = params.set('from', this.from);
    if (this.to) params = params.set('to', this.to);
    if (this.numeroCliente.trim()) {
      params = params.set('numeroCliente', this.numeroCliente.trim());
    }

    this.http
      .get<StatsResponse>(this.global.url + 'admin/work-completion-stats', {
        headers: this.global.headers,
        params,
      })
      .subscribe({
        next: (res) => {
          this.stats = res;
          this.loading = false;
        },
        error: (err) => {
          console.error('Errore caricamento statistiche fine lavoro:', err);
          this.error = 'Non riesco a caricare le statistiche.';
          this.popup.showHttpError(err, this.error);
          this.loading = false;
        },
      });
  }

  resetFilters(): void {
    this.numeroCliente = '';
    this.setDefaultRange();
    this.loadStats();
  }

  scorePercent(score: number): number {
    if (!score) return 0;
    return Math.max(0, Math.min(100, (Number(score) / 3) * 100));
  }

  distributionEntries(source: Record<string, number> | undefined): Array<{ key: string; value: number }> {
    if (!source) return [];
    return Object.keys(source).map((key) => ({ key, value: source[key] || 0 }));
  }

  formatDate(value: string): string {
    if (!value) return '';
    const [year, month, day] = value.split('-');
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  }

  private toDateInput(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
