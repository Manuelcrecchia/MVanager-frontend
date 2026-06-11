import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';

type MailFolder = 'unread' | 'inbox' | 'sent' | 'trash';

interface EmailAccount {
  id: number;
  label: string;
  email: string;
  lastSyncAt?: string | null;
  unreadCount?: number;
}

interface EmailMessage {
  id: number;
  accountId: number;
  accountEmail: string;
  accountLabel: string;
  folder: MailFolder;
  fromName: string;
  fromEmail: string;
  to: Array<{ name: string; email: string }>;
  cc: Array<{ name: string; email: string }>;
  subject: string;
  preview: string;
  textBody: string;
  htmlBody: string;
  sentAt?: string | null;
  receivedAt?: string | null;
  read: boolean;
  attachments: EmailAttachment[];
}

interface EmailAttachment {
  id: number;
  filename: string;
  contentType: string;
  size: number;
}

interface InternalEmailDocument {
  source?: 'internal' | 'employee' | 'customer';
  sourceLabel?: string;
  ownerId?: string;
  ownerLabel?: string;
  filename: string;
  folder: string;
  size: number;
  updatedAt?: string;
}

@Component({
  selector: 'app-email-home',
  templateUrl: './email-home.component.html',
  styleUrls: ['./email-home.component.css'],
})
export class EmailHomeComponent implements OnInit {
  accounts: EmailAccount[] = [];
  messages: EmailMessage[] = [];
  selectedMessage: EmailMessage | null = null;
  selectedAccountId: number | null = null;
  selectedFolder: MailFolder = 'inbox';
  messageSearchQuery = '';
  loading = false;
  sending = false;
  composeOpen = false;
  safeHtml = '';
  selectedFiles: File[] = [];
  internalFolder = '';
  internalFolders: string[] = [];
  internalFiles: InternalEmailDocument[] = [];
  selectedInternalAttachments: InternalEmailDocument[] = [];
  attachmentSearchQuery = '';
  attachmentSearchResults: InternalEmailDocument[] = [];
  attachmentSearchSources: string[] = [];

  compose = {
    accountId: 0,
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
  };

  folders: Array<{ id: MailFolder; label: string; icon: string }> = [
    { id: 'unread', label: 'Non lette', icon: 'fas fa-circle' },
    { id: 'inbox', label: 'In arrivo', icon: 'fas fa-inbox' },
    { id: 'sent', label: 'Inviate', icon: 'fas fa-paper-plane' },
    { id: 'trash', label: 'Cestino', icon: 'fas fa-trash' },
  ];

  get selectedFolderLabel(): string {
    return (
      this.folders.find((folder) => folder.id === this.selectedFolder)?.label ||
      'Email'
    );
  }

  constructor(
    private http: HttpClient,
    private router: Router,
    public globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.loadAccounts();
  }

  back() {
    this.router.navigateByUrl('/homeAdmin');
  }

  loadAccounts() {
    this.http.get<EmailAccount[]>(this.globalService.url + 'admin/email/accounts/accessible').subscribe({
      next: (accounts) => {
        this.accounts = accounts || [];
        if (this.accounts.length > 0) {
          this.compose.accountId = this.accounts[0].id;
          this.selectedAccountId = this.accounts[0].id;
        }
        this.loadMessages();
      },
      error: (err) => {
        console.error('Errore caricamento account email:', err);
        alert(err?.error?.error || 'Errore caricamento account email');
      },
    });
  }

  loadMessages() {
    this.loading = true;
    const params: string[] = [`folder=${this.selectedFolder}`];
    if (this.selectedAccountId) params.push(`accountId=${this.selectedAccountId}`);
    if (this.messageSearchQuery.trim()) {
      params.push(`search=${encodeURIComponent(this.messageSearchQuery.trim())}`);
    }

    this.http
      .get<EmailMessage[]>(this.globalService.url + `admin/email/messages?${params.join('&')}`)
      .subscribe({
        next: (messages) => {
          this.messages = messages || [];
          this.loading = false;
          if (this.selectedMessage) {
            const refreshed = this.messages.find((m) => m.id === this.selectedMessage?.id);
            if (!refreshed) this.selectedMessage = null;
          }
        },
        error: (err) => {
          console.error('Errore caricamento email:', err);
          alert(err?.error?.error || 'Errore caricamento email');
          this.loading = false;
        },
      });
  }

  selectFolder(folder: MailFolder) {
    this.selectedFolder = folder;
    this.selectedMessage = null;
    this.loadMessages();
  }

