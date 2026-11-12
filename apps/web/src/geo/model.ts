/**
 * A geometry construction: free points the user places and drags, and
 * objects built from them. Everything is recomputed from the free points,
 * so moving one moves everything that depends on it.
 */

import type { GeoProps } from './props';

/** per-object label details: custom text, each side and corner of a polygon, labels dragged away from their place */
export interface LabelPart {
  label?: 'hidden' | 'value' | 'custom';
  text?: string;
  ticks?: number;
  arrows?: number;
  arcs?: number;
  /** a length typed for this side, held when the shape is redrawn */
  len?: number;
  /** an angle typed for this corner, in degrees */
  deg?: number;
  /** when the value was typed: with too many, the oldest gives way */
  at?: number;
}
export interface Deco {
  /** custom text for the object's main label (a segment's length, a circle's measure, an angle) */
  text?: string;
  /** a polygon's sides: side k runs from corner k to corner k + 1 */
  sides?: LabelPart[];
  /** a polygon's corners */
  corners?: LabelPart[];
  /** labels moved by hand, by label key, in coordinate units */
  moved?: Record<string, Pt>;
}
/** what every object can carry besides its geometry: settings that override the document's, and label details */
export interface Styled {
  props?: Partial<GeoProps>;
  deco?: Deco;
}

export type GeoObject = (
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
  /** a regular polygon with n sides on the side a→b, turning left (a square when n = 4) */
  | { id: string; kind: 'regular'; name: string; a: string; b: string; n: number }
  /** corner k of a regular polygon (its corners 0 and 1 are a and b) */
  | { id: string; kind: 'vertex'; name: string; poly: string; k: number }
  /** the angle a-vertex-c, measured */
  | { id: string; kind: 'angle'; name: string; a: string; vertex: string; c: string }
  | { id: string; kind: 'text'; name: string; x: number; y: number; text: string }
  /** an ellipse around a free centre, its radii along axes turned by `rot` degrees */
  | { id: string; kind: 'ellipse'; name: string; center: string; rx: number; ry: number; rot: number }
) &
  Styled;

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
  | { type: 'ellipse'; c: Pt; rx: number; ry: number; rot: number }
  | { type: 'polygon'; pts: Pt[] }
  | { type: 'angle'; a: Pt; v: Pt; c: Pt; degrees: number }
  | { type: 'text'; at: Pt; text: string };

const dist = (p: Pt, q: Pt) => Math.hypot(q.x - p.x, q.y - p.y);

