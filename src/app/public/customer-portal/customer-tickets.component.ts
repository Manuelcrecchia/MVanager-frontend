import {CommonModule} from '@angular/common';
import {Component,Input,Output,EventEmitter,OnChanges,OnDestroy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {HttpBackend,HttpClient,HttpHeaders} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {operationId} from '../../offline/offline-codec';
import {downloadFile} from '../../shared/file-download';

@Component({selector:'app-customer-tickets',standalone:true,imports:[CommonModule,FormsModule],
  template:`<p *ngIf="error" class="alert alert-danger" role="alert">{{error}}</p><p *ngIf="notice" class="alert alert-success" role="status">{{notice}}</p>
    <div class="ticket-toolbar"><button class="btn btn-outline-secondary" type="button" (click)="refresh()" [disabled]="busy||loading">Aggiorna ticket</button>
      <button *ngIf="!admin&&!creating" class="btn btn-primary" type="button" (click)="newTicket()" [disabled]="busy">Apri nuovo ticket</button>
      <label>Stato <select class="form-select" [(ngModel)]="status" (ngModelChange)="load()"><option value="">Tutti</option><option value="sent">Inviato</option><option value="working">In lavorazione</option><option value="closed">Chiuso</option></select></label></div>
    <p *ngIf="loading" role="status">Caricamento ticket…</p>
    <form *ngIf="creating" (ngSubmit)="create()" class="ticket-card">
      <h2>Nuovo ticket</h2><label>Oggetto / motivo della richiesta<input class="form-control" name="subject" [(ngModel)]="subject" required maxlength="200" [disabled]="busy"></label>
      <label>Descrizione<textarea class="form-control" name="body" [(ngModel)]="body" rows="5" maxlength="20000" [disabled]="busy"></textarea></label>
      <ng-container *ngTemplateOutlet="uploadField"></ng-container><button class="btn btn-primary" type="submit" [disabled]="busy||!subject.trim()">{{busy?'Invio…':'Invia ticket'}}</button>
      <button class="btn btn-outline-secondary" type="button" (click)="creating=false" [disabled]="busy">Annulla</button>
    </form>
    <div *ngIf="!creating" class="ticket-layout">
      <section aria-label="Elenco ticket" class="ticket-list"><p *ngIf="!loading&&!tickets.length">Nessun ticket presente.</p>
        <button type="button" *ngFor="let item of tickets" class="ticket-list-item" [class.selected]="detail?.id===item.id" (click)="open(item.id)" [disabled]="busy">
          <span><strong>{{item.code}} · {{item.subject}}</strong><span *ngIf="admin?item.unreadAdmin:item.unreadCustomer" class="badge bg-danger">Nuovo</span></span>
          <small>{{label(item.status)}} · {{item.updatedAt|date:'dd/MM/yyyy HH:mm'}}<span *ngIf="admin"> · Cliente {{item.numeroCliente}}</span></small>
        </button>
        <button *ngIf="hasMore" class="btn btn-outline-secondary" type="button" (click)="load(true)" [disabled]="loading||busy">Carica altri ticket</button>
      </section>
      <section *ngIf="detail" class="ticket-card" aria-label="Dettaglio ticket">
        <h2>{{detail.code}} · {{detail.subject}}</h2><p><strong>{{label(detail.status)}}</strong></p>
        <article *ngFor="let message of detail.messages" class="ticket-message" [class.internal]="message.internal">
          <strong>{{message.internal?'Nota interna':message.authorRole==='customer'?'Cliente':'Assistenza'}}</strong> <small>{{message.createdAt|date:'dd/MM/yyyy HH:mm'}}</small>
          <p class="message-body">{{message.body}}</p>
          <button *ngFor="let file of message.attachments" class="btn btn-outline-secondary attachment" type="button" (click)="download(file)" [disabled]="busy">Scarica {{file.filename}}</button>
        </article>
        <form *ngIf="detail.status!=='closed'&&(!admin||canReply||canManage)" (ngSubmit)="send('reply')">
          <label>Messaggio<textarea class="form-control" name="reply" [(ngModel)]="reply" rows="4" maxlength="20000" [disabled]="busy"></textarea></label>
          <ng-container *ngTemplateOutlet="uploadField"></ng-container>
          <div class="ticket-toolbar"><button *ngIf="!admin||canReply" class="btn btn-primary" type="submit" [disabled]="busy||!reply.trim()">Invia risposta</button>
            <button *ngIf="admin&&canManage" class="btn btn-outline-secondary" type="button" (click)="send('note')" [disabled]="busy||!reply.trim()">Salva nota interna</button>
            <button *ngIf="admin&&canManage" class="btn btn-outline-secondary" type="button" (click)="send('close')" [disabled]="busy||!!reply.trim()||attachments.length>0">Chiudi ticket</button>
            <button *ngIf="admin&&canReply&&canManage" class="btn btn-primary" type="button" (click)="send('reply-close')" [disabled]="busy||!reply.trim()">Rispondi e chiudi</button></div>
          <p *ngIf="admin&&canManage" class="ticket-help">Le note interne sono visibili solo agli admin autorizzati. Per chiudere senza inviare una risposta, lascia vuoto il messaggio.</p>
        </form>
        <p *ngIf="detail.status==='closed'&&!admin">Il ticket è chiuso. Per una nuova richiesta apri un nuovo ticket.</p>
        <button *ngIf="admin&&canManage&&detail.status==='closed'" class="btn btn-outline-secondary" type="button" (click)="send('reopen')" [disabled]="busy">Riapri ticket</button>
      </section>
    </div>
    <ng-template #uploadField><label>Allegati (facoltativi)<input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx,.zip" (change)="chooseFiles($event)" [disabled]="busy"></label>
      <small class="ticket-help">Massimo 5 file, 10 MB per file e 25 MB complessivi. PDF, immagini, TXT, CSV, DOCX, XLSX o ZIP.</small></ng-template>`,
  styles:[`:host{display:block;min-width:0}.ticket-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:16px 0}.ticket-toolbar label{display:flex;align-items:center;gap:8px;margin:0}.ticket-layout{display:grid;grid-template-columns:minmax(220px,1fr) minmax(0,2fr);gap:18px}.ticket-list-item{display:block;width:100%;text-align:left;padding:16px;margin:0 0 10px;border:1px solid #cad8e7;border-radius:12px;background:#fff;color:#25354a;overflow-wrap:anywhere}.ticket-list-item.selected{border-color:#2871b5;background:#edf5ff}.ticket-list-item small{display:block;margin-top:8px}.ticket-list-item .badge{margin-left:10px}.ticket-card{background:#fff;border:1px solid #d2deea;border-radius:16px;padding:20px;min-width:0}.ticket-card h2{font-size:1.2rem;overflow-wrap:anywhere}.ticket-card label{display:block;margin:14px 0}.ticket-card input:not([type=file]),.ticket-card textarea{display:block;width:100%;box-sizing:border-box;margin-top:8px}.ticket-card button{margin-right:8px;margin-top:8px}.ticket-message{padding:14px;background:#f1f6fb;border-radius:12px;margin:14px 0}.ticket-message.internal{background:#fff5d9;border:1px solid #e1c879}.message-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}.ticket-help{display:block;margin:8px 0;color:#52647a;font-size:.85rem}.attachment{overflow-wrap:anywhere;max-width:100%}@media(max-width:900px){.ticket-layout{grid-template-columns:1fr}}`]
})
export class CustomerTicketsComponent implements OnChanges,OnDestroy {
  @Input() api='';@Input() tenant='';@Input() token='';@Input() admin=false;@Input() customerId='';@Input() initialTicket='';@Input() canReply=false;@Input() canManage=false;
  @Output() sessionExpired=new EventEmitter<void>();@Output() changed=new EventEmitter<void>();
  tickets:any[]=[];detail:any=null;status='';subject='';body='';reply='';attachments:File[]=[];
  loading=false;busy=false;creating=false;error='';notice='';hasMore=false;private generation=0;private openGeneration=0;private requestId=operationId();private http:HttpClient;
  constructor(backend:HttpBackend){this.http=new HttpClient(backend);}
  private options(){return{headers:new HttpHeaders({'X-Tenant-Id':this.tenant,Authorization:'Bearer '+this.token})};}
  ngOnChanges(){this.openGeneration++;this.detail=null;this.creating=false;this.attachments=[];void this.load().then(()=>{if(this.initialTicket)void this.open(Number(this.initialTicket));});}
  ngOnDestroy(){this.generation++;this.openGeneration++;}
  async refresh(){if(this.busy||this.loading)return;this.notice='';const current=this.detail?.id;await this.load();if(current&&!this.reply.trim()&&!this.attachments.length)await this.open(current);}
  label(status:string){return({sent:'Inviato',working:'In lavorazione',closed:'Chiuso'} as any)[status]||status;}
  async load(more=false){const offset=more?this.tickets.length:0;const generation=++this.generation;this.loading=true;this.error='';try{const rows=await firstValueFrom(this.http.get<any[]>(this.api+'tickets',{...this.options(),params:{...(offset?{offset:String(offset)}:{}),...(this.admin&&this.customerId?{customerId:this.customerId}:{}),...(this.status?{status:this.status}:{})}}));if(generation===this.generation){this.hasMore=rows.length===200;this.tickets=more?[...this.tickets,...rows.filter(row=>!this.tickets.some(old=>old.id===row.id))]:rows;}}catch(e:any){this.showError(e);}finally{if(generation===this.generation)this.loading=false;}}
  newTicket(){this.creating=true;this.detail=null;this.subject='';this.body='';this.attachments=[];this.error='';this.notice='';this.requestId=operationId();}
  chooseFiles(event:Event){const input=event.target as HTMLInputElement,files=Array.from(input.files||[]);if(files.length>5||files.some(f=>f.size>10*1024*1024)||files.reduce((sum,file)=>sum+file.size,0)>25*1024*1024){this.error='Allega al massimo 5 file: 10 MB ciascuno e 25 MB complessivi.';input.value='';this.attachments=[];return;}this.error='';this.attachments=files;}
  private form(values:Record<string,string>){const form=new FormData();for(const [key,value]of Object.entries(values))form.append(key,value);for(const file of this.attachments)form.append('attachments',file);return form;}
  async create(){if(this.busy||!this.subject.trim())return;this.busy=true;this.error='';try{const result=await firstValueFrom(this.http.post<any>(this.api+'tickets',this.form({subject:this.subject,body:this.body,requestId:this.requestId}),this.options()));this.creating=false;this.attachments=[];this.notice='Ticket '+result.code+' inviato.';await this.load();await this.open(result.id);}catch(e:any){this.showError(e);}finally{this.busy=false;}}
  async open(id:number){if(!Number.isInteger(id)||id<1)return;const generation=++this.openGeneration;this.error='';try{const detail=await firstValueFrom(this.admin?this.http.post<any>(this.api+'tickets/'+id+'/open',{},this.options()):this.http.get<any>(this.api+'tickets/'+id,this.options()));if(generation!==this.openGeneration)return;this.detail=detail;this.reply='';this.attachments=[];this.requestId=operationId();this.changed.emit();await this.load();}catch(e:any){this.showError(e);}}
  async send(action:string){if(this.busy||!this.detail)return;this.busy=true;this.error='';try{await firstValueFrom(this.http.post(this.api+'tickets/'+this.detail.id+'/messages',this.form({action,body:this.reply,version:String(this.detail.version),requestId:this.requestId}),this.options()));this.notice=action==='note'?'Nota interna salvata.':action==='close'||action==='reply-close'?'Ticket chiuso.':action==='reopen'?'Ticket riaperto.':'Risposta inviata.';await this.open(this.detail.id);}catch(e:any){this.showError(e);}finally{this.busy=false;}}
  async download(file:any){if(this.busy)return;this.busy=true;try{const blob=await firstValueFrom(this.http.get(this.api+'tickets/'+this.detail.id+'/attachments/'+file.id,{...this.options(),responseType:'blob'}));await downloadFile(blob,file.filename,message=>this.error=message);}catch(e:any){this.showError(e);}finally{this.busy=false;}}
  private showError(e:any){if(e.status===401){this.sessionExpired.emit();return;}this.error=e.error?.error||'Operazione non riuscita. Riprova.';}
}
