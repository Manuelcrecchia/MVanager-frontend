import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Router } from '@angular/router';
import { GlobalService } from '../../service/global.service';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { downloadFile } from '../../shared/file-download';

@Component({ selector:'app-work-completion-stats',templateUrl:'./work-completion-stats.component.html',styleUrls:['./work-completion-stats.component.css'] })
export class WorkCompletionStatsComponent implements OnInit {
  readonly realtimeResources=['work_completion','appointments','shifts'];
  access={feedback:false,quality:false}; ready=false; loading=false; error='';
  kind:'feedback'|'quality'='feedback'; mode='all'; status='all'; dateBasis='period'; from='';to='';numeroCliente='';categoryKey='';search='';page=0;
  stats:any=null; selected:any=null; private request=0;
  constructor(private http:HttpClient,private router:Router,public global:GlobalService,private popup:PopupServiceService){}
  ngOnInit(){this.setDefaultRange();this.http.get<any>(this.global.url+'admin/quality-reporting/access').subscribe({next:access=>{this.access=access;this.ready=true;this.kind=access.feedback?'feedback':'quality';if(access.feedback||access.quality)this.loadStats();},error:e=>{this.ready=true;this.error=e?.error?.error||'Impossibile verificare i permessi';}});}
  refreshRealtimeData(){if(this.ready&&(this.access.feedback||this.access.quality))this.loadStats(true,false);}
  back(){this.router.navigateByUrl('/homeAdmin');}
  setDefaultRange(){const now=new Date(),start=new Date(now);start.setMonth(start.getMonth()-3);this.from=this.dateInput(start);this.to=this.dateInput(now);}
  private dateInput(date:Date){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
  loadStats(silent=false,resetPage=true){
    if(!this.ready||!this.access[this.kind])return;
    if(resetPage)this.page=0;
    const version=++this.request;
    if(!silent)this.loading=true;this.error='';this.selected=null;
    let params=new HttpParams();for(const [key,value]of Object.entries({kind:this.kind,from:this.from,to:this.to,mode:this.kind==='quality'?'all':this.mode,status:this.status,dateBasis:this.dateBasis,numeroCliente:this.numeroCliente.trim(),categoryKey:this.categoryKey,search:this.search,page:this.page}))if(value!==''&&value!=null)params=params.set(key,String(value));
    this.http.get<any>(this.global.url+'admin/quality-reporting/dashboard',{params}).subscribe({next:data=>{if(version!==this.request)return;this.stats=data;this.loading=false;},error:e=>{if(version!==this.request)return;this.loading=false;this.error=e?.error?.error||'Impossibile caricare le statistiche';}});
  }
  switchKind(kind:'feedback'|'quality'){if(!this.access[kind])return;this.kind=kind;this.mode='all';this.status='all';this.loadStats();}
  switchMode(mode:string){this.mode=mode;this.loadStats();}
  filterStatus(status:string){this.status=this.status===status?'all':status;this.loadStats();}
  resetFilters(){this.numeroCliente='';this.categoryKey='';this.search='';this.mode='all';this.status='all';this.dateBasis='period';this.setDefaultRange();this.loadStats();}
  changePage(delta:number){this.page+=delta;this.loadStats(false,false);}
  label(key:string){return this.stats?.categories?.find((c:any)=>c.key===key)?.label||key||'Categoria non registrata';}
  modeLabel(mode:string){return ({recurring:'Ordinaria',one_off:'Straordinaria',unclassified:'Da classificare',internal:'Controllo interno'} as Record<string,string>)[mode]||mode;}
  statusLabel(status:string){return ({completed:'Compilata',to_request:'Da richiedere',to_complete:'Da eseguire',pending:'In attesa del cliente',expired:'Richiesta scaduta',not_sent:'Invio non riuscito',scheduled:'Programmata',to_link:'Documento da collegare'} as Record<string,string>)[status]||status;}
  outcomeLabel(outcome:string){return ({conforming:'Conforme',issues:'Con criticità',partial:'Parzialmente conforme',not_applicable:'Non applicabile',not_classified:'Esito non classificato'} as Record<string,string>)[outcome]||outcome;}
  dateFormat(value:any){return /^\d{4}-\d{2}-\d{2}$/.test(String(value))?'dd/MM/yyyy':'dd/MM/yyyy HH:mm';}
  answerLabel(question:any,row:any){const answer=row.answers?.[question.key];return question.options?.find((o:any)=>o.value===answer)?.label||answer||'Non compilata';}
  canOpen(){return this.global.hasPermission(this.kind==='quality'?'QUALITY_CONTROL_VIEW':'WORK_COMPLETION_VIEW');}
  showDetails(row:any){this.selected=this.selected?.id===row.id?null:row;if(this.selected)requestAnimationFrame(()=>document.querySelector('app-work-completion-stats .detail')?.scrollIntoView({behavior:'smooth',block:'start'}));}
  openRow(row:any){if(!this.canOpen())return;this.router.navigate(['/homeAdmin/listCustomer',row.numeroCliente,this.kind==='quality'?'quality-control':'work-completion'],{queryParams:{category:row.categoryKey||null,appointment:row.appointmentId||null,task:row.taskId||null,tab:row.status==='completed'?'history':'tasks',open:row.status==='completed'?null:'1'}});}
  download(row:any){if(!this.canOpen())return;const path=this.kind==='quality'?`admin/customer-quality/controls/${row.recordId}/pdf`:`admin/work-completion/proof/${row.proofId}/pdf`;this.http.get(this.global.url+path,{responseType:'blob'}).subscribe({next:blob=>void downloadFile(blob,`${row.reference||'valutazione-'+row.proofId}.pdf`),error:e=>this.popup.showHttpError(e,'Impossibile scaricare il documento')});}
  get pageCount(){return Math.max(1,Math.ceil((this.stats?.totalFiltered||0)/(this.stats?.pageSize||25)));}
}
