/**
 * The $P point-cloud recognizer (Vatavu, Anthony & Wobbrock, 2012): a shape
 * is a cloud of points, so stroke order and direction don't matter. Clouds
 * are resampled to N points, scaled to a unit box (keeping their aspect)
 * and centred; two clouds are compared by a greedy point matching.
 */
export interface P {
  x: number;
  y: number;
  /** which stroke the point belongs to */
  s: number;
}
export type Stroke = { x: number; y: number }[];

export const N = 32;

export function pathLength(points: P[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) if (points[i]!.s === points[i - 1]!.s) d += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return d;
}

/** strokes → points with stroke ids */
export function toPoints(strokes: Stroke[]): P[] {
  return strokes.flatMap((st, s) => st.map((p) => ({ x: p.x, y: p.y, s })));
}

/** N points evenly spaced along the strokes (a dot or a one-point stroke counts too) */
export function resample(points: P[], n = N): P[] {
  const total = pathLength(points);
  if (total === 0 || points.length < 2) {
    const c = points[0] ?? { x: 0, y: 0, s: 0 };
    return Array.from({ length: n }, () => ({ ...c }));
  }
  const step = total / (n - 1);
  const pts = points.map((p) => ({ ...p }));
  const out: P[] = [pts[0]!];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (a.s !== b.s) continue;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + d >= step && d > 0) {
      const t = (step - acc) / d;
      const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), s: a.s };
      out.push(q);
      pts.splice(i, 0, q);
      acc = 0;
    } else acc += d;
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1]! });
  return out.slice(0, n);
}

/** centred on the centroid, scaled so the larger side is 1 */
export function normalize(points: P[]): P[] {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const size = Math.max(x1 - x0, y1 - y0) || 1;
  const scaled = points.map((p) => ({ x: (p.x - x0) / size, y: (p.y - y0) / size, s: p.s }));
  const cx = scaled.reduce((a, p) => a + p.x, 0) / scaled.length;
  const cy = scaled.reduce((a, p) => a + p.y, 0) / scaled.length;
  return scaled.map((p) => ({ x: p.x - cx, y: p.y - cy, s: p.s }));
}

export const cloud = (strokes: Stroke[]): P[] => normalize(resample(toPoints(strokes)));

function cloudDistance(a: P[], b: P[], start: number): number {
  const n = a.length;
  const matched = new Array<boolean>(n).fill(false);
  let sum = 0;
  let i = start;
  do {
    let index = -1;
    let min = Infinity;
    for (let j = 0; j < n; j++) {
      if (matched[j]) continue;
      const d = (a[i]!.x - b[j]!.x) ** 2 + (a[i]!.y - b[j]!.y) ** 2;
      if (d < min) {
        min = d;
        index = j;
      }
    }
    matched[index] = true;
    const weight = 1 - ((i - start + n) % n) / n;
    sum += weight * Math.sqrt(min);
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

/** how far apart two normalized clouds are (0 for the same shape) */
export function greedyMatch(a: P[], b: P[]): number {
  const n = a.length;
  const step = Math.floor(Math.sqrt(n));
  let min = Infinity;
  for (let i = 0; i < n; i += step) min = Math.min(min, cloudDistance(a, b, i), cloudDistance(b, a, i));
  return min;
}
