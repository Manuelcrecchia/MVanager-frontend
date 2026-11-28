import {TestBed} from '@angular/core/testing';
import {HttpClientTestingModule,HttpTestingController} from '@angular/common/http/testing';
import {Router} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {AppRoutingModule} from '../../app-routing.module';
import {AuthGuard} from '../../auth.guard';
import {AuthLevelGuard} from '../../auth-level.guard';
import {GlobalService} from '../../service/global.service';
import {CustomerDocumentSharingSettingsComponent} from './customer-document-sharing-settings.component';

describe('Impostazioni documenti condivisi',()=>{
  let http:HttpTestingController;
  const global={url:'/api/',headers:{},consultationOnly:false,hasTenantFeature:()=>true,hasPermission:()=>true};
  beforeEach(async()=>{await TestBed.configureTestingModule({imports:[CustomerDocumentSharingSettingsComponent,HttpClientTestingModule],providers:[{provide:GlobalService,useValue:global},{provide:Router,useValue:{navigateByUrl:jasmine.createSpy()}}]}).compileComponents();http=TestBed.inject(HttpTestingController);});
  afterEach(()=>http.verify());
  async function open(customers=0){const fixture=TestBed.createComponent(CustomerDocumentSharingSettingsComponent);fixture.detectChanges();http.expectOne('/api/admin/customer-document-sharing/defaults').flush({folders:['Contratti/Firmati'],shareAll:false,customizations:{customers,rules:customers}});await fixture.whenStable();fixture.detectChanges();return fixture;}
  it('condivide tutto con una scelta, conserva le cartelle e riapre la configurazione salvata',async()=>{
    const fixture=await open();const component=fixture.componentInstance;
    fixture.nativeElement.querySelector('input[type=checkbox]').click();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(component.shareAll).toBeTrue();expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    fixture.nativeElement.querySelector('button[type=submit]').click();
    const save=http.expectOne('/api/admin/customer-document-sharing/defaults');expect(save.request.method).toBe('PUT');expect(save.request.body).toEqual({folders:['Contratti/Firmati'],shareAll:true});
    save.flush({folders:['Contratti/Firmati'],shareAll:true});await fixture.whenStable();fixture.detectChanges();expect(fixture.nativeElement.textContent).toContain('Impostazioni salvate');
    const reload=component.load();http.expectOne('/api/admin/customer-document-sharing/defaults').flush({folders:['Contratti/Firmati'],shareAll:true});await reload;fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type=checkbox]').checked).toBeTrue();
    fixture.nativeElement.querySelector('input[type=checkbox]').click();fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();expect(fixture.nativeElement.querySelector('textarea').value).toBe('Contratti/Firmati');
  });
  it('mantiene la configurazione in caso di errore e blocca il salvataggio senza permesso',async()=>{
    const fixture=await open(),component=fixture.componentInstance;component.foldersDraft='../privati';
    const saving=component.save();http.expectOne('/api/admin/customer-document-sharing/defaults').flush({error:'Percorso non valido'},{status:400,statusText:'Bad Request'});await saving;fixture.detectChanges();expect(component.error).toBe('Percorso non valido');expect(component.foldersDraft).toBe('../privati');
    spyOn(global,'hasPermission').and.returnValue(false);await component.save();http.expectNone('/api/admin/customer-document-sharing/defaults');
  });
  it('segnala il cliente personalizzato e applica i predefiniti a tutti solo dopo la scelta esplicita',async()=>{
    const fixture=await open(1),component=fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('1 cliente ha regole personalizzate');
    expect(fixture.nativeElement.querySelector('input[name=clearCustomizations]').checked).toBeFalse();
    component.shareAll=true;
    const keeping=component.save(),keep=http.expectOne('/api/admin/customer-document-sharing/defaults');
    expect(keep.request.body.clearCustomizations).toBeUndefined();
    keep.flush({folders:[],shareAll:true,customizations:{customers:1,rules:1}});await keeping;fixture.detectChanges();
    expect(component.notice).toContain('restano attive e hanno precedenza');
    fixture.nativeElement.querySelector('input[name=clearCustomizations]').click();fixture.detectChanges();await fixture.whenStable();
    const resetting=component.save(),reset=http.expectOne('/api/admin/customer-document-sharing/defaults');
    expect(reset.request.body).toEqual({shareAll:true,folders:[],clearCustomizations:true});
    reset.flush({folders:[],shareAll:true,customizations:{customers:0,rules:0}});await resetting;fixture.detectChanges();
    expect(component.notice).toContain('applicate a tutti i clienti');
    expect(fixture.nativeElement.querySelector('input[name=clearCustomizations]')).toBeNull();expect(component.clearCustomizations).toBeFalse();
  });
  it('mantiene la scelta di applicare i predefiniti se il server rifiuta il salvataggio',async()=>{
    const fixture=await open(2),component=fixture.componentInstance;component.clearCustomizations=true;
    const saving=component.save();http.expectOne('/api/admin/customer-document-sharing/defaults').flush({error:'Salvataggio non riuscito'},{status:500,statusText:'Error'});await saving;fixture.detectChanges();
    expect(component.customizedCustomers).toBe(2);expect(component.clearCustomizations).toBeTrue();expect(component.notice).toBe('');
  });
});

describe('Navigazione mobile alle impostazioni documenti condivisi',()=>{
  it('apre la pagina dal percorso usato dal menu mobile',async()=>{
    spyOn(window,'matchMedia').and.returnValue({matches:false} as MediaQueryList);
    await TestBed.configureTestingModule({imports:[AppRoutingModule,HttpClientTestingModule],providers:[
      {provide:GlobalService,useValue:{url:'/api/',headers:{},consultationOnly:false,hasTenantFeature:()=>true,hasPermission:()=>true}},
      {provide:AuthGuard,useValue:{canActivate:()=>true}},{provide:AuthLevelGuard,useValue:{canActivate:()=>true}},
    ]}).compileComponents();
    const http=TestBed.inject(HttpTestingController),harness=await RouterTestingHarness.create();
    await harness.navigateByUrl('/customerDocumentSharingSettings',CustomerDocumentSharingSettingsComponent);
    http.expectOne('/api/admin/customer-document-sharing/defaults').flush({shareAll:true,folders:[],customizations:{customers:1,rules:1}});harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/customerDocumentSharingSettings');
    expect(harness.routeNativeElement?.textContent).toContain('Impostazioni documenti condivisi');
    http.verify();
  });
});
