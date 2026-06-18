import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import {
  ActionPerformed,
  PushNotifications,
  PushNotificationSchema,
  Token,
} from '@capacitor/push-notifications';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { TenantService } from './tenant.service';
import { resolveApiBaseUrl } from './global.service';
import { NotificationNavigationService } from './notification-navigation.service';
import { InspectionAlarmSyncService } from './inspection-alarm-sync.service';

interface TenantMobileConfig {
  features?: string[];
  permissions?: {
    available?: string[];
    permissions?: string[];
    disabled?: string[];
    disabledPermissions?: string[];
  };
}

interface MobileCapabilities {
  canUseNotifications: boolean;
  canSyncInspectionAlarms: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class MobilePushService {
  private initialized = false;
  private token: string | null = null;

  constructor(
    private http: HttpClient,
    private tenantService: TenantService,
    private notificationNavigation: NotificationNavigationService,
    private inspectionAlarmSync: InspectionAlarmSyncService,
  ) {}

  async initAfterLogin(token: string, permissions: string[] = []): Promise<void> {
    this.token = token;

    const platform = Capacitor.getPlatform();
    if (platform === 'web') {
      return;
    }

    const capabilities = await this.resolveCapabilities(permissions);
    if (capabilities.canSyncInspectionAlarms) {
      this.inspectionAlarmSync.setToken(token);
      await this.inspectionAlarmSync.syncSoon('after-login', true);
    } else {
      await this.inspectionAlarmSync.clearAll();
    }

    if (!capabilities.canUseNotifications || this.initialized) {
      return;
    }

    this.initialized = true;
    await PushNotifications.removeAllListeners();

    PushNotifications.addListener('registration', (token: Token) => {
      console.log('[Push] Token iOS/APNs ricevuto', token.value);
      this.registerDeviceToken(token.value);
    });

    PushNotifications.addListener('registrationError', (error: unknown) => {
      console.error('[Push] Registrazione fallita', error);
    });

    PushNotifications.addListener(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        console.log('[Push] Notifica ricevuta', notification);
        this.inspectionAlarmSync.syncSoon('push-received').catch((err) => {
          console.error('[Push] Errore sync promemoria appuntamento:', err);
        });
      },
    );

    PushNotifications.addListener(
      'pushNotificationActionPerformed',
      async (action: ActionPerformed) => {
        console.log('[Push] Notifica aperta', action);
        await this.inspectionAlarmSync.syncSoon('push-opened', true);
        await this.notificationNavigation.navigateFromPayload(action);
      },
    );

    if (platform === 'ios') {
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== 'granted') {
        this.initialized = false;
        return;
      }

      await PushNotifications.register();
      return;
    }

    if (platform === 'android') {
      const permission = await FirebaseMessaging.requestPermissions();
      if (permission.receive !== 'granted') {
        this.initialized = false;
        return;
      }

      const result = await FirebaseMessaging.getToken();
      this.registerDeviceToken(result.token);
    }

    await this.notificationNavigation.navigatePendingIfAny();
  }

  reset(): void {
    this.initialized = false;
    this.token = null;
    this.inspectionAlarmSync.clearAll().catch((err) => {
      console.error('[Push] Errore reset promemoria appuntamento:', err);
    });
  }

  private registerDeviceToken(pushToken: string): void {
    const platform = Capacitor.getPlatform();

    if (!pushToken || (platform !== 'android' && platform !== 'ios')) {
      return;
    }

    this.http
      .post(
        this.apiUrl + 'admin/notifications/devices/register',
        { platform, push_token: pushToken },
        { headers: this.headers },
      )
      .subscribe({
        next: (response) =>
          console.log('[Push] Token registrato sul backend', response),
        error: (err) => console.error('[Push] Errore registrazione token', err),
      });
  }

  private async resolveCapabilities(
    userPermissions: string[],
  ): Promise<MobileCapabilities> {
    try {
      const config = await this.fetchTenantConfig();
      const userPermissionSet = new Set(Array.isArray(userPermissions) ? userPermissions : []);
      const canUseNotifications =
        this.hasFeature(config, 'notifications') &&
        this.hasPermission(config, userPermissionSet, 'NOTIFICATIONS_VIEW');
      const canSyncInspectionAlarms =
        this.hasFeature(config, 'calendar') &&
        this.hasPermission(config, userPermissionSet, 'CALENDAR_VIEW');

      return { canUseNotifications, canSyncInspectionAlarms };
    } catch (err) {
      console.warn('[Push] Config tenant non disponibile, servizi mobile non inizializzati', err);
      return { canUseNotifications: false, canSyncInspectionAlarms: false };
    }
  }

  private fetchTenantConfig(): Promise<TenantMobileConfig> {
    return new Promise((resolve, reject) => {
      this.http
        .get<TenantMobileConfig>(this.apiUrl + 'tenant/config?refresh=true', {
          headers: this.headers,
        })
        .subscribe({ next: resolve, error: reject });
    });
  }

  private hasFeature(config: TenantMobileConfig, feature: string): boolean {
    const features = config?.features;
    if (Array.isArray(features)) {
      return features.includes(feature);
    }
    return true;
  }

  private hasPermission(
    config: TenantMobileConfig,
    userPermissionSet: Set<string>,
    permission: string,
  ): boolean {
    const tenantPermissions = config?.permissions || {};
    const available = tenantPermissions.available || tenantPermissions.permissions || [];
    const disabled = tenantPermissions.disabled || tenantPermissions.disabledPermissions || [];

    if (available.length && !available.includes(permission)) {
      return false;
    }

    if (disabled.includes(permission)) {
      return false;
    }

    return userPermissionSet.has(permission);
  }

  private get apiUrl(): string {
    const host =
      typeof window === 'undefined' ? '' : window.location.hostname.toLowerCase();

    return resolveApiBaseUrl({
      forMobile: Capacitor.getPlatform() !== 'web',
      tenant: this.tenantService.tenant,
      host,
      selectedCompanyServerUrl: this.tenantService.selectedCompanyServerUrl,
    });
  }

  private get headers(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      'X-Tenant-Id': this.tenantService.tenant,
    });

    if (this.token) {
      headers = headers.set('Authorization', `Bearer ${this.token}`);
    }

    return headers;
  }
}
