import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { PendingInvoicesDialogComponent } from './pending-invoices-dialog.component';

describe('Elenco documenti precedenti nella finestra di conferma', () => {
  it('mostra numero, data, cliente e stato di tutte le fatture e note di credito, con apertura e conferma', async () => {
    const ref = jasmine.createSpyObj('MatDialogRef', ['close']);
    await TestBed.configureTestingModule({ imports: [PendingInvoicesDialogComponent], providers: [
      { provide: MAT_DIALOG_DATA, useValue: { documents: [
        { id: 1, number: '1', series: 'A', year: 2026, issueDate: '2026-08-08', customerName: 'Primo cliente', type: 'TD01', status: 'draft' },
        { id: 2, number: '2', series: 'A', year: 2026, issueDate: '2026-08-09', customerName: 'Secondo cliente', type: 'TD04', status: 'rejected' },
      ] } }, { provide: MatDialogRef, useValue: ref },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(PendingInvoicesDialogComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    for (const value of ['A/1', 'A/2', '08/08/2026', '09/08/2026', 'Primo cliente', 'Secondo cliente', 'Bozza', 'Scartata', 'Nota di credito']) expect(text).toContain(value);
    fixture.nativeElement.querySelector('li button').click();
    expect(ref.close).toHaveBeenCalledWith({ action: 'open', invoiceId: 1 });
    fixture.componentInstance.send();
    expect(ref.close).toHaveBeenCalledWith({ action: 'send' });
    fixture.componentInstance.cancel();
    expect(ref.close).toHaveBeenCalledWith(null);
    fixture.destroy();
  });
  it('elenca i numeri mancanti e richiede conferma anche senza documenti da aprire', async () => {
    const ref = jasmine.createSpyObj('MatDialogRef', ['close']);
    await TestBed.configureTestingModule({ imports: [PendingInvoicesDialogComponent], providers: [
      { provide: MAT_DIALOG_DATA, useValue: { documents: [], gaps: [{ from: '11', to: '11' }, { from: '13', to: '15' }], currentNumber: 'A/16' } },
      { provide: MatDialogRef, useValue: ref },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(PendingInvoicesDialogComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    for (const value of ['A/16', 'numero troppo alto', 'Numero mancante: 11', 'Numeri mancanti: da 13 a 15', 'Annulla', 'Invia comunque']) expect(text).toContain(value);
    expect(fixture.nativeElement.querySelector('li button')).toBeNull();
    expect(ref.close).not.toHaveBeenCalled();
    fixture.destroy();
  });

});
