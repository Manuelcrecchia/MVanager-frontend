import { Injectable, NgZone } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Subscription, filter } from 'rxjs';
import { SocketService, ResourceChange, RealtimeConnectionState } from './soket.service';
import { GlobalService } from './global.service';
import { getRealtimeClientId } from './realtime-client-id';

interface RealtimeControlState {
  tagName: string;
  type: string;
  value: string;
  checked?: boolean;
}

const EDIT_ROUTE_PARTS = [
  '/nuovo', '/new', '/add', '/edit', '/modifica', '/create', '/view/',
  '/scheda', 'dettaglio', 'dettagli', '/details', '/settings', '/accett', '/firma',
  '/documenti/', '/customer-assets/customer/', '/work-completion',
];

const RESOURCE_ROUTE_TERMS: Record<string, string[]> = {
  quotes: ['quote', 'preventiv'],
  quote_notes: ['quote', 'preventiv'],
  customers: ['customer', 'client'],
  customer_notes: ['customer', 'client'],
  employees: ['employee', 'dipendent'],
  employee_notes: ['employee', 'dipendent'],
  employee_contracts: ['employee-contract', 'contratt'],
  invoices: ['invoice', 'fattur', 'accounting', 'contabil'],
  accounting: ['accounting', 'contabil'],
  appointments: ['calendar', 'appuntament', 'shift', 'turn'],
  shifts: ['shift', 'turn', 'calendar', 'riepilogo-ore', 'presenz'],
  leave_requests: ['permess', 'leave'],
  attendance: ['presenz', 'attendance', 'timbr', 'riepilogo-ore'],
  stamping: ['timbr', 'stamping', 'presenz', 'riepilogo-ore'],
  deadlines: ['deadline', 'scadenz', 'customer-asset'],
  documents: ['document'],
  internal_documents: ['internal-document', 'documenti-intern'],
  internal_warehouse: ['internal-warehouse', 'magazzin'],
  material_orders: ['internal-warehouse', 'material-order', 'ordini-material'],
  service_orders: ['service-order', 'ordini-serviz'],
  vehicles: ['vehicle', 'mezz'],
  equipment: ['equipment', 'attrezzatur'],
  candidates: ['candidate', 'candidat'],
  email: ['email'],
  notifications: ['notification', 'notific'],
  service_announcements: ['service-announcement', 'comunicaz'],
  settings: ['settings', 'impostazion'],
  admins: ['gestioneuser', 'usersettings'],
  todos: ['homeadmin'],
  work_completion: ['work-completion', 'fine-lavoro'],
};

export function adminRouteUsesResource(url: string, resource: string): boolean {
  const fullPath = String(url || '').split('?')[0].toLowerCase();
  if (!fullPath.startsWith('/homeadmin')) return false;
  const path = fullPath.replace(/^\/homeadmin\/?/, '');
  // La home contiene contatori e riepiloghi di molte aree: qualunque mutazione
  // puo' modificarne almeno uno.
  if (!path) return true;
  const terms = RESOURCE_ROUTE_TERMS[resource] || [resource.replace(/_/g, '-')];
  return terms.some((term) => path.includes(term));
}

export function adminRouteRequiresRealtimeConfirmation(url: string): boolean {
  const path = String(url || '').split('?')[0].toLowerCase();
  return EDIT_ROUTE_PARTS.some((part) => path.includes(part));
}

@Injectable({ providedIn: 'root' })
export class RealtimeSyncService {
  readonly pendingChange$ = new BehaviorSubject<ResourceChange | null>(null);
  private routeSubscription?: Subscription;
  private socketSubscription?: Subscription;
  private connectionSubscription?: Subscription;
  private socketSessionKey = '';
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private refreshing = false;
  private hiddenAt = 0;
  private browserListenersInstalled = false;

  constructor(
    private router: Router,
    private socket: SocketService,
    private global: GlobalService,
    private zone: NgZone,
  ) {}

