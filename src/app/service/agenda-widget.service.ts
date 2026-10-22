import { HttpBackend, HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom, timeout } from 'rxjs';
import { TenantService } from './tenant.service';
import { resolveApiBaseUrl } from './global.service';

export interface AgendaWidgetPreferences {
  enabled: boolean;
  group: 'all' | 'work' | 'personal';
  private: boolean;
  hiddenTenantIds: string[];
}
export interface AgendaWidgetSyncStatus {
  state: 'idle' | 'syncing' | 'updated' | 'offline' | 'unconfigured' | 'expired' | 'unauthorized' | 'disabled' | 'error';
  message?: string;
  updatedAt?: string;
  eventCount?: number;
}
export type AgendaNavigator = 'google' | 'apple' | 'waze';
export interface AgendaNavigationPreferences {
  available: Array<{ id: AgendaNavigator; label: string }>;
  preferred: AgendaNavigator | '';
  selected: AgendaNavigator | '';
}
interface AgendaWidgetPlugin {
  configure(options: { endpoint: string; tenantId: string; token: string; expiresAt: number }): Promise<void>;
  refresh(): Promise<AgendaWidgetSyncStatus>;
  clear(): Promise<void>;
  requestPin(): Promise<{ supported: boolean }>;
  navigationPreferences(): Promise<AgendaNavigationPreferences>;
  setNavigator(options: { navigator: AgendaNavigator }): Promise<AgendaNavigationPreferences>;
}
const NativeAgenda = registerPlugin<AgendaWidgetPlugin>('AgendaWidget');
const defaults = (): AgendaWidgetPreferences => ({ enabled: true, group: 'all', private: false, hiddenTenantIds: [] });

@Injectable({ providedIn: 'root' })
export class AgendaWidgetService {
  readonly available = Capacitor.isNativePlatform();
  readonly navigationAvailable = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  private http: HttpClient;
  private authToken = '';
  private permissions: string[] = [];
  private generation = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private lastRefreshAt = 0;
  private device = '';
  private sessionId = '';
  private native = NativeAgenda;
  status: AgendaWidgetSyncStatus = { state: 'idle', message: 'Il widget non è ancora stato sincronizzato.' };
  private refreshTask?: Promise<void>;
  private refreshAgain = false;
  constructor(backend: HttpBackend, private tenant: TenantService) { this.http = new HttpClient(backend); }

