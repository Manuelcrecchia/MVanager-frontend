import { AttachmentViewerService } from './attachment-viewer.service';

describe('AttachmentViewerService', () => {
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
