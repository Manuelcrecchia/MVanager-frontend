import { Injectable, NgZone } from '@angular/core';
import { ChildrenOutletContexts, NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { SocketService, ResourceChange, RealtimeConnectionState } from './soket.service';
import { GlobalService } from './global.service';
import { getRealtimeClientId } from './realtime-client-id';
import { ServiceAnnouncementService } from './service-announcement.service';
import { isRealtimeView, RealtimeView } from './realtime-view';

@Injectable({ providedIn: 'root' })
export class RealtimeSyncService {
  private routeSubscription?: Subscription;
  private socketSubscription?: Subscription;
  private connectionSubscription?: Subscription;
  private socketSessionKey = '';
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private pendingViews = new Set<RealtimeView>();
  private flushing = false;
  private hiddenAt = 0;
  private browserListenersInstalled = false;

  constructor(
    private router: Router,
    private socket: SocketService,
    private global: GlobalService,
    private zone: NgZone,
    private serviceAnnouncements: ServiceAnnouncementService,
    private outletContexts: ChildrenOutletContexts,
  ) {}

  start(): void {
    if (this.routeSubscription) return;
    this.routeSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.prunePendingViews();
        this.bindCurrentSession();
      });
    this.installBrowserRecoveryListeners();
    this.bindCurrentSession();
  }

  private bindCurrentSession(): void {
    const key = `${this.global.url}|${this.global.token}`;
    if (!this.global.token || !this.global.url) {
      this.socketSubscription?.unsubscribe();
      this.connectionSubscription?.unsubscribe();
      this.socketSubscription = undefined;
      this.connectionSubscription = undefined;
      this.socketSessionKey = '';
      this.pendingViews.clear();
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
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
    // mancanti. Negli altri casi rileggiamo i dati, senza ricreare la pagina.
    if (state.connected && state.reconnected && !state.recovered) {
      this.requestConsistencyRefresh('reconnected_without_recovery');
    }
  }

  private handleChange(change: ResourceChange): void {
    if (!change?.resource || change.originClientId === getRealtimeClientId()) return;
    if (change.resource === 'service_announcements') {
      const apps = Array.isArray(change.metadata?.['apps'])
        ? change.metadata?.['apps']
        : [];
      if (!apps.length || apps.includes('mvanager')) {
        void this.serviceAnnouncements.showAfterLogin();
      }
      return;
    }
    this.queueViews(change.resource);
  }

  requestConsistencyRefresh(_reason = 'manual_consistency_check'): void {
    this.queueViews('application');
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

  private activeViews(): RealtimeView[] {
    const views: RealtimeView[] = [];
    let contexts = this.outletContexts;
    while (contexts) {
      const context = contexts.getContext('primary');
      if (!context?.outlet?.isActivated) break;
      const component: unknown = context.outlet.component;
      if (isRealtimeView(component)) views.push(component);
      contexts = context.children;
    }
    return views;
  }

  private prunePendingViews(): void {
    const active = new Set(this.activeViews());
    for (const view of this.pendingViews) if (!active.has(view)) this.pendingViews.delete(view);
  }

  private queueViews(resource: string): void {
    if (!this.global.token) return;
    for (const view of this.activeViews()) {
      if (!view.realtimeResources.length) continue;
      if (resource !== 'application' && (view.realtimeHandledLocally || !view.realtimeResources.includes(resource))) continue;
      this.pendingViews.add(view);
    }
    if (!this.refreshTimer && this.pendingViews.size) this.scheduleFlush(120);
  }

  private scheduleFlush(delay: number): void {
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.flushViews();
    }, delay);
  }

  private async flushViews(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    this.prunePendingViews();
    if (!this.global.token) { this.pendingViews.clear(); this.flushing = false; return; }
    for (const view of [...this.pendingViews]) {
      this.pendingViews.delete(view);
      try {
        if (await view.refreshRealtimeData() === false) this.pendingViews.add(view);
      } catch (error) {
        console.warn('[Realtime] Data refresh failed', error);
      }
    }
    // Busy views retain their invalidation, including after focus moves away.
    this.flushing = false;
    if (this.pendingViews.size && !this.refreshTimer) this.scheduleFlush(1000);
  }
}
