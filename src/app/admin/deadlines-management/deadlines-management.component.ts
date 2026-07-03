import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';

type DeadlineKind = 'employee' | 'vehicle' | 'equipment' | 'customer' | 'internal';
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

interface GenericTarget {
  id: string;
  targetKey: string;
  targetLabel: string;
  numeroCliente?: string;
  quantity?: number;
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
  targetKey?: string;
  targetLabel?: string;
  folder?: string;
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
  id: string | number;
  label: string;
  subtitle: string;
  deadlines: DeadlineRecord[];
  summary: DeadlineSummary;
}

interface DeadlineFolderGroup {
  folder: string;
  deadlines: DeadlineRecord[];
  summary: DeadlineSummary;
}

interface DeadlineHistoryEntry {
  id: number;
  deadlineId: number;
  action: string;
  summary: string;
  changes: Record<string, any>;
  snapshot: Record<string, any>;
  actorEmail?: string | null;
  createdAt: string;
}

@Component({
  selector: 'app-deadlines-management',
  templateUrl: './deadlines-management.component.html',
  styleUrls: ['./deadlines-management.component.css'],
})
export class DeadlinesManagementComponent implements OnInit {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  kind: DeadlineKind = 'employee';
  entities: Array<EmployeeTarget | VehicleTarget | GenericTarget> = [];
  deadlines: DeadlineRecord[] = [];
  groups: DeadlineGroup[] = [];
  selectedGroup: DeadlineGroup | null = null;

  loading = false;
  entitiesLoading = false;
  saving = false;
  showForm = false;
  error = '';
  success = '';
  preselectedEntityId: string | number | null = null;
  pendingFiles: File[] = [];
  editingDeadline: DeadlineRecord | null = null;
  formAttachments: DeadlineAttachment[] = [];
  historyByDeadlineId: Record<number, DeadlineHistoryEntry[]> = {};
  historyOpenByDeadlineId: Record<number, boolean> = {};
  historyLoadingByDeadlineId: Record<number, boolean> = {};
  searchText = '';

  form: {
    entityId: string | number | null;
    targetLabel: string;
    folder: string;
    title: string;
    description: string;
    dueDate: string;
    remindDays: string;
  } = {
    entityId: null,
    targetLabel: '',
    folder: 'Generale',
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
      this.route.snapshot.data['kind'] === 'vehicle'
        ? 'vehicle'
        : this.route.snapshot.data['kind'] === 'equipment'
          ? 'equipment'
          : this.route.snapshot.data['kind'] === 'customer'
            ? 'customer'
            : this.route.snapshot.data['kind'] === 'internal'
              ? 'internal'
              : 'employee';

    const paramKey =
      this.kind === 'employee'
        ? 'employeeId'
        : this.kind === 'vehicle'
          ? 'vehicleId'
          : 'targetKey';
    const rawPreselected = this.route.snapshot.queryParamMap.get(paramKey);
    this.preselectedEntityId =
      this.kind === 'employee' || this.kind === 'vehicle'
        ? this.parseNumericId(rawPreselected)
        : rawPreselected;

    this.resetForm();
    this.loadAll();
  }

  get entityLabel(): string {
    if (this.kind === 'employee') return 'dipendente';
    if (this.kind === 'vehicle') return 'mezzo';
    if (this.kind === 'equipment') return 'attrezzatura';
    if (this.kind === 'customer') return 'cliente';
    return 'area aziendale';
  }

  get pageTitle(): string {
    if (this.kind === 'employee') return 'Scadenze dipendenti';
    if (this.kind === 'vehicle') return 'Scadenze mezzi';
    if (this.kind === 'equipment') return 'Scadenze attrezzature';
    if (this.kind === 'customer') return 'Scadenze clienti';
    return 'Scadenze interne';
  }

