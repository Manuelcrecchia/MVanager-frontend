export interface MailAddress { name?: string; email: string; }

export function replyAllRecipients(fromEmail: string, to: MailAddress[], cc: MailAddress[], ownEmail: string) {
  const seen = new Set([ownEmail.trim().toLowerCase()].filter(Boolean));
  const collect = (addresses: MailAddress[]) => addresses.map(item => item.email.trim()).filter(email => {
    const key = email.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { to: collect([{ email: fromEmail }, ...to]), cc: collect(cc) };
}

export function prepareMessageHtml(html: string, showExternalImages = false) {
  // Template contents stay inert while resources are inspected.
  const template = document.createElement('template');
  template.innerHTML = html;
  let blockedImages = 0;
  template.content.querySelectorAll('source').forEach(element => element.remove());
  template.content.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || '';
    const isEmbedded = /^data:image\//i.test(src);
    const hasExternalSource = (!!src && !isEmbedded) || img.hasAttribute('srcset');
    img.removeAttribute('srcset');
    img.removeAttribute('loading');
    if (hasExternalSource && !showExternalImages) {
      blockedImages++;
      const placeholder = document.createElement('span');
      placeholder.textContent = img.alt ? `[Immagine: ${img.alt}]` : '[Immagine esterna]';
      img.replaceWith(placeholder);
    } else {
      img.setAttribute('referrerpolicy', 'no-referrer');
    }
  });
  template.content.querySelectorAll('a').forEach(anchor => {
    anchor.setAttribute('title', anchor.getAttribute('href') || '');
    anchor.removeAttribute('href');
    anchor.setAttribute('role', 'link');
    anchor.setAttribute('tabindex', '0');
    anchor.removeAttribute('target');
    anchor.removeAttribute('ping');
  });
  return { html: template.innerHTML, blockedImages };
}

export function inspectMailLink(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
