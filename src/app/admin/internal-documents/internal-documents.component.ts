import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { GlobalService } from '../../service/global.service';

@Component({
  selector: 'app-internal-documents',
  templateUrl: './internal-documents.component.html',
  styleUrls: ['./internal-documents.component.css'],
})
export class InternalDocumentsComponent implements OnInit {
  folders: string[] = [];
  selectedFolder: string = '';
  files: any[] = [];
  pdfBase64: string = '';
  imageUrl: string = '';
  newFolderName: string = '';
  documentSearch: string = '';
  isFileDragActive = false;
  isUploading = false;

  currentFilename: string = '';
  fileType: 'pdf' | 'image' | 'signed' | 'other' = 'other';

  constructor(
    private router: Router,
    private http: HttpClient,
    public globalService: GlobalService,
  ) {}

  ngOnInit(): void {
    this.refreshDirectory();
  }

  // ============ FOLDERS ============

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

  private refreshDirectory(): void {
    this.loadFolders();
    this.loadFiles();
    this.pdfBase64 = '';
    this.clearImageUrl();
    this.currentFilename = '';
    this.fileType = 'other';
  }

  loadFolders(): void {
    this.http
      .post(
        this.globalService.url + 'admin/internal-documents/folders',
        { path: this.selectedFolder },
        {
          headers: this.globalService.headers,
          responseType: 'text',
        },
      )
      .subscribe({
        next: (res) => {
          try {
            this.folders = JSON.parse(res) || [];
          } catch {
            this.folders = [];
          }
        },
        error: (err) => {
          console.error('FOLDERS ERROR:', err);
          this.folders = [];
        },
      });
  }

  createFolder(): void {
    const folder = (this.newFolderName || '').trim();
    if (!folder) return alert('Inserisci un nome');

    this.http
      .post(
        this.globalService.url + 'admin/internal-documents/createFolder',
        { folder: this.joinPath(this.selectedFolder, folder) },
        {
          headers: this.globalService.headers,
          responseType: 'text',
        },
      )
      .subscribe({
        next: () => {
          this.newFolderName = '';
          this.loadFolders();
        },
        error: (err) => {
          console.error('CREATE FOLDER ERROR:', err);
          alert('Errore creazione cartella');
        },
      });
  }

