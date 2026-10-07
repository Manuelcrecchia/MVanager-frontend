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
  it('clears only unchanged scalar fields from a confirmed multipart submission', async () => {
    const fixture = TestBed.createComponent(TestForm); document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges(); await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#primary input');
    input.value = 'Multipart submitted'; input.dispatchEvent(new Event('input'));
    fixture.detectChanges(); await fixture.whenStable(); input.focus();
    const form = new FormData(); form.append('description', 'Multipart submitted'); form.append('attachment', new Blob(['file bytes']), 'file.txt');
    await firstValueFrom(service.intercept(new HttpRequest('POST', 'https://draft.test/customers/save', form), () => of(new HttpResponse({ body: { ok: true } }))));
    expect((await service.store.all('drafts')).some(row => row.value === 'Multipart submitted')).toBeFalse();
    fixture.nativeElement.remove(); fixture.destroy();
  });
  it('maps leave request field names while preserving newer multipart edits', async () => {
    const owner = service.session()!.owner, page = location.pathname + location.search;
    const scope = 'primary';
    const fields = [{ name: 'dataInizio', value: '2026-12-01' }, { name: 'tipo', value: 'giornaliero' }, { name: 'description', value: 'Newer unsent edit' }];
    for (const field of fields) await service.store.put('drafts', { id: `field|${owner}|${page}|${scope}|${field.name}`, owner, page, controlPath: [field.name], value: field.value, savedAt: Date.now() - 1000 });
    const fixture = TestBed.createComponent(TestForm); document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges(); await fixture.whenStable(); fixture.nativeElement.querySelector('#primary input').focus();
    const form = new FormData(); form.append('fromDate', '2026-12-01'); form.append('tipoPermesso', 'giornaliero'); form.append('description', 'Old submitted edit');
    await firstValueFrom(service.intercept(new HttpRequest('POST', 'https://draft.test/mv/leaveRequest/request', form), () => of(new HttpResponse({ body: { ok: true } }))));
    const remaining = await service.store.all('drafts');
    expect(remaining.some(row => row.value === '2026-12-01' || row.value === 'giornaliero')).toBeFalse();
    expect(remaining.some(row => row.value === 'Newer unsent edit')).toBeTrue();
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
  it('keeps a draft written by another editor when the first editor clears its saved draft', async () => {
    let a = { text: 'Initial A' }, b = { text: 'Initial B' };
    const first = watchDraft(service, () => a, saved => a = saved, '/two-editors'); await first.ready;
    a = { text: 'Submitted A' }; first.flush();
    const waitFor = async (text: string) => { for (let i = 0; i < 100; i++) { if ((await service.loadDraft('/two-editors'))?.text === text) return; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error('Draft write did not finish'); };
    await waitFor('Submitted A');
    const second = watchDraft(service, () => b, saved => b = saved, '/two-editors'); await second.ready;
    b = { text: 'Unsaved B' }; second.flush(); await waitFor('Unsaved B');
    try { await first.clear(); expect((await service.loadDraft('/two-editors'))?.text).toBe('Unsaved B'); }
    finally { first.stop(); second.stop(); }
  });
  it('keeps a separately written revision even when its text matches the first editor', async () => {
    let a = { text: 'Initial A' }, b = { text: 'Initial B' };
    const first = watchDraft(service, () => a, saved => a = saved, '/same-text'); await first.ready;
    a = { text: 'Shared text' }; first.flush();
    for (let i = 0; i < 100 && !(await service.loadDraft('/same-text')); i++) await new Promise(resolve => setTimeout(resolve, 5));
    const second = watchDraft(service, () => b, saved => b = saved, '/same-text'); await second.ready;
    b = { text: 'Other text' }; second.flush();
    b = { text: 'Shared text' }; second.flush();
    await new Promise(resolve => setTimeout(resolve, 30));
    try { await first.clear(); expect((await service.loadDraft('/same-text'))?.text).toBe('Shared text'); }
    finally { first.stop(); second.stop(); }
  });
  it('clears a restored legacy draft only while its original version still exists', async () => {
    const page = '/legacy-draft', owner = service.session()!.owner;
    await service.store.put('drafts', { id: `${owner}|${page}`, value: { text: 'Legacy' }, savedAt: 1 });
    let value = { text: '' };
    const watcher = watchDraft(service, () => value, saved => value = saved, page); await watcher.ready;
    expect(value.text).toBe('Legacy'); await watcher.clear(); expect(await service.loadDraft(page)).toBeNull();
  });
  it('does not clear another draft when this editor has never stored a version', async () => {
    const page = '/empty-editor'; let value = { text: '' };
    const watcher = watchDraft(service, () => value, saved => value = saved, page); await watcher.ready;
    await service.saveDraft({ text: 'Written elsewhere' }, page);
    await watcher.clear(); expect((await service.loadDraft(page)).text).toBe('Written elsewhere');
  });
});
