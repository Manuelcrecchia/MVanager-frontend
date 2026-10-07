import type { StoredBody } from './offline-codec';

// Explicit reads: several legacy APIs use POST for queries.
export function isOfflineRead(method: string, path: string): boolean {
  if (/\/(login|accept|public|email|auth|offline|users|settings|devices)(\/|$)/i.test(path)) return false;
  return method === 'GET' || (method === 'POST' && /\/(get[^/]*|list|folders|byDate|search|download[^/]*|preview|export[^/]*|pdf|document|generatePdf|route-matrix|status-report|duplicate-check|candidate-duplicate-check|validate)$/i.test(path));
}
export function isProtectedWrite(method: string, path: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;
  // OTPs, passwords, payments, messages and the existing warehouse outbox have
  // separate protocols. Never store credentials or replay external side effects.
  if (/\/(login|auth|accept|public|customer-warehouse|email|push|notifications|ai)(\/|$)/i.test(path) ||
      /(password|sendCode|verifyCode|requestOtp|verifyOtp|sendPdf|sendAcceptance|sendEmail|sendWhatsApp|dispatch|provider|payment|request-link|signature-request|send-email|sendDocumentMail|sendInspectionConfirmation|sendQuote|transcribe|debug-logs|devices\/register|publish|exportAndDeleteUser|generate-xml|import-passive|issue)/i.test(path)) return false;
  if ((method === 'POST' && /\/(get[^/]*|list|folders|byDate|search|download[^/]*|preview|export[^/]*|pdf|document|generatePdf|route-matrix|status-report|duplicate-check|candidate-duplicate-check|validate)$/i.test(path)) || isOfflineRead(method, path) || /\/(download[^/]*|preview|export[^/]*|markViewed)$/i.test(path)) return false;
  if (['PUT', 'PATCH', 'DELETE'].includes(method)) return true;
  // All remaining authenticated mutations are durable. Unknown/domain-specific
  // operations require explicit replay; they are never guessed to be safe.
  return true;
}
export function canReplayAutomatically(method: string, path: string): boolean {
  return method === 'POST' && (
    /\/quotes\/(add|edit)$/.test(path) ||
    path === '/shifts/saveMultiple' ||
    /\/(quotes|customers|employees)\/notes\/add$/.test(path) ||
    /\/mv\/(stamping\/timbra|finelavoro\/submit|leaveRequest\/request|internal-warehouse\/requests)$/.test(path)
  );
}
export function operationLabel(path: string, body?: StoredBody): string {
  if (path.startsWith('/shifts/')) {
    const day = shiftOperationDay(path, body);
    const label = path === '/shifts/autosave' ? 'Aggiornamento turno' : path === '/shifts/delete' ? 'Eliminazione turno' : 'Turni';
    return day ? `${label} del ${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : label;
  }
  if (/stamping.*timbra/.test(path)) return 'Timbratura';
  if (/notes|Notes/.test(path)) return 'Nota';
  if (/quotes/.test(path)) return 'Preventivo';
  if (/finelavoro|signature/.test(path)) return 'Documento e firma';
  if (/leaveRequest/.test(path)) return 'Richiesta permesso';
  return 'Salvataggio';
}

export function containsCredentials(body: any, depth = 0): boolean {
  if (!body || typeof body !== 'object' || body instanceof Blob) return false;
  if (depth > 12) return true;
  const sensitive = /password|passwd|secret|token|otp|api[-_]?key|authorization|cvv/i;
  if (body instanceof FormData) {
    let found = false; body.forEach((_, key) => { if (sensitive.test(key)) found = true; }); return found;
  }
  return Object.keys(body).some(key => sensitive.test(key) || containsCredentials(body[key], depth + 1));
}

// Preserve ordering within a domain without letting an unrelated manual or
// uncertain save stop every other feature. Clock-ins always share one scope.
export function shiftOperationDay(path: string, body?: StoredBody): string | undefined {
  if (body?.type !== 'json') return undefined;
  const value = body.value;
  const days = path === '/shifts/saveMultiple'
    ? (Array.isArray(value?.shifts) ? value.shifts.map((item: any) => item?.data) : [])
    : ['/shifts/save', '/shifts/autosave', '/shifts/delete'].includes(path) ? [value?.data] : [];
  return days.length && typeof days[0] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(days[0]) && days.every((day: any) => day === days[0]) ? days[0] : undefined;
}
export function operationScope(path: string, body?: StoredBody): string {
  const day = shiftOperationDay(path, body);
  if (day) return `shifts|${day}`;
  const segments = path.split('/').filter(Boolean);
  return segments.slice(0, ['mv', 'admin'].includes(segments[0]) ? 2 : 1).join('/');
}
// Undated or multi-day shift writes still guard the whole shifts domain.
export function scopesOverlap(a: string, b: string): boolean {
  return a === b || (a === 'shifts' && b.startsWith('shifts|')) || (b === 'shifts' && a.startsWith('shifts|'));
}
