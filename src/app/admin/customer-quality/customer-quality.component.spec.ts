import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PopupServiceService } from '../../componenti/popup/popup-service.service';
import { GlobalService } from '../../service/global.service';
import { CustomerQualityComponent } from './customer-quality.component';
import { PeriodicAssessmentSettingsComponent } from './periodic-assessment-settings.component';

describe('CustomerQualityComponent', () => {
  function fixture(kind: string = 'quality_control', permissions = ['QUALITY_CONTROL_MANAGE']) {
    const data = {customer:{numeroCliente:'C1',displayName:'Cliente',active:true},categories:[{key:'pulizie',mode:'recurring',qualityControl:{questions:[{key:'esito',required:true,type:'choice',options:[]}]},plan:{qualityEnabled:true,qualityIntervalMonths:2,qualityNextDueOn:'2027-01-31',workMode:'recurring',workIntervalMonths:1,workNextDueOn:'2026-12-31'}}],tasks:[{id:4,kind:'quality_control',status:'due',categoryKey:'pulizie',periodStart:'2026-10-01',dueOn:'2026-11-30'},{id:5,kind:'work_completion',status:'requested',categoryKey:'pulizie',periodStart:'2026-10-01',dueOn:'2026-11-30'}],controls:[],proofs:[]};
    const http = {get:jasmine.createSpy('get').and.callFake(()=>of(structuredClone(data))),put:jasmine.createSpy('put').and.returnValue(of({ok:true})),post:jasmine.createSpy('post').and.returnValue(of({ok:true}))};
    const route = {snapshot:{paramMap:{get:()=> 'C1'},queryParamMap:{get:()=>null},data:{qualityKind:kind}}};
    const global = {url:'/',hasPermission:(key:string)=>permissions.includes(key)};
    const popup = {choose:jasmine.createSpy('choose').and.resolveTo('primary')};
    const component = new CustomerQualityComponent(http as any,route as any,global as any,popup as any);component.ngOnInit();
    return {component,http,popup};
  }
  it('conserva gli scatti quando si allega un file HEIC', () => {
    const { component } = fixture();
    const first = new File(['photo'], 'scatto.jpg', { type: 'image/jpeg' });
    const second = new File(['photo'], 'iphone.heic', { type: 'image/heic' });
    for (const file of [first, second]) {
      const input = { files: [file], value: file.name };
      component.addPhotos({ target: input } as unknown as Event);
      expect(input.value).toBe('');
    }
    expect(component.photos.map(photo => photo.file)).toEqual([first, second]);
    component.removePhoto(0);
    expect(component.photos.map(photo => photo.file)).toEqual([second]);
  });

  it('keeps signed requests visible alongside pending requests for the same period', () => {
    const { component } = fixture('work_completion', ['WORK_COMPLETION_VIEW', 'CUSTOMER_DOCS_VIEW']);
    const context = { categoryKey: 'pulizie', periodStart: '2026-11-04', periodEnd: '2026-11-26' };
    component.data.proofs = [
      { id: 2, status: 'accepted', context, archivedInDocuments: true },
      { id: 1, status: 'pending', context, archivedInDocuments: false },
    ];
    expect(component.history.map(proof => proof.id)).toEqual([2, 1]);
    expect(component.showHistoryTab).toBeTrue();
  });
  it('shows only pending tasks belonging to the selected workflow',()=>{
    const {component}=fixture();expect(component.tasks.map(t=>t.id)).toEqual([4]);
    component.kind='work_completion';expect(component.tasks.map(t=>t.id)).toEqual([5]);
  });
  it('stores the internal schedule independently from the client assessment schedule',()=>{
    const {component,http}=fixture();component.savePlan();
    expect(http.put).toHaveBeenCalledWith('/admin/customer-quality/plans/C1/pulizie/quality_control',{enabled:true,intervalMonths:2,nextDueOn:'2027-01-31'});
  });
  it('saves distinct non-monthly frequencies for a single customer', () => {
    const control = fixture();
    control.component.setIndividualFrequency(2, 'weeks');
    control.component.savePlan();
    expect(control.http.put).toHaveBeenCalledWith('/admin/customer-quality/plans/C1/pulizie/quality_control',
      jasmine.objectContaining({ intervalCount: 2, intervalUnit: 'weeks' }));
    const work = fixture('work_completion', ['WORK_COMPLETION_MANAGE']);
    work.component.setIndividualFrequency(5, 'days');
    work.component.savePlan();
    expect(work.http.put).toHaveBeenCalledWith('/admin/customer-quality/plans/C1/pulizie/work_completion',
      jasmine.objectContaining({ intervalCount: 5, intervalUnit: 'days' }));
  });
  it('inherits the internal default without turning the calculated date into an override', () => {
    const { component, http } = fixture();
    component.category.qualitySchedule = { enabled: true, firstDueRule: 'service_start' };
    Object.assign(component.plan, { qualityScheduleMode: 'inherit', qualityIntervalMonths: null, qualityDueDateOverride: '' });
    expect(component.qualityScheduleEnabled).toBeTrue();
    component.savePlan();
    expect(http.put).toHaveBeenCalledWith('/admin/customer-quality/plans/C1/pulizie/quality_control',
      { mode: 'inherit', intervalMonths: null, nextDueOn: '' });
  });
  it('keeps the company due date automatic until an override is entered', () => {
    const { component, http } = fixture('work_completion', ['WORK_COMPLETION_MANAGE']);
    component.plan.workDueDateOverride = '';
    component.savePlan();
    expect(http.put).toHaveBeenCalledWith('/admin/customer-quality/plans/C1/pulizie/work_completion',
      { mode: 'recurring', intervalMonths: 1, nextDueOn: '' });
    component.plan.workDueDateOverride = '2027-01-10';
    component.savePlan();
    expect(http.put).toHaveBeenCalledWith('/admin/customer-quality/plans/C1/pulizie/work_completion',
      { mode: 'recurring', intervalMonths: 1, nextDueOn: '2027-01-10' });
  });
  it('offers end-of-work only for compatible categories and shows a saved legacy choice', async () => {
    const data = fixture('work_completion').component.data;
    const category = data.categories[0];
    category.defaultWorkMode = 'recurring';
    category.plan.workMode = '';
    await TestBed.configureTestingModule({
      imports: [CustomerQualityComponent],
      providers: [
        provideRouter([]),
        { provide: HttpClient, useValue: { get: () => of(data) } },
        { provide: GlobalService, useValue: { hasPermission: () => true } },
        { provide: PopupServiceService, useValue: {} },
      ],
    }).compileComponents();
    const view = TestBed.createComponent(CustomerQualityComponent);
    view.componentInstance.tab = 'settings';
    view.detectChanges();
    await view.whenStable();
    const select: HTMLSelectElement = view.nativeElement.querySelector('.form-grid select');
    expect(select.options[0].textContent).toContain('Come la categoria · Valutazione periodica');
    expect(select.querySelector('option[value="one_off"]')).toBeNull();

    category.mode = 'one_off';
    category.plan.workMode = 'one_off';
    view.detectChanges();
    await view.whenStable();
    const legacy = select.querySelector<HTMLOptionElement>('option[value="one_off"]')!;
    expect(legacy.disabled).toBeTrue();
    expect(select.value).toBe('one_off');

    category.defaultWorkMode = 'one_off';
    view.detectChanges();
    expect(legacy.disabled).toBeFalse();
  });
  it('opens the control for the selected period and validates the signature before saving',()=>{
    const {component,http}=fixture();component.start(component.tasks[0]);
    expect(component.contextPayload().taskId).toBe(4);expect(component.workDescription).toContain('30/11/2026');expect(component.answers['esito']).toBe('');
    component.saveControl();expect(http.post).not.toHaveBeenCalled();expect(component.error).toContain('firma');
  });
  it('opens a new internal control when crypto.randomUUID is unavailable', () => {
    spyOnProperty(window, 'crypto', 'get').and.returnValue({} as Crypto);
    const { component } = fixture();
    component.start();
    expect(component.showForm).toBeTrue();
    expect(component.answers['esito']).toBe('');
    expect(component.workReference).toBe('');
  });
  it('creates a work sheet reference when crypto.randomUUID is unavailable', () => {
    const browserCrypto = window.crypto;
    spyOnProperty(window, 'crypto', 'get').and.returnValue({
      getRandomValues: browserCrypto.getRandomValues.bind(browserCrypto),
    } as Crypto);
    const { component } = fixture('work_completion', ['WORK_COMPLETION_MANAGE']);
    component.start();
    expect(component.showForm).toBeTrue();
    const reference = component.contextPayload().workReference;
    expect(reference).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    component.start();
    expect(component.contextPayload().workReference).not.toBe(reference);
  });
  it('does not treat view-only access or an archived client as permission to compile',()=>{
    const {component}=fixture('quality_control',['QUALITY_CONTROL_VIEW']);expect(component.canManage).toBeFalse();
    const managed=fixture().component;managed.data.customer.active=false;expect(managed.canManage).toBeFalse();
  });
  it('does not send client requests when the work or period is missing',async()=>{
    const {component,http,popup}=fixture('work_completion',['WORK_COMPLETION_MANAGE']);component.start(component.tasks[0]);component.workDescription='';await component.sendRequest();expect(popup.choose).not.toHaveBeenCalled();expect(http.post).not.toHaveBeenCalled();
  });
  it('requires an explicit choice between an extra and the next scheduled assessment', () => {
    const { component } = fixture('work_completion', ['WORK_COMPLETION_MANAGE']);
    component.data.categories[0].extraWorkPeriod = { periodStart: '2026-11-04', periodEnd: '2026-11-26' };
    component.data.categories[0].nextWorkPeriod = { periodStart: '2026-11-04', periodEnd: '2026-12-26', dueOn: '2026-12-26' };
    component.data.tasks = [];
    component.categoryKey = '';
    component.start(null, 'paper');
    expect(component.showForm).toBeTrue();
    expect(component.workSheetAction).toBe('paper');
    expect(component.workSheetContextReady).toBeFalse();
    component.selectWorkSheetCategory('pulizie');
    expect(component.workSheetContextReady).toBeFalse();
    component.selectEvaluationPeriod('extra');
    expect(component.contextPayload()).toEqual(jasmine.objectContaining({ taskId: null, periodMode: 'extra' }));
    component.selectEvaluationPeriod('next');
    expect(component.workSheetContextReady).toBeTrue();
    expect(component.contextPayload()).toEqual(jasmine.objectContaining({ taskId: null, periodMode: 'current', plannedDueOn: '2026-12-26' }));
    expect(component.workDescription).toBe('04/11/2026 – 26/12/2026');
  });
  it('prepares the on-device public questionnaire using the manual channel', () => {
    const { component, http, popup } = fixture('work_completion', ['WORK_COMPLETION_MANAGE']);
    const approvalUrl = 'https://example.test/work-completion-accept/test';
    http.post.and.returnValue(of({ ok: true, approvalUrl }));
    component.start(component.tasks[0], 'onsite');
    component.prepareOnsiteQuestionnaire();
    expect(http.post).toHaveBeenCalledWith('/admin/work-completion/request',
      jasmine.objectContaining({ categoryKey: 'pulizie', taskId: 5, deliveryChannel: 'manual' }));
    expect(popup.choose).not.toHaveBeenCalled();
    expect(component.onsiteLink).toBe(approvalUrl);
  });
});

