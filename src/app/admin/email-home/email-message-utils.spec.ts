import { SecurityContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { inspectMailLink, prepareMessageHtml, replyAllRecipients } from './email-message-utils';

describe('Email message interactions', () => {
  it('excludes the current mailbox and deduplicates reply recipients across To and Cc', () => {
    expect(replyAllRecipients('Sender@example.com', [
      { email: 'me@example.com' }, { email: 'sender@EXAMPLE.com' }, { email: 'other@example.com' }
    ], [{ email: 'OTHER@example.com' }, { email: 'copy@example.com' }], 'ME@example.com'))
      .toEqual({ to: ['Sender@example.com', 'other@example.com'], cc: ['copy@example.com'] });
  });

  it('replies to the other recipients of a message sent by the current mailbox', () => {
    expect(replyAllRecipients('me@example.com', [{ email: 'other@example.com' }], [], 'me@example.com'))
      .toEqual({ to: ['other@example.com'], cc: [] });
  });

  it('blocks external and relative images, including srcset, while keeping embedded images', () => {
    const result = prepareMessageHtml('<img src="https://tracker.test/pixel"><img src="/pixel"><img src="data:image/png;base64,AA" srcset="https://tracker.test/pixel 2x"><img src="data:image/png;base64,AA">');
    expect(result.blockedImages).toBe(3);
    expect(result.html).not.toContain('tracker.test');
    expect(result.html).not.toContain('srcset');
    expect(result.html).toContain('data:image/png');
  });

  it('allows image loading only when requested and removes alternate sources', () => {
    const result = prepareMessageHtml('<picture><source srcset="https://tracker.test/alternate"><img src="https://example.com/logo"></picture>', true);
    expect(result.blockedImages).toBe(0);
    expect(result.html).toContain('https://example.com/logo');
    expect(result.html).not.toContain('<source');
  });

  it('removes direct navigation and tracking from links for inspection', () => {
    const result = prepareMessageHtml('<a href="https://example.com" target="_blank" ping="https://tracker.test">Apri</a>');
    const template = document.createElement('template');
    template.innerHTML = result.html;
    const link = template.content.querySelector('a')!;
    expect(link.hasAttribute('href')).toBeFalse();
    expect(link.hasAttribute('ping')).toBeFalse();
    expect(link.getAttribute('title')).toBe('https://example.com');
    expect(link.getAttribute('tabindex')).toBe('0');
  });

  it('keeps link inspection available after Angular sanitizes the body', () => {
    const prepared = prepareMessageHtml('<a href="https://example.com/path">Link</a>');
    const sanitized = TestBed.inject(DomSanitizer).sanitize(SecurityContext.HTML, prepared.html)!;
    const template = document.createElement('template');
    template.innerHTML = sanitized;
    const link = template.content.querySelector('a')!;
    expect(link.getAttribute('title')).toBe('https://example.com/path');
    expect(link.getAttribute('role')).toBe('link');
    expect(link.getAttribute('tabindex')).toBe('0');
    expect(link.hasAttribute('href')).toBeFalse();
  });

  it('accepts explicit web and contact links and rejects unsafe or relative destinations', () => {
    expect(inspectMailLink('https://example.com/path')).toBe('https://example.com/path');
    expect(inspectMailLink('mailto:test@example.com')).toBe('mailto:test@example.com');
    expect(inspectMailLink('javascript:alert(1)')).toBeNull();
    expect(inspectMailLink('/relative')).toBeNull();
    expect(inspectMailLink('data:text/html,hello')).toBeNull();
  });
});
