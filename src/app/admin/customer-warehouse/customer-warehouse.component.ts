import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';

@Component({
  selector: 'app-customer-warehouse',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customer-warehouse.component.html',
  styleUrls: ['./customer-warehouse.component.css'],
})
export class CustomerWarehouseComponent implements OnInit, OnDestroy {

  readonly realtimeResources = ["customer_warehouse"];
  refreshRealtimeData(): void | boolean | Promise<void | boolean> {
    if (this.loading || this.reopeningOperationId) return false;
    const search = this.search;
    this.http.get<any>(this.global.url + 'admin/customer-warehouse/practices', {
      params: search ? { q: search } : {},
    }).subscribe({ next: res => { if (search === this.search) this.practices = res?.practices || []; } });
    const selectedId = this.selected?.id;
    const request = this.practiceRequest;
    if (selectedId) this.http.get<any>(this.global.url + `admin/customer-warehouse/practices/${selectedId}`, { params: { history: '1' } }).subscribe({
      next: res => {
        if (request === this.practiceRequest && this.selected?.id === selectedId) this.selected = res.practice;
      },
    });
  }
  practices: any[] = [];
  selected: any = null;
  search = '';
  verifyCode = '';
  verification: any = null;
  listMode: 'practices' | 'verify' = 'practices';
  listFilter: 'active' | 'completed' | 'all' = 'active';
  loading = false;
  message = '';
  error = '';
  operationToReopenId: number | null = null;
  reopeningOperationId: number | null = null;
  activeSection: 'inventory' | 'operations' | 'history' = 'inventory';
  groupLabel = 'Stanza';
  selectedGroupId: number | null = null;
  groupSearch = '';
  showDeletedGroups = false;
  selectedItemId: number | null = null;
  expandedPieceId: number | null = null;
  itemSection: 'pieces' | 'photos' = 'pieces';
  inventorySearch = '';
  showDeletedItems = false;
  showDeletedPieces = false;
  private historyReturnSection: 'inventory' | 'operations' = 'inventory';
  private practiceRequest = 0;
  historyEvents: any[] = [];
  historyTotal = 0;
  historyVisible = false;
  historyLoading = false;
  historyTitle = '';
  historyItemId: number | null = null;
  historyPieceId: number | null = null;
  private historyRequest = 0;

  constructor(private http: HttpClient, public global: GlobalService, private router: Router, private popup: PopupServiceService) {}

  ngOnInit(): void { this.loadConfig(); this.load(); }
  ngOnDestroy(): void { this.historyRequest++; this.practiceRequest++; }

  loadConfig(): void {
    this.http.get<any>(this.global.url + 'admin/customer-warehouse/config').subscribe({
      next: res => { this.groupLabel = String(res?.config?.groupLabel || 'Stanza').trim() || 'Stanza'; },
      error: () => { this.groupLabel = 'Raggruppamento'; },
    });
  }
  get groupListLabel(): string {
    return ({ stanza: 'Stanze', area: 'Aree', raggruppamento: 'Raggruppamenti' } as Record<string, string>)[this.groupLabel.toLocaleLowerCase()] || this.groupLabel;
  }
  get groupBackLabel(): string { return `Elenco ${this.groupListLabel.toLocaleLowerCase()}`; }

  load(): void {
    this.loading = true; this.error = '';
    this.http.get<any>(this.global.url + 'admin/customer-warehouse/practices', {
      params: this.search ? { q: this.search } : {},
    }).subscribe({
      next: (res) => { this.practices = res?.practices || []; this.loading = false; },
      error: (err) => this.fail(err, 'Impossibile caricare le pratiche.'),
    });
  }

  open(practice: any): void {
    this.operationToReopenId = null;
    const request = ++this.practiceRequest;
    this.historyVisible = false; this.historyRequest++;
    if (this.activeSection === 'history') this.activeSection = this.historyReturnSection;
    this.loading = true; this.error = '';
    this.http.get<any>(this.global.url + `admin/customer-warehouse/practices/${practice.id}`, { params: { history: '1' } }).subscribe({
      next: (res) => {
        if (request !== this.practiceRequest) return;
        if (this.selected?.id !== res.practice?.id) this.resetInventoryNavigation();
        this.selected = res.practice; this.loading = false;
        if (this.selectedGroupId && !this.selectedGroup) this.closeGroup();
        if (this.selectedItemId && !this.selectedItem) this.closeItem();
      },
      error: (err) => { if (request === this.practiceRequest) this.fail(err, 'Impossibile aprire la pratica.'); },
    });
  }

