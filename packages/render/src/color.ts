/** An sRGB colour, each channel 0–255. */
export type Rgb = [number, number, number];

/**
 * #rgb / #rrggbb → Rgb. The apps pass their own resolver for other CSS
 * colours (oklch from the theme), via a canvas pixel.
 */
export function parseHex(css: string): Rgb {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(css.trim());
  if (!m) return [0, 0, 0];
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
  return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)) as Rgb;
}

export const isTransparent = (css: string) => css === 'transparent' || css === '' || /rgba?\([^)]*,\s*0\)$/.test(css);
