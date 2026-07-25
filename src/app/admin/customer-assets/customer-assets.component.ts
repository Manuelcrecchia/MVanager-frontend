import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GlobalService } from '../../service/global.service';

interface CustomerOption { numeroCliente: string; label: string; }
interface CustomerAsset { id: number; numeroCliente: string; customerLabel?: string; typeKey?: string; customFields?: string | Record<string, any>; code?: string; name: string; serialNumber?: string | null; location?: string | null; description?: string | null; active: boolean; }
interface CustomerAssetGroup { id: string; label: string; assets: CustomerAsset[]; }

@Component({
  selector: 'app-customer-assets',
  templateUrl: './customer-assets.component.html',
  styleUrls: ['./customer-assets.component.css'],
})
export class CustomerAssetsComponent implements OnInit, OnDestroy {
  assets: CustomerAsset[] = [];
  customers: CustomerOption[] = [];
  editing: CustomerAsset | null = null;
  loading = false;
  saving = false;
  showForm = false;
  error = '';
  customerSearch = '';
  customerMenuOpen = false;
  pendingAssets: any[] = [];
  editingPendingIndex: number | null = null;
  addingToBatch = false;
  showArchived = false;
  selectedCustomerGroup: CustomerAssetGroup | null = null;
  archivingAssetId: number | null = null;
  editingFromDeadline = false;
  editorWorkflow = false;
  deadlineFieldTitle = '';
  private requestedEditId: number | null = null;
  private returnToDeadlineTargetKey: number | null = null;
  form: any = this.emptyForm();

