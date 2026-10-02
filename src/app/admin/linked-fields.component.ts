import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { TenantFieldMappingFieldConfig as Field } from '../service/global.service';
import { changeLinkedValues, linkedFieldValues } from './mapped-field-layout';

@Component({
  selector: 'app-linked-fields', standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatAutocompleteModule],
  template: `
    <div class="linked-record" *ngFor="let record of records; let rowIndex = index; trackBy: trackIndex">
      <div class="linked-heading">Riga {{ rowIndex + 1 }}</div>
      <div class="linked-columns">
        <div class="linked-cell" *ngFor="let field of fields; let fieldIndex = index; trackBy: trackField">
          <ng-container *ngIf="!readOnly; else displayValue">
            <mat-form-field appearance="fill">
              <mat-label>{{ field.label || field.key }}</mat-label>
              <mat-select *ngIf="!allowCustom && options(field).length; else textEntry"
                [ngModel]="record[fieldIndex]" [ngModelOptions]="{standalone: true}"
                (ngModelChange)="change('update', rowIndex, fieldIndex, $event)">
                <mat-option value="">Seleziona</mat-option>
                <mat-option *ngFor="let option of options(field)" [value]="option">{{ option }}</mat-option>
              </mat-select>
              <ng-template #textEntry>
                <input matInput [ngModel]="record[fieldIndex]" [ngModelOptions]="{standalone: true}"
                  [matAutocomplete]="suggestions" [attr.aria-label]="(field.label || field.key) + ' riga ' + (rowIndex + 1)"
                  (ngModelChange)="change('update', rowIndex, fieldIndex, $event)" />
                <mat-autocomplete #suggestions="matAutocomplete">
                  <mat-option *ngFor="let option of options(field)" [value]="option">{{ option }}</mat-option>
                </mat-autocomplete>
              </ng-template>
              <mat-hint class="linked-error" *ngIf="error(field)">{{ error(field) }}</mat-hint>
            </mat-form-field>
          </ng-container>
          <ng-template #displayValue>
            <strong>{{ field.label || field.key }}</strong>
            <div>{{ record[fieldIndex] || '—' }}</div>
          </ng-template>
        </div>
      </div>
      <button *ngIf="!readOnly" mat-button color="warn" type="button" (click)="change('remove', rowIndex)"
        [attr.aria-label]="'Rimuovi riga ' + (rowIndex + 1)">Rimuovi riga</button>
    </div>
    <p *ngIf="!records.length">Nessuna riga aggiunta.</p>
    <button *ngIf="!readOnly" mat-raised-button color="primary" type="button" (click)="change('add')">Aggiungi riga</button>
  `,
  styles: [`
    :host { display: block; width: 100%; min-width: 0; }
    .linked-record { padding: 16px; margin-bottom: 14px; border: 1px solid #d8e1ed; border-radius: 12px; }
    .linked-heading { font-weight: 600; margin-bottom: 12px; }
    .linked-columns { display: flex; flex-wrap: wrap; gap: 14px; }
    .linked-cell { flex: 1 1 220px; min-width: 0; overflow-wrap: anywhere; }
    mat-form-field { width: 100%; }
    .linked-error { color: #b42318; }
    @media (max-width: 700px) { .linked-cell { flex-basis: 100%; } }
  `],
})
export class LinkedFieldsComponent {
  @Input() fields: Field[] = [];
  @Input() readRows: (field: Field) => string[] = () => [];
  @Input() options: (field: Field) => string[] = () => [];
  @Input() error: (field: Field) => string = () => '';
  @Input() allowCustom = true;
  @Input() readOnly = false;
  @Output() rowsChange = new EventEmitter<{field: Field; values: string[]}[]>();
  get records(): string[][] {
    const lists = linkedFieldValues(this.fields, this.readRows);
    return Array.from({length: lists[0]?.length || 0}, (_, index) => lists.map(list => list[index]));
  }
  change(action: 'add' | 'remove' | 'update', index = 0, fieldIndex = 0, value = ''): void {
    const lists = changeLinkedValues(this.fields, this.readRows, action, index, fieldIndex, value);
    this.rowsChange.emit(this.fields.map((field, i) => ({field, values: lists[i]})));
  }
  trackIndex(index: number): number { return index; }
  trackField(_index: number, field: Field): string { return field.dbColumn || field.key; }
}
