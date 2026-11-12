import type { Mask, RelOp } from '@math/engine';
import { fromPx, fromPy, toPx, toPy, type Viewport } from './viewport';

/** A polyline as a flat [x0, y0, x1, y1, …] list in screen pixels. */
export type Polyline = number[];

/** Keep coordinates within a sane range around the screen (canvas and SVG misbehave far out). */
const clampY = (v: Viewport, py: number) => Math.max(-v.height * 4, Math.min(v.height * 5, py));
const clampX = (v: Viewport, px: number) => Math.max(-v.width * 4, Math.min(v.width * 5, px));

/**
 * y = f(x) (dir 'y') or x = g(y) (dir 'x'), sampled once per pixel along the
 * free axis. The line breaks where the function is undefined, and at jumps
 * like tan's asymptotes: a big jump whose midpoint isn't between its ends.
 */
export function sampleCurve(fn: (t: number) => number, dir: 'y' | 'x', v: Viewport, step = 1, mask?: Mask, cuts: number[] = [], holes: number[] = []): Polyline[] {
  const along = dir === 'y' ? v.width : v.height;
  const across = dir === 'y' ? v.height : v.width;
  const tAt = (s: number) => (dir === 'y' ? fromPx(v, s) : fromPy(v, s));
  const out = (value: number) => (dir === 'y' ? clampY(v, toPy(v, value)) : clampX(v, toPx(v, value)));
  const point = (s: number, value: number): [number, number] => (dir === 'y' ? [s, out(value)] : [out(value), s]);

  const lines: Polyline[] = [];
  let line: Polyline = [];
  let prev: { s: number; value: number } | null = null;
  const end = () => {
    if (line.length >= 4) lines.push(line);
    line = [];
  };

  // the screen positions of the breaks (a jump in cases), in order
  const breaks = cuts.map((c) => ({ c, s: dir === 'y' ? toPx(v, c) : toPy(v, c) })).sort((a, b) => a.s - b.s);
  let nextBreak = 0;
  for (let s = 0; s <= along + step / 2; s += step) {
    const t = tAt(s);
    // a break between the last sample and this one: finish the line at the boundary, start again past it
    let onBreak = false;
    while (nextBreak < breaks.length && breaks[nextBreak]!.s <= s + 1e-6) {
      const b = breaks[nextBreak++]!;
      if (b.s < 0) continue;
      onBreak ||= Math.abs(b.s - s) <= 1e-6;
      // farther than the 1e-9 that conditions allow for rounding, so each side reads its own case
      const near = 1e-7 * Math.max(1, Math.abs(b.c));
      const [before, after] = dir === 'y' ? [b.c - near, b.c + near] : [b.c + near, b.c - near];
      const end1 = fn(before);
      if (prev && Number.isFinite(end1)) line.push(...point(b.s, end1));
      end();
      prev = null;
      const start = fn(after);
      if (Number.isFinite(start)) {
        line.push(...point(b.s, start));
        prev = { s: b.s, value: start };
      }
    }
    // the sample sits on the break itself: it was drawn as the two ends
    if (onBreak) continue;
    let value = fn(t);
    // a point lifted off the curve (a hole): the line runs through, the dots show the point
    for (const h of holes) {
      const near = 1e-7 * Math.max(1, Math.abs(h));
      if (Math.abs(t - h) <= near) {
        const beside = fn(t + 2 * near);
        value = Number.isFinite(beside) ? beside : fn(t - 2 * near);
      }
    }
    // outside the line's {…} conditions: not drawn
    if (mask && Number.isFinite(value) && !(dir === 'y' ? mask(t, value, NaN) : mask(value, t, NaN))) value = NaN;
    if (!Number.isFinite(value)) {
      end();
      prev = null;
      continue;
    }
    if (prev) {
      const jump = Math.abs(out(value) - out(prev.value));
      if (jump > across / 2) {
        const mid = fn(tAt((s + prev.s) / 2));
        const lo = Math.min(value, prev.value);
        const hi = Math.max(value, prev.value);
        // a continuous steep stretch has its midpoint between the ends; a pole does not
        if (!(Number.isFinite(mid) && mid >= lo && mid <= hi)) end();
      }
    }
    line.push(...point(s, value));
    prev = { s, value };
  }
  end();
  return lines;
}

/** Fill polygons for y > f(x), y < f(x), x > g(y), x < g(y): each curve piece closed against the screen edge. */
export function curveRegions(lines: Polyline[], dir: 'y' | 'x', op: RelOp, v: Viewport): Polyline[] {
  if (op === '=') return [];
  const greater = op === '>' || op === '>=';
  return lines.map((pts) => {
    const n = pts.length;
    if (dir === 'y') {
      const edge = greater ? 0 : v.height; // y bigger is up the screen
      return [...pts, pts[n - 2]!, edge, pts[0]!, edge];
    }
    const edge = greater ? v.width : 0;
    return [...pts, edge, pts[n - 1]!, edge, pts[1]!];
  });
}

/**
 * Marching squares on a grid of `cell`-pixel squares: the line segments where
 * F(x, y) = 0, as [x1, y1, x2, y2] in screen pixels. Cells around a pole (the
 * value at the centre is bigger than at every corner) are skipped.
 */
