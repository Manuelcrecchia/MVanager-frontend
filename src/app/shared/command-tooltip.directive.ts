import { Directive, ElementRef, HostListener, Input, OnDestroy } from '@angular/core';

let nextTooltipId = 0;

@Directive({ selector: '[appCommandTooltip]', standalone: true })
export class CommandTooltipDirective implements OnDestroy {
  private static active: CommandTooltipDirective | null = null;
  @Input('appCommandTooltip') text = '';
  private tooltip: HTMLElement | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private dismissTimer?: ReturnType<typeof setTimeout>;
  private startPoint: { x: number; y: number } | null = null;
  private held = false;
  private suppressClickUntil = 0;
  private lastTouchAt = 0;
  private previousDescription: string | null = null;
  private readonly host: HTMLElement;
  private readonly document: Document;
  private readonly cancelClick = (event: Event) => {
    if (Date.now() < this.suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  private readonly move = (event: PointerEvent) => {
    if (this.startPoint && Math.hypot(event.clientX - this.startPoint.x, event.clientY - this.startPoint.y) > 10) {
      this.cancelPress();
      this.hide();
    }
  };
  private readonly release = () => {
    if (!this.startPoint) return;
    if (this.held) {
      this.suppressClickUntil = Date.now() + 1000;
      this.dismissTimer = setTimeout(() => this.hide(), 1800);
    }
    this.cancelPress();
  };
  private readonly dismiss = () => { this.cancelPress(); this.hide(); };

  constructor(element: ElementRef<HTMLElement>) {
    this.host = element.nativeElement;
    this.document = this.host.ownerDocument;
    // Capture runs before the command's Angular click handler.
    this.host.addEventListener('click', this.cancelClick, true);
    this.document.addEventListener('pointermove', this.move, { passive: true });
    this.document.addEventListener('pointerup', this.release);
    this.document.addEventListener('pointercancel', this.dismiss);
    this.document.addEventListener('scroll', this.dismiss, true);
    this.document.defaultView?.addEventListener('resize', this.dismiss);
  }

  @HostListener('pointerenter', ['$event']) enter(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.timer = setTimeout(() => this.show(), 300);
  }
  @HostListener('pointerleave', ['$event']) leave(event: PointerEvent): void {
    // Touch pointers leave the element on release; retain the explanation until its timeout.
    if (event.pointerType === 'touch' || event.pointerType === 'pen') return;
    this.cancelPress();
    this.hide();
  }
  @HostListener('focus') focus(): void {
    if (Date.now() - this.lastTouchAt > 1000) this.show();
  }
  @HostListener('blur') blur(): void { this.hide(); }
  @HostListener('keydown.escape') escape(): void { this.dismiss(); }
  @HostListener('pointerdown', ['$event']) press(event: PointerEvent): void {
    this.cancelPress();
    this.hide();
    this.suppressClickUntil = 0;
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    this.lastTouchAt = Date.now();
    this.startPoint = { x: event.clientX, y: event.clientY };
    this.timer = setTimeout(() => {
      this.held = true;
      this.suppressClickUntil = Date.now() + 60000;
      this.show();
    }, 500);
  }
  @HostListener('contextmenu', ['$event']) context(event: Event): void {
    if (this.startPoint || this.held || Date.now() < this.suppressClickUntil) event.preventDefault();
  }

  private show(): void {
    if (this.tooltip || !this.text) return;
    CommandTooltipDirective.active?.hide();
    CommandTooltipDirective.active = this;
    const tip = this.document.createElement('div');
    tip.id = `command-tooltip-${++nextTooltipId}`;
    tip.setAttribute('role', 'tooltip');
    tip.textContent = this.text;
    Object.assign(tip.style, {
      position: 'fixed', zIndex: '10000', maxWidth: 'min(260px, calc(100vw - 16px))',
      padding: '8px 12px', borderRadius: '8px', background: '#182235', color: '#fff',
      fontSize: '13px', lineHeight: '1.4', fontFamily: 'inherit', pointerEvents: 'none',
      overflowWrap: 'anywhere', boxShadow: '0 4px 16px rgba(0,0,0,.2)',
    });
    this.document.body.appendChild(tip);
    this.tooltip = tip;
    this.previousDescription = this.host.getAttribute('aria-describedby');
    this.host.setAttribute('aria-describedby', [this.previousDescription, tip.id].filter(Boolean).join(' '));
    const rect = this.host.getBoundingClientRect();
    const bounds = tip.getBoundingClientRect();
    const viewportWidth = this.document.documentElement.clientWidth;
    const viewportHeight = this.document.documentElement.clientHeight;
    tip.style.left = `${Math.max(8, Math.min(rect.left + (rect.width - bounds.width) / 2, viewportWidth - bounds.width - 8))}px`;
    const top = rect.top > bounds.height + 16 ? rect.top - bounds.height - 8 : rect.bottom + 8;
    tip.style.top = `${Math.max(8, Math.min(top, viewportHeight - bounds.height - 8))}px`;
  }
  private cancelPress(): void {
    clearTimeout(this.timer);
    this.startPoint = null;
    this.held = false;
  }
  private hide(): void {
    clearTimeout(this.dismissTimer);
    if (!this.tooltip) return;
    this.tooltip.remove();
    this.tooltip = null;
    if (CommandTooltipDirective.active === this) CommandTooltipDirective.active = null;
    if (this.previousDescription === null) this.host.removeAttribute('aria-describedby');
    else this.host.setAttribute('aria-describedby', this.previousDescription);
  }
  ngOnDestroy(): void {
    this.dismiss();
    this.host.removeEventListener('click', this.cancelClick, true);
    this.document.removeEventListener('pointermove', this.move);
    this.document.removeEventListener('pointerup', this.release);
    this.document.removeEventListener('pointercancel', this.dismiss);
    this.document.removeEventListener('scroll', this.dismiss, true);
    this.document.defaultView?.removeEventListener('resize', this.dismiss);
  }
}
