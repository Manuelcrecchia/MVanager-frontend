import { Component, OnInit } from '@angular/core';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GlobalService } from '../../service/global.service';

interface CustomerOption { numeroCliente: string; label: string; }
interface CustomerAssetAttachment { id: string; originalName: string; storedName?: string; size?: number; uploadedAt?: string; fieldKey?: string | null; }
interface CustomerAsset { id: number; numeroCliente: string; customerLabel?: string; typeKey?: string; customFields?: string | Record<string, any>; code?: string; displayIdentifier?: string; name: string; serialNumber?: string | null; location?: string | null; description?: string | null; attachments?: CustomerAssetAttachment[] | string; active: boolean; }
interface CustomerAssetGroup { id: string; label: string; assets: CustomerAsset[]; }

@Component({
  selector: 'app-customer-assets',
  templateUrl: './customer-assets.component.html',
  styleUrls: ['./customer-assets.component.css'],
})
export class CustomerAssetsComponent implements OnInit {
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
  deadlineFieldKey = '';
  private requestedEditId: number | null = null;
  private returnToDeadlineTargetKey: number | null = null;
  form: any = this.emptyForm();

  constructor(private http: HttpClient, public global: GlobalService, private router: Router, private route: ActivatedRoute, private appDialog: PopupServiceService) {}
  get config() { return this.global.getTenantCustomerAssetsConfig(); }
  get moduleLabel(): string { return this.config.moduleLabel || 'Presidi presso clienti'; }
  get singularLabel(): string { return this.config.singularLabel || 'Presidio'; }
  get editorTitle(): string {
    if (this.editingFromDeadline) return 'Aggiorna scadenza del presidio';
    return `${this.editing ? 'Modifica' : 'Nuovo'} ${this.singularLabel.toLocaleLowerCase('it')}`;
  }
  get types() { return this.config.types || []; }
  get selectedType() { return this.types.find((type) => type.key === this.form.typeKey) || null; }
  get generalFields(): any[] {
    return (this.selectedType?.fields || []).filter((field: any) => !(field.type === 'date' && field.isDeadline));
  }
  get deadlineFields(): any[] {
    const fields = (this.selectedType?.fields || []).filter((field: any) => field.type === 'date' && field.isDeadline);
    if (!this.editingFromDeadline) return fields;
    const fieldByKey = this.deadlineFieldKey
      ? fields.find((field: any) => field.key === this.deadlineFieldKey)
      : null;
    return fieldByKey
      ? [fieldByKey]
      : fields.filter((field: any) => field.label === this.deadlineFieldTitle);
  }
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
  trackStableInteractiveItem(index: number, item: any): string | number {
    return item?.id ?? item?.key ?? item?.numeroCliente ?? item?.name ?? index;
  }
  get hasDraftAsset(): boolean {
    return Boolean(this.form.typeKey || Object.keys(this.form.customFields || {}).some((key) => {
      const value = this.form.customFields[key];
      return value !== null && value !== undefined && String(value).trim() !== '';
    }) || this.form.attachments?.length || this.form.removedAttachmentIds?.length);
  }
  get batchSaveBlockReason(): string {
    if (this.editing) return '';
    if (this.hasDraftAsset) {
      return 'Il presidio compilato non è ancora nella lista: premi “Aggiungi alla lista”.';
    }
    if (!this.pendingAssets.length) {
      return 'Aggiungi almeno un presidio alla lista prima di salvare.';
    }
    return '';
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
    this.deadlineFieldKey = this.route.snapshot.queryParamMap.get('deadlineFieldKey') || '';
    this.returnToDeadlineTargetKey = this.editingFromDeadline ? this.requestedEditId : null;
    this.global.loadTenantConfig(true, { showError: false }).finally(() => {
      this.load();
      if (createMode && !this.showArchived) this.startNew();
    });
  }