export function contour(F: (x: number, y: number) => number, v: Viewport, cell = 4, mask?: Mask): number[] {
  const cols = Math.ceil(v.width / cell) + 1;
  const rows = Math.ceil(v.height / cell) + 1;
  const val = new Float64Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const y = fromPy(v, j * cell);
    for (let i = 0; i < cols; i++) val[j * cols + i] = F(fromPx(v, i * cell), y);
  }

  const segs: number[] = [];
  const lerp = (a: number, b: number) => (a === b ? 0.5 : a / (a - b));
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = val[j * cols + i]!; // top left
      const b = val[j * cols + i + 1]!; // top right
      const c = val[(j + 1) * cols + i + 1]!; // bottom right
      const d = val[(j + 1) * cols + i]!; // bottom left
      if (!(Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && Number.isFinite(d))) continue;
      const code = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
      if (code === 0 || code === 15) continue;

      const x0 = i * cell;
      const y0 = j * cell;
      const cx = fromPx(v, x0 + cell / 2);
      const cy = fromPy(v, y0 + cell / 2);
      if (mask && !mask(cx, cy, NaN)) continue;
      const centre = F(cx, cy);
      if (!Number.isFinite(centre) || Math.abs(centre) > Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) * 1.5) continue;

      // crossing points on each edge
      const top: [number, number] = [x0 + lerp(a, b) * cell, y0];
      const right: [number, number] = [x0 + cell, y0 + lerp(b, c) * cell];
      const bottom: [number, number] = [x0 + lerp(d, c) * cell, y0 + cell];
      const left: [number, number] = [x0, y0 + lerp(a, d) * cell];
      const add = (p: [number, number], q: [number, number]) => segs.push(p[0], p[1], q[0], q[1]);
      switch (code) {
        case 1: case 14: add(left, bottom); break;
        case 2: case 13: add(bottom, right); break;
        case 3: case 12: add(left, right); break;
        case 4: case 11: add(top, right); break;
        case 6: case 9: add(top, bottom); break;
        case 7: case 8: add(left, top); break;
        case 5: // saddle: decide by the centre
          if (centre > 0) { add(left, top); add(bottom, right); } else { add(left, bottom); add(top, right); }
          break;
        case 10:
          if (centre > 0) { add(left, bottom); add(top, right); } else { add(left, top); add(bottom, right); }
          break;
      }
    }
  }
  return segs;
}

/** Where F(x, y) op 0 holds, as horizontal runs of `cell`-pixel squares: [x, y, w, h] rectangles. */
export function implicitRegion(F: (x: number, y: number) => number, op: RelOp, v: Viewport, cell = 4, mask?: Mask): number[] {
  if (op === '=') return [];
  const holds = (f: number) => (op === '<' ? f < 0 : op === '<=' ? f <= 0 : op === '>' ? f > 0 : f >= 0);
  const rects: number[] = [];
  for (let y0 = 0; y0 < v.height; y0 += cell) {
    const y = fromPy(v, y0 + cell / 2);
    let start = -1;
    for (let x0 = 0; x0 <= v.width; x0 += cell) {
      const x = fromPx(v, x0 + cell / 2);
      const inside = x0 < v.width && holds(F(x, y)) && (!mask || mask(x, y, NaN));
      if (inside && start < 0) start = x0;
      if (!inside && start >= 0) {
        rects.push(start, y0, x0 - start, cell);
        start = -1;
      }
    }
  }
  return rects;
}

/**
 * (x(t), y(t)) for t in [tmin, tmax]. Starts from evenly spaced steps and
 * adds points between any two that land more than 4 px apart, so tight
 * turns stay smooth; breaks where undefined, masked, or at a jump bigger
 * than the screen (an asymptote).
 */
export function sampleParametric(
  fx: (t: number) => number,
  fy: (t: number) => number,
  tmin: number,
  tmax: number,
  v: Viewport,
  mask?: Mask,
  steps = 1500,
): Polyline[] {
  const at = (t: number): [number, number] | null => {
    const x = fx(t);
    const y = fy(t);
    if (!Number.isFinite(x) || !Number.isFinite(y) || (mask && !mask(x, y, t))) return null;
    return [clampX(v, toPx(v, x)), clampY(v, toPy(v, y))];
  };
  const far = Math.max(v.width, v.height);
  const lines: Polyline[] = [];
  let line: Polyline = [];
  const end = () => {
    if (line.length >= 4) lines.push(line);
    line = [];
  };
  // fill in between two samples until neighbours are within 4 px (at most 6 halvings)
  const refine = (t0: number, p0: [number, number], t1: number, p1: [number, number], depth: number) => {
    const gap = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (gap <= 4 || depth >= 6) {
      if (gap > far) end(); // a jump across the screen: don't join it
      line.push(p1[0], p1[1]);
      return;
    }
    const tm = (t0 + t1) / 2;
    const pm = at(tm);
    if (!pm) {
      end();
      line.push(p1[0], p1[1]);
      return;
    }
    refine(t0, p0, tm, pm, depth + 1);
    refine(tm, pm, t1, p1, depth + 1);
  };

  let prev: { t: number; p: [number, number] } | null = null;
  for (let k = 0; k <= steps; k++) {
    const t = tmin + ((tmax - tmin) * k) / steps;
    const p = at(t);
    if (!p) {
      end();
      prev = null;
      continue;
    }
    if (prev) refine(prev.t, prev.p, t, p, 0);
    else line.push(p[0], p[1]);
    prev = { t, p };
  }
  end();
  return lines;
}
