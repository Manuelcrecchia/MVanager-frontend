import { ReliableTapDirective } from './reliable-tap.directive';
import { ElementRef } from '@angular/core';

describe('ReliableTapDirective', () => {
  it('emits once for a touch pointerup and ignores its synthetic click', () => {
    jasmine.clock().install();
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
    jasmine.clock().tick(800);
    jasmine.clock().uninstall();
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
    jasmine.clock().install();
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
    jasmine.clock().tick(800);
    jasmine.clock().uninstall();
  });

  it('blocks the synthetic click when the tapped button is replaced in the DOM', () => {
    jasmine.clock().install();
    const source = document.createElement('button');
    const replacement = document.createElement('button');
    document.body.append(source, replacement);
    const replacementClick = jasmine.createSpy('replacementClick');
    replacement.addEventListener('click', replacementClick);
    const directive = new ReliableTapDirective(new ElementRef(source));
    directive.reliableTap.subscribe(() => source.remove());

    directive.onPointerDown({
      pointerType: 'touch', pointerId: 9, clientX: 40, clientY: 80,
    } as PointerEvent);
    directive.onPointerUp({
      pointerType: 'touch', pointerId: 9, clientX: 41, clientY: 81,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as any);
    replacement.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 41,
      clientY: 81,
    }));

    expect(replacementClick).not.toHaveBeenCalled();

    jasmine.clock().tick(800);
    directive.ngOnDestroy();
    replacement.remove();
    jasmine.clock().uninstall();
  });

  it('installs the click guard before a navigation listener replaces the page', () => {
    jasmine.clock().install();
    const source = document.createElement('button');
    const replacement = document.createElement('select');
    document.body.append(source, replacement);
    const replacementClick = jasmine.createSpy('replacementClick');
    replacement.addEventListener('click', replacementClick);
    const directive = new ReliableTapDirective(new ElementRef(source));

    directive.reliableTap.subscribe(() => {
      source.remove();
      replacement.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 51,
        clientY: 91,
      }));
    });

    directive.onPointerDown({
      pointerType: 'touch', pointerId: 10, clientX: 50, clientY: 90,
    } as PointerEvent);
    directive.onPointerUp({
      pointerType: 'touch', pointerId: 10, clientX: 51, clientY: 91,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as any);

    expect(replacementClick).not.toHaveBeenCalled();

    jasmine.clock().tick(800);
    directive.ngOnDestroy();
    replacement.remove();
    jasmine.clock().uninstall();
  });

  it('protects legacy click handlers that replace the page during navigation', () => {
    jasmine.clock().install();
    const source = document.createElement('button');
    const replacement = document.createElement('input');
    document.body.append(source, replacement);
    const replacementClick = jasmine.createSpy('replacementClick');
    replacement.addEventListener('click', replacementClick);
    source.addEventListener('click', () => {
      source.remove();
      replacement.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 71,
        clientY: 111,
      }));
    });
    const directive = new ReliableTapDirective(new ElementRef(source));

    directive.onPointerDown({
      pointerType: 'touch', pointerId: 11, clientX: 70, clientY: 110,
    } as PointerEvent);
    directive.onPointerUp({
      pointerType: 'touch', pointerId: 11, clientX: 71, clientY: 111,
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
    } as any);

    expect(replacementClick).not.toHaveBeenCalled();

    jasmine.clock().tick(800);
    directive.ngOnDestroy();
    replacement.remove();
    jasmine.clock().uninstall();
  });
});
