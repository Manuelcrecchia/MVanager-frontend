import { Directive, ElementRef, HostListener } from '@angular/core';

@Directive({
  selector: 'details[appReliableDetails]',
})
export class ReliableDetailsDirective {
  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private lastTouchToggle = 0;

  constructor(private readonly host: ElementRef<HTMLDetailsElement>) {}

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if (!this.isTouch(event) || !this.isOwnSummary(event.target)) return;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(event: PointerEvent): void {
    if (!this.isTouch(event) || !this.isOwnSummary(event.target)) return;
    if (this.pointerId !== event.pointerId) return;
    this.pointerId = null;
    if (Math.hypot(event.clientX - this.startX, event.clientY - this.startY) > 14) return;
    event.preventDefault();
    event.stopPropagation();
    this.host.nativeElement.open = !this.host.nativeElement.open;
    this.lastTouchToggle = Date.now();
  }

  @HostListener('pointercancel')
  onPointerCancel(): void {
    this.pointerId = null;
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    if (!this.isOwnSummary(event.target)) return;
    if (Date.now() - this.lastTouchToggle < 750) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private isTouch(event: PointerEvent): boolean {
    return event.pointerType === 'touch' || event.pointerType === 'pen';
  }

  private isOwnSummary(target: EventTarget | null): boolean {
    const element = target instanceof Element ? target : null;
    const summary = element?.closest('summary');
    return !!summary && summary.parentElement === this.host.nativeElement;
  }
}