  close(): void {
    this.operationToReopenId = null;
    this.selected = null; this.verification = null; this.historyVisible = false;
    this.historyRequest++; this.practiceRequest++; this.loading = false;
    this.resetInventoryNavigation();
  }

  selectListMode(mode: 'practices' | 'verify'): void {
    this.listMode = mode; this.error = ''; this.message = '';
    if (mode === 'practices') this.verification = null;
  }

  filteredPractices(): any[] {
    if (this.listFilter === 'all') return this.practices;
    return this.practices.filter(practice => this.listFilter === 'completed'
      ? this.practiceWorkflow(practice).completed
      : !this.practiceWorkflow(practice).completed);
  }

  practiceFilterCount(filter: 'active' | 'completed' | 'all'): number {
    if (filter === 'all') return this.practices.length;
    return this.practices.filter(practice => filter === 'completed'
      ? this.practiceWorkflow(practice).completed
      : !this.practiceWorkflow(practice).completed).length;
  }

  practiceWorkflow(practice: any): { code: string; label: string; hint: string; completed: boolean } {
    if (practice?.workflow) return practice.workflow;
    const counts = practice?.counts || {};
    const operations = practice?.operations || [];
    const active = (type: string, status: string) => operations.some((operation: any) => operation.type === type && operation.status === status);
    if (active('unload', 'in_progress')) return { code: 'unload_in_progress', label: 'Scarico in corso', hint: 'La squadra sta registrando la riconsegna.', completed: false };
    if (active('load', 'in_progress')) return { code: 'load_in_progress', label: 'Carico in corso', hint: 'La squadra sta registrando il carico.', completed: false };
    if (active('load', 'scheduled') && Number(counts.inventoried || 0) > 0) return { code: 'ready_to_load', label: 'Da caricare', hint: 'Il carico è pianificato.', completed: false };
    if (active('unload', 'scheduled') && Number(counts.loaded || 0) > 0) return { code: 'ready_to_unload', label: 'Da scaricare', hint: 'Lo scarico è pianificato.', completed: false };
    if (active('load', 'scheduled')) return { code: 'ready_to_load', label: 'Da caricare', hint: 'La squadra deve prima creare elementi ed etichette.', completed: false };
    if (active('unload', 'scheduled')) return { code: 'ready_to_unload', label: 'Da scaricare', hint: 'Non risultano ancora pezzi caricati.', completed: false };
    if (Number(counts.loaded || 0) > 0) return { code: 'stored', label: 'Merce in magazzino', hint: 'Attende la pianificazione dello scarico.', completed: false };
    if (Number(counts.inventoried || 0) > 0) return { code: 'inventory', label: 'Inventario da completare', hint: 'La merce non è ancora caricata.', completed: false };
    if (Number(counts.unloaded || 0) > 0) return { code: 'completed', label: 'Merce riconsegnata', hint: 'Tutti i pezzi risultano scaricati.', completed: true };
    return { code: 'empty', label: 'Inventario da creare', hint: 'La squadra deve creare elementi ed etichette.', completed: false };
  }

