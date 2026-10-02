import { AttachmentViewerService } from './attachment-viewer.service';
import { Subject, of, throwError } from 'rxjs';

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


describe('Converted attachment previews', () => {
  const create = () => new AttachmentViewerService({bypassSecurityTrustResourceUrl: (value: string) => value} as any, {} as any);
  it('displays the converted image but retains the original bytes and name for download', async () => {
    const service = create();
    service.open({originalName: 'foto.heic'}, of(new Blob(['original'], {type: 'image/heic'})), of(new Blob(['preview'], {type: 'image/jpeg'})));
    expect(service.state.mimeType).toBe('image/jpeg');
    expect(service.state.kind).toBe('image');
    expect(service.state.name).toBe('foto.heic');
    expect(service.state.blob!.type).toBe('image/heic');
    expect(await service.state.blob!.text()).toBe('original');
    service.close();
  });
  it('keeps the original downloadable when the converted preview fails', async () => {
    const service = create();
    service.open({originalName: 'file.pdf'}, of(new Blob(['original'], {type: 'application/pdf'})), throwError(() => new Error('preview failed')));
    expect(service.state.error).toBe('');
    expect(service.state.loading).toBeFalse();
    expect(await service.state.blob!.text()).toBe('original');
    service.close();
  });
  it('ignores a converted preview arriving after the user switches attachments', () => {
    const service = create(), preview = new Subject<Blob>();
    service.open({originalName: 'old.heic'}, of(new Blob(['old'])), preview);
    service.openBlob(new Blob(['new'], {type: 'application/pdf'}), 'new.pdf');
    preview.next(new Blob(['old preview'], {type: 'image/jpeg'}));
    expect(service.state.name).toBe('new.pdf');
    expect(service.state.mimeType).toBe('application/pdf');
    service.close();
  });
});
