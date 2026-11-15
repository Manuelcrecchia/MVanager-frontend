/** Document limit: 1 decimal GB per file (email, photo and audio limits are separate). */
export const MAX_DOCUMENT_FILE_BYTES = 1_000_000_000;
export const DOCUMENT_SIZE_ERROR = 'Il documento supera il limite di 1 GB per file. Riduci il file e riprova.';

export function oversizedDocumentMessage(files: ReadonlyArray<Pick<File, 'name' | 'size'>>): string {
  const file = files.find(item => item.size > MAX_DOCUMENT_FILE_BYTES);
  return file ? `Il file “${file.name}” supera il limite di 1 GB per file. La selezione non è stata caricata. Riduci il file e riprova.` : '';
}

export function documentUploadError(error: any, fallback: string): string {
  if (error?.error?.code === 'UPLOAD_REQUEST_TOO_LARGE') {
    return typeof error.error.error === 'string' ? error.error.error : 'Gli allegati superano il limite complessivo per caricamento. Dividili in più caricamenti.';
  }
  if (error?.status === 413 || error?.error?.code === 'LIMIT_FILE_SIZE') return DOCUMENT_SIZE_ERROR;
  return typeof error?.error?.error === 'string' ? error.error.error : fallback;
}
