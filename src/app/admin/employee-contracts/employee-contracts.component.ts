import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  GlobalService,
  TenantFieldMappingFieldConfig,
} from '../../service/global.service';

interface EmployeeContract {
  id: number;
  contractNumber: string;
  status: 'draft' | 'sent' | 'accepted' | 'expired' | 'cancelled';
  nome: string;
  cognome: string;
  email: string;
  cellulare?: string;
  role?: string;
  contractType?: string;
  level?: string;
  workLocation?: string;
  startDate?: string;
  endDate?: string;
  weeklyHours?: string;
  grossSalary?: string;
  trialPeriod?: string;
  oreGiornaliereDefault?: string | number | null;
  customFields?: Record<string, unknown> | string;
  notes?: string;
  contractText?: string;
  requestedAt?: string | null;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  needsOfficeReview?: boolean;
  officeConfirmedAt?: string | null;
  officeConfirmedBy?: string | null;
  signaturePresent?: boolean;
  signedPdfAvailable?: boolean;
  employeeId?: number | null;
  signedPdfPath?: string;
}

interface EmployeeContractForm {
  nome: string;
  cognome: string;
  email: string;
  cellulare: string;
  role: string;
  contractType: string;
  level: string;
  workLocation: string;
  startDate: string;
  endDate: string;
  weeklyHours: string;
  grossSalary: string;
  trialPeriod: string;
  oreGiornaliereDefault: string;
  customFields: Record<string, unknown>;
  notes: string;
  contractText: string;
}

interface ContractFieldSection {
  key: string;
  label: string;
  fields: TenantFieldMappingFieldConfig[];
}

const CONTRACT_MODEL_FIELD_KEYS = new Set([
  'nome',
  'cognome',
  'email',
  'cellulare',
  'role',
  'contractType',
  'level',
  'workLocation',
  'startDate',
  'endDate',
  'weeklyHours',
  'grossSalary',
  'trialPeriod',
  'oreGiornaliereDefault',
  'notes',
  'contractText',
]);

function contractFieldKey(field: Partial<TenantFieldMappingFieldConfig> | null | undefined): string {
  return String(field?.dbColumn || field?.key || '').trim();
}

