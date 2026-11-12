import type { Node } from '@math/engine';
import { add, id, mul, neg, num, pow, sub } from './ast';
import { degree, divideRoot, divisors, ONE, polyAdd, polyAt, polyNode, polyScale, Q, sqrtQ, toPoly, ZERO, type Poly } from './rational';

export type EqRule =
  | 'given' | 'collect' | 'isolate' | 'divide' | 'identity' | 'contradiction'
  | 'factorOut' | 'factor' | 'zeroProduct' | 'squareRoot' | 'nthRoot'
  | 'formula' | 'discriminant' | 'formulaValues' | 'noReal' | 'complexRoots'
  | 'rationalRoot' | 'solutions' | 'unsolved';

/**
 * One line of working. `eqs` are the equations it shows (several are read
 * with "or"); `tex` replaces them where plain text can't say it (±).
 * `value` is the number the step names: what both sides are divided by, D,
 * the root that was tried.
 */
export interface EqStep {
  rule: EqRule;
  eqs: Node[];
  tex?: string;
  value?: Node;
}

export interface EqSteps {
  steps: EqStep[];
  /** the exact solutions found by the steps; null when the steps stop before the end */
  solutions: Node[] | null;
  /** every number is a solution (0 = 0) */
  all?: boolean;
}

const eq = (left: Node, right: Node): Node => ({ type: 'rel', op: '=', left, right });

/**
 * Working for `left = right` in x: polynomial equations up to degree 2 always,
 * higher degrees when a common factor, a two-term power or rational roots
 * bring them down. Anything else has no steps (`unsolved`).
 */
export function solveSteps(left: Node, right: Node, x: string, complex = false): EqSteps {
  const steps: EqStep[] = [{ rule: 'given', eqs: [eq(left, right)] }];
  const L = toPoly(left, x);
  const R = toPoly(right, x);
  if (!L || !R) {
    steps.push({ rule: 'unsolved', eqs: [] });
    return { steps, solutions: null };
  }
  const P = polyAdd(L, polyScale(R, new Q(-1)));
  const n = degree(P);
  const X = id(x);

  if (n <= 0) {
    steps.push({ rule: 'collect', eqs: [eq(polyNode(P, x), num(0))] });
    steps.push({ rule: n < 0 ? 'identity' : 'contradiction', eqs: [] });
    return n < 0 ? { steps, solutions: null, all: true } : { steps, solutions: [] };
  }

  if (n === 1) {
    // a x + b = c x + d → (a − c) x = d − b → x = (d − b)/(a − c)
    const a = P[1]!;
    const rhs = P[0]!.neg();
    const moved = !(degree(R) <= 0 && degree(L) === 1 && L[0]!.zero);
    if (moved) steps.push({ rule: 'isolate', eqs: [eq(polyNode([ZERO, a], x), rhs.node())] });
    const sol = rhs.div(a);
    if (!a.eq(ONE)) steps.push({ rule: 'divide', eqs: [eq(X, sol.node())], value: a.node() });
    steps.push({ rule: 'solutions', eqs: [eq(X, sol.node())] });
    return { steps, solutions: [sol.node()] };
  }

  // everything on one side, unless it already is
  const alreadyZero = degree(R) < 0;
  if (!alreadyZero) steps.push({ rule: 'collect', eqs: [eq(polyNode(P, x), num(0))] });
  const sols = solvePoly(P, x, complex, steps);
  if (sols) steps.push({ rule: 'solutions', eqs: sols.map((s) => eq(X, s)) });
  return { steps, solutions: sols };
}

/** p = 0, steps appended; the solutions, or null when no method fits. */
function solvePoly(p: Poly, x: string, complex: boolean, steps: EqStep[]): Node[] | null {
  const n = degree(p);
  const X = id(x);
  if (n === 1) {
    const sol = p[0]!.neg().div(p[1]!);
    return [sol.node()];
  }

  // a common factor x^k
  let k = 0;
  while (p[k]!.zero) k++;
  if (k > 0) {
    const rest = p.slice(k);
    const factor = k === 1 ? X : pow(X, num(k));
    steps.push({ rule: 'factorOut', eqs: [eq(mul(factor, group(polyNode(rest, x))), num(0))], value: factor });
    steps.push({ rule: 'zeroProduct', eqs: [eq(factor, num(0)), eq(polyNode(rest, x), num(0))] });
    const others = degree(rest) === 0 ? [] : solvePoly(rest, x, complex, steps);
    return others ? dedupe([num(0), ...others]) : null;
  }

  if (n === 2) return quadratic(p[2]!, p[1]!, p[0]!, x, complex, steps);

  // a x^n + c = 0: x^n = −c/a
  const middle = p.slice(1, n).every((q) => q.zero);
  if (middle) {
    const q = p[0]!.neg().div(p[n]!);
    steps.push({ rule: 'nthRoot', eqs: [eq(pow(X, num(n)), q.node())], value: num(n) });
    if (n % 2 === 0 && q.value < 0) return complex ? null : [];
    const exact = rootQ(q, n);
    const r = exact ?? (n === 3 ? { type: 'call', name: 'cbrt', args: [q.node()], primes: 0 } as Node : pow(q.node(), group({ type: 'binary', op: '/', left: num(1), right: num(n) })));
    return n % 2 === 0 ? [neg(r), r] : [r];
  }

  // a rational root r: then (x − r) is a factor
  const root = rationalRoot(p);
  if (root) {
    const rest = divideRoot(p, root);
    steps.push({ rule: 'rationalRoot', eqs: [eq(mul(polyNode([root.neg(), ONE], x), polyNode(rest, x)), num(0))], value: root.node() });
    const others = solvePoly(rest, x, complex, steps);
    return others ? dedupe([root.node(), ...others]) : null;
  }
  steps.push({ rule: 'unsolved', eqs: [] });
  return null;
}

