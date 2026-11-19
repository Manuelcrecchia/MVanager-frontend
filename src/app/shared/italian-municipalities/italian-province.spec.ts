import { Component, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { italianProvinceForCity } from './italian-province.util';
import { ItalianProvinceDirective } from './italian-province.directive';

@Component({ standalone: true, imports: [FormsModule, ItalianProvinceDirective], template: `<input [(ngModel)]="city" [provinceCity]="city" [(mvItalianProvince)]="province" [provinceCountry]="country" [readonly]="readonly" [disabled]="disabled">` })
class Host { city = ''; province = ''; country = 'IT'; readonly = false; disabled = false; }

describe('Provincia automatica dal comune', () => {
  it('riconosce comuni italiani, accenti, apostrofi e denominazioni bilingui', () => {
    for (const [city, province] of [['Pescara', 'PE'], ['Roma', 'RM'], ['San Giovanni Teatino', 'CH'], ['forli', 'FC'], ['L’Aquila', 'AQ'], ['Bozen', 'BZ'], ['Castegnero Nanto', 'VI']]) {
      expect(italianProvinceForCity(city)).withContext(city).toBe(province);
    }
    expect(italianProvinceForCity('  pescara  ', 'it')).toBe('PE');
  });

  it('non indovina province per comuni ambigui, parziali, sconosciuti o esteri', () => {
    expect(italianProvinceForCity('Castro')).toBeNull();
    expect(italianProvinceForCity('Castro (BG)')).toBe('BG');
    expect(italianProvinceForCity('Castro (LE)')).toBe('LE');
    expect(italianProvinceForCity('Castro (PE)')).toBeNull();
    expect(italianProvinceForCity('Pesc')).toBeNull();
    expect(italianProvinceForCity('Non esiste')).toBeNull();
    expect(italianProvinceForCity('Roma', 'US')).toBeNull();
  });

  it('compila la provincia mentre si digita nel campo reale e aggiorna se cambia comune', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges(); await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'Pescara'; input.dispatchEvent(new Event('input')); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.city).toBe('Pescara');
    expect(fixture.componentInstance.province).toBe('PE');
    input.value = 'Roma'; input.dispatchEvent(new Event('input')); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.province).toBe('RM');
    input.value = 'Comune sconosciuto'; input.dispatchEvent(new Event('input')); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.province).toBe('');
    fixture.destroy();
  });

  it('completa il comune caricato dal cliente o da una bozza, anche se il comune non cambia', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    host.city = 'Pescara';
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(host.province).toBe('PE');
    host.city = 'Roma'; host.province = '';
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(host.province).toBe('RM');
    host.province = '';
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(host.province).toBe('RM');
    fixture.destroy();
  });

  it('rispetta provincia presente, paese estero e documenti in sola lettura', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    const host = fixture.componentInstance;
    host.city = 'Pescara'; host.province = 'CH';
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(host.province).toBe('CH');
    host.province = ''; host.readonly = true;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(host.province).toBe('');
    host.readonly = false; host.disabled = true;
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(host.province).toBe('');
    host.disabled = false; host.country = 'US';
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(host.province).toBe('');
    host.country = 'IT';
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(host.province).toBe('PE');
    fixture.destroy();
  });

  it('lascia correggere la provincia manualmente e non la cancella quando il comune non è riconosciuto', () => {
    const directive = new ItalianProvinceDirective(new ElementRef(document.createElement('input')));
    const values: string[] = [];
    directive.mvItalianProvinceChange.subscribe((value) => values.push(value));
    directive.onCityChanged('Pescara');
    directive.mvItalianProvince = 'CH';
    directive.onCityChanged('Comune non riconosciuto');
    expect(values).toEqual(['PE']);
  });
});
