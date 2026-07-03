import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';

@Component({
  selector: 'app-service-orders',
  templateUrl: './service-orders.component.html',
  styleUrls: ['./service-orders.component.css'],
})
export class ServiceOrdersComponent implements OnInit {
  orders: any[] = [];
  search = '';
  loading = false;
  generatingDeliveryId = 0;

  constructor(
    private http: HttpClient,
    private router: Router,
    public global: GlobalService,
  ) {}

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    this.loading = true;
    const q = encodeURIComponent(this.search.trim());
    const url = this.global.url + `service-orders${q ? `?q=${q}` : ''}`;

    this.http.get<any[]>(url).subscribe({
      next: (orders) => {
        this.orders = orders || [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Errore caricamento ordini di servizio:', err);
        this.loading = false;
        alert('Errore nel caricamento degli ordini di servizio.');
      },
    });
  }

  addOrder(): void {
    this.router.navigateByUrl('/homeAdmin/service-orders/add');
  }

  editOrder(orderId: number): void {
    this.router.navigate(['/homeAdmin', 'service-orders', 'edit', orderId]);
  }

  deleteOrder(orderId: number): void {
    const confirmed = confirm(
      "Vuoi davvero eliminare questo ordine di servizio? Verrà eliminato anche l'appuntamento collegato nel calendario.",
    );
    if (!confirmed) {
      return;
    }

    this.http.post(this.global.url + `service-orders/${orderId}/delete`, {}).subscribe({
      next: () => {
        this.loadOrders();
      },
      error: (err) => {
        console.error("Errore eliminazione ordine di servizio:", err);
        alert(err?.error?.error || "Errore nell'eliminazione dell'ordine di servizio.");
      },
    });
  }

  canGenerateDeliveryDocument(): boolean {
    const config = this.global.getTenantInternalWarehouseConfig();
    return this.global.hasTenantFeature('internalWarehouse') &&
      this.global.hasPermission('INTERNAL_WAREHOUSE_OUT') &&
      config.serviceOrderFlow?.enabled === true &&
      config.serviceOrderFlow?.documentEnabled === true;
  }

  generateDeliveryDocument(orderId: number): void {
    if (!orderId || this.generatingDeliveryId) return;
    this.generatingDeliveryId = orderId;
    this.http.post(
      this.global.url + `admin/internal-warehouse/service-orders/${orderId}/delivery-document?download=true`,
      {},
      { observe: 'response', responseType: 'blob' },
    ).subscribe({
      next: (res) => {
        this.generatingDeliveryId = 0;
        const filename = this.filenameFromDisposition(res.headers.get('content-disposition')) ||
          `materiale_ordine_${orderId}.pdf`;
        const blob = res.body || new Blob([], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.generatingDeliveryId = 0;
        console.error('Errore generazione documento materiale:', err);
        alert(err?.error?.error || 'Errore nella generazione del documento materiale.');
      },
    });
  }

  private filenameFromDisposition(disposition: string | null): string {
    const match = String(disposition || '').match(/filename="?([^"]+)"?/i);
    return match?.[1] || '';
  }

  goBack(): void {
    this.router.navigateByUrl('/homeAdmin');
  }

  customerName(order: any): string {
    const customer = order?.customer || {};
    return this.global.getRecordDisplayName('customer', customer) || '-';
  }
}
