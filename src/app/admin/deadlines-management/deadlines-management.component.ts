import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { AttachmentViewerService } from '../../shared/attachment-viewer/attachment-viewer.service';

type DeadlineKind = 'employee' | 'vehicle' | 'equipment' | 'customer' | 'customerAsset' | 'internal';
type DeadlineStatus = 'ok' | 'warning' | 'expired' | 'planned';

interface DeadlineAttachment {
  id: string;
  originalName: string;
  storedName?: string;
  size: number;
  uploadedAt: string;
  documentFolder?: string;
  documentFilename?: string;
  documentManagedBy?: string;
  fieldKey?: string | null;
}

interface EmployeeTarget {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  cellulare?: string;
}

interface VehicleTarget {
  id: number;
  name: string;
  plate?: string | null;
}

interface GenericTarget {
  id: string;
  targetKey: string;
  targetLabel: string;
  numeroCliente?: string;
  quantity?: number;
}

interface DeadlineSummary {
  expiredCount: number;
  warningCount: number;
  pendingCount: number;
  alertCount: number;
  totalCount: number;
  status: DeadlineStatus;
}

interface DeadlineRecord {
  id: number;
  entityType: DeadlineKind;
  employeeId?: number;
  vehicleId?: number;
  targetKey?: string;
  targetLabel?: string;
  sourceFieldKey?: string | null;
  folder?: string;
  title: string;
  description: string;
  dueDate: string;
  isPending?: boolean;
  remindDays: number | null;
  attachments: DeadlineAttachment[];
  status: DeadlineStatus;
  daysUntil: number | null;
  plannedAppointmentId?: number | null;
  plannedFor?: string | null;
  planned?: boolean;
  planningDue?: boolean;
  planningDaysUntil?: number | null;
  employee?: EmployeeTarget;
  vehicle?: VehicleTarget;
}

interface DeadlineGroup {
  id: string | number;
  label: string;
  subtitle: string;
  deadlines: DeadlineRecord[];
  summary: DeadlineSummary;
  auditHistory?: CustomerAssetAuditEntry[];
  typeKey?: string;
  assetDetails?: CustomerAssetDetail[];
}

interface CustomerAssetDetail {
  key: string;
  label: string;
  type: string;
  value: string;
  attachments: DeadlineAttachment[];
}

interface CustomerAssetAuditEntry {
  action: string;
  summary: string;
  changes?: Record<string, any>;
  snapshot: Record<string, any>;
  actorEmail?: string | null;
  createdAt: string;
  attachmentItems?: CustomerAssetAuditAttachmentItem[];
}

interface CustomerAssetAuditAttachmentItem {
  attachment: DeadlineAttachment;
  label: string;
}

interface CustomerAssetDeadlineAction {
  fieldKey: string;
  label: string;
  totalCount: number;
  alertCount: number;
}

interface CustomerAssetTypeGroup {
  key: string;
  label: string;
  assets: DeadlineGroup[];
  summary: DeadlineSummary;
  actions: CustomerAssetDeadlineAction[];
}

interface DeadlineFolderGroup {
  folder: string;
  deadlines: DeadlineRecord[];
  summary: DeadlineSummary;
}

interface DeadlineHistoryEntry {
  id: number;
  deadlineId: number;
  action: string;
  summary: string;
  changes: Record<string, any>;
  snapshot: Record<string, any>;
  attachments?: DeadlineAttachment[];
  actorEmail?: string | null;
  createdAt: string;
}

interface DeadlineHistoryDayGroup {
  key: string;
  entries: DeadlineHistoryEntry[];
}

@Component({
  selector: 'app-deadlines-management',
  templateUrl: './deadlines-management.component.html',
  styleUrls: ['./deadlines-management.component.css'],
})
export class DeadlinesManagementComponent implements OnInit {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('deadlineForm') deadlineForm?: ElementRef<HTMLElement>;

  kind: DeadlineKind = 'employee';
  entities: Array<EmployeeTarget | VehicleTarget | GenericTarget> = [];
  deadlines: DeadlineRecord[] = [];
  groups: DeadlineGroup[] = [];
  private customerAssetGroupsByCustomer: Record<string, DeadlineGroup[]> = {};
  selectedGroup: DeadlineGroup | null = null;
  showArchivedCustomerAssets = false;

  loading = false;
  entitiesLoading = false;
  saving = false;
  showForm = false;
  error = '';
  success = '';
  preselectedEntityId: string | number | null = null;
  pendingFiles: File[] = [];
  isAttachmentDragActive = false;
  editingDeadline: DeadlineRecord | null = null;
  formAttachments: DeadlineAttachment[] = [];
  historyByDeadlineId: Record<number, DeadlineHistoryEntry[]> = {};
  historyOpenByDeadlineId: Record<number, boolean> = {};
  historyLoadingByDeadlineId: Record<number, boolean> = {};
  expandedHistoryDayKeys = new Set<string>();
  searchText = '';
  showCustomersWithoutDeadlines = false;
  internalDeadlineCategories: Array<{ id: number; name: string; certifications: any[] }> = [];
  selectedInternalCategoryIds: number[] = [];
  selectedDeadlineIds = new Set<number>();
  selectedMonth = new Date().toISOString().slice(0, 7);
  exportingPdf = false;
  showPdfExport = false;
  pdfExportMode: 'customers' | 'assets' = 'customers';
  pdfCustomers: Array<{ id: string; label: string; assetCount: number; deadlineCount: number }> = [];
  selectedPdfCustomerIds = new Set<string>();
  pdfCustomersLoading = false;
  pdfCustomersError = '';
  showDeadlineDateFilter = false;
  deadlineFilterDraftStart = '';
  deadlineFilterDraftEnd = '';
  deadlineFilterStart = '';
  deadlineFilterEnd = '';
  selectedCustomerAssetIds = new Set<string>();
  showBulkCustomerAssetForm = false;
  bulkInterventionDate = '';
  bulkSaving = false;
  quickAssetTypeKey = '';
  quickDeadlineFieldKey = '';
  quickDeadlineScope: 'alerts' | 'all' = 'alerts';
  customerAssetSortMode: 'type' | 'status' | 'dueDate' | 'asset' = 'type';
  expandedCustomerAssetTypeKeys = new Set<string>();
  expandedCustomerAssetIds = new Set<string>();
  bulkRows: Array<{
    typeKey: string;
    typeLabel: string;
    fieldKey: string;
    label: string;
    type: string;
    mode: string;
    sourceField: string;
    offsetValue: number;
    offsetUnit: 'days' | 'months';
    calculationHint: string;
    options: string[];
    included: boolean;
    value: any;
  }> = [];

