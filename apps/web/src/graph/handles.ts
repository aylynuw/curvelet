/**
 * Editing a graphed shape by its numbers: the points written out in its line,
 * "(3, 4)", become handles; dragging one rewrites just that pair.
 */
const NUM = String.raw`[-−]?\d*\.?\d+(?:e[-+]?\d+)?`;
const pairRe = () => new RegExp(String.raw`\(\s*(${NUM})\s*,\s*(${NUM})\s*\)`, 'g');
const read = (s: string) => Number(s.replace('−', '-'));

export interface Literal {
  x: number;
  y: number;
  start: number;
  end: number;
}

/** every (x, y) written with plain numbers, in reading order */
export function literalPoints(src: string): Literal[] {
  const out: Literal[] = [];
  for (const m of src.matchAll(pairRe())) out.push({ x: read(m[1]!), y: read(m[2]!), start: m.index!, end: m.index! + m[0].length });
  return out;
}

/** a coordinate as it is written back: four decimals at most, whole numbers plain */
export function fmt(v: number): string {
  const r = Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : Number(v.toFixed(4));
  return Object.is(r, -0) ? '0' : String(r);
}

/** the line with its k-th pair moved to (x, y) */
export function setLiteral(src: string, k: number, x: number, y: number): string {
  const l = literalPoints(src)[k];
  if (!l) return src;
  return `${src.slice(0, l.start)}(${fmt(x)}, ${fmt(y)})${src.slice(l.end)}`;
}

/** the line with every pair moved by (dx, dy) */
export function shiftLiterals(src: string, dx: number, dy: number): string {
  let out = '';
  let at = 0;
  for (const l of literalPoints(src)) {
    out += `${src.slice(at, l.start)}(${fmt(l.x + dx)}, ${fmt(l.y + dy)})`;
    at = l.end;
  }
  return out + src.slice(at);
}

/** the point names a line uses (A, B, P_1), in order, once each */
export function pointNames(src: string): string[] {
  const body = src.replace(/^\s*(let\s+|const\s+)?[A-Za-z]\w*\s*=/, '');
  return [...new Set([...body.matchAll(/(?<![\w.])([A-Z](?:_\{?\w+\}?)?)(?![\w(])/g)].map((m) => m[1]!))];
}

/**
 * Where the polylines of one curve cross those of the others, in screen pixels.
 * `segs` lists each curve's pieces as x1, y1, x2, y2.
 */
export function crossingsWith(mine: number[], others: number[], limit = 60): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  if (mine.length > 24000 || others.length > 400000) return out;
  // others bucketed on a 40 px grid, so each piece of mine meets only its neighbours
  const cell = 40;
  const grid = new Map<string, number[]>();
  for (let k = 0; k + 3 < others.length; k += 4) {
    const [x0, x1] = [Math.min(others[k]!, others[k + 2]!), Math.max(others[k]!, others[k + 2]!)];
    const [y0, y1] = [Math.min(others[k + 1]!, others[k + 3]!), Math.max(others[k + 1]!, others[k + 3]!)];
    if (x1 - x0 > 4000 || y1 - y0 > 4000) continue;
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++)
      for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) {
        const key = `${i},${j}`;
        const list = grid.get(key);
        if (list) list.push(k);
        else grid.set(key, [k]);
      }
  }
  const seen = new Set<number>();
  for (let a = 0; a + 3 < mine.length && out.length < limit; a += 4) {
    const [ax, ay, bx, by] = [mine[a]!, mine[a + 1]!, mine[a + 2]!, mine[a + 3]!];
    seen.clear();
    for (let i = Math.floor(Math.min(ax, bx) / cell); i <= Math.floor(Math.max(ax, bx) / cell); i++)
      for (let j = Math.floor(Math.min(ay, by) / cell); j <= Math.floor(Math.max(ay, by) / cell); j++)
        for (const k of grid.get(`${i},${j}`) ?? []) {
          if (seen.has(k)) continue;
          seen.add(k);
          const [cx, cy, dx, dy] = [others[k]!, others[k + 1]!, others[k + 2]!, others[k + 3]!];
          const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
          if (Math.abs(den) < 1e-12) continue;
          const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
          const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const p = { x: ax + t * (bx - ax), y: ay + t * (by - ay) };
          if (!out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 6)) out.push(p);
        }
  }
  return out;
}