  deleteFolder(folder: string): void {
    if (!confirm(`Eliminare la cartella "${folder}"?`)) return;

    this.http
      .post(
        this.globalService.url + 'admin/internal-documents/deleteFolder',
        { folder: this.joinPath(this.selectedFolder, folder) },
        {
          headers: this.globalService.headers,
          responseType: 'text',
        },
      )
      .subscribe({
        next: () => {
          this.refreshDirectory();
        },
        error: (err) => {
          console.error('DELETE FOLDER ERROR:', err);
          alert('Errore eliminazione cartella');
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

  // ============ FILES ============

  loadFiles(): void {
    const body = { folder: this.selectedFolder };

    this.http
      .post(this.globalService.url + 'admin/internal-documents/list', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (res) => {
          try {
            this.files = JSON.parse(res) || [];
          } catch {
            this.files = [];
          }
        },
        error: (err) => {
          console.error('LIST ERROR:', err);
          this.files = [];
          alert('Errore caricamento files');
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
    if (!files.length) {
      resetInput?.();
      return alert('Seleziona un file');
    }

    this.isUploading = true;
    let completed = 0;
    const failed: string[] = [];

    const finishOne = () => {
      completed += 1;
      if (completed < files.length) return;

      this.isUploading = false;
      resetInput?.();
      this.loadFiles();

      if (failed.length) {
        const uploadedCount = files.length - failed.length;
        alert(
          uploadedCount > 0
            ? `${uploadedCount} documento/i caricati, ${failed.length} non caricati.`
            : 'Errore upload',
        );
        return;
      }

      alert(files.length === 1 ? 'Documento caricato!' : `${files.length} documenti caricati!`);
    };

    for (const file of files) {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('folder', this.selectedFolder);

      this.http
        .post(
          this.globalService.url + 'admin/internal-documents/upload',
          formData,
        )
        .subscribe({
          next: () => finishOne(),
          error: (err) => {
            console.error('UPLOAD ERROR:', err);
            failed.push(file.name);
            finishOne();
          },
        });
    }
  }

  selectFile(filename: string): void {
    this.currentFilename = filename;
    this.fileType = this.getFileType(filename);
    this.pdfBase64 = '';
    this.clearImageUrl();

    if (this.fileType === 'signed') {
      return;
    }

    const body = { folder: this.selectedFolder, filename };

    if (this.fileType === 'image') {
      this.http
        .post(
          this.globalService.url + 'admin/internal-documents/downloadSecure',
          body,
          {
            headers: this.globalService.headers,
            responseType: 'blob',
          },
        )
        .subscribe({
          next: (blob) => {
            this.imageUrl = URL.createObjectURL(blob);
          },
          error: (err) => {
            console.error('IMAGE PREVIEW ERROR:', err);
            alert('Errore apertura immagine');
          },
        });
      return;
    }

    if (this.fileType !== 'pdf') return;

    this.http
      .post(this.globalService.url + 'admin/internal-documents/getPdf', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: (base64) => (this.pdfBase64 = base64 || ''),
        error: (err) => {
          console.error('GETPDF ERROR:', err);
          alert('Errore apertura PDF');
        },
      });
  }

  downloadCurrentFile(filename: string): void {
    const body = { folder: this.selectedFolder, filename };

    this.http
      .post(
        this.globalService.url + 'admin/internal-documents/downloadSecure',
        body,
        {
          headers: this.globalService.headers,
          responseType: 'blob',
        },
      )
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = this.displayFileName(filename);
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: (err) => {
          console.error('DOWNLOAD ERROR:', err);
          alert('Errore download');
        },
      });
  }

  printFile(filename: string): void {
    if (filename.toLowerCase().endsWith('.p7m')) {
      alert('I file .p7m non possono essere stampati direttamente. Scaricali e aprili con un verificatore di firma digitale.');
      return;
    }

    const body = { folder: this.selectedFolder, filename };

    this.http
      .post(
        this.globalService.url + 'admin/internal-documents/downloadSecure',
        body,
        {
          headers: this.globalService.headers,
          responseType: 'blob',
          observe: 'response',
        },
      )
      .subscribe({
        next: async (resp) => {
          const ct = resp.headers.get('content-type') || '';
          const blob = resp.body as Blob;

          // Se NON è un pdf, quasi sicuramente è un testo di errore (ERR/Unauthorized ecc.)
          if (!ct.includes('pdf')) {
            try {
              const txt = await blob.text();
              console.error('PRINT returned non-pdf:', ct, txt);
              alert(
                'Stampa fallita: il server non ha restituito un PDF.\nControlla console (PRINT returned non-pdf).',
              );
            } catch {
              alert('Stampa fallita: risposta non valida dal server.');
            }
            return;
          }

          // Forza tipo PDF
          const pdfBlob = new Blob([blob], { type: 'application/pdf' });
          const pdfUrl = URL.createObjectURL(pdfBlob);
          const newWindow = window.open(pdfUrl);

          if (!newWindow) {
            alert(
              '⚠️ Popup bloccato dal browser. Consenti i popup per la stampa.',
            );
            return;
          }

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
          console.error('PRINT ERROR:', err);
          alert('Errore stampa');
        },
      });
  }

  deleteFile(filename: string): void {
    if (!confirm(`Eliminare il file "${this.displayFileName(filename)}"?`)) return;

    const body = { folder: this.selectedFolder, filename };

    this.http
      .post(this.globalService.url + 'admin/internal-documents/delete', body, {
        headers: this.globalService.headers,
        responseType: 'text',
      })
      .subscribe({
        next: () => {
          this.files = this.files.filter((f: any) => f.filename !== filename);
          if (this.currentFilename === filename) {
            this.currentFilename = '';
            this.pdfBase64 = '';
            this.clearImageUrl();
            this.fileType = 'other';
          }
        },
        error: (err) => {
          console.error('DELETE FILE ERROR:', err);
          alert('Errore eliminazione file');
        },
      });
  }

  // ============ UI UTILS ============

  prettySize(bytes: number): string {
    if (bytes === null || bytes === undefined) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  private getFileType(filename: string): 'pdf' | 'image' | 'signed' | 'other' {
    const lower = String(filename || '').toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lower)) return 'image';
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.p7m')) return 'signed';
    return 'other';
  }

  displayFileName(fileOrName: any): string {
    const value =
      typeof fileOrName === 'string'
        ? fileOrName
        : fileOrName?.displayName || fileOrName?.filename;
    return String(value || '').replace(/^\d{13,}-/, '');
  }

  private clearImageUrl(): void {
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    this.imageUrl = '';
  }

  private normalizeSearch(value: unknown): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  back(): void {
    this.router.navigateByUrl('/homeAdmin');
  }
}
