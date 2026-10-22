import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { GlobalService } from '../../service/global.service';
import { CalendarSettingsComponent } from './calendar-settings.component';
import { AgendaWidgetService } from '../../service/agenda-widget.service';

describe('CalendarSettingsComponent', () => {
  async function navigationFixture(available: Array<{ id: string; label: string }>, selected = '') {
    const setNavigator = jasmine.createSpy('setNavigator').and.callFake(async (id: string) => ({ available, selected: id, preferred: id }));
    const widget = { available: true, navigationAvailable: true, status: {},
      getPreferences: async () => ({ enabled: true, group: 'all', private: false, hiddenTenantIds: [] }),
      getNavigationPreferences: async () => ({ available, selected, preferred: selected }), setNavigator };
    await TestBed.configureTestingModule({ imports: [CalendarSettingsComponent], providers: [
      { provide: HttpClient, useValue: { get: () => of({ categories: [] }) } },
      { provide: GlobalService, useValue: { url: '/' } }, { provide: Router, useValue: {} },
      { provide: AgendaWidgetService, useValue: widget },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CalendarSettingsComponent);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    return { fixture, setNavigator };
  }
  it('asks once even when only one navigator is reported, without silently saving a choice', async () => {
    const { fixture, setNavigator } = await navigationFixture([{ id: 'google', label: 'Google Maps' }]);
    expect(fixture.nativeElement.textContent).toContain('Scegli una volta');
    expect(fixture.nativeElement.textContent).toContain('Google Maps');
    expect(fixture.nativeElement.querySelector('#widget-navigator').value).toBe('');
    expect(setNavigator).not.toHaveBeenCalled(); fixture.destroy();
  });
  it('restores the saved navigator instead of prompting for another choice', async () => {
    const { fixture, setNavigator } = await navigationFixture([{ id: 'google', label: 'Google Maps' }, { id: 'waze', label: 'Waze' }], 'waze');
    expect(fixture.nativeElement.querySelector('#widget-navigator').value).toBe('waze');
    expect(setNavigator).not.toHaveBeenCalled(); fixture.destroy();
  });
  it('offers installed navigators and saves the choice without changing widget filters', async () => {
    const { fixture, setNavigator } = await navigationFixture([{ id: 'google', label: 'Google Maps' }, { id: 'waze', label: 'Waze' }]);
    const select = fixture.nativeElement.querySelector('#widget-navigator') as HTMLSelectElement;
    expect(select.options.length).toBe(3); expect(select.value).toBe('');
    select.value = 'waze'; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    const save = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button => button.textContent?.includes('Salva navigatore'))!;
    save.click(); await fixture.whenStable(); fixture.detectChanges();
    expect(setNavigator).toHaveBeenCalledOnceWith('waze');
    expect(fixture.nativeElement.textContent).toContain('Navigatore salvato per questo iPhone.');
    expect(select.value).toBe('waze'); fixture.destroy();
  });
  it('loads personal categories, preserves Evento and saves a new category through its form', async () => {
    const defaultCategory = { id: 'personal-event', label: 'Evento', color: '#7c3aed' };
    const post = jasmine.createSpy('post').and.returnValue(of({ categories: [defaultCategory,
      { id: 'personal-00000000-0000-0000-0000-000000000001', label: 'Famiglia di prova', color: '#7c3aed' }] }));
    const get = jasmine.createSpy('get').and.returnValue(of({ categories: [defaultCategory] }));
    await TestBed.configureTestingModule({ imports: [CalendarSettingsComponent], providers: [
      { provide: HttpClient, useValue: { get, post } }, { provide: GlobalService, useValue: { url: '/' } },
      { provide: Router, useValue: {} },
      { provide: AgendaWidgetService, useValue: { available: false } },
    ] }).compileComponents();
    const fixture = TestBed.createComponent(CalendarSettingsComponent);
    fixture.detectChanges(); await fixture.whenStable();
    const firstRow = fixture.nativeElement.querySelector('.category-list li') as HTMLElement;
    expect(firstRow.textContent).toContain('Evento');
    expect(firstRow.querySelector('button')).toBeNull();
    const input = fixture.nativeElement.querySelector('#personal-category-name') as HTMLInputElement;
    input.value = 'Famiglia di prova'; input.dispatchEvent(new Event('input'));
    fixture.detectChanges(); await fixture.whenStable();
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(post.calls.mostRecent().args[0]).toBe('/appointments/personalCategories/save');
    expect(post.calls.mostRecent().args[1].label).toBe('Famiglia di prova');
    expect(fixture.nativeElement.textContent).toContain('Categoria salvata.');
    expect(fixture.nativeElement.querySelectorAll('.category-list li').length).toBe(2);
    fixture.destroy();
  });
});
