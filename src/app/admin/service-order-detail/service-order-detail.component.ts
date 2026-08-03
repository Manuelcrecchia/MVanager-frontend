import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';

@Component({
  selector: 'app-service-order-detail',
  templateUrl: './service-order-detail.component.html',
  styleUrls: ['./service-order-detail.component.css'],
})
export class ServiceOrderDetailComponent implements OnInit {
  order: any | null = null;
  loading = true;
  private fieldLabels: Record<string, string> = {};

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    public global: GlobalService,
  ) {}

  ngOnInit(): void {
    this.http.get<any>(this.global.url + 'service-orders/config').subscribe({
      next: (config) => {
        for (const field of Array.isArray(config?.fields) ? config.fields : []) {
          const key = String(field?.key || '').trim();
          if (key) this.fieldLabels[key] = String(field?.label || key);
        }
      },
    });
    const orderId = Number(this.route.snapshot.paramMap.get('id'));
    if (!orderId) { this.loading = false; return; }
    this.http.get<any>(this.global.url + `service-orders/${orderId}`).subscribe({
      next: (order) => { this.order = order; this.loading = false; },
      error: () => { this.order = null; this.loading = false; },
    });
  }

  get customerName(): string {
    return this.global.getRecordDisplayName('customer', this.order?.customer || {}) || '-';
  }

  get customFields(): Array<{ label: string; value: string }> {
    return Object.entries(this.order?.fields || {})
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
      .map(([key, value]) => ({ label: this.fieldLabels[key] || key, value: typeof value === 'object' ? JSON.stringify(value) : String(value) }));
  }

  back(): void { this.router.navigateByUrl('/homeAdmin/service-orders'); }
}
