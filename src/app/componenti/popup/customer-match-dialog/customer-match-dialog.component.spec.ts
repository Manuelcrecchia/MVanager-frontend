import { TestBed, ComponentFixture } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CustomerMatchDialogComponent, CustomerMatchDialogData } from './customer-match-dialog.component';

describe('Scelta cliente tra omonimi', () => {
  let fixture: ComponentFixture<CustomerMatchDialogComponent>;
  let close: jasmine.Spy;
  let data: CustomerMatchDialogData;
  beforeEach(async () => {
    close = jasmine.createSpy('close');
    data = { allowCreate: true, candidates: [
      { customerId: '7', customerName: 'Mario Rossi', customerAddress: 'Via Roma 1', customerFiscalCode: 'FISCAL7', customerVatNumber: 'VAT7', changes: [] },
      { customerId: '8', customerName: 'Mario Rossi', customerAddress: 'Via Milano 2', customerFiscalCode: 'FISCAL8', customerVatNumber: 'VAT8', changes: [
        { field: 'customerAddress', label: 'Indirizzo', previous: 'Via Milano 2', value: 'Via Roma 1' },
      ] },
    ] };
    await TestBed.configureTestingModule({ imports: [CustomerMatchDialogComponent], providers: [
      { provide: MAT_DIALOG_DATA, useValue: data }, { provide: MatDialogRef, useValue: { close } },
    ] }).compileComponents();
    fixture = TestBed.createComponent(CustomerMatchDialogComponent);
    fixture.detectChanges();
  });

  it('mostra tutti gli indirizzi e gli identificativi fiscali, senza preselezionare clienti', () => {
    const text = fixture.nativeElement.textContent;
    for (const value of ['Via Roma 1', 'Via Milano 2', 'FISCAL7', 'FISCAL8', 'VAT7', 'VAT8']) expect(text).toContain(value);
    expect(fixture.componentInstance.selected).toBeUndefined();
    const buttons = fixture.nativeElement.querySelectorAll('button');
    expect(buttons[0].disabled).toBeTrue();
    expect(buttons[1].disabled).toBeTrue();
  });

  for (const [index, action] of [[0, 'update'], [1, 'keep']] as const) {
    it(`seleziona il secondo cliente e conferma ${action}`, () => {
      fixture.nativeElement.querySelectorAll('input')[1].click();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Via Milano 2 → Via Roma 1');
      fixture.nativeElement.querySelectorAll('button')[index].click();
      expect(close).toHaveBeenCalledWith({ customerId: '8', action });
    });
  }

  it('annulla senza scelta e non consente collegamenti senza selezione', () => {
    fixture.componentInstance.choose('update');
    expect(close).not.toHaveBeenCalled();
    fixture.componentInstance.cancel();
    expect(close).toHaveBeenCalledWith(null);
  });

  it('nasconde e blocca la creazione quando ci sono dati fiscali coincidenti', () => {
    data.allowCreate = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Crea nuovo cliente');
    fixture.componentInstance.choose('create');
    expect(close).not.toHaveBeenCalled();
  });

  it('consente una creazione distinta esplicita per gli omonimi', () => {
    fixture.componentInstance.choose('create');
    expect(close).toHaveBeenCalledWith({ customerId: '7', action: 'create' });
  });
});
