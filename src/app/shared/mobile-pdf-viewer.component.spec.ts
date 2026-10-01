import { TestBed } from '@angular/core/testing';
import { MobilePdfViewerComponent, supportsMobilePdfRendering } from './mobile-pdf-viewer.component';

describe('Mobile PDF compatibility boundary', () => {
  it('detects the modern browser PDF capability', () => {
    expect(supportsMobilePdfRendering()).toBeTrue();
  });

  it('never imports PDF.js on an unsupported WebView', async () => {
    const component = new MobilePdfViewerComponent({} as any);
    component.unavailable = true;
    const load = spyOn<any>(component, 'loadModule');
    await component.ngAfterViewInit();
    expect(load).not.toHaveBeenCalled();
  });

  it('offers a download when loading the renderer fails', async () => {
    const component = new MobilePdfViewerComponent({} as any);
    spyOn<any>(component, 'loadModule').and.rejectWith(new Error('unsupported engine'));
    await component.ngAfterViewInit();
    expect(component.unavailable).toBeTrue();
  });

  it('creates the existing renderer lazily on modern browsers', async () => {
    await TestBed.configureTestingModule({ imports: [MobilePdfViewerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(MobilePdfViewerComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.unavailable).toBeFalse();
    expect((fixture.componentInstance as any).viewer).toBeDefined();
    fixture.destroy();
  });
});
