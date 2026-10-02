import { of, Subject, throwError } from 'rxjs';
import { CandidatesComponent } from './candidates.component';
import { fileDownloadIO } from '../../shared/file-download';

describe('Candidate attachment download', () => {
  let component: CandidatesComponent;
  let http: jasmine.SpyObj<any>;
  let viewer: jasmine.SpyObj<any>;
  const attachment = {id: 7, originalName: 'curriculum.pdf', mimeType: 'application/pdf'} as any;
  beforeEach(() => {
    http = jasmine.createSpyObj('http', ['get']);
    viewer = jasmine.createSpyObj('viewer', ['open']);
    component = new CandidatesComponent(http, viewer, {} as any, {} as any, {} as any, {} as any);
    component.selectedCandidate = {id: 12} as any;
    spyOn(fileDownloadIO, 'native').and.returnValue(true);
    spyOn(fileDownloadIO, 'write').and.resolveTo({uri: 'file:///cache/curriculum.pdf'});
    spyOn(fileDownloadIO, 'share').and.resolveTo({});
    spyOn(component as any, 'api').and.callFake((path: string) => '/candidates/' + path);
  });
  it('downloads directly to the mobile save panel, without opening the preview', async () => {
    http.get.and.returnValue(of(new Blob(['pdf'])));
    await component.downloadAttachment(attachment);
    expect(http.get).toHaveBeenCalledWith('/candidates/12/attachments/7/download', {responseType: 'blob'});
    expect(fileDownloadIO.share).toHaveBeenCalledWith(jasmine.objectContaining({files: ['file:///cache/curriculum.pdf']}));
    expect(viewer.open).not.toHaveBeenCalled();
    expect(component.downloadingAttachmentIds.size).toBe(0);
  });
  it('prevents duplicate taps while a request is pending', async () => {
    const response = new Subject<Blob>(); http.get.and.returnValue(response);
    const pending = component.downloadAttachment(attachment);
    await component.downloadAttachment(attachment);
    expect(http.get).toHaveBeenCalledTimes(1);
    response.next(new Blob(['pdf'])); response.complete(); await pending;
    expect(component.downloadingAttachmentIds.size).toBe(0);
  });
  it('reports a failed request and allows retrying', async () => {
    http.get.and.returnValue(throwError(() => new Error('offline')));
    await component.downloadAttachment(attachment);
    expect(component.errorMessage).toContain('Impossibile scaricare');
    expect(component.downloadingAttachmentIds.size).toBe(0);
    expect(fileDownloadIO.share).not.toHaveBeenCalled();
  });
});
