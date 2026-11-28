import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MappedAmountDirective } from './mapped-amount.directive';

@Component({
  standalone: true,
  imports: [FormsModule, MappedAmountDirective],
  template: '<input appMappedAmount [(ngModel)]="amount">',
})
class AmountInputFixture {
  amount: number | string | null = 12;
}

describe('MappedAmountDirective', () => {
  it('formats amounts on load and on blur while keeping the model value', async () => {
    const fixture = TestBed.createComponent(AmountInputFixture);
    fixture.detectChanges();
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.value).toBe('12,00');
    expect(fixture.componentInstance.amount).toBe(12);

    input.value = '20,5';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('20,5');

    input.dispatchEvent(new Event('blur'));
    expect(input.value).toBe('20,50');
    expect(fixture.componentInstance.amount).toBe('20,5');

    fixture.componentInstance.amount = null;
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('');
  });
});
