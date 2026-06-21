import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Subscription } from 'rxjs';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';

type WarehouseTab = 'list' | 'requests' | 'in' | 'out' | 'movements' | 'products' | 'tools';
type MovementType = 'in' | 'out';
type SummaryFilter = 'all' | 'low' | 'out' | 'quantity';

interface WarehouseProduct {
  id: number;
  name: string;
  description: string;
  barcode: string;
  categoryId: number | null;
  category: string;
  unit: string;
  supplier: string;
  supplierCode: string;
  reorderUrl: string;
  reorderNote: string;
  indicativePrice: number | null;
  photoPath?: string | null;
  photoUrl?: string | null;
  minimumQuantity: number;
  quantity: number;
  favorite: boolean;
  active: boolean;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

interface WarehouseCategory {
  id: number;
  name: string;
  description: string;
  aliases: string[];
  active: boolean;
}

interface WarehouseMovement {
  id: number;
  productId: number;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reasonKey: string;
  reason: string;
  note: string;
  customerId?: string | null;
  employeeId?: number | null;
  appointmentId?: number | null;
  serviceOrderId?: number | null;
  referenceType?: string;
  referenceLabel?: string;
  unitCost?: number | null;
  totalCost?: number | null;
  actorEmail?: string | null;
  createdAt: string;
  product?: WarehouseProduct;
  employee?: any | null;
  customer?: any | null;
}

interface WarehouseSummary {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalQuantity: number;
  lowStockProducts: WarehouseProduct[];
  latestMovements: WarehouseMovement[];
}

interface MovementReason {
  key: string;
  label: string;
}

interface WarehouseUnit {
  key: string;
  label: string;
}

interface WarehouseReferences {
  customers: any[];
  employees: any[];
  appointments: any[];
  serviceOrders: any[];
}

interface WarehouseMovementSummary {
  key: string;
  label: string;
  customer?: any | null;
  quantity: number;
  movements: number;
  totalCost: number;
  products: Array<{ productId: number; name: string; unit: string; quantity: number }>;
}

interface WarehouseRequest {
  id: number;
  employeeId: number;
  productId: number;
  categoryId: number | null;
  customerId?: string | null;
  quantity: number;
  note: string;
  status: 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled';
  createdAt: string;
  product?: WarehouseProduct;
  employee?: any | null;
  customer?: any | null;
}

@Component({
  selector: 'app-internal-warehouse',
  templateUrl: './internal-warehouse.component.html',
  styleUrls: ['./internal-warehouse.component.css'],
})
export class InternalWarehouseComponent implements OnInit, OnDestroy {
  @ViewChildren('scannerVideo') scannerVideos?: QueryList<ElementRef<HTMLVideoElement>>;
  private readonly validTabs: WarehouseTab[] = ['list', 'requests', 'in', 'out', 'movements', 'products', 'tools'];

  activeTab: WarehouseTab = 'list';
  products: WarehouseProduct[] = [];
  categories: WarehouseCategory[] = [];
  selectedProduct: WarehouseProduct | null = null;
  selectedMovements: WarehouseMovement[] = [];
  summary: WarehouseSummary = {
    totalProducts: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    totalQuantity: 0,
    lowStockProducts: [],
    latestMovements: [],
  };
  movementReasons: MovementReason[] = [];
  units: WarehouseUnit[] = [
    { key: 'pz', label: 'Pezzi' },
    { key: 'confezioni', label: 'Confezioni' },
    { key: 'scatole', label: 'Scatole' },
    { key: 'litri', label: 'Litri' },
    { key: 'ml', label: 'Millilitri' },
    { key: 'kg', label: 'Chilogrammi' },
    { key: 'g', label: 'Grammi' },
    { key: 'metri', label: 'Metri' },
    { key: 'rotoli', label: 'Rotoli' },
    { key: 'paia', label: 'Paia' },
  ];
  references: WarehouseReferences = { customers: [], employees: [], appointments: [], serviceOrders: [] };
  reportMovements: WarehouseMovement[] = [];
  reportSummary: WarehouseMovementSummary[] = [];
  productRequests: WarehouseRequest[] = [];
  preparingRequest: WarehouseRequest | null = null;
  duplicateProduct: WarehouseProduct | null = null;
  importResult: any = null;
  selectedPhotoFile: File | null = null;

  loading = false;
  saving = false;
  message = '';
  error = '';
  categoryError = '';
  activeSummaryFilter: SummaryFilter = 'all';

