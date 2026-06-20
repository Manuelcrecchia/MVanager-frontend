import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';

type SettingsMode = 'vehicle' | 'equipment';

interface Vehicle {
  id: number;
  name: string;
  plate?: string | null;
}

interface EquipmentTarget {
  id: string;
  targetKey: string;
  targetLabel: string;
}

interface ResourceCertification {
  id?: number;
  title: string;
  description?: string;
  remindDays?: number;
  folder?: string;
}

interface ResourceCategory {
  id?: number;
  resourceType?: 'vehicle' | 'equipment';
  name: string;
  description?: string;
  certifications: ResourceCertification[];
}

@Component({
  selector: 'app-vehicles-settings',
  templateUrl: './vehicles-settings.component.html',
  styleUrls: ['./vehicles-settings.component.css'],
})
export class VehiclesSettingsComponent implements OnInit {
  mode: SettingsMode = 'vehicle';
  vehicles: Vehicle[] = [];
  loading = false;
  vehicleSearch = '';
  vehicleCategories: ResourceCategory[] = [];
  categorySearch = '';
  categoryDraft: ResourceCategory = this.emptyCategoryDraft();
  editingCategoryId: number | null = null;
  vehicleCategoryAssignments: Record<number, number[]> = {};
  selectedVehicleForCategories: Vehicle | null = null;
  selectedVehicleCategoryIds: number[] = [];
  equipmentTargets: EquipmentTarget[] = [];
  equipmentSearch = '';
  equipmentCategories: ResourceCategory[] = [];
  equipmentCategorySearch = '';
  equipmentCategoryDraft: ResourceCategory = this.emptyEquipmentCategoryDraft();
  editingEquipmentCategoryId: number | null = null;
  equipmentCategoryAssignments: Record<string, number[]> = {};
  selectedEquipmentForCategories: EquipmentTarget | null = null;
  selectedEquipmentCategoryIds: number[] = [];

  addForm: { name: string; plate: string } = { name: '', plate: '' };

