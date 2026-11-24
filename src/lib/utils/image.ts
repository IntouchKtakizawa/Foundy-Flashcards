/**
 * Downscale an uploaded image and return a data URL. Images are stored
 * inline with the card (IndexedDB) so they work offline and travel with
 * backups; resizing keeps the database small.
 */
export const MAX_IMAGE_INPUT_BYTES = 10 * 1024 * 1024;

export async function imageFileToDataUrl(file: File, maxSide = 1200, quality = 0.85): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (PNG, JPG, GIF or WebP).');
  if (file.size > MAX_IMAGE_INPUT_BYTES) throw new Error('That image is larger than 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('The image could not be read.'));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image processing is not supported in this browser.');
    ctx.drawImage(img, 0, 0, w, h);
    const webp = canvas.toDataURL('image/webp', quality);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
