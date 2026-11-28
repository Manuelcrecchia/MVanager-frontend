import {TestBed} from '@angular/core/testing';
import {HttpClientTestingModule,HttpTestingController} from '@angular/common/http/testing';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {CustomerDocumentsComponent} from './customer-documents.component';

describe('Documenti riservati del cliente',()=>{
  let http:HttpTestingController;
  beforeEach(async()=>{await TestBed.configureTestingModule({imports:[CustomerDocumentsComponent,HttpClientTestingModule,NoopAnimationsModule]}).compileComponents();http=TestBed.inject(HttpTestingController);});
  afterEach(()=>http.verify());
  async function open(){
    const fixture=TestBed.createComponent(CustomerDocumentsComponent);
    fixture.componentRef.setInput('api','/api/customer-portal/');fixture.componentRef.setInput('tenant','tenant-a');fixture.componentRef.setInput('token','customer-token');fixture.detectChanges();
    const request=http.expectOne(r=>r.url==='/api/customer-portal/documents');
    expect(request.request.headers.get('Authorization')).toBe('Bearer customer-token');expect(request.request.headers.get('X-Tenant-Id')).toBe('tenant-a');
    expect(request.request.params.has('numeroCliente')).toBeFalse();
    request.flush({path:'',entries:[{path:'Contratti',name:'Contratti',kind:'folder'}]});await fixture.whenStable();fixture.detectChanges();return fixture;
  }
  it('naviga le sole cartelle restituite e non espone azioni di modifica',async()=>{
    const fixture=await open();
    const component=fixture.componentInstance;
    fixture.nativeElement.querySelector('.entry-main').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));
    const request=http.expectOne(r=>r.url.endsWith('/documents')&&r.params.get('path')==='Contratti');
    request.flush({path:'Contratti',entries:[{path:'Contratti/a.pdf',name:'a.pdf',kind:'file',size:12}]});await fixture.whenStable();fixture.detectChanges();
    expect(component.entries.map(e=>e.name)).toEqual(['a.pdf']);
    expect(fixture.nativeElement.textContent).not.toContain('Carica documenti');
    expect(fixture.nativeElement.textContent).not.toContain('Nuova cartella');
    expect(fixture.nativeElement.querySelector('input[type=file]').disabled).toBeTrue();
  });
  it('gestisce una revoca sul download senza riutilizzare un file precedente',async()=>{
    const fixture=await open(),component=fixture.componentInstance;
    const action=component.onAction({type:'download',entry:{id:'a',name:'Riservato.pdf',kind:'file',data:{path:'Contratti/a.pdf',kind:'file',name:'Riservato.pdf'}}});
    const request=http.expectOne(r=>r.url.endsWith('/documents/file'));
    expect(request.request.params.get('path')).toBe('Contratti/a.pdf');
    request.flush(new Blob([JSON.stringify({error:'Documento non disponibile'})],{type:'application/json'}),{status:404,statusText:'Not Found'});
    await action;fixture.detectChanges();expect(component.preview).toBeNull();expect(component.error).toBe('Documento non disponibile');
  });
  it('segnala una sessione scaduta e scarta risposte di navigazioni precedenti',async()=>{
    const fixture=await open(),component=fixture.componentInstance,expired=jasmine.createSpy();component.sessionExpired.subscribe(expired);
    const first=component.load('Contratti'),request1=http.expectOne(r=>r.params.get('path')==='Contratti');
    const second=component.load('Pubblici'),request2=http.expectOne(r=>r.params.get('path')==='Pubblici');
    request2.flush({path:'Pubblici',entries:[]});await second;
    request1.flush({path:'Contratti',entries:[{path:'Contratti/a.pdf',name:'a.pdf',kind:'file'}]});await first;
    expect(component.path).toBe('Pubblici');expect(component.entries).toEqual([]);
    const third=component.load('');http.expectOne(r=>r.params.get('path')==='').flush({error:'Scaduta'},{status:401,statusText:'Unauthorized'});await third;expect(expired).toHaveBeenCalledTimes(1);
  });
});
