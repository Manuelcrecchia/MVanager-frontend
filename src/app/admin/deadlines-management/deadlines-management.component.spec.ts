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
      { open: jasmine.createSpy('open') } as any,
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

  it('opens the edit form on a primary mouse pointerup', () => {
    const component = createComponent();
    const deadline = { id: 42 } as any;
    const pointerEvent = {
      pointerType: 'mouse',
      button: 0,
    } as PointerEvent;
    spyOn(component, 'openEditForm');

    component.onEditDeadlinePointerUp(pointerEvent, deadline);

    expect(component.openEditForm).toHaveBeenCalledOnceWith(deadline);
  });

  it('ignores a touch scroll and opens only a stationary touch tap', () => {
    const component = createComponent();
    const deadline = { id: 42 } as any;
    spyOn(component, 'openEditForm');

    component.onEditDeadlinePointerDown({
      pointerType: 'touch', pointerId: 7, clientX: 10, clientY: 10,
    } as PointerEvent);
    component.onEditDeadlinePointerUp({
      pointerType: 'touch', pointerId: 7, clientX: 10, clientY: 40,
    } as PointerEvent, deadline);
    expect(component.openEditForm).not.toHaveBeenCalled();

    component.onEditDeadlinePointerDown({
      pointerType: 'touch', pointerId: 8, clientX: 20, clientY: 20,
    } as PointerEvent);
    component.onEditDeadlinePointerUp({
      pointerType: 'touch', pointerId: 8, clientX: 23, clientY: 24,
    } as PointerEvent, deadline);

    expect(component.openEditForm).toHaveBeenCalledOnceWith(deadline);
  });

  it('runs deadline actions on primary pointerup', () => {
    const component = createComponent();
    const deadline = { id: 42 } as any;
    spyOn(component, 'planDeadline');
    spyOn(component, 'toggleHistory');

    component.onDeadlineActionPointerUp({
      pointerType: 'mouse', button: 0,
    } as PointerEvent, deadline, 'plan');
    component.onDeadlineActionPointerUp({
      pointerType: 'mouse', button: 0,
    } as PointerEvent, deadline, 'history');

    expect(component.planDeadline).toHaveBeenCalledOnceWith(deadline);
    expect(component.toggleHistory).toHaveBeenCalledOnceWith(deadline);
  });

  it('ignores a touch scroll on deadline actions', () => {
    const component = createComponent();
    const deadline = { id: 42 } as any;
    spyOn(component, 'planDeadline');

    component.onDeadlineActionPointerDown({
      pointerType: 'touch', pointerId: 5, clientX: 10, clientY: 10,
    } as PointerEvent);
    component.onDeadlineActionPointerUp({
      pointerType: 'touch', pointerId: 5, clientX: 10, clientY: 40,
    } as PointerEvent, deadline, 'plan');

    expect(component.planDeadline).not.toHaveBeenCalled();
  });

  it('opens the guided update through the standalone route on mobile', () => {
    spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
    const router = { navigateByUrl: jasmine.createSpy('navigateByUrl') };
    const component = createComponent(router);

    component.openGuidedCustomerAssetUpdate();

    expect(router.navigateByUrl).toHaveBeenCalledWith(
      '/customer-asset-deadlines/guided-update',
    );
  });

  it('builds the expanded asset summary from configured non-deadline fields', () => {
    const component = createComponent({}, {
      getTenantCustomerAssetsConfig: () => ({
        types: [{
          key: 'powder',
          label: 'Estintore a polvere',
          fields: [
            { key: 'code', label: 'Codice univoco', type: 'text', unique: true },
            { key: 'installedAt', label: 'Data installazione', type: 'date' },
            { key: 'revision', label: 'Scadenza revisione', type: 'date', isDeadline: true },
            { key: 'report', label: 'Verbale', type: 'attachment' },
          ],
        }],
      }),
    });

    const details = (component as any).buildCustomerAssetDetails({
      typeKey: 'powder',
      customFields: {
        code: '011',
        installedAt: '2026-07-28',
        revision: '2027-01-28',
      },
      attachments: [
        { id: 'file-1', fieldKey: 'report', originalName: 'verbale.pdf' },
      ],
    });

    expect(details.map((detail: any) => detail.label)).toEqual([
      'Data installazione',
      'Verbale',
    ]);
    expect(details[0].value).toBe('28/07/2026');
    expect(details[1].attachments[0].originalName).toBe('verbale.pdf');
  });

  it('exposes added and replaced attachments in the customer asset audit history', () => {
    const component = createComponent();
    const attachments = component.customerAssetAuditAttachments({
      action: 'guided_updated',
      summary: 'Modifica guidata: Etichetta',
      createdAt: '2026-07-28T18:34:00.000Z',
      snapshot: {},
      changes: {
        attachmentsAddedDetails: [{ id: 'new', originalName: 'etichetta-nuova.pdf', size: 20 }],
        attachmentsDeleted: [{ id: 'old', originalName: 'etichetta-vecchia.pdf', size: 10 }],
      },
    });

    expect(attachments.map((item) => item.attachment.originalName)).toEqual([
      'etichetta-nuova.pdf',
      'etichetta-vecchia.pdf',
    ]);
    expect(attachments.map((item) => item.label)).toEqual([
      'Allegato salvato',
      'Versione precedente',
    ]);
  });

  it('keeps the rendered audit attachment list stable across mobile pointer events', () => {
    const component = createComponent();
    const [entry] = (component as any).normalizeCustomerAssetAuditHistory([{
      action: 'guided_updated',
      summary: 'Modifica guidata: Etichetta',
      createdAt: '2026-07-28T18:34:00.000Z',
      snapshot: {},
      changes: {
        attachmentsAddedDetails: [{ id: 'new', originalName: 'etichetta-nuova.pdf' }],
      },
    }]);
    const renderedList = entry.attachmentItems;

    expect(entry.attachmentItems).toBe(renderedList);
    expect(entry.attachmentItems[0].attachment.id).toBe('new');
  });

  it('selects and deselects every deadline when the whole asset is toggled', () => {
    const component = createComponent();
    component.kind = 'customerAsset';
    const asset = {
      id: 'asset-1',
      deadlines: [
        { id: 11 },
        { id: 12 },
        { id: 13, plannedAppointmentId: 99 },
      ],
    } as any;

    component.toggleCustomerAssetSelection(asset, true);

    expect(component.isCustomerAssetSelected(asset)).toBeTrue();
    expect(component.selectedDeadlineIds).toEqual(new Set([11, 12]));
    expect(component.isCustomerAssetSelectionPartial(asset)).toBeFalse();

    component.toggleCustomerAssetSelection(asset, false);

    expect(component.isCustomerAssetSelected(asset)).toBeFalse();
    expect(component.selectedDeadlineIds.size).toBe(0);
  });

  it('selects all monthly PDF customers when detailed export is chosen', () => {
    const component = createComponent();
    component.pdfCustomers = [
      { id: '101', label: 'Cliente Alfa', assetCount: 4, deadlineCount: 5 },
      { id: '202', label: 'Cliente Beta', assetCount: 2, deadlineCount: 2 },
    ];

    component.onPdfExportModeChange('assets');

    expect(component.selectedPdfCustomerIds).toEqual(new Set(['101', '202']));
    expect(component.allPdfCustomersSelected).toBeTrue();
  });

  it('keeps monthly PDF customer selection immutable and supports select all', () => {
    const component = createComponent();
    component.pdfCustomers = [
      { id: '101', label: 'Cliente Alfa', assetCount: 4, deadlineCount: 5 },
      { id: '202', label: 'Cliente Beta', assetCount: 2, deadlineCount: 2 },
    ];
    const initialSelection = component.selectedPdfCustomerIds;

    component.togglePdfCustomer('101', true);

    expect(component.selectedPdfCustomerIds).not.toBe(initialSelection);
    expect(component.selectedPdfCustomerIds).toEqual(new Set(['101']));
    expect(component.somePdfCustomersSelected).toBeTrue();

    component.toggleAllPdfCustomers(true);
    expect(component.allPdfCustomersSelected).toBeTrue();

    component.toggleAllPdfCustomers(false);
    expect(component.selectedPdfCustomerIds.size).toBe(0);
  });

  it('filters customers and assets by an inclusive deadline date range', () => {
    const component = createComponent();
    component.kind = 'customerAsset';
    const inRangeDeadline = { id: 1, dueDate: '2026-09-10', status: 'ok' } as any;
    const outOfRangeDeadline = { id: 2, dueDate: '2026-10-01', status: 'ok' } as any;
    const firstAsset = {
      id: 'asset-1',
      label: 'Estintore 1',
      deadlines: [inRangeDeadline, outOfRangeDeadline],
      summary: (component as any).summarize([inRangeDeadline, outOfRangeDeadline]),
    } as any;
    const secondAsset = {
      id: 'asset-2',
      label: 'Estintore 2',
      deadlines: [outOfRangeDeadline],
      summary: (component as any).summarize([outOfRangeDeadline]),
    } as any;
    const customer = {
      id: 'customer-1',
      label: 'Cliente Alfa',
      deadlines: [inRangeDeadline, outOfRangeDeadline],
      summary: (component as any).summarize([inRangeDeadline, outOfRangeDeadline]),
    } as any;
    component.groups = [customer];
    (component as any).customerAssetGroupsByCustomer = { 'customer-1': [firstAsset, secondAsset] };
    component.deadlineFilterStart = '2026-09-10';
    component.deadlineFilterEnd = '2026-09-30';

    expect(component.filteredGroups.length).toBe(1);
    expect(component.filteredGroups[0].summary.totalCount).toBe(1);

    component.selectedGroup = customer;
    expect(component.selectedCustomerAssetGroups.map((asset) => asset.id)).toEqual(['asset-1']);
    expect(component.selectedCustomerAssetGroups[0].deadlines.map((deadline) => deadline.id)).toEqual([1]);
  });

  it('applies and clears the operational deadline date filter', () => {
    const component = createComponent();
    component.kind = 'customerAsset';
    component.deadlineFilterDraftStart = '2026-09-01';
    component.deadlineFilterDraftEnd = '2026-09-30';
    component.selectedDeadlineIds = new Set([10]);

    component.applyDeadlineDateFilter();

    expect(component.deadlineFilterStart).toBe('2026-09-01');
    expect(component.deadlineFilterEnd).toBe('2026-09-30');
    expect(component.selectedDeadlineIds.size).toBe(0);
    expect(component.hasActiveDeadlineDateFilter).toBeTrue();

    component.clearDeadlineDateFilter();
    expect(component.hasActiveDeadlineDateFilter).toBeFalse();
  });

  it('opens the stable customer detail while a deadline date filter is active', () => {
    const component = createComponent({}, {
      getTenantCustomerAssetsConfig: () => ({ types: [] }),
    });
    component.kind = 'customerAsset';
    const inRangeDeadline = { id: 1, dueDate: '2028-06-15', status: 'ok' } as any;
    const outOfRangeDeadline = { id: 2, dueDate: '2029-01-10', status: 'ok' } as any;
    const asset = {
      id: 'asset-1',
      label: 'Estintore 1',
      deadlines: [inRangeDeadline, outOfRangeDeadline],
      summary: (component as any).summarize([inRangeDeadline, outOfRangeDeadline]),
    } as any;
    const customer = {
      id: 'customer-1',
      label: 'Cliente Alfa',
      deadlines: [inRangeDeadline, outOfRangeDeadline],
      summary: (component as any).summarize([inRangeDeadline, outOfRangeDeadline]),
    } as any;
    component.groups = [customer];
    (component as any).customerAssetGroupsByCustomer = { 'customer-1': [asset] };
    component.deadlineFilterStart = '2028-01-01';
    component.deadlineFilterEnd = '2028-12-31';

    component.openGroupById('customer-1');

    expect(component.selectedGroup).toBe(customer);
    expect(component.selectedGroupView?.summary.totalCount).toBe(1);
    expect(component.selectedCustomerAssetGroups.length).toBe(1);
    expect(component.selectedCustomerAssetGroups[0].deadlines.map((deadline) => deadline.id)).toEqual([1]);
    expect(component.trackDeadlineGroup(0, component.filteredGroups[0])).toBe('customer-1');
  });

  it('shows a partial asset selection when only one of its deadlines is selected', () => {
    const component = createComponent();
    component.kind = 'customerAsset';
    const firstDeadline = { id: 21 } as any;
    const secondDeadline = { id: 22 } as any;
    const asset = {
      id: 'asset-2',
      deadlines: [firstDeadline, secondDeadline],
    } as any;
    component.selectedGroup = { id: 'customer-1' } as any;
    (component as any).customerAssetGroupsByCustomer = {
      'customer-1': [asset],
    };

    component.toggleDeadlineSelection(firstDeadline, true);

    expect(component.isCustomerAssetSelected(asset)).toBeFalse();
    expect(component.isCustomerAssetSelectionPartial(asset)).toBeTrue();

    component.toggleDeadlineSelection(secondDeadline, true);

    expect(component.isCustomerAssetSelected(asset)).toBeTrue();
    expect(component.isCustomerAssetSelectionPartial(asset)).toBeFalse();

    component.toggleDeadlineSelection(firstDeadline, false);

    expect(component.isCustomerAssetSelected(asset)).toBeFalse();
    expect(component.isCustomerAssetSelectionPartial(asset)).toBeTrue();
  });

  it('selects every asset and its deadlines using the customer-wide action', () => {
    const component = createComponent();
    component.kind = 'customerAsset';
    const assets = [
      { id: 'asset-1', deadlines: [{ id: 31 }, { id: 32 }] },
      { id: 'asset-2', deadlines: [{ id: 33 }] },
    ] as any[];
    component.selectedGroup = { id: 'customer-1' } as any;
    (component as any).customerAssetGroupsByCustomer = {
      'customer-1': assets,
    };

    component.selectAllCustomerAssetsForCurrentCustomer();

    expect(component.selectedCustomerAssetIds).toEqual(new Set(['asset-1', 'asset-2']));
    expect(component.selectedDeadlineIds).toEqual(new Set([31, 32, 33]));

    component.selectAllCustomerAssetsForCurrentCustomer();

    expect(component.selectedCustomerAssetIds.size).toBe(0);
    expect(component.selectedDeadlineIds.size).toBe(0);
  });

  it('opens and closes a customer asset type using persistent component state', () => {
    const component = createComponent();
    const initialState = component.expandedCustomerAssetTypeKeys;

    component.toggleCustomerAssetType('estintore_polvere');

    expect(component.expandedCustomerAssetTypeKeys).not.toBe(initialState);
    expect(component.isCustomerAssetTypeExpanded('estintore_polvere')).toBeTrue();

    component.toggleCustomerAssetType('estintore_polvere');

    expect(component.isCustomerAssetTypeExpanded('estintore_polvere')).toBeFalse();
  });

  it('keeps asset deadlines closed initially and expands only the selected asset', () => {
    const component = createComponent();
    const firstAsset = { id: 'asset-1' } as any;
    const secondAsset = { id: 'asset-2' } as any;

    expect(component.isCustomerAssetExpanded(firstAsset)).toBeFalse();
    expect(component.isCustomerAssetExpanded(secondAsset)).toBeFalse();

    component.toggleCustomerAsset(firstAsset);

    expect(component.isCustomerAssetExpanded(firstAsset)).toBeTrue();
    expect(component.isCustomerAssetExpanded(secondAsset)).toBeFalse();

    component.toggleCustomerAsset(firstAsset);

    expect(component.isCustomerAssetExpanded(firstAsset)).toBeFalse();
  });

  it('groups deadline history by local update day and orders newest events first', () => {
    const component = createComponent();
    component.historyByDeadlineId[17] = [
      { id: 1, createdAt: '2026-07-27T08:15:00', changes: {}, snapshot: {} },
      { id: 2, createdAt: '2026-07-28T10:39:00', changes: {}, snapshot: {} },
      { id: 3, createdAt: '2026-07-28T13:27:00', changes: {}, snapshot: {} },
    ] as any;

    const groups = component.historyDayGroups(17);

    expect(groups.map((group) => group.key)).toEqual(['2026-07-28', '2026-07-27']);
    expect(groups[0].entries.map((entry) => entry.id)).toEqual([3, 2]);
    expect(component.historyDayLabel(groups[0].key)).toBe('28/07/2026');
    expect(component.historyDayCountLabel(groups[0].entries.length)).toBe('2 aggiornamenti');
  });

  it('keeps history days closed initially and scopes expansion to one deadline', () => {
    const component = createComponent();
    const initialState = component.expandedHistoryDayKeys;

    expect(component.isHistoryDayExpanded(17, '2026-07-28')).toBeFalse();

    component.toggleHistoryDay(17, '2026-07-28');

    expect(component.expandedHistoryDayKeys).not.toBe(initialState);
    expect(component.isHistoryDayExpanded(17, '2026-07-28')).toBeTrue();
    expect(component.isHistoryDayExpanded(18, '2026-07-28')).toBeFalse();

    component.toggleHistoryDay(17, '2026-07-28');

    expect(component.isHistoryDayExpanded(17, '2026-07-28')).toBeFalse();
  });

  it('opens a planned event', () => {
    const router = { navigate: jasmine.createSpy('navigate') };
    const component = createComponent(router);
    const deadline = { id: 7, plannedAppointmentId: 91 } as any;

    component.openPlannedEvent(deadline);

    expect(router.navigate).toHaveBeenCalledWith(
      ['/homeAdmin/calendarHome'],
      { queryParams: { appointmentId: 91 } },
    );
  });

  it('opens single deadline planning', () => {
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
    component.planDeadline(deadline);

    expect(router.navigate).toHaveBeenCalled();
    const queryParams = router.navigate.calls.mostRecent().args[1].queryParams;
    expect(queryParams.deadlineIds).toBe('7');
    expect(queryParams.deadlineCategory).toBe('deadline_customer_asset');
  });
});
