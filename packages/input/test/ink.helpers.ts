import type { Stroke } from '../src/ink/pdollar';
import { TEMPLATES } from '../src/ink/templates';

/** a seeded random source, so a test draws the same "handwriting" every time */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A symbol written by hand: one of its template variants, scaled to `size`
 * pixels tall at (x, y) (top left), a little rotated and slanted, wobbly.
 */
export function write(label: string, x: number, y: number, size: number, rand: () => number, variant?: number): Stroke[] {
  const variants = TEMPLATES[label]!;
  const v = variants[variant ?? Math.floor(rand() * variants.length)]!;
  const rot = ((rand() - 0.5) * 10 * Math.PI) / 180;
  const slant = (rand() - 0.5) * 0.15;
  const sx = size * (0.9 + rand() * 0.2);
  return v.map((st) =>
    st.map((p) => {
      const px = p.x + slant * (1 - p.y);
      const qx = px * Math.cos(rot) - p.y * Math.sin(rot);
      const qy = px * Math.sin(rot) + p.y * Math.cos(rot);
      return { x: x + qx * sx + (rand() - 0.5) * size * 0.04, y: y + qy * size + (rand() - 0.5) * size * 0.04 };
    }),
  );
}

/** a row of symbols: [label, top offset in sizes, size in sizes]; each placed after the last */
export function row(items: [string, number?, number?][], seed: number, size = 40, gap = 0.25): Stroke[] {
  const rand = rng(seed);
  const strokes: Stroke[] = [];
  let x = 10;
  for (const [label, dy = 0, s = 1] of items) {
    const sz = size * s;
    // flat symbols sit at mid-height; = and - are drawn across the middle
    const flat = label === '-' || label === '=' ;
    const top = 10 + dy * size + (flat ? size * 0.45 : 0);
    const out = write(label, x, top, flat ? sz * 0.5 : sz, rand);
    strokes.push(...out);
    const width = Math.max(...out.flat().map((p) => p.x)) - x;
    x += width + gap * size;
  }
  return strokes;
}
