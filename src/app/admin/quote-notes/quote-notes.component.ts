import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { Location } from '@angular/common';
import { DomSanitizer, SafeUrl, SafeResourceUrl } from '@angular/platform-browser';
import { NoteUnreadService } from '../../service/note-unread.service';

export interface AllegatoNota {
  nome: string;
  base64?: string;
  mimeType: string;
  size?: number;
  storageName?: string;
  previewName?: string;
  previewMimeType?: string;
  previewSize?: number;
  file?: File;
  blob?: Blob;
  previewUrl?: string;
  originalUrl?: string;
  downloadUrl?: string;
  previewDownloadUrl?: string;
}

export interface NotaPreventivo {
  id?: number;
  numeroPreventivo: string;
  operatore: string;
  data: string;
  ora: string;
  testo: string;
  allegati: AllegatoNota[];
}

@Component({
  selector: 'app-quote-notes',
  templateUrl: './quote-notes.component.html',
  styleUrl: './quote-notes.component.css',
})
export class QuoteNotesComponent implements OnInit {
  private readonly fallbackReturnUrl = '/homeAdmin/quotesHome';
  numeroPreventivo = '';
  displayName = '';
  returnTo = this.fallbackReturnUrl;
  note: NotaPreventivo[] = [];
  nuovaNota = '';
  nuoviAllegati: AllegatoNota[] = [];
  loading = false;
  sending = false;
  isDragging = false;
  private dragCounter = 0;

  // ── Filtri ──────────────────────────────────────
  soloAllegati = false;
  showSearch = false;
  searchText = '';
  showDateFilter = false;
  dateFrom = '';
  dateTo = '';
  filterOperatore = '';

  get operatoriDisponibili(): string[] {
    const set = new Set(this.note.map(n => n.operatore).filter(Boolean));
    return Array.from(set).sort();
  }

  get noteFiltrate(): NotaPreventivo[] {
    let result = [...this.note];

    if (this.soloAllegati) {
      result = result.filter(n => n.allegati && n.allegati.length > 0);
    }

    if (this.searchText.trim()) {
      const q = this.normalize(this.searchText);
      result = result.filter(n => this.normalize(n.testo).includes(q));
    }

    if (this.filterOperatore) {
      result = result.filter(n => n.operatore === this.filterOperatore);
    }

    if (this.dateFrom || this.dateTo) {
      result = result.filter(n => {
        const noteDate = this.parseDateIT(n.data);
        if (!noteDate) return true;
        if (this.dateFrom) {
          const from = new Date(this.dateFrom);
          from.setHours(0, 0, 0, 0);
          if (noteDate < from) return false;
        }
        if (this.dateTo) {
          const to = new Date(this.dateTo);
          to.setHours(23, 59, 59, 999);
          if (noteDate > to) return false;
        }
        return true;
      });
    }

    return result;
  }

  get activeFilterCount(): number {
    let n = 0;
    if (this.soloAllegati) n++;
    if (this.searchText.trim()) n++;
    if (this.filterOperatore) n++;
    if (this.dateFrom || this.dateTo) n++;
    return n;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    public globalService: GlobalService,
    private location: Location,
    private sanitizer: DomSanitizer,
    private noteUnread: NoteUnreadService,
  ) {}

  ngOnInit() {
    this.numeroPreventivo =
      this.route.snapshot.queryParamMap.get('numeroPreventivo') || '';
    this.displayName =
      this.route.snapshot.queryParamMap.get('displayName') || '';
    this.returnTo = this.resolveReturnUrl(
      this.route.snapshot.queryParamMap.get('returnTo'),
    );
    this.loadNote();
  }

