import { InternalWarehouseComponent } from './internal-warehouse.component';
import { of } from 'rxjs';

describe('InternalWarehouseComponent reference labels', () => {
  function createComponent(): InternalWarehouseComponent {
    const global = {
      getRecordDisplayName: (_type: string, record: any) =>
        `${record?.nome || ''} ${record?.cognome || ''}`.trim() || record?.ragioneSociale || '',
      hasPermission: () => true,
    };
    return new InternalWarehouseComponent(
      {} as any,
      { snapshot: { queryParamMap: { get: () => null } } } as any,
      {} as any,
      global as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it('shows the customer number in search results and in the selected value', () => {
    const component = createComponent();
    const customer = { numeroCliente: '1042', nome: 'Alessio', cognome: 'Veratti' };

    expect(component.customerReferenceLabel(customer)).toBe('#1042 · Alessio Veratti');

    component.selectAdminRequestCustomer(customer);

    expect(component.adminRequestForm.customerId).toBe('1042');
    expect(component.adminRequestSearch.customer).toBe('#1042 · Alessio Veratti');
  });

  it('keeps homonymous customers distinguishable by their customer number', () => {
    const component = createComponent();
    const first = component.customerReferenceLabel({ numeroCliente: '1042', nome: 'Alessio', cognome: 'Veratti' });
    const second = component.customerReferenceLabel({ numeroCliente: '2099', nome: 'Alessio', cognome: 'Veratti' });

    expect(first).toBe('#1042 · Alessio Veratti');
    expect(second).toBe('#2099 · Alessio Veratti');
    expect(first).not.toBe(second);
  });

  it('also shows the employee id in employee selectors', () => {
    const component = createComponent();
    const employee = { id: 77, nome: 'Mario', cognome: 'Rossi' };

    component.selectAdminRequestEmployee(employee);

    expect(component.adminRequestForm.employeeId).toBe(77);
    expect(component.adminRequestSearch.employee).toBe('#77 · Mario Rossi');
  });

  it('separates every material-order operational state without an all-orders view', () => {
    const component = createComponent();
    component.materialOrders = [
      { id: 1, status: 'approved', items: [] },
      { id: 2, status: 'requested', items: [] },
      { id: 3, status: 'preparing', items: [] },
      { id: 4, status: 'prepared', items: [] },
      { id: 5, status: 'ready', items: [] },
      { id: 6, status: 'partially_delivered', items: [] },
      { id: 7, status: 'completed', items: [] },
      { id: 8, status: 'cancelled', items: [] },
    ];

    component.materialOrderStatusView = 'to-prepare';
    expect(component.filteredMaterialOrders.map((order) => order.id)).toEqual([1, 2]);

    component.materialOrderStatusView = 'preparing';
    expect(component.filteredMaterialOrders.map((order) => order.id)).toEqual([3]);

    component.materialOrderStatusView = 'prepared';
    expect(component.filteredMaterialOrders.map((order) => order.id)).toEqual([4]);

    component.materialOrderStatusView = 'waiting-customer';
    expect(component.filteredMaterialOrders.map((order) => order.id)).toEqual([5]);

    component.materialOrderStatusView = 'partially-delivered';
    expect(component.filteredMaterialOrders.map((order) => order.id)).toEqual([6]);

    component.materialOrderStatusView = 'completed';
    expect(component.filteredMaterialOrders.map((order) => order.id)).toEqual([7]);

    component.materialOrderStatusView = 'cancelled';
    expect(component.filteredMaterialOrders.map((order) => order.id)).toEqual([8]);
  });

  it('uses employee data embedded in material orders when reference lists are unavailable', () => {
    const component = createComponent();
    component.references = { ...component.references, employees: [] };
    const order = {
      recipientEmployeeId: 58,
      recipientEmployee: { id: 58, nome: 'Mario', cognome: 'Rossi' },
      preparationEmployeeId: 59,
      preparationEmployee: { id: 59, nome: 'Giulia', cognome: 'Bianchi' },
    };

    expect(component.materialOrderRecipient(order)).toContain('Mario Rossi');
    expect(component.materialOrderPreparationEmployee(order)).toContain('Giulia Bianchi');
  });

  it('filters and selects material-order customer and employee references', () => {
    const component = createComponent();
    const customer = { numeroCliente: '1042', nome: 'Alessio', cognome: 'Veratti' };
    const preparer = {
      id: 77,
      nome: 'Mario',
      cognome: 'Rossi',
      warehousePreparationEnabled: true,
    };
    const notEnabled = {
      id: 88,
      nome: 'Giulia',
      cognome: 'Bianchi',
      warehousePreparationEnabled: false,
    };
    component.references = {
      ...component.references,
      customers: [customer],
      employees: [preparer, notEnabled],
    };

    component.materialOrderReferenceSearch.customer = 'veratti';
    expect(component.materialOrderReferenceOptions('customer')).toEqual([customer]);
    component.selectMaterialOrderReference('customer', customer);
    expect(component.materialOrderForm.customerId).toBe('1042');

    component.materialOrderReferenceSearch.preparation = '';
    expect(component.materialOrderReferenceOptions('preparation')).toEqual([preparer]);
    component.selectMaterialOrderReference('preparation', preparer);
    expect(component.materialOrderForm.preparationEmployeeId).toBe(77);
    expect(component.materialOrderReferenceSearch.preparation).toBe('#77 · Mario Rossi');
  });

  it('keeps customer and employee material-order recipients mutually exclusive', () => {
    const component = createComponent();
    const customer = { numeroCliente: '1042', nome: 'Alessio', cognome: 'Veratti' };
    const employee = { id: 77, nome: 'Mario', cognome: 'Rossi' };

    component.selectMaterialOrderReference('recipient', employee);
    expect(component.materialOrderForm.recipientEmployeeId).toBe(77);
    expect(component.materialOrderForm.customerId).toBe('');
    expect(component.isMaterialOrderReferenceDisabled('customer')).toBeTrue();

    component.clearMaterialOrderReference('recipient');
    component.selectMaterialOrderReference('customer', customer);
    expect(component.materialOrderForm.customerId).toBe('1042');
    expect(component.materialOrderForm.recipientEmployeeId).toBe(0);
    expect(component.isMaterialOrderReferenceDisabled('recipient')).toBeTrue();
  });

  it('uses the optional customer as destination for employee material requests', () => {
    const component = createComponent();

    expect(component.materialOrderDestinationFromRequest({
      customerId: '1042',
      employeeId: 77,
    } as any)).toEqual({ customerId: '1042', recipientEmployeeId: 0 });
    expect(component.materialOrderDestinationFromRequest({
      customerId: null,
      employeeId: 77,
    } as any)).toEqual({ customerId: '', recipientEmployeeId: 77 });
  });

  it('allows the office to prepare an order without assigning an employee', () => {
    const component = createComponent();
    expect(component.materialOrderPreparationEmployee({ preparationEmployeeId: null })).toBe('Ufficio');
    expect(component.canMarkMaterialOrderPrepared({ status: 'approved', preparationEmployeeId: null })).toBeTrue();
    expect(component.canMarkMaterialOrderPrepared({ status: 'approved', preparationEmployeeId: 77 })).toBeFalse();
  });

  it('enforces preparation confirmation before material dispatch', () => {
    const component = createComponent();
    const item = { requestedQuantity: 2, deliveredQuantity: 0 };

    expect(component.canMarkMaterialOrderPrepared({ status: 'preparing', items: [item] })).toBeTrue();
    expect(component.canDeliverMaterialOrder({ status: 'preparing', items: [item] })).toBeFalse();
    expect(component.canDeliverMaterialOrder({ status: 'prepared', items: [item] })).toBeTrue();
    expect(component.canDeliverMaterialOrder({ status: 'partially_delivered', items: [item] })).toBeTrue();
    expect(component.canDeliverMaterialOrder({ status: 'ready', items: [item] })).toBeFalse();
  });

  it('distinguishes an exact preparation from one that needs an admin override', () => {
    const component = createComponent();

    expect(component.materialOrderPreparationIsExact({
      items: [{ requestedQuantity: 1, preparedQuantity: 0 }],
    })).toBeFalse();
    expect(component.materialOrderPreparationIsExact({
      items: [
        { requestedQuantity: 1, preparedQuantity: 1 },
        { requestedQuantity: 2.5, preparedQuantity: 2.5 },
      ],
    })).toBeTrue();
    expect(component.materialOrderPreparationIsExact({ items: [] })).toBeFalse();
  });

  it('sends the explicit force flag only after confirming an incomplete preparation', async () => {
    const posts: Array<{ url: string; body: any }> = [];
    const http = {
      post: (url: string, body: any) => {
        posts.push({ url, body });
        return of({ order: { id: 41, status: 'prepared', items: [] }, forced: true });
      },
      get: () => of([]),
    };
    const popup = { confirm: async () => true };
    const router = { navigate: async () => true };
    const route = { snapshot: { queryParamMap: { get: () => null } } };
    const global = {
      url: 'https://tenant.test/',
      getRecordDisplayName: () => '',
      hasPermission: () => true,
    };
    const component = new InternalWarehouseComponent(
      http as any,
      route as any,
      router as any,
      global as any,
      popup as any,
      {} as any,
      {} as any,
    );

    await component.markMaterialOrderPrepared({
      id: 41,
      status: 'preparing',
      items: [{ requestedQuantity: 1, preparedQuantity: 0 }],
    });

    expect(posts.length).toBe(1);
    expect(posts[0].url).toBe('https://tenant.test/admin/material-orders/41/mark-prepared');
    expect(posts[0].body).toEqual({ force: true });
    expect(component.materialOrderStatusView).toBe('prepared');
  });

  it('increments every warehouse quantity by one', () => {
    const component = createComponent();
    component.products = [
      { id: 10, unit: 'pz' } as any,
      { id: 11, unit: 'kg' } as any,
    ];

    expect(component.quantityStepForProduct(10)).toBe('1');
    expect(component.quantityMinForProduct(10)).toBe('1');
    expect(component.quantityStepForProduct(11)).toBe('1');
    expect(component.quantityMinForProduct(11)).toBe('1');
  });

  it('shows physical, reserved and effectively available product quantities', () => {
    const component = createComponent();
    const product = {
      quantity: 5,
      physicalQuantity: 5,
      reservedQuantity: 3,
      availableQuantity: 2,
      active: true,
      isOutOfStock: false,
      isLowStock: false,
    } as any;

    expect(component.productPhysicalQuantity(product)).toBe(5);
    expect(component.productReservedQuantity(product)).toBe(3);
    expect(component.productAvailableQuantity(product)).toBe(2);
    expect(component.productStockStatusLabel(product)).toBe('Disponibile');
  });

  it('labels physically present stock as fully reserved when none remains available', () => {
    const component = createComponent();
    const product = {
      quantity: 1,
      physicalQuantity: 1,
      reservedQuantity: 1,
      availableQuantity: 0,
      active: true,
      isOutOfStock: false,
      isLowStock: false,
    } as any;

    expect(component.productStockStatusLabel(product)).toBe('Tutto riservato');
    expect(component.productStockStatusClass(product)).toBe('low');
  });

  it('blocks a direct material order when requested quantities exceed effective availability', () => {
    const component = createComponent();
    component.products = [{
      id: 10,
      name: 'Guanti',
      unit: 'pz',
      quantity: 5,
      physicalQuantity: 5,
      reservedQuantity: 3,
      availableQuantity: 2,
    } as any];
    component.materialOrderSourceRequestId = 0;
    component.materialOrderForm.items = [
      { productId: 10, quantity: 2 },
      { productId: 10, quantity: 1 },
    ];

    expect(component.materialOrderRequestedQuantityForProduct(10)).toBe(3);
    expect(component.directMaterialOrderAvailabilityError()).toContain('Guanti: richiesti 3 pz, disponibili 2 pz');
  });

  it('keeps request-derived partial orders governed by the server-side fresh check', () => {
    const component = createComponent();
    component.materialOrderSourceRequestId = 91;
    component.materialOrderForm.items = [{ productId: 10, quantity: 3 }];

    expect(component.directMaterialOrderAvailabilityError()).toBe('');
  });

  it('sets planned delivery end thirty minutes after its start', () => {
    const component = createComponent();

    component.onMaterialOrderScheduledStartChange('2026-08-03T10:00');
    expect(component.materialOrderForm.scheduledEnd).toBe('2026-08-03T10:30');

    component.onMaterialOrderScheduledStartChange('2026-08-03T23:50');
    expect(component.materialOrderForm.scheduledEnd).toBe('2026-08-04T00:20');

    component.onMaterialOrderScheduledStartChange('');
    expect(component.materialOrderForm.scheduledEnd).toBe('');

    component.onMaterialOrderAssignmentScheduledStartChange('2026-08-03T15:45');
    expect(component.materialOrderAssignmentForm.scheduledEnd).toBe('2026-08-03T16:15');
  });

  it('allows delivery planning after office preparation', () => {
    const component = createComponent();
    const order = {
      status: 'prepared',
      deliveryMode: 'planned',
      scheduledStart: '2026-08-03T10:00:00.000Z',
      scheduledEnd: '2026-08-03T10:30:00.000Z',
      deliveryEmployeeId: 30,
    };
    spyOn(component, 'loadReferences');

    component.startMaterialOrderAssignmentEdit(order);

    expect(component.editingMaterialOrderAssignment).toBeTrue();
    expect(component.materialOrderAssignmentForm.deliveryMode).toBe('planned');
    expect(component.materialOrderAssignmentForm.deliveryEmployeeId).toBe(30);
  });

  it('does not expose a per-order switch that can disable the delivery document', () => {
    const component = createComponent();

    expect(Object.prototype.hasOwnProperty.call(component.materialOrderForm, 'generateDocument')).toBeFalse();
    component.materialOrderStatusView = 'waiting-customer';
    expect(component.materialOrderStatusViewLabel).toBe('In attesa firma destinatario');
  });
});
