import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';

interface CandidateFieldConfig {
  key: string;
  label: string;
  type?: string;
  section?: string;
  displayRole?: string;
  required?: boolean;
  visible?: boolean;
  enumValues?: string;
  defaultValue?: string;
}

interface CandidateStatusConfig {
  key: string;
  label: string;
  kind?: 'active' | 'discarded' | 'hired';
  default?: boolean;
}

interface CandidateOptionConfig {
  key: string;
  label: string;
  primary?: boolean;
}

interface CandidateConfig {
  fields: CandidateFieldConfig[];
  statuses: CandidateStatusConfig[];
  defaultStatusKey: string;
  discardedStatusKey: string;
  hiredStatusKey: string;
  discardReasons: CandidateOptionConfig[];
  attachmentTypes: CandidateOptionConfig[];
  uniqueFields: string[];
  retentionYears: number;
  interviewCalendarCategoryKey?: string;
}

interface EmployeeCategory {
  id: number;
  name: string;
  description?: string;
}

interface Candidate {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  fiscalCode?: string;
  roleCategoryId?: number | null;
  roleCategory?: EmployeeCategory | null;
  statusKey: string;
  discardReasonKey?: string | null;
  customFields?: Record<string, unknown>;
  interviewStartAt?: string | null;
  interviewEndAt?: string | null;
  employeeId?: number | null;
  discardedAt?: string | null;
  hiredAt?: string | null;
  notesCount?: number;
  attachmentsCount?: number;
}

interface CandidateNote {
  id: number;
  data: string;
  ora: string;
  operatore?: string;
  testo: string;
}

interface CandidateEvent {
  id: number;
  type: string;
  label: string;
  operatore?: string;
  createdAt?: string;
}

interface CandidateAttachment {
  id: number;
  typeKey: string;
  originalName: string;
  mimeType?: string;
  size?: number;
  createdAt?: string;
}

interface DuplicateMatch {
  entityType: 'candidate' | 'employee';
  id: number;
  label: string;
  statusKey?: string;
  discarded?: boolean;
  archived?: boolean;
  unique?: boolean;
  reasons: string[];
}

interface CandidateForm {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  fiscalCode: string;
  roleCategoryId: number | null;
  statusKey: string;
  customFields: Record<string, unknown>;
}

interface CandidateFieldSection {
  key: string;
  label: string;
  fields: CandidateFieldConfig[];
}

const CORE_ROLE_MAP: Record<string, keyof CandidateForm> = {
  candidateFirstName: 'firstName',
  candidateLastName: 'lastName',
  candidateEmail: 'email',
  candidatePhone: 'phone',
  candidateFiscalCode: 'fiscalCode',
};

