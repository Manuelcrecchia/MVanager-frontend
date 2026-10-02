import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { LinkedFieldsComponent } from './linked-fields.component';

describe('Linked list editor', () => {
  let fixture: ComponentFixture<LinkedFieldsComponent>;
  let values: string[][];
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LinkedFieldsComponent, NoopAnimationsModule] }).compileComponents();
    fixture = TestBed.createComponent(LinkedFieldsComponent);
    fixture.componentInstance.fields = [
      {key: 'servizi', dbColumn: 'servizi', label: 'Servizi', type: 'list'},
      {key: 'interventi', dbColumn: 'interventi', label: 'Interventi', type: 'list'},
    ];
    values = [['Scale', 'Cortile'], ['1S']];
    fixture.componentInstance.readRows = field => values[field.key === 'servizi' ? 0 : 1];
    fixture.componentInstance.rowsChange.subscribe(changes => values = changes.map(item => item.values));
    fixture.detectChanges();
    await fixture.whenStable();
  });
  it('renders service and intervention in the same block and preserves empty counterparts', () => {
    const blocks = fixture.nativeElement.querySelectorAll('.linked-record');
    expect(blocks.length).toBe(2);
    const inputs = blocks[1].querySelectorAll('input');
    expect(inputs[0].value).toBe('Cortile');
    expect(inputs[1].value).toBe('');
  });
  it('adds and removes both cells through the shared buttons', () => {
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    buttons.find(button => button.textContent?.includes('Aggiungi riga'))!.click();
    fixture.detectChanges();
    expect(values).toEqual([['Scale', 'Cortile', ''], ['1S', '', '']]);
    (fixture.nativeElement.querySelector('button[aria-label="Rimuovi riga 1"]') as HTMLButtonElement).click();
    expect(values).toEqual([['Cortile', ''], ['', '']]);
  });
  it('edits a previously missing cell through the input without altering the service', async () => {
    const input = fixture.nativeElement.querySelectorAll('.linked-record')[1].querySelectorAll('input')[1];
    input.value = '2S'; input.dispatchEvent(new Event('input'));
    fixture.detectChanges(); await fixture.whenStable();
    expect(values).toEqual([['Scale', 'Cortile'], ['1S', '2S']]);
  });
  it('keeps cells side by side on desktop and stacked within each block on mobile', () => {
    const block = fixture.nativeElement.querySelector('.linked-record');
    const cells = block.querySelectorAll('.linked-cell');
    const a = cells[0].getBoundingClientRect(); const b = cells[1].getBoundingClientRect();
    if (window.innerWidth <= 700) expect(b.top).toBeGreaterThan(a.top);
    else expect(Math.abs(a.top - b.top)).toBeLessThan(1);
    expect(b.right).toBeLessThanOrEqual(block.getBoundingClientRect().right + 1);
  });
  it('provides a read-only paired display without editing controls', () => {
    fixture.componentInstance.readOnly = true; fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('input, button').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Scale');
    expect(fixture.nativeElement.textContent).toContain('1S');
  });
});
