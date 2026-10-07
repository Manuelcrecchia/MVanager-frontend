import { fakeAsync, tick } from '@angular/core/testing';
import { HttpErrorResponse, HttpEvent, HttpEventType, HttpRequest, HttpResponse } from '@angular/common/http';
import { NEVER, Subject, of, throwError } from 'rxjs';
import { boundApiResponse, fetchCompleteResponse } from './http-response-deadline';
import { OfflineService } from './offline.service';

describe('API response deadlines', () => {
  it('returns a negative HTTP outcome for a read that never responds', fakeAsync(() => {
    let error: any;
    boundApiResponse(new HttpRequest('GET', '/test'), NEVER, 20).subscribe({ error: value => error = value });
    tick(20); expect(error instanceof HttpErrorResponse).toBeTrue();
    expect(error.status).toBe(504); expect(error.error.code).toBe('API_RESPONSE_TIMEOUT');
    expect(error.error.outcome).toBeUndefined();
  }));
  it('reports unknown write outcome without retrying or labelling it as absent Internet', fakeAsync(() => {
    let error: any;
    boundApiResponse(new HttpRequest('POST', '/test', {}), NEVER, 20).subscribe({ error: value => error = value });
    tick(20); expect(error.error.outcome).toBe('unknown');
    expect(error.error.error).not.toContain('connessione');
  }));
  it('does not reset the final response deadline on progress events and aborts the source once', fakeAsync(() => {
    const source = new Subject<HttpEvent<any>>(); const progress: any[] = []; let error: any;
    boundApiResponse(new HttpRequest('POST', '/test', {}), source, 20).subscribe({ next: value => progress.push(value), error: value => error = value });
    tick(10); source.next({ type: HttpEventType.UploadProgress, loaded: 1, total: 10 });
    tick(10); expect(error.status).toBe(504); expect(progress.length).toBe(1);
    expect(source.observed).toBeFalse();
  }));
  it('keeps successful bodies and definitive errors unchanged and clears timers', fakeAsync(() => {
    const response = new HttpResponse({ status: 201, body: { id: 42 } }); const rejected = new HttpErrorResponse({ status: 422, error: { fields: ['name'] } });
    let success: any, failure: any;
    boundApiResponse(new HttpRequest('GET', '/test'), of(response), 20).subscribe(value => success = value);
    boundApiResponse(new HttpRequest('GET', '/test'), throwError(() => rejected), 20).subscribe({ error: value => failure = value });
    tick(30); expect(success).toBe(response); expect(failure).toBe(rejected);
  }));
  it('cancels timers when a read subscriber cancels its request', fakeAsync(() => {
    const failure = jasmine.createSpy(); const subscription = boundApiResponse(new HttpRequest('GET', '/test'), NEVER, 20).subscribe({ error: failure });
    subscription.unsubscribe(); tick(30); expect(failure).not.toHaveBeenCalled();
  }));
  it('bounds raw queue replay even when upload progress keeps arriving', fakeAsync(() => {
    const service = new OfflineService({ get: () => () => null } as any, { handle: () => NEVER } as any);
    const source = new Subject<HttpEvent<any>>(); let failure: any;
    (service as any).response(new HttpRequest('POST', '/save', {}), () => source, 20).catch((error: any) => failure = error);
    tick(10); source.next({ type: HttpEventType.UploadProgress, loaded: 1, total: 10 });
    tick(10); expect(failure.status).toBe(504); expect(failure.error.outcome).toBe('unknown'); expect(source.observed).toBeFalse();
  }));
  it('allows multipart uploads the same five minute deadline as the server', fakeAsync(() => {
    const source = new Subject<HttpEvent<any>>(); let failure: any;
    boundApiResponse(new HttpRequest('POST', '/upload', new FormData()), source).subscribe({ error: error => failure = error });
    tick(120000); expect(failure).toBeUndefined();
    tick(180000); expect(failure.status).toBe(504);
  }));
  it('also bounds unauthenticated and credential requests outside the durable save protocol', fakeAsync(() => {
    const service = new OfflineService({ get: () => () => null } as any, { handle: () => NEVER } as any);
    const failed = jasmine.createSpy();
    service.intercept(new HttpRequest('POST', '/login', { password: 'fixture' }), () => NEVER).subscribe({ error: failed });
    tick(120000); expect(failed).toHaveBeenCalledWith(jasmine.objectContaining({ status: 504 }));
    expect(service.operations.value).toEqual([]);
  }));
  it('version fetch includes body parsing inside the timeout', async () => {
    let signal: AbortSignal | undefined;
    spyOn(window, 'fetch').and.callFake(async (url, init) => {
      signal = init?.signal as AbortSignal;
      const body = new ReadableStream({ start(controller) { signal!.addEventListener('abort', () => controller.error(new Error('fixture abort'))); } });
      return new Response(body, { headers: { 'Content-Type': 'application/json' } });
    });
    await expectAsync(fetchCompleteResponse('/version', {}, 20)).toBeRejected();
    expect(signal?.aborted).toBeTrue();
  });
  it('version fetch retains the complete response body and propagates caller cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = spyOn(window, 'fetch').and.callFake(async (url, init) => {
      if (init?.signal?.aborted) throw new Error('fixture cancelled');
      return new Response(JSON.stringify({ version: 'fixture' }), { headers: { 'Content-Type': 'application/json' } });
    });
    expect(await (await fetchCompleteResponse('/version')).json()).toEqual({ version: 'fixture' });
    await expectAsync(fetchCompleteResponse('/version', { signal: controller.signal })).toBeRejected();
    expect(fetcher.calls.count()).toBe(2);
  });
});
