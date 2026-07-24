import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';

@Component({
  selector: 'app-timbrature-dettaglio',
  templateUrl: './timbrature-dettaglio.component.html',
  styleUrls: ['./timbrature-dettaglio.component.css'],
})
export class TimbratureDettaglioComponent implements OnInit {
  employeeId!: number;
  employee: any;
  date!: string;
  works: any[] = [];
  stampingConfig: any = {
    mode: 'customer_tag',
    warehouseLabel: 'Magazzino',
    warehouseLocations: [{ tagId: 'MAGAZZINO', locationId: '__warehouse__', label: 'Magazzino' }],
  };
  loading = false;

  modalMode: 'add' | 'edit' | 'delete' | 'resolve' = 'add';
  modalTitle = '';
  modalData: any = {
    entrata: '',
    uscita: '',
    note: '',
    action: '',
    solutions: [],
    tipo: '',
  };
  currentWork: any;
  currentStamp: any;
  showNotesModal: boolean = false;
  showStampingModal: boolean = false;
  notes: any[] = [];
  toastMessage = '';
  toastIsError = false;
  private toastTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    public global: GlobalService,
    private router: Router,
    private popup: PopupServiceService,
  ) {}

  ngOnInit(): void {
    this.employeeId = Number(this.route.snapshot.paramMap.get('employeeId'));
    this.date = this.route.snapshot.paramMap.get('date')!;
    this.loadTimbrature();
  }

  // 🔹 Carica timbrature
  loadTimbrature() {
    this.loading = true;
    this.http
      .get<any>(
        `${this.global.url}admin/stamping/${this.employeeId}/${this.date}`,
        {
          headers: this.global.headers,
        }
      )
      .subscribe({
        next: (res) => {
          this.employee = res.employee;
          this.works = res.works;
          this.stampingConfig = res.stampingConfig || this.stampingConfig;
          this.loading = false;
        },
        error: (err) => {
          console.error('Errore caricamento timbrature:', err);
          this.popup.showHttpError(err, 'Errore durante il caricamento delle timbrature.');
          this.loading = false;
        },
      });
  }
  openNotesModal(work?: any) {
    if (work) this.currentWork = work; // ⬅️ fondamentale

    this.http
      .get(`${this.global.url}admin/stamping/notes`, {
        params: {
          employeeId: this.employee.id,
          date: this.date,
          customerId: this.currentWork.customerId || '',
          shiftId: this.currentWork.shiftId || '',
        },
        headers: this.global.headers,
      })
      .subscribe({
        next: (res: any) => {
          this.notes = res.notes || [];
          this.showNotesModal = true;
        },
        error: (err) => {
          console.error('Errore caricamento note timbratura:', err);
          this.popup.showHttpError(err, 'Errore durante il caricamento delle note.');
        },
      });
  }
  closeNotesModal() {
    this.showNotesModal = false;
  }

  // 🔹 Cambia data
  changeDate(delta: number): void {
    const current = new Date(this.date);
    current.setDate(current.getDate() + delta);
    this.date = current.toISOString().split('T')[0];
    this.router.navigate(['/homeAdmin/timbratureDettaglio', this.employeeId, this.date]);
    this.loadTimbrature();
  }

  // 🔹 Messaggio temporaneo, senza dipendere dal JavaScript globale di Bootstrap.
  showToast(message: string, error: boolean = false) {
    this.toastMessage = message;
    this.toastIsError = error;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => (this.toastMessage = ''), 3000);
  }

  private openStampingModal() {
    this.showStampingModal = true;
  }

  closeStampingModal() {
    this.showStampingModal = false;
  }

  // 🔹 Aggiungi timbratura
  addStamping(work: any) {
    this.modalMode = 'add';
    this.modalTitle = 'Aggiungi timbratura';
    this.currentWork = work;
    this.modalData = { entrata: '', uscita: '', note: '', tipo: '' };
    this.openStampingModal();
  }

  // 🔹 Modifica timbratura
  editStamping(stamp: any) {
    this.modalMode = 'edit';
    this.modalTitle = 'Modifica timbratura';
    this.currentStamp = stamp;

    const tipo = stamp.tipo?.toLowerCase() || '';
    const orario = this.formatHour(stamp.timestamp);

    // 🔹 Se presente anche customerId lo salviamo per sicurezza
    this.currentWork = { customerId: stamp.customerId || null };

    this.modalData = {
      tipo,
      entrata: tipo === 'entrata' ? orario : '',
      uscita: tipo === 'uscita' ? orario : '',
      note: '',
    };

    this.openStampingModal();
  }

  // 🔹 Elimina timbratura
  deleteStamping(stamp: any) {
    this.modalMode = 'delete';
    this.modalTitle = 'Elimina timbratura';
    this.currentStamp = stamp;
    this.modalData = { note: '' };
    this.openStampingModal();
  }

  // 🔹 Risolvi errore
  resolveError(work: any) {
    if (!work?.solutions?.length) return;
    this.modalMode = 'resolve';
    this.modalTitle = `Risolvi errore: ${work.errorType}`;
    this.currentWork = work;
    this.modalData = { note: '', action: '', solutions: work.solutions || [] };
    this.openStampingModal();
  }

  // 🔹 Conferma azione dal modale
  confirmModal() {
    const { entrata, uscita, note, action } = this.modalData;

    // ➕ ADD
    if (this.modalMode === 'add') {
      if (!entrata && !uscita) {
        this.showToast(
          '⚠️ Inserisci almeno un orario di entrata o uscita',
          true
        );
        return;
      }

      if (entrata && uscita) {
        const [h1, m1] = entrata.split(':').map(Number);
        const [h2, m2] = uscita.split(':').map(Number);
        const d1 = new Date(0, 0, 0, h1, m1);
        const d2 = new Date(0, 0, 0, h2, m2);
        if (d2 <= d1) {
          this.showToast(
            '⚠️ L’uscita deve essere successiva all’entrata',
            true
          );
          return;
        }
      }

      const body = {
        employeeId: this.employeeId,
        customerId: this.currentWork?.customerId || null,
        date: this.date,
        entrata: entrata || null,
        uscita: uscita || null,
        note,
      };
      console.log('➡️ BODY INVIATO A /add:', body);

      this.http
        .post(`${this.global.url}admin/stamping/add`, body, {
          headers: this.global.headers,
        })
        .subscribe({
          next: () => {
            this.showToast('✅ Timbratura aggiunta con successo');
            this.closeStampingModal();
            this.loadTimbrature();
          },
          error: (err) => {
            console.error('Errore aggiunta:', err);
            this.showToast('❌ Errore durante il salvataggio', true);
          },
        });
      return;
    }

    // ✏️ EDIT
    if (this.modalMode === 'edit') {
      if (!entrata && !uscita) {
        this.showToast('⚠️ Inserisci un orario di entrata o uscita', true);
        return;
      }

      const time = entrata || uscita;
      const body = { date: this.date, time, note };

      this.http
        .put(
          `${this.global.url}admin/stamping/edit/${this.currentStamp?.id}`,
          body,
          {
            headers: this.global.headers,
          }
        )
        .subscribe({
          next: () => {
            this.showToast('✅ Timbratura modificata con successo');
            this.closeStampingModal();
            this.loadTimbrature();
          },
          error: (err) => {
            console.error('Errore modifica:', err);
            this.showToast('❌ Errore durante la modifica', true);
          },
        });
      return;
    }

    // 🗑️ DELETE
    if (this.modalMode === 'delete') {
      this.http
        .delete(
          `${this.global.url}admin/stamping/delete/${this.currentStamp?.id}`,
          {
            headers: this.global.headers,
            body: { note },
          }
        )
        .subscribe({
          next: () => {
            this.showToast('🗑️ Timbratura eliminata');
            this.closeStampingModal();
            this.loadTimbrature();
          },
          error: (err) => {
            console.error('Errore eliminazione:', err);
            this.showToast('❌ Errore durante l’eliminazione', true);
          },
        });
      return;
    }

    // ⚠️ RESOLVE ERROR
    if (this.modalMode === 'resolve') {
      if (!action) {
        this.showToast('⚠️ Seleziona un’azione per risolvere l’errore', true);
        return;
      }

      const body: any = {
        employeeId: this.employeeId,
        date: this.date,
        action,
        note,
      };

      // Se esiste shiftId, lo inviamo
      if (this.currentWork.shiftId) body.shiftId = this.currentWork.shiftId;

      // Se è un "turno non previsto", serve anche customerId
      if (this.currentWork.errorType === 'TURNO_NON_PREVISTO') {
        body.customerId = this.currentWork.customerId;
      }

      this.http
        .post(`${this.global.url}admin/stamping/resolveError`, body, {
          headers: this.global.headers,
        })
        .subscribe({
          next: () => {
            this.showToast('✅ Errore risolto correttamente');
            this.closeStampingModal();
            this.loadTimbrature();
          },
          error: (err) => {
            console.error('Errore risoluzione:', err);
            this.showToast('❌ Errore durante la risoluzione', true);
          },
        });
      return;
    }
  }

  // 🔹 Helper per formattare l’orario
  formatHour(timestamp: string | Date): string {
    const d = new Date(timestamp);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  // 🔙 Torna indietro
  back(): void {
    this.router.navigate(['/homeAdmin/timbratureHome'], {
      queryParams: { date: this.date },
    });
  }

  isWarehouseMode(): boolean {
    return this.stampingConfig?.mode === 'warehouse';
  }

  showPlanningColumns(): boolean {
    return !this.isWarehouseMode() || this.stampingConfig?.compareWithShifts === true;
  }

  getWarehouseModeLabel(): string {
    const locations = Array.isArray(this.stampingConfig?.warehouseLocations)
      ? this.stampingConfig.warehouseLocations
      : [];
    const validLocations = locations.filter((location: any) =>
      String(location?.locationId || location?.tagId || location?.label || '').trim()
    );

    if (validLocations.length > 1) {
      return `${validLocations.length} sedi aziendali`;
    }

    return (
      validLocations[0]?.label ||
      this.stampingConfig?.warehouseLabel ||
      'Magazzino'
    );
  }

  getStatusLabel(errorType: string): string {
    if (errorType === 'TURNO_NON_PREVISTO') return 'Non pianificata';
    if (errorType === 'TIMBRATURA_INCOMPLETA') return 'Incompleta';
    return errorType;
  }
}