describe('PeriodicAssessmentSettingsComponent', () => {
  it('saves a frequency in weeks and switches away from a monthly fixed day', () => {
    const category = { key: 'ordinario', label: 'Ordinario', intervalMonths: 1, firstDueRule: 'fixed_day', fixedDay: 26 };
    const weekly = { intervalUnit: 'weeks', intervalCount: 2, firstDueRule: 'service_start', fixedDay: null };
    const http = { get: () => of({ categories: [category] }), put: jasmine.createSpy('put').and.returnValue(of(weekly)) };
    const settings = new PeriodicAssessmentSettingsComponent(http as any, { url: '/', hasPermission: () => true } as any);
    settings.ngOnInit();
    const item = settings.categories[0];
    settings.setIntervalUnit(item, 'weeks');
    item.intervalCount = 2;
    settings.save(item);
    expect(http.put).toHaveBeenCalledOnceWith('/admin/customer-quality/schedule-defaults/ordinario', weekly);
  });
  it('displays and saves separate settings for both workflows on the same category', async () => {
    const category = { key: 'ordinario', label: 'Ordinario', intervalMonths: 2, firstDueRule: 'service_start', fixedDay: null };
    const quality = { ...category, intervalMonths: 1, firstDueRule: 'fixed_day', fixedDay: 8, enabled: true };
    const http = {
      get: () => of({ categories: [category], qualityCategories: [quality] }),
      put: jasmine.createSpy('put').and.returnValue(of(quality)),
    };
    const permissions = ['WORK_COMPLETION_VIEW', 'QUALITY_CONTROL_VIEW', 'QUALITY_CONTROL_MANAGE'];
    await TestBed.configureTestingModule({
      imports: [PeriodicAssessmentSettingsComponent],
      providers: [
        provideRouter([]),
        { provide: HttpClient, useValue: http },
        { provide: GlobalService, useValue: { url: '/', hasPermission: (key: string) => permissions.includes(key) } },
      ],
    }).compileComponents();
    const view = TestBed.createComponent(PeriodicAssessmentSettingsComponent);
    view.detectChanges();
    await view.whenStable();
    const forms: HTMLFormElement[] = Array.from(view.nativeElement.querySelectorAll('form'));
    expect(view.nativeElement.textContent).toContain('Valutazioni dei clienti');
    expect(view.nativeElement.textContent).toContain('Controlli qualità interni');
    expect(forms[0].querySelector('button[type="submit"]')).toBeNull();
    forms[1].querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(http.put).toHaveBeenCalledOnceWith('/admin/customer-quality/schedule-defaults/ordinario/quality_control',
      { intervalMonths: 1, firstDueRule: 'fixed_day', fixedDay: 8, enabled: true });
    expect(view.componentInstance.categories[0].intervalCount).toBe(2);
  });

  it('loads and saves the company cadence and first due date rule by category for authorized users', () => {
    const categories = [{ key: 'ordinario', label: 'Ordinario', intervalMonths: 1, firstDueRule: null, fixedDay: null }];
    const http = {
      get: jasmine.createSpy('get').and.returnValue(of({ categories })),
      put: jasmine.createSpy('put').and.returnValue(of({ intervalMonths: 3, firstDueRule: 'fixed_day', fixedDay: 10 })),
    };
    let canManage = false;
    const global = { url: '/', hasPermission: (key: string) => canManage && key === 'WORK_COMPLETION_MANAGE' };
    const settings = new PeriodicAssessmentSettingsComponent(http as any, global as any);
    settings.ngOnInit();
    expect(http.get).toHaveBeenCalledWith('/admin/customer-quality/schedule-defaults');
    const category = settings.categories[0];
    expect(category.firstDueRule).toBe('service_start');
    expect(category.configured).toBeFalse();
    category.intervalCount = 3;
    settings.save(category);
    expect(http.put).not.toHaveBeenCalled();
    canManage = true;
    category.firstDueRule = 'fixed_day';
    category.fixedDay = 32;
    settings.save(category);
    expect(http.put).not.toHaveBeenCalled();
    category.fixedDay = 10;
    settings.save(category);
    expect(http.put).toHaveBeenCalledOnceWith('/admin/customer-quality/schedule-defaults/ordinario',
      { intervalMonths: 3, firstDueRule: 'fixed_day', fixedDay: 10 });
    expect(category.configured).toBeTrue();
    expect(settings.message).toContain('Ordinario');
  });
});
