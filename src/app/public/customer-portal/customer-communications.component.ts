import {CommonModule} from '@angular/common';
import {Component,Input,Output,EventEmitter,OnChanges,OnDestroy} from '@angular/core';
import {HttpBackend,HttpClient,HttpHeaders} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
@Component({selector:'app-customer-communications',standalone:true,imports:[CommonModule],template:`
  <p *ngIf="error" class="alert alert-danger" role="alert">{{error}}</p><button class="btn btn-outline-secondary" type="button" (click)="load()" [disabled]="loading">Aggiorna comunicazioni</button>
  <p *ngIf="loading" role="status">Caricamento…</p><p *ngIf="!loading&&!rows.length">Nessuna comunicazione presente.</p>
  <article *ngFor="let row of rows" class="communication"><button type="button" (click)="open(row)" [attr.aria-expanded]="selected===row.id"><strong>{{row.subject}}</strong> <span *ngIf="!row.readAt" class="badge bg-danger">Nuova</span><small>{{row.createdAt|date:'dd/MM/yyyy HH:mm'}}</small></button><p *ngIf="selected===row.id">{{row.body}}</p></article><button *ngIf="hasMore" class="btn btn-outline-secondary" type="button" (click)="load(true)" [disabled]="loading">Carica altre comunicazioni</button>`,styles:[`:host{display:block}.communication{margin-top:14px;padding:16px;background:#fff;border:1px solid #d0deeb;border-radius:14px}.communication button{display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit}.communication small{display:block;margin-top:6px}.communication p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;margin:18px 0 0}.communication strong{overflow-wrap:anywhere}.badge{margin-left:8px}`]})
export class CustomerCommunicationsComponent implements OnChanges,OnDestroy {
  @Input() api='';@Input() tenant='';@Input() token='';@Output() sessionExpired=new EventEmitter<void>();@Output() changed=new EventEmitter<void>();
  hasMore=false;rows:any[]=[];selected:number|null=null;loading=false;error='';private http:HttpClient;private generation=0;
  constructor(backend:HttpBackend){this.http=new HttpClient(backend);}
  private options(){return{headers:new HttpHeaders({'X-Tenant-Id':this.tenant,Authorization:'Bearer '+this.token})};}
  ngOnChanges(){this.selected=null;void this.load();}
  ngOnDestroy(){this.generation++;}
  async load(more=false){const offset=more?this.rows.length:0;const generation=++this.generation;this.loading=true;this.error='';try{const rows=await firstValueFrom(this.http.get<any[]>(this.api+'communications',{...this.options(),params:offset?{offset:String(offset)}:{}}));if(generation===this.generation){this.hasMore=rows.length===200;this.rows=more?[...this.rows,...rows]:rows;}}catch(e:any){this.showError(e);}finally{if(generation===this.generation)this.loading=false;}}
  async open(row:any){this.selected=row.id;if(row.readAt)return;try{await firstValueFrom(this.http.post(this.api+'communications/'+row.id+'/read',{},this.options()));row.readAt=new Date().toISOString();this.changed.emit();}catch(e:any){this.showError(e);}}
  private showError(e:any){if(e.status===401)this.sessionExpired.emit();else this.error=e.error?.error||'Impossibile caricare la comunicazione.';}
}
