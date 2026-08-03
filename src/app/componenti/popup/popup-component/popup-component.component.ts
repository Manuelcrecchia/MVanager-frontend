import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AppDialogData } from '../popup-service.service';

@Component({
  selector: 'app-popup-component',
  templateUrl: './popup-component.component.html',
  styleUrl: './popup-component.component.css'
})
export class PopupComponentComponent {
  inputValue = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: AppDialogData,
    private readonly dialogRef: MatDialogRef<PopupComponentComponent>,
  ) {
    this.inputValue = data.inputValue || '';
  }

  get text(): string {
    return this.data.message;
  }

  get title(): string {
    return this.data.title;
  }

  get type(): string {
    return this.data.type;
  }

  get messageLines(): string[] {
    return this.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => !!line);
  }

  get headline(): string {
    return this.messageLines[0] || '';
  }

  get detailLines(): string[] {
    return this.messageLines.slice(1);
  }

  cancel(): void {
    this.dialogRef.close(this.data.mode === 'alert' ? true : null);
  }

  confirm(): void {
    this.dialogRef.close(this.data.mode === 'prompt' ? this.inputValue : this.data.mode === 'choice' ? 'primary' : this.data.mode === 'evidence' ? 'save' : true);
  }

  chooseSecondary(): void {
    this.dialogRef.close(this.data.mode === 'evidence' ? 'print' : 'secondary');
  }
}
