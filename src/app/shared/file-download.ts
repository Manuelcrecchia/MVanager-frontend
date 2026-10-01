import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// Keep native IO behind one boundary so browser and device paths are testable.
export const fileDownloadIO = {
  native: () => Capacitor.isNativePlatform(),
  write: (options: Parameters<typeof Filesystem.writeFile>[0]) => Filesystem.writeFile(options),
  share: (options: Parameters<typeof Share.share>[0]) => Share.share(options),
};

export function safeDownloadName(name: string): string {
  const cleaned = String(name || 'documento').replace(/[\\/\x00-\x1f:*?"<>|]/g, '_').replace(/^\.+/, '').trim();
  return cleaned || 'documento';
}

export function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossibile leggere il file scaricato.'));
    reader.onabort = () => reject(new Error('Lettura del file interrotta.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      const comma = value.indexOf(',');
      if (comma < 0) reject(new Error('Formato del file non valido.'));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export function isFileShareCancelled(error: any): boolean {
  return error?.name === 'AbortError' || /^Share cancel(?:l)?ed$/i.test(String(error?.message || error || ''));
}

let sequence = 0;

/** Native: let the user choose Save to Files/an installed app. Web: normal download.
 * Cache is intentional: Android FileProvider can share it without storage permission.
 * Do not delete immediately: the receiving app may still be reading the file.
 */
export async function saveDownloadedFile(blob: Blob, name: string): Promise<void> {
  if (!blob.size) throw new Error('Il file ricevuto è vuoto. Riprova a generarlo.');
  const filename = safeDownloadName(name);
  if (fileDownloadIO.native()) {
    const written = await fileDownloadIO.write({
      path: `mvanager-downloads/${Date.now()}-${++sequence}/${filename}`,
      directory: Directory.Cache,
      recursive: true,
      data: await blobBase64(blob),
    });
    await fileDownloadIO.share({ title: filename, files: [written.uri], dialogTitle: 'Salva o condividi documento' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  try { anchor.click(); }
  finally {
    anchor.remove();
    // Safari may consume the URL after click() returns.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/** Safe for click handlers and RxJS callbacks: async native failures are reported. */
export async function downloadFile(
  blob: Blob,
  name: string,
  reportError: (message: string) => void = message => window.alert(message),
): Promise<boolean> {
  try {
    await saveDownloadedFile(blob, name);
    return true;
  } catch (error) {
    if (!isFileShareCancelled(error)) {
      console.error('[File download] Unable to save file', error);
      reportError('Impossibile salvare il file. Riprova; se usi l’app, verifica di avere la versione aggiornata.');
    }
    return false;
  }
}
