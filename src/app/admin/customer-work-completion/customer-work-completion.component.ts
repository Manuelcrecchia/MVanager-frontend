import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';

@Component({
  selector: 'app-customer-work-completion',
  templateUrl: './customer-work-completion.component.html',
  styleUrls: ['./customer-work-completion.component.css'],
})
export class CustomerWorkCompletionComponent implements OnInit, AfterViewInit {
  @ViewChild('signatureCanvas') signatureCanvas?: ElementRef<HTMLCanvasElement>;

  numeroCliente = '';
  customer: any = null;
  displayName = '';
  address = '';
  phone = '';
  config: any = {};
  answers: Record<string, string> = {};
  note = '';
  currentStep = 1;
  loading = true;
  saving = false;
  success = false;
  error = '';
  signatureEmpty = true;
  private context: CanvasRenderingContext2D | null = null;
  private drawing = false;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    public global: GlobalService,
    private popup: PopupServiceService,
  ) {}

  get questions(): any[] {
    return Array.isArray(this.config?.questions) ? this.config.questions : [];
  }

  get signatureRequired(): boolean {
    return this.config?.signatureRequired !== false;
  }

  get signatureStep(): number {
    return this.questions.length ? 3 : 2;
  }

  get totalSteps(): number {
    return this.signatureStep + 1;
  }

  get canSubmit(): boolean {
    return !this.saving &&
      (!this.signatureRequired || !this.signatureEmpty) &&
      this.questions.every((question) => question.required === false || !!this.answers[question.key]);
  }

  get canAdvance(): boolean {
    if (this.currentStep === 2 && this.questions.length) {
      return this.questions.every(
        (question) => question.required === false || !!this.answers[question.key],
      );
    }
    return true;
  }

  ngOnInit(): void {
    this.numeroCliente = String(this.route.snapshot.paramMap.get('numeroCliente') || '').trim();
    if (!this.numeroCliente) {
      this.error = 'Cliente non valido.';
      this.loading = false;
      return;
    }
    this.load();
  }

  ngAfterViewInit(): void {
    window.setTimeout(() => this.initializeCanvas(), 0);
  }

  load(): void {
    this.loading = true;
    this.http.get<any>(
      this.global.url + `admin/work-completion/customer/${encodeURIComponent(this.numeroCliente)}`,
    ).subscribe({
      next: (result) => {
        this.customer = result?.customer || null;
        this.displayName = result?.displayName || this.numeroCliente;
        this.address = result?.address || '';
        this.phone = result?.phone || '';
        this.config = result?.config || this.global.getWorkCompletionConfig();
        this.loading = false;
        window.setTimeout(() => this.initializeCanvas(), 0);
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.error || 'Impossibile caricare il foglio fine lavoro.';
        this.popup.showError(this.error);
      },
    });
  }

  back(): void {
    this.router.navigateByUrl('/homeAdmin/listCustomer');
  }

  startDrawing(event: PointerEvent): void {
    if (!this.context || !this.signatureCanvas) return;
    event.preventDefault();
    this.drawing = true;
    this.signatureCanvas.nativeElement.setPointerCapture?.(event.pointerId);
    const point = this.canvasPoint(event);
    this.context.beginPath();
    this.context.moveTo(point.x, point.y);
  }

  draw(event: PointerEvent): void {
    if (!this.drawing || !this.context) return;
    event.preventDefault();
    const point = this.canvasPoint(event);
    this.context.lineTo(point.x, point.y);
    this.context.stroke();
    this.signatureEmpty = false;
  }

  stopDrawing(event?: PointerEvent): void {
    if (event) event.preventDefault();
    this.drawing = false;
    this.context?.closePath();
  }

  clearSignature(): void {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas || !this.context) return;
    this.context.clearRect(0, 0, canvas.width, canvas.height);
    this.signatureEmpty = true;
  }

  nextStep(): void {
    if (this.currentStep === 1) {
      this.currentStep = 2;
      if (this.currentStep === this.signatureStep) {
        window.setTimeout(() => this.initializeCanvas(), 100);
      }
      return;
    }
    if (this.currentStep === 2 && this.questions.length) {
      if (!this.canAdvance) {
        this.error = 'Tutti i campi di valutazione sono obbligatori.';
        return;
      }
      this.error = '';
      this.currentStep = this.signatureStep;
      window.setTimeout(() => this.initializeCanvas(), 100);
      return;
    }
    if (this.currentStep === this.signatureStep) {
      if (!this.canSubmit) {
        this.error = this.signatureRequired && this.signatureEmpty
          ? 'Devi firmare il documento.'
          : 'Completa tutti i campi obbligatori.';
        return;
      }
      this.submit();
    }
  }

  previousStep(): void {
    if (this.currentStep <= 1) return;
    this.currentStep -= 1;
    this.error = '';
  }

  stepNumbers(): number[] {
    return Array.from({ length: this.totalSteps }, (_item, index) => index + 1);
  }

  submit(): void {
    if (!this.canSubmit || !this.signatureCanvas) return;
    this.saving = true;
    this.error = '';
    const firmaBase64 = this.signatureEmpty ? '' : this.signatureCanvas.nativeElement.toDataURL('image/png');
    this.http.post<any>(this.global.url + 'admin/work-completion/submit', {
      numeroCliente: this.numeroCliente,
      answers: this.answers,
      note: this.note,
      firmaBase64,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.success = true;
        this.currentStep = this.totalSteps;
      },
      error: (err) => {
        this.saving = false;
        this.error = err?.error?.error || 'Impossibile salvare il foglio fine lavoro.';
        this.popup.showError(this.error);
      },
    });
  }

  optionId(question: any, option: any): string {
    return `work_${question.key}_${option.value}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private initializeCanvas(): void {
    const canvas = this.signatureCanvas?.nativeElement;
    if (!canvas) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.context = canvas.getContext('2d');
    if (!this.context) return;
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.context.lineWidth = 2;
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
    this.context.strokeStyle = '#10223d';
    this.signatureEmpty = true;
  }

  private canvasPoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.signatureCanvas!.nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}