@Component({
  selector: 'app-candidates',
  templateUrl: './candidates.component.html',
  styleUrls: ['./candidates.component.css'],
})
export class CandidatesComponent implements OnInit {
  config: CandidateConfig = this.defaultConfig();
  employeeCategories: EmployeeCategory[] = [];
  candidates: Candidate[] = [];
  selectedCandidate: Candidate | null = null;
  notes: CandidateNote[] = [];
  events: CandidateEvent[] = [];
  attachments: CandidateAttachment[] = [];
  fieldSections: CandidateFieldSection[] = [];
  form: CandidateForm = this.createEmptyForm();
  scope: 'active' | 'discarded' = 'active';
  search = '';
  statusFilter = '';
  showForm = false;
  loading = false;
  saving = false;
  statusUpdating = false;
  errorMessage = '';
  successMessage = '';
  duplicateMatches: DuplicateMatch[] = [];
  noteText = '';
  discardReasonKey = '';
  interviewStart = '';
  interviewEnd = '';
  readonly interviewDurationMinutes = 15;
  selectedFile: File | null = null;
  selectedAttachmentType = '';
  private duplicateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private http: HttpClient,
    public globalService: GlobalService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadConfig();
    this.loadCandidates();
  }

  get filteredCandidates(): Candidate[] {
    const term = this.search.trim().toLowerCase();
    return this.candidates.filter((candidate) => {
      if (this.statusFilter && candidate.statusKey !== this.statusFilter) return false;
      if (!term) return true;
      return [
        candidate.firstName,
        candidate.lastName,
        candidate.email,
        candidate.phone,
        candidate.fiscalCode,
        candidate.roleCategory?.name,
        this.statusLabel(candidate.statusKey),
      ].some((value) => String(value || '').toLowerCase().includes(term));
    });
  }

  get activeStatuses(): CandidateStatusConfig[] {
    return this.config.statuses.filter((status) => status.kind !== 'discarded' && status.kind !== 'hired');
  }

  get statusFilterOptions(): CandidateStatusConfig[] {
    if (this.scope === 'discarded') {
      return this.config.statuses.filter((status) => status.kind === 'discarded' || status.kind === 'hired');
    }
    return this.activeStatuses;
  }

  get canManage(): boolean {
    return this.globalService.hasPermission('CANDIDATES_MANAGE');
  }

  get canManageNotes(): boolean {
    return this.globalService.hasPermission('CANDIDATES_NOTES_MANAGE');
  }

  get canManageFiles(): boolean {
    return this.globalService.hasPermission('CANDIDATES_FILES_MANAGE');
  }

  get canConvert(): boolean {
    return this.globalService.hasPermission('CANDIDATES_CONVERT');
  }

  get canQuickChangeStatus(): boolean {
    return !!this.selectedCandidate && !this.selectedCandidate.discardedAt && !this.selectedCandidate.employeeId;
  }

  private api(path: string): string {
    return this.globalService.url + `candidates/${path}`;
  }

  private defaultConfig(): CandidateConfig {
    return {
      fields: [],
      statuses: [
        { key: 'interview_scheduled', label: 'Colloquio fissato', kind: 'active', default: true },
        { key: 'discarded', label: 'Scartato', kind: 'discarded' },
        { key: 'hired', label: 'Assunto', kind: 'hired' },
      ],
      defaultStatusKey: 'interview_scheduled',
      discardedStatusKey: 'discarded',
      hiredStatusKey: 'hired',
      discardReasons: [],
      attachmentTypes: [],
      uniqueFields: [],
      retentionYears: 10,
    };
  }

  private createEmptyForm(): CandidateForm {
    return {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      fiscalCode: '',
      roleCategoryId: null,
      statusKey: this.config.defaultStatusKey || 'interview_scheduled',
      customFields: {},
    };
  }

  loadConfig(): void {
    this.http.get<{ config: CandidateConfig; employeeCategories: EmployeeCategory[] }>(this.api('config'))
      .subscribe({
        next: (response) => {
          this.config = response.config || this.defaultConfig();
          this.employeeCategories = response.employeeCategories || [];
          this.selectedAttachmentType = this.config.attachmentTypes.find((type) => type.primary)?.key ||
            this.config.attachmentTypes[0]?.key ||
            '';
          this.form.statusKey = this.config.defaultStatusKey || this.form.statusKey || 'interview_scheduled';
          this.ensureValidStatusFilter();
          this.buildFieldSections();
        },
        error: () => {
          this.errorMessage = 'Errore recupero configurazione candidati.';
        },
      });
  }

  loadCandidates(scope: 'active' | 'discarded' = this.scope): void {
    this.scope = scope;
    this.ensureValidStatusFilter();
    this.loading = true;
    this.http.get<Candidate[]>(this.api(`getAll?scope=${scope}`))
      .subscribe({
        next: (rows) => {
          this.candidates = Array.isArray(rows) ? rows : [];
          this.loading = false;
        },
        error: () => {
          this.errorMessage = 'Errore recupero candidati.';
          this.loading = false;
        },
      });
  }

  openNewForm(): void {
    this.form = this.createEmptyForm();
    this.selectedCandidate = null;
    this.notes = [];
    this.events = [];
    this.attachments = [];
    this.duplicateMatches = [];
    this.errorMessage = '';
    this.successMessage = '';
    this.showForm = true;
  }

  editSelected(): void {
    if (!this.selectedCandidate) return;
    this.form = this.formFromCandidate(this.selectedCandidate);
    this.duplicateMatches = [];
    this.showForm = true;
  }

  closeForm(): void {
    this.showForm = false;
    this.duplicateMatches = [];
  }

  selectCandidate(candidate: Candidate): void {
    this.errorMessage = '';
    this.successMessage = '';
    this.http.get<{
      candidate: Candidate;
      notes: CandidateNote[];
      events: CandidateEvent[];
      attachments: CandidateAttachment[];
    }>(this.api(String(candidate.id)))
      .subscribe({
        next: (detail) => {
          this.selectedCandidate = detail.candidate;
          this.notes = detail.notes || [];
          this.events = detail.events || [];
          this.attachments = detail.attachments || [];
          this.form = this.formFromCandidate(detail.candidate);
          this.discardReasonKey = detail.candidate.discardReasonKey || this.config.discardReasons[0]?.key || '';
          this.interviewStart = this.toDateTimeLocal(detail.candidate.interviewStartAt);
          this.interviewEnd = this.calculateInterviewEnd(this.interviewStart);
        },
        error: () => {
          this.errorMessage = 'Errore apertura scheda candidato.';
        },
      });
  }

  saveCandidate(forceDuplicate = false): void {
    if (!this.canManage || this.saving) return;
    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';
    const isEdit = !!this.form.id;
    const endpoint = isEdit ? 'edit' : 'add';
    const payload = {
      ...this.buildPayload(),
      id: this.form.id,
      forceDuplicate,
    };
    this.http.post<{ candidate: Candidate; duplicates?: DuplicateMatch[] }>(this.api(endpoint), payload)
      .subscribe({
        next: (response) => {
          this.saving = false;
          this.showForm = false;
          this.duplicateMatches = response.duplicates || [];
          this.successMessage = isEdit ? 'Candidato aggiornato.' : 'Candidato creato.';
          this.loadCandidates();
          this.selectCandidate(response.candidate);
          this.notifyCandidatesChanged();
        },
        error: (err) => {
          this.saving = false;
          this.duplicateMatches = err?.error?.duplicates || [];
          this.errorMessage = err?.error?.error || 'Errore salvataggio candidato.';
        },
      });
  }

  scheduleDuplicateCheck(): void {
    if (this.duplicateTimer) clearTimeout(this.duplicateTimer);
    this.duplicateTimer = setTimeout(() => this.checkDuplicates(), 450);
  }

  checkDuplicates(): void {
    const payload = {
      ...this.buildPayload(),
      candidateId: this.form.id || null,
    };
    if (!payload.firstName && !payload.lastName && !payload.email && !payload.phone && !payload.fiscalCode) {
      this.duplicateMatches = [];
      return;
    }
    this.http.post<{ matches: DuplicateMatch[] }>(this.api('duplicate-check'), payload)
      .subscribe({
        next: (response) => {
          this.duplicateMatches = response.matches || [];
        },
        error: () => {
          this.duplicateMatches = [];
        },
      });
  }

  addNote(): void {
    if (!this.selectedCandidate || !this.canManageNotes || !this.noteText.trim()) return;
    this.http.post<CandidateNote>(this.api(`${this.selectedCandidate.id}/notes/add`), {
      testo: this.noteText.trim(),
    }).subscribe({
      next: (note) => {
        this.notes = [...this.notes, note];
        this.noteText = '';
      },
      error: () => {
        this.errorMessage = 'Errore salvataggio nota.';
      },
    });
  }

  scheduleInterview(): void {
    if (!this.selectedCandidate || !this.canManage || !this.interviewStart) return;
    this.errorMessage = '';
    this.successMessage = '';
    const startDate = new Date(this.interviewStart);
    if (Number.isNaN(startDate.getTime())) {
      this.errorMessage = 'Data e ora colloquio non valide.';
      return;
    }
    const endDate = new Date(startDate.getTime() + this.interviewDurationMinutes * 60 * 1000);
    this.interviewEnd = this.toDateTimeLocal(endDate.toISOString());
    this.http.post<{ candidate: Candidate; appointment?: { id?: number } }>(this.api(`${this.selectedCandidate.id}/interview`), {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    }).subscribe({
      next: (response) => {
        this.successMessage = response.appointment?.id
          ? 'Colloquio salvato in calendario.'
          : 'Colloquio salvato sul candidato.';
        this.selectCandidate(response.candidate);
      },
      error: (err) => {
        this.errorMessage = err?.error?.error || 'Errore salvataggio colloquio.';
      },
    });
  }

  syncInterviewEnd(): void {
    this.interviewEnd = this.calculateInterviewEnd(this.interviewStart);
  }

  discardCandidate(): void {
    if (!this.selectedCandidate || !this.canManage) return;
    this.http.post<{ candidate: Candidate }>(this.api(`${this.selectedCandidate.id}/discard`), {
      reasonKey: this.discardReasonKey,
    }).subscribe({
      next: (response) => {
        this.successMessage = 'Candidato scartato.';
        this.loadCandidates('active');
        this.selectCandidate(response.candidate);
        this.notifyCandidatesChanged();
      },
      error: () => {
        this.errorMessage = 'Errore scarto candidato.';
      },
    });
  }

  reopenCandidate(): void {
    if (!this.selectedCandidate || !this.canManage) return;
    this.http.post<{ candidate: Candidate }>(this.api(`${this.selectedCandidate.id}/reopen`), {})
      .subscribe({
        next: (response) => {
          this.successMessage = 'Candidato riaperto.';
          this.loadCandidates('discarded');
          this.selectCandidate(response.candidate);
          this.notifyCandidatesChanged();
        },
        error: () => {
          this.errorMessage = 'Errore riapertura candidato.';
        },
    });
  }

  updateCandidateStatus(statusKey: string): void {
    if (!this.selectedCandidate || !this.canManage || this.statusUpdating) return;
    const nextStatusKey = String(statusKey || '').trim();
    if (!nextStatusKey || nextStatusKey === this.selectedCandidate.statusKey) return;
    this.statusUpdating = true;
    this.errorMessage = '';
    this.successMessage = '';
    const currentCandidate = this.selectedCandidate;
    this.http.post<{ candidate: Candidate }>(this.api(`${currentCandidate.id}/status`), { statusKey: nextStatusKey })
      .subscribe({
        next: (response) => {
          this.statusUpdating = false;
          const updatedCandidate: Candidate = {
            ...currentCandidate,
            ...response.candidate,
            roleCategory: response.candidate.roleCategory || currentCandidate.roleCategory,
          };
          this.selectedCandidate = updatedCandidate;
          this.form = this.formFromCandidate(updatedCandidate);
          this.candidates = this.candidates.map((candidate) =>
            candidate.id === updatedCandidate.id
              ? { ...candidate, ...updatedCandidate, roleCategory: updatedCandidate.roleCategory || candidate.roleCategory }
              : candidate,
          );
          this.successMessage = 'Stato candidato aggiornato.';
        },
        error: (err) => {
          this.statusUpdating = false;
          this.errorMessage = err?.error?.error || 'Errore aggiornamento stato candidato.';
        },
      });
  }

  convertToEmployee(): void {
    if (!this.selectedCandidate || !this.canConvert) return;
    if (!window.confirm('Aggiungere questo candidato come dipendente?')) return;
    const hasEmail = Boolean(String(this.selectedCandidate.email || '').trim());
    this.http.post<{ candidate: Candidate; employee: { id: number }; credentialEmailError?: string }>(
      this.api(`${this.selectedCandidate.id}/convert-to-employee`),
      { sendCredentials: hasEmail },
    ).subscribe({
      next: (response) => {
        this.successMessage = response.credentialEmailError
          ? `Dipendente creato. ${response.credentialEmailError}.`
          : 'Dipendente creato.';
        this.loadCandidates('discarded');
        this.selectCandidate(response.candidate);
        this.notifyCandidatesChanged();
      },
      error: (err) => {
        this.errorMessage = err?.error?.error || 'Errore conversione candidato.';
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files?.[0] || null;
  }

  uploadAttachment(): void {
    if (!this.selectedCandidate || !this.selectedFile || !this.canManageFiles) return;
    const data = new FormData();
    data.append('file', this.selectedFile);
    if (this.selectedAttachmentType) data.append('typeKey', this.selectedAttachmentType);
    this.http.post<CandidateAttachment>(this.api(`${this.selectedCandidate.id}/attachments`), data)
      .subscribe({
        next: (attachment) => {
          this.attachments = [attachment, ...this.attachments];
          this.selectedFile = null;
          this.successMessage = 'Allegato caricato.';
        },
        error: () => {
          this.errorMessage = 'Errore caricamento allegato.';
        },
      });
  }

  deleteAttachment(attachment: CandidateAttachment): void {
    if (!this.selectedCandidate || !this.canManageFiles) return;
    this.http.delete(this.api(`${this.selectedCandidate.id}/attachments/${attachment.id}`))
      .subscribe({
        next: () => {
          this.attachments = this.attachments.filter((item) => item.id !== attachment.id);
        },
        error: () => {
          this.errorMessage = 'Errore eliminazione allegato.';
        },
      });
  }

  downloadAttachment(attachment: CandidateAttachment): void {
    if (!this.selectedCandidate) return;
    this.http.get(this.api(`${this.selectedCandidate.id}/attachments/${attachment.id}/download`), {
      responseType: 'blob',
    }).subscribe({
      next: (blob) => {
        const file = new File([blob], attachment.originalName || 'allegato', {
          type: attachment.mimeType || blob.type || 'application/octet-stream',
        });
        const url = URL.createObjectURL(file);
        const opened = window.open(url, '_blank');
        if (!opened) {
          const link = document.createElement('a');
          link.href = url;
          link.download = attachment.originalName || 'allegato';
          link.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      },
      error: () => {
        this.errorMessage = 'Errore apertura allegato.';
      },
    });
  }

  openDuplicate(match: DuplicateMatch): void {
    if (match.entityType === 'candidate') {
      const existing = this.candidates.find((candidate) => candidate.id === match.id);
      if (existing) {
        this.selectCandidate(existing);
        return;
      }
      this.http.get<{ candidate: Candidate }>(this.api(String(match.id)))
        .subscribe((detail) => this.selectCandidate(detail.candidate));
      return;
    }
    this.router.navigate(['/homeAdmin', 'gestioneemployees']);
  }

  statusLabel(key: string | undefined | null): string {
    return this.config.statuses.find((status) => status.key === key)?.label || String(key || '');
  }

  discardReasonLabel(key: string | undefined | null): string {
    return this.config.discardReasons.find((reason) => reason.key === key)?.label || String(key || '');
  }

  attachmentTypeLabel(key: string | undefined | null): string {
    return this.config.attachmentTypes.find((type) => type.key === key)?.label || String(key || '');
  }

  private ensureValidStatusFilter(): void {
    if (!this.statusFilter) return;
    const allowed = this.statusFilterOptions.some((status) => status.key === this.statusFilter);
    if (!allowed) this.statusFilter = '';
  }

  candidateName(candidate: Candidate | null): string {
    if (!candidate) return '';
    return `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || `Candidato #${candidate.id}`;
  }

  getFieldValue(field: CandidateFieldConfig): unknown {
    const coreKey = CORE_ROLE_MAP[String(field.displayRole || '')];
    if (coreKey) return this.form[coreKey] as unknown;
    return this.form.customFields[field.key] ?? field.defaultValue ?? '';
  }

  setFieldValue(field: CandidateFieldConfig, value: unknown): void {
    const coreKey = CORE_ROLE_MAP[String(field.displayRole || '')];
    if (coreKey) {
      (this.form as any)[coreKey] = value;
    } else {
      this.form.customFields = {
        ...this.form.customFields,
        [field.key]: value,
      };
    }
    this.scheduleDuplicateCheck();
  }

  getEnumOptions(field: CandidateFieldConfig): string[] {
    return String(field.enumValues || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  inputType(field: CandidateFieldConfig): string {
    const type = String(field.type || 'text').toLowerCase();
    if (type === 'email') return 'email';
    if (type === 'phone') return 'tel';
    if (type === 'number' || type === 'money') return 'number';
    if (type === 'date') return 'date';
    if (type === 'time') return 'time';
    return 'text';
  }

  isTextarea(field: CandidateFieldConfig): boolean {
    return ['textarea', 'json', 'list'].includes(String(field.type || '').toLowerCase());
  }

  isSelect(field: CandidateFieldConfig): boolean {
    return String(field.type || '').toLowerCase() === 'enum';
  }

  isBoolean(field: CandidateFieldConfig): boolean {
    return String(field.type || '').toLowerCase() === 'boolean';
  }

  isWide(field: CandidateFieldConfig): boolean {
    return this.isTextarea(field) || ['address', 'indirizzo'].some((token) => field.key.toLowerCase().includes(token));
  }

  trackByField(_: number, field: CandidateFieldConfig): string {
    return field.key;
  }

  trackBySection(_: number, section: CandidateFieldSection): string {
    return section.key;
  }

  trackByCandidate(_: number, candidate: Candidate): number {
    return candidate.id;
  }

  trackById(_: number, item: { id: number }): number {
    return item.id;
  }

  back(): void {
    this.router.navigate(['/homeAdmin']);
  }

  private buildFieldSections(): void {
    const sections = new Map<string, CandidateFieldSection>();
    for (const field of this.config.fields || []) {
      if (field.visible === false) continue;
      const key = String(field.section || 'anagrafica').trim() || 'anagrafica';
      if (!sections.has(key)) {
        sections.set(key, {
          key,
          label: key.charAt(0).toUpperCase() + key.slice(1),
          fields: [],
        });
      }
      sections.get(key)?.fields.push(field);
    }
    this.fieldSections = [...sections.values()];
  }

  private buildPayload(): CandidateForm {
    return {
      ...this.form,
      firstName: String(this.form.firstName || '').trim(),
      lastName: String(this.form.lastName || '').trim(),
      email: String(this.form.email || '').trim(),
      phone: String(this.form.phone || '').trim(),
      fiscalCode: String(this.form.fiscalCode || '').trim(),
      roleCategoryId: this.form.roleCategoryId ? Number(this.form.roleCategoryId) : null,
      customFields: this.form.customFields || {},
    };
  }

  private formFromCandidate(candidate: Candidate): CandidateForm {
    return {
      id: candidate.id,
      firstName: candidate.firstName || '',
      lastName: candidate.lastName || '',
      email: candidate.email || '',
      phone: candidate.phone || '',
      fiscalCode: candidate.fiscalCode || '',
      roleCategoryId: candidate.roleCategoryId ? Number(candidate.roleCategoryId) : null,
      statusKey: candidate.statusKey || this.config.defaultStatusKey || 'interview_scheduled',
      customFields: { ...(candidate.customFields || {}) },
    };
  }

  private toDateTimeLocal(value: string | null | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offsetMs = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
  }

  private calculateInterviewEnd(startValue: string): string {
    if (!startValue) return '';
    const start = new Date(startValue);
    if (Number.isNaN(start.getTime())) return '';
    const end = new Date(start.getTime() + this.interviewDurationMinutes * 60 * 1000);
    return this.toDateTimeLocal(end.toISOString());
  }

  private notifyCandidatesChanged(): void {
    window.dispatchEvent(new Event('candidatesChanged'));
  }
}