  private readonly customerDetailPointerHandler = (event: PointerEvent): void => {
    const trigger = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-customer-detail]');
    if (!trigger) return;
    const group = this.customerGroups.find((item) => item.id === trigger.dataset['customerDetail']);
    if (!group) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.zone.run(() => this.openCustomerGroup(group));
  };

  constructor(private http: HttpClient, public global: GlobalService, private router: Router, private route: ActivatedRoute, private zone: NgZone) {}
  get config() { return this.global.getTenantCustomerAssetsConfig(); }
  get moduleLabel(): string { return this.config.moduleLabel || 'Presidi presso clienti'; }
  get singularLabel(): string { return this.config.singularLabel || 'Presidio'; }
  get editorTitle(): string {
    if (this.editingFromDeadline) return 'Aggiorna scadenza del presidio';
    return `${this.editing ? 'Modifica' : 'Nuovo'} ${this.singularLabel.toLocaleLowerCase('it')}`;
  }
  get types() { return this.config.types || []; }
  get selectedType() { return this.types.find((type) => type.key === this.form.typeKey) || null; }
  get customerGroups(): CustomerAssetGroup[] {
    const groups = new Map<string, CustomerAssetGroup>();
    for (const asset of this.assets) {
      const id = String(asset.numeroCliente);
      const group = groups.get(id) || { id, label: asset.customerLabel || `Cliente ${id}`, assets: [] };
      group.assets.push(asset);
      groups.set(id, group);
    }
    return [...groups.values()]
      .map((group) => ({ ...group, assets: group.assets.slice().sort((a, b) => this.assetLabel(a).localeCompare(this.assetLabel(b), 'it')) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'it'));
  }
  get displayedCustomerGroup(): CustomerAssetGroup | null {
    return this.editorWorkflow ? null : this.selectedCustomerGroup;
  }
  get hasDraftAsset(): boolean {
    return Boolean(this.form.typeKey || Object.keys(this.form.customFields || {}).some((key) => {
      const value = this.form.customFields[key];
      return value !== null && value !== undefined && String(value).trim() !== '';
    }) || this.form.attachments?.length);
  }
  get filteredCustomers(): CustomerOption[] {
    const query = this.customerSearch.trim().toLocaleLowerCase();
    const matches = !query
      ? this.customers
      : this.customers.filter((customer) => `${customer.label} ${customer.numeroCliente}`.toLocaleLowerCase().includes(query));
    return matches.slice(0, 12);
  }
  ngOnInit(): void {
    // The types are configured in MVControlManager: always obtain the latest
    // published configuration before opening the registry form.
    this.showArchived = this.route.snapshot.queryParamMap.get('archived') === '1';
    const createMode = this.route.snapshot.queryParamMap.get('mode') === 'create';
    this.requestedEditId = Number(this.route.snapshot.queryParamMap.get('edit')) || null;
    this.editorWorkflow = createMode || Boolean(this.requestedEditId);
    this.editingFromDeadline = Boolean(this.route.snapshot.queryParamMap.get('deadlineId'));
    this.deadlineFieldTitle = this.route.snapshot.queryParamMap.get('deadlineTitle') || '';
    this.returnToDeadlineTargetKey = this.editingFromDeadline ? this.requestedEditId : null;
    this.global.loadTenantConfig(true, { showError: false }).finally(() => {
      this.load();
      if (createMode && !this.showArchived) this.startNew();
    });
    document.addEventListener('pointerdown', this.customerDetailPointerHandler, true);
  }

  ngOnDestroy(): void { document.removeEventListener('pointerdown', this.customerDetailPointerHandler, true); }

  emptyForm() { return { numeroCliente: '', typeKey: '', name: 'Presidio', customFields: {} as Record<string, any>, remindDays: {} as Record<string, number | null>, attachments: [] as File[] }; }
  load(): void {
    this.loading = true; this.error = '';
    const archiveQuery = this.showArchived ? '?archived=1' : '';
    this.http.get<CustomerAsset[]>(this.global.url + 'admin/deadlines/customer-assets/registry' + archiveQuery).subscribe({ next: r => {
      this.assets = Array.isArray(r) ? r : [];
      if (this.requestedEditId) {
        const requestedAsset = this.assets.find((asset) => asset.id === this.requestedEditId);
        this.requestedEditId = null;
        if (requestedAsset) this.edit(requestedAsset);
      }
      const selectedId = this.selectedCustomerGroup?.id;
      this.selectedCustomerGroup = selectedId
        ? this.customerGroups.find((group) => group.id === selectedId) || null
        : null;
      this.loading = false;
    }, error: () => { this.error = `Impossibile caricare ${this.moduleLabel.toLowerCase()}.`; this.loading = false; } });
    this.http.get<CustomerOption[]>(this.global.url + 'admin/deadlines/customer-assets/customers').subscribe({ next: r => this.customers = Array.isArray(r) ? r : [] });
  }
  startNew(): void { this.editing = null; this.pendingAssets = []; this.editingPendingIndex = null; this.customerSearch = ''; this.form = { ...this.emptyForm(), name: this.singularLabel }; this.showForm = true; }
  edit(asset: CustomerAsset): void {
    this.editing = asset;
    this.editingPendingIndex = null;
    this.pendingAssets = [];
    this.form = { ...this.emptyForm(), ...asset, attachments: [], customFields: typeof asset.customFields === 'string' ? JSON.parse(asset.customFields || '{}') : (asset.customFields || {}) };
    this.customerSearch = asset.customerLabel ? `${asset.customerLabel} · ${asset.numeroCliente}` : asset.numeroCliente;
    this.showForm = true;
  }
  onCustomerSearch(): void { this.form.numeroCliente = ''; this.customerMenuOpen = true; }
  selectCustomer(customer: CustomerOption): void {
    this.form.numeroCliente = customer.numeroCliente;
    this.customerSearch = `${customer.label} · ${customer.numeroCliente}`;
    this.customerMenuOpen = false;
  }
  closeCustomerMenu(): void { setTimeout(() => this.customerMenuOpen = false, 150); }
  changeType(): void { this.form.customFields = {}; this.form.name = this.selectedType?.label || this.singularLabel; }
  onAttachmentChange(event: Event): void { this.form.attachments = Array.from((event.target as HTMLInputElement).files || []); }
  onConfiguredAttachmentChange(fieldKey: string, event: Event): void {
    const files = Array.from((event.target as HTMLInputElement).files || []);
    this.form.customFields[fieldKey] = files.map((file) => file.name).join(', ');
    this.form.attachments = [...this.form.attachments, ...files];
  }
  cancel(): void {
    if (this.editorWorkflow) {
      this.router.navigate(['/homeAdmin/customer-asset-deadlines'], {
        queryParams: this.returnToDeadlineTargetKey
          ? { targetKey: this.returnToDeadlineTargetKey }
          : {},
      });
      return;
    }
    this.editing = null; this.pendingAssets = []; this.editingPendingIndex = null; this.customerSearch = ''; this.customerMenuOpen = false; this.form = this.emptyForm(); this.showForm = false;
  }
  private assetValues(asset: CustomerAsset): Record<string, any> {
    if (asset.customFields && typeof asset.customFields === 'object') return asset.customFields;
    try { return JSON.parse(asset.customFields || '{}'); } catch { return {}; }
  }

  assetLabel(asset: CustomerAsset): string {
    const values = this.assetValues(asset);
    const identifier = asset.code || values['codice'] || values['code'] || asset.serialNumber || values['matricola'] || values['serialNumber'];
    return [identifier, asset.name].filter(Boolean).join(' · ') || this.singularLabel;
  }

  assetDetails(asset: CustomerAsset): Array<{ label: string; value: string }> {
    const values = this.assetValues(asset);
    const type = this.types.find((item: any) => item.key === asset.typeKey);
    const configured = Array.isArray(type?.fields) ? type.fields : [];
    const details = configured
      .map((field: any) => ({ label: field.label || field.key, value: values[field.key] }))
      .filter((item: any) => item.value !== null && item.value !== undefined && String(item.value).trim() !== '')
      .map((item: any) => ({ ...item, value: Array.isArray(item.value) ? item.value.join(', ') : String(item.value) }));
    if (asset.location && !details.some((item) => item.value === asset.location)) details.push({ label: 'Posizione', value: asset.location });
    if (asset.serialNumber && !details.some((item) => item.value === asset.serialNumber)) details.push({ label: this.config.serialNumberLabel || 'Matricola', value: asset.serialNumber });
    return details;
  }

  openCustomerGroup(group: CustomerAssetGroup): void {
    this.selectedCustomerGroup = group;
    this.error = '';
  }

  closeCustomerGroup(): void { this.selectedCustomerGroup = null; }
  toggleArchived(): void { this.showArchived = !this.showArchived; this.selectedCustomerGroup = null; this.load(); }
  validateForm(): string {
    if (!this.form.numeroCliente) return 'Seleziona un cliente dall’elenco.';
    if (!this.form.typeKey) return 'Il tipo è obbligatorio.';
    for (const field of this.selectedType?.fields || []) if (field.required && !this.form.customFields[field.key]) return `Campo obbligatorio: ${field.label}`;
    return '';
  }
  private pendingUniqueValidation(): string {
    const uniqueFields = (this.selectedType?.fields || []).filter((field: any) => field.unique);
    for (const field of uniqueFields) {
      const value = this.form.customFields?.[field.key];
      if (value === null || value === undefined || String(value).trim() === '') continue;
      const duplicateIndex = this.pendingAssets.findIndex((asset, index) => (
        index !== this.editingPendingIndex &&
        asset.typeKey === this.form.typeKey &&
        asset.customFields?.[field.key] === value
      ));
      if (duplicateIndex >= 0) {
        return `Il valore “${value}” del campo “${field.label}” è già presente nel presidio ${duplicateIndex + 1} della lista.`;
      }
    }
    return '';
  }
  async addToBatch(): Promise<boolean> {
    const validation = this.validateForm() || this.pendingUniqueValidation();
    if (validation) { this.error = validation; return false; }
    this.addingToBatch = true;
    this.error = '';
    try {
      const validationPayload = { ...this.form, attachments: [] };
      const validationResult: any = await firstValueFrom(this.http.post(
        this.global.url + 'admin/deadlines/customer-assets/registry/validate',
        validationPayload,
      ));
      if (validationResult?.valid !== true) {
        this.error = validationResult?.error || 'I dati del presidio non sono validi.';
        return false;
      }
      const pendingAsset = {
        ...this.form,
        customFields: { ...this.form.customFields },
        remindDays: { ...this.form.remindDays },
        attachments: [...this.form.attachments],
      };
      if (this.editingPendingIndex === null) this.pendingAssets.push(pendingAsset);
      else this.pendingAssets[this.editingPendingIndex] = pendingAsset;
      const customer = this.form.numeroCliente;
      this.form = { ...this.emptyForm(), numeroCliente: customer, name: this.singularLabel };
      this.editingPendingIndex = null;
      return true;
    } catch (e: any) {
      this.error = e?.error?.error || 'Impossibile verificare i dati del presidio.';
      return false;
    } finally {
      this.addingToBatch = false;
    }
  }
  editPendingAsset(index: number): void {
    const asset = this.pendingAssets[index];
    if (!asset) return;
    this.editingPendingIndex = index;
    this.form = {
      ...this.emptyForm(),
      ...asset,
      customFields: { ...(asset.customFields || {}) },
      remindDays: { ...(asset.remindDays || {}) },
      attachments: [...(asset.attachments || [])],
    };
    const customer = this.customers.find((item) => String(item.numeroCliente) === String(asset.numeroCliente));
    this.customerSearch = customer ? `${customer.label} · ${customer.numeroCliente}` : String(asset.numeroCliente || '');
    this.error = '';
  }
  pendingAssetLabel(asset: any): string {
    const values = asset.customFields || {};
    const identifier = asset.code || values['codice'] || values['code'] || values['matricola'] || values['serialNumber'];
    return [identifier, asset.name].filter(Boolean).join(' · ') || this.singularLabel;
  }
  pendingAssetDetails(asset: any): string {
    const type = this.types.find((item: any) => item.key === asset.typeKey);
    return (type?.fields || [])
      .filter((field: any) => asset.customFields?.[field.key] !== null && asset.customFields?.[field.key] !== undefined && String(asset.customFields[field.key]).trim() !== '')
      .slice(0, 4)
      .map((field: any) => `${field.label}: ${asset.customFields[field.key]}`)
      .join(' · ');
  }
  removeFromBatch(index: number): void {
    this.pendingAssets.splice(index, 1);
    if (this.editingPendingIndex === index) {
      this.editingPendingIndex = null;
      this.form = { ...this.emptyForm(), numeroCliente: this.form.numeroCliente, name: this.singularLabel };
    } else if (this.editingPendingIndex !== null && this.editingPendingIndex > index) {
      this.editingPendingIndex -= 1;
    }
  }
  private createRequest(payload: any) {
    if (!payload.attachments?.length) return this.http.post(this.global.url + 'admin/deadlines/customer-assets/registry', payload);
    const data = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (key === 'attachments') return;
      data.append(key, key === 'customFields' || key === 'remindDays' ? JSON.stringify(value || {}) : String(value ?? ''));
    });
    payload.attachments.forEach((file: File) => data.append('attachments', file));
    return this.http.post(this.global.url + 'admin/deadlines/customer-assets/registry', data);
  }
  async saveBatch(): Promise<void> {
    if (!this.pendingAssets.length) { this.error = 'Aggiungi almeno un presidio alla lista.'; return; }
    this.saving = true; this.error = '';
    try {
      let savedCount = 0;
      while (this.pendingAssets.length) {
        const asset = this.pendingAssets[0];
        try {
          await firstValueFrom(this.createRequest(asset));
          this.pendingAssets.shift();
          savedCount += 1;
        } catch (e: any) {
          const reason = e?.error?.error || 'Salvataggio non riuscito.';
          this.error = `Presidio ${savedCount + 1} (${this.pendingAssetLabel(asset)}): ${reason}`;
          return;
        }
      }
      await this.router.navigate(['/homeAdmin/customer-asset-deadlines']);
    } catch (e: any) { this.error = e?.error?.error || 'Salvataggio non riuscito.'; }
    finally { this.saving = false; }
  }
  async save(): Promise<void> {
    if (!this.editing) { if (await this.addToBatch()) await this.saveBatch(); return; }
    const validation = this.validateForm(); if (validation) { this.error = validation; return; }
    this.saving = true; this.error = '';
    const request = this.http.put(this.global.url + `admin/deadlines/customer-assets/registry/${this.editing.id}`, this.form);
    request.subscribe({
      next: () => {
        this.saving = false;
        if (this.editorWorkflow) {
          this.router.navigate(['/homeAdmin/customer-asset-deadlines'], {
            queryParams: this.returnToDeadlineTargetKey
              ? { targetKey: this.returnToDeadlineTargetKey }
              : {},
          });
          return;
        }
        this.cancel();
        this.load();
      },
      error: (e: any) => { this.saving = false; this.error = e?.error?.error || 'Salvataggio non riuscito.'; },
    });
  }
  archive(asset: CustomerAsset): void {
    if (!confirm(`Eliminare ${this.assetLabel(asset)}? Verrà rimosso dall'elenco, mentre le scadenze resteranno nello storico.`)) return;
    this.archivingAssetId = asset.id;
    this.error = '';
    this.http.delete(this.global.url + `admin/deadlines/customer-assets/registry/${asset.id}`).subscribe({
      next: () => {
        this.assets = this.assets.filter((item) => item.id !== asset.id);
        const selectedId = this.selectedCustomerGroup?.id;
        this.selectedCustomerGroup = selectedId
          ? this.customerGroups.find((group) => group.id === selectedId) || null
          : null;
        this.archivingAssetId = null;
        this.load();
      },
      error: (e: any) => { this.archivingAssetId = null; this.error = e?.error?.error || 'Eliminazione non riuscita.'; },
    });
  }
  openDeadlines(asset: CustomerAsset): void {
    this.router.navigate(['/homeAdmin/customer-asset-deadlines'], {
      queryParams: { targetKey: asset.id, archived: this.showArchived ? 1 : null },
    });
  }
  back(): void { this.router.navigateByUrl('/homeAdmin/customer-asset-deadlines'); }
}
