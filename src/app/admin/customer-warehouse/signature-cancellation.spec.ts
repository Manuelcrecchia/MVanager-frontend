import { CustomerWarehouseComponent } from './customer-warehouse.component';

describe('Warehouse signature confirmation', () => {
  for (const method of ['requestSignature', 'completeSignature'] as const) {
    it('does not submit when the dialog is cancelled: ' + method, async () => {
      const post = jasmine.createSpy();
      const component = new CustomerWarehouseComponent({ post } as any, {} as any, {} as any,
        { prompt: async () => null } as any);
      component.selected = { id: 1 };
      await component[method]();
      expect(post).not.toHaveBeenCalled();
      expect(component.loading).toBeFalse();
    });
    it('does not submit to a different practice after the dialog: ' + method, async () => {
      const post = jasmine.createSpy();
      let resolve!: (value: string) => void;
      const component = new CustomerWarehouseComponent({ post } as any, {} as any, {} as any,
        { prompt: () => new Promise<string>(r => resolve = r) } as any);
      component.selected = { id: 1 };
      const pending = component[method]();
      component.selected = { id: 2 }; resolve('nota');
      await pending;
      expect(post).not.toHaveBeenCalled();
    });
  }
});
