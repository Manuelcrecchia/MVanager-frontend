import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { GlobalService } from './global.service';
import { TenantService } from './tenant.service';
import { getRealtimeClientId } from './realtime-client-id';

export interface ResourceChange {
  tenantId: string;
  resource: string;
  action: string;
  entityId?: string | null;
  actor?: { type?: string; id?: string | number | null } | null;
  originClientId?: string | null;
  occurredAt?: string;
  metadata?: Record<string, any>;
}

export interface RealtimeConnectionState {
  connected: boolean;
  reconnected: boolean;
  recovered: boolean;
  reason?: string;
  changedAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private socketKey = '';
  private hasConnectedForCurrentSession = false;
  private readonly connectionStateSubject = new BehaviorSubject<RealtimeConnectionState>({
    connected: false,
    reconnected: false,
    recovered: false,
    reason: 'not_started',
    changedAt: new Date().toISOString(),
  });

  constructor(
    private global: GlobalService,
    private tenantService: TenantService,
  ) {}

  private getConnectionKey(): string {
    return [
      this.global.url,
      this.tenantService.tenant,
      this.global.token,
    ].join('|');
  }

  private canConnect(): boolean {
    return !!this.global.token && !!this.tenantService.tenant;
  }

  private getSocket(): Socket {
    const connectionKey = this.getConnectionKey();

    if (this.socket && this.socketKey === connectionKey) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    this.socketKey = connectionKey;
    this.hasConnectedForCurrentSession = false;
    this.connectionStateSubject.next({
      connected: false,
      reconnected: false,
      recovered: false,
      reason: 'session_changed',
      changedAt: new Date().toISOString(),
    });
    this.socket = io(this.global.url, {
      autoConnect: false,
      auth: {
        tenantId: this.tenantService.tenant,
        token: this.global.token,
        clientId: getRealtimeClientId(),
      },
      query: { tenantId: this.tenantService.tenant },
    });

    const activeSocket = this.socket;
    activeSocket.on('connect', () => {
      if (this.socket !== activeSocket) return;
      const reconnected = this.hasConnectedForCurrentSession;
      this.hasConnectedForCurrentSession = true;
      this.connectionStateSubject.next({
        connected: true,
        reconnected,
        recovered: activeSocket.recovered === true,
        changedAt: new Date().toISOString(),
      });
    });

    activeSocket.on('disconnect', (reason) => {
      if (this.socket !== activeSocket) return;
      this.connectionStateSubject.next({
        connected: false,
        reconnected: this.hasConnectedForCurrentSession,
        recovered: false,
        reason,
        changedAt: new Date().toISOString(),
      });
    });

    activeSocket.on('connect_error', (error) => {
      if (this.socket !== activeSocket) return;
      console.warn('[Socket] Connessione non riuscita:', error.message);
      this.connectionStateSubject.next({
        connected: false,
        reconnected: this.hasConnectedForCurrentSession,
        recovered: false,
        reason: error.message || 'connect_error',
        changedAt: new Date().toISOString(),
      });
    });

    activeSocket.on('featureUnavailable', (data) => {
      console.warn('[Socket] Funzione non disponibile:', data);
    });

    // Registrare il listener fa avanzare il cursore Socket.IO usato per
    // recuperare i pacchetti emessi durante una breve disconnessione.
    activeSocket.on('realtimeReady', () => undefined);

    this.connectIfReady(this.socket);

    return this.socket;
  }

  private connectIfReady(socket: Socket): void {
    if (!this.canConnect()) {
      return;
    }

    if (!socket.connected) {
      socket.connect();
    }
  }

  ensureConnected(): void {
    if (!this.canConnect()) return;
    this.connectIfReady(this.getSocket());
  }

  isConnected(): boolean {
    return this.socket?.connected === true;
  }

  onConnectionState(): Observable<RealtimeConnectionState> {
    if (this.canConnect()) this.ensureConnected();
    return this.connectionStateSubject.asObservable();
  }

  // invia aggiornamenti al server
  emitUpdate(shift: any) {
    const socket = this.getSocket();
    this.connectIfReady(socket);

    if (!socket.connected && !this.canConnect()) {
      console.warn('[Socket] Aggiornamento turni non inviato: token o tenant mancanti');
      return;
    }

    socket.emit('updateShift', {
      ...(shift || {}),
      tenantId: this.tenantService.tenant,
    });
  }

  onResourceChanged(): Observable<ResourceChange> {
    return new Observable((subscriber) => {
      const socket = this.getSocket();
      const listener = (data: ResourceChange) => {
        if (data?.tenantId && data.tenantId !== this.tenantService.tenant) return;
        subscriber.next(data);
      };
      socket.on('resourceChanged', listener);
      this.connectIfReady(socket);
      return () => socket.off('resourceChanged', listener);
    });
  }

  onResourceChanges(resources: string | string[]): Observable<ResourceChange> {
    const accepted = new Set(Array.isArray(resources) ? resources : [resources]);
    return this.onResourceChanged().pipe(
      filter((change) => accepted.has(change?.resource)),
    );
  }
}