type P = { x: number; y: number };
/** what a curve is, near a crossing, for finding that crossing exactly */
export type Prim =
  | { kind: 'fn'; f: (x: number) => number }
  | { kind: 'line'; a: P; b: P }
  | { kind: 'circle'; c: P; r: number }
  /** one cubic piece of a pen curve: P0, C1, C2, P1 */
  | { kind: 'bezier'; q: [P, P, P, P] };

/** a point on a cubic piece at t in [0, 1] */
export function bezierAt(q: [P, P, P, P], t: number): P {
  const u = 1 - t;
  const [a, b, c, d] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return { x: a * q[0].x + b * q[1].x + c * q[2].x + d * q[3].x, y: a * q[0].y + b * q[1].y + c * q[2].y + d * q[3].y };
}
/** the parameter of the piece's point nearest p */
function nearestT(q: [P, P, P, P], p: P): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k <= 200; k++) {
    const b = bezierAt(q, k / 200);
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (d < bestD) [best, bestD] = [k / 200, d];
  }
  return best;
}
/** where g changes sign near t0 on [0, 1], halved down to full precision */
function rootNear(g: (t: number) => number, t0: number): number | null {
  const steps = 40;
  const [lo0, hi0] = [Math.max(0, t0 - 0.08), Math.min(1, t0 + 0.08)];
  let best: [number, number] | null = null;
  for (let k = 0; k < steps; k++) {
    const [a, b] = [lo0 + ((hi0 - lo0) * k) / steps, lo0 + ((hi0 - lo0) * (k + 1)) / steps];
    if (Math.sign(g(a)) * Math.sign(g(b)) <= 0 && (!best || Math.abs((a + b) / 2 - t0) < Math.abs((best[0] + best[1]) / 2 - t0))) best = [a, b];
  }
  if (!best) return null;
  let [lo, hi] = best;
  if (g(lo) === 0) return lo;
  for (let k = 0; k < 80; k++) {
    const m = (lo + hi) / 2;
    if (Math.sign(g(m)) === Math.sign(g(lo))) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** the straight piece or circle of a shape nearest to `p` (a polygon's nearest side) */
export function primOfShape(shape: { type: string; a?: P; b?: P; c?: P; r?: number; pts?: P[]; controls?: P[] }, p: P): Prim | null {
  if (shape.type === 'circle' && shape.c && shape.r !== undefined) return { kind: 'circle', c: shape.c, r: shape.r };
  if (shape.type === 'path' && shape.controls && shape.controls.length >= 4) {
    // the cubic piece passing nearest p
    let best: Prim | null = null;
    let bestD = Infinity;
    for (let k = 0; k + 3 < shape.controls.length; k += 3) {
      const q = shape.controls.slice(k, k + 4) as [P, P, P, P];
      const b = bezierAt(q, nearestT(q, p));
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < bestD) [best, bestD] = [{ kind: 'bezier', q }, d];
    }
    return best;
  }
  if (shape.a && shape.b) return { kind: 'line', a: shape.a, b: shape.b };
  if (shape.type === 'polygon' && shape.pts && shape.pts.length > 1) {
    let best: Prim | null = null;
    let bestD = Infinity;
    shape.pts.forEach((a, k) => {
      const b = shape.pts![(k + 1) % shape.pts!.length]!;
      const d = distToSegment(p, a, b);
      if (d < bestD) [best, bestD] = [{ kind: 'line', a, b }, d];
    });
    return best;
  }
  return null;
}
function distToSegment(p: P, a: P, b: P) {
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const nearest = (pts: P[], p: P) => pts.reduce<P | null>((best, q) => (!best || Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? q : best), null);

/** the crossing of two curves near `p`, worked out exactly (or null to keep the approximate one) */
export function exactCrossing(u: Prim, v: Prim, p: P, span: number): P | null {
  // a pen curve: solved along its parameter, to full precision
  if (v.kind === 'bezier' && u.kind !== 'bezier') return exactCrossing(v, u, p, span);
  if (u.kind === 'bezier') {
    const q = u.q;
    if (v.kind === 'bezier') {
      // two pen curves: Newton's method on both parameters from the nearest points
      let [t, w] = [nearestT(q, p), nearestT(v.q, p)];
      for (let k = 0; k < 50; k++) {
        const [a, b] = [bezierAt(q, t), bezierAt(v.q, w)];
        const h = 1e-6;
        const [at, bw] = [bezierAt(q, Math.min(1, t + h)), bezierAt(v.q, Math.min(1, w + h))];
        const [j11, j21, j12, j22] = [(at.x - a.x) / h, (at.y - a.y) / h, -(bw.x - b.x) / h, -(bw.y - b.y) / h];
        const [fx, fy] = [a.x - b.x, a.y - b.y];
        const det = j11 * j22 - j12 * j21;
        if (Math.abs(det) < 1e-14) return null;
        t -= (fx * j22 - fy * j12) / det;
        w -= (j11 * fy - j21 * fx) / det;
        if (Math.hypot(fx, fy) < 1e-13) break;
      }
      if (t < -1e-9 || t > 1 + 1e-9 || w < -1e-9 || w > 1 + 1e-9) return null;
      return bezierAt(q, t);
    }
    const t0 = nearestT(q, p);
    const g =
      v.kind === 'line'
        ? (t: number) => {
            const b = bezierAt(q, t);
            return (v.b.x - v.a.x) * (b.y - v.a.y) - (v.b.y - v.a.y) * (b.x - v.a.x);
          }
        : v.kind === 'circle'
          ? (t: number) => {
              const b = bezierAt(q, t);
              return (b.x - v.c.x) ** 2 + (b.y - v.c.y) ** 2 - v.r * v.r;
            }
          : (t: number) => {
              const b = bezierAt(q, t);
              return b.y - v.f(b.x);
            };
    const t = rootNear(g, t0);
    if (t === null) return null;
    const hit = bezierAt(q, t);
    return Math.hypot(hit.x - p.x, hit.y - p.y) <= span * 4 ? hit : null;
  }
  if (u.kind === 'fn' && v.kind !== 'fn') return exactCrossing(v, u, p, span);
  if (u.kind === 'circle' && v.kind === 'line') return exactCrossing(v, u, p, span);
  if (u.kind === 'line' && v.kind === 'line') {
    const [d1x, d1y, d2x, d2y] = [u.b.x - u.a.x, u.b.y - u.a.y, v.b.x - v.a.x, v.b.y - v.a.y];
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-12) return null;
    const t = ((v.a.x - u.a.x) * d2y - (v.a.y - u.a.y) * d2x) / den;
    return { x: u.a.x + t * d1x, y: u.a.y + t * d1y };
  }
  if (u.kind === 'line' && v.kind === 'circle') {
    const [dx, dy] = [u.b.x - u.a.x, u.b.y - u.a.y];
    const [fx, fy] = [u.a.x - v.c.x, u.a.y - v.c.y];
    const A = dx * dx + dy * dy;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - v.r * v.r;
    const disc = B * B - 4 * A * C;
    if (!A || disc < 0) return null;
    const s = Math.sqrt(disc);
    return nearest([(-B - s) / (2 * A), (-B + s) / (2 * A)].map((t) => ({ x: u.a.x + t * dx, y: u.a.y + t * dy })), p);
  }
  if (u.kind === 'circle' && v.kind === 'circle') {
    const d = Math.hypot(v.c.x - u.c.x, v.c.y - u.c.y);
    if (!d || d > u.r + v.r || d < Math.abs(u.r - v.r)) return null;
    const a = (u.r * u.r - v.r * v.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, u.r * u.r - a * a));
    const [mx, my] = [u.c.x + (a * (v.c.x - u.c.x)) / d, u.c.y + (a * (v.c.y - u.c.y)) / d];
    const [ox, oy] = [(-(v.c.y - u.c.y) * h) / d, ((v.c.x - u.c.x) * h) / d];
    return nearest([{ x: mx + ox, y: my + oy }, { x: mx - ox, y: my - oy }], p);
  }
  // a curve y = f(x) against a line or another curve: halve the gap where they change sides
  if (v.kind === 'fn') {
    const f = v.f;
    let g: ((x: number) => number) | null = null;
    if (u.kind === 'fn') g = u.f;
    else if (u.kind === 'line') {
      const dx = u.b.x - u.a.x;
      if (Math.abs(dx) < 1e-12) {
        const y = f(u.a.x);
        return Number.isFinite(y) ? { x: u.a.x, y } : null;
      }
      const m = (u.b.y - u.a.y) / dx;
      g = (x) => u.a.y + m * (x - u.a.x);
    }
    if (!g) return null;
    const h = (x: number) => f(x) - g!(x);
    let [lo, hi] = [p.x - span, p.x + span];
    if (!(Math.sign(h(lo)) * Math.sign(h(hi)) < 0)) return null;
    for (let k = 0; k < 60; k++) {
      const m = (lo + hi) / 2;
      if (Math.sign(h(m)) === Math.sign(h(lo))) lo = m;
      else hi = m;
    }
    const x = (lo + hi) / 2;
    return { x, y: f(x) };
  }
  return null;
}
