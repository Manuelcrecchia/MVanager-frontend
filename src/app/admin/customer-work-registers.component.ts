import {CommonModule} from '@angular/common';
import {Component,OnInit} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {ActivatedRoute,RouterLink} from '@angular/router';
import {GlobalService} from '../service/global.service';
@Component({selector:'app-customer-work-registers',standalone:true,imports:[CommonModule,RouterLink],
  template:`<section class="mv-page-container"><header class="mv-entity-toolbar"><h1>Registri del lavoro</h1><a routerLink="/homeAdmin/listCustomer">← Torna ai clienti</a></header><p *ngIf="loading">Caricamento…</p><p role="alert" *ngIf="error">{{error}}</p><p *ngIf="!loading&&!records.length&&!error">Nessun registro del lavoro disponibile per questo cliente.</p><article class="mv-card" *ngFor="let row of records"><h2>{{row.customerName}}</h2><p>Uscita: {{dateLabel(row.exitAt)}}</p><p>Caposquadra: {{row.employeeName}}</p><p>{{row.status==='completed'?'Compilato il '+dateLabel(row.completedAt):'Da compilare'}}</p><button type="button" *ngIf="row.hasPdf" (click)="download(row)">Scarica PDF</button></article></section>`,
  styles:[`article{padding:20px;margin:16px 0}h2{font-size:1.15rem}button{border:1px solid #8fadc7;border-radius:8px;padding:10px;background:transparent;color:inherit}`]
})
export class CustomerWorkRegistersComponent implements OnInit{
  records:any[]=[];loading=true;error='';customerId='';
  constructor(private http:HttpClient,private route:ActivatedRoute,public global:GlobalService){}
  ngOnInit(){this.customerId=this.route.snapshot.paramMap.get('numeroCliente')||'';this.http.get<any[]>(this.base(),{headers:this.global.headers}).subscribe({next:rows=>{this.records=rows;this.loading=false;},error:e=>{this.error=e.error?.error||'Impossibile caricare i registri';this.loading=false;}});}
  dateLabel(value:string){return new Date(value).toLocaleString('it-IT',{timeZone:'Europe/Rome'});}
  base(){return this.global.url+`customers/${encodeURIComponent(this.customerId)}/work-registers`;}
  download(row:any){this.http.get(this.base()+`/${row.id}/pdf`,{headers:this.global.headers,responseType:'blob'}).subscribe({next:blob=>{const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(new Date(row.completedAt))}_Registro-${row.id}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},error:()=>this.error='Impossibile scaricare il PDF'});}
}
