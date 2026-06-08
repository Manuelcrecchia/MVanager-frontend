import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { jwtDecode } from "jwt-decode";
import { Preferences } from '@capacitor/preferences';
import { MobilePushService } from './service/mobile-push.service';
import { TenantService } from './service/tenant.service';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class AuthServiceService {
  private readonly TOKEN_KEY = 'token';
  private readonly USER_CODE_KEY = 'userCode';
  private readonly PERMISSIONS_KEY = 'permissions';
  private readonly EMAIL_KEY = 'email';
  private logoutTimer: any;
  private postLoginServicesToken: string | null = null;
  private _token: string | null = localStorage.getItem(this.TOKEN_KEY) || sessionStorage.getItem(this.TOKEN_KEY) || null;
  private _userCode: string | null = localStorage.getItem(this.USER_CODE_KEY) || sessionStorage.getItem(this.USER_CODE_KEY) || null;
  private _permissions: string[] = (() => {
    try { return JSON.parse(localStorage.getItem(this.PERMISSIONS_KEY) || sessionStorage.getItem(this.PERMISSIONS_KEY) || '[]'); } catch { return []; }
  })();
  private _email: string | null = localStorage.getItem(this.EMAIL_KEY) || sessionStorage.getItem(this.EMAIL_KEY) || null;

  constructor(
    private router: Router,
    private mobilePush: MobilePushService,
    private tenantService: TenantService,
  ) {
    if (this._token) {
      const remainingTime = this.getTokenRemainingTime(this._token);
      if (remainingTime > 0) {
        this.setLogoutTimer(remainingTime);
      } else {
        this.clearSessionState();
      }
    }

    this.restorePersistedState();
  }

  // Setter per il token e altri dati che salvano anche nello storage persistente app.
  set token(value: string | null) {
    this._token = value;
    if (value) {
      this.persistValue(this.TOKEN_KEY, value);
      this.syncTenantFromToken(value);
      const remainingTime = this.getTokenRemainingTime(value);
      if (remainingTime > 0) {
        this.setLogoutTimer(remainingTime);
        this.initializePostLoginServices(value);
      } else {
        this.clearSessionState();
      }
    } else {
      this.removeValue(this.TOKEN_KEY);
      this.clearLogoutTimer();
    }
  }
  get token(): string | null {
    return this._token;
  }

  set userCode(value: string | null) {
    this._userCode = value;
    if (value) this.persistValue(this.USER_CODE_KEY, value);
    else this.removeValue(this.USER_CODE_KEY);
  }
  get userCode(): string | null {
    return this._userCode;
  }

  set permissions(value: string[] | null) {
    this._permissions = Array.isArray(value) ? value : [];
    this.persistValue(this.PERMISSIONS_KEY, JSON.stringify(this._permissions));
  }
  get permissions(): string[] {
    return this._permissions;
  }

  set email(value: string | null) {
    this._email = value;
    if (value) this.persistValue(this.EMAIL_KEY, value);
    else this.removeValue(this.EMAIL_KEY);
  }
  get email(): string | null {
    return this._email;
  }

  getTokenRemainingTime(token: string): number {
    try {
      const decodee = jwtDecode(token);
      if (!decodee || !decodee.exp) {
        console.error('[AuthService] Token decodificato senza exp');
        return 0;
      }
      const exp = decodee.exp * 1000;
      const remaining = exp - Date.now();
      return remaining > 0 ? remaining : 0;
    } catch (error) {
      console.error('[AuthService] Errore nella decodifica del token:', error);
      return 0;
    }
  }

  setLogoutTimer(remainingTime: number): void {
    this.clearLogoutTimer();
    console.log('[AuthService] Impostazione logout automatico in:', remainingTime, 'ms');
    this.logoutTimer = setTimeout(() => {
      this.logout();
    }, remainingTime);
  }

  clearLogoutTimer(): void {
    if (this.logoutTimer) {
      clearTimeout(this.logoutTimer);
      this.logoutTimer = null;
    }
  }

  private isPublicQuoteAcceptanceRoute(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    return window.location.pathname.toLowerCase().startsWith('/quote-accept/');
  }

  private clearSessionState(): void {
    [
      this.TOKEN_KEY,
      this.USER_CODE_KEY,
      this.PERMISSIONS_KEY,
      this.EMAIL_KEY,
    ].forEach((key) => this.removeValue(key));
    this._token = null;
    this._email = null;
    this._userCode = null;
    this._permissions = [];
    this.clearLogoutTimer();
    this.mobilePush.reset();
    this.postLoginServicesToken = null;
  }

  initializePostLoginServices(token = this._token): void {
    if (!token || this.postLoginServicesToken === token) {
      return;
    }

    this.postLoginServicesToken = token;
    this.mobilePush.initAfterLogin(token).catch((err) => {
      this.postLoginServicesToken = null;
      console.error('[AuthService] Errore inizializzazione push:', err);
    });
  }

  logout(): void {
    console.log('[AuthService] Logout eseguito o automatico');
    this.clearSessionState();

    if (this.isPublicQuoteAcceptanceRoute()) {
      return;
    }

    this.router.navigateByUrl('/', { replaceUrl: true });
  }

  private persistValue(key: string, value: string): void {
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
    Preferences.set({ key, value }).catch((err) => {
      console.error('[AuthService] Errore salvataggio Preferences:', err);
    });
  }

  private removeValue(key: string): void {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    Preferences.remove({ key }).catch((err) => {
      console.error('[AuthService] Errore rimozione Preferences:', err);
    });
  }

  private async restorePersistedState(): Promise<void> {
    try {
      const [token, userCode, permissions, email] = await Promise.all([
        Preferences.get({ key: this.TOKEN_KEY }),
        Preferences.get({ key: this.USER_CODE_KEY }),
        Preferences.get({ key: this.PERMISSIONS_KEY }),
        Preferences.get({ key: this.EMAIL_KEY }),
      ]);

      if (token.value) this._token = token.value;
      if (userCode.value) this._userCode = userCode.value;
      if (email.value) this._email = email.value;
      if (permissions.value) {
        this._permissions = JSON.parse(permissions.value);
      }

      if (!this._token) return;

      this.syncTenantFromToken(this._token);
      const remainingTime = this.getTokenRemainingTime(this._token);
      if (remainingTime > 0) {
        this.persistValue(this.TOKEN_KEY, this._token);
        this.setLogoutTimer(remainingTime);
        if (Capacitor.getPlatform() === 'web') {
          this.initializePostLoginServices(this._token);
        }
      } else {
        this.clearSessionState();
      }
    } catch (error) {
      console.error('[AuthService] Errore ripristino sessione:', error);
    }
  }

  private syncTenantFromToken(token: string): void {
    try {
      const decoded: any = jwtDecode(token);
      this.tenantService.setTenantFromToken(decoded?.tenantId);
    } catch (error) {
      console.error('[AuthService] Errore lettura tenant dal token:', error);
    }
  }
}