  loadNote() {
    if (!this.numeroPreventivo) return;
    this.loading = true;
    this.http
      .post<NotaPreventivo[]>(
        this.globalService.url + 'quotes/notes/getAll',
        { numeroPreventivo: this.numeroPreventivo },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: (res) => {
          this.note = Array.isArray(res) ? res : [];
          this.prepareStoredAttachments();
          this.noteUnread.markRead('quote', this.numeroPreventivo);
          this.loading = false;
        },
        error: () => {
          this.note = [];
          this.loading = false;
        },
      });
  }

  @HostListener('dragenter', ['$event'])
  onDragEnter(e: DragEvent) { e.preventDefault(); this.dragCounter++; this.isDragging = true; }

  @HostListener('dragleave', ['$event'])
  onDragLeave(_e: DragEvent) { if (--this.dragCounter === 0) this.isDragging = false; }

  @HostListener('dragover', ['$event'])
  onDragOver(e: DragEvent) { e.preventDefault(); }

  @HostListener('drop', ['$event'])
  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragCounter = 0;
    this.isDragging = false;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) this.processFiles(Array.from(files));
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    this.processFiles(Array.from(input.files));
    input.value = '';
  }

  private processFiles(files: File[]) {
    files.forEach((file) => {
      this.nuoviAllegati.push({
        nome: file.name, mimeType: file.type || this.mimeFromName(file.name),
        size: file.size, file, blob: file, previewUrl: URL.createObjectURL(file),
      });
    });
  }

  removeAllegato(index: number) {
    const attachment = this.nuoviAllegati[index];
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    this.nuoviAllegati.splice(index, 1);
  }

  addNota() {
    if (!this.nuovaNota.trim() && this.nuoviAllegati.length === 0) return;
    this.sending = true;
    const body = new FormData();
    body.append('numeroPreventivo', this.numeroPreventivo);
    body.append('operatore', this.globalService.userCode);
    body.append('testo', this.nuovaNota.trim());
    this.nuoviAllegati.forEach((attachment) => {
      if (attachment.file) body.append('allegati', attachment.file, attachment.nome);
    });
    this.http
      .post<NotaPreventivo>(
        this.globalService.url + 'quotes/notes/add',
        body,
        { headers: this.globalService.headers.delete('Content-Type') },
      )
      .subscribe({
        next: (res) => {
          this.nuoviAllegati.forEach((attachment) => {
            if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
          });
          this.note.push(res);
          this.prepareStoredAttachments([res]);
          this.nuovaNota = '';
          this.nuoviAllegati = [];
          this.sending = false;
        },
        error: () => {
          alert('Errore durante il salvataggio della nota');
          this.sending = false;
        },
      });
  }

  downloadAllegato(allegato: AllegatoNota) {
    this.withObjectUrl(allegato, (url) => {
      const link = document.createElement('a'); link.href = url; link.download = allegato.nome; link.click();
    }, false, false);
  }

  viewAllegato(allegato: AllegatoNota) {
    this.withObjectUrl(allegato, (url) => {
      if (!window.open(url, '_blank')) alert('⚠️ Popup bloccato dal browser. Consenti i popup per visualizzare l’allegato.');
    });
  }

  printAllegato(allegato: AllegatoNota) {
    if (this.isP7m(allegato)) {
      alert('I file .p7m non possono essere stampati direttamente. Scaricali e aprili con un verificatore di firma digitale.');
      return;
    }

    this.withObjectUrl(allegato, (url) => {
      const newWindow = window.open(url, '_blank');
      if (!newWindow) { alert('⚠️ Popup bloccato dal browser. Consenti i popup per stampare l’allegato.'); return; }
      newWindow.onload = () => { newWindow.focus(); newWindow.print(); };
    });
  }

  private createObjectUrl(allegato: AllegatoNota, usePreview = true): string {
    if (usePreview && allegato.previewUrl) return allegato.previewUrl;
    if (allegato.blob) {
      if (!usePreview) { allegato.originalUrl ||= URL.createObjectURL(allegato.blob); return allegato.originalUrl; }
      allegato.previewUrl ||= URL.createObjectURL(allegato.blob); return allegato.previewUrl;
    }
    const mimeType = this.isP7m(allegato)
      ? 'application/pkcs7-mime'
      : allegato.mimeType || 'application/octet-stream';
    const byteCharacters = atob(allegato.base64 || '');
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    return URL.createObjectURL(blob);
  }

  private withObjectUrl(allegato: AllegatoNota, action: (url: string) => void, silent = false, usePreview = true) {
    if (allegato.base64 || allegato.blob || (usePreview && allegato.previewUrl)) { action(this.createObjectUrl(allegato, usePreview)); return; }
    if (!allegato.downloadUrl) return;
    this.http.get(allegato.downloadUrl, {
      headers: this.globalService.headers.delete('Content-Type'), responseType: 'blob',
    }).subscribe({
      next: (blob) => { allegato.blob = blob; action(this.createObjectUrl(allegato, usePreview)); },
      error: () => { if (!silent) alert('Impossibile aprire l’allegato'); },
    });
  }

  private prepareStoredAttachments(notes: NotaPreventivo[] = this.note) {
    notes.forEach((note) => note.allegati?.forEach((attachment) => {
      if (!attachment.storageName || !note.id) return;
      attachment.downloadUrl = `${this.globalService.url}quotes/notes/${note.id}/attachments/${encodeURIComponent(attachment.storageName)}`;
      if (attachment.previewName) {
        attachment.previewDownloadUrl = `${attachment.downloadUrl}/preview`;
        this.loadPreview(attachment);
      } else if (this.isImage(attachment) || this.isPdf(attachment)) {
        this.withObjectUrl(attachment, () => {}, true);
      }
    }));
  }

  private loadPreview(allegato: AllegatoNota) {
    if (!allegato.previewDownloadUrl) return;
    this.http.get(allegato.previewDownloadUrl, {
      headers: this.globalService.headers.delete('Content-Type'), responseType: 'blob',
    }).subscribe({
      next: (preview) => { allegato.previewUrl = URL.createObjectURL(preview); },
      error: () => {},
    });
  }

  private mimeFromName(name: string): string {
    if (/\.hei[cf]$/i.test(name)) return name.toLowerCase().endsWith('.heic') ? 'image/heic' : 'image/heif';
    if (/\.png$/i.test(name)) return 'image/png';
    if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
    if (/\.pdf$/i.test(name)) return 'application/pdf';
    return 'application/octet-stream';
  }

  isImage(allegato: AllegatoNota): boolean {
    if (allegato.previewName) return true;
    return (
      /^(image\/(png|jpeg|gif|webp|bmp|svg\+xml))$/i.test(allegato.mimeType || '') ||
      /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(allegato.nome)
    );
  }

  isPdf(allegato: AllegatoNota): boolean {
    return (
      allegato.mimeType === 'application/pdf' ||
      allegato.nome?.toLowerCase().endsWith('.pdf')
    );
  }

  isP7m(allegato: AllegatoNota): boolean {
    return allegato.nome?.toLowerCase().endsWith('.p7m');
  }

  getDataUrl(allegato: AllegatoNota): SafeUrl {
    if (allegato.previewUrl) return this.sanitizer.bypassSecurityTrustUrl(allegato.previewUrl);
    const mime = allegato.mimeType || 'application/octet-stream';
    return this.sanitizer.bypassSecurityTrustUrl(
      allegato.base64 ? `data:${mime};base64,${allegato.base64}` : '',
    );
  }

  getPdfResourceUrl(allegato: AllegatoNota): SafeResourceUrl {
    if (allegato.previewUrl) return this.sanitizer.bypassSecurityTrustResourceUrl(allegato.previewUrl);
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      allegato.base64 ? `data:application/pdf;base64,${allegato.base64}` : '',
    );
  }

  toggleSoloAllegati() {
    this.soloAllegati = !this.soloAllegati;
  }

  toggleSearch() {
    this.showSearch = !this.showSearch;
    if (!this.showSearch) this.searchText = '';
  }

  toggleDateFilter() {
    this.showDateFilter = !this.showDateFilter;
    if (!this.showDateFilter) {
      this.dateFrom = '';
      this.dateTo = '';
      this.filterOperatore = '';
    }
  }

  clearAllFilters() {
    this.soloAllegati = false;
    this.searchText = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.filterOperatore = '';
    this.showSearch = false;
    this.showDateFilter = false;
  }

  private normalize(s: string): string {
    return (s || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }

  private parseDateIT(value: string): Date | null {
    if (!value) return null;
    const [dd, mm, yyyy] = value.split('/');
    if (!dd || !mm || !yyyy) return null;
    return new Date(+yyyy, +mm - 1, +dd);
  }

  back() {
    this.router.navigateByUrl(this.returnTo);
  }

  @HostListener('window:popstate', ['$event'])
  onBrowserBackBtnClose(event: Event): void {
    event.preventDefault();
    this.location.replaceState(this.returnTo);
    this.router.navigateByUrl(this.returnTo);
  }

  private resolveReturnUrl(value: string | null): string {
    const trimmed = String(value || '').trim();
    if (!trimmed) return this.fallbackReturnUrl;

    try {
      const decoded = decodeURIComponent(trimmed);
      if (decoded.startsWith('/homeAdmin')) return decoded;
    } catch {
      if (trimmed.startsWith('/homeAdmin')) return trimmed;
    }

    return this.fallbackReturnUrl;
  }
}
