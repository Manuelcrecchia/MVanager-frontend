import { ViewPdfComponent } from './view-pdf.component';

describe('ViewPdfComponent', () => {
  const createComponent = () => new ViewPdfComponent(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('should be exported', () => {
    expect(ViewPdfComponent).toBeTruthy();
  });

  it('changes zoom in bounded steps', () => {
    const component = createComponent();
    component.currentPdfZoom = 1;

    component.zoomPdf(1);
    expect(component.currentPdfZoom).toBe(1.25);

    component.zoomPdf(-1, 2);
    expect(component.currentPdfZoom).toBe(0.75);
  });

  it('commits a mobile pinch only when the gesture ends', () => {
    const component = createComponent();
    component.currentPdfZoom = 1;
    const preventDefault = jasmine.createSpy('preventDefault');
    const stopImmediatePropagation = jasmine.createSpy('stopImmediatePropagation');
    const event = (type: string, touches: Array<{ clientX: number; clientY: number }>) => ({
      type,
      touches,
      preventDefault,
      stopImmediatePropagation,
    }) as unknown as TouchEvent;

    (component as any).blockNativePdfPinch(event('touchstart', [
      { clientX: 0, clientY: 0 },
      { clientX: 100, clientY: 0 },
    ]));
    (component as any).blockNativePdfPinch(event('touchmove', [
      { clientX: 0, clientY: 0 },
      { clientX: 150, clientY: 0 },
    ]));

    expect(component.currentPdfZoom).toBe(1);
    expect(component.mobilePinchPreview).toBe(1.5);

    (component as any).blockNativePdfPinch(event('touchend', [
      { clientX: 0, clientY: 0 },
    ]));

    expect(component.currentPdfZoom).toBe(1.5);
    expect(component.mobilePinchPreview).toBe(1);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopImmediatePropagation).toHaveBeenCalled();
  });

  it('keeps mobile page navigation within the loaded document', () => {
    const component = createComponent();
    component.onMobilePdfLoaded({ numPages: 3 });

    component.changeMobilePdfPage(1);
    component.changeMobilePdfPage(1);
    component.changeMobilePdfPage(1);
    expect(component.mobilePdfPage).toBe(3);

    component.changeMobilePdfPage(-1);
    expect(component.mobilePdfPage).toBe(2);
  });
});
