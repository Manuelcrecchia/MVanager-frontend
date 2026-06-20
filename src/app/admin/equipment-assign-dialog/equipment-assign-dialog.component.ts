import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';

interface EquipmentTarget {
  id: string;
  targetKey: string;
  targetLabel: string;
}

@Component({
  selector: 'app-equipment-assign-dialog',
  templateUrl: './equipment-assign-dialog.component.html',
  styleUrls: ['./equipment-assign-dialog.component.css'],
})
export class EquipmentAssignDialogComponent implements OnInit {
  equipment: EquipmentTarget[] = [];
  selectedEquipmentKeys: string[] = [];
  loading = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private dialogRef: MatDialogRef<EquipmentAssignDialogComponent>,
    private http: HttpClient,
    public globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    const keys = this.data?.assignedEquipmentKeys;
    this.selectedEquipmentKeys = Array.isArray(keys)
      ? keys.map((key) => String(key || '').trim()).filter(Boolean)
      : [];
    this.loadEquipment();
  }

  loadEquipment(): void {
    this.loading = true;
    this.http
      .get<EquipmentTarget[]>(this.globalService.url + 'admin/deadlines/equipment/targets')
      .subscribe({
        next: (res) => {
          this.equipment = (res || []).sort((a, b) =>
            String(a.targetLabel || '').localeCompare(String(b.targetLabel || ''), 'it'),
          );
          this.loading = false;
        },
        error: (err) => {
          console.error('Errore loadEquipment:', err);
          alert('Errore nel caricamento delle attrezzature');
          this.loading = false;
        },
      });
  }

  isSelected(key: string): boolean {
    return this.selectedEquipmentKeys.includes(key);
  }

  toggleEquipment(key: string): void {
    const normalized = String(key || '').trim();
    if (!normalized) return;
    const idx = this.selectedEquipmentKeys.indexOf(normalized);
    if (idx >= 0) {
      this.selectedEquipmentKeys.splice(idx, 1);
    } else {
      this.selectedEquipmentKeys.push(normalized);
    }
  }

  clearSelection(): void {
    this.selectedEquipmentKeys = [];
  }

  save(): void {
    this.dialogRef.close({ equipmentKeys: this.selectedEquipmentKeys });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
