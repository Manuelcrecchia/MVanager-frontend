import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Subscription, timer } from 'rxjs';
import { GlobalService } from './global.service';
import { SocketService } from './soket.service';
import { TenantService } from './tenant.service';

export type NoteEntityType = 'customer' | 'quote' | 'employee' | 'candidate';

interface NoteUnreadBucket {
  total: number;
  entities: Record<string, number>;
}

interface NoteUnreadSummary {
  total: number;
  byType: Partial<Record<NoteEntityType, NoteUnreadBucket>>;
}

@Injectable({ providedIn: 'root' })
export class NoteUnreadService {
  private summary: NoteUnreadSummary = { total: 0, byType: {} };
  private resourceSubscription?: Subscription;
  private connectionSubscription?: Subscription;
  private pollingSubscription?: Subscription;
  private refreshSubscription?: Subscription;
  private sessionKey = '';

  constructor(
    private http: HttpClient,
    private global: GlobalService,
    private socket: SocketService,
    private tenant: TenantService,
  ) {}

  start(): void {
    if (!this.global.token) return;
    const nextSessionKey = `${this.tenant.tenant}|${this.global.token}`;
    if (this.sessionKey === nextSessionKey) return;
    this.resourceSubscription?.unsubscribe();
    this.connectionSubscription?.unsubscribe();
    this.pollingSubscription?.unsubscribe();
    this.refreshSubscription?.unsubscribe();
    this.summary = { total: 0, byType: {} };
    this.sessionKey = nextSessionKey;
    this.refresh();
    this.resourceSubscription = this.socket.onResourceChanged().subscribe((change) => {
      if (['customer_notes', 'quote_notes', 'employee_notes', 'note_unread', 'candidates']
        .includes(change?.resource)) {
        this.scheduleRefresh();
      }
    });
    this.connectionSubscription = this.socket.onConnectionState().subscribe((state) => {
      if (state.connected && state.reconnected) this.scheduleRefresh(0);
    });
    // Se una sospensione supera il recupero Socket.IO, il riepilogo periodico
    // riallinea comunque il bollino con lo stato persistito nel database.
    this.pollingSubscription = timer(60_000, 60_000).subscribe(() => this.refresh());
  }

  private scheduleRefresh(delayMs = 150): void {
    this.refreshSubscription?.unsubscribe();
    this.refreshSubscription = timer(delayMs).subscribe(() => this.refresh());
  }

  refresh(): void {
    if (!this.global.token) return;
    this.http.get<NoteUnreadSummary>(this.global.url + 'admin/note-unread/summary', {
      headers: this.global.headers,
    }).subscribe({
      next: (summary) => {
        this.summary = this.normalizeSummary(summary);
      },
      error: (error) => {
        console.warn('[NoteUnread] Impossibile aggiornare le note non lette:', error);
      },
    });
  }

  count(type: NoteEntityType, entityKey: string | number | null | undefined): number {
    const key = String(entityKey ?? '').trim();
    return key ? Number(this.summary.byType[type]?.entities?.[key] || 0) : 0;
  }

  typeTotal(type: NoteEntityType): number {
    return Number(this.summary.byType[type]?.total || 0);
  }

  markRead(type: NoteEntityType, entityKey: string | number | null | undefined): void {
    const key = String(entityKey ?? '').trim();
    if (!key || !this.global.token) return;

    this.clearEntityLocally(type, key);
    this.http.post(this.global.url + 'admin/note-unread/read', {
      entityType: type,
      entityKey: key,
    }, { headers: this.global.headers }).subscribe({
      next: () => this.refresh(),
      error: (error) => {
        console.warn('[NoteUnread] Impossibile confermare la lettura:', error);
        this.refresh();
      },
    });
  }

  private clearEntityLocally(type: NoteEntityType, key: string): void {
    const bucket = this.summary.byType[type];
    if (!bucket?.entities?.[key]) return;
    const removed = Number(bucket.entities[key]);
    const entities = { ...bucket.entities };
    delete entities[key];
    this.summary = {
      total: Math.max(0, this.summary.total - removed),
      byType: {
        ...this.summary.byType,
        [type]: { total: Math.max(0, bucket.total - removed), entities },
      },
    };
  }

  private normalizeSummary(summary: NoteUnreadSummary | null | undefined): NoteUnreadSummary {
    return {
      total: Number(summary?.total || 0),
      byType: summary?.byType && typeof summary.byType === 'object' ? summary.byType : {},
    };
  }
}
