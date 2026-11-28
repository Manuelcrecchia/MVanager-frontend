import {Component,Input} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {HttpClient,HttpParams} from '@angular/common/http';
import {GlobalService} from '../../service/global.service';
import {downloadFile} from '../../shared/file-download';

@Component({selector:'app-shift-export',standalone:true,imports:[CommonModule,FormsModule],template:`
  <button type="button" class="export-toggle" (click)="toggle()" [attr.aria-expanded]="open">Esporta turni in PDF</button>
  <section *ngIf="open" class="export-panel" aria-label="Esportazione dei turni programmati">
    <div class="heading"><div><h2>Esporta i turni programmati</h2><p>Scegli il periodo e i dati da includere nel documento.</p></div><button type="button" (click)="open=false">Chiudi</button></div>
    <div class="presets"><button type="button" (click)="preset('day')">Giorno selezionato</button><button type="button" (click)="preset('week')">Settimana</button><button type="button" (click)="preset('month')">Mese</button></div>
    <div class="fields"><label>Dal<input type="date" [(ngModel)]="from" /></label><label>Al<input type="date" [(ngModel)]="to" /></label><label>Codice cliente<input [(ngModel)]="numeroCliente" placeholder="Tutti i clienti" /></label><label>Categoria<select [(ngModel)]="categoryKey"><option value="">Tutte le categorie</option><option *ngFor="let c of global.getAppointmentCategoryDetails()" [value]="c.key">{{c.label || c.key}}</option></select></label></div>
    <p class="explanation">Il PDF riporta clienti, personale assegnato, ruolo, orari e durate programmate e data di esportazione.</p>
    <p *ngIf="error" role="alert" class="error">{{error}}</p><p *ngIf="message" role="status" class="success">{{message}}</p>
    <button type="button" class="primary" (click)="download()" [disabled]="busy">{{busy?'Preparazione del documento…':'Scarica PDF'}}</button>
  </section>`,styles:[`:host{display:block;margin-top:15px}button{padding:10px 14px;border:1px solid #c8d4e2;border-radius:8px;background:var(--mv-surface,#fff);color:var(--mv-text,#17324e);font:inherit;font-size:14px;cursor:pointer}button:disabled{opacity:.5}.export-toggle{background:#fff;color:#244b74}.export-panel{padding:22px;margin-top:14px;background:var(--mv-surface,#fff);color:var(--mv-text,#17324e);border:1px solid var(--mv-border,#d7e0eb);border-radius:14px}.heading{display:flex;justify-content:space-between;gap:20px;align-items:start}h2{font-size:19px;margin:0 0 8px}.heading p,.explanation{font-size:13px;color:var(--mv-text-muted,#66768b);line-height:1.6}.presets{display:flex;flex-wrap:wrap;gap:8px;margin:17px 0}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:15px}label{display:grid;gap:7px;font-size:13px;font-weight:600}input,select{padding:10px;border:1px solid var(--mv-border,#c8d4e2);border-radius:8px;min-width:0;max-width:100%;font:inherit;background:var(--mv-surface,#fff);color:var(--mv-text,#17324e)}.explanation{margin:18px 0}.primary{background:#235f99;color:#fff;border-color:#235f99}.error{color:#a62b2b}.success{color:#23653b}@media(max-width:600px){.export-panel{padding:16px}.fields{grid-template-columns:1fr 1fr}.fields label:nth-child(n+3){grid-column:1/-1}.export-toggle{width:100%}}`]})
export class ShiftExportComponent{
  @Input() date=new Date();open=false;from='';to='';numeroCliente='';categoryKey='';busy=false;error='';message='';
  constructor(private http:HttpClient,public global:GlobalService){}
  toggle(){this.open=!this.open;if(this.open&&!this.from)this.preset('day');}
  private dateInput(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  preset(kind:'day'|'week'|'month'){
    const start=new Date(this.date),end=new Date(this.date);
    if(kind==='week'){const offset=(start.getDay()+6)%7;start.setDate(start.getDate()-offset);end.setTime(start.getTime());end.setDate(end.getDate()+6);}
    if(kind==='month'){start.setDate(1);end.setMonth(end.getMonth()+1,0);}
    this.from=this.dateInput(start);this.to=this.dateInput(end);this.error='';this.message='';
  }
  download(){
    if(this.busy||!this.global.hasPermission('SHIFTS_EXPORT'))return;
    if(!this.from||!this.to||this.from>this.to){this.error='Seleziona un intervallo di date valido';return;}
    let params=new HttpParams();for(const [key,value]of Object.entries({from:this.from,to:this.to,numeroCliente:this.numeroCliente.trim(),categoryKey:this.categoryKey}))if(value)params=params.set(key,value);
    this.busy=true;this.error='';this.message='';
    this.http.get(this.global.url+'shifts/export/pdf',{params,responseType:'blob'}).subscribe({next:async blob=>{this.busy=false;await downloadFile(blob,`turni-programmati-${this.from}-${this.to}.pdf`);this.message='PDF dei turni preparato.';},error:async e=>{this.busy=false;if(e?.error instanceof Blob){try{this.error=JSON.parse(await e.error.text()).error;return;}catch{}}this.error=e?.error?.error||'Impossibile esportare i turni';}});
  }
}
