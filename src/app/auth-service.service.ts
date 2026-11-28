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
  private readonly BIOMETRIC_SUPPRESS_KEY = 'mvanager_biometric_suppressed_after_logout';
  private readonly TOKEN_KEY = 'token';
  private readonly USER_CODE_KEY = 'userCode';
  private readonly PERMISSIONS_KEY = 'permissions';
  private readonly EMAIL_KEY = 'email';
  private readonly LAST_ACTIVITY_KEY = 'mvanager_last_activity_at';
  private readonly IDLE_TIMEOUT_MS = 30 * 60 * 1000;
  private readonly ACTIVITY_THROTTLE_MS = 1000;
  private logoutTimer: any;
  private idleTimer: any;
  private lastActivityAt = 0;
  private activityListenersInstalled = false;
  private postLoginServicesToken: string | null = null;
  private _token: string | null = localStorage.getItem(this.TOKEN_KEY) || sessionStorage.getItem(this.TOKEN_KEY) || null;
  private _consultationOnly = !!this._token && this.isConsultationToken(this._token);
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
        this.startIdleTracking(false);
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
      this.clearBiometricAutoLoginSuppression();
      this.persistValue(this.TOKEN_KEY, value);
      this.syncTenantFromToken(value);
      this.syncPermissionsFromToken(value);
      const remainingTime = this.getTokenRemainingTime(value);
      if (remainingTime > 0) {
        this.setLogoutTimer(remainingTime);
        this.startIdleTracking(true);
        this.initializePostLoginServices(value, this._permissions);
      } else {
        this.clearSessionState();
      }
    } else {
      this._consultationOnly = false;
      this.removeValue(this.TOKEN_KEY);
      this.clearLogoutTimer();
      this.stopIdleTracking();
    }
  }
  get token(): string | null {
    return this._token;
  }

  get consultationOnly(): boolean {
    return this._consultationOnly;
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

  private startIdleTracking(resetActivity: boolean): void {
    if (!this._token || typeof window === 'undefined' || typeof document === 'undefined') return;
    this.installActivityListeners();

    const storedActivity = Number(localStorage.getItem(this.LAST_ACTIVITY_KEY));
    const now = Date.now();
    this.lastActivityAt = resetActivity || !Number.isFinite(storedActivity) || storedActivity <= 0
      ? now
      : storedActivity;

    if (resetActivity || !localStorage.getItem(this.LAST_ACTIVITY_KEY)) {
      localStorage.setItem(this.LAST_ACTIVITY_KEY, String(this.lastActivityAt));
    }
    this.scheduleIdleCheck();
  }

  private installActivityListeners(): void {
    if (this.activityListenersInstalled) return;
    this.activityListenersInstalled = true;
    const passive = { passive: true };
    ['pointermove', 'pointerdown', 'touchstart', 'scroll'].forEach((eventName) => {
      document.addEventListener(eventName, this.recordActivity, passive);
    });
    document.addEventListener('keydown', this.recordActivity);
    document.addEventListener('visibilitychange', this.checkIdleWhenVisible);
    window.addEventListener('storage', this.syncActivityAcrossTabs);
  }

  private readonly recordActivity = (): void => {
    if (!this._token) return;
    const now = Date.now();
    if (now - this.lastActivityAt >= this.IDLE_TIMEOUT_MS) {
      this.logout();
      return;
    }
    if (now - this.lastActivityAt < this.ACTIVITY_THROTTLE_MS) return;
    this.lastActivityAt = now;
    localStorage.setItem(this.LAST_ACTIVITY_KEY, String(now));
    this.scheduleIdleCheck();
  };

  private readonly checkIdleWhenVisible = (): void => {
    if (!document.hidden && this._token) this.checkIdleTimeout();
  };

  private readonly syncActivityAcrossTabs = (event: StorageEvent): void => {
    if (event.key === this.LAST_ACTIVITY_KEY && event.newValue && this._token) {
      const activityAt = Number(event.newValue);
      if (Number.isFinite(activityAt) && activityAt > this.lastActivityAt) {
        this.lastActivityAt = activityAt;
        this.scheduleIdleCheck();
      }
    }
  };

  private scheduleIdleCheck(): void {
    this.clearIdleTimer();
    if (!this._token) return;
    const remaining = Math.max(0, this.IDLE_TIMEOUT_MS - (Date.now() - this.lastActivityAt));
    this.idleTimer = setTimeout(() => this.checkIdleTimeout(), remaining);
  }

  private checkIdleTimeout(): void {
    if (!this._token) return;
    if (Date.now() - this.lastActivityAt >= this.IDLE_TIMEOUT_MS) {
      this.logout();
      return;
    }
    this.scheduleIdleCheck();
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private stopIdleTracking(): void {
    this.clearIdleTimer();
    this.lastActivityAt = 0;
    localStorage.removeItem(this.LAST_ACTIVITY_KEY);
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
    this._consultationOnly = false;
    this._email = null;
    this._userCode = null;
    this._permissions = [];
    this.clearLogoutTimer();
    this.stopIdleTracking();
    this.mobilePush.reset();
    this.postLoginServicesToken = null;
  }

  initializePostLoginServices(token = this._token, permissions = this._permissions): void {
    if (!token || this.postLoginServicesToken === token || this.isConsultationToken(token)) {
      return;
    }

    this.postLoginServicesToken = token;
    this.mobilePush.initAfterLogin(token, permissions).catch((err) => {
      this.postLoginServicesToken = null;
      console.error('[AuthService] Errore inizializzazione push:', err);
    });
  }

  private isConsultationToken(token: string): boolean {
    try {
      return jwtDecode<{ consultationOnly?: boolean }>(token).consultationOnly === true;
    } catch {
      return false;
    }
  }

  logout(): void {
    console.log('[AuthService] Logout eseguito o automatico');
    this.suppressBiometricAutoLoginUntilRestart();
    this.clearSessionState();

    if (this.isPublicQuoteAcceptanceRoute()) {
      return;
    }

    this.router.navigateByUrl('/', { replaceUrl: true });
  }

  isBiometricAutoLoginSuppressed(): boolean {
    return sessionStorage.getItem(this.BIOMETRIC_SUPPRESS_KEY) === '1';
  }

  private suppressBiometricAutoLoginUntilRestart(): void {
    if (Capacitor.getPlatform() !== 'web') {
      sessionStorage.setItem(this.BIOMETRIC_SUPPRESS_KEY, '1');
    }
  }

  private clearBiometricAutoLoginSuppression(): void {
    sessionStorage.removeItem(this.BIOMETRIC_SUPPRESS_KEY);
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
      this.syncPermissionsFromToken(this._token);
      const remainingTime = this.getTokenRemainingTime(this._token);
      if (remainingTime > 0) {
        this.persistValue(this.TOKEN_KEY, this._token);
        this.setLogoutTimer(remainingTime);
        this.startIdleTracking(false);
        if (Capacitor.getPlatform() === 'web') {
          this.initializePostLoginServices(this._token, this._permissions);
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

  private syncPermissionsFromToken(token: string): void {
    this._consultationOnly = false;
    try {
      const decoded: any = jwtDecode(token);
      this._consultationOnly = decoded.consultationOnly === true;
      if (Array.isArray(decoded?.permissions)) {
        this.permissions = decoded.permissions;
      }
    } catch (error) {
      console.error('[AuthService] Errore lettura permessi dal token:', error);
    }
  }
}
