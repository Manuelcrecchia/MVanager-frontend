import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {provideHttpClientTesting,HttpTestingController} from '@angular/common/http/testing';
import {CustomerWorkRegisterSettingsComponent} from './customer-work-register-settings.component';
import {GlobalService} from '../service/global.service';

describe('Abilitazione registro del singolo cliente',()=>{
  let http:HttpTestingController;
  const defaults={title:'Registro',introText:'',rules:[{key:'servizi',source:'field',fieldKey:'servizi',type:'checkbox',required:false,options:[]}]};
  beforeEach(async()=>{
    await TestBed.configureTestingModule({imports:[CustomerWorkRegisterSettingsComponent],providers:[provideHttpClient(),provideHttpClientTesting(),
      {provide:GlobalService,useValue:{url:'/api/',headers:{},getFieldMappingFields:()=>[{key:'servizi',type:'list'}]}}]}).compileComponents();
    http=TestBed.inject(HttpTestingController);
  });
  afterEach(()=>http.verify());
  async function open(stored:any){
    const fixture=TestBed.createComponent(CustomerWorkRegisterSettingsComponent);
    fixture.componentRef.setInput('customerId','1');fixture.componentRef.setInput('customer',{servizi:'["Scale","Vetri"]'});fixture.detectChanges();
    http.expectOne('/api/customers/work-register-defaults').flush(defaults);await fixture.whenStable();
    http.expectOne('/api/customers/1/work-registers/configuration').flush(stored);await fixture.whenStable();fixture.detectChanges();
    return fixture;
  }
  it('nasconde e ripristina l’editor conservando le domande personalizzate nel payload',async()=>{
    const questions=[{key:'personale',label:'Controllo ingresso',type:'text',required:false,options:[]}];
    const fixture=await open({title:'Registro',introText:'',mode:'custom',questions});
    const emitted=jasmine.createSpy('configuration');fixture.componentInstance.configurationChange.subscribe(emitted);
    expect(fixture.nativeElement.querySelector('app-work-register-editor')).toBeTruthy();
    fixture.nativeElement.querySelector('.register-toggle input').click();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-work-register-editor')).toBeNull();
    expect(emitted.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({enabled:false,mode:'custom',questions}));
    fixture.nativeElement.querySelector('.register-toggle input').click();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-work-register-editor')).toBeTruthy();
    expect(emitted.calls.mostRecent().args[0].questions).toEqual(questions);
  });
  it('riapre un cliente disabilitato con i predefiniti e mostra di nuovo i valori cliente alla riattivazione',async()=>{
    const fixture=await open({enabled:false,mode:'default',questions:[]});
    expect(fixture.nativeElement.querySelector('.register-toggle input').checked).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('Personalizza per questo cliente');
    fixture.nativeElement.querySelector('.register-toggle input').click();fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Personalizza per questo cliente');
    expect(fixture.componentInstance.form.questions!.map(q=>q.label)).toEqual(['Scale','Vetri']);
    expect(fixture.componentInstance.form.questions![0].origin?.fieldKey).toBe('servizi');
  });
});
