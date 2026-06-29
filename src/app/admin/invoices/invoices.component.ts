import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import JSZip from 'jszip';
import { GlobalService } from '../../service/global.service';

interface InvoiceLine {
  id?: number;
  serviceCode?: string;
  description: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  unitPriceInput?: number;
  priceIncludesVat?: boolean;
  discountPercent: number;
  vatRate: number;
  vatNature: string;
  lineSubtotal?: number;
  lineVat?: number;
  lineTotal?: number;
}

interface InvoicePayment {
  id: number;
  amount: number;
  paymentDate: string;
  method: string;
  reference?: string;
  notes?: string;
}

interface InvoiceInstallment {
  id?: number;
  installmentNumber: number;
  dueDate?: string;
  amount: number;
  paidAmount?: number;
  residualAmount?: number;
  status?: string;
  paymentMethod?: string;
  notes?: string;
}

interface Invoice {
  id?: number;
  direction?: 'outbound' | 'inbound';
  number: string;
  year: number;
  series: string;
  status: string;
  type: string;
  issueDate: string;
  dueDate?: string;
  customerName: string;
  customerVatNumber: string;
  customerFiscalCode: string;
  customerAddress: string;
  customerCity: string;
  customerProvince: string;
  customerZip: string;
  customerCountry: string;
  customerSdiCode: string;
  customerPec: string;
  customerEmail?: string;
  customerRecipientType?: 'business' | 'pa' | 'private';
  customerId?: string;
  paymentTermId?: number | null;
  bankAccountId?: number | null;
  paymentMethod: string;
  paymentIban: string;
  notes: string;
  vatExigibility?: string;
  splitPayment?: boolean;
  stampDutyEnabled?: boolean;
  stampDutyAmount?: number;
  withholdingEnabled?: boolean;
  withholdingType?: string;
  withholdingReason?: string;
  withholdingRate?: number;
  withholdingAmount?: number;
  pensionFundEnabled?: boolean;
  pensionFundType?: string;
  pensionFundRate?: number;
  pensionFundAmount?: number;
  pensionFundVatRate?: number;
  pensionFundVatNature?: string;
  relatedInvoiceNumber?: string;
  relatedInvoiceDate?: string;
  creditNoteReason?: string;
  deliveryNoteRefs?: string | any[];
  subtotal?: number;
  vatTotal?: number;
  total?: number;
  provider?: string;
  providerStatus?: string;
  providerMessage?: string;
  providerInvoiceFilename?: string;
  sdiIdentification?: string;
  conservationStatus?: string;
  conservationMessage?: string;
  paymentStatus?: string;
  paidAmount?: number;
  residualAmount?: number;
  xmlFilename?: string;
  lastProviderSyncAt?: string;
  lines: InvoiceLine[];
  payments?: InvoicePayment[];
  installments?: InvoiceInstallment[];
}

interface InvoiceEvent {
  id: number;
  eventType: string;
  status: string;
  direction: string;
  providerFilename: string;
  message?: string;
  receivedAt: string;
}

interface InvoiceCustomerOption {
  numeroCliente: string;
  label: string;
  raw: Record<string, any>;
}

interface DeliveryNoteLine extends InvoiceLine {
  unit: string;
}

interface DeliveryNote {
  id?: number;
  number: string;
  year: number;
  series: string;
  status: string;
  issueDate: string;
  customerId?: string;
  customerName: string;
  customerVatNumber: string;
  customerFiscalCode: string;
  customerAddress: string;
  customerCity: string;
  customerProvince: string;
  customerZip: string;
  customerCountry: string;
  destinationAddress: string;
  destinationCity: string;
  destinationProvince: string;
  destinationZip: string;
  destinationCountry: string;
  reason: string;
  transportBy: string;
  packages: number;
  weight: number;
  notes: string;
  invoiceId?: number;
  lines: DeliveryNoteLine[];
}

interface Supplier {
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
}

interface PaymentScheduleItem {
  invoiceId: number;
  installmentId?: number | null;
  installmentNumber?: number | null;
  direction: 'outbound' | 'inbound';
  number: string;
  series: string;
  type: string;
  subjectName: string;
  dueDate?: string;
  amount: number;
  paidAmount?: number;
  residualAmount?: number;
  status: string;
}

interface PaymentScheduleSummary {
  toCollect: number;
  toPay: number;
  collected: number;
  paid: number;
  residualCollect: number;
  residualPay: number;
  overdue: number;
}

interface EconomicBucket {
  count: number;
  subtotal: number;
  vatTotal: number;
  total: number;
  paidAmount: number;
  residualAmount: number;
}

interface EconomicMonthlyRow {
  month: string;
  revenue: number;
  costs: number;
  vatDebit: number;
  vatCredit: number;
  grossProfit: number;
}

interface EconomicSummary {
  period: {
    startDate: string;
    endDate: string;
  };
  outbound: EconomicBucket;
  inbound: EconomicBucket;
  overdue: {
    receivableCount: number;
    receivableAmount: number;
    payableCount: number;
    payableAmount: number;
  };
  totals: {
    revenue: number;
    costs: number;
    grossProfit: number;
    grossProfitRate: number;
    vatDebit: number;
    vatCredit: number;
    vatBalance: number;
    collected: number;
    paid: number;
    cashBalance: number;
    receivables: number;
    payables: number;
    netExposure: number;
  };
  monthly: EconomicMonthlyRow[];
  generatedAt: string;
}

interface InvoiceStatusReport {
  providerOutcome?: {
    code: string;
    label: string;
    severity: string;
  };
  providerStatus?: string;
  providerInvoiceFilename?: string;
  sdiIdentification?: string;
  conservationStatus?: string;
  conservationMessage?: string;
  providerMessage?: string;
  lastProviderSyncAt?: string;
  events?: Array<InvoiceEvent & { outcome?: { label: string; severity: string } }>;
}

interface InvoicePaymentTerm {
  id?: number;
  code: string;
  name: string;
  method: string;
  installmentCount: number;
  firstDueDays: number;
  intervalDays: number;
  endOfMonth: boolean;
  active: boolean;
  isDefault: boolean;
  notes?: string;
}

interface InvoiceBankAccount {
  id?: number;
  bankName: string;
  holder?: string;
  iban: string;
  bic?: string;
  active: boolean;
  isDefault: boolean;
  notes?: string;
}

interface InvoiceServiceItem {
  id?: number;
  code: string;
  name: string;
  description: string;
  unit: string;
  unitPrice: number;
  priceIncludesVat: boolean;
  vatRate: number;
  vatNature: string;
  active: boolean;
  notes?: string;
}

interface InvoiceCustomerVatProfile {
  code: string;
  label: string;
  vatRate: number;
  vatNature: string;
  splitPayment: boolean;
  vatExigibility: string;
}

interface InvoiceCustomerInvoiceDefaults {
  enabled: boolean;
  defaultServiceCode: string;
  descriptionTemplate: string;
  amountSource: 'service' | 'customerField' | 'fixed';
  amountField: string;
  fixedAmount: number;
  vatProfileSourceField: string;
  defaultVatProfileCode: string;
  vatProfiles: InvoiceCustomerVatProfile[];
}

interface InvoiceSettings {
  paymentTerms: InvoicePaymentTerm[];
  bankAccounts: InvoiceBankAccount[];
  serviceItems: InvoiceServiceItem[];
  customerInvoiceDefaults?: InvoiceCustomerInvoiceDefaults;
}

type InvoiceView = 'invoices' | 'payments' | 'ddt' | 'suppliers' | 'economics' | 'settings';
type InvoiceListGroup = { key: string; label: string; items: Invoice[] };

@Component({
  selector: 'app-invoices',
  templateUrl: './invoices.component.html',
  styleUrl: './invoices.component.css',
})
export class InvoicesComponent implements OnInit, OnDestroy {
  private querySubscription?: Subscription;
  private pendingCustomerInvoiceId = '';
  private invoiceSettingsLoaded = false;

  invoices: Invoice[] = [];
  selected: Invoice = this.emptyInvoice();
  ddts: DeliveryNote[] = [];
  paymentSchedule: Invoice[] = [];
  paymentScheduleItems: PaymentScheduleItem[] = [];
  economicSummary: EconomicSummary | null = null;
  suppliers: Supplier[] = [];
  selectedDdt: DeliveryNote = this.emptyDdt();
  selectedSupplier: Supplier = this.emptySupplier();
  paymentTerms: InvoicePaymentTerm[] = [];
  bankAccounts: InvoiceBankAccount[] = [];
  serviceItems: InvoiceServiceItem[] = [];
  selectedPaymentTerm: InvoicePaymentTerm = this.emptyPaymentTerm();
  selectedBankAccount: InvoiceBankAccount = this.emptyBankAccount();
  selectedServiceItem: InvoiceServiceItem = this.emptyServiceItem();
  customerInvoiceDefaults: InvoiceCustomerInvoiceDefaults = this.emptyCustomerInvoiceDefaults();
  statusReport: InvoiceStatusReport | null = null;
  events: InvoiceEvent[] = [];
  xmlPreview = '';
  loading = false;
  saving = false;
  error = '';
  success = '';
  search = '';
  statusFilter = '';
  directionFilter = 'outbound';
  documentKindFilter = '';
  customers: InvoiceCustomerOption[] = [];
  selectedCustomerCode = '';
  customerQuery = '';
  customerPickerOpen = false;
  selectedDdtCustomerCode = '';
  ddtCustomerQuery = '';
  ddtCustomerPickerOpen = false;
  ddtSearch = '';
  ddtStatusFilter = '';
  selectedDdtIds: number[] = [];
  scheduleDirection = '';
  scheduleStatus = 'open';
  scheduleSearch = '';
  economicFrom = `${new Date().getFullYear()}-01-01`;
  economicTo = new Date().toISOString().slice(0, 10);
  supplierSearch = '';
  activeView: InvoiceView = 'invoices';

  readonly statuses = [
    { key: '', label: 'Tutte' },
    { key: 'draft', label: 'Bozze' },
    { key: 'issued', label: 'Emesse' },
    { key: 'sent', label: 'Inviate' },
    { key: 'delivered', label: 'Consegnate' },
    { key: 'rejected', label: 'Scartate' },
    { key: 'paid', label: 'Pagate' },
    { key: 'received', label: 'Ricevute' },
  ];

  readonly documentKindOptions = [
    { key: '', label: 'Tutti i documenti' },
    { key: 'invoice', label: 'Solo fatture' },
    { key: 'credit-note', label: 'Note credito' },
    { key: 'debit-note', label: 'Note debito' },
  ];

  readonly scheduleStatusOptions = [
    { key: 'open', label: 'Aperte' },
    { key: 'overdue', label: 'Scadute' },
    { key: 'partial', label: 'Parziali' },
    { key: 'paid', label: 'Saldate' },
    { key: 'all', label: 'Tutte' },
  ];

  readonly documentTypes = [
    { key: 'TD01', label: 'TD01 Fattura' },
    { key: 'TD02', label: 'TD02 Acconto/anticipo fattura' },
    { key: 'TD03', label: 'TD03 Acconto/anticipo parcella' },
    { key: 'TD04', label: 'TD04 Nota credito' },
    { key: 'TD05', label: 'TD05 Nota debito' },
    { key: 'TD06', label: 'TD06 Parcella' },
    { key: 'TD24', label: 'TD24 Fattura differita' },
    { key: 'TD25', label: 'TD25 Differita triangolare' },
    { key: 'TD26', label: 'TD26 Beni ammortizzabili' },
    { key: 'TD27', label: 'TD27 Autoconsumo/cessioni gratuite' },
    { key: 'TD16', label: 'TD16 Integrazione reverse charge interno' },
    { key: 'TD17', label: 'TD17 Integrazione servizi esteri' },
    { key: 'TD18', label: 'TD18 Integrazione acquisto beni UE' },
    { key: 'TD19', label: 'TD19 Integrazione beni art.17 c.2' },
    { key: 'PF', label: 'Proforma' },
  ];

