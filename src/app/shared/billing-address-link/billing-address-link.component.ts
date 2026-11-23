import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GlobalService } from '../../service/global.service';
import { ItalianProvinceDirective } from '../italian-municipalities/italian-province.directive';

@Component({
  selector: 'app-billing-address-link', standalone: true,
  imports: [CommonModule, FormsModule, ItalianProvinceDirective],
  template: `<fieldset *ngIf="config?.enabled" class="billing-link">
    <legend>Indirizzo di fatturazione</legend>
    <label class="billing-choice"><input type="radio" [name]="'billingAddressSource-' + scope" value="independent" [ngModelOptions]="{standalone:true}" [ngModel]="record['billingAddressSource'] || 'independent'" (ngModelChange)="choose($event)"> {{ manualLabel }}</label>
    <label class="billing-choice" *ngFor="let source of sources; trackBy: sourceKey"><input type="radio" [name]="'billingAddressSource-' + scope" [value]="source.id" [ngModelOptions]="{standalone:true}" [ngModel]="record['billingAddressSource'] || 'independent'" (ngModelChange)="choose($event)"> {{ source.labels?.[scope] || source.label }}</label>
    <div *ngIf="config?.version === 2 && independent" class="billing-fields">
      <label *ngFor="let field of manualFields; trackBy: fieldKey">{{ field.label }}
        <select *ngIf="field.options.length; else textInput" [ngModelOptions]="{standalone:true}" [ngModel]="read(field.part)" (ngModelChange)="update(field.part,$event)"><option value="">Seleziona</option><option *ngFor="let option of field.options" [value]="option">{{ option }}</option></select>
        <ng-template #textInput>
          <input *ngIf="field.part === 'city'; else ordinaryInput" [ngModelOptions]="{standalone:true}" [ngModel]="read(field.part)" (ngModelChange)="update(field.part,$event)" [mvItalianProvince]="read('province')" [provinceCity]="read('city')" [provinceCountry]="read('country') || 'IT'" (mvItalianProvinceChange)="update('province',$event)" autocomplete="address-level2" />
          <ng-template #ordinaryInput><input [ngModelOptions]="{standalone:true}" [ngModel]="read(field.part)" (ngModelChange)="update(field.part,$event)" [attr.maxlength]="field.part === 'province' ? 2 : null" /></ng-template>
        </ng-template>
      </label>
    </div>
    <p *ngIf="!independent"><strong>Indirizzo collegato:</strong> {{ summary }}<br>Le modifiche all’indirizzo scelto vengono copiate automaticamente.</p>
  </fieldset>`,
  styles: [`.billing-link { margin:16px 0; padding:18px; border:1px solid #ccd9e8; border-radius:12px; background:#f5f9ff; } legend {font-size:1.1rem;font-weight:700;} .billing-choice {display:flex;align-items:center;gap:9px;margin:10px 0;} .billing-choice input {width:18px;height:18px;} p{color:#41546b;} .billing-fields {display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:14px;margin-top:18px;} .billing-fields label {display:grid;gap:6px;font-weight:600;} .billing-fields input,.billing-fields select {box-sizing:border-box;width:100%;min-width:0;padding:11px;border:1px solid #bac9dc;border-radius:8px;background:white;font:inherit;}`],
})
export class BillingAddressLinkComponent {
  @Input() scope: 'customer' | 'quote' = 'customer';
  @Input() record: Record<string, any> = {};
  @Output() selectionChange = new EventEmitter<void>();
  constructor(public global: GlobalService) {}
  get config() { return this.global.getBillingAddressLinkConfig(); }
  get sources() { return (this.config?.sources || []).filter(source => source.scopes?.[this.scope] !== false); }
  get manualLabel() { return this.config?.manualLabels?.[this.scope] || 'Indirizzo di fatturazione diverso'; }
  get independent() { return !this.record['billingAddressSource'] || this.record['billingAddressSource'] === 'independent'; }
  sourceKey = (_: number, source: {id:string}) => source.id;
  fieldKey = (_: number, field: {part:string}) => field.part;
  get manualFields() {
    const names: Record<string,string> = {prefix:'Prefisso (via, piazza...)',address:'Via / indirizzo',number:'Numero civico',city:'Comune',province:'Provincia',zip:'CAP',country:'Nazione'};
    return Object.entries(names).filter(([part]) => !!this.targetKey(part)).map(([part,label]) => {
      const field = this.global.getFieldConfig(this.scope,this.targetKey(part));
      return {part,label,options:field?.type === 'enum' ? this.global.getEnumOptions(field) : []};
    });
  }
  private targetKey(part: string): string { return (this.config?.billing[this.scope] as Record<string,string>)?.[part] || ''; }
  read(part: string): string { return String(this.global.getRecordValueByFieldKey(this.scope,this.record,this.targetKey(part)) ?? ''); }
  update(part: string, value: string): void {
    const key = this.targetKey(part), field = this.global.getFieldConfig(this.scope,key);
    if (!key) return;
    this.record[field?.dbColumn || key] = value; this.record[field?.key || key] = value;
    this.selectionChange.emit();
  }
  get summary(): string { return ['prefix','address','number','zip','city','province','country'].map(part => this.read(part)).filter(Boolean).join(', '); }
  choose(value: string): void { this.record['billingAddressSource'] = value; this.global.applyBillingAddressChoice(this.scope,this.record); this.selectionChange.emit(); }
}
