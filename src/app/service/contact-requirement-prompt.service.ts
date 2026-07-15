import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { map, Observable } from 'rxjs';
import {
  MissingContactDialogComponent,
  MissingContactDialogData,
} from '../shared/missing-contact-dialog/missing-contact-dialog.component';

type ContactKind = 'email' | 'phone';
type ContactEntity = 'employee' | 'candidate';

@Injectable({
  providedIn: 'root',
})
export class ContactRequirementPromptService {
  constructor(
    private dialog: MatDialog,
    private router: Router,
  ) {}

  openEmployeeEmailMissing(): Observable<boolean> {
    return this.openMissingContact('employee', 'email', 'Vai a impostazioni dipendenti');
  }

  openEmployeePhoneMissing(): Observable<boolean> {
    return this.openMissingContact('employee', 'phone', 'Vai a impostazioni dipendenti');
  }

  openCandidateEmailMissing(actionLabel = 'Modifica candidato'): Observable<boolean> {
    return this.openMissingContact('candidate', 'email', actionLabel);
  }

  openCandidatePhoneMissing(actionLabel = 'Modifica candidato'): Observable<boolean> {
    return this.openMissingContact('candidate', 'phone', actionLabel);
  }

  promptEmployeeEmailMissing(): void {
    this.openEmployeeEmailMissing().subscribe((goToSettings) => {
      if (goToSettings) this.goToEmployeeSettings();
    });
  }

  promptEmployeePhoneMissing(): void {
    this.openEmployeePhoneMissing().subscribe((goToSettings) => {
      if (goToSettings) this.goToEmployeeSettings();
    });
  }

  goToEmployeeSettings(): void {
    this.router.navigate(['/homeAdmin/settingsemployees']);
  }

  private openMissingContact(
    entity: ContactEntity,
    contact: ContactKind,
    actionLabel: string,
  ): Observable<boolean> {
    const data: MissingContactDialogData = {
      message: this.messageFor(entity, contact),
      actionLabel,
      closeLabel: 'Chiudi',
    };
    return this.dialog
      .open(MissingContactDialogComponent, {
        width: 'min(440px, calc(100vw - 32px))',
        maxWidth: 'calc(100vw - 32px)',
        autoFocus: false,
        restoreFocus: false,
        data,
      })
      .afterClosed()
      .pipe(map((value) => value === true));
  }

  private messageFor(entity: ContactEntity, contact: ContactKind): string {
    const subject = entity === 'employee' ? 'dipendente' : 'candidato';
    if (contact === 'email') {
      return `Nessuna mail presente per il ${subject}, vuoi aggiungerla?`;
    }
    return `Nessun cellulare presente per il ${subject}, vuoi aggiungerlo?`;
  }
}
