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
import { SocketService } from '../../service/soket.service';

type WarehouseTab = 'list' | 'requests' | 'material-orders' | 'orders' | 'in' | 'out' | 'movements' | 'products' | 'tools';
type MovementType = 'in' | 'out';
type SummaryFilter = 'all' | 'low' | 'out' | 'quantity';
type WarehouseRequestView = 'list' | 'new' | 'detail';
type WarehouseEntityView = 'list' | 'new' | 'detail';
type MaterialOrderStatusView =
  | 'to-prepare'
  | 'preparing'
  | 'prepared'
  | 'waiting-customer'
  | 'partially-delivered'
  | 'completed'
  | 'cancelled';

interface WarehouseProduct {
  id: number;
  name: string;
  description: string;
  barcode: string;
  categoryId: number | null;
  category: string;
  unit: string;
  supplierId: number | null;
  supplier: string;
  supplierCode: string;
  supplierDetails?: WarehouseSupplier | null;
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
  pendingRequestCount?: number;
  totalQuantity: number;
  lowStockProducts: WarehouseProduct[];
  latestMovements: WarehouseMovement[];
}

interface WarehouseSupplier {
  id: number;
  name: string;
  vatNumber?: string;
  fiscalCode?: string;
  address?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  email?: string;
  pec?: string;
  notes?: string;
  productCount?: number;
  lowStockCount?: number;
  inboundInvoiceCount?: number;
  lastInboundInvoiceDate?: string | null;
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

type MaterialOrderReferenceKind = 'customer' | 'recipient' | 'preparation' | 'delivery';

interface InternalWarehouseConfig {
  mobileMode: 'simple' | 'advanced';
  barcodeMode: 'barcode_required' | 'auto_internal_code';
  internalCodePrefix: string;
  materialOrderFlow: {
    enabled: boolean;
    employeeRequestsEnabled: boolean;
    schedulingEnabled: boolean;
    calendarCategoryKey: string;
    preparationDocumentEnabled: boolean;
    preparationDocumentTitle: string;
    preparationDocumentStyle: 'classic' | 'modern' | 'minimal';
    preparationPrimaryColor: string;
    preparationShowLogo: boolean;
    preparationShowBarcode: boolean;
    preparationShowInternalChecks: boolean;
    preparationFooterText: string;
    documentEnabled: boolean;
    documentLabel: string;
    pdfTemplateKey: string;
    customerSignatureEnabled: boolean;
    employeeAppSignatureEnabled: boolean;
    signatureEmailSource: string;
    fields: any[];
  };
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

interface WarehouseRequestItem {
  id: number | null;
  requestId: number;
  productId: number;
  categoryId: number | null;
  quantity: number;
  fulfilledQuantity: number;
  remainingQuantity?: number;
  status: 'pending' | 'fulfilled' | 'rejected' | 'cancelled';
  product?: WarehouseProduct;
}

interface WarehouseRequest {
  id: number;
  employeeId: number | null;
  createdByAdminId?: number | null;
  productId: number;
  categoryId: number | null;
  customerId?: string | null;
  quantity: number;
  note: string;
  adminNote?: string;
  cancelReason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'cancelled';
  createdAt: string;
  product?: WarehouseProduct;
  items?: WarehouseRequestItem[];
  employee?: any | null;
  customer?: any | null;
}

interface MaterialRequestAvailability {
  requestId: number;
  allAvailable: boolean;
  noneAvailable: boolean;
  items: Array<{
    itemId: number | null;
    productId: number;
    requestedQuantity: number;
    availableQuantity: number;
    preparableQuantity: number;
    missingQuantity: number;
    product?: WarehouseProduct | null;
  }>;
}

interface SupplierOrder {
  id: number;
  numeroOrdine: string;
  supplierId: number;
  recipient: string;
  subject: string;
  message: string;
  status: 'sent' | 'completed' | 'cancelled';
  sentAt: string;
  createdAt: string;
  supplier?: WarehouseSupplier | null;
  items: Array<{ product: WarehouseProduct; quantity: number; note: string }>;
}

@Component({
  selector: 'app-internal-warehouse',
  templateUrl: './internal-warehouse.component.html',
  styleUrls: ['./internal-warehouse.component.css'],
})
export class InternalWarehouseComponent implements OnInit, OnDestroy {
  trackStableInteractiveItem(index: number, item: any): string | number {
    return item?.id ?? item?.key ?? item?.numeroCliente ?? item?.productId ?? item?.code ?? item?.name ?? index;
  }

  @ViewChildren('scannerVideo') scannerVideos?: QueryList<ElementRef<HTMLVideoElement>>;
  private readonly validTabs: WarehouseTab[] = ['list', 'requests', 'material-orders', 'orders', 'in', 'out', 'movements', 'products', 'tools'];

  activeTab: WarehouseTab = 'list';
  products: WarehouseProduct[] = [];
  materialOrders: any[] = [];
  materialOrderSourceRequestId = 0;
  materialOrderSourceCustomer: any = null;
  materialOrderConfig: any = {};
  materialOrderFields: any[] = [];
  materialOrderForm: any = {
    customerId: '',
    recipientEmployeeId: 0,
    preparationEmployeeId: 0,
    deliveryEmployeeId: 0,
    deliveryMode: 'immediate',
    scheduledStart: '',
    scheduledEnd: '',
    note: '',
    fields: {},
    items: [{ productId: 0, quantity: 1, note: '' }],
  };
  orderProducts: WarehouseProduct[] = [];
  categories: WarehouseCategory[] = [];
  suppliers: WarehouseSupplier[] = [];
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
  warehouseConfig: InternalWarehouseConfig = this.defaultWarehouseConfig();
  reportMovements: WarehouseMovement[] = [];
  reportSummary: WarehouseMovementSummary[] = [];
  productRequests: WarehouseRequest[] = [];
  requestView: WarehouseRequestView = 'list';
  requestSearch = '';
  showArchivedRequests = false;
  selectedProductRequest: WarehouseRequest | null = null;
  editingRequestAssignment = false;
  requestAssignmentForm = { customerId: '', employeeId: 0 };
  productView: WarehouseEntityView = 'list';
  showArchivedProducts = false;
  materialOrderView: WarehouseEntityView = 'list';
  materialOrderSearch = '';
  materialOrderStatusView: MaterialOrderStatusView = 'to-prepare';
  showArchivedMaterialOrders = false;
  selectedMaterialOrder: any = null;
  editingMaterialOrderAssignment = false;
  materialOrderAssignmentForm = {
    recipientEmployeeId: 0,
    preparationEmployeeId: 0,
    deliveryEmployeeId: 0,
    deliveryMode: 'immediate',
    scheduledStart: '',
    scheduledEnd: '',
  };
  materialOrderReferenceSearch: Record<MaterialOrderReferenceKind, string> = {
    customer: '', recipient: '', preparation: '', delivery: '',
  };
  readonly materialOrderReferencePickers: Array<{
    kind: MaterialOrderReferenceKind;
    label: string;
    placeholder: string;
  }> = [
    { kind: 'customer', label: 'Cliente destinatario', placeholder: 'Cerca cliente per nome o numero' },
    { kind: 'recipient', label: 'Dipendente destinatario', placeholder: 'Cerca dipendente per nome o email' },
    { kind: 'preparation', label: 'Addetto alla preparazione', placeholder: 'Cerca addetto alla preparazione' },
    { kind: 'delivery', label: 'Incaricato della consegna', placeholder: 'Cerca incaricato della consegna' },
  ];
  materialOrderReferenceOpen: Record<MaterialOrderReferenceKind, boolean> = {
    customer: false, recipient: false, preparation: false, delivery: false,
  };
  materialOrderReferenceLoading: Record<MaterialOrderReferenceKind, boolean> = {
    customer: false, recipient: false, preparation: false, delivery: false,
  };
  materialOrderReferenceResults: Record<MaterialOrderReferenceKind, any[]> = {
    customer: [], recipient: [], preparation: [], delivery: [],
  };
  materialOrderReferenceActiveIndex: Record<MaterialOrderReferenceKind, number> = {
    customer: -1, recipient: -1, preparation: -1, delivery: -1,
  };
  supplierOrderView: WarehouseEntityView = 'list';
  supplierOrderSearch = '';
  showArchivedSupplierOrders = false;
  supplierOrders: SupplierOrder[] = [];
  selectedSupplierOrder: SupplierOrder | null = null;
  adminRequestForm: any = {
    customerId: '',
    employeeId: 0,
    note: '',
    items: [{ productId: 0, quantity: 1 }],
  };
  adminRequestSearch = {
    customer: '',
    employee: '',
  };
  adminRequestSearchOpen = {
    customer: false,
    employee: false,
  };
  adminRequestSearchLoading = {
    customer: false,
    employee: false,
  };
  preparingRequest: WarehouseRequest | null = null;
  preparingRequestItem: WarehouseRequestItem | null = null;
  cancelRequestForm = {
    requestId: 0,
    reason: '',
  };
  duplicateProduct: WarehouseProduct | null = null;
  importResult: any = null;
  selectedPhotoFile: File | null = null;

  loading = false;
  saving = false;
  sendingOrder = false;
  loadingOrderProducts = false;
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
    supplierId: 0,
    sort: 'name',
  };

  supplierSearch = '';
  orderFilters = {
    supplierId: 0,
    q: '',
    onlyLow: true,
  };
  orderSelectedIds = new Set<number>();
  orderQuantities: Record<number, number> = {};
  orderNotes: Record<number, string> = {};
  orderMessage = '';
  supplierForm = this.emptySupplierForm();

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
  movementDetailsOpen = false;
  selectedLabelIds = new Set<number>();
  labelCopies = 1;
  private scannerControls?: IScannerControls;
  private scannerReader?: BrowserMultiFormatReader;
  private lastScanValue = '';
  private lastScanAt = 0;
  private queryParamSub?: Subscription;
  private internalWarehouseUpdateSub?: Subscription;
  private referenceSearchTimers: Record<'customer' | 'employee', any> = {
    customer: null,
    employee: null,
  };
  private adminRequestSearchTimers: Record<'customer' | 'employee', any> = {
    customer: null,
    employee: null,
  };
  private materialOrderReferenceTimers: Record<MaterialOrderReferenceKind, any> = {
    customer: null, recipient: null, preparation: null, delivery: null,
  };

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    public global: GlobalService,
    private popup: PopupServiceService,
    private cdr: ChangeDetectorRef,
    private socketService: SocketService,
  ) {}

  ngOnInit(): void {
    this.applyRouteTab(this.route.snapshot.queryParamMap.get('tab'));
    this.queryParamSub = this.route.queryParamMap.subscribe((params) => {
      this.applyRouteTab(params.get('tab'));
      this.applyMaterialOrderStatusRoute(params.get('materialStatus'));
      this.applyRequestRoute(params.get('requestView'), params.get('requestId'));
      this.applyWarehouseEntityRoute(params.get('view'), params.get('entityId'));
    });
    this.loadMeta();
    this.loadReferences();
    this.loadCategories();
    this.loadSuppliers();
    this.loadSummary();
    this.loadProducts();
    this.loadProductRequests();
    if (this.activeTab === 'material-orders') this.loadMaterialOrders();
    if (this.activeTab === 'movements') this.loadMovementReport();
    this.internalWarehouseUpdateSub = this.socketService
      .onInternalWarehouseSummaryUpdate()
      .subscribe(() => {
        this.loadSummary();
        this.loadProductRequests();
        if (this.activeTab === 'material-orders') this.loadMaterialOrders();
        if (['list', 'in', 'out', 'products'].includes(this.activeTab)) this.loadProducts();
        if (this.activeTab === 'movements') this.loadMovementReport();
      });
  }

  ngOnDestroy(): void {
    this.queryParamSub?.unsubscribe();
    this.internalWarehouseUpdateSub?.unsubscribe();
    clearTimeout(this.adminRequestSearchTimers.customer);
    clearTimeout(this.adminRequestSearchTimers.employee);
    (Object.keys(this.materialOrderReferenceTimers) as MaterialOrderReferenceKind[])
      .forEach((kind) => clearTimeout(this.materialOrderReferenceTimers[kind]));
    this.stopScanner();
  }

  get isMobileLike(): boolean {
    return window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  }

  get canView(): boolean {
    return this.global.hasPermission('INTERNAL_WAREHOUSE_VIEW');
  }

  get activeTabLabel(): string {
    const labels: Record<WarehouseTab, string> = {
      list: 'Lista prodotti',
      requests: 'Richieste prodotti',
      'material-orders': 'Ordini materiali',
      orders: 'Ordini fornitori',
      in: 'Entrata prodotti',
      out: 'Uscita prodotti',
      movements: 'Movimenti e report',
      products: 'Prodotti',
      tools: 'Strumenti',
    };
    return labels[this.activeTab];
  }

