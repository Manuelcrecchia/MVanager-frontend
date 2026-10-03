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
});
