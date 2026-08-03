import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupComponentComponent } from './popup-component/popup-component.component';
import { firstValueFrom } from 'rxjs';

export type AppDialogTone = 'error' | 'warning' | 'success' | 'info';

export interface AppDialogData {
  mode: 'alert' | 'action' | 'confirm' | 'prompt' | 'choice' | 'evidence';
  title: string;
  message: string;
  type: AppDialogTone;
  confirmLabel: string;
  cancelLabel?: string;
  secondaryLabel?: string;
  inputLabel?: string;
  inputValue?: string;
  inputType?: 'text' | 'number' | 'date' | 'email';
}

@Injectable({
  providedIn: 'root'
})
export class PopupServiceService {

  text = '';
  title = 'Attenzione';
  type: AppDialogTone = 'warning';
  private browserAlertInstalled = false;
  private readonly nativeAlert = window.alert.bind(window);
  private lastDialogKey = '';
  private lastDialogAt = 0;
  private readonly shownHttpErrors = new WeakSet<object>();
  private readonly scheduledHttpErrors = new WeakSet<object>();

  constructor(private dialog: MatDialog) { }

  openPopup(
    title = 'Attenzione',
    type: AppDialogTone = this.guessType(this.text),
  ) {
    const key = `${title}|${type}|${this.text}`;
    const now = Date.now();
    if (key === this.lastDialogKey && now - this.lastDialogAt < 1200) {
      return;
    }
    this.lastDialogKey = key;
    this.lastDialogAt = now;

    this.title = title;
    this.type = type;
    return this.openDialog({
      mode: 'alert',
      title,
      message: this.text,
      type,
      confirmLabel: 'Ok',
    });
  }

  private openDialog(data: AppDialogData) {
    return this.dialog.open(PopupComponentComponent, {
      width: 'min(420px, calc(100vw - 32px))',
      maxWidth: 'calc(100vw - 32px)',
      panelClass: 'app-alert-dialog-panel',
      backdropClass: 'app-alert-dialog-backdrop',
      autoFocus: data.mode === 'prompt' ? 'input' : false,
      restoreFocus: false,
      disableClose: data.mode !== 'alert',
      data,
    });
  }

  show(message: unknown, title = 'Attenzione', type: AppDialogTone = 'warning') {
    this.text = this.formatMessage(message);
    this.openPopup(title, type);
  }

  showError(message: unknown, title = 'Errore'): void {
    this.show(message, title, 'error');
  }

  async action(
    message: unknown,
    title = 'Attenzione',
    options: {
      type?: AppDialogTone;
      actionLabel?: string;
    } = {},
  ): Promise<void> {
    const ref = this.openDialog({
      mode: 'action',
      title,
      message: this.formatMessage(message),
      type: options.type || 'warning',
      confirmLabel: options.actionLabel || 'Continua',
    });
    await firstValueFrom(ref.afterClosed());
  }

