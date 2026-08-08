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
      { confirm: jasmine.createSpy('confirm').and.resolveTo(true) } as any,
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

  it('reports a one-hour job as uncovered when the only employee covers half an hour', () => {
    const component = createComponent();
    const app = { id: 'job-1', duration: 60, requiredEmployees: 1 };
    component.assignedShifts[app.id] = [10];
    component.assignedEmployeeDurations[app.id] = { 10: 30 };

    expect(component.isComplete(app)).toBeFalse();
    expect(component.getCoverageWarning(app)).toContain('00.30 su 01.00');
  });

  it('reports a one-hour job as covered by two employees for half an hour each', () => {
    const component = createComponent();
    const app = { id: 'job-2', duration: 60, requiredEmployees: 1 };
    component.assignedShifts[app.id] = [10, 11];
    component.assignedEmployeeDurations[app.id] = { 10: 30, 11: 30 };

    expect(component.isComplete(app)).toBeTrue();
    expect(component.getCoverageWarning(app)).toBe('');
  });

  it('uses the customer total work hours instead of the single-employee shift duration', () => {
    const component = createComponent();
    const app = {
      id: '457',
      title: '457 - regvesrbv',
      duration: 30,
      requiredEmployees: 1,
      customer: { durataLavoroMinuti: 60 },
    };
    component.assignedShifts[app.id] = [10];

    expect(component.isComplete(app)).toBeFalse();
    expect(component.getCoverageWarning(app)).toContain('00.30 su 01.00');

    component.assignedShifts[app.id] = [10, 11];
    expect(component.isComplete(app)).toBeTrue();
  });
});
