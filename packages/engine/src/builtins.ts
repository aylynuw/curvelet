import { MathError } from './ast';
import { COS_Q, Complex, SIN_Q, quarterTurnRad } from './complex';
import { determinant, identity, inverse, rank, rref, trace, transpose, type Matrix } from './matrix';
import { asNumber, kindName, list, matrix, num, type Value } from './value';

export type AngleUnit = 'rad' | 'deg';
export interface EvalSettings {
  angle: AngleUnit;
  /** false: results must be real numbers (sqrt(-1) is an error); true: complex results are allowed */
  complex: boolean;
}
export const DEFAULT_SETTINGS: EvalSettings = { angle: 'rad', complex: false };

interface Builtin {
  /** [min, max] number of arguments; max = Infinity for variadic */
  arity: [number, number];
  fn: (args: Complex[], s: EvalSettings) => Complex;
}

export const CONSTANTS: Record<string, Complex> = {
  pi: new Complex(Math.PI),
  tau: new Complex(2 * Math.PI),
  e: new Complex(Math.E),
  i: Complex.I,
  inf: new Complex(Infinity),
};

const DEG = Math.PI / 180;
const toRad = (z: Complex, s: EvalSettings) => (s.angle === 'deg' ? z.mul(new Complex(DEG)) : z);
const fromRad = (z: Complex, s: EvalSettings) => (s.angle === 'deg' ? z.div(new Complex(DEG)) : z);

/**
 * For a real angle that is a whole multiple of 90° (π/2), return the quarter-turn
 * index 0..3 so sin/cos/tan can return exact 0, ±1 instead of 1.2e-16.
 */
function quarterTurn(z: Complex, s: EvalSettings): number | null {
  if (!z.isReal()) return null;
  return s.angle === 'deg' ? quarterTurnRad(z.re, 90, true) : quarterTurnRad(z.re);
}
function sinExact(z: Complex, s: EvalSettings): Complex {
  const q = quarterTurn(z, s);
  return q === null ? toRad(z, s).sin() : new Complex(SIN_Q[q]!);
}
function cosExact(z: Complex, s: EvalSettings): Complex {
  const q = quarterTurn(z, s);
  return q === null ? toRad(z, s).cos() : new Complex(COS_Q[q]!);
}

function real(z: Complex, fname: string): number {
  if (!z.isReal()) throw new MathError(`${fname} needs real numbers`);
  return z.re;
}
function integer(z: Complex, fname: string): number {
  const x = real(z, fname);
  if (!Number.isInteger(x)) throw new MathError(`${fname} needs whole numbers`);
  return x;
}
const R = (x: number) => new Complex(x);

/**
 * Gamma function. Shifts x up to ≥ 15 with Γ(x) = Γ(x+n) / (x(x+1)…(x+n-1)),
 * then uses the Stirling series (coefficients B₂ₖ / (2k(2k-1))), accurate to double precision.
 */
export function gamma(x: number): number {
  if (Number.isInteger(x) && x <= 0) return NaN;
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  let divisor = 1;
  while (x < 15) {
    divisor *= x;
    x += 1;
  }
  const inv = 1 / x;
  const inv2 = inv * inv;
  const series = inv * (1 / 12 - inv2 * (1 / 360 - inv2 * (1 / 1260 - inv2 * (1 / 1680 - inv2 / 1188))));
  const lnGamma = (x - 0.5) * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI) + series;
  return Math.exp(lnGamma) / divisor;
}

export function factorial(x: number): number {
  if (Number.isInteger(x)) {
    if (x < 0) return NaN;
    if (x > 170) return Infinity;
    let r = 1;
    for (let k = 2; k <= x; k++) r *= k;
    return r;
  }
  return gamma(x + 1);
}

