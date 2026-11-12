import type { Look } from '@math/render';

/** How many colours the palette has (--color-curve-1 … 8). */
export const CURVES = 8;

/**
 * A line's style, as saved with it. `color` is a palette slot ("c1" … "c8",
 * which follows the theme) or any hex colour. A hex colour is lightened in
 * dark mode so it stays readable, unless `exact` is set.
 */
export interface LineLook {
  color?: string;
  dash?: 'solid' | 'dashed' | 'dotted';
  /** pixels */
  width?: number;
  /** fill opacity, 0 to 1 */
  fill?: number;
  hidden?: boolean;
  exact?: boolean;
}

export const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

/** "c3" → slot 2, anything else → null */
export function slotOf(color: string | undefined): number | null {
  const m = /^c([1-9])$/.exec(color ?? '');
  return m ? Number(m[1]) - 1 : null;
}

/** the CSS for a palette slot */
export const slotVar = (slot: number) => `var(--color-curve-${(slot % CURVES) + 1})`;

/** Only known fields with sensible values: looks come from storage and share links. */
export function cleanLook(x: unknown): LineLook | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Record<string, unknown>;
  const out: LineLook = {};
  if (typeof o.color === 'string' && (isHex(o.color) || slotOf(o.color) !== null)) out.color = o.color.toLowerCase();
  if (o.dash === 'solid' || o.dash === 'dashed' || o.dash === 'dotted') out.dash = o.dash;
  if (typeof o.width === 'number' && o.width >= 0.5 && o.width <= 12) out.width = o.width;
  if (typeof o.fill === 'number' && o.fill >= 0 && o.fill <= 1) out.fill = o.fill;
  if (o.hidden === true) out.hidden = true;
  if (o.exact === true) out.exact = true;
  return Object.keys(out).length ? out : undefined;
}

// ---- sRGB ⇄ OKLCH, to lighten a colour without changing its hue

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklch(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((k) => toLinear(parseInt(hex.slice(k, k + 2), 16) / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180) / Math.PI];
}

export function oklchToHex(L: number, C: number, H: number): string {
  const h = (H * Math.PI) / 180;
  const [A, B] = [C * Math.cos(h), C * Math.sin(h)];
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** on a dark graph, a dark colour is lifted to at least 72% lightness, keeping its hue */
export function forDark(hex: string): string {
  const [L, C, H] = hexToOklch(hex);
  if (L >= 0.72) return hex;
  // lighter colours can't hold as much chroma; ease it down so the hue stays true
  return oklchToHex(0.72, Math.min(C, 0.16), H);
}

/** what the renderer gets for a line, in the current theme */
export function renderLook(look: LineLook | undefined, dark: boolean): Look | undefined {
  if (!look) return undefined;
  const out: Look = {};
  if (look.color && isHex(look.color)) out.color = dark && !look.exact ? forDark(look.color) : look.color;
  const slot = slotOf(look.color);
  if (slot !== null) out.slot = slot;
  if (look.dash) out.dash = look.dash;
  if (look.width) out.width = look.width;
  if (look.fill !== undefined) out.fill = look.fill;
  return Object.keys(out).length ? out : undefined;
}

/** the swatch colour for a line: its hex, its chosen slot, or its own slot */
export function swatchColor(look: LineLook | undefined, slot: number, dark: boolean): string {
  if (look?.color && isHex(look.color)) return dark && !look.exact ? forDark(look.color) : look.color;
  return slotVar(slotOf(look?.color) ?? slot);
}
