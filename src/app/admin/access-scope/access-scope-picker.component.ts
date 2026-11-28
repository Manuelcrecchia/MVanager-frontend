import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, DestroyRef, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { GlobalService } from '../../service/global.service';
import {
  AdminAccessScope, ArchiveFile, ArchiveListing, ScopeCustomer, ScopeKey, SharedFileRef,
  SCOPE_TITLES, legacyScope, setCustomerSelection,
} from './access-scope';

@Component({
  selector: 'app-access-scope-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './access-scope-picker.component.html',
  styleUrl: './access-scope-picker.component.css',
})
export class AccessScopePickerComponent implements OnInit {
  @Input({ required: true }) section!: ScopeKey;
  @Input({ required: true }) scope!: AdminAccessScope;
  @Output() apply = new EventEmitter<AdminAccessScope>();
  @Output() cancel = new EventEmitter<void>();

  protected readonly titles = SCOPE_TITLES;
  private readonly destroyRef = inject(DestroyRef);
  private readonly http = inject(HttpClient);
  private readonly global = inject(GlobalService);
  private readonly endpoint = 'admin/access-scope/options/';
  private directoryRequest = 0;

  private draft!: AdminAccessScope;
  mode: 'all' | 'selected' = 'all';
  customers: ScopeCustomer[] = [];
  customerSearch = '';
  currentCustomer = '';
  folder = '';
  listing: ArchiveListing = { folders: [], files: [] };
  loading = false;
  addingFolder = false;
  error = '';

  ngOnInit(): void {
    this.draft = legacyScope(this.scope);
    this.mode = this.draft[this.section] === null ? 'all' : 'selected';
    if (this.mode === 'selected') this.loadOptions();
  }

  get visibleCustomers(): ScopeCustomer[] {
    const search = this.customerSearch.trim().toLocaleLowerCase('it');
    return this.customers.filter(customer =>
      (this.section === 'customers' || this.draft.customers === null || this.draft.customers.includes(customer.id)) &&
      (!search || `${customer.name} ${customer.id}`.toLocaleLowerCase('it').includes(search)),
    );
  }

  get selectedCustomers(): string[] {
    return this.draft.customers || [];
  }

  get selectedFiles(): SharedFileRef[] {
    if (this.section === 'internalDocuments') return this.draft.internalDocuments || [];
    return this.draft.customerDocuments?.find(item => item.customerId === this.currentCustomer)?.files || [];
  }

  get selectionCount(): number {
    if (this.section === 'customers') return this.selectedCustomers.length;
    if (this.section === 'internalDocuments') return this.selectedFiles.length;
    return this.draft.customerDocuments?.reduce((sum, entry) => sum + entry.files.length, 0) || 0;
  }

  get archiveReady(): boolean {
    return this.section === 'internalDocuments' || this.section === 'customerDocuments' && !!this.currentCustomer;
  }

  get breadcrumbs(): { name: string; path: string }[] {
    const parts = this.folder.split('/').filter(Boolean);
    return parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join('/') }));
  }

  setMode(mode: 'all' | 'selected'): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'selected') this.loadOptions();
  }

  toggleCustomer(id: string, checked: boolean): void {
    const customers = this.selectedCustomers.filter(item => item !== id);
    if (checked) customers.push(id);
    this.draft.customers = customers;
  }

  useCustomer(id: string): void {
    this.currentCustomer = id;
    this.navigate('');
  }

  private loadOptions(): void {
    if (this.section === 'internalDocuments') {
      this.navigate(this.folder);
      return;
    }
    this.loading = true;
    this.error = '';
    this.http.get<ScopeCustomer[]>(this.global.url + this.endpoint + 'customers')
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading = false))
      .subscribe({
        next: customers => this.customers = customers,
        error: error => this.setError(error),
      });
  }

  navigate(folder: string): void {
    const request = ++this.directoryRequest;
    this.folder = folder;
    this.listing = { folders: [], files: [] };
    this.error = '';
    if (!this.archiveReady) {
      this.loading = false;
      return;
    }
    this.loading = true;
    this.http.post<ArchiveListing>(this.global.url + this.endpoint + 'documents', this.archiveRequest(folder))
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
        if (request === this.directoryRequest) this.loading = false;
      }))
      .subscribe({
        next: listing => {
          if (request === this.directoryRequest) this.listing = listing;
        },
        error: error => {
          if (request === this.directoryRequest) this.setError(error);
        },
      });
  }

  openFolder(name: string): void {
    this.navigate(this.folder ? `${this.folder}/${name}` : name);
  }

  fileSelected(file: ArchiveFile): boolean {
    return this.selectedFiles.some(item => item.path === file.path && item.version === file.version);
  }

  toggleFile(file: SharedFileRef, checked: boolean): void {
    const files = this.selectedFiles.filter(item => item.path !== file.path);
    if (checked) files.push({ path: file.path, version: file.version });
    this.setFiles(files);
  }

  includeFolder(folder: string): void {
    if (this.addingFolder) return;
    this.addingFolder = true;
    this.error = '';
    this.http.post<SharedFileRef[]>(this.global.url + this.endpoint + 'snapshot-folder', this.archiveRequest(folder))
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.addingFolder = false))
      .subscribe({
        next: files => {
          const merged = new Map(this.selectedFiles.map(file => [file.path, file]));
          files.forEach(file => merged.set(file.path, file));
          this.setFiles([...merged.values()]);
          if (!files.length) this.error = 'La cartella non contiene documenti.';
        },
        error: error => this.setError(error),
      });
  }

  confirm(): void {
    if (this.addingFolder) return;
    const all = this.mode === 'all';
    switch (this.section) {
      case 'customers': setCustomerSelection(this.draft, all ? null : this.selectedCustomers); break;
      case 'internalDocuments': this.draft.internalDocuments = all ? null : this.selectedFiles; break;
      case 'customerDocuments': this.draft.customerDocuments = all ? null : this.draft.customerDocuments || []; break;
    }
    this.apply.emit(this.draft);
  }

  private archiveRequest(folder: string) {
    return { area: this.section === 'internalDocuments' ? 'internal' : 'customer', customerId: this.currentCustomer, folder };
  }

  private setFiles(files: SharedFileRef[]): void {
    if (this.section === 'internalDocuments') {
      this.draft.internalDocuments = files;
      return;
    }
    const other = (this.draft.customerDocuments || []).filter(item => item.customerId !== this.currentCustomer);
    this.draft.customerDocuments = files.length ? [...other, { customerId: this.currentCustomer, files }] : other;
  }

  private setError(error: any): void {
    this.error = error?.error?.error || 'Impossibile caricare la selezione.';
  }
}
