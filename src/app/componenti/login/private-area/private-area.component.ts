import { AfterViewInit, Component, OnDestroy } from '@angular/core';
import { GlobalService } from '../../../service/global.service';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { PopupServiceService } from '../../popup/popup-service.service';
import { AuthServiceService } from '../../../auth-service.service';
import { BiometricService } from '../../../service/biometric.service';
import {
  CompanyRegistryOption,
  TenantId,
  TenantService,
} from '../../../service/tenant.service';
import { jwtDecode } from 'jwt-decode';
import { NotificationNavigationService } from '../../../service/notification-navigation.service';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-private-area',
  templateUrl: './private-area.component.html',
  styleUrl: './private-area.component.css',
})
export class PrivateAreaComponent {
  version = this.globalService.version;
  isMobile = this.globalService.forMobile;
  selectedTenant: TenantId | null = null;
  companies: CompanyRegistryOption[] = [];
  companiesLoading = false;
  companiesError = '';
  companyDropdownOpen = false;
  loginReady = false;
  checkingLoginState = false;
  biometricAvailable = false;
  private autoBiometricAttempted = false;
  private biometricLoginInProgress = false;
  private viewReady = false;
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

    if (this.isMobile) {
      const loaded = await this.loadCompanies();
      if (!loaded) {
        this.tenantService.clearTenant();
        this.authService.logout();
        this.selectedTenant = null;
        this.loginReady = false;
        this.biometricAvailable = false;
        return;
      }
    } else {
      this.loadCompanies();
    }

    this.selectedTenant = this.tenantService.selectedTenant;

    if (this.tenantService.requiresTenantSelection) {
      return;
    }

