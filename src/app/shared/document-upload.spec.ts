import { fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject } from 'rxjs';
import { DocumentManagerComponent } from '../admin/document-manager/document-manager.component';
import { InternalDocumentsComponent } from '../admin/internal-documents/internal-documents.component';

for (const type of [DocumentManagerComponent, InternalDocumentsComponent]) {
  describe(`${type.name} multiple uploads`, () => {
    let component: DocumentManagerComponent | InternalDocumentsComponent;
    let post: jasmine.Spy;
    let responses: Subject<any>[];
    let alertSpy: jasmine.Spy;
    let input: HTMLInputElement;

    beforeEach(() => {
      component = Object.create(type.prototype);
      component.isUploading = false;
      component.selectedFolder = 'Contratti';
      if (component instanceof DocumentManagerComponent) {
        component.userId = '42';
        component.isCustomer = true;
        component.prefix = 'customer';
      }
      responses = [];
      post = jasmine.createSpy('post').and.callFake(() => {
        const response = new Subject<any>();
        responses.push(response);
        return response;
      });
      (component as any).http = { post };
      (component as any).globalService = { url: 'https://upload.test/' };
      spyOn(component, 'loadFiles');
      alertSpy = spyOn(window, 'alert');
      spyOn(console, 'error');
      input = {
        files: ['one.pdf', 'two.pdf', 'three.docx'].map(name => new File([name], name)),
        value: 'selected',
      } as unknown as HTMLInputElement;
    });

    function confirm(index: number): void {
      responses[index].next({ message: 'Documento caricato' });
      responses[index].complete();
      flushMicrotasks();
    }

    it('waits for each confirmation before sending the next file and reports success only at the end', fakeAsync(() => {
      component.uploadFile({ target: input } as unknown as Event);
      expect(post.calls.count()).toBe(1);
      expect(component.isUploading).toBeTrue();
      expect(alertSpy).not.toHaveBeenCalled();

      // Navigation while awaiting a response must not redirect the remaining files.
      component.selectedFolder = 'Altra cartella';
      if (component instanceof DocumentManagerComponent) {
        component.userId = '99';
        component.isCustomer = false;
        component.prefix = 'employee';
      }
      component.uploadFile({ target: input } as unknown as Event);
      expect(post.calls.count()).toBe(1);
      confirm(0);
      expect(post.calls.count()).toBe(2);
      expect(component.loadFiles).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      confirm(1);
      expect(post.calls.count()).toBe(3);
      confirm(2);

      const expectedEndpoint = component instanceof DocumentManagerComponent
        ? 'documents/upload' : 'admin/internal-documents/upload';
      post.calls.allArgs().forEach(([url, body], index) => {
        expect(url).toBe('https://upload.test/' + expectedEndpoint);
        expect((body.get('document') as File).name).toBe(input.files![index].name);
        expect(body.get('folder')).toBe('Contratti');
        if (component instanceof DocumentManagerComponent) {
          expect(body.get('numeroCliente')).toBe('42');
          expect(body.get('prefix')).toBe('customer');
        }
      });
      expect(component.isUploading).toBeFalse();
      expect(input.value).toBe('');
      expect(component.loadFiles).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledOnceWith('3 documenti caricati!');
    }));

    it('continues after a rejected file and identifies the failure in the final summary', fakeAsync(() => {
      component.uploadFile({ target: input } as unknown as Event);
      confirm(0);
      responses[1].error(new HttpErrorResponse({ status: 413, error: { error: 'File troppo grande' } }));
      flushMicrotasks();
      expect(post.calls.count()).toBe(3);
      expect(component.isUploading).toBeTrue();
      expect(alertSpy).not.toHaveBeenCalled();
      confirm(2);

      expect(alertSpy).toHaveBeenCalledOnceWith('2 documento/i caricati, 1 non caricati.\ntwo.pdf: Il documento supera il limite di 1 GB per file. Riduci il file e riprova.');
      expect(input.value).toBe('');
      expect(component.isUploading).toBeFalse();
      expect(component.loadFiles).toHaveBeenCalledTimes(1);
    }));

    it('also serializes files supplied by drag and drop', fakeAsync(() => {
      const event = {
        preventDefault: jasmine.createSpy(), stopPropagation: jasmine.createSpy(),
        dataTransfer: { files: input.files },
      } as unknown as DragEvent;
      component.onFileDrop(event);
      expect(post.calls.count()).toBe(1);
      confirm(0);
      expect(post.calls.count()).toBe(2);
      confirm(1);
      confirm(2);
      expect(component.isUploading).toBeFalse();
      expect(alertSpy).toHaveBeenCalledOnceWith('3 documenti caricati!');
    }));
  });
}
