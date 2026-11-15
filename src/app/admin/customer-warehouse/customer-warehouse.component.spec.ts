import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { CustomerWarehouseComponent } from './customer-warehouse.component';
import { GlobalService } from '../../service/global.service';

describe('CustomerWarehouseComponent history', () => {
  let fixture: ComponentFixture<CustomerWarehouseComponent>, component: CustomerWarehouseComponent, http: HttpTestingController;
  const item = { id: 10, name: 'Armadio', groupId: 2, quantity: 2 };
  const piece = { id: 3, itemId: 10, permanentId: 'UNICO', pieceNumber: 1, totalPieces: 2 };
  const event = { id: 1, entityType: 'item', entityId: 10, action: 'modified', itemId: 10,
    employeeId: 7, employeeName: 'Mario Rossi', createdAt: '2026-09-03T12:00:00Z', beforeJson: { name: 'Armadio' }, afterJson: { name: 'Armadio sala' } };
  beforeEach(async () => {
    spyOn(CustomerWarehouseComponent.prototype, 'ngOnInit').and.stub();
    await TestBed.configureTestingModule({ imports: [CustomerWarehouseComponent], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: GlobalService, useValue: { url: 'http://localhost/api/', hasPermission: () => true } }] }).compileComponents();
    fixture = TestBed.createComponent(CustomerWarehouseComponent); component = fixture.componentInstance; http = TestBed.inject(HttpTestingController);
    component.selected = { id: 1, items: [item], pieces: [piece], groups: [{ id: 2, name: 'Sala' }] };
  });
  afterEach(() => http.verify());
  const render = () => fixture.detectChanges();
  const query = (selector: string): HTMLElement | null => fixture.nativeElement.querySelector(selector);
  const all = (selector: string): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll(selector));
  const seedInventory = () => {
    component.selected = {
      id: 1, numeroCliente: 460, customerDisplayName: 'Cliente collaudo', signatureStatus: 'outdated', counts: { loaded: 1, unloaded: 1 },
      groups: [{ id: 2, name: 'Sala' }, { id: 20, name: 'Camera' }],
      items: [{ ...item, note: 'Nota elemento' }, { ...item, id: 20, groupId: 20 }, { ...item, id: 30, deletedAt: '2026-09-01' }],
      pieces: [{ ...piece, physicalStatus: 'loaded', currentCode: '460/2/10/1/UNICO/V02' },
        { ...piece, id: 4, pieceNumber: 2, permanentId: 'ALTRO', physicalStatus: 'unloaded', currentCode: '460/2/10/2/ALTRO/V02' },
        { ...piece, id: 5, permanentId: 'ELIMINATO', deletedAt: '2026-09-01', physicalStatus: 'deleted' },
        { ...piece, id: 6, itemId: 20, permanentId: 'CAMERA', physicalStatus: 'loaded' }],
      labels: [{ id: 1, pieceId: 3, code: 'VECCHIO-UNICO', active: false }, { id: 2, pieceId: 4, code: 'VECCHIO-ALTRO', active: false }],
      photos: [{ id: 1, itemId: 10, pieceId: null, filePath: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' },
        { id: 2, itemId: 10, pieceId: 3, filePath: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }],
      operations: [{ id: 9, type: 'unload', status: 'forced', forcedNote: 'Collo mancante', acceptedScans: 1 }],
    };
    render();
  };
  it('separates practice management from free label verification and filters returned goods', () => {
    component.selected = null;
    component.practices = [
      { id: 1, numeroCliente: 460, customerDisplayName: 'Cliente attivo', counts: { loaded: 2 }, workflow: { code: 'stored', label: 'Merce in magazzino', hint: 'Attende lo scarico.', completed: false } },
      { id: 2, numeroCliente: 461, customerDisplayName: 'Cliente concluso', counts: { unloaded: 3 }, workflow: { code: 'completed', label: 'Merce riconsegnata', hint: 'Tutto consegnato.', completed: true } },
    ];
    render();
    expect(all('.cw-list-tabs button').length).toBe(2); expect(all('.cw-practice').length).toBe(1);
    expect(query('.cw-practice')!.textContent).toContain('Cliente attivo'); expect(query('.cw-verify')).toBeNull();
    all('.cw-filter-tabs button')[1].click(); render();
    expect(all('.cw-practice').length).toBe(1); expect(query('.cw-practice')!.textContent).toContain('Cliente concluso');
    all('.cw-list-tabs button')[1].click(); render();
    expect(query('.cw-search')).toBeNull(); expect(query('.cw-grid')).toBeNull(); expect(query('.cw-verify')).not.toBeNull();
  });
  it('shows the customer identity in office label verification', () => {
    component.selected = null; component.listMode = 'verify'; component.verification = {
      usable: false, customer: { numeroCliente: 460, displayName: 'Mario Rossi' },
      historical: { groupName: 'Sala', itemName: 'Armadio', pieceNumber: 1, totalPieces: 2 }, current: null,
    };
    render();
    expect(query('.cw-verification')!.textContent).toContain('Mario Rossi');
    expect(query('.cw-verification')!.textContent).toContain('Cliente 460');
  });
  it('opens the customer on rooms without skipping to elements or pieces', () => {
    seedInventory();
    expect(all('.cw-group-row').length).toBe(2); expect(query('.cw-group-row')!.textContent).toContain('Sala');
    expect(query('.cw-groups h2')!.textContent).toBe('Stanze'); expect(query('.cw-inventory')).toBeNull();
    expect(query('.cw-piece-entry')).toBeNull(); expect(query('code')).toBeNull(); expect(query('.cw-photos')).toBeNull();
    expect(query('.cw-operations')).toBeNull(); expect(query('#warehouse-history')).toBeNull();
    expect((query('.cw-signature') as HTMLDetailsElement).open).toBeFalse();
  });
  it('opens only the selected element even when two elements have the same name', () => {
    seedInventory(); all('.cw-group-row')[1].click(); render();
    expect(all('.cw-inventory .cw-element-row').length).toBe(1); query('.cw-inventory .cw-element-row')!.click(); render();
    expect(component.selectedItemId).toBe(20); expect(query('.cw-inventory')).toBeNull();
    expect(query('.cw-item-heading')!.textContent).toContain('Camera');
    expect(all('.cw-piece-toggle').length).toBe(1); expect(query('.cw-piece-toggle')!.textContent).toContain('CAMERA');
    expect(query('code')).toBeNull();
  });
  it('expands one piece at a time and scopes previous labels and photos to that piece', () => {
    seedInventory(); component.openItem(item); render();
    all('.cw-piece-toggle')[0].click(); render();
    expect(all('.cw-piece-detail').length).toBe(1); expect(query('code')!.textContent).toContain('UNICO');
    expect(all('.cw-piece-detail img').length).toBe(1);
    const labels = query('.cw-piece-labels') as HTMLDetailsElement;
    expect(labels.open).toBeFalse(); expect(labels.textContent).toContain('VECCHIO-UNICO'); expect(labels.textContent).not.toContain('VECCHIO-ALTRO');
    all('.cw-piece-toggle')[1].click(); render();
    expect(all('.cw-piece-detail').length).toBe(1); expect(query('code')!.textContent).toContain('ALTRO'); expect(query('.cw-piece-detail img')).toBeNull();
    all('.cw-piece-toggle')[1].click(); render(); expect(query('.cw-piece-detail')).toBeNull();
  });
  it('keeps deleted elements and pieces available on request without counting them as active goods', () => {
    seedInventory(); expect(component.activePieceCount(item)).toBe(2); expect(component.loadedPieceCount(item)).toBe(1);
    component.openGroup(component.selected.groups[0]); component.showDeletedItems = true; render(); expect(all('.cw-element-row').length).toBe(2);
    component.openItem(item); render(); expect(all('.cw-piece-toggle').length).toBe(2);
    component.showDeletedPieces = true; render(); expect(all('.cw-piece-toggle').length).toBe(3);
    all('.cw-piece-toggle')[2].click(); render(); expect(query('.cw-piece-detail')!.textContent).toContain('non utilizzabile');
  });
  it('searches groups separately and retains item search within the selected room', () => {
    seedInventory(); component.groupSearch = 'SALA'; render(); expect(all('.cw-group-row').length).toBe(1);
    query('.cw-group-row')!.click(); render(); component.inventorySearch = 'ARMADIO'; render(); expect(all('.cw-element-row').length).toBe(1);
    query('.cw-element-row')!.click(); render(); component.back(); render();
    expect(component.selectedGroupId).toBe(2); expect(component.inventorySearch).toBe('ARMADIO'); expect(all('.cw-element-row').length).toBe(1);
    component.inventorySearch = '10'; expect(component.visibleItems().map(row => row.id)).toEqual([10]);
    component.inventorySearch = 'inesistente'; render(); expect(query('.cw-empty')!.textContent).toContain('Nessun elemento');
    component.back(); render(); expect(component.groupSearch).toBe('SALA'); expect(all('.cw-group-row').length).toBe(1);
  });
  it('separates element photos and notes from the piece list', () => {
    seedInventory(); component.openItem(item); component.itemSection = 'photos'; render();
    expect(query('.cw-piece-entry')).toBeNull(); expect(all('.cw-item-photos img').length).toBe(1);
    expect(query('.cw-note')!.textContent).toBe('Nota elemento');
    const anchor = query('.cw-item-photos a')!;
    expect(anchor.getAttribute('target')).not.toBe('_blank');
    const openPhoto = spyOn(component, 'openPhoto');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(click);
    expect(click.defaultPrevented).toBeTrue();
    expect(openPhoto).toHaveBeenCalledWith(jasmine.objectContaining({ id: 1, pieceId: null }));
  });
  it('returns from piece history to the same expanded piece and preserves the inventory search', () => {
    seedInventory(); component.inventorySearch = 'Sala'; component.openItem(item); component.togglePiece(piece);
    component.openHistory(item, piece); http.expectOne(req => req.url.endsWith('/history')).flush({ events: [event], total: 1 }); render();
    expect(query('.cw-item-detail')).toBeNull(); expect(query('.cw-operations')).toBeNull();
    component.back(); render(); expect(component.selectedItemId).toBe(10); expect(component.expandedPieceId).toBe(3);
    expect(component.inventorySearch).toBe('Sala'); expect(query('.cw-piece-detail')).not.toBeNull();
  });
  it('keeps operations on their own screen and ignores history responses after changing section', () => {
    seedInventory(); component.selectSection('operations'); render();
    expect(query('.cw-inventory')).toBeNull(); expect(query('.cw-operations')!.textContent).toContain('Collo mancante');
    component.selectSection('history'); const request = http.expectOne(req => req.url.endsWith('/history'));
    component.selectSection('inventory'); request.flush({ events: [event], total: 1 }); render();
    expect(query('#warehouse-history')).toBeNull(); expect(query('.cw-groups')).not.toBeNull();
  });
  it('shows who started and completed each load or unload', () => {
    seedInventory();
    Object.assign(component.selected.operations[0], {
      startedByEmployeeId: 7, startedByEmployeeName: 'Mario Rossi',
      completedByEmployeeId: 8, completedByEmployeeName: 'Luisa Bianchi',
      rejectedScans: 2, progress: { completed: 1, total: 3 },
    });
    component.selectSection('operations'); render();
    const text = query('.cw-operation')!.textContent!;
    expect(text).toContain('Mario Rossi'); expect(text).toContain('Luisa Bianchi');
    expect(text).toContain('1/3 pezzi'); expect(text).toContain('2 errori bloccati');
  });
  it('requires confirmation, prevents duplicate reopen requests and preserves piece and scan data', () => {
    seedInventory(); component.selectSection('operations'); render();
    const pieces = structuredClone(component.selected.pieces), operation = component.selected.operations[0];
    query('.cw-operation > button')!.click(); render();
    expect(query('.cw-reopen-confirm')!.textContent).toContain('rimarranno invariati'); http.expectNone(req => req.method === 'POST');
    query('.cw-reopen-confirm .btn-outline-secondary')!.click(); render();
    expect(query('.cw-reopen-confirm')).toBeNull(); http.expectNone(req => req.method === 'POST');
    query('.cw-operation > button')!.click(); render(); query('.cw-reopen-confirm .btn-primary')!.click(); render();
    component.reopenOperation(operation);
    expect((query('.cw-reopen-confirm .btn-primary') as HTMLButtonElement).disabled).toBeTrue();
    http.expectOne('http://localhost/api/admin/customer-warehouse/operations/9/reopen').flush({ operation: { id: 9, status: 'in_progress', forcedNote: '', completedAt: null }, progress: { completed: 1, total: 2 } }); render();
    expect(operation.acceptedScans).toBe(1); expect(component.selected.pieces).toEqual(pieces);
    expect(component.activeSection).toBe('operations'); expect(query('.cw-operation')!.textContent).toContain('In corso');
    expect(query('.cw-operation > button')).toBeNull(); expect(component.message).toContain('Operazione riaperta');
  });
  it('offers reopen only for completed/forced operations and users allowed to manage the module', () => {
    seedInventory();
    for (const status of ['completed', 'forced']) expect(component.canReopenOperation({ status })).toBeTrue();
    for (const status of ['scheduled', 'in_progress', 'cancelled']) expect(component.canReopenOperation({ status })).toBeFalse();
    spyOn(component.global, 'hasPermission').and.returnValue(false);
    component.selectSection('operations'); render(); expect(query('.cw-operation > button')).toBeNull();
    component.operationToReopenId = 9; component.reopenOperation(component.selected.operations[0]); http.expectNone(req => req.method === 'POST');
  });
  it('shows reopen failures without changing the operation and ignores responses after leaving the practice', () => {
    seedInventory(); component.selectSection('operations'); component.operationToReopenId = 9;
    component.reopenOperation(component.selected.operations[0]);
    http.expectOne(req => req.url.endsWith('/reopen')).flush({ error: 'Operazione già riaperta' }, { status: 409, statusText: 'Conflict' });
    expect(component.error).toBe('Operazione già riaperta'); expect(component.selected.operations[0].status).toBe('forced');
    component.reopenOperation(component.selected.operations[0]); const request = http.expectOne(req => req.url.endsWith('/reopen'));
    component.close(); request.flush({ operation: { id: 9, status: 'in_progress' } });
    expect(component.selected).toBeNull(); expect(component.reopeningOperationId).toBeNull(); expect(component.message).toBe('');
  });
  it('identifies reopening by the MVanager user instead of an employee', () => {
    seedInventory(); component.openHistory();
    http.expectOne(req => req.url.endsWith('/history')).flush({ events: [{ ...event, entityType: 'operation', action: 'operation_reopened', employeeId: null, employeeName: '', adminId: 9, adminName: 'Anna Verdi', beforeJson: { status: 'completed' }, afterJson: { status: 'in_progress' } }], total: 1 }); render();
    expect(query('.cw-history-event')!.textContent).toContain('Operazione riaperta');
    expect(query('.cw-history-event')!.textContent).toContain('Anna Verdi'); expect(query('.cw-history-event')!.textContent).toContain('Utente MVanager #9');
    expect(query('.cw-history-event')!.textContent).not.toContain('Dipendente');
  });
  it('does not reopen a practice after the user has left it', () => {
    component.open({ id: 2 }); const request = http.expectOne(req => req.url.endsWith('/practices/2'));
    component.close(); request.flush({ practice: { id: 2, items: [] } }); expect(component.selected).toBeNull();
  });
  it('clears the previous inventory context when opening a different customer', () => {
    seedInventory(); component.openItem(item); component.inventorySearch = 'Sala'; component.showDeletedItems = true;
    component.open({ id: 2 }); http.expectOne(req => req.url.endsWith('/practices/2')).flush({ practice: { id: 2, items: [] } });
    expect(component.selectedItemId).toBeNull(); expect(component.selectedGroupId).toBeNull(); expect(component.inventorySearch).toBe(''); expect(component.showDeletedItems).toBeFalse();
  });
  it('fits the rendered list, element, piece details, photos and history from phone to desktop widths', () => {
    seedInventory(); const frame = document.createElement('iframe'); document.body.appendChild(frame);
    try {
      const doc = frame.contentDocument!; doc.body.style.margin = '0'; frame.style.border = '0';
      const style = doc.createElement('style');
      style.textContent = Array.from(document.styleSheets).flatMap(sheet => { try { return Array.from(sheet.cssRules, rule => rule.cssText); } catch { return []; } }).join('\n');
      doc.head.appendChild(style);
      const views = [() => {}, () => component.openGroup(component.selected.groups[0]), () => component.openItem(item), () => component.togglePiece(piece), () => component.itemSection = 'photos',
        () => component.selectSection('operations'), () => { component.openHistory(item, piece); http.expectOne(req => req.url.endsWith('/history')).flush({ events: [event], total: 1 }); }];
      for (const [index, view] of views.entries()) {
        view(); render(); doc.body.replaceChildren(fixture.nativeElement.cloneNode(true));
        for (const width of [320, 390, 768, 1280]) {
          frame.style.width = `${width}px`;
          expect(doc.documentElement.scrollWidth).withContext(`view ${index} at ${width}px`).toBeLessThanOrEqual(width + 1);
        }
      }
    } finally { frame.remove(); }
  });
  it('goes back through item, room and customer before navigating to the real homeAdmin route', async () => {
    seedInventory(); component.openGroup(component.selected.groups[0]); component.openItem(item); component.togglePiece(piece);
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: 'homeAdmin', component: CustomerWarehouseComponent }]);
    const navigate = spyOn(router, 'navigate').and.callThrough();
    component.back(); expect(component.selectedItemId).toBeNull(); expect(component.selectedGroupId).toBe(2);
    component.back(); expect(component.selectedGroupId).toBeNull(); expect(component.selected.id).toBe(1);
    component.back(); expect(component.selected).toBeNull(); expect(navigate).not.toHaveBeenCalled();
    component.back(); expect(navigate).toHaveBeenCalledOnceWith(['/homeAdmin']);
    await expectAsync(navigate.calls.mostRecent().returnValue).toBeResolvedTo(true);
    expect(router.url).toBe('/homeAdmin');
  });
  it('shows even a single or empty room first without automatically opening its elements', async () => {
    component.open({ id: 2 });
    http.expectOne(req => req.url.endsWith('/practices/2')).flush({ practice: { id: 2, groups: [{ id: 90, name: 'Vuota' }], items: [], pieces: [] } }); render();
    expect(component.selectedGroupId).toBeNull(); expect(all('.cw-group-row').length).toBe(1); expect(query('.cw-inventory')).toBeNull();
    query('.cw-group-row')!.click(); render(); expect(query('.cw-inventory h2')!.textContent).toBe('Vuota'); expect(query('.cw-empty')!.textContent).toContain('Nessun elemento');
  });
  it('keeps deleted rooms accessible explicitly and isolates identical element names by group ID', () => {
    seedInventory(); component.selected.groups.push({ id: 30, name: 'Eliminata', deletedAt: '2026-09-01' }); render();
    expect(component.visibleGroups().length).toBe(2); component.showDeletedGroups = true; expect(component.visibleGroups().length).toBe(3);
    component.openGroup(component.selected.groups[0]); expect(component.visibleItems().map(row => row.id)).toEqual([10]);
    component.openGroup(component.selected.groups[1]); expect(component.visibleItems().map(row => row.id)).toEqual([20]);
  });
  it('uses the group terminology configured for the company', () => {
    component.loadConfig(); http.expectOne('http://localhost/api/admin/customer-warehouse/config').flush({ config: { groupLabel: 'Area' } });
    seedInventory(); expect(query('.cw-groups h2')!.textContent).toBe('Aree');
    expect(query('input[type=search]')!.getAttribute('aria-label')).toBe('Cerca area');
  });
  it('shows employee, timestamp and the actual before/after values in item history', () => {
    component.openHistory(item);
    const request = http.expectOne(req => req.url.endsWith('/practices/1/history'));
    expect(request.request.params.get('itemId')).toBe('10'); expect(request.request.params.has('pieceId')).toBeFalse();
    request.flush({ events: [event], total: 1 }); fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('#warehouse-history').textContent;
    expect(text).toContain('Mario Rossi'); expect(text).toContain('Dipendente #7'); expect(text).toContain('03/09/2026');
    expect(text).toContain('Armadio → Armadio sala'); expect(text).toContain('Elemento #10');
  });
  it('filters a single piece by stable ID and keeps equal-name elements distinct', () => {
    component.openHistory(item, piece);
    const request = http.expectOne(req => req.url.endsWith('/history'));
    expect(request.request.params.get('pieceId')).toBe('3'); expect(component.historyTitle).toContain('UNICO');
    request.flush({ events: [], total: 0 });
    expect(component.historyTarget({ itemId: 99, pieceId: 3, afterJson: { label: { itemName: 'Armadio', permanentId: 'UNICO' } } })).toBe('Armadio · Elemento #99 · Pezzo UNICO');
  });
  it('shows the physical state transition recorded by each scan before an operation is closed', () => {
    const changes = component.historyChanges({ beforeJson: { physicalStatus: 'loaded' }, afterJson: { physicalStatus: 'unloaded', message: 'Pezzo scaricato.' } });
    expect(changes).toContain({ label: 'Stato pezzo', before: 'Caricato', after: 'Scaricato' });
  });
  it('shows a single employee ID fallback when the author name is unavailable', () => {
    component.openHistory();
    http.expectOne(req => req.url.endsWith('/history')).flush({ events: [
      { ...event, id: 1, employeeId: 30, employeeName: 'Dipendente #30' },
      { ...event, id: 2, employeeId: 31, employeeName: '' },
      { ...event, id: 3, employeeId: null, employeeName: null },
    ], total: 3 }); render();
    const entries = all('.cw-history-event');
    expect(entries[0].textContent!.match(/Dipendente #30/g)?.length).toBe(1);
    expect(entries[1].textContent!.match(/Dipendente #31/g)?.length).toBe(1);
    expect(entries[2].textContent).toContain('Dipendente non disponibile');
    expect(entries[2].textContent).not.toContain('Dipendente #');
  });
  it('paginates without replacing the initial events', () => {
    component.openHistory(); http.expectOne(req => req.url.endsWith('/history')).flush({ events: [event], total: 2 });
    component.loadHistory(true); const request = http.expectOne(req => req.url.endsWith('/history'));
    expect(request.request.params.get('offset')).toBe('1');
    request.flush({ events: [{ ...event, id: 2 }], total: 2 }); expect(component.historyEvents.map(row => row.id)).toEqual([1, 2]);
  });
  it('ignores late responses for a previously selected item or closed practice', () => {
    component.openHistory(item); const first = http.expectOne(req => req.url.endsWith('/history'));
    component.openHistory(item, piece); const second = http.expectOne(req => req.url.endsWith('/history'));
    first.flush({ events: [event], total: 1 }); expect(component.historyEvents).toEqual([]);
    component.close(); second.flush({ events: [event], total: 1 }); expect(component.historyVisible).toBeFalse(); expect(component.historyEvents).toEqual([]);
  });
  it('reports history failures and distinguishes rejected scans from accepted movements', () => {
    component.openHistory(); http.expectOne(req => req.url.endsWith('/history')).flush({ error: 'Accesso negato' }, { status: 403, statusText: 'Forbidden' });
    expect(component.historyLoading).toBeFalse(); expect(component.error).toBe('Accesso negato');
    expect(component.historyAction({ action: 'scan_rejected' })).toBe('Scansione rifiutata');
    expect(component.historyAction({ action: 'load' })).toBe('Pezzo caricato');
    expect(component.historyAction({ action: 'unload' })).toBe('Pezzo scaricato');
  });
  it('identifies which operation was forcibly closed and renders statuses in Italian', () => {
    component.selected.operations = [{ id: 9, type: 'unload' }];
    expect(component.historyTarget({ operationId: 9 })).toBe('Scarico · Operazione #9');
    expect(component.historyChanges({ beforeJson: { status: 'in_progress' }, afterJson: { status: 'forced' } })).toEqual([{ label: 'Stato operazione', before: 'In corso', after: 'Chiusa incompleta' }]);
  });
});