  get pageDescription(): string {
    if (this.kind === 'employee') {
      return 'Apri un dipendente per vedere cartelle, file e scadenze collegate.';
    }
    if (this.kind === 'vehicle') {
      return 'Apri un mezzo per vedere cartelle, file e scadenze collegate.';
    }
    if (this.kind === 'equipment') {
      return 'Organizza certificazioni, controlli e documenti delle attrezzature.';
    }
    if (this.kind === 'customer') {
      return 'Controlla le scadenze collegate ai clienti, divise per cartelle.';
    }
    return 'Gestisci scadenze aziendali interne, cartelle e allegati.';
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

  get hasActiveSearch(): boolean {
    return !!this.normalizeSearch(this.searchText);
  }

  get searchPlaceholder(): string {
    if (this.kind === 'employee') {
      return 'Cerca dipendente, cartella, scadenza o allegato';
    }
    if (this.kind === 'vehicle') {
      return 'Cerca mezzo, targa, cartella, scadenza o allegato';
    }
    if (this.kind === 'equipment') {
      return 'Cerca attrezzatura, cartella, scadenza o allegato';
    }
    if (this.kind === 'customer') {
      return 'Cerca cliente, codice, cartella, scadenza o allegato';
    }
    return 'Cerca area, cartella, scadenza o allegato';
  }

  get emptyStateTitle(): string {
    if (this.kind === 'employee') return 'Nessun dipendente disponibile.';
    if (this.kind === 'vehicle') return 'Nessun mezzo disponibile.';
    if (this.kind === 'equipment') return 'Nessuna attrezzatura creata.';
    if (this.kind === 'customer') return 'Nessun cliente disponibile.';
    return 'Nessuna area interna creata.';
  }

  get emptyStateMessage(): string {
    if (this.kind === 'employee') {
      return 'Crea prima un dipendente, poi potrai aggiungere le sue scadenze da questa pagina.';
    }
    if (this.kind === 'vehicle') {
      return 'Crea prima un mezzo, poi potrai aggiungere revisione, assicurazione e altre scadenze.';
    }
    if (this.kind === 'equipment') {
      return 'Crea prima un\'attrezzatura in Gestione attrezzature, poi potrai collegare revisioni, certificazioni e documenti.';
    }
    if (this.kind === 'customer') {
      return 'Crea prima un cliente, poi potrai collegare le sue scadenze.';
    }
    return 'Inserisci la prima scadenza interna: dopo il salvataggio comparira la riga con dettaglio e nuove scadenze.';
  }

  get emptyStateActionLabel(): string {
    if (this.kind === 'equipment') return 'Vai a gestione attrezzature';
    if (this.kind === 'internal') return '+ Crea prima scadenza interna';
    return '+ Aggiungi scadenza';
  }

  get filteredGroups(): DeadlineGroup[] {
    const query = this.normalizeSearch(this.searchText);
    if (!query) return this.groups;

    return this.groups
      .map((group) => this.filterGroupForSearch(group, query))
      .filter((group): group is DeadlineGroup => !!group);
  }

  get selectedGroupView(): DeadlineGroup | null {
    if (!this.selectedGroup) return null;

    const currentGroup =
      this.groups.find((group) => String(group.id) === String(this.selectedGroup?.id)) ||
      this.selectedGroup;
    const query = this.normalizeSearch(this.searchText);
    if (!query) return currentGroup;

    return (
      this.filterGroupForSearch(currentGroup, query) || {
        ...currentGroup,
        deadlines: [],
        summary: this.summarize([]),
      }
    );
  }

  get selectedFolderGroups(): DeadlineFolderGroup[] {
    if (!this.selectedGroupView) return [];
    if (this.hasActiveSearch && this.selectedGroupView.deadlines.length === 0) {
      return [];
    }
    return this.getFolderGroups(this.selectedGroupView);
  }

  get canSave(): boolean {
    return (
      !!this.form.entityId &&
      !!this.normalizeFieldValue(this.form.folder) &&
      !!this.normalizeFieldValue(this.form.title) &&
      !!this.normalizeFieldValue(this.form.dueDate)
    );
  }

  get canCreate(): boolean {
    return this.globalService.hasPermission(
      this.permissionKey('CREATE'),
    );
  }

  get canEdit(): boolean {
    return this.globalService.hasPermission(
      this.permissionKey('EDIT'),
    );
  }

  get canDelete(): boolean {
    return this.globalService.hasPermission(
      this.permissionKey('DELETE'),
    );
  }

  get isEditing(): boolean {
    return !!this.editingDeadline;
  }

  get formTitle(): string {
    return this.isEditing ? 'Aggiorna scadenza' : 'Nuova scadenza';
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
    if (this.showForm) {
      this.cancelForm();
      return;
    }
    if (this.selectedGroup) {
      this.closeGroup();
      return;
    }
    this.router.navigateByUrl('/homeAdmin');
  }

  loadAll(): void {
    this.error = '';
    this.loading = true;
    this.entitiesLoading = true;
    this.selectedGroup = null;
    this.loadEntities();
    this.loadDeadlines();
  }

  loadEntities(): void {
    const endpoint = `admin/deadlines/${this.endpointSegment}/targets`;

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
    const endpoint = `admin/deadlines/${this.endpointSegment}`;

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

  openAddForm(entityId?: string | number): void {
    if (!this.canCreate) return;
    if (this.kind === 'equipment' && !entityId && !this.preselectedEntityId && this.entities.length === 0) {
      this.router.navigateByUrl('/homeAdmin/equipmentSettings');
      return;
    }

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
      this.form.entityId = (this.entities[0] as any).id;
    }

    if (this.kind === 'internal' && !this.form.entityId) {
      this.form.entityId = 'azienda';
      this.form.targetLabel = 'Azienda';
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
      targetLabel: deadline.targetLabel || '',
      folder: deadline.folder || 'Generale',
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
      targetLabel: '',
      folder: 'Generale',
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
    const folder = this.normalizeFieldValue(this.form.folder) || 'Generale';
    const remindDays = this.normalizeFieldValue(this.form.remindDays);

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('dueDate', dueDate);
    formData.append('folder', folder);

    if (this.isEditing && this.editingDeadline) {
      formData.append('id', String(this.editingDeadline.id));
    } else {
      if (this.kind === 'employee') {
        formData.append('employeeId', String(this.form.entityId));
      } else if (this.kind === 'vehicle') {
        formData.append('vehicleId', String(this.form.entityId));
      } else {
        const selected = this.entities.find((entity) =>
          String((entity as any).id) === String(this.form.entityId),
        );
        const targetLabel =
          this.normalizeFieldValue(this.form.targetLabel) ||
          this.getEntityLabel(selected) ||
          String(this.form.entityId || '');

        formData.append('targetKey', String(this.form.entityId || targetLabel));
        formData.append('targetLabel', targetLabel);
      }
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
        : `admin/deadlines/${this.endpointSegment}`;

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
        this.loadAll();
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
          delete this.historyByDeadlineId[this.editingDeadline!.id];
          this.success = 'Allegato eliminato.';
        },
        error: (err) => {
          console.error('Errore eliminazione allegato:', err);
          this.error = this.parseServerError(err);
          this.popup.showError(this.error);
        },
      });
  }

