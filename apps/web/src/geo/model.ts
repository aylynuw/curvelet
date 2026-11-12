/**
 * A geometry construction: free points the user places and drags, and
 * objects built from them. Everything is recomputed from the free points,
 * so moving one moves everything that depends on it.
 */

export type GeoObject =
  | { id: string; kind: 'point'; name: string; x: number; y: number }
  | { id: string; kind: 'midpoint'; name: string; a: string; b: string }
  /** where two objects cross; `which` picks between two crossings */
  | { id: string; kind: 'intersection'; name: string; p: string; q: string; which: 0 | 1 }
  /** a point reflected across a line, or turned about a centre */
  | { id: string; kind: 'reflect'; name: string; p: string; line: string }
  | { id: string; kind: 'rotate'; name: string; p: string; center: string; degrees: number }
  | { id: string; kind: 'segment' | 'line' | 'ray'; name: string; a: string; b: string }
  /** the line through `through` at right angles to, or alongside, `line` */
  | { id: string; kind: 'perpendicular' | 'parallel'; name: string; line: string; through: string }
  /** the perpendicular bisector of a and b */
  | { id: string; kind: 'bisector'; name: string; a: string; b: string }
  | { id: string; kind: 'circle'; name: string; center: string; through: string }
  /** compass: centre `center`, radius the distance from r1 to r2 */
  | { id: string; kind: 'compass'; name: string; center: string; r1: string; r2: string }
  | { id: string; kind: 'polygon'; name: string; pts: string[] }
  /** the angle a-vertex-c, measured */
  | { id: string; kind: 'angle'; name: string; a: string; vertex: string; c: string }
  | { id: string; kind: 'text'; name: string; x: number; y: number; text: string };

export type GeoKind = GeoObject['kind'];
export interface Pt {
  x: number;
  y: number;
}

/** what an object is once computed */
export type Shape =
  | { type: 'point'; at: Pt; free: boolean }
  /** a, b on the line; kind decides how far it runs */
  | { type: 'line'; a: Pt; b: Pt; extent: 'segment' | 'line' | 'ray' }
  | { type: 'circle'; c: Pt; r: number }
  | { type: 'polygon'; pts: Pt[] }
  | { type: 'angle'; a: Pt; v: Pt; c: Pt; degrees: number }
  | { type: 'text'; at: Pt; text: string };

const dist = (p: Pt, q: Pt) => Math.hypot(q.x - p.x, q.y - p.y);

/** crossings of two lines or circles (0, 1 or 2 points) */
function crossings(s: Shape, t: Shape): Pt[] {
  const lineOf = (u: Shape) => (u.type === 'line' ? u : null);
  if (s.type === 'line' && t.type === 'line') {
    const d1 = { x: s.b.x - s.a.x, y: s.b.y - s.a.y };
    const d2 = { x: t.b.x - t.a.x, y: t.b.y - t.a.y };
    const den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 1e-12) return [];
    const u = ((t.a.x - s.a.x) * d2.y - (t.a.y - s.a.y) * d2.x) / den;
    const v = ((t.a.x - s.a.x) * d1.y - (t.a.y - s.a.y) * d1.x) / den;
    if (!within(s, u) || !within(t, v)) return [];
    return [{ x: s.a.x + u * d1.x, y: s.a.y + u * d1.y }];
  }
  if (s.type === 'circle' && t.type === 'circle') {
    const d = dist(s.c, t.c);
    if (d < 1e-12 || d > s.r + t.r + 1e-12 || d < Math.abs(s.r - t.r) - 1e-12) return [];
    const a = (s.r * s.r - t.r * t.r + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, s.r * s.r - a * a));
    const mx = s.c.x + (a * (t.c.x - s.c.x)) / d;
    const my = s.c.y + (a * (t.c.y - s.c.y)) / d;
    const ox = (h * (t.c.y - s.c.y)) / d;
    const oy = (h * (t.c.x - s.c.x)) / d;
    return h < 1e-12 ? [{ x: mx, y: my }] : [{ x: mx + ox, y: my - oy }, { x: mx - ox, y: my + oy }];
  }
  const l = lineOf(s) ?? lineOf(t);
  const c = s.type === 'circle' ? s : t.type === 'circle' ? t : null;
  if (!l || !c) return [];
  const d = { x: l.b.x - l.a.x, y: l.b.y - l.a.y };
  const f = { x: l.a.x - c.c.x, y: l.a.y - c.c.y };
  const A = d.x * d.x + d.y * d.y;
  const B = 2 * (f.x * d.x + f.y * d.y);
  const C = f.x * f.x + f.y * f.y - c.r * c.r;
  const disc = B * B - 4 * A * C;
  if (disc < -1e-12 || A < 1e-12) return [];
  const root = Math.sqrt(Math.max(0, disc));
  const us = disc < 1e-12 ? [-B / (2 * A)] : [(-B - root) / (2 * A), (-B + root) / (2 * A)];
  return us.filter((u) => within(l, u)).map((u) => ({ x: l.a.x + u * d.x, y: l.a.y + u * d.y }));
}
const within = (l: Shape, u: number) =>
  l.type !== 'line' || l.extent === 'line' || (u >= -1e-9 && (l.extent === 'ray' || u <= 1 + 1e-9));

