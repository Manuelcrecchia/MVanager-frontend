import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AgendaNavigationPreferences, AgendaNavigator, AgendaWidgetService } from '../../service/agenda-widget.service';

@Component({
  selector: 'app-agenda-navigator-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './agenda-navigator-dialog.component.html',
  styleUrls: ['./agenda-navigator-dialog.component.css'],
})
export class AgendaNavigatorDialogComponent {
  choice: AgendaNavigator | '' = '';
  saving = false;
  error = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) public navigation: AgendaNavigationPreferences,
    private widget: AgendaWidgetService,
    private dialog: MatDialogRef<AgendaNavigatorDialogComponent>,
  ) {}

  async save(): Promise<void> {
    if (!this.choice || this.saving) return;
    this.saving = true;
    this.error = '';
    try {
      const result = await this.widget.setNavigator(this.choice);
      if (result.selected !== this.choice) throw new Error('Navigator not saved');
      this.dialog.close(true);
    } catch {
      this.error = 'Impossibile salvare la scelta. Verifica che il navigatore sia installato e riprova.';
      try {
        this.navigation = await this.widget.getNavigationPreferences();
        if (!this.navigation.available.some(item => item.id === this.choice)) this.choice = '';
      } catch { /* Keep the current options available for retry. */ }
    } finally {
      this.saving = false;
    }
  }

  later(): void { if (!this.saving) this.dialog.close(false); }
}