  filters = {
    q: '',
    categoryId: 0,
    barcode: '',
    stock: '',
    favorite: '',
    sort: 'name',
  };

  productForm = this.emptyProductForm();
  categoryForm = this.emptyCategoryForm();
  manualMovement = {
    barcode: '',
    quantity: 1,
    reasonKey: '',
    reason: '',
    note: '',
    customerId: '',
    employeeId: 0,
    appointmentId: 0,
    serviceOrderId: 0,
    referenceType: '',
    referenceLabel: '',
    unitCost: null as number | null,
  };
  movementFilters = {
    type: 'out',
    groupBy: 'employee',
    employeeId: 0,
    customerId: '',
    productId: 0,
    dateFrom: '',
    dateTo: '',
  };
  referenceSearch = {
    employee: '',
    customer: '',
  };
  adjustment = {
    productId: 0,
    quantity: 0,
    note: '',
  };

  scannerActive = false;
  scannerMode: MovementType | 'product' = 'in';
  scannerMessage = '';
  manualEntryMode = false;
  private scannerControls?: IScannerControls;
  private scannerReader?: BrowserMultiFormatReader;
  private lastScanValue = '';
  private lastScanAt = 0;
  private queryParamSub?: Subscription;
  private referenceSearchTimers: Record<'customer' | 'employee', any> = {
    customer: null,
    employee: null,
  };

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    public global: GlobalService,
    private popup: PopupServiceService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.applyRouteTab(this.route.snapshot.queryParamMap.get('tab'));
    this.queryParamSub = this.route.queryParamMap.subscribe((params) => {
      this.applyRouteTab(params.get('tab'));
    });
    this.loadMeta();
    this.loadReferences();
    this.loadCategories();
    this.loadSummary();
    this.loadProducts();
    this.loadProductRequests();
    if (this.activeTab === 'movements') this.loadMovementReport();
  }

  ngOnDestroy(): void {
    this.queryParamSub?.unsubscribe();
    this.stopScanner();
  }

  get isMobileLike(): boolean {
    return window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  }

  get canView(): boolean {
    return this.global.hasPermission('INTERNAL_WAREHOUSE_VIEW');
  }

  get canRegisterIn(): boolean {
    return this.global.hasPermission('INTERNAL_WAREHOUSE_IN');
  }

  get canRegisterOut(): boolean {
    return this.global.hasPermission('INTERNAL_WAREHOUSE_OUT');
  }

  get canManageProducts(): boolean {
    return this.global.hasPermission('INTERNAL_WAREHOUSE_PRODUCTS_MANAGE');
  }

  get canAdjust(): boolean {
    return this.global.hasPermission('INTERNAL_WAREHOUSE_ADJUST');
  }

  get canHistory(): boolean {
    return this.global.hasPermission('INTERNAL_WAREHOUSE_HISTORY_VIEW');
  }

  get canExport(): boolean {
    return this.global.hasPermission('INTERNAL_WAREHOUSE_EXPORT');
  }

  private api(path = ''): string {
    return `${this.global.url}admin/internal-warehouse${path}`;
  }

  private applyRouteTab(tabValue: string | null): void {
    const tab = tabValue as WarehouseTab | null;
    if (!tab || !this.validTabs.includes(tab) || tab === this.activeTab) return;
    this.setTab(tab);
  }

  setTab(tab: WarehouseTab): void {
    this.activeTab = tab;
    this.message = '';
    this.error = '';
    if (!['in', 'out', 'products'].includes(tab)) {
      this.stopScanner();
    }
    if (tab === 'movements') this.loadMovementReport();
    if (tab === 'requests') this.loadProductRequests();
  }

  applySummaryFilter(filter: SummaryFilter): void {
    if (!this.canView) return;
    this.activeSummaryFilter = filter;
    this.setTab('list');
    this.filters.q = '';
    this.filters.barcode = '';
    this.filters.categoryId = 0;
    this.filters.favorite = '';
    if (filter === 'low') {
      this.filters.stock = 'low';
      this.filters.sort = 'quantity_asc';
    } else if (filter === 'out') {
      this.filters.stock = 'out';
      this.filters.sort = 'name';
    } else if (filter === 'quantity') {
      this.filters.stock = '';
      this.filters.sort = 'quantity_desc';
    } else {
      this.filters.stock = '';
      this.filters.sort = 'name';
    }
    this.loadProducts();
  }

