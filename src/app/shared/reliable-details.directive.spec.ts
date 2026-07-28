import { ElementRef } from '@angular/core';
import { ReliableDetailsDirective } from './reliable-details.directive';

describe('ReliableDetailsDirective', () => {
  it('toggles a details element on the first touch without duplicating the click', () => {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Storico';
    details.appendChild(summary);
    const directive = new ReliableDetailsDirective(new ElementRef(details));
    const down = { pointerType: 'touch', pointerId: 2, clientX: 5, clientY: 5, target: summary } as unknown as PointerEvent;
    const up = {
      pointerType: 'touch', pointerId: 2, clientX: 6, clientY: 6, target: summary,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as any;
    const click = {
      target: summary,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as any;

    directive.onPointerDown(down);
    directive.onPointerUp(up);
    directive.onClick(click);

    expect(details.open).toBeTrue();
    expect(click.preventDefault).toHaveBeenCalled();
  });

  it('ignores taps on controls inside the details body', () => {
    const details = document.createElement('details');
    details.appendChild(document.createElement('summary'));
    const button = document.createElement('button');
    details.appendChild(button);
    const directive = new ReliableDetailsDirective(new ElementRef(details));

    directive.onPointerDown({
      pointerType: 'touch', pointerId: 3, clientX: 5, clientY: 5, target: button,
    } as unknown as PointerEvent);
    directive.onPointerUp({
      pointerType: 'touch', pointerId: 3, clientX: 5, clientY: 5, target: button,
    } as unknown as PointerEvent);

    expect(details.open).toBeFalse();
  });
});
