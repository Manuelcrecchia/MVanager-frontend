import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AgendaWidgetService } from '../../service/agenda-widget.service';
import { AgendaNavigatorDialogComponent } from './agenda-navigator-dialog.component';

describe('AgendaNavigatorDialogComponent', () => {
  const available = [{ id: 'google', label: 'Google Maps' }, { id: 'apple', label: 'Mappe' }];
  let widget: any;
  let dialog: any;
  beforeEach(async () => {
    widget = { setNavigator: jasmine.createSpy('save').and.callFake(async (selected: string) => ({ available, preferred: selected, selected })),
      getNavigationPreferences: jasmine.createSpy('reload').and.resolveTo({ available, preferred: '', selected: '' }) };
    dialog = { close: jasmine.createSpy('close') };
    await TestBed.configureTestingModule({ imports: [AgendaNavigatorDialogComponent, NoopAnimationsModule], providers: [
      { provide: MAT_DIALOG_DATA, useValue: { available, preferred: '', selected: '' } },
      { provide: AgendaWidgetService, useValue: widget }, { provide: MatDialogRef, useValue: dialog },
    ] }).compileComponents();
  });
  it('requires an explicit choice, saves it through native storage and explains where to change it', async () => {
    const fixture = TestBed.createComponent(AgendaNavigatorDialogComponent);
    fixture.detectChanges(); await fixture.whenStable();
    const save = fixture.nativeElement.querySelector('.btn-primary') as HTMLButtonElement;
    expect(save.disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Impostazioni calendario');
    const option = Array.from(fixture.nativeElement.querySelectorAll('label') as NodeListOf<HTMLLabelElement>).find(label => label.textContent?.includes('Google Maps'))!;
    const radio = option.querySelector('input')!;
    radio.click(); fixture.detectChanges(); await fixture.whenStable();
    expect(save.disabled).toBeFalse();
    save.click(); await fixture.whenStable();
    expect(widget.setNavigator).toHaveBeenCalledOnceWith('google');
    expect(dialog.close).toHaveBeenCalledOnceWith(true);
    fixture.destroy();
  });
  it('keeps a failed save open for retry and never saves when deferred', async () => {
    const fixture = TestBed.createComponent(AgendaNavigatorDialogComponent);
    fixture.detectChanges();
    widget.setNavigator.and.rejectWith(new Error('App removed'));
    fixture.componentInstance.choice = 'google';
    await fixture.componentInstance.save(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Impossibile salvare');
    expect(dialog.close).not.toHaveBeenCalled();
    expect(fixture.componentInstance.saving).toBeFalse();
    widget.setNavigator.calls.reset();
    fixture.nativeElement.querySelector('.btn-outline-secondary').click();
    expect(dialog.close).toHaveBeenCalledOnceWith(false);
    expect(widget.setNavigator).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