  loadMeta(): void {
    this.http.get<{ movementReasons: MovementReason[]; units: WarehouseUnit[] }>(this.api('/meta')).subscribe({
      next: (meta) => {
        this.movementReasons = meta?.movementReasons || [];
        if (meta?.units?.length) this.units = meta.units;
      },
      error: () => undefined,
    });
  }

  loadReferences(): void {
    this.http.get<WarehouseReferences>(this.api('/references')).subscribe({
      next: (refs) => this.references = refs || { customers: [], employees: [], appointments: [], serviceOrders: [] },
      error: () => undefined,
    });
  }

  searchReference(kind: 'customer' | 'employee'): void {
    const q = this.referenceSearch[kind].trim();
    let params = new HttpParams();
    if (q) params = params.set('q', q);
    this.http.get<WarehouseReferences>(this.api('/references'), { params }).subscribe({
      next: (refs) => {
        this.references = {
          ...this.references,
          customers: kind === 'customer' ? (refs?.customers || []) : this.references.customers,
          employees: kind === 'employee' ? (refs?.employees || []) : this.references.employees,
          appointments: refs?.appointments?.length ? refs.appointments : this.references.appointments,
          serviceOrders: refs?.serviceOrders?.length ? refs.serviceOrders : this.references.serviceOrders,
        };
      },
      error: (err) => this.handleError(err, kind === 'customer' ? 'Impossibile cercare i clienti.' : 'Impossibile cercare i dipendenti.'),
    });
  }

  onReferenceSearchChange(kind: 'customer' | 'employee'): void {
    clearTimeout(this.referenceSearchTimers[kind]);
    this.referenceSearchTimers[kind] = setTimeout(() => this.searchReference(kind), 250);
  }

  quickReferenceResults(kind: 'customer' | 'employee'): any[] {
    const q = this.referenceSearch[kind].trim();
    if (!q) return [];
    const list = kind === 'customer' ? this.references.customers : this.references.employees;
    return (list || []).slice(0, 6);
  }

  selectReportEmployee(employee: any): void {
    this.movementFilters.employeeId = Number(employee?.id || 0);
    this.referenceSearch.employee = this.employeeLabel(employee);
  }

  selectReportCustomer(customer: any): void {
    this.movementFilters.customerId = String(customer?.numeroCliente || '');
    this.referenceSearch.customer = this.customerLabel(customer);
  }

  selectMovementEmployee(employee: any): void {
    this.manualMovement.employeeId = Number(employee?.id || 0);
    this.referenceSearch.employee = this.employeeLabel(employee);
  }

  selectMovementCustomer(customer: any): void {
    this.manualMovement.customerId = String(customer?.numeroCliente || '');
    this.referenceSearch.customer = this.customerLabel(customer);
  }

  loadCategories(): void {
    if (!this.canView) return;
    this.http.get<{ categories: WarehouseCategory[] }>(this.api('/categories')).subscribe({
      next: (res) => {
        this.categories = res?.categories || [];
        if (!this.productForm.categoryId) {
          this.productForm.categoryId = this.defaultCategoryId;
        }
      },
      error: () => undefined,
    });
  }

  loadSummary(): void {
    if (!this.canView) return;
    this.http.get<WarehouseSummary>(this.api('/summary')).subscribe({
      next: (summary) => {
        this.summary = summary || this.summary;
      },
      error: (err) => this.handleError(err, 'Impossibile caricare il riepilogo magazzino.'),
    });
  }

  loadProducts(): void {
    if (!this.canView) return;
    if (this.filters.stock === 'low') this.activeSummaryFilter = 'low';
    else if (this.filters.stock === 'out') this.activeSummaryFilter = 'out';
    else if (this.filters.sort === 'quantity_desc') this.activeSummaryFilter = 'quantity';
    else this.activeSummaryFilter = 'all';
    this.loading = true;
    let params = new HttpParams();
    Object.entries(this.filters).forEach(([key, value]) => {
      if (value) params = params.set(key, value);
    });

    this.http.get<WarehouseProduct[]>(this.api('/products'), { params }).subscribe({
      next: (products) => {
        this.products = (products || []).filter((product) => {
          if (this.filters.favorite === 'true') return product.favorite;
          return true;
        });
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.handleError(err, 'Impossibile caricare i prodotti.');
      },
    });
  }