@Component({
  selector: 'app-employee-contracts',
  templateUrl: './employee-contracts.component.html',
  styleUrls: ['./employee-contracts.component.css'],
})
export class EmployeeContractsComponent implements OnInit {
  contracts: EmployeeContract[] = [];
  filteredContracts: EmployeeContract[] = [];
  form: EmployeeContractForm = this.createEmptyForm();
  loading = false;
  saving = false;
  search = '';
  contractNumberSearch = '';
  contractNameSearch = '';
  showCompletedContracts = false;
  showForm = false;
  errorMessage = '';
  successMessage = '';
  contractFields: TenantFieldMappingFieldConfig[] = [];
  visibleContractSections: ContractFieldSection[] = [];
  editingContract: EmployeeContract | null = null;
  highlightedContractId: number | null = null;
  contractConfigMissing = false;
  private openContracts = new Set<number>();

  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.applyNotificationQueryParams();
    this.loadContractConfig();
    this.loadContracts();
  }

  loadContractConfig(): void {
    this.globalService.loadTenantConfig(false, { showError: false }).then(() => {
      this.contractFields = this.normalizeContractFields(
        this.globalService.getContractFields(),
      );
      this.contractConfigMissing = this.contractFields.length === 0;
      this.applyContractFieldDefaults();
      this.refreshVisibleContractFields();
    });
  }

  loadContracts(): void {
    this.loading = true;
    this.errorMessage = '';

    this.http
      .get<EmployeeContract[]>(this.globalService.url + 'employee-contracts/getAll', {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (contracts) => {
          this.contracts = (Array.isArray(contracts) ? contracts : []).sort(
            (a, b) => Number(b.id || 0) - Number(a.id || 0),
          );
          this.refreshContractList();
          this.focusContractFromNotificationIfNeeded();
          this.loading = false;
        },
        error: (err) => {
          console.error('Errore caricamento contratti:', err);
          this.errorMessage = this.parseServerError(err);
          this.loading = false;
        },
      });
  }

  openNewForm(): void {
    if (this.contractConfigMissing || this.contractFields.length === 0) {
      this.errorMessage = 'Configura i campi contratto in MVControl prima di creare contratti dipendenti.';
      this.successMessage = '';
      return;
    }
    this.editingContract = null;
    this.form = this.createEmptyForm();
    this.applyContractFieldDefaults();
    this.refreshVisibleContractFields();
    this.showForm = true;
    this.successMessage = '';
    this.errorMessage = '';
  }

  closeForm(): void {
    this.showForm = false;
    this.saving = false;
    this.editingContract = null;
  }

  createContract(): void {
    if (this.saving) return;
    if (this.contractConfigMissing || this.contractFields.length === 0) {
      this.errorMessage = 'Configura i campi contratto in MVControl prima di salvare il contratto.';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.saving = true;

    const editingId = this.editingContract?.id || null;
    const url = editingId
      ? this.globalService.url + 'employee-contracts/edit'
      : this.globalService.url + 'employee-contracts/add';
    const payload = editingId
      ? { ...this.buildContractPayload(), id: editingId }
      : this.buildContractPayload();

    this.http
      .post<EmployeeContract>(url, payload, { headers: this.globalService.headers })
      .subscribe({
        next: (contract) => {
          this.successMessage = editingId
            ? `Contratto ${contract.contractNumber} aggiornato.`
            : `Contratto ${contract.contractNumber} creato.`;
          this.showForm = false;
          this.editingContract = null;
          this.saving = false;
          this.loadContracts();
        },
        error: (err) => {
          console.error('Errore salvataggio contratto:', err);
          this.errorMessage = this.parseServerError(err);
          this.saving = false;
        },
      });
  }

  openEditForm(contract: EmployeeContract): void {
    if (!this.canEdit(contract)) return;

    this.editingContract = contract;
    this.form = this.createFormFromContract(contract);
    this.applyContractFieldDefaults();
    this.refreshVisibleContractFields();
    this.showForm = true;
    this.successMessage = '';
    this.errorMessage = '';
  }

  sendContractPdf(contract: EmployeeContract): void {
    this.errorMessage = '';
    this.successMessage = '';

    this.http
      .post<{ message?: string }>(
        this.globalService.url + 'employee-contracts/sendPdf',
        { id: contract.id },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => {
          this.successMessage = `Contratto ${contract.contractNumber} inviato via email.`;
          this.loadContracts();
        },
        error: (err) => {
          console.error('Errore invio PDF contratto:', err);
          this.errorMessage = this.parseServerError(err);
        },
      });
  }

  openContractWhatsApp(contract: EmployeeContract): void {
    this.errorMessage = '';
    this.successMessage = '';

    const normalizedPhone = this.normalizePhoneForWhatsApp(contract.cellulare || '');
    if (!normalizedPhone) {
      this.errorMessage = 'Numero di telefono non disponibile per questo contratto.';
      return;
    }

    window.open(`https://wa.me/${normalizedPhone}`, '_blank', 'noopener,noreferrer');
  }

  composeContractEmail(contract: EmployeeContract): void {
    this.errorMessage = '';
    this.successMessage = '';

    const email = String(contract.email || '').trim();
    if (!email) {
      this.errorMessage = 'Indirizzo email non disponibile per questo contratto.';
      return;
    }

    if (!this.isValidEmail(email)) {
      this.errorMessage = 'Indirizzo email contratto non valido.';
      return;
    }

    const displayName = `${contract.nome || ''} ${contract.cognome || ''}`.trim();
    this.router.navigate(['/email'], {
      queryParams: {
        composeTo: email,
        composeSubject: displayName
          ? `Contratto ${contract.contractNumber} - ${displayName}`
          : `Contratto ${contract.contractNumber}`,
      },
    });
  }

  sendSignatureLink(contract: EmployeeContract): void {
    this.errorMessage = '';
    this.successMessage = '';

    this.http
      .post<{ approvalUrl?: string; whatsappUrl?: string }>(
        this.globalService.url + 'employee-contracts/sendAcceptanceRequest',
        {
          id: contract.id,
          deliveryChannel: 'whatsapp',
        },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: (response) => {
          const targetUrl = response.whatsappUrl || response.approvalUrl;
          if (targetUrl) {
            window.open(targetUrl, '_blank');
          }
          this.successMessage = 'Link firma generato.';
          this.loadContracts();
        },
        error: (err) => {
          console.error('Errore generazione link firma:', err);
          this.errorMessage = this.parseServerError(err);
        },
      });
  }

  acceptContract(contract: EmployeeContract): void {
    if (!confirm(`Accettare manualmente il contratto ${contract.contractNumber}?`)) return;

    this.errorMessage = '';
    this.successMessage = '';

    this.http
      .post<{ message?: string; contract?: EmployeeContract }>(
        this.globalService.url + 'employee-contracts/acceptManual',
        { id: contract.id },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: (response) => {
          const acceptedContract = response.contract || contract;
          this.router.navigate(['/view-pdf'], {
            queryParams: {
              employeeContractId: acceptedContract.id,
              contractNumber: acceptedContract.contractNumber || contract.contractNumber,
              displayName: this.getContractDisplayName(acceptedContract),
              signed: 1,
              confirmEmployee: 1,
            },
          });
        },
        error: (err) => {
          console.error('Errore accettazione contratto:', err);
          this.errorMessage = this.parseServerError(err);
        },
      });
  }

  reviewSignedContractAndCreateEmployee(contract: EmployeeContract): void {
    this.router.navigate(['/view-pdf'], {
      queryParams: {
        employeeContractId: contract.id,
        contractNumber: contract.contractNumber,
        displayName: `${contract.nome || ''} ${contract.cognome || ''}`.trim(),
        signed: 1,
        confirmEmployee: 1,
      },
    });
  }

  refuseContract(contract: EmployeeContract): void {
    if (!confirm(`Rifiutare il contratto ${contract.contractNumber}?`)) return;

    this.http
      .post(
        this.globalService.url + 'employee-contracts/cancel',
        { id: contract.id },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => {
          this.successMessage = 'Contratto rifiutato.';
          this.showCompletedContracts = true;
          this.loadContracts();
        },
        error: (err) => {
          console.error('Errore annullamento contratto:', err);
          this.errorMessage = this.parseServerError(err);
        },
      });
  }

  deleteContract(contract: EmployeeContract): void {
    if (!confirm(`Eliminare definitivamente la bozza ${contract.contractNumber}?`)) return;

    this.errorMessage = '';
    this.successMessage = '';

    this.http
      .post(
        this.globalService.url + 'employee-contracts/delete',
        { id: contract.id },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: () => {
          this.successMessage = 'Bozza eliminata.';
          this.loadContracts();
        },
        error: (err) => {
          console.error('Errore eliminazione contratto:', err);
          this.errorMessage = this.parseServerError(err);
        },
      });
  }

  duplicateContract(contract: EmployeeContract): void {
    this.errorMessage = '';
    this.successMessage = '';

    this.http
      .post<{ contractNumber?: string }>(
        this.globalService.url + 'employee-contracts/duplicate',
        { id: contract.id },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: (response) => {
          this.successMessage = `Creato nuovo contratto ${response.contractNumber || ''}.`.trim();
          this.showCompletedContracts = false;
          this.loadContracts();
        },
        error: (err) => {
          console.error('Errore duplicazione contratto:', err);
          this.errorMessage = this.parseServerError(err);
        },
      });
  }

  openPdf(contract: EmployeeContract, signed = false): void {
    this.router.navigate(['/view-pdf'], {
      queryParams: {
        employeeContractId: contract.id,
        contractNumber: contract.contractNumber,
        displayName: `${contract.nome || ''} ${contract.cognome || ''}`.trim(),
        signed: signed ? 1 : undefined,
      },
    });
  }

  viewContractPdf(contract: EmployeeContract): void {
    const shouldOpenSignedPdf =
      !!contract.signedPdfAvailable ||
      contract.status === 'accepted' ||
      !!contract.employeeId ||
      !!contract.needsOfficeReview ||
      !!contract.officeConfirmedAt;
    this.openPdf(contract, shouldOpenSignedPdf);
  }

  toggleContractOpen(contractId: number): void {
    if (this.openContracts.has(contractId)) {
      this.openContracts.delete(contractId);
    } else {
      this.openContracts.add(contractId);
    }
  }

  isContractOpen(contractId: number): boolean {
    return this.openContracts.has(contractId);
  }

  searchContractNumber(value: string): void {
    this.contractNumberSearch = value;
    this.refreshContractList();
  }

  searchContractName(value: string): void {
    this.contractNameSearch = value;
    this.refreshContractList();
  }

  applySearch(): void {
    this.refreshContractList();
  }

  refreshContractList(): void {
    const numberQuery = this.normalize(this.contractNumberSearch || this.search);
    const nameQuery = this.normalize(this.contractNameSearch);

    this.filteredContracts = this.contracts
      .filter((contract) => this.showCompletedContracts
        ? this.isCompletedContract(contract)
        : !this.isCompletedContract(contract))
      .filter((contract) => {
        if (!numberQuery) return true;
        return this.normalize(contract.contractNumber || '').startsWith(numberQuery);
      })
      .filter((contract) => {
        if (!nameQuery) return true;
        return this.normalize(this.getContractDisplayName(contract)).includes(nameQuery);
      });
  }

  getContractDisplayName(contract: EmployeeContract): string {
    return `${contract.nome || ''} ${contract.cognome || ''}`.trim() ||
      contract.email ||
      `Contratto ${contract.contractNumber}`;
  }

  isCompletedContract(contract: EmployeeContract): boolean {
    return (
      contract.status === 'accepted' ||
      contract.status === 'cancelled' ||
      contract.status === 'expired' ||
      !!contract.employeeId ||
      !!contract.officeConfirmedAt
    );
  }

  statusLabel(status: EmployeeContract['status']): string {
    return {
      draft: 'Bozza',
      sent: 'Inviato',
      accepted: 'Accettato',
      expired: 'Scaduto',
      cancelled: 'Annullato',
    }[status] || status;
  }

  contractStatusLabel(contract: EmployeeContract): string {
    if (contract.status === 'accepted' && contract.needsOfficeReview) {
      return 'Da verificare';
    }
    if (contract.status === 'accepted' && contract.employeeId) {
      return 'Completato';
    }
    return this.statusLabel(contract.status);
  }

  contractStatusClass(contract: EmployeeContract): string {
    if (contract.status === 'accepted' && contract.needsOfficeReview) {
      return 'status-review';
    }
    return this.statusClass(contract.status);
  }

  statusClass(status: EmployeeContract['status']): string {
    return {
      draft: 'status-draft',
      sent: 'status-sent',
      accepted: 'status-accepted',
      expired: 'status-expired',
      cancelled: 'status-cancelled',
    }[status] || 'status-draft';
  }

  canSend(contract: EmployeeContract): boolean {
    return (
      this.globalService.hasPermission('EMPLOYEE_CREATE') &&
      contract.status !== 'accepted' &&
      contract.status !== 'cancelled'
    );
  }

  canSendContractPdf(contract: EmployeeContract): boolean {
    return (
      this.globalService.hasPermission('EMPLOYEE_CREATE') &&
      contract.status === 'draft'
    );
  }

  canAcceptContract(contract: EmployeeContract): boolean {
    return (
      this.globalService.hasPermission('EMPLOYEE_CREATE') &&
      contract.status !== 'accepted' &&
      contract.status !== 'cancelled' &&
      contract.status !== 'expired' &&
      !contract.employeeId
    );
  }

  canRefuseContract(contract: EmployeeContract): boolean {
    return (
      this.globalService.hasPermission('EMPLOYEE_CREATE') &&
      contract.status !== 'accepted' &&
      contract.status !== 'cancelled' &&
      contract.status !== 'expired'
    );
  }

  canComposeEmail(): boolean {
    return this.globalService.hasPermission('EMAIL_VIEW');
  }

  canEdit(contract: EmployeeContract): boolean {
    return (
      this.globalService.hasPermission('EMPLOYEE_CREATE') &&
      contract.status === 'draft'
    );
  }

  canDelete(contract: EmployeeContract): boolean {
    return this.canEdit(contract);
  }

  canDuplicate(contract: EmployeeContract): boolean {
    return (
      this.globalService.hasPermission('EMPLOYEE_CREATE') &&
      contract.status !== 'draft'
    );
  }

  canCompleteOnboarding(contract: EmployeeContract): boolean {
    return (
      this.globalService.hasPermission('EMPLOYEE_CREATE') &&
      contract.status === 'accepted' &&
      contract.needsOfficeReview === true &&
      contract.signedPdfAvailable === true &&
      !contract.employeeId
    );
  }

  canCancel(contract: EmployeeContract): boolean {
    return this.canRefuseContract(contract);
  }

  back(): void {
    this.router.navigateByUrl('/homeAdmin');
  }

  getContractFieldInputType(field: TenantFieldMappingFieldConfig): string {
    const type = String(field.type || 'text').toLowerCase();
    if (type === 'email') return 'email';
    if (type === 'phone') return 'tel';
    if (type === 'date') return 'date';
    if (type === 'number' || type === 'money') return 'number';
    return 'text';
  }

  getContractFieldKey(field: TenantFieldMappingFieldConfig): string {
    return contractFieldKey(field);
  }

  getContractFieldValue(field: TenantFieldMappingFieldConfig): any {
    return this.getContractFieldValueByKey(this.getContractFieldKey(field));
  }

  updateContractField(field: TenantFieldMappingFieldConfig, value: any): void {
    const key = this.getContractFieldKey(field);
    if (!key) return;

    this.form.customFields = this.form.customFields || {};
    this.form.customFields[key] = value;

    if (CONTRACT_MODEL_FIELD_KEYS.has(key)) {
      (this.form as unknown as Record<string, any>)[key] = value;
    }

    this.refreshVisibleContractFields();
  }

  isWideContractField(field: TenantFieldMappingFieldConfig): boolean {
    return this.isContractTextarea(field) ||
      ['list', 'json'].includes(String(field.type || '').toLowerCase());
  }

  isContractTextarea(field: TenantFieldMappingFieldConfig): boolean {
    return String(field.type || '').toLowerCase() === 'textarea' ||
      String(field.type || '').toLowerCase() === 'json' ||
      String(field.type || '').toLowerCase() === 'list';
  }

  isContractSelect(field: TenantFieldMappingFieldConfig): boolean {
    return String(field.type || '').toLowerCase() === 'enum' &&
      this.getContractEnumOptions(field).length > 0;
  }

  isContractBoolean(field: TenantFieldMappingFieldConfig): boolean {
    return String(field.type || '').toLowerCase() === 'boolean';
  }

  getContractEnumOptions(field: TenantFieldMappingFieldConfig): string[] {
    return String(field.enumValues || '')
      .split(/[,;\n]/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  getVisibleContractFields(): TenantFieldMappingFieldConfig[] {
    return this.contractFields.filter((field) => {
      const conditionField = String(field.visibleWhen?.field || '').trim();
      if (!conditionField) return true;
      const expected = String(field.visibleWhen?.value || '').trim().toLowerCase();
      const actual = String(this.getContractFieldValueByKey(conditionField) || '')
        .trim()
        .toLowerCase();
      return expected ? actual === expected : !!actual;
    });
  }

  trackByContractSection(_: number, section: ContractFieldSection): string {
    return section.key;
  }

  trackByContractField(index: number, field: TenantFieldMappingFieldConfig): string {
    return contractFieldKey(field) || String(field.key || index);
  }

  private createEmptyForm(): EmployeeContractForm {
    return {
      nome: '',
      cognome: '',
      email: '',
      cellulare: '',
      role: '',
      contractType: '',
      level: '',
      workLocation: '',
      startDate: '',
      endDate: '',
      weeklyHours: '',
      grossSalary: '',
      trialPeriod: '',
      oreGiornaliereDefault: '',
      customFields: {},
      notes: '',
      contractText: '',
    };
  }

  private applyNotificationQueryParams(): void {
    const review = this.route.snapshot.queryParamMap.get('review');
    const completed =
      this.route.snapshot.queryParamMap.get('completed') ||
      this.route.snapshot.queryParamMap.get('showCompleted') ||
      this.route.snapshot.queryParamMap.get('showCompletedContracts');
    const contractId = Number(
      this.route.snapshot.queryParamMap.get('contractId') ||
      this.route.snapshot.queryParamMap.get('employeeContractId') ||
      0,
    );

    if (review === '1' || completed === '1' || completed === 'true') {
      this.showCompletedContracts = true;
    }

    if (review === '1' && Number.isFinite(contractId) && contractId > 0) {
      this.highlightedContractId = contractId;
    }
  }

  private focusContractFromNotificationIfNeeded(): void {
    if (!this.highlightedContractId) return;

    const contract = this.contracts.find(
      (item) => item.id === this.highlightedContractId,
    );
    if (!contract) return;

    setTimeout(() => {
      document
        .getElementById(`employee-contract-${this.highlightedContractId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }

  private createFormFromContract(contract: EmployeeContract): EmployeeContractForm {
    const customFields = this.parseCustomFields(contract.customFields);
    const form = this.createEmptyForm();

    for (const key of CONTRACT_MODEL_FIELD_KEYS) {
      (form as unknown as Record<string, unknown>)[key] =
        (contract as unknown as Record<string, unknown>)[key] ?? '';
    }

    form.oreGiornaliereDefault = String(contract.oreGiornaliereDefault ?? '');
    form.customFields = {
      ...customFields,
    };

    for (const field of this.contractFields) {
      const key = this.getContractFieldKey(field);
      if (!key || Object.prototype.hasOwnProperty.call(form.customFields, key)) {
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(contract, key)) {
        form.customFields[key] = (contract as unknown as Record<string, unknown>)[key];
      }
    }

    return form;
  }

  private applyContractFieldDefaults(): void {
    this.form.customFields = this.form.customFields || {};
    for (const field of this.contractFields) {
      const key = this.getContractFieldKey(field);
      if (!key || !this.isEmptyValue(this.getContractFieldValueByKey(key))) {
        continue;
      }
      const defaultValue = Object.prototype.hasOwnProperty.call(field, 'defaultValue')
        ? field.defaultValue
        : '';
      if (this.isEmptyValue(defaultValue)) continue;
      this.updateContractField(field, defaultValue);
    }
  }

  private normalizeContractFields(
    fields: TenantFieldMappingFieldConfig[],
  ): TenantFieldMappingFieldConfig[] {
    const source = Array.isArray(fields) ? fields : [];

    return source
      .map((field) => {
        const key = String(field.key || field.dbColumn || '').trim();
        const dbColumn = String(field.dbColumn || key).trim();
        if (!key && !dbColumn) return null;
        return {
          ...field,
          key: key || dbColumn,
          dbColumn: dbColumn || key,
          label: String(field.label || key || dbColumn).trim(),
          type: String(field.type || 'text').trim() || 'text',
          section: String(field.section || 'contratto').trim() || 'contratto',
          visible: field.visible !== false,
          visibleWhen: {
            field: String(field.visibleWhen?.field || '').trim(),
            value: String(field.visibleWhen?.value || '').trim(),
          },
        } as TenantFieldMappingFieldConfig;
      })
      .filter((field): field is TenantFieldMappingFieldConfig => !!field)
      .filter((field) => field.visible !== false);
  }

  private buildContractPayload(): EmployeeContractForm {
    const payload = this.createEmptyForm();
    const customFields: Record<string, unknown> = {};
    const source = this.form.customFields || {};

    for (const field of this.contractFields) {
      const key = this.getContractFieldKey(field);
      if (!key) continue;
      const value = Object.prototype.hasOwnProperty.call(source, key)
        ? source[key]
        : this.getContractFieldValueByKey(key);
      if (CONTRACT_MODEL_FIELD_KEYS.has(key)) {
        (payload as unknown as Record<string, unknown>)[key] = value;
      } else {
        customFields[key] = value;
      }
    }

    for (const key of CONTRACT_MODEL_FIELD_KEYS) {
      const currentValue = (payload as unknown as Record<string, unknown>)[key];
      if (this.isEmptyValue(currentValue)) {
        (payload as unknown as Record<string, unknown>)[key] =
          (this.form as unknown as Record<string, unknown>)[key] || '';
      }
    }

    payload.customFields = customFields;
    return payload;
  }

  private refreshVisibleContractFields(): void {
    const visibleFields = this.getVisibleContractFields();
    this.visibleContractSections = this.groupContractFieldsBySection(visibleFields);
  }

  private groupContractFieldsBySection(
    fields: TenantFieldMappingFieldConfig[],
  ): ContractFieldSection[] {
    const sections = new Map<string, ContractFieldSection>();

    for (const field of fields) {
      const sectionName = String(field.section || 'contratto').trim() || 'contratto';
      const sectionKey = this.normalizeSectionKey(sectionName);
      if (!sections.has(sectionKey)) {
        sections.set(sectionKey, {
          key: sectionKey,
          label: this.formatSectionLabel(sectionName),
          fields: [],
        });
      }
      sections.get(sectionKey)?.fields.push(field);
    }

    return [...sections.values()];
  }

  private getContractFieldValueByKey(key: string): any {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return '';
    if (
      this.form.customFields &&
      Object.prototype.hasOwnProperty.call(this.form.customFields, normalizedKey)
    ) {
      return this.form.customFields[normalizedKey];
    }
    if (Object.prototype.hasOwnProperty.call(this.form, normalizedKey)) {
      return (this.form as unknown as Record<string, any>)[normalizedKey];
    }
    return '';
  }

  private normalizeSectionKey(value: string): string {
    return String(value || 'contratto')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'contratto';
  }

  private formatSectionLabel(value: string): string {
    const cleaned = String(value || 'contratto')
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');
    return cleaned
      .split(' ')
      .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : '')
      .join(' ') || 'Contratto';
  }

  private isEmptyValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'boolean') return false;
    if (Array.isArray(value)) return value.length === 0;
    return String(value).trim() === '';
  }

  private parseCustomFields(value: EmployeeContract['customFields']): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  private normalize(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  private normalizePhoneForWhatsApp(phone: string): string {
    let cleaned = String(phone || '').replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);
    if (cleaned.startsWith('00')) cleaned = cleaned.slice(2);
    if (!cleaned.startsWith('39') && cleaned.length <= 10) {
      cleaned = `39${cleaned}`;
    }
    return cleaned;
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private parseServerError(err: any): string {
    const responseError = err?.error;
    if (responseError?.error) return responseError.error;
    if (typeof responseError === 'string' && responseError.trim()) return responseError;
    if (err?.status === 0) return 'Impossibile contattare il server.';
    return 'Operazione non riuscita.';
  }
}