  get requestPageTitle(): string {
    if (this.requestView === 'new') return 'Nuova richiesta';
    if (this.requestView === 'detail') return 'Scheda richiesta';
    return 'Richieste prodotti';
  }

  get entityPageTitle(): string {
    if (this.activeTab === 'list') return this.productView === 'detail' ? 'Scheda prodotto' : 'Lista prodotti';
    if (this.activeTab === 'material-orders') {
      if (this.materialOrderView === 'new') return 'Nuovo ordine materiali';
      if (this.materialOrderView === 'detail') return 'Scheda ordine materiali';
      return this.materialOrderStatusViewLabel;
    }
    if (this.activeTab === 'orders') {
      if (this.supplierOrderView === 'new') return 'Nuovo ordine fornitore';
      if (this.supplierOrderView === 'detail') return 'Scheda ordine fornitore';
      return 'Ordini fornitori';
    }
    if (this.activeTab === 'products') return this.productForm.id ? 'Modifica prodotto' : 'Nuovo prodotto';
    return this.activeTabLabel;
  }

  get currentEntityView(): WarehouseEntityView {
    if (this.activeTab === 'list') return this.productView;
    if (this.activeTab === 'material-orders') return this.materialOrderView;
    if (this.activeTab === 'products') return 'new';
    return this.supplierOrderView;
  }

  get filteredMaterialOrders(): any[] {
    const query = this.normalizeRequestSearch(this.materialOrderSearch);
    return this.materialOrders.filter((order) => {
      if (!this.materialOrderMatchesStatusView(order?.status)) return false;
      if (!query) return true;
      return this.normalizeRequestSearch([
      order.numeroOrdine, this.materialOrderRecipient(order), order.status, order.note,
      ...(order.items || []).map((item: any) => item.product?.name || ''),
      ].join(' ')).includes(query);
    });
  }

  get materialOrderStatusViewLabel(): string {
    const labels: Record<MaterialOrderStatusView, string> = {
      'to-prepare': 'Da preparare',
      preparing: 'In preparazione',
      prepared: 'Preparati',
      'waiting-customer': 'In attesa firma destinatario',
      'partially-delivered': 'Consegnati in parte',
      completed: 'Completati',
      cancelled: 'Annullati',
    };
    return labels[this.materialOrderStatusView];
  }

  get filteredSupplierOrders(): SupplierOrder[] {
    const query = this.normalizeRequestSearch(this.supplierOrderSearch);
    if (!query) return this.supplierOrders;
    return this.supplierOrders.filter((order) => this.normalizeRequestSearch([
      order.numeroOrdine, order.supplier?.name, order.recipient, order.subject, order.message,
      this.supplierOrderStatusLabel(order.status),
      ...(order.items || []).map((item) => item.product?.name || ''),
    ].join(' ')).includes(query));
  }

  get filteredProductRequests(): WarehouseRequest[] {
    const query = this.normalizeRequestSearch(this.requestSearch);
    if (!query) return this.productRequests;
    return this.productRequests.filter((request) => this.normalizeRequestSearch([
      this.requestNumber(request),
      this.requestRequesterLabel(request),
      this.requestProductSummary(request),
      request.note,
      request.adminNote,
      this.requestStatusLabel(request.status),
      ...this.requestItems(request).map((item) => item.product?.name || ''),
    ].join(' ')).includes(query));
  }

  get canRegisterIn(): boolean {
    return this.global.hasPermission('INTERNAL_WAREHOUSE_IN');
  }

