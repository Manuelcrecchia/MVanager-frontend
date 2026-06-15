import { Injectable } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { AuthServiceService } from '../auth-service.service';
import { TenantService } from './tenant.service';
import { environment } from '../../environments/environment';
import { PopupServiceService } from '../componenti/popup/popup-service.service';

interface TenantBackendConfig {
  id: string;
  companyName: string;
  appointments?: TenantAppointmentsConfig;
  features?: string[];
  employeeFeatures?: Record<string, boolean>;
  permissions?: {
    available?: string[];
    permissions?: string[];
    disabled?: string[];
    disabledPermissions?: string[];
  };
  leaveConfig?: {
    categories?: TenantLeaveCategoryConfig[];
  };
  quoteConfig?: TenantQuoteConfig;
}

export interface TenantAppointmentCategoryConfig {
  key: string;
  label: string;
  color?: string;
  source?: 'none' | 'customers' | 'quotes';
  customerType?: string;
  forShifts?: boolean;
  withCustomerLink?: boolean;
  inspection?: boolean;
  serviceOrder?: boolean;
  defaultForTenant?: boolean;
  keyRequired?: boolean;
}

export interface TenantAppointmentsConfig {
  categories?: string[];
  categoryDetails?: TenantAppointmentCategoryConfig[];
  categoriesForShifts?: string[];
  categoriesWithCustomerLink?: string[];
  keyRequiredCategories?: string[];
  keyRequiredFromCustomer?: boolean;
  defaultCategory?: string;
}

export interface TenantLeaveCategoryConfig {
  key: string;
  label: string;
  requiresAttachment?: boolean;
  usesAdvanceLimit?: boolean;
}

export interface TenantQuoteTypeConfig {
  key: string;
  label: string;
  templateKey?: string;
  default?: boolean;
}

export interface TenantFieldMappingFieldConfig {
  key: string;
  label: string;
  dbColumn: string;
  type?: string;
  section?: string;
  enumValues?: string;
  defaultValue?: string;
  pdfFieldKey?: string;
  displayRole?: string;
  visibleWhen?: {
    field?: string;
    value?: string;
  };
  required?: boolean;
  visible?: boolean;
}

export interface TenantFieldMappingConfig {
  quote?: {
    fields?: TenantFieldMappingFieldConfig[];
  };
  customer?: {
    fields?: TenantFieldMappingFieldConfig[];
  };
  quoteToCustomer?: Array<{
    from: string;
    to: string;
  }>;
}

export interface TenantQuoteConfig {
  validationProfile?: string;
  defaultType?: string;
  types?: TenantQuoteTypeConfig[];
  fieldMapping?: TenantFieldMappingConfig;
}

@Injectable({
  providedIn: 'root',
})
export class GlobalService {
  version = '4.3';
  private tenantConfig: TenantBackendConfig | null = null;
  private tenantConfigPromise: Promise<TenantBackendConfig | null> | null = null;

  constructor(
    private authService: AuthServiceService,
    private tenantService: TenantService,
    private popup: PopupServiceService,
  ) {}

  get forMobile(): boolean {
    return Capacitor.getPlatform() !== 'web';
  }

  get url(): string {
    return environment.apiUrl || environment.mobileDevApiUrl;
  }

  checkVersion(): Promise<boolean> {
    return new Promise((resolve) => {
      const platform = this.forMobile ? 'mobile' : 'web';
      const url =
        this.url +
        `api/version?app=MVanager&platform=${platform}&version=${encodeURIComponent(this.version)}`;

      fetch(url, {
        headers: {
          'X-Tenant-Id': this.tenantService.tenant,
        },
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          const supported =
            typeof data.supported === 'boolean'
              ? data.supported
              : data.version === this.version;

          if (!supported) {
            const allowed = Array.isArray(data.allowedVersions)
              ? data.allowedVersions.join(', ')
              : data.version;
            this.popup.showError(
              `Versione non valida!\nApp: ${this.version}\nVersioni consentite: ${allowed}`,
              'Versione app non supportata',
            );
            resolve(false);
            this.logout();
          } else {
            resolve(true);
          }
        })
        .catch((error) => {
          console.error('Errore verifica versione server', url, error);
          this.popup.showError(
            `Impossibile verificare la versione del server.\n${url}`,
            'Server non raggiungibile',
          );
          resolve(false);
        });
    });
  }