  start(): void {
    if (this.routeSubscription) return;
    this.routeSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.clearPendingChangeOnSafeRoute();
        this.bindCurrentSession();
      });
    this.installBrowserRecoveryListeners();
    this.bindCurrentSession();
  }

  applyPendingUpdate(): void {
    this.pendingChange$.next(null);
    this.refreshCurrentRoute();
  }

  dismissPendingUpdate(): void {
    this.pendingChange$.next(null);
  }

  private bindCurrentSession(): void {
    const key = `${this.global.url}|${this.global.token}`;
    if (!this.global.token || !this.global.url) {
      this.socketSubscription?.unsubscribe();
      this.connectionSubscription?.unsubscribe();
      this.socketSubscription = undefined;
      this.connectionSubscription = undefined;
      this.socketSessionKey = '';
      return;
    }
    if (key === this.socketSessionKey && this.socketSubscription) return;
    this.socketSubscription?.unsubscribe();
    this.connectionSubscription?.unsubscribe();
    this.socketSessionKey = key;
    this.socketSubscription = this.socket.onResourceChanged().subscribe((change) => {
      this.zone.run(() => this.handleChange(change));
    });
    this.connectionSubscription = this.socket.onConnectionState().subscribe((state) => {
      this.zone.run(() => this.handleConnectionState(state));
    });
  }

  private handleConnectionState(state: RealtimeConnectionState): void {
    // Se la sessione e' stata recuperata, Socket.IO riproduce i pacchetti
    // mancanti. Negli altri casi serve una rilettura completa della pagina.
    if (state.connected && state.reconnected && !state.recovered) {
      this.requestConsistencyRefresh('reconnected_without_recovery');
    }
  }

  private handleChange(change: ResourceChange): void {
    if (!change?.resource || change.originClientId === getRealtimeClientId()) return;
    if (!this.currentRouteUses(change.resource)) return;
    // Il magazzino dispone già di un refresh granulare che conserva tab,
    // filtri e scanner; il bus generale aggiorna comunque le altre app.
    if (['internal_warehouse', 'material_orders'].includes(change.resource)) return;
    if (this.hasGranularHandler(change)) return;
    if (this.requiresRealtimeConfirmation()) {
      this.pendingChange$.next(change);
      return;
    }
    this.scheduleCurrentRouteRefresh(250);
  }

  private hasGranularHandler(change: ResourceChange): boolean {
    const path = this.router.url.split('?')[0].toLowerCase();
    const metadata = change.metadata || {};
    if (path === '/homeadmin/listcustomer' && change.resource === 'customers') {
      return true;
    }
    if (path === '/homeadmin') {
      if (change.resource === 'todos') return true;
      if (change.resource === 'quotes' && metadata['kind']) return true;
      if (change.resource === 'employee_contracts' && metadata['kind']) return true;
      if (change.resource === 'customers' && metadata['kind']) return true;
    }
    if (path.includes('/quoteshome') && change.resource === 'quotes' && metadata['kind']) {
      return true;
    }
    if (path.includes('/shifts/create') && change.resource === 'shifts' && metadata['type']) {
      return true;
    }
    return false;
  }

  requestConsistencyRefresh(reason = 'manual_consistency_check'): void {
    if (!this.isAdminRoute()) return;
    const change: ResourceChange = {
      tenantId: '',
      resource: 'application',
      action: reason,
      occurredAt: new Date().toISOString(),
    };
    if (this.requiresRealtimeConfirmation()) {
      this.pendingChange$.next(change);
      return;
    }
    this.scheduleCurrentRouteRefresh(300);
  }

  private installBrowserRecoveryListeners(): void {
    if (this.browserListenersInstalled || typeof window === 'undefined' || typeof document === 'undefined') return;
    this.browserListenersInstalled = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
        return;
      }
      this.socket.ensureConnected();
      if (this.hiddenAt && Date.now() - this.hiddenAt >= 30_000) {
        this.requestConsistencyRefresh('app_resumed');
      }
      this.hiddenAt = 0;
    });
    window.addEventListener('online', () => {
      this.socket.ensureConnected();
      this.requestConsistencyRefresh('network_restored');
    });
  }

  private scheduleCurrentRouteRefresh(delayMs: number): void {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refreshCurrentRoute(), delayMs);
  }

  private currentRouteUses(resource: string): boolean {
    return adminRouteUsesResource(this.router.url, resource);
  }

  private isEditingRoute(): boolean {
    return adminRouteRequiresRealtimeConfirmation(this.router.url);
  }

  private requiresRealtimeConfirmation(): boolean {
    return this.isEditingRoute() || this.hasFocusedEditorControl();
  }

  private hasFocusedEditorControl(): boolean {
    if (typeof document === 'undefined') return false;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    if (active instanceof HTMLInputElement && active.type.toLowerCase() === 'search') return false;
    if (active instanceof HTMLSelectElement && !active.closest('form')) return false;
    if (active instanceof HTMLInputElement && !active.closest('form')) return false;
    return active instanceof HTMLInputElement
      || active instanceof HTMLTextAreaElement
      || active instanceof HTMLSelectElement
      || active.isContentEditable;
  }

  private clearPendingChangeOnSafeRoute(): void {
    if (!this.requiresRealtimeConfirmation() && this.pendingChange$.value) {
      this.pendingChange$.next(null);
    }
  }

  private refreshCurrentRoute(): void {
    if (this.refreshing) return;
    const currentUrl = this.router.url;
    if (!this.isAdminRoute()) return;
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    const controlState = this.captureListControlState();
    this.refreshing = true;
    this.router.navigateByUrl('/homeAdmin', { skipLocationChange: true })
      .then(() => this.router.navigateByUrl(currentUrl, { replaceUrl: true }))
      .finally(() => {
        this.refreshing = false;
        this.restoreListControlState(controlState);
        if (scrollY > 0 && typeof window !== 'undefined') {
          setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'auto' }), 0);
        }
      });
  }

  private captureListControlState(): RealtimeControlState[] {
    return this.listPreservableControls().map((control) => ({
      tagName: control.tagName,
      type: control instanceof HTMLInputElement ? control.type : '',
      value: control.value,
      checked: control instanceof HTMLInputElement ? control.checked : undefined,
    }));
  }

  private restoreListControlState(states: RealtimeControlState[]): void {
    if (!states.length || typeof window === 'undefined') return;
    setTimeout(() => {
      const controls = this.listPreservableControls();
      states.forEach((state, index) => {
        const control = controls[index];
        if (!control || control.tagName !== state.tagName) return;
        if (control instanceof HTMLInputElement && control.type !== state.type) return;
        control.value = state.value;
        if (control instanceof HTMLInputElement && state.checked !== undefined) control.checked = state.checked;
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }, 0);
  }

  private listPreservableControls(): Array<HTMLInputElement | HTMLSelectElement> {
    if (typeof document === 'undefined') return [];
    return Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'))
      .filter((control) => control.matches('[data-realtime-preserve], input[type="search"]') || !control.closest('form'));
  }

  private isAdminRoute(): boolean {
    return this.router.url.split('?')[0].toLowerCase().startsWith('/homeadmin');
  }
}
