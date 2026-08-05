import { ListCustomerComponent } from './list-customer.component';

describe('ListCustomerComponent', () => {
  it('should be exported', () => {
    expect(ListCustomerComponent).toBeTruthy();
  });

  it('ordina alfabeticamente per impostazione predefinita e usa il numero cliente come spareggio', () => {
    const component = new ListCustomerComponent(null as any, null as any, null as any, null as any, null as any, null as any, null as any, null as any);
    spyOn(component, 'getCustomerDisplayName').and.callFake((customer: any) => customer.name);

    component.customers = [
      { numeroCliente: '10', name: 'Zeta' },
      { numeroCliente: '12', name: 'Alfa' },
      { numeroCliente: '2', name: 'Alfa' },
    ];
    component.applyCustomerSearch();

    expect(component.customersFrEnd.map((customer) => customer.numeroCliente)).toEqual(['2', '12', '10']);
  });

  it('ordina il numero cliente in modo numerico crescente e decrescente', () => {
    const component = new ListCustomerComponent(null as any, null as any, null as any, null as any, null as any, null as any, null as any, null as any);
    component.customers = [{ numeroCliente: '101' }, { numeroCliente: '11' }, { numeroCliente: '2' }];

    component.customerSort = 'numberAsc';
    component.applyCustomerSearch();
    expect(component.customersFrEnd.map((customer) => customer.numeroCliente)).toEqual(['2', '11', '101']);

    component.customerSort = 'numberDesc';
    component.applyCustomerSearch();
    expect(component.customersFrEnd.map((customer) => customer.numeroCliente)).toEqual(['101', '11', '2']);
  });
});
