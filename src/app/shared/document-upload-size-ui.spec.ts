import { DocumentManagerComponent } from '../admin/document-manager/document-manager.component';
import { InternalDocumentsComponent } from '../admin/internal-documents/internal-documents.component';
import { CandidatesComponent } from '../admin/candidates/candidates.component';
import { DeadlinesManagementComponent } from '../admin/deadlines-management/deadlines-management.component';
import { MAX_DOCUMENT_FILE_BYTES } from './document-upload-limits';

describe('oversized document feedback in MVanager', () => {
  let file: File;
  beforeEach(() => {
    file = new File(['fixture'], 'troppo-grande.pdf');
    Object.defineProperty(file, 'size', { value: MAX_DOCUMENT_FILE_BYTES + 1 });
    spyOn(window, 'alert');
  });

  for (const type of [DocumentManagerComponent, InternalDocumentsComponent]) {
    it(`${type.name} blocks the file picker before making a request`, () => {
      const component: any = Object.create(type.prototype);
      component.http = { post: jasmine.createSpy('post') };
      component.isUploading = false;
      const input = { files: [file], value: 'selected' };
      component.uploadFile({ target: input } as unknown as Event);
      expect(component.http.post).not.toHaveBeenCalled();
      expect(input.value).toBe('');
      expect(component.isUploading).toBeFalse();
      expect(window.alert).toHaveBeenCalledWith(jasmine.stringMatching(/troppo-grande.pdf.*1 GB/));
    });

    it(`${type.name} applies the same check to drag and drop`, () => {
      const component: any = Object.create(type.prototype);
      component.http = { post: jasmine.createSpy('post') };
      component.onFileDrop({ preventDefault() {}, stopPropagation() {}, dataTransfer: { files: [file] } } as unknown as DragEvent);
      expect(component.http.post).not.toHaveBeenCalled();
      expect(window.alert).toHaveBeenCalledWith(jasmine.stringMatching(/1 GB/));
    });
  }

  it('candidates rejects an oversized attachment with an explicit alert', () => {
    const component: any = Object.create(CandidatesComponent.prototype);
    const input = { files: [file], value: 'selected' };
    component.onFileSelected({ target: input } as unknown as Event);
    expect(component.selectedFile).toBeNull();
    expect(component.errorMessage).toContain('1 GB');
    expect(input.value).toBe('');
    expect(window.alert).toHaveBeenCalled();
  });

  it('deadlines preserves previous attachments and explains a rejected selection', () => {
    const component: any = Object.create(DeadlinesManagementComponent.prototype);
    component.pendingFiles = [new File(['valid'], 'valid.pdf')];
    component.popup = { showError: jasmine.createSpy('showError') };
    component.onFilesSelected({ target: { files: [file], value: 'selected' } } as unknown as Event);
    expect(component.pendingFiles.length).toBe(1);
    expect(component.pendingFiles[0].name).toBe('valid.pdf');
    expect(component.popup.showError).toHaveBeenCalledWith(jasmine.stringMatching(/troppo-grande.pdf.*1 GB/));
  });
});
