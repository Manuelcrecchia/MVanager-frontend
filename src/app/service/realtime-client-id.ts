const STORAGE_KEY = 'mv_realtime_client_id';

export function getRealtimeClientId(): string {
  const storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  const saved = storage?.getItem(STORAGE_KEY)?.trim();
  if (saved) return saved;
  const created = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `mv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  storage?.setItem(STORAGE_KEY, created);
  return created;
}
