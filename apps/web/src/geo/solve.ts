/**
 * Redraws a polygon to match the lengths and angles typed for it, the way a
 * design app honours dimensions: the typed values are held exactly, the
 * angles nobody typed stay as they were where they can (so a rectangle given
 * a new width is still a rectangle), and the points move as little as they
 * need to. Points that hang on other objects stay put.
 *
 * Damped Gauss–Newton (Levenberg–Marquardt) on the free corners, in two
 * passes: the typed values with the old angles as a soft wish, then the typed
 * values alone, so they come out exact.
 */
import type { Pt } from './model';

export type Target = { kind: 'len'; side: number; value: number } | { kind: 'ang'; corner: number; value: number };

/** the inside angle at corner k, radians in (0, 2π), for a polygon going round anticlockwise (ccw) or not */
export function insideAngle(pts: Pt[], k: number, ccw: boolean): number {
  const n = pts.length;
  const [v, a, c] = [pts[k]!, pts[(k + n - 1) % n]!, pts[(k + 1) % n]!];
  const u = { x: a.x - v.x, y: a.y - v.y };
  const w = { x: c.x - v.x, y: c.y - v.y };
  const cross = w.x * u.y - w.y * u.x;
  let t = Math.atan2(ccw ? cross : -cross, w.x * u.x + w.y * u.y);
  if (t < 0) t += 2 * Math.PI;
  return t;
}
const sideLength = (pts: Pt[], k: number) => {
  const [a, b] = [pts[k]!, pts[(k + 1) % pts.length]!];
  return Math.hypot(b.x - a.x, b.y - a.y);
};

/** solve A x = b (small, dense) by Gaussian elimination with pivoting */
function linsolve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-300) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      if (f) for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

function lm(pts0: Pt[], movable: boolean[], residuals: (pts: Pt[]) => number[], iterations: number): Pt[] {
  const idx: number[] = [];
  movable.forEach((m, k) => m && idx.push(k));
  if (!idx.length) return pts0;
  const unpack = (x: number[]) => {
    const out = pts0.map((p) => ({ ...p }));
    idx.forEach((k, j) => (out[k] = { x: x[2 * j]!, y: x[2 * j + 1]! }));
    return out;
  };
  let x = idx.flatMap((k) => [pts0[k]!.x, pts0[k]!.y]);
  const cost = (r: number[]) => r.reduce((t, v) => t + v * v, 0);
  let r = residuals(unpack(x));
  let c = cost(r);
  let lambda = 1e-3;
  for (let it = 0; it < iterations && c > 1e-26; it++) {
    // the Jacobian by central differences
    const J: number[][] = r.map(() => new Array(x.length).fill(0));
    for (let j = 0; j < x.length; j++) {
      const h = 1e-7 * Math.max(1, Math.abs(x[j]!));
      const xp = [...x];
      const xm = [...x];
      xp[j]! += h;
      xm[j]! -= h;
      const [rp, rm] = [residuals(unpack(xp)), residuals(unpack(xm))];
      for (let i = 0; i < r.length; i++) J[i]![j] = (rp[i]! - rm[i]!) / (2 * h);
    }
    const JtJ = x.map((_, a) => x.map((__, b) => J.reduce((t, row) => t + row[a]! * row[b]!, 0)));
    const Jtr = x.map((_, a) => J.reduce((t, row, i) => t + row[a]! * r[i]!, 0));
    let improved = false;
    for (let tries = 0; tries < 12 && !improved; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v + lambda * (1 + v) : v)));
      const d = linsolve(A, Jtr.map((v) => -v));
      if (!d) {
        lambda *= 10;
        continue;
      }
      const xn = x.map((v, j) => v + d[j]!);
      const rn = residuals(unpack(xn));
      const cn = cost(rn);
      if (cn < c) {
        [x, r, c] = [xn, rn, cn];
        lambda = Math.max(1e-12, lambda / 4);
        improved = true;
      } else lambda *= 8;
    }
    if (!improved) break;
  }
  return unpack(x);
}