  private resetInventoryNavigation(): void {
    this.selectedGroupId = null; this.groupSearch = ''; this.showDeletedGroups = false;
    this.activeSection = 'inventory'; this.selectedItemId = null; this.expandedPieceId = null;
    this.itemSection = 'pieces'; this.inventorySearch = ''; this.showDeletedItems = false; this.showDeletedPieces = false;
  }
  selectSection(section: 'inventory' | 'operations' | 'history'): void {
    this.operationToReopenId = null;
    if (section === 'history') { this.openHistory(); return; }
    this.historyRequest++; this.historyVisible = false; this.historyLoading = false; this.activeSection = section;
  }
  get selectedItem(): any { return this.selected?.items?.find((item: any) => item.id === this.selectedItemId) || null; }
  get selectedGroup(): any { return this.selected?.groups?.find((group: any) => group.id === this.selectedGroupId) || null; }
  visibleGroups(): any[] {
    const query = this.groupSearch.trim().toLocaleLowerCase();
    return (this.selected?.groups || []).filter((group: any) => (this.showDeletedGroups || !group.deletedAt)
      && `${group.name} ${group.id}`.toLocaleLowerCase().includes(query));
  }
  groupItems(group: any): any[] { return (this.selected?.items || []).filter((item: any) => item.groupId === group.id && !item.deletedAt); }
  groupPieceCount(group: any): number { return this.groupItems(group).reduce((sum, item) => sum + this.activePieceCount(item), 0); }
  openGroup(group: any): void {
    this.selectedGroupId = group.id; this.closeItem(); this.inventorySearch = '';
    this.showDeletedItems = !!group.deletedAt; this.activeSection = 'inventory';
  }
  closeGroup(): void {
    this.closeItem(); this.selectedGroupId = null; this.inventorySearch = ''; this.showDeletedItems = false;
  }
  visibleItems(): any[] {
    const query = this.inventorySearch.trim().toLocaleLowerCase();
    return (this.selected?.items || []).filter((item: any) => item.groupId === this.selectedGroupId && (this.showDeletedItems || !item.deletedAt)
      && `${item.name} ${this.groupFor(item)?.name || ''} ${item.id}`.toLocaleLowerCase().includes(query));
  }
  activePieceCount(item: any): number { return this.piecesFor(item).filter(piece => !piece.deletedAt).length; }
  loadedPieceCount(item: any): number { return this.piecesFor(item).filter(piece => !piece.deletedAt && piece.physicalStatus === 'loaded').length; }
  openItem(item: any): void {
    this.selectedGroupId = item.groupId;
    this.selectedItemId = item.id; this.expandedPieceId = null; this.itemSection = 'pieces';
    this.showDeletedPieces = !!item.deletedAt; this.activeSection = 'inventory';
  }
  closeItem(): void { this.selectedItemId = null; this.expandedPieceId = null; this.itemSection = 'pieces'; }
  visiblePieces(item: any): any[] { return this.piecesFor(item).filter(piece => this.showDeletedPieces || !piece.deletedAt); }
  hasDeletedPieces(item: any): boolean { return this.piecesFor(item).some(piece => !!piece.deletedAt); }
  togglePiece(piece: any): void { this.expandedPieceId = this.expandedPieceId === piece.id ? null : piece.id; }
  labelsFor(piece: any): any[] { return (this.selected?.labels || []).filter((label: any) => label.pieceId === piece.id); }
  piecePhotos(piece: any): any[] { return (this.selected?.photos || []).filter((photo: any) => photo.pieceId === piece.id); }
  trackById(_index: number, row: any): number { return row.id; }

  openHistory(item?: any, piece?: any): void {
    if (this.activeSection !== 'history') this.historyReturnSection = this.activeSection;
    this.activeSection = 'history';
    this.historyItemId = item?.id || null; this.historyPieceId = piece?.id || null;
    this.historyTitle = piece ? `${item.name} · Pezzo ${piece.permanentId}` : item ? `${item.name} · Elemento #${item.id}` : 'Tutta la pratica';
    this.historyVisible = true; this.historyEvents = []; this.historyTotal = 0;
    this.loadHistory();
  }
  closeHistory(): void {
    this.historyRequest++; this.historyVisible = false; this.historyLoading = false;
    this.activeSection = this.historyReturnSection;
  }

