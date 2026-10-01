import { AttachmentViewerService } from './attachment-viewer.service';
import { Subject } from 'rxjs';

describe('AttachmentViewerService', () => {
  it('ignores an asynchronous error belonging to an old attachment', async () => {
    const service = new AttachmentViewerService({ bypassSecurityTrustResourceUrl: (v: string) => v } as any, {} as any);
    let resolve!: (message: string) => void;
    spyOn<any>(service, 'parseError').and.returnValue(new Promise<string>(r => resolve = r));
    const source = new Subject<Blob>();
    service.open({ originalName: 'A.pdf' }, source);
    source.error({ message: 'old error' });
    service.openBlob(new Blob(['B']), 'B.pdf');
    resolve('old error'); await Promise.resolve();
    expect(service.state.error).toBe('');
    expect(service.state.name).toBe('B.pdf');
    service.close();
  });
  it('ignores a late response from the previously opened file', async () => {
    const service = new AttachmentViewerService({ bypassSecurityTrustResourceUrl: (v: string) => v } as any, {} as any);
    const a = new Subject<Blob>(), b = new Subject<Blob>();
    service.open({ originalName: 'A.pdf' }, a);
    service.open({ originalName: 'B.pdf' }, b);
    b.next(new Blob(['B'], { type: 'application/pdf' }));
    a.next(new Blob(['A'], { type: 'application/pdf' }));
    expect(service.state.name).toBe('B.pdf');
    expect(await service.state.blob!.text()).toBe('B');
    service.close();
  });

  it('does not update a closed viewer or leak an object URL', () => {
    const service = new AttachmentViewerService({} as any, {} as any);
    const source = new Subject<Blob>();
    const create = spyOn(URL, 'createObjectURL');
    service.open({ originalName: 'A.pdf' }, source);
    service.close(); source.next(new Blob(['A']));
    expect(service.state.blob).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
  it('classifies the file types supported by the unified viewer', () => {
    const service = new AttachmentViewerService(
      { bypassSecurityTrustResourceUrl: (value: string) => value } as any,
      {} as any,
    );

    expect(service.previewKind('application/pdf')).toBe('pdf');
    expect(service.previewKind('image/jpeg')).toBe('image');
    expect(service.previewKind('video/mp4')).toBe('video');
    expect(service.previewKind('audio/mpeg')).toBe('audio');
    expect(service.previewKind('text/plain')).toBe('text');
    expect(service.previewKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('unsupported');
  });
});
