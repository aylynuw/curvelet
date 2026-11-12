import type { Graphable } from '@math/engine';
import type { Scene } from './scene';
import { xmax, xmin, ymax, ymin, type Viewport } from './viewport';

export type PoiKind = 'x-intercept' | 'y-intercept' | 'max' | 'min' | 'intersection';

/** A point worth marking on a curve: where it crosses an axis, turns, or meets another curve. */
export interface Poi {
  x: number;
  y: number;
  kind: PoiKind;
  /** the curve, and for an intersection the other curve too */
  ids: string[];
}

type Explicit = Extract<Graphable, { kind: 'curve' }> & { dir: 'y' };

/** y = f(x) with the line's {…} conditions applied: NaN outside them. */
function realFn(g: Explicit): (x: number) => number {
  return (x) => {
    const y = g.fn(x);
    return Number.isFinite(y) && (!g.mask || g.mask(x, y, NaN)) ? y : NaN;
  };
}

/** Bisection to 1e-13 of the bracket, for a sign change of h on [a, b]. */
function bisect(h: (x: number) => number, a: number, b: number): number {
  let fa = h(a);
  for (let k = 0; k < 80 && b - a > 1e-13 * Math.max(1, Math.abs(a)); k++) {
    const m = (a + b) / 2;
    const fm = h(m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) {
      a = m;
      fa = fm;
    } else b = m;
  }
  return (a + b) / 2;
}

/** Golden-section search for the extreme of f on [a, b] (max when sign = 1, min when -1). */
function golden(f: (x: number) => number, a: number, b: number, sign: 1 | -1): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a);
  let d = a + g * (b - a);
  for (let k = 0; k < 90 && b - a > 1e-12 * Math.max(1, Math.abs(a)); k++) {
    if (sign * f(c) > sign * f(d)) b = d;
    else a = c;
    c = b - g * (b - a);
    d = a + g * (b - a);
  }
  return (a + b) / 2;
}

/** Drop rounding noise: 1.9999999999999 → 2, 1e-17 → 0. */
export function tidy(n: number): number {
  const r = Math.round(n);
  const t = Math.abs(n - r) < 1e-9 * Math.max(1, Math.abs(n)) ? r : Number(n.toPrecision(12));
  return t === 0 ? 0 : t; // no -0
}

/** Roots of h in view: sign changes on a 2 px grid, refined; poles (huge values either side) are skipped. */
function roots(h: (x: number) => number, v: Viewport): number[] {
  const out: number[] = [];
  const span = (ymax(v) - ymin(v)) * 4;
  const step = 2 / v.scale;
  let x0 = xmin(v);
  let y0 = h(x0);
  for (let x1 = x0 + step; x1 <= xmax(v) + step / 2; x1 += step) {
    const y1 = h(x1);
    if (Number.isFinite(y0) && Number.isFinite(y1)) {
      if (y0 === 0) out.push(x0);
      else if (y0 * y1 < 0 && Math.abs(y0) < span && Math.abs(y1) < span) {
        const r = bisect(h, x0, x1);
        const hr = Math.abs(h(r));
        // across a pole the sign also flips, but h never gets near 0
        if (hr < 1e-6 * Math.max(1, Math.abs(y0), Math.abs(y1))) out.push(r);
      }
    }
    x0 = x1;
    y0 = y1;
  }
  return out;
}

function extrema(f: (x: number) => number, v: Viewport): { x: number; kind: 'max' | 'min' }[] {
  const out: { x: number; kind: 'max' | 'min' }[] = [];
  const step = 2 / v.scale;
  const xs: number[] = [];
  for (let x = xmin(v); x <= xmax(v); x += step) xs.push(x);
  const ys = xs.map(f);
  for (let k = 1; k + 1 < xs.length; k++) {
    const [a, b, c] = [ys[k - 1]!, ys[k]!, ys[k + 1]!];
    if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c))) continue;
    const kind = b > a && b >= c ? 'max' : b < a && b <= c ? 'min' : null;
    if (!kind) continue;
    let x = golden(f, xs[k - 1]!, xs[k + 1]!, kind === 'max' ? 1 : -1);
    // comparing values only pins x to ~1e-8 (the curve is flat there); the slope's sign change pins it far closer
    const h = 1e-6 * Math.max(1, Math.abs(x));
    const slope = (t: number) => (f(t + h) - f(t - h)) / (2 * h);
    const lo = Math.max(xs[k - 1]!, x - step);
    const hi = Math.min(xs[k + 1]!, x + step);
    if (Number.isFinite(slope(lo)) && Number.isFinite(slope(hi)) && slope(lo) * slope(hi) < 0) x = bisect(slope, lo, hi);
    // corners of |x| and similar are fine; jumps (a pole between samples) are not
    if (Math.abs(f(x) - b) > (ymax(v) - ymin(v))) continue;
    out.push({ x, kind });
  }
  return out;
}

/**
 * Points of interest on the selected curve within the view: x- and y-intercepts,
 * local maxima and minima, and intersections with the other y = f(x) curves.
 * Only y = f(x) curves are analysed.
 */
export function pointsOfInterest(graphables: Graphable[], v: Viewport, selected: string): Poi[] {
  const g = graphables.find((k) => k.id === selected);
  if (!g || g.kind !== 'curve' || g.dir !== 'y') return [];
  const f = realFn(g as Explicit);
  const pois: Poi[] = [];
  const add = (x: number, kind: PoiKind, ids = [g.id]) => {
    const y = f(x);
    if (!Number.isFinite(y)) return;
    const p = { x: tidy(x), y: tidy(y), kind, ids };
    if (pois.some((q) => q.kind === kind && Math.abs(q.x - p.x) < 1e-7 && q.ids.join() === ids.join())) return;
    pois.push(p);
  };

  for (const x of roots(f, v)) add(x, 'x-intercept');
  for (const e of extrema(f, v)) {
    add(e.x, e.kind);
    // a curve that touches the axis at a turning point (x^2) has a root there too
    if (Math.abs(f(e.x)) < 1e-9) add(e.x, 'x-intercept');
  }
  if (xmin(v) <= 0 && xmax(v) >= 0) add(0, 'y-intercept');
  for (const other of graphables) {
    if (other.id === g.id || other.kind !== 'curve' || other.dir !== 'y') continue;
    const h = realFn(other as Explicit);
    for (const x of roots((t) => f(t) - h(t), v)) add(x, 'intersection', [g.id, other.id]);
  }
  return pois.sort((a, b) => a.x - b.x || a.kind.localeCompare(b.kind));
}

/** The curve drawn nearest to a screen point, if within `reach` pixels. */
export function curveAt(scene: Scene, px: number, py: number, reach = 12): string | null {
  let best: { id: string; d: number } | null = null;
  const consider = (id: string, x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
    const d = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    if (d <= reach && (!best || d < best.d)) best = { id, d };
  };
  for (const c of scene.curves) {
    for (const line of c.lines) {
      for (let k = 0; k + 3 < line.length; k += 2) consider(c.id, line[k]!, line[k + 1]!, line[k + 2]!, line[k + 3]!);
    }
    for (let k = 0; k + 3 < c.segs.length; k += 4) consider(c.id, c.segs[k]!, c.segs[k + 1]!, c.segs[k + 2]!, c.segs[k + 3]!);
  }
  // a field's marks and a cobweb's staircase belong to their line ("3:marks" → "3")
  return (best as { id: string } | null)?.id.split(':')[0] ?? null;
}
