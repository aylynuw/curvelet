import type { Node } from '@math/engine';
import { div, gcd, id, mul, neg, num, pow } from './ast';
import { NoSteps } from './derivative';

/** An exact fraction n/d, d > 0, in lowest terms. Exam numbers stay well inside the safe integer range. */
export class Q {
  readonly n: number;
  readonly d: number;
  constructor(n: number, d = 1) {
    if (d === 0) throw new NoSteps('division by zero');
    if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw new NoSteps('numbers too large for exact steps');
    const g = gcd(Math.abs(n), Math.abs(d)) || 1;
    const s = d < 0 ? -1 : 1;
    this.n = (s * n) / g || 0;
    this.d = (s * d) / g;
  }
  static of(v: number): Q {
    if (Number.isInteger(v)) return new Q(v);
    // a decimal as typed (0.25, 1.5): the nearest fraction with a small denominator
    let [h0, h1, k0, k1] = [0, 1, 1, 0];
    let x = v;
    for (let i = 0; i < 20; i++) {
      const a = Math.floor(x);
      [h0, h1] = [h1, a * h1 + h0];
      [k0, k1] = [k1, a * k1 + k0];
      if (Math.abs(h1 / k1 - v) < 1e-12 * Math.max(1, Math.abs(v))) return new Q(h1, k1);
      x = 1 / (x - a);
      if (!Number.isFinite(x) || k1 > 1e7) break;
    }
    throw new NoSteps('not an exact number');
  }
  add(o: Q) {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Q) {
    return new Q(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Q) {
    return new Q(this.n * o.n, this.d * o.d);
  }
  div(o: Q) {
    return new Q(this.n * o.d, this.d * o.n);
  }
  neg() {
    return new Q(-this.n, this.d);
  }
  get zero() {
    return this.n === 0;
  }
  get value() {
    return this.n / this.d;
  }
  eq(o: Q) {
    return this.n === o.n && this.d === o.d;
  }
  /** as a tree: 3, −2, 3/4, −(3/4) */
  node(): Node {
    if (this.d === 1) return num(this.n);
    const f = div(num(Math.abs(this.n)), num(this.d));
    return this.n < 0 ? neg(f) : f;
  }
}

export const ZERO = new Q(0);
export const ONE = new Q(1);

/** A polynomial in one variable: coefficients by degree, exact. */
export type Poly = Q[];

export function degree(p: Poly): number {
  for (let k = p.length - 1; k >= 0; k--) if (!p[k]!.zero) return k;
  return -1;
}
const trim = (p: Poly): Poly => p.slice(0, Math.max(1, degree(p) + 1));
export const polyAdd = (a: Poly, b: Poly): Poly =>
  trim(Array.from({ length: Math.max(a.length, b.length) }, (_, k) => (a[k] ?? ZERO).add(b[k] ?? ZERO)));
export const polyScale = (a: Poly, c: Q): Poly => trim(a.map((q) => q.mul(c)));
export function polyMul(a: Poly, b: Poly): Poly {
  const out: Q[] = Array.from({ length: a.length + b.length - 1 }, () => ZERO);
  a.forEach((p, i) => b.forEach((q, j) => (out[i + j] = out[i + j]!.add(p.mul(q)))));
  return trim(out);
}

/** The expression as a polynomial in x with exact coefficients, or null when it isn't one. */
export function toPoly(node: Node, x: string): Poly | null {
  try {
    return walk(node);
  } catch (e) {
    if (e instanceof NoSteps) return null;
    throw e;
  }
  function walk(n: Node): Poly {
    switch (n.type) {
      case 'num':
        return [Q.of(n.value)];
      case 'ident':
        if (n.name === x) return [ZERO, ONE];
        throw new NoSteps('a name other than the variable');
      case 'unary':
        return polyScale(walk(n.arg), new Q(-1));
      case 'binary': {
        const l = walk(n.left);
        if (n.op === '^') {
          const e = walk(n.right);
          if (degree(e) > 0 || e[0]!.d !== 1 || e[0]!.n < 0 || e[0]!.n > 12) throw new NoSteps('not a whole-number power');
          let out: Poly = [ONE];
          for (let k = 0; k < e[0]!.n; k++) out = polyMul(out, l);
          return out;
        }
        const r = walk(n.right);
        if (n.op === '+') return polyAdd(l, r);
        if (n.op === '-') return polyAdd(l, polyScale(r, new Q(-1)));
        if (n.op === '*') return polyMul(l, r);
        if (degree(r) > 0 || r[0]!.zero) throw new NoSteps('dividing by an expression');
        return polyScale(l, ONE.div(r[0]!));
      }
      default:
        throw new NoSteps('not a polynomial');
    }
  }
}

/** a x^n + … + c as a tree, highest power first, signs written as subtraction. */
export function polyNode(p: Poly, x: string): Node {
  const terms: { positive: Node; negative: boolean }[] = [];
  for (let k = degree(p); k >= 0; k--) {
    const c = p[k]!;
    if (c.zero) continue;
    const abs = new Q(Math.abs(c.n), c.d);
    const v = k === 0 ? null : k === 1 ? id(x) : pow(id(x), num(k));
    const positive = v === null ? abs.node() : abs.eq(ONE) ? v : mul(abs.node(), v);
    terms.push({ positive, negative: c.n < 0 });
  }
  if (terms.length === 0) return num(0);
  let out: Node = terms[0]!.negative ? neg(terms[0]!.positive) : terms[0]!.positive;
  for (const t of terms.slice(1)) out = { type: 'binary', op: t.negative ? '-' : '+', left: out, right: t.positive };
  return out;
}

/** p(r) */
export function polyAt(p: Poly, r: Q): Q {
  let v = ZERO;
  for (let k = p.length - 1; k >= 0; k--) v = v.mul(r).add(p[k]!);
  return v;
}

/** p / (x − r) when r is a root */
export function divideRoot(p: Poly, r: Q): Poly {
  const n = degree(p);
  const out: Q[] = Array.from({ length: n }, () => ZERO);
  let carry = ZERO;
  for (let k = n; k >= 1; k--) {
    carry = carry.mul(r).add(p[k]!);
    out[k - 1] = carry;
  }
  return trim(out);
}

/** √q = c·√m with m square-free (√(9/8) = (3/4)√2). */
export function sqrtQ(q: Q): { c: Q; m: number } {
  if (q.zero) return { c: ZERO, m: 1 };
  // √(n/d) = √(n·d)/d
  let r = q.n * q.d;
  if (r < 0) throw new NoSteps('square root of a negative number');
  let outside = 1;
  for (let f = 2; f * f <= r; f++) {
    while (r % (f * f) === 0) {
      r /= f * f;
      outside *= f;
    }
  }
  return { c: new Q(outside, q.d), m: r };
}

/** the divisors of |n| */
export function divisors(n: number): number[] {
  n = Math.abs(n);
  const out: number[] = [];
  for (let k = 1; k * k <= n && k < 1e5; k++) {
    if (n % k === 0) {
      out.push(k);
      if (k * k !== n) out.push(n / k);
    }
  }
  return out.sort((a, b) => a - b);
}