  form: {
    entityId: string | number | null;
    targetLabel: string;
    folder: string;
    title: string;
    description: string;
    dueDate: string;
    remindDays: string;
  } = {
    entityId: null,
    targetLabel: '',
    folder: 'Generale',
    title: '',
    description: '',
    dueDate: '',
    remindDays: '',
  };

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private host: ElementRef<HTMLElement>,
    public globalService: GlobalService,
    private popup: PopupServiceService,
    private globalAttachmentViewer: AttachmentViewerService,
  ) {}

  ngOnInit(): void {
    this.kind =
      this.route.snapshot.data['kind'] === 'vehicle'
        ? 'vehicle'
        : this.route.snapshot.data['kind'] === 'equipment'
          ? 'equipment'
          : this.route.snapshot.data['kind'] === 'customer'
            ? 'customer'
            : this.route.snapshot.data['kind'] === 'customerAsset'
              ? 'customerAsset'
            : this.route.snapshot.data['kind'] === 'internal'
              ? 'internal'
              : 'employee';

    const paramKey =
      this.kind === 'employee'
        ? 'employeeId'
        : this.kind === 'vehicle'
          ? 'vehicleId'
          : 'targetKey';
    const rawPreselected = this.route.snapshot.queryParamMap.get(paramKey);
    this.preselectedEntityId =
      this.kind === 'employee' || this.kind === 'vehicle'
        ? this.parseNumericId(rawPreselected)
        : rawPreselected;
    this.showArchivedCustomerAssets = this.kind === 'customerAsset' && this.route.snapshot.queryParamMap.get('archived') === '1';

    this.resetForm();
    this.loadAll();
  }

  get entityLabel(): string {
    if (this.kind === 'employee') return 'dipendente';
    if (this.kind === 'vehicle') return 'mezzo';
    if (this.kind === 'equipment') return 'attrezzatura';
    if (this.kind === 'customer') return 'cliente';
    if (this.kind === 'customerAsset') return this.globalService.getTenantCustomerAssetsConfig().singularLabel || 'presidio';
    return 'area aziendale';
  }

  get pageTitle(): string {
    if (this.kind === 'employee') return 'Scadenze dipendenti';
    if (this.kind === 'vehicle') return 'Scadenze mezzi';
    if (this.kind === 'equipment') return 'Scadenze attrezzature';
    if (this.kind === 'customer') return 'Scadenze clienti';
    if (this.kind === 'customerAsset') {
      const title = `Scadenze ${this.globalService.getTenantCustomerAssetsConfig().moduleLabel || 'presidi presso clienti'}`;
      return this.showArchivedCustomerAssets ? `Storico eliminati · ${title}` : title;
    }
    return 'Scadenze interne';
  }

  get pageDescription(): string {
    if (this.kind === 'employee') {
      return 'Apri un dipendente per vedere cartelle, file e scadenze collegate.';
    }
    if (this.kind === 'vehicle') {
      return 'Apri un mezzo per vedere cartelle, file e scadenze collegate.';
    }
    if (this.kind === 'equipment') {
      return 'Organizza certificazioni, controlli e documenti delle attrezzature.';
    }
    if (this.kind === 'customer') {
      return 'Controlla le scadenze collegate ai clienti, divise per cartelle.';
    }
    if (this.kind === 'customerAsset') return `Programma manutenzioni e controlli dei ${this.globalService.getTenantCustomerAssetsConfig().moduleLabel || 'presidi installati presso i clienti'}.`;
    return 'Gestisci scadenze aziendali interne, cartelle e allegati.';
  }

  get totalExpired(): number {
    return this.summaryGroups.reduce((acc, group) => acc + group.summary.expiredCount, 0);
  }

  get totalWarning(): number {
    return this.summaryGroups.reduce((acc, group) => acc + group.summary.warningCount, 0);
  }

  get totalPending(): number {
    return this.summaryGroups.reduce((acc, group) => acc + group.summary.pendingCount, 0);
  }

  get totalAlerts(): number {
    return this.totalExpired + this.totalWarning;
  }

  get hasActiveSearch(): boolean {
    return !!this.normalizeSearch(this.searchText);
  }

  get hasActiveDeadlineDateFilter(): boolean {
    return this.kind === 'customerAsset' && !!this.deadlineFilterStart && !!this.deadlineFilterEnd;
  }

  get hasActiveListFilter(): boolean {
    return this.hasActiveSearch || this.hasActiveDeadlineDateFilter;
  }

  private get summaryGroups(): DeadlineGroup[] {
    if (!this.hasActiveDeadlineDateFilter) return this.groups;
    return this.groups
      .map((group) => this.filterCustomerGroupForDeadlineRange(group))
      .filter((group): group is DeadlineGroup => !!group);
  }

  get searchPlaceholder(): string {
    if (this.kind === 'employee') {
      return 'Cerca dipendente, cartella, scadenza o allegato';
    }
    if (this.kind === 'vehicle') {
      return 'Cerca mezzo, targa, cartella, scadenza o allegato';
    }
    if (this.kind === 'equipment') {
      return 'Cerca attrezzatura, cartella, scadenza o allegato';
    }
    if (this.kind === 'customer') {
      return 'Cerca cliente, codice, cartella, scadenza o allegato';
    }
    if (this.kind === 'customerAsset') return 'Cerca codice, matricola, cliente, cartella o scadenza';
    return 'Cerca area, cartella, scadenza o allegato';
  }

  get emptyStateTitle(): string {
    if (this.kind === 'employee') return 'Nessun dipendente disponibile.';
    if (this.kind === 'vehicle') return 'Nessun mezzo disponibile.';
    if (this.kind === 'equipment') return 'Nessuna attrezzatura creata.';
    if (this.kind === 'customer') return 'Nessun cliente disponibile.';
    if (this.kind === 'customerAsset') return `Nessun ${this.entityLabel} disponibile.`;
    return 'Nessuna area interna creata.';
  }

  get emptyStateMessage(): string {
    if (this.kind === 'employee') {
      return 'Crea prima un dipendente, poi potrai aggiungere le sue scadenze da questa pagina.';
    }
    if (this.kind === 'vehicle') {
      return 'Crea prima un mezzo, poi potrai aggiungere revisione, assicurazione e altre scadenze.';
    }
    if (this.kind === 'equipment') {
      return 'Crea prima un\'attrezzatura in Gestione attrezzature, poi potrai collegare revisioni, certificazioni e documenti.';
    }
    if (this.kind === 'customer') {
      return 'Crea prima un cliente, poi potrai collegare le sue scadenze.';
    }
    if (this.kind === 'customerAsset') return `Registra prima un ${this.entityLabel} nella sezione ${this.globalService.getTenantCustomerAssetsConfig().moduleLabel || 'Presidi presso clienti'}.`;
    return 'Inserisci la prima scadenza interna: dopo il salvataggio comparira la riga con dettaglio e nuove scadenze.';
  }

  get emptyStateActionLabel(): string {
    if (this.kind === 'equipment') return 'Vai a gestione attrezzature';
    if (this.kind === 'customerAsset') return `Vai a gestione ${this.globalService.getTenantCustomerAssetsConfig().moduleLabel || 'presidi'}`;
    if (this.kind === 'internal') return '+ Crea prima scadenza interna';
    return '+ Aggiungi scadenza';
  }

  get primaryCreateLabel(): string {
    return this.kind === 'customerAsset'
      ? '+ Aggiungi presidi'
      : '+ Aggiungi scadenza';
  }

  get filteredGroups(): DeadlineGroup[] {
    const query = this.normalizeSearch(this.searchText);
    let visibleGroups =
      this.kind === 'customer' && !this.showCustomersWithoutDeadlines && !query
        ? this.groups.filter((group) => group.summary.totalCount > 0)
        : this.groups;
    if (this.hasActiveDeadlineDateFilter) {
      visibleGroups = visibleGroups
        .map((group) => this.filterCustomerGroupForDeadlineRange(group))
        .filter((group): group is DeadlineGroup => !!group);
    }
    if (!query) return visibleGroups;

    return visibleGroups
      .map((group) => this.filterGroupForSearch(group, query))
      .filter((group): group is DeadlineGroup => !!group);
  }

  get customersWithoutDeadlinesCount(): number {
    if (this.kind !== 'customer') return 0;
    return this.groups.filter((group) => group.summary.totalCount === 0).length;
  }

  get selectedGroupView(): DeadlineGroup | null {
    if (!this.selectedGroup) return null;

    let currentGroup =
      this.groups.find((group) => String(group.id) === String(this.selectedGroup?.id)) ||
      this.selectedGroup;
    if (this.hasActiveDeadlineDateFilter) {
      currentGroup = this.filterCustomerGroupForDeadlineRange(currentGroup) || {
        ...currentGroup,
        deadlines: [],
        summary: this.summarize([]),
      };
    }
    const query = this.normalizeSearch(this.searchText);
    if (!query) return currentGroup;

    return (
      this.filterGroupForSearch(currentGroup, query) || {
        ...currentGroup,
        deadlines: [],
        summary: this.summarize([]),
      }
    );
  }

  get selectedFolderGroups(): DeadlineFolderGroup[] {
    if (!this.selectedGroupView) return [];
    if (this.hasActiveSearch && this.selectedGroupView.deadlines.length === 0) {
      return [];
    }
    return this.getFolderGroups(this.selectedGroupView);
  }

  /** Nei presidi la lista principale è per cliente; qui recuperiamo i presidi del cliente aperto. */
  get selectedCustomerAssetGroups(): DeadlineGroup[] {
    if (this.kind !== 'customerAsset' || !this.selectedGroupView) return [];
    let assets = this.customerAssetGroupsByCustomer[String(this.selectedGroupView.id)] || [];
    if (this.hasActiveDeadlineDateFilter) {
      assets = assets
        .map((asset) => this.filterDeadlineGroupForRange(asset))
        .filter((asset): asset is DeadlineGroup => !!asset);
    }
    const query = this.normalizeSearch(this.searchText);
    if (!query) return assets;
    return assets
      .map((asset) => this.filterGroupForSearch(asset, query))
      .filter((asset): asset is DeadlineGroup => !!asset);
  }

  get selectedCustomerAssetTypeGroups(): CustomerAssetTypeGroup[] {
    const configTypes = this.globalService.getTenantCustomerAssetsConfig().types || [];
    const typeLabels = new Map(configTypes.map((type) => [type.key, type.label]));
    const grouped = new Map<string, DeadlineGroup[]>();
    for (const asset of this.selectedCustomerAssetGroups) {
      const key = String(asset.typeKey || 'altro');
      const assets = grouped.get(key) || [];
      assets.push(asset);
      grouped.set(key, assets);
    }
    return [...grouped.entries()].map(([key, assets]) => {
      const deadlines = assets.flatMap((asset) => asset.deadlines);
      const configuredFields = (configTypes.find((type) => type.key === key)?.fields || [])
        .filter((field) => field.type === 'date' && field.isDeadline);
      const actions = configuredFields.map((field) => {
        const matching = deadlines.filter((deadline) =>
          deadline.sourceFieldKey === field.key ||
          (!deadline.sourceFieldKey && deadline.title === field.label),
        );
        return {
          fieldKey: field.key,
          label: field.label,
          totalCount: matching.length,
          alertCount: matching.filter((deadline) => this.isDeadlineAlert(deadline)).length,
        };
      }).filter((action) => action.totalCount > 0);
      return {
        key,
        label: typeLabels.get(key) || assets[0]?.label || 'Altri presidi',
        assets: assets.slice().sort((a, b) => this.compareCustomerAssets(a, b)),
        summary: this.summarize(deadlines),
        actions,
      };
    }).sort((a, b) => {
      if (this.customerAssetSortMode === 'status') {
        const severityDiff = this.statusRank(a.summary.status) - this.statusRank(b.summary.status);
        if (severityDiff) return severityDiff;
      }
      if (this.customerAssetSortMode === 'dueDate') {
        const dateDiff = this.earliestDeadlineDate(a.assets).localeCompare(this.earliestDeadlineDate(b.assets));
        if (dateDiff) return dateDiff;
      }
      if (this.customerAssetSortMode === 'asset') {
        const assetDiff = String(a.assets[0]?.label || '').localeCompare(
          String(b.assets[0]?.label || ''),
          'it',
          { numeric: true },
        );
        if (assetDiff) return assetDiff;
      }
      return a.label.localeCompare(b.label, 'it');
    });
  }

  get quickCustomerAssetTypeGroup(): CustomerAssetTypeGroup | null {
    return this.selectedCustomerAssetTypeGroups.find((group) => group.key === this.quickAssetTypeKey)
      || this.selectedCustomerAssetTypeGroups[0]
      || null;
  }

  get quickDeadlineActions(): CustomerAssetDeadlineAction[] {
    return this.quickCustomerAssetTypeGroup?.actions || [];
  }

  get quickDeadlineAction(): CustomerAssetDeadlineAction | null {
    return this.quickDeadlineActions.find((action) => action.fieldKey === this.quickDeadlineFieldKey)
      || this.quickDeadlineActions[0]
      || null;
  }

  get quickSelectionCount(): number {
    const action = this.quickDeadlineAction;
    if (!action) return 0;
    return this.quickDeadlineScope === 'alerts' ? action.alertCount : action.totalCount;
  }

  get selectedCustomerAssetDeadlineCount(): number {
    return this.selectedDeadlines.filter((deadline) => deadline.entityType === 'customerAsset').length;
  }

  get detailListLabel(): string {
    return this.kind === 'customerAsset' ? 'clienti' : this.entityLabel;
  }

  get canSave(): boolean {
    return (
      !!this.form.entityId &&
      !!this.normalizeFieldValue(this.form.folder) &&
      !!this.normalizeFieldValue(this.form.title) &&
      !!this.normalizeFieldValue(this.form.dueDate)
    );
  }

  get canCreate(): boolean {
    return this.globalService.hasPermission(
      this.permissionKey('CREATE'),
    );
  }

  get canEdit(): boolean {
    return this.globalService.hasPermission(
      this.permissionKey('EDIT'),
    );
  }

  get canDelete(): boolean {
    return this.globalService.hasPermission(
      this.permissionKey('DELETE'),
    );
  }

  get canPlan(): boolean {
    return this.canEdit && this.globalService.hasPermission('CALENDAR_EVENT_MANAGE');
  }

  get selectedDeadlines(): DeadlineRecord[] {
    return this.deadlines.filter((deadline) => this.selectedDeadlineIds.has(Number(deadline.id)));
  }

  get isEditing(): boolean {
    return !!this.editingDeadline;
  }

  get formTitle(): string {
    return this.isEditing ? 'Aggiorna scadenza' : 'Nuova scadenza';
  }

  get formSubtitle(): string {
    return this.isEditing
      ? 'Aggiorna i dati della scadenza e gestisci gli allegati esistenti.'
      : `Seleziona il ${this.entityLabel} e compila i dati obbligatori.`;
  }

  get submitLabel(): string {
    return this.isEditing ? 'Salva modifiche' : 'Salva scadenza';
  }

  get editingEntityDisplayLabel(): string {
    if (!this.editingDeadline) return '';
    return this.getEntityLabel(this.getEntityFromDeadline(this.editingDeadline));
  }

  /** Cartelle già usate per questo tipo di scadenza, senza duplicati dovuti a maiuscole/spazi. */
  get folderSuggestions(): string[] {
    const folders = new Map<string, string>();
    for (const deadline of this.deadlines) {
      const folder = String(deadline.folder || '').trim();
      if (folder) folders.set(folder.toLocaleLowerCase('it'), folder);
    }
    return [...folders.values()].sort((a, b) => a.localeCompare(b, 'it'));
  }

  get folderSuggestionsId(): string {
    return `deadline-folders-${this.kind}`;
  }

  back(): void {
    if (this.showForm) {
      this.cancelForm();
      return;
    }
    if (this.selectedGroup) {
      this.closeGroup();
      return;
    }
    this.router.navigateByUrl('/homeAdmin');
  }

  get allPdfCustomersSelected(): boolean {
    return this.pdfCustomers.length > 0 &&
      this.pdfCustomers.every((customer) => this.selectedPdfCustomerIds.has(customer.id));
  }

  get somePdfCustomersSelected(): boolean {
    return this.selectedPdfCustomerIds.size > 0 && !this.allPdfCustomersSelected;
  }

  openMonthlyPdfExport(): void {
    if (this.exportingPdf || !/^\d{4}-\d{2}$/.test(this.selectedMonth)) return;
    if (this.kind !== 'customerAsset') {
      this.exportMonthlyPdf('deadlines');
      return;
    }
    this.showPdfExport = true;
    this.pdfExportMode = 'customers';
    this.pdfCustomers = [];
    this.selectedPdfCustomerIds = new Set();
    this.loadPdfCustomers();
  }

  openDeadlineDateFilter(): void {
    const month = /^\d{4}-\d{2}$/.test(this.selectedMonth)
      ? this.selectedMonth
      : this.todayDateOnly().slice(0, 7);
    const [year, monthNumber] = month.split('-').map(Number);
    this.deadlineFilterDraftStart = this.deadlineFilterStart || `${month}-01`;
    this.deadlineFilterDraftEnd = this.deadlineFilterEnd ||
      new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    this.showDeadlineDateFilter = true;
  }

  closeDeadlineDateFilter(): void {
    this.showDeadlineDateFilter = false;
  }

  applyDeadlineDateFilter(): void {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.deadlineFilterDraftStart) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(this.deadlineFilterDraftEnd)) {
      this.popup.showError('Inserisci una data iniziale e una data finale valide.');
      return;
    }
    if (this.deadlineFilterDraftStart > this.deadlineFilterDraftEnd) {
      this.popup.showError('La data iniziale non può essere successiva alla data finale.');
      return;
    }
    this.deadlineFilterStart = this.deadlineFilterDraftStart;
    this.deadlineFilterEnd = this.deadlineFilterDraftEnd;
    this.selectedGroup = null;
    this.selectedDeadlineIds = new Set();
    this.selectedCustomerAssetIds = new Set();
    this.showDeadlineDateFilter = false;
  }

  clearDeadlineDateFilter(): void {
    this.deadlineFilterStart = '';
    this.deadlineFilterEnd = '';
    this.deadlineFilterDraftStart = '';
    this.deadlineFilterDraftEnd = '';
    this.selectedGroup = null;
    this.showDeadlineDateFilter = false;
  }

  onSelectedMonthChange(): void {
    if (this.showPdfExport && this.kind === 'customerAsset' && /^\d{4}-\d{2}$/.test(this.selectedMonth)) {
      this.pdfCustomers = [];
      this.selectedPdfCustomerIds = new Set();
      this.loadPdfCustomers();
    }
  }

  closeMonthlyPdfExport(): void {
    if (this.exportingPdf) return;
    this.showPdfExport = false;
  }

  onPdfExportModeChange(mode: 'customers' | 'assets'): void {
    this.pdfExportMode = mode;
    if (mode === 'assets' && !this.selectedPdfCustomerIds.size) {
      this.selectedPdfCustomerIds = new Set(this.pdfCustomers.map((customer) => customer.id));
    }
  }

  togglePdfCustomer(customerId: string, checked: boolean): void {
    const selected = new Set(this.selectedPdfCustomerIds);
    if (checked) selected.add(customerId);
    else selected.delete(customerId);
    this.selectedPdfCustomerIds = selected;
  }

  toggleAllPdfCustomers(checked: boolean): void {
    this.selectedPdfCustomerIds = checked
      ? new Set(this.pdfCustomers.map((customer) => customer.id))
      : new Set();
  }

  confirmMonthlyPdfExport(): void {
    if (this.pdfExportMode === 'assets' && !this.selectedPdfCustomerIds.size) {
      this.popup.showError('Seleziona almeno un cliente da includere nel PDF.');
      return;
    }
    this.exportMonthlyPdf(this.pdfExportMode);
  }

  private loadPdfCustomers(): void {
    this.pdfCustomersLoading = true;
    this.pdfCustomersError = '';
    const endpoint = `admin/deadlines/export-pdf-customers?month=${encodeURIComponent(this.selectedMonth)}`;
    this.http.get<any[]>(this.globalService.url + endpoint).subscribe({
      next: (customers) => {
        this.pdfCustomers = (Array.isArray(customers) ? customers : []).map((customer) => ({
          id: String(customer.id || ''),
          label: String(customer.label || customer.id || ''),
          assetCount: Number(customer.assetCount || 0),
          deadlineCount: Number(customer.deadlineCount || 0),
        })).filter((customer) => customer.id);
        if (this.pdfExportMode === 'assets') {
          this.selectedPdfCustomerIds = new Set(this.pdfCustomers.map((customer) => customer.id));
        }
        this.pdfCustomersLoading = false;
      },
      error: (err) => {
        this.pdfCustomersLoading = false;
        this.pdfCustomersError = this.parseServerError(err);
      },
    });
  }

  exportMonthlyPdf(mode: 'customers' | 'assets' | 'deadlines' = 'deadlines'): void {
    if (this.exportingPdf || !/^\d{4}-\d{2}$/.test(this.selectedMonth)) return;
    this.exportingPdf = true;
    const customerIds = mode === 'assets' ? [...this.selectedPdfCustomerIds].join(',') : '';
    const endpoint = `admin/deadlines/export-pdf?kind=${encodeURIComponent(this.kind)}&month=${encodeURIComponent(this.selectedMonth)}&mode=${encodeURIComponent(mode)}${customerIds ? `&customerIds=${encodeURIComponent(customerIds)}` : ''}`;
    this.http.get(this.globalService.url + endpoint, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        const suffix = this.kind === 'customerAsset'
          ? (mode === 'customers' ? 'clienti' : 'presidi')
          : this.kind;
        anchor.download = `scadenze_${suffix}_${this.selectedMonth}.pdf`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.exportingPdf = false;
        this.showPdfExport = false;
      },
      error: (err) => {
        this.exportingPdf = false;
        this.error = this.parseServerError(err);
        this.popup.showError(this.error);
      },
    });
  }

  openPrimaryCreate(): void {
    if (!this.canCreate) return;
    if (this.kind === 'customerAsset') {
      this.router.navigate(['/homeAdmin/customer-assets'], { queryParams: { mode: 'create' } });
      return;
    }
    this.openAddForm();
  }

  openGuidedCustomerAssetUpdate(): void {
    this.router.navigateByUrl(this.responsiveAdminPath('customer-asset-deadlines/guided-update'));
  }

  private responsiveAdminPath(path: string): string {
    const normalized = String(path || '').replace(/^\/+/, '');
    const usesDesktopShell = typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 992px)').matches;
    return usesDesktopShell ? `/homeAdmin/${normalized}` : `/${normalized}`;
  }

  loadAll(): void {
    this.error = '';
    this.loading = true;
    this.entitiesLoading = true;
    this.selectedGroup = null;
    this.selectedDeadlineIds.clear();
    this.selectedCustomerAssetIds.clear();
    this.expandedCustomerAssetIds.clear();
    this.showBulkCustomerAssetForm = false;
    this.loadEntities();
    this.loadDeadlines();
  }

  isCustomerAssetSelected(asset: DeadlineGroup): boolean {
    return this.selectedCustomerAssetIds.has(String(asset.id));
  }

  isCustomerAssetSelectionPartial(asset: DeadlineGroup): boolean {
    if (this.isCustomerAssetSelected(asset)) return false;
    return this.selectableCustomerAssetDeadlines(asset)
      .some((deadline) => this.isDeadlineSelected(deadline));
  }

  toggleCustomerAssetSelection(asset: DeadlineGroup, selected: boolean): void {
    const assetIds = new Set(this.selectedCustomerAssetIds);
    const deadlineIds = new Set(this.selectedDeadlineIds);
    const assetId = String(asset.id);

    if (selected) assetIds.add(assetId);
    else assetIds.delete(assetId);

    for (const deadline of this.selectableCustomerAssetDeadlines(asset)) {
      const deadlineId = Number(deadline.id);
      if (!Number.isFinite(deadlineId)) continue;
      if (selected) deadlineIds.add(deadlineId);
      else deadlineIds.delete(deadlineId);
    }

    this.selectedCustomerAssetIds = assetIds;
    this.selectedDeadlineIds = deadlineIds;
  }

  selectAllCustomerAssetsForCurrentCustomer(): void {
    const assets = this.selectedCustomerAssetGroups;
    const allSelected = assets.length > 0 && assets.every((asset) => this.isCustomerAssetSelected(asset));
    const assetIds = new Set(this.selectedCustomerAssetIds);
    const deadlineIds = new Set(this.selectedDeadlineIds);

    for (const asset of assets) {
      if (allSelected) assetIds.delete(String(asset.id));
      else assetIds.add(String(asset.id));

      for (const deadline of this.selectableCustomerAssetDeadlines(asset)) {
        const deadlineId = Number(deadline.id);
        if (!Number.isFinite(deadlineId)) continue;
        if (allSelected) deadlineIds.delete(deadlineId);
        else deadlineIds.add(deadlineId);
      }
    }

    this.selectedCustomerAssetIds = assetIds;
    this.selectedDeadlineIds = deadlineIds;
  }

  openBulkCustomerAssetUpdate(): void {
    if (!this.selectedCustomerAssetIds.size) return;
    this.bulkInterventionDate = this.todayDateOnly();
    this.buildBulkRows();
    this.showBulkCustomerAssetForm = true;
  }

  openBulkSelectedCustomerAssetDeadlinesUpdate(): void {
    if (this.kind !== 'customerAsset' || !this.selectedDeadlineIds.size) return;
    const selectedDeadlines = this.deadlines.filter((deadline) => this.selectedDeadlineIds.has(deadline.id));
    const selectedAssetIds = new Set(
      selectedDeadlines.map((deadline) => String(deadline.targetKey || '')).filter(Boolean),
    );
    const selectedEntities = this.entities.filter((entity: any) =>
      selectedAssetIds.has(String(entity?.id || entity?.targetKey || '')),
    ) as any[];
    const typeByAssetId = new Map(
      selectedEntities.map((entity) => [
        String(entity?.id || entity?.targetKey || ''),
        String(entity?.typeKey || ''),
      ]),
    );
    const configTypes = this.globalService.getTenantCustomerAssetsConfig().types || [];
    const allowedFields = new Set<string>();
    for (const deadline of selectedDeadlines) {
      const typeKey = typeByAssetId.get(String(deadline.targetKey || '')) || '';
      const type = configTypes.find((item) => item.key === typeKey);
      const field = (type?.fields || []).find((item) =>
        item.key === deadline.sourceFieldKey ||
        (!deadline.sourceFieldKey && item.label === deadline.title),
      );
      if (field) allowedFields.add(`${typeKey}:${field.key}`);
    }
    this.selectedCustomerAssetIds = selectedAssetIds;
    this.bulkInterventionDate = this.todayDateOnly();
    this.buildBulkRows(allowedFields);
    this.showBulkCustomerAssetForm = true;
  }

  closeBulkCustomerAssetUpdate(): void {
    if (this.bulkSaving) return;
    this.showBulkCustomerAssetForm = false;
    this.bulkRows = [];
  }

  onBulkInterventionDateChange(): void {
    // Conservato come no-op per non interrompere eventuali viste già aperte durante un aggiornamento frontend.
  }

  resetBulkRowSuggestion(row: any): void {
    if (row.mode === 'today') row.value = this.bulkInterventionDate;
    if (row.mode === 'date_offset') row.value = '';
  }

  get bulkRequiresInterventionDate(): boolean {
    return false;
  }

  bulkRowInputType(row: any): string {
    if (row.type === 'date') return 'date';
    if (row.type === 'number') return 'number';
    return 'text';
  }

  submitBulkCustomerAssetUpdate(): void {
    if (this.bulkSaving) return;
    const updates = this.bulkRows.map((row) => ({
      typeKey: row.typeKey,
      fieldKey: row.fieldKey,
      included: row.included,
      value: row.value,
    }));
    if (!updates.some((row) => row.included)) {
      this.popup.showError('Seleziona almeno un campo da aggiornare.');
      return;
    }
    this.bulkSaving = true;
    this.http.post<any>(
      this.globalService.url + 'admin/deadlines/customer-assets/registry/bulk-update',
      {
        assetIds: [...this.selectedCustomerAssetIds],
        interventionDate: this.bulkInterventionDate,
        updates,
      },
    ).subscribe({
      next: (result) => {
        this.bulkSaving = false;
        this.success = `${Number(result?.updatedCount || 0)} presidi aggiornati correttamente.`;
        this.showBulkCustomerAssetForm = false;
        this.loadAll();
      },
      error: (err) => {
        this.bulkSaving = false;
        this.error = this.parseServerError(err);
        this.popup.showError(this.error);
      },
    });
  }

  private buildBulkRows(allowedFields?: Set<string>): void {
    const configTypes = this.globalService.getTenantCustomerAssetsConfig().types || [];
    const selectedEntities = this.entities.filter((entity: any) =>
      this.selectedCustomerAssetIds.has(String(entity?.id || entity?.targetKey || '')),
    ) as any[];
    const selectedTypeKeys = new Set(selectedEntities.map((entity) => String(entity.typeKey || '')));
    this.bulkRows = configTypes
      .filter((type) => selectedTypeKeys.has(type.key))
      .flatMap((type) => (type.fields || [])
        .filter((field) => field.bulkUpdateMode && field.bulkUpdateMode !== 'none' && field.type !== 'attachment')
        .filter((field) => !allowedFields || allowedFields.has(`${type.key}:${field.key}`))
        .map((field) => {
          const mode = field.bulkUpdateMode || 'none';
          const sourceField = String(field.bulkUpdateSourceField || '');
          const offsetValue = Number(field.bulkUpdateOffsetValue) || 0;
          const offsetUnit = field.bulkUpdateOffsetUnit === 'days' ? 'days' : 'months';
          const sourceLabel = (type.fields || []).find((item) => item.key === sourceField)?.label || sourceField;
          const calculationHint = mode === 'today'
            ? 'Data odierna'
            : `${sourceLabel} + ${offsetValue} ${offsetUnit === 'days' ? 'giorni' : 'mesi'}`;
          const value = mode === 'today' ? this.bulkInterventionDate : '';
          return {
            typeKey: type.key,
            typeLabel: type.label,
            fieldKey: field.key,
            label: field.label,
            type: field.type,
            mode,
            sourceField,
            offsetValue,
            offsetUnit,
            calculationHint,
            options: field.options || [],
            included: true,
            value,
          };
        }));
  }

  private addBulkDateOffset(value: string, amount: number, unit: 'days' | 'months'): string {
    if (unit === 'days') {
      const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return '';
      const result = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + amount));
      return result.toISOString().slice(0, 10);
    }
    return this.addMonthsToDate(value, amount);
  }

  private todayDateOnly(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private addMonthsToDate(value: string, months: number): string {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const result = new Date(Date.UTC(year, month + Number(months || 0), 1));
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
    return result.toISOString().slice(0, 10);
  }

  isDeadlineSelected(deadline: DeadlineRecord): boolean {
    return this.selectedDeadlineIds.has(Number(deadline.id));
  }

  toggleDeadlineSelection(deadline: DeadlineRecord, selected: boolean): void {
    const deadlineId = Number(deadline.id);
    if (!Number.isFinite(deadlineId)) return;

    const nextSelection = new Set(this.selectedDeadlineIds);
    if (selected) nextSelection.add(deadlineId);
    else nextSelection.delete(deadlineId);
    this.selectedDeadlineIds = nextSelection;
    this.syncCustomerAssetSelectionForDeadline(deadline);
  }

  private selectableCustomerAssetDeadlines(asset: DeadlineGroup): DeadlineRecord[] {
    return (asset.deadlines || []).filter((deadline) => !deadline.plannedAppointmentId);
  }

  private syncCustomerAssetSelectionForDeadline(deadline: DeadlineRecord): void {
    if (this.kind !== 'customerAsset') return;
    const asset = this.selectedCustomerAssetGroups.find((candidate) =>
      (candidate.deadlines || []).some((item) => Number(item.id) === Number(deadline.id)),
    );
    if (!asset) return;

    const selectable = this.selectableCustomerAssetDeadlines(asset);
    const allSelected = selectable.length > 0 &&
      selectable.every((item) => this.selectedDeadlineIds.has(Number(item.id)));
    const assetIds = new Set(this.selectedCustomerAssetIds);
    if (allSelected) assetIds.add(String(asset.id));
    else assetIds.delete(String(asset.id));
    this.selectedCustomerAssetIds = assetIds;
  }

  onQuickAssetTypeChange(): void {
    const group = this.quickCustomerAssetTypeGroup;
    const preferredAction = group?.actions.find((action) => action.alertCount > 0) || group?.actions[0];
    this.quickDeadlineFieldKey = preferredAction?.fieldKey || '';
  }

  selectQuickCustomerAssetDeadlines(): void {
    const group = this.quickCustomerAssetTypeGroup;
    const action = this.quickDeadlineAction;
    if (!group || !action) return;
    this.selectCustomerAssetDeadlineAction(group, action, this.quickDeadlineScope);
  }

  prepareQuickCustomerAssetDeadlineUpdate(): void {
    this.selectQuickCustomerAssetDeadlines();
    if (this.selectedDeadlineIds.size) this.openBulkSelectedCustomerAssetDeadlinesUpdate();
  }

  selectCustomerAssetDeadlineAction(
    group: CustomerAssetTypeGroup,
    action: CustomerAssetDeadlineAction,
    scope: 'alerts' | 'all' = 'alerts',
  ): void {
    const matching = group.assets
      .flatMap((asset) => asset.deadlines)
      .filter((deadline) => (
        deadline.sourceFieldKey === action.fieldKey ||
        (!deadline.sourceFieldKey && deadline.title === action.label)
      ))
      .filter((deadline) => scope === 'all' || this.isDeadlineAlert(deadline));
    this.selectedDeadlineIds = new Set(matching.map((deadline) => Number(deadline.id)));
  }

  selectedDeadlineCountForType(group: CustomerAssetTypeGroup): number {
    return group.assets
      .flatMap((asset) => asset.deadlines)
      .filter((deadline) => this.selectedDeadlineIds.has(Number(deadline.id)))
      .length;
  }

  selectedDeadlineCountForAsset(asset: DeadlineGroup): number {
    return (asset.deadlines || [])
      .filter((deadline) => this.selectedDeadlineIds.has(Number(deadline.id)))
      .length;
  }

  planDeadline(deadline: DeadlineRecord): void {
    this.navigateToDeadlinePlanning([deadline]);
  }

  planSelectedDeadlines(): void {
    this.navigateToDeadlinePlanning(this.selectedDeadlines);
  }

  openPlannedEvent(deadline: DeadlineRecord): void {
    if (!deadline.plannedAppointmentId) return;
    this.router.navigate(['/homeAdmin/calendarHome'], {
      queryParams: { appointmentId: deadline.plannedAppointmentId },
    });
  }

  private navigateToDeadlinePlanning(deadlines: DeadlineRecord[]): void {
    if (!this.canPlan || !deadlines.length) return;
    const targetKeys = new Set(deadlines.map((deadline) => this.planningTargetKey(deadline)));
    if (targetKeys.size > 1 && this.kind !== 'customerAsset') {
      this.popup.showError(`Seleziona scadenze dello stesso ${this.entityLabel}.`);
      return;
    }

    const targetLabel = this.selectedGroupView?.label
      || deadlines[0].targetLabel
      || this.getEntityLabel(this.getEntityFromDeadline(deadlines[0]));
    const items = deadlines.map((deadline) => {
      const assetLabel = this.kind === 'customerAsset' && deadline.targetLabel
        ? `${deadline.targetLabel}: `
        : '';
      return `${assetLabel}${deadline.title}`;
    });
    const title = `Aggiornamento ${targetLabel} – ${items.join(', ')}`.slice(0, 240);
    const description = [
      `Scadenze da aggiornare: ${items.join(', ')}`,
      ...deadlines.map((deadline) => deadline.description).filter(Boolean),
    ].join('\n').slice(0, 500);
    const today = this.toDateOnly(new Date());
    const candidateDates = deadlines
      .map((deadline) => deadline.dueDate)
      .filter((date) => date && date >= today)
      .sort();

    this.router.navigate(['/homeAdmin/calendarHome'], {
      queryParams: {
        deadlineIds: deadlines.map((deadline) => deadline.id).join(','),
        deadlineCategory: this.deadlineCalendarCategory,
        planTitle: title,
        planDescription: description,
        planDate: candidateDates[0] || today,
      },
    });
  }

  private planningTargetKey(deadline: DeadlineRecord): string {
    if (deadline.entityType === 'employee') return String(deadline.employeeId || '');
    if (deadline.entityType === 'vehicle') return String(deadline.vehicleId || '');
    return String(deadline.targetKey || deadline.targetLabel || '');
  }

  private get deadlineCalendarCategory(): string {
    return ({
      employee: 'deadline_employee',
      vehicle: 'deadline_vehicle',
      equipment: 'deadline_equipment',
      customer: 'deadline_customer',
      customerAsset: 'deadline_customer_asset',
      internal: 'deadline_internal',
    } as Record<DeadlineKind, string>)[this.kind];
  }

  private toDateOnly(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  loadEntities(): void {
    const archiveQuery = this.kind === 'customerAsset' && this.showArchivedCustomerAssets ? '?archived=1' : '';
    const endpoint = `admin/deadlines/${this.endpointSegment}/targets${archiveQuery}`;

    this.http.get<any[]>(this.globalService.url + endpoint).subscribe({
      next: (response) => {
        const items = Array.isArray(response) ? response : [];
        this.entities = items.sort((a, b) =>
          this.getEntityLabel(a).localeCompare(this.getEntityLabel(b), 'it'),
        );
        this.entitiesLoading = false;
        this.rebuildGroups();
      },
      error: (err) => {
        console.error('Errore caricamento entita scadenze:', err);
        this.entitiesLoading = false;
        this.error = this.parseServerError(err);
        this.popup.showError(this.error);
      },
    });
  }

  toggleCustomerAssetArchive(): void {
    if (this.kind !== 'customerAsset') return;
    this.showArchivedCustomerAssets = !this.showArchivedCustomerAssets;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { archived: this.showArchivedCustomerAssets ? 1 : null, targetKey: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.loadAll();
  }

  editCustomerAsset(asset: DeadlineGroup): void {
    if (this.kind !== 'customerAsset' || this.showArchivedCustomerAssets) return;
    this.router.navigate(['/homeAdmin/customer-assets'], { queryParams: { edit: asset.id } });
  }

  async deleteCustomerAsset(asset: DeadlineGroup): Promise<void> {
    if (this.kind !== 'customerAsset' || this.showArchivedCustomerAssets) return;
    if (!await this.popup.confirm(`Eliminare ${asset.label}? Il presidio e le sue scadenze passeranno nello storico eliminati.`)) return;
    this.http.delete(this.globalService.url + `admin/deadlines/customer-assets/registry/${asset.id}`).subscribe({
      next: () => {
        this.success = `${asset.label} spostato nello storico eliminati.`;
        this.loadAll();
      },
      error: (err) => {
        this.error = this.parseServerError(err);
        this.popup.showError(this.error);
      },
    });
  }

  loadDeadlines(): void {
    const endpoint = `admin/deadlines/${this.endpointSegment}`;

    this.http.get<DeadlineRecord[]>(this.globalService.url + endpoint).subscribe({
      next: (response) => {
        this.deadlines = Array.isArray(response) ? response : [];
        this.loading = false;
        this.rebuildGroups();
      },
      error: (err) => {
        console.error('Errore caricamento scadenze:', err);
        this.loading = false;
        this.error = this.parseServerError(err);
        this.popup.showError(this.error);
      },
    });
  }

  openAddForm(entityId?: string | number): void {
    if (!this.canCreate) return;
    if (this.kind === 'customerAsset') {
      this.router.navigateByUrl('/homeAdmin/customer-assets');
      return;
    }
    if (this.kind === 'equipment' && !entityId && !this.preselectedEntityId && this.entities.length === 0) {
      this.router.navigateByUrl('/homeAdmin/equipmentSettings');
      return;
    }

    this.resetForm();
    this.showForm = true;
    this.error = '';
    this.success = '';

    if (entityId) {
      this.form.entityId = entityId;
      return;
    }

    if (this.preselectedEntityId) {
      this.form.entityId = this.preselectedEntityId;
      return;
    }

    if (!this.form.entityId && this.entities.length > 0) {
      this.form.entityId = (this.entities[0] as any).id;
    }

    if (this.kind === 'internal' && !this.form.entityId) {
      this.form.entityId = 'azienda';
      this.form.targetLabel = 'Azienda';
    }
  }

  openEditForm(deadline: DeadlineRecord): void {
    if (!this.canEdit) return;

    // Le scadenze dei presidi sono generate dai campi configurati nella scheda
    // del presidio. Vanno quindi modificate dalla scheda, non dalla maschera
    // generica usata per dipendenti, mezzi, attrezzature e clienti.
    if (this.kind === 'customerAsset') {
      const assetId = deadline.targetKey || this.getEntityIdFromDeadline(deadline);
      if (!assetId) return;
      this.router.navigate(['/homeAdmin/customer-assets'], {
        queryParams: {
          edit: assetId,
          deadlineId: deadline.id,
          deadlineTitle: deadline.title,
          deadlineFieldKey: deadline.sourceFieldKey || null,
        },
      });
      return;
    }

    this.resetForm();
    this.showForm = true;
    this.error = '';
    this.success = '';
    this.editingDeadline = { ...deadline, attachments: [...(deadline.attachments || [])] };
    this.formAttachments = [...(deadline.attachments || [])];
    this.form = {
      entityId: this.getEntityIdFromDeadline(deadline),
      targetLabel: deadline.targetLabel || '',
      folder: deadline.folder || 'Generale',
      title: deadline.title || '',
      description: deadline.description || '',
      dueDate: deadline.dueDate || '',
      remindDays:
        deadline.remindDays === null || deadline.remindDays === undefined
          ? ''
          : String(deadline.remindDays),
    };
    this.scrollToDeadlineForm();
  }

  cancelForm(): void {
    this.showForm = false;
    this.error = '';
    this.resetForm();
  }

  resetForm(): void {
    this.editingDeadline = null;
    this.formAttachments = [];
    this.form = {
      entityId: this.preselectedEntityId,
      targetLabel: '',
      folder: 'Generale',
      title: '',
      description: '',
      dueDate: '',
      remindDays: '',
    };
    this.pendingFiles = [];

    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  onFilesSelected(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const files = target?.files ? Array.from(target.files) : [];
    this.addPendingFiles(files);
    if (target) target.value = '';
  }

  onAttachmentDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isAttachmentDragActive = true;
  }

  onAttachmentDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const currentTarget = event.currentTarget as HTMLElement | null;
    const relatedTarget = event.relatedTarget as Node | null;
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
    this.isAttachmentDragActive = false;
  }

  onAttachmentDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isAttachmentDragActive = false;

    const files = event.dataTransfer?.files
      ? Array.from(event.dataTransfer.files)
      : [];
    this.addPendingFiles(files);
  }

  private addPendingFiles(files: File[]): void {
    if (!files.length) return;

    const seen = new Set(
      this.pendingFiles.map((file) => this.fileIdentity(file)),
    );
    const nextFiles = files.filter((file) => {
      const identity = this.fileIdentity(file);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
    this.pendingFiles = [...this.pendingFiles, ...nextFiles];
  }

  removePendingFile(index: number): void {
    this.pendingFiles.splice(index, 1);
  }

  private fileIdentity(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}`;
  }

  submit(): void {
    if (!this.canSave || this.saving) return;

    const title = this.normalizeFieldValue(this.form.title);
    const description = this.normalizeFieldValue(this.form.description);
    const dueDate = this.normalizeFieldValue(this.form.dueDate);
    const folder = this.normalizeFieldValue(this.form.folder) || 'Generale';
    const remindDays = this.normalizeFieldValue(this.form.remindDays);

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('dueDate', dueDate);
    formData.append('folder', folder);

    if (this.isEditing && this.editingDeadline) {
      formData.append('id', String(this.editingDeadline.id));
    } else {
      if (this.kind === 'employee') {
        formData.append('employeeId', String(this.form.entityId));
      } else if (this.kind === 'vehicle') {
        formData.append('vehicleId', String(this.form.entityId));
      } else {
        const selected = this.entities.find((entity) =>
          String((entity as any).id) === String(this.form.entityId),
        );
        const targetLabel =
          this.normalizeFieldValue(this.form.targetLabel) ||
          this.getEntityLabel(selected) ||
          String(this.form.entityId || '');

        formData.append('targetKey', String(this.form.entityId || targetLabel));
        formData.append('targetLabel', targetLabel);
      }
    }

    if (remindDays) {
      formData.append('remindDays', remindDays);
    }

    for (const file of this.pendingFiles) {
      formData.append('documents', file, file.name);
    }

    const endpoint =
      this.isEditing
        ? 'admin/deadlines/update'
        : `admin/deadlines/${this.endpointSegment}`;

    this.saving = true;
    this.error = '';
    this.success = '';

    this.http.post<DeadlineRecord>(this.globalService.url + endpoint, formData).subscribe({
      next: () => {
        this.saving = false;
        this.success = this.isEditing
          ? 'Scadenza aggiornata con successo.'
          : 'Scadenza salvata con successo.';
        this.showForm = false;
        this.resetForm();
        this.loadAll();
        this.globalService.notifyDeadlineSummaryChanged();
      },
      error: (err) => {
        console.error('Errore salvataggio scadenza:', err);
        this.saving = false;
        this.error = this.parseServerError(err);
        this.popup.showError(this.error);
      },
    });
  }

  async deleteDeadline(deadline: DeadlineRecord): Promise<void> {
    if (!this.canDelete) return;

    const confirmed = await this.popup.confirm(
      `Eliminare la scadenza "${deadline.title}"?`,
    );
    if (!confirmed) return;

    this.http
      .post(this.globalService.url + 'admin/deadlines/delete', {
        id: deadline.id,
      })
      .subscribe({
        next: () => {
          this.success = 'Scadenza eliminata.';
          this.deadlines = this.deadlines.filter((item) => item.id !== deadline.id);
          this.rebuildGroups();
          this.globalService.notifyDeadlineSummaryChanged();
        },
        error: (err) => {
          console.error('Errore eliminazione scadenza:', err);
          this.error = this.parseServerError(err);
          this.popup.showError(this.error);
        },
      });
  }

  async deleteExistingAttachment(attachment: DeadlineAttachment): Promise<void> {
    if (!this.editingDeadline || !this.canEdit) return;

    const confirmed = await this.popup.confirm(
      `Eliminare l'allegato "${attachment.originalName}"?`,
    );
    if (!confirmed) return;

    this.http
      .post<{ ok: boolean; attachments: DeadlineAttachment[] }>(
        this.globalService.url + 'admin/deadlines/delete-attachment',
        {
          deadlineId: this.editingDeadline.id,
          attachmentId: attachment.id,
        },
      )
      .subscribe({
        next: (response) => {
          const attachments = Array.isArray(response?.attachments)
            ? response.attachments
            : this.formAttachments.filter((item) => item.id !== attachment.id);

          this.formAttachments = attachments;
          this.syncLocalDeadlineAttachments(this.editingDeadline!.id, attachments);
          this.editingDeadline = {
            ...this.editingDeadline!,
            attachments,
          };
          delete this.historyByDeadlineId[this.editingDeadline!.id];
          this.success = 'Allegato eliminato.';
        },
        error: (err) => {
          console.error('Errore eliminazione allegato:', err);
          this.error = this.parseServerError(err);
          this.popup.showError(this.error);
        },
      });
  }

  async renameExistingAttachment(attachment: DeadlineAttachment): Promise<void> {
    if (!this.editingDeadline || !this.canEdit) return;

    const requestedName = await this.popup.prompt(
      'Scegli il nuovo nome da mostrare per questo allegato.',
      attachment.originalName,
      'Rinomina allegato',
      { inputLabel: 'Nome allegato', confirmLabel: 'Rinomina' },
    );
    if (requestedName === null) return;

    const newName = requestedName.trim();
    if (!newName) {
      this.popup.showError('Inserisci un nome valido');
      return;
    }
    if (newName === attachment.originalName) return;

    this.http
      .post<{ ok: boolean; attachments: DeadlineAttachment[] }>(
        this.globalService.url + 'admin/deadlines/rename-attachment',
        {
          deadlineId: this.editingDeadline.id,
          attachmentId: attachment.id,
          newName,
        },
      )
      .subscribe({
        next: (response) => {
          const attachments = Array.isArray(response?.attachments)
            ? response.attachments
            : this.formAttachments.map((item) =>
                item.id === attachment.id ? { ...item, originalName: newName } : item,
              );

          this.formAttachments = attachments;
          this.syncLocalDeadlineAttachments(this.editingDeadline!.id, attachments);
          this.editingDeadline = {
            ...this.editingDeadline!,
            attachments,
          };
          delete this.historyByDeadlineId[this.editingDeadline!.id];
          this.success = 'Allegato rinominato.';
        },
        error: (err) => {
          console.error('Errore rinomina allegato:', err);
          this.error = this.parseServerError(err);
          this.popup.showError(this.error);
        },
      });
  }

  toggleHistory(deadline: DeadlineRecord): void {
    const isOpen = !!this.historyOpenByDeadlineId[deadline.id];
    this.historyOpenByDeadlineId[deadline.id] = !isOpen;

    if (isOpen) {
      this.clearExpandedHistoryDays(deadline.id);
    }

    if (!isOpen && !this.historyByDeadlineId[deadline.id]) {
      this.loadHistory(deadline);
    }

    if (!isOpen) {
      this.scrollDeadlineHistoryIntoView(deadline.id);
    }
  }

  loadHistory(deadline: DeadlineRecord): void {
    if (this.historyLoadingByDeadlineId[deadline.id]) return;

    this.historyLoadingByDeadlineId[deadline.id] = true;
    this.http
      .get<DeadlineHistoryEntry[]>(
        this.globalService.url + `admin/deadlines/history/${deadline.id}`,
      )
      .subscribe({
        next: (history) => {
          this.historyByDeadlineId[deadline.id] = Array.isArray(history)
            ? history
            : [];
          this.historyLoadingByDeadlineId[deadline.id] = false;
        },
        error: (err) => {
          console.error('Errore caricamento storico scadenza:', err);
          this.historyLoadingByDeadlineId[deadline.id] = false;
          this.error = this.parseServerError(err);
          this.popup.showError(this.error);
        },
      });
  }

  historyDayGroups(deadlineId: number): DeadlineHistoryDayGroup[] {
    const grouped = new Map<string, DeadlineHistoryEntry[]>();
    const entries = [...(this.historyByDeadlineId[deadlineId] || [])].sort(
      (left, right) => this.historyTimestamp(right.createdAt) - this.historyTimestamp(left.createdAt),
    );

    for (const entry of entries) {
      const key = this.historyDayKey(entry.createdAt);
      const dayEntries = grouped.get(key) || [];
      dayEntries.push(entry);
      grouped.set(key, dayEntries);
    }

    return Array.from(grouped.entries())
      .map(([key, dayEntries]) => ({ key, entries: dayEntries }))
      .sort(
        (left, right) =>
          this.historyTimestamp(right.entries[0]?.createdAt) -
          this.historyTimestamp(left.entries[0]?.createdAt),
      );
  }

  toggleHistoryDay(deadlineId: number, dayKey: string): void {
    const stateKey = this.historyDayStateKey(deadlineId, dayKey);
    const next = new Set(this.expandedHistoryDayKeys);
    if (next.has(stateKey)) {
      next.delete(stateKey);
    } else {
      next.add(stateKey);
    }
    this.expandedHistoryDayKeys = next;
  }

  isHistoryDayExpanded(deadlineId: number, dayKey: string): boolean {
    return this.expandedHistoryDayKeys.has(this.historyDayStateKey(deadlineId, dayKey));
  }

  historyDayLabel(dayKey: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : dayKey;
  }

  historyDayCountLabel(count: number): string {
    return count === 1 ? '1 aggiornamento' : `${count} aggiornamenti`;
  }

  formatHistoryTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '—';
    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  trackHistoryDayGroup(_index: number, group: DeadlineHistoryDayGroup): string {
    return group.key;
  }

  trackHistoryEntry(_index: number, entry: DeadlineHistoryEntry): number {
    return entry.id;
  }

  private historyDayKey(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || 'Data non disponibile';

    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private historyTimestamp(value?: string): number {
    const timestamp = value ? new Date(value).getTime() : Number.NaN;
    return Number.isNaN(timestamp) ? 0 : timestamp;
  }

  private historyDayStateKey(deadlineId: number, dayKey: string): string {
    return `${deadlineId}:${dayKey}`;
  }

  private clearExpandedHistoryDays(deadlineId: number): void {
    const prefix = `${deadlineId}:`;
    this.expandedHistoryDayKeys = new Set(
      Array.from(this.expandedHistoryDayKeys).filter((key) => !key.startsWith(prefix)),
    );
  }

  historyActionLabel(action: string): string {
    const labels: Record<string, string> = {
      created: 'Creazione',
      updated: 'Aggiornamento',
      deleted: 'Eliminazione',
      attachment_deleted: 'Allegato eliminato',
      attachment_renamed: 'Allegato rinominato',
      current_state: 'Stato attuale',
    };
    return labels[action] || action;
  }

  formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '—';
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  historyChangeLines(entry: DeadlineHistoryEntry): string[] {
    const changes = entry.changes || {};
    const labels: Record<string, string> = {
      title: 'Titolo',
      description: 'Descrizione',
      folder: 'Cartella',
      dueDate: 'Data scadenza',
      remindDays: 'Preavviso',
    };

    const lines: string[] = [];
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'attachmentsAdded' && Array.isArray(value) && value.length) {
        const names = value
          .map((item: any) =>
            typeof item === 'string' ? item : item?.originalName || item?.storedName,
          )
          .filter(Boolean);
        if (names.length) {
          lines.push(`Allegati aggiunti: ${names.join(', ')}`);
        }
        continue;
      }

      if (key === 'attachment' && value) {
        if (changes['attachmentDeleted']) continue;
        const attachmentName =
          typeof value === 'string' ? value : value?.originalName || value?.storedName;
        if (attachmentName) {
          lines.push(`Allegato: ${attachmentName}`);
        }
        continue;
      }

      if (key === 'attachmentDeleted' && value) {
        const attachmentName = value?.originalName || value?.storedName;
        if (attachmentName) {
          lines.push(`Allegato archiviato nello storico: ${attachmentName}`);
        }
        continue;
      }

      if (key === 'attachmentRenamed' && value) {
        lines.push(`Allegato rinominato: ${value.before || '—'} → ${value.after || '—'}`);
        continue;
      }

      if (value && typeof value === 'object' && 'before' in value && 'after' in value) {
        lines.push(`${labels[key] || key}: ${value.before || '—'} → ${value.after || '—'}`);
      }
    }

    return lines;
  }

  historySnapshotLines(entry: DeadlineHistoryEntry): string[] {
    const snapshot = entry.snapshot || {};
    const lines = [
      `Titolo: ${snapshot['title'] || '—'}`,
      `Cartella: ${snapshot['folder'] || 'Generale'}`,
      `Data scadenza: ${this.formatDueDate(snapshot['dueDate'])}`,
      `Preavviso: ${this.remindLabel(snapshot['remindDays'])}`,
    ];

    if (snapshot['description']) {
      lines.push(`Descrizione: ${snapshot['description']}`);
    }

    return lines;
  }

  historyAttachments(entry: DeadlineHistoryEntry): DeadlineAttachment[] {
    const attachments: DeadlineAttachment[] = [];
    const seen = new Set<string>();
    const changes = entry.changes || {};
    const snapshot = entry.snapshot || {};

    const addAttachment = (item: any) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      const id = String(item.id || '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      attachments.push({
        id,
        originalName: item.originalName || item.storedName || 'documento',
        storedName: item.storedName || '',
        size: Number(item.size) || 0,
        uploadedAt: item.uploadedAt || entry.createdAt,
        documentFolder: item.documentFolder || '',
        documentFilename: item.documentFilename || '',
        documentManagedBy: item.documentManagedBy || '',
      });
    };

    if (Array.isArray(entry.attachments)) {
      entry.attachments.forEach(addAttachment);
    }

    if (Array.isArray(snapshot['attachments'])) {
      snapshot['attachments'].forEach(addAttachment);
    }

    [
      changes['attachmentDeleted'],
      changes['attachment'],
      changes['deletedAttachment'],
      changes['renamedAttachment'],
    ].forEach(addAttachment);

    ['attachmentsDeleted', 'attachmentsAddedDetails', 'attachmentsAdded'].forEach((key) => {
      if (Array.isArray(changes[key])) {
        changes[key].forEach(addAttachment);
      }
    });

    return attachments;
  }

  openAttachment(
    deadline: DeadlineRecord,
    attachment: DeadlineAttachment,
  ): void {
    const request = this.http
      .post(
        this.globalService.url + 'admin/deadlines/download-attachment',
        {
          deadlineId: deadline.id,
          attachmentId: attachment.id,
        },
        { responseType: 'blob' },
      );
    this.globalAttachmentViewer.open(attachment, request);
  }

  openHistoryAttachment(
    deadline: DeadlineRecord,
    entry: DeadlineHistoryEntry,
    attachment: DeadlineAttachment,
  ): void {
    const request = this.http
      .post(
        this.globalService.url + 'admin/deadlines/download-history-attachment',
        {
          deadlineId: deadline.id,
          historyId: entry.id,
          attachmentId: attachment.id,
        },
        { responseType: 'blob' },
      );
    this.globalAttachmentViewer.open(attachment, request);
  }

  getEntityLabel(entity: any): string {
    if (!entity) return '';
    if (this.kind === 'employee') {
      return `${entity?.nome || ''} ${entity?.cognome || ''}`.trim();
    }

    if (this.kind === 'vehicle') {
      return entity?.plate
      ? `${entity?.name || ''} (${entity.plate})`
      : String(entity?.name || '').trim();
    }

    if (this.kind === 'customer') {
      const labels = [entity?.ragioneSociale, entity?.nominativo, entity?.nome, entity?.targetLabel]
        .map((value) => String(value || '').trim())
        .filter((value, index, values) => value && values.indexOf(value) === index && value !== String(entity?.numeroCliente || ''));
      return labels.join(' · ') || String(entity?.numeroCliente || entity?.id || '').trim();
    }
    if (this.kind === 'customerAsset') {
      return String(entity?.targetLabel || entity?.assetCode || entity?.code || entity?.id || '').trim();
    }

    return String(entity?.targetLabel || entity?.nome || entity?.ragioneSociale || entity?.numeroCliente || entity?.id || '').trim();
  }

  getEntitySubtitle(entity: any): string {
    if (this.kind === 'employee') {
      return [entity?.email, entity?.cellulare].filter(Boolean).join(' • ');
    }

    if (this.kind === 'vehicle') {
    return entity?.plate ? `Targa: ${entity.plate}` : 'Targa non inserita';
    }

    if (this.kind === 'customer') {
      return entity?.numeroCliente ? `Cliente ${entity.numeroCliente}` : '';
    }

    if (this.kind === 'equipment') {
      return entity?.quantity ? `Quantità: ${entity.quantity}` : 'Attrezzatura aziendale';
    }
    if (this.kind === 'customerAsset') {
      return [entity?.customerLabel, entity?.location, entity?.serialNumber ? `Matricola: ${entity.serialNumber}` : ''].filter(Boolean).join(' • ');
    }

    return 'Scadenza aziendale interna';
  }

  formatDueDate(value: string): string {
    const [year, month, day] = String(value || '').split('-');
    if (!year || !month || !day) return value || '—';
    return `${day}/${month}/${year}`;
  }

  relativeDueLabel(deadline: DeadlineRecord): string {
    if (deadline.plannedFor && deadline.status === 'planned') {
      return `Pianificata per il ${this.formatDueDate(deadline.plannedFor)}`;
    }
    if (deadline.planningDue) {
      if (deadline.planningDaysUntil === 0) return 'Da aggiornare oggi';
      return `Da aggiornare da ${Math.abs(deadline.planningDaysUntil || 0)} giorni`;
    }
    if (deadline.daysUntil === null || deadline.daysUntil === undefined) {
      return '';
    }

    if (deadline.status === 'expired') {
      if (deadline.daysUntil === -1) return 'Scaduta ieri';
      return `Scaduta da ${Math.abs(deadline.daysUntil)} giorni`;
    }

    if (deadline.daysUntil === 0) return 'Scade oggi';
    if (deadline.daysUntil === 1) return 'Scade domani';
    return `Scade tra ${deadline.daysUntil} giorni`;
  }

  remindLabel(remindDays: number | null): string {
    if (remindDays === null || remindDays === undefined || remindDays === 0) {
      return 'Promemoria il giorno della scadenza';
    }

    if (remindDays === 1) {
      return 'Promemoria 1 giorno prima';
    }

    return `Promemoria ${remindDays} giorni prima`;
  }

  statusLabel(status: DeadlineStatus): string {
    if (status === 'expired') return 'Scaduta';
    if (status === 'warning') return 'In scadenza';
    if (status === 'planned') return 'Pianificata';
    return 'Regolare';
  }

  statusClass(status: DeadlineStatus): string {
    if (status === 'expired') return 'status-expired';
    if (status === 'warning') return 'status-warning';
    if (status === 'planned') return 'status-planned';
    return 'status-ok';
  }

  trackDeadlineGroup(_index: number, group: DeadlineGroup): string {
    return String(group.id);
  }

  trackStableInteractiveItem(index: number, item: any): string | number {
    return item?.id ?? item?.key ?? item?.numeroCliente ?? item?.code ?? item?.name ?? index;
  }

  openGroupById(groupId: string | number): void {
    const group = this.groups.find((item) => String(item.id) === String(groupId));
    if (group) this.openGroup(group);
  }

  openGroup(group: DeadlineGroup): void {
    this.selectedDeadlineIds = new Set();
    this.expandedCustomerAssetTypeKeys = new Set();
    this.expandedCustomerAssetIds = new Set();
    this.selectedGroup = group;
    if (this.kind === 'customerAsset') this.initializeCustomerAssetQuickSelection();
    if (this.kind === 'internal') this.loadInternalCategories();
    this.showForm = false;
    this.error = '';
  }

  private loadInternalCategories(): void {
    this.http.get<any[]>(this.globalService.url + 'admin/resource-categories/internal').subscribe({
      next: (categories) => {
        this.internalDeadlineCategories = Array.isArray(categories) ? categories : [];
        this.http.get<number[]>(this.globalService.url + 'admin/resource-categories/internal/assignment-by-target?targetKey=azienda').subscribe({
          next: (ids) => this.selectedInternalCategoryIds = Array.isArray(ids) ? ids.map(Number) : [],
        });
      },
    });
  }

  toggleInternalCategory(id: number, checked: boolean): void {
    this.selectedInternalCategoryIds = checked ? [...new Set([...this.selectedInternalCategoryIds, id])] : this.selectedInternalCategoryIds.filter((value) => value !== id);
  }

  saveInternalCategories(): void {
    this.http.post<{ createdDeadlines?: number }>(this.globalService.url + 'admin/resource-categories/internal/assignment-by-target', {
      targetKey: 'azienda', targetLabel: 'Azienda', categoryIds: this.selectedInternalCategoryIds,
    }).subscribe({ next: () => { this.loadAll(); this.globalService.notifyDeadlineSummaryChanged(); } });
  }


  closeGroup(): void {
    this.selectedDeadlineIds.clear();
    this.expandedCustomerAssetTypeKeys.clear();
    this.expandedCustomerAssetIds.clear();
    this.quickAssetTypeKey = '';
    this.quickDeadlineFieldKey = '';
    this.quickDeadlineScope = 'alerts';
    this.selectedGroup = null;
    this.showForm = false;
    this.error = '';
  }

  isCustomerAssetTypeExpanded(typeKey: string): boolean {
    return this.expandedCustomerAssetTypeKeys.has(typeKey);
  }

  toggleCustomerAssetType(typeKey: string): void {
    const next = new Set(this.expandedCustomerAssetTypeKeys);
    if (next.has(typeKey)) next.delete(typeKey);
    else next.add(typeKey);
    this.expandedCustomerAssetTypeKeys = next;
  }

  trackCustomerAssetTypeGroup(_index: number, typeGroup: CustomerAssetTypeGroup): string {
    return typeGroup.key;
  }

  isCustomerAssetExpanded(asset: DeadlineGroup): boolean {
    return this.expandedCustomerAssetIds.has(String(asset.id));
  }

  toggleCustomerAsset(asset: DeadlineGroup): void {
    const assetId = String(asset.id);
    const next = new Set(this.expandedCustomerAssetIds);
    if (next.has(assetId)) next.delete(assetId);
    else next.add(assetId);
    this.expandedCustomerAssetIds = next;
  }

  clearSearch(): void {
    this.searchText = '';
  }

  getFolderGroups(group: DeadlineGroup | null): DeadlineFolderGroup[] {
    if (!group) return [];

    const folders = new Map<string, DeadlineRecord[]>();
    for (const deadline of group.deadlines) {
      const folder = this.normalizeFieldValue(deadline.folder) || 'Generale';
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder)?.push(deadline);
    }

    if (folders.size === 0) {
      folders.set('Generale', []);
    }

    return [...folders.entries()]
      .map(([folder, deadlines]) => ({
        folder,
        deadlines: deadlines.slice().sort((a, b) =>
          String(a.dueDate || '').localeCompare(String(b.dueDate || '')),
        ),
        summary: this.summarize(deadlines),
      }))
      .sort((a, b) => {
        const severityDiff = this.statusRank(a.summary.status) - this.statusRank(b.summary.status);
        if (severityDiff !== 0) return severityDiff;
        return a.folder.localeCompare(b.folder, 'it');
      });
  }

  getFolderFileCount(folder: DeadlineFolderGroup): number {
    return folder.deadlines.reduce(
      (count, deadline) => count + (deadline.attachments?.length || 0),
      0,
    );
  }

  formatFileSize(size: number): string {
    const value = Number(size) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  private get endpointSegment(): string {
    if (this.kind === 'employee') return 'employees';
    if (this.kind === 'vehicle') return 'vehicles';
    if (this.kind === 'customer') return 'customers';
    if (this.kind === 'customerAsset') return 'customer-assets';
    return this.kind;
  }

  private permissionKey(action: 'CREATE' | 'EDIT' | 'DELETE' | 'VIEW'): string {
    const prefix =
      this.kind === 'employee'
        ? 'EMPLOYEE'
        : this.kind === 'vehicle'
          ? 'VEHICLE'
          : this.kind === 'equipment'
            ? 'EQUIPMENT'
            : this.kind === 'customer'
              ? 'CUSTOMER'
              : this.kind === 'customerAsset'
                ? 'CUSTOMER_ASSET'
              : 'INTERNAL';
    return `${prefix}_DEADLINES_${action}`;
  }

  private rebuildGroups(): void {
    const map = new Map<string, DeadlineRecord[]>();

    for (const deadline of this.deadlines) {
      const entityId = this.getEntityIdFromDeadline(deadline);
      if (!entityId) continue;

      if (!map.has(entityId)) {
        map.set(entityId, []);
      }

      map.get(entityId)?.push(deadline);
    }

    const groups: DeadlineGroup[] = [];
    const entities = this.entities.length
      ? this.entities
      : this.deadlines.map((deadline) => this.getEntityFromDeadline(deadline));

    const uniqueIds = new Set<string>();

    for (const entity of entities) {
      const entityId = String((entity as any)?.id || (entity as any)?.targetKey || '');
      if (!entityId || uniqueIds.has(entityId)) continue;

      uniqueIds.add(entityId);
      const deadlines = (map.get(entityId) || []).slice().sort((a, b) => {
        return String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
      });

      groups.push({
        id: entityId,
        label: this.getEntityLabel(entity),
        subtitle: this.getEntitySubtitle(entity),
        deadlines,
        summary: this.summarize(deadlines),
        auditHistory: this.normalizeCustomerAssetAuditHistory((entity as any)?.auditHistory),
        typeKey: String((entity as any)?.typeKey || ''),
        assetDetails: this.kind === 'customerAsset'
          ? this.buildCustomerAssetDetails(entity)
          : [],
      });
    }

    if (this.kind === 'customerAsset') {
      this.rebuildCustomerAssetGroups(groups);
      return;
    }

    this.customerAssetGroupsByCustomer = {};
    this.groups = groups.sort((a, b) => {
      if (this.preselectedEntityId) {
        if (String(a.id) === String(this.preselectedEntityId) && String(b.id) !== String(this.preselectedEntityId)) {
          return -1;
        }
        if (String(b.id) === String(this.preselectedEntityId) && String(a.id) !== String(this.preselectedEntityId)) {
          return 1;
        }
      }

      const severityDiff = this.statusRank(a.summary.status) - this.statusRank(b.summary.status);
      if (severityDiff !== 0) return severityDiff;

      return a.label.localeCompare(b.label, 'it');
    });

    if (this.selectedGroup) {
      this.selectedGroup =
        this.groups.find((group) => String(group.id) === String(this.selectedGroup?.id)) ||
        null;
    }
  }

  private rebuildCustomerAssetGroups(assetGroups: DeadlineGroup[]): void {
    const grouped = new Map<string, { label: string; assets: DeadlineGroup[] }>();

    for (const assetGroup of assetGroups) {
      const entity = this.entities.find((item: any) =>
        String(item?.id || item?.targetKey || '') === String(assetGroup.id),
      ) as any;
      const customerId = String(entity?.numeroCliente || 'senza-cliente');
      const customerLabel = String(entity?.customerLabel || '').trim() || 'Cliente non disponibile';
      const entry = grouped.get(customerId) || { label: customerLabel, assets: [] };
      const customerSuffix = ` — ${customerLabel}`;
      entry.assets.push({
        ...assetGroup,
        label: assetGroup.label.endsWith(customerSuffix)
          ? assetGroup.label.slice(0, -customerSuffix.length)
          : assetGroup.label,
        subtitle: this.getEntitySubtitle(entity),
        typeKey: String(entity?.typeKey || ''),
      });
      grouped.set(customerId, entry);
    }

    this.customerAssetGroupsByCustomer = {};
    this.groups = [...grouped.entries()].map(([customerId, entry]) => {
      const assets = entry.assets.slice().sort((a, b) => a.label.localeCompare(b.label, 'it'));
      this.customerAssetGroupsByCustomer[customerId] = assets;
      const deadlines = assets.flatMap((asset) => asset.deadlines);
      return {
        id: customerId,
        label: entry.label,
        subtitle: `${assets.length} ${assets.length === 1 ? 'presidio' : 'presidi'} registrati`,
        deadlines,
        summary: this.summarize(deadlines),
      };
    }).sort((a, b) => {
      const severityDiff = this.statusRank(a.summary.status) - this.statusRank(b.summary.status);
      if (severityDiff !== 0) return severityDiff;
      return a.label.localeCompare(b.label, 'it');
    });

    if (this.selectedGroup) {
      this.selectedGroup = this.groups.find((group) => String(group.id) === String(this.selectedGroup?.id)) || null;
    }
  }

  private buildCustomerAssetDetails(entity: any): CustomerAssetDetail[] {
    const typeKey = String(entity?.typeKey || '');
    const type = (this.globalService.getTenantCustomerAssetsConfig().types || [])
      .find((item) => item.key === typeKey);
    const fields = Array.isArray(type?.fields) ? type.fields : [];
    const identityField = fields.find((field) => field.unique === true && field.type !== 'attachment');
    const values = entity?.customFields && typeof entity.customFields === 'object'
      ? entity.customFields
      : {};
    const attachments = Array.isArray(entity?.attachments) ? entity.attachments : [];

    return fields
      // Le scadenze hanno già una scheda operativa completa subito sotto.
      .filter((field) => !(field.type === 'date' && field.isDeadline === true))
      // Il primo campo univoco è già l'identificativo mostrato nel titolo.
      .filter((field) => field.key !== identityField?.key)
      .map((field) => {
        if (field.type === 'attachment') {
          const matchingAttachments = attachments.filter(
            (attachment: DeadlineAttachment) => String(attachment?.fieldKey || '') === String(field.key),
          );
          return {
            key: field.key,
            label: field.label || field.key,
            type: field.type,
            value: matchingAttachments.length === 1
              ? '1 allegato'
              : `${matchingAttachments.length} allegati`,
            attachments: matchingAttachments,
          };
        }

        const rawValue = values[field.key];
        return {
          key: field.key,
          label: field.label || field.key,
          type: field.type,
          value: this.formatCustomerAssetDetailValue(field.type, rawValue),
          attachments: [],
        };
      })
      .filter((detail) => detail.type === 'attachment'
        ? detail.attachments.length > 0
        : detail.value !== '');
  }

  private formatCustomerAssetDetailValue(type: string, value: any): string {
    if (value === null || value === undefined || value === '') return '';
    if (type === 'boolean') return value === true || value === 'true' || value === 1 ? 'Sì' : 'No';
    if (type === 'date') {
      const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    }
    if (Array.isArray(value)) return value.filter(Boolean).join(', ');
    return String(value);
  }

  downloadCustomerAssetAttachment(asset: DeadlineGroup, attachment: DeadlineAttachment): void {
    if (!asset?.id || !attachment?.id) return;
    const request = this.http.get(
      this.globalService.url +
        `admin/deadlines/customer-assets/registry/${encodeURIComponent(String(asset.id))}` +
        `/attachments/${encodeURIComponent(String(attachment.id))}`,
      { responseType: 'blob' },
    );
    this.globalAttachmentViewer.open(attachment, request);
  }

  customerAssetAuditAttachments(
    entry: CustomerAssetAuditEntry,
  ): CustomerAssetAuditAttachmentItem[] {
    const result: CustomerAssetAuditAttachmentItem[] = [];
    const seen = new Set<string>();
    const add = (value: any, label: string) => {
      if (!value?.id) return;
      const id = String(value.id);
      if (seen.has(id)) return;
      seen.add(id);
      result.push({
        label,
        attachment: {
          id,
          originalName: value.originalName || value.storedName || 'Allegato',
          storedName: value.storedName || '',
          size: Number(value.size || 0),
          uploadedAt: value.uploadedAt || '',
        },
      });
    };
    const changes = entry?.changes || {};
    (Array.isArray(changes['attachmentsAddedDetails']) ? changes['attachmentsAddedDetails'] : [])
      .forEach((attachment: any) => add(attachment, 'Allegato salvato'));
    (Array.isArray(changes['attachmentsDeleted']) ? changes['attachmentsDeleted'] : [])
      .forEach((attachment: any) => add(attachment, 'Versione precedente'));
    return result;
  }

  private normalizeCustomerAssetAuditHistory(value: unknown): CustomerAssetAuditEntry[] {
    if (!Array.isArray(value)) return [];
    return value.map((entry: CustomerAssetAuditEntry) => ({
      ...entry,
      attachmentItems: this.customerAssetAuditAttachments(entry),
    }));
  }

  private summarize(deadlines: DeadlineRecord[]): DeadlineSummary {
    const summary: DeadlineSummary = {
      expiredCount: 0,
      warningCount: 0,
      pendingCount: 0,
      alertCount: 0,
      totalCount: deadlines.length,
      status: 'ok',
    };

    for (const deadline of deadlines) {
      if (deadline.isPending) summary.pendingCount += 1;
      if (deadline.status === 'expired') summary.expiredCount += 1;
      if (deadline.status === 'warning') summary.warningCount += 1;
    }

    summary.alertCount = summary.expiredCount + summary.warningCount;
    summary.status =
      summary.expiredCount > 0
        ? 'expired'
        : summary.warningCount > 0
          ? 'warning'
          : 'ok';

    return summary;
  }

  private initializeCustomerAssetQuickSelection(): void {
    const groups = this.selectedCustomerAssetTypeGroups;
    const preferredGroup = groups.find((group) => group.summary.alertCount > 0) || groups[0];
    this.quickAssetTypeKey = preferredGroup?.key || '';
    const preferredAction = preferredGroup?.actions.find((action) => action.alertCount > 0)
      || preferredGroup?.actions[0];
    this.quickDeadlineFieldKey = preferredAction?.fieldKey || '';
    this.quickDeadlineScope = 'alerts';
  }

  private isDeadlineAlert(deadline: DeadlineRecord): boolean {
    return deadline.status === 'expired' || deadline.status === 'warning' || deadline.planningDue === true;
  }

  private isDeadlineInAppliedRange(deadline: DeadlineRecord): boolean {
    const dueDate = String(deadline.dueDate || '').slice(0, 10);
    return !!dueDate && dueDate >= this.deadlineFilterStart && dueDate <= this.deadlineFilterEnd;
  }

  private filterDeadlineGroupForRange(group: DeadlineGroup): DeadlineGroup | null {
    const deadlines = group.deadlines.filter((deadline) => this.isDeadlineInAppliedRange(deadline));
    if (!deadlines.length) return null;
    return { ...group, deadlines, summary: this.summarize(deadlines) };
  }

  private filterCustomerGroupForDeadlineRange(group: DeadlineGroup): DeadlineGroup | null {
    const assets = (this.customerAssetGroupsByCustomer[String(group.id)] || [])
      .map((asset) => this.filterDeadlineGroupForRange(asset))
      .filter((asset): asset is DeadlineGroup => !!asset);
    if (!assets.length) return null;
    const deadlines = assets.flatMap((asset) => asset.deadlines);
    return {
      ...group,
      subtitle: `${assets.length} ${assets.length === 1 ? 'presidio in scadenza' : 'presidi in scadenza'}`,
      deadlines,
      summary: this.summarize(deadlines),
    };
  }

  private compareCustomerAssets(a: DeadlineGroup, b: DeadlineGroup): number {
    if (this.customerAssetSortMode === 'status') {
      const severityDiff = this.statusRank(a.summary.status) - this.statusRank(b.summary.status);
      if (severityDiff) return severityDiff;
    }
    if (this.customerAssetSortMode === 'dueDate') {
      const dateDiff = this.earliestDeadlineDate([a]).localeCompare(this.earliestDeadlineDate([b]));
      if (dateDiff) return dateDiff;
    }
    return a.label.localeCompare(b.label, 'it', { numeric: true });
  }

  private earliestDeadlineDate(assets: DeadlineGroup[]): string {
    return assets
      .flatMap((asset) => asset.deadlines)
      .map((deadline) => String(deadline.dueDate || ''))
      .filter(Boolean)
      .sort()[0] || '9999-12-31';
  }

  private getEntityIdFromDeadline(deadline: DeadlineRecord): string {
    if (this.kind === 'employee') {
      return String(deadline.employeeId || deadline.employee?.id || '');
    }

    if (this.kind === 'vehicle') {
      return String(deadline.vehicleId || deadline.vehicle?.id || '');
    }

    return String(deadline.targetKey || deadline.targetLabel || '');
  }

  private syncLocalDeadlineAttachments(
    deadlineId: number,
    attachments: DeadlineAttachment[],
  ): void {
    this.deadlines = this.deadlines.map((deadline) =>
      deadline.id === deadlineId
        ? { ...deadline, attachments: [...attachments] }
        : deadline,
    );
    this.rebuildGroups();
  }

  private scrollToDeadlineForm(): void {
    window.requestAnimationFrame(() => {
      this.deadlineForm?.nativeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }

  private scrollDeadlineHistoryIntoView(deadlineId: number): void {
    window.setTimeout(() => {
      const panel = this.host.nativeElement.querySelector<HTMLElement>(
        `[data-deadline-id="${deadlineId}"] .history-panel`,
      );
      panel?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }

  private getEntityFromDeadline(deadline: DeadlineRecord): any {
    if (this.kind === 'employee') {
      return deadline.employee || { id: deadline.employeeId };
    }

    if (this.kind === 'vehicle') {
      return deadline.vehicle || { id: deadline.vehicleId };
    }

    const targetKey = String(deadline.targetKey || deadline.targetLabel || '');
    const savedEntity = this.entities.find((entity: any) =>
      String(entity?.id || entity?.targetKey || entity?.numeroCliente || '') === targetKey,
    );
    if (savedEntity) return savedEntity;

    return {
      id: deadline.targetKey || deadline.targetLabel,
      targetKey: deadline.targetKey || deadline.targetLabel || '',
      targetLabel: deadline.targetLabel || deadline.targetKey || '',
    };
  }

  private statusRank(status: DeadlineStatus): number {
    if (status === 'expired') return 0;
    if (status === 'warning') return 1;
    return 2;
  }

  private filterGroupForSearch(
    group: DeadlineGroup,
    query: string,
  ): DeadlineGroup | null {
    const groupText = this.normalizeSearch([
      group.label,
      group.subtitle,
      group.id,
    ].join(' '));

    if (groupText.includes(query)) {
      return group;
    }

    if (this.kind === 'customerAsset') {
      const assets = this.customerAssetGroupsByCustomer[String(group.id)] || [];
      if (assets.some((asset) => this.normalizeSearch(`${asset.label} ${asset.subtitle}`).includes(query))) {
        return group;
      }
    }

    const deadlines = group.deadlines.filter((deadline) =>
      this.deadlineMatchesSearch(deadline, query),
    );

    if (deadlines.length === 0) return null;

    return {
      ...group,
      deadlines,
      summary: this.summarize(deadlines),
    };
  }

  private deadlineMatchesSearch(deadline: DeadlineRecord, query: string): boolean {
    const attachmentNames = (deadline.attachments || [])
      .map((attachment) => attachment.originalName)
      .join(' ');
    const entity = this.getEntityFromDeadline(deadline);

    const text = this.normalizeSearch([
      deadline.title,
      deadline.description,
      deadline.folder,
      deadline.targetLabel,
      deadline.targetKey,
      deadline.dueDate,
      this.formatDueDate(deadline.dueDate),
      this.statusLabel(deadline.status),
      this.relativeDueLabel(deadline),
      this.remindLabel(deadline.remindDays),
      attachmentNames,
      this.getEntityLabel(entity),
      this.getEntitySubtitle(entity),
    ].join(' '));

    return text.includes(query);
  }

  private normalizeSearch(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  private parseNumericId(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private normalizeFieldValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private parseServerError(err: any): string {
    try {
      const body =
        typeof err?.error === 'string' ? JSON.parse(err.error) : err?.error;
      if (body?.error) return body.error;
    } catch {}

    if (err?.status === 0) return 'Impossibile connettersi al server';
    return 'Errore imprevisto. Riprova.';
  }
}
