import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { TenantService } from '../../service/tenant.service';

interface ContractAcceptancePayload {
  tenantId: string;
  companyName: string;
  token: string;
  id: number;
  contractNumber: string;
  status: 'draft' | 'sent' | 'accepted' | 'expired' | 'cancelled';
  canAccept: boolean;
  nome: string;
  cognome: string;
  email: string;
  cellulare?: string;
  role?: string;
  contractType?: string;
  level?: string;
  workLocation?: string;
  startDate?: string;
  endDate?: string;
  weeklyHours?: string;
  grossSalary?: string;
  trialPeriod?: string;
  requestedAt?: string | null;
  expiresAt?: string | null;
  acceptedAt?: string | null;
  acceptedByName?: string;
  acceptedByEmail?: string;
  acceptedByPhone?: string;
  acceptanceText: string;
  contractHashSha256: string;
  signaturePresent?: boolean;
  signedPdfAvailable?: boolean;
  needsOfficeReview?: boolean;
  officeConfirmedAt?: string | null;
  officeConfirmedBy?: string | null;
  employeeId?: number | null;
  publicFields?: Array<{
    key: string;
    label: string;
    value?: string | null;
  }>;
  approvalUrl: string;
  pdfUrl: string;
}

@Component({
  selector: 'app-contract-accept',
  templateUrl: './contract-accept.component.html',
  styleUrls: ['./contract-accept.component.css'],
})
export class ContractAcceptComponent implements OnInit {
  @ViewChild('signatureCanvas') signatureCanvas?: ElementRef<HTMLCanvasElement>;

  contract: ContractAcceptancePayload | null = null;
  token = '';
  loading = true;
  submitting = false;
  errorMessage = '';
  successMessage = '';
  acceptedByName = '';
  acceptedByEmail = '';
  acceptedByPhone = '';
  acceptTerms = false;
  showSignaturePad = false;
  hasSignature = false;
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
      this.errorMessage = '';
      this.successMessage = '';
      this.acceptTerms = false;
      this.showSignaturePad = false;
      this.hasSignature = false;

      if (!this.token) {
        this.loading = false;
        this.errorMessage = 'Il link richiesto non e\' valido.';
        return;
      }

