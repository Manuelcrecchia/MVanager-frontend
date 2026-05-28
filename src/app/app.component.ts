import { Component } from '@angular/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { GlobalService } from './service/global.service';
import { NotificationNavigationService } from './service/notification-navigation.service';
import { BiometricService } from './service/biometric.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  title = 'samyangularapp';
  private biometricUnlockAttempted = false;
  private biometricUnlockInProgress = false;
  private sessionUnlocked = false;

  constructor(
    private globalService: GlobalService,
    private notificationNavigation: NotificationNavigationService,
    private biometricService: BiometricService,
    private router: Router,
  ) {}
  ngOnInit() {
    const platform = Capacitor.getPlatform();
    document.body.classList.toggle('cap-ios', platform === 'ios');
    document.body.classList.toggle('cap-android', platform === 'android');

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
        if (this.sessionUnlocked) {
          this.navigatePendingNotificationIfLoggedIn();
        } else {
          this.unlockExistingSessionWithBiometrics('app-active');
        }
      }
    });
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
      !this.globalService.token
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

      this.sessionUnlocked = true;
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
}
