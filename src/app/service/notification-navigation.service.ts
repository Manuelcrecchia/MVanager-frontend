import { Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';
import { jwtDecode } from 'jwt-decode';
import { AuthServiceService } from '../auth-service.service';

interface NotificationTarget { tenantId: string; route: string; }

@Injectable({
  providedIn: 'root',
})
export class NotificationNavigationService {
  private readonly pendingRouteKey = 'pendingNotificationRoute';

  constructor(private router: Router, private injector: Injector) {}

  async saveFromPayload(payload: unknown): Promise<void> {
    const target = this.resolveTarget(payload);
    if (!target) return;

    await Preferences.set({
      key: this.pendingRouteKey,
      value: JSON.stringify(target),
    });
  }

  async consumePendingOrNavigate(defaultRoute = '/homeAdmin'): Promise<void> {
    const route = await this.consumePendingRoute();
    await this.router.navigateByUrl(route || defaultRoute, { replaceUrl: true });
  }

  async navigatePendingIfAny(): Promise<boolean> {
    const route = await this.consumePendingRoute();
    if (!route) return false;

    await this.router.navigateByUrl(route, { replaceUrl: true });
    return true;
  }

  async navigateFromPayload(payload: unknown): Promise<boolean> {
    const target = this.resolveTarget(payload);
    if (!target) return false;

    if (target.tenantId !== this.currentTenant()) {
      await Preferences.set({ key: this.pendingRouteKey, value: JSON.stringify(target) });
      // Resolve auth lazily: auth initializes push, which owns this navigator.
      // Changing company always requires its own authenticated session.
      this.injector.get(AuthServiceService).logout();
      await this.router.navigateByUrl('/', { replaceUrl: true });
      return true;
    }

    await Preferences.remove({ key: this.pendingRouteKey });
    await this.router.navigateByUrl(target.route);
    return true;
  }

  private async consumePendingRoute(): Promise<string | null> {
    const target = await this.pendingTarget();
    if (!target || target.tenantId !== this.currentTenant()) return null;

    await Preferences.remove({ key: this.pendingRouteKey });
    return target.route;
  }

  async getPendingTenantId(): Promise<string | null> {
    return (await this.pendingTarget())?.tenantId || null;
  }

  private async pendingTarget(): Promise<NotificationTarget | null> {
    const { value } = await Preferences.get({ key: this.pendingRouteKey });
    if (!value) return null;
    try {
      const target = JSON.parse(value);
      if (this.validTenant(target?.tenantId) && typeof target.route === 'string') {
        return { tenantId: target.tenantId, route: this.normalizeRoute(target.route) };
      }
    } catch { /* Old pending routes contain no company and cannot be opened safely. */ }
    await Preferences.remove({ key: this.pendingRouteKey });
    return null;
  }

  private currentTenant(): string {
    const auth = this.injector.get(AuthServiceService);
    if (!auth.token || !auth.getTokenRemainingTime(auth.token)) return '';
    try {
      const data = jwtDecode<{ tenantId?: string }>(auth.token);
      return this.validTenant(data.tenantId) ? data.tenantId! : '';
    } catch { return ''; }
  }

  private validTenant(value: unknown): boolean {
    return typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{1,79}$/.test(value);
  }

  private resolveTarget(payload: unknown): NotificationTarget | null {
    const data = this.extractData(payload);
    const source = (payload || {}) as Record<string, unknown>;
    const tenantId = data['tenantId'] ?? (source['notification'] || source['data'] ? '' : this.currentTenant());
    const route = this.resolveRoute(payload);
    return this.validTenant(tenantId) && route ? { tenantId: tenantId as string, route } : null;
  }

  private resolveRoute(payload: unknown): string | null {
    const data = this.extractData(payload);
    const explicitRoute = this.firstString(
      data['route'],
      data['url'],
      data['path'],
      data['deeplink'],
    );

    if (explicitRoute) {
      return this.normalizeRoute(explicitRoute);
    }

    return this.routeFromNotificationData(data);
  }

  private extractData(payload: unknown): Record<string, unknown> {
    const source = (payload || {}) as Record<string, unknown>;
    const notification = (source['notification'] || {}) as Record<string, unknown>;
    const data =
      (source['data'] as Record<string, unknown> | undefined) ||
      (notification['data'] as Record<string, unknown> | undefined) ||
      source;

    return data || {};
  }

  private routeFromNotificationData(data: Record<string, unknown>): string | null {
    const type = this.firstString(data['type'], data['notificationType']);
    const screen = this.firstString(data['screen']);
    const appointmentId = this.firstString(data['appointmentId']);
    const occurrenceStart = this.firstString(data['occurrenceStart']);
    const deadlineId = this.firstString(data['deadlineId']);
    const numeroPreventivo = this.firstString(data['numeroPreventivo']);
    const acceptanceId = this.firstString(data['acceptanceId']);
    const numeroCliente = this.firstString(data['numeroCliente']);
    const contractId = this.firstString(data['contractId'], data['employeeContractId']);

    if (screen === 'calendar' || type === 'SOPRALLUOGO_REMINDER' || type === 'SOPRALLUOGO_ASSIGNED') {
      const params = new URLSearchParams();
      if (appointmentId) params.set('appointmentId', appointmentId);
      if (occurrenceStart) params.set('occurrenceStart', occurrenceStart);
      return `/calendarHome${params.toString() ? `?${params}` : ''}`;
    }

    if (screen === 'employeeDeadlines' || type === 'DEADLINE_EMPLOYEE_REMINDER') {
      return `/employee-deadlines${deadlineId ? `?deadlineId=${encodeURIComponent(deadlineId)}` : ''}`;
    }

    if (screen === 'vehicleDeadlines' || type === 'DEADLINE_VEHICLE_REMINDER') {
      return `/vehicle-deadlines${deadlineId ? `?deadlineId=${encodeURIComponent(deadlineId)}` : ''}`;
    }

    if (screen === 'equipmentDeadlines' || type === 'DEADLINE_EQUIPMENT_REMINDER') {
      return `/equipment-deadlines${deadlineId ? `?deadlineId=${encodeURIComponent(deadlineId)}` : ''}`;
    }

    if (screen === 'customerDeadlines' || type === 'DEADLINE_CUSTOMER_REMINDER') {
      return `/customer-deadlines${deadlineId ? `?deadlineId=${encodeURIComponent(deadlineId)}` : ''}`;
    }

    if (screen === 'internalDeadlines' || type === 'DEADLINE_INTERNAL_REMINDER') {
      return `/internal-deadlines${deadlineId ? `?deadlineId=${encodeURIComponent(deadlineId)}` : ''}`;
    }

    if (screen === 'quoteReview' || type === 'QUOTE_ACCEPTED_REVIEW') {
      const params = new URLSearchParams();
      if (numeroPreventivo) params.set('numeroPreventivo', numeroPreventivo);
      if (acceptanceId) params.set('acceptanceId', acceptanceId);
      params.set('review', '1');
      params.set('showCompleted', '1');
      return `/quotesHome?${params}`;
    }

    if (screen === 'employeeContractReview' || type === 'EMPLOYEE_CONTRACT_ACCEPTED_REVIEW') {
      const params = new URLSearchParams();
      if (contractId) params.set('contractId', contractId);
      params.set('review', '1');
      return `/employee-contracts?${params}`;
    }

    if (screen === 'customers' || type === 'CUSTOMER_ARCHIVE_REMINDER') {
      const params = new URLSearchParams();
      if (numeroCliente) params.set('archiveReminder', numeroCliente);
      return `/listCustomer${params.toString() ? `?${params}` : ''}`;
    }

    return null;
  }

  private normalizeRoute(route: string): string {
    const cleanRoute = route.trim();
    if (!cleanRoute) return '/homeAdmin';

    const [path, query = ''] = cleanRoute.startsWith('http')
      ? this.pathAndQueryFromUrl(cleanRoute)
      : cleanRoute.split('?');

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const suffix = query ? `?${query}` : '';

    if (normalizedPath === '/calendar') {
      return `/calendarHome${suffix}`;
    }

    if (normalizedPath === '/deadlines/employees') {
      return `/employee-deadlines${suffix}`;
    }

    if (normalizedPath === '/deadlines/vehicles') {
      return `/vehicle-deadlines${suffix}`;
    }

    if (normalizedPath === '/deadlines/equipment') {
      return `/equipment-deadlines${suffix}`;
    }

    if (normalizedPath === '/deadlines/customers') {
      return `/customer-deadlines${suffix}`;
    }

    if (normalizedPath === '/deadlines/internal') {
      return `/internal-deadlines${suffix}`;
    }

    if (normalizedPath === '/quotes') {
      return `/quotesHome${suffix}`;
    }

    return `${normalizedPath}${suffix}`;
  }

  private pathAndQueryFromUrl(url: string): [string, string] {
    try {
      const parsed = new URL(url);
      return [parsed.pathname, parsed.search.replace(/^\?/, '')];
    } catch {
      return [url, ''];
    }
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number') return String(value);
    }
    return '';
  }
}