  editingId: number | null = null;
  editForm: { name: string; plate: string } = { name: '', plate: '' };

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    public globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.route.data.subscribe((data) => {
      this.mode = data['mode'] === 'equipment' ? 'equipment' : 'vehicle';
      this.selectedVehicleForCategories = null;
      this.selectedEquipmentForCategories = null;

      if (this.isVehicleMode) {
        this.loadVehicles();
        this.loadVehicleCategories();
        this.loadVehicleCategoryAssignments();
      }

      if (this.isEquipmentMode) {
        this.loadEquipmentTargets();
        this.loadEquipmentCategories();
        this.loadEquipmentCategoryAssignments();
      }
    });
  }

  get isVehicleMode(): boolean {
    return this.mode === 'vehicle';
  }

  get isEquipmentMode(): boolean {
    return this.mode === 'equipment';
  }

  get pageTitle(): string {
    return this.isEquipmentMode ? 'Gestione attrezzature' : 'Gestione mezzi';
  }

  get filteredVehicles(): Vehicle[] {
    const query = this.normalizeSearch(this.vehicleSearch);
    if (!query) return this.vehicles;

    return this.vehicles.filter((vehicle) =>
      this.normalizeSearch([vehicle.name, vehicle.plate].join(' ')).includes(query),
    );
  }

  get filteredVehicleCategories(): ResourceCategory[] {
    const query = this.normalizeSearch(this.categorySearch);
    if (!query) return this.vehicleCategories;

    return this.vehicleCategories.filter((category) =>
      this.normalizeSearch([
        category.name,
        category.description,
        ...(category.certifications || []).map((cert) => cert.title),
      ].join(' ')).includes(query),
    );
  }

  get filteredEquipmentTargets(): EquipmentTarget[] {
    const query = this.normalizeSearch(this.equipmentSearch);
    if (!query) return this.equipmentTargets;

    return this.equipmentTargets.filter((target) =>
      this.normalizeSearch([target.targetLabel, target.targetKey].join(' ')).includes(query),
    );
  }

  get filteredEquipmentCategories(): ResourceCategory[] {
    const query = this.normalizeSearch(this.equipmentCategorySearch);
    if (!query) return this.equipmentCategories;

    return this.equipmentCategories.filter((category) =>
      this.normalizeSearch([
        category.name,
        category.description,
        ...(category.certifications || []).map((cert) => cert.title),
      ].join(' ')).includes(query),
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

  loadVehicleCategories() {
    this.http
      .get<ResourceCategory[]>(this.globalService.url + 'admin/resource-categories/vehicle')
      .subscribe({
        next: (res) => {
          this.vehicleCategories = (res || []).map((category: any) => ({
            ...category,
            certifications: Array.isArray(category.certifications) ? category.certifications : [],
          }));
        },
        error: (err) => {
          console.error('Errore categorie mezzo:', err);
        },
      });
  }

  loadVehicleCategoryAssignments() {
    this.http
      .get<any[]>(this.globalService.url + 'admin/resource-categories/vehicle/assignments')
      .subscribe({
        next: (res) => {
          const map: Record<number, number[]> = {};
          (res || []).forEach((row: any) => {
            const vehicleId = Number(row.resourceId);
            const categoryId = Number(row.categoryId);
            if (!vehicleId || !categoryId) return;
            if (!map[vehicleId]) map[vehicleId] = [];
            map[vehicleId].push(categoryId);
          });
          this.vehicleCategoryAssignments = map;
        },
        error: (err) => {
          console.error('Errore assegnazioni categorie mezzo:', err);
        },
      });
  }

  loadEquipmentTargets(): void {
    this.http
      .get<EquipmentTarget[]>(this.globalService.url + 'admin/deadlines/equipment/targets')
      .subscribe({
        next: (res) => {
          this.equipmentTargets = (res || []).sort((a, b) =>
            String(a.targetLabel || '').localeCompare(String(b.targetLabel || ''), 'it'),
          );
        },
        error: (err) => {
          console.error('Errore attrezzature:', err);
          this.equipmentTargets = [];
        },
      });
  }

  loadEquipmentCategories(): void {
    this.http
      .get<ResourceCategory[]>(this.globalService.url + 'admin/resource-categories/equipment')
      .subscribe({
        next: (res) => {
          this.equipmentCategories = (res || []).map((category: any) => ({
            ...category,
            certifications: Array.isArray(category.certifications) ? category.certifications : [],
          }));
        },
        error: (err) => {
          console.error('Errore categorie attrezzatura:', err);
        },
      });
  }

  loadEquipmentCategoryAssignments(): void {
    this.http
      .get<any[]>(this.globalService.url + 'admin/resource-categories/equipment/assignments')
      .subscribe({
        next: (res) => {
          const map: Record<string, number[]> = {};
          (res || []).forEach((row: any) => {
            const targetKey = String(row.targetKey || '').trim();
            const categoryId = Number(row.categoryId);
            if (!targetKey || !categoryId) return;
            if (!map[targetKey]) map[targetKey] = [];
            map[targetKey].push(categoryId);
          });
          this.equipmentCategoryAssignments = map;
        },
        error: (err) => {
          console.error('Errore assegnazioni categorie attrezzatura:', err);
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

  addCategoryCertification(): void {
    this.categoryDraft.certifications.push({
      title: '',
      folder: 'Certificazioni mezzo',
      remindDays: 30,
      description: '',
    });
  }

  removeCategoryCertification(index: number): void {
    this.categoryDraft.certifications = this.categoryDraft.certifications.filter((_, i) => i !== index);
  }

  resetCategoryDraft(): void {
    this.editingCategoryId = null;
    this.categoryDraft = this.emptyCategoryDraft();
  }

  editCategory(category: ResourceCategory): void {
    this.editingCategoryId = category.id || null;
    this.categoryDraft = {
      id: category.id,
      name: category.name,
      description: category.description || '',
      certifications: (category.certifications || []).map((cert) => ({
        id: cert.id,
        title: cert.title,
        description: cert.description || '',
        remindDays: cert.remindDays ?? 30,
        folder: cert.folder || `Certificazioni ${category.name}`,
      })),
    };
    if (!this.categoryDraft.certifications.length) this.addCategoryCertification();
  }

  saveCategory(): void {
    const name = this.categoryDraft.name.trim();
    if (!name) {
      alert('Inserisci il nome categoria mezzo');
      return;
    }

    const certifications = (this.categoryDraft.certifications || [])
      .map((cert) => ({
        id: cert.id,
        title: String(cert.title || '').trim(),
        description: String(cert.description || '').trim(),
        remindDays: cert.remindDays ?? 30,
        folder: String(cert.folder || '').trim() || `Certificazioni ${name}`,
      }))
      .filter((cert) => cert.title);

    this.http
      .post(this.globalService.url + 'admin/resource-categories/vehicle/save', {
        id: this.editingCategoryId,
        name,
        description: this.categoryDraft.description || '',
        certifications,
      })
      .subscribe({
        next: () => {
          this.resetCategoryDraft();
          this.loadVehicleCategories();
        },
        error: (err) => {
          console.error('Errore salvataggio categoria mezzo:', err);
          alert(this.parseServerError(err, 'Errore salvataggio categoria mezzo'));
        },
      });
  }

  deleteCategory(category: ResourceCategory): void {
    if (!category.id) return;
    const ok = confirm(`Eliminare la categoria mezzo "${category.name}"?`);
    if (!ok) return;

    this.http
      .post(this.globalService.url + 'admin/resource-categories/vehicle/delete', { id: category.id })
      .subscribe({
        next: () => {
          this.loadVehicleCategories();
          this.loadVehicleCategoryAssignments();
          if (this.editingCategoryId === category.id) this.resetCategoryDraft();
        },
        error: (err) => {
          console.error('Errore eliminazione categoria mezzo:', err);
          alert(this.parseServerError(err, 'Errore eliminazione categoria mezzo'));
        },
      });
  }

  openVehicleCategories(vehicle: Vehicle): void {
    this.selectedVehicleForCategories = vehicle;
    this.selectedVehicleCategoryIds = [];
    this.http
      .get<number[]>(this.globalService.url + `admin/resource-categories/vehicle/assignment/${vehicle.id}`)
      .subscribe({
        next: (ids) => {
          this.selectedVehicleCategoryIds = Array.isArray(ids) ? ids.map(Number) : [];
        },
        error: (err) => {
          console.error('Errore categorie mezzo:', err);
          alert(this.parseServerError(err, 'Errore caricamento categorie mezzo'));
        },
      });
  }

  closeVehicleCategories(): void {
    this.selectedVehicleForCategories = null;
    this.selectedVehicleCategoryIds = [];
  }

  toggleVehicleCategory(categoryId: number | undefined, checked: boolean): void {
    if (!categoryId) return;
    if (checked && !this.selectedVehicleCategoryIds.includes(categoryId)) {
      this.selectedVehicleCategoryIds.push(categoryId);
    }
    if (!checked) {
      this.selectedVehicleCategoryIds = this.selectedVehicleCategoryIds.filter((id) => id !== categoryId);
    }
  }

  saveVehicleCategories(): void {
    if (!this.selectedVehicleForCategories) return;
    this.http
      .post(
        this.globalService.url + `admin/resource-categories/vehicle/assignment/${this.selectedVehicleForCategories.id}`,
        { categoryIds: this.selectedVehicleCategoryIds },
      )
      .subscribe({
        next: (res: any) => {
          const created = Number(res?.createdDeadlines || 0);
          alert(
            created > 0
              ? `Categorie salvate. Create ${created} scadenze obbligatorie vuote.`
              : 'Categorie mezzo salvate.',
          );
          this.closeVehicleCategories();
          this.loadVehicleCategoryAssignments();
        },
        error: (err) => {
          console.error('Errore salvataggio categorie mezzo:', err);
          alert(this.parseServerError(err, 'Errore salvataggio categorie mezzo'));
        },
      });
  }

  getVehicleCategoryNames(vehicle: Vehicle): string[] {
    const ids = this.vehicleCategoryAssignments[vehicle.id] || [];
    if (!ids.length) return [];
    return ids
      .map((id) => this.vehicleCategories.find((category) => Number(category.id) === Number(id))?.name)
      .filter((name): name is string => !!name);
  }

  addEquipmentCategoryCertification(): void {
    this.equipmentCategoryDraft.certifications.push({
      title: '',
      folder: 'Certificazioni attrezzatura',
      remindDays: 30,
      description: '',
    });
  }

  removeEquipmentCategoryCertification(index: number): void {
    this.equipmentCategoryDraft.certifications = this.equipmentCategoryDraft.certifications.filter((_, i) => i !== index);
  }

  resetEquipmentCategoryDraft(): void {
    this.editingEquipmentCategoryId = null;
    this.equipmentCategoryDraft = this.emptyEquipmentCategoryDraft();
  }

  editEquipmentCategory(category: ResourceCategory): void {
    this.editingEquipmentCategoryId = category.id || null;
    this.equipmentCategoryDraft = {
      id: category.id,
      name: category.name,
      description: category.description || '',
      certifications: (category.certifications || []).map((cert) => ({
        id: cert.id,
        title: cert.title,
        description: cert.description || '',
        remindDays: cert.remindDays ?? 30,
        folder: cert.folder || `Certificazioni ${category.name}`,
      })),
    };
    if (!this.equipmentCategoryDraft.certifications.length) this.addEquipmentCategoryCertification();
  }

  saveEquipmentCategory(): void {
    const name = this.equipmentCategoryDraft.name.trim();
    if (!name) {
      alert('Inserisci il nome categoria attrezzatura');
      return;
    }

    const certifications = (this.equipmentCategoryDraft.certifications || [])
      .map((cert) => ({
        id: cert.id,
        title: String(cert.title || '').trim(),
        description: String(cert.description || '').trim(),
        remindDays: cert.remindDays ?? 30,
        folder: String(cert.folder || '').trim() || `Certificazioni ${name}`,
      }))
      .filter((cert) => cert.title);

    this.http
      .post(this.globalService.url + 'admin/resource-categories/equipment/save', {
        id: this.editingEquipmentCategoryId,
        name,
        description: this.equipmentCategoryDraft.description || '',
        certifications,
      })
      .subscribe({
        next: () => {
          this.resetEquipmentCategoryDraft();
          this.loadEquipmentCategories();
        },
        error: (err) => {
          console.error('Errore salvataggio categoria attrezzatura:', err);
          alert(this.parseServerError(err, 'Errore salvataggio categoria attrezzatura'));
        },
      });
  }

  deleteEquipmentCategory(category: ResourceCategory): void {
    if (!category.id) return;
    const ok = confirm(`Eliminare la categoria attrezzatura "${category.name}"?`);
    if (!ok) return;

    this.http
      .post(this.globalService.url + 'admin/resource-categories/equipment/delete', { id: category.id })
      .subscribe({
        next: () => {
          this.loadEquipmentCategories();
          this.loadEquipmentCategoryAssignments();
          if (this.editingEquipmentCategoryId === category.id) this.resetEquipmentCategoryDraft();
        },
        error: (err) => {
          console.error('Errore eliminazione categoria attrezzatura:', err);
          alert(this.parseServerError(err, 'Errore eliminazione categoria attrezzatura'));
        },
      });
  }

  openEquipmentCategories(target: EquipmentTarget): void {
    this.selectedEquipmentForCategories = target;
    this.selectedEquipmentCategoryIds = [];
    this.http
      .get<number[]>(this.globalService.url + 'admin/resource-categories/equipment/assignment-by-target', {
        params: { targetKey: target.targetKey },
      })
      .subscribe({
        next: (ids) => {
          this.selectedEquipmentCategoryIds = Array.isArray(ids) ? ids.map(Number) : [];
        },
        error: (err) => {
          console.error('Errore categorie attrezzatura:', err);
          alert(this.parseServerError(err, 'Errore caricamento categorie attrezzatura'));
        },
      });
  }

  closeEquipmentCategories(): void {
    this.selectedEquipmentForCategories = null;
    this.selectedEquipmentCategoryIds = [];
  }

  toggleEquipmentCategory(categoryId: number | undefined, checked: boolean): void {
    if (!categoryId) return;
    if (checked && !this.selectedEquipmentCategoryIds.includes(categoryId)) {
      this.selectedEquipmentCategoryIds.push(categoryId);
    }
    if (!checked) {
      this.selectedEquipmentCategoryIds = this.selectedEquipmentCategoryIds.filter((id) => id !== categoryId);
    }
  }

  saveEquipmentCategories(): void {
    if (!this.selectedEquipmentForCategories) return;
    this.http
      .post(
        this.globalService.url + 'admin/resource-categories/equipment/assignment-by-target',
        {
          targetKey: this.selectedEquipmentForCategories.targetKey,
          targetLabel: this.selectedEquipmentForCategories.targetLabel,
          categoryIds: this.selectedEquipmentCategoryIds,
        },
      )
      .subscribe({
        next: (res: any) => {
          const created = Number(res?.createdDeadlines || 0);
          alert(
            created > 0
              ? `Categorie salvate. Create ${created} scadenze obbligatorie vuote.`
              : 'Categorie attrezzatura salvate.',
          );
          this.closeEquipmentCategories();
          this.loadEquipmentCategoryAssignments();
          this.loadEquipmentTargets();
        },
        error: (err) => {
          console.error('Errore salvataggio categorie attrezzatura:', err);
          alert(this.parseServerError(err, 'Errore salvataggio categorie attrezzatura'));
        },
      });
  }

  getEquipmentCategoryNames(target: EquipmentTarget): string[] {
    const ids = this.equipmentCategoryAssignments[target.targetKey] || [];
    if (!ids.length) return [];
    return ids
      .map((id) => this.equipmentCategories.find((category) => Number(category.id) === Number(id))?.name)
      .filter((name): name is string => !!name);
  }

  private emptyCategoryDraft(): ResourceCategory {
    return {
      name: '',
      description: '',
      certifications: [
        {
          title: '',
          folder: 'Certificazioni mezzo',
          remindDays: 30,
          description: '',
        },
      ],
    };
  }

  private emptyEquipmentCategoryDraft(): ResourceCategory {
    return {
      name: '',
      description: '',
      certifications: [
        {
          title: '',
          folder: 'Certificazioni attrezzatura',
          remindDays: 30,
          description: '',
        },
      ],
    };
  }

  private parseServerError(err: any, fallback: string): string {
    return err?.error?.error || err?.error?.message || fallback;
  }

  private normalizeSearch(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }
}
