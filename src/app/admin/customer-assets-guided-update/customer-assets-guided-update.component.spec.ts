import { of } from 'rxjs';
import { CustomerAssetsGuidedUpdateComponent } from './customer-assets-guided-update.component';

describe('CustomerAssetsGuidedUpdateComponent', () => {
  function createComponent(): CustomerAssetsGuidedUpdateComponent {
    const http = { get: jasmine.createSpy('get').and.returnValue(of([])) };
    const global = {
      url: 'http://api/',
      loadTenantConfig: jasmine.createSpy('loadTenantConfig').and.returnValue(Promise.resolve()),
      getTenantCustomerAssetsConfig: () => ({
        types: [{
          key: 'water',
          label: 'Estintore ad acqua',
          fields: [
            { key: 'first_unique', label: 'Primo identificativo', type: 'text', unique: true },
            { key: 'code', label: 'Codice', type: 'text', unique: true },
            { key: 'revision', label: 'Revisione', type: 'date', isDeadline: true },
            { key: 'test', label: 'Collaudo', type: 'date', isDeadline: true },
            { key: 'report', label: 'Verbale', type: 'attachment', bulkUpdateMode: 'prompt', required: true },
            { key: 'private_file', label: 'Documento non massivo', type: 'attachment', bulkUpdateMode: 'none' },
          ],
        }],
      }),
    };
    return new CustomerAssetsGuidedUpdateComponent(
      http as any,
      global as any,
      {} as any,
      { confirm: jasmine.createSpy('confirm').and.resolveTo(true) } as any,
      {
        open: jasmine.createSpy('open'),
        openBlob: jasmine.createSpy('openBlob'),
      } as any,
    );
  }

  it('combines a type rule with a specific asset deadline', () => {
    const component = createComponent();
    component.assets = [
      { id: 1, numeroCliente: 'C1', typeKey: 'water', code: 'A' },
      { id: 2, numeroCliente: 'C1', typeKey: 'water', code: 'B' },
    ] as any;
    component.selectedCustomer = 'C1';
    const revision = component.deadlineFields('water')[0];
    const test = component.deadlineFields('water')[1];

    component.toggleRule('water', revision, true);
    component.togglePair(component.assets[0], test, true);

    expect(component.selectedAssetCount).toBe(2);
    expect(component.selectedPairs.size).toBe(3);

    component.startGuidedEdit();

    expect(component.steps.length).toBe(2);
    expect(component.steps[0].fields.length).toBe(2);
    expect(component.steps[1].fields.length).toBe(1);
  });

  it('offers only fields configured in MVControl', () => {
    const component = createComponent();

    const fields = component.guidedFields('water');

    expect(fields.some((field) => field.key === '__base_code')).toBeFalse();
    expect(fields.some((field) => field.key === '__base_location')).toBeFalse();
    expect(fields.some((field) => field.key === 'revision')).toBeTrue();
    expect(fields.some((field) => field.key === 'test')).toBeTrue();
    expect(fields.some((field) => field.key === 'report')).toBeTrue();
    expect(fields.some((field) => field.key === 'private_file')).toBeTrue();
  });

  it('opens a saved guided attachment through the global viewer', () => {
    const component = createComponent();
    const step = { asset: { id: 42 } } as any;
    const attachment = { id: 'file 1', originalName: 'etichetta.pdf' };

    component.openGuidedExistingAttachment(step, attachment);

    expect((component as any).http.get).toHaveBeenCalledWith(
      'http://api/admin/deadlines/customer-assets/registry/42/attachments/file%201',
      { responseType: 'blob' },
    );
    expect((component as any).attachmentViewer.open).toHaveBeenCalledWith(
      attachment,
      jasmine.anything(),
    );
  });

  it('opens a newly selected guided attachment without uploading it first', () => {
    const component = createComponent();
    const file = new File(['contenuto'], 'foto-etichetta.jpg', { type: 'image/jpeg' });

    component.openGuidedNewAttachment(file);

    expect((component as any).attachmentViewer.openBlob).toHaveBeenCalledWith(
      file,
      'foto-etichetta.jpg',
    );
  });

  it('replaces the local attachment list with the files returned after saving', () => {
    const component = createComponent();
    component.assets = [{
      id: 42,
      numeroCliente: 'C1',
      typeKey: 'water',
      attachments: [{ id: 'old', originalName: 'vecchia.pdf', fieldKey: 'report' }],
    }] as any;
    component.steps = [{
      asset: component.assets[0],
      fields: [],
      values: {},
      remindDays: {},
      interventionDate: '2026-07-28',
      attachmentFiles: { report: [new File(['new'], 'nuova.pdf')] },
      removedAttachmentIds: ['old'],
      done: true,
      error: '',
    }];

    (component as any).applyGuidedSaveResult({
      results: [{
        assetId: 42,
        status: 'updated',
        attachments: [{ id: 'new', originalName: 'nuova.pdf', fieldKey: 'report' }],
        updatedAt: '2026-07-28T18:50:00.000Z',
      }],
    });

    expect(component.assets[0].attachments?.map((item) => item.originalName)).toEqual(['nuova.pdf']);
    expect(component.steps[0].asset.attachments?.map((item) => item.originalName)).toEqual(['nuova.pdf']);
    expect(component.steps[0].attachmentFiles).toEqual({});
    expect(component.steps[0].removedAttachmentIds).toEqual([]);
  });

  it('requires a configured attachment before completing the step', () => {
    const component = createComponent();
    component.steps = [{
      asset: { id: 1, numeroCliente: 'C1', typeKey: 'water', attachments: [] },
      fields: [{ key: 'report', label: 'Verbale', type: 'attachment', required: true }],
      values: {},
      remindDays: {},
      interventionDate: '2026-01-01',
      attachmentFiles: {},
      removedAttachmentIds: [],
      done: false,
      error: '',
    }] as any;

    component.markCurrentDone(false);

    expect(component.steps[0].done).toBeFalse();
    expect(component.steps[0].error).toContain('Allega almeno un file');
  });

  it('uses the first configured unique field as the asset identifier', () => {
    const component = createComponent();
    const asset = {
      id: 7,
      numeroCliente: 'C1',
      typeKey: 'water',
      name: 'Estintore ad acqua',
      customFields: { first_unique: 'PRIMO-7', code: 'CODICE-7' },
    } as any;

    expect(component.assetDisplayLabel(asset)).toBe('PRIMO-7 · Estintore ad acqua');
  });

  it('toggles one field reliably without selecting the whole asset', () => {
    const component = createComponent();
    const asset = { id: 1, numeroCliente: 'C1', typeKey: 'water' } as any;
    const field = component.guidedFields('water').find((item) => item.key === 'revision');

    component.togglePairFromTap(asset, field);
    expect(component.isPairSelected(asset, field)).toBeTrue();
    expect(component.isAssetSelected(asset)).toBeFalse();

    component.togglePairFromTap(asset, field);
    expect(component.isPairSelected(asset, field)).toBeFalse();
  });

  it('consumes the checkbox click without allowing a parent navigation or submit', () => {
    const component = createComponent();
    const asset = { id: 1, numeroCliente: 'C1', typeKey: 'water' } as any;
    const field = component.guidedFields('water').find((item) => item.key === 'revision');
    const event = {
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as any;

    component.togglePairFromClick(event, asset, field);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(component.isPairSelected(asset, field)).toBeTrue();
  });

  it('keeps stable identities when the selection redraws the grouped list', () => {
    const component = createComponent();
    const asset = { id: 9, numeroCliente: 'C1', typeKey: 'water' } as any;
    const field = component.guidedFields('water')[0];

    expect(component.trackTypeGroup(0, { typeKey: 'water' })).toBe('water');
    expect(component.trackAsset(0, asset)).toBe(9);
    expect(component.trackField(0, field)).toBe(field.key);
  });

  it('opens the customer picker and closes it after choosing a customer', () => {
    const component = createComponent();
    component.assets = [
      { id: 1, numeroCliente: 'C1', customerLabel: 'Cliente Uno', typeKey: 'water' },
      { id: 2, numeroCliente: 'C2', customerLabel: 'Cliente Due', typeKey: 'water' },
    ] as any;
    component.selectedPairs = new Set(['1:revision']);

    component.toggleCustomerPicker();
    expect(component.customerPickerOpen).toBeTrue();

    component.selectCustomer('C2');

    expect(component.selectedCustomer).toBe('C2');
    expect(component.selectedCustomerLabel).toBe('Cliente Due');
    expect(component.customerPickerOpen).toBeFalse();
    expect(component.selectedPairs.size).toBe(0);
  });

  it('keeps a stable option identity for the native mobile customer picker', () => {
    const component = createComponent();
    const customer = { id: 'C2', label: 'Cliente Due', count: 3 };

    expect(component.trackCustomer(0, customer)).toBe('C2');
  });

  it('keeps asset type groups collapsed until the operator expands one', () => {
    const component = createComponent();

    expect(component.isTypeGroupExpanded('water')).toBeFalse();

    component.toggleTypeGroup('water');
    expect(component.isTypeGroupExpanded('water')).toBeTrue();

    component.toggleTypeGroup('water');
    expect(component.isTypeGroupExpanded('water')).toBeFalse();
  });

  it('keeps each asset collapsed independently from its selection', () => {
    const component = createComponent();
    const asset = { id: 12, numeroCliente: 'C1', typeKey: 'water' } as any;
    const field = component.guidedFields('water').find((item) => item.key === 'revision');

    expect(component.isAssetExpanded(asset.id)).toBeFalse();

    component.toggleAssetDetails(asset.id);
    expect(component.isAssetExpanded(asset.id)).toBeTrue();
    expect(component.isPairSelected(asset, field)).toBeFalse();

    component.togglePairFromTap(asset, field);
    expect(component.isAssetExpanded(asset.id)).toBeTrue();
    expect(component.isPairSelected(asset, field)).toBeTrue();
  });

  it('calculates a configured deadline from another date field in days', () => {
    const component = createComponent();
    const result = (component as any).suggestedValue({
      bulkUpdateMode: 'date_offset',
      bulkUpdateSourceField: 'revision',
      bulkUpdateOffsetValue: 10,
      bulkUpdateOffsetUnit: 'days',
    }, '2026-07-28', { revision: '2026-08-01' });

    expect(result).toBe('2026-08-11');
  });

  it('suggests today for a configured automatic date field', () => {
    const component = createComponent();
    const result = (component as any).suggestedValue({
      type: 'date',
      bulkUpdateMode: 'today',
    }, '2026-07-28');

    expect(result).toBe('2026-07-28');
  });

  it('toggles a type-wide field reliably for every asset', () => {
    const component = createComponent();
    component.assets = [
      { id: 1, numeroCliente: 'C1', typeKey: 'water' },
      { id: 2, numeroCliente: 'C1', typeKey: 'water' },
    ] as any;
    component.selectedCustomer = 'C1';
    const field = component.guidedFields('water').find((item) => item.key === 'revision');

    component.toggleRuleFromTap('water', field);
    expect(component.isRuleSelected('water', field)).toBeTrue();
    expect(component.selectedPairs.size).toBe(2);

    component.toggleRuleFromTap('water', field);
    expect(component.isRuleSelected('water', field)).toBeFalse();
  });

  it('marks a valid step as completed and advances to the next pending asset', () => {
    const component = createComponent();
    component.steps = [
      {
        asset: { id: 1, numeroCliente: 'C1', typeKey: 'water' },
        fields: [{ key: 'revision', label: 'Revisione' }],
        values: { revision: '2027-01-01' },
        remindDays: {},
        interventionDate: '2026-01-01',
        done: false,
        error: '',
      },
      {
        asset: { id: 2, numeroCliente: 'C1', typeKey: 'water' },
        fields: [{ key: 'revision', label: 'Revisione' }],
        values: { revision: '2027-01-01' },
        remindDays: {},
        interventionDate: '2026-01-01',
        done: false,
        error: '',
      },
    ] as any;

    component.markCurrentDone(true);

    expect(component.steps[0].done).toBeTrue();
    expect(component.currentIndex).toBe(1);
  });

  it('opens the compact mobile queue and closes it after selecting an asset', () => {
    const component = createComponent();
    const scrollSpy = spyOn<any>(component, 'scrollToPageTop');

    expect(component.mobileQueueOpen).toBeFalse();

    component.toggleMobileQueue();
    expect(component.mobileQueueOpen).toBeTrue();

    component.selectStep(2);
    expect(component.currentIndex).toBe(2);
    expect(component.mobileQueueOpen).toBeFalse();
    expect(scrollSpy).toHaveBeenCalled();
  });
});
