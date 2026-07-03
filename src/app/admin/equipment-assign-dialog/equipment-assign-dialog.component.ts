import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';

interface EquipmentTarget {
  id: string;
  targetKey: string;
  targetLabel: string;
  quantity?: number;
}

interface EquipmentAssignment {
  targetKey: string;
  quantity: number;
}

@Component({
  selector: 'app-equipment-assign-dialog',
  templateUrl: './equipment-assign-dialog.component.html',
  styleUrls: ['./equipment-assign-dialog.component.css'],
})
export class EquipmentAssignDialogComponent implements OnInit {
  equipment: EquipmentTarget[] = [];
  selectedEquipmentKeys: string[] = [];
  selectedQuantities: { [targetKey: string]: number } = {};
  loading = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private dialogRef: MatDialogRef<EquipmentAssignDialogComponent>,
    private http: HttpClient,
    public globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    const assignments = this.normalizeAssignments(
      this.data?.assignedEquipmentAssignments || this.data?.assignedEquipmentKeys,
    );
    this.selectedEquipmentKeys = assignments.map((item) => item.targetKey);
    this.selectedQuantities = assignments.reduce((acc, item) => {
      acc[item.targetKey] = item.quantity;
      return acc;
    }, {} as { [targetKey: string]: number });
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
          for (const item of this.equipment) {
            const key = String(item.targetKey || '').trim();
            if (!key || !this.selectedQuantities[key]) continue;
            this.selectedQuantities[key] = Math.min(
              this.getMaxQuantity(item),
              Math.max(1, this.selectedQuantities[key]),
            );
          }
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
      delete this.selectedQuantities[normalized];
    } else {
      this.selectedEquipmentKeys.push(normalized);
      this.selectedQuantities[normalized] = 1;
    }
  }

  getMaxQuantity(item: EquipmentTarget): number {
    const quantity = Number(item?.quantity || 1);
    return Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1;
  }

  getAssignedQuantity(key: string): number {
    const quantity = Number(this.selectedQuantities[key] || 1);
    return Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1;
  }

  setAssignedQuantity(item: EquipmentTarget, value: any): void {
    const key = String(item?.targetKey || '').trim();
    if (!key) return;
    const parsed = Math.floor(Number(value || 1));
    const max = this.getMaxQuantity(item);
    const quantity = Math.min(max, Math.max(1, Number.isFinite(parsed) ? parsed : 1));
    this.selectedQuantities[key] = quantity;
    if (!this.isSelected(key)) {
      this.selectedEquipmentKeys.push(key);
    }
  }

  clearSelection(): void {
    this.selectedEquipmentKeys = [];
    this.selectedQuantities = {};
  }

  save(): void {
    const equipmentAssignments = this.selectedEquipmentKeys.map((targetKey) => ({
      targetKey,
      quantity: this.getAssignedQuantity(targetKey),
    }));
    this.dialogRef.close({
      equipmentKeys: equipmentAssignments,
      equipmentAssignments,
    });
  }

  cancel(): void {
    this.dialogRef.close(null);
  }

  private normalizeAssignments(value: any): EquipmentAssignment[] {
    const rawItems = Array.isArray(value) ? value : [];
    const byTarget = new Map<string, number>();

    for (const item of rawItems) {
      const targetKey = item && typeof item === 'object'
        ? String(item.targetKey || item.id || '').trim()
        : String(item || '').trim();
      if (!targetKey) continue;
      const rawQuantity = item && typeof item === 'object'
        ? item.quantity ?? item.assignedQuantity
        : 1;
      const quantity = Math.max(1, Math.floor(Number(rawQuantity || 1)) || 1);
      byTarget.set(targetKey, (byTarget.get(targetKey) || 0) + quantity);
    }

    return [...byTarget.entries()].map(([targetKey, quantity]) => ({ targetKey, quantity }));
  }
}
