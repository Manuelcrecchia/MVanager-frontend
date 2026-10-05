import { BehaviorSubject } from 'rxjs';
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
      { retireShiftAutosaves: () => Promise.resolve(), operations: new BehaviorSubject([]), acknowledge: jasmine.createSpy('acknowledge').and.resolveTo() } as any,
    );
  }

  it('reorders silently and sends the complete order only on final save', async () => {
    const component = createComponent(), post = jasmine.createSpy('post').and.returnValue({ subscribe: () => {} });
    (component as any).http = { post };
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') };
    spyOn(window, 'alert');
    component.appointments = [{ id: 'a', duration: 60 }, { id: 'b', duration: 60 }];
    const jobs = [...component.appointments];
    component.dropForEmployee({ container: { data: jobs }, previousIndex: 0, currentIndex: 1 } as any, 10);
    expect(post).not.toHaveBeenCalled(); expect(window.alert).not.toHaveBeenCalled();
    const saving = component.finalSave(); await component.finalSave(); await saving;
    expect(post.calls.count()).toBe(1); expect(component.isSaving).toBeTrue();
    const body = post.calls.mostRecent().args[1];
    expect(body.shifts[0].sortOrderByEmployee[10]).toBe(1); expect(body.shifts[1].sortOrderByEmployee[10]).toBe(0);
    expect(component.saveStatus).toBe('Salvataggio in corso…');
  });
  it('shows queued saves inline and never asks to force-save an unrelated conflict', async () => {
    const component = createComponent(); let handler: any;
    component.appointments = [{ id: 'a', duration: 60 }];
    (component as any).http = { post: () => ({ subscribe: (value: any) => handler = value }) };
    spyOn(window, 'alert');
    await component.finalSave();
    await handler.error({ status: 0, error: { code: 'OFFLINE_PENDING', state: 'waiting', error: 'Il server non ha risposto. Dati conservati sul dispositivo.' } });
    expect(component.isSaving).toBeFalse(); expect(component.saveStatus).toContain('Dati conservati'); expect(window.alert).not.toHaveBeenCalled();
    await component.finalSave(); await handler.error({ status: 409, error: { code: 'OFFLINE_BUSY', error: 'Invio precedente in corso' } });
    expect((component as any).appDialog.confirm).not.toHaveBeenCalled(); expect(window.alert).toHaveBeenCalled();
  });
  it('recovers local ordering and assignments for the selected day while retaining fresh server IDs', async () => {
    const component = createComponent(), saveDraft = jasmine.createSpy('saveDraft').and.resolveTo();
    component.selectedDate = new Date(2026, 9, 5);
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') };
    component.appointments = [{ id: 'a', shiftId: 55, duration: 60 }, { id: 'b', duration: 30 }];
    (component as any).offline = {
      session: () => ({ owner: 'test-owner' }), registerDraftPage: () => () => {}, refresh: () => Promise.resolve(),
      operations: new BehaviorSubject([]), notice: new BehaviorSubject(''), saveDraft,
      loadDraft: () => Promise.resolve({ appointments: [{ id: 'a', shiftId: 44, title: 'Bozza', duration: 90, startDate: '2026-10-05T08:00:00.000Z', sortOrderByEmployee: { 10: 1 } }], assignedShifts: { a: [10] } }),
    };
    await (component as any).protectShiftDraft(); await (component as any).shiftDraft.ready;
    expect(component.appointments[0].shiftId).toBe(55); expect(component.appointments[0].title).toBe('Bozza');
    expect(component.appointments[0].startDate instanceof Date).toBeTrue(); expect(component.assignedShifts['a']).toEqual([10]);
    expect(component.appointments.length).toBe(2);
    component.onDescriptionChange(component.appointments[0], 'Modifica');
    await Promise.resolve();
    expect(saveDraft.calls.mostRecent().args[1]).toContain('shift-day:2026-10-05');
    component.ngOnDestroy();
  });
  it('accepts a background receipt without asking the user to verify the save', () => {
    const component = createComponent(), clear = jasmine.createSpy('clear').and.resolveTo();
    component.selectedDate = new Date(2026, 9, 5); component.appointments = [{ id: 'a', duration: 60 }];
    (component as any).router = { navigate: jasmine.createSpy('navigate') };
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') };
    const row = { id: 'pending', state: 'done', response: { body: { savedShifts: [] } } };
    (component as any).offline.operations.next([row]);
    (component as any).pendingSave = { id: row.id, date: '2026-10-05', snapshot: JSON.stringify((component as any).shiftSnapshot()), draft: { clear } };
    (component as any).acceptQueuedConfirmation();
    expect(clear).toHaveBeenCalled(); expect((component as any).offline.acknowledge).toHaveBeenCalledWith(row);
    expect((component as any).router.navigate).toHaveBeenCalled(); expect(component.saveStatus).toBe('Turni salvati');
  });
  it('keeps edits made while offline and attaches the confirmed extra-job ID', () => {
    const component = createComponent(); component.selectedDate = new Date(2026, 9, 5);
    component.appointments = [{ id: 'extra-a', isExtra: true, title: 'Versione nuova', duration: 60 }];
    (component as any).shiftDraft = { flush: jasmine.createSpy('flush') };
    (component as any).offline.operations.next([{ id: 'pending', state: 'done', response: { body: { savedShifts: [{ clientId: 'extra-a', shiftId: 99 }] } } }]);
    (component as any).pendingSave = { id: 'pending', date: '2026-10-05', snapshot: 'older snapshot' };
    (component as any).acceptQueuedConfirmation();
    expect(component.appointments[0].title).toBe('Versione nuova'); expect(component.appointments[0].shiftId).toBe(99);
    expect(component.saveStatus).toContain('nuove modifiche'); expect((component as any).offline.acknowledge).not.toHaveBeenCalled();
  });
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

  it('includes the selected customer only in the final extra-shift save', async () => {
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

    await component.finalSave();

    const requestBody = post.calls.mostRecent().args[1];
    expect(requestBody.shifts[0].appointmentId).toBeNull();
    expect(requestBody.shifts[0].customerNumero).toBe('121');
  });
});
