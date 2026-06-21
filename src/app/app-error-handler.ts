import { ErrorHandler, Injectable, NgZone } from '@angular/core';
import { PopupServiceService } from './componenti/popup/popup-service.service';
import { ClientIssueReporterService } from './service/client-issue-reporter.service';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private lastErrorAt = 0;
  private lastMessage = '';

  constructor(
    private popup: PopupServiceService,
    private zone: NgZone,
    private reporter: ClientIssueReporterService,
  ) {}

  handleError(error: unknown): void {
    console.error('[AppErrorHandler] Errore non gestito:', error);

    const message = this.extractMessage(error);
    this.reporter.report('frontend_exception', message, {
      stack: (error as any)?.stack || (error as any)?.ngOriginalError?.stack || '',
    }, 'error');
    const now = Date.now();
    if (message === this.lastMessage && now - this.lastErrorAt < 1500) {
      return;
    }

    this.lastMessage = message;
    this.lastErrorAt = now;

    this.zone.run(() => {
      this.popup.showError(message, 'Errore imprevisto');
    });
  }

  private extractMessage(error: unknown): string {
    const originalError = (error as any)?.ngOriginalError || error;

    if ((originalError as any)?.rejection) {
      return this.extractMessage((originalError as any).rejection);
    }

    if (originalError instanceof Error && originalError.message) {
      return originalError.message;
    }

    if (typeof originalError === 'string' && originalError.trim()) {
      return originalError;
    }

    return 'Si è verificato un errore imprevisto. Riprova.';
  }
}
