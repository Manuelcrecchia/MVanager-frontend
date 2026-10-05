import { AfterViewInit, Directive, ElementRef, HostListener, OnDestroy, Optional, Self } from '@angular/core';
import { NgControl } from '@angular/forms';
import { OfflineService } from './offline.service';

/** Generic recovery for named editable controls, including settings and forms
 * outside the dedicated quote/note/signature adapters. Restoration is explicit
 * so asynchronous server loading cannot silently overwrite a recovered value. */
@Directive({ selector: '[ngModel],[formControlName]', standalone: true })
export class OfflineFieldDraftDirective implements AfterViewInit, OnDestroy {
  private key = '';
  private owner = '';
  private page = '';
  private destroyed = false;
  constructor(@Self() @Optional() private control: NgControl, private element: ElementRef<HTMLElement>, private offline: OfflineService) {}
  ngAfterViewInit(): void {
    const element = this.element.nativeElement;
    const session = this.offline.session();
    const name = String(this.control?.name || element.id || '');
    if (!session || !name || !this.control?.control ||
        /password|passwd|token|otp|secret|pin|credential|cvv|cardnumber|api[-_]?key/i.test(name) ||
        element.hasAttribute('readonly') ||
        ['password','hidden','file'].includes(element.getAttribute('type') || '') ||
        element.closest('app-add-quote,app-edit-quote,app-quote-notes,app-customer-notes,app-foglio-fine-lavoro') ||
        /\/(login|accesso|public|accept|verify|reset|forgot)/i.test(location.pathname)) return;
    const form = element.closest('form');
    const scope = form?.id || form?.getAttribute('name') || (form ? String(Array.from(document.forms).indexOf(form)) : 'page');
    this.owner = session.owner; this.page = location.pathname + location.search;
    this.key = `field|${this.owner}|${this.page}|${scope}|${this.control.path?.join('.') || name}`;
    this.offline.registerField(this.key, async () => {
      const saved = await this.offline.store.get('drafts', this.key);
      if (this.destroyed || this.offline.session()?.owner !== this.owner || !saved || this.control.control?.disabled) return;
      this.control.control?.setValue(saved.value);
      this.control.control?.markAsDirty();
    });
    void this.offline.store.get('drafts', this.key).then(saved => {
      if (!this.destroyed && saved && this.offline.session()?.owner === this.owner) this.offline.hasFieldDraft.next(true);
    }).catch(() => {});
  }
  @HostListener('input') @HostListener('change') @HostListener('ngModelChange')
  capture(): void {
    queueMicrotask(() => {
      if (!this.key || this.destroyed || this.offline.session()?.owner !== this.owner || !this.control.control?.dirty || this.control.control.disabled) return;
      const controlPath = this.control.path?.length ? this.control.path : [String(this.control.name || this.element.nativeElement.id)];
      void this.offline.store.put('drafts', { id: this.key, owner: this.owner, page: this.page, controlPath, value: this.control.value, savedAt: Date.now() })
        .catch(() => this.offline.notice.next('Impossibile conservare la bozza locale. Non chiudere questa pagina.'));
    });
  }
  ngOnDestroy(): void { this.destroyed = true; this.offline.unregisterField(this.key); }
}
