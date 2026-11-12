/**
 * Where a curve with cases breaks, and the dots at its ends, the way a
 * textbook draws a piecewise function: ● where the boundary point is on the
 * graph, ○ where it is left out. Boundaries are where a condition's two sides
 * meet (x = 2 for x < 2, x = ±2 for x² < 4), found in the part of the axis on
 * screen; at each one the curve's values just left, just right and exactly on
 * it say whether there is a jump, a hole or nothing to mark.
 */
import type { Node } from './ast';

export interface Edges {
  /** where the curve stops and starts again */
  cuts: number[];
  /** t along the axis the curve runs on, v its value; open = ○ */
  dots: { t: number; v: number; open: boolean }[];
}

/** the comparisons in a node's cases, or none when it has no cases */
export function caseConditions(node: Node): Node[] {
  const out: Node[] = [];
  const walk = (n: Node, inCase: boolean) => {
    switch (n.type) {
      case 'rel':
        if (inCase) out.push(n);
        walk(n.left, false);
        walk(n.right, false);
        return;
      case 'call': {
        const cases = n.name === 'piecewise' || n.name === 'if';
        const joins = n.name === 'and' || n.name === 'or';
        n.args.forEach((a, k) => walk(a, (cases && (k % 2 === 0) && k < n.args.length - (n.args.length % 2)) || (joins && inCase)));
        return;
      }
      case 'unary':
      case 'abs':
      case 'factorial':
        walk(n.arg, false);
        return;
      case 'binary':
        walk(n.left, false);
        walk(n.right, false);
        return;
      case 'list':
        n.items.forEach((a) => walk(a, false));
        return;
      case 'tuple':
        n.items.forEach((a) => walk(a, false));
        return;
      default:
        return;
    }
  };
  walk(node, false);
  return out;
}

/**
 * The edges of a curve `fn` whose cases have the conditions `sides` (each a
 * function of t whose zeros are the boundaries).
 */
export function findEdges(fn: (t: number) => number, sides: ((t: number) => number)[], lo: number, hi: number): Edges {
  const roots: number[] = [];
  const N = 600;
  for (const g of sides) {
    let [t0, g0] = [lo, g(lo)];
    for (let k = 1; k <= N; k++) {
      const t1 = lo + ((hi - lo) * k) / N;
      const g1 = g(t1);
      if (g0 === 0) roots.push(t0);
      else if (Number.isFinite(g0) && Number.isFinite(g1) && g0 * g1 < 0) {
        // bisect to the boundary
        let [a, b, ga] = [t0, t1, g0];
        for (let it = 0; it < 80 && b - a > 1e-14 * Math.max(1, Math.abs(a)); it++) {
          const m = (a + b) / 2;
          const gm = g(m);
          if (gm === 0) {
            a = b = m;
            break;
          }
          if (gm * ga < 0) b = m;
          else [a, ga] = [m, gm];
        }
        roots.push(tidy((a + b) / 2));
      }
      [t0, g0] = [t1, g1];
    }
    if (g0 === 0) roots.push(t0);
  }
  const uniq = [...new Set(roots.map((r) => Math.round(r * 1e9) / 1e9))].sort((a, b) => a - b).map(tidy);
  const out: Edges = { cuts: [], dots: [] };
  for (const t of uniq) {
    const near = 1e-7 * Math.max(1, Math.abs(t));
    const [L, R, V] = [fn(t - near), fn(t + near), fn(t)];
    const scale = Math.max(1, ...[L, R, V].filter(Number.isFinite).map(Math.abs));
    const same = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-5 * scale;
    const jump = !(same(L, R) || (!Number.isFinite(L) && !Number.isFinite(R)));
    const hole = Number.isFinite(V) ? !same(V, L) && !same(V, R) : Number.isFinite(L) || Number.isFinite(R);
    if (!jump && !hole) continue;
    if (jump) out.cuts.push(t);
    if (Number.isFinite(V)) out.dots.push({ t, v: V, open: false });
    for (const S of [L, R]) {
      if (!Number.isFinite(S) || same(S, V) || out.dots.some((d) => d.t === t && same(d.v, S))) continue;
      out.dots.push({ t, v: S, open: true });
    }
  }
  return out;
}

/** a number within a hair of a simple fraction is that fraction (the boundary x = 2, not 1.9999999999) */
function tidy(v: number): number {
  for (let d = 1; d <= 64; d++) {
    const n = Math.round(v * d);
    if (Math.abs(v - n / d) < 1e-10 * Math.max(1, Math.abs(v))) return n / d;
  }
  return v;
}
