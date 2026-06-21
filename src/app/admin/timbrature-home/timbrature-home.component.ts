import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { Location } from '@angular/common';

interface WarehouseStampingLocation {
  tagId: string;
  locationId: string;
  label: string;
}

@Component({
  selector: 'app-timbrature-home',
  templateUrl: './timbrature-home.component.html',
  styleUrls: ['./timbrature-home.component.css'],
})
export class TimbratureHomeComponent implements OnInit {
  employees: any[] = [];
  selectedDate: string = '';
  loading: boolean = false;
  stampingConfig: any = {
    mode: 'customer_tag',
    warehouseLabel: 'Magazzino',
    warehouseLocations: [{ tagId: 'MAGAZZINO', locationId: '__warehouse__', label: 'Magazzino' }],
  };
  stampingSettingsForm = {
    warehouseLocations: [{ tagId: 'MAGAZZINO', locationId: '__warehouse__', label: 'Magazzino' }],
    allowCustomerTagFallback: false,
    compareWithShifts: true,
    splitWarehouseStampings: false,
  };
  settingsSaving = false;
  settingsMessage = '';
  settingsError = '';
  employeeSearch = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    public global: GlobalService,
    private location: Location
  ) {}

  ngOnInit(): void {
    const today = new Date();
    this.selectedDate = today.toISOString().split('T')[0];
    this.loadEmployees();
  }

  get filteredEmployees(): any[] {
    const query = this.normalizeSearch(this.employeeSearch);
    if (!query) return this.employees;

    return this.employees.filter((emp) => {
      const text = this.normalizeSearch([
        emp?.nome,
        emp?.cognome,
        emp?.email,
        emp?.cellulare,
        emp?.hasError ? 'errori errore anomalie' : 'ok corretto',
        emp?.errorsCount,
      ].join(' '));

      return text.includes(query);
    });
  }

  // 🔹 Carica dipendenti e controlla errori
  loadEmployees(): void {
    this.loading = true;
    this.http
      .get<any>(
        `${this.global.url}admin/stamping/employees?date=${this.selectedDate}`
      )
      .subscribe({
        next: (res) => {
          this.employees = res.employees || [];
          this.applyStampingConfig(res.stampingConfig || this.stampingConfig);
          this.loading = false;
        },
        error: (err) => {
          console.error('Errore caricamento dipendenti:', err);
          this.loading = false;
          alert('Errore durante il caricamento delle timbrature');
        },
      });
  }

  // 🔹 Naviga nel dettaglio giornaliero
  openDetail(emp: any): void {
    this.router.navigate(['/timbratureDettaglio', emp.id, this.selectedDate]);
  }

  // 🔹 Cambia giorno
  changeDate(delta: number): void {
    const current = new Date(this.selectedDate);
    current.setDate(current.getDate() + delta);
    this.selectedDate = current.toISOString().split('T')[0];
    this.loadEmployees();
  }

  back(): void {
    this.location.back();
  }

  isWarehouseMode(): boolean {
    return this.stampingConfig?.mode === 'warehouse';
  }

  canManageStampingSettings(): boolean {
    return this.global.hasPermission('STAMPING_WAREHOUSES_MANAGE');
  }

  addWarehouseLocation(): void {
    this.stampingSettingsForm.warehouseLocations.push({
      tagId: '',
      locationId: `__warehouse_${this.stampingSettingsForm.warehouseLocations.length + 1}__`,
      label: '',
    });
  }

  removeWarehouseLocation(index: number): void {
    if (this.stampingSettingsForm.warehouseLocations.length <= 1) return;
    this.stampingSettingsForm.warehouseLocations =
      this.stampingSettingsForm.warehouseLocations.filter((_, i) => i !== index);
  }

  saveStampingSettings(): void {
    this.settingsMessage = '';
    this.settingsError = '';

    const warehouseLocations = this.stampingSettingsForm.warehouseLocations
      .map((location) => ({
        tagId: String(location.tagId || '').trim(),
        locationId: String(location.locationId || '').trim(),
        label: String(location.label || '').trim(),
      }))
      .filter((location) => location.tagId || location.locationId || location.label);

    if (!warehouseLocations.length) {
      this.settingsError = 'Inserisci almeno una sede.';
      return;
    }

    const missing = warehouseLocations.find((location) =>
      !location.tagId || !location.locationId || !location.label
    );
    if (missing) {
      this.settingsError = 'Ogni sede deve avere tag NFC, ID interno ed etichetta.';
      return;
    }

    const duplicatedTag = this.hasDuplicate(warehouseLocations.map((location) => location.tagId));
    if (duplicatedTag) {
      this.settingsError = 'Ci sono tag NFC duplicati.';
      return;
    }

    const duplicatedLocation = this.hasDuplicate(warehouseLocations.map((location) => location.locationId));
    if (duplicatedLocation) {
      this.settingsError = 'Ci sono ID sede interni duplicati.';
      return;
    }

    this.settingsSaving = true;
    this.http
      .post<any>(`${this.global.url}admin/settings/stamping`, {
        warehouseLocations,
        allowCustomerTagFallback: this.stampingSettingsForm.allowCustomerTagFallback,
        compareWithShifts: this.stampingSettingsForm.compareWithShifts,
        splitWarehouseStampings: this.stampingSettingsForm.splitWarehouseStampings,
      })
      .subscribe({
        next: (res) => {
          this.settingsSaving = false;
          this.settingsMessage = res?.message || 'Impostazioni timbrature salvate.';
          if (res?.stampingConfig) {
            this.applyStampingConfig(res.stampingConfig);
          }
          this.loadEmployees();
        },
        error: (err) => {
          this.settingsSaving = false;
          this.settingsError = err?.error?.error || 'Errore durante il salvataggio.';
        },
      });
  }

  getWarehouseModeLabel(): string {
    const locations = Array.isArray(this.stampingConfig?.warehouseLocations)
      ? this.stampingConfig.warehouseLocations
      : [];
    const validLocations = locations.filter((location: any) =>
      String(location?.locationId || location?.tagId || location?.label || '').trim()
    );

    if (validLocations.length > 1) {
      return `${validLocations.length} sedi aziendali`;
    }

    return (
      validLocations[0]?.label ||
      this.stampingConfig?.warehouseLabel ||
      'Magazzino'
    );
  }

  private normalizeSearch(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  private applyStampingConfig(config: any): void {
    this.stampingConfig = config || this.stampingConfig;
    const locations = Array.isArray(this.stampingConfig?.warehouseLocations)
      ? this.stampingConfig.warehouseLocations
      : [];
    const fallback = {
      tagId: this.stampingConfig?.warehouseTagId || 'MAGAZZINO',
      locationId: this.stampingConfig?.warehouseLocationId || '__warehouse__',
      label: this.stampingConfig?.warehouseLabel || 'Magazzino',
    };
    const warehouseLocations = locations
      .map((location: any) => ({
        tagId: String(location?.tagId || '').trim(),
        locationId: String(location?.locationId || '').trim(),
        label: String(location?.label || '').trim(),
      }))
      .filter((location: WarehouseStampingLocation) =>
        location.tagId || location.locationId || location.label
      );

    this.stampingSettingsForm = {
      warehouseLocations: warehouseLocations.length ? warehouseLocations : [fallback],
      allowCustomerTagFallback: this.stampingConfig?.allowCustomerTagFallback === true,
      compareWithShifts: this.stampingConfig?.compareWithShifts !== false,
      splitWarehouseStampings: this.stampingConfig?.splitWarehouseStampings === true,
    };
  }

  private hasDuplicate(values: string[]): boolean {
    const seen = new Set<string>();
    for (const value of values) {
      const key = String(value || '').trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }
}
