import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { AttachmentViewerService } from '../../shared/attachment-viewer/attachment-viewer.service';

interface GuidedAsset {
  id: number;
  numeroCliente: string;
  customerLabel?: string;
  typeKey: string;
  code?: string;
  name?: string;
  location?: string;
  serialNumber?: string;
  description?: string;
  installedAt?: string;
  customFields?: string | Record<string, any>;
  remindDays?: Record<string, number>;
  updatedAt?: string;
  displayIdentifier?: string;
  attachments?: Array<{ id: string; originalName: string; fieldKey?: string | null }>;
}

interface GuidedStep {
  asset: GuidedAsset;
  fields: any[];
  values: Record<string, any>;
  remindDays: Record<string, number>;
  interventionDate: string;
  attachmentFiles: Record<string, File[]>;
  removedAttachmentIds: string[];
  done: boolean;
  error: string;
}

@Component({
  selector: 'app-customer-assets-guided-update',
  templateUrl: './customer-assets-guided-update.component.html',
  styleUrls: ['./customer-assets-guided-update.component.css'],
})
export class CustomerAssetsGuidedUpdateComponent implements OnInit {
  trackStableInteractiveItem(index: number, item: any): string | number {
    return item?.id ?? item?.key ?? item?.name ?? index;
  }

  phase: 'prepare' | 'edit' | 'complete' = 'prepare';
  assets: GuidedAsset[] = [];
  selectedCustomer = '';
  customerPickerOpen = false;
  expandedTypeKeys = new Set<string>();
  expandedAssetIds = new Set<number>();
  selectedPairs = new Set<string>();
  steps: GuidedStep[] = [];
  currentIndex = 0;
  searchText = '';
  statusFilter: 'all' | 'pending' | 'done' = 'all';
  mobileQueueOpen = false;
  loading = true;
  saving = false;
  error = '';
  success = '';

  constructor(
    private readonly http: HttpClient,
    public readonly global: GlobalService,
    private readonly router: Router,
    private readonly popup: PopupServiceService,
    private readonly attachmentViewer: AttachmentViewerService,
  ) {}