  loadHistory(more = false): void {
    if (!this.selected) return;
    const request = ++this.historyRequest;
    const params: any = { offset: more ? this.historyEvents.length : 0, limit: 40 };
    if (this.historyItemId) params.itemId = this.historyItemId;
    if (this.historyPieceId) params.pieceId = this.historyPieceId;
    this.historyLoading = true; this.error = '';
    this.http.get<any>(this.global.url + `admin/customer-warehouse/practices/${this.selected.id}/history`, { params }).subscribe({
      next: result => {
        if (request !== this.historyRequest) return;
        this.historyEvents = more ? [...this.historyEvents, ...result.events] : result.events;
        this.historyTotal = result.total; this.historyLoading = false;
        if (!more) setTimeout(() => {
          if (request === this.historyRequest && this.historyVisible) document.getElementById('warehouse-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      },
      error: err => { if (request === this.historyRequest) { this.historyLoading = false; this.fail(err, 'Impossibile caricare lo storico.'); } },
    });
  }

  historyAction(event: any): string {
    const entity: any = { group: 'Raggruppamento', item: 'Elemento', piece: 'Pezzo' };
    const action: any = { created: 'creato', modified: 'modificato', deleted: 'eliminato' };
    if (entity[event.entityType] && action[event.action]) return `${entity[event.entityType]} ${action[event.action]}`;
    return ({ load: 'Pezzo caricato', unload: 'Pezzo scaricato', scan_rejected: 'Scansione rifiutata', photo_added: 'Foto aggiunta',
      printed: 'Stampa etichetta richiesta', label_created: 'Etichetta generata', label_retired: 'Etichetta sostituita o bloccata',
      operation_in_progress: 'Operazione avviata', operation_reopened: 'Operazione riaperta', operation_completed: 'Operazione conclusa', operation_forced: 'Chiusura forzata con nota' } as any)[event.action] || event.action;
  }
  historyTarget(event: any): string {
    const data = event.afterJson?.label || event.afterJson?.snapshotJson || event.afterJson || {};
    const item = this.selected?.items?.find((row: any) => row.id === event.itemId);
    const piece = this.selected?.pieces?.find((row: any) => row.id === event.pieceId);
    const operation = this.selected?.operations?.find((row: any) => row.id === event.operationId);
    const operationText = event.operationId ? `${operation ? this.operationLabel(operation.type) + ' · ' : ''}Operazione #${event.operationId}` : '';
    return [data.itemName || data.name || item?.name, event.itemId ? `Elemento #${event.itemId}` : '', event.pieceId ? `Pezzo ${data.permanentId || piece?.permanentId || '#' + event.pieceId}` : '', operationText].filter(Boolean).join(' · ');
  }
  historyEmployeeName(event: any): string {
    if (event.adminId) return String(event.adminName || '').trim() || `Utente MVanager #${event.adminId}`;
    return String(event.employeeName || '').trim() || (event.employeeId ? `Dipendente #${event.employeeId}` : 'Dipendente non disponibile');
  }
  historyChanges(event: any): { label: string; before: string; after: string }[] {
    const flatten = (value: any) => ({ ...value?.snapshotJson, ...value?.label, ...value });
    const before = flatten(event.beforeJson), after = flatten(event.afterJson);
    const labels: Record<string, string> = { name: 'Nome', groupName: 'Raggruppamento', itemName: 'Elemento', groupId: 'ID raggruppamento', quantity: 'Quantità',
      pieceNumber: 'Numero pezzo', totalPieces: 'Pezzi totali', note: 'Nota', code: 'Codice etichetta', deletedAt: 'Eliminato il', fileName: 'Foto', physicalStatus: 'Stato pezzo', status: 'Stato operazione', forcedNote: 'Nota chiusura', message: 'Esito' };
    const display = (key: string, value: any) => value == null || value === '' ? '—' : key === 'status' ? this.operationStatus(String(value)) : key === 'physicalStatus' ? this.physicalStatus(String(value)) : String(value);
    return Object.entries(labels).filter(([key]) => (before[key] != null || after[key] != null) && before[key] !== after[key])
      .map(([key, label]) => ({ label, before: display(key, before[key]), after: display(key, after[key]) }));
  }

  verify(): void {
    const code = this.verifyCode.trim();
    if (!code) { this.error = 'Inserisci un codice etichetta.'; return; }
    this.loading = true; this.error = ''; this.verification = null;
    this.http.get<any>(this.global.url + `admin/customer-warehouse/verify/${encodeURIComponent(code)}`).subscribe({
      next: (res) => { this.verification = res; this.loading = false; },
      error: (err) => this.fail(err, 'Codice non riconosciuto.'),
    });
  }

  async requestSignature(): Promise<void> {
    if (!this.selected || this.loading) return;
    const id = this.selected.id;
    const request = this.practiceRequest;
    const note = await this.popup.prompt('Nota facoltativa per la richiesta di firma:');
    if (note == null || this.loading || request !== this.practiceRequest || this.selected?.id !== id) return;
    this.loading = true;
    this.http.post<any>(this.global.url + `admin/customer-warehouse/practices/${this.selected.id}/signature-request`, { note }).subscribe({
      next: () => { this.message = 'Firma richiesta.'; this.open(this.selected); },
      error: (err) => this.fail(err, 'Impossibile richiedere la firma.'),
    });
  }

  canReopenOperation(operation: any): boolean {
    return this.global.hasPermission('CUSTOMER_WAREHOUSE_MANAGE') && ['completed', 'forced'].includes(operation.status);
  }

  reopenOperation(operation: any): void {
    if (!this.selected || this.loading || this.reopeningOperationId !== null || this.operationToReopenId !== operation.id || !this.canReopenOperation(operation)) return;
    const practiceId = this.selected.id;
    const request = this.practiceRequest;
    this.reopeningOperationId = operation.id; this.error = ''; this.message = '';
    this.http.post<any>(this.global.url + `admin/customer-warehouse/operations/${operation.id}/reopen`, {}).subscribe({
      next: result => {
        this.reopeningOperationId = null;
        if (request !== this.practiceRequest || this.selected?.id !== practiceId) return;
        Object.assign(operation, result.operation, { progress: result.progress });
        this.operationToReopenId = null;
        this.message = 'Operazione riaperta: è di nuovo disponibile in MVanager Dipendenti. Scansioni e stato dei pezzi sono stati conservati.';
      },
      error: err => {
        this.reopeningOperationId = null;
        if (request === this.practiceRequest && this.selected?.id === practiceId) this.fail(err, 'Impossibile riaprire l’operazione.');
      },
    });
  }

  async completeSignature(): Promise<void> {
    if (!this.selected || this.loading) return;
    const id = this.selected.id;
    const request = this.practiceRequest;
    const note = await this.popup.prompt('Riferimento della firma acquisita (es. copia cartacea allegata):');
    if (!note?.trim() || this.loading || request !== this.practiceRequest || this.selected?.id !== id) return;
    this.loading = true;
    this.http.post<any>(this.global.url + `admin/customer-warehouse/practices/${this.selected.id}/signature-complete`, { note }).subscribe({
      next: () => { this.message = 'Firma registrata sulla revisione corrente.'; this.open(this.selected); },
      error: (err) => this.fail(err, 'Impossibile registrare la firma.'),
    });
  }

  groupFor(item: any): any { return this.selected?.groups?.find((group: any) => group.id === item.groupId); }
  piecesFor(item: any): any[] { return (this.selected?.pieces || []).filter((piece: any) => piece.itemId === item.id); }
  photosFor(item: any): any[] { return (this.selected?.photos || []).filter((photo: any) => photo.itemId === item.id && !photo.pieceId); }
  photoUrl(photo: any): string {
    try { return new URL(photo.filePath, this.global.url).toString(); } catch { return photo.filePath || ''; }
  }
  operationLabel(type: string): string { return type === 'load' ? 'Carico' : 'Scarico'; }
  operationStatus(status: string): string {
    return ({ scheduled: 'Pianificata', in_progress: 'In corso', completed: 'Completata', forced: 'Chiusa incompleta', cancelled: 'Annullata' } as any)[status] || status;
  }
  operationActor(operation: any, phase: 'started' | 'completed'): string {
    const id = phase === 'started' ? operation.startedByEmployeeId : operation.completedByEmployeeId;
    const name = phase === 'started' ? operation.startedByEmployeeName : operation.completedByEmployeeName;
    return String(name || '').trim() || (id ? `Dipendente #${id}` : 'Non disponibile');
  }
  physicalStatus(status: string): string {
    return ({ inventoried: 'Inventariato', loaded: 'Caricato', unloaded: 'Scaricato', deleted: 'Eliminato' } as any)[status] || status;
  }
  signatureStatus(status: string): string {
    return ({ not_requested: 'non richiesta', requested: 'richiesta', signed: 'acquisita', outdated: 'da rinnovare' } as any)[status] || status;
  }
  labelReason(reason: string): string {
    return ({
      created: 'creazione',
      modified: 'modifica elemento',
      piece_deleted: 'eliminazione pezzo',
      deleted: 'pezzo eliminato',
      reprinted: 'ristampata',
      superseded: 'sostituita',
    } as any)[reason] || reason;
  }
  back(): void {
    if (this.activeSection === 'history' && this.selected) this.closeHistory();
    else if (this.activeSection === 'inventory' && this.selectedItem) this.closeItem();
    else if (this.activeSection === 'inventory' && this.selectedGroup) this.closeGroup();
    else if (this.activeSection === 'operations' && this.selected) this.selectSection('inventory');
    else if (this.selected) this.close();
    else this.router.navigate(['/homeAdmin']);
  }

  private fail(err: any, fallback: string): void {
    this.loading = false;
    this.error = err?.error?.error || fallback;
  }
}
