import { HttpErrorResponse, HttpEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

// Give the server time to return its final response after the 30-minute upload limit.
export const DOCUMENT_UPLOAD_CLIENT_TIMEOUT_MS = 31 * 60 * 1000;
// Keep this list aligned with the backend and reverse proxy document upload routes.
const DOCUMENT_UPLOAD_PATH = /^\/(?:documents\/upload|admin\/internal-documents\/upload|candidates\/[^/]+\/attachments|admin\/deadlines\/(?:employees|vehicles|equipment|customers|internal|customer-assets(?:\/registry(?:\/[^/]+)?)?|update)|mv\/leaveRequest\/request|mv\/customer-asset-interventions\/shift\/[^/]+\/items\/[^/]+\/complete)\/?$/i;

export function isDocumentUploadPath(url: string): boolean {
  try { return DOCUMENT_UPLOAD_PATH.test(new URL(url, 'https://local.invalid').pathname); }
  catch { return false; }
}

export function apiResponseTimeoutMs(req: HttpRequest<any>): number {
  if (req.body instanceof FormData) {
    return /^(POST|PUT)$/i.test(req.method) && isDocumentUploadPath(req.url)
      ? DOCUMENT_UPLOAD_CLIENT_TIMEOUT_MS : 300000;
  }
  return ['blob', 'arraybuffer'].includes(req.responseType) ? 300000 : 120000;
}

export function apiTimeoutError(req: HttpRequest<any>): HttpErrorResponse {
  const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  return new HttpErrorResponse({ status: 504, statusText: 'Response timeout', url: req.urlWithParams, error: {
    code: 'API_RESPONSE_TIMEOUT',
    error: mutation
      ? 'Il server non ha completato la risposta in tempo. L’esito dell’operazione non è ancora confermato.'
      : 'Il server non ha completato la risposta in tempo. Riprova il caricamento.',
    ...(mutation ? { outcome: 'unknown' } : {}),
  } });
}

/** A progress event cannot indefinitely postpone a final response. */
export function boundApiResponse(req: HttpRequest<any>, source: Observable<HttpEvent<any>>, duration = apiResponseTimeoutMs(req)): Observable<HttpEvent<any>> {
  return new Observable(observer => {
    const timer = setTimeout(() => observer.error(apiTimeoutError(req)), duration);
    const subscription = source.subscribe({
      next: event => { if (event instanceof HttpResponse) clearTimeout(timer); observer.next(event); },
      error: error => { clearTimeout(timer); observer.error(error); },
      complete: () => { clearTimeout(timer); observer.complete(); },
    });
    return () => { clearTimeout(timer); subscription.unsubscribe(); };
  });
}

/** Complete the body while the deadline is active, including partially received JSON. */
export async function fetchCompleteResponse(url: string, init: RequestInit = {}, duration = 15000): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, duration);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    await response.clone().arrayBuffer();
    return response;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}