  selectAccount(accountId: number) {
    this.selectedAccountId = accountId;
    this.selectedMessage = null;
    this.loadMessages();
  }

  searchMessages() {
    this.selectedMessage = null;
    this.loadMessages();
  }

  clearMessageSearch() {
    this.messageSearchQuery = '';
    this.searchMessages();
  }

  openMessage(message: EmailMessage) {
    this.http.get<EmailMessage>(this.globalService.url + `admin/email/messages/${message.id}`).subscribe({
      next: (detail) => {
        this.selectedMessage = detail;
        this.safeHtml = detail.htmlBody || this.textToHtml(detail.textBody);
        if (!message.read) {
          message.read = true;
          this.updateAccountUnreadCount(message.accountId, -1);
          this.notifyUnreadChanged();
        }
      },
      error: (err) => {
        console.error('Errore apertura email:', err);
        alert(err?.error?.error || 'Errore apertura email');
      },
    });
  }

  newEmail() {
    this.composeOpen = true;
    this.compose = {
      accountId: this.accounts[0]?.id || 0,
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      body: '',
    };
    this.selectedFiles = [];
    this.selectedInternalAttachments = [];
    this.attachmentSearchQuery = '';
    this.attachmentSearchResults = [];
    if (this.canUseInternalDocuments) {
      this.searchAppAttachments();
    }
  }

  closeCompose() {
    this.composeOpen = false;
  }

  send() {
    if (!this.compose.accountId || !this.compose.to || !this.compose.subject || !this.compose.body) {
      alert('Mittente, destinatario, oggetto e testo sono obbligatori');
      return;
    }

    const formData = new FormData();
    formData.append('accountId', String(this.compose.accountId));
    formData.append('to', this.compose.to);
    formData.append('cc', this.compose.cc);
    formData.append('bcc', this.compose.bcc);
    formData.append('subject', this.compose.subject);
    formData.append('body', this.compose.body);
    formData.append(
      'internalAttachments',
      JSON.stringify(
        this.selectedInternalAttachments.map((item) => ({
          source: item.source || 'internal',
          ownerId: item.ownerId || '',
          folder: item.folder,
          filename: item.filename,
        })),
      ),
    );
    this.selectedFiles.forEach((file) => {
      formData.append('attachments', file, file.name);
    });

    this.sending = true;
    this.http.post(this.globalService.url + 'admin/email/messages/send', formData).subscribe({
      next: () => {
        this.sending = false;
        this.composeOpen = false;
        this.selectedFolder = 'sent';
        this.loadMessages();
      },
      error: (err) => {
        console.error('Errore invio email:', err);
        alert(err?.error?.error || 'Errore invio email');
        this.sending = false;
      },
    });
  }

  get canUseInternalDocuments(): boolean {
    return (
      this.globalService.hasPermission('INTERNAL_DOCS_ACCESS') ||
      this.globalService.hasPermission('EMPLOYEE_DOCS_MANAGE') ||
      this.globalService.hasPermission('CUSTOMERS_VIEW')
    );
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    this.selectedFiles = [...this.selectedFiles, ...files];
    input.value = '';
  }

  removeSelectedFile(index: number) {
    this.selectedFiles = this.selectedFiles.filter((_, i) => i !== index);
  }

  loadInternalDocuments(folder: string) {
    if (!this.canUseInternalDocuments) return;
    this.internalFolder = folder;
    this.http
      .post<{
        folder: string;
        folders: string[];
        files: InternalEmailDocument[];
      }>(this.globalService.url + 'admin/email/internal-documents/browser', {
        folder,
      })
      .subscribe({
        next: (res) => {
          this.internalFolder = res?.folder || folder || '';
          this.internalFolders = res?.folders || [];
          this.internalFiles = res?.files || [];
        },
        error: (err) => {
          console.error('Errore caricamento documenti interni:', err);
          alert(err?.error?.error || 'Errore caricamento documenti interni');
        },
      });
  }

  searchAppAttachments() {
    if (!this.canUseInternalDocuments) return;
    this.http
      .post<{
        sources: string[];
        results: InternalEmailDocument[];
      }>(this.globalService.url + 'admin/email/attachments/search', {
        query: this.attachmentSearchQuery,
        limit: 80,
      })
      .subscribe({
        next: (res) => {
          this.attachmentSearchSources = res?.sources || [];
          this.attachmentSearchResults = res?.results || [];
        },
        error: (err) => {
          console.error('Errore ricerca allegati app:', err);
          alert(err?.error?.error || 'Errore ricerca allegati app');
        },
      });
  }

