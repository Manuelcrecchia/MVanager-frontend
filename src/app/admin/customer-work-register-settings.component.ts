import {CommonModule} from '@angular/common';
import {Component, Input, Output, EventEmitter, OnChanges, DoCheck} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {GlobalService} from '../service/global.service';
import {RegisterForm, RegisterQuestion, WorkRegisterEditorComponent} from '../shared/work-register/work-register-editor.component';
@Component({selector:'app-customer-work-register-settings',standalone:true,imports:[CommonModule,WorkRegisterEditorComponent],
  template:`<section class="mv-card register-settings"><h2>Registro del lavoro</h2>
    <p>Questionario compilato dal caposquadra dopo la timbratura di uscita.</p>
    <p *ngIf="loading">Caricamento del questionario…</p><p *ngIf="error" role="alert">{{error}} <button type="button" (click)="load()">Riprova</button></p>
    <ng-container *ngIf="!loading&&!error">
      <label class="register-toggle"><input type="checkbox" [checked]="enabled" (change)="setEnabled($any($event.target).checked)"> Abilita registro del lavoro per questo cliente</label>
      <p *ngIf="!enabled">Registro disabilitato: nessuna nuova richiesta di compilazione. Le richieste in attesa sono sospese; domande impostate e PDF già salvati restano conservati.</p>
      <ng-container *ngIf="enabled">
      <p>{{custom?'Questionario personalizzato per questo cliente.':'Questionario predefinito dall’azienda. I campi utilizzano i dati di questo cliente.'}}</p>
      <button *ngIf="!custom" type="button" (click)="customize()">Personalizza per questo cliente</button>
      <button *ngIf="custom" type="button" (click)="restore()">Usa il questionario predefinito</button>
      <app-work-register-editor *ngIf="custom" [config]="form" />
      <ng-container *ngIf="!custom"><p *ngIf="!form.questions?.length">Nessuna domanda predefinita: personalizza per aggiungerne.</p><ol><li *ngFor="let q of form.questions">{{q.label}} · {{typeLabel(q.type)}}</li></ol></ng-container>
      </ng-container>
      <p>Abilitazione e questionario vengono salvati insieme alla scheda cliente.</p>
    </ng-container></section>`,
  styles:[`.register-settings{padding:20px;margin:20px 0;border:1px solid #cfdae5;border-radius:12px}.register-settings h2{font-size:1.2rem}.register-settings button{margin:0 10px 16px 0;padding:10px;border:1px solid #8fadc7;border-radius:8px;color:inherit;background:transparent}.register-settings li{padding:5px 0}.register-toggle{display:flex;align-items:center;gap:10px;margin:16px 0;font-weight:600}.register-toggle input{width:20px;height:20px}`]
})
export class CustomerWorkRegisterSettingsComponent implements OnChanges,DoCheck {
  @Input() customer:any={}; @Input() customerId='';
  @Output() configurationChange=new EventEmitter<any>();
  form:RegisterForm={title:'Registro del lavoro',introText:'',questions:[]};
  defaults:RegisterForm={title:'Registro del lavoro',introText:'',rules:[]};
  enabled=true;custom=false;loading=true;error='';private request=0;private sourceSnapshot='';
  constructor(private http:HttpClient,public global:GlobalService){}
  ngOnChanges(){this.load();}
  async load(){
    const generation=++this.request;this.loading=true;this.error='';this.configurationChange.emit(undefined);
    try{
      const defaults=await this.http.get<RegisterForm>(this.global.url+'customers/work-register-defaults',{headers:this.global.headers}).toPromise();
      const form=this.customerId?await this.http.get<RegisterForm>(this.global.url+`customers/${encodeURIComponent(this.customerId)}/work-registers/configuration`,{headers:this.global.headers}).toPromise():null;
      if(generation!==this.request)return;
      this.defaults=defaults!;this.enabled=form?.enabled!==false;this.custom=form?.mode==='custom';
      if(this.custom)this.form=form!;else this.rebuild();
      this.emitConfiguration();
    }catch(e:any){if(generation===this.request)this.error=e.error?.error||'Impossibile caricare il questionario';}
    finally{if(generation===this.request)this.loading=false;}
  }
  ngDoCheck(){if(!this.loading&&!this.custom&&!this.error){const next=JSON.stringify(this.customer);if(next!==this.sourceSnapshot)this.rebuild();}}
  private rebuild(){
    const fields=this.global.getFieldMappingFields('customer');const questions:RegisterQuestion[]=[];
    for(const rule of this.defaults.rules||[]){
      if(rule.source!=='field'){questions.push({...structuredClone(rule),origin:{ruleKey:rule.key,fieldKey:'',index:0}});continue;}
      const field=fields.find(f=>f.key===rule.fieldKey);if(!field)continue;
      let values=this.customer[field.dbColumn||field.key]??this.customer[field.key];
      if(typeof values==='string'){try{const parsed=JSON.parse(values);if(Array.isArray(parsed))values=parsed;}catch{}}
      if(!Array.isArray(values))values=['list','repeatable','json'].includes(field.type||'')?String(values??'').split(/\r?\n|;/):[values];
      values.map((v:any)=>String(v&&typeof v==='object'?v.label||v.name||v.value||v.descrizione||'':v??'').trim()).filter(Boolean).forEach((label:string,i:number)=>questions.push({...structuredClone(rule),key:rule.key+'.'+(i+1),label,origin:{ruleKey:rule.key,fieldKey:field.key,index:i}}));
    }
    this.form={title:this.defaults.title,introText:this.defaults.introText,questions,enabled:this.enabled};this.sourceSnapshot=JSON.stringify(this.customer);
  }
  customize(){this.custom=true;this.form={...structuredClone(this.form),mode:'custom'};this.emitConfiguration();}
  restore(){this.custom=false;this.rebuild();this.emitConfiguration();}
  setEnabled(enabled:boolean){this.enabled=enabled;this.emitConfiguration();}
  private emitConfiguration(){this.form.enabled=this.enabled;this.configurationChange.emit(this.custom?this.form:{mode:'default',enabled:this.enabled});}
  typeLabel(type:string){return {checkbox:'Checkbox',choice:'Scelta da tendina',text:'Risposta aperta'}[type]||type;}
}
