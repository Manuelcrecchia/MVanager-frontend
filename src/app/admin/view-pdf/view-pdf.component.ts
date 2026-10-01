import { downloadFile } from '../../shared/file-download';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { GlobalService } from '../../service/global.service';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CustomerModelService } from '../../service/customer-model.service';
import { NativePdfViewer } from '../../service/native-pdf-viewer';

@Component({
  selector: 'app-view-pdf',
  templateUrl: './view-pdf.component.html',
  styleUrls: ['./view-pdf.component.css'],
})
export class ViewPdfComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('pdfShell', { static: true }) pdfShell?: ElementRef<HTMLElement>;

  pdfSrc: string = '';
  pdfZoom: string | number = 'page-width';
  currentPdfZoom = 1;
  readonly mobilePdfViewer =
    Capacitor.getPlatform() !== 'web' ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 900px), (pointer: coarse)').matches);
  readonly nativeIosPdfViewer =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  readonly mobileWebPdfViewer = this.mobilePdfViewer && !this.nativeIosPdfViewer;
  readonly maxPdfZoom = this.mobilePdfViewer ? 2 : 4;
  downloadName = 'document.pdf';
  documentTitle = 'Preventivo';
  documentType: 'quote' | 'employeeContract' = 'quote';

  numeroPreventivo!: string;
  employeeContractId = '';
  signedPdfMode = false;
  confirmCustomerMode = false;
  confirmEmployeeMode = false;
  loadingPdf = false;
  private currentPdfBlob: Blob | null = null;
  private blockingPdfPinch = false;
  private pdfPinchStartDistance = 0;
  private pdfPinchLastDistance = 0;
  mobilePinchPreview = 1;
  mobilePinchOrigin = '50% 50%';
  mobilePdfPage = 1;
  mobilePdfPages = 0;
  nativePdfOpening = false;

  constructor(
    private globalService: GlobalService,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private customerModelService: CustomerModelService,
  ) {}

  private sanitizeFilename(name: string): string {
    const cleaned = name
      .replace(/[\/\\?%*:|"<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.slice(0, 120) || 'document';
  }

  ngOnInit(): void {
    this.globalService.loadTenantConfig(false, { showError: false }).finally(() => {
      this.route.queryParams.subscribe((params) => {
        this.releasePdfUrl();
        this.currentPdfBlob = null;
        this.signedPdfMode = params['signed'] === '1' || params['signed'] === 'true';
        this.confirmCustomerMode = false;
        this.confirmEmployeeMode = false;

        const employeeContractId = String(params['employeeContractId'] || params['contractId'] || '').trim();
        if (employeeContractId) {
          this.loadEmployeeContractDocument(employeeContractId, params);
          return;
        }

        const numeroPreventivo = params['numeroPreventivo'];
        if (!numeroPreventivo) return;

        const body = { numeroPreventivo };
        this.documentType = 'quote';
        this.documentTitle = this.signedPdfMode ? 'Preventivo firmato' : 'Preventivo';
        this.numeroPreventivo = params['numeroPreventivo'];
        this.confirmCustomerMode =
          (params['confirmCustomer'] === '1' || params['confirmCustomer'] === 'true') &&
          this.globalService.canCreateCustomers();

        // Nome file
        this.http
          .post(this.globalService.url + 'quotes/getQuote', body, {
            headers: this.globalService.headers,
            responseType: 'text',
          })
          .subscribe({
            next: (resp) => {
              if (resp === 'Unauthorized') {
                this.router.navigateByUrl('/');
                return;
              }
              const quote = JSON.parse(resp)[0];
              const displayName = this.globalService.getRecordDisplayName('quote', quote || {});
              const base = this.sanitizeFilename(
                `${numeroPreventivo} ${displayName}`
              );
              this.downloadName = this.signedPdfMode
                ? `${base} firmato.pdf`
                : `${base}.pdf`;
            },
            error: (err) => {
              console.error('Errore caricamento preventivo:', err);
              alert(this.parseServerError(err));
            },
          });

        if (this.signedPdfMode) {
          this.loadSignedPdf(body);
          return;
        }

        this.loadQuotePdf(numeroPreventivo);
      });
    });
  }

  ngAfterViewInit(): void {
    if (!this.mobileWebPdfViewer) return;

    const shell = this.pdfShell?.nativeElement;
    shell?.addEventListener('touchstart', this.blockNativePdfPinch, {
      capture: true,
      passive: false,
    });
    shell?.addEventListener('touchmove', this.blockNativePdfPinch, {
      capture: true,
      passive: false,
    });
    shell?.addEventListener('touchend', this.blockNativePdfPinch, {
      capture: true,
      passive: false,
    });
    shell?.addEventListener('touchcancel', this.blockNativePdfPinch, {
      capture: true,
      passive: false,
    });
  }

  ngOnDestroy(): void {
    const shell = this.pdfShell?.nativeElement;
    shell?.removeEventListener('touchstart', this.blockNativePdfPinch, true);
    shell?.removeEventListener('touchmove', this.blockNativePdfPinch, true);
    shell?.removeEventListener('touchend', this.blockNativePdfPinch, true);
    shell?.removeEventListener('touchcancel', this.blockNativePdfPinch, true);
    this.releasePdfUrl();
  }

  onPdfZoomFactorChange(scale: number): void {
    if (Number.isFinite(scale) && scale > 0) {
      this.currentPdfZoom = scale;
    }
  }

  zoomPdf(direction: -1 | 1, steps = 1): void {
    const step = 0.25;
    const next = Math.min(
      this.maxPdfZoom,
      Math.max(
        0.5,
        Math.round((this.currentPdfZoom + direction * step * steps) * 100) / 100,
      ),
    );
    this.currentPdfZoom = next;
    if (!this.mobilePdfViewer) {
      this.pdfZoom = next;
    }
  }

  resetPdfZoom(): void {
    this.currentPdfZoom = 1;
    if (!this.mobilePdfViewer) {
      this.pdfZoom = 'page-width';
    }
  }

  get pdfZoomLabel(): string {
    return `${Math.round(this.currentPdfZoom * 100)}%`;
  }

  onMobilePdfLoaded(pdf: { numPages?: number }): void {
    this.mobilePdfPages = Number(pdf?.numPages) || 0;
    this.mobilePdfPage = Math.min(Math.max(this.mobilePdfPage, 1), this.mobilePdfPages || 1);
  }

  changeMobilePdfPage(direction: -1 | 1): void {
    this.mobilePdfPage = Math.min(
      this.mobilePdfPages || 1,
      Math.max(1, this.mobilePdfPage + direction),
    );
  }

  async openNativePdf(): Promise<void> {
    if (!this.nativeIosPdfViewer || !this.currentPdfBlob || this.nativePdfOpening) return;

    this.nativePdfOpening = true;
    try {
      const base64Data = await this.blobToBase64(this.currentPdfBlob);
      await NativePdfViewer.present({
        base64Data,
        fileName: this.downloadName,
        title: this.documentTitle,
      });
    } catch (error) {
      console.error('Errore visualizzatore PDF nativo:', error);
      alert('Impossibile aprire il PDF. Riprova.');
    } finally {
      this.nativePdfOpening = false;
    }
  }

  private readonly blockNativePdfPinch = (event: TouchEvent): void => {
    if (event.touches.length >= 2) {
      const distance = this.touchDistance(event.touches[0], event.touches[1]);
      if (!this.blockingPdfPinch) {
        this.pdfPinchStartDistance = distance;
      }
      this.pdfPinchLastDistance = distance;
      this.mobilePinchPreview = Math.min(
        this.maxPdfZoom / this.currentPdfZoom,
        Math.max(0.5 / this.currentPdfZoom, distance / this.pdfPinchStartDistance),
      );
      this.mobilePinchOrigin = `${(event.touches[0].clientX + event.touches[1].clientX) / 2}px ${(event.touches[0].clientY + event.touches[1].clientY) / 2}px`;
      this.blockingPdfPinch = true;
    }

    if (!this.blockingPdfPinch) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if ((event.type === 'touchend' || event.type === 'touchcancel') && event.touches.length < 2) {
      if (event.type === 'touchend' && this.pdfPinchStartDistance > 0) {
        const ratio = this.pdfPinchLastDistance / this.pdfPinchStartDistance;
        const next = Math.min(
          this.maxPdfZoom,
          Math.max(0.5, Math.round(this.currentPdfZoom * ratio * 100) / 100),
        );
        this.currentPdfZoom = next;
      }
      this.mobilePinchPreview = 1;
      this.blockingPdfPinch = false;
      this.pdfPinchStartDistance = 0;
      this.pdfPinchLastDistance = 0;
    }
  };

  private touchDistance(first: Touch, second: Touch): number {
    return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
  }

  back() {
    if (this.documentType === 'employeeContract') {
      this.router.navigate(['/homeAdmin', 'employee-contracts']);
      return;
    }

    this.router.navigate(['/homeAdmin', 'quotesHome'], {
      queryParams: this.signedPdfMode ? { showCompleted: 1 } : {},
    });
  }

  downloadPdf() {
    if (this.currentPdfBlob) {
      this.downloadBlob(this.currentPdfBlob);
      return;
    }

    const body = { numeroPreventivo: this.numeroPreventivo };

    this.http
      .post(this.globalService.url + 'quotes/downloadSecure', body, {
        headers: this.globalService.headers,
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.downloadBlob(blob);
        },
        error: (err) => {
          console.error('Errore download:', err);
          alert('Errore durante il download del PDF');
        },
      });
  }
  printPdf() {
    if (this.currentPdfBlob) {
      this.printBlob(this.currentPdfBlob);
      return;
    }

    const body = { numeroPreventivo: this.numeroPreventivo };

    this.http
      .post(this.globalService.url + 'quotes/downloadSecure', body, {
        headers: this.globalService.headers,
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.printBlob(blob);
        },
        error: (err) => {
          console.error('Errore stampa:', err);
          alert('Errore durante la stampa del PDF');
        },
      });
  }

  confirmAndCreateCustomer(): void {
    if (!this.globalService.canCreateCustomers()) {
      alert('Modulo clienti non abilitato per questa azienda.');
      this.back();
      return;
    }

    const numeroPreventivo = this.numeroPreventivo;
    const body = { numeroPreventivo };

    this.http
      .post<any[]>(this.globalService.url + 'quotes/getQuote', body, {
        headers: this.globalService.headers,
      })
      .subscribe({
        next: (response) => {
          const quote = Array.isArray(response) ? response[0] : null;

          if (!quote) {
            alert('Preventivo non trovato');
            return;
          }

          this.customerModelService.populateFromQuote(quote, numeroPreventivo);

          this.http
            .post(
              this.globalService.url + 'quotes/setComplete',
              { numeroPreventivo },
              {
                headers: this.globalService.headers,
                responseType: 'text',
              },
            )
            .subscribe({
              next: () => {
                this.router.navigateByUrl('/homeAdmin/addCustomer');
              },
              error: (err) => {
                console.error('Errore setComplete:', err);
                alert(this.parseServerError(err));
              },
            });
        },
        error: (err) => {
          console.error('Errore conferma preventivo:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  confirmAndCreateEmployee(): void {
    if (!this.globalService.hasPermission('EMPLOYEE_CREATE')) {
      alert('Permesso creazione dipendenti non disponibile per questa azienda.');
      this.back();
      return;
    }

    if (!this.employeeContractId) {
      alert('Contratto non valido');
      return;
    }

    this.http
      .post<{ message?: string }>(
        this.globalService.url + 'employee-contracts/completeOnboarding',
        { id: this.employeeContractId },
        { headers: this.globalService.headers },
      )
      .subscribe({
        next: (response) => {
          alert(response.message || 'Dipendente creato o collegato.');
          this.router.navigate(['/homeAdmin', 'employee-contracts'], {
            queryParams: { contractId: this.employeeContractId, review: 1 },
          });
        },
        error: (err) => {
          console.error('Errore completamento contratto:', err);
          alert(this.parseServerError(err));
        },
      });
  }

  private loadSignedPdf(body: { numeroPreventivo: string }): void {
    this.loadingPdf = true;

    this.http
      .post(
        this.globalService.url + 'quotes/downloadSignedAcceptancePdf',
        body,
        {
          headers: this.globalService.headers,
          responseType: 'blob',
        },
      )
      .subscribe({
        next: (blob) => {
          this.setPdfBlob(blob);
          this.loadingPdf = false;
        },
        error: (err) => {
          console.error('Errore caricamento PDF firmato:', err);
          alert(this.parseServerError(err));
          this.loadingPdf = false;
        },
      });
  }

  private loadQuotePdf(numeroPreventivo: string): void {
    this.loadingPdf = true;

    this.http
      .get(this.globalService.url + 'quotes/getPdfBlob', {
        headers: this.globalService.headers,
        params: { numeroPreventivo },
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.setPdfBlob(blob);
          this.loadingPdf = false;
        },
        error: (err) => {
          console.error('Errore caricamento PDF:', err);
          alert(this.parseServerError(err));
          this.loadingPdf = false;
        },
      });
  }

  private loadEmployeeContractDocument(employeeContractId: string, params: Record<string, any>): void {
    this.documentType = 'employeeContract';
    this.employeeContractId = employeeContractId;
    this.documentTitle = this.signedPdfMode ? 'Contratto firmato' : 'Contratto';
    this.confirmEmployeeMode =
      this.signedPdfMode &&
      (params['confirmEmployee'] === '1' || params['confirmEmployee'] === 'true') &&
      this.globalService.hasPermission('EMPLOYEE_CREATE');

    const contractNumber = String(params['contractNumber'] || employeeContractId).trim();
    const displayName = String(params['displayName'] || '').trim();
    const base = this.sanitizeFilename(
      [contractNumber, displayName].filter(Boolean).join(' '),
    );
    this.downloadName = this.signedPdfMode
      ? `${base} firmato.pdf`
      : `${base}.pdf`;

    this.loadingPdf = true;

    this.http
      .get(this.globalService.url + `employee-contracts/${employeeContractId}/pdf`, {
        headers: this.globalService.headers,
        params: this.signedPdfMode ? { signed: '1' } : {},
        responseType: 'blob',
      })
      .subscribe({
        next: (blob) => {
          this.setPdfBlob(blob);
          this.loadingPdf = false;
        },
        error: (err) => {
          console.error('Errore caricamento PDF contratto:', err);
          alert(this.parseServerError(err));
          this.loadingPdf = false;
        },
      });
  }

  private setPdfBlob(blob: Blob): void {
    this.currentPdfBlob = new Blob([blob], { type: 'application/pdf' });
    this.releasePdfUrl();
    if (this.nativeIosPdfViewer) {
      // PDFKit receives the bytes directly: WebKit must not create or render a
      // blob URL on iOS, otherwise pinch zoom can still trigger its memory cap.
      this.pdfSrc = 'native-pdf';
      setTimeout(() => void this.openNativePdf());
      return;
    }
    this.pdfSrc = URL.createObjectURL(this.currentPdfBlob);
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('Lettura PDF fallita'));
      reader.onload = () => {
        const value = String(reader.result || '');
        const separator = value.indexOf(',');
        if (separator < 0) {
          reject(new Error('Formato PDF non valido'));
          return;
        }
        resolve(value.slice(separator + 1));
      };
      reader.readAsDataURL(blob);
    });
  }

  private releasePdfUrl(): void {
    if (!this.pdfSrc) return;
    if (this.pdfSrc.startsWith('blob:')) {
      URL.revokeObjectURL(this.pdfSrc);
    }
    this.pdfSrc = '';
  }

  private downloadBlob(blob: Blob): void {
    void downloadFile(blob, this.downloadName);
  }

  private printBlob(blob: Blob): void {
    const pdfUrl = URL.createObjectURL(blob);
    const newWindow = window.open(pdfUrl);

    if (!newWindow) {
      alert('Il browser ha bloccato il popup. Attiva i popup per permettere la stampa.');
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
  }

  private parseServerError(err: any): string {
    try {
      const body = typeof err.error === 'string' ? JSON.parse(err.error) : err.error;
      if (body?.error) return body.error;
    } catch {}
    if (err.status === 0) return 'Impossibile connettersi al server';
    return 'Errore imprevisto. Riprova.';
  }
}
