import type { Graphable } from '@math/engine';

export interface Range {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

/**
 * A window that shows the graph: y = f(x) over the current x range, whole
 * parametric and polar curves, points and scatter plots. The extreme 2% of
 * values at each end are ignored, so an asymptote (tan x, 1/x) doesn't flatten
 * everything else. Null when nothing gives a place to look.
 */
export function fitRange(graphables: Graphable[], x0: number, x1: number, y0: number, y1: number): Range | null {
  // sampled curves may be trimmed; points always count
  const xs: number[] = [];
  const ys: number[] = [];
  const fx: number[] = [];
  const fy: number[] = [];
  const add = (x: number, y: number, firm = false) => {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      (firm ? fx : xs).push(x);
      (firm ? fy : ys).push(y);
    }
  };
  const N = 400;
  for (const g of graphables) {
    if (g.kind === 'curve') {
      const [a, b] = g.dir === 'y' ? [x0, x1] : [y0, y1];
      for (let k = 0; k <= N; k++) {
        const t = a + ((b - a) * k) / N;
        const v = g.fn(t);
        if (g.dir === 'y') add(t, v);
        else add(v, t);
      }
    } else if (g.kind === 'parametric' || g.kind === 'polar') {
      for (let k = 0; k <= N; k++) {
        const t = g.tmin + ((g.tmax - g.tmin) * k) / N;
        if (g.kind === 'parametric') add(g.fx(t), g.fy(t));
        else {
          const r = g.fr(t);
          const a = t * g.unit;
          add(r * Math.cos(a), r * Math.sin(a));
        }
      }
    } else if (g.kind === 'shape') {
      // drawn shapes: their corners, ends and the box around a circle
      const s = g.shape;
      if (s.type === 'circle') {
        add(s.c.x - s.r, s.c.y - s.r, true);
        add(s.c.x + s.r, s.c.y + s.r, true);
      } else if (s.type === 'polygon' || s.type === 'path') for (const p of s.pts) add(p.x, p.y, true);
      else {
        add(s.a.x, s.a.y, true);
        add(s.b.x, s.b.y, true);
      }
    } else if (g.kind === 'point') add(g.x, g.y, true);
    else if (g.kind === 'scatter') for (const p of g.pts) add(p.x, p.y, true);
  }
  if (!xs.length && !fx.length) return null;
  const trim = (v: number[], firm: number[]): [number, number] => {
    const s = [...v].sort((a, b) => a - b);
    const cut = s.length > 50 ? Math.floor(s.length * 0.02) : 0;
    const lo = s.length ? [s[cut]!] : [];
    const hi = s.length ? [s[s.length - 1 - cut]!] : [];
    return [Math.min(...lo, ...firm), Math.max(...hi, ...firm)];
  };
  let [xa, xb] = trim(xs, fx);
  let [ya, yb] = trim(ys, fy);
  // a flat line or a single point still gets some room around it
  if (xb - xa < 1e-9) [xa, xb] = [xa - 1, xb + 1];
  if (yb - ya < 1e-9) [ya, yb] = [ya - 1, yb + 1];
  const px = (xb - xa) * 0.1;
  const py = (yb - ya) * 0.1;
  return { xmin: xa - px, xmax: xb + px, ymin: ya - py, ymax: yb + py };
}
