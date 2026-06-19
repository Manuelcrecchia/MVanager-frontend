import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';

interface Vehicle {
  id: number;
  name: string;
  plate?: string | null;
}

@Component({
  selector: 'app-vehicles-settings',
  templateUrl: './vehicles-settings.component.html',
  styleUrls: ['./vehicles-settings.component.css'],
})
export class VehiclesSettingsComponent implements OnInit {
  vehicles: Vehicle[] = [];
  loading = false;
  vehicleSearch = '';

  addForm: { name: string; plate: string } = { name: '', plate: '' };

  editingId: number | null = null;
  editForm: { name: string; plate: string } = { name: '', plate: '' };

  constructor(
    private http: HttpClient,
    private router: Router,
    public globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.loadVehicles();
  }

  get filteredVehicles(): Vehicle[] {
    const query = this.normalizeSearch(this.vehicleSearch);
    if (!query) return this.vehicles;

    return this.vehicles.filter((vehicle) =>
      this.normalizeSearch([vehicle.name, vehicle.plate].join(' ')).includes(query),
    );
  }

  back() {
    this.router.navigateByUrl('/homeAdmin');
  }

  loadVehicles() {
    this.loading = true;
    this.http
      .get<Vehicle[]>(this.globalService.url + 'vehicles/getAll')
      .subscribe({
        next: (res) => {
          this.vehicles = (res || []).sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', 'it'),
          );
          this.loading = false;
        },
        error: (err) => {
          console.error('Errore loadVehicles:', err);
          alert('Errore nel caricamento dei mezzi');
          this.loading = false;
        },
      });
  }

  addVehicle() {
    if (!this.addForm.name || this.addForm.name.trim().length < 2) {
      alert('Inserisci un nome valido');
      return;
    }

    this.http
      .post(this.globalService.url + 'vehicles/add', {
        name: this.addForm.name,
        plate: this.addForm.plate || null,
      })
      .subscribe({
        next: () => {
          this.addForm = { name: '', plate: '' };
          this.loadVehicles();
        },
        error: (err) => {
          console.error('Errore addVehicle:', err);
          alert(err?.error?.error || 'Errore aggiunta mezzo');
        },
      });
  }

  startEdit(v: Vehicle) {
    this.editingId = v.id;
    this.editForm = { name: v.name || '', plate: (v.plate || '') as any };
  }

  cancelEdit() {
    this.editingId = null;
    this.editForm = { name: '', plate: '' };
  }

  saveEdit() {
    if (this.editingId == null) return;
    if (!this.editForm.name || this.editForm.name.trim().length < 2) {
      alert('Inserisci un nome valido');
      return;
    }

    this.http
      .post(this.globalService.url + 'vehicles/edit', {
        id: this.editingId,
        name: this.editForm.name,
        plate: this.editForm.plate || null,
      })
      .subscribe({
        next: () => {
          this.cancelEdit();
          this.loadVehicles();
        },
        error: (err) => {
          console.error('Errore saveEdit:', err);
          alert(err?.error?.error || 'Errore modifica mezzo');
        },
      });
  }

  deleteVehicle(v: Vehicle) {
    const ok = confirm(
      `Eliminare il mezzo "${v.name}"?\n\nNOTA: eventuali turni che lo usano manterranno lo storico ma il mezzo verrà rimosso dal turno.`,
    );
    if (!ok) return;

    this.http
      .post(this.globalService.url + 'vehicles/delete', { id: v.id })
      .subscribe({
        next: () => this.loadVehicles(),
        error: (err) => {
          console.error('Errore deleteVehicle:', err);
          alert(err?.error?.error || 'Errore eliminazione mezzo');
        },
      });
  }

  private normalizeSearch(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }
}
