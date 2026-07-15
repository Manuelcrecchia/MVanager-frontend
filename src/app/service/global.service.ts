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
  attendanceConfig?: {
    workCategoryLabel?: string;
  };
  stampingConfig?: TenantStampingConfig;
  internalWarehouseConfig?: TenantInternalWarehouseConfig;
  quoteConfig?: TenantQuoteConfig;
  addressConfig?: TenantCustomerAddressConfig;
  contractConfig?: TenantContractConfig;
  employeeConfig?: TenantEmployeeConfig;
  routePlanningConfig?: TenantRoutePlanningConfig;
  invoiceConfig?: TenantInvoiceConfig;
  mapsConfig?: TenantMapsConfig;
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

export interface TenantStampingConfig {
  mode?: 'customer_tag' | 'warehouse';
  warehouseTagId?: string;
  warehouseLocationId?: string;
  warehouseLabel?: string;
  warehouseLocations?: TenantWarehouseStampingLocation[];
  allowCustomerTagFallback?: boolean;
  compareWithShifts?: boolean;
  splitWarehouseStampings?: boolean;
}

export interface TenantWarehouseStampingLocation {
  tagId: string;
  locationId: string;
  label: string;
}

export interface TenantInternalWarehouseConfig {
  mobileMode?: 'simple' | 'advanced';
  barcodeMode?: 'barcode_required' | 'auto_internal_code';
  internalCodePrefix?: string;
  serviceOrderFlow?: {
    enabled?: boolean;
    requireServiceOrderForOutputs?: boolean;
    documentEnabled?: boolean;
    documentLabel?: string;
    pdfTemplateKey?: string;
  };
}

export interface TenantQuoteTypeConfig {
  key: string;
  label: string;
  templateKey?: string;
  default?: boolean;
}

export interface TenantFieldCalculationConfig {
  mode?: string;
  sourceFields?: string | string[];
  vatField?: string;
  vatRate?: number | string | null;
  vatValueRates?: Record<string, number> | string | null;
  vatRatesByValue?: Record<string, number> | string | null;
  decimals?: number | string | null;
}

export interface TenantFieldMappingFieldConfig {
  key: string;
  label: string;
  dbColumn: string;
  type?: string;
  section?: string;
  enumValues?: string;
  validationRule?: string;
  defaultValue?: string;
  pdfFieldKey?: string;
  displayRole?: string;
  visibleWhen?: {
    field?: string;
    value?: string;
  };
  required?: boolean;
  visible?: boolean;
  calculation?: TenantFieldCalculationConfig;
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
  addressConfig?: TenantCustomerAddressConfig;
}

export interface TenantCustomerAddressFieldSet {
  address?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
}

export interface TenantCustomerAddressConfig {
  workSameAsBilling?: boolean;
  billing?: TenantCustomerAddressFieldSet;
  work?: TenantCustomerAddressFieldSet;
}

export interface TenantContractConfig {
  templateKey?: string;
  acceptance?: {
    expiryDays?: number | null;
    publicBaseUrl?: string;
    publicAppBaseUrl?: string;
  };
  fieldMapping?: {
    fields?: TenantFieldMappingFieldConfig[];
  };
  employeeMapping?: Array<{
    from: string;
    to: string;
  }>;
}

export interface TenantEmployeeFieldConfig {
  key: string;
  label: string;
  dbColumn?: string;
  type?: string;
  section?: string;
  enumValues?: string;
  validationRule?: string;
  defaultValue?: string;
  displayRole?: string;
  visibleWhen?: {
    field?: string;
    value?: string;
  };
  required?: boolean;
  visible?: boolean;
  locked?: boolean;
  system?: boolean;
}

export interface TenantEmployeeConfig {
  fields?: TenantEmployeeFieldConfig[];
}

export interface TenantRoutePlanningConfig {
  employeeSelfTransportField?: string;
  minimizeSplitRejoins?: boolean;
  requireSelfTransportForSoloLegs?: boolean;
  splitPenaltyMinutes?: number | string | null;
  rejoinPenaltyMinutes?: number | string | null;
}

export interface TenantInvoiceConfig {
  enabled?: boolean;
  issuer?: {
    country?: string;
    vatNumber?: string;
    fiscalCode?: string;
    name?: string;
    taxRegime?: string;
    address?: string;
    zip?: string;
    city?: string;
    province?: string;
  };
  provider?: {
    type?: string;
    environment?: string;
  };
}

