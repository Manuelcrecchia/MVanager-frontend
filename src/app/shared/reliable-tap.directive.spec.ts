import { ReliableTapDirective } from './reliable-tap.directive';
import { ElementRef } from '@angular/core';

describe('ReliableTapDirective', () => {
  it('emits once for a touch pointerup and ignores its synthetic click', () => {
    const directive = new ReliableTapDirective(new ElementRef(document.createElement('button')));
    const emitted: Event[] = [];
    directive.reliableTap.subscribe((event) => emitted.push(event));
    const down = {
      pointerType: 'touch', pointerId: 7, clientX: 10, clientY: 10,
    } as PointerEvent;
    const up = {
      pointerType: 'touch', pointerId: 7, clientX: 12, clientY: 11,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as any;
    const click = {
      preventDefault: jasmine.createSpy('preventDefault'),
      stopImmediatePropagation: jasmine.createSpy('stopImmediatePropagation'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as any;

    directive.onPointerDown(down);
    directive.onPointerUp(up);
    directive.onClick(click);

    expect(emitted).toEqual([up]);
    expect(click.preventDefault).toHaveBeenCalled();
  });

  it('does not activate when the finger movement is a scroll', () => {
    const directive = new ReliableTapDirective(new ElementRef(document.createElement('button')));
    spyOn(directive.reliableTap, 'emit');

    directive.onPointerDown({
      pointerType: 'touch', pointerId: 4, clientX: 10, clientY: 10,
    } as PointerEvent);
    directive.onPointerUp({
      pointerType: 'touch', pointerId: 4, clientX: 10, clientY: 50,
    } as PointerEvent);

    expect(directive.reliableTap.emit).not.toHaveBeenCalled();
  });

  it('activates an existing click handler on the first touch without template changes', () => {
    const button = document.createElement('button');
    const clickHandler = jasmine.createSpy('clickHandler');
    button.addEventListener('click', clickHandler);
    const directive = new ReliableTapDirective(new ElementRef(button));
    const down = {
      pointerType: 'touch', pointerId: 8, clientX: 20, clientY: 20,
    } as PointerEvent;
    const up = {
      pointerType: 'touch', pointerId: 8, clientX: 21, clientY: 20,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as any;

    directive.onPointerDown(down);
    directive.onPointerUp(up);

    expect(clickHandler).toHaveBeenCalledTimes(1);
  });
});
