import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';

interface EmailAccount {
  id?: number;
  label: string;
  email: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  username: string;
  password?: string;
  active: boolean;
  adminIds: number[];
  smtpStatus?: string;
  smtpLastError?: string | null;
  smtpLastCheckAt?: string | null;
  smtpLastOkAt?: string | null;
  imapStatus?: string;
  imapLastError?: string | null;
  imapLastCheckAt?: string | null;
  imapLastOkAt?: string | null;
  connectionStatus?: string;
  connectionError?: string | null;
}

interface AdminOption {
  id: number;
  nome: string;
  cognome: string;
  email: string;
}

@Component({
  selector: 'app-email-settings',
  templateUrl: './email-settings.component.html',
  styleUrls: ['./email-settings.component.css'],
})
export class EmailSettingsComponent implements OnInit {
  accounts: EmailAccount[] = [];
  admins: AdminOption[] = [];
  loading = false;
  saving = false;
  testingId: number | null = null;
  editingId: number | null = null;

  form: EmailAccount = this.emptyForm();

  constructor(
    private http: HttpClient,
    private router: Router,
    public globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.loadAll();
  }

  back() {
    this.router.navigateByUrl('/homeAdmin');
  }

  emptyForm(): EmailAccount {
    return {
      label: '',
      email: '',
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      imapHost: '',
      imapPort: 993,
      imapSecure: true,
      username: '',
      password: '',
      active: true,
      adminIds: [],
    };
  }

  loadAll() {
    this.loading = true;
    Promise.all([
      this.http.get<EmailAccount[]>(this.globalService.url + 'admin/email/accounts').toPromise(),
      this.http.get<AdminOption[]>(this.globalService.url + 'admin/email/admins').toPromise(),
    ])
      .then(([accounts, admins]) => {
        this.accounts = accounts || [];
        this.admins = admins || [];
        this.loading = false;
      })
      .catch((err) => {
        console.error('Errore caricamento impostazioni email:', err);
        alert(err?.error?.error || 'Errore nel caricamento delle impostazioni email');
        this.loading = false;
      });
  }

  startNew() {
    this.editingId = null;
    this.form = this.emptyForm();
  }

  startEdit(account: EmailAccount) {
    this.editingId = account.id || null;
    this.form = {
      ...account,
      password: '',
      adminIds: [...(account.adminIds || [])],
    };
  }

  toggleAdmin(adminId: number) {
    const ids = this.form.adminIds || [];
    this.form.adminIds = ids.includes(adminId)
      ? ids.filter((id) => id !== adminId)
      : [...ids, adminId];
  }

  adminName(admin: AdminOption): string {
    return `${admin.nome || ''} ${admin.cognome || ''}`.trim() || admin.email;
  }

  save() {
    if (!this.form.email || !this.form.smtpHost || !this.form.imapHost) {
      alert('Email, server SMTP e server IMAP sono obbligatori');
      return;
    }

    this.saving = true;
    this.http.post(this.globalService.url + 'admin/email/accounts', this.form).subscribe({
      next: () => {
        this.saving = false;
        this.startNew();
        this.loadAll();
      },
      error: (err) => {
        console.error('Errore salvataggio account email:', err);
        alert(err?.error?.error || 'Errore salvataggio account email');
        this.saving = false;
      },
    });
  }

  test(account: EmailAccount) {
    if (!account.id) return;
    this.testingId = account.id;
    this.http.post(this.globalService.url + `admin/email/accounts/${account.id}/test`, {}).subscribe({
      next: () => {
        alert('Connessione SMTP e IMAP riuscita');
        this.testingId = null;
        this.loadAll();
      },
      error: (err) => {
        console.error('Test account email fallito:', err);
        alert(err?.error?.error || 'Test account email non riuscito');
        this.testingId = null;
        this.loadAll();
      },
    });
  }

  accountHasConnectionIssue(account: EmailAccount): boolean {
    return account.connectionStatus === 'error' || account.smtpStatus === 'error' || account.imapStatus === 'error';
  }

  accountHealthSummary(account: EmailAccount): string {
    if (this.accountHasConnectionIssue(account)) {
      if (account.smtpStatus === 'error' && account.imapStatus === 'error') return 'SMTP e IMAP in errore';
      if (account.smtpStatus === 'error') return 'SMTP in errore';
      if (account.imapStatus === 'error') return 'IMAP in errore';
      return 'Connessione in errore';
    }
    if (account.connectionStatus === 'ok') return 'Connessione verificata';
    return 'In attesa di controllo automatico';
  }

  accountHealthClass(account: EmailAccount): string {
    if (this.accountHasConnectionIssue(account)) return 'health-badge health-badge-error';
    if (account.connectionStatus === 'ok') return 'health-badge health-badge-ok';
    return 'health-badge';
  }

  lastHealthCheck(account: EmailAccount): string {
    const dates = [
      account.smtpLastCheckAt,
      account.imapLastCheckAt,
    ].filter(Boolean).map((value) => new Date(String(value)));
    const validDates = dates.filter((date) => Number.isFinite(date.getTime()));
    if (!validDates.length) return 'Mai controllato';
    const latest = validDates.sort((a, b) => b.getTime() - a.getTime())[0];
    return latest.toLocaleString('it-IT');
  }

  delete(account: EmailAccount) {
    if (!account.id) return;
    const ok = confirm(`Eliminare l'account email "${account.email}"?`);
    if (!ok) return;

    this.http.delete(this.globalService.url + `admin/email/accounts/${account.id}`).subscribe({
      next: () => this.loadAll(),
      error: (err) => {
        console.error('Errore eliminazione account email:', err);
        alert(err?.error?.error || 'Errore eliminazione account email');
      },
    });
  }
}
