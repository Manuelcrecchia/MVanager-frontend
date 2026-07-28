import { Directive, ElementRef, EventEmitter, HostListener, OnDestroy, Output } from '@angular/core';

@Directive({
  selector: 'button, a, [role="button"], [appReliableTap]',
  standalone: true,
})
export class ReliableTapDirective implements OnDestroy {
  @Output() reliableTap = new EventEmitter<Event>();

  private pointerId: number | null = null;
  private startX = 0;
  private startY = 0;
  private lastTouchActivation = 0;
  private dispatchingFallbackClick = false;

  private readonly captureClick = (event: MouseEvent) => {
    if (this.dispatchingFallbackClick || Date.now() - this.lastTouchActivation >= 750) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  };

  constructor(private readonly host: ElementRef<HTMLElement>) {
    this.host.nativeElement.addEventListener('click', this.captureClick, true);
  }

  ngOnDestroy(): void {
    this.host.nativeElement.removeEventListener('click', this.captureClick, true);
  }

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(event: PointerEvent): void {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (this.pointerId !== event.pointerId) return;
    this.pointerId = null;
    const movement = Math.hypot(event.clientX - this.startX, event.clientY - this.startY);
    if (movement > 14) return;
    event.preventDefault();
    event.stopPropagation();
    this.lastTouchActivation = Date.now();
    if (this.reliableTap.observed) {
      this.reliableTap.emit(event);
      return;
    }

    // I template esistenti possono continuare a usare (click): sui dispositivi
    // touch lo attiviamo noi al primo tap, senza dover modificare 800+ pulsanti.
    this.dispatchingFallbackClick = true;
    this.host.nativeElement.click();
    this.dispatchingFallbackClick = false;
  }

  @HostListener('pointercancel')
  onPointerCancel(): void {
    this.pointerId = null;
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent): void {
    if (this.dispatchingFallbackClick) return;
    if (Date.now() - this.lastTouchActivation < 750) {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      return;
    }
    if (this.reliableTap.observed) {
      event.stopPropagation();
      this.reliableTap.emit(event);
    }
  }
}
