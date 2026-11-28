import {CommonModule} from '@angular/common';
import {Component,OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {HttpClient} from '@angular/common/http';
import {Router} from '@angular/router';
import {firstValueFrom} from 'rxjs';
import {GlobalService} from '../../service/global.service';

interface SharingSettings {shareAll?:boolean;folders:string[];customizations?:{customers:number;rules:number};}

@Component({selector:'app-customer-document-sharing-settings',standalone:true,imports:[CommonModule,FormsModule],
  template:`<div class="mv-page sharing-settings-page">
    <header class="mv-entity-toolbar"><div class="mv-entity-toolbar__title"><h1>Impostazioni documenti condivisi</h1></div>
      <div class="mv-entity-toolbar__controls"><button type="button" class="mv-toolbar-back" (click)="back()">← Torna indietro</button></div></header>
    <p *ngIf="error" class="alert alert-danger" role="alert">{{error}}</p><p *ngIf="notice" class="alert alert-success" role="status">{{notice}}</p>
    <section class="mv-card sharing-settings-card" aria-label="Condivisione predefinita documenti clienti">
      <h2>Regole predefinite dell’azienda</h2>
      <p>Queste impostazioni valgono per tutti i clienti esistenti e futuri. Le scelte sul singolo cliente hanno precedenza.</p>
      <p *ngIf="loading" role="status">Caricamento impostazioni…</p>
      <form *ngIf="loaded" (ngSubmit)="save()">
        <label class="share-all-option"><input type="checkbox" [(ngModel)]="shareAll" name="shareAll" [disabled]="saving||!canEdit">
          <span><strong>Condividi tutte le cartelle e tutti i documenti</strong><small>Comprende l’intero archivio di ciascun cliente, inclusi i contenuti aggiunti in futuro.</small></span></label>
        <div *ngIf="!shareAll" class="folder-options">
          <label for="shared-default-folders">Cartelle condivise predefinite</label>
          <textarea id="shared-default-folders" class="form-control" rows="6" [(ngModel)]="foldersDraft" name="folders" [disabled]="saving||!canEdit" placeholder="Registri del lavoro&#10;Contratti/Firmati"></textarea>
          <p>Un percorso per riga, a partire dalla cartella principale del cliente. Sono comprese sottocartelle e nuovi file. Un elenco vuoto mantiene solo le condivisioni scelte sul singolo cliente.</p>
        </div>
        <p *ngIf="shareAll">I percorsi delle cartelle già impostati vengono conservati e saranno nuovamente disponibili disattivando la condivisione completa.</p>
        <div *ngIf="customizedCustomers>0" class="alert alert-warning" role="status">
          <strong>{{customizedCustomers}} {{customizedCustomers===1?'cliente ha regole personalizzate':'clienti hanno regole personalizzate'}}.</strong>
          Queste regole restano valide anche scegliendo “Condividi tutto”: un cliente con “Nascondi tutto” o con file esclusi continuerà a non vederli.
          <label class="reset-customizations"><input type="checkbox" name="clearCustomizations" [(ngModel)]="clearCustomizations" [disabled]="saving||!canEdit">
            <span><strong>Applica le regole aziendali anche ai clienti personalizzati</strong><small>Al salvataggio rimuove tutte le scelte individuali su clienti, cartelle e file di questa azienda. Con “Condividi tutto” selezionato, anche i documenti prima esclusi saranno visibili ai rispettivi clienti.</small></span></label>
        </div>
        <div class="settings-actions"><button type="submit" class="btn btn-primary" [disabled]="saving||!canEdit">{{saving?'Salvataggio…':'Salva impostazioni'}}</button></div>
      </form>
      <button *ngIf="!loading&&!loaded" class="btn btn-outline-secondary" type="button" (click)="load()">Riprova</button>
    </section></div>`,
  styles:[`.sharing-settings-page{max-width:1100px;margin:auto}.sharing-settings-card{padding:clamp(18px,3vw,32px);margin-top:20px}.sharing-settings-card h2{font-size:1.25rem;margin-top:0}.sharing-settings-card p{line-height:1.6}.share-all-option,.reset-customizations{display:flex;align-items:flex-start;gap:14px;cursor:pointer}.share-all-option{padding:18px;border:1px solid #b8d1e9;border-radius:12px;background:#f0f6fc;margin:22px 0}.reset-customizations{margin-top:16px}.share-all-option input,.reset-customizations input{width:22px;height:22px;flex:0 0 22px;margin-top:2px;accent-color:#246cb3}.share-all-option small,.reset-customizations small{display:block;line-height:1.5;margin-top:5px}.folder-options label{display:block;font-weight:600;margin:18px 0 10px}.folder-options textarea{width:100%;box-sizing:border-box;resize:vertical}.settings-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}.settings-actions button{min-height:44px;padding:10px 20px}`]
})
export class CustomerDocumentSharingSettingsComponent implements OnInit {
  shareAll=false;foldersDraft='';loaded=false;loading=false;saving=false;error='';notice='';
  customizedCustomers=0;clearCustomizations=false;
  constructor(private http:HttpClient,public global:GlobalService,private router:Router){}
  get canEdit(){return !this.global.consultationOnly&&this.global.hasTenantFeature('customerPortalDocuments')&&this.global.hasPermission('CUSTOMER_DOCS_DEFAULTS_MANAGE');}
  ngOnInit(){void this.load();}
  back(){this.router.navigateByUrl('/homeAdmin');}
  async load(){
    if(this.loading||!this.canEdit)return;this.loading=true;this.loaded=false;this.error='';
    try{const value=await firstValueFrom(this.http.get<SharingSettings>(this.global.url+'admin/customer-document-sharing/defaults',{headers:this.global.headers}));
      this.shareAll=value.shareAll===true;this.foldersDraft=value.folders.join('\n');this.customizedCustomers=value.customizations?.customers||0;this.clearCustomizations=false;this.loaded=true;
    }catch(e:any){this.error=e.error?.error||'Impossibile caricare le impostazioni.';}finally{this.loading=false;}
  }
  async save(){
    if(!this.canEdit||this.saving||!this.loaded)return;this.saving=true;this.error='';this.notice='';
    const clearCustomizations=this.clearCustomizations;
    try{const value=await firstValueFrom(this.http.put<SharingSettings>(this.global.url+'admin/customer-document-sharing/defaults',{
      shareAll:this.shareAll,folders:this.foldersDraft.split(/\r?\n/).map(value=>value.trim()).filter(Boolean),
      ...(clearCustomizations?{clearCustomizations:true}:{}),
    },{headers:this.global.headers}));this.shareAll=value.shareAll===true;this.foldersDraft=value.folders.join('\n');this.customizedCustomers=value.customizations?.customers||0;this.clearCustomizations=false;
      this.notice=clearCustomizations?'Regole aziendali applicate a tutti i clienti. Le personalizzazioni precedenti sono state rimosse.':this.customizedCustomers>0?'Impostazioni aziendali salvate. Le personalizzazioni dei clienti restano attive e hanno precedenza.':'Impostazioni salvate per tutti i clienti dell’azienda.';
    }catch(e:any){this.error=e.error?.error||'Impossibile salvare le impostazioni.';}finally{this.saving=false;}
  }
}
