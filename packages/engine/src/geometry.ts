import { MathError } from './ast';
import type { EvalSettings, ValueBuiltin } from './builtins';
import { kindName, num, type Value } from './value';

export interface Pt {
  x: number;
  y: number;
}

/** Figures built from points. Lines, segments and rays are given by two points on them. */
export type Shape =
  | { type: 'segment'; a: Pt; b: Pt }
  | { type: 'line'; a: Pt; b: Pt }
  | { type: 'ray'; a: Pt; b: Pt }
  | { type: 'circle'; c: Pt; r: number }
  | { type: 'polygon'; pts: Pt[] };

type Straight = Extract<Shape, { a: Pt }>;

const EPS = 1e-9;
const sub = (p: Pt, q: Pt): Pt => ({ x: p.x - q.x, y: p.y - q.y });
const add = (p: Pt, q: Pt): Pt => ({ x: p.x + q.x, y: p.y + q.y });
const mul = (p: Pt, k: number): Pt => ({ x: p.x * k, y: p.y * k });
const dot = (p: Pt, q: Pt) => p.x * q.x + p.y * q.y;
const crossZ = (p: Pt, q: Pt) => p.x * q.y - p.y * q.x;
const len = (p: Pt) => Math.hypot(p.x, p.y);
const perp = (p: Pt): Pt => ({ x: -p.y, y: p.x });
const dist = (p: Pt, q: Pt) => len(sub(p, q));
const same = (p: Pt, q: Pt) => dist(p, q) <= EPS * Math.max(1, len(p), len(q));

export const pointValue = (p: Pt): Value => ({ kind: 'point', x: clean(p.x), y: clean(p.y) });
export const shapeValue = (shape: Shape): Value => ({ kind: 'shape', shape });

/** 1.9999999999999998 → 2, 1e-17 → 0 */
function clean(n: number): number {
  const r = Math.round(n);
  const v = Math.abs(n - r) < 1e-10 * Math.max(1, Math.abs(n)) ? r : n;
  return v === 0 ? 0 : v;
}

// --- argument readers ----------------------------------------------------------

function point(v: Value | undefined, fname: string): Pt {
  if (v?.kind === 'point') return v;
  throw new MathError(`${fname} needs a point like (1, 2)${v ? `, not ${kindName(v)}` : ''}`);
}
function real(v: Value | undefined, fname: string): number {
  if (v?.kind === 'num' && v.z.isReal()) return v.z.re;
  throw new MathError(`${fname} needs a real number${v ? `, not ${kindName(v)}` : ''}`);
}
function straight(v: Value | undefined, fname: string): Straight {
  if (v?.kind === 'shape' && v.shape.type !== 'circle' && v.shape.type !== 'polygon') return v.shape;
  throw new MathError(`${fname} needs a line, segment or ray${v ? `, not ${kindName(v)}` : ''}`);
}
function circleOf(v: Value | undefined, fname: string): Extract<Shape, { type: 'circle' }> {
  if (v?.kind === 'shape' && v.shape.type === 'circle') return v.shape;
  throw new MathError(`${fname} needs a circle${v ? `, not ${kindName(v)}` : ''}`);
}
function distinct(a: Pt, b: Pt, fname: string) {
  if (same(a, b)) throw new MathError(`${fname} needs two different points`);
}

const toRad = (s: EvalSettings) => (s.angle === 'deg' ? Math.PI / 180 : 1);

// --- measurements --------------------------------------------------------------

export function polygonArea(pts: Pt[]): number {
  let twice = 0;
  for (let k = 0; k < pts.length; k++) twice += crossZ(pts[k]!, pts[(k + 1) % pts.length]!);
  return Math.abs(twice) / 2;
}

function polygonEdges(pts: Pt[]): Straight[] {
  return pts.map((a, k) => ({ type: 'segment', a, b: pts[(k + 1) % pts.length]! }));
}

/** Distance from p to the nearest point of a line, segment or ray. */
function distanceToStraight(p: Pt, s: Straight): number {
  const d = sub(s.b, s.a);
  let t = dot(sub(p, s.a), d) / dot(d, d);
  if (s.type !== 'line') t = Math.max(0, t);
  if (s.type === 'segment') t = Math.min(1, t);
  return dist(p, add(s.a, mul(d, t)));
}

// --- intersections ----------------------------------------------------------------

/** Does the parameter t (0 at a, 1 at b) lie on this kind of straight figure? */
const onStraight = (s: Straight, t: number) => (s.type === 'line' ? true : s.type === 'ray' ? t >= -EPS : t >= -EPS && t <= 1 + EPS);

