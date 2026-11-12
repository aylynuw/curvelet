import { printNode, type Node } from '@math/engine';
import { div, id, mul, neg, num } from './ast';
import { Q, sqrtQ } from './rational';

/** A number found numerically, written exactly when it is a recognisable value (3/4, π/2, √2, 2e). */
export interface Num {
  value: number;
  /** in the calculator's syntax, for typesetting: 3/4, pi/2, sqrt(2) */
  text: string;
  /** true when no exact form matched and `text` is a rounded decimal */
  approx: boolean;
}

function fraction(v: number, tol: number, maxDen = 12): Q | null {
  for (let d = 1; d <= maxDen; d++) {
    const n = Math.round(v * d);
    if (Math.abs(n / d - v) <= tol * Math.max(1, Math.abs(v)) && Math.abs(n) < 1e9) return new Q(n, d);
  }
  return null;
}

/** k·name, k a fraction: π/2, −3π/4, 2e */
function times(q: Q, name: string): Node {
  const abs = new Q(Math.abs(q.n), q.d);
  const top = abs.n === 1 ? id(name) : mul(num(abs.n), id(name));
  const node = abs.d === 1 ? top : div(top, num(abs.d));
  return q.n < 0 ? neg(node) : node;
}

export function nice(v: number, tol = 1e-9): Num {
  if (!Number.isFinite(v)) return { value: v, text: v > 0 ? 'inf' : '-inf', approx: false };
  if (Math.abs(v) < tol) return { value: 0, text: '0', approx: false };
  const exact = (node: Node, value: number): Num => ({ value, text: printNode(node), approx: false });
  const q = fraction(v, tol);
  if (q) return exact(q.node(), q.value);
  const p = fraction(v / Math.PI, tol);
  if (p) return exact(times(p, 'pi'), p.value * Math.PI);
  // √ forms: v² is a simple fraction
  const sq = fraction(v * v, tol, 36);
  if (sq && sq.n > 0 && sq.n <= 400) {
    const { c, m } = sqrtQ(sq);
    if (m > 1) {
      const root: Node = { type: 'call', name: 'sqrt', args: [num(m)], primes: 0 };
      const absC = c;
      const top = absC.n === 1 ? root : mul(num(absC.n), root);
      const node = absC.d === 1 ? top : div(top, num(absC.d));
      return exact(v < 0 ? neg(node) : node, v);
    }
  }
  const e = fraction(v / Math.E, tol);
  if (e) return exact(times(e, 'e'), e.value * Math.E);
  return { value: v, text: String(Number(v.toPrecision(4))), approx: true };
}
