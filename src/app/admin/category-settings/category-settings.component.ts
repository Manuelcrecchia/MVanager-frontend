import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';

type CategoryType = 'customer' | 'vehicle' | 'equipment' | 'employee' | 'internal';
interface DeadlineTemplate { id?: number; title: string; folder: string; remindDays?: number | null; description?: string; }
interface ManagedCategory { id?: number; name: string; description?: string; certifications: DeadlineTemplate[]; }

@Component({ selector: 'app-category-settings', templateUrl: './category-settings.component.html', styleUrls: ['./category-settings.component.css'] })
export class CategorySettingsComponent implements OnInit {
  selectedType: CategoryType = 'customer';
  categories: ManagedCategory[] = [];
  draft: ManagedCategory = this.emptyDraft();
  editingId: number | null = null;
  loading = false;
  saving = false;
  error = '';

  constructor(private http: HttpClient, private router: Router, public global: GlobalService) {}

  ngOnInit(): void {
    const firstAvailable = this.availableTypes[0];
    if (firstAvailable) this.selectedType = firstAvailable;
    this.load();
  }

  get canManageCustomers(): boolean { return this.global.hasPermission('CUSTOMER_DEADLINES_VIEW'); }
  get canManageEmployees(): boolean { return this.global.hasPermission('EMPLOYEE_EDIT'); }
  get canManageEquipment(): boolean { return this.global.hasPermission('EQUIPMENT_SETTINGS_MANAGE'); }
  get canManageVehicles(): boolean { return this.global.hasPermission('VEHICLE_SETTINGS_MANAGE'); }
  get canManageInternal(): boolean { return this.global.hasPermission('INTERNAL_DEADLINES_EDIT'); }
  get availableTypes(): CategoryType[] {
    return (['customer', 'vehicle', 'equipment', 'employee', 'internal'] as CategoryType[]).filter((type) => this.canManage(type));
  }
  get title(): string { return ({ customer: 'clienti', vehicle: 'mezzi', equipment: 'attrezzature', employee: 'dipendenti', internal: 'interne' })[this.selectedType]; }
  get singularTitle(): string { return ({ customer: 'cliente', vehicle: 'mezzo', equipment: 'attrezzatura', employee: 'dipendente', internal: 'interna' })[this.selectedType]; }
  get helperText(): string {
    return this.selectedType === 'customer'
      ? 'Quando assegnerai questa categoria a un cliente, verranno create le scadenze qui definite.'
      : `Quando assegnerai questa categoria a ${this.selectedType === 'employee' ? 'un dipendente' : `un ${this.singularTitle}`}, verranno create le scadenze qui definite.`;
  }
  get folderSuggestions(): string[] {
    const folders = new Map<string, string>();
    // Includi anche le righe non ancora salvate: evita duplicati già mentre si compila la categoria.
    for (const category of [...this.categories, this.draft]) {
      for (const certification of category.certifications || []) {
        const folder = String(certification.folder || '').trim();
        if (folder) folders.set(folder.toLocaleLowerCase('it'), folder);
      }
    }
    return [...folders.values()].sort((a, b) => a.localeCompare(b, 'it'));
  }
  get folderSuggestionsId(): string { return `category-folders-${this.selectedType}`; }

  private canManage(type: CategoryType): boolean {
    return ({ customer: this.canManageCustomers, vehicle: this.canManageVehicles, equipment: this.canManageEquipment, employee: this.canManageEmployees, internal: this.canManageInternal })[type];
  }
  private emptyDraft(): ManagedCategory { return { name: '', description: '', certifications: [] }; }
  private endpoint(action = ''): string {
    if (this.selectedType === 'customer') return `admin/customer-deadline-categories${action ? `/${action}` : ''}`;
    if (this.selectedType === 'employee') return `admin/employee-categories${action ? `/${action}` : ''}`;
    return `admin/resource-categories/${this.selectedType}${action ? `/${action}` : ''}`;
  }

  select(type: CategoryType): void {
    if (!this.canManage(type) || type === this.selectedType) return;
    this.selectedType = type;
    this.reset();
    this.load();
  }
  load(): void {
    if (!this.canManage(this.selectedType)) return;
    this.loading = true;
    this.http.get<ManagedCategory[]>(this.global.url + this.endpoint()).subscribe({
      next: (items) => { this.categories = Array.isArray(items) ? items.map((item) => ({ ...item, certifications: item.certifications || [] })) : []; this.loading = false; },
      error: () => { this.error = `Impossibile caricare le categorie ${this.title}.`; this.loading = false; },
    });
  }
  addDeadline(): void { this.draft.certifications.push({ title: '', folder: '', remindDays: 30, description: '' }); }
  removeDeadline(index: number): void { this.draft.certifications.splice(index, 1); }
  edit(category: ManagedCategory): void { this.editingId = Number(category.id) || null; this.draft = JSON.parse(JSON.stringify(category)); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  reset(): void { this.editingId = null; this.draft = this.emptyDraft(); this.error = ''; }
  save(): void {
    if (!this.draft.name.trim()) { this.error = 'Inserisci il nome della categoria.'; return; }
    this.saving = true; this.error = '';
    this.http.post(this.global.url + this.endpoint('save'), { ...this.draft, id: this.editingId }).subscribe({
      next: () => { this.saving = false; this.reset(); this.load(); },
      error: (err) => { this.saving = false; this.error = err?.error?.error || 'Impossibile salvare la categoria.'; },
    });
  }
  remove(category: ManagedCategory): void {
    if (!confirm(`Eliminare la categoria ${this.singularTitle} "${category.name}"?`)) return;
    this.http.post(this.global.url + this.endpoint('delete'), { id: category.id }).subscribe({ next: () => this.load(), error: () => this.error = 'Impossibile eliminare la categoria.' });
  }
  back(): void { this.router.navigate(['/homeAdmin']); }
}
