import { CreateShiftComponent } from './create-shift.component';

describe('CreateShiftComponent', () => {
  it('should be exported', () => {
    expect(CreateShiftComponent).toBeTruthy();
  });

  function createComponent(): CreateShiftComponent {
    return new CreateShiftComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        hasTenantFeature: () => true,
        getRecordValueByRole: () => null,
      } as any,
      {} as any,
      {} as any,
    );
  }

  it('warns immediately when work starts before the customer opens', () => {
    const component = createComponent();
    component.selectedDate = new Date(2026, 6, 27);
    const app = {
      startDate: new Date(2026, 6, 27, 7, 30),
      duration: 60,
      customer: {
        key: false,
        orarioAccessoDa: '08:00',
        orarioAccessoA: '12:00',
      },
    };

    expect(component.getCustomerAccessWarning(app))
      .toBe('Orario non valido: il cliente apre alle 08:00.');
  });

  it('warns immediately when the calculated end exceeds closing time', () => {
    const component = createComponent();
    component.selectedDate = new Date(2026, 6, 27);
    const app = {
      startDate: new Date(2026, 6, 27, 11, 30),
      duration: 60,
      customer: {
        key: false,
        orarioAccessoDa: '08:00',
        orarioAccessoA: '12:00',
      },
    };

    expect(component.getCustomerAccessWarning(app))
      .toBe('Il lavoro terminerebbe alle 12:30, dopo la chiusura del cliente alle 12:00.');
  });

  it('does not apply opening-hour warnings to customers with keys', () => {
    const component = createComponent();
    component.selectedDate = new Date(2026, 6, 27);
    const app = {
      startDate: new Date(2026, 6, 27, 4, 0),
      duration: 600,
      customer: {
        key: true,
        orarioAccessoDa: '08:00',
        orarioAccessoA: '12:00',
      },
    };

    expect(component.getCustomerAccessWarning(app)).toBe('');
  });
});
