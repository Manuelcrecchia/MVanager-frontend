import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { downloadFile } from '../../shared/file-download';

type WorkSheetAction = 'send' | 'onsite' | 'paper';

function createWorkReference(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

@Component({ selector: 'app-customer-quality', standalone: true, imports: [CommonModule, FormsModule, RouterModule], templateUrl: './customer-quality.component.html', styleUrls: ['./customer-quality.component.css'] })
export class CustomerQualityComponent implements OnInit, OnDestroy {
  readonly realtimeResources = ['work_completion'];
  numeroCliente = '';
  kind: 'work_completion' | 'quality_control' = 'work_completion';
  data: any = null;
  categoryKey = '';
  tab: 'tasks' | 'settings' | 'history' = 'tasks';
  loading = false; busy = false; error = ''; message = '';
  historyOffset = 0; historyHasMore = false;
  showForm = false;
  workSheetAction: WorkSheetAction = 'send';
  onsiteLink = '';
  task: any = null;
  answers: Record<string, string> = {};
  note = ''; workDescription = ''; inspectedOn = this.today();
  readonly photoLimit = 20;
  readonly photoMaxMb = 10;
  photos: { file: File; url: string }[] = [];
  photoError = '';
  hasSignature = false;
  workReference = '';
  appointmentId = '';
  private openFromReport = false;
  private initialTaskId: number | null = null;
  private drawing = false;
  private context: CanvasRenderingContext2D | null = null;
  private canvas?: HTMLCanvasElement;
  @ViewChild('signatureCanvas') set signatureCanvas(element: ElementRef<HTMLCanvasElement> | undefined) {
    this.canvas = element?.nativeElement;
    if (this.canvas) { this.context = this.canvas.getContext('2d'); this.hasSignature = false; }
  }
  constructor(private http: HttpClient, private route: ActivatedRoute, public global: GlobalService, private popup: PopupServiceService) {}
  ngOnInit() { this.numeroCliente = this.route.snapshot.paramMap.get('numeroCliente') || ''; this.kind = this.route.snapshot.data['qualityKind'] || 'work_completion'; this.categoryKey = this.route.snapshot.queryParamMap.get('category') || ''; this.appointmentId=this.route.snapshot.queryParamMap.get('appointment')||''; const tab=this.route.snapshot.queryParamMap.get('tab');if(tab==='history'||tab==='settings')this.tab=tab;this.openFromReport=this.route.snapshot.queryParamMap.get('open')==='1';this.initialTaskId=Number(this.route.snapshot.queryParamMap.get('task'))||null; this.load(); }
  ngOnDestroy() { this.clearPhotos(); }
  refreshRealtimeData() { if (!this.showForm && !this.busy) this.load(); }
  get internal() { return this.kind === 'quality_control'; }
  get canManage() { return this.data?.customer?.active !== false && this.global.hasPermission(this.internal ? 'QUALITY_CONTROL_MANAGE' : 'WORK_COMPLETION_MANAGE'); }
  get category(): any { return this.data?.categories?.find((c: any) => c.key === this.categoryKey); }
  get categories(): any[] { return this.data?.categories || []; }
  get tasks(): any[] { return (this.data?.tasks || []).filter((t: any) => t.kind === this.kind && t.status !== 'completed' && (!this.categoryKey || t.categoryKey === this.categoryKey)); }
  get canOpenCustomerDocs(): boolean { return this.global.hasPermission('CUSTOMER_DOCS_VIEW'); }
  get showHistoryTab(): boolean {
    return !this.canOpenCustomerDocs || (!this.internal && (this.historyHasMore || this.history.length > 0));
  }
  get history(): any[] {
    const entries = this.internal ? this.data?.controls || [] : this.data?.proofs || [];
    return entries.filter((entry: any) =>
      !this.categoryKey || (this.internal ? entry.categoryKey : entry.context?.categoryKey) === this.categoryKey
    );
  }
  get questions(): any[] { return this.category?.qualityControl?.questions || []; }
  get plan(): any { return this.category?.plan || {}; }
  get categoryWorkMode(): string { return this.category?.defaultWorkMode || this.category?.mode || ''; }
  get workScheduleRecurring(): boolean { return (this.plan.workMode || this.categoryWorkMode) === 'recurring'; }
  get companyFrequency(): string {
    const frequency = this.internal ? this.category?.qualitySchedule : this.category?.defaultWorkInterval;
    const count = frequency?.intervalCount ??
      (this.internal ? this.category?.defaultQualityIntervalMonths : this.category?.defaultIntervalMonths);
    if (!count) return '';
    const units: Record<string, [string, string]> = {
      days: ['giorno', 'giorni'], weeks: ['settimana', 'settimane'], months: ['mese', 'mesi'], years: ['anno', 'anni'],
    };
    return `${count} ${(units[frequency?.intervalUnit] || units['months'])[count === 1 ? 0 : 1]}`;
  }
  private get intervalPrefix(): 'work' | 'quality' { return this.internal ? 'quality' : 'work'; }
  get individualIntervalCount(): number | null {
    const plan = this.plan, prefix = this.intervalPrefix;
    return plan[prefix + 'IntervalCount'] ?? plan[prefix + 'IntervalMonths'] ?? null;
  }
  get individualIntervalUnit(): string {
    return this.plan[this.intervalPrefix + 'IntervalUnit'] || 'months';
  }
  setIndividualFrequency(count: number | null, unit: string): void {
    const plan = this.plan, prefix = this.intervalPrefix;
    plan[prefix + 'IntervalMonths'] = unit === 'months' ? count : null;
    plan[prefix + 'IntervalCount'] = unit === 'months' ? null : count;
    plan[prefix + 'IntervalUnit'] = unit;
  }
  get qualityScheduleEnabled(): boolean {
    const mode = this.plan.qualityScheduleMode;
    if (mode === 'inherit') return this.category?.qualitySchedule?.enabled === true;
    return mode ? mode === 'enabled' : this.plan.qualityEnabled === true;
  }
  get workSheetCategories(): any[] { return this.categories.filter(category => category.mode !== 'disabled'); }
  get workSheetContextReady(): boolean {
    return !this.categories.length || Boolean(this.category && (
      this.category.mode === 'one_off' || (this.category.mode === 'recurring' && this.evaluationPeriod)
    ));
  }
  get workSheetTitle(): string {
    const document = this.category?.mode === 'recurring' ? 'la valutazione periodica' : 'il foglio di fine lavoro';
    return {
      send: `Invia ${document}`,
      onsite: `Compila ${document} su questo dispositivo`,
      paper: `Stampa o allega ${document}`,
    }[this.workSheetAction];
  }
  label(key: string) { return this.categories.find(c => c.key === key)?.label || key || 'Modello precedente'; }
  modeLabel(mode: string) { return ({ one_off: 'A fine lavoro', recurring: 'Valutazione periodica', disabled: 'Valutazione cliente disabilitata' } as Record<string,string>)[mode] || mode; }
  statusLabel(status: string) { return ({due:'Da fare',requested:'Richiesta inviata',completed:'Completato',pending:'In attesa',otp_verified:'Email verificata',accepted:'Firmato',cancelled:'Annullato / scaduto'} as Record<string,string>)[status] || status; }
  private api(suffix: string) { return this.global.url + 'admin/customer-quality' + suffix; }
  private today() { const p = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()); return ['year','month','day'].map(type => p.find(part=>part.type===type)?.value).join('-'); }
  load(more = false) {
    const offset = more ? this.historyOffset + 50 : 0;
    this.loading = !this.data;
    this.http.get<any>(this.api(`/customer/${encodeURIComponent(this.numeroCliente)}`), {params:new HttpParams().set("historyOffset",offset)}).subscribe({ next: data => { if (more && this.data) {data.controls = [...this.data.controls,...data.controls];data.proofs = [...this.data.proofs,...data.proofs];} this.historyOffset=offset;this.historyHasMore=this.internal?data.historyMore?.controls===true:data.historyMore?.proofs===true;this.data = data; this.loading = false; if (!this.categoryKey && data.categories?.length === 1) this.categoryKey = data.categories[0].key; if(this.openFromReport&&this.canManage){this.openFromReport=false;const task=this.initialTaskId?this.data.tasks.find((t:any)=>t.id===this.initialTaskId):null;if(task)this.start(task);else if(this.appointmentId&&!this.internal){this.start();this.selectAppointment();}} }, error: e => {this.loading = false;this.error = e?.error?.error || 'Impossibile caricare le attività';} });
  }
  categoryChanged() { this.closeForm(); this.appointmentId=''; this.message = ''; this.error = ''; }
  savePlan() {
    if (!this.category || this.busy) return;
    const count = this.individualIntervalCount;
    const interval = this.individualIntervalUnit === 'months'
      ? { intervalMonths: count }
      : { intervalCount: count, intervalUnit: this.individualIntervalUnit };
    const body = this.internal
      ? {
          ...(this.plan.qualityScheduleMode ? { mode: this.plan.qualityScheduleMode } : { enabled: this.plan.qualityEnabled }),
          ...interval,
          nextDueOn: this.plan.qualityDueDateOverride ?? this.plan.qualityNextDueOn,
        }
      : { mode: this.plan.workMode, ...interval, nextDueOn: this.plan.workDueDateOverride ?? this.plan.workNextDueOn };
    this.busy = true; this.error = '';
    this.http.put(this.api(`/plans/${encodeURIComponent(this.numeroCliente)}/${encodeURIComponent(this.categoryKey)}/${this.kind}`), body).subscribe({ next: () => {this.busy=false;this.message='Programmazione salvata. I promemoria saranno mostrati agli utenti abilitati.';this.load();},error:e=>this.failed(e) });
  }
  start(task: any = null, action: WorkSheetAction = 'send') {
    if (!this.canManage || this.busy) return;
    this.closeForm();
    if (task) this.categoryKey = task.categoryKey;
    if (this.internal && !this.category) { this.error = 'Seleziona prima una categoria'; return; }
    if (!this.internal && !task && this.category?.mode === 'disabled') this.categoryKey = '';
    this.workSheetAction = action;
    this.workReference = this.internal ? '' : createWorkReference();
    this.setWorkPeriod(task);
    this.inspectedOn = this.today(); this.answers = Object.fromEntries(this.questions.map(q => [q.key, ''])); this.note = ''; this.error = ''; this.message = ''; this.showForm = true; if(!this.internal&&!task&&this.appointmentId)this.selectAppointment();
  }
  closeForm() { this.showForm = false; this.task = null; this.periodChoice = ''; this.onsiteLink = ''; this.answers = {}; this.clearPhotos(); this.hasSignature = false; }
  selectWorkSheetCategory(key: string): void {
    this.categoryKey = key;
    this.appointmentId = '';
    this.periodChoice = '';
    this.setWorkPeriod(null);
  }
  periodChoice: '' | 'extra' | 'previous' | 'next' = '';
  get previousWorkTask(): any {
    const today = this.today();
    return this.tasks.find(task => task.dueOn <= today);
  }
  selectEvaluationPeriod(choice: typeof this.periodChoice): void {
    this.periodChoice = choice;
    this.setWorkPeriod(null);
  }
  get evaluationPeriod(): { periodStart: string; periodEnd: string; dueOn?: string } | undefined {
    const task = this.task || (this.periodChoice === 'previous' ? this.previousWorkTask : null);
    if (task) return { periodStart: task.periodStart, periodEnd: task.dueOn, dueOn: task.dueOn };
    if (this.periodChoice === 'extra') return this.category?.extraWorkPeriod;
    if (this.periodChoice === 'next') return this.category?.nextWorkPeriod;
    return undefined;
  }
  private setWorkPeriod(task: any): void {
    this.task = task;
    const period = this.internal && !task ? undefined : this.evaluationPeriod;
    this.workDescription = period ? `${period.periodStart.split('-').reverse().join('/')} – ${period.periodEnd.split('-').reverse().join('/')}` : '';
    this.error = '';
  }
  contextPayload() {
    const recurring = !this.internal && this.category?.mode === 'recurring';
    const task = this.task || (recurring && this.periodChoice === 'previous' ? this.previousWorkTask : null);
    return { numeroCliente: this.numeroCliente, categoryKey: this.categoryKey, taskId: task?.id || null,
      appointmentId: !task && !recurring && this.appointmentId ? Number(this.appointmentId) : null,
      workDescription: this.workDescription, workReference: this.workReference,
      ...(recurring && !task && this.periodChoice === 'next' ? { periodMode: 'current', plannedDueOn: this.evaluationPeriod?.dueOn } : {}),
      ...(recurring && !task && this.periodChoice === 'extra' ? { periodMode: 'extra' } : {}) };
  }
  get workAppointments(): any[] { return (this.data?.workAppointments||[]).filter((a:any)=>a.categories===this.categoryKey); }
  selectAppointment() {
    if (this.category?.mode === 'recurring') return;
    const appointment=this.workAppointments.find(a=>String(a.id)===String(this.appointmentId));
    if(appointment)this.workDescription=appointment.title||'';
  }
  async sendRequest() {
    if (!this.validateWorkSheet()) return;
    const choice = await this.popup.choose('Il cliente riceverà il link per compilare il questionario, verificare la propria email e firmare.', 'Richiedi la valutazione', { primaryLabel:'Invia email',secondaryLabel:'Condividi su WhatsApp',cancelLabel:'Annulla' });
    if (!choice) return;
    this.busy=true;this.error='';
    this.http.post<any>(this.global.url+'admin/work-completion/request', {...this.contextPayload(),deliveryChannel:choice==='primary'?'email':'manual'}).subscribe({next:result=>{this.busy=false;if(choice==='secondary')window.open(result.whatsappUrl || result.approvalUrl,'_blank','noopener');this.closeForm();this.message=choice==='primary'?'Richiesta inviata al cliente.':'Link creato e messaggio WhatsApp preparato.';this.load();},error:e=>this.failed(e)});
  }
  prepareOnsiteQuestionnaire(): void {
    if (!this.validateWorkSheet()) return;
    this.busy = true;
    this.http.post<{ approvalUrl: string }>(this.global.url + 'admin/work-completion/request', {
      ...this.contextPayload(), deliveryChannel: 'manual',
    }).subscribe({
      next: result => {
        this.busy = false;
        this.onsiteLink = result.approvalUrl;
        this.load();
      },
      error: error => this.failed(error),
    });
  }
  private validateWorkSheet(): boolean {
    if (this.internal || !this.canManage || this.busy || !this.workSheetContextReady) return false;
    this.error = this.workDescription.trim() ? '' : 'Indica il periodo o il lavoro valutato';
    return !this.error;
  }
  paperPreview() {
    if (!this.validateWorkSheet()) return;
    let params = new HttpParams();for(const [key,value] of Object.entries(this.contextPayload()))if(value!=null)params=params.set(key,String(value));
    this.busy=true;
    this.http.get(this.global.url+`admin/work-completion/paper-preview/${encodeURIComponent(this.numeroCliente)}`,{params,responseType:'blob'}).subscribe({next:blob=>{this.busy=false;void downloadFile(blob,'valutazione-cliente.pdf');},error:e=>this.failed(e)});
  }
  paperFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.validateWorkSheet()) return;
    const form=new FormData();for(const [key,value] of Object.entries(this.contextPayload()))if(value!=null)form.append(key,String(value));form.append('document',file,file.name);
    this.busy=true;
    this.http.post(this.global.url+`admin/work-completion/paper-signature/${encodeURIComponent(this.numeroCliente)}`,form).subscribe({next:()=>{this.busy=false;this.closeForm();this.message='Documento cartaceo firmato registrato.';this.load();},error:e=>this.failed(e)});
  }
  addPhotos(event: Event) {
    const input = event.target as HTMLInputElement;
    this.photoError = '';
    for (const file of Array.from(input.files || [])) {
      if (this.photos.length >= this.photoLimit) {
        this.photoError = `Puoi allegare fino a ${this.photoLimit} foto.`;
        break;
      }
      if (file.size > this.photoMaxMb * 1024 * 1024) {
        this.photoError = `Una foto supera il limite di ${this.photoMaxMb} MB.`;
        continue;
      }
      const heic = /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]$/i.test(file.type);
      this.photos.push({ file, url: heic ? '' : URL.createObjectURL(file) });
    }
    input.value = '';
  }
  removePhoto(i: number) {
    const [photo] = this.photos.splice(i, 1);
    if (photo?.url) URL.revokeObjectURL(photo.url);
    this.photoError = '';
  }
  private clearPhotos() {
    for (const photo of this.photos) if (photo.url) URL.revokeObjectURL(photo.url);
    this.photos = [];
    this.photoError = '';
  }
  pointerDown(event: PointerEvent) {
    if (!this.canvas || !this.context) return;
    this.canvas.setPointerCapture(event.pointerId);this.drawing=true;
    const point=this.point(event);this.context.beginPath();this.context.moveTo(point.x,point.y);this.context.lineWidth=2.5;this.context.lineCap='round';this.context.strokeStyle='#152e48';
  }
  pointerMove(event: PointerEvent) {if(!this.drawing||!this.context)return;const point=this.point(event);this.context.lineTo(point.x,point.y);this.context.stroke();this.hasSignature=true;}
  pointerUp() {this.drawing=false;}
  private point(event: PointerEvent) {const rect=this.canvas!.getBoundingClientRect();return {x:(event.clientX-rect.left)*this.canvas!.width/rect.width,y:(event.clientY-rect.top)*this.canvas!.height/rect.height};}
  clearSignature() {if(this.canvas&&this.context)this.context.clearRect(0,0,this.canvas.width,this.canvas.height);this.hasSignature=false;}
  saveControl() {
    if (this.busy)return;
    if(!this.hasSignature||!this.workDescription.trim()||!this.inspectedOn||this.questions.some(q=>q.required&&!this.answers[q.key]?.trim())){this.error='Completa le risposte obbligatorie, il periodo o intervento verificato, la data e la firma';return;}
    const form=new FormData();for(const [key,value]of Object.entries(this.contextPayload()))if(value!=null)form.append(key,String(value));
    form.append('answers',JSON.stringify(this.answers));form.append('note',this.note);form.append('inspectedOn',this.inspectedOn);form.append('signatureDataUrl',this.canvas!.toDataURL('image/png'));for(const photo of this.photos)form.append('photos',photo.file,photo.file.name);
    this.busy=true;this.error='';
    this.http.post<any>(this.api('/controls'),form).subscribe({next:result=>{this.busy=false;this.closeForm();this.message=`Controllo ${result.reference} registrato e PDF generato.`;this.tab=this.canOpenCustomerDocs?'tasks':'history';this.load();},error:e=>this.failed(e)});
  }
  download(record:any) {
    const url=this.internal?this.api(`/controls/${record.id}/pdf`):this.global.url+`admin/work-completion/proof/${record.id}/pdf`;
    this.http.get(url,{responseType:'blob'}).subscribe({next:blob=>void downloadFile(blob,`${record.reference||'valutazione-'+record.id}.pdf`),error:e=>this.failed(e)});
  }
  async evidence(record:any) {
    this.http.get<any>(this.global.url+`admin/work-completion/proof/${record.id}`).subscribe({next:async p=>{await this.popup.evidence([`Richiesta: ${p.id}`,`Stato: ${this.statusLabel(p.status)}`,`Destinatario: ${p.recipientEmail||'-'}`,`Firmato il: ${p.acceptedAt||'-'}`,`Impronta PDF: ${p.pdfHashSha256||'-'}`,`Impronta firma: ${p.signatureHashSha256||'-'}`,...(p.auditTrail||[]).map((e:any)=>`${e.at} · ${e.type}`)].join('\n'));},error:e=>this.failed(e)});
  }
  canCancelRequest(record: any): boolean {
    return !this.internal && this.canManage && record.sourceType === 'remote' &&
      ['pending', 'otp_verified'].includes(record.status);
  }
  async cancelRequest(record: any): Promise<void> {
    if (this.busy || !this.canCancelRequest(record)) return;
    const confirmed = await this.popup.confirm(
      'Il link verrà disattivato. Se la richiesta era collegata a una scadenza, la valutazione tornerà da fare.',
      'Annullare la richiesta?',
      { confirmLabel: 'Annulla richiesta', cancelLabel: 'Torna indietro' },
    );
    if (!confirmed || this.busy) return;
    this.busy = true;
    this.error = '';
    this.http.post(this.global.url + `admin/work-completion/proof/${record.id}/cancel`, {}).subscribe({
      next: () => {
        record.status = 'cancelled';
        this.busy = false;
        this.message = 'Richiesta annullata.';
        this.load();
      },
      error: error => this.failed(error),
    });
  }
  private failed(error:any) {this.busy=false;this.error=error?.error?.error||'Impossibile completare l’operazione';}
}
