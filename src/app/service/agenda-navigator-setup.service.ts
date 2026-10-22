import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AuthServiceService } from '../auth-service.service';
import { AgendaNavigatorDialogComponent } from '../shared/agenda-navigator-dialog/agenda-navigator-dialog.component';
import { AgendaWidgetService } from './agenda-widget.service';

@Injectable({ providedIn: 'root' })
export class AgendaNavigatorSetupService {
  private pending?: Promise<void>;

  constructor(private widget: AgendaWidgetService, private auth: AuthServiceService, private dialog: MatDialog) {}

  showAfterLogin(): Promise<void> {
    if (this.pending) return this.pending;
    const token = this.auth.token;
    if (!this.widget.navigationAvailable || !token ||
        !this.auth.permissions.some(permission => ['CALENDAR_VIEW', 'CALENDAR_EVENT_MANAGE'].includes(permission))) {
      return Promise.resolve();
    }
    // Check the native preference rather than an "onboarding seen" flag: this
    // also covers existing installations and a navigator that was removed.
    this.pending = this.checkAndShow(token).catch(error => {
      console.warn('[AgendaNavigator] Scelta iniziale non disponibile', error);
    }).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async checkAndShow(token: string): Promise<void> {
    const navigation = await this.widget.getNavigationPreferences();
    if (this.auth.token !== token || navigation.selected || !navigation.available.length) return;
    const ref = this.dialog.open(AgendaNavigatorDialogComponent, {
      data: navigation,
      width: 'min(440px, calc(100vw - 32px))',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: 'calc(100dvh - 48px)',
      panelClass: 'app-alert-dialog-panel',
      backdropClass: 'app-alert-dialog-backdrop',
      ariaLabelledBy: 'agenda-navigator-title',
      ariaDescribedBy: 'agenda-navigator-description',
      autoFocus: 'first-tabbable',
      restoreFocus: false,
      disableClose: true,
    });
    await firstValueFrom(ref.afterClosed());
  }
}
