import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Preferences } from '@capacitor/preferences';

@Injectable({
  providedIn: 'root',
})
export class NotificationNavigationService {
  private readonly pendingRouteKey = 'pendingNotificationRoute';

  constructor(private router: Router) {}

  async saveFromPayload(payload: unknown): Promise<void> {
    const route = this.resolveRoute(payload);
    if (!route) return;

    await Preferences.set({
      key: this.pendingRouteKey,
      value: route,
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
    const route = this.resolveRoute(payload);
    if (!route) return false;

    await Preferences.remove({ key: this.pendingRouteKey });
    await this.router.navigateByUrl(route);
    return true;
  }

  private async consumePendingRoute(): Promise<string | null> {
    const result = await Preferences.get({ key: this.pendingRouteKey });
    if (!result.value) return null;

    await Preferences.remove({ key: this.pendingRouteKey });
    return this.normalizeRoute(result.value);
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
