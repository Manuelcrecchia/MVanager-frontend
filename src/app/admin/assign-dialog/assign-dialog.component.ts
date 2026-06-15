import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';

@Component({
  selector: 'app-assign-dialog',
  templateUrl: './assign-dialog.component.html',
  styleUrl: './assign-dialog.component.css'
})
export class AssignDialogComponent implements OnInit {
  employees: any[] = [];
  selectedEmployees: number[] = [];
  selectedCapisquadra: number[] = [];
  capisquadraNotes: { [employeeId: number]: string } = {};
  busyIds: number[] = [];
  forceConfirmed = false;

  // employeeId → info permesso/ferie per la data del turno
  leaveMap: Map<number, { label: string; isFullDay: boolean }> = new Map();

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private dialogRef: MatDialogRef<AssignDialogComponent>,
    private http: HttpClient,
    private globalService: GlobalService
  ) {}

  ngOnInit(): void {
    this.selectedEmployees = [...(this.data.assigned || [])];
    this.selectedCapisquadra = [...(this.data.capisquadra || [])];
    this.capisquadraNotes = { ...(this.data.capisquadraNotes || {}) };

    if (this.data.busyDetails) {
      this.busyIds = this.data.busyDetails.map((c: any) => c.employeeId);
    }

    this.http.get<any[]>(this.globalService.url + 'employees/getAll').subscribe(res => {
      this.employees = res.sort((a, b) => {
        const nameA = (a.nome + ' ' + a.cognome).toLowerCase();
        const nameB = (b.nome + ' ' + b.cognome).toLowerCase();
        return nameA.localeCompare(nameB, 'it');
      });
    });

    if (this.data.selectedDate) {
      this.loadLeaves(this.data.selectedDate);
    }
  }

  private loadLeaves(date: string): void {
    this.http.get<any[]>(this.globalService.url + `permission/byDate?date=${date}`).subscribe({
      next: (leaves) => {
        this.leaveMap.clear();
        const shiftStart = this.data.startDate ? new Date(this.data.startDate).getTime() : null;
        const shiftEnd = shiftStart && this.data.duration
          ? shiftStart + this.data.duration * 60000
          : null;

        for (const leave of leaves) {
          const empId = leave.employeeId;
          const isParziale = leave.tipoPermesso === 'parziale';

          if (!isParziale) {
            // Giornaliero o settimanale → blocca sempre
            const categoria = leave.categoria || 'Permesso';
            this.leaveMap.set(empId, {
              label: categoria,
              isFullDay: true,
            });
          } else {
            // Parziale → usa le ore modificate se presenti, altrimenti le originali
            const oraInizio = leave.oraInizioModificata || leave.oraInizio;
            const oraFine = leave.oraFineModificata || leave.oraFine;
            const label = `Permesso ${oraInizio}–${oraFine}`;

            // Controlla sovrapposizione con l'orario del turno
            let isFullDay = false;
            if (shiftStart && shiftEnd && oraInizio && oraFine) {
              const dateStr = date; // YYYY-MM-DD
              const leaveStartMs = new Date(`${dateStr}T${oraInizio}`).getTime();
              const leaveEndMs = new Date(`${dateStr}T${oraFine}`).getTime();
              isFullDay = shiftStart < leaveEndMs && shiftEnd > leaveStartMs;
            }

            this.leaveMap.set(empId, { label, isFullDay });
          }
        }
      },
      error: () => { /* ignora errori di rete, non blocca il flusso */ }
    });
  }

  getLeaveLabel(empId: number): string {
    return this.leaveMap.get(empId)?.label || '';
  }

  isOnLeave(empId: number): boolean {
    return this.leaveMap.get(empId)?.isFullDay === true;
  }

  isBusy(empId: number): boolean {
    return this.busyIds.includes(empId);
  }

  onSave(): void {
    // Controllo 1: numero minimo
    if (this.selectedEmployees.length < (this.data.requiredEmployees || 1)) {
      const proceed = confirm(
        `⚠️ Devi assegnare almeno ${this.data.requiredEmployees || 1} dipendenti.\n\nVuoi salvare lo stesso?`
      );
      if (!proceed) return;
    }

    // Controllo 2: conflitti turni
    const conflicts = this.selectedEmployees
      .map(id => this.data.busyDetails.find((c: any) => c.employeeId === id))
      .filter(Boolean);
    if (conflicts.length > 0) {
      let msg = "⚠️ Alcuni dipendenti sono già occupati:\n\n";
      for (const c of conflicts) {
        const emp = this.employees.find(e => e.id === c.employeeId);
        const empName = emp ? `${emp.nome} ${emp.cognome}` : `ID ${c.employeeId}`;
        const hours = `${c.start} (durata ${Math.round(c.duration / 60)}h)`;
        msg += `• ${empName} è occupato su "${c.title}" alle ${hours}\n`;
      }
      msg += "\nVuoi salvare comunque?";
      const proceed = confirm(msg);
      if (!proceed) return;
    }

    this.forceConfirmed = true;
    const result = {
      employees: this.selectedEmployees,
      capisquadra: this.selectedCapisquadra,
      capisquadraNotesMap: this.capisquadraNotes,
      forceConfirmed: this.forceConfirmed
    };
    console.log('[assign-dialog] Closing with:', result);
    this.dialogRef.close(result);
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  getEmployeeName(empId: number): string {
    const emp = this.employees.find(e => e.id === empId);
    return emp ? `${emp.nome} ${emp.cognome}` : '';
  }
}
