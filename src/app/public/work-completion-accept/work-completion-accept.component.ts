import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { TenantService } from '../../service/tenant.service';

@Component({
  selector: 'app-work-completion-accept',
  templateUrl: './work-completion-accept.component.html',
  styleUrls: ['../quote-accept/quote-accept.component.css'],
})
export class WorkCompletionAcceptComponent implements OnInit {
  @ViewChild('signatureCanvas') signatureCanvas?: ElementRef<HTMLCanvasElement>;
  token = '';
  data: any = null;
  loading = true;
  busy = false;
  errorMessage = '';
  successMessage = '';
  answers: Record<string, string> = {};
  note = '';
  acceptTerms = false;
  privacyAcknowledged = false;
  otp = '';
  otpRequested = false;
  otpVerified = false;
  showSignature = false;
  hasSignature = false;
  pdfUrl = '';
  private context: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private lastPoint: { x: number; y: number } | null = null;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private global: GlobalService,
    private tenantService: TenantService,
  ) {}

  get questions(): any[] {
    return Array.isArray(this.data?.config?.questions) ? this.data.config.questions : [];
  }

  get pending(): boolean {
    return this.data?.status === 'pending' || this.data?.status === 'otp_verified';
  }

  ngOnInit(): void {
    this.token = String(this.route.snapshot.paramMap.get('token') || '');
    this.load();
  }

  @HostListener('window:resize')
  resized(): void {
    if (this.showSignature) this.prepareCanvas();
  }

  requestOtp(): void {
    if (!this.acceptTerms || !this.privacyAcknowledged || !this.answersComplete()) {
      this.errorMessage = 'Completa il questionario e conferma entrambe le dichiarazioni.';
      return;
    }
    this.busy = true;
    this.errorMessage = '';
    this.http.post<any>(this.api('/requestOtp'), {}, { params: this.params() }).subscribe({
      next: (res) => {
        this.busy = false;
        this.otpRequested = true;
        this.successMessage = res?.message || 'Codice inviato.';
      },
      error: (err) => {
        this.busy = false;
        if (err?.status === 429) this.otpRequested = true;
        this.errorMessage = err?.error?.error || 'Impossibile inviare il codice.';
      },
    });
  }

  verifyOtp(): void {
    if (!/^\d{6}$/.test(this.otp)) {
      this.errorMessage = 'Inserisci il codice di 6 cifre.';
      return;
    }
    this.busy = true;
    this.http.post<any>(this.api('/verifyOtp'), { otp: this.otp }, { params: this.params() }).subscribe({
      next: (res) => {
        this.busy = false;
        this.otpVerified = true;
        this.successMessage = res?.message || 'Email verificata.';
      },
      error: (err) => {
        this.busy = false;
        this.errorMessage = err?.error?.error || 'Codice non valido.';
      },
    });
  }

  openSignature(): void {
    if (!this.otpVerified) return;
    this.showSignature = true;
    setTimeout(() => this.prepareCanvas(), 0);
  }

  submit(): void {
    if (!this.hasSignature || !this.signatureCanvas) {
      this.errorMessage = 'Disegna la firma nel riquadro.';
      return;
    }
    this.busy = true;
    this.http.post<any>(this.api('/confirm'), {
      answers: this.answers,
      note: this.note,
      acceptTerms: this.acceptTerms,
      privacyAcknowledged: this.privacyAcknowledged,
      signatureDataUrl: this.signatureCanvas.nativeElement.toDataURL('image/png'),
    }, { params: this.params() }).subscribe({
      next: (result) => {
        this.busy = false;
        this.data = result;
        this.pdfUrl = this.pdf();
        this.showSignature = false;
        this.successMessage = 'Foglio compilato e firmato correttamente.';
      },
      error: (err) => {
        this.busy = false;
        this.errorMessage = err?.error?.error || 'Impossibile completare la firma.';
      },
    });
  }

  start(event: PointerEvent): void {
    if (!this.context || !this.signatureCanvas) return;
    event.preventDefault();
    this.drawing = true;
    this.signatureCanvas.nativeElement.setPointerCapture?.(event.pointerId);
    this.lastPoint = this.point(event);
  }

  move(event: PointerEvent): void {
    if (!this.drawing || !this.context || !this.lastPoint) return;
    event.preventDefault();
    const next = this.point(event);
    this.context.beginPath();
    this.context.moveTo(this.lastPoint.x, this.lastPoint.y);
    this.context.lineTo(next.x, next.y);
    this.context.stroke();
    this.lastPoint = next;
    this.hasSignature = true;
  }

  end(): void {
    this.drawing = false;
    this.lastPoint = null;
  }

  clear(): void {
    const canvas = this.signatureCanvas?.nativeElement;
    if (canvas && this.context) this.context.clearRect(0, 0, canvas.width, canvas.height);
    this.hasSignature = false;
  }

  optionId(question: any, option: any): string {
    return `remote_work_${question.key}_${option.value}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private load(): void {
    this.http.get<any>(this.api('/details'), { params: this.params() }).subscribe({
      next: (result) => {
        this.data = result;
        this.otpRequested = !!result?.otpSentAt && !result?.otpVerified;
        this.otpVerified = !!result?.otpVerified;
        this.pdfUrl = this.pdf();
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err?.error?.error || 'Richiesta non disponibile.';
      },
    });
  }

  private answersComplete(): boolean {
    return this.questions.every((q) => q.required === false || !!this.answers[q.key]);
  }

  private prepareCanvas(): void {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(320, rect.width) * ratio;
    canvas.height = 200 * ratio;
    this.context = canvas.getContext('2d');
    this.context?.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (this.context) {
      this.context.lineCap = 'round';
      this.context.lineJoin = 'round';
      this.context.lineWidth = 2.4;
      this.context.strokeStyle = '#0f172a';
    }
  }

  private point(event: PointerEvent): { x: number; y: number } {
    const rect = this.signatureCanvas!.nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private api(suffix: string): string {
    return `${this.global.url}admin/work-completion/accept/${this.token}${suffix}`;
  }

  private params(): HttpParams {
    const tenant = String(
      this.route.snapshot.queryParamMap.get('tenant') || this.tenantService.tenant || '',
    ).trim().toLowerCase();
    return tenant ? new HttpParams().set('tenant', tenant) : new HttpParams();
  }

  private pdf(): string {
    const url = new URL(this.data?.pdfUrl || this.api('/pdf'), window.location.origin);
    const tenant = this.params().get('tenant');
    if (tenant) url.searchParams.set('tenant', tenant);
    url.searchParams.set('documentType', 'work_completion');
    url.searchParams.set('documentToken', this.token);
    url.searchParams.set(
      'v',
      String(this.data?.pdfHashSha256 || this.data?.acceptedAt || this.data?.status || 'preview'),
    );
    return url.toString();
  }
}
