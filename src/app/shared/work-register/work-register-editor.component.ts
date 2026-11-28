import {CommonModule} from '@angular/common';
import {Component, Input} from '@angular/core';
import {FormsModule} from '@angular/forms';
export interface RegisterQuestion {key:string;label:string;type:'checkbox'|'choice'|'text';required:boolean;options:{value:string;label:string}[];source?:'field'|'question';fieldKey?:string;origin?:{ruleKey:string;fieldKey:string;index:number};}
export interface RegisterForm {title:string;introText:string;templateKey?:string;rules?:RegisterQuestion[];questions?:RegisterQuestion[];mode?:'default'|'custom';enabled?:boolean;}
@Component({
  selector:'app-work-register-editor',standalone:true,imports:[CommonModule,FormsModule],
  template:`<fieldset [disabled]="disabled" class="register-editor">
    <label>Titolo del registro<input [ngModel]="config.title" (ngModelChange)="config.title=$event" [ngModelOptions]="{standalone:true}" maxlength="200"></label>
    <label>Istruzioni per il dipendente<textarea [(ngModel)]="config.introText" [ngModelOptions]="{standalone:true}" maxlength="4000"></textarea></label>
    <article *ngFor="let q of questions;let i=index" class="register-question">
      <div class="register-row"><strong>Voce {{i+1}}</strong><button type="button" (click)="move(i,-1)" [disabled]="disabled||i===0" aria-label="Sposta voce in alto">↑</button><button type="button" (click)="move(i,1)" [disabled]="disabled||i===questions.length-1" aria-label="Sposta voce in basso">↓</button><button type="button" (click)="remove(i)">Rimuovi voce</button></div>
      <label *ngIf="allowSources">Origine<select [(ngModel)]="q.source" [ngModelOptions]="{standalone:true}"><option value="question">Domanda personalizzata</option><option value="field">Valori di un campo cliente</option></select></label>
      <label *ngIf="allowSources&&q.source==='field';else questionText">Campo cliente<select [(ngModel)]="q.fieldKey" [ngModelOptions]="{standalone:true}"><option value="">Scegli un campo</option><option *ngFor="let f of fields" [value]="f.key">{{f.label||f.key}}</option></select><small>Ogni valore compilato sul cliente diventa una domanda. Per un elenco vengono usate tutte le sue voci.</small></label>
      <ng-template #questionText><label>Domanda<input [(ngModel)]="q.label" [ngModelOptions]="{standalone:true}" maxlength="500"></label></ng-template>
      <label>Tipo di risposta<select [(ngModel)]="q.type" [ngModelOptions]="{standalone:true}"><option value="checkbox">Checkbox</option><option value="choice">Scelta da tendina</option><option value="text">Risposta aperta</option></select></label>
      <label class="register-check"><input type="checkbox" [(ngModel)]="q.required" [ngModelOptions]="{standalone:true}"> Risposta obbligatoria</label>
      <div *ngIf="q.type==='choice'"><label *ngFor="let option of q.options;let j=index">Risposta {{j+1}}<span class="register-row"><input [(ngModel)]="option.label" [ngModelOptions]="{standalone:true}" maxlength="200"><button type="button" (click)="q.options.splice(j,1)" aria-label="Rimuovi risposta">×</button></span></label><button type="button" (click)="addOption(q)">Aggiungi risposta</button></div>
    </article>
    <p *ngIf="!questions.length">Nessuna domanda configurata. Puoi aggiungerle qui.</p>
    <button type="button" (click)="add()" [disabled]="disabled||questions.length>=100">Aggiungi voce</button>
  </fieldset>`,
  styles:[`:host{display:block;min-width:0}.register-editor{border:0;padding:0;margin:0;min-width:0;display:grid;gap:16px}.register-editor label{display:grid;gap:6px;font-weight:600}.register-editor input:not([type=checkbox]),textarea,select{box-sizing:border-box;width:100%;min-width:0;padding:10px;border:1px solid #bdccd9;border-radius:7px;background:var(--surface,#fff);color:inherit;font:inherit}textarea{min-height:75px}.register-question{display:grid;gap:12px;border:1px solid #d6e1e8;border-radius:12px;padding:16px;background:var(--surface,#fff)}.register-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.register-row input{flex:1}.register-check{display:flex!important;align-items:center;font-weight:400!important}small{font-weight:400;line-height:1.5;color:#596c7b}button{padding:8px 12px;border:1px solid #b9cedd;border-radius:7px;background:var(--surface,#fff);color:inherit;cursor:pointer;font:inherit}button:disabled{opacity:.5;cursor:default}input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid #3880c0;outline-offset:2px}`]
})
export class WorkRegisterEditorComponent {
  @Input() config:RegisterForm={title:'Registro del lavoro',introText:'',questions:[]};
  @Input() fields:{key:string;label?:string}[]=[];
  @Input() allowSources=false;
  @Input() disabled=false;
  get questions(){return (this.allowSources?this.config.rules:this.config.questions)||[];}
  add(){if(this.disabled)return;this.questions.push({key:'q_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,12),label:'',source:'question',fieldKey:'',type:'checkbox',required:false,options:[]});}
  remove(i:number){if(!this.disabled)this.questions.splice(i,1);}
  move(i:number,delta:number){if(!this.disabled&&i+delta>=0&&i+delta<this.questions.length){const q=this.questions.splice(i,1)[0];this.questions.splice(i+delta,0,q);}}
  addOption(q:RegisterQuestion){if(!this.disabled)q.options.push({value:'o_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,12),label:''});}
}
