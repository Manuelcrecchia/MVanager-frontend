import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';

interface InvoiceLine {
  id?: number;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
  vatNature: string;
  lineSubtotal?: number;
  lineVat?: number;
  lineTotal?: number;
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
  xmlFilename?: string;
  lastProviderSyncAt?: string;
  lines: InvoiceLine[];
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

@Component({
  selector: 'app-invoices',
  templateUrl: './invoices.component.html',
  styleUrl: './invoices.component.css',
})
export class InvoicesComponent implements OnInit {
  invoices: Invoice[] = [];
  selected: Invoice = this.emptyInvoice();
  events: InvoiceEvent[] = [];
  xmlPreview = '';
  loading = false;
  saving = false;
  error = '';
  success = '';
  search = '';
  statusFilter = '';
  directionFilter = 'outbound';

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

  readonly paymentMethods = [
    { key: '', label: 'Non indicato' },
    { key: 'MP05', label: 'Bonifico' },
    { key: 'MP01', label: 'Contanti' },
    { key: 'MP08', label: 'Carta' },
    { key: 'MP12', label: 'RIBA' },
  ];

  constructor(
    private http: HttpClient,
    public global: GlobalService,
  ) {}

  ngOnInit(): void {
    if (!this.global.isFeatureAvailableInApp('invoices')) {
      this.error = 'Modulo fatture non ancora disponibile.';
      return;
    }

    this.loadInvoices();
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
    };
  }

  emptyLine(): InvoiceLine {
    return {
      description: '',
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      vatRate: 22,
      vatNature: '',
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

  newInvoice(): void {
    this.selected = this.emptyInvoice();
    this.events = [];
    this.xmlPreview = '';
    this.loadNextNumber();
  }

  loadNextNumber(): void {
    this.http
      .get<{ number: string }>(
        this.global.url + `invoices/next-number?year=${this.selected.year}&series=${encodeURIComponent(this.selected.series || '')}`,
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
        this.selected = {
          ...this.emptyInvoice(),
          ...res,
          lines: res.lines?.length ? res.lines : [this.emptyLine()],
        };
        this.xmlPreview = '';
        this.loadEvents();
      },
      error: (err) => {
        this.error = err?.error?.error || 'Errore apertura fattura';
      },
    });
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

  totals(): { subtotal: number; vatTotal: number; total: number } {
    const base = this.selected.lines.reduce(
      (acc, line) => {
        const quantity = Number(line.quantity || 0);
        const unitPrice = Number(line.unitPrice || 0);
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

  save(): void {
    this.saving = true;
    this.error = '';
    this.success = '';
    const endpoint = this.selected.id ? 'edit' : 'add';
    this.http.post<Invoice>(this.global.url + 'invoices/' + endpoint, this.selected).subscribe({
      next: (res) => {
        this.selected = { ...res, lines: res.lines?.length ? res.lines : [this.emptyLine()] };
        this.saving = false;
        this.success = 'Fattura salvata';
        this.loadInvoices();
        this.loadEvents();
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
    this.runInvoiceAction('send', 'Fattura inviata ad Aruba');
  }

  sync(): void {
    this.runInvoiceAction('sync', 'Stato sincronizzato');
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

  importPassive(): void {
    this.saving = true;
    this.error = '';
    this.success = '';
    this.http.post<any>(this.global.url + 'invoices/import-passive', {}).subscribe({
      next: (res) => {
        this.saving = false;
        this.success = `Import passive completato: ${res?.imported || 0} importate, ${res?.skipped || 0} gia presenti`;
        this.directionFilter = 'inbound';
        this.loadInvoices();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  markPaid(): void {
    this.runInvoiceAction('mark-paid', 'Fattura segnata come pagata');
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

  canEdit(): boolean {
    return !this.selected.id || ['draft', 'rejected'].includes(this.selected.status);
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
    };
    return labels[status] || status || '-';
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
        if (res?.id) this.selected = { ...res, lines: res.lines?.length ? res.lines : [this.emptyLine()] };
        after?.(res);
        this.success = message;
        this.loadInvoices();
        this.loadEvents();
      },
      error: (err) => {
        this.saving = false;
        this.error = this.errorText(err);
      },
    });
  }

  private round(value: number): number {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  private errorText(err: any): string {
    const details = err?.error?.details;
    if (Array.isArray(details)) return details.join('\n');
    if (details && typeof details === 'object') return JSON.stringify(details);
    return err?.error?.error || details || 'Operazione non riuscita';
  }
}
