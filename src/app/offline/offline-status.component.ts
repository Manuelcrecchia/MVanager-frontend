import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OfflineService } from './offline.service';

@Component({
  selector: 'app-offline-status', standalone: true, imports: [CommonModule],
  template: `
    <aside class="offline-status" *ngIf="offline.session() && ((offline.operations | async)?.length || !(offline.connected | async) || (offline.notice | async) || (offline.hasFieldDraft | async))" aria-label="Stato salvataggi">
      <details>
        <summary aria-live="polite">{{ !(offline.connected | async) ? 'Senza connessione · ' : '' }}Salvataggi: {{ pendingCount }} in attesa · {{ blockedCount }} da verificare · {{ completedCount }} sincronizzati</summary>
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
    </aside>`,
  styles: [`
    :host { display: block; position: relative; z-index: 1050; }
    .offline-status { background: #fff4d6; color: #302719; border-bottom: 1px solid #b59c64; font: 14px/1.45 system-ui,sans-serif; }
    summary { cursor: pointer; padding: 12px 16px; min-height: 44px; box-sizing: border-box; font-weight: 650; }
    .offline-content { padding: 0 16px 16px; max-height: 55vh; overflow: auto; }
    article { border-top: 1px solid #c5b996; padding: 12px 0; }
    article strong,article span { display: block; overflow-wrap: anywhere; }
    p { margin: 8px 0; overflow-wrap: anywhere; }
    button { min-height: 44px; padding: 8px 12px; margin: 6px 8px 0 0; border: 1px solid #7e6a3e; border-radius: 6px; color: #302719; background: white; }
  `],
})
export class OfflineStatusComponent {
  verifyId = "";
  constructor(public offline: OfflineService) { offline.start(); }
  get pendingCount(): number { return this.offline.operations.value.filter(row => row.state === 'waiting').length; }
  get blockedCount(): number { return this.offline.operations.value.filter(row => row.state === 'blocked').length; }
  get completedCount(): number { return this.offline.operations.value.filter(row => row.state === 'done').length; }
}