function gcd2(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

function nCr(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  r = Math.min(r, n - r);
  let result = 1;
  for (let k = 1; k <= r; k++) result = (result * (n - r + k)) / k;
  return Math.round(result);
}

/** Real cube root / odd root that keeps the sign: cbrt(-8) = -2 */
function realRoot(x: number, n: number): number {
  if (x < 0 && n % 2 === 1) return -Math.pow(-x, 1 / n);
  return Math.pow(x, 1 / n);
}

const unary = (fn: (z: Complex, s: EvalSettings) => Complex): Builtin => ({
  arity: [1, 1],
  fn: (a, s) => fn(a[0]!, s),
});

export const FUNCTIONS: Record<string, Builtin> = {
  sin: unary(sinExact),
  cos: unary(cosExact),
  tan: unary((z, s) => (quarterTurn(z, s) === null ? toRad(z, s).tan() : sinExact(z, s).div(cosExact(z, s)))),
  sec: unary((z, s) => Complex.ONE.div(cosExact(z, s))),
  csc: unary((z, s) => Complex.ONE.div(sinExact(z, s))),
  cot: unary((z, s) => cosExact(z, s).div(sinExact(z, s))),
  /** 30° is written degrees(30): an angle in the current unit */
  degrees: unary((z, s) => (s.angle === 'deg' ? z : z.mul(new Complex(DEG)))),
  arcsin: unary((z, s) => fromRad(z.asin(), s)),
  arccos: unary((z, s) => fromRad(z.acos(), s)),
  arctan: unary((z, s) => fromRad(z.atan(), s)),
  sinh: unary((z) => z.sinh()),
  cosh: unary((z) => z.cosh()),
  tanh: unary((z) => z.tanh()),
  exp: unary((z) => z.exp()),
  ln: unary((z) => z.log()),
  /** log(x) is base 10; log_2(x) etc. is handled in the evaluator */
  log: unary((z) => z.log().div(R(Math.LN10))),
  sqrt: unary((z) => z.sqrt()),
  cbrt: unary((z) => (z.isReal() ? R(Math.cbrt(z.re)) : z.pow(R(1 / 3)))),
  root: {
    arity: [2, 2],
    fn: ([x, n]) => {
      const k = integer(n!, 'root');
      if (k === 0) throw new MathError('root(x, 0) is undefined');
      return x!.isReal() && (x!.re >= 0 || k % 2 !== 0) ? R(realRoot(x!.re, k)) : x!.pow(R(1 / k));
    },
  },
  abs: unary((z) => R(z.abs())),
  floor: unary((z) => R(Math.floor(real(z, 'floor')))),
  ceil: unary((z) => R(Math.ceil(real(z, 'ceil')))),
  round: unary((z) => R(Math.round(real(z, 'round')))),
  sign: unary((z) => R(Math.sign(real(z, 'sign')))),
  min: { arity: [1, Infinity], fn: (a) => R(Math.min(...a.map((z) => real(z, 'min')))) },
  max: { arity: [1, Infinity], fn: (a) => R(Math.max(...a.map((z) => real(z, 'max')))) },
  gcd: { arity: [1, Infinity], fn: (a) => R(a.map((z) => integer(z, 'gcd')).reduce(gcd2)) },
  lcm: {
    arity: [1, Infinity],
    fn: (a) => R(a.map((z) => integer(z, 'lcm')).reduce((x, y) => (x === 0 || y === 0 ? 0 : Math.abs((x / gcd2(x, y)) * y)))),
  },
  /** mathematical mod: the result has the sign of the divisor, so mod(-7, 3) = 2 */
  mod: {
    arity: [2, 2],
    fn: ([a, b]) => {
      const x = real(a!, 'mod');
      const m = real(b!, 'mod');
      if (m === 0) throw new MathError('mod by 0 is undefined');
      return R(((x % m) + m) % m);
    },
  },
  nCr: {
    arity: [2, 2],
    fn: ([n, r]) => R(nCr(integer(n!, 'nCr'), integer(r!, 'nCr'))),
  },
  nPr: {
    arity: [2, 2],
    fn: ([n, r]) => {
      const nn = integer(n!, 'nPr');
      const rr = integer(r!, 'nPr');
      if (rr < 0 || rr > nn) return R(0);
      let result = 1;
      for (let k = 0; k < rr; k++) result *= nn - k;
      return R(result);
    },
  },
  factorial: unary((z) => R(factorial(real(z, 'factorial')))),
  re: unary((z) => R(z.re)),
  im: unary((z) => R(z.im)),
  arg: unary((z, s) => fromRad(R(z.arg()), s)),
  conj: unary((z) => z.conj()),
};

// alternative spellings
const ALIASES: Record<string, string> = { asin: 'arcsin', acos: 'arccos', atan: 'arctan', ncr: 'nCr', npr: 'nPr' };
for (const [alias, target] of Object.entries(ALIASES)) FUNCTIONS[alias] = FUNCTIONS[target]!;

/** log_2, log_10 → the base, or null */
export function logBase(name: string): number | null {
  const m = /^log_(\d+)$/.exec(name);
  return m ? Number(m[1]) : null;
}

export function isBuiltinName(name: string): boolean {
  return name in CONSTANTS || name in FUNCTIONS || name in VALUE_FUNCTIONS || logBase(name) !== null;
}

// -----------------------------------------------------------------------------
// Functions on whole values: matrices, vectors, number theory, number bases

export interface ValueBuiltin {
  arity: [number, number];
  fn: (args: Value[], s: EvalSettings) => Value;
}

function asMatrix(v: Value, fname: string): Matrix {
  if (v.kind === 'matrix') return v;
  if (v.kind === 'list') return { rows: 1, cols: v.items.length, data: v.items };
  throw new MathError(`${fname} needs a matrix, not ${kindName(v)}`);
}
function asVector(v: Value, fname: string): Complex[] {
  if (v.kind === 'list') return v.items;
  throw new MathError(`${fname} needs a list like [1, 2, 3], not ${kindName(v)}`);
}
function wholeNumber(v: Value, fname: string, min = -Infinity): number {
  const n = integer(asNumber(v, fname), fname);
  if (n < min) throw new MathError(`${fname} needs a whole number of at least ${min}`);
  if (!Number.isSafeInteger(n)) throw new MathError(`${fname}: the number is too large to be exact`);
  return n;
}

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  if (n < 4) return true;
  if (n % 2 === 0 || n % 3 === 0) return false;
  for (let k = 5; k * k <= n; k += 6) if (n % k === 0 || n % (k + 2) === 0) return false;
  return true;
}