function meetStraight(p: Straight, q: Straight): Pt[] {
  const d1 = sub(p.b, p.a);
  const d2 = sub(q.b, q.a);
  const denom = crossZ(d1, d2);
  if (Math.abs(denom) < EPS * len(d1) * len(d2)) return []; // parallel (or the same line)
  const w = sub(q.a, p.a);
  const t = crossZ(w, d2) / denom;
  const u = crossZ(w, d1) / denom;
  return onStraight(p, t) && onStraight(q, u) ? [add(p.a, mul(d1, t))] : [];
}

function meetStraightCircle(s: Straight, c: { c: Pt; r: number }): Pt[] {
  const d = sub(s.b, s.a);
  const f = sub(s.a, c.c);
  const A = dot(d, d);
  const B = 2 * dot(f, d);
  const C = dot(f, f) - c.r * c.r;
  const disc = B * B - 4 * A * C;
  if (disc < -EPS * B * B) return [];
  const root = Math.sqrt(Math.max(0, disc));
  const ts = disc <= EPS * Math.max(1, B * B) ? [-B / (2 * A)] : [(-B - root) / (2 * A), (-B + root) / (2 * A)];
  return ts.filter((t) => onStraight(s, t)).map((t) => add(s.a, mul(d, t)));
}

function meetCircles(p: { c: Pt; r: number }, q: { c: Pt; r: number }): Pt[] {
  const d = dist(p.c, q.c);
  if (d < EPS || d > p.r + q.r + EPS || d < Math.abs(p.r - q.r) - EPS) return [];
  const a = (p.r * p.r - q.r * q.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, p.r * p.r - a * a));
  const u = mul(sub(q.c, p.c), 1 / d);
  const base = add(p.c, mul(u, a));
  if (h < EPS * Math.max(1, p.r)) return [base];
  return [add(base, mul(perp(u), h)), sub(base, mul(perp(u), h))];
}

/** Where two figures meet, sorted left to right (then bottom to top). */
export function intersections(a: Shape, b: Shape): Pt[] {
  const pieces = (s: Shape): (Straight | Extract<Shape, { type: 'circle' }>)[] =>
    s.type === 'polygon' ? polygonEdges(s.pts) : [s];
  const out: Pt[] = [];
  for (const p of pieces(a)) {
    for (const q of pieces(b)) {
      const found =
        p.type === 'circle' && q.type === 'circle'
          ? meetCircles(p, q)
          : p.type === 'circle'
            ? meetStraightCircle(q as Straight, p)
            : q.type === 'circle'
              ? meetStraightCircle(p, q)
              : meetStraight(p, q);
      for (const pt of found) if (!out.some((o) => same(o, pt))) out.push(pt);
    }
  }
  return out.sort((p, q) => p.x - q.x || p.y - q.y);
}

// --- constructions -------------------------------------------------------------------

function circumcircle(a: Pt, b: Pt, c: Pt): { c: Pt; r: number } {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < EPS * Math.max(1, len(a), len(b), len(c)) ** 2) {
    throw new MathError('The three points are on one line, so no circle passes through them');
  }
  const sq = (p: Pt) => p.x * p.x + p.y * p.y;
  const centre = {
    x: (sq(a) * (b.y - c.y) + sq(b) * (c.y - a.y) + sq(c) * (a.y - b.y)) / d,
    y: (sq(a) * (c.x - b.x) + sq(b) * (a.x - c.x) + sq(c) * (b.x - a.x)) / d,
  };
  return { c: centre, r: dist(centre, a) };
}

/** Which of several answers: k (1-based) when given, else the only one or the first. */
function pick<T>(items: T[], k: Value | undefined, fname: string, none: string): T {
  if (items.length === 0) throw new MathError(none);
  if (k === undefined) return items[0]!;
  const n = real(k, fname);
  if (!Number.isInteger(n) || n < 1 || n > items.length) {
    throw new MathError(`${fname}: there ${items.length === 1 ? 'is 1 answer' : `are ${items.length} answers`}, so the last number must be 1${items.length > 1 ? `–${items.length}` : ''}`);
  }
  return items[n - 1]!;
}

const fixed = (min: number, max: number = min): [number, number] => [min, max];

/**
 * Geometry functions. They are looked up after the user's own definitions, so
 * names like `area` or `length` stay free to define.
 */