  toggleHistory(deadline: DeadlineRecord): void {
    const isOpen = !!this.historyOpenByDeadlineId[deadline.id];
    this.historyOpenByDeadlineId[deadline.id] = !isOpen;

    if (!isOpen && !this.historyByDeadlineId[deadline.id]) {
      this.loadHistory(deadline);
    }
  }

  loadHistory(deadline: DeadlineRecord): void {
    if (this.historyLoadingByDeadlineId[deadline.id]) return;

    this.historyLoadingByDeadlineId[deadline.id] = true;
    this.http
      .get<DeadlineHistoryEntry[]>(
        this.globalService.url + `admin/deadlines/history/${deadline.id}`,
      )
      .subscribe({
        next: (history) => {
          this.historyByDeadlineId[deadline.id] = Array.isArray(history)
            ? history
            : [];
          this.historyLoadingByDeadlineId[deadline.id] = false;
        },
        error: (err) => {
          console.error('Errore caricamento storico scadenza:', err);
          this.historyLoadingByDeadlineId[deadline.id] = false;
          this.error = this.parseServerError(err);
          this.popup.showError(this.error);
        },
      });
  }

  historyActionLabel(action: string): string {
    const labels: Record<string, string> = {
      created: 'Creazione',
      updated: 'Aggiornamento',
      deleted: 'Eliminazione',
      attachment_deleted: 'Allegato eliminato',
      current_state: 'Stato attuale',
    };
    return labels[action] || action;
  }

  formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value || '—';
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  historyChangeLines(entry: DeadlineHistoryEntry): string[] {
    const changes = entry.changes || {};
    const labels: Record<string, string> = {
      title: 'Titolo',
      description: 'Descrizione',
      folder: 'Cartella',
      dueDate: 'Data scadenza',
      remindDays: 'Preavviso',
    };

    const lines: string[] = [];
    for (const [key, value] of Object.entries(changes)) {
      if (key === 'attachmentsAdded' && Array.isArray(value) && value.length) {
        lines.push(`Allegati aggiunti: ${value.join(', ')}`);
        continue;
      }

      if (key === 'attachment' && value) {
        lines.push(`Allegato: ${value}`);
        continue;
      }

      if (value && typeof value === 'object' && 'before' in value && 'after' in value) {
        lines.push(`${labels[key] || key}: ${value.before || '—'} → ${value.after || '—'}`);
      }
    }

    return lines;
  }

  historySnapshotLines(entry: DeadlineHistoryEntry): string[] {
    const snapshot = entry.snapshot || {};
    const lines = [
      `Titolo: ${snapshot['title'] || '—'}`,
      `Cartella: ${snapshot['folder'] || 'Generale'}`,
      `Data scadenza: ${this.formatDueDate(snapshot['dueDate'])}`,
      `Preavviso: ${this.remindLabel(snapshot['remindDays'])}`,
    ];

    if (snapshot['description']) {
      lines.push(`Descrizione: ${snapshot['description']}`);
    }

    const attachments = Array.isArray(snapshot['attachments'])
      ? snapshot['attachments']
      : [];
    if (attachments.length > 0) {
      lines.push(
        `Allegati: ${attachments.map((item: any) => item.originalName || item.storedName).filter(Boolean).join(', ')}`,
      );
    } else {
      lines.push('Allegati: nessuno');
    }

    return lines;
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
    if (!entity) return '';
    if (this.kind === 'employee') {
      return `${entity?.nome || ''} ${entity?.cognome || ''}`.trim();
    }

    if (this.kind === 'vehicle') {
      return entity?.plate
      ? `${entity?.name || ''} (${entity.plate})`
      : String(entity?.name || '').trim();
    }

    return String(entity?.targetLabel || entity?.nome || entity?.ragioneSociale || entity?.numeroCliente || entity?.id || '').trim();
  }

  getEntitySubtitle(entity: any): string {
    if (this.kind === 'employee') {
      return [entity?.email, entity?.cellulare].filter(Boolean).join(' • ');
    }

    if (this.kind === 'vehicle') {
    return entity?.plate ? `Targa: ${entity.plate}` : 'Targa non inserita';
    }

    if (this.kind === 'customer') {
      return entity?.numeroCliente ? `Cliente ${entity.numeroCliente}` : '';
    }

    if (this.kind === 'equipment') {
      return entity?.quantity ? `Quantità: ${entity.quantity}` : 'Attrezzatura aziendale';
    }

    return 'Scadenza aziendale interna';
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

  openGroup(group: DeadlineGroup): void {
    this.selectedGroup = group;
    this.showForm = false;
    this.error = '';
  }

  closeGroup(): void {
    this.selectedGroup = null;
    this.showForm = false;
    this.error = '';
  }

  clearSearch(): void {
    this.searchText = '';
  }

  getFolderGroups(group: DeadlineGroup | null): DeadlineFolderGroup[] {
    if (!group) return [];

    const folders = new Map<string, DeadlineRecord[]>();
    for (const deadline of group.deadlines) {
      const folder = this.normalizeFieldValue(deadline.folder) || 'Generale';
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder)?.push(deadline);
    }

    if (folders.size === 0) {
      folders.set('Generale', []);
    }

    return [...folders.entries()]
      .map(([folder, deadlines]) => ({
        folder,
        deadlines: deadlines.slice().sort((a, b) =>
          String(a.dueDate || '').localeCompare(String(b.dueDate || '')),
        ),
        summary: this.summarize(deadlines),
      }))
      .sort((a, b) => {
        const severityDiff = this.statusRank(a.summary.status) - this.statusRank(b.summary.status);
        if (severityDiff !== 0) return severityDiff;
        return a.folder.localeCompare(b.folder, 'it');
      });
  }

