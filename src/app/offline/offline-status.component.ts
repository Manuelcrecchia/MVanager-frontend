import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OfflineService } from './offline.service';

@Component({
  selector: 'app-offline-status', standalone: true, imports: [CommonModule],
  template: `
    <aside class="offline-status" [class.needs-attention]="blockedCount > 0 || !(offline.connected | async)" *ngIf="offline.session() && ((offline.operations | async)?.length || !(offline.connected | async) || (offline.notice | async) || (offline.hasFieldDraft | async))" aria-label="Stato salvataggi">
      <details>
        <summary aria-live="polite" [class.has-notice]="offline.notice | async">
          <span class="status-dot" aria-hidden="true"></span>
          <span>{{ statusLabel }}</span>
          <span class="status-chevron" aria-hidden="true">⌃</span>
        </summary>
        <div class="offline-content">
          <button type="button" *ngIf="offline.hasFieldDraft | async" (click)="offline.restoreFields()">Ripristina i campi dalla bozza locale</button>
          <p *ngIf="offline.notice | async as notice" role="status">{{ notice }}</p>
          <p>I dati in attesa sono conservati su questo dispositivo. Non cancellare i dati dell’app o del browser prima della sincronizzazione.</p>
          <article *ngFor="let row of offline.operations | async">
            <strong>{{ row.label }} · {{ row.createdAt | date:'dd/MM/yyyy HH:mm:ss' }}</strong>
            <span>{{ row.state === 'done' ? 'Sincronizzato' : row.state === 'blocked' ? 'Da verificare' : 'Salvato sul dispositivo · in attesa' }}</span>
            <p *ngIf="row.error">{{ row.error }}</p>
            <p *ngIf="!row.automatic && row.state === 'waiting'">Richiede un invio esplicito: controlla che l’operazione sia ancora valida.</p>
            <button type="button" *ngIf="row.state === 'waiting'" (click)="offline.sync(row.id)">Riprova invio</button>
            <button type="button" *ngIf="row.state === 'blocked'" (click)="verifyId = row.id">Ho verificato l’esito sul server</button>
            <div *ngIf="verifyId === row.id">
              <p>Archivia solo dopo aver controllato l’esito e recuperato eventuali modifiche. Questa operazione non verrà reinviata. Esporta prima la copia per poterla consultare.</p>
              <button type="button" (click)="offline.archiveVerified(row); verifyId = ''">Conferma verifica e sblocca la coda</button>
              <button type="button" (click)="verifyId = ''">Annulla</button>
            </div>
            <button type="button" (click)="offline.exportOperation(row)">Esporta copia</button>
            <button type="button" *ngIf="row.state === 'done'" (click)="offline.acknowledge(row)">Ho verificato il salvataggio</button>
          </article>
        </div>
      </details>
      <button class="dismiss-notice" type="button" *ngIf="offline.notice | async"
        (click)="dismissNotice()" aria-label="Chiudi avviso" title="Chiudi avviso">×</button>
    </aside>`,
  styles: [`
    :host { position: fixed; right: 20px; bottom: 20px; z-index: 1050; max-width: calc(100vw - 40px); }
    .offline-status { position: relative; color: var(--mv-ink, #24364b); background: var(--mv-surface, #fff); border: 1px solid #dbe3ec; border-radius: 16px; box-shadow: 0 4px 18px rgba(26, 46, 71, .12); font: 13px/1.45 system-ui,sans-serif; }
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
    button { min-height: 44px; padding: 8px 12px; margin: 6px 8px 0 0; border: 1px solid #d5dfea; border-radius: 9px; color: #234d76; background: #f8fafc; }
    button:hover { background: #edf3f9; }
    @media (max-width: 700px) {
      :host { right: 12px; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); max-width: calc(100vw - 24px); }
      .offline-content { width: min(390px, calc(100vw - 24px)); max-height: 45vh; }
    }
  `],
})
export class OfflineStatusComponent {
  verifyId = "";
  constructor(public offline: OfflineService) { offline.start(); }
  dismissNotice(): void {
    this.offline.notice.next('');
  }
  get statusLabel(): string {
    if (this.blockedCount) return `${this.blockedCount} salvataggi da verificare`;
    if (!this.offline.connected.value) return 'Senza connessione';
    if (this.pendingCount) return `${this.pendingCount} salvataggi in attesa`;
    if (this.offline.notice.value) return 'Avviso sui salvataggi';
    if (this.offline.hasFieldDraft.value) return 'Bozza disponibile';
    return 'Salvataggi sincronizzati';
  }
  get pendingCount(): number { return this.offline.operations.value.filter(row => row.state === 'waiting').length; }
  get blockedCount(): number { return this.offline.operations.value.filter(row => row.state === 'blocked').length; }
  get completedCount(): number { return this.offline.operations.value.filter(row => row.state === 'done').length; }
}
