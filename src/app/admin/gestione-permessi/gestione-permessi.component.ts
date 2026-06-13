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
  @ViewChild('permessoModal') modalElement!: ElementRef;
  @ViewChild('creaModal') creaModalElement!: ElementRef;

  leaveRequests: any[] = [];
  historyRequests: any[] = [];
  employees: any[] = [];
  selectedHistoryEmployeeId = '';
  loading = false;
  selectedRequest: any = null;
  creaLoading = false;
  savingAllegati = false;

  modalData: any = {
    categoria: 'Ferie',
    oreGiornaliere: null,
    oraInizioModificata: '',
    oraFineModificata: '',
  };

  creaData: any = {
    employeeId: '',
    categoria: 'Ferie',
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
    this.route.queryParams.subscribe((params) => {
      this.selectedHistoryEmployeeId = params['employeeId'] || '';
      this.loadRequests();
      this.loadEmployees();
      this.loadHistory();
    });
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
      categoria: 'Ferie',
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
        this.loadHistory();
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
        this.loadHistory();
      },
      error: (err) => {
        this.creaLoading = false;
        this.showToast('❌ ' + (err.error?.error || 'Errore durante il salvataggio'), true);
      },
    });
  }

  loadRequests(): void {
    this.loading = true;
    this.http.get<any[]>(this.globalService.url + 'permission').subscribe({
      next: (res) => {
        this.leaveRequests = res.filter((p) => p.status === 'in attesa');
        this.loading = false;
      },
      error: (err) => {
        console.error('Errore nel recupero permessi:', err);
        this.popup.showHttpError(err, 'Errore durante il caricamento dei permessi in attesa.');
        this.loading = false;
      },
    });
  }

  loadHistory(): void {
    const suffix = this.selectedHistoryEmployeeId
      ? `?employeeId=${this.selectedHistoryEmployeeId}`
      : '';
    this.http.get<any[]>(this.globalService.url + 'permission/history' + suffix).subscribe({
      next: (res) => {
        this.historyRequests = res || [];
      },
      error: (err) => {
        console.error('Errore nel recupero storico permessi:', err);
        this.popup.showHttpError(err, 'Errore durante il caricamento dello storico permessi.');
      },
    });
  }

  onHistoryEmployeeChange(): void {
    this.loadHistory();
  }

  openModal(req: any): void {
    this.selectedRequest = req;
    this.modalData = {
      categoria: req.categoria || 'Ferie',
      oreGiornaliere: null,
      oraInizioModificata: req.tipoPermesso === 'parziale' ? (req.oraInizio || '') : '',
      oraFineModificata: req.tipoPermesso === 'parziale' ? (req.oraFine || '') : '',
    };
    const modal = new bootstrap.Modal(this.modalElement.nativeElement);
    modal.show();
  }

  confirmAcceptDirect(req: any): void {
    const body: any = {
      id: req.id,
      employeeId: req.employeeId,
      categoria: req.categoria || 'Ferie',
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
        this.loadHistory();
      },
      error: (err) => {
        console.error('Errore durante accettazione:', err);
        this.showToast('❌ ' + this.parseServerError(err), true);
      },
    });
  }

  confirmAccept(): void {
    if (!this.selectedRequest) return;

    const body: any = {
      id: this.selectedRequest.id,
      employeeId: this.selectedRequest.employeeId,
      categoria: this.modalData.categoria,
      dataInizio: this.selectedRequest.fromDate,
      dataFine: this.selectedRequest.toDate,
      oreGiornaliere: this.modalData.oreGiornaliere,
    };

    if (this.selectedRequest.tipoPermesso === 'parziale') {
      body.oraInizioModificata = this.modalData.oraInizioModificata || null;
      body.oraFineModificata = this.modalData.oraFineModificata || null;
    }

    this.http
      .post(this.globalService.url + 'permission/accept', body)
      .subscribe({
        next: (res: any) => {
          const wasModified =
            this.selectedRequest?.tipoPermesso === 'parziale' &&
            this.modalData.oraInizioModificata &&
            this.modalData.oraFineModificata &&
            (this.modalData.oraInizioModificata !== this.selectedRequest?.oraInizio ||
              this.modalData.oraFineModificata !== this.selectedRequest?.oraFine);

          this.showToast(
            wasModified
              ? `⚠️ Ore modificate inviate al dipendente per conferma`
              : `✅ Permesso accettato come ${this.modalData.categoria}${
                  this.modalData.oreGiornaliere
                    ? ' (' + this.modalData.oreGiornaliere + ' ore)'
                    : ''
                }`
          );
          const modal = bootstrap.Modal.getInstance(
            this.modalElement.nativeElement
          );
          modal.hide();
          this.loadRequests();
          this.loadHistory();
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
          this.loadHistory();
        },
        error: (err) => {
          console.error('Errore durante rifiuto:', err);
          this.showToast('❌ ' + this.parseServerError(err), true);
        },
      });
  }

  get allegatiParsati(): any[] {
    if (!this.selectedRequest?.allegati) return [];
    try {
      const allegatiStr = this.selectedRequest.allegati;
      return typeof allegatiStr === 'string' ? JSON.parse(allegatiStr) : allegatiStr;
    } catch {
      return [];
    }
  }

  saveAllegati(): void {
    if (!this.selectedRequest) return;

    const allegatiStr = this.selectedRequest.allegati;
    if (!allegatiStr) {
      this.showToast('❌ Nessun allegato da salvare', true);
      return;
    }

    let allegati: any[] = [];
    try {
      allegati = typeof allegatiStr === 'string' ? JSON.parse(allegatiStr) : allegatiStr;
    } catch {
      this.showToast('❌ Errore nel parsing degli allegati', true);
      return;
    }

    if (!allegati.length) {
      this.showToast('❌ Nessun allegato da salvare', true);
      return;
    }

    this.savingAllegati = true;

    const body = {
      employeeId: this.selectedRequest.employeeId,
      requestId: this.selectedRequest.id,
      allegati: allegati,
    };

    this.http
      .post(this.globalService.url + 'permission/save-allegati', body)
      .subscribe({
        next: (res: any) => {
          this.savingAllegati = false;
          this.showToast(`✅ ${allegati.length} allegato/i salvato/i nella cartella documenti`);
        },
        error: (err) => {
          this.savingAllegati = false;
          this.showToast('❌ Errore durante il salvataggio degli allegati', true);
          console.error('Errore saveAllegati:', err);
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

  downloadAllegato(filepath: string, filename: string): void {
    this.http
      .get(this.globalService.url + `permission/download-temp-allegato?filepath=${encodeURIComponent(filepath)}`, {
        responseType: 'blob',
      })
      .subscribe({
        next: (blob: Blob) => {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.click();
          window.URL.revokeObjectURL(url);
        },
        error: (err) => {
          console.error('Errore download allegato:', err);
          this.showToast('❌ Errore nel download dell\'allegato', true);
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/homeAdmin']);
  }
}
