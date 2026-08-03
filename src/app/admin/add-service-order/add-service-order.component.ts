import { Component, OnDestroy, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GlobalService,
  TenantConfigurableDocumentField,
} from '../../service/global.service';

@Component({
  selector: 'app-add-service-order',
  templateUrl: './add-service-order.component.html',
  styleUrls: ['./add-service-order.component.css'],
})
export class AddServiceOrderComponent implements OnInit, OnDestroy {
  customerQuery = '';
  customers: any[] = [];
  selectedCustomer: any = null;
  descrizione = '';
  configuredFields: TenantConfigurableDocumentField[] = [];
  fieldValues: Record<string, any> = {};
  isEditMode = false;
  loadingOrder = false;
  orderId: number | null = null;
  loadingCustomers = false;
  saving = false;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressNextSearch = false;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    public global: GlobalService,
  ) {}

  ngOnInit(): void {
    this.loadConfig();
    const id = Number.parseInt(this.route.snapshot.paramMap.get('id') || '', 10);
    if (Number.isInteger(id) && id > 0) {
      this.isEditMode = true;
      this.orderId = id;
      this.loadOrder();
    }
  }

  private loadConfig(): void {
    this.http.get<any>(this.global.url + 'service-orders/config').subscribe({
      next: (config) => {
        this.configuredFields = Array.isArray(config?.fields) ? config.fields : [];
        for (const field of this.configuredFields) {
          if (!Object.prototype.hasOwnProperty.call(this.fieldValues, field.key)) {
            this.fieldValues[field.key] = field.defaultValue || '';
          }
        }
      },
      error: (err) => {
        console.error('Errore caricamento configurazione ordine di servizio:', err);
      },
    });
  }

  ngOnDestroy(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  onCustomerQueryChange(value: string): void {
    if (this.isEditMode) {
      return;
    }

    this.customerQuery = value;

    if (this.suppressNextSearch) {
      this.suppressNextSearch = false;
      return;
    }

    this.selectedCustomer = null;

    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    const q = this.customerQuery.trim();
    if (!q) {
      this.customers = [];
      this.loadingCustomers = false;
      return;
    }

    this.searchTimer = setTimeout(() => this.searchCustomers(), 250);
  }

  searchCustomers(): void {
    if (this.isEditMode) {
      return;
    }

    const q = this.customerQuery.trim();
    if (!q) {
      this.customers = [];
      return;
    }

    this.loadingCustomers = true;
    this.http
      .get<any[]>(this.global.url + `service-orders/customers?q=${encodeURIComponent(q)}`)
      .subscribe({
        next: (customers) => {
          this.customers = customers || [];
          this.loadingCustomers = false;
        },
        error: (err) => {
          console.error('Errore ricerca clienti:', err);
          this.loadingCustomers = false;
          alert('Errore nella ricerca clienti.');
        },
      });
  }

  selectCustomer(customer: any): void {
    this.selectedCustomer = customer;
    this.suppressNextSearch = true;
    this.customerQuery = `${customer.numeroCliente} - ${this.customerName(customer)}`;
    this.customers = [];
    for (const field of this.configuredFields) {
      const source = String(field.sourceField || '');
      if (!source.startsWith('customer.')) continue;
      const value = this.global.getRecordValueByFieldKey(
        'customer',
        customer,
        source.slice('customer.'.length),
      );
      this.fieldValues[field.key] =
        value === undefined || value === null ? field.defaultValue || '' : value;
    }
  }

  private loadOrder(): void {
    if (!this.orderId) {
      return;
    }

    this.loadingOrder = true;
    this.http
      .get<any>(this.global.url + `service-orders/${this.orderId}`)
      .subscribe({
        next: (order) => {
          this.loadingOrder = false;
          const customer = order?.customer || { numeroCliente: order?.numeroCliente };
          this.selectedCustomer = customer;
          this.customerQuery = `${customer.numeroCliente || '-'} - ${this.customerName(customer)}`;
          this.descrizione = order?.descrizione || '';
          this.fieldValues = { ...(order?.fields || {}) };
        },
        error: (err) => {
          console.error("Errore caricamento ordine di servizio:", err);
          this.loadingOrder = false;
          alert(err?.error?.error || "Errore nel caricamento dell'ordine di servizio.");
          this.goBack();
        },
      });
  }

  save(): void {
    if (!this.isEditMode && !this.selectedCustomer) {
      alert('Seleziona un cliente.');
      return;
    }

    const missingField = this.configuredFields.find(
      (field) =>
        field.required &&
        String(this.fieldValues[field.key] ?? '').trim() === '',
    );
    if (missingField) {
      alert(`Il campo ${missingField.label} è obbligatorio.`);
      return;
    }

    this.saving = true;
    const url = this.isEditMode && this.orderId
      ? this.global.url + `service-orders/${this.orderId}`
      : this.global.url + 'service-orders';

    const payload = this.isEditMode
      ? {
          descrizione: this.descrizione.trim(),
          fields: this.fieldValues,
        }
      : {
          numeroCliente: this.selectedCustomer.numeroCliente,
          descrizione: this.descrizione.trim(),
          fields: this.fieldValues,
        };

    this.http.post(url, payload).subscribe({
      next: () => {
        this.saving = false;
        this.router.navigateByUrl('/homeAdmin/service-orders');
      },
      error: (err) => {
        console.error(
          this.isEditMode
            ? 'Errore modifica ordine di servizio:'
            : 'Errore creazione ordine di servizio:',
          err,
        );
        this.saving = false;
        alert(
          err?.error?.error ||
            (this.isEditMode
              ? "Errore nella modifica dell'ordine di servizio."
              : "Errore nella creazione dell'ordine di servizio."),
        );
      },
    });
  }

  goBack(): void {
    this.router.navigateByUrl('/homeAdmin/service-orders');
  }

  customerName(customer: any): string {
    return this.global.getRecordDisplayName('customer', customer || {}) || '-';
  }

  customerRoleValue(customer: any, role: string): string {
    const value = this.global.getRecordValueByRole('customer', customer || {}, role);
    return value === undefined || value === null || value === '' ? '-' : String(value);
  }

  hasCustomerRole(customer: any, role: string): boolean {
    return this.customerRoleValue(customer, role) !== '-';
  }

}
