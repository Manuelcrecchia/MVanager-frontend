import { OfflineService } from './offline.service';

export interface DraftHandle { ready: Promise<void>; stop(): void; clear(): Promise<void>; flush(): void; }
function clone(value: any): any {
  if (value instanceof Blob || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
}
/** Bind only editable fields. Never restore permissions, OTP verification or server status. */
export function watchDraft(service: OfflineService, read: () => any, restore: (value: any) => void): DraftHandle {
  const page = location.pathname + location.search, owner = service.session()?.owner;
  const initial = JSON.stringify(read());
  let stopped = false, enabled = false, previous = '', writes = Promise.resolve();
  const flush = () => {
    if (!enabled || stopped || service.session()?.owner !== owner) return;
    const value = clone(read());
    const signature = JSON.stringify(value, (_, item) => item instanceof Blob ? { size: item.size, type: item.type, name: (item as File).name, modified: (item as File).lastModified } : item);
    if (signature === previous) return;
    previous = signature;
    writes = writes.then(() => service.saveDraft(value, page, owner));
  };
  const input = () => queueMicrotask(flush);
  const events = ['input', 'change', 'pointerup', 'visibilitychange'];
  events.forEach(event => document.addEventListener(event, input, true));
  const timer = setInterval(flush, 1000);
  const ready = service.loadDraft(page).then(value => {
    if (stopped || service.session()?.owner !== owner) return;
    if (value && JSON.stringify(read()) === initial) { restore(value); service.notice.next('Bozza recuperata dal dispositivo. Controlla i dati prima di salvare.'); }
    previous = JSON.stringify(read(), (_, item) => item instanceof Blob ? { size: item.size, type: item.type, name: (item as File).name, modified: (item as File).lastModified } : item);
    enabled = true;
  });
  const stop = () => { flush(); stopped = true; clearInterval(timer); events.forEach(event => document.removeEventListener(event, input, true)); };
  return {
    ready, flush, stop,
    clear() { stopped = true; stop(); return writes.then(() => owner ? service.clearDraft(page, owner) : undefined); },
  };
}
