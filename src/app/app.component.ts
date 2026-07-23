import { Component } from '@angular/core';
import { HostListener } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { GlobalService } from './service/global.service';
import { NotificationNavigationService } from './service/notification-navigation.service';
import { BiometricService } from './service/biometric.service';
import { Router } from '@angular/router';
import { InspectionAlarmSyncService } from './service/inspection-alarm-sync.service';
import { AuthServiceService } from './auth-service.service';
import { PopupServiceService } from './componenti/popup/popup-service.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  title = 'mvanager';
  private biometricUnlockAttempted = false;
  private biometricUnlockInProgress = false;
  private sessionUnlocked = false;
  private tenantConfigRefreshInProgress = false;
  subscriptionNoticeDismissed = false;

  get subscriptionNotice(): { tone: 'warning' | 'urgent'; message: string } | null {
    if (this.subscriptionNoticeDismissed) return null;
    // A remembered token can still exist while the login screen is shown.
    // Never render a billing verdict from that previous session there: the
    // current tenant configuration is loaded only after a successful login.
    if (!this.globalService.token || this.isLoginRoute() || this.isPublicRoute()) return null;
    const billing = this.globalService.billingAccess;
    // A due date is retained for audit/history even after a payment or a full
    // discount has settled the instalment.  Only a non-active billing state
    // may render a customer-facing warning.
    if (!billing?.dueDate || billing.reason === 'active' || billing.reason === 'billing_unconfigured') return null;
    const suspensionDate = billing.suspensionDate
      ? new Date(`${billing.suspensionDate}T12:00:00`)
      : null;
    const formatDate = (date: Date) => new Intl.DateTimeFormat('it-IT', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(date);
    if (billing.blocked) return {
      tone: 'urgent',
      message: suspensionDate
        ? `L’accesso a MVanager è sospeso dal ${formatDate(suspensionDate)} per mancato pagamento. Contatta MVTechCore.`
        : 'L’accesso a MVanager è sospeso per mancato pagamento. Contatta MVTechCore.',
    };
    const due = new Date(`${billing.dueDate}T12:00:00`);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.ceil((due.getTime() - today.getTime()) / 86400000);
    const reminders = Array.isArray(billing.reminderDays) ? billing.reminderDays : [7, 3, 1];
    if (days < 0) {
      const overdue = `${Math.abs(days)} ${Math.abs(days) === 1 ? 'giorno' : 'giorni'}`;
      if (suspensionDate) {
        const daysToBlock = Math.ceil((suspensionDate.getTime() - today.getTime()) / 86400000);
        if (daysToBlock > 0) return {
          tone: 'urgent',
          message: `Il pagamento dell’abbonamento è scaduto da ${overdue}. MVanager verrà bloccato il ${formatDate(suspensionDate)} (tra ${daysToBlock} ${daysToBlock === 1 ? 'giorno' : 'giorni'}).`,
        };
      }
      return { tone: 'urgent', message: `Il pagamento dell’abbonamento è scaduto da ${overdue}. Regolarizza subito per evitare il blocco.` };
    }
    if (reminders.includes(days)) return { tone: days <= 1 ? 'urgent' : 'warning', message: `Il tuo abbonamento MVanager scade tra ${days} ${days === 1 ? 'giorno' : 'giorni'}.` };
    return null;
  }

  dismissSubscriptionNotice(): void {
    // Intentionally kept only in memory: a page reload, app restart, or new
    // session restores the reminder without storing a permanent preference.
    this.subscriptionNoticeDismissed = true;
  }

  isHomeAdminRoute(): boolean {
    return this.router.url.split('?')[0] === '/homeAdmin';
  }

  constructor(
    private globalService: GlobalService,
    private notificationNavigation: NotificationNavigationService,
    private biometricService: BiometricService,
    private router: Router,
    private inspectionAlarmSync: InspectionAlarmSyncService,
    private authService: AuthServiceService,
    private popupService: PopupServiceService,
  ) {}
  ngOnInit() {
    this.popupService.installBrowserAlertBridge();

    const platform = Capacitor.getPlatform();
    document.body.classList.toggle('cap-ios', platform === 'ios');
    document.body.classList.toggle('cap-android', platform === 'android');

    // Billing changes are made in MVControl while this app may already be
    // open.  Always discard the in-memory tenant configuration once on app
    // startup, then again when the user returns to this tab.
    this.refreshTenantConfigFromServer();

    if (platform === 'web') {
      return;
    }

    setTimeout(() => this.unlockExistingSessionWithBiometrics('startup'), 1200);

    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      // Se la pagina può tornare indietro → torna indietro
      if (canGoBack) {
        window.history.back();
        return;
      }

      // Se siamo nella root → NON chiudere l’app
      // (qui puoi persino mostrare il popup “vuoi uscire?”)
      console.log('🔙 Back disabilitato nella root');
    });

    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        if (!this.globalService.token) {
          this.sessionUnlocked = false;
          return;
        }

        if (this.sessionUnlocked) {
          this.inspectionAlarmSync.syncSoon('app-active').catch((err) => {
            console.error('[App] Errore sync promemoria appuntamento:', err);
          });
          this.navigatePendingNotificationIfLoggedIn();
        } else {
          this.unlockExistingSessionWithBiometrics('app-active');
        }
      }
    });
  }

  @HostListener('window:focus')
  onWindowFocus(): void {
    this.refreshTenantConfigFromServer();
  }

  private refreshTenantConfigFromServer(): void {
    if (!this.globalService.token || this.tenantConfigRefreshInProgress) return;
    this.tenantConfigRefreshInProgress = true;
    this.globalService
      .loadTenantConfig(true, { showError: false })
      .catch(() => null)
      .finally(() => { this.tenantConfigRefreshInProgress = false; });
  }

  private navigatePendingNotificationIfLoggedIn(): void {
    if (!this.globalService.token || !this.sessionUnlocked) {
      return;
    }

    this.notificationNavigation.navigatePendingIfAny().catch((err) => {
      console.error('[App] Errore navigazione notifica pendente:', err);
    });
  }

  private async unlockExistingSessionWithBiometrics(reason: string): Promise<void> {
    if (
      this.biometricUnlockAttempted ||
      this.biometricUnlockInProgress ||
      Capacitor.getPlatform() === 'web' ||
      !this.globalService.token ||
      this.authService.isBiometricAutoLoginSuppressed()
    ) {
      return;
    }

    this.biometricUnlockAttempted = true;
    this.biometricUnlockInProgress = true;
    console.log(`[Biometric] Sblocco sessione esistente (${reason})`);

    try {
      const ok = await this.biometricService.verifyIdentity();
      if (!ok) {
        this.globalService.logout();
        return;
      }

      const tenantConfig = await this.globalService.loadTenantConfig(false);
      if (!tenantConfig) {
        this.globalService.logout();
        return;
      }

      this.sessionUnlocked = true;
      this.authService.initializePostLoginServices(this.globalService.token);
      this.inspectionAlarmSync.setToken(this.globalService.token);
      await this.inspectionAlarmSync.syncSoon('biometric-unlock', true);
      const navigatedFromNotification =
        await this.notificationNavigation.navigatePendingIfAny();

      if (!navigatedFromNotification && this.isLoginRoute()) {
        await this.router.navigateByUrl('/homeAdmin', { replaceUrl: true });
      }
    } finally {
      this.biometricUnlockInProgress = false;
    }
  }

  private isLoginRoute(): boolean {
    const url = this.router.url.split('?')[0];
    return url === '/' || url === '/loginPrivateArea';
  }

  private isPublicRoute(): boolean {
    const url = this.router.url.split('?')[0];
    // These links are opened by external customers. A locally remembered
    // employee/admin session must never reveal internal billing information.
    return url.startsWith('/quote-accept/') || url.startsWith('/contract-accept/');
  }

  @HostListener('window:unhandledrejection', ['$event'])
  onUnhandledRejection(event: PromiseRejectionEvent): void {
    console.error('[App] Promise non gestita:', event.reason);
    this.popupService.showError(
      this.popupService.parseServerError(event.reason, 'Operazione non completata. Riprova.'),
      'Errore imprevisto',
    );
  }
}