  get config(): any { return this.global.getTenantCustomerAssetsConfig(); }
  get types(): any[] { return this.config?.types || []; }
  get customers(): Array<{ id: string; label: string; count: number }> {
    const grouped = new Map<string, { id: string; label: string; count: number }>();
    for (const asset of this.assets) {
      const id = String(asset.numeroCliente);
      const current = grouped.get(id) || {
        id,
        label: asset.customerLabel || `Cliente ${id}`,
        count: 0,
      };
      current.count += 1;
      grouped.set(id, current);
    }
    return [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label, 'it'));
  }
  get customerAssets(): GuidedAsset[] {
    return this.assets
      .filter((asset) => String(asset.numeroCliente) === this.selectedCustomer)
      .sort((a, b) => this.assetLabel(a).localeCompare(this.assetLabel(b), 'it'));
  }
  get selectedCustomerLabel(): string {
    return this.customers.find((customer) => customer.id === this.selectedCustomer)?.label || 'Seleziona cliente';
  }
  get currentStep(): GuidedStep | null { return this.steps[this.currentIndex] || null; }
  get completedCount(): number { return this.steps.filter((step) => step.done).length; }
  get pendingCount(): number { return this.steps.length - this.completedCount; }
  get selectedAssetCount(): number {
    return new Set([...this.selectedPairs].map((pair) => pair.split(':')[0])).size;
  }
  get filteredSteps(): Array<{ step: GuidedStep; index: number }> {
    const query = this.searchText.trim().toLocaleLowerCase('it');
    return this.steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => this.statusFilter === 'all' || (this.statusFilter === 'done' ? step.done : !step.done))
      .filter(({ step }) => !query || this.assetSearchText(step.asset).includes(query));
  }

  ngOnInit(): void {
    Promise.resolve(this.global.loadTenantConfig()).finally(() => this.loadAssets());
  }

  loadAssets(): void {
    this.loading = true;
    this.http.get<GuidedAsset[]>(this.global.url + 'admin/deadlines/customer-assets/registry').subscribe({
      next: (assets) => {
        this.assets = Array.isArray(assets) ? assets : [];
        this.loading = false;
        this.restoreDraft();
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.error || 'Impossibile caricare i presidi.';
      },
    });
  }

  deadlineFields(typeKey: string): any[] {
    const type = this.types.find((item) => item.key === typeKey);
    return (type?.fields || []).filter((field: any) => field.type === 'date' && field.isDeadline === true);
  }

  guidedFields(typeKey: string): any[] {
    const type = this.types.find((item) => item.key === typeKey);
    return (type?.fields || [])
      .map((field: any) => ({ ...field, scope: 'custom' }));
  }

  typeLabel(typeKey: string): string {
    return this.types.find((item) => item.key === typeKey)?.label || typeKey || 'Altro presidio';
  }

  customerTypeGroups(): Array<{ typeKey: string; label: string; assets: GuidedAsset[]; fields: any[] }> {
    const groups = new Map<string, GuidedAsset[]>();
    for (const asset of this.customerAssets) {
      const rows = groups.get(asset.typeKey) || [];
      rows.push(asset);
      groups.set(asset.typeKey, rows);
    }
    return [...groups.entries()].map(([typeKey, assets]) => ({
      typeKey,
      label: this.typeLabel(typeKey),
      assets,
      fields: this.guidedFields(typeKey),
    }));
  }

  trackTypeGroup(_index: number, group: { typeKey: string }): string {
    return group.typeKey;
  }

  trackAsset(_index: number, asset: GuidedAsset): number {
    return asset.id;
  }

  trackField(_index: number, field: any): string {
    return String(field.key);
  }

  onCustomerChange(): void {
    this.selectedPairs = new Set();
    this.expandedTypeKeys = new Set();
    this.expandedAssetIds = new Set();
  }

  toggleCustomerPicker(): void {
    this.customerPickerOpen = !this.customerPickerOpen;
  }

  selectCustomer(customerId: string): void {
    const changed = this.selectedCustomer !== customerId;
    this.selectedCustomer = customerId;
    this.customerPickerOpen = false;
    if (changed) this.onCustomerChange();
  }

  trackCustomer(_index: number, customer: { id: string }): string {
    return customer.id;
  }

  isTypeGroupExpanded(typeKey: string): boolean {
    return this.expandedTypeKeys.has(typeKey);
  }

  toggleTypeGroup(typeKey: string): void {
    const next = new Set(this.expandedTypeKeys);
    if (next.has(typeKey)) next.delete(typeKey);
    else next.add(typeKey);
    this.expandedTypeKeys = next;
  }

  isAssetExpanded(assetId: number): boolean {
    return this.expandedAssetIds.has(assetId);
  }

  toggleAssetDetails(assetId: number): void {
    const next = new Set(this.expandedAssetIds);
    if (next.has(assetId)) next.delete(assetId);
    else next.add(assetId);
    this.expandedAssetIds = next;
  }

  pairKey(assetId: number, fieldKey: string): string {
    return `${assetId}:${fieldKey}`;
  }

  isPairSelected(asset: GuidedAsset, field: any): boolean {
    return this.selectedPairs.has(this.pairKey(asset.id, field.key));
  }

  togglePair(asset: GuidedAsset, field: any, checked: boolean): void {
    const next = new Set(this.selectedPairs);
    const key = this.pairKey(asset.id, field.key);
    if (checked) next.add(key);
    else next.delete(key);
    this.selectedPairs = next;
  }

  togglePairFromTap(asset: GuidedAsset, field: any): void {
    this.togglePair(asset, field, !this.isPairSelected(asset, field));
  }

  togglePairFromClick(event: Event, asset: GuidedAsset, field: any): void {
    this.consumeSelectionEvent(event);
    this.togglePairFromTap(asset, field);
  }

  isRuleSelected(typeKey: string, field: any): boolean {
    const assets = this.customerAssets.filter((asset) => asset.typeKey === typeKey);
    return assets.length > 0 && assets.every((asset) => this.isPairSelected(asset, field));
  }

  toggleRule(typeKey: string, field: any, checked: boolean): void {
    const next = new Set(this.selectedPairs);
    for (const asset of this.customerAssets.filter((item) => item.typeKey === typeKey)) {
      const key = this.pairKey(asset.id, field.key);
      if (checked) next.add(key);
      else next.delete(key);
    }
    this.selectedPairs = next;
  }

  toggleRuleFromTap(typeKey: string, field: any): void {
    this.toggleRule(typeKey, field, !this.isRuleSelected(typeKey, field));
  }

  toggleRuleFromClick(event: Event, typeKey: string, field: any): void {
    this.consumeSelectionEvent(event);
    this.toggleRuleFromTap(typeKey, field);
  }

  isAssetSelected(asset: GuidedAsset): boolean {
    const fields = this.guidedFields(asset.typeKey);
    return fields.length > 0 && fields.every((field) => this.isPairSelected(asset, field));
  }

  isAssetPartial(asset: GuidedAsset): boolean {
    return !this.isAssetSelected(asset) &&
      this.guidedFields(asset.typeKey).some((field) => this.isPairSelected(asset, field));
  }

  toggleAsset(asset: GuidedAsset): void {
    const checked = !this.isAssetSelected(asset);
    const next = new Set(this.selectedPairs);
    for (const field of this.guidedFields(asset.typeKey)) {
      const key = this.pairKey(asset.id, field.key);
      if (checked) next.add(key);
      else next.delete(key);
    }
    this.selectedPairs = next;
  }

  toggleAssetFromClick(event: Event, asset: GuidedAsset): void {
    this.consumeSelectionEvent(event);
    this.toggleAsset(asset);
  }

  private consumeSelectionEvent(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  startGuidedEdit(): void {
    if (!this.selectedPairs.size) {
      this.error = 'Seleziona almeno un presidio e una scadenza da modificare.';
      return;
    }
    const selectedByAsset = new Map<number, string[]>();
    for (const pair of this.selectedPairs) {
      const separator = pair.indexOf(':');
      const assetId = Number(pair.slice(0, separator));
      const fieldKey = pair.slice(separator + 1);
      const keys = selectedByAsset.get(assetId) || [];
      keys.push(fieldKey);
      selectedByAsset.set(assetId, keys);
    }
    const today = this.todayDateOnly();
    this.steps = [...selectedByAsset.entries()].map(([assetId, fieldKeys]) => {
      const asset = this.assets.find((item) => item.id === assetId)!;
      const fields = this.guidedFields(asset.typeKey).filter((field) => fieldKeys.includes(field.key));
      const currentValues = this.parseCustomFields(asset.customFields);
      const values: Record<string, any> = {};
      for (const field of fields) {
        const currentValue = currentValues[field.key];
        values[field.key] = field.type === 'boolean' ? currentValue === true : String(currentValue ?? '');
      }
      for (let pass = 0; pass < 2; pass += 1) {
        for (const field of fields) {
          const suggestion = this.suggestedValue(field, today, { ...currentValues, ...values });
          if (suggestion) values[field.key] = suggestion;
        }
      }
      return {
        asset,
        fields,
        values,
        remindDays: { ...(asset.remindDays || {}) },
        interventionDate: today,
        attachmentFiles: {},
        removedAttachmentIds: [],
        done: false,
        error: '',
      };
    }).sort((a, b) => this.assetLabel(a.asset).localeCompare(this.assetLabel(b.asset), 'it'));
    this.currentIndex = 0;
    this.mobileQueueOpen = false;
    this.phase = 'edit';
    this.error = '';
    this.scrollToPageTop();
  }

  selectStep(index: number): void {
    this.currentIndex = index;
    this.mobileQueueOpen = false;
    this.scrollToPageTop();
  }

  toggleMobileQueue(): void {
    this.mobileQueueOpen = !this.mobileQueueOpen;
  }

  onInterventionDateChange(step: GuidedStep): void {
    const storedValues = this.parseCustomFields(step.asset.customFields);
    for (let pass = 0; pass < 2; pass += 1) {
      for (const field of step.fields) {
        const suggestion = this.suggestedValue(field, step.interventionDate, { ...storedValues, ...step.values });
        if (suggestion) step.values[field.key] = suggestion;
      }
    }
    step.done = false;
  }

  onGuidedValueChange(step: GuidedStep, changedField: any): void {
    const storedValues = this.parseCustomFields(step.asset.customFields);
    for (const field of step.fields) {
      if (field.key === changedField.key || field.bulkUpdateMode !== 'date_offset') continue;
      if (String(field.bulkUpdateSourceField || '') !== changedField.key) continue;
      const suggestion = this.suggestedValue(field, step.interventionDate, { ...storedValues, ...step.values });
      if (suggestion) step.values[field.key] = suggestion;
    }
    this.markDirty(step);
  }

  markCurrentDone(andNext = true): void {
    const step = this.currentStep;
    if (!step) return;
    const missing = step.fields.find((field) => {
      if (field.type === 'attachment') {
        return field.required && !this.guidedAttachmentCount(step, field.key);
      }
      const value = step.values[field.key];
      if (field.required && (value === null || value === undefined || String(value).trim() === '')) return true;
      return field.type === 'date' && value && !/^\d{4}-\d{2}-\d{2}$/.test(String(value));
    });
    if (missing) {
      step.error = missing.type === 'attachment'
        ? `Allega almeno un file per “${missing.label}”.`
        : `Inserisci un valore valido per “${missing.label}”.`;
      step.done = false;
      return;
    }
    step.error = '';
    step.done = true;
    this.persistDraft();
    if (!andNext) return;
    const nextPending = this.steps.findIndex((item, index) => index > this.currentIndex && !item.done);
    const firstPending = this.steps.findIndex((item) => !item.done);
    if (nextPending >= 0) {
      this.currentIndex = nextPending;
      this.scrollToPageTop();
    } else if (firstPending >= 0) {
      this.currentIndex = firstPending;
      this.scrollToPageTop();
    }
  }

  markDirty(step: GuidedStep): void {
    step.done = false;
    step.error = '';
  }

  toggleStepBoolean(step: GuidedStep, field: any): void {
    step.values[field.key] = step.values[field.key] !== true;
    this.markDirty(step);
  }

  toggleStepBooleanFromClick(event: Event, step: GuidedStep, field: any): void {
    this.consumeSelectionEvent(event);
    this.toggleStepBoolean(step, field);
  }

  onGuidedAttachmentChange(step: GuidedStep, field: any, event: Event): void {
    const files = Array.from((event.target as HTMLInputElement).files || []);
    if (!files.length) return;
    const current = step.attachmentFiles[field.key] || [];
    step.attachmentFiles[field.key] = field.attachmentMultiple === true ? [...current, ...files] : [files[0]];
    if (field.attachmentMultiple !== true) {
      step.removedAttachmentIds = [
        ...new Set([
          ...step.removedAttachmentIds,
          ...this.guidedExistingAttachments(step, field.key).map((item) => item.id),
        ]),
      ];
    }
    (event.target as HTMLInputElement).value = '';
    this.markDirty(step);
  }

  guidedExistingAttachments(step: GuidedStep, fieldKey: string): Array<{ id: string; originalName: string; fieldKey?: string | null }> {
    const removed = new Set(step.removedAttachmentIds);
    return (step.asset.attachments || []).filter((item) => item.fieldKey === fieldKey && !removed.has(item.id));
  }

  openGuidedExistingAttachment(
    step: GuidedStep,
    attachment: { id: string; originalName: string; fieldKey?: string | null },
  ): void {
    const request = this.http.get(
      this.global.url +
        `admin/deadlines/customer-assets/registry/${encodeURIComponent(String(step.asset.id))}` +
        `/attachments/${encodeURIComponent(String(attachment.id))}`,
      { responseType: 'blob' },
    );
    this.attachmentViewer.open(attachment, request);
  }

  openGuidedNewAttachment(file: File): void {
    this.attachmentViewer.openBlob(file, file.name);
  }

  guidedNewAttachments(step: GuidedStep, fieldKey: string): File[] {
    return step.attachmentFiles[fieldKey] || [];
  }

  removeGuidedExistingAttachment(step: GuidedStep, attachmentId: string): void {
    step.removedAttachmentIds = [...new Set([...step.removedAttachmentIds, attachmentId])];
    this.markDirty(step);
  }

  removeGuidedNewAttachment(step: GuidedStep, fieldKey: string, index: number): void {
    step.attachmentFiles[fieldKey] = (step.attachmentFiles[fieldKey] || []).filter((_, itemIndex) => itemIndex !== index);
    this.markDirty(step);
  }

  guidedAttachmentCount(step: GuidedStep, fieldKey: string): number {
    return this.guidedExistingAttachments(step, fieldKey).length + this.guidedNewAttachments(step, fieldKey).length;
  }

  async submit(): Promise<void> {
    if (this.saving || !this.completedCount) return;
    if (this.pendingCount && !await this.popup.confirm(
      `Hai ancora ${this.pendingCount} presidi non compilati. Vuoi salvare soltanto i ${this.completedCount} completati?`,
      'Presidi non completati',
      { confirmLabel: `Salva ${this.completedCount} completati` },
    )) return;

    const completed = this.steps.filter((step) => step.done);
    this.saving = true;
    const payload = {
      items: completed.map((step) => ({
          assetId: step.asset.id,
          expectedUpdatedAt: step.asset.updatedAt,
          interventionDate: step.interventionDate,
          updates: step.fields.map((field) => ({
            fieldKey: field.key,
            scope: field.scope,
            property: field.property,
            value: step.values[field.key],
            remindDays: step.remindDays[field.key],
            removedAttachmentIds: field.type === 'attachment' ? step.removedAttachmentIds : undefined,
          })),
        })),
    };
    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));
    const manifest: Array<{ assetId: number; fieldKey: string }> = [];
    for (const step of completed) {
      for (const field of step.fields.filter((item) => item.type === 'attachment')) {
        for (const file of this.guidedNewAttachments(step, field.key)) {
          formData.append('attachments', file);
          manifest.push({ assetId: step.asset.id, fieldKey: field.key });
        }
      }
    }
    formData.append('attachmentManifest', JSON.stringify(manifest));
    this.http.post<any>(
      this.global.url + 'admin/deadlines/customer-assets/registry/guided-update',
      formData,
    ).subscribe({
      next: (result) => {
        this.saving = false;
        this.applyGuidedSaveResult(result);
        this.phase = 'complete';
        this.success = `${Number(result?.updatedCount || 0)} presidi aggiornati correttamente.`;
        sessionStorage.removeItem(this.storageKey());
      },
      error: (err) => {
        this.saving = false;
        this.error = err?.error?.error || 'Modifica guidata non riuscita.';
      },
    });
  }

  private applyGuidedSaveResult(result: any): void {
    const rows = Array.isArray(result?.results) ? result.results : [];
    const byAssetId = new Map(rows.map((row: any) => [String(row.assetId), row]));
    this.assets = this.assets.map((asset) => {
      const row: any = byAssetId.get(String(asset.id));
      if (!row || row.status !== 'updated') return asset;
      return {
        ...asset,
        attachments: Array.isArray(row.attachments) ? row.attachments : asset.attachments,
        customFields: row.customFields ?? asset.customFields,
        updatedAt: row.updatedAt || asset.updatedAt,
      };
    });
    this.steps = this.steps.map((step) => {
      const row: any = byAssetId.get(String(step.asset.id));
      if (!row || row.status !== 'updated') return step;
      const asset = this.assets.find((item) => String(item.id) === String(step.asset.id)) || step.asset;
      return {
        ...step,
        asset,
        attachmentFiles: {},
        removedAttachmentIds: [],
      };
    });
  }

  async cancelGuidedUpdate(): Promise<void> {
    const hasWorkToDiscard = this.phase !== 'complete' &&
      (this.selectedPairs.size > 0 || this.steps.length > 0);
    if (hasWorkToDiscard && !await this.popup.confirm(
      'Vuoi annullare la modifica guidata? Le selezioni e le bozze preparate verranno eliminate.',
      'Annullare la modifica guidata?',
      { type: 'error', confirmLabel: 'Elimina bozza' },
    )) return;

    sessionStorage.removeItem(this.storageKey());
    const usesDesktopShell = typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 992px)').matches;
    this.router.navigateByUrl(
      usesDesktopShell
        ? '/homeAdmin/customer-asset-deadlines'
        : '/customer-asset-deadlines',
    );
  }

  back(): void {
    void this.cancelGuidedUpdate();
  }

  private assetLabel(asset: GuidedAsset): string {
    if (asset.displayIdentifier) return asset.displayIdentifier;
    const type = this.types.find((item) => item.key === asset.typeKey);
    const identityField = (type?.fields || []).find((field: any) => field.unique === true && field.type !== 'attachment');
    const configuredValue = identityField
      ? String(this.parseCustomFields(asset.customFields)[identityField.key] ?? '').trim()
      : '';
    return configuredValue || asset.code || `PR-${String(asset.id).padStart(6, '0')}`;
  }

  assetDisplayLabel(asset: GuidedAsset): string {
    return `${this.assetLabel(asset)} · ${this.typeLabel(asset.typeKey)}`;
  }

  private assetSearchText(asset: GuidedAsset): string {
    return `${this.assetLabel(asset)} ${asset.location || ''} ${asset.serialNumber || ''} ${this.typeLabel(asset.typeKey)}`
      .toLocaleLowerCase('it');
  }

  private parseCustomFields(value: GuidedAsset['customFields']): Record<string, any> {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(String(value || '{}')); } catch { return {}; }
  }

  customFieldLines(asset: GuidedAsset): Array<{ label: string; value: string }> {
    const values = this.parseCustomFields(asset.customFields);
    const selectedKeys = new Set(this.currentStep?.fields.map((field) => field.key) || []);
    const type = this.types.find((item) => item.key === asset.typeKey);
    return (type?.fields || [])
      .filter((field: any) => !selectedKeys.has(field.key) && values[field.key] !== undefined && values[field.key] !== '')
      .map((field: any) => ({ label: field.label, value: String(values[field.key]) }));
  }

  isStepField(step: GuidedStep, key: string): boolean {
    return step.fields.some((field) => field.key === key);
  }

  guidedCalculationHint(field: any, typeKey: string): string {
    if (field.bulkUpdateMode === 'today') return 'Data odierna';
    const sourceKey = String(field.bulkUpdateSourceField || '');
    const sourceLabel = this.guidedFields(typeKey).find((item) => item.key === sourceKey)?.label || sourceKey;
    const value = Number(field.bulkUpdateOffsetValue) || 0;
    const unit = field.bulkUpdateOffsetUnit === 'days' ? 'giorni' : 'mesi';
    return `${sourceLabel} + ${value} ${unit}`;
  }

  inputType(field: any): string {
    if (field.type === 'date') return 'date';
    if (field.type === 'number') return 'number';
    return 'text';
  }

  private suggestedValue(field: any, interventionDate: string, values: Record<string, any> = {}): string {
    if (field.bulkUpdateMode === 'today') return interventionDate;
    if (field.bulkUpdateMode === 'date_offset') {
      const sourceKey = String(field.bulkUpdateSourceField || '');
      const sourceValue = String(values[sourceKey] || '');
      const offset = Number(field.bulkUpdateOffsetValue) || 0;
      return field.bulkUpdateOffsetUnit === 'days'
        ? this.addDays(sourceValue, offset)
        : this.addMonths(sourceValue, offset);
    }
    return '';
  }

  private todayDateOnly(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private scrollToPageTop(): void {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.querySelector<HTMLElement>('.mobile-layout')
        ?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }

  private addDays(value: string, days: number): string {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return '';
    const result = new Date(Date.UTC(year, month - 1, day + days));
    return result.toISOString().slice(0, 10);
  }

  private addMonths(value: string, months: number): string {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return '';
    const result = new Date(Date.UTC(year, month - 1 + months, 1));
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
    return result.toISOString().slice(0, 10);
  }

  private persistDraft(): void {
    sessionStorage.setItem(this.storageKey(), JSON.stringify({
      version: 1,
      customer: this.selectedCustomer,
      currentIndex: this.currentIndex,
      steps: this.steps.map((step) => ({
        asset: step.asset,
        fieldKeys: step.fields.map((field) => field.key),
        values: step.values,
        remindDays: step.remindDays,
        interventionDate: step.interventionDate,
        attachmentFiles: {},
        removedAttachmentIds: step.removedAttachmentIds,
        done: step.done,
      })),
      updatedAt: new Date().toISOString(),
    }));
  }

  private restoreDraft(): void {
    const raw = sessionStorage.getItem(this.storageKey());
    if (!raw || this.phase !== 'prepare') return;
    try {
      const saved = JSON.parse(raw);
      if (saved?.version !== 1 || !Array.isArray(saved.steps) || !saved.steps.length) return;
      const restored = saved.steps.map((item: any) => {
        const currentAsset = this.assets.find((asset) => Number(asset.id) === Number(item.asset?.id));
        if (!currentAsset) return null;
        const asset = { ...currentAsset, updatedAt: item.asset?.updatedAt || currentAsset.updatedAt };
        const fields = this.guidedFields(asset.typeKey)
          .filter((field) => (item.fieldKeys || []).includes(field.key));
        if (!fields.length) return null;
        return {
          asset,
          fields,
          values: { ...(item.values || {}) },
          remindDays: { ...(item.remindDays || {}) },
          interventionDate: String(item.interventionDate || ''),
          attachmentFiles: {},
          removedAttachmentIds: [...(item.removedAttachmentIds || [])],
          done: item.done === true && !fields.some((field) => field.type === 'attachment'),
          error: '',
        } as GuidedStep;
      }).filter((step: GuidedStep | null): step is GuidedStep => !!step);
      if (!restored.length) return;
      this.selectedCustomer = String(saved.customer || restored[0].asset.numeroCliente);
      this.steps = restored;
      this.currentIndex = Math.min(Math.max(Number(saved.currentIndex) || 0, 0), restored.length - 1);
      this.phase = 'edit';
    } catch {
      sessionStorage.removeItem(this.storageKey());
    }
  }

  private storageKey(): string {
    return 'mvanager-customer-assets-guided-update';
  }
}
