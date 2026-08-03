import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ContactRequirementPromptService } from '../../service/contact-requirement-prompt.service';
import { NoteUnreadService } from '../../service/note-unread.service';

@Component({
  selector: 'app-gestione-employees',
  templateUrl: './gestione-employees.component.html',
  styleUrls: ['./gestione-employees.component.css'],
})
export class GestioneEmployeesComponent implements OnInit {
  employees: any[] = [];
  employeeView: 'directory' | 'settings' = 'directory';
  employeeSearch = '';
  showArchived = false;
  settingsAction: 'new' | 'edit' | 'categories' = 'new';
  settingsEmployeeId: number | null = null;
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
    private route: ActivatedRoute,
    private modalService: NgbModal,
    private contactPrompt: ContactRequirementPromptService,
    public noteUnread: NoteUnreadService,
  ) {}

  ngOnInit(): void {
    this.noteUnread.start();
    this.applyRouteState();
    this.getEmployees();
  }

  setEmployeeView(view: 'directory' | 'settings'): void {
    this.employeeView = view;
    if (view === 'directory') {
      this.settingsEmployeeId = null;
      void this.router.navigate(['/homeAdmin/gestioneemployees']);
      this.getEmployees();
    }
  }

  get filteredEmployees(): any[] {
    const query = this.normalize(this.employeeSearch);
    if (!query) return this.employees;
    return this.employees.filter((employee) => this.normalize([
      employee?.id,
      employee?.nome,
      employee?.cognome,
      employee?.email,
      employee?.cellulare,
    ].join(' ')).includes(query));
  }

  clearEmployeeSearch(): void {
    this.employeeSearch = '';
  }

  get employeeViewTitle(): string {
    if (this.employeeView === 'directory') return 'Dipendenti';
    if (this.settingsAction === 'edit') return 'Modifica dipendente';
    if (this.settingsAction === 'categories') return 'Categorie dipendente';
    return 'Nuovo dipendente';
  }

  toggleShowArchived(): void {
    this.showArchived = !this.showArchived;
    this.selected.clear();
    this.getEmployees();
  }

  openEmployeeSettings(action: 'new' | 'edit' | 'categories', employee?: any): void {
    const employeeId = employee?.id ? Number(employee.id) : null;
    if (action === 'new') {
      void this.router.navigate(['/homeAdmin/gestioneemployees/nuovo']);
      return;
    }
    if (!employeeId) return;
    const segment = action === 'edit' ? 'modifica' : 'categorie';
    void this.router.navigate(['/homeAdmin/gestioneemployees', segment, employeeId]);
  }

  private applyRouteState(): void {
    const action = this.route.snapshot.data['employeeAction'];
    const employeeId = Number(this.route.snapshot.paramMap.get('employeeId') || 0);
    if (action !== 'new' && action !== 'edit' && action !== 'categories') return;
    if ((action === 'edit' || action === 'categories') && !employeeId) return;
    this.settingsAction = action;
    this.settingsEmployeeId = employeeId || null;
    this.employeeView = 'settings';
  }

  navigateToEmployeeNotes(employee: any): void {
    this.router.navigate(['/homeAdmin/employeeNotes'], {
      queryParams: {
        entity: 'employee',
        employeeId: employee.id,
        displayName: `${employee.nome || ''} ${employee.cognome || ''}`.trim(),
        returnTo: '/homeAdmin/gestioneemployees',
      },
    });
  }

  navigateToEmployeeProfile(employee: any): void {
    this.router.navigate(['/homeAdmin/schedaDipendente', employee.id]);
  }

  private normalize(value: string): string {
    return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  }

  // Carica lista dipendenti
  getEmployees(): void {
    this.http
      .get(this.globalService.url + `employees/getAll${this.showArchived ? '?includeArchived=true' : ''}`, {
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
      this.filteredEmployees.length > 0 && this.filteredEmployees.every((employee) => this.selected.has(Number(employee.id)))
    );
  }

  get someSelected(): boolean {
    const visibleSelected = this.filteredEmployees.filter((employee) => this.selected.has(Number(employee.id))).length;
    return visibleSelected > 0 && visibleSelected < this.filteredEmployees.length;
  }

  toggleSelectAll() {
    if (this.allSelected) {
      this.selected.clear();
      return;
    }
    this.selected.clear();
    this.filteredEmployees.forEach((e) => this.selected.add(Number(e.id)));
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
      this.contactPrompt.promptEmployeePhoneMissing();
      return;
    }

    window.open(`https://wa.me/${normalizedPhone}`, '_blank', 'noopener,noreferrer');
  }

  composeEmployeeEmail(emp: any): void {
    const email = String(emp?.email || '').trim();
    if (!email) {
      this.contactPrompt.promptEmployeeEmailMissing();
      return;
    }

    if (!this.isValidEmail(email)) {
      alert('Indirizzo email dipendente non valido.');
      return;
    }

    const name = `${emp?.nome || ''} ${emp?.cognome || ''}`.trim();
    this.router.navigate(['/homeAdmin/email'], {
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
    this.router.navigate(['/homeAdmin/documenti/employee', id]);
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
