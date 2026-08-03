import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
declare var bootstrap: any;

@Component({
  selector: 'app-gestione-permessi',
  templateUrl: './gestione-permessi.component.html',
  styleUrls: ['./gestione-permessi.component.css'],
})
export class GestionePermessiComponent implements OnInit {
  @ViewChild('creaModal') creaModalElement!: ElementRef;

  leaveRequests: any[] = [];
  employees: any[] = [];
  loading = false;
  creaLoading = false;
  categoriePermesso: Array<{ key: string; label: string }> = [];
  search = '';
  showArchived = false;
  private openRequests = new Set<number>();

  creaData: any = {
    employeeId: '',
    categoria: '',
    tipoPermesso: 'giornaliero',
    fromDate: '',
    toDate: '',
    oraInizio: '',
    oraFine: '',
  };

  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router,
    private route: ActivatedRoute,
    private popup: PopupServiceService,
  ) {}

  ngOnInit(): void {
    this.globalService.loadTenantConfig(false, { showError: false }).then(() => {
      this.categoriePermesso = this.globalService.getLeaveCategories().map((category) => ({
        key: category.key,
        label: category.label || category.key,
      }));
      const firstCategory = this.categoriePermesso[0]?.key || '';
      if (!this.creaData.categoria) this.creaData.categoria = firstCategory;
    });
    this.route.queryParams.subscribe((params) => {
      const employeeId = params['employeeId'] || '';
      if (employeeId) this.search = String(employeeId);
      this.loadRequests();
      this.loadEmployees();
    });
  }

  goBack(): void {
    this.router.navigateByUrl('/homeAdmin');
  }

  loadEmployees(): void {
    this.http.get<any[]>(this.globalService.url + 'employees/getAll').subscribe({
      next: (res) => { this.employees = res.filter((e) => e.active !== false); },
      error: (err) => {
        console.error('Errore caricamento dipendenti per permessi:', err);
        this.popup.showHttpError(err, 'Errore durante il caricamento dei dipendenti.');
      },
    });
  }

  openCreaModal(): void {
    this.creaData = {
      employeeId: '',
      categoria: this.categoriePermesso[0]?.key || '',
      tipoPermesso: 'giornaliero',
      fromDate: '',
      toDate: '',
      oraInizio: '',
      oraFine: '',
      oreGiornaliere: null,
    };
    const modal = new bootstrap.Modal(this.creaModalElement.nativeElement);
    modal.show();
  }

  onCreaFromDateChange(): void {
    if (this.creaData.tipoPermesso !== 'settimanale') {
      this.creaData.toDate = this.creaData.fromDate;
    }
  }

  onCreaTipoChange(): void {
    if (this.creaData.tipoPermesso !== 'settimanale') {
      this.creaData.toDate = this.creaData.fromDate;
    }
    if (this.creaData.tipoPermesso === 'parziale') {
      this.creaData.oraInizio = '';
      this.creaData.oraFine = '';
      this.creaData.oreGiornaliere = null;
    } else {
      this.creaData.oraInizio = '';
      this.creaData.oraFine = '';
    }
  }

  submitCreaPermesso(): void {
    if (!this.creaData.employeeId || !this.creaData.fromDate) {
      this.showToast('❌ Compilare tutti i campi obbligatori', true);
      return;
    }
    if (this.creaData.tipoPermesso === 'parziale' && (!this.creaData.oraInizio || !this.creaData.oraFine)) {
      this.showToast('❌ Inserire orario di inizio e fine per permesso parziale', true);
      return;
    }
    if (this.creaData.tipoPermesso === 'settimanale' && !this.creaData.toDate) {
      this.showToast('❌ Inserire data di fine per permesso settimanale', true);
      return;
    }
    this.creaLoading = true;
    this.http.post(this.globalService.url + 'permission/admin-create', this.creaData).subscribe({
      next: () => {
        this.creaLoading = false;
        bootstrap.Modal.getInstance(this.creaModalElement.nativeElement)?.hide();
        this.showToast('✅ Richiesta inviata al dipendente per conferma');
        this.loadRequests();
      },
      error: (err) => {
        this.creaLoading = false;
        this.showToast('❌ ' + (err.error?.error || 'Errore durante la creazione'), true);
      },
    });
  }

  savePermessoNoSend(): void {
    if (!this.creaData.employeeId || !this.creaData.fromDate) {
      this.showToast('❌ Compilare tutti i campi obbligatori', true);
      return;
    }
    if (this.creaData.tipoPermesso === 'parziale' && (!this.creaData.oraInizio || !this.creaData.oraFine)) {
      this.showToast('❌ Inserire orario di inizio e fine per permesso parziale', true);
      return;
    }
    if (this.creaData.tipoPermesso === 'settimanale' && !this.creaData.toDate) {
      this.showToast('❌ Inserire data di fine per permesso settimanale', true);
      return;
    }
    this.creaLoading = true;
    const dataToSend = { ...this.creaData, send: false };
    this.http.post(this.globalService.url + 'permission/admin-create', dataToSend).subscribe({
      next: () => {
        this.creaLoading = false;
        bootstrap.Modal.getInstance(this.creaModalElement.nativeElement)?.hide();
        this.showToast('✅ Permesso/assenza salvato');
        this.loadRequests();
      },
      error: (err) => {
        this.creaLoading = false;
        this.showToast('❌ ' + (err.error?.error || 'Errore durante il salvataggio'), true);
      },
    });
  }

  loadRequests(): void {
    this.loading = true;
    const suffix = this.showArchived ? '?includeArchived=true' : '';
    this.http.get<any[]>(this.globalService.url + 'permission' + suffix).subscribe({
      next: (res) => {
        this.leaveRequests = res || [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Errore nel recupero permessi:', err);
        this.popup.showHttpError(err, 'Errore durante il caricamento dei permessi in attesa.');
        this.loading = false;
      },
    });
  }

  get filteredRequests(): any[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.leaveRequests;
    return this.leaveRequests.filter((request) => [
      request.displayId,
      request.id,
      request.employeeId,
      request.employee?.nome,
      request.employee?.cognome,
      request.employee?.email,
      request.categoria,
      request.tipoPermesso,
      request.status,
    ].some((value) => String(value || '').toLowerCase().includes(q)));
  }

  toggleShowArchived(): void {
    this.showArchived = !this.showArchived;
    this.openRequests.clear();
    this.loadRequests();
  }

  toggleRequest(id: number): void {
    const requestId = Number(id);
    if (this.openRequests.has(requestId)) this.openRequests.delete(requestId);
    else this.openRequests.add(requestId);
  }

  isRequestOpen(id: number): boolean {
    return this.openRequests.has(Number(id));
  }

  employeeName(request: any): string {
    return `${request?.employee?.nome || ''} ${request?.employee?.cognome || ''}`.trim() || `Dipendente #${request?.employeeId || '-'}`;
  }

  statusLabel(status: string): string {
    if (status === 'in attesa') return 'In attesa';
    if (status === 'accettato') return 'Accettato';
    if (status === 'rifiutato') return 'Rifiutato';
    if (status === 'modificato') return 'Da confermare';
    return status || '-';
  }

  openRequestSheet(request: any): void {
    this.router.navigate(['/homeAdmin/gestionepermessi/view', request.id]);
  }

  confirmAcceptDirect(req: any): void {
    const body: any = {
      id: req.id,
      employeeId: req.employeeId,
      categoria: req.categoria || this.categoriePermesso[0]?.key || '',
      dataInizio: req.fromDate,
      dataFine: req.toDate,
      oreGiornaliere: null,
    };

    if (req.tipoPermesso === 'parziale') {
      body.oraInizioModificata = null;
      body.oraFineModificata = null;
    }

    this.http.post(this.globalService.url + 'permission/accept', body).subscribe({
      next: (res: any) => {
        this.showToast('✅ Permesso accettato');
        this.loadRequests();
      },
      error: (err) => {
        console.error('Errore durante accettazione:', err);
        this.showToast('❌ ' + this.parseServerError(err), true);
      },
    });
  }

  rifiuta(id: number): void {
    this.http
      .post(this.globalService.url + 'permission/reject', { id })
      .subscribe({
        next: () => {
          this.showToast('🗑️ Permesso rifiutato');
          this.loadRequests();
        },
        error: (err) => {
          console.error('Errore durante rifiuto:', err);
          this.showToast('❌ ' + this.parseServerError(err), true);
        },
      });
  }

  showToast(message: string, error: boolean = false): void {
    const toastEl = document.getElementById('liveToast');
    const toastBody = document.getElementById('toastBody');
    if (!toastEl || !toastBody) return;
    toastBody.textContent = message;
    toastEl.className = `toast align-items-center text-bg-${
      error ? 'danger' : 'success'
    } border-0`;
    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();
  }

  private parseServerError(err: any): string {
    try {
      const body = typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
      if (body?.error) return body.error;
    } catch {}
    if (err.status === 0) return 'Impossibile connettersi al server';
    return 'Errore imprevisto. Riprova.';
  }

}
