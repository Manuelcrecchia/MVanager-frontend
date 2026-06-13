import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';

type DeadlineKind = 'employee' | 'vehicle';
type DeadlineStatus = 'ok' | 'warning' | 'expired';

interface DeadlineAttachment {
  id: string;
  originalName: string;
  size: number;
  uploadedAt: string;
}

interface EmployeeTarget {
  id: number;
  nome: string;
  cognome: string;
  email: string;
  cellulare?: string;
}

interface VehicleTarget {
  id: number;
  name: string;
  plate?: string | null;
}

interface DeadlineSummary {
  expiredCount: number;
  warningCount: number;
  alertCount: number;
  totalCount: number;
  status: DeadlineStatus;
}

interface DeadlineRecord {
  id: number;
  entityType: DeadlineKind;
  employeeId?: number;
  vehicleId?: number;
  title: string;
  description: string;
  dueDate: string;
  remindDays: number | null;
  attachments: DeadlineAttachment[];
  status: DeadlineStatus;
  daysUntil: number | null;
  employee?: EmployeeTarget;
  vehicle?: VehicleTarget;
}

interface DeadlineGroup {
  id: number;
  label: string;
  subtitle: string;
  deadlines: DeadlineRecord[];
  summary: DeadlineSummary;
}

@Component({
  selector: 'app-deadlines-management',
  templateUrl: './deadlines-management.component.html',
  styleUrls: ['./deadlines-management.component.css'],
})
export class DeadlinesManagementComponent implements OnInit {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  kind: DeadlineKind = 'employee';
  entities: Array<EmployeeTarget | VehicleTarget> = [];
  deadlines: DeadlineRecord[] = [];
  groups: DeadlineGroup[] = [];

  loading = false;
  entitiesLoading = false;
  saving = false;
  showForm = false;
  error = '';
  success = '';
  preselectedEntityId: number | null = null;
  pendingFiles: File[] = [];
  editingDeadline: DeadlineRecord | null = null;
  formAttachments: DeadlineAttachment[] = [];

