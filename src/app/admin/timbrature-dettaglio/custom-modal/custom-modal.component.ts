import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReliableTapDirective } from '../../../shared/reliable-tap.directive';

@Component({
  selector: 'app-custom-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ReliableTapDirective],
  templateUrl: './custom-modal.component.html',
})
export class CustomModalComponent {
  @Input() title = '';
  @Input() message = '';
  @Input() fields: { label: string; type?: string; value?: string }[] = [];
  @Output() confirm = new EventEmitter<any>();
  @Output() cancel = new EventEmitter<void>();

  values: any = {};

  ngOnInit() {
    this.fields.forEach((f) => (this.values[f.label] = f.value || ''));
  }

  onConfirm() {
    this.confirm.emit(this.values);
  }

  onCancel() {
    this.cancel.emit();
  }
}