  getFolderFileCount(folder: DeadlineFolderGroup): number {
    return folder.deadlines.reduce(
      (count, deadline) => count + (deadline.attachments?.length || 0),
      0,
    );
  }

  formatFileSize(size: number): string {
    const value = Number(size) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  private get endpointSegment(): string {
    if (this.kind === 'employee') return 'employees';
    if (this.kind === 'vehicle') return 'vehicles';
    if (this.kind === 'customer') return 'customers';
    return this.kind;
  }

  private permissionKey(action: 'CREATE' | 'EDIT' | 'DELETE' | 'VIEW'): string {
    const prefix =
      this.kind === 'employee'
        ? 'EMPLOYEE'
        : this.kind === 'vehicle'
          ? 'VEHICLE'
          : this.kind === 'equipment'
            ? 'EQUIPMENT'
            : this.kind === 'customer'
              ? 'CUSTOMER'
              : 'INTERNAL';
    return `${prefix}_DEADLINES_${action}`;
  }

  private rebuildGroups(): void {
    const map = new Map<string, DeadlineRecord[]>();

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

    const uniqueIds = new Set<string>();

    for (const entity of entities) {
      const entityId = String((entity as any)?.id || (entity as any)?.targetKey || '');
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
        if (String(a.id) === String(this.preselectedEntityId) && String(b.id) !== String(this.preselectedEntityId)) {
          return -1;
        }
        if (String(b.id) === String(this.preselectedEntityId) && String(a.id) !== String(this.preselectedEntityId)) {
          return 1;
        }
      }

      const severityDiff = this.statusRank(a.summary.status) - this.statusRank(b.summary.status);
      if (severityDiff !== 0) return severityDiff;

      return a.label.localeCompare(b.label, 'it');
    });

    if (this.selectedGroup) {
      this.selectedGroup =
        this.groups.find((group) => String(group.id) === String(this.selectedGroup?.id)) ||
        null;
    }
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

  private getEntityIdFromDeadline(deadline: DeadlineRecord): string {
    if (this.kind === 'employee') {
      return String(deadline.employeeId || deadline.employee?.id || '');
    }

    if (this.kind === 'vehicle') {
      return String(deadline.vehicleId || deadline.vehicle?.id || '');
    }

    return String(deadline.targetKey || deadline.targetLabel || '');
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

    if (this.kind === 'vehicle') {
      return deadline.vehicle || { id: deadline.vehicleId };
    }

    return {
      id: deadline.targetKey || deadline.targetLabel,
      targetKey: deadline.targetKey || deadline.targetLabel || '',
      targetLabel: deadline.targetLabel || deadline.targetKey || '',
    };
  }

  private statusRank(status: DeadlineStatus): number {
    if (status === 'expired') return 0;
    if (status === 'warning') return 1;
    return 2;
  }

  private filterGroupForSearch(
    group: DeadlineGroup,
    query: string,
  ): DeadlineGroup | null {
    const groupText = this.normalizeSearch([
      group.label,
      group.subtitle,
      group.id,
    ].join(' '));

    if (groupText.includes(query)) {
      return group;
    }

    const deadlines = group.deadlines.filter((deadline) =>
      this.deadlineMatchesSearch(deadline, query),
    );

    if (deadlines.length === 0) return null;

    return {
      ...group,
      deadlines,
      summary: this.summarize(deadlines),
    };
  }

  private deadlineMatchesSearch(deadline: DeadlineRecord, query: string): boolean {
    const attachmentNames = (deadline.attachments || [])
      .map((attachment) => attachment.originalName)
      .join(' ');
    const entity = this.getEntityFromDeadline(deadline);

    const text = this.normalizeSearch([
      deadline.title,
      deadline.description,
      deadline.folder,
      deadline.targetLabel,
      deadline.targetKey,
      deadline.dueDate,
      this.formatDueDate(deadline.dueDate),
      this.statusLabel(deadline.status),
      this.relativeDueLabel(deadline),
      this.remindLabel(deadline.remindDays),
      attachmentNames,
      this.getEntityLabel(entity),
      this.getEntitySubtitle(entity),
    ].join(' '));

    return text.includes(query);
  }

  private normalizeSearch(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
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
