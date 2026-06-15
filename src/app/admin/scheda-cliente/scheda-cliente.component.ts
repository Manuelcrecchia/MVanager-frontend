// src/app/componenti/scheda-cliente/scheda-cliente.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { GlobalService, TenantFieldMappingFieldConfig } from '../../service/global.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-scheda-cliente',
  templateUrl: './scheda-cliente.component.html',
  styleUrls: ['./scheda-cliente.component.css'],
})
export class SchedaClienteComponent implements OnInit {
  cliente: any | null = null;

  constructor(
    public globalService: GlobalService,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute
  ) {}
  ngOnInit(): void {
    const numeroCliente = this.route.snapshot.paramMap.get('numeroCliente');
    if (numeroCliente) {
      this.http
        .post(
          this.globalService.url + 'customers/getCustomer',
          {
            numeroCliente: numeroCliente,
          },
          {
            headers: this.globalService.headers,
          }
        )
        .subscribe({
          next: (res: any) => {
            this.cliente = res[0];
          },
          error: (err) => {
            console.error('Errore caricamento cliente:', err);
            alert('Errore durante il caricamento del cliente');
          },
        });
    }
  }
  parseJson(val: string): string[] {
    try {
      return JSON.parse(val || '[]');
    } catch {
      return [];
    }
  }

  getDisplayName(): string {
    return this.globalService.getRecordDisplayName('customer', this.cliente || {}) || 'Cliente sconosciuto';
  }

  getVisibleFields(): TenantFieldMappingFieldConfig[] {
    return this.globalService.getVisibleFieldMappingFields('customer');
  }

  getFieldValue(field: TenantFieldMappingFieldConfig): any {
    return this.globalService.getRecordValueForField(this.cliente || {}, field);
  }

  formatFieldValue(field: TenantFieldMappingFieldConfig): string {
    const value = this.getFieldValue(field);
    if (value === undefined || value === null || value === '') return '-';
    if (Array.isArray(value)) return value.filter(Boolean).join(', ') || '-';
    if (typeof value === 'object') return JSON.stringify(value);
    if (field.type === 'boolean') return value === true || value === 'true' || value === 1 ? 'Sì' : 'No';
    return String(value);
  }

  back() {
    this.router.navigateByUrl('/listCustomer');
  }
}
