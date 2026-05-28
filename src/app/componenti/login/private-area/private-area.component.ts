import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { GlobalService } from '../../../service/global.service';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { PopupServiceService } from '../../popup/popup-service.service';
import { AuthServiceService } from '../../../auth-service.service';
import { BiometricService } from '../../../service/biometric.service';
import { TenantId, TenantService } from '../../../service/tenant.service';
import { jwtDecode } from 'jwt-decode';
import { NotificationNavigationService } from '../../../service/notification-navigation.service';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';

@Component({
  selector: 'app-private-area',
  templateUrl: './private-area.component.html',
  styleUrl: './private-area.component.css',
})
export class PrivateAreaComponent {
  version = this.globalService.version;
  isMobile = this.globalService.forMobile;
  selectedTenant: TenantId | null = null;
  loginReady = false;
  checkingLoginState = false;
  biometricAvailable = false;
  private autoBiometricAttempted = false;
  private biometricLoginInProgress = false;
  private viewReady = false;
  private appStateListener?: PluginListenerHandle;
  private autoBiometricTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private globalService: GlobalService,
    private http: HttpClient,
    private router: Router,
    private popup: PopupServiceService,
    private authService: AuthServiceService,
    private bio: BiometricService,
    private notificationNavigation: NotificationNavigationService,
    public tenantService: TenantService,
  ) {}

  async ngOnInit() {
    await this.tenantService.ready;
    this.selectedTenant = this.tenantService.selectedTenant;

    if (this.tenantService.requiresTenantSelection) {
      return;
    }

    await this.initializeLoginState();

    if (Capacitor.getPlatform() !== 'web') {
      this.appStateListener = await CapacitorApp.addListener(
        'appStateChange',
        ({ isActive }) => {
          if (isActive) {
            this.startAutomaticBiometricLogin('app-active');
          }
        },
      );
    }
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.startAutomaticBiometricLogin('view-ready');
  }

  ngOnDestroy(): void {
    this.appStateListener?.remove();
    if (this.autoBiometricTimer) {
      clearTimeout(this.autoBiometricTimer);
    }
  }

  /**
   * LOGIN STANDARD + BIOMETRICO
   */
  async loginFunction(email: string, password: string, automatic = false) {
    if (this.tenantService.requiresTenantSelection) {
      this.popup.text = 'Seleziona prima l\'azienda.';
      this.popup.openPopup();
      return;
    }

    if (!email || !password) {
      this.popup.text = 'Inserisci email e password';
      this.popup.openPopup();
      return;
    }

    this.http
      .post<{ response?: string; token?: string; codiceOperatore?: string; permissions?: string[] }>(
        this.globalService.url + 'login/admin',
        { email, password },
        { headers: this.globalService.headers }
      )
      .subscribe({
        next: async (response) => {
          const res = response || {};
          const resp = res['response'];

          if (resp === 'NON TROVATO') {
            this.popup.text = 'UTENTE NON TROVATO.';
            this.popup.openPopup();
            return;
          }

          if (resp === 'NO') {
            this.popup.text = 'PASSWORD ERRATA.';
            this.popup.openPopup();
            return;
          }

          // --- LOGIN OK ---
          this.authService.email = email;
          this.authService.userCode = res['codiceOperatore'] || null;
          this.authService.token = res['token'] || null;
          this.authService.permissions = res['permissions'] || [];

          if (!this.authService.token) {
            this.popup.text = 'Risposta login non valida. Riprova.';
            this.popup.openPopup();
            return;
          }

          console.log(automatic ? '🤖 Login automatico' : '📩 Login manuale');

          // 🔒 SALVA NEL KEYCHAIN SOLO SE È LOGIN MANUALE
          if (!automatic) {
            console.log('🔒 Salvo credenziali biometriche...');
            await this.bio.storeCredentials(
              email,
              password,
              this.tenantService.tenant,
            );
            this.biometricAvailable = true;
          }

          await this.notificationNavigation.consumePendingOrNavigate('/homeAdmin');
        },
        error: (err) => {
          console.error('❌ Errore login:', err);
          const serverMessage =
            err?.error?.response ||
            err?.error?.error ||
            (typeof err?.error === 'string' ? err.error : '');

          if (err?.status === 401 && serverMessage) {
            this.popup.text = serverMessage;
          } else if (serverMessage) {
            this.popup.text = serverMessage;
          } else {
            this.popup.text = 'Errore durante il login. Riprova.';
          }
          this.popup.openPopup();
        }
      });
  }

  /**
   * PASSWORD DIMENTICATA
   */
  navigateToPassworddimenticata(email: string) {
    if (!email) {
      this.popup.text = 'Inserisci la tua email';
      this.popup.openPopup();
      return;
    }

    const body = { email };
    this.authService.email = email;

    this.http
      .post(this.globalService.url + 'admin/sendCode', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe(() => {
        this.router.navigateByUrl('passworddimenticata');
      });
  }

  /**
   * Mostra/Nasconde password
   */
  togglePasswordVisibility(input: HTMLInputElement) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  async selectTenant(tenant: TenantId): Promise<void> {
    const previousTenant = this.getTokenTenant();

    await this.tenantService.setTenant(tenant);
    this.selectedTenant = tenant;
    this.loginReady = false;
    this.autoBiometricAttempted = false;

    if (previousTenant && previousTenant !== tenant) {
      this.authService.logout();
      return;
    }

    await this.initializeLoginState();
  }

  async biometricLogin(silent = false): Promise<void> {
    if (!this.loginReady || this.biometricLoginInProgress) {
      return;
    }

    this.biometricLoginInProgress = true;
    try {
      const credentials = await this.bio.getCredentials(this.tenantService.tenant);
      if (!credentials) {
        if (!silent) {
          this.popup.text = 'Nessuna credenziale biometrica salvata per questo tenant.';
          this.popup.openPopup();
        }
        return;
      }

      console.log('🔐 Login biometrico con:', credentials.email);
      this.loginFunction(credentials.email, credentials.password, true);
    } finally {
      this.biometricLoginInProgress = false;
    }
  }

  private async initializeLoginState(): Promise<void> {
    if (this.checkingLoginState) {
      return;
    }

    this.checkingLoginState = true;
    this.loginReady = false;

    try {
      const ok = await this.globalService.checkVersion();
      if (!ok) {
        this.globalService.logout();
        return;
      }

      this.loginReady = true;
      if (this.bio.isAndroidPlatform()) {
        const [hasCredentials, isAvailable] = await Promise.all([
          this.bio.hasStoredCredentials(this.tenantService.tenant),
          this.bio.isAvailable(),
        ]);
        this.biometricAvailable = hasCredentials;
        console.log('[Biometric] Stato Android', {
          hasCredentials,
          isAvailable,
          tenant: this.tenantService.tenant,
          autoEnabled: this.biometricAvailable,
        });
      } else {
        this.biometricAvailable = await this.bio.isAvailable();
      }

      this.startAutomaticBiometricLogin('login-state-ready');
    } finally {
      this.checkingLoginState = false;
    }
  }

  private startAutomaticBiometricLogin(reason: string): void {
    if (
      this.autoBiometricAttempted ||
      !this.isMobile ||
      !this.viewReady ||
      !this.loginReady ||
      !this.biometricAvailable ||
      !!this.authService.token ||
      this.biometricLoginInProgress
    ) {
      return;
    }

    this.autoBiometricAttempted = true;
    console.log(`[Biometric] Avvio automatico (${reason})`);
    this.autoBiometricTimer = setTimeout(() => {
      this.biometricLogin(true);
    }, Capacitor.getPlatform() === 'android' ? 900 : 350);
  }

  private getTokenTenant(): TenantId | null {
    const token = this.authService.token;
    if (!token) return null;

    try {
      const decoded: any = jwtDecode(token);
      const tenant = decoded?.tenantId;
      return tenant === 'sami' || tenant === 'emmeci' ? tenant : null;
    } catch {
      return null;
    }
  }
}
