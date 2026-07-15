import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { GlobalService } from './global.service';
import { TenantService } from './tenant.service';

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
}
