import { DeadlinesManagementComponent } from './deadlines-management.component';

describe('DeadlinesManagementComponent selection', () => {
  function createComponent(
    router: any = {},
    globalService: any = {},
  ): DeadlinesManagementComponent {
    return new DeadlinesManagementComponent(
      {} as any,
      {} as any,
      router,
      {} as any,
      globalService,
      {} as any,
    );
  }

  it('selects and deselects a deadline using a new Set instance', () => {
    const component = createComponent();
    const deadline = { id: '42' } as any;
    component.deadlines = [deadline];
    const initialSelection = component.selectedDeadlineIds;

    component.toggleDeadlineSelection(deadline, true);

    expect(component.selectedDeadlineIds).not.toBe(initialSelection);
    expect(component.isDeadlineSelected(deadline)).toBeTrue();
    expect(component.selectedDeadlines).toEqual([deadline]);

    component.toggleDeadlineSelection(deadline, false);

    expect(component.isDeadlineSelected(deadline)).toBeFalse();
    expect(component.selectedDeadlines).toEqual([]);
  });

  it('toggles selection on pointer down without toggling it again on click', () => {
    const component = createComponent();
    const deadline = { id: 7 } as any;
    const event = {
      button: 0,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as any;

    component.onDeadlineSelectionPointerDown(event, deadline);
    component.onDeadlineSelectionClick(event, deadline);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(component.isDeadlineSelected(deadline)).toBeTrue();
  });

  it('opens a planned event on pointer down', () => {
    const router = { navigate: jasmine.createSpy('navigate') };
    const component = createComponent(router);
    const deadline = { id: 7, plannedAppointmentId: 91 } as any;
    const event = {
      button: 0,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as any;

    component.onOpenPlannedEventPointerDown(event, deadline);

    expect(router.navigate).toHaveBeenCalledWith(
      ['/homeAdmin/calendarHome'],
      { queryParams: { appointmentId: 91 } },
    );
  });

  it('opens single deadline planning on pointer down', () => {
    const router = { navigate: jasmine.createSpy('navigate') };
    const globalService = {
      hasPermission: jasmine.createSpy('hasPermission').and.returnValue(true),
    };
    const component = createComponent(router, globalService);
    component.kind = 'customerAsset';
    const deadline = {
      id: 7,
      entityType: 'customerAsset',
      targetKey: 'asset-7',
      targetLabel: 'Estintore',
      title: 'Revisione',
      description: '',
      dueDate: '2099-01-01',
    } as any;
    const event = {
      button: 0,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as any;

    component.onPlanDeadlinePointerDown(event, deadline);

    expect(router.navigate).toHaveBeenCalled();
    const queryParams = router.navigate.calls.mostRecent().args[1].queryParams;
    expect(queryParams.deadlineIds).toBe('7');
    expect(queryParams.deadlineCategory).toBe('deadline_customer_asset');
  });
});