  get preparationEmployees(): any[] {
    return this.references.employees.filter((employee) => employee.warehousePreparationEnabled === true);
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

  get pendingRequestEmployeesCount(): number {
    return new Set(this.productRequests.map((request) => request.employeeId).filter(Boolean)).size;
  }

  get pendingRequestQuantityTotal(): number {
    return this.productRequests.reduce((total, request) => {
      return total + this.requestItems(request)
        .reduce((sum, item) => sum + this.requestItemRemaining(item), 0);
    }, 0);
  }

  get oldestPendingRequest(): WarehouseRequest | null {
    if (!this.productRequests.length) return null;
    return [...this.productRequests].sort((a, b) => {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    })[0];
  }

  private api(path = ''): string {
    return `${this.global.url}admin/internal-warehouse${path}`;
  }

  private applyRouteTab(tabValue: string | null): void {
    const tab = tabValue as WarehouseTab | null;
    if (!tab || !this.validTabs.includes(tab) || tab === this.activeTab) return;
    this.setTab(tab);
  }

  private applyMaterialOrderStatusRoute(value: string | null): void {
    if (this.activeTab !== 'material-orders') return;
    const allowed: MaterialOrderStatusView[] = [
      'to-prepare', 'preparing', 'prepared', 'waiting-customer',
      'partially-delivered', 'completed', 'cancelled',
    ];
    const next = allowed.includes(value as MaterialOrderStatusView)
      ? value as MaterialOrderStatusView
      : 'to-prepare';
    const nextArchived = next === 'completed' || next === 'cancelled';
    const scopeChanged = nextArchived !== this.showArchivedMaterialOrders;
    this.materialOrderStatusView = next;
    this.showArchivedMaterialOrders = nextArchived;
    if (!value) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { materialStatus: next },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    if (scopeChanged) this.loadMaterialOrders();
  }

  private materialOrderMatchesStatusView(status: string): boolean {
    if (this.materialOrderStatusView === 'to-prepare') {
      return ['draft', 'requested', 'approved'].includes(status);
    }
    const statusByView: Record<Exclude<MaterialOrderStatusView, 'to-prepare'>, string> = {
      preparing: 'preparing',
      prepared: 'prepared',
      'waiting-customer': 'ready',
      'partially-delivered': 'partially_delivered',
      completed: 'completed',
      cancelled: 'cancelled',
    };
    return status === statusByView[this.materialOrderStatusView as Exclude<MaterialOrderStatusView, 'to-prepare'>];
  }

  private applyRequestRoute(viewValue: string | null, requestIdValue: string | null): void {
    if (this.activeTab !== 'requests') return;
    const view: WarehouseRequestView = ['new', 'detail'].includes(String(viewValue))
      ? viewValue as WarehouseRequestView
      : 'list';
    this.requestView = view;
    if (view !== 'detail') {
      this.selectedProductRequest = null;
      return;
    }
    const requestId = Number(requestIdValue || 0);
    const current = this.productRequests.find((request) => request.id === requestId) || null;
    if (current) this.selectedProductRequest = current;
    else if (requestId > 0) this.loadProductRequestById(requestId);
  }

  private applyWarehouseEntityRoute(viewValue: string | null, entityIdValue: string | null): void {
    if (!['list', 'material-orders', 'orders'].includes(this.activeTab)) return;
    const view: WarehouseEntityView = ['new', 'detail'].includes(String(viewValue))
      ? viewValue as WarehouseEntityView : 'list';
    const id = Number(entityIdValue || 0);
    if (this.activeTab === 'list') {
      this.productView = view === 'new' ? 'list' : view;
      if (view === 'detail' && id) {
        const product = this.products.find((item) => item.id === id);
        if (product) this.selectProduct(product);
      }
    } else if (this.activeTab === 'material-orders') {
      this.materialOrderView = view;
      if (view === 'detail' && id) this.selectedMaterialOrder = this.materialOrders.find((item) => item.id === id) || null;
    } else {
      this.supplierOrderView = view;
      if (view === 'detail' && id) this.selectedSupplierOrder = this.supplierOrders.find((item) => item.id === id) || null;
    }
  }

  openEntityNew(): void {
    if (this.activeTab === 'list') {
      this.resetProductForm();
      this.setTab('products');
      return;
    }
    if (this.activeTab === 'material-orders') {
      this.materialOrderView = 'new';
      this.resetMaterialOrderReferencePickers();
    }
    if (this.activeTab === 'orders') this.supplierOrderView = 'new';
    this.navigateEntityView('new');
  }

  openProductSheet(product: WarehouseProduct): void {
    this.productView = 'detail';
    this.selectProduct(product);
    this.navigateEntityView('detail', product.id);
  }

  openMaterialOrderSheet(order: any): void {
    this.materialOrderView = 'detail';
    this.selectedMaterialOrder = order;
    this.editingMaterialOrderAssignment = false;
    this.navigateEntityView('detail', order.id);
  }

  openSupplierOrderSheet(order: SupplierOrder): void {
    this.supplierOrderView = 'detail';
    this.selectedSupplierOrder = order;
    this.navigateEntityView('detail', order.id);
  }

  closeEntityView(): void {
    if (this.activeTab === 'products') {
      this.setTab('list');
      return;
    }
    if (this.activeTab === 'list') {
      this.productView = 'list';
      this.selectedProduct = null;
    } else if (this.activeTab === 'material-orders') {
      this.materialOrderView = 'list';
      this.selectedMaterialOrder = null;
      this.editingMaterialOrderAssignment = false;
      this.loadMaterialOrders();
    } else if (this.activeTab === 'orders') {
      this.supplierOrderView = 'list';
      this.selectedSupplierOrder = null;
      this.loadSupplierOrders();
    }
    this.navigateEntityView('list');
  }

  private navigateEntityView(view: WarehouseEntityView, id?: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: this.activeTab, view: view === 'list' ? null : view, entityId: id || null },
      queryParamsHandling: 'merge',
    });
  }

  toggleCurrentArchive(): void {
    if (this.activeTab === 'list') {
      this.showArchivedProducts = !this.showArchivedProducts;
      this.loadProducts();
    } else if (this.activeTab === 'material-orders') {
      this.materialOrderSearch = '';
      return;
    } else if (this.activeTab === 'orders') {
      this.showArchivedSupplierOrders = !this.showArchivedSupplierOrders;
      this.supplierOrderSearch = '';
      this.loadSupplierOrders();
    }
  }

  materialOrderRecipient(order: any): string {
    const snapshot = typeof order?.customerSnapshotJson === 'string'
      ? this.parseJsonObject(order.customerSnapshotJson) : (order?.customerSnapshotJson || {});
    if (order?.customerId) {
      return this.entityReferenceLabel(order.customerId, snapshot?.displayName || `Cliente ${order.customerId}`);
    }
    if (order?.recipientEmployeeId) {
      if (order?.recipientEmployee) {
        return this.employeeReferenceLabel(order.recipientEmployee);
      }
      const employee = this.references.employees.find((item) => Number(item.id) === Number(order.recipientEmployeeId));
      return employee ? this.employeeReferenceLabel(employee) : `Dipendente #${order.recipientEmployeeId}`;
    }
    return 'Destinatario non indicato';
  }

  materialOrderPreparationEmployee(order: any): string {
    if (order?.preparationEmployee) {
      return this.employeeReferenceLabel(order.preparationEmployee);
    }
    const employee = this.references.employees.find(
      (item) => Number(item.id) === Number(order?.preparationEmployeeId),
    );
    return employee ? this.employeeReferenceLabel(employee) : 'Ufficio';
  }

  materialOrderDeliveryEmployee(order: any): string {
    if (order?.deliveryEmployee) {
      return this.employeeReferenceLabel(order.deliveryEmployee);
    }
    const employee = this.references.employees.find(
      (item) => Number(item.id) === Number(order?.deliveryEmployeeId),
    );
    return employee ? this.employeeReferenceLabel(employee) : 'Da definire';
  }

  materialOrderStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Bozza', requested: 'Richiesto', approved: 'Da preparare', preparing: 'In preparazione', prepared: 'Preparato',
      ready: 'In attesa firma destinatario', partially_delivered: 'Consegnato in parte', completed: 'Completato', cancelled: 'Annullato',
    };
    return labels[status] || status;
  }

  materialOrderStatusClass(status: string): string {
    if (status === 'completed' || status === 'prepared') return 'success';
    if (status === 'cancelled') return 'danger';
    if (status === 'partially_delivered' || status === 'preparing') return 'info';
    return 'warning';
  }

  materialOrderHasRemaining(order: any): boolean {
    return (order?.items || []).some((item: any) => (
      Number(item.requestedQuantity || 0) > Number(item.deliveredQuantity || 0)
    ));
  }

  canMarkMaterialOrderPrepared(order: any): boolean {
    return order?.status === 'preparing' || (
      order?.status === 'approved' && !Number(order?.preparationEmployeeId || 0)
    );
  }

  canDeliverMaterialOrder(order: any): boolean {
    return ['prepared', 'partially_delivered'].includes(String(order?.status || '')) &&
      this.materialOrderHasRemaining(order);
  }

  supplierOrderStatusLabel(status: SupplierOrder['status']): string {
    return status === 'completed' ? 'Completato' : status === 'cancelled' ? 'Annullato' : 'Inviato';
  }

  supplierOrderStatusClass(status: SupplierOrder['status']): string {
    return status === 'completed' ? 'success' : status === 'cancelled' ? 'danger' : 'info';
  }

  private parseJsonObject(value: string): any {
    try { return JSON.parse(value || '{}'); } catch { return {}; }
  }

  openNewProductRequest(): void {
    this.requestView = 'new';
    this.selectedProductRequest = null;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: 'requests', requestView: 'new', requestId: null },
      queryParamsHandling: 'merge',
    });
  }

  openProductRequest(request: WarehouseRequest): void {
    this.requestView = 'detail';
    this.selectedProductRequest = request;
    this.editingRequestAssignment = false;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: 'requests', requestView: 'detail', requestId: request.id },
      queryParamsHandling: 'merge',
    });
  }

  closeProductRequestView(): void {
    this.requestView = 'list';
    this.selectedProductRequest = null;
    this.editingRequestAssignment = false;
    this.clearCancelRequest();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: 'requests', requestView: null, requestId: null },
      queryParamsHandling: 'merge',
    });
    this.loadProductRequests();
  }

  toggleRequestArchive(): void {
    this.showArchivedRequests = !this.showArchivedRequests;
    this.requestSearch = '';
    this.loadProductRequests();
  }

  startRequestAssignmentEdit(request: WarehouseRequest): void {
    // Le ricerche autocomplete sostituiscono temporaneamente le reference con i
    // soli risultati trovati. Ricarichiamo l'elenco completo prima di mostrare
    // il form, altrimenti potrebbe comparire soltanto il richiedente corrente.
    this.loadReferences();
    this.requestAssignmentForm = {
      customerId: String(request.customerId || ''),
      employeeId: Number(request.employeeId || 0),
    };
    this.editingRequestAssignment = true;
    this.clearFeedback();
  }

  saveRequestAssignment(request: WarehouseRequest): void {
    if (!this.requestAssignmentForm.customerId && !this.requestAssignmentForm.employeeId) {
      this.error = 'Seleziona almeno un cliente o un dipendente richiedente.';
      return;
    }
    this.saving = true;
    this.http.patch<WarehouseRequest>(this.api(`/requests/${request.id}`), {
      customerId: this.requestAssignmentForm.customerId || null,
      employeeId: Number(this.requestAssignmentForm.employeeId || 0) || null,
    }).subscribe({
      next: (updated) => {
        this.saving = false;
        this.editingRequestAssignment = false;
        this.selectedProductRequest = updated;
        this.productRequests = this.productRequests.map((item) => item.id === updated.id ? updated : item);
        this.message = 'Richiedente aggiornato.';
      },
      error: (err) => {
        this.saving = false;
        this.handleError(err, 'Richiedente non aggiornato.');
      },
    });
  }

  startMaterialOrderAssignmentEdit(order: any): void {
    this.loadReferences();
    this.materialOrderAssignmentForm = {
      recipientEmployeeId: order.customerId ? 0 : Number(order.recipientEmployeeId || 0),
      preparationEmployeeId: Number(order.preparationEmployeeId || 0),
      deliveryEmployeeId: Number(order.deliveryEmployeeId || 0),
      deliveryMode: order.deliveryMode === 'planned' ? 'planned' : 'immediate',
      scheduledStart: this.dateTimeLocalValue(order.scheduledStart),
      scheduledEnd: this.dateTimeLocalValue(order.scheduledEnd),
    };
    this.editingMaterialOrderAssignment = true;
    this.clearFeedback();
  }

  saveMaterialOrderAssignment(order: any): void {
    if (!order.customerId && !this.materialOrderAssignmentForm.recipientEmployeeId) {
      this.error = 'Seleziona un dipendente destinatario.';
      return;
    }
    this.saving = true;
    this.http.patch<any>(this.materialApi(`/${order.id}/assignment`), {
      ...this.materialOrderAssignmentForm,
    }).subscribe({
      next: (updated) => {
        this.saving = false;
        this.editingMaterialOrderAssignment = false;
        this.selectedMaterialOrder = updated;
        this.materialOrders = this.materialOrders.map((item) => item.id === updated.id ? updated : item);
        this.message = 'Assegnazione ordine aggiornata.';
      },
      error: (err) => {
        this.saving = false;
        this.handleError(err, 'Assegnazione non aggiornata.');
      },
    });
  }

  requestNumber(request: WarehouseRequest): string {
    return `RICH-${String(request.id).padStart(6, '0')}`;
  }

  requestRequesterLabel(request: WarehouseRequest): string {
    const customer = request.customerId
      ? this.customerReferenceLabelForRecord(request.customerId, request.customer)
      : '';
    const employee = request.employeeId
      ? this.employeeReferenceLabelForRecord(request.employeeId, request.employee)
      : '';
    if (request.customerId && request.employeeId) {
      return `${customer} · ${employee}`;
    }
    if (request.customerId) return customer;
    if (request.employeeId) return employee;
    return 'Richiedente non indicato';
  }

  requestStatusClass(status: WarehouseRequest['status']): string {
    if (status === 'fulfilled') return 'success';
    if (status === 'cancelled' || status === 'rejected') return 'danger';
    if (status === 'approved') return 'info';
    return 'warning';
  }

  private normalizeRequestSearch(value: unknown): string {
    return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  }

  setTab(tab: WarehouseTab): void {
    this.activeTab = tab;
    if (this.route.snapshot.queryParamMap.get('tab') !== tab) {
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {
          tab,
          requestView: tab === 'requests' ? undefined : null,
          requestId: tab === 'requests' ? undefined : null,
          view: null,
          entityId: null,
        },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
    this.message = '';
    this.error = '';
    this.movementDetailsOpen = false;
    if (!['in', 'out', 'products'].includes(tab)) {
      this.stopScanner();
    }
    if (tab === 'movements') this.loadMovementReport();
    if (tab === 'requests') this.loadProductRequests();
    if (tab === 'material-orders') this.loadMaterialOrders();
    if (tab === 'orders') {
      this.loadSuppliers();
      this.loadSupplierOrders();
    }
  }

  private materialApi(path = ''): string {
    return `${this.global.url}admin/material-orders${path}`;
  }

  loadMaterialOrders(): void {
    const scope = this.showArchivedMaterialOrders ? 'archive' : 'active';
    this.http.get<any[]>(this.materialApi(`?scope=${scope}`)).subscribe({
      next: (orders) => {
        this.materialOrders = Array.isArray(orders) ? orders : [];
        const selectedId = Number(this.route.snapshot.queryParamMap.get('entityId') || 0);
        if (this.materialOrderView === 'detail' && selectedId) {
          this.selectedMaterialOrder = this.materialOrders.find((item) => item.id === selectedId) || null;
        }
      },
      error: (err) => this.handleError(err, 'Impossibile caricare gli ordini materiali.'),
    });
    this.http.get<any>(this.materialApi('/config')).subscribe({
      next: (config) => {
        this.materialOrderConfig = config || {};
        this.materialOrderFields = Array.isArray(config?.fields) ? config.fields : [];
        for (const field of this.materialOrderFields) {
          if (!Object.prototype.hasOwnProperty.call(this.materialOrderForm.fields, field.key)) {
            this.materialOrderForm.fields[field.key] = field.defaultValue || '';
          }
        }
        if (this.materialOrderForm.customerId) {
          this.onMaterialOrderCustomerChange();
        }
      },
    });
  }

  loadSupplierOrders(): void {
    if (!this.canView) return;
    const scope = this.showArchivedSupplierOrders ? 'archive' : 'active';
    this.http.get<SupplierOrder[]>(this.api(`/orders?scope=${scope}`)).subscribe({
      next: (orders) => {
        this.supplierOrders = orders || [];
        const selectedId = Number(this.route.snapshot.queryParamMap.get('entityId') || 0);
        if (this.supplierOrderView === 'detail' && selectedId) {
          this.selectedSupplierOrder = this.supplierOrders.find((item) => item.id === selectedId) || this.selectedSupplierOrder;
        }
        if (this.selectedSupplierOrder) {
          this.selectedSupplierOrder = this.supplierOrders.find((item) => item.id === this.selectedSupplierOrder?.id) || this.selectedSupplierOrder;
        }
      },
      error: (err) => this.handleError(err, 'Impossibile caricare gli ordini fornitori.'),
    });
  }

  updateSupplierOrderStatus(order: SupplierOrder, status: SupplierOrder['status']): void {
    this.http.patch<SupplierOrder>(this.api(`/orders/${order.id}/status`), { status }).subscribe({
      next: (saved) => {
        this.selectedSupplierOrder = saved;
        this.message = status === 'completed' ? 'Ordine completato e archiviato.' : status === 'cancelled' ? 'Ordine annullato.' : 'Ordine ripristinato.';
        this.loadSupplierOrders();
      },
      error: (err) => this.handleError(err, 'Impossibile aggiornare l’ordine fornitore.'),
    });
  }

  addMaterialOrderLine(): void {
    this.materialOrderForm.items.push({ productId: 0, quantity: 1, note: '' });
  }

  removeMaterialOrderLine(index: number): void {
    this.materialOrderForm.items.splice(index, 1);
    if (!this.materialOrderForm.items.length) this.addMaterialOrderLine();
  }

  addAdminRequestLine(): void {
    this.adminRequestForm.items.push({ productId: 0, quantity: 1 });
  }

  removeAdminRequestLine(index: number): void {
    this.adminRequestForm.items.splice(index, 1);
    if (!this.adminRequestForm.items.length) this.addAdminRequestLine();
  }

  createAdminRequest(): void {
    const customerId = String(this.adminRequestForm.customerId || '').trim();
    const employeeId = Number(this.adminRequestForm.employeeId || 0);
    const items = this.adminRequestForm.items
      .filter((item: any) => Number(item.productId) > 0 && Number(item.quantity) > 0)
      .map((item: any) => ({ productId: Number(item.productId), quantity: Number(item.quantity) }));
    if (!customerId && !employeeId) {
      this.error = 'Seleziona almeno un cliente o un dipendente richiedente.';
      return;
    }
    if (!items.length) {
      this.error = 'Inserisci almeno un prodotto e una quantità.';
      return;
    }
    this.saving = true;
    this.error = '';
    this.http.post<WarehouseRequest>(this.api('/requests'), {
      customerId: customerId || null,
      employeeId: employeeId || null,
      note: String(this.adminRequestForm.note || '').trim(),
      items,
    }).subscribe({
      next: (request) => {
        this.saving = false;
        this.adminRequestForm = { customerId: '', employeeId: 0, note: '', items: [{ productId: 0, quantity: 1 }] };
        this.adminRequestSearch = { customer: '', employee: '' };
        this.adminRequestSearchOpen = { customer: false, employee: false };
        this.message = `Richiesta RICH-${String(request.id).padStart(6, '0')} creata. Ora puoi stampare il foglio per il magazziniere.`;
        this.showArchivedRequests = false;
        this.closeProductRequestView();
        this.loadSummary();
      },
      error: (err) => {
        this.saving = false;
        this.handleError(err, 'Richiesta non creata.');
      },
    });
  }

  onAdminRequestSearchChange(kind: 'customer' | 'employee'): void {
    if (kind === 'customer') this.adminRequestForm.customerId = '';
    else this.adminRequestForm.employeeId = 0;

    clearTimeout(this.adminRequestSearchTimers[kind]);
    const q = this.adminRequestSearch[kind].trim();
    this.adminRequestSearchOpen[kind] = !!q;
    if (!q) {
      this.adminRequestSearchLoading[kind] = false;
      return;
    }
    this.adminRequestSearchLoading[kind] = true;
    this.adminRequestSearchTimers[kind] = setTimeout(() => {
      let params = new HttpParams().set('q', q);
      this.http.get<WarehouseReferences>(this.api('/references'), { params }).subscribe({
        next: (refs) => {
          if (this.adminRequestSearch[kind].trim() !== q) return;
          this.references = {
            ...this.references,
            customers: kind === 'customer' ? (refs?.customers || []) : this.references.customers,
            employees: kind === 'employee' ? (refs?.employees || []) : this.references.employees,
          };
          this.adminRequestSearchLoading[kind] = false;
        },
        error: () => {
          if (this.adminRequestSearch[kind].trim() === q) {
            this.adminRequestSearchLoading[kind] = false;
          }
        },
      });
    }, 250);
  }

  adminRequestReferenceResults(kind: 'customer' | 'employee'): any[] {
    const q = this.adminRequestSearch[kind].trim().toLocaleLowerCase('it-IT');
    if (!q) return [];
    const list = kind === 'customer' ? this.references.customers : this.references.employees;
    return (list || []).filter((item) => {
      const label = kind === 'customer' ? this.customerReferenceLabel(item) : this.employeeReferenceLabel(item);
      const searchableValues = kind === 'customer'
        ? [item?.numeroCliente, item?.ragioneSociale, item?.denominazione, item?.nominativo, item?.nome, item?.cognome, item?.email]
        : [item?.id, item?.nome, item?.cognome, item?.email];
      return [label, ...searchableValues]
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLocaleLowerCase('it-IT').includes(q));
    }).slice(0, 8);
  }

  openAdminRequestSearch(kind: 'customer' | 'employee'): void {
    if (this.adminRequestSearch[kind].trim()) this.adminRequestSearchOpen[kind] = true;
  }

  closeAdminRequestSearch(kind: 'customer' | 'employee'): void {
    setTimeout(() => { this.adminRequestSearchOpen[kind] = false; }, 120);
  }

  selectAdminRequestCustomer(customer: any): void {
    this.adminRequestForm.customerId = String(customer?.numeroCliente || '');
    this.adminRequestSearch.customer = this.customerReferenceLabel(customer);
    this.adminRequestSearchOpen.customer = false;
  }

  selectAdminRequestEmployee(employee: any): void {
    this.adminRequestForm.employeeId = Number(employee?.id || 0);
    this.adminRequestSearch.employee = this.employeeReferenceLabel(employee);
    this.adminRequestSearchOpen.employee = false;
  }

  clearAdminRequestReference(kind: 'customer' | 'employee'): void {
    this.adminRequestSearch[kind] = '';
    this.adminRequestSearchOpen[kind] = false;
    if (kind === 'customer') this.adminRequestForm.customerId = '';
    else this.adminRequestForm.employeeId = 0;
  }

  onMaterialOrderCustomerChange(): void {
    const customer = this.references.customers.find(
      (item) => String(item?.numeroCliente || '') === String(this.materialOrderForm.customerId || ''),
    ) || (
      String(this.materialOrderSourceCustomer?.numeroCliente || '') ===
      String(this.materialOrderForm.customerId || '')
        ? this.materialOrderSourceCustomer
        : null
    );
    if (!customer) return;
    for (const field of this.materialOrderFields) {
      const source = String(field?.sourceField || '');
      if (!source.startsWith('customer.')) continue;
      const key = source.slice('customer.'.length);
      const value = this.global.getRecordValueByFieldKey('customer', customer, key);
      this.materialOrderForm.fields[field.key] =
        value === undefined || value === null ? field.defaultValue ?? '' : value;
    }
  }

  onMaterialOrderScheduledStartChange(value: string): void {
    this.setScheduledEndThirtyMinutesAfter(value, this.materialOrderForm);
  }

  onMaterialOrderAssignmentScheduledStartChange(value: string): void {
    this.setScheduledEndThirtyMinutesAfter(value, this.materialOrderAssignmentForm);
  }

  private setScheduledEndThirtyMinutesAfter(value: string, target: { scheduledEnd: string }): void {
    const start = String(value || '').trim();
    if (!start) {
      target.scheduledEnd = '';
      return;
    }
    const parsed = new Date(start);
    if (Number.isNaN(parsed.getTime())) return;
    parsed.setMinutes(parsed.getMinutes() + 30);
    const pad = (part: number) => String(part).padStart(2, '0');
    target.scheduledEnd = [
      parsed.getFullYear(),
      '-', pad(parsed.getMonth() + 1),
      '-', pad(parsed.getDate()),
      'T', pad(parsed.getHours()),
      ':', pad(parsed.getMinutes()),
    ].join('');
  }

  private dateTimeLocalValue(value: string | Date | null | undefined): string {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  }

  materialOrderReferenceOptions(kind: MaterialOrderReferenceKind): any[] {
    const query = this.materialOrderReferenceSearch[kind].trim().toLocaleLowerCase('it-IT');
    const isCustomer = kind === 'customer';
    const localSource = isCustomer ? this.references.customers : this.references.employees;
    const remoteSource = this.materialOrderReferenceResults[kind];
    let source = query && remoteSource.length ? remoteSource : localSource;
    if (kind === 'preparation') {
      source = source.filter((employee) => employee?.warehousePreparationEnabled === true);
    }
    if (!query) return source.slice(0, 8);
    return source.filter((item) => {
      const label = isCustomer ? this.customerReferenceLabel(item) : this.employeeReferenceLabel(item);
      const values = isCustomer
        ? [label, item?.numeroCliente, item?.ragioneSociale, item?.nome, item?.cognome, item?.email]
        : [label, item?.id, item?.nome, item?.cognome, item?.email];
      return values.some((value) => String(value || '').toLocaleLowerCase('it-IT').includes(query));
    }).slice(0, 8);
  }

  onMaterialOrderReferenceSearchChange(kind: MaterialOrderReferenceKind): void {
    this.clearMaterialOrderReferenceValue(kind, false);
    this.materialOrderReferenceOpen[kind] = true;
    this.materialOrderReferenceActiveIndex[kind] = -1;
    clearTimeout(this.materialOrderReferenceTimers[kind]);
    const query = this.materialOrderReferenceSearch[kind].trim();
    if (!query) {
      this.materialOrderReferenceLoading[kind] = false;
      this.materialOrderReferenceResults[kind] = [];
      return;
    }
    this.materialOrderReferenceLoading[kind] = true;
    this.materialOrderReferenceTimers[kind] = setTimeout(() => {
      const params = new HttpParams().set('q', query);
      this.http.get<WarehouseReferences>(this.api('/references'), { params }).subscribe({
        next: (refs) => {
          if (this.materialOrderReferenceSearch[kind].trim() !== query) return;
          const results = kind === 'customer' ? refs?.customers : refs?.employees;
          this.materialOrderReferenceResults[kind] = results || [];
          this.materialOrderReferenceLoading[kind] = false;
        },
        error: () => {
          if (this.materialOrderReferenceSearch[kind].trim() === query) {
            this.materialOrderReferenceLoading[kind] = false;
          }
        },
      });
    }, 250);
  }

  openMaterialOrderReference(kind: MaterialOrderReferenceKind, event?: FocusEvent): void {
    this.materialOrderReferenceOpen[kind] = true;
    this.materialOrderReferenceActiveIndex[kind] = -1;
    const input = event?.target as HTMLInputElement | null;
    if (input && this.materialOrderReferenceValue(kind)) input.select();
  }

  closeMaterialOrderReference(kind: MaterialOrderReferenceKind): void {
    setTimeout(() => {
      this.materialOrderReferenceOpen[kind] = false;
      this.materialOrderReferenceActiveIndex[kind] = -1;
    }, 120);
  }

  handleMaterialOrderReferenceKeydown(event: KeyboardEvent, kind: MaterialOrderReferenceKind): void {
    const options = this.materialOrderReferenceOptions(kind);
    if (event.key === 'Escape') {
      this.materialOrderReferenceOpen[kind] = false;
      this.materialOrderReferenceActiveIndex[kind] = -1;
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    if (!this.materialOrderReferenceOpen[kind]) this.materialOrderReferenceOpen[kind] = true;
    if (!options.length) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') {
      this.materialOrderReferenceActiveIndex[kind] =
        (this.materialOrderReferenceActiveIndex[kind] + 1) % options.length;
    } else if (event.key === 'ArrowUp') {
      this.materialOrderReferenceActiveIndex[kind] =
        (this.materialOrderReferenceActiveIndex[kind] - 1 + options.length) % options.length;
    } else {
      const index = Math.max(0, this.materialOrderReferenceActiveIndex[kind]);
      this.selectMaterialOrderReference(kind, options[index]);
    }
  }

  selectMaterialOrderReference(kind: MaterialOrderReferenceKind, item: any): void {
    if (kind === 'customer') {
      this.clearMaterialOrderReference('recipient');
      this.materialOrderForm.customerId = String(item?.numeroCliente || '');
      this.materialOrderReferenceSearch.customer = this.customerReferenceLabel(item);
      this.onMaterialOrderCustomerChange();
    } else {
      const id = Number(item?.id || 0);
      if (kind === 'recipient') {
        this.clearMaterialOrderReference('customer');
        this.materialOrderForm.recipientEmployeeId = id;
      }
      if (kind === 'preparation') this.materialOrderForm.preparationEmployeeId = id;
      if (kind === 'delivery') this.materialOrderForm.deliveryEmployeeId = id;
      this.materialOrderReferenceSearch[kind] = this.employeeReferenceLabel(item);
    }
    this.materialOrderReferenceOpen[kind] = false;
    this.materialOrderReferenceActiveIndex[kind] = -1;
  }

  clearMaterialOrderReference(kind: MaterialOrderReferenceKind): void {
    this.materialOrderReferenceSearch[kind] = '';
    this.materialOrderReferenceResults[kind] = [];
    this.clearMaterialOrderReferenceValue(kind, true);
  }

  isMaterialOrderReferenceDisabled(kind: MaterialOrderReferenceKind): boolean {
    if (kind === 'customer') return Number(this.materialOrderForm.recipientEmployeeId || 0) > 0;
    if (kind === 'recipient') return !!String(this.materialOrderForm.customerId || '').trim();
    return false;
  }

  materialOrderReferenceValue(kind: MaterialOrderReferenceKind): string | number {
    if (kind === 'customer') return this.materialOrderForm.customerId;
    if (kind === 'recipient') return this.materialOrderForm.recipientEmployeeId;
    if (kind === 'preparation') return this.materialOrderForm.preparationEmployeeId;
    return this.materialOrderForm.deliveryEmployeeId;
  }

  materialOrderReferenceOptionId(kind: MaterialOrderReferenceKind, index: number): string {
    return `material-order-${kind}-option-${index}`;
  }

  private clearMaterialOrderReferenceValue(kind: MaterialOrderReferenceKind, close: boolean): void {
    if (kind === 'customer') this.materialOrderForm.customerId = '';
    if (kind === 'recipient') this.materialOrderForm.recipientEmployeeId = 0;
    if (kind === 'preparation') this.materialOrderForm.preparationEmployeeId = 0;
    if (kind === 'delivery') this.materialOrderForm.deliveryEmployeeId = 0;
    if (close) this.materialOrderReferenceOpen[kind] = false;
  }

  private resetMaterialOrderReferencePickers(request?: WarehouseRequest): void {
    const destination = this.materialOrderDestinationFromRequest(request);
    this.materialOrderReferenceSearch = {
      customer: destination.customerId && request?.customerId
        ? this.customerReferenceLabelForRecord(request.customerId, request.customer)
        : '',
      recipient: destination.recipientEmployeeId && request?.employeeId
        ? this.employeeReferenceLabelForRecord(request.employeeId, request.employee)
        : '',
      preparation: '',
      delivery: '',
    };
    this.materialOrderReferenceOpen = { customer: false, recipient: false, preparation: false, delivery: false };
    this.materialOrderReferenceLoading = { customer: false, recipient: false, preparation: false, delivery: false };
    this.materialOrderReferenceResults = { customer: [], recipient: [], preparation: [], delivery: [] };
    this.materialOrderReferenceActiveIndex = { customer: -1, recipient: -1, preparation: -1, delivery: -1 };
  }

  materialOrderDestinationFromRequest(request?: WarehouseRequest): {
    customerId: string;
    recipientEmployeeId: number;
  } {
    const customerId = String(request?.customerId || '').trim();
    return customerId
      ? { customerId, recipientEmployeeId: 0 }
      : { customerId: '', recipientEmployeeId: Number(request?.employeeId || 0) };
  }

  prepareMaterialRequest(request: WarehouseRequest): void {
    this.clearFeedback();
    this.http.get<MaterialRequestAvailability>(
      this.materialApi(`/from-request/${request.id}/availability`),
    ).subscribe({
      next: async (availability) => {
        if (availability.noneAvailable) {
          const missing = this.materialAvailabilityMessage(availability);
          await this.popup.action(
            `Al momento non è possibile preparare nessun prodotto.\n\n${missing}`,
            'Materiale non disponibile',
            { type: 'warning', actionLabel: 'Chiudi' },
          );
          return;
        }
        if (!availability.allAvailable) {
          const proceed = await this.popup.confirm(
            `Non tutto il materiale richiesto è disponibile.\n\n${this.materialAvailabilityMessage(availability)}\n\nVuoi creare un ordine soltanto per le quantità disponibili? Il residuo rimarrà nella richiesta.`,
            'Disponibilità parziale',
            {
              type: 'warning',
              confirmLabel: 'Prepara disponibile',
              cancelLabel: 'Non preparare',
            },
          );
          if (!proceed) return;
        }
        this.openMaterialOrderFromRequest(request, availability);
      },
      error: (err) => this.handleError(err, 'Impossibile verificare la disponibilità del materiale.'),
    });
  }

  private materialAvailabilityMessage(availability: MaterialRequestAvailability): string {
    return availability.items.map((item) => {
      const name = item.product?.name || `Prodotto #${item.productId}`;
      const unit = item.product?.unit || 'pz';
      return item.missingQuantity > 0
        ? `• ${name}: richiesti ${item.requestedQuantity} ${unit}, disponibili ${item.preparableQuantity} ${unit}, mancanti ${item.missingQuantity} ${unit}`
        : `• ${name}: disponibili tutti i ${item.requestedQuantity} ${unit} richiesti`;
    }).join('\n');
  }

  private openMaterialOrderFromRequest(
    request: WarehouseRequest,
    availability: MaterialRequestAvailability,
  ): void {
    const destination = this.materialOrderDestinationFromRequest(request);
    this.materialOrderSourceRequestId = request.id;
    this.materialOrderSourceCustomer = request.customer || null;
    this.materialOrderForm = {
      customerId: destination.customerId,
      recipientEmployeeId: destination.recipientEmployeeId,
      preparationEmployeeId: 0,
      deliveryEmployeeId: 0,
      deliveryMode: 'immediate',
      scheduledStart: '',
      scheduledEnd: '',
      note: request.note || '',
      fields: {},
      items: availability.items
        .filter((item) => item.preparableQuantity > 0)
        .map((item) => ({
          productId: item.productId,
          quantity: item.preparableQuantity,
          note: request.note || '',
        })),
    };
    this.resetMaterialOrderReferencePickers(request);
    this.onMaterialOrderCustomerChange();
    this.setTab('material-orders');
    this.materialOrderView = 'new';
    this.navigateEntityView('new');
    this.message = availability.allAvailable
      ? `Disponibilità verificata. Ordine precompilato dalla richiesta #${request.id}: controlla destinatario, consegna e prodotti.`
      : `Ordine parziale precompilato dalla richiesta #${request.id}. Il materiale mancante resterà nella richiesta.`;
  }

  createMaterialOrder(): void {
    if (this.materialOrderForm.customerId && this.materialOrderForm.recipientEmployeeId) {
      this.error = 'Seleziona un solo destinatario: cliente oppure dipendente.';
      return;
    }
    if (!this.materialOrderForm.customerId && !this.materialOrderForm.recipientEmployeeId) {
      this.error = 'Seleziona un cliente oppure un dipendente destinatario.';
      return;
    }
    const items = this.materialOrderForm.items
      .filter((item: any) => Number(item.productId) > 0 && Number(item.quantity) > 0);
    if (!items.length) {
      this.error = 'Inserisci almeno un prodotto e una quantità.';
      return;
    }
    this.saving = true;
    const path = this.materialOrderSourceRequestId
      ? `/from-request/${this.materialOrderSourceRequestId}`
      : '';
    this.http.post<any>(this.materialApi(path), { ...this.materialOrderForm, items }).subscribe({
      next: () => {
        this.saving = false;
        this.message = 'Ordine materiali creato.';
        this.materialOrderForm = {
          customerId: '', recipientEmployeeId: 0, preparationEmployeeId: 0, deliveryEmployeeId: 0,
          deliveryMode: 'immediate', scheduledStart: '', scheduledEnd: '',
          note: '',
          fields: {}, items: [{ productId: 0, quantity: 1, note: '' }],
        };
        this.materialOrderSourceRequestId = 0;
        this.materialOrderSourceCustomer = null;
        this.resetMaterialOrderReferencePickers();
        this.materialOrderView = 'list';
        this.navigateEntityView('list');
        this.loadMaterialOrders();
        this.loadProductRequests();
      },
      error: (err) => {
        this.saving = false;
        this.handleError(err, 'Ordine materiali non creato.');
      },
    });
  }

  deliverMaterialOrder(order: any): void {
    const items = (order?.items || []).map((item: any) => ({
      orderItemId: item.id,
      quantity: Math.max(0, Number(order.preparationStartedAt
        ? Number(item.preparedQuantity || 0) - Number(item.deliveredQuantity || 0)
        : Number(item.requestedQuantity || 0) - Number(item.deliveredQuantity || 0))),
    })).filter((item: any) => item.quantity > 0);
    if (!items.length) return;
    this.http.post<any>(this.materialApi(`/${order.id}/deliver`), { items }).subscribe({
      next: (result) => {
        this.message = result?.alreadyDispatched
          ? 'Consegna già registrata. Il documento è pronto per la firma del destinatario.'
          : result?.requiresRecipientSignature || result?.requiresCustomerSignature
          ? `Consegna registrata. Il documento è pronto per la firma ${result?.signatureRecipientType === 'employee' ? 'del dipendente destinatario' : 'del cliente'}.`
          : 'Consegna registrata. L’ordine resterà aperto fino alla firma del destinatario.';
        if (result?.alreadyDispatched && Number(this.selectedMaterialOrder?.id) === Number(order.id)) {
          this.selectedMaterialOrder = { ...this.selectedMaterialOrder, status: 'ready' };
        }
        this.loadMaterialOrders();
        this.loadProducts();
        this.loadSummary();
      },
      error: (err) => this.handleError(err, 'Consegna non registrata.'),
    });
  }

  async markMaterialOrderPrepared(order: any): Promise<void> {
    if (!this.canMarkMaterialOrderPrepared(order) || this.saving) return;
    const confirmed = await this.popup.confirm(
      'Confermi che tutti i prodotti e le quantità dell’ordine sono stati preparati e controllati?',
      'Segna come preparato',
      {
        type: 'info',
        confirmLabel: 'Conferma preparazione',
        cancelLabel: 'Annulla',
      },
    );
    if (!confirmed) return;
    this.saving = true;
    this.http.post<{ order?: any }>(this.materialApi(`/${order.id}/mark-prepared`), {}).subscribe({
      next: (result) => {
        this.saving = false;
        this.message = 'Ordine segnato come preparato. Ora puoi segnarlo come consegnato.';
        this.selectedMaterialOrder = result?.order || { ...order, status: 'prepared' };
        this.materialOrderStatusView = 'prepared';
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { materialStatus: 'prepared' },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
        this.loadMaterialOrders();
      },
      error: (err) => {
        this.saving = false;
        this.handleError(err, 'Impossibile confermare la preparazione.');
      },
    });
  }

  materialPreparationPdf(order: any, action: 'open' | 'download' | 'print'): void {
    this.http.get(
      this.materialApi(`/${order.id}/preparation-pdf${action === 'download' ? '?download=true' : ''}`),
      { responseType: 'blob' },
    ).subscribe({
      next: (blob) => this.usePreparationPdf(blob, `preparazione-${order.numeroOrdine || order.id}.pdf`, action),
      error: (err) => this.handleError(err, 'Impossibile generare il foglio di preparazione.'),
    });
  }

  materialDeliveryPdf(delivery: any, action: 'open' | 'download' | 'print'): void {
    this.http.get(
      this.materialApi(`/deliveries/${delivery.id}/pdf${action === 'download' ? '?download=true' : ''}`),
      { responseType: 'blob' },
    ).subscribe({
      next: (blob) => this.usePreparationPdf(
        blob,
        `consegna-materiali-${delivery.numeroConsegna || delivery.id}.pdf`,
        action,
      ),
      error: (err) => this.handleError(err, 'Impossibile aprire il documento di consegna.'),
    });
  }

  async startPaperMaterialDeliverySignature(delivery: any, input: HTMLInputElement): Promise<void> {
    const choice = await this.popup.choose(
      'Dichiara che il documento è stato firmato dal destinatario sulla copia cartacea. Puoi allegare una scansione/foto oppure conservare soltanto l’originale.',
      'Registra copia cartacea firmata',
      {
        primaryLabel: 'Allega e conferma',
        secondaryLabel: 'Conferma senza allegato',
        cancelLabel: 'Annulla',
      },
    );
    if (choice === 'primary') {
      input.click();
      return;
    }
    if (choice === 'secondary') {
      this.submitPaperMaterialDeliverySignature(delivery, null);
    }
  }

  registerPaperMaterialDeliverySignature(delivery: any, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.submitPaperMaterialDeliverySignature(delivery, file, input);
  }

  private submitPaperMaterialDeliverySignature(
    delivery: any,
    file: File | null,
    input?: HTMLInputElement,
  ): void {
    const formData = new FormData();
    if (file) formData.append('document', file);
    this.http.post<any>(
      this.materialApi(`/deliveries/${delivery.id}/paper-signature`),
      formData,
    ).subscribe({
      next: (result) => {
        if (input) input.value = '';
        this.message = result?.attachmentProvided
          ? 'Firma cartacea e copia allegata registrate. La consegna risulta accettata.'
          : 'Firma cartacea dichiarata senza allegato. La consegna risulta accettata.';
        this.loadMaterialOrders();
      },
      error: (err) => {
        if (input) input.value = '';
        this.handleError(err, 'Impossibile registrare la firma cartacea.');
      },
    });
  }

  private usePreparationPdf(blob: Blob, filename: string, action: 'open' | 'download' | 'print'): void {
    const url = URL.createObjectURL(blob);
    if (action === 'download') {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (action === 'print') {
      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.width = '1px';
      frame.style.height = '1px';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';
      frame.onload = () => setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      }, 300);
      frame.src = url;
      document.body.appendChild(frame);
      setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60000);
      return;
    }
    const opened = window.open(url, '_blank');
    if (!opened) {
      URL.revokeObjectURL(url);
      this.error = 'Pop-up bloccato: consenti l’apertura del PDF.';
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async requestMaterialDeliverySignature(delivery: any, order?: any): Promise<void> {
    const recipientLabel = order?.customerId ? 'cliente' : 'dipendente destinatario';
    const choice = await this.popup.choose(
      `Il ${recipientLabel} visualizzerà il documento, verificherà la propria email tramite OTP e firmerà dal suo dispositivo.`,
      'Richiedi firma consegna materiali',
      {
        primaryLabel: 'Invia via email',
        secondaryLabel: 'Invia su WhatsApp',
        cancelLabel: 'Annulla',
      },
    );
    if (!choice) return;
    const email = choice === 'primary';
    this.http.post<any>(
      this.materialApi(`/deliveries/${delivery.id}/signature-request`),
      { deliveryChannel: email ? 'email' : 'manual' },
    ).subscribe({
      next: (result) => {
        if (!email && (result?.whatsappUrl || result?.approvalUrl)) {
          window.open(result.whatsappUrl || result.approvalUrl, '_blank');
        }
        this.popup.show(
          email
            ? `Email con link e PDF inviata al ${recipientLabel}.`
            : 'Messaggio WhatsApp aperto.',
          'Richiesta creata',
          'success',
        );
        this.loadMaterialOrders();
      },
      error: (err) => this.popup.showHttpError(
        err,
        'Impossibile generare la richiesta di firma.',
      ),
    });
  }

  showMaterialDeliverySignatureEvidence(delivery: any): void {
    this.http.get<any>(
      this.materialApi(`/deliveries/${delivery.id}/signature-proof`),
    ).subscribe({
      next: async (evidence) => {
        const date = (item: any) =>
          item ? new Date(item).toLocaleString('it-IT') : 'Non disponibile';
        const value = (item: any) => String(item || 'Non disponibile');
        const audit = Array.isArray(evidence.auditTrail)
          ? evidence.auditTrail
              .map((entry: any) => `• ${date(entry?.at)} — ${value(entry?.type)}`)
              .join('\n')
          : 'Non disponibile';
        const receipt = [
          `Consegna materiali: ${value(delivery.numeroConsegna || delivery.id)}`,
          `Cliente: ${value(evidence.numeroCliente)}`,
          `Stato: ${value(evidence.status)}`,
          `Canale firma: ${evidence.sourceType === 'paper' ? 'Firma cartacea acquisita in presenza' : evidence.sourceType === 'employee_app' ? 'App caposquadra' : 'Link remoto da MVanager'}`,
          `Richiesta da: ${value(evidence.sourceType === 'employee_app' ? evidence.requestedByEmployeeName : evidence.requestedByAdminName)}`,
          `Email destinatario/OTP: ${evidence.sourceType === 'paper' ? 'Non prevista per firma cartacea' : value(evidence.recipientEmail)}`,
          `Richiesta: ${date(evidence.requestedAt)}`,
          `Apertura link: ${date(evidence.viewedAt)}`,
          `OTP inviata: ${date(evidence.otpSentAt)}`,
          `OTP verificata: ${date(evidence.otpVerifiedAt)}`,
          `Firma: ${date(evidence.acceptedAt)}`,
          `IP invio: ${value(evidence.requestIp)}`,
          `IP verifica OTP: ${value(evidence.otpVerifiedIp)}`,
          `IP firma: ${value(evidence.acceptanceIp)}`,
          `Dispositivo: ${value(evidence.acceptanceUserAgent)}`,
          `SHA-256 PDF preliminare: ${value(evidence.documentSnapshotHashSha256)}`,
          `SHA-256 PDF finale: ${value(evidence.pdfHashSha256)}`,
          `Copia firmata allegata: ${evidence.sourceType === 'paper' ? (evidence.attachmentProvided ? 'Sì' : 'No, originale conservato su carta') : 'Non applicabile'}`,
          `SHA-256 firma: ${value(evidence.signatureHashSha256)}`,
          '',
          'Cronologia registrata:',
          audit,
        ].join('\n');
        const action = await this.popup.evidence(receipt);
        if (action === 'save') {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(
            new Blob([receipt], { type: 'text/plain;charset=utf-8' }),
          );
          link.download = `dati-prova-consegna-materiali-${delivery.numeroConsegna || delivery.id}.txt`;
          link.click();
          URL.revokeObjectURL(link.href);
        }
        if (action === 'print') {
          const printWindow = window.open('', '_blank', 'width=850,height=700');
          if (!printWindow) return;
          const escaped = receipt
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          printWindow.document.write(
            `<html><head><title>Dati prova firma</title><style>body{font-family:Arial;padding:32px;color:#182235}pre{white-space:pre-wrap;word-break:break-word;line-height:1.55}</style></head><body><h1>Dati di prova della firma</h1><pre>${escaped}</pre><script>window.onload=()=>window.print()</script></body></html>`,
          );
          printWindow.document.close();
        }
      },
      error: (err) =>
        this.popup.showHttpError(err, 'Impossibile recuperare i dati di prova.'),
    });
  }

  applySummaryFilter(filter: SummaryFilter): void {
    if (!this.canView) return;
    this.activeSummaryFilter = filter;
    this.setTab('list');
    this.filters.q = '';
    this.filters.barcode = '';
    this.filters.categoryId = 0;
    this.filters.favorite = '';
    this.filters.supplierId = 0;
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

  quickStartMovement(type: MovementType): void {
    const allowed = type === 'in' ? this.canRegisterIn : this.canRegisterOut;
    if (!allowed) return;
    this.setTab(type);
    this.manualEntryMode = false;
    void this.startScanner(type);
  }

  quickCreateProduct(): void {
    if (!this.canManageProducts) return;
    this.resetProductForm();
    this.setTab('products');
  }

  loadMeta(): void {
    this.http.get<{ movementReasons: MovementReason[]; units: WarehouseUnit[]; config?: Partial<InternalWarehouseConfig> }>(this.api('/meta')).subscribe({
      next: (meta) => {
        this.movementReasons = meta?.movementReasons || [];
        if (meta?.units?.length) this.units = meta.units;
        this.warehouseConfig = this.normalizeWarehouseConfig(meta?.config);
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
    this.referenceSearch.employee = this.employeeReferenceLabel(employee);
  }

  selectReportCustomer(customer: any): void {
    this.movementFilters.customerId = String(customer?.numeroCliente || '');
    this.referenceSearch.customer = this.customerReferenceLabel(customer);
  }

  selectMovementEmployee(employee: any): void {
    this.manualMovement.employeeId = Number(employee?.id || 0);
    this.referenceSearch.employee = this.employeeReferenceLabel(employee);
  }

  selectMovementCustomer(customer: any): void {
    this.manualMovement.customerId = String(customer?.numeroCliente || '');
    this.referenceSearch.customer = this.customerReferenceLabel(customer);
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

  loadSuppliers(): void {
    if (!this.canView) return;
    let params = new HttpParams();
    if (this.supplierSearch.trim()) params = params.set('search', this.supplierSearch.trim());
    this.http.get<WarehouseSupplier[]>(this.api('/suppliers'), { params }).subscribe({
      next: (suppliers) => {
        this.suppliers = suppliers || [];
        if (!this.orderFilters.supplierId && this.suppliers.length === 1) {
          this.orderFilters.supplierId = this.suppliers[0].id;
          this.loadOrderProducts();
        }
      },
      error: () => this.suppliers = [],
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

  loadOrderProducts(): void {
    if (!this.canView || !this.orderFilters.supplierId) {
      this.orderProducts = [];
      return;
    }
    this.loadingOrderProducts = true;
    let params = new HttpParams()
      .set('supplierId', String(this.orderFilters.supplierId))
      .set('sort', 'quantity_asc');
    if (this.orderFilters.onlyLow) params = params.set('stock', 'low');
    if (this.orderFilters.q.trim()) params = params.set('q', this.orderFilters.q.trim());
    this.http.get<WarehouseProduct[]>(this.api('/products'), { params }).subscribe({
      next: (products) => {
        this.orderProducts = products || [];
        this.loadingOrderProducts = false;
        this.seedOrderQuantities();
      },
      error: (err) => {
        this.loadingOrderProducts = false;
        this.handleError(err, 'Impossibile caricare i prodotti da ordinare.');
      },
    });
  }

  onProductSupplierChange(): void {
    const supplier = this.suppliers.find((item) => Number(item.id) === Number(this.productForm.supplierId));
    if (supplier) {
      this.productForm.supplier = supplier.name;
    } else if (!this.productForm.id) {
      this.productForm.supplier = '';
    }
  }

  onOrderSupplierChange(): void {
    this.orderSelectedIds = new Set();
    this.orderQuantities = {};
    this.orderNotes = {};
    this.loadOrderProducts();
  }

  selectedOrderSupplier(): WarehouseSupplier | null {
    return this.suppliers.find((supplier) => Number(supplier.id) === Number(this.orderFilters.supplierId)) || null;
  }

  supplierForProduct(product: WarehouseProduct): WarehouseSupplier | null {
    if (product.supplierDetails) return product.supplierDetails;
    if (product.supplierId) {
      const byId = this.suppliers.find((supplier) => Number(supplier.id) === Number(product.supplierId));
      if (byId) return byId;
    }
    const legacyName = String(product.supplier || '').trim().toLocaleLowerCase('it-IT');
    if (!legacyName) return null;
    return this.suppliers.find((supplier) => supplier.name.trim().toLocaleLowerCase('it-IT') === legacyName) || null;
  }

  supplierDisplayName(product: WarehouseProduct): string {
    return this.supplierForProduct(product)?.name || product.supplier || '';
  }

  supplierContactLabel(supplier: WarehouseSupplier | null | undefined): string {
    if (!supplier) return '';
    return supplier.email || supplier.pec || 'Nessuna email';
  }

  supplierStatsLabel(supplier: WarehouseSupplier): string {
    const parts = [
      `${supplier.productCount || 0} prodotti`,
      `${supplier.lowStockCount || 0} sotto scorta`,
    ];
    if (supplier.inboundInvoiceCount) parts.push(`${supplier.inboundInvoiceCount} fatture acquisto`);
    return parts.join(' · ');
  }

  selectOrderSupplier(supplier: WarehouseSupplier): void {
    this.orderFilters.supplierId = supplier.id;
    this.orderSelectedIds = new Set();
    this.orderQuantities = {};
    this.orderNotes = {};
    this.loadOrderProducts();
  }

  openOrderForProduct(product: WarehouseProduct): void {
    const supplier = this.supplierForProduct(product);
    if (!supplier) {
      this.error = 'Collega prima il prodotto a un fornitore.';
      this.popup.showError(this.error);
      return;
    }
    this.orderFilters.supplierId = supplier.id;
    this.orderFilters.onlyLow = false;
    this.orderFilters.q = '';
    this.orderSelectedIds = new Set([product.id]);
    this.orderQuantities = {
      ...this.orderQuantities,
      [product.id]: this.defaultOrderQuantity(product),
    };
    this.setTab('orders');
    this.supplierOrderView = 'new';
    this.navigateEntityView('new');
    this.loadOrderProducts();
  }

  defaultOrderQuantity(product: WarehouseProduct): number {
    const missingToMinimum = Number(product.minimumQuantity || 0) - Number(product.quantity || 0);
    const suggested = missingToMinimum > 0 ? missingToMinimum : 1;
    const step = this.quantityStep(product.unit) === '1' ? Math.ceil(suggested) : suggested;
    return this.parseQuantityInput(step, 1, 0.001);
  }

  private seedOrderQuantities(): void {
    const nextQuantities = { ...this.orderQuantities };
    for (const product of this.orderProducts) {
      if (!nextQuantities[product.id]) {
        nextQuantities[product.id] = this.defaultOrderQuantity(product);
      }
    }
    this.orderQuantities = nextQuantities;
  }

  toggleOrderProduct(product: WarehouseProduct, checked: boolean): void {
    const next = new Set(this.orderSelectedIds);
    if (checked) {
      next.add(product.id);
      if (!this.orderQuantities[product.id]) {
        this.orderQuantities = {
          ...this.orderQuantities,
          [product.id]: this.defaultOrderQuantity(product),
        };
      }
    } else {
      next.delete(product.id);
    }
    this.orderSelectedIds = next;
  }

  isOrderProductSelected(product: WarehouseProduct): boolean {
    return this.orderSelectedIds.has(product.id);
  }

  selectLowStockForOrder(): void {
    const lowStockProducts = this.orderProducts.filter((product) => product.isLowStock || product.isOutOfStock);
    this.orderSelectedIds = new Set(lowStockProducts.map((product) => product.id));
    this.seedOrderQuantities();
  }

  clearOrderSelection(): void {
    this.orderSelectedIds = new Set();
    this.orderNotes = {};
  }

  selectedOrderProducts(): WarehouseProduct[] {
    return this.orderProducts.filter((product) => this.orderSelectedIds.has(product.id));
  }

  get selectedOrderCount(): number {
    return this.orderSelectedIds.size;
  }

  get selectedOrderTotal(): number {
    return this.selectedOrderProducts().reduce((total, product) => {
      const quantity = this.parseQuantityInput(this.orderQuantities[product.id], 0, 0);
      return total + quantity * Number(product.indicativePrice || 0);
    }, 0);
  }

  sendSupplierOrderEmail(): void {
    if (this.sendingOrder) return;
    const supplier = this.selectedOrderSupplier();
    if (!supplier) {
      this.error = 'Seleziona un fornitore.';
      return;
    }
    if (!supplier.email && !supplier.pec) {
      this.error = 'Aggiungi una email o PEC al fornitore prima di inviare.';
      this.popup.showError(this.error);
      return;
    }
    const items = this.selectedOrderProducts().map((product) => ({
      productId: product.id,
      quantity: this.parseQuantityInput(this.orderQuantities[product.id], this.defaultOrderQuantity(product), 0.001),
      note: this.orderNotes[product.id] || '',
    }));
    if (!items.length) {
      this.error = 'Seleziona almeno un prodotto da ordinare.';
      return;
    }
    this.clearFeedback();
    this.sendingOrder = true;
    this.http.post<{ ok: boolean; to: string; itemCount: number; order?: SupplierOrder }>(this.api('/orders/send-email'), {
      supplierId: supplier.id,
      message: this.orderMessage,
      items,
    }).subscribe({
      next: (res) => {
        this.sendingOrder = false;
        this.message = `Ordine inviato a ${res.to}: ${res.itemCount} prodotti.`;
        this.clearOrderSelection();
        this.supplierOrderView = 'list';
        this.navigateEntityView('list');
        this.loadSupplierOrders();
      },
      error: (err) => {
        this.sendingOrder = false;
        this.handleError(err, 'Impossibile inviare l’ordine al fornitore.');
      },
    });
  }

  emptySupplierForm(): WarehouseSupplier {
    return {
      id: 0,
      name: '',
      vatNumber: '',
      fiscalCode: '',
      address: '',
      city: '',
      province: '',
      zip: '',
      country: 'IT',
      email: '',
      pec: '',
      notes: '',
    };
  }

  editSupplier(supplier: WarehouseSupplier): void {
    this.supplierForm = { ...this.emptySupplierForm(), ...supplier };
  }

  resetSupplierForm(): void {
    this.supplierForm = this.emptySupplierForm();
  }

  saveSupplier(): void {
    if (!this.canManageProducts || this.saving) return;
    if (!this.supplierForm.name.trim()) {
      this.error = 'Nome fornitore obbligatorio.';
      return;
    }
    this.clearFeedback();
    this.saving = true;
    this.http.post<WarehouseSupplier>(this.api('/suppliers'), this.supplierForm).subscribe({
      next: (supplier) => {
        this.saving = false;
        this.message = 'Fornitore salvato.';
        this.supplierForm = this.emptySupplierForm();
        this.loadSuppliers();
        this.orderFilters.supplierId = supplier.id;
        this.loadOrderProducts();
      },
      error: (err) => {
        this.saving = false;
        this.handleError(err, 'Impossibile salvare il fornitore.');
      },
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
    if (this.showArchivedProducts) params = params.set('includeInactive', 'true');

    this.http.get<WarehouseProduct[]>(this.api('/products'), { params }).subscribe({
      next: (products) => {
        this.products = (products || []).filter((product) => {
          if (this.showArchivedProducts && product.active) return false;
          if (!this.showArchivedProducts && !product.active) return false;
          if (this.filters.favorite === 'true') return product.favorite;
          return true;
        });
        const selectedId = Number(this.route.snapshot.queryParamMap.get('entityId') || 0);
        if (this.productView === 'detail' && selectedId) {
          const selected = this.products.find((item) => item.id === selectedId);
          if (selected) this.selectProduct(selected);
        }
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
    const scope = this.showArchivedRequests ? 'archive' : 'active';
    this.http.get<WarehouseRequest[]>(this.api(`/requests?scope=${scope}`)).subscribe({
      next: (requests) => {
        this.productRequests = requests || [];
        if (this.selectedProductRequest) {
          this.selectedProductRequest = this.productRequests.find((item) => item.id === this.selectedProductRequest?.id) || this.selectedProductRequest;
        }
      },
      error: () => this.productRequests = [],
    });
  }

  private loadProductRequestById(requestId: number): void {
    this.http.get<WarehouseRequest[]>(this.api('/requests?scope=all&limit=500')).subscribe({
      next: (requests) => {
        this.selectedProductRequest = (requests || []).find((request) => request.id === requestId) || null;
        if (!this.selectedProductRequest) {
          this.error = 'Richiesta non trovata.';
          this.closeProductRequestView();
        }
      },
      error: (err) => this.handleError(err, 'Impossibile caricare la richiesta.'),
    });
  }

  saveProduct(): void {
    if (!this.canManageProducts || this.saving) return;
    this.clearFeedback();
    const payload = {
      ...this.productForm,
      minimumQuantity: this.parseQuantityInput(this.productForm.minimumQuantity, 0, 0),
      quantity: this.parseQuantityInput(this.productForm.quantity, 0, 0),
      indicativePrice: this.productForm.indicativePrice === null || this.productForm.indicativePrice === undefined
        ? null
        : Number(this.productForm.indicativePrice || 0),
    };

    if (!payload.name.trim()) {
      this.error = 'Nome prodotto obbligatorio.';
      return;
    }
    if (!payload.barcode.trim() && !this.canAutoGenerateBarcode) {
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
        this.loadSuppliers();
        if (this.activeTab === 'orders') this.loadOrderProducts();
        this.loadSummary();
        this.selectedProduct = product;
        if (!payload.id) {
          this.selectedLabelIds = new Set([product.id]);
        }
        this.productView = 'list';
        this.setTab('list');
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
      supplierId: product.supplierId || 0,
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

  resetProductForm(): void {
    this.productForm = this.emptyProductForm();
    this.duplicateProduct = null;
    this.selectedPhotoFile = null;
    this.error = '';
    this.message = '';
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
        if (this.activeTab === 'orders') this.loadOrderProducts();
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

  async deleteProduct(product: WarehouseProduct): Promise<void> {
    if (!this.canManageProducts) return;
    if (!await this.popup.confirm(`Archiviare il prodotto "${product.name}"?`)) return;

    this.http.delete(this.api(`/products/${product.id}`)).subscribe({
      next: () => {
        this.message = 'Prodotto archiviato.';
        this.loadProducts();
        this.loadCategories();
        this.loadSuppliers();
        this.loadSummary();
        if (this.activeTab === 'orders') this.loadOrderProducts();
      },
      error: (err) => this.handleError(err, 'Impossibile archiviare il prodotto.'),
    });
  }

  restoreProduct(product: WarehouseProduct): void {
    if (!this.canManageProducts) return;
    this.http.patch<WarehouseProduct>(this.api(`/products/${product.id}/active`), { active: true }).subscribe({
      next: () => {
        this.message = 'Prodotto ripristinato.';
        this.closeEntityView();
        this.loadProducts();
        this.loadSummary();
      },
      error: (err) => this.handleError(err, 'Impossibile ripristinare il prodotto.'),
    });
  }

  registerManual(type: MovementType): void {
    const allowed = type === 'in' ? this.canRegisterIn : this.canRegisterOut;
    if (!allowed || this.saving) return;
    this.registerMovement(type, this.manualMovement.barcode, this.parseQuantityInput(this.manualMovement.quantity, 1, 0.001), {
      reasonKey: this.manualMovement.reasonKey,
      reason: this.manualMovement.reason,
      note: this.manualMovement.note,
      customerId: this.manualMovement.customerId,
      employeeId: this.manualMovement.employeeId,
      serviceOrderId: this.manualMovement.serviceOrderId,
      referenceType: this.manualMovement.referenceType,
      referenceLabel: this.manualMovement.referenceLabel,
      unitCost: this.manualMovement.unitCost,
      requestId: this.preparingRequest?.id,
      requestItemId: this.preparingRequestItem?.id,
      resetManual: true,
    });
  }

  adjustProduct(): void {
    if (!this.canAdjust || !this.adjustment.productId) return;
    this.clearFeedback();
    this.saving = true;
      this.http.post<{ product: WarehouseProduct }>(this.api('/movements/adjust'), {
      productId: this.adjustment.productId,
      quantity: this.parseQuantityInput(this.adjustment.quantity, 0, 0),
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

    const scanQuantity = this.parseQuantityInput(this.manualMovement.quantity, 1, 0.001);
    if (scanQuantity > 1) {
      this.stopScanner();
    }
    this.registerMovement(this.scannerMode, barcode, scanQuantity, {
      reasonKey: this.manualMovement.reasonKey || (this.scannerMode === 'in' ? 'other' : 'internal_use'),
      reason: this.manualMovement.reason || (this.scannerMode === 'in' ? 'scansione entrata' : 'scansione uscita'),
      note: this.manualMovement.note,
      customerId: this.manualMovement.customerId,
      employeeId: this.manualMovement.employeeId,
      serviceOrderId: this.manualMovement.serviceOrderId,
      referenceType: this.manualMovement.referenceType,
      referenceLabel: this.manualMovement.referenceLabel,
      requestId: this.preparingRequest?.id,
      requestItemId: this.preparingRequestItem?.id,
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
      requestItemId?: number | null;
      resetManual?: boolean;
      fromScanner?: boolean;
    } = {},
  ): void {
    const cleanBarcode = String(barcode || '').trim();
    const cleanQuantity = this.parseQuantityInput(quantity, 1, 0.001);
    if (!cleanBarcode) {
      this.error = 'Inserisci un codice a barre.';
      return;
    }

    this.clearFeedback();
    this.saving = true;
    this.http.post<{
      product: WarehouseProduct;
      movement: WarehouseMovement;
      warehouseRequest?: WarehouseRequest | null;
      warehouseRequestItem?: WarehouseRequestItem | null;
      deliveryDocument?: any;
    }>(
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
        requestItemId: options.requestItemId || undefined,
      },
    ).subscribe({
      next: ({ product, movement, warehouseRequest, deliveryDocument }) => {
        this.saving = false;
        const verb = type === 'in' ? 'Entrata registrata' : 'Uscita registrata';
        const registeredQuantity = this.parseQuantityInput(movement?.quantity ?? cleanQuantity, cleanQuantity, 0.001);
        const signedQuantity = type === 'in' ? `+${registeredQuantity}` : `-${registeredQuantity}`;
        this.message = `${verb}: ${product.name} ${signedQuantity} (${product.quantity} ${product.unit})`;
        if (deliveryDocument?.path) {
          this.message = `${this.message}. Documento ${deliveryDocument.documentLabel || 'materiale'} generato.`;
        } else if (deliveryDocument?.error) {
          this.message = `${this.message}. Movimento salvato, ma documento non generato: ${deliveryDocument.error}`;
        }
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
          if (warehouseRequest && warehouseRequest.status !== 'fulfilled') {
            this.preparingRequest = warehouseRequest;
            this.preparingRequestItem = this.nextPendingRequestItem(warehouseRequest);
            this.applyRequestAssignment(warehouseRequest, this.preparingRequestItem);
            const remaining = this.remainingRequestQuantityTotal(warehouseRequest);
            this.message = `${this.message}. Prodotto preparato. Restano ${remaining} pezzi da preparare.`;
          } else {
            this.message = `${this.message}. Richiesta evasa.`;
            this.preparingRequest = null;
            this.preparingRequestItem = null;
            this.loadProductRequests();
          }
        }
        this.loadProducts();
        this.loadSummary();
        if (this.activeTab === 'orders') this.loadOrderProducts();
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

  prepareRequest(request: WarehouseRequest, item: WarehouseRequestItem | null = null): void {
    if (!this.canRegisterOut) return;
    this.preparingRequest = request;
    this.preparingRequestItem = item || this.nextPendingRequestItem(request);
    this.applyRequestAssignment(request, this.preparingRequestItem);
    this.setTab('out');
    const targetProduct = this.preparingRequestItem?.product || request.product;
    const pendingCount = this.remainingRequestQuantityTotal(request);
    this.message = `Prepara ${targetProduct?.name || 'prodotto'} per ${this.employeeLabel(request.employee)}. Scansiona il codice a barre per scalare la richiesta${pendingCount > 1 ? ` (${pendingCount} pezzi in coda)` : ''}.`;
  }

  private applyRequestAssignment(request: WarehouseRequest, item: WarehouseRequestItem | null = this.nextPendingRequestItem(request)): void {
    const remainingQuantity = item ? this.requestItemRemaining(item) : Number(request.quantity || 1);
    this.manualMovement = {
      barcode: '',
      quantity: Math.min(1, Math.max(remainingQuantity, 0.001)),
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
    this.referenceSearch.employee = this.employeeLabel(request.employee);
    this.referenceSearch.customer = request.customerId
      ? this.customerNameForRecord(request.customerId, request.customer)
      : '';
    this.ensureCurrentAssignmentReferences(request);
  }

  private ensureCurrentAssignmentReferences(request: WarehouseRequest): void {
    if (request.employee && !this.references.employees.some((item) => Number(item?.id) === Number(request.employeeId))) {
      this.references = {
        ...this.references,
        employees: [request.employee, ...this.references.employees],
      };
    }

    if (
      request.customer &&
      request.customerId &&
      !this.references.customers.some((item) => String(item?.numeroCliente || '') === String(request.customerId))
    ) {
      this.references = {
        ...this.references,
        customers: [request.customer, ...this.references.customers],
      };
    }
  }

  startCancelRequest(request: WarehouseRequest): void {
    this.cancelRequestForm = {
      requestId: request.id,
      reason: request.adminNote || '',
    };
  }

  clearCancelRequest(): void {
    this.cancelRequestForm = { requestId: 0, reason: '' };
  }

  confirmCancelRequest(request: WarehouseRequest): void {
    const reason = this.cancelRequestForm.reason.trim();
    if (!reason) {
      this.error = 'Inserisci il motivo da mostrare al dipendente.';
      this.popup.showError(this.error);
      return;
    }
    this.updateRequestStatus(request, 'cancelled', reason);
  }

  updateRequestStatus(request: WarehouseRequest, status: WarehouseRequest['status'], adminNote = ''): void {
    this.http.patch<WarehouseRequest>(this.api(`/requests/${request.id}`), { status, adminNote }).subscribe({
      next: () => {
        this.message = 'Richiesta aggiornata.';
        this.clearCancelRequest();
        if (this.requestView === 'detail') this.loadProductRequestById(request.id);
        else this.loadProductRequests();
      },
      error: (err) => this.handleError(err, 'Impossibile aggiornare la richiesta.'),
    });
  }

  requestItems(request: WarehouseRequest): WarehouseRequestItem[] {
    if (request.items?.length) return request.items;
    return [{
      id: null,
      requestId: request.id,
      productId: request.productId,
      categoryId: request.categoryId,
      quantity: Number(request.quantity || 1),
      fulfilledQuantity: request.status === 'fulfilled' ? Number(request.quantity || 1) : 0,
      remainingQuantity: request.status === 'fulfilled' ? 0 : Number(request.quantity || 1),
      status: request.status === 'fulfilled'
        ? 'fulfilled'
        : request.status === 'cancelled'
          ? 'cancelled'
          : request.status === 'rejected'
            ? 'rejected'
            : 'pending',
      product: request.product,
    }];
  }

  nextPendingRequestItem(request: WarehouseRequest): WarehouseRequestItem | null {
    return this.requestItems(request).find((item) => item.status === 'pending' && this.requestItemRemaining(item) > 0) || null;
  }

  requestItemRemaining(item: WarehouseRequestItem): number {
    const explicitRemaining = item.remainingQuantity;
    if (explicitRemaining !== null && explicitRemaining !== undefined) {
      return this.parseQuantityInput(explicitRemaining, 0, 0);
    }
    return Math.max(0, this.parseQuantityInput(item.quantity, 0, 0) - this.parseQuantityInput(item.fulfilledQuantity, 0, 0));
  }

  remainingRequestQuantityTotal(request: WarehouseRequest): number {
    return this.requestItems(request).reduce((total, item) => total + this.requestItemRemaining(item), 0);
  }

  requestProductSummary(request: WarehouseRequest): string {
    const items = this.requestItems(request);
    if (items.length === 1) return items[0].product?.name || request.product?.name || 'Prodotto';
    return `${items.length} prodotti richiesti`;
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
      supplierId: 0,
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

  quantityStep(unit?: string | null): string {
    return '1';
  }

  quantityStepForProduct(productId: number | string | null | undefined): string {
    const product = this.products.find((item) => Number(item.id) === Number(productId));
    return this.quantityStep(product?.unit);
  }

  quantityMinForProduct(productId: number | string | null | undefined): string {
    return '1';
  }

  quantityStepForBarcode(barcode: string | null | undefined): string {
    const normalized = String(barcode || '').trim().toLowerCase();
    const product = this.products.find((item) => String(item.barcode || '').trim().toLowerCase() === normalized);
    return this.quantityStep(product?.unit);
  }

  quantityMinForBarcode(barcode: string | null | undefined): string {
    return '1';
  }

  selectedAdjustmentProduct(): WarehouseProduct | null {
    return this.products.find((product) => Number(product.id) === Number(this.adjustment.productId)) || null;
  }

  emptyCategoryForm() {
    return {
      id: 0,
      name: '',
      description: '',
      aliasesText: '',
    };
  }

  resetCategoryForm(): void {
    this.categoryForm = this.emptyCategoryForm();
    this.categoryError = '';
    this.error = '';
    this.message = '';
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
        const successMessage = this.categoryForm.id ? 'Categoria aggiornata.' : 'Categoria creata.';
        this.resetCategoryForm();
        this.message = successMessage;
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

  async deleteCategory(category: WarehouseCategory): Promise<void> {
    if (!this.canManageProducts) return;
    if (category.name === 'Generale') {
      this.error = 'La categoria Generale non può essere archiviata.';
      return;
    }
    if (!await this.popup.confirm(`Archiviare la categoria "${category.name}"?`)) return;

    this.http.delete(this.api(`/categories/${category.id}`)).subscribe({
      next: () => {
        this.resetCategoryForm();
        this.message = 'Categoria archiviata.';
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

  toggleLabelSelection(product: WarehouseProduct, checked: boolean): void {
    const next = new Set(this.selectedLabelIds);
    if (checked) next.add(product.id);
    else next.delete(product.id);
    this.selectedLabelIds = next;
  }

  isLabelSelected(product: WarehouseProduct): boolean {
    return this.selectedLabelIds.has(product.id);
  }

  selectLabelSet(kind: 'visible' | 'low' | 'clear'): void {
    if (kind === 'clear') {
      this.selectedLabelIds = new Set();
      return;
    }
    const source = kind === 'low'
      ? this.products.filter((product) => product.isLowStock || product.isOutOfStock)
      : this.products;
    this.selectedLabelIds = new Set(source.map((product) => product.id));
  }

  selectedLabelProducts(): WarehouseProduct[] {
    return this.products.filter((product) => this.selectedLabelIds.has(product.id));
  }

  printProductLabels(productsOverride?: WarehouseProduct[], copiesOverride?: number): void {
    const products = productsOverride?.length ? productsOverride : this.selectedLabelProducts();
    if (!products.length) {
      this.error = 'Seleziona almeno un prodotto da stampare.';
      return;
    }
    const copies = Math.min(20, Math.max(1, Math.floor(Number(copiesOverride ?? this.labelCopies ?? 1))));
    if (copiesOverride === undefined) this.labelCopies = copies;
    const labels = products.flatMap((product) => Array.from({ length: copies }, () => product));
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) {
      this.error = 'Pop-up bloccato: consenti l’apertura della finestra di stampa.';
      return;
    }
    popup.document.open();
    popup.document.write(this.buildLabelsDocument(labels));
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 250);
  }

  printSingleProductLabel(product: WarehouseProduct): void {
    this.printProductLabels([product], 1);
  }

  printCurrentProductLabel(): void {
    const product = this.currentProductForLabel;
    if (!product || !this.canPrintCurrentProductLabel) {
      this.error = 'Salva prima le modifiche del prodotto, poi stampa l’etichetta.';
      return;
    }
    this.printSingleProductLabel(product);
  }

  get currentProductForLabel(): WarehouseProduct | null {
    const id = Number(this.productForm?.id || 0);
    return id ? (this.products.find((product) => Number(product.id) === id) || null) : null;
  }

  get canPrintCurrentProductLabel(): boolean {
    const product = this.currentProductForLabel;
    if (!product) return false;
    return String(product.name || '').trim() === String(this.productForm.name || '').trim()
      && String(product.barcode || '').trim() === String(this.productForm.barcode || '').trim()
      && Number(product.categoryId || 0) === Number(this.productForm.categoryId || 0)
      && String(product.unit || 'pz') === String(this.productForm.unit || 'pz');
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

  customerReferenceLabel(customer: any): string {
    return this.entityReferenceLabel(customer?.numeroCliente, this.customerLabel(customer));
  }

  customerReferenceLabelForRecord(customerId: string | number, customer?: any | null): string {
    return this.entityReferenceLabel(customerId, customer ? this.customerLabel(customer) : 'Cliente');
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

  employeeReferenceLabel(employee: any): string {
    return this.entityReferenceLabel(employee?.id, this.employeeLabel(employee));
  }

  employeeReferenceLabelForRecord(employeeId: number | null | undefined, employee?: any | null): string {
    return this.entityReferenceLabel(employeeId, employee ? this.employeeLabel(employee) : 'Dipendente');
  }

  private entityReferenceLabel(id: unknown, label: string): string {
    const normalizedId = String(id ?? '').trim();
    const normalizedLabel = String(label || '').trim();
    if (!normalizedId) return normalizedLabel;
    if (!normalizedLabel || normalizedLabel === normalizedId || normalizedLabel === `#${normalizedId}`) return `#${normalizedId}`;
    return `#${normalizedId} · ${normalizedLabel}`;
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

  get canAutoGenerateBarcode(): boolean {
    return this.warehouseConfig.barcodeMode === 'auto_internal_code';
  }

  get isServiceOrderFlowEnabled(): boolean {
    return false;
  }

  get requiresServiceOrderForOutput(): boolean {
    return false;
  }

  get serviceOrderDocumentLabel(): string {
    return this.warehouseConfig.materialOrderFlow.documentLabel || 'Materiale consegnato';
  }

  get isSimpleMobileMode(): boolean {
    return this.isMobileLike && this.warehouseConfig.mobileMode === 'simple';
  }

  get selectedLabelCount(): number {
    return this.selectedLabelIds.size;
  }

  onMovementServiceOrderChange(): void {
    const order = this.references.serviceOrders.find((item) => Number(item?.id) === Number(this.manualMovement.serviceOrderId));
    if (!order) {
      this.manualMovement.referenceType = '';
      this.manualMovement.referenceLabel = '';
      return;
    }
    this.manualMovement.referenceType = 'service_order';
    this.manualMovement.referenceLabel = this.serviceOrderLabel(order);
    if (order.numeroCliente && !this.manualMovement.customerId) {
      this.manualMovement.customerId = String(order.numeroCliente);
    }
  }

  private defaultWarehouseConfig(): InternalWarehouseConfig {
    return {
      mobileMode: 'simple',
      barcodeMode: 'barcode_required',
      internalCodePrefix: 'MAG',
      materialOrderFlow: {
        enabled: true,
        employeeRequestsEnabled: true,
        schedulingEnabled: true,
        calendarCategoryKey: '',
        preparationDocumentEnabled: true,
        preparationDocumentTitle: 'Ordine di preparazione materiali',
        preparationDocumentStyle: 'modern',
        preparationPrimaryColor: '',
        preparationShowLogo: true,
        preparationShowBarcode: true,
        preparationShowInternalChecks: true,
        preparationFooterText: '',
        documentEnabled: true,
        documentLabel: 'Materiale consegnato',
        pdfTemplateKey: 'warehouse_delivery_default',
        customerSignatureEnabled: true,
        employeeAppSignatureEnabled: true,
        signatureEmailSource: '',
        fields: [],
      },
    };
  }

  private normalizeWarehouseConfig(config?: Partial<InternalWarehouseConfig> | null): InternalWarehouseConfig {
    const fallback = this.defaultWarehouseConfig();
    const flow = (config?.materialOrderFlow || {}) as Partial<InternalWarehouseConfig['materialOrderFlow']>;
    return {
      mobileMode: config?.mobileMode === 'advanced' ? 'advanced' : 'simple',
      barcodeMode: config?.barcodeMode === 'auto_internal_code' ? 'auto_internal_code' : 'barcode_required',
      internalCodePrefix: String(config?.internalCodePrefix || fallback.internalCodePrefix).trim() || fallback.internalCodePrefix,
      materialOrderFlow: {
        enabled: flow.enabled !== false,
        employeeRequestsEnabled: flow.employeeRequestsEnabled !== false,
        schedulingEnabled: flow.schedulingEnabled !== false,
        calendarCategoryKey: String(flow.calendarCategoryKey || '').trim(),
        preparationDocumentEnabled: flow.preparationDocumentEnabled !== false,
        preparationDocumentTitle: String(flow.preparationDocumentTitle || fallback.materialOrderFlow.preparationDocumentTitle).trim() || fallback.materialOrderFlow.preparationDocumentTitle,
        preparationDocumentStyle: flow.preparationDocumentStyle === 'classic' || flow.preparationDocumentStyle === 'minimal'
          ? flow.preparationDocumentStyle
          : 'modern',
        preparationPrimaryColor: String(flow.preparationPrimaryColor || '').trim(),
        preparationShowLogo: flow.preparationShowLogo !== false,
        preparationShowBarcode: flow.preparationShowBarcode !== false,
        preparationShowInternalChecks: flow.preparationShowInternalChecks !== false,
        preparationFooterText: String(flow.preparationFooterText || '').trim(),
        documentEnabled: flow.documentEnabled === true,
        documentLabel: String(flow.documentLabel || fallback.materialOrderFlow.documentLabel).trim() || fallback.materialOrderFlow.documentLabel,
        pdfTemplateKey: String(flow.pdfTemplateKey || fallback.materialOrderFlow.pdfTemplateKey).trim() || fallback.materialOrderFlow.pdfTemplateKey,
        customerSignatureEnabled: flow.customerSignatureEnabled !== false,
        employeeAppSignatureEnabled: flow.employeeAppSignatureEnabled !== false,
        signatureEmailSource: String(flow.signatureEmailSource || '').trim(),
        fields: Array.isArray(flow.fields) ? flow.fields : [],
      },
    };
  }

  private buildLabelsDocument(products: WarehouseProduct[]): string {
    const labels = products.map((product) => `
      <article class="label">
        <div class="label-main">
          <strong>${this.escapeHtml(product.name)}</strong>
          <span>${this.escapeHtml(product.category || 'Magazzino')}</span>
        </div>
        ${this.code128Svg(product.barcode)}
        <div class="label-code">${this.escapeHtml(product.barcode)}</div>
        <small>${this.escapeHtml(product.unit || 'pz')} · ${this.escapeHtml(product.supplierCode || product.supplier || '')}</small>
      </article>
    `).join('');
    return `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Etichette magazzino</title>
          <style>
            @page { size: A4; margin: 10mm; }
            * { box-sizing: border-box; }
            body { margin: 0; color: #111827; font-family: Arial, Helvetica, sans-serif; }
            .sheet { display: grid; grid-template-columns: repeat(3, 63mm); grid-auto-rows: 38mm; gap: 4mm; }
            .label { display: grid; grid-template-rows: auto 16mm auto auto; align-content: start; gap: 1.5mm; overflow: hidden; border: 1px solid #111827; border-radius: 2mm; padding: 3mm; break-inside: avoid; }
            .label-main { display: grid; gap: 0.5mm; min-width: 0; }
            strong { display: block; font-size: 10pt; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            span, small { color: #4b5563; font-size: 7pt; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            svg { width: 100%; height: 16mm; }
            .label-code { color: #111827; font-family: "Courier New", monospace; font-size: 8pt; font-weight: 700; letter-spacing: 0; text-align: center; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body><main class="sheet">${labels}</main></body>
      </html>`;
  }

  private code128Svg(value: string): string {
    const patterns = [
      '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
      '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
      '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
      '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
      '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
      '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
      '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
      '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
      '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
      '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
      '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
    ];
    const clean = String(value || '').replace(/[^\x20-\x7e]/g, '').trim() || ' ';
    const codes = [104, ...clean.split('').map((char) => char.charCodeAt(0) - 32)];
    let checksum = 104;
    for (let index = 1; index < codes.length; index += 1) {
      checksum += codes[index] * index;
    }
    codes.push(checksum % 103, 106);
    let x = 10;
    const bars = codes.map((code) => patterns[code] || patterns[0]).map((pattern) => {
      let isBar = true;
      let rects = '';
      for (const part of pattern) {
        const width = Number(part) * 2;
        if (isBar) rects += `<rect x="${x}" y="0" width="${width}" height="48"></rect>`;
        x += width;
        isBar = !isBar;
      }
      return rects;
    }).join('');
    const width = x + 10;
    return `<svg viewBox="0 0 ${width} 48" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  private parseQuantityInput(value: unknown, fallback: number, min: number): number {
    const raw = String(value ?? '').trim().replace(',', '.');
    const parsed = raw ? Number.parseFloat(raw) : fallback;
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.round((parsed + Number.EPSILON) * 1000) / 1000);
  }

  goBack(): void {
    this.router.navigateByUrl('/homeAdmin');
  }
}