  async initialize(token: string, permissions: string[]): Promise<void> {
    if (!this.available) return;
    this.authToken = token; this.permissions = permissions;
    await this.configure(await this.getPreferences());
  }
  private optionsKey(): string {
    let user = '';
    try { user = String(JSON.parse(atob(this.authToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).id || ''); } catch { /* no account */ }
    return `calendar.widget.preferences.${this.tenant.tenant}.${user}`;
  }
  async getPreferences(): Promise<AgendaWidgetPreferences> {
    if (!this.available) return defaults();
    const { value } = await Preferences.get({ key: this.optionsKey() });
    try { const data = JSON.parse(value || '{}'); return { ...defaults(), ...data }; } catch { return defaults(); }
  }
  async savePreferences(options: AgendaWidgetPreferences): Promise<void> {
    if (!this.available) return;
    await Preferences.set({ key: this.optionsKey(), value: JSON.stringify(options) });
    await this.configure(options);
  }
  private get apiUrl(): string {
    return resolveApiBaseUrl({ forMobile: true, tenant: this.tenant.tenant,
      selectedCompanyServerUrl: this.tenant.selectedCompanyServerUrl, host: window.location.hostname });
  }
  private async deviceId(): Promise<string> {
    if (this.device) return this.device;
    const { value } = await Preferences.get({ key: 'calendar.widget.device' });
    this.device = value || crypto.randomUUID();
    if (!value) await Preferences.set({ key: 'calendar.widget.device', value: this.device });
    return this.device;
  }
  private configure(options: AgendaWidgetPreferences): Promise<void> {
    const revision = ++this.generation, token = this.authToken, tenantId = this.tenant.tenant, base = this.apiUrl;
    const allowed = this.permissions.includes('CALENDAR_VIEW') || this.permissions.includes('CALENDAR_EVENT_MANAGE');
    const task = async () => {
      if (revision !== this.generation) return;
      this.status = { state: 'syncing', message: 'Aggiornamento del widget…' };
      // Clear the previous account/options before any network work, including
      // failed requests and switching to the reserved display.
      await this.native.clear();
      const deviceId = await this.deviceId();
      const headers = new HttpHeaders({ Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId });
      if (!options.enabled || !allowed || !token) {
        if (token) await firstValueFrom(this.http.post(base + 'appointments/widget/revoke', { deviceId }, { headers }).pipe(timeout(15000)));
        if (revision === this.generation) this.status = { state: 'disabled', message: options.enabled ? 'Il calendario non è disponibile per questo account.' : 'Widget disabilitato.' };
        return;
      }
      const session = await firstValueFrom(this.http.post<{ token: string; expiresAt: number; sessionId: string }>(base + 'appointments/widget/session',
        { deviceId, preferences: { group: options.group, private: options.private, hiddenTenantIds: options.hiddenTenantIds } }, { headers }).pipe(timeout(15000)));
      if (revision !== this.generation) {
        await firstValueFrom(this.http.post(base + 'appointments/widget/revoke', { deviceId, sessionId: session.sessionId }, { headers }).pipe(timeout(15000)));
        return;
      }
      this.sessionId = session.sessionId;
      await this.native.configure({ endpoint: base + 'appointments/widget/feed', tenantId, ...session });
      const result = await this.native.refresh();
      if (revision === this.generation) this.applyStatus(result);
    };
    const result = this.queue.then(task).catch(error => {
      if (revision === this.generation) {
        this.sessionId = '';
        this.status = { state: 'error', message: error?.status === 404
          ? 'Il server deve essere aggiornato per supportare il widget.'
          : error?.message && !error?.status ? error.message : 'Impossibile collegare il widget al calendario. Controlla la connessione e riprova.' };
      }
      throw error;
    });
    this.queue = result.catch(() => {});
    return result;
  }
  async refresh(force = false): Promise<void> {
    if (!this.available || !this.authToken || (!force && Date.now() - this.lastRefreshAt < 30000)) return;
    if (this.refreshTask) { this.refreshAgain ||= force; return this.refreshTask; }
    this.lastRefreshAt = Date.now();
    const revision = this.generation;
    this.refreshTask = (async () => {
      do {
        this.refreshAgain = false;
        await this.queue;
        if (!this.authToken || revision !== this.generation) return;
        if (!this.sessionId) { await this.configure(await this.getPreferences()); return; }
        this.status = { ...this.status, state: 'syncing', message: 'Aggiornamento del widget…' };
        const result = await this.native.refresh();
        if (!this.authToken || revision !== this.generation) return;
        if (result && ['unconfigured', 'expired', 'unauthorized'].includes(result.state)) {
          await this.configure(await this.getPreferences()); return;
        }
        this.applyStatus(result);
      } while (this.refreshAgain);
    })().catch(error => {
      if (this.authToken) this.status = { state: 'error', message: 'Impossibile aggiornare il widget. Riprova da Impostazioni calendario.' };
      console.warn('[AgendaWidget] Aggiornamento non disponibile', error);
    }).finally(() => { this.refreshTask = undefined; });
    return this.refreshTask;
  }
  private applyStatus(result: AgendaWidgetSyncStatus | undefined): void {
    // Resolving a native call alone is not evidence of a successful download.
    if (!result?.state) { this.status = { state: 'error', message: 'Reinstalla la build aggiornata dell’app per verificare la sincronizzazione del widget.' }; return; }
    this.status = { ...result, message: result.message || (result.state === 'updated' ? 'Agenda scaricata e aggiornamento del widget richiesto.'
      : result.state === 'offline' ? 'Senza connessione: il widget mostra l’ultima agenda scaricata.' : 'Widget non aggiornato. Controlla la connessione e riprova.') };
  }
  clear(): void {
    if (!this.available) return;
    const token = this.authToken, base = this.apiUrl, tenantId = this.tenant.tenant, sessionId = this.sessionId;
    ++this.generation; this.authToken = ''; this.permissions = []; this.sessionId = '';
    this.status = { state: 'unconfigured', message: 'Accedi per aggiornare il widget.' };
    // Native clear is immediate; an in-flight response also checks its session
    // before committing, so it cannot repopulate a logged-out widget.
    void this.native.clear().catch(error => console.warn('[AgendaWidget] Pulizia non riuscita', error));
    this.queue = this.queue.catch(() => {}).then(() => this.native.clear()).catch(() => {});
    if (token && sessionId) void this.deviceId().then(deviceId => firstValueFrom(this.http.post(base + 'appointments/widget/revoke', { deviceId, sessionId },
      { headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Id': tenantId } }).pipe(timeout(15000)))).catch(() => {});
  }
  async addToHome(): Promise<boolean> { return this.available && (await this.native.requestPin()).supported; }
  async getNavigationPreferences(): Promise<AgendaNavigationPreferences> {
    return this.navigationAvailable ? this.native.navigationPreferences() : { available: [], preferred: '', selected: '' };
  }
  async setNavigator(navigator: AgendaNavigator): Promise<AgendaNavigationPreferences> {
    return this.native.setNavigator({ navigator });
  }
}
