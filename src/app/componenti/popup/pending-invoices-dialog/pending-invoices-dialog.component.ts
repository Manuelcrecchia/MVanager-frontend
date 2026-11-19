import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface PendingInvoiceDocument {
  id: number; number: string; series: string; year: number; issueDate: string;
  customerName: string; type: string; status: string; sending?: boolean;
}
export interface InvoiceNumberGap { from: string; to: string; }
export interface PendingInvoicesDialogData { documents: PendingInvoiceDocument[]; gaps?: InvoiceNumberGap[]; currentNumber?: string; }
export type PendingInvoicesChoice = { action: 'send' } | { action: 'open'; invoiceId: number };

@Component({
  selector: 'app-pending-invoices-dialog', standalone: true, imports: [CommonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>{{ data.gaps?.length ? 'Buchi nella numerazione' : 'Documenti precedenti non inviati' }}</h2>
    <mat-dialog-content>
      <section *ngIf="data.gaps?.length" class="number-gaps">
        <p><strong>Stai inviando il documento {{ data.currentNumber }} con un numero troppo alto: ci sono numeri precedenti mancanti nella stessa serie e nello stesso anno.</strong></p>
        <ul><li *ngFor="let gap of data.gaps">{{ gap.from === gap.to ? 'Numero mancante: ' + gap.from : 'Numeri mancanti: da ' + gap.from + ' a ' + gap.to }}</li></ul>
        <p>Puoi annullare l’invio e verificare la numerazione, oppure confermare l’invio con il buco. Il recupero di un numero libero deve rispettare le date dei documenti vicini.</p>
      </section>
      <p *ngIf="data.documents.length">Questi documenti della stessa serie e dello stesso anno risultano ancora non inviati o scartati. Aprine uno per verificarlo, oppure conferma l’invio del documento attuale.</p>
      <ul *ngIf="data.documents.length">
        <li *ngFor="let document of data.documents">
          <div><strong>{{ document.series ? document.series + '/' : '' }}{{ document.number }} · {{ document.issueDate | date:'dd/MM/yyyy' }}</strong>
            <span>{{ document.customerName || 'Cliente non indicato' }}</span>
            <span>{{ document.type === 'TD04' || document.type === 'TD08' ? 'Nota di credito' : document.type === 'TD05' || document.type === 'TD09' ? 'Nota di debito' : 'Fattura' }} · {{ stateLabel(document) }}</span>
          </div>
          <button type="button" class="btn btn-outline-primary" (click)="open(document.id)" [attr.aria-label]="'Apri documento ' + (document.series || '') + '/' + document.number">Apri</button>
        </li>
      </ul>
      <p *ngIf="data.documents.length">L’invio del documento attuale non invia né annulla automaticamente quelli elencati.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button type="button" class="btn btn-outline-secondary" (click)="cancel()">Annulla</button>
      <button type="button" class="btn btn-primary" (click)="send()">Invia comunque</button>
    </mat-dialog-actions>`,
  styles: [`
    :host { display: block; color: #182235; }
    ul { list-style: none; padding: 0; margin: 16px 0; }
    li { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid #dce3ed; }
    li div { display: grid; gap: 4px; overflow-wrap: anywhere; }
    li button { flex-shrink: 0; }
    mat-dialog-actions { gap: 8px; padding: 16px 24px; }
    @media (max-width: 480px) { li { align-items: flex-start; } }
  `],
})
export class PendingInvoicesDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: PendingInvoicesDialogData,
    private ref: MatDialogRef<PendingInvoicesDialogComponent, PendingInvoicesChoice | null>) {}
  stateLabel(document: PendingInvoiceDocument): string {
    if (document.sending) return 'Invio in corso o da verificare';
    return document.status === 'rejected' ? 'Scartata' : document.status === 'issued' ? 'Emessa solo localmente' : 'Bozza';
  }
  open(invoiceId: number): void { this.ref.close({ action: 'open', invoiceId }); }
  send(): void { this.ref.close({ action: 'send' }); }
  cancel(): void { this.ref.close(null); }
}