  readonly paymentMethods = [
    { key: '', label: 'Non indicato' },
    { key: 'MP05', label: 'Bonifico' },
    { key: 'MP01', label: 'Contanti' },
    { key: 'MP08', label: 'Carta' },
    { key: 'MP12', label: 'RIBA' },
  ];

  readonly vatNatures = [
    { key: '', label: 'Nessuna' },
    { key: 'N1', label: 'N1 escluse ex art. 15' },
    { key: 'N2.1', label: 'N2.1 non soggette artt. 7-7-septies' },
    { key: 'N2.2', label: 'N2.2 non soggette altri casi' },
    { key: 'N3.1', label: 'N3.1 non imponibili esportazioni' },
    { key: 'N3.2', label: 'N3.2 non imponibili cessioni intracomunitarie' },
    { key: 'N3.3', label: 'N3.3 non imponibili San Marino' },
    { key: 'N3.4', label: 'N3.4 operazioni assimilate esportazioni' },
    { key: 'N3.5', label: 'N3.5 dichiarazione intento' },
    { key: 'N3.6', label: 'N3.6 altre non imponibili' },
    { key: 'N4', label: 'N4 esenti' },
    { key: 'N5', label: 'N5 regime del margine' },
    { key: 'N6.1', label: 'N6.1 reverse charge rottami' },
    { key: 'N6.2', label: 'N6.2 reverse charge oro e argento' },
    { key: 'N6.3', label: 'N6.3 reverse charge subappalto edilizia' },
    { key: 'N6.4', label: 'N6.4 reverse charge fabbricati' },
    { key: 'N6.5', label: 'N6.5 reverse charge cellulari' },
    { key: 'N6.6', label: 'N6.6 reverse charge elettronica' },
    { key: 'N6.7', label: 'N6.7 reverse charge edilizia' },
    { key: 'N6.8', label: 'N6.8 reverse charge energia' },
    { key: 'N6.9', label: 'N6.9 reverse charge altri casi' },
    { key: 'N7', label: 'N7 IVA assolta in altro Stato UE' },
  ];

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    public global: GlobalService,
  ) {}

  ngOnInit(): void {
    if (!this.global.isFeatureAvailableInApp('invoices')) {
      this.error = 'Modulo fatture non ancora disponibile.';
      return;
    }

    this.querySubscription = this.route.queryParamMap.subscribe((params) => {
      this.activeView = this.normalizeView(params.get('view'));
      const direction = params.get('direction') || '';
      if (this.activeView === 'invoices') {
        this.directionFilter = direction === 'inbound' ? 'inbound' : 'outbound';
      } else if (this.activeView === 'payments') {
        this.scheduleDirection = ['outbound', 'inbound'].includes(direction) ? direction : '';
      }
      this.pendingCustomerInvoiceId = params.get('fromCustomer') === '1'
        ? String(params.get('customerId') || '').trim()
        : '';
      this.loadActiveViewData();
      this.startPendingInvoiceFromCustomer();
    });

    this.global.loadTenantConfig(true, { showError: false }).finally(() => {
      this.loadCustomers();
      this.loadInvoiceSettings();
    });
  }

  ngOnDestroy(): void {
    this.querySubscription?.unsubscribe();
  }

  get viewTitle(): string {
    if (this.activeView === 'economics') return 'Cruscotto economico';
    if (this.activeView === 'payments') return 'Pagamenti e scadenziario';
    if (this.activeView === 'ddt') return 'Documenti di trasporto';
    if (this.activeView === 'suppliers') return 'Fornitori';
    if (this.activeView === 'settings') return 'Impostazioni fatture';
    return this.directionFilter === 'inbound' ? 'Fatture acquisto' : 'Fatture vendita';
  }

  isInbound(invoice: Partial<Invoice> = this.selected): boolean {
    return invoice?.direction === 'inbound';
  }

  invoiceSearchPlaceholder(): string {
    if (this.directionFilter === 'inbound') return 'Cerca numero, fornitore, P.IVA';
    if (this.directionFilter === 'outbound') return 'Cerca numero, cliente, P.IVA';
    return 'Cerca numero, cliente/fornitore, P.IVA';
  }

  partyTitle(invoice: Partial<Invoice> = this.selected): string {
    return this.isInbound(invoice) ? 'Fornitore' : 'Cliente';
  }

  partySearchLabel(): string {
    return `Cerca ${this.partyTitle().toLowerCase()}`;
  }

  partySearchPlaceholder(): string {
    return this.isInbound()
      ? 'Scrivi nome, P.IVA o codice fiscale fornitore'
      : 'Scrivi nome, numero cliente, P.IVA o codice fiscale';
  }

  partyFallback(invoice: Partial<Invoice> = this.selected): string {
    return `${this.partyTitle(invoice)} non indicato`;
  }

  invoiceListGroups(): InvoiceListGroup[] {
    const invoices = this.filteredInvoicesByDocumentKind();
    const normalOutbound = invoices.filter((invoice) =>
      !this.isInbound(invoice) && !this.isProforma(invoice) && !this.isCreditOrDebitNote(invoice)
    );
    const creditNotesOutbound = invoices.filter((invoice) => !this.isInbound(invoice) && this.isCreditNote(invoice));
    const debitNotesOutbound = invoices.filter((invoice) => !this.isInbound(invoice) && this.isDebitNote(invoice));
    const proformas = invoices.filter((invoice) => !this.isInbound(invoice) && this.isProforma(invoice));
    const normalInbound = invoices.filter((invoice) => this.isInbound(invoice) && !this.isCreditOrDebitNote(invoice));
    const creditNotesInbound = invoices.filter((invoice) => this.isInbound(invoice) && this.isCreditNote(invoice));
    const debitNotesInbound = invoices.filter((invoice) => this.isInbound(invoice) && this.isDebitNote(invoice));

    return [
      { key: 'outbound', label: 'Fatture vendita', items: normalOutbound },
      { key: 'outbound-credit-notes', label: 'Note credito vendita', items: creditNotesOutbound },
      { key: 'outbound-debit-notes', label: 'Note debito vendita', items: debitNotesOutbound },
      { key: 'proformas', label: 'Proforme', items: proformas },
      { key: 'inbound', label: 'Fatture acquisto', items: normalInbound },
      { key: 'inbound-credit-notes', label: 'Note credito acquisto', items: creditNotesInbound },
      { key: 'inbound-debit-notes', label: 'Note debito acquisto', items: debitNotesInbound },
    ].filter((group) => group.items.length);
  }

  filteredInvoicesByDocumentKind(): Invoice[] {
    if (this.documentKindFilter === 'invoice') {
      return this.invoices.filter((invoice) => !this.isProforma(invoice) && !this.isCreditOrDebitNote(invoice));
    }
    if (this.documentKindFilter === 'credit-note') {
      return this.invoices.filter((invoice) => this.isCreditNote(invoice));
    }
    if (this.documentKindFilter === 'debit-note') {
      return this.invoices.filter((invoice) => this.isDebitNote(invoice));
    }
    return this.invoices;
  }

  isCreditOrDebitNote(invoice: Partial<Invoice>): boolean {
    return ['TD04', 'TD05'].includes(this.stringValue(invoice.type).toUpperCase());
  }

  isCreditNote(invoice: Partial<Invoice>): boolean {
    return this.stringValue(invoice.type).toUpperCase() === 'TD04';
  }

  isDebitNote(invoice: Partial<Invoice>): boolean {
    return this.stringValue(invoice.type).toUpperCase() === 'TD05';
  }

  scheduleSubjectFallback(item: PaymentScheduleItem): string {
    return item.direction === 'inbound' ? 'Fornitore non indicato' : 'Cliente non indicato';
  }

  setView(view: InvoiceView, direction?: string): void {
    const queryParams: Record<string, string | null> = { view, direction: null };
    if (direction) queryParams['direction'] = direction;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }

  private normalizeView(value: string | null): InvoiceView {
    if (value === 'payments' || value === 'ddt' || value === 'suppliers' || value === 'economics' || value === 'settings') return value;
    return 'invoices';
  }

  private loadActiveViewData(): void {
    if (this.activeView === 'invoices') {
      this.loadInvoices();
      return;
    }
    if (this.activeView === 'payments') {
      this.loadPaymentSchedule();
      return;
    }
    if (this.activeView === 'economics') {
      this.loadEconomicSummary();
      return;
    }
    if (this.activeView === 'ddt') {
      this.loadDdts();
      return;
    }
    if (this.activeView === 'settings') {
      this.loadInvoiceSettings();
      return;
    }
    this.loadSuppliers();
  }

  emptyInvoice(): Invoice {
    const now = new Date();
    return {
      number: '',
      year: now.getFullYear(),
      series: '',
      status: 'draft',
      direction: 'outbound',
      type: 'TD01',
      issueDate: now.toISOString().slice(0, 10),
      dueDate: '',
      customerName: '',
      customerVatNumber: '',
      customerFiscalCode: '',
      customerAddress: '',
      customerCity: '',
      customerProvince: '',
      customerZip: '',
      customerCountry: 'IT',
      customerSdiCode: '',
      customerPec: '',
      customerEmail: '',
      customerRecipientType: 'business',
      customerId: '',
      paymentTermId: null,
      bankAccountId: null,
      paymentMethod: 'MP05',
      paymentIban: '',
      notes: '',
      vatExigibility: 'I',
      splitPayment: false,
      stampDutyEnabled: false,
      stampDutyAmount: 2,
      withholdingEnabled: false,
      withholdingType: 'RT01',
      withholdingReason: 'A',
      withholdingRate: 0,
      withholdingAmount: 0,
      pensionFundEnabled: false,
      pensionFundType: 'TC01',
      pensionFundRate: 0,
      pensionFundAmount: 0,
      pensionFundVatRate: 22,
      pensionFundVatNature: '',
      relatedInvoiceNumber: '',
      relatedInvoiceDate: '',
      creditNoteReason: '',
      lines: [this.emptyLine()],
      payments: [],
      installments: [],
    };
  }

  emptyLine(): InvoiceLine {
    return {
      serviceCode: '',
      description: '',
      unit: 'pz',
      quantity: 1,
      unitPrice: 0,
      unitPriceInput: 0,
      priceIncludesVat: false,
      discountPercent: 0,
      vatRate: 22,
      vatNature: '',
    };
  }

  emptyDdt(): DeliveryNote {
    const now = new Date();
    return {
      number: '',
      year: now.getFullYear(),
      series: '',
      status: 'draft',
      issueDate: now.toISOString().slice(0, 10),
      customerName: '',
      customerVatNumber: '',
      customerFiscalCode: '',
      customerAddress: '',
      customerCity: '',
      customerProvince: '',
      customerZip: '',
      customerCountry: 'IT',
      destinationAddress: '',
      destinationCity: '',
      destinationProvince: '',
      destinationZip: '',
      destinationCountry: 'IT',
      reason: 'Vendita',
      transportBy: '',
      packages: 0,
      weight: 0,
      notes: '',
      lines: [this.emptyDdtLine()],
    };
  }

  emptyDdtLine(): DeliveryNoteLine {
    return {
      ...this.emptyLine(),
      unit: 'pz',
    };
  }

  emptySupplier(): Supplier {
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

  emptyPaymentTerm(): InvoicePaymentTerm {
    return {
      code: '',
      name: '',
      method: 'MP05',
      installmentCount: 1,
      firstDueDays: 30,
      intervalDays: 30,
      endOfMonth: false,
      active: true,
      isDefault: false,
      notes: '',
    };
  }

  emptyBankAccount(): InvoiceBankAccount {
    return {
      bankName: '',
      holder: '',
      iban: '',
      bic: '',
      active: true,
      isDefault: false,
      notes: '',
    };
  }

  emptyServiceItem(): InvoiceServiceItem {
    return {
      code: '',
      name: '',
      description: '',
      unit: 'pz',
      unitPrice: 0,
      priceIncludesVat: false,
      vatRate: 22,
      vatNature: '',
      active: true,
      notes: '',
    };
  }

  emptyCustomerInvoiceDefaults(): InvoiceCustomerInvoiceDefaults {
    return {
      enabled: true,
      defaultServiceCode: 'SERVIZIO',
      descriptionTemplate: 'Servizio rif. cliente {{numeroCliente}}',
      amountSource: 'service',
      amountField: '',
      fixedAmount: 0,
      vatProfileSourceField: 'customerVatProfile',
      defaultVatProfileCode: 'N',
      vatProfiles: [
        {
          code: 'N',
          label: 'Normale IVA 22%',
          vatRate: 22,
          vatNature: '',
          splitPayment: false,
          vatExigibility: 'I',
        },
        {
          code: 'RC',
          label: 'Reverse charge N6.7',
          vatRate: 0,
          vatNature: 'N6.7',
          splitPayment: false,
          vatExigibility: 'I',
        },
        {
          code: 'SP',
          label: 'Split payment',
          vatRate: 22,
          vatNature: '',
          splitPayment: true,
          vatExigibility: 'S',
        },
      ],
    };
  }

  loadInvoices(): void {
    this.loading = true;
    this.error = '';
    const params = new URLSearchParams();
    if (this.statusFilter) params.set('status', this.statusFilter);
    if (this.directionFilter) params.set('direction', this.directionFilter);
    if (this.search.trim()) params.set('search', this.search.trim());
    const suffix = params.toString() ? `?${params.toString()}` : '';
    this.http.get<Invoice[]>(this.global.url + 'invoices/getAll' + suffix).subscribe({
      next: (res) => {
        this.invoices = res || [];
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.error || 'Errore caricamento fatture';
      },
    });
  }

  loadCustomers(): void {
    this.http.get<any[]>(this.global.url + 'customers/getAll').subscribe({
      next: (res) => {
        this.customers = (Array.isArray(res) ? res : []).map((customer) => this.toCustomerOption(customer));
        this.syncCustomerQueryFromSelection();
        this.syncDdtCustomerQueryFromSelection();
        this.startPendingInvoiceFromCustomer();
      },
      error: () => {
        this.customers = [];
      },
    });
  }

  loadDdts(): void {
    const params = new URLSearchParams();
    if (this.ddtStatusFilter) params.set('status', this.ddtStatusFilter);
    if (this.ddtSearch.trim()) params.set('search', this.ddtSearch.trim());
    const suffix = params.toString() ? `?${params.toString()}` : '';
    this.http.get<DeliveryNote[]>(this.global.url + 'invoices/ddt/getAll' + suffix).subscribe({
      next: (res) => {
        this.ddts = res || [];
      },
      error: (err) => {
        this.error = this.errorText(err);
      },
    });
  }

  loadPaymentSchedule(): void {
    const params = new URLSearchParams();
    if (this.scheduleDirection) params.set('direction', this.scheduleDirection);
    if (this.scheduleStatus === 'overdue') {
      params.set('overdue', 'true');
    } else if (this.scheduleStatus) {
      params.set('paymentStatus', this.scheduleStatus);
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';
    this.http.get<Invoice[]>(this.global.url + 'invoices/payment-schedule' + suffix).subscribe({
      next: (res) => {
        this.paymentSchedule = res || [];
      },
      error: (err) => {
        this.error = this.errorText(err);
      },
    });
    this.http.get<PaymentScheduleItem[]>(this.global.url + 'invoices/payment-schedule-items' + suffix).subscribe({
      next: (res) => {
        this.paymentScheduleItems = res || [];
      },
      error: () => {
        this.paymentScheduleItems = [];
      },
    });
  }

  filteredPaymentScheduleItems(): PaymentScheduleItem[] {
    const query = this.normalizeSearch(this.scheduleSearch);
    if (!query) return this.paymentScheduleItems;
    return this.paymentScheduleItems.filter((item) => {
      const text = [
        item.series,
        item.number,
        item.type,
        item.subjectName,
        item.installmentNumber ? `rata ${item.installmentNumber}` : 'saldo',
        item.dueDate,
        item.status,
      ].join(' ');
      return this.normalizeSearch(text).includes(query);
    });
  }

  scheduleSummary(): PaymentScheduleSummary {
    return this.filteredPaymentScheduleItems().reduce(
      (summary, item) => {
        const amount = Number(item.amount || 0);
        const paidAmount = Number(item.paidAmount || 0);
        const residualAmount = this.scheduleResidual(item);
        if (item.direction === 'inbound') {
          summary.toPay = this.round(summary.toPay + amount);
          summary.paid = this.round(summary.paid + paidAmount);
          summary.residualPay = this.round(summary.residualPay + residualAmount);
        } else {
          summary.toCollect = this.round(summary.toCollect + amount);
          summary.collected = this.round(summary.collected + paidAmount);
          summary.residualCollect = this.round(summary.residualCollect + residualAmount);
        }
        if (this.isScheduleOverdue(item)) {
          summary.overdue = this.round(summary.overdue + residualAmount);
        }
        return summary;
      },
      {
        toCollect: 0,
        toPay: 0,
        collected: 0,
        paid: 0,
        residualCollect: 0,
        residualPay: 0,
        overdue: 0,
      },
    );
  }

  scheduleResidual(item: PaymentScheduleItem): number {
    const amount = Number(item.amount || 0);
    const paidAmount = Number(item.paidAmount || 0);
    return this.round(Number(item.residualAmount ?? Math.max(amount - paidAmount, 0)));
  }

  scheduleReference(item: PaymentScheduleItem): string {
    const number = [item.series, item.number].filter(Boolean).join('/');
    const installment = item.installmentNumber ? ` - rata ${item.installmentNumber}` : '';
    return `${item.type || 'Documento'} ${number}${installment}`;
  }

  scheduleDebitAmount(item: PaymentScheduleItem): number {
    return item.direction === 'inbound' ? Number(item.amount || 0) : 0;
  }

  scheduleCreditAmount(item: PaymentScheduleItem): number {
    return item.direction === 'outbound' ? Number(item.amount || 0) : 0;
  }

  scheduleItemStatusLabel(item: PaymentScheduleItem): string {
    const status = this.stringValue(item.status).toLowerCase();
    if (this.scheduleResidual(item) <= 0 || status === 'paid') return 'Saldata';
    if (status === 'partial' || Number(item.paidAmount || 0) > 0) return 'Parziale';
    if (this.isScheduleOverdue(item)) return 'Scaduta';
    return 'Aperta';
  }

  scheduleItemStatusClass(item: PaymentScheduleItem): string {
    const label = this.scheduleItemStatusLabel(item);
    if (label === 'Saldata') return 'paid';
    if (label === 'Parziale') return 'partial';
    if (label === 'Scaduta') return 'overdue';
    return 'open';
  }

  isScheduleOverdue(item: PaymentScheduleItem): boolean {
    const dueDate = this.parseDate(this.stringValue(item.dueDate));
    if (!dueDate || this.scheduleResidual(item) <= 0) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today;
  }

  loadEconomicSummary(): void {
    this.loading = true;
    this.error = '';
    const params = new URLSearchParams();
    if (this.economicFrom) params.set('startDate', this.economicFrom);
    if (this.economicTo) params.set('endDate', this.economicTo);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    this.http.get<EconomicSummary>(this.global.url + 'invoices/economics/summary' + suffix).subscribe({
      next: (res) => {
        this.economicSummary = res || null;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.economicSummary = null;
        this.error = this.errorText(err);
      },
    });
  }

  loadSuppliers(): void {
    const params = new URLSearchParams();
    if (this.supplierSearch.trim()) params.set('search', this.supplierSearch.trim());
    const suffix = params.toString() ? `?${params.toString()}` : '';
    this.http.get<Supplier[]>(this.global.url + 'invoices/suppliers/getAll' + suffix).subscribe({
      next: (res) => {
        this.suppliers = res || [];
      },
      error: () => {
        this.suppliers = [];
      },
    });
  }

  loadInvoiceSettings(): void {
    this.invoiceSettingsLoaded = false;
    this.http.get<InvoiceSettings>(this.global.url + 'invoices/settings').subscribe({
      next: (res) => {
        this.paymentTerms = res?.paymentTerms || [];
        this.bankAccounts = res?.bankAccounts || [];
        this.serviceItems = res?.serviceItems || [];
        this.customerInvoiceDefaults = this.normalizeCustomerInvoiceDefaults(res?.customerInvoiceDefaults);
        this.invoiceSettingsLoaded = true;
        this.applyDefaultInvoiceSettings();
        this.startPendingInvoiceFromCustomer();
      },
      error: () => {
        this.paymentTerms = [];
        this.bankAccounts = [];
        this.serviceItems = [];
        this.customerInvoiceDefaults = this.emptyCustomerInvoiceDefaults();
        this.invoiceSettingsLoaded = true;
        this.startPendingInvoiceFromCustomer();
      },
    });
  }

  importPassiveFromProvider(): void {
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<any>(this.global.url + 'invoices/import-passive', { size: 50 }).subscribe({
      next: (res) => {
        this.saving = false;
        this.success = `Import provider completato: ${res?.imported || 0} importate, ${res?.skipped || 0} saltate`;
        this.directionFilter = 'inbound';
        this.loadInvoices();
        this.loadPaymentSchedule();
        this.loadSuppliers();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  newInvoice(): void {
    this.selected = this.emptyInvoice();
    this.selectedCustomerCode = '';
    this.customerQuery = '';
    this.customerPickerOpen = false;
    this.events = [];
    this.statusReport = null;
    this.xmlPreview = '';
    this.applyDefaultInvoiceSettings();
    this.loadNextNumber();
  }

  private startPendingInvoiceFromCustomer(): void {
    if (!this.pendingCustomerInvoiceId || !this.customers.length || !this.invoiceSettingsLoaded || this.activeView !== 'invoices') return;
    const customer = this.customers.find((item) => item.numeroCliente === this.pendingCustomerInvoiceId);
    if (!customer) return;
    this.pendingCustomerInvoiceId = '';
    this.directionFilter = 'outbound';
    this.newInvoice();
    this.selectCustomer(customer);
    this.applyCustomerInvoiceDefaults(customer.raw);
    this.success = 'Nuova fattura vendita precompilata dal cliente selezionato';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { fromCustomer: null, customerId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  newDdt(): void {
    this.selectedDdt = this.emptyDdt();
    this.selectedDdtCustomerCode = '';
    this.ddtCustomerQuery = '';
    this.ddtCustomerPickerOpen = false;
    this.loadNextDdtNumber();
  }

  newProforma(): void {
    this.selected = this.emptyInvoice();
    this.selected.type = 'PF';
    this.selected.series = 'PF';
    this.selected.customerSdiCode = '';
    this.selectedCustomerCode = '';
    this.customerQuery = '';
    this.customerPickerOpen = false;
    this.events = [];
    this.statusReport = null;
    this.xmlPreview = '';
    this.applyDefaultInvoiceSettings();
    this.loadNextNumber();
  }

  newSupplier(): void {
    this.selectedSupplier = this.emptySupplier();
  }

  editSupplier(supplier: Supplier): void {
    this.selectedSupplier = { ...this.emptySupplier(), ...supplier };
  }

  loadNextDdtNumber(): void {
    this.http
      .get<{ number: string }>(
        this.global.url + `invoices/ddt/next-number?year=${this.selectedDdt.year}&series=${encodeURIComponent(this.selectedDdt.series || '')}`,
      )
      .subscribe({
        next: (res) => {
          if (!this.selectedDdt.id) this.selectedDdt.number = res?.number || '';
        },
      });
  }

  loadNextNumber(): void {
    this.http
      .get<{ number: string }>(
        this.global.url + `invoices/next-number?year=${this.selected.year}&series=${encodeURIComponent(this.selected.series || '')}&type=${encodeURIComponent(this.selected.type || 'TD01')}`,
      )
      .subscribe({
        next: (res) => {
          if (!this.selected.id) this.selected.number = res?.number || '';
        },
      });
  }

  selectInvoice(invoice: Invoice): void {
    if (!invoice.id) return;
    this.error = '';
    this.success = '';
    this.http.post<Invoice>(this.global.url + 'invoices/get', { id: invoice.id }).subscribe({
      next: (res) => {
        this.selected = this.withInvoiceDefaults(res);
        this.selectedCustomerCode = this.findSelectedCustomerCode(this.selected);
        this.syncCustomerQueryFromSelection();
        this.xmlPreview = '';
        this.loadEvents();
        this.loadStatusReport();
      },
      error: (err) => {
        this.error = err?.error?.error || 'Errore apertura fattura';
      },
    });
  }

  selectScheduleItem(item: PaymentScheduleItem): void {
    this.directionFilter = item.direction;
    this.statusFilter = '';
    this.search = '';
    this.activeView = 'invoices';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { view: 'invoices', direction: item.direction },
      queryParamsHandling: 'merge',
    });
    this.selectInvoice({
      ...this.emptyInvoice(),
      id: item.invoiceId,
      direction: item.direction,
      number: item.number,
      year: new Date().getFullYear(),
      series: item.series,
      status: '',
      type: item.type,
      issueDate: '',
    });
  }

  selectDdt(ddt: DeliveryNote): void {
    if (!ddt.id) return;
    this.error = '';
    this.success = '';
    this.http.post<DeliveryNote>(this.global.url + 'invoices/ddt/get', { id: ddt.id }).subscribe({
      next: (res) => {
        this.selectedDdt = this.withDdtDefaults(res);
        this.selectedDdtCustomerCode = this.findSelectedDdtCustomerCode(this.selectedDdt);
        this.syncDdtCustomerQueryFromSelection();
      },
      error: (err) => {
        this.error = this.errorText(err);
      },
    });
  }

  toggleDdtSelection(ddt: DeliveryNote, event?: Event): void {
    event?.stopPropagation();
    if (!ddt.id || ddt.status === 'invoiced') return;
    if (this.selectedDdtIds.includes(ddt.id)) {
      this.selectedDdtIds = this.selectedDdtIds.filter((id) => id !== ddt.id);
      return;
    }
    this.selectedDdtIds = [...this.selectedDdtIds, ddt.id];
  }

  isDdtSelected(ddt: DeliveryNote): boolean {
    return !!ddt.id && this.selectedDdtIds.includes(ddt.id);
  }

  addLine(): void {
    this.selected.lines.push(this.emptyLine());
  }

  removeLine(index: number): void {
    if (this.selected.lines.length === 1) {
      this.selected.lines = [this.emptyLine()];
      return;
    }
    this.selected.lines.splice(index, 1);
  }

  addDdtLine(): void {
    this.selectedDdt.lines.push(this.emptyDdtLine());
  }

  removeDdtLine(index: number): void {
    if (this.selectedDdt.lines.length === 1) {
      this.selectedDdt.lines = [this.emptyDdtLine()];
      return;
    }
    this.selectedDdt.lines.splice(index, 1);
  }

  onDdtVatRateChange(line: DeliveryNoteLine): void {
    if (Number(line.vatRate || 0) !== 0) line.vatNature = '';
  }

  onCustomerVatNumberChange(): void {
    this.selected.customerVatNumber = this.stringValue(this.selected.customerVatNumber).toUpperCase();
    const country = this.selected.customerVatNumber.match(/^[A-Z]{2}/)?.[0];
    if (country && country !== 'IT') this.selected.customerCountry = country;
  }

  onCustomerCountryChange(): void {
    this.selected.customerCountry = this.stringValue(this.selected.customerCountry || 'IT').toUpperCase().slice(0, 2) || 'IT';
    if (!this.stringValue(this.selected.customerSdiCode)) {
      this.selected.customerSdiCode = this.defaultSdiForCountry(this.selected.customerCountry);
    }
  }

  onDocumentTypeChange(): void {
    const type = this.stringValue(this.selected.type).toUpperCase();
    const seriesByType: Record<string, string> = {
      PF: 'PF',
      PROFORMA: 'PF',
      TD04: 'NC',
      TD05: 'ND',
      TD24: 'FD',
      TD25: 'FD',
    };
    if (!this.selected.id) {
      this.selected.series = seriesByType[type] || '';
      this.loadNextNumber();
    }
  }

  onLineVatRateChange(line: InvoiceLine): void {
    if (Number(line.vatRate || 0) !== 0) line.vatNature = '';
  }

  applyPaymentTerm(): void {
    const term = this.paymentTerms.find((item) => item.id === Number(this.selected.paymentTermId));
    if (!term) return;
    this.selected.paymentMethod = term.method || this.selected.paymentMethod || 'MP05';
    this.selected.dueDate = this.calculateDueDate(this.selected.issueDate, term.firstDueDays || 0, !!term.endOfMonth);
  }

  applyBankAccount(): void {
    const account = this.bankAccounts.find((item) => item.id === Number(this.selected.bankAccountId));
    if (!account) return;
    this.selected.paymentIban = account.iban || this.selected.paymentIban || '';
  }

  applyDefaultInvoiceSettings(): void {
    if (!this.selected || this.selected.id || this.isInbound(this.selected)) return;
    const defaultTerm = this.activePaymentTerms().find((item) => item.isDefault) || this.activePaymentTerms()[0];
    const defaultBank = this.activeBankAccounts().find((item) => item.isDefault) || this.activeBankAccounts()[0];
    if (defaultTerm && !this.selected.paymentTermId) {
      this.selected.paymentTermId = defaultTerm.id || null;
      this.applyPaymentTerm();
    }
    if (defaultBank && !this.selected.bankAccountId) {
      this.selected.bankAccountId = defaultBank.id || null;
      this.applyBankAccount();
    }
  }

  applyServiceToLine(line: InvoiceLine): void {
    const code = this.stringValue(line.serviceCode).toUpperCase();
    line.serviceCode = code;
    if (!code) return;
    const service = this.serviceItems.find((item) => this.stringValue(item.code).toUpperCase() === code && item.active !== false);
    if (!service) return;
    line.description = service.description || service.name || line.description;
    line.unit = service.unit || line.unit || 'pz';
    line.unitPriceInput = Number(service.unitPrice || 0);
    line.priceIncludesVat = !!service.priceIncludesVat;
    line.unitPrice = this.netUnitPrice(line);
    line.vatRate = Number(service.vatRate ?? line.vatRate ?? 22);
    line.vatNature = Number(line.vatRate || 0) === 0 ? (service.vatNature || line.vatNature || '') : '';
  }

  syncLinePriceMode(line: InvoiceLine): void {
    line.unitPrice = this.netUnitPrice(line);
  }

  onPensionFundVatRateChange(): void {
    if (Number(this.selected.pensionFundVatRate || 0) !== 0) this.selected.pensionFundVatNature = '';
  }

  applySelectedCustomer(): void {
    const customer = this.customers.find((item) => item.numeroCliente === this.selectedCustomerCode);
    if (!customer) return;
    this.applyCustomerToInvoice(customer.raw);
    this.customerQuery = customer.label;
  }

  filteredCustomers(): InvoiceCustomerOption[] {
    const query = this.normalizeSearch(this.customerQuery);
    const source = this.customers;
    if (!query) return [];
    return source
      .filter((customer) => this.normalizeSearch(customer.label).includes(query))
      .slice(0, 8);
  }

  selectCustomer(customer: InvoiceCustomerOption): void {
    this.selectedCustomerCode = customer.numeroCliente;
    this.customerQuery = customer.label;
    this.customerPickerOpen = false;
    this.applyCustomerToInvoice(customer.raw);
  }

  clearCustomerSelection(): void {
    this.selectedCustomerCode = '';
    this.customerQuery = '';
    this.customerPickerOpen = false;
  }

  openCustomerPicker(): void {
    this.customerPickerOpen = !!this.customerQuery.trim();
  }

  closeCustomerPickerSoon(): void {
    window.setTimeout(() => {
      this.customerPickerOpen = false;
    }, 150);
  }

  filteredDdtCustomers(): InvoiceCustomerOption[] {
    const query = this.normalizeSearch(this.ddtCustomerQuery);
    if (!query) return [];
    return this.customers
      .filter((customer) => this.normalizeSearch(customer.label).includes(query))
      .slice(0, 8);
  }

  selectDdtCustomer(customer: InvoiceCustomerOption): void {
    this.selectedDdtCustomerCode = customer.numeroCliente;
    this.ddtCustomerQuery = customer.label;
    this.ddtCustomerPickerOpen = false;
    this.applyCustomerToDdt(customer.raw);
  }

  clearDdtCustomerSelection(): void {
    this.selectedDdtCustomerCode = '';
    this.ddtCustomerQuery = '';
    this.ddtCustomerPickerOpen = false;
  }

  openDdtCustomerPicker(): void {
    this.ddtCustomerPickerOpen = !!this.ddtCustomerQuery.trim();
  }

  closeDdtCustomerPickerSoon(): void {
    window.setTimeout(() => {
      this.ddtCustomerPickerOpen = false;
    }, 150);
  }

  totals(): { subtotal: number; vatTotal: number; total: number } {
    const base = this.selected.lines.reduce(
      (acc, line) => {
        const quantity = Number(line.quantity || 0);
        const unitPrice = this.netUnitPrice(line);
        const discount = Math.min(Math.max(Number(line.discountPercent || 0), 0), 100);
        const vatRate = Math.max(Number(line.vatRate || 0), 0);
        const taxable = this.round(quantity * unitPrice * (1 - discount / 100));
        const vat = this.round(taxable * vatRate / 100);
        acc.subtotal = this.round(acc.subtotal + taxable);
        acc.vatTotal = this.round(acc.vatTotal + vat);
        acc.total = this.round(acc.total + taxable + vat);
        return acc;
      },
      { subtotal: 0, vatTotal: 0, total: 0 },
    );
    const stampDuty = this.selected.stampDutyEnabled ? this.round(Number(this.selected.stampDutyAmount || 0)) : 0;
    const pensionFund = this.selected.pensionFundEnabled ? this.round(Number(this.selected.pensionFundAmount || 0)) : 0;
    const pensionVat = this.selected.pensionFundEnabled
      ? this.round(pensionFund * Number(this.selected.pensionFundVatRate || 0) / 100)
      : 0;
    const withholding = this.selected.withholdingEnabled ? this.round(Number(this.selected.withholdingAmount || 0)) : 0;
    return {
      subtotal: this.round(base.subtotal + pensionFund),
      vatTotal: this.round(base.vatTotal + pensionVat),
      total: this.round(base.total + stampDuty + pensionFund + pensionVat - withholding),
    };
  }

  ddtTotals(): { subtotal: number; vatTotal: number; total: number } {
    return this.selectedDdt.lines.reduce(
      (acc, line) => {
        const quantity = Number(line.quantity || 0);
        const unitPrice = this.netUnitPrice(line);
        const discount = Math.min(Math.max(Number(line.discountPercent || 0), 0), 100);
        const vatRate = Math.max(Number(line.vatRate || 0), 0);
        const taxable = this.round(quantity * unitPrice * (1 - discount / 100));
        const vat = this.round(taxable * vatRate / 100);
        acc.subtotal = this.round(acc.subtotal + taxable);
        acc.vatTotal = this.round(acc.vatTotal + vat);
        acc.total = this.round(acc.total + taxable + vat);
        return acc;
      },
      { subtotal: 0, vatTotal: 0, total: 0 },
    );
  }

  save(): void {
    this.saving = true;
    this.error = '';
    this.success = '';
    const endpoint = this.selected.id ? 'edit' : 'add';
    this.http.post<Invoice>(this.global.url + 'invoices/' + endpoint, this.selected).subscribe({
      next: (res) => {
        this.selected = this.withInvoiceDefaults(res);
        this.saving = false;
        this.success = 'Fattura salvata';
        this.loadInvoices();
        this.loadPaymentSchedule();
        this.loadEvents();
        this.loadStatusReport();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  saveAndValidate(): void {
    this.saving = true;
    this.error = '';
    this.success = '';
    const endpoint = this.selected.id ? 'edit' : 'add';
    this.http.post<Invoice>(this.global.url + 'invoices/' + endpoint, this.selected).subscribe({
      next: (saved) => {
        this.selected = this.withInvoiceDefaults(saved);
        this.http.post<any>(this.global.url + 'invoices/validate', { id: this.selected.id }).subscribe({
          next: (res) => {
            this.saving = false;
            const warnings = Array.isArray(res?.warnings) && res.warnings.length ? `\n${res.warnings.join('\n')}` : '';
            this.success = res?.valid ? `Fattura salvata e valida${warnings}` : 'Fattura salvata e validazione completata';
            this.loadInvoices();
            this.loadPaymentSchedule();
            this.loadEvents();
          },
          error: (err) => {
            this.saving = false;
            this.error = this.errorText(err);
            this.loadInvoices();
            this.loadEvents();
          },
        });
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  saveDdt(): void {
    this.saving = true;
    this.error = '';
    this.success = '';
    const endpoint = this.selectedDdt.id ? 'edit' : 'add';
    this.http.post<DeliveryNote>(this.global.url + 'invoices/ddt/' + endpoint, this.selectedDdt).subscribe({
      next: (res) => {
        this.selectedDdt = this.withDdtDefaults(res);
        this.saving = false;
        this.success = 'DDT salvato';
        this.loadDdts();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  issueDdt(): void {
    if (!this.selectedDdt.id) {
      this.error = 'Salva il DDT prima di emetterlo';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<DeliveryNote>(this.global.url + 'invoices/ddt/issue', { id: this.selectedDdt.id }).subscribe({
      next: (res) => {
        this.saving = false;
        this.selectedDdt = this.withDdtDefaults(res);
        this.success = 'DDT emesso';
        this.loadDdts();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  createInvoiceFromDdt(): void {
    const ids = this.selectedDdtIds.length ? this.selectedDdtIds : (this.selectedDdt.id ? [this.selectedDdt.id] : []);
    if (!ids.length) {
      this.error = 'Seleziona un DDT prima di creare la fattura differita';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<Invoice>(this.global.url + 'invoices/ddt/create-invoice', { ids }).subscribe({
      next: (res) => {
        this.saving = false;
        this.selected = this.withInvoiceDefaults(res);
        this.selectedDdtIds = [];
        this.success = 'Fattura differita creata';
        this.loadInvoices();
        this.loadDdts();
        this.loadPaymentSchedule();
        this.loadEvents();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  generateInstallments(): void {
    if (!this.selected.id) {
      this.error = 'Salva la fattura prima di generare le rate';
      return;
    }
    if (this.selected.paymentTermId) {
      this.saving = true;
      this.error = '';
      this.success = '';
      this.http.post<Invoice>(this.global.url + 'invoices/installments/generate', {
        id: this.selected.id,
        paymentTermId: this.selected.paymentTermId,
      }).subscribe({
        next: (res) => {
          this.saving = false;
          this.selected = this.withInvoiceDefaults(res);
          this.success = 'Rate generate dal termine pagamento';
          this.loadPaymentSchedule();
          this.loadEvents();
        },
        error: (err) => {
          this.saving = false;
          this.error = this.errorText(err);
        },
      });
      return;
    }
    const countRaw = prompt('Numero rate', '2');
    if (countRaw === null) return;
    const count = Number(countRaw);
    if (!Number.isInteger(count) || count <= 0) {
      this.error = 'Numero rate non valido';
      return;
    }
    const firstDueDate = prompt('Prima scadenza', this.selected.dueDate || new Date().toISOString().slice(0, 10));
    if (firstDueDate === null) return;
    const intervalRaw = prompt('Giorni tra le rate', '30');
    if (intervalRaw === null) return;
    const intervalDays = Number(intervalRaw);
    if (!Number.isInteger(intervalDays) || intervalDays <= 0) {
      this.error = 'Intervallo rate non valido';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<Invoice>(this.global.url + 'invoices/installments/generate', {
      id: this.selected.id,
      count,
      firstDueDate,
      intervalDays,
      paymentMethod: this.selected.paymentMethod,
    }).subscribe({
      next: (res) => {
        this.saving = false;
        this.selected = this.withInvoiceDefaults(res);
        this.success = 'Rate generate';
        this.loadPaymentSchedule();
        this.loadEvents();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  saveInstallments(): void {
    if (!this.selected.id) {
      this.error = 'Salva la fattura prima di modificare le rate';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<Invoice>(this.global.url + 'invoices/installments/save', {
      invoiceId: this.selected.id,
      installments: this.selected.installments || [],
    }).subscribe({
      next: (res) => {
        this.saving = false;
        this.selected = this.withInvoiceDefaults(res);
        this.success = 'Rate salvate';
        this.loadPaymentSchedule();
        this.loadEvents();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  deleteInstallments(): void {
    if (!this.selected.id || !confirm('Eliminare il piano rate?')) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<Invoice>(this.global.url + 'invoices/installments/delete', { invoiceId: this.selected.id }).subscribe({
      next: (res) => {
        this.saving = false;
        this.selected = this.withInvoiceDefaults(res);
        this.success = 'Rate eliminate';
        this.loadPaymentSchedule();
        this.loadEvents();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  deleteDdt(): void {
    if (!this.selectedDdt.id || !confirm('Eliminare questa bozza DDT?')) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<any>(this.global.url + 'invoices/ddt/delete', { id: this.selectedDdt.id }).subscribe({
      next: () => {
        this.saving = false;
        this.success = 'DDT eliminato';
        this.newDdt();
        this.loadDdts();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  saveSupplier(): void {
    if (!this.selectedSupplier.name?.trim()) {
      this.error = 'Nome fornitore obbligatorio';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<Supplier>(this.global.url + 'invoices/suppliers/save', this.selectedSupplier).subscribe({
      next: (res) => {
        this.saving = false;
        this.selectedSupplier = { ...this.emptySupplier(), ...res };
        this.success = 'Fornitore salvato';
        this.loadSuppliers();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  deleteSupplier(): void {
    if (!this.selectedSupplier.id || !confirm('Eliminare questo fornitore?')) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<any>(this.global.url + 'invoices/suppliers/delete', { id: this.selectedSupplier.id }).subscribe({
      next: () => {
        this.saving = false;
        this.selectedSupplier = this.emptySupplier();
        this.success = 'Fornitore eliminato';
        this.loadSuppliers();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  activePaymentTerms(): InvoicePaymentTerm[] {
    return this.paymentTerms.filter((item) => item.active !== false);
  }

  activeBankAccounts(): InvoiceBankAccount[] {
    return this.bankAccounts.filter((item) => item.active !== false);
  }

  activeServiceItems(): InvoiceServiceItem[] {
    return this.serviceItems.filter((item) => item.active !== false);
  }

  editPaymentTerm(term: InvoicePaymentTerm): void {
    this.selectedPaymentTerm = { ...this.emptyPaymentTerm(), ...term };
  }

  newPaymentTerm(): void {
    this.selectedPaymentTerm = this.emptyPaymentTerm();
  }

  savePaymentTerm(): void {
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<InvoicePaymentTerm>(this.global.url + 'invoices/settings/payment-terms/save', this.selectedPaymentTerm).subscribe({
      next: (res) => {
        this.saving = false;
        this.selectedPaymentTerm = { ...this.emptyPaymentTerm(), ...res };
        this.success = 'Termine pagamento salvato';
        this.loadInvoiceSettings();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  deletePaymentTerm(): void {
    if (!this.selectedPaymentTerm.id || !confirm('Disattivare questo termine pagamento?')) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<any>(this.global.url + 'invoices/settings/payment-terms/delete', { id: this.selectedPaymentTerm.id }).subscribe({
      next: () => {
        this.saving = false;
        this.selectedPaymentTerm = this.emptyPaymentTerm();
        this.success = 'Termine pagamento disattivato';
        this.loadInvoiceSettings();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  editBankAccount(account: InvoiceBankAccount): void {
    this.selectedBankAccount = { ...this.emptyBankAccount(), ...account };
  }

  newBankAccount(): void {
    this.selectedBankAccount = this.emptyBankAccount();
  }

  saveBankAccount(): void {
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<InvoiceBankAccount>(this.global.url + 'invoices/settings/bank-accounts/save', this.selectedBankAccount).subscribe({
      next: (res) => {
        this.saving = false;
        this.selectedBankAccount = { ...this.emptyBankAccount(), ...res };
        this.success = 'Banca salvata';
        this.loadInvoiceSettings();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  deleteBankAccount(): void {
    if (!this.selectedBankAccount.id || !confirm('Disattivare questa banca?')) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<any>(this.global.url + 'invoices/settings/bank-accounts/delete', { id: this.selectedBankAccount.id }).subscribe({
      next: () => {
        this.saving = false;
        this.selectedBankAccount = this.emptyBankAccount();
        this.success = 'Banca disattivata';
        this.loadInvoiceSettings();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  editServiceItem(item: InvoiceServiceItem): void {
    this.selectedServiceItem = { ...this.emptyServiceItem(), ...item };
  }

  newServiceItem(): void {
    this.selectedServiceItem = this.emptyServiceItem();
  }

  saveServiceItem(): void {
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<InvoiceServiceItem>(this.global.url + 'invoices/settings/service-items/save', this.selectedServiceItem).subscribe({
      next: (res) => {
        this.saving = false;
        this.selectedServiceItem = { ...this.emptyServiceItem(), ...res };
        this.success = 'Servizio salvato';
        this.loadInvoiceSettings();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  deleteServiceItem(): void {
    if (!this.selectedServiceItem.id || !confirm('Disattivare questo servizio?')) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<any>(this.global.url + 'invoices/settings/service-items/delete', { id: this.selectedServiceItem.id }).subscribe({
      next: () => {
        this.saving = false;
        this.selectedServiceItem = this.emptyServiceItem();
        this.success = 'Servizio disattivato';
        this.loadInvoiceSettings();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  addCustomerVatProfile(): void {
    this.customerInvoiceDefaults.vatProfiles = [
      ...(this.customerInvoiceDefaults.vatProfiles || []),
      {
        code: '',
        label: '',
        vatRate: 22,
        vatNature: '',
        splitPayment: false,
        vatExigibility: 'I',
      },
    ];
  }

  removeCustomerVatProfile(index: number): void {
    if ((this.customerInvoiceDefaults.vatProfiles || []).length <= 1) return;
    this.customerInvoiceDefaults.vatProfiles = this.customerInvoiceDefaults.vatProfiles.filter((_, i) => i !== index);
  }

  onCustomerVatProfileRateChange(profile: InvoiceCustomerVatProfile): void {
    if (Number(profile.vatRate || 0) !== 0) profile.vatNature = '';
  }

  onCustomerVatProfileSplitPaymentChange(profile: InvoiceCustomerVatProfile): void {
    if (profile.splitPayment) profile.vatExigibility = 'S';
  }

  saveCustomerInvoiceDefaults(): void {
    this.saving = true;
    this.error = '';
    this.success = '';
    const payload = this.normalizeCustomerInvoiceDefaults(this.customerInvoiceDefaults);
    this.http.post<InvoiceCustomerInvoiceDefaults>(
      this.global.url + 'invoices/settings/customer-invoice-defaults/save',
      payload,
    ).subscribe({
      next: (res) => {
        this.saving = false;
        this.customerInvoiceDefaults = this.normalizeCustomerInvoiceDefaults(res);
        this.success = 'Generazione fattura da cliente salvata';
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  generateXml(): void {
    if (!this.selected.id) {
      this.error = 'Salva la fattura prima di generare XML';
      return;
    }
    this.runInvoiceAction('generate-xml', 'XML generato', (res: any) => {
      this.xmlPreview = res?.xmlContent || '';
      if (res?.xmlFilename) this.selected.xmlFilename = res.xmlFilename;
    });
  }

  issue(): void {
    this.runInvoiceAction('issue', 'Fattura emessa localmente');
  }

  send(): void {
    this.runInvoiceAction('send', 'Fattura inviata al provider');
  }

  sync(): void {
    this.runInvoiceAction('sync', 'Stato sincronizzato');
  }

  saveValidateSend(): void {
    if (this.isProforma(this.selected)) {
      this.error = 'La proforma va convertita in fattura prima dell’invio SdI';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    const endpoint = this.selected.id ? 'edit' : 'add';
    this.http.post<Invoice>(this.global.url + 'invoices/' + endpoint, this.selected).subscribe({
      next: (saved) => {
        this.selected = this.withInvoiceDefaults(saved);
        this.http.post<any>(this.global.url + 'invoices/validate', { id: this.selected.id }).subscribe({
          next: () => {
            this.http.post<Invoice>(this.global.url + 'invoices/send', { id: this.selected.id }).subscribe({
              next: (sent) => {
                this.selected = this.withInvoiceDefaults(sent);
                const email = this.stringValue(this.selected.customerEmail);
                if (!email) {
                  this.saving = false;
                  this.success = 'Fattura salvata, validata e inviata al provider';
                  this.loadInvoices();
                  this.loadPaymentSchedule();
                  this.loadEvents();
                  return;
                }
                this.http.post<any>(this.global.url + 'invoices/send-email', { id: this.selected.id, email }).subscribe({
                  next: () => {
                    this.saving = false;
                    this.success = 'Fattura salvata, validata, inviata al provider e spedita via email';
                    this.loadInvoices();
                    this.loadPaymentSchedule();
                    this.loadEvents();
                  },
                  error: (emailErr) => {
                    this.saving = false;
                    this.success = 'Fattura inviata al provider, ma email non spedita';
                    this.error = this.errorText(emailErr);
                    this.loadInvoices();
                    this.loadPaymentSchedule();
                    this.loadEvents();
                  },
                });
              },
              error: (err) => {
                this.saving = false;
                this.error = this.errorText(err);
              },
            });
          },
          error: (err) => {
            this.saving = false;
            this.error = this.errorText(err);
            this.loadInvoices();
          },
        });
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  createCreditNote(): void {
    if (!this.selected.id) {
      this.error = 'Seleziona una fattura prima di creare la nota credito';
      return;
    }
    const reason = prompt('Motivo nota credito', `Nota credito fattura ${this.selected.series ? this.selected.series + '/' : ''}${this.selected.number}`);
    if (reason === null) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<Invoice>(this.global.url + 'invoices/credit-note', { id: this.selected.id, reason }).subscribe({
      next: (res) => {
        this.saving = false;
        this.selected = this.withInvoiceDefaults(res);
        this.xmlPreview = '';
        this.success = 'Nota credito creata';
        this.loadInvoices();
        this.loadEvents();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  createDebitNote(): void {
    if (!this.selected.id) {
      this.error = 'Seleziona una fattura prima di creare la nota debito';
      return;
    }
    const reason = prompt('Motivo nota debito', `Nota debito fattura ${this.selected.series ? this.selected.series + '/' : ''}${this.selected.number}`);
    if (reason === null) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<Invoice>(this.global.url + 'invoices/debit-note', { id: this.selected.id, reason }).subscribe({
      next: (res) => {
        this.saving = false;
        this.selected = this.withInvoiceDefaults(res);
        this.xmlPreview = '';
        this.success = 'Nota debito creata';
        this.loadInvoices();
        this.loadEvents();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  convertProforma(): void {
    if (!this.selected.id || !this.isProforma(this.selected)) {
      this.error = 'Seleziona una proforma da convertire';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<Invoice>(this.global.url + 'invoices/convert-proforma', { id: this.selected.id }).subscribe({
      next: (res) => {
        this.saving = false;
        this.selected = this.withInvoiceDefaults(res);
        this.success = 'Proforma convertita in fattura';
        this.loadInvoices();
        this.loadPaymentSchedule();
        this.loadEvents();
        this.loadStatusReport();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  configureProvider(): void {
    const email = prompt('Email per configurazione provider SDI');
    if (!email) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<any>(this.global.url + 'invoices/configure-provider', { email }).subscribe({
      next: () => {
        this.saving = false;
        this.success = 'Azienda configurata sul provider';
        this.loadEvents();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  validate(): void {
    this.runInvoiceAction('validate', 'Validazione completata', (res: any) => {
      const warnings = Array.isArray(res?.warnings) && res.warnings.length ? `\n${res.warnings.join('\n')}` : '';
      this.success = res?.valid ? `Fattura valida${warnings}` : 'Validazione completata';
    });
  }

  downloadPdf(): void {
    if (!this.selected.id) {
      this.error = 'Salva la fattura prima di scaricare il PDF';
      return;
    }
    this.saving = true;
    this.error = '';
    this.http.post(this.global.url + 'invoices/pdf', { id: this.selected.id }, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.saving = false;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `fattura-${this.selected.number || this.selected.id}.pdf`;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  downloadDdtPdf(): void {
    if (!this.selectedDdt.id) {
      this.error = 'Salva il DDT prima di scaricare il PDF';
      return;
    }
    this.saving = true;
    this.error = '';
    this.http.post(this.global.url + 'invoices/ddt/pdf', { id: this.selectedDdt.id }, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.saving = false;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `ddt-${this.selectedDdt.number || this.selectedDdt.id}.pdf`;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  emailInvoice(): void {
    if (!this.selected.id) {
      this.error = 'Salva il documento prima di inviarlo via email';
      return;
    }
    const email = prompt('Email destinatario', this.selected.customerEmail || this.selected.customerPec || '');
    if (!email) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<any>(this.global.url + 'invoices/send-email', { id: this.selected.id, email }).subscribe({
      next: () => {
        this.saving = false;
        this.success = 'Documento inviato via email';
        this.loadEvents();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  emailDdt(): void {
    if (!this.selectedDdt.id) {
      this.error = 'Salva il DDT prima di inviarlo via email';
      return;
    }
    const email = prompt('Email destinatario', '');
    if (!email) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<any>(this.global.url + 'invoices/ddt/send-email', { id: this.selectedDdt.id, email }).subscribe({
      next: () => {
        this.saving = false;
        this.success = 'DDT inviato via email';
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  importPassive(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml,text/xml,application/xml';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.saving = true;
        this.error = '';
        this.success = '';
        this.http.post<any>(this.global.url + 'invoices/import-passive-xml', {
          filename: file.name,
          xmlContent: String(reader.result || ''),
        }).subscribe({
          next: (res) => {
            this.saving = false;
            this.success = res?.duplicate ? 'Fattura passiva già importata' : 'Fattura passiva importata';
            if (res?.invoice) this.selected = this.withInvoiceDefaults(res.invoice);
            this.directionFilter = 'inbound';
            this.loadInvoices();
            this.loadPaymentSchedule();
            this.loadSuppliers();
            this.loadEvents();
          },
          error: (err) => {
            this.saving = false;
            this.error = this.errorText(err);
          },
        });
      };
      reader.onerror = () => {
        this.error = 'Errore lettura file XML';
      };
      reader.readAsText(file);
    };
    input.click();
  }

  importSalesHistory(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.xml,.zip,text/xml,application/xml,application/zip';
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      this.saving = true;
      this.error = '';
      this.success = '';
      try {
        const xmlFiles = await this.readSalesHistoryFiles(files);
        if (!xmlFiles.length) {
          this.saving = false;
          this.error = 'Nessun XML fattura trovato nel file selezionato';
          return;
        }
        this.http.post<any>(this.global.url + 'invoices/import-sales-history-xml', {
          files: xmlFiles,
        }).subscribe({
          next: (res) => {
            this.saving = false;
            const errors = Number(res?.errors?.length || 0);
            const duplicates = Number(res?.duplicates?.length || 0);
            this.success = `Storico vendita importato: ${res?.imported || 0} importate, ${duplicates} duplicate, ${errors} errori`;
            if (errors && res?.errors?.[0]?.message) {
              this.error = `Alcuni file non importati: ${res.errors[0].filename || 'file'} - ${res.errors[0].message}`;
            }
            this.directionFilter = 'outbound';
            this.loadInvoices();
            this.loadPaymentSchedule();
            this.loadEconomicSummary();
            this.loadCustomers();
          },
          error: (err) => {
            this.saving = false;
            this.error = this.errorText(err);
          },
        });
      } catch (err: any) {
        this.saving = false;
        this.error = err?.message || 'Errore lettura storico Winfatt';
      }
    };
    input.click();
  }

  private async readSalesHistoryFiles(files: File[]): Promise<Array<{ filename: string; xmlContent: string }>> {
    const result: Array<{ filename: string; xmlContent: string }> = [];
    for (const file of files) {
      const name = file.name || 'fattura.xml';
      if (name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        const entries = Object.values(zip.files)
          .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.xml'));
        for (const entry of entries) {
          result.push({
            filename: entry.name.split('/').pop() || entry.name,
            xmlContent: await entry.async('string'),
          });
        }
        continue;
      }
      if (name.toLowerCase().endsWith('.xml') || file.type.includes('xml')) {
        result.push({
          filename: name,
          xmlContent: await file.text(),
        });
      }
    }
    return result;
  }

  markPaid(): void {
    if (!this.selected.id) {
      this.error = 'Salva la fattura prima di segnarla come saldata';
      return;
    }
    const residual = Number(this.selected.residualAmount ?? this.selected.total ?? 0);
    const formattedResidual = residual.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
    if (!confirm(`Segnare questa fattura come completamente saldata per ${formattedResidual}?`)) return;
    const paymentDate = prompt('Data pagamento', this.todayInputDate());
    if (paymentDate === null) return;
    if (!this.parseDate(paymentDate)) {
      this.error = 'Data pagamento non valida. Usa il formato AAAA-MM-GG';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<Invoice>(this.global.url + 'invoices/mark-paid', {
      id: this.selected.id,
      paymentDate,
      method: this.selected.paymentMethod,
    }).subscribe({
      next: (res) => {
        this.saving = false;
        this.selected = this.withInvoiceDefaults(res);
        this.success = 'Fattura segnata come saldata';
        this.loadInvoices();
        this.loadPaymentSchedule();
        this.loadEvents();
        this.loadStatusReport();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  registerPayment(): void {
    if (!this.selected.id) {
      this.error = 'Salva la fattura prima di registrare un pagamento';
      return;
    }
    const residual = Number(this.selected.residualAmount || this.selected.total || 0);
    const rawAmount = prompt('Importo da registrare', residual.toFixed(2));
    if (rawAmount === null) return;
    const amount = Number(String(rawAmount).replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      this.error = 'Importo pagamento non valido';
      return;
    }
    const paymentDate = prompt('Data pagamento', this.todayInputDate());
    if (paymentDate === null) return;
    if (!this.parseDate(paymentDate)) {
      this.error = 'Data pagamento non valida. Usa il formato AAAA-MM-GG';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<Invoice>(this.global.url + 'invoices/register-payment', {
      id: this.selected.id,
      amount,
      paymentDate,
      method: this.selected.paymentMethod,
    }).subscribe({
      next: (res) => {
        this.saving = false;
        this.selected = this.withInvoiceDefaults(res);
        this.success = 'Pagamento registrato';
        this.loadInvoices();
        this.loadPaymentSchedule();
        this.loadEvents();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  deletePayment(payment: InvoicePayment): void {
    if (!payment.id || !confirm('Eliminare questo pagamento?')) return;
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<Invoice>(this.global.url + 'invoices/payments/delete', { id: payment.id }).subscribe({
      next: (res) => {
        this.saving = false;
        this.selected = this.withInvoiceDefaults(res);
        this.success = 'Pagamento eliminato';
        this.loadInvoices();
        this.loadPaymentSchedule();
        this.loadEvents();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  deleteDraft(): void {
    if (!this.selected.id || !confirm('Eliminare questa bozza fattura?')) return;
    this.runInvoiceAction('delete', 'Bozza eliminata', () => {
      this.newInvoice();
    });
  }

  loadEvents(): void {
    if (!this.selected.id) {
      this.events = [];
      return;
    }
    this.http
      .post<InvoiceEvent[]>(this.global.url + 'invoices/events', { invoiceId: this.selected.id })
      .subscribe({
        next: (res) => {
          this.events = res || [];
        },
      });
  }

  loadStatusReport(): void {
    if (!this.selected.id) {
      this.statusReport = null;
      return;
    }
    this.http.post<InvoiceStatusReport>(this.global.url + 'invoices/status-report', { id: this.selected.id }).subscribe({
      next: (res) => {
        this.statusReport = res || null;
      },
      error: () => {
        this.statusReport = null;
      },
    });
  }

  canEdit(): boolean {
    return !this.selected.id || ['draft', 'rejected'].includes(this.selected.status);
  }

  isProforma(invoice: Partial<Invoice>): boolean {
    return ['PF', 'PROFORMA'].includes(this.stringValue(invoice.type).toUpperCase());
  }

  canSendElectronic(): boolean {
    return !!this.selected.id && !this.isProforma(this.selected) && this.selected.provider !== 'winfatt';
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Bozza',
      issued: 'Emessa',
      sent: 'Inviata',
      delivered: 'Consegnata',
      rejected: 'Scartata',
      paid: 'Pagata',
      cancelled: 'Annullata',
      received: 'Ricevuta',
      invoiced: 'Fatturato',
    };
    return labels[status] || status || '-';
  }

  paymentStatusLabel(status?: string): string {
    const labels: Record<string, string> = {
      unpaid: 'Non pagata',
      partial: 'Parziale',
      paid: 'Pagata',
    };
    return labels[status || 'unpaid'] || status || 'Non pagata';
  }

  installmentStatusLabel(status?: string): string {
    const labels: Record<string, string> = {
      open: 'Aperta',
      partial: 'Parziale',
      paid: 'Pagata',
      cancelled: 'Annullata',
      unpaid: 'Aperta',
    };
    return labels[status || 'open'] || status || 'Aperta';
  }

  outcomeClass(severity?: string): string {
    return `outcome-${this.stringValue(severity || 'info')}`;
  }

  linkedDocuments(): Array<{ label: string; detail: string }> {
    const links: Array<{ label: string; detail: string }> = [];
    if (this.selected.relatedInvoiceNumber) {
      links.push({
        label: this.selected.type === 'TD05' ? 'Fattura origine nota debito' : 'Fattura origine nota credito',
        detail: [
          this.selected.relatedInvoiceNumber,
          this.selected.relatedInvoiceDate ? `del ${this.selected.relatedInvoiceDate}` : '',
        ].filter(Boolean).join(' '),
      });
    }
    const rawRefs = this.selected.deliveryNoteRefs;
    if (rawRefs) {
      try {
        const refs = Array.isArray(rawRefs) ? rawRefs : JSON.parse(rawRefs);
        for (const ref of refs || []) {
          links.push({
            label: 'DDT collegato',
            detail: [ref.number, ref.date ? `del ${ref.date}` : ''].filter(Boolean).join(' '),
          });
        }
      } catch {
        links.push({ label: 'DDT collegati', detail: String(rawRefs) });
      }
    }
    return links;
  }

  supplierLocation(supplier: Supplier): string {
    return [supplier.city, supplier.province].filter((item) => this.stringValue(item)).join(' ') || 'Sede non indicata';
  }

  economicChartMax(summary: EconomicSummary): number {
    const values = summary.monthly.flatMap((row) => [
      Math.abs(Number(row.revenue || 0)),
      Math.abs(Number(row.costs || 0)),
      Math.abs(Number(row.grossProfit || 0)),
    ]);
    return Math.max(...values, 1);
  }

  economicBarWidth(value: number, summary: EconomicSummary): string {
    return `${Math.max(Math.abs(Number(value || 0)) / this.economicChartMax(summary) * 100, 1)}%`;
  }

  private runInvoiceAction(endpoint: string, message: string, after?: (res: any) => void): void {
    if (!this.selected.id) {
      this.error = 'Salva la fattura prima di proseguire';
      return;
    }
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<any>(this.global.url + 'invoices/' + endpoint, { id: this.selected.id }).subscribe({
      next: (res) => {
        this.saving = false;
        if (res?.id) this.selected = this.withInvoiceDefaults(res);
        const providerAlert = endpoint === 'sync' ? this.providerSyncAlert(res) : '';
        this.success = providerAlert ? '' : message;
        if (providerAlert) this.error = providerAlert;
        after?.(res);
        this.loadInvoices();
        this.loadPaymentSchedule();
        this.loadEvents();
        this.loadStatusReport();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  private netUnitPrice(line: Partial<InvoiceLine>): number {
    const input = Number(line.unitPriceInput ?? line.unitPrice ?? 0);
    const vatRate = Math.max(Number(line.vatRate || 0), 0);
    if (line.priceIncludesVat && vatRate > 0) return this.round(input / (1 + vatRate / 100));
    return this.round(input);
  }

  private calculateDueDate(issueDate: string, days: number, endOfMonth: boolean): string {
    const base = this.parseDate(issueDate) || new Date();
    base.setDate(base.getDate() + Math.max(Number(days || 0), 0));
    if (endOfMonth) {
      base.setMonth(base.getMonth() + 1, 0);
    }
    return base.toISOString().slice(0, 10);
  }

  private todayInputDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private parseDate(value: string): Date | null {
    const normalized = this.stringValue(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
    const date = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private providerSyncAlert(invoice: any): string {
    if (this.stringValue(invoice?.status).toLowerCase() !== 'rejected') return '';
    const fallback = 'Fattura scartata dallo SdI. Apri Stato SdI o Eventi per vedere il dettaglio.';
    try {
      const message = JSON.parse(this.stringValue(invoice?.providerMessage));
      const detail = this.stringValue(message?.notificationOutcome?.message);
      return detail || fallback;
    } catch {
      return fallback;
    }
  }

  private round(value: number): number {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  private toCustomerOption(customer: Record<string, any>): InvoiceCustomerOption {
    const numeroCliente = String(customer?.['numeroCliente'] || '').trim();
    const label = [
      numeroCliente,
      this.global.getRecordDisplayName('customer', customer) || customer?.['ragioneSociale'] || customer?.['nome'] || 'Cliente',
      this.customerValue(customer, 'customerVatNumber') || this.customerValue(customer, 'customerFiscalCode'),
    ].filter(Boolean).join(' - ');
    return { numeroCliente, label, raw: customer };
  }

  private syncCustomerQueryFromSelection(): void {
    const customer = this.customers.find((item) => item.numeroCliente === this.selectedCustomerCode);
    this.customerQuery = customer?.label || '';
  }

  private syncDdtCustomerQueryFromSelection(): void {
    const customer = this.customers.find((item) => item.numeroCliente === this.selectedDdtCustomerCode);
    this.ddtCustomerQuery = customer?.label || '';
  }

  private normalizeCustomerInvoiceDefaults(value?: Partial<InvoiceCustomerInvoiceDefaults> | null): InvoiceCustomerInvoiceDefaults {
    const defaults = this.emptyCustomerInvoiceDefaults();
    const source = value || {};
    const amountSource = ['service', 'customerField', 'fixed'].includes(String(source.amountSource || ''))
      ? source.amountSource as InvoiceCustomerInvoiceDefaults['amountSource']
      : defaults.amountSource;
    const vatProfiles = Array.isArray(source.vatProfiles) && source.vatProfiles.length
      ? source.vatProfiles.map((profile) => this.normalizeCustomerVatProfile(profile)).filter((profile) => profile.code)
      : defaults.vatProfiles;

    return {
      enabled: source.enabled === undefined ? defaults.enabled : !!source.enabled,
      defaultServiceCode: this.stringValue(source.defaultServiceCode || defaults.defaultServiceCode).toUpperCase(),
      descriptionTemplate: this.stringValue(source.descriptionTemplate || defaults.descriptionTemplate),
      amountSource,
      amountField: this.stringValue(source.amountField),
      fixedAmount: this.round(Number(source.fixedAmount || 0)),
      vatProfileSourceField: this.stringValue(source.vatProfileSourceField || defaults.vatProfileSourceField),
      defaultVatProfileCode: this.stringValue(source.defaultVatProfileCode || vatProfiles[0]?.code || defaults.defaultVatProfileCode).toUpperCase(),
      vatProfiles,
    };
  }

  private normalizeCustomerVatProfile(profile: Partial<InvoiceCustomerVatProfile>): InvoiceCustomerVatProfile {
    const vatRate = Math.max(Number(profile?.vatRate ?? 22), 0);
    const splitPayment = !!profile?.splitPayment;
    return {
      code: this.stringValue(profile?.code).toUpperCase(),
      label: this.stringValue(profile?.label || profile?.code),
      vatRate: this.round(vatRate),
      vatNature: vatRate === 0 ? this.stringValue(profile?.vatNature).toUpperCase() : '',
      splitPayment,
      vatExigibility: this.normalizeVatExigibility(profile?.vatExigibility, splitPayment ? 'S' : 'I'),
    };
  }

  private normalizeVatExigibility(value: any, fallback = 'I'): string {
    const normalized = this.stringValue(value || fallback).toUpperCase();
    return ['I', 'D', 'S'].includes(normalized) ? normalized : fallback;
  }

  private applyCustomerInvoiceDefaults(customer: Record<string, any>): void {
    const config = this.normalizeCustomerInvoiceDefaults(this.customerInvoiceDefaults);
    if (!config.enabled || this.isInbound(this.selected)) return;

    const service = this.findDefaultCustomerService(config);
    const line: InvoiceLine = {
      ...this.emptyLine(),
      ...(this.selected.lines?.[0] || {}),
    };

    if (service) {
      line.serviceCode = service.code;
      this.applyServiceToLine(line);
    }

    const renderedDescription = this.renderCustomerTemplate(config.descriptionTemplate, customer);
    if (renderedDescription) {
      line.description = renderedDescription;
    } else if (service) {
      line.description = service.description || service.name || line.description;
    }

    const configuredAmount = this.customerInvoiceAmount(config, customer);
    if (configuredAmount !== null) {
      line.unitPriceInput = configuredAmount;
      line.unitPrice = this.netUnitPrice(line);
    }

    const profile = this.findCustomerVatProfile(config, customer);
    if (profile) {
      line.vatRate = Number(profile.vatRate || 0);
      line.vatNature = Number(line.vatRate || 0) === 0 ? profile.vatNature || '' : '';
      this.selected.splitPayment = !!profile.splitPayment;
      this.selected.vatExigibility = this.normalizeVatExigibility(profile.vatExigibility, profile.splitPayment ? 'S' : 'I');
    }

    this.selected.lines = [line];
  }

  private findDefaultCustomerService(config: InvoiceCustomerInvoiceDefaults): InvoiceServiceItem | null {
    const activeServices = this.activeServiceItems();
    const desiredCode = this.stringValue(config.defaultServiceCode).toUpperCase();
    if (desiredCode) {
      const match = activeServices.find((service) => this.stringValue(service.code).toUpperCase() === desiredCode);
      if (match) return match;
    }
    return activeServices[0] || null;
  }

  private customerInvoiceAmount(config: InvoiceCustomerInvoiceDefaults, customer: Record<string, any>): number | null {
    if (config.amountSource === 'fixed') return this.round(Number(config.fixedAmount || 0));
    if (config.amountSource !== 'customerField' || !this.stringValue(config.amountField)) return null;
    const rawValue = this.customerConfiguredValue(customer, config.amountField);
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') return null;
    const normalized = Number(String(rawValue).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
    return Number.isFinite(normalized) ? this.round(normalized) : null;
  }

  private findCustomerVatProfile(
    config: InvoiceCustomerInvoiceDefaults,
    customer: Record<string, any>,
  ): InvoiceCustomerVatProfile | null {
    const rawCode = this.customerConfiguredValue(customer, config.vatProfileSourceField);
    const code = this.stringValue(rawCode || config.defaultVatProfileCode).toUpperCase();
    const profiles = config.vatProfiles || [];
    return profiles.find((profile) => this.stringValue(profile.code).toUpperCase() === code)
      || profiles.find((profile) => this.stringValue(profile.code).toUpperCase() === this.stringValue(config.defaultVatProfileCode).toUpperCase())
      || profiles[0]
      || null;
  }

  private renderCustomerTemplate(template: string, customer: Record<string, any>): string {
    return this.stringValue(template).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, token) => {
      const value = this.customerTemplateValue(customer, token);
      return value === undefined || value === null ? '' : String(value).trim();
    }).replace(/\s+/g, ' ').trim();
  }

  private customerTemplateValue(customer: Record<string, any>, token: string): any {
    const normalized = this.stringValue(token);
    const aliases: Record<string, () => any> = {
      numeroCliente: () => customer?.['numeroCliente'] || this.customerValue(customer, 'customerId'),
      codiceCliente: () => customer?.['numeroCliente'] || this.customerValue(customer, 'customerId'),
      ragioneSociale: () => this.global.getRecordDisplayName('customer', customer) || this.customerValue(customer, 'customerTitle'),
      cliente: () => this.global.getRecordDisplayName('customer', customer) || this.customerValue(customer, 'customerTitle'),
      partitaIva: () => this.customerValue(customer, 'customerVatNumber'),
      codiceFiscale: () => this.customerValue(customer, 'customerFiscalCode'),
      indirizzo: () => this.customerValue(customer, 'customerAddress'),
      comune: () => this.customerValue(customer, 'customerCity'),
      provincia: () => this.customerValue(customer, 'customerProvince'),
      cap: () => this.customerValue(customer, 'customerZip'),
      nazione: () => this.customerValue(customer, 'customerCountry'),
    };
    return aliases[normalized]?.() ?? this.customerConfiguredValue(customer, normalized);
  }

  private customerConfiguredValue(customer: Record<string, any>, keyOrRole: string): any {
    const key = this.stringValue(keyOrRole);
    if (!key) return '';
    const byRole = this.global.getRecordValueByRole('customer', customer, key);
    if (byRole !== undefined && byRole !== null && String(byRole).trim() !== '') return byRole;
    const byKnownRole = this.customerValue(customer, key);
    if (byKnownRole !== undefined && byKnownRole !== null && String(byKnownRole).trim() !== '') return byKnownRole;
    if (customer[key] !== undefined && customer[key] !== null && String(customer[key]).trim() !== '') return customer[key];
    return key.split('.').reduce<any>((value, part) => value?.[part], customer);
  }

  private applyCustomerToInvoice(customer: Record<string, any>): void {
    const recipientType = this.normalizeRecipientType(this.customerValue(customer, 'customerRecipientType'));
    const firstName = this.stringValue(this.customerValue(customer, 'customerFirstName'));
    const lastName = this.stringValue(this.customerValue(customer, 'customerLastName'));
    const displayName = this.stringValue(
      this.global.getRecordDisplayName('customer', customer) ||
      this.customerValue(customer, 'customerTitle'),
    );
    this.selected.customerId = this.stringValue(customer?.['numeroCliente'] || this.customerValue(customer, 'customerId'));
    this.selected.customerRecipientType = recipientType;
    this.selected.customerName = displayName || [firstName, lastName].filter(Boolean).join(' ');
    this.selected.customerVatNumber = this.normalizeVatForInvoice(this.customerValue(customer, 'customerVatNumber'));
    this.selected.customerFiscalCode = this.stringValue(this.customerValue(customer, 'customerFiscalCode')).toUpperCase();
    this.selected.customerPec = this.stringValue(this.customerValue(customer, 'customerPec'));
    this.selected.customerEmail = this.stringValue(this.customerValue(customer, 'customerEmail'));
    this.selected.customerAddress = this.stringValue(this.customerValue(customer, 'customerAddress'));
    this.selected.customerCity = this.stringValue(this.customerValue(customer, 'customerCity'));
    this.selected.customerProvince = this.stringValue(this.customerValue(customer, 'customerProvince')).toUpperCase();
    this.selected.customerZip = this.onlyDigits(this.customerValue(customer, 'customerZip'));
    this.selected.customerCountry = this.stringValue(this.customerValue(customer, 'customerCountry') || 'IT').toUpperCase();
    const sdiCode = this.stringValue(this.customerValue(customer, 'customerSdiCode')).toUpperCase();
    this.selected.customerSdiCode = sdiCode || this.defaultSdiForCountry(this.selected.customerCountry);
  }

  private applyCustomerToDdt(customer: Record<string, any>): void {
    const name = this.stringValue(
      this.global.getRecordDisplayName('customer', customer) ||
      this.customerValue(customer, 'customerTitle'),
    );
    const address = this.stringValue(this.customerValue(customer, 'customerAddress'));
    const city = this.stringValue(this.customerValue(customer, 'customerCity'));
    const province = this.stringValue(this.customerValue(customer, 'customerProvince')).toUpperCase();
    const zip = this.onlyDigits(this.customerValue(customer, 'customerZip'));
    const country = this.stringValue(this.customerValue(customer, 'customerCountry') || 'IT').toUpperCase();

    this.selectedDdt.customerId = this.stringValue(customer?.['numeroCliente'] || this.customerValue(customer, 'customerId'));
    this.selectedDdt.customerName = name;
    this.selectedDdt.customerVatNumber = this.normalizeVatForInvoice(this.customerValue(customer, 'customerVatNumber'));
    this.selectedDdt.customerFiscalCode = this.stringValue(this.customerValue(customer, 'customerFiscalCode')).toUpperCase();
    this.selectedDdt.customerAddress = address;
    this.selectedDdt.customerCity = city;
    this.selectedDdt.customerProvince = province;
    this.selectedDdt.customerZip = zip;
    this.selectedDdt.customerCountry = country;
    this.selectedDdt.destinationAddress = address;
    this.selectedDdt.destinationCity = city;
    this.selectedDdt.destinationProvince = province;
    this.selectedDdt.destinationZip = zip;
    this.selectedDdt.destinationCountry = country;
  }

  private customerValue(customer: Record<string, any>, role: string): any {
    const byRole = this.global.getRecordValueByRole('customer', customer, role);
    if (byRole !== undefined && byRole !== null && String(byRole).trim() !== '') return byRole;
    const fallbackKeys: Record<string, string[]> = {
      customerTitle: ['ragioneSociale', 'denominazione', 'nome', 'name'],
      customerId: ['numeroCliente', 'customerId'],
      customerRecipientType: ['tipoAnagrafica', 'tipoCliente', 'recipientType', 'customerRecipientType'],
      customerRole: ['ruoloAnagrafica', 'ruoloCliente', 'customerRole'],
      customerFirstName: ['nomePrivato', 'firstName', 'nomePersona'],
      customerLastName: ['cognomePrivato', 'lastName', 'cognomePersona'],
      customerVatNumber: ['partitaIva', 'piva', 'vatNumber', 'customerVatNumber'],
      customerFiscalCode: ['codiceFiscale', 'fiscalCode', 'customerFiscalCode'],
      customerSdiCode: ['codiceSdi', 'sdiCode', 'customerSdiCode'],
      customerPec: ['pec', 'customerPec'],
      customerEmail: ['email', 'mail'],
      customerAddress: ['indirizzo', 'address', 'customerAddress'],
      customerCity: ['comune', 'city', 'customerCity'],
      customerProvince: ['provincia', 'province', 'customerProvince'],
      customerZip: ['cap', 'zip', 'customerZip'],
      customerCountry: ['nazione', 'country', 'customerCountry'],
      customerInvoiceAmount: ['importoFattura', 'importo', 'canone', 'invoiceAmount', 'customerInvoiceAmount'],
      customerVatProfile: ['tipoIva', 'profiloIva', 'iva', 'vatProfile', 'invoiceVatProfile', 'customerVatProfile'],
    };
    for (const key of fallbackKeys[role] || []) {
      if (customer[key] !== undefined && customer[key] !== null && String(customer[key]).trim() !== '') {
        return customer[key];
      }
    }
    return '';
  }

  private findSelectedCustomerCode(invoice: Invoice): string {
    const normalizedVat = this.onlyDigits(invoice.customerVatNumber);
    const normalizedFiscalCode = this.stringValue(invoice.customerFiscalCode).toUpperCase();
    const normalizedName = this.stringValue(invoice.customerName).toLowerCase();
    return this.customers.find((customer) => {
      const vat = this.onlyDigits(this.customerValue(customer.raw, 'customerVatNumber'));
      const fiscalCode = this.stringValue(this.customerValue(customer.raw, 'customerFiscalCode')).toUpperCase();
      const name = this.stringValue(this.global.getRecordDisplayName('customer', customer.raw)).toLowerCase();
      return (
        (normalizedVat && vat === normalizedVat) ||
        (normalizedFiscalCode && fiscalCode === normalizedFiscalCode) ||
        (normalizedName && name === normalizedName)
      );
    })?.numeroCliente || '';
  }

  private findSelectedDdtCustomerCode(ddt: DeliveryNote): string {
    const normalizedVat = this.onlyDigits(ddt.customerVatNumber);
    const normalizedFiscalCode = this.stringValue(ddt.customerFiscalCode).toUpperCase();
    const normalizedName = this.stringValue(ddt.customerName).toLowerCase();
    return this.customers.find((customer) => {
      const vat = this.onlyDigits(this.customerValue(customer.raw, 'customerVatNumber'));
      const fiscalCode = this.stringValue(this.customerValue(customer.raw, 'customerFiscalCode')).toUpperCase();
      const name = this.stringValue(this.global.getRecordDisplayName('customer', customer.raw)).toLowerCase();
      return (
        (normalizedVat && vat === normalizedVat) ||
        (normalizedFiscalCode && fiscalCode === normalizedFiscalCode) ||
        (normalizedName && name === normalizedName)
      );
    })?.numeroCliente || '';
  }

  private withInvoiceDefaults(invoice: Partial<Invoice> = {}): Invoice {
    const lines = invoice.lines?.length
      ? invoice.lines.map((line) => this.withLineDefaults(line))
      : [this.emptyLine()];
    return {
      ...this.emptyInvoice(),
      ...invoice,
      customerRecipientType: invoice.customerRecipientType || 'business',
      customerEmail: invoice.customerEmail || '',
      paymentTermId: invoice.paymentTermId ?? null,
      bankAccountId: invoice.bankAccountId ?? null,
      lines,
      payments: invoice.payments || [],
      installments: invoice.installments || [],
    };
  }

  private withDdtDefaults(ddt: Partial<DeliveryNote> = {}): DeliveryNote {
    const lines = ddt.lines?.length
      ? ddt.lines.map((line) => ({ ...this.withLineDefaults(line), unit: line.unit || 'pz' }))
      : [this.emptyDdtLine()];
    return {
      ...this.emptyDdt(),
      ...ddt,
      lines,
    };
  }

  private withLineDefaults(line: Partial<InvoiceLine> = {}): InvoiceLine {
    const unitPrice = Number(line.unitPrice ?? 0);
    const unitPriceInput = line.unitPriceInput === undefined || line.unitPriceInput === null
      ? unitPrice
      : Number(line.unitPriceInput || 0);
    return {
      ...this.emptyLine(),
      ...line,
      serviceCode: this.stringValue(line.serviceCode).toUpperCase(),
      unit: line.unit || 'pz',
      unitPrice,
      unitPriceInput,
      priceIncludesVat: !!line.priceIncludesVat,
      vatNature: this.stringValue(line.vatNature).toUpperCase(),
    };
  }

  private stringValue(value: any): string {
    return String(value ?? '').trim();
  }

  private onlyDigits(value: any): string {
    return this.stringValue(value).replace(/\D/g, '');
  }

  private normalizeVatForInvoice(value: any): string {
    const normalized = this.stringValue(value).toUpperCase().replace(/\s+/g, '');
    if (/^[A-Z]{2}/.test(normalized) && !normalized.startsWith('IT')) return normalized;
    return normalized.replace(/^IT/, '').replace(/\D/g, '');
  }

  private normalizeRecipientType(value: any): 'business' | 'pa' | 'private' {
    const normalized = this.normalizeSearch(value);
    if (normalized.includes('pubblic') || normalized === 'pa') return 'pa';
    if (normalized.includes('privato') || normalized.includes('persona') || normalized === 'private') return 'private';
    return 'business';
  }

  private defaultSdiForCountry(country: string): string {
    const normalizedCountry = this.stringValue(country || 'IT').toUpperCase();
    return normalizedCountry === 'IT' ? '0000000' : 'XXXXXXX';
  }

  private normalizeSearch(value: any): string {
    return this.stringValue(value)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  }

  private errorText(err: any): string {
    const details = err?.error?.details;
    if (Array.isArray(details)) return details.join('\n');
    if (details && typeof details === 'object') return JSON.stringify(details);
    return err?.error?.error || details || 'Operazione non riuscita';
  }
}
