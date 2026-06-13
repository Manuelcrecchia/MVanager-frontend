import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

@Component({
  selector: 'app-gestione-employees',
  templateUrl: './gestione-employees.component.html',
  styleUrls: ['./gestione-employees.component.css'],
})
export class GestioneEmployeesComponent implements OnInit {
  employees: any[] = [];
  private openEmployees = new Set<number>();

  // ✅ selezione
  selected = new Set<number>();

  // ✅ modal form
  notifyTitle = '';
  notifyBody = '';
  notifyError = '';
  notifySuccess = '';
  sending = false;
  activeEmp: any = null;
  empNotifs: any[] = [];
  empNotifLoading = false;

  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router,
    private modalService: NgbModal
  ) {}

  ngOnInit(): void {
    this.getEmployees();
  }

  // Carica lista dipendenti
  getEmployees(): void {
    this.http
      .get(this.globalService.url + 'employees/getAll', {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (response) => {
          try {
            const data = JSON.parse(response);
            this.employees = data || [];

            // ✅ pulizia selezione: rimuovi id non presenti
            const ids = new Set<number>(
              this.employees.map((e: any) => Number(e.id))
            );
            this.selected.forEach((id) => {
              if (!ids.has(id)) this.selected.delete(id);
            });
          } catch (error) {
            console.error('Errore nel parse JSON dei dipendenti:', error);
          }
        },
        error: (error) => {
          console.error('Errore nel recupero dei dipendenti:', error);
          alert('Errore durante il caricamento dei dipendenti');
        },
      });
  }

  // ---- SELEZIONE ----
  isSelected(id: any): boolean {
    return this.selected.has(Number(id));
  }

  toggleEmployee(id: any) {
    const n = Number(id);
    if (this.selected.has(n)) this.selected.delete(n);
    else this.selected.add(n);
  }

  get selectedCount(): number {
    return this.selected.size;
  }

  get allSelected(): boolean {
    return (
      this.employees.length > 0 && this.selected.size === this.employees.length
    );
  }

  get someSelected(): boolean {
    return this.selected.size > 0 && this.selected.size < this.employees.length;
  }

  toggleSelectAll() {
    if (this.allSelected) {
      this.selected.clear();
      return;
    }
    this.selected.clear();
    this.employees.forEach((e) => this.selected.add(Number(e.id)));
  }

  // ---- MODAL ----
  openNotifyModal(content: any) {
    this.notifyTitle = '';
    this.notifyBody = '';
    this.notifyError = '';
    this.notifySuccess = '';
    this.sending = false;

    this.modalService.open(content, { centered: true, size: 'lg' });
  }

  sendNotification(modal: any) {
    this.notifyError = '';
    this.notifySuccess = '';

    const title = (this.notifyTitle || '').trim();
    const body = (this.notifyBody || '').trim();

    if (!title || !body) {
      this.notifyError = 'Titolo e messaggio sono obbligatori.';
      return;
    }

    const employeeIds = Array.from(this.selected);

    this.sending = true;

    this.http
      .post(
        this.globalService.url + 'admin/notifications/send',
        {
          title,
          body,
          type: 'GENERICA',
          payload: null,
          employeeIds,
          all: false,
        },
        {
          headers: this.globalService.headers,
          responseType: 'text',
        }
      )
      .subscribe({
        next: (res) => {
          this.sending = false;
          this.notifySuccess = 'Notifica inviata con successo ✅';

          // chiudi dopo un attimo (facoltativo)
          setTimeout(() => modal.close(), 600);
        },
        error: (err) => {
          this.sending = false;
          this.notifyError =
            err?.error?.error ||
            err?.error ||
            'Errore durante l’invio della notifica.';
        },
      });
  }

  openEmpNotifications(emp: any, content: any) {
    this.activeEmp = emp;
    this.empNotifs = [];
    this.empNotifLoading = true;

    this.modalService.open(content, { centered: true, size: 'lg' });

    this.http
      .get(this.globalService.url + `admin/notifications/employee/${emp.id}`, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (res) => {
          try {
            this.empNotifs = JSON.parse(res);
          } catch {
            this.empNotifs = [];
          }
          this.empNotifLoading = false;
        },
        error: (err) => {
          console.error('Errore notif dipendente:', err);
          this.empNotifLoading = false;
        },
      });
  }

  formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleString('it-IT');
    } catch {
      return iso;
    }
  }

  toggleEmployeeOpen(id: any): void {
    const employeeId = Number(id);
    if (this.openEmployees.has(employeeId)) {
      this.openEmployees.delete(employeeId);
    } else {
      this.openEmployees.add(employeeId);
    }
  }

  isEmployeeOpen(id: any): boolean {
    return this.openEmployees.has(Number(id));
  }

  openEmployeeWhatsApp(emp: any): void {
    const normalizedPhone = this.normalizePhoneForWhatsApp(emp?.cellulare || emp?.telefono || '');
    if (!normalizedPhone) {
      alert('Numero di telefono non disponibile.');
      return;
    }

    window.open(`https://wa.me/${normalizedPhone}`, '_blank', 'noopener,noreferrer');
  }

  composeEmployeeEmail(emp: any): void {
    const email = String(emp?.email || '').trim();
    if (!email) {
      alert('Indirizzo email non disponibile per questo dipendente.');
      return;
    }

    if (!this.isValidEmail(email)) {
      alert('Indirizzo email dipendente non valido.');
      return;
    }

    const name = `${emp?.nome || ''} ${emp?.cognome || ''}`.trim();
    this.router.navigate(['/email'], {
      queryParams: {
        composeTo: email,
        composeSubject: name ? `Dipendente ${name}` : '',
      },
    });
  }

  private normalizePhoneForWhatsApp(phone: string): string {
    let cleaned = String(phone || '').replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
    if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
    if (!cleaned.startsWith('39') && cleaned.length <= 10) {
      cleaned = `39${cleaned}`;
    }
    return cleaned;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // ---- NAV ----
  goToDocument(id: string): void {
    this.router.navigate(['/documenti/employee', id]);
  }

  goToPermessiAssenze(empId: number) {
    this.router.navigate(['/homeAdmin/gestionepermessi'], {
      queryParams: { employeeId: empId },
    });
  }

  back() {
    this.router.navigateByUrl('/homeAdmin');
  }
}
