import type { Graphable, Pt } from '@math/engine';
import type { Polyline } from './sample';
import { fromPx, fromPy, toPx, toPy, xmax, xmin, ymax, ymin, type Viewport } from './viewport';

type Field = Extract<Graphable, { kind: 'field' }>;
type F2 = (x: number, y: number) => number;

/** Grid spacing of the marks, in screen pixels. */
const SPACING = 28;

/**
 * The marks of a field, as screen segments: a short line with the slope
 * dy/dx at each grid point, or an arrow (longer where the field is stronger).
 */
export function fieldMarks(g: Field, v: Viewport): number[] {
  const segs: number[] = [];
  const cols = Math.floor(v.width / SPACING);
  const rows = Math.floor(v.height / SPACING);
  const ox = (v.width - (cols - 1) * SPACING) / 2;
  const oy = (v.height - (rows - 1) * SPACING) / 2;
  const at: { px: number; py: number; dx: number; dy: number; m: number }[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const px = ox + i * SPACING;
      const py = oy + j * SPACING;
      const x = fromPx(v, px);
      const y = fromPy(v, py);
      let dx: number;
      let dy: number;
      if (g.slope) {
        dx = 1;
        dy = g.slope(x, y);
      } else {
        dx = g.vector![0](x, y);
        dy = g.vector![1](x, y);
      }
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
      // plane direction to screen direction (y flips)
      at.push({ px, py, dx, dy: -dy, m: Math.hypot(dx, dy) });
    }
  }
  const strongest = Math.max(...at.map((a) => a.m), 1e-300);
  for (const a of at) {
    if (a.m === 0) continue;
    const ux = a.dx / Math.hypot(a.dx, a.dy);
    const uy = a.dy / Math.hypot(a.dx, a.dy);
    if (g.slope) {
      const h = SPACING * 0.32;
      segs.push(a.px - ux * h, a.py - uy * h, a.px + ux * h, a.py + uy * h);
    } else {
      const len = 7 + (SPACING * 0.62 - 7) * (a.m / strongest);
      const tx = a.px + (ux * len) / 2;
      const ty = a.py + (uy * len) / 2;
      segs.push(a.px - (ux * len) / 2, a.py - (uy * len) / 2, tx, ty);
      // the arrowhead: two short strokes back from the tip
      const head = 4;
      segs.push(tx, ty, tx - head * (ux - uy * 0.6), ty - head * (uy + ux * 0.6));
      segs.push(tx, ty, tx - head * (ux + uy * 0.6), ty - head * (uy - ux * 0.6));
    }
  }
  return segs;
}

/** One RK4 step for (x, y)' = F(x, y). */
function rk4(fx: F2, fy: F2, x: number, y: number, h: number): [number, number] {
  const k1x = fx(x, y);
  const k1y = fy(x, y);
  const k2x = fx(x + (h / 2) * k1x, y + (h / 2) * k1y);
  const k2y = fy(x + (h / 2) * k1x, y + (h / 2) * k1y);
  const k3x = fx(x + (h / 2) * k2x, y + (h / 2) * k2y);
  const k3y = fy(x + (h / 2) * k2x, y + (h / 2) * k2y);
  const k4x = fx(x + h * k3x, y + h * k3y);
  const k4y = fy(x + h * k3x, y + h * k3y);
  return [x + (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x), y + (h / 6) * (k1y + 2 * k2y + 2 * k3y + k4y)];
}

/**
 * The solution curve through a seed, followed both ways with RK4 at about 1.5 px
 * per step, until it leaves the view, stops (an equilibrium) or closes on itself.
 * Slope fields step in x; vector fields step along the curve at unit speed.
 */
export function solutionThrough(g: Field, seed: Pt, v: Viewport): Polyline {
  const step = 1.5 / v.scale;
  const margin = (40 / v.scale);
  const inside = (x: number, y: number) => x >= xmin(v) - margin && x <= xmax(v) + margin && y >= ymin(v) - margin && y <= ymax(v) + margin;
  let fx: F2;
  let fy: F2;
  if (g.slope) {
    fx = () => 1;
    fy = g.slope;
  } else {
    const [P, Q] = g.vector!;
    // unit speed, so steps are an even length along the curve
    fx = (x, y) => P(x, y) / Math.hypot(P(x, y), Q(x, y));
    fy = (x, y) => Q(x, y) / Math.hypot(P(x, y), Q(x, y));
  }
  const walk = (dir: 1 | -1): Pt[] => {
    const pts: Pt[] = [];
    let [x, y] = [seed.x, seed.y];
    for (let k = 0; k < 6000; k++) {
      const [nx, ny] = rk4(fx, fy, x, y, dir * step);
      if (!Number.isFinite(nx) || !Number.isFinite(ny) || !inside(nx, ny)) break;
      // a closed orbit: back near the seed after going some way round
      if (k > 60 && Math.hypot(nx - seed.x, ny - seed.y) < step) {
        pts.push(seed);
        break;
      }
      pts.push({ x: nx, y: ny });
      [x, y] = [nx, ny];
    }
    return pts;
  };
  const forward = walk(1);
  const closed = forward.length > 0 && forward[forward.length - 1] === seed;
  const backward = closed ? [] : walk(-1);
  const all = [...backward.reverse(), seed, ...forward];
  return all.flatMap((p) => [toPx(v, p.x), toPy(v, p.y)]);
}

/** cobweb(f, x0, n): from (x0, 0) up to the curve, across to y = x, up or down to the curve, … */
export function cobwebPath(f: (x: number) => number, x0: number, steps: number, v: Viewport): Polyline {
  const pts: Pt[] = [{ x: x0, y: 0 }];
  let x = x0;
  for (let k = 0; k < Math.min(steps, 2000); k++) {
    const y = f(x);
    if (!Number.isFinite(y) || Math.abs(y) > 1e6) break;
    pts.push({ x, y }, { x: y, y });
    x = y;
  }
  return pts.flatMap((p) => [toPx(v, p.x), toPy(v, p.y)]);
}
