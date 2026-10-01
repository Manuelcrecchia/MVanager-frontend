import { EditQuoteComponent } from '../admin/edit-quote/edit-quote.component';

describe('Quote draft conflict resolution', () => {
  function fixture() {
    const model: any = { numeroPreventivo: '42', offlineRevision: 3, updatedAt: 'new', description: 'server' };
    const post = jasmine.createSpy('post');
    const popup = { text: '', openPopup: jasmine.createSpy('openPopup') };
    const component = new EditQuoteComponent(model, {} as any, { post } as any, {} as any, {} as any, {} as any, popup as any, {} as any);
    spyOn(component as any, 'refreshVisibleQuoteFields');
    component.draftConflict = { server: { ...model }, local: { ...model, offlineRevision: 1, updatedAt: 'old', description: 'bozza' } };
    return { component, model, post, popup };
  }
  it('requires an explicit decision before saving a stale local draft', () => {
    const { component, post, popup } = fixture(); component.editQuote();
    expect(post).not.toHaveBeenCalled(); expect(popup.openPopup).toHaveBeenCalled();
  });
  it('uses the reviewed server revision while preserving chosen local edits', () => {
    const { component, model } = fixture(); component.resolveDraftConflict(true);
    expect(model.description).toBe('bozza'); expect(model.offlineRevision).toBe(3); expect(model.updatedAt).toBe('new');
    expect(component.draftConflict).toBeNull();
  });
  it('allows discarding local edits without overwriting the server version', () => {
    const { component, model } = fixture(); component.resolveDraftConflict(false);
    expect(model.description).toBe('server'); expect(model.offlineRevision).toBe(3);
  });
});
