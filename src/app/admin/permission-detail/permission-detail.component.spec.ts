import { of } from 'rxjs';
import { PermissionDetailComponent } from './permission-detail.component';

describe('PermissionDetailComponent', () => {
  it('opens a leave attachment through the request-scoped endpoint', () => {
    const source = of(new Blob(['test'], { type: 'application/pdf' }));
    const http = {
      get: jasmine.createSpy('get').and.returnValue(source),
    };
    const viewer = {
      open: jasmine.createSpy('open'),
    };
    const component = new PermissionDetailComponent(
      http as any,
      {} as any,
      {} as any,
      { url: 'https://api.test/' } as any,
      viewer as any,
    );
    component.requestId = 42;

    component.openAttachment({ filename: 'certificato.pdf', size: 4 }, 0);

    expect(http.get).toHaveBeenCalledWith(
      'https://api.test/permission/42/attachments/0',
      { responseType: 'blob' },
    );
    expect(viewer.open).toHaveBeenCalledWith(
      { originalName: 'certificato.pdf', size: 4 },
      source,
    );
  });
});
