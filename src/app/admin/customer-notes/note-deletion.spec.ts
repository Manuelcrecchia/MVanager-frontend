import { of, throwError } from 'rxjs';
import { CustomerNotesComponent } from './customer-notes.component';
import { QuoteNotesComponent } from '../quote-notes/quote-notes.component';

for (const Type of [CustomerNotesComponent, QuoteNotesComponent]) {
  describe(Type.name + ' deletion authorization', () => {
    let page: any;
    let note: any;
    beforeEach(() => {
      note = { id: 12, canDelete: true, testo: 'Nota', allegati: [] };
      page = Object.assign(Object.create(Type.prototype), {
        entityType: 'customer', numeroCliente: '1', numeroPreventivo: '1', note: [note], deletingId: null,
        globalService: { url: '/api/', consultationOnly: false, hasPermission: () => true },
        http: { delete: jasmine.createSpy('delete').and.returnValue(of({ success: true })) },
        appDialog: { confirm: jasmine.createSpy('confirm').and.resolveTo(true) },
      });
    });
    it('hides deletion and blocks the request when the server says it is another author’s note', async () => {
      note.canDelete = false;
      expect(page.canDeleteNote(note)).toBeFalse();
      await page.deleteNote(note);
      expect(page.http.delete).not.toHaveBeenCalled();
      expect(page.appDialog.confirm).not.toHaveBeenCalled();
    });
    it('blocks deletion if the manage permission has been revoked or the session is consultation only', async () => {
      page.globalService.hasPermission = () => false;
      await page.deleteNote(note);
      expect(page.http.delete).not.toHaveBeenCalled();
      page.globalService.hasPermission = () => true;
      page.globalService.consultationOnly = true;
      expect(page.canDeleteNote(note)).toBeFalse();
    });
    it('cancelling confirmation preserves the note and its attachments', async () => {
      page.appDialog.confirm.and.resolveTo(false);
      await page.deleteNote(note);
      expect(page.http.delete).not.toHaveBeenCalled();
      expect(page.note).toEqual([note]);
    });
    it('a rejected delete preserves the note and reports the server error; success removes it', async () => {
      page.http.delete.and.returnValue(throwError(() => ({ error: { error: 'Solo l’autore' } })));
      await page.deleteNote(note);
      expect(page.note).toEqual([note]);
      expect(page.deleteError).toBe('Solo l’autore');
      expect(page.deletingId).toBeNull();
      page.http.delete.and.returnValue(of({ success: true }));
      await page.deleteNote(note);
      expect(page.note).toEqual([]);
    });
  });
}