  loadProductRequests(): void {
    if (!this.canView) return;
    this.http.get<WarehouseRequest[]>(this.api('/requests?status=pending')).subscribe({
      next: (requests) => this.productRequests = requests || [],
      error: () => this.productRequests = [],
    });
  }

  saveProduct(): void {
    if (!this.canManageProducts || this.saving) return;
    this.clearFeedback();
    const payload = {
      ...this.productForm,
      minimumQuantity: Number(this.productForm.minimumQuantity || 0),
      quantity: Number(this.productForm.quantity || 0),
      indicativePrice: this.productForm.indicativePrice === null || this.productForm.indicativePrice === undefined
        ? null
        : Number(this.productForm.indicativePrice || 0),
    };

    if (!payload.name.trim() || !payload.barcode.trim()) {
      this.error = 'Nome e codice a barre sono obbligatori.';
      return;
    }
    if (!payload.categoryId) {
      this.error = 'Seleziona una categoria prodotto.';
      return;
    }

    this.saving = true;
    const request = payload.id
      ? this.http.put<WarehouseProduct>(this.api(`/products/${payload.id}`), payload)
      : this.http.post<WarehouseProduct>(this.api('/products'), payload);

    request.subscribe({
      next: (product) => {
        this.saving = false;
        this.message = payload.id ? 'Prodotto aggiornato.' : 'Prodotto creato.';
        this.uploadPhotoIfNeeded(product);
        this.productForm = this.emptyProductForm();
        this.loadProducts();
        this.loadCategories();
        this.loadSummary();
        this.selectedProduct = product;
      },
      error: (err) => {
        this.saving = false;
        if (err?.status === 409 && err?.error?.product) {
          this.duplicateProduct = err.error.product;
        }
        this.handleError(err, 'Impossibile salvare il prodotto.');
      },
    });
  }

  editProduct(product: WarehouseProduct): void {
    this.productForm = {
      id: product.id,
      name: product.name,
      description: product.description || '',
      barcode: product.barcode,
      categoryId: product.categoryId || this.defaultCategoryId,
      unit: product.unit || 'pz',
      supplier: product.supplier || '',
      supplierCode: product.supplierCode || '',
      reorderUrl: product.reorderUrl || '',
      reorderNote: product.reorderNote || '',
      indicativePrice: product.indicativePrice ?? null,
      favorite: product.favorite || false,
      minimumQuantity: product.minimumQuantity || 0,
      quantity: product.quantity || 0,
    };
    this.setTab('products');
  }

  openDuplicateProduct(): void {
    if (!this.duplicateProduct) return;
    this.editProduct(this.duplicateProduct);
    this.duplicateProduct = null;
  }

  toggleFavorite(product: WarehouseProduct): void {
    if (!this.canManageProducts) return;
    this.http.patch<WarehouseProduct>(this.api(`/products/${product.id}/favorite`), {
      favorite: !product.favorite,
    }).subscribe({
      next: () => {
        this.loadProducts();
        this.loadCategories();
        this.loadSummary();
      },
      error: (err) => this.handleError(err, 'Impossibile aggiornare il preferito.'),
    });
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedPhotoFile = input.files?.[0] || null;
  }

  private uploadPhotoIfNeeded(product: WarehouseProduct): void {
    if (!this.selectedPhotoFile || !product?.id) return;
    const formData = new FormData();
    formData.append('photo', this.selectedPhotoFile);
    this.http.post<WarehouseProduct>(this.api(`/products/${product.id}/photo`), formData).subscribe({
      next: () => {
        this.selectedPhotoFile = null;
        this.loadProducts();
      },
      error: (err) => this.handleError(err, 'Prodotto salvato, ma foto non caricata.'),
    });
  }

  deleteProduct(product: WarehouseProduct): void {
    if (!this.canManageProducts) return;
    if (!confirm(`Archiviare il prodotto "${product.name}"?`)) return;

    this.http.delete(this.api(`/products/${product.id}`)).subscribe({
      next: () => {
        this.message = 'Prodotto archiviato.';
        this.loadProducts();
        this.loadCategories();
        this.loadSummary();
      },
      error: (err) => this.handleError(err, 'Impossibile archiviare il prodotto.'),
    });
  }