export interface TenantMapsConfig {
  googleMapsApiKey?: string;
  googleMapsMapId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class GlobalService {
  version = '5.3';
  private tenantConfig: TenantBackendConfig | null = null;
  private tenantConfigPromise: Promise<TenantBackendConfig | null> | null =
    null;

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
            this.popup.showError(
              this.buildUnsupportedVersionMessage(
                data.allowedVersions || data.version,
              ),
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
            this.buildVersionCheckFailedMessage(),
            'Versione app',
          );
          resolve(false);
        });
    });
  }

  private buildUnsupportedVersionMessage(allowedVersions: unknown): string {
    return [
      "AGGIORNA O CONTATTA L'ASSISTENZA",
      `Versione app in uso: ${this.version}`,
      `Versioni disponibili: ${this.formatAllowedVersions(allowedVersions)}`,
    ].join('\n');
  }

  private buildVersionCheckFailedMessage(): string {
    return [
      "IMPOSSIBILE VERIFICARE LA VERSIONE DELL'APP",
      `Versione app in uso: ${this.version}`,
      'Versioni disponibili: non verificabili',
      "Controlla la connessione o contatta l'assistenza.",
    ].join('\n');
  }

  private formatAllowedVersions(allowedVersions: unknown): string {
    if (Array.isArray(allowedVersions)) {
      return allowedVersions.length
        ? allowedVersions.join(', ')
        : 'non indicate';
    }

    const value = String(allowedVersions || '').trim();
    return value || 'non indicate';
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
      tenantPermissions?.disabled ||
      tenantPermissions?.disabledPermissions ||
      [];

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
          const error = new Error(
            `Configurazione azienda non disponibile (HTTP ${res.status}).`,
          ) as Error & { status?: number };
          error.status = res.status;
          throw error;
        }
        return res.json();
      })
      .then((config: TenantBackendConfig) => {
        this.tenantConfig = config || null;
        return this.tenantConfig;
      })
      .catch((error) => {
        console.error('[GlobalService] Errore tenant/config:', error);
        const status = Number((error as { status?: number })?.status || 0);
        if (force && !this.tenantConfig && [401, 403, 404].includes(status)) {
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

  isFeatureAvailableInApp(feature: string): boolean {
    if (
      feature === 'invoices' &&
      (environment as { invoicesEnabled?: boolean }).invoicesEnabled !== true
    ) {
      return false;
    }

    return this.hasTenantFeature(feature);
  }

  hasTenantFeature(feature: string): boolean {
    const purchasedFeatures = this.tenantConfig?.features;
    if (Array.isArray(purchasedFeatures)) {
      if (purchasedFeatures.includes(feature)) return true;
      if (
        [
          'employeeDeadlines',
          'vehicleDeadlines',
          'equipmentDeadlines',
          'customerDeadlines',
          'internalDeadlines',
        ].includes(feature)
      ) {
        return purchasedFeatures.includes('deadlines');
      }
      if (feature === 'deadlines') {
        return purchasedFeatures.some((item) =>
          [
            'deadlines',
            'employeeDeadlines',
            'vehicleDeadlines',
            'equipmentDeadlines',
            'customerDeadlines',
            'internalDeadlines',
          ].includes(item),
        );
      }
      if (feature === 'documents') {
        return purchasedFeatures.some((item) =>
          [
            'documents',
            'internalDocuments',
            'employeeDocuments',
            'customerDocuments',
          ].includes(item),
        );
      }
      if (feature === 'internalDocuments') {
        return purchasedFeatures.includes('documents');
      }
      if (feature === 'employeeDocuments') {
        return (
          purchasedFeatures.includes('documents') &&
          purchasedFeatures.includes('employees')
        );
      }
      if (feature === 'customerDocuments') {
        return (
          purchasedFeatures.includes('documents') &&
          purchasedFeatures.includes('customers')
        );
      }
      return false;
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

  canCreateCustomers(): boolean {
    return (
      this.hasTenantFeature('customers') &&
      this.hasPermission('CUSTOMERS_MANAGE')
    );
  }

  canCreateCalendarEvents(): boolean {
    return (
      this.hasTenantFeature('calendar') &&
      this.hasPermission('CALENDAR_EVENT_MANAGE')
    );
  }

  get tenantCompanyName(): string {
    return this.tenantConfig?.companyName || this.tenantService.tenantLabel;
  }

  getTenantQuoteConfig(): TenantQuoteConfig | null {
    return this.tenantConfig?.quoteConfig || null;
  }

  getTenantContractConfig(): TenantContractConfig | null {
    return this.tenantConfig?.contractConfig || null;
  }

  getTenantEmployeeConfig(): TenantEmployeeConfig | null {
    return this.tenantConfig?.employeeConfig || null;
  }

  getTenantRoutePlanningConfig(): TenantRoutePlanningConfig | null {
    return this.tenantConfig?.routePlanningConfig || null;
  }

  getEmployeeSelfTransportField(): string {
    return (
      String(
        this.getTenantRoutePlanningConfig()?.employeeSelfTransportField ||
          'automunito',
      ).trim() || 'automunito'
    );
  }

  isEmployeeSelfTransported(
    employee: Record<string, any> | null | undefined,
  ): boolean {
    if (!employee) return false;
    const value =
      employee[this.getEmployeeSelfTransportField()] ?? employee['automunito'];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    return ['1', 'true', 'yes', 'si', 'sì', 'on'].includes(
      String(value || '')
        .trim()
        .toLowerCase(),
    );
  }

  getContractFields(): TenantFieldMappingFieldConfig[] {
    const fields = this.getTenantContractConfig()?.fieldMapping?.fields;
    return Array.isArray(fields)
      ? fields.filter((field) => field?.visible !== false)
      : [];
  }

  getTenantAppointmentsConfig(): TenantAppointmentsConfig | null {
    return this.tenantConfig?.appointments || null;
  }

  getAppointmentCategoryDetails(): TenantAppointmentCategoryConfig[] {
    const appointments = this.getTenantAppointmentsConfig();
    if (
      Array.isArray(appointments?.categoryDetails) &&
      appointments.categoryDetails.length
    ) {
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
      appointments?.categoryDetails?.find(
        (category) => category.defaultForTenant,
      )?.key ||
      appointments?.categories?.[0] ||
      fallback
    );
  }

  getCustomerLinkedAppointmentCategory(
    customerType = '',
    fallback = '',
  ): string {
    const appointments = this.getTenantAppointmentsConfig();
    const details = Array.isArray(appointments?.categoryDetails)
      ? appointments.categoryDetails
      : [];
    const linkedDetails = details.filter(
      (category) =>
        category?.withCustomerLink === true ||
        category?.source === 'customers' ||
        category?.serviceOrder === true,
    );
    const normalizedCustomerType = String(customerType || '')
      .trim()
      .toLowerCase();

    if (normalizedCustomerType) {
      const exactMatch = linkedDetails.find(
        (category) =>
          String(category?.customerType || '')
            .trim()
            .toLowerCase() === normalizedCustomerType,
      );
      if (exactMatch?.key) return exactMatch.key;
    }

    const genericCustomerCategory = linkedDetails.find(
      (category) => !String(category?.customerType || '').trim(),
    );
    if (genericCustomerCategory?.key) return genericCustomerCategory.key;

    return appointments?.categoriesWithCustomerLink?.[0] || fallback;
  }

  getLeaveCategories(): TenantLeaveCategoryConfig[] {
    const categories = this.tenantConfig?.leaveConfig?.categories;
    if (!Array.isArray(categories)) return [];
    return categories
      .map((category) => {
        const key = String(category?.key || category?.label || '').trim();
        return {
          key,
          label: String(category?.label || key).trim(),
          requiresAttachment: category?.requiresAttachment === true,
          usesAdvanceLimit: category?.usesAdvanceLimit === true,
        };
      })
      .filter((category) => category.key);
  }

  getAttendanceWorkCategoryLabel(fallback = 'Lavoro'): string {
    const label = String(
      this.tenantConfig?.attendanceConfig?.workCategoryLabel ||
        fallback ||
        'Lavoro',
    ).trim();
    return label || 'Lavoro';
  }

  getTenantStampingConfig(): TenantStampingConfig {
    const rawConfig = this.tenantConfig?.stampingConfig || {};
    const legacyLocation: TenantWarehouseStampingLocation = {
      tagId:
        String(rawConfig.warehouseTagId || 'MAGAZZINO').trim() || 'MAGAZZINO',
      locationId:
        String(rawConfig.warehouseLocationId || '__warehouse__').trim() ||
        '__warehouse__',
      label:
        String(rawConfig.warehouseLabel || 'Magazzino').trim() || 'Magazzino',
    };
    const configuredLocations = Array.isArray(rawConfig.warehouseLocations)
      ? rawConfig.warehouseLocations
          .map((location: any) => ({
            tagId: String(
              location?.tagId || location?.warehouseTagId || '',
            ).trim(),
            locationId: String(
              location?.locationId || location?.warehouseLocationId || '',
            ).trim(),
            label: String(
              location?.label || location?.warehouseLabel || '',
            ).trim(),
          }))
          .filter(
            (location: TenantWarehouseStampingLocation) =>
              location.tagId || location.locationId || location.label,
          )
      : [];
    const warehouseLocations = configuredLocations.length
      ? configuredLocations
      : [legacyLocation];
    const primaryLocation = warehouseLocations[0] || legacyLocation;

    return {
      mode: rawConfig.mode === 'warehouse' ? 'warehouse' : 'customer_tag',
      warehouseTagId: primaryLocation.tagId,
      warehouseLocationId: primaryLocation.locationId,
      warehouseLabel: primaryLocation.label,
      warehouseLocations,
      allowCustomerTagFallback: rawConfig.allowCustomerTagFallback === true,
      compareWithShifts: rawConfig.compareWithShifts !== false,
      splitWarehouseStampings: rawConfig.splitWarehouseStampings === true,
    };
  }

  isCustomerTagStampingMode(): boolean {
    return this.getTenantStampingConfig().mode !== 'warehouse';
  }

  getTenantInternalWarehouseConfig(): TenantInternalWarehouseConfig {
    const rawConfig = this.tenantConfig?.internalWarehouseConfig || {};
    const flow = rawConfig.serviceOrderFlow || {};
    return {
      mobileMode: rawConfig.mobileMode === 'advanced' ? 'advanced' : 'simple',
      barcodeMode:
        rawConfig.barcodeMode === 'auto_internal_code'
          ? 'auto_internal_code'
          : 'barcode_required',
      internalCodePrefix:
        String(rawConfig.internalCodePrefix || 'MAG').trim() || 'MAG',
      serviceOrderFlow: {
        enabled: flow.enabled === true,
        requireServiceOrderForOutputs:
          flow.requireServiceOrderForOutputs === true,
        documentEnabled: flow.documentEnabled === true,
        documentLabel:
          String(flow.documentLabel || 'Materiale consegnato').trim() ||
          'Materiale consegnato',
        pdfTemplateKey:
          String(flow.pdfTemplateKey || 'warehouse_delivery_default').trim() ||
          'warehouse_delivery_default',
      },
    };
  }

  getGoogleMapsConfig(): TenantMapsConfig {
    const config = this.tenantConfig?.mapsConfig || {};
    const envConfig = environment as {
      googleMapsApiKey?: string;
      googleMapsMapId?: string;
    };
    return {
      googleMapsApiKey: String(
        config.googleMapsApiKey || envConfig.googleMapsApiKey || '',
      ).trim(),
      googleMapsMapId: String(
        config.googleMapsMapId || envConfig.googleMapsMapId || '',
      ).trim(),
    };
  }

  getTenantCustomerAddressConfig(): TenantCustomerAddressConfig {
    const explicitConfig =
      this.tenantConfig?.addressConfig ||
      this.getTenantQuoteConfig()?.addressConfig ||
      {};
    const fallbackBilling = this.inferBillingAddressFieldsFromRoles();
    const fallbackWork = this.inferWorkAddressFieldsFromRoles();
    return this.normalizeCustomerAddressConfig(
      explicitConfig,
      fallbackBilling,
      fallbackWork,
    );
  }

  getEffectiveCustomerAddressFields(
    kind: 'work' | 'billing' = 'work',
  ): TenantCustomerAddressFieldSet {
    const config = this.getTenantCustomerAddressConfig();
    if (kind === 'billing') {
      return config.billing || {};
    }
    return config.workSameAsBilling === true
      ? config.billing || {}
      : config.work || {};
  }

  buildCustomerAddress(
    record: Record<string, any>,
    kind: 'work' | 'billing' = 'work',
  ): string {
    if (!record) return '';

    const configuredAddress = this.composeCustomerAddressFromFieldSet(
      record,
      this.getEffectiveCustomerAddressFields(kind),
    );
    if (configuredAddress) return configuredAddress;

    const roleAddress = [
      this.getRecordValueByRole('customer', record, 'customerAddress'),
      this.getRecordValueByRole('customer', record, 'customerZip'),
      this.getRecordValueByRole('customer', record, 'customerCity'),
      this.getRecordValueByRole('customer', record, 'customerProvince'),
      this.getRecordValueByRole('customer', record, 'customerCountry'),
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(', ');
    if (roleAddress) return roleAddress;

    return this.composeCustomerAddressFromLikelyKeys(record);
  }

  private normalizeCustomerAddressConfig(
    config: TenantCustomerAddressConfig,
    fallbackBilling: TenantCustomerAddressFieldSet,
    fallbackWork: TenantCustomerAddressFieldSet = {},
  ): TenantCustomerAddressConfig {
    const billing = this.normalizeCustomerAddressFieldSet(
      config.billing || {},
      fallbackBilling,
    );
    const hasExplicitWorkMode = Object.prototype.hasOwnProperty.call(
      config || {},
      'workSameAsBilling',
    );
    const hasFallbackWork = Object.values(fallbackWork || {}).some(Boolean);
    const workSameAsBilling = hasExplicitWorkMode
      ? config.workSameAsBilling !== false
      : !hasFallbackWork;
    return {
      workSameAsBilling,
      billing,
      work: this.normalizeCustomerAddressFieldSet(
        config.work || {},
        workSameAsBilling ? billing : fallbackWork,
      ),
    };
  }

  private normalizeCustomerAddressFieldSet(
    fieldSet: TenantCustomerAddressFieldSet,
    fallback: TenantCustomerAddressFieldSet = {},
  ): TenantCustomerAddressFieldSet {
    const keys: Array<keyof TenantCustomerAddressFieldSet> = [
      'address',
      'city',
      'province',
      'zip',
      'country',
      'latitude',
      'longitude',
    ];
    return keys.reduce((acc, key) => {
      acc[key] = String(fieldSet?.[key] || fallback?.[key] || '').trim();
      return acc;
    }, {} as TenantCustomerAddressFieldSet);
  }

  private inferBillingAddressFieldsFromRoles(): TenantCustomerAddressFieldSet {
    const fieldKey = (role: string) => {
      const field = this.getFieldMappingFields('customer').find(
        (item) => String(item.displayRole || '').trim() === role,
      );
      return String(field?.dbColumn || field?.key || '').trim();
    };
    return {
      address:
        fieldKey('customerBillingAddress') || fieldKey('customerAddress'),
      city: fieldKey('customerBillingCity') || fieldKey('customerCity'),
      province:
        fieldKey('customerBillingProvince') || fieldKey('customerProvince'),
      zip: fieldKey('customerBillingZip') || fieldKey('customerZip'),
      country:
        fieldKey('customerBillingCountry') || fieldKey('customerCountry'),
      latitude: fieldKey('customerLatitude'),
      longitude: fieldKey('customerLongitude'),
    };
  }

  private inferWorkAddressFieldsFromRoles(): TenantCustomerAddressFieldSet {
    const fieldKey = (role: string) => {
      const field = this.getFieldMappingFields('customer').find(
        (item) => String(item.displayRole || '').trim() === role,
      );
      return String(field?.dbColumn || field?.key || '').trim();
    };
    return {
      address: fieldKey('customerWorkAddress'),
      city: fieldKey('customerWorkCity'),
      province: fieldKey('customerWorkProvince'),
      zip: fieldKey('customerWorkZip'),
      country: fieldKey('customerWorkCountry'),
      latitude: fieldKey('customerWorkLatitude'),
      longitude: fieldKey('customerWorkLongitude'),
    };
  }

  private composeCustomerAddressFromFieldSet(
    record: Record<string, any>,
    fieldSet: TenantCustomerAddressFieldSet,
  ): string {
    const address = this.readCustomerAddressField(record, fieldSet.address);
    const zip = this.readCustomerAddressField(record, fieldSet.zip);
    const city = this.readCustomerAddressField(record, fieldSet.city);
    const province = this.readCustomerAddressField(record, fieldSet.province);
    const country = this.readCustomerAddressField(record, fieldSet.country);
    const cityLine = [zip, city, province].filter(Boolean).join(' ');
    return [address, cityLine, country]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  private readCustomerAddressField(
    record: Record<string, any>,
    fieldKey: string | undefined,
  ): string {
    const key = String(fieldKey || '').trim();
    if (!key || !record) return '';
    const field = this.getFieldConfig('customer', key);
    const value = field
      ? this.readMappedValue(record, field)
      : Object.prototype.hasOwnProperty.call(record, key)
        ? record[key]
        : undefined;
    return String(value || '').trim();
  }

  private composeCustomerAddressFromLikelyKeys(
    record: Record<string, any>,
  ): string {
    const keys = Object.keys(record || {}).filter((key) => {
      const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      return (
        normalized.includes('indirizzo') ||
        normalized.includes('address') ||
        normalized.includes('via') ||
        normalized.includes('citta') ||
        normalized.includes('city') ||
        normalized.includes('cap') ||
        normalized.includes('zip') ||
        normalized.includes('partenza') ||
        normalized.includes('arrivo')
      );
    });
    const departureKeys = keys.filter((key) =>
      key.toLowerCase().includes('partenza'),
    );
    const sourceKeys = departureKeys.length ? departureKeys : keys;
    return [
      ...new Set(
        sourceKeys
          .map((key) => String(record[key] || '').trim())
          .filter((value) => value && value.length > 2),
      ),
    ]
      .slice(0, 5)
      .join(', ');
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

  getFieldMappingFields(
    scope: 'quote' | 'customer',
  ): TenantFieldMappingFieldConfig[] {
    const fields = this.getTenantQuoteConfig()?.fieldMapping?.[scope]?.fields;
    return Array.isArray(fields) ? fields : [];
  }

  isTechnicalField(
    scope: 'quote' | 'customer',
    fieldOrKey: TenantFieldMappingFieldConfig | string,
  ): boolean {
    const value =
      typeof fieldOrKey === 'string'
        ? fieldOrKey
        : fieldOrKey?.dbColumn || fieldOrKey?.key || '';
    const key = String(value || '').trim();
    const technicalFields =
      scope === 'quote'
        ? ['numeroPreventivo', 'codiceOperatore', 'data', 'complete']
        : ['numeroCliente', 'codiceOperatore', 'data', 'password'];
    return technicalFields.includes(key);
  }

  getVisibleFieldMappingFields(
    scope: 'quote' | 'customer',
    source?: Record<string, any>,
  ): TenantFieldMappingFieldConfig[] {
    return this.getFieldMappingFields(scope).filter(
      (field) =>
        !!field?.dbColumn &&
        !this.isTechnicalField(scope, field) &&
        !this.isLegacyCustomerOperatorField(scope, field) &&
        field.visible !== false &&
        (!source || this.matchesVisibleWhen(scope, field, source)),
    );
  }

  private isLegacyCustomerOperatorField(
    scope: 'quote' | 'customer',
    field: TenantFieldMappingFieldConfig | null | undefined,
  ): boolean {
    if (scope !== 'customer' || !field) return false;

    const normalizedParts = [
      field.key,
      field.dbColumn,
      field.label,
      field.displayRole,
    ]
      .map((value) =>
        String(value || '')
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ''),
      )
      .filter(Boolean);

    return normalizedParts.some(
      (value) =>
        value === 'noperatori' ||
        value === 'numerooperatori' ||
        value === 'operatori',
    );
  }

  hasConfiguredFieldMapping(scope: 'quote' | 'customer'): boolean {
    return this.getVisibleFieldMappingFields(scope).length > 0;
  }

  getDynamicInputType(field: TenantFieldMappingFieldConfig): string {
    const type = String(field?.type || '')
      .trim()
      .toLowerCase();
    if (type === 'phone') {
      return 'tel';
    }
    if (['number', 'date', 'time', 'email', 'tel'].includes(type)) {
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

  isCalculatedField(field: TenantFieldMappingFieldConfig): boolean {
    return ['sum', 'sum_with_vat'].includes(
      String(field?.calculation?.mode || '')
        .trim()
        .toLowerCase(),
    );
  }

  applyCalculatedFields(
    scope: 'quote' | 'customer',
    target: Record<string, any>,
  ): void {
    const fields = this.getFieldMappingFields(scope);
    fields.forEach((field) => {
      if (
        !field.dbColumn ||
        this.isTechnicalField(scope, field) ||
        field.visible === false
      ) {
        return;
      }
      if (!this.matchesVisibleWhen(scope, field, target)) {
        return;
      }
      const calculatedValue = this.calculateMappedFieldValue(
        field,
        fields,
        target,
      );
      if (calculatedValue === undefined) return;

      target[field.dbColumn] = calculatedValue;
      if (field.key && field.key !== field.dbColumn) {
        target[field.key] = calculatedValue;
      }
    });
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
    const field = this.getFieldConfig(scope, keyOrDbColumn);
    if (
      String(field?.type || '')
        .trim()
        .toLowerCase() === 'boolean'
    )
      return false;
    if (field && this.isCalculatedField(field)) return false;
    return field?.required === true;
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
    const roleValue = roleField
      ? this.readMappedValue(record, roleField)
      : undefined;
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
    const roleFields = this.getFieldMappingFields(scope).filter(
      (field) => String(field.displayRole || '').trim() === role,
    );
    const roleField =
      role === 'quoteTotal'
        ? roleFields.find((field) => this.isCalculatedField(field)) ||
          roleFields[0]
        : roleFields[0];
    if (roleField && this.isCalculatedField(roleField)) {
      const calculatedValue = this.calculateMappedFieldValue(
        roleField,
        this.getFieldMappingFields(scope),
        record,
      );
      if (calculatedValue !== undefined) return calculatedValue;
    }
    return roleField ? this.readMappedValue(record, roleField) : undefined;
  }

  getMissingRequiredFields(
    scope: 'quote' | 'customer',
    source: Record<string, any>,
  ): string[] {
    return this.getFieldMappingFields(scope)
      .filter(
        (field) =>
          !this.isTechnicalField(scope, field) &&
          !this.isLegacyCustomerOperatorField(scope, field) &&
          field.visible !== false &&
          !this.isCalculatedField(field) &&
          field.required === true &&
          String(field.type || '')
            .trim()
            .toLowerCase() !== 'boolean' &&
          this.matchesVisibleWhen(scope, field, source),
      )
      .filter((field) =>
        this.isEmptyFieldValue(this.readMappedValue(source, field)),
      )
      .map((field) => field.label || field.dbColumn || field.key);
  }

  applyFieldDefaults(
    scope: 'quote' | 'customer',
    target: Record<string, any>,
  ): void {
    this.getFieldMappingFields(scope).forEach((field) => {
      if (
        !field.dbColumn ||
        this.isTechnicalField(scope, field) ||
        field.visible === false ||
        this.isCalculatedField(field)
      ) {
        return;
      }
      if (!this.matchesVisibleWhen(scope, field, target)) {
        return;
      }

      const defaultValue = field.defaultValue;
      if (
        defaultValue === undefined ||
        defaultValue === null ||
        defaultValue === ''
      ) {
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
      if (
        !field.dbColumn ||
        this.isTechnicalField(scope, field) ||
        field.visible === false
      )
        return;
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
    this.applyCalculatedFields(scope, source);

    const mappedPayload: Record<string, any> = {};
    [
      'numeroPreventivo',
      'numeroCliente',
      'codiceOperatore',
      'data',
      'complete',
      'tipoCliente',
      'stato',
    ].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        mappedPayload[key] = payload[key];
      }
    });

    fields.forEach((field) => {
      if (
        !field.dbColumn ||
        this.isTechnicalField(scope, field) ||
        field.visible === false
      ) {
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

  private calculateMappedFieldValue(
    field: TenantFieldMappingFieldConfig,
    fields: TenantFieldMappingFieldConfig[],
    source: Record<string, any>,
  ): number | undefined {
    const calculation = field.calculation || {};
    const mode = String(calculation.mode || '')
      .trim()
      .toLowerCase();
    if (!['sum', 'sum_with_vat'].includes(mode)) return undefined;

    const sourceFields = this.parseCalculationSourceFields(
      calculation.sourceFields,
    );
    if (!sourceFields.length) return undefined;

    const subtotal = sourceFields.reduce(
      (sum, sourceField) =>
        sum +
        this.parseNumericValue(
          this.readCalculationSourceValue(source, fields, sourceField),
        ),
      0,
    );

    let total = subtotal;
    if (mode === 'sum_with_vat') {
      const vatRate = this.resolveVatRate(source, fields, calculation);
      total = subtotal * (1 + vatRate / 100);
    }

    const decimals = this.normalizeCalculationDecimals(calculation.decimals);
    const factor = 10 ** decimals;
    return Math.round((total + Number.EPSILON) * factor) / factor;
  }

  private resolveVatRate(
    source: Record<string, any>,
    fields: TenantFieldMappingFieldConfig[],
    calculation: TenantFieldCalculationConfig,
  ): number {
    const vatField = String(calculation.vatField || '').trim();
    if (vatField) {
      const rawVatValue = this.readCalculationSourceValue(
        source,
        fields,
        vatField,
      );
      const vatValueRates = this.parseVatValueRates(
        calculation.vatValueRates || calculation.vatRatesByValue,
      );
      const mappedRate =
        vatValueRates[
          String(rawVatValue || '')
            .trim()
            .toLowerCase()
        ];
      if (Number.isFinite(mappedRate)) {
        return mappedRate;
      }
      return this.parseNumericValue(rawVatValue);
    }

    return this.parseNumericValue(calculation.vatRate);
  }

  private parseVatValueRates(value: unknown): Record<string, number> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>).reduce(
        (acc, [key, rate]) => {
          const normalizedKey = String(key || '')
            .trim()
            .toLowerCase();
          const normalizedRate = Number(rate);
          if (normalizedKey && Number.isFinite(normalizedRate)) {
            acc[normalizedKey] = normalizedRate;
          }
          return acc;
        },
        {} as Record<string, number>,
      );
    }

    return String(value || '')
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .reduce(
        (acc, item) => {
          const [key, rate] = item
            .split(/[:=]/)
            .map((part) => String(part || '').trim());
          const normalizedRate = Number(String(rate || '').replace(',', '.'));
          if (key && Number.isFinite(normalizedRate)) {
            acc[key.toLowerCase()] = normalizedRate;
          }
          return acc;
        },
        {} as Record<string, number>,
      );
  }

  private parseCalculationSourceFields(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    return String(value || '')
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeCalculationDecimals(value: unknown): number {
    if (value === null || value === undefined || String(value).trim() === '') {
      return 2;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? Math.max(0, Math.min(6, Math.round(parsed)))
      : 2;
  }

  private readCalculationSourceValue(
    source: Record<string, any>,
    fields: TenantFieldMappingFieldConfig[],
    sourceField: string,
  ): any {
    const target = String(sourceField || '').trim();
    if (!target) return undefined;

    const mappedField = fields.find(
      (field) =>
        String(field.key || '').trim() === target ||
        String(field.dbColumn || '').trim() === target,
    );
    const candidates = [target, mappedField?.dbColumn, mappedField?.key]
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(source, candidate)) {
        return source[candidate];
      }
    }
    return undefined;
  }

  private parseNumericValue(value: unknown): number {
    if (Array.isArray(value)) {
      return value.reduce((sum, item) => sum + this.parseNumericValue(item), 0);
    }
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'object') return 0;

    let normalized = String(value)
      .trim()
      .replace(/\s/g, '')
      .replace(/[^\d,.-]/g, '');

    if (!normalized) return 0;

    const commaIndex = normalized.lastIndexOf(',');
    const dotIndex = normalized.lastIndexOf('.');
    if (commaIndex !== -1 && dotIndex !== -1) {
      normalized =
        commaIndex > dotIndex
          ? normalized.replace(/\./g, '').replace(',', '.')
          : normalized.replace(/,/g, '');
    } else if (commaIndex !== -1) {
      normalized = normalized.replace(',', '.');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
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
    const currentValue = this.resolveVisibleWhenValue(
      scope,
      source,
      conditionField,
      sourceField,
    );

    return (
      this.normalizeConditionValue(currentValue) ===
      this.normalizeConditionValue(conditionValue)
    );
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
    if (
      scope === 'quote' &&
      (conditionField === 'tipoPreventivo' || sourceRole === 'quoteType')
    ) {
      const quoteTypeValue = this.getRecordValueByRole(
        'quote',
        source,
        'quoteType',
      );
      if (quoteTypeValue !== undefined) candidates.push(quoteTypeValue);
      pushFieldValue('tipoPreventivo');
    }

    return candidates.find((value) => value !== undefined && value !== null);
  }

  private normalizeConditionValue(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLowerCase();
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
    const type = String(field?.type || '')
      .trim()
      .toLowerCase();
    if (type === 'boolean') {
      const normalized = String(value).trim().toLowerCase();
      return ['1', 'true', 'si', 'sì', 'yes'].includes(normalized);
    }
    if (type === 'number' || type === 'money') {
      const parsed = this.parseNumericValue(value);
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
