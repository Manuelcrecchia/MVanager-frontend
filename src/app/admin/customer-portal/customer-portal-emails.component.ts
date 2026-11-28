import {CommonModule} from '@angular/common';
import {Component,OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {HttpClient} from '@angular/common/http';
import {Router} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {GlobalService} from '../../service/global.service';
@Component({selector:'app-customer-portal-emails',standalone:true,imports:[CommonModule,FormsModule],template:`<div class="mv-page"><header class="mv-entity-toolbar"><div class="mv-entity-toolbar__title"><h1>Avvisi email area clienti</h1></div><button class="mv-toolbar-back" type="button" (click)="back()">← Torna indietro</button></header><section class="mv-card" style="padding:24px;margin-top:20px">
  <p>Gli avvisi usano il mittente aziendale predefinito. In Impostazioni invio email → Email avvisi area clienti puoi scegliere un mittente dedicato.</p><p>I contenuti restano nel portale: le email contengono un avviso e il collegamento per accedere. La verifica dei nuovi documenti autorizzati e gli invii vengono eseguiti ogni minuto; i documenti già presenti alla prima attivazione non generano avvisi retroattivi.</p>
  <p *ngIf="error" class="alert alert-danger" role="alert">{{error}}</p><p *ngIf="notice" class="alert alert-success" role="status">{{notice}}</p>
  <label>Stato <select class="form-select" [(ngModel)]="status" (ngModelChange)="load()"><option value="">Tutti</option><option value="pending">In coda</option><option value="sent">Inviato</option><option value="failed">Non riuscito</option><option value="skipped">Non inviato</option></select></label><button class="btn btn-outline-secondary" type="button" (click)="load()" [disabled]="busy">Aggiorna elenco</button>
  <p *ngIf="!rows.length">Nessun avviso presente.</p><article *ngFor="let row of rows" style="border-bottom:1px solid #d3dfeb;padding:16px 0"><strong>{{typeLabel(row.type)}} · Cliente {{global.customerNumber(row.numeroCliente)}}</strong><p>{{statusLabel(row.status)}} · {{row.createdAt|date:'dd/MM/yyyy HH:mm'}} · Tentativi: {{row.attempts}}</p><p *ngIf="row.lastError">{{row.lastError}}</p><button *ngIf="row.status==='failed'||row.status==='pending'" class="btn btn-outline-secondary" type="button" (click)="retry(row.id)" [disabled]="busy">Riprova invio</button></article></section></div>`})
export class CustomerPortalEmailsComponent implements OnInit {
  readonly realtimeResources=['customer_portal_emails'];refreshRealtimeData(){if(!this.busy)void this.load();}
  rows:any[]=[];status='';busy=false;error='';notice='';constructor(private http:HttpClient,public global:GlobalService,private router:Router){}
  private get api(){return this.global.url+'admin/customer-portal/emails';}ngOnInit(){void this.load();}back(){this.router.navigateByUrl('/homeAdmin');}
  statusLabel(v:string){return({pending:'In coda',sending:'Invio in corso',sent:'Inviato',failed:'Non riuscito',skipped:'Non inviato'} as any)[v]||v;}
  typeLabel(v:string){return({document:'Nuovo documento',communication:'Nuova comunicazione','ticket-reply':'Risposta al ticket','ticket-closed':'Chiusura ticket'} as any)[v]||v;}
  async load(){this.error='';try{this.rows=await firstValueFrom(this.http.get<any[]>(this.api,{headers:this.global.headers,params:this.status?{status:this.status}:{}}));}catch(e:any){this.error=e.error?.error||'Impossibile caricare gli invii.';}}
  async retry(id:number){if(this.busy)return;this.busy=true;this.error='';try{await firstValueFrom(this.http.post(this.api+'/'+id+'/retry',{}, {headers:this.global.headers}));this.notice='Nuovo tentativo inserito in coda.';await this.load();}catch(e:any){this.error=e.error?.error||'Impossibile riprogrammare l’invio.';}finally{this.busy=false;}}
}