/** Every object's shape, in order; an object whose inputs are missing or impossible is left out. */
export function resolve(objects: GeoObject[]): Map<string, Shape> {
  const out = new Map<string, Shape>();
  const pt = (id: string): Pt | null => {
    const s = out.get(id);
    return s?.type === 'point' ? s.at : null;
  };
  const ln = (id: string) => {
    const s = out.get(id);
    return s?.type === 'line' ? s : null;
  };
  for (const o of objects) {
    let shape: Shape | null = null;
    switch (o.kind) {
      case 'point':
        shape = { type: 'point', at: { x: o.x, y: o.y }, free: true };
        break;
      case 'text':
        shape = { type: 'text', at: { x: o.x, y: o.y }, text: o.text };
        break;
      case 'midpoint': {
        const [a, b] = [pt(o.a), pt(o.b)];
        if (a && b) shape = { type: 'point', at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, free: false };
        break;
      }
      case 'intersection': {
        const [s, t] = [out.get(o.p), out.get(o.q)];
        const hits = s && t ? crossings(s, t) : [];
        const at = hits[o.which] ?? hits[0];
        if (at) shape = { type: 'point', at, free: false };
        break;
      }
      case 'reflect': {
        const [p, l] = [pt(o.p), ln(o.line)];
        if (p && l) {
          const d = { x: l.b.x - l.a.x, y: l.b.y - l.a.y };
          const t = ((p.x - l.a.x) * d.x + (p.y - l.a.y) * d.y) / (d.x * d.x + d.y * d.y);
          const foot = { x: l.a.x + t * d.x, y: l.a.y + t * d.y };
          shape = { type: 'point', at: { x: 2 * foot.x - p.x, y: 2 * foot.y - p.y }, free: false };
        }
        break;
      }
      case 'rotate': {
        const [p, c] = [pt(o.p), pt(o.center)];
        if (p && c) {
          const r = (o.degrees * Math.PI) / 180;
          const [dx, dy] = [p.x - c.x, p.y - c.y];
          shape = { type: 'point', at: { x: c.x + dx * Math.cos(r) - dy * Math.sin(r), y: c.y + dx * Math.sin(r) + dy * Math.cos(r) }, free: false };
        }
        break;
      }
      case 'segment':
      case 'line':
      case 'ray': {
        const [a, b] = [pt(o.a), pt(o.b)];
        if (a && b && dist(a, b) > 1e-12) shape = { type: 'line', a, b, extent: o.kind };
        break;
      }
      case 'perpendicular':
      case 'parallel': {
        const [l, p] = [ln(o.line), pt(o.through)];
        if (l && p) {
          const d = { x: l.b.x - l.a.x, y: l.b.y - l.a.y };
          const dir = o.kind === 'parallel' ? d : { x: -d.y, y: d.x };
          shape = { type: 'line', a: p, b: { x: p.x + dir.x, y: p.y + dir.y }, extent: 'line' };
        }
        break;
      }
      case 'bisector': {
        const [a, b] = [pt(o.a), pt(o.b)];
        if (a && b && dist(a, b) > 1e-12) {
          const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          shape = { type: 'line', a: m, b: { x: m.x - (b.y - a.y), y: m.y + (b.x - a.x) }, extent: 'line' };
        }
        break;
      }
      case 'circle': {
        const [c, p] = [pt(o.center), pt(o.through)];
        if (c && p && dist(c, p) > 1e-12) shape = { type: 'circle', c, r: dist(c, p) };
        break;
      }
      case 'compass': {
        const [c, p, q] = [pt(o.center), pt(o.r1), pt(o.r2)];
        if (c && p && q && dist(p, q) > 1e-12) shape = { type: 'circle', c, r: dist(p, q) };
        break;
      }
      case 'polygon': {
        const pts = o.pts.map(pt);
        if (pts.length >= 3 && pts.every(Boolean)) shape = { type: 'polygon', pts: pts as Pt[] };
        break;
      }
      case 'angle': {
        const [a, v, c] = [pt(o.a), pt(o.vertex), pt(o.c)];
        if (a && v && c && dist(a, v) > 1e-12 && dist(c, v) > 1e-12) {
          const t1 = Math.atan2(a.y - v.y, a.x - v.x);
          const t2 = Math.atan2(c.y - v.y, c.x - v.x);
          let deg = ((t2 - t1) * 180) / Math.PI;
          deg = ((deg % 360) + 360) % 360;
          if (deg > 180) deg = 360 - deg;
          shape = { type: 'angle', a, v, c, degrees: deg };
        }
        break;
      }
    }
    if (shape) out.set(o.id, shape);
  }
  return out;
}