/** crossings of two lines or circles (0, 1 or 2 points) */
export function crossings(s: Shape, t: Shape): Pt[] {
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
      case 'ellipse': {
        const c = pt(o.center);
        if (c && o.rx > 1e-12 && o.ry > 1e-12) shape = { type: 'ellipse', c, rx: o.rx, ry: o.ry, rot: o.rot };
        break;
      }
      case 'compass': {
        const [c, p, q] = [pt(o.center), pt(o.r1), pt(o.r2)];
        if (c && p && q && dist(p, q) > 1e-12) shape = { type: 'circle', c, r: dist(p, q) };
        break;
      }
      case 'regular': {
        const [a, b] = [pt(o.a), pt(o.b)];
        const n = Math.round(o.n);
        if (a && b && n >= 3 && n <= 60 && dist(a, b) > 1e-12) shape = { type: 'polygon', pts: regularCorners(a, b, n) };
        break;
      }
      case 'vertex': {
        const s = out.get(o.poly);
        const at = s?.type === 'polygon' ? s.pts[o.k] : undefined;
        if (at) shape = { type: 'point', at, free: false };
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

/** the corners of a regular n-gon on the side a→b, going round anticlockwise */
export function regularCorners(a: Pt, b: Pt, n: number): Pt[] {
  const pts = [a, b];
  const turn = (2 * Math.PI) / n;
  let d = { x: b.x - a.x, y: b.y - a.y };
  for (let k = 2; k < n; k++) {
    d = { x: d.x * Math.cos(turn) - d.y * Math.sin(turn), y: d.x * Math.sin(turn) + d.y * Math.cos(turn) };
    const last = pts[pts.length - 1]!;
    pts.push({ x: last.x + d.x, y: last.y + d.y });
  }
  return pts;
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
  if (s.type === 'ellipse') return n(Math.PI * s.rx * s.ry);
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
      case 'vertex':
        if (s.type === 'point') lines.push(`${o.name} = ${pair(s.at)}`);
        break;
      case 'regular':
        if (s.type === 'polygon') lines.push(`polygon(${s.pts.map(pair).join(', ')})`);
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
      case 'ellipse':
        if (s.type === 'ellipse') {
          const t = (s.rot * Math.PI) / 180;
          const [c, si] = [Math.cos(t), Math.sin(t)];
          const X = `(x ${s.c.x < 0 ? '+' : '-'} ${num(Math.abs(s.c.x))})`;
          const Y = `(y ${s.c.y < 0 ? '+' : '-'} ${num(Math.abs(s.c.y))})`;
          lines.push(
            Math.abs(si) < 1e-12
              ? `${X}^2/${num(s.rx * s.rx)} + ${Y}^2/${num(s.ry * s.ry)} = 1`
              : `(${num(c)}${X} + ${num(si)}${Y})^2/${num(s.rx * s.rx)} + (${num(-si)}${X} + ${num(c)}${Y})^2/${num(s.ry * s.ry)} = 1`,
          );
        }
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

/** the ids an object is built from */
export function refs(o: GeoObject): string[] {
  switch (o.kind) {
    case 'point':
    case 'text':
      return [];
    case 'midpoint':
    case 'segment':
    case 'line':
    case 'ray':
    case 'bisector':
    case 'regular':
      return [o.a, o.b];
    case 'intersection':
      return [o.p, o.q];
    case 'reflect':
      return [o.p, o.line];
    case 'rotate':
      return [o.p, o.center];
    case 'perpendicular':
    case 'parallel':
      return [o.line, o.through];
    case 'circle':
      return [o.center, o.through];
    case 'compass':
      return [o.center, o.r1, o.r2];
    case 'polygon':
      return o.pts;
    case 'vertex':
      return [o.poly];
    case 'ellipse':
      return [o.center];
    case 'angle':
      return [o.a, o.vertex, o.c];
  }
}

/** remove ids and everything built on them */
export function without(objects: GeoObject[], ids: Set<string>): GeoObject[] {
  const gone = new Set(ids);
  for (const o of objects) if (refs(o).some((r) => gone.has(r))) gone.add(o.id);
  return objects.filter((o) => !gone.has(o.id));
}

/** the free points (and ellipses, which carry their own size) that the objects hang on: moving them moves the objects */
export function freeRoots(objects: GeoObject[], ids: Iterable<string>): string[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const out = new Set<string>();
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const o = byId.get(id);
    if (!o) return;
    if (o.kind === 'point' || o.kind === 'text' || o.kind === 'ellipse') out.add(id);
    refs(o).forEach(walk);
  };
  for (const id of ids) walk(id);
  return [...out];
}

/**
 * Can this object be dragged by itself? Free points, labels and shapes drawn
 * from free points can; points and lines built from others (a midpoint, an
 * intersection, a perpendicular) follow their parents instead.
 */
export function draggable(o: GeoObject): boolean {
  return ['point', 'text', 'segment', 'line', 'ray', 'circle', 'compass', 'polygon', 'regular', 'ellipse'].includes(o.kind);
}

/** the objects and every object they are built from, in document order */
export function withAncestors(objects: GeoObject[], ids: Iterable<string>): GeoObject[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const keep = new Set<string>();
  const walk = (id: string) => {
    if (keep.has(id)) return;
    keep.add(id);
    const o = byId.get(id);
    if (o) refs(o).forEach(walk);
  };
  for (const id of ids) walk(id);
  return objects.filter((o) => keep.has(o.id));
}

/** copies of objects with new ids (and names), refs remapped; free points shifted by `by` */
export function cloneObjects(list: GeoObject[], into: GeoObject[], by: Pt, newId: () => string): GeoObject[] {
  const map = new Map(list.map((o) => [o.id, newId()]));
  const r = (id: string) => map.get(id) ?? id;
  let all = [...into];
  const out: GeoObject[] = [];
  for (const o of list) {
    const copy = JSON.parse(JSON.stringify(o)) as GeoObject & Record<string, unknown>;
    copy.id = r(o.id);
    for (const key of ['a', 'b', 'p', 'q', 'line', 'center', 'through', 'r1', 'r2', 'vertex', 'c', 'poly'] as const) {
      if (typeof copy[key] === 'string' && map.has(copy[key] as string)) copy[key] = r(copy[key] as string);
    }
    if (o.kind === 'polygon') (copy as { pts: string[] }).pts = o.pts.map(r);
    if (copy.kind === 'point' || copy.kind === 'text') {
      copy.x += by.x;
      copy.y += by.y;
    }
    const isPoint = ['point', 'midpoint', 'intersection', 'vertex'].includes(copy.kind);
    if (copy.kind !== 'text' && copy.kind !== 'reflect' && copy.kind !== 'rotate') copy.name = isPoint ? nextName(all) : nextName(all, true);
    all = [...all, copy];
    out.push(copy);
  }
  return out;
}

/** a polygon's corner points in order (a regular polygon's are a, b, then its built corners) */
export function cornerIds(o: GeoObject, objects: GeoObject[]): string[] {
  if (o.kind === 'polygon') return o.pts;
  if (o.kind !== 'regular') return [];
  const built = objects.filter((v): v is Extract<GeoObject, { kind: 'vertex' }> => v.kind === 'vertex' && v.poly === o.id).sort((x, y) => x.k - y.k);
  return [o.a, o.b, ...built.map((v) => v.id)];
}