  async confirm(
    message: unknown,
    title = 'Conferma operazione',
    options: {
      type?: AppDialogTone;
      confirmLabel?: string;
      cancelLabel?: string;
    } = {},
  ): Promise<boolean> {
    const ref = this.openDialog({
      mode: 'confirm',
      title,
      message: this.formatMessage(message),
      type: options.type || 'warning',
      confirmLabel: options.confirmLabel || 'Conferma',
      cancelLabel: options.cancelLabel || 'Annulla',
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }

  async choose(
    message: unknown,
    title: string,
    options: { primaryLabel: string; secondaryLabel: string; cancelLabel?: string },
  ): Promise<'primary' | 'secondary' | null> {
    const ref = this.openDialog({
      mode: 'choice',
      title,
      message: this.formatMessage(message),
      type: 'info',
      confirmLabel: options.primaryLabel,
      secondaryLabel: options.secondaryLabel,
      cancelLabel: options.cancelLabel || 'Annulla',
    });
    const result = await firstValueFrom(ref.afterClosed());
    return result === 'primary' || result === 'secondary' ? result : null;
  }

  async evidence(message: unknown, title = 'Dati di prova della firma'): Promise<'save' | 'print' | null> {
    const ref = this.openDialog({
      mode: 'evidence',
      title,
      message: this.formatMessage(message),
      type: 'info',
      confirmLabel: 'Salva',
      secondaryLabel: 'Stampa',
      cancelLabel: 'Chiudi',
    });
    const result = await firstValueFrom(ref.afterClosed());
    return result === 'save' || result === 'print' ? result : null;
  }

  async prompt(
    message: unknown,
    initialValue = '',
    title = 'Inserisci un valore',
    options: {
      type?: AppDialogTone;
      confirmLabel?: string;
      cancelLabel?: string;
      inputLabel?: string;
      inputType?: 'text' | 'number' | 'date' | 'email';
    } = {},
  ): Promise<string | null> {
    const ref = this.openDialog({
      mode: 'prompt',
      title,
      message: this.formatMessage(message),
      type: options.type || 'info',
      confirmLabel: options.confirmLabel || 'Continua',
      cancelLabel: options.cancelLabel || 'Annulla',
      inputLabel: options.inputLabel || 'Valore',
      inputValue: String(initialValue ?? ''),
      inputType: options.inputType || 'text',
    });
    const result = await firstValueFrom(ref.afterClosed());
    return typeof result === 'string' ? result : null;
  }

  showHttpError(err: any, fallback = 'Errore imprevisto. Riprova.', title = 'Errore'): void {
    this.markHttpErrorShown(err);
    this.showError(this.parseServerError(err, fallback), title);
  }

  scheduleHttpError(err: any, fallback = 'Operazione non completata. Riprova.', title = 'Operazione non riuscita'): void {
    const key = this.getErrorObject(err);
    if (!key || this.shownHttpErrors.has(key) || this.scheduledHttpErrors.has(key)) {
      return;
    }

    this.scheduledHttpErrors.add(key);
    setTimeout(() => {
      this.scheduledHttpErrors.delete(key);
      if (!this.shownHttpErrors.has(key)) {
        this.showHttpError(err, fallback, title);
      }
    }, 0);
  }

  closePopup() {
    this.dialog.closeAll();
  }

  installBrowserAlertBridge(): void {
    if (this.browserAlertInstalled) {
      return;
    }

    this.browserAlertInstalled = true;
    window.alert = (message?: unknown) => {
      try {
        this.show(message ?? '', 'Attenzione', this.guessType(message));
      } catch (err) {
        console.error('[PopupService] Errore apertura dialog alert:', err);
        this.nativeAlert(String(message ?? ''));
      }
    };
  }

  private guessType(message: unknown): AppDialogTone {
    const text = this.formatMessage(message).toLowerCase();
    if (
      text.includes('errore') ||
      text.includes('non riusc') ||
      text.includes('impossibile') ||
      text.includes('non disponibile') ||
      text.includes('non autorizz')
    ) {
      return 'error';
    }
    if (text.includes('success') || text.includes('riuscit') || text.includes('salvat')) {
      return 'success';
    }
    return 'warning';
  }

  parseServerError(err: any, fallback = 'Errore imprevisto. Riprova.'): string {
    try {
      if (err?.status === 0) {
        return 'Impossibile connettersi al server. Controlla la connessione e riprova.';
      }

      const body = typeof err?.error === 'string' ? JSON.parse(err.error) : err?.error;
      if (body?.code === 'PAYMENT_REQUIRED') {
        return this.formatPaymentRequiredMessage(body);
      }
      const detailedMessage = this.extractDetailedServerMessage(body);
      if (detailedMessage) return detailedMessage;
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);

      if (typeof err?.error === 'string' && err.error.trim()) {
        return err.error;
      }

      const status = Number(err?.status || 0);
      if (status >= 500) {
        return 'Il server ha risposto con un errore. Riprova tra poco o contatta l\'assistenza.';
      }
      if (status === 404) {
        return 'Risorsa non trovata. Aggiorna la pagina e riprova.';
      }

      if (err?.message) {
        return String(err.message);
      }
    } catch {
      if (typeof err?.error === 'string' && err.error.trim()) {
        return err.error;
      }
    }

    return fallback;
  }

  private formatPaymentRequiredMessage(body: any): string {
    const formatDate = (value: unknown): string => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      const date = new Date(`${raw.slice(0, 10)}T12:00:00`);
      return Number.isNaN(date.getTime())
        ? ''
        : new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
    };
    const dueDate = formatDate(body?.dueDate);
    const suspensionDate = formatDate(body?.suspensionDate);
    const lines = ['Accesso a MVanager sospeso per mancato pagamento.'];
    if (dueDate) lines.push(`Pagamento previsto entro il ${dueDate}.`);
    if (suspensionDate) lines.push(`Servizio sospeso dal ${suspensionDate}.`);
    lines.push('Per riattivare l’accesso, contatta MVTechCore dopo aver regolarizzato il pagamento.');
    return lines.join('\n');
  }

  private markHttpErrorShown(err: unknown): void {
    const key = this.getErrorObject(err);
    if (key) {
      this.shownHttpErrors.add(key);
    }
  }

  private getErrorObject(err: unknown): object | null {
    return typeof err === 'object' && err !== null ? err : null;
  }

  private extractDetailedServerMessage(body: any): string {
    const details = body?.details || body?.errors;
    if (!details) {
      return '';
    }

    if (Array.isArray(details)) {
      const lines = details
        .map((item) => this.formatServerDetail(item))
        .filter((line) => !!line);
      return lines.join('\n');
    }

    if (typeof details === 'object') {
      const lines = Object.entries(details)
        .map(([field, value]) => {
          const text = Array.isArray(value) ? value.join(', ') : String(value || '');
          return text ? `${field}: ${text}` : '';
        })
        .filter((line) => !!line);
      return lines.join('\n');
    }

    return String(details || '');
  }

  private formatServerDetail(item: unknown): string {
    if (typeof item === 'string') {
      return item;
    }

    if (typeof item === 'object' && item !== null) {
      const value = item as { message?: unknown; field?: unknown; path?: unknown };
      const message = String(value.message || '').trim();
      const field = String(value.field || value.path || '').trim();
      if (message && field) return `${field}: ${message}`;
      if (message) return message;
      if (field) return field;
    }

    return '';
  }

  private formatMessage(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }

    if (message instanceof Error) {
      return message.message;
    }

    if (message == null) {
      return '';
    }

    try {
      return JSON.stringify(message);
    } catch {
      return String(message);
    }
  }
}
