import { MAX_DOCUMENT_FILE_BYTES, DOCUMENT_SIZE_ERROR, oversizedDocumentMessage, documentUploadError } from './document-upload-limits';

describe('document upload size policy', () => {
  it('accepts up to 1 GB per file, independent of the total selection size', () => {
    expect(oversizedDocumentMessage([{ name: 'one.pdf', size: MAX_DOCUMENT_FILE_BYTES }, { name: 'two.pdf', size: MAX_DOCUMENT_FILE_BYTES }])).toBe('');
  });
  it('identifies the oversized file before any upload', () => {
    const message = oversizedDocumentMessage([{ name: 'small.pdf', size: 1 }, { name: 'large.pdf', size: MAX_DOCUMENT_FILE_BYTES + 1 }]);
    expect(message).toContain('large.pdf');
    expect(message).toContain('1 GB');
    expect(message).toContain('non è stata caricata');
  });
  it('explains a proxy HTTP 413 even when the response is HTML', () => {
    expect(documentUploadError({ status: 413, error: '<html>too large</html>' }, 'fallback')).toBe(DOCUMENT_SIZE_ERROR);
    expect(documentUploadError({ error: { code: 'LIMIT_FILE_SIZE' } }, 'fallback')).toBe(DOCUMENT_SIZE_ERROR);
    expect(documentUploadError({ error: { error: 'File mancante' } }, 'fallback')).toBe('File mancante');
  });
});

it('distinguishes the combined upload limit from the per-file limit', () => {
  const message = 'Gli allegati superano il limite complessivo di 5 GB per caricamento.';
  expect(documentUploadError({ status: 413, error: { code: 'UPLOAD_REQUEST_TOO_LARGE', error: message } }, 'fallback')).toBe(message);
});
