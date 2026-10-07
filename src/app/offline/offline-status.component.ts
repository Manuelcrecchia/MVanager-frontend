import { Component, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OfflineService, PendingOperation } from './offline.service';
import { shiftOperationDay } from './offline-policy';

@Component({
  selector: 'app-offline-status', standalone: true, imports: [CommonModule],
  template: `
    <aside class="offline-status" [class.needs-attention]="blockedCount > 0 || rejectedCount > 0 || !(offline.connected | async)" *ngIf="offline.session() && (((offline.operations | async) && queuedOperations.length) || !(offline.connected | async) || (offline.notice | async) || (offline.hasFieldDraft | async))" aria-label="Stato salvataggi">
      <details>
        <summary aria-live="polite" [class.has-notice]="offline.notice | async">
          <span class="status-dot" aria-hidden="true"></span>
          <span>{{ statusLabel }}</span>
          <span class="status-chevron" aria-hidden="true">⌃</span>
        </summary>
        <div class="offline-content" #queueContent>
          <button type="button" *ngIf="offline.hasFieldDraft | async" (click)="offline.restoreFields()">Ripristina i campi dalla bozza locale</button>
          <p *ngIf="offline.notice | async as notice" role="status">{{ notice }}</p>
          <p>I dati in attesa sono conservati su questo dispositivo. Non cancellare i dati dell’app o del browser prima della sincronizzazione.</p>
          <button type="button" class="delete-action" *ngIf="queuedOperations.length" (click)="requestRemoval()" [disabled]="removing">Svuota coda</button>
          <div class="removal-confirmation" *ngIf="removalRows.length" role="group" aria-label="Conferma eliminazione dalla coda">
            <strong>{{ removalRows.length === 1 ? 'Eliminare questa operazione dalla coda?' : 'Svuotare la coda (' + removalRows.length + ' operazioni)?' }}</strong>
            <p>La copia locale verrà eliminata e non sarà reinviata. Le modifiche non sincronizzate andranno perse. Questa azione non annulla quanto già salvato sul server. Gli invii in corso saranno mantenuti.</p>
            <p>Puoi esportare una copia delle operazioni prima di confermare.</p>
            <button type="button" class="delete-action" (click)="confirmRemoval()" [disabled]="removing">{{ removing ? 'Eliminazione…' : 'Conferma eliminazione' }}</button>
            <button type="button" (click)="removalRows = []" [disabled]="removing">Annulla</button>
          </div>
          <article *ngFor="let row of queuedOperations">
            <strong>{{ row.label }} · {{ row.createdAt | date:'dd/MM/yyyy HH:mm:ss' }}</strong>
            <span>{{ row.state === 'rejected' ? 'Non salvato · correggi i dati' : row.state === 'blocked' ? 'Conferma del server in attesa' : 'Salvato sul dispositivo · in attesa' }}</span>
            <p *ngIf="row.error">{{ row.error }}</p>
            <p *ngIf="isLegacyShiftUpdate(row) && row.state === 'waiting'">Aggiornamento rimasto dalla versione precedente. L’app cerca automaticamente la conferma; la copia locale è conservata.</p>
            <a class="recovery-action" *ngIf="row.state === 'waiting' && shiftRecoveryUrl(row) as url" [href]="url">Apri i turni della giornata</a>
            <p *ngIf="row.state === 'waiting' && row.automatic">La sincronizzazione riparte automaticamente quando il server è raggiungibile.</p>
            <p *ngIf="row.state === 'blocked' && row.errorCode !== 'OFFLINE_KEY_CONFLICT'">L’app ricontrolla automaticamente la conferma. Non ripete un invio dall’esito incerto.</p>
            <p *ngIf="row.state === 'blocked' && row.errorCode === 'OFFLINE_KEY_CONFLICT'">Il server ha rifiutato l’identificativo del salvataggio. La copia locale è conservata: contatta l’assistenza.</p>
            <a *ngIf="row.state === 'rejected'" [href]="recoveryUrl(row)">Torna al modulo per correggere i dati</a>
            <button type="button" (click)="offline.exportOperation(row)">Esporta copia</button>
            <button type="button" class="delete-action" (click)="requestRemoval(row)" [disabled]="removing">Elimina dalla coda</button>
          </article>
        </div>
      </details>
      <button class="dismiss-notice" type="button" *ngIf="offline.notice | async"
        (click)="dismissNotice()" aria-label="Chiudi avviso" title="Chiudi avviso">×</button>
    </aside>`,
  styles: [`
    :host { display: block; width: max-content; min-height: 0; pointer-events: none; position: fixed; right: 20px; bottom: 20px; z-index: 1050; max-width: calc(100vw - 40px); }
    .offline-status { pointer-events: auto; position: relative; color: var(--mv-ink, #24364b); background: var(--mv-surface, #fff); border: 1px solid #dbe3ec; border-radius: 16px; box-shadow: 0 4px 18px rgba(26, 46, 71, .12); font: 13px/1.45 system-ui,sans-serif; }
    summary { display: flex; align-items: center; gap: 9px; cursor: pointer; padding: 10px 14px; min-height: 44px; box-sizing: border-box; font-weight: 600; list-style: none; }
    summary.has-notice { padding-right: 52px; }
    .dismiss-notice { position: absolute; top: 0; right: 3px; width: 44px; height: 44px; margin: 0; padding: 0; border: 0; background: transparent; color: #64748b; font-size: 23px; }
    summary::-webkit-details-marker { display: none; }
    summary:focus-visible { outline: 2px solid #2875b9; outline-offset: 3px; border-radius: 14px; }
    .status-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; background: #377cad; }
    .needs-attention .status-dot { background: #b66c15; }
    .needs-attention { border-color: #d6b17c; }
    .status-chevron { margin-left: auto; color: #64748b; }
    details[open] .status-chevron { transform: rotate(180deg); }
    .offline-content { width: min(390px, calc(100vw - 40px)); box-sizing: border-box; padding: 0 14px 14px; max-height: min(55vh, 440px); overflow: auto; }
    article { border-top: 1px solid #e2e8f0; padding: 12px 0; }
    article strong,article span { display: block; overflow-wrap: anywhere; }
    article span { color: #64748b; margin-top: 4px; }
    p { margin: 8px 0; overflow-wrap: anywhere; }
    button,a.recovery-action { min-height: 44px; padding: 8px 12px; margin: 6px 8px 0 0; border: 1px solid #d5dfea; border-radius: 9px; color: #234d76; background: #f8fafc; }
    a.recovery-action { display: inline-flex; align-items: center; box-sizing: border-box; text-decoration: none; }
    button:hover { background: #edf3f9; }
    button.delete-action { color: #a42525; border-color: #e5baba; }
    button:disabled { opacity: .6; cursor: wait; }
    .removal-confirmation { padding: 12px; margin-top: 10px; border: 1px solid #e5baba; border-radius: 9px; background: #fff8f8; }
    @media (max-width: 700px) {
      :host { right: 12px; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); max-width: calc(100vw - 24px); }
      .offline-content { width: min(390px, calc(100vw - 24px)); max-height: 45vh; }
    }
  `],
})
export class OfflineStatusComponent {
  removalRows: PendingOperation[] = [];
  removing = false;
  @ViewChild('queueContent') private queueContent?: ElementRef<HTMLElement>;
  constructor(public offline: OfflineService) { offline.start(); }
  get queuedOperations(): PendingOperation[] { return this.offline.operations.value.filter(row => row.state !== 'done' && row.state !== 'archived' && !(row.foreground && Math.max(row.foregroundUntil || 0, row.leaseUntil || 0) > Date.now())); }
  requestRemoval(row?: PendingOperation): void {
    this.removalRows = row ? [row] : [...this.queuedOperations];
    if (this.queueContent) this.queueContent.nativeElement.scrollTop = 0;
  }
  async confirmRemoval(): Promise<void> {
    if (this.removing || !this.removalRows.length) return;
    this.removing = true;
    try {
      await this.offline.discardOperations(this.removalRows);
      this.removalRows = [];
    } finally { this.removing = false; }
  }
  dismissNotice(): void {
    this.offline.notice.next('');
  }
  isLegacyShiftUpdate(row: PendingOperation): boolean {
    return row.method === 'POST' && (row.path === '/shifts/autosave' || (row.path === '/shifts/saveMultiple' && !row.intent && !row.automatic));
  }
  shiftRecoveryUrl(row: PendingOperation): string {
    const day = this.isLegacyShiftUpdate(row) ? shiftOperationDay(row.path, row.body) : undefined;
    return day && this.offline.session()?.role === 'admin' ? '/homeAdmin/shifts/create?date=' + day : '';
  }
  recoveryUrl(row: PendingOperation): string {
    const day = shiftOperationDay(row.path, row.body);
    return day && this.offline.session()?.role === 'admin' ? '/homeAdmin/shifts/create?date=' + day : (row.page || '/').split('|')[0];
  }
  get statusLabel(): string {
    if (this.rejectedCount) return `${this.rejectedCount} ${this.rejectedCount === 1 ? 'salvataggio non riuscito' : 'salvataggi non riusciti'}`;
    if (this.blockedCount) return `${this.blockedCount} ${this.blockedCount === 1 ? 'conferma in attesa' : 'conferme in attesa'}`;
    if (!this.offline.connected.value) return 'Connessione al server da ripristinare';
    if (this.pendingCount && this.queuedOperations.every(row => row.state === 'waiting' && this.isLegacyShiftUpdate(row))) return `${this.pendingCount} ${this.pendingCount === 1 ? 'aggiornamento precedente' : 'aggiornamenti precedenti'} dei turni in attesa`;
    if (this.pendingCount) return `${this.pendingCount} ${this.pendingCount === 1 ? 'salvataggio in attesa' : 'salvataggi in attesa'}`;
    if (this.offline.notice.value) return 'Avviso sui salvataggi';
    if (this.offline.hasFieldDraft.value) return 'Bozza disponibile';
    return 'Salvataggi sincronizzati';
  }
  get pendingCount(): number { return this.queuedOperations.filter(row => row.state === 'waiting').length; }
  get blockedCount(): number { return this.queuedOperations.filter(row => row.state === 'blocked').length; }
  get rejectedCount(): number { return this.queuedOperations.filter(row => row.state === 'rejected').length; }
  get completedCount(): number { return this.offline.operations.value.filter(row => row.state === 'done').length; }
}
