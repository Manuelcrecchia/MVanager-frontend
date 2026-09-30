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

  it('recalculates the assignment dialog end time from the current duration', () => {
    const component = createComponent();
    const open = jasmine.createSpy('open').and.returnValue({
      afterClosed: () => ({ subscribe: () => undefined }),
    });
    (component as any).dialog = { open };
    component.selectedDate = new Date(2026, 7, 17);
    const app = {
      id: 'job-3',
      startDate: new Date(2026, 7, 17, 10, 0),
      endDate: new Date(2026, 7, 17, 10, 0),
      duration: 60,
    };

    component.openAssignmentDialog(app);

    const dialogConfig = open.calls.mostRecent().args[1];
    expect(dialogConfig.data.startDate).toEqual(new Date(2026, 7, 17, 10, 0));
    expect(dialogConfig.data.endDate).toEqual(new Date(2026, 7, 17, 11, 0));
  });

  it('filters customers while the user types an extra-job title', () => {
    const component = createComponent();
    component.extraCustomerOptions = [
      { numeroCliente: '121', tipoCliente: 'O', displayName: 'DORMITORIO' },
      { numeroCliente: '205', tipoCliente: 'S', displayName: 'Magazzino Centro' },
    ];
    const app = {
      id: 'extra-1',
      isExtra: true,
      title: 'dormi',
      extraCustomerAutocompleteOpen: true,
    };

    expect(component.getFilteredExtraCustomers(app)).toEqual([
      { numeroCliente: '121', tipoCliente: 'O', displayName: 'DORMITORIO' },
    ]);
  });

  it('links a selected customer and clears the link when the title is edited', () => {
    const component = createComponent();
    spyOn<any>(component, 'scheduleAutosave');
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') };
    const app: any = { id: 'extra-2', isExtra: true, title: 'dormi' };
    const customer = {
      numeroCliente: '121',
      tipoCliente: 'O',
      displayName: 'DORMITORIO',
    };

    component.selectExtraCustomer(app, customer);

    expect(app.title).toBe('121 - DORMITORIO');
    expect(app.selectedCustomerNumero).toBe('121');
    expect(app.selectedCustomerType).toBe('O');

    component.onTitleChange(app, 'Dormitorio notte');
    expect(app.selectedCustomerNumero).toBeNull();
  });

  it('includes the selected customer only in the final extra-shift save', () => {
    const component = createComponent();
    const post = jasmine.createSpy('post').and.callFake((_url: string, body: any) => ({
      subscribe: (handlers: any) => handlers.next(),
    }));
    (component as any).http = { post };
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') };
    (component as any).router = { navigate: jasmine.createSpy('navigate') };
    spyOn(window, 'alert');
    component.selectedDate = new Date(2026, 7, 6);
    component.appointments = [{
      id: 'extra-3',
      shiftId: 88,
      isExtra: true,
      title: '121 - DORMITORIO',
      selectedCustomerNumero: '121',
      startDate: new Date(2026, 7, 6, 8, 0),
      duration: 60,
    }];

    component.finalSave();

    const requestBody = post.calls.mostRecent().args[1];
    expect(requestBody.shifts[0].appointmentId).toBeNull();
    expect(requestBody.shifts[0].customerNumero).toBe('121');
  });
});