function quadratic(a: Q, b: Q, c: Q, x: string, complex: boolean, steps: EqStep[]): Node[] | null {
  const X = id(x);
  const D = b.mul(b).sub(new Q(4).mul(a).mul(c));
  const twoA = new Q(2).mul(a);

  // a x² + c = 0: take the square root
  if (b.zero) {
    const q = c.neg().div(a);
    steps.push({ rule: 'squareRoot', eqs: [eq(pow(X, num(2)), q.node())] });
    if (q.value < 0) {
      if (!complex) {
        steps.push({ rule: 'noReal', eqs: [] });
        return [];
      }
      const r = surd(ZERO, sqrtQ(q.neg()), true);
      return [r.minus, r.plus];
    }
    const r = surd(ZERO, sqrtQ(q), false);
    return q.zero ? [num(0)] : [r.minus, r.plus];
  }

  // rational roots: factor
  if (D.value >= 0) {
    const s = sqrtQ(D);
    if (s.m === 1) {
      const r1 = b.neg().sub(s.c).div(twoA);
      const r2 = b.neg().add(s.c).div(twoA);
      // a root p/q gives the factor (q x − p): 2x² − 3x − 2 = (2x + 1)(x − 2)
      const lin = (r: Q) => polyNode([new Q(-r.n), new Q(r.d)], x);
      const rest = D.zero ? a.div(new Q(r1.d * r1.d)) : a.div(new Q(r1.d * r2.d));
      const lead = rest.eq(ONE) ? [] : [rest.node()];
      const factored = D.zero ? [...lead, pow(lin(r1), num(2))] : [...lead, lin(r1), lin(r2)];
      steps.push({ rule: 'factor', eqs: [eq(factored.reduce((p, q) => mul(p, q)), num(0))] });
      if (D.zero) return [r1.node()];
      steps.push({ rule: 'zeroProduct', eqs: [eq(lin(r1), num(0)), eq(lin(r2), num(0))] });
      return [r1.node(), r2.node()];
    }
  }

  // the quadratic formula
  steps.push({ rule: 'formula', eqs: [], tex: `${x}=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}` });
  steps.push({ rule: 'discriminant', eqs: [], value: D.node() });
  if (D.value < 0 && !complex) {
    steps.push({ rule: 'noReal', eqs: [], value: D.node() });
    return [];
  }
  steps.push({ rule: 'formulaValues', eqs: [], tex: `${x}=\\frac{${texQ(b.neg())}\\pm\\sqrt{${texQ(D)}}}{${texQ(twoA)}}` });
  const r = surd(b.neg().div(twoA), sqrtQ(D.value < 0 ? D.neg() : D), D.value < 0, twoA);
  if (D.value < 0) steps.push({ rule: 'complexRoots', eqs: [] });
  return [r.minus, r.plus];
}

/** p ± c√m (times i when imaginary), with c divided by `over` */
function surd(p: Q, root: { c: Q; m: number }, imaginary: boolean, over: Q = ONE) {
  const c = root.c.div(over.value < 0 ? over.neg() : over);
  const radical: Node | null = root.m === 1 ? null : { type: 'call', name: 'sqrt', args: [num(root.m)], primes: 0 };
  let part: Node = radical ? (c.eq(ONE) ? radical : c.d === 1 ? mul(c.node(), radical) : { type: 'binary', op: '/', left: c.n === 1 ? radical : mul(num(c.n), radical), right: num(c.d) }) : c.node();
  if (imaginary) part = mul(part, id('i'));
  if (p.zero) return { minus: neg(part), plus: part };
  return { minus: sub(p.node(), part), plus: add(p.node(), part) };
}

/** an exact n-th root of a rational, when there is one */
function rootQ(q: Q, n: number): Node | null {
  const r = (v: number) => {
    const s = Math.round(Math.sign(v) * Math.abs(v) ** (1 / n));
    return s ** n === v ? s : null;
  };
  const a = r(q.n);
  const b = r(q.d);
  if (a === null || b === null) return null;
  return new Q(a, b).node();
}

function rationalRoot(p: Poly): Q | null {
  // make the coefficients whole numbers first
  const lcm = p.reduce((m, q) => (m * q.d) / gcdN(m, q.d), 1);
  const ints = p.map((q) => (q.n * lcm) / q.d);
  const a0 = ints[0]!;
  const an = ints[degree(p)]!;
  if (Math.abs(a0) > 1e9 || Math.abs(an) > 1e9) return null;
  for (const num_ of divisors(a0)) {
    for (const den of divisors(an)) {
      for (const sign of [1, -1]) {
        const r = new Q(sign * num_, den);
        if (polyAt(p, r).zero) return r;
      }
    }
  }
  return null;
}

const gcdN = (a: number, b: number): number => (b ? gcdN(b, a % b) : Math.abs(a));
const group = (n: Node): Node => n;
const dedupe = (ns: Node[]) => {
  const seen = new Set<string>();
  return ns.filter((n) => {
    const k = JSON.stringify(n);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

function texQ(q: Q): string {
  if (q.d === 1) return String(q.n);
  return `${q.n < 0 ? '-' : ''}\\frac{${Math.abs(q.n)}}{${q.d}}`;
}
