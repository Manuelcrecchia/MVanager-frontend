import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface CustomerMatchCandidate {
  customerId: string;
  customerName: string;
  customerAddress: string;
  customerFiscalCode: string;
  customerVatNumber: string;
  customerTaxOrVatNumber?: string;
  changes: { field: string; label: string; previous: string; value: string }[];
}
export interface CustomerMatchDialogData {
  candidates: CustomerMatchCandidate[];
  allowCreate: boolean;
}
export interface CustomerMatchChoice {
  customerId: string;
  action: 'update' | 'keep' | 'create';
}

@Component({
  selector: 'app-customer-match-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './customer-match-dialog.component.html',
  styleUrls: ['./customer-match-dialog.component.css'],
})
export class CustomerMatchDialogComponent {
  selectedId = '';
  constructor(@Inject(MAT_DIALOG_DATA) public data: CustomerMatchDialogData,
    private dialogRef: MatDialogRef<CustomerMatchDialogComponent, CustomerMatchChoice | null>) {}

  get selected(): CustomerMatchCandidate | undefined {
    return this.data.candidates.find((candidate) => candidate.customerId === this.selectedId);
  }

  choose(action: CustomerMatchChoice['action']): void {
    if (action === 'create' ? !this.data.allowCreate : !this.selected) return;
    const customerId = this.selected?.customerId || this.data.candidates[0]?.customerId;
    if (customerId) this.dialogRef.close({ customerId, action });
  }

  cancel(): void { this.dialogRef.close(null); }
}
