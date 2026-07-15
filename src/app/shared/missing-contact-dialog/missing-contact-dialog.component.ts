import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface MissingContactDialogData {
  message: string;
  actionLabel: string;
  closeLabel?: string;
}

@Component({
  selector: 'app-missing-contact-dialog',
  templateUrl: './missing-contact-dialog.component.html',
  styleUrls: ['./missing-contact-dialog.component.css'],
})
export class MissingContactDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: MissingContactDialogData,
    private dialogRef: MatDialogRef<MissingContactDialogComponent>,
  ) {}

  close(): void {
    this.dialogRef.close(false);
  }

  goToAction(): void {
    this.dialogRef.close(true);
  }
}
