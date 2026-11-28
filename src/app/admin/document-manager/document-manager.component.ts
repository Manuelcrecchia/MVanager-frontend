import { DocumentExplorerEntry, DocumentExplorerAction, CustomerDocumentVisibility, DocumentFolder, documentFolderEntry } from '../../shared/document-explorer/document-explorer.component';
import { oversizedDocumentMessage, documentUploadError } from '../../shared/document-upload-limits';
import { downloadFile } from '../../shared/file-download';
import {
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';
import { firstValueFrom, Subscription } from 'rxjs';
import { ContactRequirementPromptService } from '../../service/contact-requirement-prompt.service';

@Component({
  selector: 'app-document-manager',
  templateUrl: './document-manager.component.html',
  styleUrls: ['./document-manager.component.css'],
})
export class DocumentManagerComponent implements OnInit, OnDestroy {

  readonly realtimeResources = ["documents"];
  refreshRealtimeData(): void | boolean | Promise<void | boolean> {
    this.loadFolders(); this.loadFiles();void this.loadSharingRoot();
  }

  userId: string = '';
  isCustomer: boolean = false;
  prefix: 'employee' | 'customer' = 'employee';

  folders: DocumentFolder[] = [];
  selectedFolder: string = '';
  files: any[] = [];
  pdfBase64: string = '';
  newFolderName: string = '';
  email: string = '';
  entityDisplayName: string = '';
  documentAccessError = '';
  documentSearch: string = '';
  isFileDragActive = false;
  isUploading = false;
  sharingBusy = false;
  sharingError = '';
  sharingNotice = '';
  sharingRoot:CustomerDocumentVisibility|null=null;
  sharingRootLoading=false;
  private sharingRequest=0;

  currentFilename: string = ''; // 👈 NECESSARIO PER STAMPA E DOWNLOAD CORRETTI
  fileType: 'pdf' | 'image' | 'signed' | 'other' = 'other';
  imageBase64: string = '';
  fileBlob: Blob | null = null;
  private routeParamsSubscription?: Subscription;
  private routeQuerySubscription?: Subscription;
  private pendingFolderTarget = '';
  private pendingDocumentTarget = '';
  private shouldOpenPendingDocument = false;
  private foldersLoaded = false;
  private filesLoaded = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    public globalService: GlobalService,
    private contactPrompt: ContactRequirementPromptService,
    private appDialog: PopupServiceService,
  ) {}

  ngOnInit(): void {
    this.routeParamsSubscription = this.route.paramMap.subscribe((params) => {
      this.userId = params.get('id') || '';
      this.isCustomer = this.route.snapshot.url.some((segment) => segment.path === 'client');
      this.prefix = this.isCustomer ? 'customer' : 'employee';
      this.email = '';
      this.entityDisplayName = '';
      this.selectedFolder = '';
      this.sharingRoot=null;this.sharingError='';this.sharingNotice='';
      this.documentSearch = '';
      this.folders = [];
      this.files = [];
      this.applyDocumentRouteQuery(this.route.snapshot.queryParamMap);
      this.refreshDirectory();
      this.loadEmailIfNeeded();
    });

    this.routeQuerySubscription = this.route.queryParamMap.subscribe((params) => {
      this.applyDocumentRouteQuery(params);
      this.tryApplyDocumentRouteTarget();
    });
  }

  ngOnDestroy(): void {
    this.routeParamsSubscription?.unsubscribe();
    this.routeQuerySubscription?.unsubscribe();
  }

  private explorerCacheFolders?: DocumentFolder[];
  private explorerCacheFiles?: any[];
  private explorerCachePath = '';
  private explorerCache: DocumentExplorerEntry[] = [];

  get explorerEntries(): DocumentExplorerEntry[] {
    if (this.explorerCacheFolders === this.folders && this.explorerCacheFiles === this.files && this.explorerCachePath === this.selectedFolder) return this.explorerCache;
    this.explorerCacheFolders = this.folders;
    this.explorerCacheFiles = this.files;
    this.explorerCachePath = this.selectedFolder;
    this.explorerCache = [
      ...this.folders.map(folder => ({
        ...documentFolderEntry(folder),
        locked: this.isDeadlineManagedFolder(folder.name),
      })),
      ...this.files.map(file => ({ id: 'file:' + file.filename, name: this.displayFileName(file), kind: 'file' as const, data: file, size: file.size, modifiedAt: file.uploadedAt || file.updatedAt, locked: file.managedBy === 'deadline', detail: file.viewed ? 'Visualizzato' : '', customerVisibility:file.customerVisibility })),
    ];
    return this.explorerCache;
  }

  navigateExplorer(path: string): void {
    if (this.isUploading) return;
    this.selectedFolder = path;
    this.documentSearch = '';
    this.folders = [];
    this.files = [];
    this.refreshDirectory();
  }

  canUseDocumentAction(action: 'EDIT' | 'DELETE' | 'SEND'): boolean {
    const area = this.isCustomer ? 'CUSTOMER' : 'EMPLOYEE';
    return this.globalService.hasPermission(`${area}_DOCS_${action}`);
  }

  get canPrintDocuments(): boolean {
    return !this.globalService.consultationOnly;
  }

  createExplorerFolder(name: string): void {
    this.newFolderName = name;
    this.createFolder();
  }

  uploadExplorerFiles(files: File[]): void {
    void this.uploadFiles(files);
  }

  onExplorerAction(event: DocumentExplorerAction): void {
    const { type, entry } = event;
    if (this.isUploading) return;
    if (['share-customer','hide-customer','inherit-customer'].includes(type)) { void this.shareWithCustomer(event); return; }
    if (entry.kind === 'folder') {
      if (type === 'open') this.navigateExplorer([this.selectedFolder, entry.data].filter(Boolean).join('/'));
      if (type === 'delete') void this.deleteFolder(entry.data);
      return;
    }
    switch (type) {
      case 'open': this.selectFile(entry.data); break;
      case 'download': this.downloadCurrentFile(entry.data); break;
      case 'print': this.printFile(entry.data); break;
      case 'delete': void this.deleteFile(entry.data); break;
      case 'rename': void this.renameFile(entry.data); break;
      case 'email': this.sendFileMail(entry.data); break;
    }
  }

  get canShareWithCustomer():boolean {
    return this.isCustomer && !this.globalService.consultationOnly && this.globalService.hasTenantFeature('customerPortalDocuments') && this.globalService.hasPermission('CUSTOMER_DOCS_SHARE');
  }
  private async shareWithCustomer(event:DocumentExplorerAction):Promise<void> {
    if (!this.canShareWithCustomer || this.sharingBusy) return;
    this.sharingBusy=true;this.sharingError='';this.sharingNotice='';
    const {entry,type}=event;
    const entryPath=[this.selectedFolder,entry.kind==='folder'?entry.data:entry.data.filename].filter(Boolean).join('/');
    try {
      await firstValueFrom(this.http.post(this.globalService.url+'admin/customer-document-sharing/visibility',{
        numeroCliente:this.userId,path:entryPath,kind:entry.kind,visible:type==='share-customer'?true:type==='hide-customer'?false:null,
      },{headers:this.globalService.headers}));
      this.sharingNotice='Visibilità aggiornata.';this.loadFolders();this.loadFiles();void this.loadSharingRoot();
    } catch(e:any) { this.sharingError=e.error?.error||'Impossibile aggiornare la visibilità. Riprova.'; }
    finally { this.sharingBusy=false; }
  }
  get sharingRootLabel():string {
    return this.sharingRoot?.status==='shared'?'Tutto condiviso':this.sharingRoot?.status==='hidden'?'Tutto nascosto':'Condivisione personalizzata';
  }
  async loadSharingRoot():Promise<void> {
    if(!this.canShareWithCustomer)return;
    const customerId=this.userId,request=++this.sharingRequest;this.sharingRootLoading=true;
    try {
      const state=await firstValueFrom(this.http.get<CustomerDocumentVisibility>(this.globalService.url+'admin/customer-document-sharing/customers/'+encodeURIComponent(customerId),{headers:this.globalService.headers}));
      if(request===this.sharingRequest&&customerId===this.userId)this.sharingRoot=state;
    }catch(e:any){if(request===this.sharingRequest)this.sharingError=e.error?.error||'Impossibile caricare la visibilità dell’archivio.';}
    finally{if(request===this.sharingRequest)this.sharingRootLoading=false;}
  }
  async setArchiveVisibility(visible:boolean|null):Promise<void> {
    if(!this.canShareWithCustomer||this.sharingBusy||this.sharingRootLoading)return;
    this.sharingBusy=true;this.sharingError='';this.sharingNotice='';
    try {
      this.sharingRoot=await firstValueFrom(this.http.put<CustomerDocumentVisibility>(this.globalService.url+'admin/customer-document-sharing/customers/'+encodeURIComponent(this.userId)+'/all',{visible},{headers:this.globalService.headers}));
      this.sharingNotice=visible===true?'Tutte le cartelle e tutti i documenti sono condivisi con questo cliente.':visible===false?'Tutte le cartelle e tutti i documenti sono nascosti a questo cliente.':'Ripristinate le regole aziendali dell’archivio.';
      this.loadFolders();this.loadFiles();
    }catch(e:any){this.sharingError=e.error?.error||'Impossibile aggiornare la visibilità dell’archivio.';}
    finally{this.sharingBusy=false;}
  }

  private getPayload(extra: any = {}) {
    return this.isCustomer
      ? { numeroCliente: this.userId, prefix: this.prefix, ...extra }
      : { employeeId: this.userId, prefix: this.prefix, ...extra };
  }

  get currentPathLabel(): string {
    return this.selectedFolder || 'Directory principale';
  }

  get canGoUp(): boolean {
    return !!this.selectedFolder;
  }

  get filteredFolders(): string[] {
    const query = this.normalizeSearch(this.documentSearch);
    const names = this.folders.map(folder => folder.name);
    if (!query) return names;
    return names.filter((name) => this.normalizeSearch(name).includes(query));
  }

  get filteredFiles(): any[] {
    const query = this.normalizeSearch(this.documentSearch);
    if (!query) return this.files;

    return this.files.filter((file) =>
      this.normalizeSearch([
        file?.filename,
        file?.displayName,
        file?.viewed ? 'visualizzato' : 'non visualizzato',
        file?.viewedAt,
      ].join(' ')).includes(query),
    );
  }

  private joinPath(base: string, name: string): string {
    return [base, name]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join('/');
  }

  private parentPath(pathValue: string): string {
    const parts = String(pathValue || '')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);
    parts.pop();
    return parts.join('/');
  }

  private applyDocumentRouteQuery(params: ParamMap): void {
    const folderTarget = this.firstQueryParam(params, ['folder', 'cartella', 'path']);
    const explicitDocumentTarget = this.firstQueryParam(params, [
      'documentName',
      'document',
      'filename',
      'file',
      'allegato',
    ]);
    const searchTarget = this.firstQueryParam(params, ['search', 'q']);
    const openDocument = this.queryFlag(params, ['openDocument', 'open', 'preview']);

    this.pendingFolderTarget = folderTarget;
    this.pendingDocumentTarget = explicitDocumentTarget || (openDocument ? searchTarget : '');
    this.shouldOpenPendingDocument = Boolean(this.pendingDocumentTarget) || openDocument;

    const visibleSearch = searchTarget || explicitDocumentTarget || folderTarget;
    if (visibleSearch) {
      this.documentSearch = visibleSearch;
    }
  }

  private firstQueryParam(params: ParamMap, keys: string[]): string {
    for (const key of keys) {
      const value = String(params.get(key) || '').trim();
      if (value) return value;
    }
    return '';
  }

  private queryFlag(params: ParamMap, keys: string[]): boolean {
    const value = this.normalizeSearch(this.firstQueryParam(params, keys));
    return ['1', 'true', 'yes', 'y', 'si', 'sì', 'open', 'apri', 'preview'].includes(value);
  }

  private tryApplyDocumentRouteTarget(): void {
    if (this.tryOpenPendingFolder()) return;
    this.tryOpenPendingDocument();
  }

  private tryOpenPendingFolder(): boolean {
    const targetParts = this.pathParts(this.pendingFolderTarget);
    if (!targetParts.length) return false;
    if (!this.foldersLoaded) return false;

    const currentParts = this.pathParts(this.selectedFolder);
    if (!this.pathStartsWith(targetParts, currentParts)) {
      this.selectedFolder = '';
      this.refreshDirectory();
      return true;
    }

    if (currentParts.length >= targetParts.length) {
      this.pendingFolderTarget = '';
      if (!this.pendingDocumentTarget) {
        this.documentSearch = '';
      }
      return false;
    }

    const nextTarget = targetParts[currentParts.length];
    const matchedFolder = this.folders.find((folder) =>
      this.lookupMatches(folder.name, nextTarget),
    );

    if (!matchedFolder) {
      this.documentSearch = this.pendingDocumentTarget || nextTarget;
      this.pendingFolderTarget = '';
      return false;
    }

    this.selectedFolder = this.joinPath(this.selectedFolder, matchedFolder.name);
    this.refreshDirectory();
    return true;
  }

  private tryOpenPendingDocument(): void {
    const target = String(this.pendingDocumentTarget || '').trim();
    if (!target || !this.filesLoaded) return;

    const matchedFile = this.files.find((file) => this.fileMatchesTarget(file, target));
    if (!matchedFile) {
      this.documentSearch = target;
      return;
    }

    this.documentSearch = target;
    this.pendingDocumentTarget = '';
    const shouldOpen = this.shouldOpenPendingDocument;
    this.shouldOpenPendingDocument = false;
    if (shouldOpen) {
      this.selectFile(matchedFile);
    }
  }

  private pathParts(pathValue: string): string[] {
    return String(pathValue || '')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  private pathStartsWith(targetParts: string[], currentParts: string[]): boolean {
    return currentParts.every((part, index) =>
      this.lookupMatches(part, targetParts[index] || ''),
    );
  }

  private fileMatchesTarget(file: any, target: string): boolean {
    const targetLookup = this.normalizeDocumentLookup(target);
    if (!targetLookup) return false;

    return [
      file?.filename,
      file?.displayName,
      this.displayFileName(file),
    ].some((name) => this.lookupMatches(name, targetLookup));
  }

  private lookupMatches(value: unknown, target: unknown): boolean {
    const valueLookup = this.normalizeDocumentLookup(value);
    const targetLookup = this.normalizeDocumentLookup(target);
    return !!valueLookup &&
      !!targetLookup &&
      (valueLookup === targetLookup ||
        valueLookup.includes(targetLookup) ||
        targetLookup.includes(valueLookup));
  }

  private normalizeDocumentLookup(value: unknown): string {
    return this.normalizeSearch(value)
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private refreshDirectory(): void {
    this.foldersLoaded = false;
    this.filesLoaded = false;
    this.documentAccessError = '';
    void this.loadSharingRoot();
    this.loadFolders();
    this.loadFiles();
    this.clearFilePreview();
  }

  private loadEmailIfNeeded() {
    const endpoint = this.isCustomer ? 'customers/getAll' : 'employees/getAll';
    const userId = this.userId;
    const prefix = this.prefix;

    this.http
      .get(this.globalService.url + endpoint, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (res) => {
          if (userId !== this.userId || prefix !== this.prefix) return;
          try {
            const users = JSON.parse(res);
            const user = this.isCustomer
              ? users.find((u: any) => u.numeroCliente == this.userId)
              : users.find((u: any) => u.id == this.userId);
            this.email = user?.email || '';
            this.entityDisplayName = this.getEntityDisplayName(user);
          } catch (err) {
            console.error('Errore parsing email:', err);
          }
        },
        error: (err) => {
          if (userId !== this.userId || prefix !== this.prefix || this.globalService.consultationOnly) return;
          console.error('Errore caricamento email:', err);
          alert('Errore durante il caricamento dei dati');
        },
      });
  }

  private getEntityDisplayName(user: any): string {
    if (!user) return '';
    if (this.globalService.consultationOnly) return user.consultationName || '';

    const fullName = [user.nome, user.cognome]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ');

    return fullName || String(user.ragioneSociale || user.denominazione || '').trim();
  }

  sendFileMail(fileOrName: any): void {
    if (!this.email) {
      if (this.isCustomer) {
        alert('Email utente non disponibile');
      } else {
        this.contactPrompt.promptEmployeeEmailMissing();
      }
      return;
    }

    const filename = this.storedFileName(fileOrName);
    if (!filename) return;

    const body = this.getPayload({ folder: this.selectedFolder, filename });

    this.http
      .post(this.globalService.url + 'documents/sendDocumentMail', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => alert('Email inviata con successo!'),
        error: (err) => {
          const errorBody = this.parseServerErrorBody(err);
          if (errorBody?.code === 'EMPLOYEE_EMAIL_MISSING') {
            this.email = '';
            this.contactPrompt.promptEmployeeEmailMissing();
            return;
          }
          alert('Errore durante invio email');
        },
      });
  }

  loadFolders(): void {
    const requestedFolder = this.selectedFolder;
    const userId = this.userId;
    const prefix = this.prefix;
    const body = this.getPayload({ path: requestedFolder, includeMetadata: true });

    this.http
      .post<Array<DocumentFolder | string>>(this.globalService.url + 'documents/folders', body, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (folders) => {
          if (requestedFolder !== this.selectedFolder || userId !== this.userId || prefix !== this.prefix) return;
          this.folders = folders.map(folder => typeof folder === 'string' ? { name: folder } : folder);
          this.foldersLoaded = true;
          this.tryApplyDocumentRouteTarget();
        },
        error: (err) => {
          if (requestedFolder !== this.selectedFolder || userId !== this.userId || prefix !== this.prefix) return;
          if (this.globalService.consultationOnly) {
            this.documentAccessError = this.parseServerError(err);
            return;
          }
          console.error('Errore caricamento cartelle:', err);
          alert('Errore durante il caricamento dei dati');
        },
      });
  }

  createFolder(): void {
    if (!this.newFolderName.trim()) return alert('Inserisci un nome');
    if (this.isDeadlineManagedFolder(this.newFolderName.trim())) {
      return alert('La cartella Scadenze è gestita automaticamente dalle scadenze.');
    }

    const body = this.getPayload({
      folder: this.joinPath(this.selectedFolder, this.newFolderName.trim()),
    });

    this.http
      .post(this.globalService.url + 'documents/createFolder', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.newFolderName = '';
          this.loadFolders();
        },
        error: (err) => {
          console.error('Errore creazione cartella:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  async deleteFolder(folder: string): Promise<void> {
    if (this.isDeadlineManagedFolder(folder)) {
      return alert('La cartella Scadenze è gestita automaticamente dalle scadenze.');
    }

    if (!await this.appDialog.confirm(`Eliminare la cartella "${folder}"?`)) return;

    const body = this.getPayload({ folder: this.joinPath(this.selectedFolder, folder) });

    this.http
      .post(this.globalService.url + 'documents/deleteFolder', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.refreshDirectory();
        },
        error: (err) => {
          console.error('Errore eliminazione cartella:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  selectFolder(folder: string): void {
    this.selectedFolder = this.joinPath(this.selectedFolder, folder);
    this.documentSearch = '';
    this.refreshDirectory();
  }

  selectRoot(): void {
    this.selectedFolder = '';
    this.documentSearch = '';
    this.refreshDirectory();
  }

  goUp(): void {
    this.selectedFolder = this.parentPath(this.selectedFolder);
    this.documentSearch = '';
    this.refreshDirectory();
  }

  private clearFilePreview(): void {
    this.pdfBase64 = '';
    this.imageBase64 = '';
    this.fileBlob = null;
    this.currentFilename = '';
    this.fileType = 'other';
  }

  loadFiles(): void {
    const requestedFolder = this.selectedFolder;
    const userId = this.userId;
    const prefix = this.prefix;
    const body = this.getPayload({ folder: this.selectedFolder });

    this.http
      .post(this.globalService.url + 'documents/list', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (res) => {
          if (requestedFolder !== this.selectedFolder || userId !== this.userId || prefix !== this.prefix) return;
          try {
            this.files = JSON.parse(res);
            this.filesLoaded = true;
            this.tryApplyDocumentRouteTarget();
          } catch {}
        },
        error: (err) => {
          if (requestedFolder !== this.selectedFolder || userId !== this.userId || prefix !== this.prefix) return;
          if (this.globalService.consultationOnly) {
            this.documentAccessError = this.parseServerError(err);
            return;
          }
          console.error('Errore caricamento file:', err);
          alert('Errore durante il caricamento dei dati');
        },
      });
  }

  uploadFile(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const files = input?.files ? Array.from(input.files) : [];
    this.uploadFiles(files, () => {
      if (input) input.value = '';
    });
  }

  onFileDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.isUploading) {
      this.isFileDragActive = true;
    }
  }

  onFileDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const currentTarget = event.currentTarget as HTMLElement | null;
    const relatedTarget = event.relatedTarget as Node | null;
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
    this.isFileDragActive = false;
  }

  onFileDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isFileDragActive = false;

    const files = event.dataTransfer?.files
      ? Array.from(event.dataTransfer.files)
      : [];
    this.uploadFiles(files);
  }

  private async uploadFiles(files: File[], resetInput?: () => void): Promise<void> {
    if (this.isUploading) return;
    if (this.isDeadlineManagedFolder()) {
      resetInput?.();
      return alert('La cartella Scadenze è gestita automaticamente dalle scadenze.');
    }
    if (!files.length) {
      resetInput?.();
      return;
    }

    const sizeError = oversizedDocumentMessage(files);
    if (sizeError) { resetInput?.(); alert(sizeError); return; }

    this.isUploading = true;
    const folder = this.selectedFolder;
    const userId = this.userId;
    const isCustomer = this.isCustomer;
    const prefix = this.prefix;
    const failed: string[] = [];

    // The durable save queue preserves order within the documents domain.
    // Wait for each confirmation before submitting the next file.
    for (const file of files) {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('folder', folder);
      formData.append(isCustomer ? 'numeroCliente' : 'employeeId', userId);
      formData.append('prefix', prefix);

      try {
        await firstValueFrom(this.http.post(
          this.globalService.url + 'documents/upload',
          formData,
        ));
      } catch (err: any) {
        console.error('Errore upload documento:', err);
        const message = documentUploadError(err, this.parseServerError(err));
        failed.push(`${file.name}: ${message}`);
      }
    }

    this.isUploading = false;
    resetInput?.();
    this.loadFiles();

    if (failed.length) {
      const uploadedCount = files.length - failed.length;
      alert(
        uploadedCount > 0
          ? `${uploadedCount} documento/i caricati, ${failed.length} non caricati.\n${failed.join('\n')}`
          : `Errore upload:\n${failed.join('\n')}`,
      );
      return;
    }

    alert(files.length === 1 ? 'Documento caricato!' : `${files.length} documenti caricati!`);
  }

  private getFileType(filename: string): 'pdf' | 'image' | 'signed' | 'other' {
    const lower = filename.toLowerCase();
    const ext = lower.split('.').pop() || '';
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    if (lower.endsWith('.p7m')) return 'signed';
    if (ext === 'pdf') return 'pdf';
    if (imageExts.includes(ext)) return 'image';
    return 'other';
  }

  private fileRecord(fileOrName: any): any {
    if (fileOrName && typeof fileOrName === 'object') return fileOrName;
    return this.files.find((file) => file?.filename === fileOrName) || null;
  }

  private storedFileName(fileOrName: any): string {
    return String(
      typeof fileOrName === 'string'
        ? fileOrName
        : fileOrName?.filename || '',
    );
  }

  private stripInternalFilePrefix(value: string): string {
    return String(value || '')
      .replace(/^\d{13,}-[a-f0-9]{16}-/i, '')
      .replace(/^\d{13,}-/, '');
  }

  displayFileName(fileOrName: any): string {
    const record = this.fileRecord(fileOrName);
    if (record?.displayName) return String(record.displayName);

    const value = typeof fileOrName === 'string' ? fileOrName : fileOrName?.filename;
    return this.stripInternalFilePrefix(String(value || ''));
  }

  isDeadlineManagedFolder(folder = ''): boolean {
    const fullPath = this.joinPath(this.selectedFolder, folder);
    const firstSegment = fullPath
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean)[0];
    return firstSegment?.toLowerCase() === 'scadenze';
  }

  selectFile(fileOrName: any): void {
    const filename = this.storedFileName(fileOrName);
    if (!filename) return;

    this.clearFilePreview();
    this.currentFilename = filename; // 👈 IMPORTANTE
    this.fileType = this.getFileType(this.displayFileName(fileOrName) || filename);

    const body = this.getPayload({ folder: this.selectedFolder, filename });

    // For all file types, fetch as blob first to store it
    this.http
      .post(this.globalService.url + 'documents/downloadSecure', body, {
        headers: this.globalService.headers,
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.fileBlob = blob;

          if (this.fileType === 'pdf') {
            // Convert blob to base64 for PDF viewer
            const reader = new FileReader();
            reader.onload = () => {
              this.pdfBase64 = (reader.result as string).split(',')[1];
            };
            reader.readAsDataURL(blob);
          } else if (this.fileType === 'image') {
            // Convert blob to base64 for image preview
            const reader = new FileReader();
            reader.onload = () => {
              this.imageBase64 = reader.result as string;
            };
            reader.readAsDataURL(blob);
          }
        },
        error: (err) => {
          console.error('Errore caricamento file:', err);
          alert('Errore durante il caricamento dei dati');
        },
      });
  }

  downloadCurrentFile(fileOrName: any): void {
    const filename = this.storedFileName(fileOrName);
    if (!filename) return;

    const body = this.getPayload({ folder: this.selectedFolder, filename });

    this.http
      .post(this.globalService.url + 'documents/downloadSecure', body, {
        headers: this.globalService.headers,
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          void downloadFile(blob, this.displayFileName(fileOrName));
        },
        error: (err) => {
          console.error('Errore download file:', err);
          alert('Errore durante il download del file');
        },
      });
  }

  printFile(fileOrName: any): void {
    if (!this.canPrintDocuments) return;
    const filename = this.storedFileName(fileOrName);
    if (!filename) return;

    const type = this.getFileType(this.displayFileName(fileOrName) || filename);

    if (filename.toLowerCase().endsWith('.p7m')) {
      alert('I file .p7m non possono essere stampati direttamente. Scaricali e aprili con un verificatore di firma digitale.');
      return;
    }

    const body = this.getPayload({
      folder: this.selectedFolder,
      filename,
    });

    this.http
      .post(this.globalService.url + 'documents/downloadSecure', body, {
        headers: this.globalService.headers,
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          const printableBlob =
            type === 'pdf'
              ? new Blob([blob], { type: 'application/pdf' })
              : type === 'image'
                ? new Blob([blob], { type: blob.type || 'image/png' })
                : blob;
          const pdfUrl = URL.createObjectURL(printableBlob);

          // Apri in nuova scheda
          const newWindow = window.open(pdfUrl);

          if (!newWindow) {
            alert(
              '⚠️ Popup bloccato dal browser. Consenti i popup per la stampa.',
            );
            return;
          }

          // Safari ha bisogno di un piccolo delay
          newWindow.onload = () => {
            newWindow.focus();

            const tryPrint = setInterval(() => {
              try {
                newWindow.print();
                clearInterval(tryPrint);
              } catch {}
            }, 300);
          };
        },
        error: (err) => {
          console.error('Errore stampa:', err);
          alert('Errore durante la stampa del file');
        },
      });
  }

  async renameFile(file: any): Promise<void> {
    const currentName = this.displayFileName(file);
    const requestedName = await this.appDialog.prompt(
      'Scegli il nuovo nome da mostrare per questo file.',
      currentName,
      'Rinomina file',
      { inputLabel: 'Nome file', confirmLabel: 'Rinomina' },
    );
    if (requestedName === null) return;

    const newName = requestedName.trim();
    if (!newName) return alert('Inserisci un nome valido');
    if (newName === currentName) return;

    const oldFilename = file.filename;
    const body = this.getPayload({
      folder: this.selectedFolder,
      filename: oldFilename,
      newName,
    });

    this.http
      .post<{ filename: string; displayName: string }>(
        this.globalService.url + 'documents/rename',
        body,
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: (response) => {
          const renamedFile = {
            ...file,
            filename: response?.filename || oldFilename,
            displayName: response?.displayName || newName,
          };

          this.files = this.files.map((item) =>
            item.filename === oldFilename ? renamedFile : item,
          );

          if (this.currentFilename === oldFilename) {
            this.currentFilename = renamedFile.filename;
            this.fileType = this.getFileType(renamedFile.filename);
          }
        },
        error: (err) => {
          console.error('Errore rinomina file:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  async deleteFile(fileOrName: any): Promise<void> {
    const filename = this.storedFileName(fileOrName);
    if (!filename) return;

    const file = this.files.find((item) => item?.filename === filename);
    const displayName = this.displayFileName(file || fileOrName);
    const confirmMessage =
      file?.managedBy === 'deadline'
        ? `Eliminare la copia in Documenti di "${displayName}"? L'allegato restera nella scadenza.`
        : `Eliminare il file "${displayName}"?`;

    if (!await this.appDialog.confirm(confirmMessage)) return;

    const body = this.getPayload({ folder: this.selectedFolder, filename });

    this.http
      .post(this.globalService.url + 'documents/delete', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.files = this.files.filter((f) => f.filename !== filename);
          if (this.currentFilename === filename) this.clearFilePreview();
        },
        error: (err) => {
          console.error('Errore eliminazione file:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  back(): void {
    this.router.navigateByUrl(
      this.isCustomer ? '/homeAdmin/listCustomer' : '/homeAdmin/gestioneemployees',
    );
  }

  private parseServerError(err: any): string {
    const body = this.parseServerErrorBody(err);
    if (body?.error) return body.error;
    if (err.status === 0) return 'Impossibile connettersi al server';
    return 'Errore imprevisto. Riprova.';
  }

  private parseServerErrorBody(err: any): any {
    try {
      return typeof err?.error === 'string' ? JSON.parse(err.error) : err?.error;
    } catch {
      return null;
    }
  }

  private normalizeSearch(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }
}
