import { Injectable } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable } from 'rxjs';
import { saveAs } from 'file-saver';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';

export type AttachmentPreviewKind = 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'unsupported';

export interface ViewableAttachment {
  originalName?: string;
  storedName?: string;
  size?: number;
}

export interface AttachmentViewerState {
  open: boolean;
  loading: boolean;
  error: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachmentPreviewKind;
  objectUrl: string;
  safeUrl: SafeResourceUrl | null;
  textContent: string;
  blob: Blob | null;
}

@Injectable({ providedIn: 'root' })
export class AttachmentViewerService {
  state: AttachmentViewerState = this.emptyState();

  constructor(
    private readonly sanitizer: DomSanitizer,
    private readonly popup: PopupServiceService,
  ) {}

  open(attachment: ViewableAttachment, source: Observable<Blob>): void {
    this.close();
    const name = attachment.originalName || attachment.storedName || 'Allegato';
    this.state = {
      ...this.emptyState(),
      open: true,
      loading: true,
      name,
      size: Number(attachment.size || 0),
    };

    source.subscribe({
      next: (blob) => this.showBlob(blob, name),
      error: (error) => {
        console.error('Errore apertura allegato:', error);
        this.parseError(error).then((message) => {
          this.state = { ...this.state, loading: false, error: message };
        });
      },
    });
  }

  openBlob(blob: Blob, name: string): void {
    this.close();
    this.state = {
      ...this.emptyState(),
      open: true,
      loading: true,
      name: name || 'Allegato',
      size: blob.size,
    };
    this.showBlob(blob, this.state.name);
  }

  close(): void {
    if (this.state.objectUrl) URL.revokeObjectURL(this.state.objectUrl);
    this.state = this.emptyState();
  }

  download(): void {
    if (!this.state.blob) return;
    saveAs(this.state.blob, this.state.name || 'allegato');
  }

  get canPrint(): boolean {
    return ['pdf', 'image', 'text'].includes(this.state.kind);
  }

  print(): void {
    const viewer = this.state;
    if (!viewer.objectUrl || !this.canPrint) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      this.popup.showError('Il browser ha bloccato la finestra di stampa.');
      return;
    }

    if (viewer.kind === 'pdf') {
      printWindow.location.href = viewer.objectUrl;
      window.setTimeout(() => {
        try { printWindow.print(); } catch {}
      }, 800);
      return;
    }

    const safeTitle = this.escapeHtml(viewer.name || 'Allegato');
    const content = viewer.kind === 'image'
      ? `<img src="${viewer.objectUrl}" alt="" style="max-width:100%;height:auto">`
      : `<pre style="white-space:pre-wrap;word-break:break-word">${this.escapeHtml(viewer.textContent)}</pre>`;
    printWindow.document.write(
      `<!doctype html><html><head><title>${safeTitle}</title></head>` +
      `<body style="margin:24px;font-family:Arial,sans-serif">${content}` +
      `<script>window.onload=()=>window.print()<\/script></body></html>`,
    );
    printWindow.document.close();
  }

  get canShare(): boolean {
    return !!this.state.blob && typeof navigator.share === 'function';
  }

  async share(): Promise<void> {
    const viewer = this.state;
    if (!viewer.blob || !this.canShare) {
      this.popup.showError(
        window.isSecureContext
          ? 'La condivisione non è supportata da questo dispositivo.'
          : 'La condivisione richiede HTTPS. L’indirizzo IP locale aperto in HTTP viene bloccato dal browser.',
      );
      return;
    }
    const file = new File([viewer.blob], viewer.name || 'allegato', {
      type: viewer.mimeType || viewer.blob.type || 'application/octet-stream',
    });
    try {
      if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
        this.popup.showError('Questo tipo di file non può essere condiviso dal dispositivo.');
        return;
      }
      await navigator.share({ title: viewer.name, files: [file] });
    } catch (error: any) {
      if (error?.name !== 'AbortError') this.popup.showError('Impossibile condividere questo allegato.');
    }
  }

  previewKind(mimeType: string): AttachmentPreviewKind {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/xml'
    ) return 'text';
    return 'unsupported';
  }

  private showBlob(blob: Blob, name: string): void {
    const mimeType = this.mimeType(blob, name);
    const namedBlob = new File([blob], name, { type: mimeType });
    const objectUrl = URL.createObjectURL(namedBlob);
    const kind = this.previewKind(mimeType);
    this.state = {
      ...this.state,
      loading: false,
      mimeType,
      size: namedBlob.size,
      kind,
      objectUrl,
      safeUrl: this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl),
      blob: namedBlob,
    };
    if (kind === 'text') {
      namedBlob.text().then((text) => {
        if (this.state.objectUrl === objectUrl) this.state = { ...this.state, textContent: text };
      });
    }
  }

  private mimeType(blob: Blob, filename: string): string {
    if (blob.type && blob.type !== 'application/octet-stream') return blob.type;
    const extension = filename.toLowerCase().split('.').pop() || '';
    return ({
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      txt: 'text/plain',
      csv: 'text/csv',
      json: 'application/json',
      xml: 'application/xml',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      mp4: 'video/mp4',
      webm: 'video/webm',
    } as Record<string, string>)[extension] || 'application/octet-stream';
  }

  private async parseError(error: any): Promise<string> {
    if (error?.error instanceof Blob) {
      try {
        const parsed = JSON.parse(await error.error.text());
        if (parsed?.error) return parsed.error;
      } catch {}
    }
    return error?.error?.error || error?.message || 'Impossibile scaricare l’allegato.';
  }

  private emptyState(): AttachmentViewerState {
    return {
      open: false,
      loading: false,
      error: '',
      name: '',
      mimeType: '',
      size: 0,
      kind: 'unsupported',
      objectUrl: '',
      safeUrl: null,
      textContent: '',
      blob: null,
    };
  }

  private escapeHtml(value: string): string {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