  registerManual(type: MovementType): void {
    const allowed = type === 'in' ? this.canRegisterIn : this.canRegisterOut;
    if (!allowed || this.saving) return;
    this.registerMovement(type, this.manualMovement.barcode, Number(this.manualMovement.quantity || 1), {
      reasonKey: this.manualMovement.reasonKey,
      reason: this.manualMovement.reason,
      note: this.manualMovement.note,
      customerId: this.manualMovement.customerId,
      employeeId: this.manualMovement.employeeId,
      requestId: this.preparingRequest?.id,
      resetManual: true,
    });
  }

  adjustProduct(): void {
    if (!this.canAdjust || !this.adjustment.productId) return;
    this.clearFeedback();
    this.saving = true;
      this.http.post<{ product: WarehouseProduct }>(this.api('/movements/adjust'), {
      productId: this.adjustment.productId,
      quantity: Number(this.adjustment.quantity || 0),
      reasonKey: 'inventory',
      note: this.adjustment.note,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.message = 'Giacenza rettificata.';
        this.adjustment = { productId: 0, quantity: 0, note: '' };
        this.loadProducts();
        this.loadSummary();
      },
      error: (err) => {
        this.saving = false;
        this.handleError(err, 'Impossibile rettificare la giacenza.');
      },
    });
  }

  selectProduct(product: WarehouseProduct): void {
    this.selectedProduct = product;
    this.selectedMovements = [];
    if (!this.canHistory) return;
    this.http.get<WarehouseMovement[]>(this.api(`/products/${product.id}/movements`)).subscribe({
      next: (movements) => this.selectedMovements = movements || [],
      error: (err) => this.handleError(err, 'Impossibile caricare lo storico prodotto.'),
    });
  }

  loadMovementReport(): void {
    if (!this.canHistory) return;
    this.loading = true;
    let params = new HttpParams();
    Object.entries(this.movementFilters).forEach(([key, value]) => {
      if (value) params = params.set(key, value);
    });
    this.http.get<WarehouseMovement[]>(this.api('/movements'), { params }).subscribe({
      next: (movements) => {
        this.reportMovements = movements || [];
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.handleError(err, 'Impossibile caricare i movimenti.');
      },
    });
    this.http.get<WarehouseMovementSummary[]>(this.api('/movements/summary'), { params }).subscribe({
      next: (summary) => this.reportSummary = summary || [],
      error: () => undefined,
    });
  }

  async startScanner(mode: MovementType | 'product'): Promise<void> {
    this.clearFeedback();
    this.stopScanner();
    this.manualEntryMode = false;
    this.scannerMode = mode;
    this.scannerMessage = 'Apertura fotocamera...';

    if (Capacitor.getPlatform() !== 'web') {
      await this.startNativeScanner(mode);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.scannerMessage = '';
      this.error = 'Fotocamera non disponibile: apri l’app da HTTPS o da localhost e controlla i permessi del browser.';
      this.popup.showError(this.error);
      return;
    }

    try {
      this.scannerActive = true;
      this.scannerReader = new BrowserMultiFormatReader();
      this.cdr.detectChanges();
      await this.waitForScannerVideo();
      await this.attachScannerReader();
    } catch (err) {
      console.error('Errore apertura camera:', err);
      this.stopScanner();
      this.error = this.scannerStartupErrorMessage(err);
      this.popup.showError(this.error);
    }
  }

  private async startNativeScanner(mode: MovementType | 'product'): Promise<void> {
    try {
      this.scannerActive = true;
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.ALL,
        cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
        scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
        scanInstructions: 'Inquadra il codice a barre',
        scanButton: false,
      });
      const barcode = String(result?.ScanResult || '').trim();
      this.scannerActive = false;
      if (!barcode) {
        this.scannerMessage = '';
        return;
      }
      this.scannerMode = mode;
      this.handleScannedBarcode(barcode);
    } catch (err) {
      console.error('Errore scanner nativo:', err);
      this.scannerActive = false;
      this.scannerMessage = '';
      this.error = this.scannerStartupErrorMessage(err);
      this.popup.showError(this.error);
    }
  }

  stopScanner(): void {
    this.scannerControls?.stop();
    this.scannerControls = undefined;
    this.scannerReader = undefined;
    this.scannerActive = false;
    this.scannerMessage = '';
  }

  private async waitForScannerVideo(): Promise<HTMLVideoElement> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const video = this.scannerVideos?.last?.nativeElement;
      if (video) {
        setTimeout(() => video.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
        return video;
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
      this.cdr.detectChanges();
    }
    throw new Error('Riquadro scanner non pronto.');
  }

  private async attachScannerReader(): Promise<void> {
    const video = this.scannerVideos?.last?.nativeElement;
    if (!video || !this.scannerReader || !this.scannerActive) {
      throw new Error('Riquadro scanner non pronto.');
    }

    this.scannerControls = await this.scannerReader.decodeFromConstraints(
      {
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      },
      video,
      (result) => {
        const value = String(result?.getText() || '').trim();
        const now = Date.now();
        if (value && (value !== this.lastScanValue || now - this.lastScanAt > 1400)) {
          this.lastScanValue = value;
          this.lastScanAt = now;
          this.handleScannedBarcode(value);
        }
      },
    );
    this.scannerMessage = 'Inquadra il codice a barre.';
  }

  private scannerStartupErrorMessage(err: any): string {
    const name = String(err?.name || '');
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'Permesso fotocamera negato. Abilita la fotocamera per questa app nelle impostazioni del browser.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'Nessuna fotocamera disponibile su questo dispositivo.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'La fotocamera è già in uso da un’altra app o dal browser.';
    }
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      return 'Non riesco ad aprire la fotocamera posteriore. Riprova o usa l’inserimento manuale.';
    }
    return 'Non riesco ad aprire la fotocamera. Controlla i permessi o usa inserimento manuale.';
  }

  private handleScannedBarcode(barcode: string): void {
    if (this.saving) return;
    if (this.scannerMode === 'product') {
      this.productForm.barcode = barcode;
      this.scannerMessage = `Codice letto: ${barcode}`;
      this.stopScanner();
      return;
    }

    const scanQuantity = Math.max(1, Number(this.manualMovement.quantity || 1));
    if (scanQuantity > 1) {
      this.stopScanner();
    }
    this.registerMovement(this.scannerMode, barcode, scanQuantity, {
      reasonKey: this.manualMovement.reasonKey || (this.scannerMode === 'in' ? 'other' : 'internal_use'),
      reason: this.manualMovement.reason || (this.scannerMode === 'in' ? 'scansione entrata' : 'scansione uscita'),
      note: this.manualMovement.note,
      customerId: this.manualMovement.customerId,
      employeeId: this.manualMovement.employeeId,
      requestId: this.preparingRequest?.id,
      fromScanner: true,
    });
  }

  private registerMovement(
    type: MovementType,
    barcode: string,
    quantity: number,
    options: {
      reasonKey?: string;
      reason?: string;
      note?: string;
      customerId?: string;
      employeeId?: number;
      appointmentId?: number;
      serviceOrderId?: number;
      referenceType?: string;
      referenceLabel?: string;
      unitCost?: number | null;
      requestId?: number;
      resetManual?: boolean;
      fromScanner?: boolean;
    } = {},
  ): void {
    const cleanBarcode = String(barcode || '').trim();
    const cleanQuantity = Math.max(1, Number(quantity || 1));
    if (!cleanBarcode) {
      this.error = 'Inserisci un codice a barre.';
      return;
    }

    this.clearFeedback();
    this.saving = true;
    this.http.post<{ product: WarehouseProduct; movement: WarehouseMovement }>(
      this.api(`/movements/${type}`),
      {
        barcode: cleanBarcode,
        quantity: cleanQuantity,
        reasonKey: options.reasonKey,
        reason: options.reason,
        note: options.note,
        customerId: options.customerId,
        employeeId: options.employeeId,
        appointmentId: options.appointmentId,
        serviceOrderId: options.serviceOrderId,
        referenceType: options.referenceType,
        referenceLabel: options.referenceLabel,
        unitCost: options.unitCost,
        requestId: options.requestId,
      },
    ).subscribe({
      next: ({ product }) => {
        this.saving = false;
        const verb = type === 'in' ? 'Entrata registrata' : 'Uscita registrata';
        const signedQuantity = type === 'in' ? `+${cleanQuantity}` : `-${cleanQuantity}`;
        this.message = `${verb}: ${product.name} ${signedQuantity} (${product.quantity} ${product.unit})`;
        this.scannerMessage = this.message;
        this.playScanFeedback();
        if (options.resetManual) {
          this.manualMovement = {
            barcode: '',
            quantity: 1,
            reasonKey: '',
            reason: '',
            note: '',
            customerId: '',
            employeeId: 0,
            appointmentId: 0,
            serviceOrderId: 0,
            referenceType: '',
            referenceLabel: '',
            unitCost: null,
          };
          this.manualEntryMode = false;
        }
        if (this.preparingRequest?.id === options.requestId) {
          this.message = `${this.message}. Richiesta evasa.`;
          this.preparingRequest = null;
          this.loadProductRequests();
        }
        this.loadProducts();
        this.loadSummary();
        if (this.activeTab === 'movements') this.loadMovementReport();
      },
      error: (err) => {
        this.saving = false;
        this.handleError(err, options.fromScanner
          ? `Codice ${cleanBarcode}: movimento non registrato.`
          : 'Movimento non registrato.');
      },
    });
  }

  prepareRequest(request: WarehouseRequest): void {
    if (!this.canRegisterOut) return;
    this.preparingRequest = request;
    this.manualMovement = {
      barcode: '',
      quantity: Math.max(1, Number(request.quantity || 1)),
      reasonKey: 'employee_assignment',
      reason: 'Richiesta prodotto dipendente',
      note: request.note || '',
      customerId: request.customerId || '',
      employeeId: Number(request.employeeId || 0),
      appointmentId: 0,
      serviceOrderId: 0,
      referenceType: 'warehouse_request',
      referenceLabel: `Richiesta #${request.id}`,
      unitCost: null,
    };
    this.setTab('out');
    this.message = `Prepara ${request.product?.name || 'prodotto'} per ${this.employeeLabel(request.employee)}. Scansiona il codice a barre per evadere la richiesta.`;
  }

  updateRequestStatus(request: WarehouseRequest, status: WarehouseRequest['status']): void {
    this.http.patch<WarehouseRequest>(this.api(`/requests/${request.id}`), { status }).subscribe({
      next: () => {
        this.message = 'Richiesta aggiornata.';
        this.loadProductRequests();
      },
      error: (err) => this.handleError(err, 'Impossibile aggiornare la richiesta.'),
    });
  }

  requestStatusLabel(status: string): string {
    switch (status) {
      case 'fulfilled':
        return 'Evasa';
      case 'approved':
        return 'Approvata';
      case 'rejected':
        return 'Rifiutata';
      case 'cancelled':
        return 'Annullata';
      default:
        return 'In attesa';
    }
  }

  emptyProductForm() {
    return {
      id: 0,
      name: '',
      description: '',
      barcode: '',
      categoryId: this.defaultCategoryId,
      unit: 'pz',
      supplier: '',
      supplierCode: '',
      reorderUrl: '',
      reorderNote: '',
      indicativePrice: null as number | null,
      favorite: false,
      minimumQuantity: 0,
      quantity: 0,
    };
  }

  get defaultCategoryId(): number {
    return this.categories.find((category) => category.name === 'Generale')?.id || this.categories[0]?.id || 0;
  }

  emptyCategoryForm() {
    return {
      id: 0,
      name: '',
      description: '',
      aliasesText: '',
    };
  }

  categoryAliasesLabel(category: WarehouseCategory): string {
    return (category.aliases || []).join(', ');
  }

  saveCategory(): void {
    if (!this.canManageProducts || this.saving) return;
    this.clearFeedback();
    this.categoryError = '';
    const payload = {
      name: this.categoryForm.name.trim(),
      description: this.categoryForm.description,
      aliases: this.categoryForm.aliasesText,
    };
    if (!payload.name) {
      this.error = 'Nome categoria obbligatorio.';
      return;
    }

    this.saving = true;
    const request = this.categoryForm.id
      ? this.http.put<WarehouseCategory>(this.api(`/categories/${this.categoryForm.id}`), payload)
      : this.http.post<WarehouseCategory>(this.api('/categories'), payload);

    request.subscribe({
      next: () => {
        this.saving = false;
        this.message = this.categoryForm.id ? 'Categoria aggiornata.' : 'Categoria creata.';
        this.categoryForm = this.emptyCategoryForm();
        this.loadCategories();
        this.loadProducts();
        this.loadSummary();
      },
      error: (err) => {
        this.saving = false;
        const message = this.parseServerError(err, 'Impossibile salvare la categoria.');
        this.categoryError = message;
        this.error = message;
        if (err?.status === 409 && err?.error?.category) {
          this.editCategory(err.error.category);
        }
        this.popup.showError(message);
      },
    });
  }

  editCategory(category: WarehouseCategory): void {
    this.categoryForm = {
      id: category.id,
      name: category.name,
      description: category.description || '',
      aliasesText: (category.aliases || []).join('\n'),
    };
  }

  deleteCategory(category: WarehouseCategory): void {
    if (!this.canManageProducts) return;
    if (category.name === 'Generale') {
      this.error = 'La categoria Generale non può essere archiviata.';
      return;
    }
    if (!confirm(`Archiviare la categoria "${category.name}"?`)) return;

    this.http.delete(this.api(`/categories/${category.id}`)).subscribe({
      next: () => {
        this.message = 'Categoria archiviata.';
        this.categoryForm = this.emptyCategoryForm();
        this.loadCategories();
        this.loadProducts();
      },
      error: (err) => this.handleError(err, 'Impossibile archiviare la categoria.'),
    });
  }

  exportCsv(kind: 'products' | 'movements'): void {
    if (!this.canExport) return;
    const path = kind === 'products' ? '/export/products.csv' : '/export/movements.csv';
    this.http.get(this.api(path), { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = kind === 'products' ? 'magazzino-prodotti.csv' : 'magazzino-movimenti.csv';
        link.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => this.handleError(err, 'Impossibile esportare il CSV.'),
    });
  }

  importProducts(event: Event): void {
    if (!this.canExport) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    this.http.post(this.api('/import/products'), formData).subscribe({
      next: (result) => {
        this.importResult = result;
        this.message = 'Import prodotti completato.';
        this.loadProducts();
        this.loadSummary();
        input.value = '';
      },
      error: (err) => this.handleError(err, 'Impossibile importare il file CSV.'),
    });
  }

  productImageUrl(product: WarehouseProduct): string {
    if (!product.photoUrl) return '';
    return `${this.global.url.replace(/\/$/, '')}${product.photoUrl}`;
  }

  customerLabel(customer: any): string {
    return this.global.getRecordDisplayName('customer', customer) || customer?.numeroCliente || 'Cliente';
  }

  customerNameById(customerId: string | number | null | undefined): string {
    const id = String(customerId || '').trim();
    if (!id) return '';
    const customer = this.references.customers.find((item) => String(item?.numeroCliente || '').trim() === id);
    return customer ? this.customerLabel(customer) : id;
  }

  customerNameForRecord(customerId: string | number | null | undefined, customer?: any | null): string {
    if (customer) return this.customerLabel(customer);
    return this.customerNameById(customerId);
  }

  appointmentLabel(appointment: any): string {
    return `${appointment?.title || 'Intervento'} #${appointment?.id}`;
  }

  employeeLabel(employee: any): string {
    return `${employee?.nome || ''} ${employee?.cognome || ''}`.trim() || employee?.email || `Dipendente ${employee?.id || ''}`;
  }

  movementTargetLabel(movement: WarehouseMovement): string {
    const parts = [];
    if (movement.employee) parts.push(`Dipendente: ${this.employeeLabel(movement.employee)}`);
    if (movement.customerId) parts.push(`Cliente: ${this.customerNameForRecord(movement.customerId, movement.customer)}`);
    if (movement.referenceLabel) parts.push(movement.referenceLabel);
    if (movement.appointmentId) parts.push(`Intervento #${movement.appointmentId}`);
    if (movement.serviceOrderId) parts.push(`OdS #${movement.serviceOrderId}`);
    return parts.join(' · ') || 'Nessun destinatario indicato';
  }

  reportSummaryLabel(item: WarehouseMovementSummary): string {
    if (this.movementFilters.groupBy === 'customer') {
      return this.customerNameForRecord(item.key, item.customer) || item.label;
    }
    return item.label;
  }

  serviceOrderLabel(order: any): string {
    return `${order?.numeroOrdine || `Ordine #${order?.id}`} - cliente ${order?.numeroCliente || '-'}`;
  }

  private playScanFeedback(): void {
    if ('vibrate' in navigator) {
      navigator.vibrate?.(80);
    }
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.06;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.08);
    } catch {
      // Feedback sonoro non supportato dal browser.
    }
  }

  private clearFeedback(): void {
    this.message = '';
    this.error = '';
    this.categoryError = '';
  }

  private handleError(err: any, fallback: string): void {
    this.error = this.parseServerError(err, fallback);
    this.popup.showError(this.error);
  }

  private parseServerError(err: any, fallback: string): string {
    return this.popup.parseServerError(err, fallback);
  }

  goBack(): void {
    this.router.navigateByUrl('/homeAdmin');
  }
}