    await this.initializeLoginState();

  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.startAutomaticBiometricLogin('view-ready');
  }

  ngOnDestroy(): void {
    this.clearAutoBiometricTimer();
  }

  /**
   * LOGIN STANDARD + BIOMETRICO
   */
  submitLogin(event: Event, email: string, password: string): void {
    event.preventDefault();
    this.loginFunction(email, password);
  }

  async loginFunction(email: string, password: string, automatic = false) {
    const tenant = this.tenantService.tenant;
    if (this.isMobile && this.companiesError) {
      this.popup.text = 'Impossibile caricare le aziende. Riprova più tardi.';
      this.popup.openPopup();
      return;
    }

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

    console.log('[Login] Tenant selezionato:', tenant);

    this.http
      .post<{ response?: string; token?: string; codiceOperatore?: string; permissions?: string[] }>(
        this.globalService.url + 'login/admin',
        { email, password },
        { headers: this.globalService.headers.set('X-Tenant-Id', tenant) }
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
          this.authService.permissions = res['permissions'] || [];
          this.authService.token = res['token'] || null;

          if (!this.authService.token) {
            this.popup.text = 'Risposta login non valida. Riprova.';
            this.popup.openPopup();
            return;
          }

          const tenantConfig = await this.globalService.loadTenantConfig(false);
          if (!tenantConfig) {
            this.clearAutoBiometricTimer();
            this.globalService.logout();
            this.loginReady = false;
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
      }, (err) => {
        const serverMessage =
          err?.error?.error ||
          err?.error?.response ||
          (typeof err?.error === 'string' ? err.error : '');
        this.popup.text = serverMessage || 'Errore durante l’invio del codice. Riprova.';
        this.popup.openPopup();
      });
  }

  /**
   * Mostra/Nasconde password
   */
  togglePasswordVisibility(input: HTMLInputElement) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }

  toggleCompanyDropdown(): void {
    if (this.companiesLoading || this.companiesError || !this.companies.length) {
      this.companyDropdownOpen = false;
      return;
    }

    this.companyDropdownOpen = !this.companyDropdownOpen;
  }

  get selectedCompanyLabel(): string {
    if (this.selectedTenant) {
      const selectedCompany = this.companies.find((company) =>
        this.isCompanySelected(company),
      );
      return selectedCompany?.name || this.tenantService.tenantLabel;
    }

    return this.companiesLoading ? 'Caricamento aziende...' : 'Seleziona azienda';
  }

  async selectTenant(tenant: TenantId): Promise<void> {
    const previousTenant = this.getTokenTenant();

    await this.tenantService.setTenant(tenant);
    this.selectedTenant = tenant;
    this.loginReady = false;
    this.autoBiometricAttempted = false;

    if (previousTenant && previousTenant !== tenant) {
      this.clearAutoBiometricTimer();
      this.authService.logout();
      return;
    }

    await this.initializeLoginState();
  }

  isCompanySelected(company: CompanyRegistryOption): boolean {
    const tenant = this.getCompanyTenant(company);
    return !!tenant && tenant === this.selectedTenant;
  }

  async selectCompany(company: CompanyRegistryOption): Promise<void> {
    const tenant = this.getCompanyTenant(company);
    if (!tenant) {
      this.popup.text = 'Azienda non configurata correttamente.';
      this.popup.openPopup();
      return;
    }

    const previousTenant = this.getTokenTenant();
    const selectedCompany = this.normalizeCompanyForCurrentBuild(company);

    try {
      await this.tenantService.setCompany(selectedCompany);
    } catch {
      this.popup.text = 'Azienda non configurata correttamente.';
      this.popup.openPopup();
      return;
    }

    this.selectedTenant = tenant;
    this.companyDropdownOpen = false;
    this.loginReady = false;
    this.autoBiometricAttempted = false;

    if (previousTenant && previousTenant !== tenant) {
      this.clearAutoBiometricTimer();
      this.authService.logout();
      return;
    }

    await this.initializeLoginState();
  }

  private loadCompanies(): Promise<boolean> {
    this.companiesLoading = true;
    this.companiesError = '';

    return new Promise((resolve) => {
      this.http
        .get<CompanyRegistryOption[]>(environment.companyRegistryEndpoint)
        .subscribe({
          next: (companies) => {
            this.companies = Array.isArray(companies) ? companies : [];
            this.companiesLoading = false;
            if (!this.companies.length) {
              this.companiesError = 'Nessuna azienda disponibile.';
              resolve(false);
              return;
            }
            resolve(true);
          },
          error: (error) => {
            console.error('Errore caricamento aziende:', error);
            this.companiesLoading = false;
            this.companiesError = 'Impossibile caricare le aziende.';
            resolve(false);
          },
        });
    });
  }

  private getCompanyTenant(company: CompanyRegistryOption): TenantId | null {
    const tenant = String(company.tenantId || '').trim().toLowerCase();
    return /^[a-z0-9][a-z0-9_-]{1,79}$/.test(tenant) ? tenant : null;
  }

  private normalizeCompanyForCurrentBuild(
    company: CompanyRegistryOption,
  ): CompanyRegistryOption {
    return {
      ...company,
      serverUrl: environment.apiUrl || environment.mobileDevApiUrl,
    };
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
    if (
      this.isMobile &&
      (this.companiesError || this.tenantService.requiresTenantSelection)
    ) {
      this.loginReady = false;
      this.biometricAvailable = false;
      return;
    }

    if (this.checkingLoginState) {
      return;
    }

    this.checkingLoginState = true;
    this.loginReady = false;

    try {
      const ok = await this.globalService.checkVersion();
      if (!ok) {
        this.clearAutoBiometricTimer();
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
      this.authService.isBiometricAutoLoginSuppressed() ||
      !!this.authService.token ||
      this.biometricLoginInProgress
    ) {
      return;
    }

    this.autoBiometricAttempted = true;
    console.log(`[Biometric] Avvio automatico (${reason})`);
    this.clearAutoBiometricTimer();
    this.autoBiometricTimer = setTimeout(() => {
      this.biometricLogin(true);
    }, Capacitor.getPlatform() === 'android' ? 900 : 350);
  }

  private clearAutoBiometricTimer(): void {
    if (this.autoBiometricTimer) {
      clearTimeout(this.autoBiometricTimer);
      this.autoBiometricTimer = undefined;
    }
  }

  private getTokenTenant(): TenantId | null {
    const token = this.authService.token;
    if (!token) return null;

    try {
      const decoded: any = jwtDecode(token);
      const tenant = String(decoded?.tenantId || '').trim().toLowerCase();
      return /^[a-z0-9][a-z0-9_-]{1,79}$/.test(tenant) ? tenant : null;
    } catch {
      return null;
    }
  }
}
