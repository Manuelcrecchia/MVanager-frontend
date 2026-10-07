import { BehaviorSubject } from 'rxjs';
import { CreateShiftComponent } from './create-shift.component';

describe('CreateShiftComponent', async () => {
  it('should be exported', async () => {
    expect(CreateShiftComponent).toBeTruthy();
  });

  function createComponent(): CreateShiftComponent {
    const component = new CreateShiftComponent(
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
      { retireShiftAutosaves: () => Promise.resolve(), loadShiftIdentities: () => Promise.resolve({}), operations: new BehaviorSubject([]), acknowledge: jasmine.createSpy('acknowledge').and.resolveTo() } as any,
    );
    (component as any).shiftVersion = '"' + 'a'.repeat(64) + '"';
    return component;
  }

  it('stops an unversioned draft instead of submitting a blind overwrite', async () => {
    const component = createComponent(), post = jasmine.createSpy('post');
    (component as any).shiftVersion = '';
    (component as any).http = { post };
    component.appointments = [{ id: 'a', duration: 60 }];
    await component.finalSave(true);
    expect(post).not.toHaveBeenCalled(); expect(component.shiftConflict).toBeTrue();
  });
  it('retains the original day version and never offers force save for another device conflict', async () => {
    const component = createComponent(); let handler: any;
    (component as any).http = { post: jasmine.createSpy('post').and.callFake((_url, _body, options) => {
      expect(options.headers['If-Match']).toBe('"' + 'a'.repeat(64) + '"');
      return { subscribe: (value: any) => handler = value };
    }) };
    component.appointments = [{ id: 'a', duration: 60 }]; spyOn(window, 'alert');
    await component.finalSave(true);
    await handler.error({ status: 409, error: { code: 'SHIFT_VERSION_CONFLICT', error: 'Altro dispositivo' } });
    expect(component.shiftConflict).toBeTrue();
    expect((component as any).appDialog.confirm).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
  });
  it('never rebases another tab draft onto a receipt that accepted different edits', async () => {
    const component = createComponent(); component.selectedDate = new Date(2026, 9, 5);
    component.appointments = [{ id: 'a', duration: 60 }];
    const oldVersion = '"' + 'a'.repeat(64) + '"', newVersion = '"' + 'b'.repeat(64) + '"';
    (component as any).offline = {
      refresh: () => Promise.resolve(), loadShiftIdentities: () => Promise.resolve({}), loadDraft: () => Promise.resolve(null),
      loadDraftEntry: () => Promise.resolve({ writer: 'tab-b', savedAt: 1, value: { shiftVersion: oldVersion, appointments: [{ id: 'a', duration: 90 }] } }),
      operations: new BehaviorSubject([{ path: '/shifts/saveMultiple', state: 'done', draftWriter: 'tab-a', headers: { 'If-Match': oldVersion }, body: { type: 'json', value: { shifts: [{ data: '2026-10-05' }] } }, response: { body: { version: newVersion } } }]),
      session: () => ({ owner: 'test' }), registerDraftPage: () => () => {}, notice: new BehaviorSubject(''),
    };
    await (component as any).protectShiftDraft(); await (component as any).shiftDraft.ready;
    expect((component as any).shiftVersion).toBe(oldVersion); expect(component.appointments[0].duration).toBe(90);
    (component as any).shiftDraft.stop();
  });
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
  it('tracks an uncertain timeout inline and accepts its later receipt without losing the extra identity', async () => {
    const component = createComponent(); let handler: any;
    component.appointments = [{ id: 'extra-a', isExtra: true, duration: 60 }];
    (component as any).http = { post: () => ({ subscribe: (value: any) => handler = value }) };
    (component as any).router = { navigate: jasmine.createSpy('navigate') };
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') };
    spyOn(window, 'alert'); await component.finalSave(true);
    await handler.error({ status: 0, error: { code: 'OFFLINE_PENDING', state: 'blocked', operationId: 'timeout', error: 'Il server sta confermando il salvataggio.' } });
    expect(window.alert).not.toHaveBeenCalled(); expect(component.canRemoveExtra(component.appointments[0])).toBeFalse();
    (component as any).offline.operations.next([{ id: 'timeout', state: 'done', response: { body: { savedShifts: [{ clientId: 'extra-a', shiftId: 42 }] } } }]);
    await (component as any).acceptQueuedConfirmation();
    expect(component.appointments[0].shiftId).toBe(42); expect(component.saveStatus).toBe('Turni salvati');
    expect((component as any).router.navigate).toHaveBeenCalledTimes(1);
  });
  it('recovers local ordering and assignments for the selected day while retaining fresh server IDs', async () => {
    const component = createComponent(), saveDraft = jasmine.createSpy('saveDraft').and.resolveTo();
    component.selectedDate = new Date(2026, 9, 5);
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') };
    component.appointments = [{ id: 'a', shiftId: 55, duration: 60 }, { id: 'b', duration: 30 }];
    (component as any).offline = {
      session: () => ({ owner: 'test-owner' }), registerDraftPage: () => () => {}, refresh: () => Promise.resolve(),
      operations: new BehaviorSubject([]), notice: new BehaviorSubject(''), saveDraft,
      loadShiftIdentities: () => Promise.resolve({}), loadDraft: () => Promise.resolve(null), loadDraftEntry: () => Promise.resolve({ savedAt: 1, value: { appointments: [{ id: 'a', shiftId: 44, title: 'Bozza', duration: 90, startDate: '2026-10-05T08:00:00.000Z', sortOrderByEmployee: { 10: 1 } }], assignedShifts: { a: [10] } } }),
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
  it('recovers an extra already saved by an archived legacy request without adding it twice', async () => {
    const component = createComponent();
    component.selectedDate = new Date(2026, 9, 5);
    component.appointments = [{ id: 'extra-88', shiftId: 88, isExtra: true, title: 'Existing extra', duration: 60 }];
    (component as any).offline = {
      session: () => ({ owner: 'test-owner' }), registerDraftPage: () => () => {}, refresh: () => Promise.resolve(),
      operations: new BehaviorSubject([]), notice: new BehaviorSubject(''), saveDraft: () => Promise.resolve(),
      loadShiftIdentities: () => Promise.resolve({ 'draft-extra': 88 }),
      loadDraft: () => Promise.resolve(null), loadDraftEntry: () => Promise.resolve({ savedAt: 1, value: { appointments: [{ id: 'draft-extra', isExtra: true, title: 'Latest description', duration: 90 }], assignedShifts: { 'draft-extra': [10] } } }),
    };
    await (component as any).protectShiftDraft(); await (component as any).shiftDraft.ready;
    expect(component.appointments.length).toBe(1); expect(component.appointments[0].shiftId).toBe(88);
    expect(component.appointments[0].title).toBe('Latest description'); expect(component.assignedShifts['draft-extra']).toEqual([10]);
    component.ngOnDestroy();
  });
  it('persists recovered extra IDs in the draft and in the queued confirmation snapshot', async () => {
    const component = createComponent(), flush = jasmine.createSpy('flush');
    component.selectedDate = new Date(2026, 9, 5);
    component.appointments = [{ id: 'draft-extra', isExtra: true, title: 'Extra', duration: 60 }];
    (component as any).shiftDraft = { flush };
    (component as any).offline.retireShiftAutosaves = async (shifts: any[]) => { shifts[0].shiftId = 88; };
    (component as any).http = { post: () => ({ subscribe: (handlers: any) => handlers.error({ status: 0, error: { code: 'OFFLINE_PENDING', state: 'waiting', operationId: 'pending', error: 'Waiting' } }) }) };
    await component.finalSave();
    expect(component.appointments[0].shiftId).toBe(88); expect(flush.calls.count()).toBe(2);
    expect(JSON.parse((component as any).pendingSave.snapshot).appointments[0].shiftId).toBe(88);
  });
  it('keeps confirmed extra IDs when another legacy request stops retirement midway', async () => {
    const component = createComponent(), post = jasmine.createSpy('post').and.returnValue({ subscribe: () => {} });
    component.appointments = [{ id: 'draft-extra', isExtra: true, title: 'Extra', duration: 60 }];
    const persistedIds: number[] = [];
    (component as any).shiftDraft = { flush: () => persistedIds.push(component.appointments[0].shiftId) };
    (component as any).http = { post };
    (component as any).offline.retireShiftAutosaves = async (shifts: any[]) => {
      shifts[0].shiftId = 88;
      throw { error: { error: 'Un altro salvataggio è ancora in corso.' } };
    };
    await component.finalSave();
    expect(component.isSaving).toBeFalse(); expect(post).not.toHaveBeenCalled();
    expect(component.appointments[0].shiftId).toBe(88); expect(persistedIds[persistedIds.length - 1]).toBe(88);
    (component as any).offline.retireShiftAutosaves = () => Promise.resolve();
    await component.finalSave();
    expect(post.calls.mostRecent().args[1].shifts[0].shiftId).toBe(88);
  });
  it('accepts a background receipt without asking the user to verify the save', async () => {
    const component = createComponent(), clear = jasmine.createSpy('clear').and.resolveTo();
    component.selectedDate = new Date(2026, 9, 5); component.appointments = [{ id: 'a', duration: 60 }];
    (component as any).router = { navigate: jasmine.createSpy('navigate') };
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') };
    const row = { id: 'pending', state: 'done', response: { body: { savedShifts: [] } } };
    (component as any).offline.operations.next([row]);
    (component as any).pendingSave = { id: row.id, date: '2026-10-05', snapshot: JSON.stringify((component as any).shiftSnapshot()), draft: { clear } };
    await (component as any).acceptQueuedConfirmation();
    expect(clear).toHaveBeenCalled(); expect((component as any).offline.acknowledge).toHaveBeenCalledWith(row);
    expect((component as any).router.navigate).toHaveBeenCalled(); expect(component.saveStatus).toBe('Turni salvati');
  });
  it('keeps edits made while offline and attaches the confirmed extra-job ID', async () => {
    const component = createComponent(); component.selectedDate = new Date(2026, 9, 5);
    component.appointments = [{ id: 'extra-a', isExtra: true, title: 'Versione nuova', duration: 60 }];
    (component as any).shiftDraft = { flush: jasmine.createSpy('flush') };
    (component as any).offline.operations.next([{ id: 'pending', state: 'done', response: { body: { savedShifts: [{ clientId: 'extra-a', shiftId: 99 }] } } }]);
    (component as any).pendingSave = { id: 'pending', date: '2026-10-05', snapshot: 'older snapshot' };
    await (component as any).acceptQueuedConfirmation();
    expect(component.appointments[0].title).toBe('Versione nuova'); expect(component.appointments[0].shiftId).toBe(99);
    expect(component.saveStatus).toContain('nuove modifiche'); expect((component as any).offline.acknowledge).not.toHaveBeenCalled();
  });
  it('keeps edits made during an online save and uses the returned extra ID on the next save', async () => {
    const component = createComponent(); let handler: any, submitted: any;
    component.selectedDate = new Date(2026, 9, 7);
    component.appointments = [{ id: 'extra-a', isExtra: true, description: 'Prima versione', duration: 60 }];
    const clear = jasmine.createSpy('clear').and.resolveTo(), flush = jasmine.createSpy('flush');
    (component as any).shiftDraft = { clear, flush };
    (component as any).http = { post: (_url: string, body: any) => { submitted = body; return { subscribe: (value: any) => handler = value }; } };
    (component as any).router = { navigate: jasmine.createSpy('navigate') };
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') };
    spyOn(window, 'alert');
    await component.finalSave(true);
    component.onDescriptionChange(component.appointments[0], 'Modifica durante invio');
    await handler.next({ savedShifts: [{ clientId: 'extra-a', shiftId: 99 }] });
    expect(component.isSaving).toBeFalse(); expect(clear).not.toHaveBeenCalled();
    expect((component as any).router.navigate).not.toHaveBeenCalled(); expect(window.alert).not.toHaveBeenCalled();
    expect(component.saveStatus).toContain('nuove modifiche'); expect(component.appointments[0].shiftId).toBe(99);
    await component.finalSave(true);
    expect(submitted.shifts[0].shiftId).toBe(99); expect(submitted.shifts[0].description).toBe('Modifica durante invio');
  });
  it('waits for confirmed draft cleanup before navigating or enabling another save', async () => {
    const component = createComponent(); let handler: any, release!: () => void;
    component.appointments = [{ id: 'a', duration: 60 }];
    const clearing = new Promise<void>(resolve => release = resolve);
    (component as any).shiftDraft = { clear: () => clearing, flush: () => {} };
    (component as any).http = { post: () => ({ subscribe: (value: any) => handler = value }) };
    (component as any).router = { navigate: jasmine.createSpy('navigate') };
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') }; spyOn(window, 'alert');
    await component.finalSave(true);
    const finishing = handler.next({ savedShifts: [{ clientId: 'a', shiftId: 42 }], version: '"' + 'b'.repeat(64) + '"' });
    expect(component.isSaving).toBeTrue(); expect((component as any).router.navigate).not.toHaveBeenCalled();
    release(); await finishing;
    expect(component.isSaving).toBeFalse(); expect((component as any).router.navigate).toHaveBeenCalledTimes(1);
  });
  it('finishes an unchanged online save and clears only the submitted draft', async () => {
    const component = createComponent(); let handler: any;
    component.appointments = [{ id: 'a', duration: 60 }];
    const clear = jasmine.createSpy('clear').and.resolveTo();
    (component as any).shiftDraft = { clear, flush: () => {} };
    (component as any).http = { post: () => ({ subscribe: (value: any) => handler = value }) };
    (component as any).router = { navigate: jasmine.createSpy('navigate') };
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') };
    spyOn(window, 'alert'); await component.finalSave(true); await handler.next({ savedShifts: [{ clientId: 'a', shiftId: 42 }] });
    expect(clear).toHaveBeenCalledTimes(1); expect((component as any).router.navigate).toHaveBeenCalledTimes(1);
    expect(component.appointments[0].shiftId).toBe(42); expect(component.saveStatus).toBe('Turni salvati');
  });
  it('does not leave a different day when an earlier online save finishes', async () => {
    const component = createComponent(); let handler: any;
    component.selectedDate = new Date(2026, 9, 7); component.appointments = [{ id: 'a', duration: 60 }];
    const clear = jasmine.createSpy('clear').and.resolveTo();
    (component as any).shiftDraft = { clear, flush: () => {} };
    (component as any).http = { post: () => ({ subscribe: (value: any) => handler = value }) };
    (component as any).router = { navigate: jasmine.createSpy('navigate') };
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') };
    spyOn(window, 'alert'); await component.finalSave(true);
    component.selectedDate = new Date(2026, 9, 8); component.appointments = [{ id: 'a', duration: 30 }];
    await handler.next({ savedShifts: [{ clientId: 'a', shiftId: 42 }] });
    expect((component as any).router.navigate).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
    expect(component.appointments[0].shiftId).toBeUndefined(); expect(window.alert).not.toHaveBeenCalled();
  });
  it('keeps an unconfirmed extra in the page while its save is still running or awaiting a receipt', async () => {
    const component = createComponent(), extra = { id: 'extra-a', isExtra: true };
    component.appointments = [extra];
    (component as any).socketService = { emitUpdate: jasmine.createSpy('emitUpdate') };
    component.isSaving = true; component.removeExtra(extra);
    expect(component.appointments).toEqual([extra]);
    component.isSaving = false; (component as any).pendingSave = { id: 'pending' };
    component.removeExtra(extra); expect(component.appointments).toEqual([extra]);
    expect((component as any).socketService.emitUpdate).not.toHaveBeenCalled();
  });
  it('warns immediately when work starts before the customer opens', async () => {
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

  it('warns immediately when the calculated end exceeds closing time', async () => {
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

  it('does not apply opening-hour warnings to customers with keys', async () => {
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

  it('reports a one-hour job as uncovered when the only employee covers half an hour', async () => {
    const component = createComponent();
    const app = { id: 'job-1', duration: 60, requiredEmployees: 1 };
    component.assignedShifts[app.id] = [10];
    (component as any).loadAssignedEmployeeDurations(app.id, [{ id: 10, ShiftEmployees: { durationOverride: 30, durationOverrideFromStamping: true } }]);

    expect(component.isComplete(app)).toBeFalse();
    expect(component.getCoverageWarning(app)).toContain('00.30 su 01.00');
  });

  it('reports a one-hour job as covered by two employees for half an hour each', async () => {
    const component = createComponent();
    const app = { id: 'job-2', duration: 60, requiredEmployees: 1 };
    component.assignedShifts[app.id] = [10, 11];
    (component as any).loadAssignedEmployeeDurations(app.id, [10, 11].map(id => ({ id, ShiftEmployees: { durationOverride: 30, durationOverrideFromStamping: true } })));

    expect(component.isComplete(app)).toBeTrue();
    expect(component.getCoverageWarning(app)).toBe('');
  });

  it('does not freeze the inherited duration when saving a new employee assignment', async () => {
    const component = createComponent();
    const app = { id: 'duration-job', duration: 360 };
    component.appointments = [app];
    component.assignedShifts[app.id] = [10];
    const post = jasmine.createSpy('post').and.returnValue({ subscribe: () => undefined });
    (component as any).http = { post };
    await component.finalSave();
    expect(post.calls.mostRecent().args[1].shifts[0].employeeDurations).toEqual({ 10: null });
    expect(post.calls.mostRecent().args[1].shifts[0].duration).toBe(360);
  });

  it('changes a saved six-hour default to three hours without retaining the old employee duration', async () => {
    const component = createComponent();
    const app = { id: 'duration-job', duration: 360 };
    component.appointments = [app];
    component.assignedShifts[app.id] = [10];
    (component as any).loadAssignedEmployeeDurations(app.id, [{ id: 10, ShiftEmployees: { durationOverride: 360, durationOverrideFromStamping: false } }], 360);
    expect(component.assignedEmployeeDurations[app.id]).toEqual({});
    app.duration = 180;
    expect((component as any).getAssignedEmployeeMinutes(app, 10)).toBe(180);
    const post = jasmine.createSpy('post').and.returnValue({ subscribe: () => undefined });
    (component as any).http = { post };
    await component.finalSave();
    expect(post.calls.mostRecent().args[1].shifts[0].duration).toBe(180);
    expect(post.calls.mostRecent().args[1].shifts[0].employeeDurations).toEqual({ 10: null });
  });

  it('preserves attendance-approved shorter durations while the planned job duration changes', async () => {
    const component = createComponent();
    const app = { id: 'duration-job', duration: 360 };
    component.assignedShifts[app.id] = [10, 11, 12];
    (component as any).loadAssignedEmployeeDurations(app.id, [
      { id: 10, ShiftEmployees: { durationOverride: 360, durationOverrideFromStamping: false } },
      { id: 11, ShiftEmployees: { durationOverride: 90, durationOverrideFromStamping: true } },
      { id: 12, ShiftEmployees: { durationOverride: null } },
    ], 360);
    app.duration = 180;
    expect((component as any).getAssignedEmployeeDurations(app)).toEqual({ 10: null, 11: 90, 12: null });
    expect((component as any).getAssignedEmployeeMinutes(app, 10)).toBe(180);
    expect((component as any).getAssignedEmployeeMinutes(app, 11)).toBe(90);
    expect((component as any).getAssignedEmployeeMinutes(app, 12)).toBe(180);
  });

  it('repairs an already inconsistent three-hour job on a plain save', async () => {
    const component = createComponent(), app = { id: 'existing-bad-duration', duration: 180 };
    component.appointments = [app];
    component.assignedShifts[app.id] = [10];
    (component as any).loadAssignedEmployeeDurations(app.id, [{ id: 10, ShiftEmployees: { durationOverride: 360, durationOverrideFromStamping: false } }], 180);
    expect((component as any).getAssignedEmployeeMinutes(app, 10)).toBe(180);
    const post = jasmine.createSpy('post').and.returnValue({ subscribe: () => undefined });
    (component as any).http = { post };
    await component.finalSave();
    expect(post.calls.mostRecent().args[1].shifts[0].employeeDurations).toEqual({ 10: null });
  });

  it('normalizes an obsolete employee duration restored from an older draft', async () => {
    const component = createComponent(), app = { id: 'old-draft', duration: 180 };
    component.assignedShifts[app.id] = [10, 11];
    component.assignedEmployeeDurations[app.id] = { 10: 360, 11: 90 };
    expect((component as any).getAssignedEmployeeDurations(app)).toEqual({ 10: null, 11: null });
    expect((component as any).getAssignedEmployeeMinutes(app, 10)).toBe(180);
  });

  it('retains a stamped correction, including overtime and an override equal to the old job', async () => {
    const component = createComponent(), app = { id: 'approved-duration', duration: 180 };
    component.assignedShifts[app.id] = [10, 11];
    (component as any).loadAssignedEmployeeDurations(app.id, [
      { id: 10, ShiftEmployees: { durationOverride: 360, durationOverrideFromStamping: true } },
      { id: 11, ShiftEmployees: { durationOverride: 180, durationOverrideFromStamping: true } },
    ], 180);
    app.duration = 120;
    component.assignedEmployeeDurations[app.id] = { 10: 120, 11: 120 };
    expect((component as any).getAssignedEmployeeDurations(app)).toEqual({ 10: 360, 11: 180 });
    expect((component as any).getAssignedEmployeeMinutes(app, 10)).toBe(360);
  });

  it('preserves an explicit zero duration instead of treating it as an inherited duration', async () => {
    const component = createComponent();
    const app = { id: 'duration-job', duration: 180 };
    component.assignedShifts[app.id] = [10];
    (component as any).loadAssignedEmployeeDurations(app.id, [{ id: 10, ShiftEmployees: { durationOverride: 0, durationOverrideFromStamping: true } }]);
    expect((component as any).getAssignedEmployeeDurations(app)).toEqual({ 10: 0 });
  });

  it('leaves unclassified cached durations to the backend and bounds planned coverage', async () => {
    const component = createComponent(), app = { id: 'old-response', duration: 180, requiredEmployees: 2 };
    component.assignedShifts[app.id] = [10];
    (component as any).loadAssignedEmployeeDurations(app.id, [{ id: 10, ShiftEmployees: { durationOverride: 360 } }], 180);
    expect((component as any).getAssignedEmployeeDurations(app)).toEqual({ 10: 360 });
    expect(component.isComplete(app)).toBeFalse();
  });

  it('uses every selected duration, including zero and 75 minutes, instead of old 45-minute assignments', async () => {
    for (let minutes = 0; minutes <= 480; minutes += 15) {
      const component = createComponent(), app = { id: 'duration-matrix', duration: minutes };
      component.appointments = [app];
      component.assignedShifts[app.id] = [10];
      (component as any).loadAssignedEmployeeDurations(app.id, [{ id: 10, ShiftEmployees: { durationOverride: 45, durationOverrideFromStamping: false } }]);
      component.assignedEmployeeDurations[app.id] = { 10: 45 }; // A restored older draft.
      expect((component as any).getAssignedEmployeeMinutes(app, 10)).withContext(String(minutes)).toBe(minutes);
      const post = jasmine.createSpy('post').and.returnValue({ subscribe: () => undefined });
      (component as any).http = { post };
      await component.finalSave();
      const item = post.calls.mostRecent().args[1].shifts[0];
      expect(item.duration).withContext(String(minutes)).toBe(minutes);
      expect(item.employeeDurations).withContext(String(minutes)).toEqual({ 10: null });
    }
  });

  it('uses the customer total work hours instead of the single-employee shift duration', async () => {
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

  it('recalculates the assignment dialog end time from the current duration', async () => {
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

  it('filters customers while the user types an extra-job title', async () => {
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

  it('links a selected customer and clears the link when the title is edited', async () => {
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
