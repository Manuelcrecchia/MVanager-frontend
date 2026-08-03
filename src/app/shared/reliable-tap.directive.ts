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
      // Il listener può navigare e sostituire il pulsante con un controllo
      // posto sotto lo stesso punto. La guardia deve esistere prima
      // dell'emissione, altrimenti il click sintetico può aprire quel controllo.
      this.suppressRetargetedSyntheticClick(event);
      this.reliableTap.emit(event);
      return;
    }

    // I template esistenti possono continuare a usare (click): sui dispositivi
    // touch lo attiviamo noi al primo tap, senza dover modificare 800+ pulsanti.
    // Anche qui la guardia va installata prima: il click applicativo può
    // navigare sincronicamente e creare un nuovo controllo sotto il dito.
    this.suppressRetargetedSyntheticClick(event);
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

  private suppressRetargetedSyntheticClick(pointerEvent: PointerEvent): void {
    const ownerDocument = this.host.nativeElement.ownerDocument;
    const expiresAt = Date.now() + 750;
    const startX = pointerEvent.clientX;
    const startY = pointerEvent.clientY;
    let timeoutId: ReturnType<typeof setTimeout>;

    const removeGuard = () => {
      ownerDocument.removeEventListener('click', guard, true);
      clearTimeout(timeoutId);
    };
    const guard = (event: MouseEvent) => {
      // È il click programmatico intenzionale usato per eseguire il vecchio
      // handler (click), non il click residuo da bloccare.
      if (this.dispatchingFallbackClick && event.target === this.host.nativeElement) return;
      if (Date.now() >= expiresAt) {
        removeGuard();
        return;
      }

      const isSamePoint = Math.hypot(
        event.clientX - startX,
        event.clientY - startY,
      ) <= 32;
      if (!isSamePoint) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      removeGuard();
    };

    ownerDocument.addEventListener('click', guard, true);
    timeoutId = setTimeout(removeGuard, 800);
  }
}
