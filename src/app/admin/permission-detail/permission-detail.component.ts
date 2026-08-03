import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';

@Component({
  selector: 'app-permission-detail',
  templateUrl: './permission-detail.component.html',
  styleUrls: ['./permission-detail.component.css'],
})
export class PermissionDetailComponent implements OnInit {
  request: any | null = null;
  loading = true;
  errorMessage = '';
  private categoryLabels = new Map<string, string>();

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    public globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.globalService.loadTenantConfig(false, { showError: false }).then(() => {
      for (const category of this.globalService.getLeaveCategories()) {
        this.categoryLabels.set(String(category.key), String(category.label || category.key));
      }
    });

    const requestId = Number(this.route.snapshot.paramMap.get('id'));
    if (!requestId) {
      this.loading = false;
      this.errorMessage = 'Permesso non trovato.';
      return;
    }

    this.http.get<any>(this.globalService.url + `permission/detail/${requestId}`).subscribe({
      next: (request) => {
        this.request = request;
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error?.error?.error || 'Impossibile caricare la scheda del permesso.';
      },
    });
  }

  get employeeName(): string {
    const name = `${this.request?.employee?.nome || ''} ${this.request?.employee?.cognome || ''}`.trim();
    return name || `Dipendente #${this.request?.employeeId || '-'}`;
  }

  get categoryLabel(): string {
    const key = String(this.request?.categoria || '');
    return this.categoryLabels.get(key) || key || '-';
  }

  get typeLabel(): string {
    if (this.request?.tipoPermesso === 'giornaliero') return 'Giornaliero';
    if (this.request?.tipoPermesso === 'settimanale') return 'Settimanale';
    if (this.request?.tipoPermesso === 'parziale') return 'Parziale';
    return this.request?.tipoPermesso || '-';
  }

  get statusLabel(): string {
    if (this.request?.status === 'in attesa') return 'In attesa';
    if (this.request?.status === 'accettato') return 'Accettato';
    if (this.request?.status === 'rifiutato') return 'Rifiutato';
    if (this.request?.status === 'modificato') return 'Da confermare';
    return this.request?.status || '-';
  }

  get attachments(): any[] {
    const value = this.request?.allegati;
    if (!value) return [];
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  downloadAttachment(attachment: any): void {
    if (!attachment?.filepath) return;
    this.http.get(
      this.globalService.url + `permission/download-temp-allegato?filepath=${encodeURIComponent(attachment.filepath)}`,
      { responseType: 'blob' },
    ).subscribe((blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename || 'allegato';
      link.click();
      window.URL.revokeObjectURL(url);
    });
  }

  back(): void {
    this.router.navigateByUrl('/homeAdmin/gestionepermessi');
  }
}
