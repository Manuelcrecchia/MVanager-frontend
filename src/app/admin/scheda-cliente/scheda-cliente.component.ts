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
    const roomRowsValue = this.formatRoomRowsValue(value);
    if (roomRowsValue) return roomRowsValue;
    if (Array.isArray(value)) return value.filter(Boolean).join(', ') || '-';
    if (typeof value === 'object') return JSON.stringify(value);
    if (field.type === 'boolean') return value === true || value === 'true' || value === 1 ? 'Sì' : 'No';
    return String(value);
  }

  private formatRoomRowsValue(value: any): string {
    const rows = this.parseArrayValue(value);
    if (!rows.length || !rows.some((row) => row && typeof row === 'object' && ('stanza' in row || 'oggetti' in row || 'roomId' in row))) {
      return '';
    }

    return rows
      .map((row) => {
        if (!row || typeof row !== 'object') return String(row || '').trim();
        const stanza = String(row.stanza || row.roomName || row.nome || row.name || '').trim();
        const oggetti = String(row.oggetti || row.objects || row.elementi || row.details || '').trim();
        return [stanza, oggetti].filter(Boolean).join(' - ');
      })
      .filter(Boolean)
      .join('; ') || '-';
  }

  private parseArrayValue(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  back() {
    this.router.navigateByUrl('/listCustomer');
  }
}
