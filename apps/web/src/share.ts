import type { EvalSettings } from '@math/engine';
import { cleanLook } from './graph/looks';
import { cleanLine } from './lines';
import type { LineData } from './storage';

/** What a share link carries: the lines with everything on them, the settings, and the graph's name. */
export interface Shared {
  items: LineData[];
  settings: EvalSettings;
  name?: string;
}
/** older links: sources, with looks by position */
interface SharedV1 {
  lines?: unknown;
  looks?: unknown;
  items?: unknown;
  settings?: EvalSettings;
  name?: unknown;
}

const toBase64Url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text: string) => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/**
 * The worksheet packed into a URL fragment (#w=…). The fragment never reaches
 * a server, so a shared worksheet stays between the people who have the link.
 * Compressed when the browser can (prefix z), plain otherwise (prefix j).
 */
export async function encodeShared(data: Shared): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(data));
  if (typeof CompressionStream === 'function') return `z${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`;
  return `j${toBase64Url(json)}`;
}

export async function decodeShared(packed: string): Promise<Shared | null> {
  try {
    const body = fromBase64Url(packed.slice(1));
    const bytes = packed[0] === 'z' ? await pipe(body, new DecompressionStream('deflate-raw')) : body;
    const data = JSON.parse(new TextDecoder().decode(bytes)) as SharedV1;
    let items: LineData[];
    if (Array.isArray(data.items)) items = data.items.slice(0, 500).flatMap((l) => cleanLine(l) ?? []);
    else if (Array.isArray(data.lines) && data.lines.every((l) => typeof l === 'string')) {
      const looks = Array.isArray(data.looks) ? data.looks : [];
      items = (data.lines as string[]).slice(0, 500).map((source, k) => {
        const look = cleanLook(looks[k]);
        return look ? { source, look } : { source };
      });
    } else return null;
    const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 80) : undefined;
    return { items, settings: data.settings as EvalSettings, ...(name ? { name } : {}) };
  } catch {
    return null;
  }
}

/**
 * The web address share links point to. On the web it is the page itself; the
 * iOS, Android and desktop apps have no public address of their own, so they
 * use VITE_PUBLIC_URL, set when the app is built (null when it isn't).
 */
export function shareBase(native: boolean): string | null {
  if (!native) return `${location.origin}${location.pathname}`;
  const url = import.meta.env.VITE_PUBLIC_URL as string | undefined;
  return url ? url.replace(/#.*$/, '') : null;
}

export function shareUrl(packed: string, base: string): string {
  return `${base}#w=${packed}`;
}

/** The packed worksheet in the current URL, if any. */
export function sharedFromLocation(): string | null {
  const m = /^#w=([A-Za-z0-9_-]+)$/.exec(location.hash);
  return m ? m[1]! : null;
}
