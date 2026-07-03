import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { CustomerModelService } from '../../service/customer-model.service';
import { Component, Input } from '@angular/core';
import { saveAs } from 'file-saver';
import { forkJoin } from 'rxjs';

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
  archiveReminderCustomerId = '';
  showArchived = false;

  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router,
    private route: ActivatedRoute,
    private customerModelService: CustomerModelService,
  ) {}

  ngOnInit(): void {
    this.archiveReminderCustomerId = String(this.route.snapshot.queryParamMap.get('archiveReminder') || '').trim();
    if (this.archiveReminderCustomerId) {
      this.customerSearch = this.archiveReminderCustomerId;
    }
    this.getCustomers();
    this.getEmployeeCategories();
    this.getVehicleCategories();
    this.getEquipmentCategories();
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

  getCustomers(): void {
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
          alert('Errore durante il caricamento dei clienti');
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
    this.customersFrEnd = q
      ? this.customers.filter((c) =>
          this.normalize(c?.numeroCliente?.toString()).startsWith(q),
        )
      : [...this.customers];
  }

  searchNominativo(v: string): void {
    const q = this.normalize(v);
    this.customersFrEnd = q
      ? this.customers.filter((c) =>
          this.normalize(this.getCustomerDisplayName(c)).includes(q),
        )
      : [...this.customers];
  }

  applyCustomerSearch(): void {
    const q = this.normalize(this.customerSearch);
    this.customersFrEnd = q
      ? this.customers.filter((customer) =>
          this.normalize(this.getCustomerSearchText(customer)).includes(q),
        )
      : [...this.customers];
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

  archiveCustomer(customer: any): void {
    if (
      !confirm(
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

  archiveOnlyCustomer(customer: any): void {
    if (!confirm(`Archiviare il cliente "${this.getCustomerDisplayName(customer) || customer.numeroCliente}" senza scaricare lo ZIP?`)) return;

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

  unarchiveCustomer(customer: any): void {
    if (!confirm(`Riattivare il cliente "${this.getCustomerDisplayName(customer) || customer.numeroCliente}"?`)) return;

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
    this.customersFrEnd = [...this.customers];
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

  navigateToNotes(numeroCliente: string, displayName: string) {
    this.router.navigate(['/homeAdmin/customerNotes'], {
      queryParams: { numeroCliente, displayName },
    });
  }
  viewDocuments(numeroCliente: string) {
    // Naviga o apri modale, a seconda di come gestisci i documenti
    this.router.navigate(['/homeAdmin/documenti/client', numeroCliente]);
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
