import { Component, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Location } from '@angular/common';
import { CustomerModelService } from '../../service/customer-model.service';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { TenantFieldMappingFieldConfig } from '../../service/global.service';

@Component({
  selector: 'app-edit-customer',
  templateUrl: './edit-customer.component.html',
  styleUrl: './edit-customer.component.css',
})
export class EditCustomerComponent {
  employeeCategories: any[] = [];
  requirementCounts: { [categoryId: number]: number } = {};
  employeeCategoriesLoaded = false;

  constructor(
    public customerModelService: CustomerModelService,
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location,
    private popup: PopupServiceService,
  ) {}

  ngOnInit(): void {
    this.globalService.loadTenantConfig(false, { showError: false });
    this.loadEmployeeCategories();
    const numeroCliente =
      this.route.snapshot.paramMap.get('numeroCliente') ||
      this.route.snapshot.queryParamMap.get('numeroCliente') ||
      this.customerModelService.numeroCliente;
    if (numeroCliente) {
      this.caricaClienteFromDb(numeroCliente);
    }
  }

  loadEmployeeCategories(): void {
    this.http
      .get<any[]>(this.globalService.url + 'admin/employee-categories', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (categories) => {
          this.employeeCategories = Array.isArray(categories) ? categories : [];
          this.employeeCategoriesLoaded = true;
        },
        error: () => {
          this.employeeCategories = [];
          this.employeeCategoriesLoaded = true;
        },
      });
  }

  loadStaffRequirements(numeroCliente: string): void {
    this.http
      .get<any[]>(this.globalService.url + `admin/employee-categories/customer/${numeroCliente}`, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (rows) => {
          const counts: { [categoryId: number]: number } = {};
          for (const row of rows || []) {
            counts[Number(row.categoryId)] = Number(row.requiredCount) || 0;
          }
          this.requirementCounts = counts;
        },
        error: () => {
          this.requirementCounts = {};
        },
      });
  }

  private buildStaffRequirements(): any[] {
    return this.employeeCategories
      .map((category) => ({
        categoryId: category.id,
        requiredCount: Number(this.requirementCounts[Number(category.id)] || 0),
      }))
      .filter((item) => item.categoryId && item.requiredCount > 0);
  }

  private saveStaffRequirements(numeroCliente: string, done: () => void): void {
    const requirements = this.buildStaffRequirements();
    this.http
      .post(
        this.globalService.url + `admin/employee-categories/customer/${numeroCliente}`,
        { requirements },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => done(),
        error: () => done(),
      });
  }

  private caricaClienteFromDb(numeroCliente: string): void {
    this.http
      .post(this.globalService.url + 'customers/getCustomer', { numeroCliente }, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (res: any) => {
          if (res && res[0]) {
            this.customerModelService.reset();
            Object.assign(this.customerModelService as any, res[0]);
            this.loadStaffRequirements(String(res[0].numeroCliente || numeroCliente));
          }
        },
        error: (err) => {
          console.error('Errore caricamento cliente:', err);
        },
      });
  }

  updateField(field: TenantFieldMappingFieldConfig, value: any): void {
    const target = this.customerModelService as unknown as Record<string, any>;
    target[field.dbColumn] = value;
    if (field.key && field.key !== field.dbColumn) {
      target[field.key] = value;
    }
  }

  getRepeatableTextRows(field: { dbColumn: string; key?: string }): string[] {
    const source = this.customerModelService as unknown as Record<string, any>;
    const rawValue = source[field.dbColumn] ?? (field.key ? source[field.key] : undefined);
    if (Array.isArray(rawValue)) {
      return rawValue.map((row) => String(row ?? ''));
    }
    if (typeof rawValue === 'string' && rawValue.trim()) {
      try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
          return parsed.map((row) => String(row ?? ''));
        }
      } catch {}
      return [rawValue];
    }
    return [];
  }

  addTextRow(field: { dbColumn: string; key?: string }): void {
    this.setRepeatableTextRows(field, [...this.getRepeatableTextRows(field), '']);
  }

  removeTextRow(field: { dbColumn: string; key?: string }, index: number): void {
    this.setRepeatableTextRows(
      field,
      this.getRepeatableTextRows(field).filter((_, rowIndex) => rowIndex !== index),
    );
  }

  updateTextRow(field: { dbColumn: string; key?: string }, index: number, value: string): void {
    const rows = this.getRepeatableTextRows(field).map((row, rowIndex) => (
      rowIndex === index ? value : row
    ));
    this.setRepeatableTextRows(field, rows);
  }

  trackByTextRowIndex(index: number): number {
    return index;
  }

  private setRepeatableTextRows(field: { dbColumn: string; key?: string }, rows: string[]): void {
    const target = this.customerModelService as unknown as Record<string, any>;
    target[field.dbColumn] = rows;
    if (field.key && field.key !== field.dbColumn) {
      target[field.key] = rows;
    }
  }

  editCustomer(): void {
    const source = this.customerModelService as unknown as Record<string, any>;
    const missingFields = this.globalService.getMissingRequiredFields('customer', source);
    if (missingFields.length) {
      this.popup.show(
        `Compila i campi obbligatori: ${missingFields.join(', ')}`,
        'Campi obbligatori',
      );
      return;
    }

    const body = this.globalService.applyFieldMappingToPayload(
      'customer',
      {
        numeroCliente: String(source['numeroCliente'] || '').trim(),
        codiceOperatore: source['codiceOperatore'] || this.globalService.userCode,
        tipoCliente: source['tipoCliente'] || '',
        data: source['data'] || '',
      },
      source,
    );

    this.http
      .post(this.globalService.url + 'customers/edit', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          const numeroCliente = String(body.numeroCliente || '').trim();
          this.saveStaffRequirements(numeroCliente, () => {
            this.customerModelService.reset();
            this.router.navigateByUrl('/listCustomer');
          });
        },
        error: (err) => {
          this.popup.showError(this.parseServerError(err));
        },
      });
  }

  back(): void {
    this.customerModelService.reset();
    this.router.navigateByUrl('/listCustomer');
  }

  private parseServerError(err: any): string {
    try {
      const body = typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
      if (body?.error) return body.error;
    } catch {}
    if (err.status === 0) return 'Impossibile connettersi al server';
    return 'Errore durante il salvataggio. Riprova.';
  }

  @HostListener('window:popstate', ['$event'])
  onBrowserBackBtnClose(event: Event): void {
    event.preventDefault();
    this.customerModelService.reset();
    this.location.replaceState('/listCustomer');
    this.router.navigateByUrl('/listCustomer');
  }
}