  form: {
    entityId: number | null;
    title: string;
    description: string;
    dueDate: string;
    remindDays: string;
  } = {
    entityId: null,
    title: '',
    description: '',
    dueDate: '',
    remindDays: '',
  };

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    public globalService: GlobalService,
    private popup: PopupServiceService,
  ) {}

  ngOnInit(): void {
    this.kind =
      this.route.snapshot.data['kind'] === 'vehicle' ? 'vehicle' : 'employee';

    const paramKey = this.kind === 'employee' ? 'employeeId' : 'vehicleId';
    this.preselectedEntityId = this.parseNumericId(
      this.route.snapshot.queryParamMap.get(paramKey),
    );

    this.resetForm();
    this.loadAll();
  }

  get entityLabel(): string {
    return this.kind === 'employee' ? 'dipendente' : 'mezzo';
  }

  get pageTitle(): string {
    return this.kind === 'employee'
      ? 'Scadenze dipendenti'
      : 'Scadenze mezzi';
  }

  get pageDescription(): string {
    return this.kind === 'employee'
      ? 'Gestisci promemoria, date di scadenza e allegati dei dipendenti.'
      : 'Tieni sotto controllo revisioni, assicurazioni e ogni altra scadenza dei mezzi.';
  }

  get totalExpired(): number {
    return this.groups.reduce((acc, group) => acc + group.summary.expiredCount, 0);
  }

  get totalWarning(): number {
    return this.groups.reduce((acc, group) => acc + group.summary.warningCount, 0);
  }

  get totalAlerts(): number {
    return this.totalExpired + this.totalWarning;
  }

  get canSave(): boolean {
    return (
      !!this.form.entityId &&
      !!this.normalizeFieldValue(this.form.title) &&
      !!this.normalizeFieldValue(this.form.dueDate)
    );
  }

  get canCreate(): boolean {
    return this.globalService.hasPermission(
      this.kind === 'employee'
        ? 'EMPLOYEE_DEADLINES_CREATE'
        : 'VEHICLE_DEADLINES_CREATE',
    );
  }

  get canEdit(): boolean {
    return this.globalService.hasPermission(
      this.kind === 'employee'
        ? 'EMPLOYEE_DEADLINES_EDIT'
        : 'VEHICLE_DEADLINES_EDIT',
    );
  }

  get canDelete(): boolean {
    return this.globalService.hasPermission(
      this.kind === 'employee'
        ? 'EMPLOYEE_DEADLINES_DELETE'
        : 'VEHICLE_DEADLINES_DELETE',
    );
  }

  get isEditing(): boolean {
    return !!this.editingDeadline;
  }

  get formTitle(): string {
    return this.isEditing ? 'Modifica scadenza' : 'Nuova scadenza';
  }

  get formSubtitle(): string {
    return this.isEditing
      ? 'Aggiorna i dati della scadenza e gestisci gli allegati esistenti.'
      : `Seleziona il ${this.entityLabel} e compila i dati obbligatori.`;
  }

  get submitLabel(): string {
    return this.isEditing ? 'Salva modifiche' : 'Salva scadenza';
  }

  get editingEntityDisplayLabel(): string {
    if (!this.editingDeadline) return '';
    return this.getEntityLabel(this.getEntityFromDeadline(this.editingDeadline));
  }

  back(): void {
    this.router.navigateByUrl('/homeAdmin');
  }

  loadAll(): void {
    this.error = '';
    this.loading = true;
    this.entitiesLoading = true;
    this.loadEntities();
    this.loadDeadlines();
  }

  loadEntities(): void {
    const endpoint =
      this.kind === 'employee'
        ? 'admin/deadlines/employees/targets'
        : 'admin/deadlines/vehicles/targets';

    this.http.get<any[]>(this.globalService.url + endpoint).subscribe({
      next: (response) => {
        const items = Array.isArray(response) ? response : [];
        this.entities = items.sort((a, b) =>
          this.getEntityLabel(a).localeCompare(this.getEntityLabel(b), 'it'),
        );
        this.entitiesLoading = false;
        this.rebuildGroups();
      },
      error: (err) => {
        console.error('Errore caricamento entita scadenze:', err);
        this.entitiesLoading = false;
        this.error = this.parseServerError(err);
        this.popup.showError(this.error);
      },
    });
  }

  loadDeadlines(): void {
    const endpoint =
      this.kind === 'employee'
        ? 'admin/deadlines/employees'
        : 'admin/deadlines/vehicles';

    this.http.get<DeadlineRecord[]>(this.globalService.url + endpoint).subscribe({
      next: (response) => {
        this.deadlines = Array.isArray(response) ? response : [];
        this.loading = false;
        this.rebuildGroups();
      },
      error: (err) => {
        console.error('Errore caricamento scadenze:', err);
        this.loading = false;
        this.error = this.parseServerError(err);
        this.popup.showError(this.error);
      },
    });
  }

  openAddForm(entityId?: number): void {
    if (!this.canCreate) return;

    this.resetForm();
    this.showForm = true;
    this.error = '';
    this.success = '';

    if (entityId) {
      this.form.entityId = entityId;
      return;
    }

    if (this.preselectedEntityId) {
      this.form.entityId = this.preselectedEntityId;
      return;
    }

    if (!this.form.entityId && this.entities.length > 0) {
      this.form.entityId = Number((this.entities[0] as any).id);
    }
  }

  openEditForm(deadline: DeadlineRecord): void {
    if (!this.canEdit) return;

    this.resetForm();
    this.showForm = true;
    this.error = '';
    this.success = '';
    this.editingDeadline = { ...deadline, attachments: [...(deadline.attachments || [])] };
    this.formAttachments = [...(deadline.attachments || [])];
    this.form = {
      entityId: this.getEntityIdFromDeadline(deadline),
      title: deadline.title || '',
      description: deadline.description || '',
      dueDate: deadline.dueDate || '',
      remindDays:
        deadline.remindDays === null || deadline.remindDays === undefined
          ? ''
          : String(deadline.remindDays),
    };
  }

  cancelForm(): void {
    this.showForm = false;
    this.error = '';
    this.resetForm();
  }

  resetForm(): void {
    this.editingDeadline = null;
    this.formAttachments = [];
    this.form = {
      entityId: this.preselectedEntityId,
      title: '',
      description: '',
      dueDate: '',
      remindDays: '',
    };
    this.pendingFiles = [];

    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.value = '';
    }
  }

  onFilesSelected(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const files = target?.files ? Array.from(target.files) : [];
    this.pendingFiles = files;
  }

  removePendingFile(index: number): void {
    this.pendingFiles.splice(index, 1);
  }

  submit(): void {
    if (!this.canSave || this.saving) return;

    const title = this.normalizeFieldValue(this.form.title);
    const description = this.normalizeFieldValue(this.form.description);
    const dueDate = this.normalizeFieldValue(this.form.dueDate);
    const remindDays = this.normalizeFieldValue(this.form.remindDays);

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('dueDate', dueDate);

    if (this.isEditing && this.editingDeadline) {
      formData.append('id', String(this.editingDeadline.id));
    } else {
      formData.append(
        this.kind === 'employee' ? 'employeeId' : 'vehicleId',
        String(this.form.entityId),
      );
    }

    if (remindDays) {
      formData.append('remindDays', remindDays);
    }

    for (const file of this.pendingFiles) {
      formData.append('documents', file, file.name);
    }

    const endpoint =
      this.isEditing
        ? 'admin/deadlines/update'
        : this.kind === 'employee'
          ? 'admin/deadlines/employees'
          : 'admin/deadlines/vehicles';

    this.saving = true;
    this.error = '';
    this.success = '';

    this.http.post<DeadlineRecord>(this.globalService.url + endpoint, formData).subscribe({
      next: () => {
        this.saving = false;
        this.success = this.isEditing
          ? 'Scadenza aggiornata con successo.'
          : 'Scadenza salvata con successo.';
        this.showForm = false;
        this.resetForm();
        this.loadDeadlines();
      },
      error: (err) => {
        console.error('Errore salvataggio scadenza:', err);
        this.saving = false;
        this.error = this.parseServerError(err);
        this.popup.showError(this.error);
      },
    });
  }

  deleteDeadline(deadline: DeadlineRecord): void {
    if (!this.canDelete) return;

    const confirmed = confirm(
      `Eliminare la scadenza "${deadline.title}"?`,
    );
    if (!confirmed) return;

    this.http
      .post(this.globalService.url + 'admin/deadlines/delete', {
        id: deadline.id,
      })
      .subscribe({
        next: () => {
          this.success = 'Scadenza eliminata.';
          this.deadlines = this.deadlines.filter((item) => item.id !== deadline.id);
          this.rebuildGroups();
        },
        error: (err) => {
          console.error('Errore eliminazione scadenza:', err);
          this.error = this.parseServerError(err);
          this.popup.showError(this.error);
        },
      });
  }

  deleteExistingAttachment(attachment: DeadlineAttachment): void {
    if (!this.editingDeadline || !this.canEdit) return;

    const confirmed = confirm(
      `Eliminare l'allegato "${attachment.originalName}"?`,
    );
    if (!confirmed) return;

    this.http
      .post<{ ok: boolean; attachments: DeadlineAttachment[] }>(
        this.globalService.url + 'admin/deadlines/delete-attachment',
        {
          deadlineId: this.editingDeadline.id,
          attachmentId: attachment.id,
        },
      )
      .subscribe({
        next: (response) => {
          const attachments = Array.isArray(response?.attachments)
            ? response.attachments
            : this.formAttachments.filter((item) => item.id !== attachment.id);

          this.formAttachments = attachments;
          this.syncLocalDeadlineAttachments(this.editingDeadline!.id, attachments);
          this.editingDeadline = {
            ...this.editingDeadline!,
            attachments,
          };
          this.success = 'Allegato eliminato.';
        },
        error: (err) => {
          console.error('Errore eliminazione allegato:', err);
          this.error = this.parseServerError(err);
          this.popup.showError(this.error);
        },
      });
  }

  downloadAttachment(
    deadline: DeadlineRecord,
    attachment: DeadlineAttachment,
  ): void {
    this.http
      .post(
        this.globalService.url + 'admin/deadlines/download-attachment',
        {
          deadlineId: deadline.id,
          attachmentId: attachment.id,
        },
        { responseType: 'blob' },
      )
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = attachment.originalName;
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: (err) => {
          console.error('Errore download allegato:', err);
          this.error = this.parseServerError(err);
          this.popup.showError(this.error);
        },
      });
  }

  getEntityLabel(entity: any): string {
    if (this.kind === 'employee') {
      return `${entity?.nome || ''} ${entity?.cognome || ''}`.trim();
    }

    return entity?.plate
      ? `${entity?.name || ''} (${entity.plate})`
      : String(entity?.name || '').trim();
  }

  getEntitySubtitle(entity: any): string {
    if (this.kind === 'employee') {
      return [entity?.email, entity?.cellulare].filter(Boolean).join(' • ');
    }

    return entity?.plate ? `Targa: ${entity.plate}` : 'Targa non inserita';
  }

  formatDueDate(value: string): string {
    const [year, month, day] = String(value || '').split('-');
    if (!year || !month || !day) return value || '—';
    return `${day}/${month}/${year}`;
  }

  relativeDueLabel(deadline: DeadlineRecord): string {
    if (deadline.daysUntil === null || deadline.daysUntil === undefined) {
      return '';
    }

    if (deadline.status === 'expired') {
      if (deadline.daysUntil === -1) return 'Scaduta ieri';
      return `Scaduta da ${Math.abs(deadline.daysUntil)} giorni`;
    }

    if (deadline.daysUntil === 0) return 'Scade oggi';
    if (deadline.daysUntil === 1) return 'Scade domani';
    return `Scade tra ${deadline.daysUntil} giorni`;
  }

  remindLabel(remindDays: number | null): string {
    if (remindDays === null || remindDays === undefined || remindDays === 0) {
      return 'Promemoria il giorno della scadenza';
    }

    if (remindDays === 1) {
      return 'Promemoria 1 giorno prima';
    }

    return `Promemoria ${remindDays} giorni prima`;
  }

  statusLabel(status: DeadlineStatus): string {
    if (status === 'expired') return 'Scaduta';
    if (status === 'warning') return 'In scadenza';
    return 'Programmato';
  }

  statusClass(status: DeadlineStatus): string {
    if (status === 'expired') return 'status-expired';
    if (status === 'warning') return 'status-warning';
    return 'status-ok';
  }

  formatFileSize(size: number): string {
    const value = Number(size) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  private rebuildGroups(): void {
    const map = new Map<number, DeadlineRecord[]>();

    for (const deadline of this.deadlines) {
      const entityId = this.getEntityIdFromDeadline(deadline);
      if (!entityId) continue;

      if (!map.has(entityId)) {
        map.set(entityId, []);
      }

      map.get(entityId)?.push(deadline);
    }

    const groups: DeadlineGroup[] = [];
    const entities = this.entities.length
      ? this.entities
      : this.deadlines.map((deadline) => this.getEntityFromDeadline(deadline));

    const uniqueIds = new Set<number>();

    for (const entity of entities) {
      const entityId = Number((entity as any)?.id);
      if (!entityId || uniqueIds.has(entityId)) continue;

      uniqueIds.add(entityId);
      const deadlines = (map.get(entityId) || []).slice().sort((a, b) => {
        return String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
      });

      groups.push({
        id: entityId,
        label: this.getEntityLabel(entity),
        subtitle: this.getEntitySubtitle(entity),
        deadlines,
        summary: this.summarize(deadlines),
      });
    }

    this.groups = groups.sort((a, b) => {
      if (this.preselectedEntityId) {
        if (a.id === this.preselectedEntityId && b.id !== this.preselectedEntityId) {
          return -1;
        }
        if (b.id === this.preselectedEntityId && a.id !== this.preselectedEntityId) {
          return 1;
        }
      }

      const severityDiff = this.statusRank(a.summary.status) - this.statusRank(b.summary.status);
      if (severityDiff !== 0) return severityDiff;

      return a.label.localeCompare(b.label, 'it');
    });
  }

  private summarize(deadlines: DeadlineRecord[]): DeadlineSummary {
    const summary: DeadlineSummary = {
      expiredCount: 0,
      warningCount: 0,
      alertCount: 0,
      totalCount: deadlines.length,
      status: 'ok',
    };

    for (const deadline of deadlines) {
      if (deadline.status === 'expired') summary.expiredCount += 1;
      if (deadline.status === 'warning') summary.warningCount += 1;
    }

    summary.alertCount = summary.expiredCount + summary.warningCount;
    summary.status =
      summary.expiredCount > 0
        ? 'expired'
        : summary.warningCount > 0
          ? 'warning'
          : 'ok';

    return summary;
  }

  private getEntityIdFromDeadline(deadline: DeadlineRecord): number {
    return Number(
      this.kind === 'employee'
        ? deadline.employeeId || deadline.employee?.id
        : deadline.vehicleId || deadline.vehicle?.id,
    );
  }

  private syncLocalDeadlineAttachments(
    deadlineId: number,
    attachments: DeadlineAttachment[],
  ): void {
    this.deadlines = this.deadlines.map((deadline) =>
      deadline.id === deadlineId
        ? { ...deadline, attachments: [...attachments] }
        : deadline,
    );
    this.rebuildGroups();
  }

  private getEntityFromDeadline(deadline: DeadlineRecord): any {
    if (this.kind === 'employee') {
      return deadline.employee || { id: deadline.employeeId };
    }

    return deadline.vehicle || { id: deadline.vehicleId };
  }

  private statusRank(status: DeadlineStatus): number {
    if (status === 'expired') return 0;
    if (status === 'warning') return 1;
    return 2;
  }

  private parseNumericId(value: string | null): number | null {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private normalizeFieldValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private parseServerError(err: any): string {
    try {
      const body =
        typeof err?.error === 'string' ? JSON.parse(err.error) : err?.error;
      if (body?.error) return body.error;
    } catch {}

    if (err?.status === 0) return 'Impossibile connettersi al server';
    return 'Errore imprevisto. Riprova.';
  }
}
