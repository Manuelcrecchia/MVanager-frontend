import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { CustomerModelService } from '../../service/customer-model.service';
import { Component, Input } from '@angular/core';
import { saveAs } from 'file-saver';
import { forkJoin, Subscription } from 'rxjs';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { NoteUnreadService } from '../../service/note-unread.service';
import { resolveCustomerTaxIdentifiers } from '../customer-tax-id.util';
import { SocketService } from '../../service/soket.service';

@Component({
  selector: 'app-list-customer',
  templateUrl: './list-customer.component.html',
  styleUrl: './list-customer.component.css',
})
export class ListCustomerComponent {
  customers: any[] = [];
  customersFrEnd: any[] = [];
  employeeCategories: any[] = [];
  vehicleCategories: any[] = [];
  equipmentCategories: any[] = [];
  requirementCustomer: any | null = null;
  requirementCounts: { [categoryId: number]: number } = {};
  vehicleRequirementCounts: { [categoryId: number]: number } = {};
  equipmentRequirementCounts: { [categoryId: number]: number } = {};
  customerSearch = '';
  customerSort: 'alphabetical' | 'numberAsc' | 'numberDesc' = 'alphabetical';
  archiveReminderCustomerId = '';
  showArchived = false;
  profileCustomer: any | null = null;
  invoiceProfile: any = this.emptyInvoiceProfile();
  invoiceProfileLoading = false;
  invoiceProfileSaving = false;
  invoiceProfileError = '';
  invoiceProfilePaymentTerms: any[] = [];
  invoiceProfileBankAccounts: any[] = [];
  invoiceProfileBillingFieldMap: Record<string, string> = {};
  readonly vatNatures = ['', 'N1', 'N2.1', 'N2.2', 'N3.1', 'N3.2', 'N3.3', 'N3.4', 'N3.5', 'N3.6', 'N4', 'N5', 'N6.1', 'N6.2', 'N6.3', 'N6.4', 'N6.5', 'N6.6', 'N6.7', 'N6.8', 'N6.9', 'N7'];
  readonly vatLegalReferences: Record<string, string> = { N1: 'Art. 15 DPR 633/1972', 'N2.1': 'Artt. da 7 a 7-septies DPR 633/1972', 'N2.2': 'Operazione non soggetta ad IVA - altri casi', 'N3.1': 'Art. 8 DPR 633/1972', 'N3.2': 'Art. 41 DL 331/1993', 'N3.3': 'Art. 71 DPR 633/1972', 'N3.4': 'Art. 8-bis DPR 633/1972', 'N3.5': 'Art. 8, comma 1, lett. c), DPR 633/1972', 'N3.6': 'Operazione non imponibile - altri casi', N4: 'Art. 10 DPR 633/1972', N5: 'Art. 36 DL 41/1995', 'N6.1': 'Art. 74, commi 7 e 8, DPR 633/1972', 'N6.2': 'Art. 17, comma 5, DPR 633/1972', 'N6.3': 'Art. 17, comma 6, lett. a), DPR 633/1972', 'N6.4': 'Art. 17, comma 6, lett. a-bis), DPR 633/1972', 'N6.5': 'Art. 17, comma 6, lett. b), DPR 633/1972', 'N6.6': 'Art. 17, comma 6, lett. c), DPR 633/1972', 'N6.7': 'Art. 17, comma 6, lett. a-ter), DPR 633/1972', 'N6.8': 'Art. 17, comma 6, lett. d-bis), d-ter) e d-quater, DPR 633/1972', 'N6.9': 'Inversione contabile - altri casi', N7: 'IVA assolta in altro Stato UE' };
  private customerRealtimeSubscription?: Subscription;

  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router,
    private route: ActivatedRoute,
    private customerModelService: CustomerModelService,
    private appDialog: PopupServiceService,
    public noteUnread: NoteUnreadService,
    private socketService: SocketService,
  ) {}

  ngOnInit(): void {
    this.noteUnread.start();
    this.archiveReminderCustomerId = String(this.route.snapshot.queryParamMap.get('archiveReminder') || '').trim();
    if (this.archiveReminderCustomerId) {
      this.customerSearch = this.archiveReminderCustomerId;
    }
    this.getCustomers();
    this.customerRealtimeSubscription = this.socketService
      .onResourceChanges('customers')
      .subscribe(() => this.getCustomers(true));
    if (this.globalService.hasPermission('EMPLOYEE_VIEW')) {
      this.getEmployeeCategories();
    }
    if (this.globalService.hasPermission('VEHICLES_VIEW')) {
      this.getVehicleCategories();
    }
    if (this.globalService.hasPermission('EQUIPMENT_VIEW')) {
      this.getEquipmentCategories();
    }
  }

  ngOnDestroy(): void {
    this.customerRealtimeSubscription?.unsubscribe();
  }

  getEmployeeCategories(): void {
    this.http
      .get<any[]>(this.globalService.url + 'admin/employee-categories', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (categories) => {
          this.employeeCategories = Array.isArray(categories) ? categories : [];
        },
        error: (err) => {
          console.error('Errore categorie dipendenti:', err);
          this.employeeCategories = [];
        },
      });
  }

  getVehicleCategories(): void {
    this.http
      .get<any[]>(this.globalService.url + 'admin/resource-categories/vehicle', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (categories) => {
          this.vehicleCategories = Array.isArray(categories) ? categories : [];
        },
        error: (err) => {
          console.error('Errore categorie mezzi:', err);
          this.vehicleCategories = [];
        },
      });
  }

  getEquipmentCategories(): void {
    this.http
      .get<any[]>(this.globalService.url + 'admin/resource-categories/equipment', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (categories) => {
          this.equipmentCategories = Array.isArray(categories) ? categories : [];
        },
        error: (err) => {
          console.error('Errore categorie attrezzature:', err);
          this.equipmentCategories = [];
        },
      });
  }

  getCustomers(silent = false): void {
    const url = this.globalService.url + `customers/getAll${this.showArchived ? '?includeArchived=true' : ''}`;
    this.http
      .get(url, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (response) => {
          try {
            const data = JSON.parse(response);
            this.customers = Array.isArray(data) ? data : [];
            this.applyCustomerSearch();
          } catch (err) {
            console.error('Errore nel parse JSON dei clienti:', err);
          }
        },
        error: (err) => {
          console.error('Errore nel recupero clienti:', err);
          if (!silent) alert('Errore durante il caricamento dei clienti');
        },
      });
  }

  toggleShowArchived(): void {
    this.showArchived = !this.showArchived;
    if (!this.showArchived && this.archiveReminderCustomerId) {
      this.archiveReminderCustomerId = '';
      this.customerSearch = '';
    }
    this.getCustomers();
  }

  private normalize(s: string): string {
    return (s || '')
      .normalize('NFD') // separa lettere e accenti
      .replace(/\p{Diacritic}/gu, '') // elimina diacritici (es. è -> e)
      .toLowerCase()
      .trim();
  }

  searchNumeroCliente(v: string): void {
    const q = this.normalize(v);
    const filtered = q
      ? this.customers.filter((c) =>
          this.normalize(c?.numeroCliente?.toString()).startsWith(q),
        )
      : [...this.customers];
    this.customersFrEnd = this.sortCustomers(filtered);
  }

  searchNominativo(v: string): void {
    const q = this.normalize(v);
    const filtered = q
      ? this.customers.filter((c) =>
          this.normalize(this.getCustomerDisplayName(c)).includes(q),
        )
      : [...this.customers];
    this.customersFrEnd = this.sortCustomers(filtered);
  }

  applyCustomerSearch(): void {
    const q = this.normalize(this.customerSearch);
    const filtered = q
      ? this.customers.filter((customer) =>
          this.normalize(this.getCustomerSearchText(customer)).includes(q),
        )
      : [...this.customers];
    this.customersFrEnd = this.sortCustomers(filtered);
  }

  changeCustomerSort(): void {
    this.applyCustomerSearch();
  }

  private sortCustomers(customers: any[]): any[] {
    const compareNumbers = (left: any, right: any): number => {
      const leftValue = String(left?.numeroCliente ?? '').trim();
      const rightValue = String(right?.numeroCliente ?? '').trim();
      const leftNumber = Number(leftValue);
      const rightNumber = Number(rightValue);
      const bothNumeric = leftValue !== '' && rightValue !== '' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
      return bothNumeric
        ? leftNumber - rightNumber
        : leftValue.localeCompare(rightValue, 'it', { numeric: true, sensitivity: 'base' });
    };

    return [...customers].sort((left, right) => {
      if (this.customerSort === 'numberAsc') return compareNumbers(left, right);
      if (this.customerSort === 'numberDesc') return compareNumbers(right, left);

      const leftName = String(this.getCustomerDisplayName(left) || '').trim();
      const rightName = String(this.getCustomerDisplayName(right) || '').trim();
      if (!leftName && rightName) return 1;
      if (leftName && !rightName) return -1;
      return leftName.localeCompare(rightName, 'it', { numeric: true, sensitivity: 'base' }) || compareNumbers(left, right);
    });
  }

  clearCustomerSearch(): void {
    this.customerSearch = '';
    this.archiveReminderCustomerId = '';
    this.applyCustomerSearch();
  }

  isArchiveReminderCustomer(customer: any): boolean {
    return !!this.archiveReminderCustomerId &&
      String(customer?.numeroCliente || '') === String(this.archiveReminderCustomerId);
  }

  private getCustomerSearchText(customer: any): string {
    return [
      customer?.numeroCliente,
      this.getCustomerDisplayName(customer),
      this.getCustomerEmail(customer),
      this.getCustomerPhone(customer),
    ].join(' ');
  }

  getCustomerDisplayName(customer: any): string {
    return this.globalService.getRecordDisplayName('customer', customer);
  }

  getCustomerEmail(customer: any): string {
    return String(
      this.globalService.getRecordValueByRole?.('customer', customer, 'customerEmail') || '',
    ).trim();
  }

  getCustomerPhone(customer: any): string {
    return String(
      this.globalService.getRecordValueByRole?.('customer', customer, 'customerPhone') || '',
    ).trim();
  }

  navigateToEditCustomer(numeroCliente: string): void {
    const body = { numeroCliente };

    this.http
      .post(this.globalService.url + 'customers/getCustomer', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (response) => {
        if (response === 'Unauthorized') {
          this.router.navigateByUrl('/');
        } else {
          const cliente = JSON.parse(response)[0];
          this.customerModelService.reset();
          Object.assign(this.customerModelService as any, cliente);

          this.router.navigateByUrl('/editCustomer');
        }
        },
        error: (err) => {
          console.error('Errore nel recupero cliente:', err);
          alert('Errore durante il caricamento del cliente');
        },
      });
  }

  async archiveCustomer(customer: any): Promise<void> {
    if (
      !await this.appDialog.confirm(
        `Vuoi scaricare l'archivio completo e archiviare il cliente "${this.getCustomerDisplayName(customer) || customer.numeroCliente}"?`,
      )
    )
      return;

    const body = {
      numeroCliente: customer.numeroCliente,
    };

    this.http
      .post(this.globalService.url + 'customers/archive', body, {
        headers: this.globalService.headers,
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          const nomeFile = `archivio_cliente_${customer.numeroCliente}.zip`;
          saveAs(blob, nomeFile);

          alert('Archivio cliente scaricato e cliente archiviato con successo.');
          this.customers = this.customers.filter(
            (item) => String(item?.numeroCliente) !== String(customer.numeroCliente),
          );
          this.applyCustomerSearch();
        },
        error: (err) => {
          console.error("Errore durante l'archiviazione cliente:", err);
          alert("Errore durante il download o l'archiviazione del cliente.");
        },
      });
  }

  async archiveOnlyCustomer(customer: any): Promise<void> {
    if (!await this.appDialog.confirm(`Archiviare il cliente "${this.getCustomerDisplayName(customer) || customer.numeroCliente}" senza scaricare lo ZIP?`)) return;

    this.http
      .post(this.globalService.url + 'customers/archiveOnly', { numeroCliente: customer.numeroCliente }, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: () => {
          alert('Cliente archiviato.');
          this.customers = this.customers.filter(
            (item) => String(item?.numeroCliente) !== String(customer.numeroCliente),
          );
          this.applyCustomerSearch();
        },
        error: (err) => {
          console.error("Errore durante l'archiviazione cliente:", err);
          alert("Errore durante l'archiviazione del cliente.");
        },
      });
  }

  async unarchiveCustomer(customer: any): Promise<void> {
    if (!await this.appDialog.confirm(`Riattivare il cliente "${this.getCustomerDisplayName(customer) || customer.numeroCliente}"?`)) return;

    this.http
      .post(this.globalService.url + 'customers/unarchive', { numeroCliente: customer.numeroCliente }, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: () => {
          alert('Cliente riattivato.');
          this.getCustomers();
        },
        error: (err) => {
          console.error('Errore durante la riattivazione cliente:', err);
          alert('Errore durante la riattivazione del cliente.');
        },
      });
  }

  applyFiltro(valore: string): void {
    this.applyCustomerSearch();
  }

  navigateToAddCustomer() {
    this.router.navigateByUrl('/homeAdmin/addCustomer');
  }

  canGenerateSalesInvoice(customer: any): boolean {
    return customer?.active !== false &&
      this.globalService.isFeatureAvailableInApp('invoices') &&
      this.globalService.hasPermission('INVOICES_MANAGE');
  }

  generateSalesInvoice(customer: any): void {
    const numeroCliente = String(customer?.numeroCliente || '').trim();
    if (!numeroCliente) return;
    this.router.navigate(['/homeAdmin/invoices'], {
      queryParams: {
        view: 'invoices',
        direction: 'outbound',
        fromCustomer: '1',
        customerId: numeroCliente,
      },
    });
  }

  manageInvoiceProfile(customer: any): void {
    const id = String(customer?.numeroCliente || '').trim();
    if (!id) return;
    this.profileCustomer = customer;
    this.invoiceProfile = this.emptyInvoiceProfile();
    this.invoiceProfileError = '';
    this.invoiceProfileLoading = true;
    forkJoin({
      profile: this.http.get<any>(`${this.globalService.url}invoices/customer-profile/${encodeURIComponent(id)}`),
      settings: this.http.get<any>(`${this.globalService.url}invoices/settings`),
    }).subscribe({
      next: ({ profile, settings }) => {
        this.invoiceProfile = this.normalizeInvoiceProfile(profile);
        const mapped = this.globalService.getEffectiveCustomerAddressFields('billing') as any;
        this.invoiceProfileBillingFieldMap = ['address', 'city', 'province', 'zip', 'country'].reduce((result: Record<string, string>, part) => {
          const fieldKey = String(mapped?.[part] || '').trim();
          if (fieldKey) {
            result[part] = fieldKey;
            const customerValue = this.profileCustomer?.[fieldKey];
            if (customerValue !== undefined && customerValue !== null && String(customerValue).trim()) this.invoiceProfile.billing[part] = customerValue;
          }
          return result;
        }, {});
        this.invoiceProfilePaymentTerms = (settings?.paymentTerms || []).filter((item: any) => item.active !== false);
        this.invoiceProfileBankAccounts = (settings?.bankAccounts || []).filter((item: any) => item.active !== false);
        this.invoiceProfileLoading = false;
      },
      error: (err) => { this.invoiceProfileError = err?.error?.error || 'Errore nel caricamento del profilo.'; this.invoiceProfileLoading = false; },
    });
  }

  closeInvoiceProfile(): void { this.profileCustomer = null; this.invoiceProfileError = ''; }
  addInvoiceProfileLine(kind: 'fixedLines' | 'variableLines'): void { this.invoiceProfile[kind].push(this.emptyInvoiceProfileLine(kind === 'variableLines')); }
  removeInvoiceProfileLine(kind: 'fixedLines' | 'variableLines', index: number): void { this.invoiceProfile[kind].splice(index, 1); }
  onInvoiceProfileVatRateChange(line: any): void { if (+line.vatRate !== 0) { line.vatNature = ''; line.vatLegalReference = ''; } }
  onInvoiceProfileNatureChange(line: any): void { const n = String(line.vatNature || '').toUpperCase(); if (n && (!line.vatLegalReference || Object.values(this.vatLegalReferences).includes(line.vatLegalReference))) line.vatLegalReference = this.vatLegalReferences[n] || ''; }
  onInvoiceProfileSplitChange(): void { if (this.invoiceProfile.header.splitPayment) this.invoiceProfile.header.vatExigibility = 'S'; }
  onInvoiceProfilePensionVatChange(): void { if (+this.invoiceProfile.header.pensionFundVatRate !== 0) { this.invoiceProfile.header.pensionFundVatNature = ''; this.invoiceProfile.header.pensionFundLegalReference = ''; } }
  onInvoiceProfilePensionNatureChange(): void { const nature = String(this.invoiceProfile.header.pensionFundVatNature || '').toUpperCase(); if (nature && (!this.invoiceProfile.header.pensionFundLegalReference || Object.values(this.vatLegalReferences).includes(this.invoiceProfile.header.pensionFundLegalReference))) this.invoiceProfile.header.pensionFundLegalReference = this.vatLegalReferences[nature] || ''; }
  onInvoiceProfilePaymentTermChange(): void { const term = this.invoiceProfilePaymentTerms.find((item: any) => item.id === Number(this.invoiceProfile.paymentTermId)); if (term?.method) this.invoiceProfile.paymentMethod = term.method; }
  onInvoiceProfileBankChange(): void { const bank = this.invoiceProfileBankAccounts.find((item: any) => item.id === Number(this.invoiceProfile.bankAccountId)); if (bank?.iban) this.invoiceProfile.paymentIban = bank.iban; }
  onInvoiceProfileReferenceTypeChange(): void { if (this.invoiceProfile.header.paReferenceType) return; Object.assign(this.invoiceProfile.header, { paDocumentId: '', paDocumentDate: '', paItemNumber: '', paConventionCode: '', paCup: '', paCig: '' }); }
  invoiceProfileFieldError(field: string, line?: any): string {
    const header = this.invoiceProfile?.header || {};
    const billing = this.invoiceProfile?.billing || {};
    const text = (value: any) => String(value ?? '').trim();
    const country = text(billing.country || 'IT').toUpperCase();
    const recipientType = text(header.customerRecipientType || 'business');
    const vat = text(this.invoiceProfileCustomerValue('customerVatNumber')).replace(/^IT/i, '').replace(/\D/g, '');
    const fiscalCode = text(this.invoiceProfileCustomerValue('customerFiscalCode')).toUpperCase();
    const sdi = text(this.invoiceProfileCustomerValue('customerSdiCode')).toUpperCase();
    const hasReference = ['paDocumentId', 'paDocumentDate', 'paItemNumber', 'paConventionCode', 'paCup', 'paCig'].some((key) => !!text(header[key]));

    if (line) {
      if (field === 'description') return text(line.description) ? '' : 'Descrizione obbligatoria';
      if (field === 'quantity') return Number(line.quantity || 0) > 0 ? '' : 'La quantità deve essere maggiore di zero';
      if (field === 'priceField') return line.priceSource !== 'customerField' || text(line.priceField) ? '' : 'Seleziona il campo cliente da usare come prezzo';
      if (field === 'discount') return Number(line.discountPercent || 0) >= 0 && Number(line.discountPercent || 0) <= 100 ? '' : 'Sconto compreso tra 0 e 100';
      if (field === 'vatNature') return Number(line.vatRate || 0) !== 0 || text(line.vatNature) ? '' : 'Natura obbligatoria con IVA zero';
      if (field === 'vatLegalReference') return Number(line.vatRate || 0) !== 0 || text(line.vatLegalReference) ? '' : 'Riferimento normativo obbligatorio';
      return '';
    }

    switch (field) {
      case 'recipientVat':
        if (!vat && !fiscalCode) return 'Nel cliente manca Partita IVA o Codice fiscale';
        return country === 'IT' && vat && !this.isValidItalianVatNumber(vat) ? 'Partita IVA italiana non valida' : '';
      case 'recipientFiscalCode':
        if (recipientType === 'private' && !fiscalCode) return 'Codice fiscale obbligatorio per il privato';
        return fiscalCode && !/^(?:\d{11}|[A-Z0-9]{16})$/.test(fiscalCode) ? 'Codice fiscale non valido: 11 cifre o 16 caratteri' : '';
      case 'recipientSdi':
        if (recipientType === 'private') return '';
        if (recipientType === 'pa') return /^[A-Z0-9]{6}$/.test(sdi) ? '' : 'Nel cliente manca un Codice ufficio PA valido di 6 caratteri';
        if (country !== 'IT') return !sdi || sdi === 'XXXXXXX' ? '' : 'Per un cliente estero usa XXXXXXX';
        return !sdi || /^[A-Z0-9]{7}$/.test(sdi) ? '' : 'Codice SDI non valido: servono 7 caratteri';
      case 'paReferenceType': return hasReference && !text(header.paReferenceType) ? 'Seleziona il tipo di riferimento' : '';
      case 'paDocumentId': return hasReference && !text(header.paDocumentId) ? 'Numero documento obbligatorio con CUP, CIG o altri riferimenti' : '';
      case 'paCup': return !text(header.paCup) || /^[A-Z0-9]{1,15}$/i.test(text(header.paCup)) ? '' : 'CUP: massimo 15 caratteri alfanumerici';
      case 'paCig': return !text(header.paCig) || /^[A-Z0-9]{1,15}$/i.test(text(header.paCig)) ? '' : 'CIG: massimo 15 caratteri alfanumerici';
      case 'billingAddress': return text(billing.address) ? '' : 'Indirizzo obbligatorio';
      case 'billingCity': return text(billing.city) ? '' : 'Comune obbligatorio';
      case 'billingProvince': return country !== 'IT' || /^[A-Z]{2}$/.test(text(billing.province).toUpperCase()) ? '' : 'Inserisci la sigla di 2 lettere, ad esempio PE';
      case 'billingZip': return text(billing.zip) ? (country !== 'IT' || /^\d{5}$/.test(text(billing.zip)) ? '' : 'Il CAP italiano deve avere 5 cifre') : 'CAP obbligatorio';
      case 'billingCountry': return /^[A-Z]{2}$/.test(country) ? '' : 'Nazione: usa il codice di 2 lettere, ad esempio IT';
      case 'stampDutyAmount': return !header.stampDutyEnabled || Number(header.stampDutyAmount || 0) > 0 ? '' : 'Importo bollo obbligatorio';
      case 'withholdingType': return !header.withholdingEnabled || /^RT0[1-6]$/.test(text(header.withholdingType).toUpperCase()) ? '' : 'Tipo ritenuta valido da RT01 a RT06';
      case 'withholdingReason': return !header.withholdingEnabled || /^[A-Z]$/.test(text(header.withholdingReason).toUpperCase()) ? '' : 'La causale deve essere una lettera';
      case 'withholdingAmount': return !header.withholdingEnabled || Number(header.withholdingAmount || 0) > 0 ? '' : 'Importo ritenuta obbligatorio';
      case 'pensionFundType': return !header.pensionFundEnabled || /^TC(?:0[1-9]|1[0-9]|2[0-2])$/.test(text(header.pensionFundType).toUpperCase()) ? '' : 'Tipo cassa valido da TC01 a TC22';
      case 'pensionFundRate': return !header.pensionFundEnabled || Number(header.pensionFundRate || 0) > 0 ? '' : 'Aliquota cassa obbligatoria';
      case 'pensionFundAmount': return !header.pensionFundEnabled || Number(header.pensionFundAmount || 0) > 0 ? '' : 'Importo cassa obbligatorio';
      case 'pensionFundVatNature': return !header.pensionFundEnabled || Number(header.pensionFundVatRate || 0) !== 0 || text(header.pensionFundVatNature) ? '' : 'Natura IVA obbligatoria con aliquota zero';
      case 'pensionFundLegalReference': return !header.pensionFundEnabled || Number(header.pensionFundVatRate || 0) !== 0 || text(header.pensionFundLegalReference) ? '' : 'Riferimento normativo obbligatorio';
      case 'paymentIban': return !text(this.invoiceProfile.paymentIban) || /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i.test(text(this.invoiceProfile.paymentIban).replace(/\s/g, '')) ? '' : 'IBAN non valido';
      default: return '';
    }
  }
  invoiceProfileCustomerValue(role: string): string {
    if (role === 'customerVatNumber' || role === 'customerFiscalCode') {
      const taxIds = resolveCustomerTaxIdentifiers({
        recipientType: this.invoiceProfile?.header?.customerRecipientType || 'business',
        country: this.invoiceProfile?.billing?.country || 'IT',
        vatNumber: this.invoiceProfileRawCustomerValue('customerVatNumber'),
        fiscalCode: this.invoiceProfileRawCustomerValue('customerFiscalCode'),
        combinedTaxId: this.invoiceProfileRawCustomerValue('customerTaxOrVatNumber'),
      });
      return role === 'customerVatNumber' ? taxIds.vatNumber : taxIds.fiscalCode;
    }
    return this.invoiceProfileRawCustomerValue(role);
  }
  private invoiceProfileRawCustomerValue(role: string): string {
    const customer = this.profileCustomer || {};
    const mapped = this.globalService.getRecordValueByRole?.('customer', customer, role);
    if (mapped !== undefined && mapped !== null && String(mapped).trim()) return String(mapped).trim();
    const keys: Record<string, string[]> = {
      customerVatNumber: ['partitaIva', 'piva', 'vatNumber', 'customerVatNumber'],
      customerFiscalCode: ['codiceFiscale', 'fiscalCode', 'customerFiscalCode'],
      customerTaxOrVatNumber: ['cfpi', 'codiceFiscalePartitaIva', 'taxOrVatNumber', 'customerTaxOrVatNumber'],
      customerSdiCode: ['codiceSdi', 'sdiCode', 'customerSdiCode'],
    };
    for (const key of keys[role] || []) if (customer[key] !== undefined && customer[key] !== null && String(customer[key]).trim()) return String(customer[key]).trim();
    return '';
  }
  invoiceProfileHasErrors(): boolean {
    const fields = [
      'recipientVat', 'recipientFiscalCode', 'recipientSdi', 'paReferenceType', 'paDocumentId', 'paCup', 'paCig',
      'billingAddress', 'billingCity', 'billingProvince', 'billingZip', 'billingCountry',
      'stampDutyAmount', 'withholdingType', 'withholdingReason', 'withholdingAmount',
      'pensionFundType', 'pensionFundRate', 'pensionFundAmount', 'pensionFundVatNature',
      'pensionFundLegalReference', 'paymentIban',
    ];
    if (fields.some((field) => !!this.invoiceProfileFieldError(field))) return true;
    return [...(this.invoiceProfile.fixedLines || []), ...(this.invoiceProfile.variableLines || [])]
      .some((line: any) => ['description', 'quantity', 'priceField', 'discount', 'vatNature', 'vatLegalReference']
        .some((field) => !!this.invoiceProfileFieldError(field, line)));
  }
  editInvoiceProfileCustomer(): void {
    const customerId = String(this.profileCustomer?.numeroCliente || '').trim();
    this.closeInvoiceProfile();
    if (customerId) this.navigateToEditCustomer(customerId);
  }
  private isValidItalianVatNumber(value: string): boolean {
    if (!/^\d{11}$/.test(value)) return false;
    let total = 0;
    for (let index = 0; index < 11; index += 1) { let digit = Number(value[index]); if (index % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9; } total += digit; }
    return total % 10 === 0;
  }
  saveInvoiceProfile(): void {
    if (!this.profileCustomer) return;
    this.invoiceProfileSaving = true; this.invoiceProfileError = '';
    const updatedCustomer = { ...this.profileCustomer };
    Object.entries(this.invoiceProfileBillingFieldMap).forEach(([part, fieldKey]) => { updatedCustomer[fieldKey] = this.invoiceProfile.billing[part] || ''; });
    const requests: Record<string, any> = { profile: this.http.post<any>(`${this.globalService.url}invoices/customer-profile/${encodeURIComponent(this.profileCustomer.numeroCliente)}`, this.invoiceProfile) };
    if (Object.keys(this.invoiceProfileBillingFieldMap).length) requests['customer'] = this.http.post(`${this.globalService.url}customers/edit`, updatedCustomer);
    forkJoin(requests).subscribe({
      next: (result: any) => { this.invoiceProfile = this.normalizeInvoiceProfile(result.profile); this.invoiceProfileSaving = false; this.closeInvoiceProfile(); this.getCustomers(); },
      error: (err) => { this.invoiceProfileSaving = false; this.invoiceProfileError = err?.error?.error || 'Errore nel salvataggio del profilo.'; },
    });
  }
  customerProfilePriceFields(): any[] {
    return this.globalService.getFieldMappingFields('customer').filter((field: any) =>
      ['money', 'number', 'decimal', 'text'].includes(String(field?.type || '').toLowerCase()),
    );
  }
  private emptyInvoiceProfileLine(variable = false): any { return { enabled: true, description: '', unit: variable ? 'h' : 'pz', quantity: 1, unitPriceInput: 0, priceSource: 'fixed', priceField: '', discountPercent: 0, vatRate: 22, vatNature: '', vatLegalReference: '' }; }
  private emptyInvoiceProfile(): any { return { enabled: true, paymentTermId: null, bankAccountId: null, paymentMethod: '', paymentIban: '', notes: '', header: { series: '', type: 'TD01', customerRecipientType: 'business', splitPayment: false, vatExigibility: 'I', stampDutyEnabled: false, stampDutyAmount: 2, withholdingEnabled: false, withholdingType: 'RT01', withholdingReason: 'A', withholdingRate: 0, withholdingAmount: 0, pensionFundEnabled: false, pensionFundType: 'TC01', pensionFundRate: 0, pensionFundAmount: 0, pensionFundVatRate: 22, pensionFundVatNature: '', pensionFundLegalReference: '', paReferenceType: '', paDocumentId: '', paDocumentDate: '', paItemNumber: '', paConventionCode: '', paCup: '', paCig: '' }, billing: { address: '', city: '', province: '', zip: '', country: 'IT' }, fixedLines: [], variableLines: [] }; }
  private normalizeInvoiceProfile(profile: any): any { const source = profile || {}; const empty = this.emptyInvoiceProfile(); return { ...empty, ...source, header: { ...empty.header, ...(source.header || {}) }, billing: { ...empty.billing, ...(source.billing || {}) }, fixedLines: Array.isArray(source.fixedLines) ? source.fixedLines : [], variableLines: Array.isArray(source.variableLines) ? source.variableLines : [] }; }

  navigateToNotes(numeroCliente: string, displayName: string) {
    this.router.navigate(['/homeAdmin/customerNotes'], {
      queryParams: {
        numeroCliente,
        displayName,
        returnTo: '/homeAdmin/listCustomer',
      },
    });
  }
  viewDocuments(numeroCliente: string) {
    // Naviga o apri modale, a seconda di come gestisci i documenti
    this.router.navigate(['/homeAdmin/documenti/client', numeroCliente]);
  }

  async openWorkCompletion(customer: any): Promise<void> {
    const numeroCliente = String(customer?.numeroCliente || '').trim();
    if (!numeroCliente) return;
    const email = this.getCustomerEmail(customer);
    if (!email) {
      this.appDialog.showError(
        'Non puoi generare la richiesta: nell’anagrafica del cliente non è presente un indirizzo email.',
        'Email cliente mancante',
      );
      return;
    }
    if (!this.isValidEmail(email)) {
      this.appDialog.showError(
        'Non puoi generare la richiesta: l’indirizzo email salvato per il cliente non è valido.',
        'Email cliente non valida',
      );
      return;
    }

    const choice = await this.appDialog.choose(
      'Il cliente compilerà personalmente il foglio, verificherà la propria email con un codice OTP e firmerà dal suo dispositivo. Via email riceverà anche il PDF preliminare; su WhatsApp verrà aperto il messaggio pronto.',
      'Invia foglio di fine lavoro',
      {
        primaryLabel: 'Invia via email',
        secondaryLabel: 'Invia su WhatsApp',
        cancelLabel: 'Annulla',
      },
    );
    if (!choice) return;
    const sendByEmail = choice === 'primary';
    this.http.post<any>(
      this.globalService.url + 'admin/work-completion/request',
      {
        numeroCliente,
        deliveryChannel: sendByEmail ? 'email' : 'manual',
      },
      { headers: this.globalService.headers },
    ).subscribe({
      next: (result) => {
        if (!sendByEmail && (result?.whatsappUrl || result?.approvalUrl)) {
          window.open(result.whatsappUrl || result.approvalUrl, '_blank');
        }
        this.appDialog.show(
          sendByEmail
            ? 'Email con link e PDF inviata al cliente.'
            : 'Link generato e messaggio WhatsApp aperto.',
          'Richiesta creata',
          'success',
        );
      },
      error: (err) => {
        this.appDialog.showHttpError(
          err,
          'Impossibile generare la richiesta del foglio di fine lavoro.',
        );
      },
    });
  }

  openStaffRequirements(customer: any): void {
    this.requirementCustomer = customer;
    this.requirementCounts = {};
    this.vehicleRequirementCounts = {};
    this.equipmentRequirementCounts = {};
    forkJoin({
      employees: this.http.get<any[]>(
        this.globalService.url + `admin/employee-categories/customer/${customer.numeroCliente}`,
        { headers: this.globalService.headers },
      ),
      vehicles: this.http.get<any[]>(
        this.globalService.url + `admin/resource-categories/vehicle/customer/${customer.numeroCliente}`,
        { headers: this.globalService.headers },
      ),
      equipment: this.http.get<any[]>(
        this.globalService.url + `admin/resource-categories/equipment/customer/${customer.numeroCliente}`,
        { headers: this.globalService.headers },
      ),
    })
      .subscribe({
        next: ({ employees, vehicles, equipment }) => {
          for (const row of employees || []) {
            this.requirementCounts[Number(row.categoryId)] = Number(row.requiredCount) || 0;
          }
          for (const row of vehicles || []) {
            this.vehicleRequirementCounts[Number(row.categoryId)] = Number(row.requiredCount) || 0;
          }
          for (const row of equipment || []) {
            this.equipmentRequirementCounts[Number(row.categoryId)] = Number(row.requiredCount) || 0;
          }
        },
        error: (err) => {
          console.error('Errore requisiti cliente:', err);
          alert('Errore durante il caricamento requisiti cliente');
        },
      });
  }

  saveStaffRequirements(): void {
    if (!this.requirementCustomer) return;

    const requirements = this.employeeCategories
      .map((category) => ({
        categoryId: category.id,
        requiredCount: Number(this.requirementCounts[Number(category.id)] || 0),
      }))
      .filter((item) => item.categoryId && item.requiredCount > 0);

    const vehicleRequirements = this.vehicleCategories
      .map((category) => ({
        categoryId: category.id,
        requiredCount: Number(this.vehicleRequirementCounts[Number(category.id)] || 0),
      }))
      .filter((item) => item.categoryId && item.requiredCount > 0);

    const equipmentRequirements = this.equipmentCategories
      .map((category) => ({
        categoryId: category.id,
        requiredCount: Number(this.equipmentRequirementCounts[Number(category.id)] || 0),
      }))
      .filter((item) => item.categoryId && item.requiredCount > 0);

    forkJoin([
      this.http.post(
        this.globalService.url + `admin/employee-categories/customer/${this.requirementCustomer.numeroCliente}`,
        { requirements },
        { headers: this.globalService.headers },
      ),
      this.http.post(
        this.globalService.url + `admin/resource-categories/vehicle/customer/${this.requirementCustomer.numeroCliente}`,
        { requirements: vehicleRequirements },
        { headers: this.globalService.headers },
      ),
      this.http.post(
        this.globalService.url + `admin/resource-categories/equipment/customer/${this.requirementCustomer.numeroCliente}`,
        { requirements: equipmentRequirements },
        { headers: this.globalService.headers },
      ),
    ])
      .subscribe({
        next: () => {
          alert('Requisiti cliente salvati');
          this.requirementCustomer = null;
        },
        error: (err) => {
          console.error('Errore salvataggio requisiti cliente:', err);
          alert('Errore durante il salvataggio requisiti cliente');
        },
      });
  }

  openCustomerWhatsApp(customer: any): void {
    const normalizedPhone = this.normalizePhoneForWhatsApp(this.getCustomerPhone(customer));
    if (!normalizedPhone) {
      alert('Numero di telefono non disponibile.');
      return;
    }

    window.open(`https://wa.me/${normalizedPhone}`, '_blank', 'noopener,noreferrer');
  }

  composeCustomerEmail(customer: any): void {
    const email = this.getCustomerEmail(customer);
    if (!email) {
      alert('Indirizzo email non disponibile per questo cliente.');
      return;
    }

    if (!this.isValidEmail(email)) {
      alert('Indirizzo email cliente non valido.');
      return;
    }

    this.router.navigate(['/homeAdmin/email'], {
      queryParams: {
        composeTo: email,
        composeSubject: this.getCustomerDisplayName(customer)
          ? `Cliente ${this.getCustomerDisplayName(customer)}`
          : '',
      },
    });
  }

  private normalizePhoneForWhatsApp(phone: string): string {
    let cleaned = String(phone || '').replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
    if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
    if (!cleaned.startsWith('39') && cleaned.length <= 10) {
      cleaned = `39${cleaned}`;
    }
    return cleaned;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  back() {
    this.router.navigateByUrl('/homeAdmin');
  }
}
