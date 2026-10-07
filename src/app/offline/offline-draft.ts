import { OfflineService } from './offline.service';
import { operationId } from './offline-codec';

export interface DraftHandle { ready: Promise<void>; stop(): void; clear(): Promise<void>; flush(): void; }
function clone(value: any): any {
  if (value instanceof Blob || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(clone);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
}
/** Bind only editable fields. Never restore permissions, OTP verification or server status. */
export function watchDraft(service: OfflineService, read: () => any, restore: (value: any) => void, page = location.pathname + location.search): DraftHandle {
  const owner = service.session()?.owner;
  const unregister = service.registerDraftPage(page);
  const initial = JSON.stringify(read());
  let stopped = false, enabled = false, previous = '', writes = Promise.resolve();
  let version: { revision?: string; savedAt: number } | null = null;
  const flush = () => {
    if (!enabled || stopped || service.session()?.owner !== owner) return;
    const value = clone(read());
    const signature = JSON.stringify(value, (_, item) => item instanceof Blob ? { size: item.size, type: item.type, name: (item as File).name, modified: (item as File).lastModified } : item);
    if (signature === previous) return;
    previous = signature;
    const captured = { revision: operationId(), savedAt: Date.now() };
    version = captured;
    writes = writes.then(() => service.saveDraft(value, page, owner, captured));
  };
  const input = () => queueMicrotask(flush);
  const events = ['input', 'change', 'pointerup', 'visibilitychange'];
  events.forEach(event => document.addEventListener(event, input, true));
  const timer = setInterval(flush, 1000);
  const ready = service.loadDraftEntry(page).then(entry => {
    if (stopped || service.session()?.owner !== owner) return;
    const value = entry?.value;
    version = entry ? { revision: entry.revision, savedAt: entry.savedAt } : null;
    if (value && JSON.stringify(read()) === initial) { restore(value); service.notice.next('Bozza recuperata dal dispositivo. Controlla i dati prima di salvare.'); }
    previous = JSON.stringify(read(), (_, item) => item instanceof Blob ? { size: item.size, type: item.type, name: (item as File).name, modified: (item as File).lastModified } : item);
    enabled = true;
  });
  let unregistered = false;
  const stop = () => { flush(); stopped = true; if (!unregistered) { unregister(); unregistered = true; } clearInterval(timer); events.forEach(event => document.removeEventListener(event, input, true)); };
  return {
    ready, flush, stop,
    clear() { stopped = true; stop(); const savedVersion = version; return writes.then(() => owner ? service.clearDraft(page, owner, savedVersion) : undefined); },
  };
}
