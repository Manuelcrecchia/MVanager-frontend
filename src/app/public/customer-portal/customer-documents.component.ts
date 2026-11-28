import {CommonModule} from '@angular/common';
import {Component,Input,Output,EventEmitter,OnChanges,OnDestroy} from '@angular/core';
import {HttpBackend,HttpClient,HttpHeaders} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import {DocumentExplorerComponent,DocumentExplorerAction,DocumentExplorerEntry} from '../../shared/document-explorer/document-explorer.component';
import {downloadFile} from '../../shared/file-download';
import {NgxExtendedPdfViewerModule} from 'ngx-extended-pdf-viewer';

interface SharedDocument {path:string;name:string;kind:'file'|'folder';size?:number;modifiedAt?:string;}
@Component({selector:'app-customer-documents',standalone:true,imports:[CommonModule,DocumentExplorerComponent,NgxExtendedPdfViewerModule],
  template:`<p *ngIf="error" class="message error" role="alert">{{error}}</p>
    <button type="button" class="btn btn-outline-secondary" (click)="load(path)" [disabled]="loading||opening">Aggiorna documenti</button>
    <app-document-explorer [entries]="entries" [path]="path" rootLabel="Documenti condivisi" dateLabel="Data documento"
      [writable]="false" [allowDelete]="false" [allowPrint]="false" [loading]="loading" (navigate)="load($event)" (action)="onAction($event)" />
    <section *ngIf="preview" class="document-preview" aria-label="Anteprima documento">
      <div class="preview-actions"><strong>{{preview.name}}</strong><button type="button" class="btn btn-outline-secondary" (click)="closePreview()">Chiudi anteprima</button></div>
      <ngx-extended-pdf-viewer *ngIf="preview.pdf" [src]="preview.url" height="75vh" [showOpenFileButton]="false" [showPrintButton]="false" [showDownloadButton]="false" [showSecondaryToolbarButton]="false" />
      <img *ngIf="!preview.pdf" [src]="preview.url" [alt]="preview.name">
    </section>`,
  styles:[`:host{display:block;min-width:0}.message{margin:12px 0}.document-preview{margin-top:20px;background:#fff;border:1px solid #d5dfe8;border-radius:12px;padding:16px}.preview-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.preview-actions strong{overflow-wrap:anywhere}iframe{width:100%;height:75vh;border:0}img{display:block;max-width:100%;max-height:75vh;margin:auto}`]
})
export class CustomerDocumentsComponent implements OnChanges,OnDestroy {
  @Input() api='';@Input() tenant='';@Input() token='';
  @Output() sessionExpired=new EventEmitter<void>();
  entries:DocumentExplorerEntry[]=[];path='';loading=false;opening=false;error='';
  preview:{name:string;url:string;pdf:boolean}|null=null;
  private generation=0;private fileGeneration=0;private http:HttpClient;
  constructor(backend:HttpBackend){this.http=new HttpClient(backend);}
  private headers(){return new HttpHeaders({'X-Tenant-Id':this.tenant,Authorization:'Bearer '+this.token});}
  ngOnChanges(){this.closePreview();this.entries=[];void this.load('');}
  ngOnDestroy(){this.generation++;this.closePreview();}
  async load(path:string):Promise<void>{
    const generation=++this.generation;this.path=path;this.loading=true;this.error='';this.entries=[];this.closePreview();
    try {
      const result=await firstValueFrom(this.http.get<{path:string;entries:SharedDocument[]}>(this.api+'documents',{headers:this.headers(),params:{path}}));
      if(generation!==this.generation)return;
      this.path=result.path;this.entries=result.entries.map(entry=>({...entry,id:entry.path,data:entry}));
    }catch(e:any){if(generation===this.generation)await this.showError(e,'Impossibile caricare i documenti.');}
    finally{if(generation===this.generation)this.loading=false;}
  }
  async onAction(action:DocumentExplorerAction):Promise<void>{
    if(this.opening||this.loading)return;
    const file:SharedDocument=action.entry.data;
    if(action.type==='open'&&file.kind==='folder'){await this.load(file.path);return;}
    if(file.kind!=='file'||!['open','download'].includes(action.type))return;
    const generation=++this.fileGeneration;this.opening=true;this.error='';
    try{
      const blob=await firstValueFrom(this.http.get(this.api+'documents/file',{headers:this.headers(),params:{path:file.path,download:action.type==='download'?'1':'0'},responseType:'blob'}));
      if(generation!==this.fileGeneration)return;
      const pdf=blob.type==='application/pdf',image=/^image\/(png|jpeg|gif|webp)$/.test(blob.type);
      if(action.type==='download'||!pdf&&!image){await downloadFile(blob,file.name,message=>this.error=message);return;}
      this.closePreview();const url=URL.createObjectURL(blob);
      this.preview={name:file.name,url,pdf};
    }catch(e:any){if(generation===this.fileGeneration)await this.showError(e,'Impossibile aprire il documento. Aggiorna l’elenco e riprova.');}
    finally{this.opening=false;}
  }
  closePreview(){this.fileGeneration++;this.opening=false;if(this.preview)URL.revokeObjectURL(this.preview.url);this.preview=null;}
  private async showError(error:any,fallback:string){
    if(error.status===401){this.sessionExpired.emit();return;}
    let body=error.error;
    if(body instanceof Blob){try{body=JSON.parse(await body.text());}catch{body=null;}}
    this.error=body?.error||fallback;
  }
}
