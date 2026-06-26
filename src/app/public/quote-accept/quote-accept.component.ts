import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { TenantService } from '../../service/tenant.service';

interface QuoteAcceptanceMeta {
  numeroPreventivo?: string;
  data?: string;
  displayName?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  paymentMethod?: string;
  totalAmountLabel?: string;
}

interface QuoteAcceptancePayload {
  tenantId: string;
  companyName: string;
  token: string;
  numeroPreventivo: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  canAccept: boolean;
  needsOfficeReview: boolean;
  officeConfirmedAt?: string | null;
  officeConfirmedBy?: string | null;
  customerNumero?: string | null;
  requestedAt?: string | null;
  expiresAt?: string | null;
  viewedAt?: string | null;
  acceptedAt?: string | null;
  acceptedByName?: string;
  acceptedByEmail?: string;
  acceptedByPhone?: string;
  recipientEmail?: string;
  recipientPhone?: string;
  acceptanceText: string;
  acceptanceTextVersion: string;
  quoteHashSha256: string;
  signaturePresent?: boolean;
  signedPdfAvailable?: boolean;
  quoteMeta: QuoteAcceptanceMeta;
  approvalUrl: string;
  pdfUrl: string;
}

@Component({
  selector: 'app-quote-accept',
  templateUrl: './quote-accept.component.html',
  styleUrls: ['./quote-accept.component.css'],
})
export class QuoteAcceptComponent implements OnInit {
  @ViewChild('signatureCanvas') signatureCanvas?: ElementRef<HTMLCanvasElement>;

  acceptance: QuoteAcceptancePayload | null = null;
  token = '';
  loading = true;
  submitting = false;
  errorMessage = '';
  successMessage = '';
  showSignaturePad = false;
  hasSignature = false;
  acceptedByName = '';
  acceptedByPhone = '';
  acceptedByEmail = '';
  acceptTerms = false;
  pdfUrl = '';
  safePdfUrl: SafeResourceUrl | null = null;
  private canvasContext: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private lastPoint: { x: number; y: number } | null = null;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private globalService: GlobalService,
    private tenantService: TenantService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      this.token = String(params.get('token') || '').trim();
      this.acceptTerms = false;
      this.successMessage = '';
      this.errorMessage = '';
      this.showSignaturePad = false;
      this.hasSignature = false;
      this.drawing = false;
      this.lastPoint = null;

      if (!this.token) {
        this.loading = false;
        this.errorMessage = 'Il link richiesto non è valido.';
        return;
      }