  openInternalFolder(folder: string) {
    this.loadInternalDocuments(this.joinPath(this.internalFolder, folder));
  }

  goUpInternalFolder() {
    const parts = this.internalFolder.split('/').filter(Boolean);
    parts.pop();
    this.loadInternalDocuments(parts.join('/'));
  }

  toggleInternalAttachment(file: InternalEmailDocument) {
    const normalizedFile = this.normalizeAttachmentDocument(file);
    const exists = this.isInternalAttachmentSelected(file);
    if (exists) {
      this.selectedInternalAttachments = this.selectedInternalAttachments.filter(
        (item) => !this.sameInternalDocument(item, normalizedFile),
      );
      return;
    }
    this.selectedInternalAttachments = [...this.selectedInternalAttachments, normalizedFile];
  }

  isInternalAttachmentSelected(file: InternalEmailDocument): boolean {
    return this.selectedInternalAttachments.some((item) =>
      this.sameInternalDocument(item, file),
    );
  }

  private sameInternalDocument(
    a: InternalEmailDocument,
    b: InternalEmailDocument,
  ): boolean {
    const left = this.normalizeAttachmentDocument(a);
    const right = this.normalizeAttachmentDocument(b);
    return (
      left.source === right.source &&
      left.ownerId === right.ownerId &&
      left.folder === right.folder &&
      left.filename === right.filename
    );
  }

  private normalizeAttachmentDocument(file: InternalEmailDocument): InternalEmailDocument {
    return {
      ...file,
      source: file.source || 'internal',
      sourceLabel: file.sourceLabel || 'Documenti interni',
      ownerId: file.ownerId || '',
      ownerLabel: file.ownerLabel || 'Documenti interni',
      folder: file.folder || '',
    };
  }

  private joinPath(base: string, part: string): string {
    return [base, part].filter(Boolean).join('/');
  }

  trash(message: EmailMessage, event?: Event) {
    event?.stopPropagation();
    this.http.post(this.globalService.url + `admin/email/messages/${message.id}/trash`, {}).subscribe({
      next: () => {
        if (this.selectedMessage?.id === message.id) this.selectedMessage = null;
        if (!message.read) {
          this.updateAccountUnreadCount(message.accountId, -1);
          this.notifyUnreadChanged();
        }
        this.loadMessages();
      },
      error: (err) => {
        console.error('Errore cestino email:', err);
        alert(err?.error?.error || 'Errore spostamento nel cestino');
      },
    });
  }

  accountName(account: EmailAccount): string {
    return account.label || account.email;
  }

  accountHasUnread(account: EmailAccount): boolean {
    return (account.unreadCount || 0) > 0;
  }

  sender(message: EmailMessage): string {
    if (message.folder === 'sent') {
      return 'A: ' + (message.to || []).map((item) => item.email).join(', ');
    }
    return message.fromName || message.fromEmail || 'Mittente sconosciuto';
  }

  firstRecipient(message: EmailMessage): string {
    return message.to && message.to.length > 0 ? message.to[0].email : '';
  }

  messageDate(message: EmailMessage): string | null {
    return message.receivedAt || message.sentAt || null;
  }

  attachmentLabel(attachment: EmailAttachment): string {
    const kb = attachment.size ? Math.ceil(attachment.size / 1024) : 0;
    return kb ? `${attachment.filename} · ${kb} KB` : attachment.filename;
  }

  downloadAttachment(attachment: EmailAttachment) {
    this.http
      .get(
        this.globalService.url + `admin/email/attachments/${attachment.id}/download`,
        { responseType: 'blob' },
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = attachment.filename || 'allegato';
          a.click();
          URL.revokeObjectURL(url);
        },
        error: (err) => {
          console.error('Errore download allegato:', err);
          alert(err?.error?.error || 'Errore download allegato');
        },
      });
  }

  private textToHtml(text: string): string {
    return String(text || '')
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  private updateAccountUnreadCount(accountId: number, delta: number) {
    const account = this.accounts.find((item) => item.id === accountId);
    if (!account) return;
    account.unreadCount = Math.max(0, (account.unreadCount || 0) + delta);
  }

  private notifyUnreadChanged() {
    window.dispatchEvent(new CustomEvent('emailUnreadChanged'));
  }
}