export const GEOMETRY_FUNCTIONS: Record<string, ValueBuiltin> = {
  segment: {
    arity: fixed(2),
    fn: ([p, q]) => {
      const [a, b] = [point(p, 'segment'), point(q, 'segment')];
      distinct(a, b, 'segment');
      return shapeValue({ type: 'segment', a, b });
    },
  },
  line: {
    arity: fixed(2),
    fn: ([p, q]) => {
      const [a, b] = [point(p, 'line'), point(q, 'line')];
      distinct(a, b, 'line');
      return shapeValue({ type: 'line', a, b });
    },
  },
  ray: {
    arity: fixed(2),
    fn: ([p, q]) => {
      const [a, b] = [point(p, 'ray'), point(q, 'ray')];
      distinct(a, b, 'ray');
      return shapeValue({ type: 'ray', a, b });
    },
  },
  /** circle(C, r), circle(C, P) through P, circle(A, B, C) through all three */
  circle: {
    arity: fixed(2, 3),
    fn: (args) => {
      if (args.length === 3) {
        const c = circumcircle(point(args[0], 'circle'), point(args[1], 'circle'), point(args[2], 'circle'));
        return shapeValue({ type: 'circle', ...c });
      }
      const c = point(args[0], 'circle');
      const r = args[1]?.kind === 'point' ? dist(c, args[1]) : real(args[1], 'circle');
      if (!(r > 0)) throw new MathError('A circle needs a radius greater than 0');
      return shapeValue({ type: 'circle', c, r });
    },
  },
  polygon: {
    arity: [3, Infinity],
    fn: (args) => shapeValue({ type: 'polygon', pts: args.map((a) => point(a, 'polygon')) }),
  },

  midpoint: {
    arity: fixed(1, 2),
    fn: (args) => {
      if (args.length === 1) {
        const s = args[0];
        if (s?.kind === 'shape' && s.shape.type === 'segment') return pointValue(mul(add(s.shape.a, s.shape.b), 0.5));
        throw new MathError('midpoint needs two points, or a segment');
      }
      return pointValue(mul(add(point(args[0], 'midpoint'), point(args[1], 'midpoint')), 0.5));
    },
  },
  /** the foot of the perpendicular from P to a line */
  foot: {
    arity: fixed(2),
    fn: ([p, l]) => {
      const P = point(p, 'foot');
      const s = straight(l, 'foot');
      const d = sub(s.b, s.a);
      return pointValue(add(s.a, mul(d, dot(sub(P, s.a), d) / dot(d, d))));
    },
  },
  perpendicular: {
    arity: fixed(2),
    fn: ([l, p]) => {
      const s = straight(l, 'perpendicular');
      const P = point(p, 'perpendicular');
      return shapeValue({ type: 'line', a: P, b: add(P, perp(sub(s.b, s.a))) });
    },
  },
  parallel: {
    arity: fixed(2),
    fn: ([l, p]) => {
      const s = straight(l, 'parallel');
      const P = point(p, 'parallel');
      return shapeValue({ type: 'line', a: P, b: add(P, sub(s.b, s.a)) });
    },
  },
  perpbisector: {
    arity: fixed(1, 2),
    fn: (args) => {
      let a: Pt;
      let b: Pt;
      if (args.length === 1) {
        const s = straight(args[0], 'perpbisector');
        [a, b] = [s.a, s.b];
      } else {
        [a, b] = [point(args[0], 'perpbisector'), point(args[1], 'perpbisector')];
      }
      distinct(a, b, 'perpbisector');
      const m = mul(add(a, b), 0.5);
      return shapeValue({ type: 'line', a: m, b: add(m, perp(sub(b, a))) });
    },
  },
  /** the bisector of angle ABC: a ray from B */
  bisector: {
    arity: fixed(3),
    fn: ([pa, pb, pc]) => {
      const [A, B, C] = [point(pa, 'bisector'), point(pb, 'bisector'), point(pc, 'bisector')];
      distinct(A, B, 'bisector');
      distinct(C, B, 'bisector');
      const u = sub(A, B);
      const v = sub(C, B);
      let dir = add(mul(u, 1 / len(u)), mul(v, 1 / len(v)));
      if (len(dir) < EPS) dir = perp(u); // a straight angle: the bisector is perpendicular
      return shapeValue({ type: 'ray', a: B, b: add(B, dir) });
    },
  },
  /** tangent(circle, P[, k]): at P on the circle, or the k-th of the two from P outside it */
  tangent: {
    arity: fixed(2, 3),
    fn: ([c, p, k]) => {
      const circle = circleOf(c, 'tangent');
      const P = point(p, 'tangent');
      const d = dist(P, circle.c);
      if (Math.abs(d - circle.r) <= 1e-9 * Math.max(1, circle.r)) {
        return shapeValue({ type: 'line', a: P, b: add(P, perp(sub(P, circle.c))) });
      }
      if (d < circle.r) throw new MathError('The point is inside the circle, so there is no tangent through it');
      const phi = Math.atan2(P.y - circle.c.y, P.x - circle.c.x);
      const alpha = Math.acos(circle.r / d);
      const touch = [phi - alpha, phi + alpha]
        .map((t) => add(circle.c, { x: circle.r * Math.cos(t), y: circle.r * Math.sin(t) }))
        .sort((p, q) => p.x - q.x || p.y - q.y);
      return shapeValue({ type: 'line', a: P, b: pick(touch, k, 'tangent', '') });
    },
  },
  /** intersect(a, b[, k]): the k-th meeting point, left to right */
  intersect: {
    arity: fixed(2, 3),
    fn: ([a, b, k]) => {
      const shape = (v: Value | undefined): Shape => {
        if (v?.kind === 'shape') return v.shape;
        throw new MathError(`intersect needs two figures (lines, segments, rays, circles, polygons)${v ? `, not ${kindName(v)}` : ''}`);
      };
      return pointValue(pick(intersections(shape(a), shape(b)), k, 'intersect', "These figures don't meet"));
    },
  },

  /** angle(A, B, C): the angle at B, between 0 and 180° */
  angle: {
    arity: fixed(3),
    fn: ([pa, pb, pc], s) => {
      const [A, B, C] = [point(pa, 'angle'), point(pb, 'angle'), point(pc, 'angle')];
      distinct(A, B, 'angle');
      distinct(C, B, 'angle');
      const u = sub(A, B);
      const v = sub(C, B);
      return num(clean(Math.atan2(Math.abs(crossZ(u, v)), dot(u, v)) / toRad(s)));
    },
  },
  distance: {
    arity: fixed(2),
    fn: ([p, q]) => {
      const P = point(p, 'distance');
      if (q?.kind === 'point') return num(clean(dist(P, q)));
      if (q?.kind === 'shape' && q.shape.type === 'circle') return num(clean(Math.abs(dist(P, q.shape.c) - q.shape.r)));
      return num(clean(distanceToStraight(P, straight(q, 'distance'))));
    },
  },
  length: {
    arity: fixed(1),
    fn: ([s]) => {
      if (s?.kind === 'shape' && s.shape.type === 'segment') return num(clean(dist(s.shape.a, s.shape.b)));
      throw new MathError('length needs a segment; use perimeter for polygons and circles');
    },
  },
  area: {
    arity: fixed(1),
    fn: ([s]) => {
      if (s?.kind === 'shape' && s.shape.type === 'polygon') return num(clean(polygonArea(s.shape.pts)));
      if (s?.kind === 'shape' && s.shape.type === 'circle') return num(Math.PI * s.shape.r ** 2);
      throw new MathError('area needs a polygon or a circle');
    },
  },
  perimeter: {
    arity: fixed(1),
    fn: ([s]) => {
      if (s?.kind === 'shape' && s.shape.type === 'polygon') {
        return num(clean(s.shape.pts.reduce((sum, p, k, all) => sum + dist(p, all[(k + 1) % all.length]!), 0)));
      }
      if (s?.kind === 'shape' && s.shape.type === 'circle') return num(2 * Math.PI * s.shape.r);
      throw new MathError('perimeter needs a polygon or a circle');
    },
  },
  center: { arity: fixed(1), fn: ([c]) => pointValue(circleOf(c, 'center').c) },
  radius: { arity: fixed(1), fn: ([c]) => num(circleOf(c, 'radius').r) },

  /** rotate(P, C, θ): P turned about C, counterclockwise, in the angle unit */
  rotate: {
    arity: fixed(3),
    fn: ([p, c, t], s) => {
      const P = point(p, 'rotate');
      const C = point(c, 'rotate');
      const a = real(t, 'rotate') * toRad(s);
      const v = sub(P, C);
      return pointValue(add(C, { x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) }));
    },
  },
  /** reflect(P, Q) through a point, reflect(P, line) across a line */
  reflect: {
    arity: fixed(2),
    fn: ([p, m]) => {
      const P = point(p, 'reflect');
      if (m?.kind === 'point') return pointValue(sub(mul(m, 2), P));
      const s = straight(m, 'reflect');
      const d = sub(s.b, s.a);
      const foot = add(s.a, mul(d, dot(sub(P, s.a), d) / dot(d, d)));
      return pointValue(sub(mul(foot, 2), P));
    },
  },
};

/** Plain-text summary of a figure: segment, length 5. */
export function describeShape(s: Shape, fmt: (n: number) => string): string {
  switch (s.type) {
    case 'segment':
      return `segment, length ${fmt(dist(s.a, s.b))}`;
    case 'ray':
      return `ray from (${fmt(s.a.x)}, ${fmt(s.a.y)})`;
    case 'line': {
      const d = sub(s.b, s.a);
      if (Math.abs(d.x) < EPS) return `line x = ${fmt(s.a.x)}`;
      const m = d.y / d.x;
      const c = s.a.y - m * s.a.x;
      return `line y = ${fmt(m)}x ${c < 0 ? '-' : '+'} ${fmt(Math.abs(c))}`;
    }
    case 'circle':
      return `circle, centre (${fmt(s.c.x)}, ${fmt(s.c.y)}), radius ${fmt(s.r)}`;
    case 'polygon':
      return `polygon, area ${fmt(polygonArea(s.pts))}`;
  }
}

