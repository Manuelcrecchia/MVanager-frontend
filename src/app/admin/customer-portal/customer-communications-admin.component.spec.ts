import {TestBed} from '@angular/core/testing';
import {HttpClientTestingModule,HttpTestingController} from '@angular/common/http/testing';
import {Router} from '@angular/router';
import {GlobalService} from '../../service/global.service';
import {CustomerCommunicationsAdminComponent} from './customer-communications-admin.component';
describe('Invio comunicazioni clienti',()=>{
  let http:HttpTestingController;
  beforeEach(()=>{TestBed.configureTestingModule({imports:[HttpClientTestingModule,CustomerCommunicationsAdminComponent],providers:[{provide:Router,useValue:{}},{provide:GlobalService,useValue:{url:'/api/',headers:{},hasPermission:()=>true,hasTenantFeature:()=>true,consultationOnly:false}}]});http=TestBed.inject(HttpTestingController);});
  afterEach(()=>http.verify());
  it('filtra i tipi configurati e seleziona tutti i risultati, conservando la selezione cambiando filtro',()=>{
    const component=TestBed.createComponent(CustomerCommunicationsAdminComponent).componentInstance;
    component.audience={types:[{key:'manutenzione',label:'Manutenzione'}],customers:[{id:'1',name:'Alfa',number:'1/2026',type:'manutenzione'},{id:'2',name:'Beta',number:'2/2026',type:'altro'}]};
    component.customerType='manutenzione';component.selectFiltered();expect([...component.selected]).toEqual(['1']);component.customerType='altro';component.selectFiltered();expect([...component.selected]).toEqual(['1','2']);
    component.selection='type';expect(component.recipientCount).toBe(1);component.selection='all';expect(component.recipientCount).toBe(2);
  });
  it('mantiene testo e richiesta idempotente quando un invio non riesce',async()=>{
    const component=TestBed.createComponent(CustomerCommunicationsAdminComponent).componentInstance;component.selected.add('1');component.subject='Oggetto';component.body='Testo';
    const pending=component.send(),request=http.expectOne('/api/admin/customer-portal/communications'),key=request.request.body.requestId;expect(request.request.body.customerIds).toEqual(['1']);
    request.flush({error:'Non disponibile'},{status:503,statusText:'Unavailable'});await pending;expect(component.subject).toBe('Oggetto');
    const retry=component.send(),again=http.expectOne('/api/admin/customer-portal/communications');expect(again.request.body.requestId).toBe(key);again.flush({error:'Non disponibile'},{status:503,statusText:'Unavailable'});await retry;
  });
});
