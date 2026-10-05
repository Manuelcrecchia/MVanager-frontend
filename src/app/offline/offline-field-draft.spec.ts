import { Component, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { HttpBackend, HttpRequest, HttpResponse } from '@angular/common/http';
import { firstValueFrom, of, Subject } from 'rxjs';
import { OfflineService } from './offline.service';
import { OfflineFieldDraftDirective } from './offline-field-draft.directive';
import { watchDraft } from './offline-draft';

@Component({ standalone: true, imports: [FormsModule, OfflineFieldDraftDirective], template: '<form id="primary"><input name="description" [(ngModel)]="description"><input type="password" name="password" [(ngModel)]="password"></form><form id="secondary"><input name="description" [(ngModel)]="otherDescription"></form>' })
class TestForm { description = ''; otherDescription = ''; password = ''; }

describe('Editable field recovery', () => {
  let service: OfflineService;
  beforeEach(async () => {
    const token = `e30.${btoa(JSON.stringify({ id: 71, tenantId: 'draft-test', exp: Math.floor(Date.now()/1000)+3600 }))}.signature`;
    service = new OfflineService({ get: () => () => ({ baseUrl: 'https://draft.test/', tenant: 'draft-test', token, role: 'admin' }) } as unknown as Injector, { handle: () => of(new HttpResponse()) } as HttpBackend);
    for (const row of await service.store.all('drafts')) await service.store.remove('drafts', row.id);
    for (const row of await service.store.all('queue')) await service.store.remove('queue', row.id);
    await TestBed.configureTestingModule({ imports: [TestForm], providers: [{ provide: OfflineService, useValue: service }] }).compileComponents();
  });
  it('keeps typed fields across destruction and explicitly restores their Angular models', async () => {
    const first = TestBed.createComponent(TestForm); first.detectChanges(); await first.whenStable();
    const input = first.nativeElement.querySelector('input'); input.value = 'Lavoro in garage'; input.dispatchEvent(new Event('input'));
    first.detectChanges(); await first.whenStable();
    expect((await service.store.all('drafts')).some(row => row.value === 'Lavoro in garage')).toBeTrue();
    first.destroy();
    const second = TestBed.createComponent(TestForm); second.detectChanges(); await second.whenStable();
    expect(second.componentInstance.description).toBe('');
    await service.restoreFields(); second.detectChanges();
    expect(second.componentInstance.description).toBe('Lavoro in garage'); second.destroy();
  });
  it('never stores password controls', async () => {
    const fixture = TestBed.createComponent(TestForm); fixture.detectChanges(); await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input[type=password]'); input.value = 'not-for-storage'; input.dispatchEvent(new Event('input'));
    fixture.detectChanges(); await fixture.whenStable();
    expect(JSON.stringify(await service.store.all('drafts'))).not.toContain('not-for-storage'); fixture.destroy();
  });
  it('clears only fields submitted by the saved form and preserves another form on the same page', async () => {
    const fixture = TestBed.createComponent(TestForm); document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges(); await fixture.whenStable();
    for (const [id, value] of [['primary', 'Lavoro inviato'], ['secondary', 'Altra bozza da conservare']]) {
      const input: HTMLInputElement = fixture.nativeElement.querySelector(`#${id} input`);
      input.value = value; input.dispatchEvent(new Event('input'));
      fixture.detectChanges(); await fixture.whenStable();
    }
    fixture.nativeElement.querySelector('#primary input').focus();
    const req = new HttpRequest('POST', 'https://draft.test/customers/save', { description: 'Lavoro inviato' });
    await firstValueFrom(service.intercept(req, () => of(new HttpResponse({ body: { ok: true } }))));
    const drafts = await service.store.all('drafts');
    expect(drafts.some(row => row.value === 'Lavoro inviato')).toBeFalse();
    expect(drafts.some(row => row.value === 'Altra bozza da conservare')).toBeTrue();
    fixture.nativeElement.remove(); fixture.destroy();
  });
  it('preserves a newer field edit made while the previous value is saving', async () => {
    const fixture = TestBed.createComponent(TestForm); document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges(); await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#primary input');
    input.value = 'Prima versione'; input.dispatchEvent(new Event('input'));
    fixture.detectChanges(); await fixture.whenStable(); input.focus();
    const response = new Subject<HttpResponse<any>>();
    const started = new Subject<void>();
    const entered = firstValueFrom(started);
    const req = new HttpRequest('POST', 'https://draft.test/customers/save', { description: 'Prima versione' });
    const saving = firstValueFrom(service.intercept(req, () => { started.next(); return response; }));
    await entered;
    input.value = 'Seconda versione non ancora inviata'; input.dispatchEvent(new Event('input'));
    fixture.detectChanges(); await fixture.whenStable();
    response.next(new HttpResponse({ body: { ok: true } })); response.complete(); await saving;
    expect((await service.store.all('drafts')).some(row => row.value === 'Seconda versione non ancora inviata')).toBeTrue();
    fixture.nativeElement.remove(); fixture.destroy();
  });
  it('clears pending draft writes before binding another note form', async () => {
    let value = { text: 'Nota' };
    const first = watchDraft(service, () => value, saved => value = saved); await first.ready;
    value = { text: 'Nota modificata' }; first.flush(); await first.clear();
    value = { text: '' };
    const second = watchDraft(service, () => value, saved => value = saved); await second.ready;
    expect(value.text).toBe(''); second.stop();
  });
});
