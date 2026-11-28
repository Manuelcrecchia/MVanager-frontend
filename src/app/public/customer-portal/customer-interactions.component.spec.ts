import {TestBed} from '@angular/core/testing';
import {HttpClientTestingModule,HttpTestingController} from '@angular/common/http/testing';
import {CustomerTicketsComponent} from './customer-tickets.component';
import {CustomerCommunicationsComponent} from './customer-communications.component';

describe('Comunicazioni e ticket nel portale clienti',()=>{
  let http:HttpTestingController;
  beforeEach(()=>{TestBed.configureTestingModule({imports:[HttpClientTestingModule,CustomerTicketsComponent,CustomerCommunicationsComponent]});http=TestBed.inject(HttpTestingController);});
  afterEach(()=>http.verify());
  it('usa le credenziali cliente e aggiorna la lettura solo dopo il salvataggio',async()=>{
    const fixture=TestBed.createComponent(CustomerCommunicationsComponent),component=fixture.componentInstance;
    component.api='/portal/';component.tenant='tenant-a';component.token='customer-token';const changed=spyOn(component.changed,'emit');
    const loading=component.load(),read=http.expectOne('/portal/communications');expect(read.request.headers.get('Authorization')).toBe('Bearer customer-token');expect(read.request.headers.get('X-Tenant-Id')).toBe('tenant-a');
    read.flush([{id:3,subject:'Avviso',body:'Testo',readAt:null}]);await loading;
    const opened=component.open(component.rows[0]);expect(component.rows[0].readAt).toBeNull();
    http.expectOne('/portal/communications/3/read').flush({ok:true});await opened;expect(component.rows[0].readAt).toBeTruthy();expect(changed).toHaveBeenCalled();
  });
  it('invia il ticket con FormData senza poter scegliere un altro cliente',async()=>{
    const fixture=TestBed.createComponent(CustomerTicketsComponent),component=fixture.componentInstance;
    component.api='/portal/';component.tenant='tenant-a';component.token='customer-token';component.customerId='OTHER';component.newTicket();component.subject='Richiesta';component.body='Descrizione';
    const posting=component.create(),request=http.expectOne('/portal/tickets');expect(request.request.method).toBe('POST');
    expect(request.request.body instanceof FormData).toBeTrue();expect(request.request.body.get('subject')).toBe('Richiesta');expect(request.request.body.has('customerId')).toBeFalse();
    request.flush({error:'Invio non disponibile'},{status:503,statusText:'Unavailable'});await posting;expect(component.creating).toBeTrue();expect(component.subject).toBe('Richiesta');expect(component.error).toBe('Invio non disponibile');
  });
  it('blocca allegati troppo grandi e non invia richieste',()=>{
    const component=TestBed.createComponent(CustomerTicketsComponent).componentInstance;
    const input={files:[{size:11*1024*1024}],value:'file'};
    component.chooseFiles({target:input} as any);expect(component.error).toContain('10 MB');expect(input.value).toBe('');expect(component.attachments).toEqual([]);
  });
  it('distingue il permesso di risposta da quello di gestione del ticket',()=>{
    const fixture=TestBed.createComponent(CustomerTicketsComponent),component=fixture.componentInstance;
    component.admin=true;component.canManage=true;component.detail={id:1,code:'T-00001',subject:'Richiesta',status:'working',messages:[]};fixture.detectChanges();
    const text=fixture.nativeElement.textContent;expect(text).toContain('Salva nota interna');expect(text).toContain('Chiudi ticket');expect(text).not.toContain('Invia risposta');expect(text).not.toContain('Rispondi e chiudi');
    component.canReply=true;fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Rispondi e chiudi');
  });
  it('aggiorna il dettaglio aperto e preserva una risposta ancora in bozza',async()=>{
    const component=TestBed.createComponent(CustomerTicketsComponent).componentInstance;component.api='/portal/';component.tenant='tenant-a';component.token='customer-token';component.detail={id:1,status:'working'};component.reply='Bozza da conservare';
    const first=component.refresh();http.expectOne('/portal/tickets').flush([]);await first;expect(component.reply).toBe('Bozza da conservare');http.expectNone('/portal/tickets/1');
    component.reply='';const second=component.refresh();http.expectOne('/portal/tickets').flush([]);await Promise.resolve();await Promise.resolve();
    http.expectOne('/portal/tickets/1').flush({id:1,status:'closed',messages:[]});await Promise.resolve();await Promise.resolve();http.expectOne('/portal/tickets').flush([]);await second;
    expect(component.detail.status).toBe('closed');
  });
});
