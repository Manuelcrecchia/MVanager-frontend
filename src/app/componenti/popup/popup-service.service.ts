import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { PopupComponentComponent } from './popup-component/popup-component.component';

@Injectable({
  providedIn: 'root'
})
export class PopupServiceService {

  text = '';
  title = 'Attenzione';
  type: 'error' | 'warning' | 'success' | 'info' = 'warning';
  private browserAlertInstalled = false;
  private readonly nativeAlert = window.alert.bind(window);
  private lastDialogKey = '';
  private lastDialogAt = 0;

  constructor(private dialog: MatDialog) { }

  openPopup(
    title = 'Attenzione',
    type: 'error' | 'warning' | 'success' | 'info' = this.guessType(this.text),
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
    this.dialog.open(PopupComponentComponent, {
      width: 'min(420px, calc(100vw - 32px))',
      maxWidth: 'calc(100vw - 32px)',
      panelClass: 'app-alert-dialog-panel',
      backdropClass: 'app-alert-dialog-backdrop',
      autoFocus: false,
      restoreFocus: false,
    });
  }

  show(message: unknown, title = 'Attenzione', type: 'error' | 'warning' | 'success' | 'info' = 'warning') {
    this.text = this.formatMessage(message);
    this.openPopup(title, type);
  }

  showError(message: unknown, title = 'Errore'): void {
    this.show(message, title, 'error');
  }

  showHttpError(err: any, fallback = 'Errore imprevisto. Riprova.'): void {
    this.showError(this.parseServerError(err, fallback));
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

  private guessType(message: unknown): 'error' | 'warning' | 'success' | 'info' {
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
      if (body?.error) return String(body.error);
      if (body?.message) return String(body.message);

      if (typeof err?.error === 'string' && err.error.trim()) {
        return err.error;
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
