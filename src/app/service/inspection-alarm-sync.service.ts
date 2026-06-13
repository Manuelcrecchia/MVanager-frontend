import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';
import { TenantService } from './tenant.service';
import { resolveApiBaseUrl } from './global.service';

interface InspectionAlarmPayload {
  id: string;
  title: string;
  body?: string;
  fireDate: string;
  appointmentId?: number | string;
  occurrenceStart?: string;
  route?: string;
  snoozeMinutes?: number;
}

interface InspectionAlarmKitPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  getAuthorizationState(): Promise<{ state: string }>;
  requestAuthorization(): Promise<{ state: string }>;
  replaceInspectionAlarms(options: {
    alarms: InspectionAlarmPayload[];
  }): Promise<{
    available: boolean;
    authorizationState: string;
    scheduled: number;
    skipped: number;
  }>;
  cancelAllInspectionAlarms(): Promise<{ cancelled: number }>;
}

const InspectionAlarmKit =
  registerPlugin<InspectionAlarmKitPlugin>('InspectionAlarmKit');

@Injectable({
  providedIn: 'root',
})
export class InspectionAlarmSyncService {
  private token: string | null = null;
  private syncInProgress = false;
  private lastSyncAt = 0;

  constructor(
    private http: HttpClient,
    private tenantService: TenantService,
  ) {}

  setToken(token: string | null): void {
    this.token = token;
  }

  async syncSoon(reason: string, force = false): Promise<void> {
    if (Capacitor.getPlatform() !== 'ios' || !this.token) {
      return;
    }

    const now = Date.now();
    if (!force && now - this.lastSyncAt < 30_000) {
      return;
    }

    if (this.syncInProgress) {
      return;
    }

    this.syncInProgress = true;
    try {
      await this.sync(reason);
      this.lastSyncAt = Date.now();
    } catch (error) {
      console.error('[InspectionAlarmSync] Errore sync sveglie:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  async clearAll(): Promise<void> {
    this.token = null;
    if (Capacitor.getPlatform() !== 'ios') return;

    try {
      await InspectionAlarmKit.cancelAllInspectionAlarms();
    } catch (error) {
      console.error('[InspectionAlarmSync] Errore cancellazione sveglie:', error);
    }
  }

  private async sync(reason: string): Promise<void> {
    const authorized = await this.ensureAlarmPermission(reason);
    if (!authorized) {
      return;
    }

    const alarms = await this.fetchAssignedInspectionAlarms();
    const result = await InspectionAlarmKit.replaceInspectionAlarms({ alarms });
    console.log('[InspectionAlarmSync] Sync completata', {
      reason,
      result,
      alarms: alarms.length,
    });
  }

  private async ensureAlarmPermission(reason: string): Promise<boolean> {
    const availability = await InspectionAlarmKit.isAvailable();
    if (!availability.available) {
      console.log('[InspectionAlarmSync] AlarmKit non disponibile', { reason });
      return false;
    }

    let authorization = await InspectionAlarmKit.getAuthorizationState();
    console.log('[InspectionAlarmSync] Stato permesso sveglie', {
      reason,
      state: authorization.state,
    });

    if (authorization.state === 'notDetermined') {
      authorization = await InspectionAlarmKit.requestAuthorization();
      console.log('[InspectionAlarmSync] Risposta permesso sveglie', {
        reason,
        state: authorization.state,
      });
    }

    if (authorization.state !== 'authorized') {
      console.warn('[InspectionAlarmSync] Permesso sveglie non concesso', {
        reason,
        state: authorization.state,
      });
      return false;
    }

    return true;
  }

  private fetchAssignedInspectionAlarms(): Promise<InspectionAlarmPayload[]> {
    return new Promise((resolve, reject) => {
      this.http
        .get<InspectionAlarmPayload[]>(
          this.apiUrl + 'appointments/myInspectionAlarms',
          { headers: this.headers },
        )
        .subscribe({
          next: (alarms) => resolve(Array.isArray(alarms) ? alarms : []),
          error: reject,
        });
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
