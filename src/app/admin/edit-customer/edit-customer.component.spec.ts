import { EditCustomerComponent } from './edit-customer.component';
import { Subject } from 'rxjs';

describe('EditCustomerComponent', () => {
  it('should be exported', () => {
    expect(EditCustomerComponent).toBeTruthy();
  });
  it('permits credential resets only after loading the requested customer and checking the account permission', async () => {
    const component: any = Object.create(EditCustomerComponent.prototype);
    let allowed = true;
    component.globalService = { url: 'https://api.test/', headers: {}, hasTenantFeature: () => true, hasPermission: () => allowed };
    component.customerModelService = { numeroCliente: 'previous', reset() { this.numeroCliente = ''; } };
    component.syncCustomerFieldRules = () => {};
    const loading = new Subject<any>();
    component.http = { post: jasmine.createSpy('post').and.returnValue(loading) };
    component.caricaClienteFromDb('1');
    expect(component.canManageCustomerAccounts).toBeFalse();
    await component.regeneratePortalPassword();
    expect(component.http.post).toHaveBeenCalledTimes(1);
    loading.next([{ numeroCliente: '1' }]); loading.complete();
    expect(component.canManageCustomerAccounts).toBeTrue();
    allowed = false;
    expect(component.canManageCustomerAccounts).toBeFalse();
    await component.regeneratePortalPassword();
    expect(component.http.post).toHaveBeenCalledTimes(1);
  });
  for (const rejectVehicle of [false, true]) {
    it(`waits for each resource save before starting the next (${rejectVehicle ? 'rejected' : 'confirmed'} vehicle)`, async () => {
      const component: any = Object.create(EditCustomerComponent.prototype);
      Object.defineProperty(component, 'canConfigureVehicleRequirements', { value: true });
      Object.defineProperty(component, 'canConfigureEquipmentRequirements', { value: true });
      component.globalService = { url: 'https://api.test/', headers: {} };
      component.vehicleRequirementMode = component.equipmentRequirementMode = 'category';
      component.vehicleCategories = component.equipmentCategories = [];
      component.vehicleRequirementCounts = component.equipmentCategoryRequirementCounts = {};
      component.selectedVehicleIds = {};
      const calls: string[] = [], responses: Subject<any>[] = [];
      component.http = { post: (url: string) => {
        calls.push(url); const response = new Subject<any>(); responses.push(response); return response;
      } };
      const done = jasmine.createSpy('done');
      const saving = component.saveResourceRequirements('517', done);
      expect(calls).toEqual(['https://api.test/admin/resource-categories/vehicle/customer/517']);
      expect(done).not.toHaveBeenCalled();
      if (rejectVehicle) responses[0].error({ status: 409 });
      else { responses[0].next({ ok: true }); responses[0].complete(); }
      for (let index = 0; index < 6; index++) await Promise.resolve();
      expect(calls[1]).toBe('https://api.test/admin/customer-specific-resources/vehicle/customer/517');
      expect(calls.length).toBe(2);
      responses[1].next({ ok: true }); responses[1].complete();
      for (let index = 0; index < 6; index++) await Promise.resolve();
      expect(calls[2]).toBe('https://api.test/admin/resource-categories/equipment/customer/517');
      expect(done).not.toHaveBeenCalled();
      responses[2].next({ ok: true }); responses[2].complete();
      await saving;
      expect(done).toHaveBeenCalledTimes(1);
    });
  }
  it('sends customer questionnaire overrides after dynamic fields have been mapped', () => {
    const source:any={numeroCliente:'1',tipoCliente:'standard',reset:()=>{}};
    const http:any={post:jasmine.createSpy('post').and.returnValue(new Subject())};
    const global:any={url:'/api/',headers:{},getMissingRequiredFields:()=>[],userCode:'TEST',applyFieldMappingToPayload:()=>({numeroCliente:'1'})};
    const component=new EditCustomerComponent(source,http,global,{} as any,{} as any,{} as any,{} as any);
    spyOn(component as any,'validateAccessHours').and.returnValue(true);
    spyOn(component as any,'getTechnicalAccessPayload').and.returnValue({});
    component.workRegisterConfig={mode:'custom',title:'Registro',questions:[{key:'scale',label:'Scale e corrimano',type:'checkbox',options:[]}]};
    component.editCustomer();
    expect(http.post.calls.mostRecent().args[1].workRegisterConfig).toEqual(component.workRegisterConfig);
    component.workRegisterConfig=undefined;component.editCustomer();
    expect(http.post.calls.mostRecent().args[1].workRegisterConfig).toBeUndefined();
  });

});
