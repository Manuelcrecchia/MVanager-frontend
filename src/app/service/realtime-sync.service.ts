import { Injectable, NgZone } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject, Subscription, filter } from 'rxjs';
import { SocketService, ResourceChange } from './soket.service';
import { GlobalService } from './global.service';
import { getRealtimeClientId } from './realtime-client-id';

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
  invoices: ['invoice', 'fattur'],
  accounting: ['accounting', 'contabil'],
  appointments: ['calendar', 'appuntament', 'shift', 'turn'],
  shifts: ['shift', 'turn', 'calendar', 'riepilogo-ore', 'presenz'],
  leave_requests: ['permess', 'leave'],
  attendance: ['presenz', 'attendance', 'timbr', 'riepilogo-ore'],
  stamping: ['timbr', 'stamping', 'presenz', 'riepilogo-ore'],
  deadlines: ['deadline', 'scadenz'],
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
  admins: ['user', 'admin'],
  todos: ['homeadmin'],
  work_completion: ['work-completion', 'fine-lavoro'],
};

@Injectable({ providedIn: 'root' })
export class RealtimeSyncService {
  readonly pendingChange$ = new BehaviorSubject<ResourceChange | null>(null);
  private routeSubscription?: Subscription;
  private socketSubscription?: Subscription;
  private socketSessionKey = '';
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private refreshing = false;

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
      .subscribe(() => this.bindCurrentSession());
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
      this.socketSubscription = undefined;
      this.socketSessionKey = '';
      return;
    }
    if (key === this.socketSessionKey && this.socketSubscription) return;
    this.socketSubscription?.unsubscribe();
    this.socketSessionKey = key;
    this.socketSubscription = this.socket.onResourceChanged().subscribe((change) => {
      this.zone.run(() => this.handleChange(change));
    });
  }

  private handleChange(change: ResourceChange): void {
    if (!change?.resource || change.originClientId === getRealtimeClientId()) return;
    if (!this.currentRouteUses(change.resource)) return;
    // Il magazzino dispone già di un refresh granulare che conserva tab,
    // filtri e scanner; il bus generale aggiorna comunque le altre app.
    if (['internal_warehouse', 'material_orders'].includes(change.resource)) return;
    if (this.isEditingRoute() || this.hasActiveSearch()) {
      this.pendingChange$.next(change);
      return;
    }
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refreshCurrentRoute(), 250);
  }

  private currentRouteUses(resource: string): boolean {
    const path = this.router.url.split('?')[0].toLowerCase();
    if (!path.startsWith('/homeadmin')) return false;
    const terms = RESOURCE_ROUTE_TERMS[resource] || [resource.replace(/_/g, '-')];
    return terms.some((term) => path.includes(term));
  }

  private isEditingRoute(): boolean {
    const path = this.router.url.split('?')[0].toLowerCase();
    return EDIT_ROUTE_PARTS.some((part) => path.includes(part));
  }

  private hasActiveSearch(): boolean {
    if (typeof document === 'undefined') return false;
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) {
      return true;
    }
    return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="search"]'))
      .some((input) => input.value.trim().length > 0);
  }

  private refreshCurrentRoute(): void {
    if (this.refreshing) return;
    const currentUrl = this.router.url;
    if (!currentUrl.startsWith('/homeAdmin')) return;
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    this.refreshing = true;
    this.router.navigateByUrl('/homeAdmin', { skipLocationChange: true })
      .then(() => this.router.navigateByUrl(currentUrl, { replaceUrl: true }))
      .finally(() => {
        this.refreshing = false;
        if (scrollY > 0 && typeof window !== 'undefined') {
          setTimeout(() => window.scrollTo({ top: scrollY, behavior: 'auto' }), 0);
        }
      });
  }
}