  emptyForm() {
    return {
      numeroCliente: '',
      typeKey: '',
      name: 'Presidio',
      interventionDate: this.todayDateOnly(),
      customFields: {} as Record<string, any>,
      remindDays: {} as Record<string, number | null>,
      manualFieldKeys: {} as Record<string, boolean>,
      attachments: [] as File[],
      attachmentFiles: {} as Record<string, File[]>,
      existingAttachments: [] as CustomerAssetAttachment[],
      removedAttachmentIds: [] as string[],
    };
  }
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
    const existingAttachments = typeof asset.attachments === 'string'
      ? JSON.parse(asset.attachments || '[]')
      : (asset.attachments || []);
    this.form = { ...this.emptyForm(), ...asset, attachments: [], attachmentFiles: {}, existingAttachments, removedAttachmentIds: [], customFields: typeof asset.customFields === 'string' ? JSON.parse(asset.customFields || '{}') : (asset.customFields || {}) };
    this.customerSearch = asset.customerLabel ? `${asset.customerLabel} · ${asset.numeroCliente}` : asset.numeroCliente;
    this.applyInterventionSuggestions();
    this.showForm = true;
  }
  onCustomerSearch(): void { this.form.numeroCliente = ''; this.customerMenuOpen = true; }
  selectCustomer(customer: CustomerOption): void {
    this.form.numeroCliente = customer.numeroCliente;
    this.customerSearch = `${customer.label} · ${customer.numeroCliente}`;
    this.customerMenuOpen = false;
  }
  selectCustomerByNumber(numeroCliente: string): void {
    const selected = this.customers.find(
      (customer) => String(customer.numeroCliente) === String(numeroCliente || ''),
    );
    if (selected) {
      this.selectCustomer(selected);
      return;
    }
    this.form.numeroCliente = '';
    this.customerSearch = '';
    this.customerMenuOpen = false;
  }
  closeCustomerMenu(): void { setTimeout(() => this.customerMenuOpen = false, 150); }
  changeType(): void {
    const oldAttachmentIds = (this.form.existingAttachments || []).map((item: CustomerAssetAttachment) => item.id);
    this.form.customFields = {};
    this.form.remindDays = {};
    this.form.manualFieldKeys = {};
    this.form.attachments = [];
    this.form.attachmentFiles = {};
    this.form.existingAttachments = [];
    this.form.removedAttachmentIds = [...new Set([...(this.form.removedAttachmentIds || []), ...oldAttachmentIds])];
    this.form.name = this.selectedType?.label || this.singularLabel;
    for (const field of this.selectedType?.fields || []) {
      if (field.isDeadline && field.defaultRemindDays !== null && field.defaultRemindDays !== undefined) {
        this.form.remindDays[field.key] = Number(field.defaultRemindDays);
      }
    }
    this.applyInterventionSuggestions();
  }

  onConfiguredFieldChange(field: any, value: any): void {
    this.form.customFields[field.key] = value;
    this.form.manualFieldKeys[field.key] = true;
    for (const dependent of this.selectedType?.fields || []) {
      if (dependent.bulkUpdateMode !== 'date_offset') continue;
      if (String(dependent.bulkUpdateSourceField || '') !== field.key) continue;
      if (this.form.manualFieldKeys[dependent.key]) continue;
      const suggested = this.suggestedFieldValue(dependent);
      if (suggested !== null) this.form.customFields[dependent.key] = suggested;
    }
  }

  resetConfiguredFieldSuggestion(field: any): void {
    delete this.form.manualFieldKeys[field.key];
    const suggested = this.suggestedFieldValue(field);
    if (suggested !== null) this.form.customFields[field.key] = suggested;
  }

  isCalculatedField(field: any): boolean {
    return field?.bulkUpdateMode === 'today' || field?.bulkUpdateMode === 'date_offset';
  }

  calculationHint(field: any): string {
    if (field?.bulkUpdateMode === 'today') return 'Data odierna';
    if (field?.bulkUpdateMode === 'date_offset') {
      const sourceKey = String(field.bulkUpdateSourceField || '');
      const sourceLabel = (this.selectedType?.fields || []).find((item: any) => item.key === sourceKey)?.label || sourceKey;
      const offset = Number(field.bulkUpdateOffsetValue) || 0;
      const unit = field.bulkUpdateOffsetUnit === 'days' ? 'giorni' : 'mesi';
      return `${sourceLabel} + ${offset} ${unit}`;
    }
    return '';
  }

  private applyInterventionSuggestions(fields?: any[]): void {
    const configuredFields = fields || this.selectedType?.fields || [];
    for (let pass = 0; pass < 2; pass += 1) {
      for (const field of configuredFields) {
        if (this.form.manualFieldKeys[field.key]) continue;
        const suggested = this.suggestedFieldValue(field);
        if (suggested !== null) this.form.customFields[field.key] = suggested;
      }
    }
  }

  private suggestedFieldValue(field: any): string | null {
    if (field?.type !== 'date') return null;
    if (field.bulkUpdateMode === 'today') return this.todayDateOnly();
    if (field.bulkUpdateMode === 'date_offset') {
      const sourceKey = String(field.bulkUpdateSourceField || '');
      const sourceValue = String(this.form.customFields[sourceKey] || '');
      const offset = Number(field.bulkUpdateOffsetValue) || 0;
      return field.bulkUpdateOffsetUnit === 'days'
        ? this.addDaysToDate(sourceValue, offset)
        : this.addMonthsToDate(sourceValue, offset);
    }
    return null;
  }

  private todayDateOnly(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private addDaysToDate(value: string, days: number): string {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const result = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
    return result.toISOString().slice(0, 10);
  }

  private addMonthsToDate(value: string, months: number): string {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const result = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + months, 1));
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(Number(match[3]), lastDay));
    return result.toISOString().slice(0, 10);
  }
  onConfiguredAttachmentChange(field: any, event: Event): void {
    const files = Array.from((event.target as HTMLInputElement).files || []);
    if (!files.length) return;
    const current = this.form.attachmentFiles[field.key] || [];
    this.form.attachmentFiles[field.key] = field.attachmentMultiple === true ? [...current, ...files] : [files[0]];
    this.syncAttachmentFiles();
    (event.target as HTMLInputElement).value = '';
  }
  configuredExistingAttachments(fieldKey: string): CustomerAssetAttachment[] {
    const removed = new Set(this.form.removedAttachmentIds || []);
    return (this.form.existingAttachments || []).filter((item: CustomerAssetAttachment) => item.fieldKey === fieldKey && !removed.has(item.id));
  }
  configuredNewAttachments(fieldKey: string): File[] { return this.form.attachmentFiles?.[fieldKey] || []; }
  removeExistingAttachment(attachment: CustomerAssetAttachment): void {
    this.form.removedAttachmentIds = [...new Set([...(this.form.removedAttachmentIds || []), attachment.id])];
  }
  removeNewAttachment(fieldKey: string, index: number): void {
    this.form.attachmentFiles[fieldKey] = (this.form.attachmentFiles[fieldKey] || []).filter((_: File, itemIndex: number) => itemIndex !== index);
    this.syncAttachmentFiles();
  }
  attachmentCount(fieldKey: string): number {
    return this.configuredExistingAttachments(fieldKey).length + this.configuredNewAttachments(fieldKey).length;
  }
  downloadAttachment(attachment: CustomerAssetAttachment): void {
    if (!this.editing) return;
    this.http.get(
      this.global.url + `admin/deadlines/customer-assets/registry/${this.editing.id}/attachments/${attachment.id}`,
      { responseType: 'blob' },
    ).subscribe((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = attachment.originalName; link.click();
      URL.revokeObjectURL(url);
    });
  }
  private syncAttachmentFiles(): void {
    this.form.attachments = Object.values(this.form.attachmentFiles || {}).flat() as File[];
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
  discardDraft(): void {
    if (this.editing) return;
    const customer = this.form.numeroCliente;
    this.form = {
      ...this.emptyForm(),
      numeroCliente: customer,
      name: this.singularLabel,
    };
    this.editingPendingIndex = null;
    this.customerMenuOpen = false;
    if (!customer) this.customerSearch = '';
    this.error = '';
  }
  private assetValues(asset: CustomerAsset): Record<string, any> {
    if (asset.customFields && typeof asset.customFields === 'object') return asset.customFields;
    try { return JSON.parse(asset.customFields || '{}'); } catch { return {}; }
  }

  assetLabel(asset: CustomerAsset): string {
    const values = this.assetValues(asset);
    const type = this.types.find((item: any) => item.key === asset.typeKey);
    const identityField = (type?.fields || []).find((field: any) => field.unique === true && field.type !== 'attachment');
    const configuredIdentifier = identityField ? String(values[identityField.key] ?? '').trim() : '';
    const identifier = asset.displayIdentifier || configuredIdentifier || asset.code || `PR-${String(asset.id).padStart(6, '0')}`;
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
    for (const field of this.selectedType?.fields || []) {
      if (!field.required) continue;
      if (field.type === 'attachment') {
        if (!this.attachmentCount(field.key)) return `Campo obbligatorio: ${field.label}`;
      } else if (!this.form.customFields[field.key]) return `Campo obbligatorio: ${field.label}`;
    }
    return '';
  }
  private pendingUniqueValidation(): string {
    const uniqueFields = (this.selectedType?.fields || []).filter((field: any) => field.unique);
    for (const field of uniqueFields) {
      const value = this.form.customFields?.[field.key];
      if (value === null || value === undefined || String(value).trim() === '') continue;
      const duplicateIndex = this.pendingAssets.findIndex((asset, index) => (
        index !== this.editingPendingIndex &&
        (field.uniqueScope === 'customer'
          ? String(asset.numeroCliente) === String(this.form.numeroCliente)
          : asset.typeKey === this.form.typeKey) &&
        asset.customFields?.[field.key] === value
      ));
      if (duplicateIndex >= 0) {
        return `Il valore “${value}” del campo “${field.label}” è già presente nel presidio ${duplicateIndex + 1} della lista.`;
      }
    }
    return '';
  }
  private showBatchValidationError(message: string): void {
    this.error = message;
    setTimeout(() => {
      document.getElementById('customer-asset-error')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    });
  }
  async addToBatch(): Promise<boolean> {
    const validation = this.validateForm() || this.pendingUniqueValidation();
    if (validation) {
      this.showBatchValidationError(validation);
      return false;
    }
    this.addingToBatch = true;
    this.error = '';
    try {
      const validationPayload = { ...this.form, attachments: [], attachmentCounts: this.attachmentCounts() };
      const validationResult: any = await firstValueFrom(this.http.post(
        this.global.url + 'admin/deadlines/customer-assets/registry/validate',
        validationPayload,
      ));
      if (validationResult?.valid !== true) {
        this.showBatchValidationError(validationResult?.error || 'I dati del presidio non sono validi.');
        return false;
      }
      const pendingAsset = {
        ...this.form,
        customFields: { ...this.form.customFields },
        remindDays: { ...this.form.remindDays },
        manualFieldKeys: { ...this.form.manualFieldKeys },
        attachments: [...this.form.attachments],
        attachmentFiles: Object.fromEntries(Object.entries(this.form.attachmentFiles || {}).map(([key, files]) => [key, [...(files as File[])]])),
        existingAttachments: [...(this.form.existingAttachments || [])],
        removedAttachmentIds: [...(this.form.removedAttachmentIds || [])],
      };
      if (this.editingPendingIndex === null) this.pendingAssets.push(pendingAsset);
      else this.pendingAssets[this.editingPendingIndex] = pendingAsset;
      const customer = this.form.numeroCliente;
      this.form = { ...this.emptyForm(), numeroCliente: customer, name: this.singularLabel };
      this.editingPendingIndex = null;
      return true;
    } catch (e: any) {
      this.showBatchValidationError(e?.error?.error || 'Impossibile verificare i dati del presidio.');
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
      attachmentFiles: Object.fromEntries(Object.entries(asset.attachmentFiles || {}).map(([key, files]) => [key, [...(files as File[])]])),
      existingAttachments: [...(asset.existingAttachments || [])],
      removedAttachmentIds: [...(asset.removedAttachmentIds || [])],
    };
    const customer = this.customers.find((item) => String(item.numeroCliente) === String(asset.numeroCliente));
    this.customerSearch = customer ? `${customer.label} · ${customer.numeroCliente}` : String(asset.numeroCliente || '');
    this.error = '';
  }
  pendingAssetLabel(asset: any): string {
    const values = asset.customFields || {};
    const type = this.types.find((item: any) => item.key === asset.typeKey);
    const identityField = (type?.fields || []).find((field: any) => field.unique === true && field.type !== 'attachment');
    const identifier = identityField ? values[identityField.key] : asset.code;
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
  private attachmentCounts(payload = this.form): Record<string, number> {
    return Object.fromEntries(Object.entries(payload.attachmentFiles || {}).map(([key, files]) => [key, (files as File[]).length]));
  }
  private buildAttachmentRequest(payload: any): { body: any; multipart: boolean } {
    const { manualFieldKeys, interventionDate, attachments = [], attachmentFiles = {}, existingAttachments, removedAttachmentIds = [], ...requestPayload } = payload;
    if (!attachments.length) {
      return { body: { ...requestPayload, removedAttachmentIds: removedAttachmentIds.join(','), attachmentCounts: this.attachmentCounts(payload) }, multipart: false };
    }
    const data = new FormData();
    Object.entries(requestPayload).forEach(([key, value]) => {
      data.append(key, key === 'customFields' || key === 'remindDays' ? JSON.stringify(value || {}) : String(value ?? ''));
    });
    const manifest: Array<{ fieldKey: string }> = [];
    for (const [fieldKey, files] of Object.entries(attachmentFiles)) {
      for (const file of files as File[]) {
        data.append('attachments', file);
        manifest.push({ fieldKey });
      }
    }
    data.append('attachmentManifest', JSON.stringify(manifest));
    data.append('attachmentCounts', JSON.stringify(this.attachmentCounts(payload)));
    data.append('removedAttachmentIds', removedAttachmentIds.join(','));
    return { body: data, multipart: true };
  }
  private createRequest(payload: any) {
    const request = this.buildAttachmentRequest(payload);
    return this.http.post(this.global.url + 'admin/deadlines/customer-assets/registry', request.body);
  }
  async saveBatch(): Promise<void> {
    const blockReason = this.batchSaveBlockReason;
    if (blockReason) {
      this.error = blockReason;
      return;
    }
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
    const updateRequest = this.buildAttachmentRequest(this.form);
    const request = this.http.put(this.global.url + `admin/deadlines/customer-assets/registry/${this.editing.id}`, updateRequest.body);
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
  async archive(asset: CustomerAsset): Promise<void> {
    if (!await this.appDialog.confirm(`Eliminare ${this.assetLabel(asset)}? Verrà rimosso dall'elenco, mentre le scadenze resteranno nello storico.`)) return;
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
