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

  async initAfterLogin(token: string): Promise<void> {
    this.token = token;
    this.inspectionAlarmSync.setToken(token);
    await this.inspectionAlarmSync.syncSoon('after-login', true);

    if (this.initialized || Capacitor.getPlatform() === 'web') {
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
          console.error('[Push] Errore sync sveglie sopralluogo:', err);
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

    const platform = Capacitor.getPlatform();

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
      console.error('[Push] Errore reset sveglie sopralluogo:', err);
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
