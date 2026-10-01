import { HttpParams } from '@angular/common/http';
import { sha256 } from './sha256';
export type StoredBody = { type: 'json'; value: any } | { type: 'urlencoded'; value: string } | { type: 'binary'; value: Blob | ArrayBuffer } | { type: 'form'; entries: [string, string | Blob, string?][] };
export async function encodeBody(body: any): Promise<StoredBody> {
  if (body instanceof FormData) {
    const entries: [string, string | Blob, string?][] = [];
    body.forEach((value, name) => entries.push([name, value, value instanceof File ? value.name : undefined]));
    return { type: 'form', entries };
  }
  if (body instanceof HttpParams) return { type: 'urlencoded', value: body.toString() };
  if (body instanceof Blob || body instanceof ArrayBuffer) return { type: 'binary', value: body };
  return { type: 'json', value: JSON.parse(JSON.stringify(body ?? null)) };
}
export function decodeBody(body: StoredBody): any {
  if (body.type === 'json' || body.type === 'binary') return body.value;
  if (body.type === 'urlencoded') return new HttpParams({ fromString: body.value });
  const form = new FormData();
  body.entries.forEach(([name, value, filename]) => {
    if (value instanceof Blob) form.append(name, value, filename || 'allegato'); else form.append(name, value);
  });
  return form;
}
export async function digest(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
  if (!crypto.subtle) return sha256(bytes);
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(result), n => n.toString(16).padStart(2, '0')).join('');
}
export async function bodyHash(body: StoredBody): Promise<string> {
  if (body.type === 'json' || body.type === 'urlencoded') return digest(JSON.stringify(body));
  if (body.type === 'binary') return digest(JSON.stringify({ type: body.value instanceof Blob ? body.value.type : 'arraybuffer', hash: await digest(body.value instanceof Blob ? await blobBytes(body.value) : body.value) }));
  const entries = [];
  for (const [name, value, filename] of body.entries) entries.push([name,
    value instanceof Blob ? { hash: await digest(await blobBytes(value)), type: value.type, filename } : value]);
  return digest(JSON.stringify(entries));
}
export function operationId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, '0')).join('');
}

function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = reject; reader.readAsArrayBuffer(blob);
  });
}