  get token(): string {
    return this.authService.token || '';
  }

  get userCode(): string {
    return this.authService.userCode || '';
  }

  get permissions(): string[] {
    return this.authService.permissions || [];
  }

  hasPermission(key: string): boolean {
    const tenantPermissions = this.tenantConfig?.permissions;
    const available =
      tenantPermissions?.available || tenantPermissions?.permissions || [];
    const disabled =
      tenantPermissions?.disabled || tenantPermissions?.disabledPermissions || [];

    if (available.length) {
      return available.includes(key) && this.permissions.includes(key);
    }

    if (disabled.includes(key)) {
      return false;
    }

    return this.permissions.includes(key);
  }

  loadTenantConfig(
    force = false,
    options: { showError?: boolean } = {},
  ): Promise<TenantBackendConfig | null> {
    const showError = options.showError !== false;

    if (!force && this.tenantConfig) {
      return Promise.resolve(this.tenantConfig);
    }

    if (!force && this.tenantConfigPromise) {
      return this.tenantConfigPromise;
    }

    const url = this.url + `tenant/config${force ? '?refresh=true' : ''}`;
    this.tenantConfigPromise = fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'X-Tenant-Id': this.tenantService.tenant,
      },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Configurazione azienda non disponibile (HTTP ${res.status}).`);
        }
        return res.json();
      })
      .then((config: TenantBackendConfig) => {
        this.tenantConfig = config || null;
        return this.tenantConfig;
      })
      .catch((error) => {
        console.error('[GlobalService] Errore tenant/config:', error);
        if (force) {
          this.tenantConfig = null;
        }
        if (showError) {
          this.popup.showError(
            this.popup.parseServerError(
              error,
              'Impossibile caricare la configurazione azienda. Riprova più tardi.',
            ),
            'Configurazione azienda',
          );
        }
        return this.tenantConfig;
      })
      .finally(() => {
        this.tenantConfigPromise = null;
      });

    return this.tenantConfigPromise;
  }

  clearTenantConfig(): void {
    this.tenantConfig = null;
    this.tenantConfigPromise = null;
  }

  isTenantFeatureEnabled(feature: string): boolean {
    return this.hasTenantFeature(feature);
  }

  hasTenantFeature(feature: string): boolean {
    const purchasedFeatures = this.tenantConfig?.features;
    if (Array.isArray(purchasedFeatures) && purchasedFeatures.length > 0) {
      if (!purchasedFeatures.includes(feature)) {
        return false;
      }
    }

    const employeeFeatures = this.tenantConfig?.employeeFeatures;
    if (
      employeeFeatures &&
      Object.prototype.hasOwnProperty.call(employeeFeatures, feature)
    ) {
      return employeeFeatures[feature] !== false;
    }

    return true;
  }

  get tenantCompanyName(): string {
    return this.tenantConfig?.companyName || this.tenantService.tenantLabel;
  }

  getTenantQuoteConfig(): TenantQuoteConfig | null {
    return this.tenantConfig?.quoteConfig || null;
  }

  getTenantAppointmentsConfig(): TenantAppointmentsConfig | null {
    return this.tenantConfig?.appointments || null;
  }

  getAppointmentCategoryDetails(): TenantAppointmentCategoryConfig[] {
    const appointments = this.getTenantAppointmentsConfig();
    if (Array.isArray(appointments?.categoryDetails) && appointments.categoryDetails.length) {
      return appointments.categoryDetails;
    }

    return (appointments?.categories || []).map((key) => ({
      key,
      label: key,
    }));
  }

  getDefaultAppointmentCategory(fallback = ''): string {
    const appointments = this.getTenantAppointmentsConfig();
    return (
      appointments?.defaultCategory ||
      appointments?.categoryDetails?.find((category) => category.defaultForTenant)?.key ||
      appointments?.categories?.[0] ||
      fallback
    );
  }

  getLeaveCategories(): TenantLeaveCategoryConfig[] {
    const categories = this.tenantConfig?.leaveConfig?.categories;
    if (!Array.isArray(categories)) return [];
    return categories.map((category) => {
      const key = String(category?.key || category?.label || '').trim();
      return {
        key,
        label: String(category?.label || key).trim(),
        requiresAttachment: category?.requiresAttachment === true,
        usesAdvanceLimit: category?.usesAdvanceLimit === true,
      };
    }).filter((category) => category.key);
  }

  getQuoteTypes(): TenantQuoteTypeConfig[] {
    return this.getTenantQuoteConfig()?.types || [];
  }

  getDefaultQuoteType(fallback = ''): string {
    const quoteConfig = this.getTenantQuoteConfig();
    return (
      quoteConfig?.defaultType ||
      quoteConfig?.types?.find((type) => type.default)?.key ||
      quoteConfig?.types?.[0]?.key ||
      fallback
    );
  }

  getFieldMappingFields(scope: 'quote' | 'customer'): TenantFieldMappingFieldConfig[] {
    const fields = this.getTenantQuoteConfig()?.fieldMapping?.[scope]?.fields;
    return Array.isArray(fields) ? fields : [];
  }

  isTechnicalField(scope: 'quote' | 'customer', fieldOrKey: TenantFieldMappingFieldConfig | string): boolean {
    const value = typeof fieldOrKey === 'string'
      ? fieldOrKey
      : fieldOrKey?.dbColumn || fieldOrKey?.key || '';
    const key = String(value || '').trim();
    const technicalFields = scope === 'quote'
      ? ['numeroPreventivo', 'codiceOperatore', 'data', 'complete']
      : ['numeroCliente', 'codiceOperatore', 'data', 'password'];
    return technicalFields.includes(key);
  }

  getVisibleFieldMappingFields(
    scope: 'quote' | 'customer',
    source?: Record<string, any>,
  ): TenantFieldMappingFieldConfig[] {
    return this.getFieldMappingFields(scope).filter(
      (field) => !!field?.dbColumn &&
        !this.isTechnicalField(scope, field) &&
        field.visible !== false &&
        (!source || this.matchesVisibleWhen(scope, field, source)),
    );
  }

  hasConfiguredFieldMapping(scope: 'quote' | 'customer'): boolean {
    return this.getVisibleFieldMappingFields(scope).length > 0;
  }

  getDynamicInputType(field: TenantFieldMappingFieldConfig): string {
    const type = String(field?.type || '').trim().toLowerCase();
    if (['number', 'date', 'email', 'tel'].includes(type)) {
      return type;
    }
    return 'text';
  }

  getEnumOptions(field: TenantFieldMappingFieldConfig): string[] {
    return String(field?.enumValues || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }

  getFieldConfig(
    scope: 'quote' | 'customer',
    keyOrDbColumn: string,
  ): TenantFieldMappingFieldConfig | null {
    const normalized = String(keyOrDbColumn || '').trim();
    if (!normalized) return null;

    return (
      this.getFieldMappingFields(scope).find(
        (field) => field.key === normalized || field.dbColumn === normalized,
      ) || null
    );
  }

  isFieldVisible(scope: 'quote' | 'customer', keyOrDbColumn: string): boolean {
    const fields = this.getFieldMappingFields(scope);
    const field = this.getFieldConfig(scope, keyOrDbColumn);
    if (fields.length > 0 && !field) {
      return false;
    }
    if (this.isTechnicalField(scope, field || keyOrDbColumn)) {
      return false;
    }
    return field ? field.visible !== false : true;
  }

  hasAnyFieldVisible(
    scope: 'quote' | 'customer',
    keysOrDbColumns: string[],
  ): boolean {
    return keysOrDbColumns.some((key) => this.isFieldVisible(scope, key));
  }

  isFieldRequired(scope: 'quote' | 'customer', keyOrDbColumn: string): boolean {
    return this.getFieldConfig(scope, keyOrDbColumn)?.required === true;
  }

  getFieldLabel(
    scope: 'quote' | 'customer',
    keyOrDbColumn: string,
    fallback: string,
  ): string {
    return this.getFieldConfig(scope, keyOrDbColumn)?.label || fallback;
  }

  getRecordDisplayName(
    scope: 'quote' | 'customer',
    record: Record<string, any>,
  ): string {
    if (!record) return '';

    const roleField = this.getVisibleFieldMappingFields(scope).find((field) => {
      const role = String(field.displayRole || '').trim();
      return scope === 'quote'
        ? role === 'quoteTitle'
        : role === 'customerTitle';
    });
    const roleValue = roleField ? this.readMappedValue(record, roleField) : undefined;
    if (!this.isEmptyFieldValue(roleValue)) {
      return String(roleValue).trim();
    }

    const visibleFields = this.getVisibleFieldMappingFields(scope);
    for (const field of visibleFields) {
      const value = this.readMappedValue(record, field);
      if (!this.isEmptyFieldValue(value)) {
        return String(value).trim();
      }
    }

    return '';
  }

  getRecordValueByRole(
    scope: 'quote' | 'customer',
    record: Record<string, any>,
    displayRole: string,
  ): any {
    const role = String(displayRole || '').trim();
    if (!record || !role) return undefined;
    const roleField = this.getFieldMappingFields(scope).find(
      (field) => String(field.displayRole || '').trim() === role,
    );
    return roleField ? this.readMappedValue(record, roleField) : undefined;
  }

  getMissingRequiredFields(
    scope: 'quote' | 'customer',
    source: Record<string, any>,
  ): string[] {
    return this.getFieldMappingFields(scope)
      .filter((field) => !this.isTechnicalField(scope, field) &&
        field.visible !== false &&
        field.required === true &&
        this.matchesVisibleWhen(scope, field, source))
      .filter((field) => this.isEmptyFieldValue(this.readMappedValue(source, field)))
      .map((field) => field.label || field.dbColumn || field.key);
  }

  applyFieldDefaults(
    scope: 'quote' | 'customer',
    target: Record<string, any>,
  ): void {
    this.getFieldMappingFields(scope).forEach((field) => {
      if (!field.dbColumn || this.isTechnicalField(scope, field) || field.visible === false) {
        return;
      }
      if (!this.matchesVisibleWhen(scope, field, target)) {
        return;
      }

      const defaultValue = field.defaultValue;
      if (defaultValue === undefined || defaultValue === null || defaultValue === '') {
        return;
      }

      const currentValue = this.readMappedValue(target, field);
      if (!this.isEmptyFieldValue(currentValue)) {
        return;
      }

      target[field.dbColumn] = this.castDefaultValue(defaultValue, field);
      if (field.key && field.key !== field.dbColumn) {
        target[field.key] = target[field.dbColumn];
      }
    });
  }

  clearHiddenFieldValues(
    scope: 'quote' | 'customer',
    target: Record<string, any>,
  ): void {
    this.getFieldMappingFields(scope).forEach((field) => {
      if (!field.dbColumn || this.isTechnicalField(scope, field) || field.visible === false) return;
      if (this.matchesVisibleWhen(scope, field, target)) return;

      target[field.dbColumn] = '';
      if (field.key && field.key !== field.dbColumn) {
        target[field.key] = '';
      }
    });
  }

  applyFieldMappingToPayload<T extends Record<string, any>>(
    scope: 'quote' | 'customer',
    payload: T,
    source: Record<string, any>,
  ): T {
    const fields = this.getFieldMappingFields(scope);
    if (!fields.length) {
      return payload;
    }

    const mappedPayload: Record<string, any> = {};
    [
      'numeroPreventivo',
      'numeroCliente',
      'codiceOperatore',
      'data',
      'complete',
      'stato',
    ].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        mappedPayload[key] = payload[key];
      }
    });

    fields.forEach((field) => {
      if (!field.dbColumn || this.isTechnicalField(scope, field) || field.visible === false) {
        return;
      }
      if (!this.matchesVisibleWhen(scope, field, source)) {
        return;
      }

      const value = this.readMappedValue(source, field);
      if (value !== undefined) {
        mappedPayload[field.dbColumn] = value;
      }
    });

    return mappedPayload as T;
  }

  getRecordValueForField(
    source: Record<string, any>,
    field: TenantFieldMappingFieldConfig,
  ): any {
    return this.readMappedValue(source, field);
  }

  private readMappedValue(
    source: Record<string, any>,
    field: TenantFieldMappingFieldConfig,
  ): any {
    if (!source) return undefined;
    if (Object.prototype.hasOwnProperty.call(source, field.dbColumn)) {
      return source[field.dbColumn];
    }
    if (Object.prototype.hasOwnProperty.call(source, field.key)) {
      return source[field.key];
    }
    return undefined;
  }

  private matchesVisibleWhen(
    scope: 'quote' | 'customer',
    field: TenantFieldMappingFieldConfig,
    source: Record<string, any>,
  ): boolean {
    const conditionField = String(field.visibleWhen?.field || '').trim();
    const conditionValue = String(field.visibleWhen?.value || '').trim();
    if (!conditionField) return true;

    const sourceField = this.getFieldConfig(scope, conditionField) || {
      key: conditionField,
      dbColumn: conditionField,
      label: conditionField,
    };
    const currentValue = this.resolveVisibleWhenValue(scope, source, conditionField, sourceField);

    return this.normalizeConditionValue(currentValue) === this.normalizeConditionValue(conditionValue);
  }

  private resolveVisibleWhenValue(
    scope: 'quote' | 'customer',
    source: Record<string, any>,
    conditionField: string,
    sourceField: TenantFieldMappingFieldConfig,
  ): any {
    const candidates: unknown[] = [];
    const pushFieldValue = (key: string | undefined): void => {
      const normalizedKey = String(key || '').trim();
      if (!normalizedKey) return;
      if (Object.prototype.hasOwnProperty.call(source, normalizedKey)) {
        candidates.push(source[normalizedKey]);
      }
    };

    pushFieldValue(conditionField);
    pushFieldValue(sourceField.key);
    pushFieldValue(sourceField.dbColumn);

    const sourceRole = String(sourceField.displayRole || '').trim();
    if (scope === 'quote' && (conditionField === 'tipoPreventivo' || sourceRole === 'quoteType')) {
      const quoteTypeValue = this.getRecordValueByRole('quote', source, 'quoteType');
      if (quoteTypeValue !== undefined) candidates.push(quoteTypeValue);
      pushFieldValue('tipoPreventivo');
    }

    return candidates.find((value) => value !== undefined && value !== null);
  }

  private normalizeConditionValue(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private normalizeFieldLookup(value: unknown): string {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  private castDefaultValue(
    value: string,
    field: TenantFieldMappingFieldConfig,
  ): any {
    const type = String(field?.type || '').trim().toLowerCase();
    if (type === 'boolean') {
      const normalized = String(value).trim().toLowerCase();
      return ['1', 'true', 'si', 'sì', 'yes'].includes(normalized);
    }
    if (type === 'number' || type === 'money') {
      const parsed = Number(String(value).replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  }

  private isEmptyFieldValue(value: any): boolean {
    if (value == null) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  get email(): string {
    return this.authService.email || '';
  }

  get headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${this.token}`,
      'X-Tenant-Id': this.tenantService.tenant,
    });
  }

  logout(): void {
    this.clearTenantConfig();
    this.authService.logout();
  }
}

export function resolveApiBaseUrl(options: {
  forMobile: boolean;
  tenant: string;
  host: string;
  selectedCompanyServerUrl?: string | null;
}): string {
  return environment.apiUrl || environment.mobileDevApiUrl;
}