      this.loadContract();
    });
  }

  get isPending(): boolean {
    return this.contract?.status === 'sent';
  }

  get isAccepted(): boolean {
    return this.contract?.status === 'accepted';
  }

  get isExpired(): boolean {
    return this.contract?.status === 'expired';
  }

  get isCancelled(): boolean {
    return this.contract?.status === 'cancelled';
  }

  get candidateName(): string {
    return `${this.contract?.nome || ''} ${this.contract?.cognome || ''}`.trim() || 'Candidato';
  }

  get statusTitle(): string {
    if (this.isAccepted) return 'Contratto gia\' firmato';
    if (this.isExpired) return 'Link scaduto';
    if (this.isCancelled) return 'Contratto non piu\' disponibile';
    return 'Firma contratto';
  }

  get statusDescription(): string {
    if (this.isAccepted) {
      if (this.contract?.employeeId) {
        return 'La firma e\' stata registrata correttamente e il profilo dipendente e\' stato collegato.';
      }
      return 'La firma e\' stata registrata correttamente. L\'ufficio verifichera\' il documento e completera\' l\'attivazione del dipendente.';
    }
    if (this.isExpired) {
      return 'La finestra di firma e\' scaduta. Contatta l\'azienda per ricevere un nuovo link.';
    }
    if (this.isCancelled) {
      return 'Questo link e\' stato annullato o sostituito.';
    }
    return 'Leggi il PDF, verifica i dati principali e firma online questa versione del contratto.';
  }

  get summaryFields(): Array<{ key: string; label: string; value: string }> {
    const configuredFields = Array.isArray(this.contract?.publicFields)
      ? this.contract.publicFields
      : [];
    const fields = configuredFields
      .filter((field) => String(field?.key || '').trim() && String(field?.label || '').trim())
      .map((field) => ({
        key: String(field.key).trim(),
        label: String(field.label).trim(),
        value: String(field.value || '').trim() || 'Non indicata',
      }));

    fields.push({
      key: '__expiresAt',
      label: 'Scadenza link',
      value: this.contract?.expiresAt
        ? this.formatDateTime(this.contract.expiresAt)
        : 'Nessuna scadenza',
    });

    return fields;
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.showSignaturePad && this.isPending) {
      this.prepareSignatureCanvas();
    }
  }

  openSignatureStep(): void {
    const validationError = this.validateForm();
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
    if (!canvas || !this.canvasContext) return;

    this.canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    this.configureSignatureContext();
    this.hasSignature = false;
    this.drawing = false;
    this.lastPoint = null;
  }

  submitAcceptance(): void {
    if (!this.token || this.submitting) return;

    const validationError = this.validateForm();
    if (validationError) {
      this.errorMessage = validationError;
      return;
    }
    if (!this.showSignaturePad) {
      this.errorMessage = 'Apri il riquadro firma prima di confermare.';
      return;
    }
    if (!this.hasSignature) {
      this.errorMessage = 'Disegna la firma nel riquadro prima di confermare.';
      return;
    }

    const signatureDataUrl = this.signatureCanvas?.nativeElement.toDataURL('image/png');
    if (!signatureDataUrl) {
      this.errorMessage = 'Non siamo riusciti a leggere la firma. Riprova.';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.http
      .post<{ message: string; contract: ContractAcceptancePayload }>(
        this.buildApiUrl('/confirmJson'),
        {
          acceptedByName: this.acceptedByName,
          acceptedByEmail: this.acceptedByEmail,
          acceptedByPhone: this.acceptedByPhone,
          acceptTerms: this.acceptTerms ? 'yes' : 'no',
          signatureDataUrl,
          tenantId: this.getPublicTenant(),
        },
        { params: this.getTenantParams() },
      )
      .subscribe({
        next: (response) => {
          this.applyContract(response.contract);
          this.successMessage = response.message || 'Contratto firmato correttamente. L\'ufficio completera\' la verifica.';
          this.showSignaturePad = false;
          this.acceptTerms = false;
          this.submitting = false;
        },
        error: (err) => {
          this.applyContract(err?.error?.contract);
          this.errorMessage = this.parseServerError(err);
          this.submitting = false;
        },
      });
  }

  startSignature(event: PointerEvent): void {
    const point = this.getCanvasPoint(event);
    if (!point || !this.canvasContext) return;

    this.errorMessage = '';
    this.drawing = true;
    this.lastPoint = point;
    this.signatureCanvas?.nativeElement.setPointerCapture?.(event.pointerId);
    this.canvasContext.beginPath();
    this.canvasContext.moveTo(point.x, point.y);
  }

  moveSignature(event: PointerEvent): void {
    if (!this.drawing || !this.canvasContext) return;
    const point = this.getCanvasPoint(event);
    if (!point) return;

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
      this.signatureCanvas?.nativeElement.releasePointerCapture?.(event.pointerId);
    }
    this.drawing = false;
    this.lastPoint = null;
  }

  private loadContract(): void {
    this.loading = true;
    this.http
      .get<ContractAcceptancePayload>(this.buildApiUrl('/details'), {
        params: this.getTenantParams(),
      })
      .subscribe({
        next: (response) => {
          this.applyContract(response);
          this.loading = false;
        },
        error: (err) => {
          this.contract = null;
          this.safePdfUrl = null;
          this.pdfUrl = '';
          this.errorMessage = this.parseServerError(err);
          this.loading = false;
        },
      });
  }

  private applyContract(contract: ContractAcceptancePayload | null | undefined): void {
    if (!contract) return;

    this.contract = contract;
    this.acceptedByName = contract.acceptedByName || this.candidateName;
    this.acceptedByEmail = contract.acceptedByEmail || contract.email || '';
    this.acceptedByPhone = contract.acceptedByPhone || contract.cellulare || '';
    this.hasSignature = !!contract.signaturePresent;
    this.showSignaturePad = false;
    this.drawing = false;
    this.lastPoint = null;
    this.pdfUrl = this.buildPdfUrl(contract);
    this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfUrl);
  }

  private buildApiUrl(suffix: string): string {
    return `${this.globalService.url}employee-contracts/accept/${this.token}${suffix}`;
  }

  private buildPdfUrl(contract: ContractAcceptancePayload): string {
    const url = new URL(
      contract.pdfUrl || `${this.globalService.url}employee-contracts/accept/${this.token}/pdf`,
      window.location.origin,
    );
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

  private formatDateTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private validateForm(): string {
    if (!this.acceptedByName.trim()) {
      return 'Inserisci nome e cognome prima di firmare.';
    }
    if (!this.acceptTerms) {
      return 'Per procedere devi confermare l\'accettazione del contratto.';
    }
    return '';
  }

  private prepareSignatureCanvas(): void {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width || 320));
    const height = Math.max(180, Math.floor(rect.height || 180));
    const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);

    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.canvasContext = ctx;
    this.configureSignatureContext();
    this.hasSignature = false;
  }

  private configureSignatureContext(): void {
    if (!this.canvasContext || !this.signatureCanvas?.nativeElement) return;

    const canvas = this.signatureCanvas.nativeElement;
    this.canvasContext.clearRect(0, 0, canvas.width, canvas.height);
    this.canvasContext.lineCap = 'round';
    this.canvasContext.lineJoin = 'round';
    this.canvasContext.lineWidth = 2.4;
    this.canvasContext.strokeStyle = '#152033';
  }

  private getCanvasPoint(event: PointerEvent): { x: number; y: number } | null {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private parseServerError(err: any): string {
    const responseError = err?.error;
    if (responseError?.error) return responseError.error;
    if (typeof responseError === 'string' && responseError.trim()) return responseError;
    if (err?.status === 404) return 'Il link richiesto non esiste o non e\' piu\' disponibile.';
    if (err?.status === 0) return 'Impossibile contattare il server.';
    return 'Si e\' verificato un errore imprevisto.';
  }
}
