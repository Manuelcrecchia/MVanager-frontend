import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { CustomerModelService } from '../../service/customer-model.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { AutomaticAddInspectionToCalendarService } from '../../service/automatic-add-inspection-to-calendar.service';
import { TenantFieldMappingFieldConfig } from '../../service/global.service';
import {
  MappedFieldValidationError,
  mappedFieldKey,
  validateMappedFields,
} from '../mapped-field-validation';

@Component({
  selector: 'app-add-customer',
  templateUrl: './add-customer.component.html',
  styleUrl: './add-customer.component.css',
})
export class AddCustomerComponent {
  employeeCategories: any[] = [];
  equipmentTargets: any[] = [];
  requirementCounts: { [categoryId: number]: number } = {};
  equipmentRequirementCounts: { [targetKey: string]: number } = {};
  employeeCategoriesLoaded = false;
  equipmentTargetsLoaded = false;
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
    public globalService: GlobalService,
    public customerModelService: CustomerModelService,
    private http: HttpClient,
    private router: Router,
    private popup: PopupServiceService,
    private autoInspectionService: AutomaticAddInspectionToCalendarService,
  ) {}

  ngOnInit(): void {
    this.globalService
      .loadTenantConfig(false, { showError: false })
      .then(() => {
        const target = this.customerModelService as unknown as Record<string, any>;
        this.globalService.applyFieldDefaults('customer', target);
        this.globalService.applyCalculatedFields('customer', target);
        this.refreshVisibleCustomerFields();
    });
    this.loadEmployeeCategories();
    this.loadEquipmentTargets();
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

  loadEquipmentTargets(): void {
    this.http
      .get<any[]>(this.globalService.url + 'equipment/getAll', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (targets) => {
          this.equipmentTargets = Array.isArray(targets) ? targets : [];
          this.equipmentTargetsLoaded = true;
        },
        error: () => {
          this.equipmentTargets = [];
          this.equipmentTargetsLoaded = true;
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

  private buildEquipmentRequirements(): any[] {
    return this.equipmentTargets
      .map((target) => ({
        targetKey: String(target.targetKey || '').trim(),
        requiredCount: Number(this.equipmentRequirementCounts[String(target.targetKey || '').trim()] || 0),
      }))
      .filter((item) => item.targetKey && item.requiredCount > 0);
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

  addCustomer(): void {
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

    const sourceNumeroPreventivo = String(source['numeroPreventivo'] || '').trim();
    const body = this.globalService.applyFieldMappingToPayload(
      'customer',
      {
        codiceOperatore: this.globalService.userCode,
        numeroCliente: source['numeroCliente'] || sourceNumeroPreventivo || undefined,
        numeroPreventivo: sourceNumeroPreventivo || undefined,
        tipoCliente: source['tipoCliente'] ||
          source['tipoPreventivo'] ||
          this.globalService.getDefaultQuoteType(''),
        data: source['data'] || '',
      },
      source,
    );

    const numeroPreventivo = sourceNumeroPreventivo;
    const sourceCustomerType = String(
      source['tipoCliente'] ||
        source['tipoPreventivo'] ||
        this.globalService.getDefaultQuoteType(''),
    ).trim();
    const sourceCustomerName = this.globalService.getRecordDisplayName('customer', source);
    const sourceCustomerPhone = String(
      this.globalService.getRecordValueByRole('customer', source, 'customerPhone') || '',
    );
    const sourceCustomerEmail = String(
      this.globalService.getRecordValueByRole('customer', source, 'customerEmail') || '',
    );

    this.http
      .post<{
        message: string;
        numeroCliente: string;
        signedQuoteArchived?: boolean;
        signedQuoteArchivePath?: string | null;
        signedQuoteArchiveError?: string | null;
      }>(this.globalService.url + 'customers/add', body, { headers: this.globalService.headers })
      .subscribe({
        next: (res) => {
          const numeroCliente = res?.numeroCliente;
          const finalizeCustomerCreation = () => {
            if (res?.signedQuoteArchiveError) {
              this.popup.showError(
                `Cliente creato, ma non siamo riusciti ad archiviare il preventivo firmato: ${res.signedQuoteArchiveError}`,
                'Archiviazione preventivo',
              );
            } else if (res?.signedQuoteArchived) {
              this.popup.show(
                `Cliente creato e preventivo firmato archiviato in Documenti cliente > ${res.signedQuoteArchivePath || 'Preventivi Firmati'}`,
                'Cliente creato',
                'success',
              );
            }

            if (numeroPreventivo && numeroCliente && this.globalService.canCreateCalendarEvents()) {
              const customerEventCategory =
                this.globalService.getCustomerLinkedAppointmentCategory(sourceCustomerType);
              if (!customerEventCategory) {
                this.router.navigateByUrl('/homeAdmin/listCustomer', { replaceUrl: true });
                return;
              }
              this.autoInspectionService.pendingCustomerEvent = true;
              this.autoInspectionService.numeroCliente = numeroCliente;
              this.autoInspectionService.customerType = sourceCustomerType;
              this.autoInspectionService.customerEventCategory = customerEventCategory;
              this.autoInspectionService.displayName = sourceCustomerName;
              this.autoInspectionService.telefono = sourceCustomerPhone;
              this.autoInspectionService.customerEventDescription = [
                sourceCustomerName ? `Cliente ${sourceCustomerName}` : '',
                sourceCustomerPhone ? `Telefono: ${sourceCustomerPhone}` : '',
                sourceCustomerEmail ? `Email: ${sourceCustomerEmail}` : '',
              ].filter(Boolean).join('   ');
              this.router.navigateByUrl('/homeAdmin/calendarHome', { replaceUrl: true });
              return;
            }

            this.router.navigateByUrl('/homeAdmin/listCustomer', { replaceUrl: true });
          };

          const saveEquipmentRequirementsAndFinalize = () => {
            const equipmentRequirements = this.buildEquipmentRequirements();
            if (!numeroCliente || !equipmentRequirements.length) {
              finalizeCustomerCreation();
              return;
            }

            this.http
              .post(
                this.globalService.url + `equipment/customer/${numeroCliente}`,
                { requirements: equipmentRequirements },
                { headers: this.globalService.headers },
              )
              .subscribe({
                next: () => finalizeCustomerCreation(),
                error: () => finalizeCustomerCreation(),
              });
          };

          const saveRequirementsAndFinalize = () => {
            const requirements = this.buildStaffRequirements();
            if (!numeroCliente || !requirements.length) {
              saveEquipmentRequirementsAndFinalize();
              return;
            }

            this.http
              .post(
                this.globalService.url + `admin/employee-categories/customer/${numeroCliente}`,
                { requirements },
                { headers: this.globalService.headers },
              )
              .subscribe({
                next: () => saveEquipmentRequirementsAndFinalize(),
                error: () => saveEquipmentRequirementsAndFinalize(),
              });
          };

          this.customerModelService.reset();

          if (numeroPreventivo && numeroCliente) {
            this.http
              .post(
                this.globalService.url + 'customers/notes/copyFromQuote',
                { numeroPreventivo, numeroCliente },
                { headers: this.globalService.headers },
              )
              .subscribe({
                next: () => saveRequirementsAndFinalize(),
                error: () => saveRequirementsAndFinalize(),
              });
          } else {
            saveRequirementsAndFinalize();
          }
        },
        error: (err) => {
          this.popup.showError(this.parseServerError(err));
        },
      });
  }

  back() {
    this.customerModelService.reset();
    this.router.navigateByUrl('/homeAdmin/listCustomer');
  }

  private parseServerError(err: any): string {
    try {
      const body =
        typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
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
}
