import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { GlobalService } from '../../service/global.service';

interface AdminRow {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  codiceOperatore?: string;
}

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

@Component({
  selector: 'app-gestione-users',
  templateUrl: './gestione-users.component.html',
  styleUrls: ['./gestione-users.component.css'],
})
export class GestioneUsersComponent implements OnInit {
  admins: AdminRow[] = [];
  selected = new Set<number>();

  notifyTitle = '';
  notifyBody = '';
  notifyError = '';
  notifySuccess = '';
  sending = false;

  activeAdmin: AdminRow | null = null;
  adminNotifs: NotificationRow[] = [];
  adminNotifLoading = false;

  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router,
    private modalService: NgbModal,
  ) {}

  ngOnInit(): void {
    this.getAdmins();
  }

  getAdmins(): void {
    this.http
      .get<any>(this.globalService.url + 'admin/getAll', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (response) => {
          const data = Array.isArray(response)
            ? response
            : Array.isArray(response?.data)
              ? response.data
              : Array.isArray(response?.admins)
                ? response.admins
                : [];

          this.admins = data.map((admin: any) => ({
            id: Number(admin.id),
            nome: admin.nome || '',
            cognome: admin.cognome || '',
            email: admin.email || '',
            codiceOperatore: admin.codiceOperatore || '',
          }));

          const ids = new Set<number>(this.admins.map((a) => Number(a.id)));
          this.selected.forEach((id) => {
            if (!ids.has(id)) this.selected.delete(id);
          });
        },
        error: (error) => {
          console.error('Errore nel recupero degli amministratori:', error);
          alert('Errore durante il caricamento degli amministratori');
        },
      });
  }

  isSelected(id: number): boolean {
    return this.selected.has(Number(id));
  }

  toggleAdmin(id: number) {
    const adminId = Number(id);
    if (this.selected.has(adminId)) this.selected.delete(adminId);
    else this.selected.add(adminId);
  }

  get selectedCount(): number {
    return this.selected.size;
  }

  get allSelected(): boolean {
    return this.admins.length > 0 && this.selected.size === this.admins.length;
  }

  get someSelected(): boolean {
    return this.selected.size > 0 && this.selected.size < this.admins.length;
  }

  toggleSelectAll() {
    if (this.allSelected) {
      this.selected.clear();
      return;
    }

    this.selected.clear();
    this.admins.forEach((admin) => this.selected.add(Number(admin.id)));
  }

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

    const adminIds = Array.from(this.selected);
    this.sending = true;

    this.http
      .post<any>(
        this.globalService.url + 'admin/notifications/send-admins',
        {
          title,
          body,
          type: 'GENERICA',
          payload: null,
          adminIds,
          all: false,
        },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => {
          this.sending = false;
          this.notifySuccess = 'Notifica inviata con successo';
          setTimeout(() => modal.close(), 600);
        },
        error: (err) => {
          this.sending = false;
          this.notifyError =
            err?.error?.error ||
            err?.error?.message ||
            'Errore durante l’invio della notifica.';
        },
      });
  }

  openAdminNotifications(admin: AdminRow, content: any) {
    this.activeAdmin = admin;
    this.adminNotifs = [];
    this.adminNotifLoading = true;

    this.modalService.open(content, { centered: true, size: 'lg' });

    this.http
      .get<NotificationRow[]>(
        this.globalService.url + `admin/notifications/admin/${admin.id}`,
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: (res) => {
          this.adminNotifs = Array.isArray(res) ? res : [];
          this.adminNotifLoading = false;
        },
        error: (err) => {
          console.error('Errore notifiche admin:', err);
          this.adminNotifLoading = false;
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

  back() {
    this.router.navigateByUrl('/homeAdmin');
  }
}
