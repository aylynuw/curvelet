import type { Pt } from './model';

export type Sketch =
  | { kind: 'segment'; a: Pt; b: Pt }
  | { kind: 'circle'; c: Pt; r: number }
  | { kind: 'polygon'; pts: Pt[] };

const dist = (p: Pt, q: Pt) => Math.hypot(q.x - p.x, q.y - p.y);

function pathLength(pts: Pt[]): number {
  let n = 0;
  for (let k = 1; k < pts.length; k++) n += dist(pts[k - 1]!, pts[k]!);
  return n;
}

/** distance from p to the line through a and b */
function offLine(p: Pt, a: Pt, b: Pt): number {
  const len = dist(a, b);
  if (len < 1e-12) return dist(p, a);
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
}

/** Ramer–Douglas–Peucker: the corners of a hand-drawn path */
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length < 3) return pts;
  let worst = 0;
  let at = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    const d = offLine(pts[k]!, pts[0]!, pts[pts.length - 1]!);
    if (d > worst) [worst, at] = [d, k];
  }
  if (worst <= tol) return [pts[0]!, pts[pts.length - 1]!];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}

/**
 * What a rough pen stroke was meant to be: a straight segment, a circle, or
 * a closed polygon. Null when it is none of them clearly. Coordinates are
 * in whatever units the stroke was drawn in (screen pixels work best).
 */
export function recognize(stroke: Pt[]): Sketch | null {
  if (stroke.length < 2) return null;
  const length = pathLength(stroke);
  if (length < 12) return null;
  const first = stroke[0]!;
  const last = stroke[stroke.length - 1]!;
  const gap = dist(first, last);

  // straight: nothing strays far from the chord, and the path is about as long as it
  const chord = gap;
  const stray = Math.max(...stroke.map((p) => offLine(p, first, last)));
  if (chord > 0.85 * length && stray < Math.max(4, 0.06 * chord)) return { kind: 'segment', a: first, b: last };

  const closed = gap < Math.max(16, 0.18 * length);
  if (!closed) return null;

  // polygon: a few clear corners
  const loop = [...stroke, first];
  const corners = simplify(loop, Math.max(6, 0.04 * length)).slice(0, -1);
  // round: every point about the same distance from the centre
  const c = { x: stroke.reduce((s, p) => s + p.x, 0) / stroke.length, y: stroke.reduce((s, p) => s + p.y, 0) / stroke.length };
  const radii = stroke.map((p) => dist(p, c));
  const r = radii.reduce((s, v) => s + v, 0) / radii.length;
  const spread = Math.sqrt(radii.reduce((s, v) => s + (v - r) ** 2, 0) / radii.length) / r;

  if (corners.length >= 3 && corners.length <= 8 && (spread > 0.1 || corners.length <= 4)) {
    // a corner too close to the next is one corner
    const merged = corners.filter((p, k) => dist(p, corners[(k + 1) % corners.length]!) > 0.08 * length);
    // its outline runs about as far as the pen did; a zigzag's doesn't
    if (merged.length >= 3 && pathLength([...merged, merged[0]!]) > 0.8 * length) return { kind: 'polygon', pts: merged };
  }
  const around = (2 * Math.PI * r) / length;
  if (spread < 0.16 && around > 0.75 && around < 1.3) return { kind: 'circle', c, r };
  return null;
}
