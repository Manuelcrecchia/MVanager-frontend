import { Directive, ElementRef, HostListener, Renderer2, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formatMappedDecimal } from './mapped-amount';

@Directive({
  selector: 'input[appMappedAmount]',
  standalone: true,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => MappedAmountDirective),
    multi: true,
  }],
})
export class MappedAmountDirective implements ControlValueAccessor {
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    private input: ElementRef<HTMLInputElement>,
    private renderer: Renderer2,
  ) {}

  writeValue(value: unknown): void {
    this.renderer.setProperty(this.input.nativeElement, 'value', formatMappedDecimal(value));
  }

  registerOnChange(callback: (value: string) => void): void {
    this.onChange = callback;
  }

  registerOnTouched(callback: () => void): void {
    this.onTouched = callback;
  }

  setDisabledState(disabled: boolean): void {
    this.renderer.setProperty(this.input.nativeElement, 'disabled', disabled);
  }

  @HostListener('input', ['$event.target.value'])
  handleInput(value: string): void {
    this.onChange(value);
  }

  @HostListener('blur')
  handleBlur(): void {
    this.writeValue(this.input.nativeElement.value);
    this.onTouched();
  }
}
