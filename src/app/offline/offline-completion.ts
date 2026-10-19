import type { PendingOperation } from './offline.service';

export const COMPLETION_PREFIX = 'offline-receipt|';
export const COMPLETION_TTL = 15 * 60 * 1000;
export const MAX_RECENT_COMPLETIONS = 100;

/** A receipt can recover server IDs, but must never retain the submitted files. */
export function compactCompletion(row: PendingOperation): PendingOperation {
  const shiftFields = (value: any) => Object.fromEntries(
    ['data', 'clientId', 'appointmentId', 'shiftId', 'title'].filter(key => value?.[key] !== undefined).map(key => [key, value[key]])
  );
  const value = row.body.type === 'json' && row.path.startsWith('/shifts/')
    ? row.path === '/shifts/saveMultiple'
      ? { shifts: (row.body.value?.shifts || []).map(shiftFields) }
      : shiftFields(row.body.value)
    : null;
  let response = row.response;
  // Persist only server identities/version information needed by draft recovery.
  // The full response is still delivered to live consumers by OfflineService.
  if (response) {
    let source = response.body, body = null;
    if (typeof source === 'string') { try { source = JSON.parse(source); } catch { source = null; } }
    if (source && typeof source === 'object' && !(source instanceof Blob) && !(source instanceof ArrayBuffer)) {
      const keys = row.path.startsWith('/shifts/') ? ['version', 'shiftId', 'savedShifts']
        : /\/quotes\/(add|edit)$/.test(row.path) ? ['id', 'numeroPreventivo', 'offlineRevision'] : [];
      if (keys.length) body = Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
    }
    response = { ...response, body };
  }
  return {
    id: row.id, owner: row.owner, dedup: row.dedup, hash: row.hash,
    method: row.method, url: row.url, path: row.path, headers: row.headers,
    responseType: row.responseType, body: { type: 'json', value },
    intent: row.intent, createdAt: row.createdAt, sequence: row.sequence,
    page: row.page, draftWriter: row.draftWriter, label: row.label,
    automatic: row.automatic, state: row.state, attempts: 0, nextAttempt: 0,
    response, recoveredShifts: row.recoveredShifts,
  };
}
