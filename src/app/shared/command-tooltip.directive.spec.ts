import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CommandTooltipDirective } from './command-tooltip.directive';

@Component({ standalone: true, imports: [CommandTooltipDirective], template: '<button appCommandTooltip="Sposta nel cestino" aria-label="Cestino" (click)="actions = actions + 1">Icona</button>' })
class TooltipFixture { actions = 0; }

describe('Command tooltip', () => {
  function setup() {
    const fixture = TestBed.createComponent(TooltipFixture);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    return { fixture, button };
  }
  function pointer(target: EventTarget, type: string, x = 10, y = 10, pointerType = 'touch') {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType, clientX: x, clientY: y }));
  }

  it('shows an accessible explanation on hover and removes it on exit', fakeAsync(() => {
    const { fixture, button } = setup();
    pointer(button, 'pointerenter', 10, 10, 'mouse');
    tick(300);
    const tooltip = document.querySelector('[role="tooltip"]')!;
    expect(tooltip.textContent).toBe('Sposta nel cestino');
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);
    pointer(button, 'pointerleave', 10, 10, 'mouse');
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    fixture.destroy();
  }));

  it('shows help on keyboard focus and dismisses it with Escape', () => {
    const { fixture, button } = setup();
    button.dispatchEvent(new FocusEvent('focus'));
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    fixture.destroy();
  });

  it('keeps only one explanation visible when mouse and keyboard target different commands', fakeAsync(() => {
    const first = setup();
    const second = setup();
    pointer(first.button, 'pointerenter', 10, 10, 'mouse');
    tick(300);
    second.button.dispatchEvent(new FocusEvent('focus'));
    expect(document.querySelectorAll('[role="tooltip"]').length).toBe(1);
    expect(first.button.hasAttribute('aria-describedby')).toBeFalse();
    first.fixture.destroy();
    second.fixture.destroy();
  }));

  it('shows help on long press and blocks the following command', fakeAsync(() => {
    const { fixture, button } = setup();
    pointer(button, 'pointerdown');
    tick(500);
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    pointer(button, 'pointerup');
    pointer(button, 'pointerleave');
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    button.click();
    expect(fixture.componentInstance.actions).toBe(0);
    tick(1800);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    // A new ordinary tap still runs the action.
    pointer(button, 'pointerdown');
    tick(100);
    pointer(button, 'pointerup');
    button.click();
    expect(fixture.componentInstance.actions).toBe(1);
    fixture.destroy();
  }));

  it('cancels the hold when the user scrolls or moves their finger', fakeAsync(() => {
    const { fixture, button } = setup();
    pointer(button, 'pointerdown');
    pointer(document, 'pointermove', 10, 30);
    tick(600);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    pointer(button, 'pointerup');
    fixture.destroy();
  }));

  it('cleans up tooltips and pending timers when the command is removed', fakeAsync(() => {
    const { fixture, button } = setup();
    pointer(button, 'pointerdown');
    tick(500);
    fixture.destroy();
    tick(2000);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  }));
});