/** a measure to show beside an object: length, radius and area, area and perimeter, an angle */
export function measure(s: Shape): string | null {
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  if (s.type === 'line' && s.extent === 'segment') return n(dist(s.a, s.b));
  if (s.type === 'circle') return `r = ${n(s.r)}`;
  if (s.type === 'polygon') {
    let a = 0;
    s.pts.forEach((q, k) => {
      const r = s.pts[(k + 1) % s.pts.length]!;
      a += q.x * r.y - r.x * q.y;
    });
    return n(Math.abs(a) / 2);
  }
  if (s.type === 'angle') return `${n(s.degrees)}°`;
  return null;
}

const num = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
const pair = (p: Pt) => `(${num(p.x)}, ${num(p.y)})`;

/**
 * The construction as calculator lines, so it can be sent to the graph:
 * free points as `A = (1, 2)`, objects with the engine's own functions where
 * it has them, and computed places (an intersection, a perpendicular) as
 * where they are now.
 */
export function toLines(objects: GeoObject[]): string[] {
  const shapes = resolve(objects);
  const byId = new Map(objects.map((o) => [o.id, o]));
  const nm = (id: string) => byId.get(id)?.name ?? '?';
  const lines: string[] = [];
  for (const o of objects) {
    const s = shapes.get(o.id);
    if (!s) continue;
    switch (o.kind) {
      case 'point':
        lines.push(`${o.name} = ${pair({ x: o.x, y: o.y })}`);
        break;
      case 'midpoint':
        lines.push(`${o.name} = midpoint(segment(${nm(o.a)}, ${nm(o.b)}))`);
        break;
      case 'intersection':
      case 'reflect':
      case 'rotate':
        if (s.type === 'point') lines.push(`${o.name} = ${pair(s.at)}`);
        break;
      case 'segment':
      case 'line':
      case 'ray':
        lines.push(`${o.kind}(${nm(o.a)}, ${nm(o.b)})`);
        break;
      case 'perpendicular':
      case 'parallel':
      case 'bisector':
        if (s.type === 'line') lines.push(`line(${pair(s.a)}, ${pair(s.b)})`);
        break;
      case 'circle':
        lines.push(`circle(${nm(o.center)}, ${nm(o.through)})`);
        break;
      case 'compass':
        lines.push(`circle(${nm(o.center)}, length(segment(${nm(o.r1)}, ${nm(o.r2)})))`);
        break;
      case 'polygon':
        lines.push(`polygon(${o.pts.map(nm).join(', ')})`);
        break;
      case 'angle':
      case 'text':
        break;
    }
  }
  return lines;
}

/** the next free capital for a point: A … Z, then A_1 … */
export function nextName(objects: GeoObject[], lower = false): string {
  const used = new Set(objects.map((o) => o.name));
  const base = lower ? 'abcdefghijklmnopqrstuvwxyz' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let round = 0; ; round++) {
    for (const ch of base) {
      const name = round === 0 ? ch : `${ch}_${round}`;
      if (!used.has(name)) return name;
    }
  }
}
