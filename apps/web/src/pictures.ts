/**
 * Pictures brought into the graph or the geometry board: read from a file,
 * scaled down so the saved document stays small, kept as a data URL.
 */
export interface Picture {
  src: string;
  /** the file's name */
  name?: string;
  /** natural size in pixels, after scaling down */
  w: number;
  h: number;
}

const MAX = 1600;

export async function readPicture(file: File): Promise<Picture | null> {
  if (!file.type.startsWith('image/')) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k));
    const h = Math.max(1, Math.round(img.naturalHeight * k));
    // SVGs and small pictures go in as they are
    if (file.type === 'image/svg+xml' || (k === 1 && file.size < 400_000)) {
      return { src: await asDataUrl(file), w, h, name: file.name };
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    // photos as JPEG; anything that may be see-through stays PNG
    const jpeg = file.type === 'image/jpeg';
    return { src: canvas.toDataURL(jpeg ? 'image/jpeg' : 'image/png', 0.88), w, h, name: file.name };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const asDataUrl = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

/** opens the file picker; resolves with the chosen picture */
export function pickPicture(): Promise<Picture | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const f = input.files?.[0];
      resolve(f ? readPicture(f) : null);
    };
    input.click();
  });
}

/** the first picture in a drop or a paste, if any */
export function pictureFile(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const f of Array.from(data.files)) if (f.type.startsWith('image/')) return f;
  return null;
}

/** a cache of decoded images for drawing on a canvas */
const decoded = new Map<string, HTMLImageElement>();
export function decodedImage(src: string, onReady: () => void): HTMLImageElement | null {
  const hit = decoded.get(src);
  if (hit) return hit.complete && hit.naturalWidth ? hit : null;
  const img = new Image();
  img.onload = onReady;
  img.src = src;
  decoded.set(src, img);
  return null;
}
