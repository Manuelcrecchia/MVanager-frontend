import { Directive, ElementRef, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { italianProvinceForCity } from './italian-province.util';

@Directive({ selector: 'input[mvItalianProvince]', standalone: true })
export class ItalianProvinceDirective implements OnChanges, OnDestroy {
  @Input() mvItalianProvince: string | null | undefined = '';
  @Input() provinceCountry: unknown = 'IT';
  // NgModelChange covers typing; this input also observes customer selection and draft restoration.
  @Input() provinceCity: unknown;
  @Output() mvItalianProvinceChange = new EventEmitter<string>();
  private lastCity: unknown;
  private lastAutomaticProvince = '';
  private destroyed = false;
  private updatePending = false;

  constructor(private element: ElementRef<HTMLInputElement>) {}

  @HostListener('ngModelChange', ['$event'])
  onCityChanged(city: unknown): void {
    this.lastCity = city;
    this.updateProvince(false);
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['provinceCity']) this.lastCity = this.provinceCity;
    if (this.updatePending) return;
    this.updatePending = true;
    // Wait until country, province and readonly bindings have all been applied.
    Promise.resolve().then(() => {
      this.updatePending = false;
      if (!this.destroyed) this.updateProvince(true);
    });
  }
  ngOnDestroy(): void { this.destroyed = true; }

  private updateProvince(fillMissingOnly: boolean): void {
    const input = this.element.nativeElement;
    if (input.readOnly || input.disabled) return;
    const province = italianProvinceForCity(this.lastCity, this.provinceCountry);
    if (province) {
      // Data loaded from an existing record retains any province already provided.
      if (fillMissingOnly && String(this.mvItalianProvince || '').trim()) return;
      this.lastAutomaticProvince = province;
      if (this.mvItalianProvince !== province) this.mvItalianProvinceChange.emit(province);
    } else if (this.lastAutomaticProvince && this.mvItalianProvince === this.lastAutomaticProvince) {
      this.lastAutomaticProvince = '';
      this.mvItalianProvinceChange.emit('');
    }
  }
}
