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
    this.router.navigateByUrl('/service-orders/add');
  }

  editOrder(orderId: number): void {
    this.router.navigate(['/service-orders/edit', orderId]);
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

  goBack(): void {
    this.router.navigateByUrl('/homeAdmin');
  }

  customerName(order: any): string {
    const customer = order?.customer || {};
    return this.global.getRecordDisplayName('customer', customer) || '-';
  }
}
