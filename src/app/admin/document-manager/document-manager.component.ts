import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';
import { Subscription } from 'rxjs';
import { ContactRequirementPromptService } from '../../service/contact-requirement-prompt.service';

@Component({
  selector: 'app-document-manager',
  templateUrl: './document-manager.component.html',
  styleUrls: ['./document-manager.component.css'],
})
export class DocumentManagerComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('fileNameBox') fileNameBoxes?: QueryList<ElementRef<HTMLElement>>;

  userId: string = '';
  isCustomer: boolean = false;
  prefix: 'employee' | 'customer' = 'employee';

  folders: string[] = [];
  selectedFolder: string = '';
  files: any[] = [];
  pdfBase64: string = '';
  newFolderName: string = '';
  email: string = '';
  documentSearch: string = '';
  isFileDragActive = false;
  isUploading = false;

  currentFilename: string = ''; // 👈 NECESSARIO PER STAMPA E DOWNLOAD CORRETTI
  fileType: 'pdf' | 'image' | 'signed' | 'other' = 'other';
  imageBase64: string = '';
  fileBlob: Blob | null = null;
  private fileNameChangesSubscription?: Subscription;
  private routeParamsSubscription?: Subscription;
  private routeQuerySubscription?: Subscription;
  private fileNameMeasureFrame = 0;
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
    private ngZone: NgZone,
    private contactPrompt: ContactRequirementPromptService,
  ) {}

  ngOnInit(): void {
    this.routeParamsSubscription = this.route.paramMap.subscribe((params) => {
      this.userId = params.get('id') || '';
      this.isCustomer = this.route.snapshot.url.some((segment) => segment.path === 'client');
      this.prefix = this.isCustomer ? 'customer' : 'employee';
      this.selectedFolder = '';
      this.documentSearch = '';
      this.applyDocumentRouteQuery(this.route.snapshot.queryParamMap);
      this.refreshDirectory();
      this.loadEmailIfNeeded();
    });

    this.routeQuerySubscription = this.route.queryParamMap.subscribe((params) => {
      this.applyDocumentRouteQuery(params);
      this.tryApplyDocumentRouteTarget();
    });
  }

  ngAfterViewInit(): void {
    this.fileNameChangesSubscription = this.fileNameBoxes?.changes.subscribe(() => {
      this.queueFileNameMeasure();
    });
    this.queueFileNameMeasure();
  }

  ngOnDestroy(): void {
    this.fileNameChangesSubscription?.unsubscribe();
    this.routeParamsSubscription?.unsubscribe();
    this.routeQuerySubscription?.unsubscribe();
    if (this.fileNameMeasureFrame) {
      cancelAnimationFrame(this.fileNameMeasureFrame);
      this.fileNameMeasureFrame = 0;
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.queueFileNameMeasure();
  }

  private queueFileNameMeasure(): void {
    if (this.fileNameMeasureFrame) return;

    this.ngZone.runOutsideAngular(() => {
      this.fileNameMeasureFrame = requestAnimationFrame(() => {
        this.fileNameMeasureFrame = 0;
        this.measureFileNames();
      });
    });
  }

  private measureFileNames(): void {
    const boxes = this.fileNameBoxes?.toArray() || [];
    for (const boxRef of boxes) {
      const box = boxRef.nativeElement;
      const text = box.querySelector<HTMLElement>('.mv-file-name__text');
      if (!text) continue;

      box.classList.remove('mv-file-name--scroll');
      box.style.removeProperty('--mv-title-scroll');

      const overflow = text.scrollWidth > box.clientWidth + 8;
      if (!overflow) continue;

      const distance = text.scrollWidth - box.clientWidth + 28;
      box.style.setProperty('--mv-title-scroll', `-${distance}px`);
      box.classList.add('mv-file-name--scroll');
    }
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
    if (!query) return this.folders;
    return this.folders.filter((folder) => this.normalizeSearch(folder).includes(query));
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
      this.lookupMatches(folder, nextTarget),
    );

    if (!matchedFolder) {
      this.documentSearch = this.pendingDocumentTarget || nextTarget;
      this.pendingFolderTarget = '';
      return false;
    }

    this.selectedFolder = this.joinPath(this.selectedFolder, matchedFolder);
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
    this.loadFolders();
    this.loadFiles();
    this.clearFilePreview();
  }

  private loadEmailIfNeeded() {
    const endpoint = this.isCustomer ? 'customers/getAll' : 'employees/getAll';

    this.http
      .get(this.globalService.url + endpoint, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (res) => {
          try {
            const users = JSON.parse(res);
            const user = this.isCustomer
              ? users.find((u: any) => u.numeroCliente == this.userId)
              : users.find((u: any) => u.id == this.userId);
            this.email = user?.email || '';
          } catch (err) {
            console.error('Errore parsing email:', err);
          }
        },
        error: (err) => {
          console.error('Errore caricamento email:', err);
          alert('Errore durante il caricamento dei dati');
        },
      });
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
    const body = this.getPayload({ path: this.selectedFolder });

    this.http
      .post(this.globalService.url + 'documents/folders', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (res) => {
          if (requestedFolder !== this.selectedFolder) return;
          try {
            this.folders = JSON.parse(res);
            this.foldersLoaded = true;
            this.tryApplyDocumentRouteTarget();
          } catch {}
        },
        error: (err) => {
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

  deleteFolder(folder: string): void {
    if (this.isDeadlineManagedFolder(folder)) {
      return alert('La cartella Scadenze è gestita automaticamente dalle scadenze.');
    }

    if (!confirm(`Eliminare la cartella "${folder}"?`)) return;

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
    this.refreshDirectory();
  }

  selectRoot(): void {
    this.selectedFolder = '';
    this.refreshDirectory();
  }

  goUp(): void {
    this.selectedFolder = this.parentPath(this.selectedFolder);
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
    const body = this.getPayload({ folder: this.selectedFolder });

    this.http
      .post(this.globalService.url + 'documents/list', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (res) => {
          if (requestedFolder !== this.selectedFolder) return;
          try {
            this.files = JSON.parse(res);
            this.filesLoaded = true;
            this.tryApplyDocumentRouteTarget();
            this.queueFileNameMeasure();
          } catch {}
        },
        error: (err) => {
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

  private uploadFiles(files: File[], resetInput?: () => void): void {
    if (this.isUploading) return;
    if (this.isDeadlineManagedFolder()) {
      resetInput?.();
      return alert('La cartella Scadenze è gestita automaticamente dalle scadenze.');
    }
    if (!files.length) {
      resetInput?.();
      return alert('Seleziona un file');
    }

    this.isUploading = true;
    let completed = 0;
    const failed: string[] = [];
    let firstError: any = null;

    const finishOne = () => {
      completed += 1;
      if (completed < files.length) return;

      this.isUploading = false;
      resetInput?.();
      this.loadFiles();

      if (failed.length) {
        const uploadedCount = files.length - failed.length;
        const message = uploadedCount > 0
          ? `${uploadedCount} documento/i caricati, ${failed.length} non caricati.`
          : this.parseServerError(firstError);
        alert(message);
        return;
      }

      alert(files.length === 1 ? 'Documento caricato!' : `${files.length} documenti caricati!`);
    };

    for (const file of files) {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('folder', this.selectedFolder);
      formData.append(
        this.isCustomer ? 'numeroCliente' : 'employeeId',
        this.userId,
      );
      formData.append('prefix', this.prefix);

      this.http
        .post(this.globalService.url + 'documents/upload', formData)
        .subscribe({
          next: () => finishOne(),
          error: (err) => {
            console.error('Errore upload documento:', err);
            if (!firstError) firstError = err;
            failed.push(file.name);
            finishOne();
          },
        });
    }
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
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = this.displayFileName(fileOrName);
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: (err) => {
          console.error('Errore download file:', err);
          alert('Errore durante il download del file');
        },
      });
  }

  printFile(fileOrName: any): void {
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

  renameFile(file: any): void {
    const currentName = this.displayFileName(file);
    const requestedName = prompt('Nuovo nome file', currentName);
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

  deleteFile(fileOrName: any): void {
    const filename = this.storedFileName(fileOrName);
    if (!filename) return;

    const file = this.files.find((item) => item?.filename === filename);
    const displayName = this.displayFileName(file || fileOrName);
    const confirmMessage =
      file?.managedBy === 'deadline'
        ? `Eliminare la copia in Documenti di "${displayName}"? L'allegato restera nella scadenza.`
        : `Eliminare il file "${displayName}"?`;

    if (!confirm(confirmMessage)) return;

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
    this.router.navigateByUrl('/homeAdmin');
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
