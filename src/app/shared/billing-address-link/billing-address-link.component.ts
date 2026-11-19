import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GlobalService } from '../../service/global.service';
@Component({ selector: 'app-billing-address-link', standalone: true, imports: [CommonModule, FormsModule],
  template: `<fieldset *ngIf="config?.enabled" class="billing-link"><legend>Indirizzo di fatturazione</legend>
    <p>Scegli quale indirizzo usare per la fatturazione. Se lo colleghi, le modifiche all’indirizzo scelto vengono copiate automaticamente.</p>
    <label *ngFor="let source of config?.sources"><input type="radio" [name]="'billingAddressSource-' + scope" [value]="source.id" [ngModel]="record['billingAddressSource'] || 'independent'" (ngModelChange)="choose($event)"> {{ source.label }}</label>
    <label><input type="radio" [name]="'billingAddressSource-' + scope" value="independent" [ngModel]="record['billingAddressSource'] || 'independent'" (ngModelChange)="choose($event)"> Indirizzo di fatturazione diverso</label>
    <p *ngIf="record['billingAddressSource'] && record['billingAddressSource'] !== 'independent'"><strong>Indirizzo collegato:</strong> {{ summary }}</p>
  </fieldset>`,
  styles: [`.billing-link { margin: 16px 0; padding: 18px; border: 1px solid #ccd9e8; border-radius: 12px; background: #f5f9ff; } legend { font-size: 1.1rem; font-weight: 700; } label { display: flex; align-items: center; gap: 9px; margin: 10px 0; } p { color: #41546b; } input { width: 18px; height: 18px; }`],
})
export class BillingAddressLinkComponent {
  @Input() scope: 'customer' | 'quote' = 'customer';
  @Input() record: Record<string, any> = {};
  @Output() selectionChange = new EventEmitter<void>();
  constructor(public global: GlobalService) {}
  get config() { return this.global.getBillingAddressLinkConfig(); }
  get summary(): string {
    const fields = this.config?.billing[this.scope] || {};
    return Object.values(fields).map(key => this.global.getRecordValueByFieldKey(this.scope, this.record, key || '')).filter(Boolean).join(', ');
  }
  choose(value: string): void { this.record['billingAddressSource'] = value; this.global.applyBillingAddressChoice(this.scope, this.record); this.selectionChange.emit(); }
}