      this.loadAcceptance();
    });
  }

  get isPending(): boolean {
    return this.acceptance?.status === 'pending';
  }

  get isAccepted(): boolean {
    return this.acceptance?.status === 'accepted';
  }

  get isExpired(): boolean {
    return this.acceptance?.status === 'expired';
  }

  get isCancelled(): boolean {
    return this.acceptance?.status === 'cancelled';
  }

  get displayName(): string {
    return (
      this.acceptance?.quoteMeta?.displayName ||
      'Cliente'
    );
  }

  get statusTitle(): string {
    if (this.isAccepted) return 'Preventivo già confermato';
    if (this.isExpired) return 'Link scaduto';
    if (this.isCancelled) return 'Richiesta non più valida';
    return 'Accettazione preventivo';
  }

  get statusDescription(): string {
    if (this.isAccepted) {
      return "Abbiamo registrato la conferma di questa versione del preventivo. Il nostro ufficio completerà ora la verifica interna.";
    }

    if (this.isExpired) {
      return 'La finestra di accettazione è scaduta. Contattateci per ricevere un nuovo link aggiornato.';
    }

    if (this.isCancelled) {
      return 'Questo link è stato sostituito o disattivato. Se vi serve una nuova conferma, contattateci.';
    }

    return 'Controllate il PDF congelato del preventivo e confermate online questa specifica versione del documento.';
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.showSignaturePad && this.isPending) {
      this.prepareSignatureCanvas();
    }
  }

  openSignatureStep(): void {
    const validationError = this.validateAcceptanceForm();
    if (validationError) {
      this.errorMessage = validationError;
      return;
    }

    this.errorMessage = '';
    this.showSignaturePad = true;
    setTimeout(() => this.prepareSignatureCanvas(), 0);
  }

  clearSignature(): void {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas || !this.canvasContext) {
      return;
    }

    this.canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    this.configureSignatureContext();
    this.hasSignature = false;
    this.drawing = false;
    this.lastPoint = null;
  }

  submitAcceptance(): void {
    if (!this.token || this.submitting) {
      return;
    }

    const validationError = this.validateAcceptanceForm();
    if (validationError) {
      this.errorMessage = validationError;
      return;
    }

    if (!this.showSignaturePad) {
      this.errorMessage = 'Apri il riquadro firma prima di confermare il preventivo.';
      return;
    }

    if (!this.hasSignature) {
      this.errorMessage = 'Disegna la firma nel riquadro prima di confermare il preventivo.';
      return;
    }

    const signatureDataUrl = this.signatureCanvas?.nativeElement.toDataURL(
      'image/png',
    );
    if (!signatureDataUrl) {
      this.errorMessage = 'Non siamo riusciti a leggere la firma. Riprova.';
      return;
    }

    this.errorMessage = '';
    this.successMessage = '';
    this.submitting = true;

    const body = {
      acceptedByName: this.acceptedByName,
      acceptedByPhone: this.acceptedByPhone,
      acceptedByEmail: this.acceptedByEmail,
      acceptTerms: this.acceptTerms ? 'yes' : 'no',
      signatureDataUrl,
      tenantId: this.getPublicTenant(),
    };

    this.http
      .post<{
        message: string;
        acceptance: QuoteAcceptancePayload;
      }>(this.buildApiUrl('/confirmJson'), body, {
        params: this.getTenantParams(),
      })
      .subscribe({
        next: (response) => {
          this.applyAcceptance(response.acceptance);
          this.successMessage =
            response.message || 'Preventivo confermato correttamente.';
          this.errorMessage = '';
          this.acceptTerms = false;
          this.showSignaturePad = false;
          this.submitting = false;
        },
        error: (err) => {
          this.applyAcceptance(err?.error?.acceptance);
          this.errorMessage = this.parseServerError(err);
          this.submitting = false;
        },
      });
  }

  private loadAcceptance(): void {
    this.loading = true;

    this.http
      .get<QuoteAcceptancePayload>(this.buildApiUrl('/details'), {
        params: this.getTenantParams(),
      })
      .subscribe({
        next: (response) => {
          this.applyAcceptance(response);
          this.loading = false;
        },
        error: (err) => {
          this.acceptance = null;
          this.safePdfUrl = null;
          this.pdfUrl = '';
          this.errorMessage = this.parseServerError(err);
          this.loading = false;
        },
      });
  }

  private applyAcceptance(
    acceptance: QuoteAcceptancePayload | null | undefined,
  ): void {
    if (!acceptance) {
      return;
    }

    this.acceptance = acceptance;
    this.acceptedByName =
      acceptance.acceptedByName ||
      acceptance.quoteMeta?.displayName ||
      '';
    this.acceptedByPhone =
      acceptance.acceptedByPhone ||
      acceptance.recipientPhone ||
      acceptance.quoteMeta?.recipientPhone ||
      '';
    this.acceptedByEmail =
      acceptance.acceptedByEmail ||
      acceptance.recipientEmail ||
      acceptance.quoteMeta?.recipientEmail ||
      '';
    this.showSignaturePad = false;
    this.hasSignature = !!acceptance.signaturePresent;
    this.drawing = false;
    this.lastPoint = null;

    this.pdfUrl = this.buildPdfUrl(acceptance);
    this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      this.pdfUrl,
    );
  }

  startSignature(event: PointerEvent): void {
    const point = this.getCanvasPoint(event);
    if (!point || !this.canvasContext) {
      return;
    }

    this.errorMessage = '';
    this.drawing = true;
    this.lastPoint = point;
    this.signatureCanvas?.nativeElement.setPointerCapture?.(event.pointerId);
    this.canvasContext.beginPath();
    this.canvasContext.moveTo(point.x, point.y);
  }

  moveSignature(event: PointerEvent): void {
    if (!this.drawing || !this.canvasContext) {
      return;
    }

    const point = this.getCanvasPoint(event);
    if (!point) {
      return;
    }

    const previous = this.lastPoint || point;
    this.canvasContext.beginPath();
    this.canvasContext.moveTo(previous.x, previous.y);
    this.canvasContext.lineTo(point.x, point.y);
    this.canvasContext.stroke();
    this.lastPoint = point;
    this.hasSignature = true;
  }

  endSignature(event?: PointerEvent): void {
    if (event) {
      this.signatureCanvas?.nativeElement.releasePointerCapture?.(
        event.pointerId,
      );
    }

    this.drawing = false;
    this.lastPoint = null;
  }

  private buildApiUrl(suffix: string): string {
    return `${this.globalService.url}quotes/accept/${this.token}${suffix}`;
  }

  private buildPdfUrl(acceptance: QuoteAcceptancePayload): string {
    const rawUrl =
      acceptance.pdfUrl ||
      `${this.globalService.url}quotes/accept/${this.token}/pdf`;
    const url = new URL(rawUrl, window.location.origin);
    const tenant = this.getPublicTenant();
    if (tenant) {
      url.searchParams.set('tenant', tenant);
    }
    return url.toString();
  }

  private getTenantParams(): HttpParams {
    const tenant = this.getPublicTenant();
    return tenant ? new HttpParams().set('tenant', tenant) : new HttpParams();
  }

  private getPublicTenant(): string {
    return this.normalizeTenant(
      this.route.snapshot.queryParamMap.get('tenant') ||
      this.route.snapshot.queryParamMap.get('tenantId') ||
      this.tenantService.tenant,
    );
  }

  private normalizeTenant(value: string | null | undefined): string {
    const tenant = String(value || '').trim().toLowerCase();
    return /^[a-z0-9][a-z0-9_-]{1,79}$/.test(tenant) ? tenant : '';
  }

  private validateAcceptanceForm(): string {
    if (!this.acceptedByName.trim()) {
      return 'Inserisci il nome del referente che conferma il preventivo.';
    }

    if (!this.acceptTerms) {
      return "Per procedere devi confermare l'accettazione del preventivo.";
    }

    return '';
  }

  private prepareSignatureCanvas(): void {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width || 320));
    const height = Math.max(180, Math.floor(rect.height || 180));
    const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);

    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.canvasContext = ctx;
    this.configureSignatureContext();
    this.hasSignature = false;
  }

  private configureSignatureContext(): void {
    if (!this.canvasContext || !this.signatureCanvas?.nativeElement) {
      return;
    }

    const canvas = this.signatureCanvas.nativeElement;
    this.canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    this.canvasContext.lineCap = 'round';
    this.canvasContext.lineJoin = 'round';
    this.canvasContext.lineWidth = 2.4;
    this.canvasContext.strokeStyle = '#0f172a';
  }

  private getCanvasPoint(event: PointerEvent): { x: number; y: number } | null {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private parseServerError(err: any): string {
    const responseError = err?.error;

    if (responseError?.error) {
      return responseError.error;
    }

    if (typeof responseError === 'string') {
      try {
        const parsed = JSON.parse(responseError);
        if (parsed?.error) {
          return parsed.error;
        }
      } catch {
        if (responseError.trim()) {
          return responseError;
        }
      }
    }

    if (err?.status === 404) {
      return 'Il link richiesto non esiste o non è più disponibile.';
    }

    if (err?.status === 0) {
      return 'Impossibile contattare il server. Riprova tra qualche istante.';
    }

    return 'Si è verificato un errore imprevisto. Riprova.';
  }
}
