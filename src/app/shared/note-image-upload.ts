function mimeFromFileName(name: string): string {
  if (/\.hei[cf]$/i.test(name)) return name.toLowerCase().endsWith('.heic') ? 'image/heic' : 'image/heif';
  if (/\.png$/i.test(name)) return 'image/png';
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.webp$/i.test(name)) return 'image/webp';
  return '';
}

export async function optimizeNoteImageForUpload(file: File): Promise<File> {
  const mimeType = file.type || mimeFromFileName(file.name);
  if (!/^(image\/(jpeg|png|webp|heic|heif))$/i.test(mimeType) || file.size < 1_500_000) {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  let image: HTMLImageElement | null = null;
  let sourceUrl = '';
  let decodableFile = file;
  try {
    if (/^image\/(heic|heif)$/i.test(mimeType) || /\.hei[cf]$/i.test(file.name)) {
      try {
        const { default: heic2any } = await import('heic2any');
        const converted = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.76,
        });
        const jpeg = Array.isArray(converted) ? converted[0] : converted;
        if (jpeg) {
          decodableFile = new File(
            [jpeg],
            file.name.replace(/\.[^.]+$/, '') + '.jpg',
            { type: 'image/jpeg', lastModified: file.lastModified },
          );
        }
      } catch {
        decodableFile = file;
      }
    }

    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(decodableFile, { imageOrientation: 'from-image' });
      } catch {
        bitmap = null;
      }
    }
    if (!bitmap) {
      sourceUrl = URL.createObjectURL(decodableFile);
      image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const candidate = new Image();
        candidate.onload = () => resolve(candidate);
        candidate.onerror = () => reject(new Error('Formato immagine non decodificabile'));
        candidate.src = sourceUrl;
      });
    }

    const source = bitmap || image;
    if (!source) return file;
    const sourceWidth = bitmap?.width || image?.naturalWidth || 0;
    const sourceHeight = bitmap?.height || image?.naturalHeight || 0;
    const maxSide = 1920;
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(source, 0, 0, width, height);
    const optimized = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.74);
    });
    if (!optimized) return decodableFile;
    if (optimized.size >= file.size) return decodableFile.size < file.size ? decodableFile : file;

    const jpgName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([optimized], jpgName, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return decodableFile.size < file.size ? decodableFile : file;
  } finally {
    bitmap?.close();
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  }
}