export function primeFactors(n: number): number[] {
  const factors: number[] = [];
  for (const p of [2, 3]) while (n % p === 0) { factors.push(p); n /= p; }
  for (let k = 5; k * k <= n; k += 6) {
    for (const p of [k, k + 2]) while (n % p === 0) { factors.push(p); n /= p; }
  }
  if (n > 1) factors.push(n);
  return factors;
}

const toBase = (base: number) => (v: Value, fname: string): Value => {
  const n = wholeNumber(v, fname);
  return { kind: 'num', z: new Complex(n), base };
};

export const VALUE_FUNCTIONS: Record<string, ValueBuiltin> = {
  det: { arity: [1, 1], fn: ([m]) => num(determinant(asMatrix(m!, 'det'))) },
  inv: { arity: [1, 1], fn: ([m]) => matrix(inverse(asMatrix(m!, 'inv'))) },
  transpose: { arity: [1, 1], fn: ([m]) => matrix(transpose(asMatrix(m!, 'transpose'))) },
  rank: { arity: [1, 1], fn: ([m]) => num(rank(asMatrix(m!, 'rank'))) },
  rref: { arity: [1, 1], fn: ([m]) => matrix(rref(asMatrix(m!, 'rref'))) },
  trace: { arity: [1, 1], fn: ([m]) => num(trace(asMatrix(m!, 'trace'))) },
  identity: { arity: [1, 1], fn: ([n]) => matrix(identity(wholeNumber(n!, 'identity', 1))) },

  dot: {
    arity: [2, 2],
    fn: ([a, b]) => {
      const u = asVector(a!, 'dot');
      const v = asVector(b!, 'dot');
      if (u.length !== v.length) throw new MathError(`dot needs lists of the same length (${u.length} and ${v.length})`);
      return num(u.reduce((acc, x, k) => acc.add(x.mul(v[k]!)), Complex.ZERO));
    },
  },
  cross: {
    arity: [2, 2],
    fn: ([a, b]) => {
      const u = asVector(a!, 'cross');
      const v = asVector(b!, 'cross');
      if (u.length !== 3 || v.length !== 3) throw new MathError('cross needs two lists of length 3');
      const [u1, u2, u3] = u as [Complex, Complex, Complex];
      const [v1, v2, v3] = v as [Complex, Complex, Complex];
      return list([u2.mul(v3).sub(u3.mul(v2)), u3.mul(v1).sub(u1.mul(v3)), u1.mul(v2).sub(u2.mul(v1))]);
    },
  },
  norm: {
    arity: [1, 1],
    fn: ([a]) => {
      const v = a!;
      if (v.kind === 'num') return num(v.z.abs());
      return num(Math.hypot(...asVector(v, 'norm').map((z) => z.abs())));
    },
  },

  isprime: { arity: [1, 1], fn: ([n]) => ({ kind: 'bool', b: isPrime(wholeNumber(n!, 'isprime')) }) },
  primefactors: {
    arity: [1, 1],
    fn: ([n]) => list(primeFactors(wholeNumber(n!, 'primefactors', 2)).map((p) => new Complex(p))),
  },
  divisors: {
    arity: [1, 1],
    fn: ([v]) => {
      const n = wholeNumber(v!, 'divisors', 1);
      let divs = [1];
      const counts = new Map<number, number>();
      for (const p of primeFactors(n)) counts.set(p, (counts.get(p) ?? 0) + 1);
      for (const [p, k] of counts) {
        const next: number[] = [];
        for (const d of divs) for (let e = 0, pe = 1; e <= k; e++, pe *= p) next.push(d * pe);
        divs = next;
      }
      return list(divs.sort((a, b) => a - b).map((d) => new Complex(d)));
    },
  },

  bin: { arity: [1, 1], fn: ([n]) => toBase(2)(n!, 'bin') },
  oct: { arity: [1, 1], fn: ([n]) => toBase(8)(n!, 'oct') },
  hex: { arity: [1, 1], fn: ([n]) => toBase(16)(n!, 'hex') },
  dec: { arity: [1, 1], fn: ([n]) => num(wholeNumber(n!, 'dec')) },
  base: {
    arity: [2, 2],
    fn: ([n, b]) => {
      const radix = wholeNumber(b!, 'base', 2);
      if (radix > 36) throw new MathError('base goes up to 36');
      return toBase(radix)(n!, 'base');
    },
  },
};
