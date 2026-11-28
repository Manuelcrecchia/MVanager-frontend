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
import { AgendaWidgetService } from './agenda-widget.service';
import { finalize } from 'rxjs/operators';

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

interface PushRegistrationContext {
  generation: number;
  tenantId: string;
  key: string;
  apiUrl: string;
  headers: HttpHeaders;
}

// Native boundaries remain replaceable in tests without altering application flows.
export const mobilePushNative = {
  removeListeners: () => PushNotifications.removeAllListeners(),
  on: PushNotifications.addListener.bind(PushNotifications),
  requestPermissions: () => PushNotifications.requestPermissions(),
  register: () => PushNotifications.register(),
  requestFirebasePermissions: () => FirebaseMessaging.requestPermissions(),
  getFirebaseToken: () => FirebaseMessaging.getToken(),
  onFirebaseToken: (listener: (event: { token: string }) => void) => FirebaseMessaging.addListener('tokenReceived', listener),
};

@Injectable({
  providedIn: 'root',
})
export class MobilePushService {
  private initialized = false;
  private token: string | null = null;
  private generation = 0;
  private registrationContext: PushRegistrationContext | null = null;
  private firebaseListenerInitialized = false;
  private readonly registrationsInFlight = new Set<string>();
  private registeredDeviceKey = '';
  private latestNativeToken = '';

  constructor(
    private http: HttpClient,
    private tenantService: TenantService,
    private notificationNavigation: NotificationNavigationService,
    private inspectionAlarmSync: InspectionAlarmSyncService,
    private agendaWidget: AgendaWidgetService,
  ) {}

  async initAfterLogin(token: string, permissions: string[] = []): Promise<void> {
    this.token = token;

    const platform = Capacitor.getPlatform();
    if (platform === 'web') {
      return;
    }

    const context: PushRegistrationContext = {
      generation: this.initialized && this.registrationContext?.key === `${this.tenantService.tenant}|${token}`
        ? this.generation : ++this.generation,
      tenantId: this.tenantService.tenant,
      key: `${this.tenantService.tenant}|${token}`,
      apiUrl: this.apiUrl,
      headers: this.headers,
    };

    this.agendaWidget.initialize(token, permissions).catch(error => console.warn('[AgendaWidget] Attivazione non riuscita', error));

    const capabilities = await this.resolveCapabilities(permissions, context);
    if (context.generation !== this.generation) return;
    if (capabilities.canSyncInspectionAlarms) {
      this.inspectionAlarmSync.setToken(token);
      await this.inspectionAlarmSync.syncSoon('after-login', true);
    } else {
      await this.inspectionAlarmSync.clearAll();
    }

    if (!capabilities.canUseNotifications) {
      this.registrationContext = null;
      return;
    }
    if (this.initialized && this.registrationContext?.key === context.key) {
      this.registrationContext = { ...context };
      if (this.latestNativeToken) this.registerDeviceToken(this.latestNativeToken, context);
      return;
    }

    this.initialized = true;
    this.registrationContext = context;
    await mobilePushNative.removeListeners();
    if (context.generation !== this.generation) return;

    mobilePushNative.on('registration', (token: Token) => {
      this.registerDeviceToken(token.value, context);
    });

    mobilePushNative.on('registrationError', (error: unknown) => {
      console.error('[Push] Registrazione fallita', error);
    });

    mobilePushNative.on(
      'pushNotificationReceived',
      (notification: PushNotificationSchema) => {
        if (String(notification.data?.tenantId || '') !== this.tenantService.tenant) return;
        void this.agendaWidget.refresh(true);
        this.inspectionAlarmSync.syncSoon('push-received').catch((err) => {
          console.error('[Push] Errore sync promemoria appuntamento:', err);
        });
      },
    );

    mobilePushNative.on(
      'pushNotificationActionPerformed',
      async (action: ActionPerformed) => {
        if (String(action.notification.data?.tenantId || '') === this.tenantService.tenant) {
          await this.inspectionAlarmSync.syncSoon('push-opened', true);
        }
        await this.notificationNavigation.navigateFromPayload(action);
      },
    );

    if (platform === 'ios') {
      const permission = await mobilePushNative.requestPermissions();
      if (context.generation !== this.generation) return;
      if (permission.receive !== 'granted') {
        this.initialized = false;
        this.registrationContext = null;
        return;
      }

      await mobilePushNative.register();
      return;
    }

    if (platform === 'android') {
      if (!this.firebaseListenerInitialized) {
        await mobilePushNative.onFirebaseToken(event => {
          if (this.registrationContext) this.registerDeviceToken(event.token, this.registrationContext);
        });
        this.firebaseListenerInitialized = true;
      }
      const permission = await mobilePushNative.requestFirebasePermissions();
      if (context.generation !== this.generation) return;
      if (permission.receive !== 'granted') {
        this.initialized = false;
        this.registrationContext = null;
        return;
      }

      const result = await mobilePushNative.getFirebaseToken();
      this.registerDeviceToken(result.token, context);
    }

    await this.notificationNavigation.navigatePendingIfAny();
  }

  reset(): void {
    this.generation++;
    this.registrationContext = null;
    this.registeredDeviceKey = '';
    this.agendaWidget.clear();
    this.initialized = false;
    this.token = null;
    this.inspectionAlarmSync.clearAll().catch((err) => {
      console.error('[Push] Errore reset promemoria appuntamento:', err);
    });
  }

  private registerDeviceToken(pushToken: string, context: PushRegistrationContext): void {
    const platform = Capacitor.getPlatform();

    if (context.generation !== this.generation || !this.registrationContext || !pushToken || (platform !== 'android' && platform !== 'ios')) {
      return;
    }
    this.latestNativeToken = pushToken;
    const key = `${context.key}|${pushToken}`;
    if (this.registeredDeviceKey === key || this.registrationsInFlight.has(key)) return;
    this.registrationsInFlight.add(key);

    this.http
      .post(
        context.apiUrl + 'admin/notifications/devices/register',
        { platform, push_token: pushToken },
        { headers: context.headers },
      )
      .pipe(finalize(() => this.registrationsInFlight.delete(key)))
      .subscribe({
        next: () => {
          if (context.generation === this.generation) this.registeredDeviceKey = key;
        },
        error: (err) => console.error('[Push] Errore registrazione token', err),
      });
  }

  private async resolveCapabilities(
    userPermissions: string[],
    context: PushRegistrationContext,
  ): Promise<MobileCapabilities> {
    try {
      const config = await this.fetchTenantConfig(context);
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

  private fetchTenantConfig(context: PushRegistrationContext): Promise<TenantMobileConfig> {
    return new Promise((resolve, reject) => {
      this.http
        .get<TenantMobileConfig>(context.apiUrl + 'tenant/config?refresh=true', {
          headers: context.headers,
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
