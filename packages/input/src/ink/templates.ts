import type { Stroke } from './pdollar';

/**
 * Handwritten shapes for each symbol, as strokes in a box about 1 tall
 * (y grows downwards). Several variants where people write a symbol
 * differently (an open or closed 4, a 1 with or without a flag).
 */

/** an arc of an ellipse, angles in degrees: 0 points right, 90 down */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps = 16): Stroke {
  return Array.from({ length: steps + 1 }, (_, k) => {
    const a = ((from + ((to - from) * k) / steps) * Math.PI) / 180;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}
const line = (...pts: number[]): Stroke => {
  const out: Stroke = [];
  for (let k = 0; k + 1 < pts.length; k += 2) out.push({ x: pts[k]!, y: pts[k + 1]! });
  // fill in, so a long segment carries as much weight as a curve
  const dense: Stroke = [out[0]!];
  for (let k = 1; k < out.length; k++) {
    const [a, b] = [out[k - 1]!, out[k]!];
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) * 12));
    for (let j = 1; j <= n; j++) dense.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n });
  }
  return dense;
};
const join = (...parts: Stroke[]): Stroke => parts.flat();

export const TEMPLATES: Record<string, Stroke[][]> = {
  '0': [[arc(0.3, 0.5, 0.3, 0.5, -90, 270)]],
  '1': [[line(0.1, 0, 0.1, 1)], [line(0, 0.2, 0.15, 0, 0.15, 1)], [line(0, 0.2, 0.15, 0, 0.15, 1), line(0, 1, 0.3, 1)]],
  '2': [[join(arc(0.3, 0.3, 0.3, 0.3, 200, 360), line(0.6, 0.3, 0, 1, 0.65, 1))]],
  '3': [[join(arc(0.28, 0.25, 0.28, 0.25, 200, 450), arc(0.28, 0.75, 0.32, 0.25, 270, 520))]],
  '4': [
    [line(0.45, 1, 0.45, 0, 0, 0.7, 0.6, 0.7)],
    [line(0.1, 0, 0, 0.6, 0.6, 0.6), line(0.45, 0.25, 0.45, 1)],
  ],
  '5': [
    [join(line(0.55, 0, 0.08, 0, 0.05, 0.45), arc(0.3, 0.7, 0.3, 0.3, 230, 500))],
    [join(line(0.08, 0, 0.05, 0.45), arc(0.3, 0.7, 0.3, 0.3, 230, 500)), line(0.08, 0, 0.55, 0)],
  ],
  '6': [[join(arc(0.6, 0.5, 0.55, 0.5, 280, 180), arc(0.32, 0.72, 0.28, 0.28, 180, 540))]],
  '7': [[line(0, 0, 0.6, 0, 0.2, 1)], [line(0, 0, 0.6, 0, 0.2, 1), line(0.15, 0.5, 0.5, 0.5)]],
  '8': [[join(arc(0.3, 0.25, 0.25, 0.25, 90, 450), arc(0.3, 0.75, 0.3, 0.25, -90, 270))]],
  '9': [[join(arc(0.3, 0.28, 0.3, 0.28, 0, 360), line(0.6, 0.28, 0.55, 1))]],
  x: [[line(0, 0, 0.6, 0.6), line(0.6, 0, 0, 0.6)], [join(arc(0.15, 0.3, 0.15, 0.3, 270, 450), arc(0.45, 0.3, 0.15, 0.3, 270, 90)), line(0.05, 0.6, 0.55, 0)]],
  y: [[line(0, 0, 0.3, 0.45), line(0.6, 0, 0.1, 1)], [join(line(0, 0, 0.05, 0.35), arc(0.2, 0.35, 0.15, 0.15, 180, 0), line(0.35, 0.35, 0.4, 0, 0.4, 0.8), arc(0.25, 0.8, 0.15, 0.2, 0, 160))]],
  a: [[join(arc(0.25, 0.3, 0.25, 0.3, 330, 30 + 360 - 20), line(0.5, 0, 0.5, 0.6))]],
  b: [[join(line(0, 0, 0, 1), arc(0.25, 0.75, 0.25, 0.25, 180, 540))]],
  n: [[join(line(0, 0.6, 0, 0), arc(0.2, 0.15, 0.2, 0.15, 180, 360), line(0.4, 0.15, 0.4, 0.6))]],
  t: [[line(0.2, 0, 0.2, 0.9, 0.35, 1), line(0, 0.3, 0.4, 0.3)]],
  e: [[join(line(0, 0.3, 0.5, 0.3), arc(0.25, 0.3, 0.25, 0.3, 0, 320))]],
  '+': [[line(0, 0.5, 1, 0.5), line(0.5, 0, 0.5, 1)]],
  '-': [[line(0, 0, 1, 0)]],
  '=': [[line(0, 0, 1, 0), line(0, 0.5, 1, 0.5)]],
  '(': [[arc(0.5, 0.5, 0.5, 0.5, 240, 120)]],
  ')': [[arc(0, 0.5, 0.5, 0.5, -60, 60)]],
  '/': [[line(0.5, 0, 0, 1)]],
  '√': [[line(0, 0.6, 0.15, 0.5, 0.35, 1, 0.55, 0, 1.6, 0)]],
  π: [[line(0, 0.1, 1, 0), line(0.3, 0.05, 0.25, 1), line(0.7, 0.03, 0.75, 1)]],
  '<': [[line(0.5, 0, 0, 0.4, 0.5, 0.8)]],
  '>': [[line(0, 0, 0.5, 0.4, 0, 0.8)]],
};

// lowercase letters sit on the baseline, under the height of a digit (and y hangs below it)
for (const label of ['x', 'y', 'a', 'n', 'e']) {
  TEMPLATES[label] = TEMPLATES[label]!.map((v) => v.map((st) => st.map((p) => ({ x: p.x, y: p.y + 0.4 }))));
}

/** what a symbol writes into the calculator line */
export const TEXT: Record<string, string> = { '√': 'sqrt', π: 'pi', '-': '-' };