/**
 * A polygon with the given lengths and angles. `targets` are what was typed
 * (lengths in coordinate units, angles in degrees inside the polygon).
 * Returns the new corners and the largest miss (0 when everything fits).
 */
export function solvePolygon(pts: Pt[], movable: boolean[], targets: Target[]): { pts: Pt[]; miss: number } {
  const n = pts.length;
  let area = 0;
  pts.forEach((p, k) => {
    const q = pts[(k + 1) % n]!;
    area += p.x * q.y - q.x * p.y;
  });
  const ccw = area > 0;
  const scale = pts.reduce((t, _, k) => t + sideLength(pts, k), 0) / n || 1;
  const locked = (p: Pt[]) =>
    targets.map((t) => (t.kind === 'len' ? sideLength(p, t.side) - t.value : (insideAngle(p, t.corner, ccw) - (t.value * Math.PI) / 180) * scale));
  // the angles nobody typed: kept where they can be, a little more softly
  const keep = Array.from({ length: n }, (_, k) => k).filter((k) => !targets.some((t) => t.kind === 'ang' && t.corner === k));
  const before = keep.map((k) => insideAngle(pts, k, ccw));
  // and each side keeps its direction where it can, the first side (the base) most of all
  const dirs = pts.map((p, k) => Math.atan2(pts[(k + 1) % n]!.y - p.y, pts[(k + 1) % n]!.x - p.x));
  const turn = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const soft = (p: Pt[]) => [
    ...keep.map((k, j) => (insideAngle(p, k, ccw) - before[j]!) * scale * 0.3),
    ...p.map((q, k) => turn(Math.atan2(p[(k + 1) % n]!.y - q.y, p[(k + 1) % n]!.x - q.x) - dirs[k]!) * scale * (k === 0 ? 1 : 0.2)),
  ];
  // turning the whole shape is always free, so the base can stay level exactly (unless two points are pinned)
  const level = movable.filter((m) => !m).length <= 1 ? (p: Pt[]) => [turn(Math.atan2(p[1]!.y - p[0]!.y, p[1]!.x - p[0]!.x) - dirs[0]!) * scale] : () => [];
  // numbers that land within a hair of a simple fraction become that fraction, so 3 shows as 3, not 3.00
  const tidy = (v: number, tol: number, most: number) => {
    for (let d = 1; d <= most; d++) {
      const n = Math.round(v * d);
      if (Math.abs(v - n / d) < tol) return n / d;
    }
    return v;
  };
  const first = lm(pts, movable, (p) => [...locked(p), ...soft(p)], 400);
  // a direction nothing pins (a rectangle's height when its width is typed) can drift a little on the way: put it back on the grid
  const settled = first.map((p, k) => (movable[k] ? { x: tidy(p.x, 1e-4, 12), y: tidy(p.y, 1e-4, 12) } : p));
  const done = lm(settled, movable, (p) => [...locked(p), ...level(p)], 200);
  const clean = done.map((p, k) => (movable[k] ? { x: tidy(p.x, 1e-8, 64), y: tidy(p.y, 1e-8, 64) } : p));
  const miss = Math.max(0, ...locked(clean).map(Math.abs));
  return { pts: clean, miss };
}

/** an angle a–vertex–c turned to `deg`: the free arm swings about the vertex, keeping its length and the side it opened to */
export function turnArm(a: Pt, v: Pt, c: Pt, deg: number): Pt {
  const t1 = Math.atan2(a.y - v.y, a.x - v.x);
  const t2 = Math.atan2(c.y - v.y, c.x - v.x);
  let d = t2 - t1;
  while (d <= -Math.PI) d += 2 * Math.PI;
  while (d > Math.PI) d -= 2 * Math.PI;
  const sign = d < 0 ? -1 : 1;
  const r = Math.hypot(c.x - v.x, c.y - v.y);
  const t = t1 + (sign * deg * Math.PI) / 180;
  return { x: v.x + r * Math.cos(t), y: v.y + r * Math.sin(t) };
}
