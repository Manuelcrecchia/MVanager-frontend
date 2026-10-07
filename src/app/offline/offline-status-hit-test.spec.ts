import { TestBed, ComponentFixture } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { OfflineStatusComponent } from './offline-status.component';
import { OfflineService } from './offline.service';

describe('Save status browser hit testing', () => {
  let fixture: ComponentFixture<OfflineStatusComponent>;
  let shell: HTMLElement;
  let button: HTMLButtonElement;
  let offline: any;

  beforeEach(async () => {
    offline = {
      start: () => {}, session: () => ({ user: 'fixture' }),
      notice: new BehaviorSubject(''), hasFieldDraft: new BehaviorSubject(false),
      connected: new BehaviorSubject(true), operations: new BehaviorSubject([]),
      discardOperations: jasmine.createSpy('discardOperations').and.resolveTo(),
      sync: jasmine.createSpy('sync').and.resolveTo(),
    };
    await TestBed.configureTestingModule({
      imports: [OfflineStatusComponent],
      providers: [{ provide: OfflineService, useValue: offline }],
    }).compileComponents();
    fixture = TestBed.createComponent(OfflineStatusComponent);
    // Reproduce the real app-root hierarchy, including global page sizing rules.
    shell = document.createElement('app-root');
    document.body.appendChild(shell);
    shell.appendChild(fixture.nativeElement);
    button = document.createElement('button');
    button.textContent = 'Underlying page action';
    button.style.cssText = 'position:fixed;left:30px;top:100px;width:200px;height:44px;z-index:0';
    shell.appendChild(button);
    fixture.detectChanges();
  });

  afterEach(() => { fixture.destroy(); shell.remove(); });

  function expectUnderlyingActionReachable(): void {
    const hit = document.elementFromPoint(100, 120);
    expect(hit).toBe(button);
    const action = jasmine.createSpy('page action');
    button.addEventListener('click', action);
    (hit as HTMLElement)?.click();
    expect(action).toHaveBeenCalledTimes(1);
  }

  it('does not cover the page when the indicator is empty', () => {
    expect(fixture.nativeElement.querySelector('aside')).toBeNull();
    expect(fixture.nativeElement.getBoundingClientRect().height).toBe(0);
    expectUnderlyingActionReachable();
  });
  it('dismisses confirmed server saves automatically without asking the user to verify them', () => {
    offline.operations.next([{ id: 'confirmed', state: 'done', label: 'Test', createdAt: Date.now() }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('aside')).toBeNull();
    expectUnderlyingActionReachable();
  });

  it('does not show an online save as an unsaved offline operation while it is in flight', () => {
    offline.operations.next([{ id: 'online', foreground: true, foregroundUntil: Date.now() + 15000, leaseUntil: Date.now() + 330000, state: 'waiting', automatic: true, label: 'Turni', createdAt: Date.now() }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('aside')).toBeNull();
    expectUnderlyingActionReachable();
    offline.operations.next([{ ...offline.operations.value[0], foreground: false, error: 'Connessione assente' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('1 salvataggio in attesa');
    expect(fixture.nativeElement.textContent).toContain('riparte automaticamente');
    expect(fixture.nativeElement.textContent).not.toContain('Riprova');
  });

  it('keeps the page reachable with a collapsed pending-save indicator', () => {
    offline.operations.next([{ id: 'queued', state: 'waiting', label: 'Test', createdAt: Date.now() }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.getBoundingClientRect().height).toBeLessThan(100);
    expectUnderlyingActionReachable();
    const summary: HTMLElement = fixture.nativeElement.querySelector('summary');
    const rect = summary.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    expect(summary.contains(hit)).toBeTrue();
    (hit as HTMLElement).click();
    expect(fixture.nativeElement.querySelector('details').open).toBeTrue();
    summary.click();
    expect(fixture.nativeElement.querySelector('details').open).toBeFalse();
  });
  it('recovers confirmation automatically without manual retry or user certification', () => {
    offline.operations.next([{ id: 'uncertain', state: 'blocked', label: 'Test', createdAt: Date.now() }]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('ricontrolla automaticamente');
    expect(text).not.toContain('Ho verificato');
    expect(text).not.toContain('Da verificare');
    expect(text).not.toContain('Ricontrolla conferma');
    expect(text).not.toContain('Riprova invio');
    expect(offline.sync).not.toHaveBeenCalled();
  });
  it('explains rejected saves and links back to the original module for correction', () => {
    offline.operations.next([{ id: 'rejected', state: 'rejected', label: 'Test', createdAt: Date.now(), page: '/customers/edit/9', error: 'Email non valida' }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Non salvato · correggi i dati');
    expect(fixture.nativeElement.textContent).toContain('Email non valida');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/customers/edit/9');
    expect(fixture.nativeElement.textContent).not.toContain('Riprova invio');
  });
  it('opens the real day after a rejected grouped shift save', () => {
    offline.session = () => ({ role: 'admin' });
    offline.operations.next([{ id: 'conflict', state: 'rejected', method: 'POST', path: '/shifts/saveMultiple', body: { type: 'json', value: { shifts: [{ data: '2026-10-07' }] } }, page: '/homeAdmin/shifts/create?date=2026-10-07|shift-day:2026-10-07', label: 'Turni', createdAt: Date.now() }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe('/homeAdmin/shifts/create?date=2026-10-07');
  });
  it('explains legacy shift updates and opens their day instead of replaying stale changes', () => {
    offline.session = () => ({ role: 'admin' });
    offline.operations.next([{ id: 'old', state: 'waiting', method: 'POST', path: '/shifts/autosave', body: { type: 'json', value: { data: '2026-10-06' } }, label: 'Aggiornamento turno', createdAt: Date.now() }]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('1 aggiornamento precedente dei turni in attesa');
    expect(text).toContain('L’app cerca automaticamente la conferma');
    expect(text).not.toContain('Riprova invio'); expect(text).not.toContain('controlla che');
    expect(fixture.nativeElement.querySelector('a.recovery-action').getAttribute('href')).toBe('/homeAdmin/shifts/create?date=2026-10-06');
    expect(offline.sync).not.toHaveBeenCalled();
    offline.operations.next([{ id: 'old-final', state: 'waiting', automatic: false, method: 'POST', path: '/shifts/saveMultiple', body: { type: 'json', value: { shifts: [{ data: '2026-10-06' }] } }, label: 'Turni', createdAt: Date.now() }]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Riprova invio');
    expect(fixture.nativeElement.querySelector('a.recovery-action').getAttribute('href')).toBe('/homeAdmin/shifts/create?date=2026-10-06');
    offline.session = () => ({ role: 'employee' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a.recovery-action')).toBeNull();
  });

  it('closes an informational notice without leaving an invisible overlay', () => {
    offline.notice.next('Avviso di prova'); fixture.detectChanges();
    const dismiss: HTMLElement = fixture.nativeElement.querySelector('.dismiss-notice');
    const rect = dismiss.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    expect(dismiss.contains(hit)).toBeTrue();
    (hit as HTMLElement).click();
    fixture.detectChanges();
    expect(offline.notice.value).toBe('');
    expect(fixture.nativeElement.getBoundingClientRect().height).toBe(0);
    expectUnderlyingActionReachable();
  });
  it('requires confirmation before clearing the queue and allows cancelling', async () => {
    const row = { id: 'queued', owner: 'fixture', state: 'waiting', label: 'Test', createdAt: Date.now() };
    offline.operations.next([row]); fixture.detectChanges();
    const findButton = (text: string): HTMLButtonElement => Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(button => button.textContent?.trim() === text)!;
    findButton('Svuota coda').click(); fixture.detectChanges();
    expect(offline.discardOperations).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.removal-confirmation')).not.toBeNull();
    findButton('Annulla').click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.removal-confirmation')).toBeNull();
    expect(offline.discardOperations).not.toHaveBeenCalled();
    findButton('Elimina dalla coda').click(); fixture.detectChanges();
    findButton('Conferma eliminazione').click();
    await fixture.whenStable();
    expect(offline.discardOperations).toHaveBeenCalledOnceWith([row]);
  });
});
