import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
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
}

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private socketKey = '';

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
    this.socket = io(this.global.url, {
      autoConnect: false,
      auth: {
        tenantId: this.tenantService.tenant,
        token: this.global.token,
        clientId: getRealtimeClientId(),
      },
      query: { tenantId: this.tenantService.tenant },
    });

    this.socket.on('connect_error', (error) => {
      console.warn('[Socket] Connessione non riuscita:', error.message);
    });

    this.socket.on('featureUnavailable', (data) => {
      console.warn('[Socket] Funzione non disponibile:', data);
    });

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

  // ascolta aggiornamenti da altri utenti
  onShiftUpdate(): Observable<any> {
    return new Observable((subscriber) => {
      const socket = this.getSocket();
      const listener = (data: any) => {
        if (data?.tenantId && data.tenantId !== this.tenantService.tenant) {
          return;
        }
        subscriber.next(data);
      };
      socket.on('shiftUpdated', listener);
      this.connectIfReady(socket);
      return () => {
        socket.off('shiftUpdated', listener);
      };
    });
  }

  onQuoteAcceptanceUpdate(): Observable<any> {
    return new Observable((subscriber) => {
      const socket = this.getSocket();
      const listener = (data: any) => subscriber.next(data);
      socket.on('quoteAcceptanceUpdated', listener);
      this.connectIfReady(socket);
      return () => {
        socket.off('quoteAcceptanceUpdated', listener);
      };
    });
  }

  onEmployeeContractUpdate(): Observable<any> {
    return new Observable((subscriber) => {
      const socket = this.getSocket();
      const listener = (data: any) => subscriber.next(data);
      socket.on('employeeContractUpdated', listener);
      this.connectIfReady(socket);
      return () => {
        socket.off('employeeContractUpdated', listener);
      };
    });
  }

  onCustomerArchiveReminderUpdate(): Observable<any> {
    return new Observable((subscriber) => {
      const socket = this.getSocket();
      const listener = (data: any) => {
        if (data?.tenantId && data.tenantId !== this.tenantService.tenant) {
          return;
        }
        subscriber.next(data);
      };
      socket.on('customerArchiveReminderUpdated', listener);
      this.connectIfReady(socket);
      return () => {
        socket.off('customerArchiveReminderUpdated', listener);
      };
    });
  }

  onAdminTodoUpdate(): Observable<any> {
    return new Observable((subscriber) => {
      const socket = this.getSocket();
      const listener = (data: any) => {
        if (data?.tenantId && data.tenantId !== this.tenantService.tenant) {
          return;
        }
        subscriber.next(data);
      };
      socket.on('adminTodoUpdated', listener);
      this.connectIfReady(socket);
      return () => {
        socket.off('adminTodoUpdated', listener);
      };
    });
  }

  onNoteUnreadUpdate(): Observable<any> {
    return new Observable((subscriber) => {
      const socket = this.getSocket();
      const listener = (data: any) => {
        if (data?.tenantId && data.tenantId !== this.tenantService.tenant) {
          return;
        }
        subscriber.next(data);
      };
      socket.on('noteUnreadUpdated', listener);
      this.connectIfReady(socket);
      return () => {
        socket.off('noteUnreadUpdated', listener);
      };
    });
  }

  onInternalWarehouseSummaryUpdate(): Observable<any> {
    return new Observable((subscriber) => {
      const socket = this.getSocket();
      const listener = (data: any) => {
        if (data?.tenantId && data.tenantId !== this.tenantService.tenant) {
          return;
        }
        subscriber.next(data);
      };
      socket.on('internalWarehouseSummaryUpdated', listener);
      this.connectIfReady(socket);
      return () => {
        socket.off('internalWarehouseSummaryUpdated', listener);
      };
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
}
