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
    /\/(quotes|customers|employees)\/notes\/add$/.test(path) ||
    /\/mv\/(stamping\/timbra|finelavoro\/submit|leaveRequest\/request|internal-warehouse\/requests)$/.test(path)
  );
}
export function operationLabel(path: string): string {
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
