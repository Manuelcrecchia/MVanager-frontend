import { OfflineStore } from './offline-store';
const store = new OfflineStore();

/** Bootstrap configuration uses fetch before HttpClient services are ready.
 * Cache only successful public-to-this-user configuration, without credentials. */
export async function fetchOperationalConfig(url: string, init: RequestInit, role: 'admin' | 'employee'): Promise<Response> {
  const headers = new Headers(init.headers);
  let key = '';
  try {
    const token = (headers.get('Authorization') || '').replace(/^Bearer /, '');
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const tenant = headers.get('X-Tenant-Id');
    const normalized = new URL(url, location.href); normalized.searchParams.delete('refresh');
    if (claims.id && String(claims.tenantId) === tenant) key = `config|${normalized.href}|${tenant}|${role}|${claims.id}`;
  } catch { /* Invalid sessions do not get an offline configuration. */ }
  const cached = async (): Promise<Response | null> => {
    if (!key) return null;
    const value = await store.get('cache', key).catch(() => null);
    if (!value || Date.now() - value.savedAt > 7 * 86400000) return null;
    window.dispatchEvent(new CustomEvent('mv-offline-cache', { detail: { savedAt: value.savedAt } }));
    return new Response(value.body, { status: 200, headers: { 'Content-Type': 'application/json', 'X-MV-Offline-Cache': 'true' } });
  };
  if (!navigator.onLine) { const local = await cached(); if (local) return local; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (response.status >= 500) { const local = await cached(); if (local) { controller.abort(); return local; } }
    const body = await response.clone().text();
    if (response.ok && key) {
      await store.put('cache', { id: key, body, savedAt: Date.now() }).catch(() => {});
    }
    return response;
  } catch (error) {
    const local = await cached(); if (local) return local;
    throw error;
  } finally { clearTimeout(timer); }
}
