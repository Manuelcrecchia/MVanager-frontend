import { Component, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Location } from '@angular/common';
import { CustomerModelService } from '../../service/customer-model.service';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { TenantFieldMappingFieldConfig } from '../../service/global.service';
import {
  MappedFieldValidationError,
  mappedFieldKey,
  validateMappedFields,
} from '../mapped-field-validation';

@Component({
  selector: 'app-edit-customer',
  templateUrl: './edit-customer.component.html',
  styleUrl: './edit-customer.component.css',
})
export class EditCustomerComponent {
  employeeCategories: any[] = [];
  requirementCounts: { [categoryId: number]: number } = {};
  employeeCategoriesLoaded = false;
  visibleCustomerFields: TenantFieldMappingFieldConfig[] = [];
  accessWorkFields: TenantFieldMappingFieldConfig[] = [];
  validationErrors: Record<string, string> = {};
  readonly accessWeekDays = [
    { key: 'Lunedi', label: 'Lunedi', normalized: 'lunedi', startKey: 'accessoLunediDa', endKey: 'accessoLunediA' },
    { key: 'Martedi', label: 'Martedi', normalized: 'martedi', startKey: 'accessoMartediDa', endKey: 'accessoMartediA' },
    { key: 'Mercoledi', label: 'Mercoledi', normalized: 'mercoledi', startKey: 'accessoMercolediDa', endKey: 'accessoMercolediA' },
    { key: 'Giovedi', label: 'Giovedi', normalized: 'giovedi', startKey: 'accessoGiovediDa', endKey: 'accessoGiovediA' },
    { key: 'Venerdi', label: 'Venerdi', normalized: 'venerdi', startKey: 'accessoVenerdiDa', endKey: 'accessoVenerdiA' },
    { key: 'Sabato', label: 'Sabato', normalized: 'sabato', startKey: 'accessoSabatoDa', endKey: 'accessoSabatoA' },
    { key: 'Domenica', label: 'Domenica', normalized: 'domenica', startKey: 'accessoDomenicaDa', endKey: 'accessoDomenicaA' },
  ];

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
    this.loadEmployeeCategories();
    const numeroCliente =
      this.route.snapshot.paramMap.get('numeroCliente') ||
      this.route.snapshot.queryParamMap.get('numeroCliente') ||
      this.customerModelService.numeroCliente;
    this.globalService.loadTenantConfig(false, { showError: false }).then(() => {
      this.refreshVisibleCustomerFields();
      if (numeroCliente) {
        this.caricaClienteFromDb(numeroCliente);
      }
    });
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
            this.syncCustomerFieldRules();
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
    delete this.validationErrors[mappedFieldKey(field)];
    this.syncCustomerFieldRules();
  }

  getRepeatableTextRows(field: TenantFieldMappingFieldConfig): string[] {
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

  addTextRow(field: TenantFieldMappingFieldConfig): void {
    this.setRepeatableTextRows(field, [...this.getRepeatableTextRows(field), '']);
  }

  removeTextRow(field: TenantFieldMappingFieldConfig, index: number): void {
    this.setRepeatableTextRows(
      field,
      this.getRepeatableTextRows(field).filter((_, rowIndex) => rowIndex !== index),
    );
  }

  updateTextRow(field: TenantFieldMappingFieldConfig, index: number, value: string): void {
    const rows = this.getRepeatableTextRows(field).map((row, rowIndex) => (
      rowIndex === index ? value : row
    ));
    this.setRepeatableTextRows(field, rows);
  }

  trackByTextRowIndex(index: number): number {
    return index;
  }

  private setRepeatableTextRows(field: TenantFieldMappingFieldConfig, rows: string[]): void {
    const target = this.customerModelService as unknown as Record<string, any>;
    target[field.dbColumn] = rows;
    if (field.key && field.key !== field.dbColumn) {
      target[field.key] = rows;
    }
    delete this.validationErrors[mappedFieldKey(field)];
    this.syncCustomerFieldRules();
  }

  private syncCustomerFieldRules(): void {
    const target = this.customerModelService as unknown as Record<string, any>;
    this.globalService.clearHiddenFieldValues('customer', target);
    this.globalService.applyFieldDefaults('customer', target);
    this.globalService.applyCalculatedFields('customer', target);
    this.refreshVisibleCustomerFields();
  }

  private refreshVisibleCustomerFields(): void {
    const fields = this.globalService.getVisibleFieldMappingFields(
      'customer',
      this.customerModelService as unknown as Record<string, any>,
    );
    this.accessWorkFields = fields.filter((field) => this.isAccessWorkField(field));
    this.visibleCustomerFields = fields.filter((field) => !this.isAccessWorkField(field));
  }

  trackByCustomerField(index: number, field: TenantFieldMappingFieldConfig): string {
    return String(field?.dbColumn || field?.key || index);
  }

  getFieldError(field: TenantFieldMappingFieldConfig): string {
    return this.validationErrors[mappedFieldKey(field)] || '';
  }

  hasAccessWorkFields(): boolean {
    return this.accessWorkFields.length > 0;
  }

  getAccessFieldByRole(role: string): TenantFieldMappingFieldConfig | null {
    return this.accessWorkFields.find((field) => String(field.displayRole || '').trim() === role) || null;
  }

  getAccessFieldByKey(key: string): TenantFieldMappingFieldConfig | null {
    const normalizedKey = this.normalizeAccessLookup(key);
    return this.accessWorkFields.find((field) =>
      [field.key, field.dbColumn].some((value) => this.normalizeAccessLookup(value) === normalizedKey),
    ) || null;
  }

  getAccessFieldValue(field: TenantFieldMappingFieldConfig | null): any {
    if (!field) return '';
    const source = this.customerModelService as unknown as Record<string, any>;
    return source[field.dbColumn] ?? (field.key ? source[field.key] : '') ?? '';
  }

  updateAccessField(field: TenantFieldMappingFieldConfig | null, value: any): void {
    if (!field) return;
    this.updateField(field, value);
  }

  getAccessDurationHours(field: TenantFieldMappingFieldConfig | null): number | string {
    const rawValue = this.getAccessFieldValue(field);
    if (rawValue === null || rawValue === undefined || rawValue === '') return '';
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(String(rawValue).trim());
    if (timeMatch) {
      return Math.round((Number(timeMatch[1]) + Number(timeMatch[2]) / 60) * 100) / 100;
    }
    const minutes = Number(String(rawValue).replace(',', '.'));
    if (!Number.isFinite(minutes) || minutes <= 0) return '';
    return minutes <= 24 ? minutes : Math.round((minutes / 60) * 100) / 100;
  }

  updateAccessDurationHours(field: TenantFieldMappingFieldConfig | null, value: any): void {
    if (!field) return;
    const hours = Number(String(value || '').replace(',', '.'));
    this.updateAccessField(field, Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : '');
  }

  updateAccessFieldByKey(key: string, value: any): void {
    const field = this.getAccessFieldByKey(key);
    this.updateAccessField(field, value);
    const day = this.accessWeekDays.find((item) => item.startKey === key || item.endKey === key);
    if (day && String(value || '').trim()) {
      this.setAccessDaySelected(day, true);
    }
  }

  getAccessFieldValueByKey(key: string): any {
    return this.getAccessFieldValue(this.getAccessFieldByKey(key));
  }

  isAccessDayEnabled(day: { normalized: string; startKey: string; endKey: string }): boolean {
    return this.getSelectedAccessDays().includes(day.normalized) ||
      !!String(this.getAccessFieldValueByKey(day.startKey) || '').trim() ||
      !!String(this.getAccessFieldValueByKey(day.endKey) || '').trim();
  }

  setAccessDayEnabled(day: { key: string; normalized: string; startKey: string; endKey: string }, enabled: boolean): void {
    this.setAccessDaySelected(day, enabled);
    if (!enabled) {
      this.updateAccessField(this.getAccessFieldByKey(day.startKey), '');
      this.updateAccessField(this.getAccessFieldByKey(day.endKey), '');
    }
  }

  trackByAccessDay(index: number, day: { key: string }): string {
    return day.key || String(index);
  }

  editCustomer(): void {
    const source = this.customerModelService as unknown as Record<string, any>;
    this.validationErrors = {};
    const missingFields = this.globalService.getMissingRequiredFields('customer', source);
    if (missingFields.length) {
      this.popup.show(
        `Compila i campi obbligatori: ${missingFields.join(', ')}`,
        'Campi obbligatori',
      );
      return;
    }

    const formatErrors = validateMappedFields([...this.visibleCustomerFields, ...this.accessWorkFields], source);
    if (formatErrors.length) {
      this.showValidationErrors(formatErrors);
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

  private showValidationErrors(errors: MappedFieldValidationError[]): void {
    this.validationErrors = errors.reduce<Record<string, string>>((acc, error) => {
      acc[error.fieldKey] = error.message;
      return acc;
    }, {});
    this.popup.show(
      errors.map((error) => `${error.label}: ${error.message}`).join('\n'),
      'Correggi i campi',
      'warning',
    );
  }

  private isAccessWorkField(field: TenantFieldMappingFieldConfig): boolean {
    const role = String(field.displayRole || '').trim();
    const section = this.normalizeAccessLookup(field.section);
    const key = this.normalizeAccessLookup(field.key || field.dbColumn);
    const accessRoles = new Set([
      'customerAccessDays',
      'customerAccessStart',
      'customerAccessEnd',
      'customerWorkDurationMinutes',
      'customerAccessNotes',
    ]);
    return accessRoles.has(role) ||
      section === 'accessolavori' ||
      key === 'giorniaccesso' ||
      key === 'orarioaccessoda' ||
      key === 'orarioaccessoa' ||
      key === 'duratalavorominuti' ||
      key === 'noteaccesso' ||
      /^accesso(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)(da|a)$/.test(key);
  }

  private getSelectedAccessDays(): string[] {
    const field = this.getAccessFieldByRole('customerAccessDays') || this.getAccessFieldByKey('giorniAccesso');
    const rawValue = this.getAccessFieldValue(field);
    let values: any[] = [];
    if (Array.isArray(rawValue)) {
      values = rawValue;
    } else if (typeof rawValue === 'string' && rawValue.trim()) {
      try {
        const parsed = JSON.parse(rawValue);
        values = Array.isArray(parsed) ? parsed : rawValue.split(/[;,|]/);
      } catch {
        values = rawValue.split(/[;,|]/);
      }
    }
    return values.map((value) => this.normalizeWeekdayName(value)).filter(Boolean);
  }

  private setAccessDaySelected(day: { key: string; normalized: string }, enabled: boolean): void {
    const field = this.getAccessFieldByRole('customerAccessDays') || this.getAccessFieldByKey('giorniAccesso');
    if (!field) return;
    const selected = new Set(this.getSelectedAccessDays());
    if (enabled) {
      selected.add(day.normalized);
    } else {
      selected.delete(day.normalized);
    }
    const values = this.accessWeekDays
      .filter((item) => selected.has(item.normalized))
      .map((item) => item.key);
    this.setRepeatableTextRows(field, values);
  }

  private normalizeWeekdayName(value: any): string {
    const normalized = this.normalizeAccessLookup(value);
    const aliases: Record<string, string> = {
      lun: 'lunedi',
      lunedi: 'lunedi',
      monday: 'lunedi',
      mon: 'lunedi',
      mar: 'martedi',
      martedi: 'martedi',
      tuesday: 'martedi',
      tue: 'martedi',
      mer: 'mercoledi',
      mercoledi: 'mercoledi',
      wednesday: 'mercoledi',
      wed: 'mercoledi',
      gio: 'giovedi',
      giovedi: 'giovedi',
      thursday: 'giovedi',
      thu: 'giovedi',
      ven: 'venerdi',
      venerdi: 'venerdi',
      friday: 'venerdi',
      fri: 'venerdi',
      sab: 'sabato',
      sabato: 'sabato',
      saturday: 'sabato',
      sat: 'sabato',
      dom: 'domenica',
      domenica: 'domenica',
      sunday: 'domenica',
      sun: 'domenica',
    };
    return aliases[normalized] || '';
  }

  private normalizeAccessLookup(value: any): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  @HostListener('window:popstate', ['$event'])
  onBrowserBackBtnClose(event: Event): void {
    event.preventDefault();
    this.customerModelService.reset();
    this.location.replaceState('/listCustomer');
    this.router.navigateByUrl('/listCustomer');
  }
}
