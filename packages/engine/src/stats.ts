import { MathError } from './ast';
import type { ValueBuiltin } from './builtins';
import { factorial } from './builtins';
import { kindName, num, type Value } from './value';

export type FitModel = 'linear' | 'poly' | 'exp' | 'log' | 'power';

/** A fitted model: y = model(x). `coefs` meaning depends on the model (see fitFormula). */
export interface Fit {
  model: FitModel;
  coefs: number[];
  r2: number;
}

// --- reading arguments ---------------------------------------------------------

function data(v: Value | undefined, fname: string, min = 1): number[] {
  if (v?.kind !== 'list') throw new MathError(`${fname} needs a list of numbers like [1, 2, 3]${v ? `, not ${kindName(v)}` : ''}`);
  const xs = v.items.map((z) => {
    if (!z.isReal()) throw new MathError(`${fname} needs real numbers`);
    return z.re;
  });
  if (xs.length < min) throw new MathError(`${fname} needs at least ${min} number${min === 1 ? '' : 's'}`);
  return xs;
}
function real(v: Value | undefined, fname: string): number {
  if (v?.kind === 'num' && v.z.isReal()) return v.z.re;
  throw new MathError(`${fname} needs a real number${v ? `, not ${kindName(v)}` : ''}`);
}
function whole(v: Value | undefined, fname: string, min = 0): number {
  const n = real(v, fname);
  if (!Number.isInteger(n) || n < min) throw new MathError(`${fname} needs a whole number of at least ${min} there`);
  return n;
}
function probability(v: Value | undefined, fname: string): number {
  const p = real(v, fname);
  if (p < 0 || p > 1) throw new MathError(`${fname} needs a probability between 0 and 1`);
  return p;
}
function pair(xv: Value | undefined, yv: Value | undefined, fname: string, min: number): [number[], number[]] {
  const xs = data(xv, fname, min);
  const ys = data(yv, fname, min);
  if (xs.length !== ys.length) throw new MathError(`${fname} needs two lists of the same length (${xs.length} and ${ys.length})`);
  return [xs, ys];
}

// --- descriptive statistics ------------------------------------------------------

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const product = (xs: number[]) => xs.reduce((p, x) => p * x, 1);
export const mean = (xs: number[]) => sum(xs) / xs.length;

/** Sum of squared deviations, two-pass for accuracy. */
function ss(xs: number[]): number {
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0);
}

/** Linear interpolation between order statistics (spreadsheets' QUANTILE / PERCENTILE.INC). */
export function quantile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  return s[lo]! + (h - lo) * ((s[Math.min(lo + 1, s.length - 1)] ?? s[lo]!) - s[lo]!);
}

// --- regression -------------------------------------------------------------------

/** Least squares for y ≈ Σ c_k x^k, k = 0..n, by the normal equations with pivoting. */
function polyFit(xs: number[], ys: number[], n: number): number[] {
  const m = n + 1;
  const A = Array.from({ length: m }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (j < m ? sum(xs.map((x) => x ** (i + j))) : sum(xs.map((x, k) => ys[k]! * x ** i)))));
  for (let c = 0; c < m; c++) {
    let best = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[best]![c]!)) best = r;
    if (Math.abs(A[best]![c]!) < 1e-12) throw new MathError('Not enough different x values for this fit');
    [A[c], A[best]] = [A[best]!, A[c]!];
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / A[c]![c]!;
      for (let j = c; j <= m; j++) A[r]![j]! -= f * A[c]![j]!;
    }
  }
  return A.map((row, i) => row[m]! / row[i]!);
}

export function evalFit(f: Fit, x: number): number {
  const [a, b] = f.coefs as [number, number];
  switch (f.model) {
    case 'linear': return a * x + b;
    case 'poly': return f.coefs.reduce((s, c, k) => s + c * x ** k, 0);
    case 'exp': return a * Math.exp(b * x);
    case 'log': return a + b * Math.log(x);
    case 'power': return a * x ** b;
  }
}

function withR2(model: FitModel, coefs: number[], xs: number[], ys: number[]): Value {
  const fit: Fit = { model, coefs: coefs.map(clean), r2: 0 };
  const res = sum(ys.map((y, k) => (y - evalFit(fit, xs[k]!)) ** 2));
  const tot = ss(ys);
  fit.r2 = tot === 0 ? 1 : clean(1 - res / tot);
  return { kind: 'fit', fit };
}

function clean(n: number): number {
  const r = Math.round(n);
  const v = Math.abs(n - r) < 1e-10 * Math.max(1, Math.abs(n)) ? r : Number(n.toPrecision(14));
  return v === 0 ? 0 : v;
}

/** The fitted formula in this engine's syntax: 2.1x + 0.3, 1.5e^(0.2x). */
export function fitFormula(f: Fit, fmt: (n: number) => string): string {
  const c = f.coefs;
  const term = (k: number, coef: number, first: boolean) => {
    const sign = coef < 0 ? (first ? '-' : ' - ') : first ? '' : ' + ';
    const mag = Math.abs(coef);
    const power = k === 0 ? '' : k === 1 ? 'x' : `x^${k}`;
    const number = k > 0 && mag === 1 ? '' : fmt(mag);
    return `${sign}${number}${power}`;
  };
  switch (f.model) {
    case 'linear':
    case 'poly': {
      const coefs = f.model === 'linear' ? [c[1]!, c[0]!] : c;
      const parts: string[] = [];
      for (let k = coefs.length - 1; k >= 0; k--) {
        if (coefs[k] === 0 && !(k === 0 && parts.length === 0)) continue;
        parts.push(term(k, coefs[k]!, parts.length === 0));
      }
      return parts.join('');
    }
    case 'exp': return `${fmt(c[0]!)}e^${c[1] === 1 ? 'x' : c[1] === -1 ? '(-x)' : `(${fmt(c[1]!)}x)`}`;
    case 'log': return `${fmt(c[0]!)} ${c[1]! < 0 ? '-' : '+'} ${fmt(Math.abs(c[1]!))}ln(x)`;
    case 'power': return `${fmt(c[0]!)}x^${c[1]! < 0 ? `(${fmt(c[1]!)})` : fmt(c[1]!)}`;
  }
}

// --- distributions -----------------------------------------------------------------

/** erf to about 1e-15: its series below 2, a continued fraction for erfc above. */
export function erf(x: number): number {
  if (x < 0) return -erf(-x);
  if (x > 27) return 1; // 1 − 10^-300 and beyond
  if (x < 2) {
    let term = x;
    let total = x;
    for (let n = 1; n < 200 && Math.abs(term) > 1e-17 * Math.abs(total); n++) {
      term *= (-x * x) / n;
      total += term / (2 * n + 1);
    }
    return (2 / Math.sqrt(Math.PI)) * total;
  }
  // erfc(x) = e^(-x²)/√π · 1/(x + 1/2/(x + 1/(x + 3/2/(x + …)))), by Lentz's method
  const tiny = 1e-300;
  let f = x;
  let C = x;
  let D = 0;
  for (let n = 1; n < 300; n++) {
    const a = n / 2;
    D = x + a * D;
    D = Math.abs(D) < tiny ? tiny : D;
    C = x + a / C;
    C = Math.abs(C) < tiny ? tiny : C;
    D = 1 / D;
    const delta = C * D;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return 1 - Math.exp(-x * x) / Math.sqrt(Math.PI) / f;
}

export const normalCdf = (x: number, mu = 0, sigma = 1) => 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
export const normalPdf = (x: number, mu = 0, sigma = 1) => Math.exp(-(((x - mu) / sigma) ** 2) / 2) / (sigma * Math.sqrt(2 * Math.PI));

/** The x with P(X ≤ x) = p, by bisection on the standard normal (exact to double precision). */
export function invNorm(p: number, mu = 0, sigma = 1): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let lo = -40;
  let hi = 40;
  for (let k = 0; k < 200 && hi - lo > 1e-15; k++) {
    const m = (lo + hi) / 2;
    if (normalCdf(m) < p) lo = m;
    else hi = m;
  }
  return mu + sigma * ((lo + hi) / 2);
}

const choose = (n: number, k: number) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let j = 1; j <= Math.min(k, n - k); j++) r = (r * (n - Math.min(k, n - k) + j)) / j;
  return r;
};
export const binomPdf = (n: number, p: number, k: number) => (k < 0 || k > n ? 0 : choose(n, k) * p ** k * (1 - p) ** (n - k));
export const poissonPdf = (lambda: number, k: number) => (k < 0 ? 0 : Math.exp(-lambda + k * Math.log(lambda) - Math.log(factorial(k))));

// --- the functions -------------------------------------------------------------------

const one = (fname: string, f: (xs: number[]) => number, min = 1): ValueBuiltin => ({
  arity: [1, 1],
  fn: ([v]) => num(clean(f(data(v, fname, min)))),
});

/** mu and sigma, default 0 and 1 */
function normalParams(args: Value[], from: number, fname: string): [number, number] {
  const mu = args[from] ? real(args[from], fname) : 0;
  const sigma = args[from + 1] ? real(args[from + 1], fname) : 1;
  if (!(sigma > 0)) throw new MathError(`${fname} needs a standard deviation greater than 0`);
  return [mu, sigma];
}

export const STATS_FUNCTIONS: Record<string, ValueBuiltin> = {
  mean: one('mean', mean),
  median: one('median', (xs) => quantile(xs, 0.5)),
  sum: one('sum', sum),
  /** prod([2, 3, 4]) = 24; prod(seq(k, k, 1, 5)) = 5! */
  prod: one('prod', product),
  count: one('count', (xs) => xs.length, 0),
  /** sample variance and standard deviation (n − 1), like spreadsheets' VAR.S / STDEV.S */
  var: one('var', (xs) => ss(xs) / (xs.length - 1), 2),
  stdev: one('stdev', (xs) => Math.sqrt(ss(xs) / (xs.length - 1)), 2),
  /** population variance and standard deviation (n), as in Korean middle-school 산포도 */
  pvar: one('pvar', (xs) => ss(xs) / xs.length),
  pstdev: one('pstdev', (xs) => Math.sqrt(ss(xs) / xs.length)),
  quantile: {
    arity: [2, 2],
    fn: ([v, p]) => num(clean(quantile(data(v, 'quantile'), probability(p, 'quantile')))),
  },
  corr: {
    arity: [2, 2],
    fn: ([a, b]) => {
      const [xs, ys] = pair(a, b, 'corr', 2);
      const mx = mean(xs);
      const my = mean(ys);
      const sxy = sum(xs.map((x, k) => (x - mx) * (ys[k]! - my)));
      const d = Math.sqrt(ss(xs) * ss(ys));
      if (d === 0) throw new MathError('corr is undefined when one list has no spread');
      return num(clean(sxy / d));
    },
  },
  /** points(xs, ys): pairs drawn as a scatter plot */
  points: {
    arity: [2, 2],
    fn: ([a, b]) => {
      const [xs, ys] = pair(a, b, 'points', 1);
      return { kind: 'points', pts: xs.map((x, k) => ({ x, y: ys[k]! })) };
    },
  },

  linreg: { arity: [2, 2], fn: ([a, b]) => { const [xs, ys] = pair(a, b, 'linreg', 2); const [c0, c1] = polyFit(xs, ys, 1); return withR2('linear', [c1!, c0!], xs, ys); } },
  quadreg: { arity: [2, 2], fn: ([a, b]) => { const [xs, ys] = pair(a, b, 'quadreg', 3); return withR2('poly', polyFit(xs, ys, 2), xs, ys); } },
  polyreg: {
    arity: [3, 3],
    fn: ([a, b, d]) => {
      const n = whole(d, 'polyreg', 1);
      if (n > 6) throw new MathError('polyreg goes up to degree 6');
      const [xs, ys] = pair(a, b, 'polyreg', n + 1);
      return withR2('poly', polyFit(xs, ys, n), xs, ys);
    },
  },
  /** y = a·e^(bx): a straight-line fit of ln y */
  expreg: {
    arity: [2, 2],
    fn: ([a, b]) => {
      const [xs, ys] = pair(a, b, 'expreg', 2);
      if (ys.some((y) => y <= 0)) throw new MathError('expreg needs every y above 0');
      const [c0, c1] = polyFit(xs, ys.map(Math.log), 1);
      return withR2('exp', [Math.exp(c0!), c1!], xs, ys);
    },
  },
  /** y = a + b·ln x */
  logreg: {
    arity: [2, 2],
    fn: ([a, b]) => {
      const [xs, ys] = pair(a, b, 'logreg', 2);
      if (xs.some((x) => x <= 0)) throw new MathError('logreg needs every x above 0');
      const [c0, c1] = polyFit(xs.map(Math.log), ys, 1);
      return withR2('log', [c0!, c1!], xs, ys);
    },
  },
  /** y = a·x^b: a straight-line fit of ln y against ln x */
  powreg: {
    arity: [2, 2],
    fn: ([a, b]) => {
      const [xs, ys] = pair(a, b, 'powreg', 2);
      if (xs.some((x) => x <= 0) || ys.some((y) => y <= 0)) throw new MathError('powreg needs every x and y above 0');
      const [c0, c1] = polyFit(xs.map(Math.log), ys.map(Math.log), 1);
      return withR2('power', [Math.exp(c0!), c1!], xs, ys);
    },
  },

  normalpdf: { arity: [1, 3], fn: (args) => num(normalPdf(real(args[0], 'normalpdf'), ...normalParams(args, 1, 'normalpdf'))) },
  /** normalcdf(a, b[, μ, σ]): P(a ≤ X ≤ b) */
  normalcdf: {
    arity: [2, 4],
    fn: (args) => {
      const [mu, sigma] = normalParams(args, 2, 'normalcdf');
      const a = real(args[0], 'normalcdf');
      const b = real(args[1], 'normalcdf');
      return num(clean(normalCdf(b, mu, sigma) - normalCdf(a, mu, sigma)));
    },
  },
  invnorm: { arity: [1, 3], fn: (args) => num(clean(invNorm(probability(args[0], 'invnorm'), ...normalParams(args, 1, 'invnorm')))) },
  /** binompdf(n, p, k): P(X = k) for X ~ B(n, p) */
  binompdf: {
    arity: [3, 3],
    fn: ([n, p, k]) => num(clean(binomPdf(whole(n, 'binompdf'), probability(p, 'binompdf'), whole(k, 'binompdf', -Infinity)))),
  },
  /** binomcdf(n, p, k): P(X ≤ k) */
  binomcdf: {
    arity: [3, 3],
    fn: ([n, p, k]) => {
      const N = whole(n, 'binomcdf');
      const P = probability(p, 'binomcdf');
      const K = Math.min(N, whole(k, 'binomcdf', -Infinity));
      let total = 0;
      for (let j = 0; j <= K; j++) total += binomPdf(N, P, j);
      return num(clean(Math.min(1, total)));
    },
  },
  poissonpdf: {
    arity: [2, 2],
    fn: ([l, k]) => {
      const lambda = real(l, 'poissonpdf');
      if (!(lambda > 0)) throw new MathError('poissonpdf needs λ greater than 0');
      return num(clean(poissonPdf(lambda, whole(k, 'poissonpdf', -Infinity))));
    },
  },
  poissoncdf: {
    arity: [2, 2],
    fn: ([l, k]) => {
      const lambda = real(l, 'poissoncdf');
      if (!(lambda > 0)) throw new MathError('poissoncdf needs λ greater than 0');
      let total = 0;
      for (let j = 0; j <= whole(k, 'poissoncdf', -Infinity); j++) total += poissonPdf(lambda, j);
      return num(clean(Math.min(1, total)));
    },
  },
};

// --- t and χ² -------------------------------------------------------------------------

/** ln Γ(x) for x > 0: shift up to 15, then the Stirling series (as in builtins' gamma). */
export function lnGamma(x: number): number {
  let shift = 0;
  while (x < 15) {
    shift += Math.log(x);
    x += 1;
  }
  const inv = 1 / x;
  const inv2 = inv * inv;
  const series = inv * (1 / 12 - inv2 * (1 / 360 - inv2 * (1 / 1260 - inv2 * (1 / 1680 - inv2 / 1188))));
  return (x - 0.5) * Math.log(x) - x + 0.5 * Math.log(2 * Math.PI) + series - shift;
}

/** Regularized lower incomplete gamma P(a, x): series below a + 1, continued fraction above. */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x === Infinity) return 1;
  const front = Math.exp(-x + a * Math.log(x) - lnGamma(a));
  if (x < a + 1) {
    let term = 1 / a;
    let total = term;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      total += term;
      if (Math.abs(term) < Math.abs(total) * 1e-16) break;
    }
    return Math.min(1, total * front);
  }
  // Q(a, x) by Lentz's method
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let n = 1; n < 1000; n++) {
    const an = -n * (n - a);
    b += 2;
    d = an * d + b;
    d = Math.abs(d) < tiny ? tiny : d;
    c = b + an / c;
    c = Math.abs(c) < tiny ? tiny : c;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.max(0, 1 - front * h);
}

/** Regularized incomplete beta I_x(a, b) by its continued fraction (with the symmetry for speed). */
export function betaI(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x > (a + 1) / (a + b + 2)) return 1 - betaI(b, a, 1 - x);
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  d = Math.abs(d) < tiny ? tiny : d;
  d = 1 / d;
  let h = d;
  for (let m = 1; m < 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    d = Math.abs(d) < tiny ? tiny : d;
    c = 1 + aa / c;
    c = Math.abs(c) < tiny ? tiny : c;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    d = Math.abs(d) < tiny ? tiny : d;
    c = 1 + aa / c;
    c = Math.abs(c) < tiny ? tiny : c;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return (front * h) / a;
}

export const tPdf = (t: number, nu: number) =>
  Math.exp(lnGamma((nu + 1) / 2) - lnGamma(nu / 2) - 0.5 * Math.log(nu * Math.PI) - ((nu + 1) / 2) * Math.log(1 + (t * t) / nu));

/** P(T ≤ t) for Student's t with nu degrees of freedom */
export function tCdf(t: number, nu: number): number {
  if (t === Infinity) return 1;
  if (t === -Infinity) return 0;
  const tail = 0.5 * betaI(nu / 2, 0.5, nu / (nu + t * t));
  return t >= 0 ? 1 - tail : tail;
}

export const chiSqPdf = (x: number, k: number) => (x <= 0 ? (x === 0 && k === 2 ? 0.5 : 0) : Math.exp((k / 2 - 1) * Math.log(x) - x / 2 - (k / 2) * Math.LN2 - lnGamma(k / 2)));
export const chiSqCdf = (x: number, k: number) => gammaP(k / 2, Math.max(0, x) / 2);

function dof(v: Value | undefined, fname: string): number {
  const n = real(v, fname);
  if (!(n > 0)) throw new MathError(`${fname} needs degrees of freedom greater than 0`);
  return n;
}

Object.assign(STATS_FUNCTIONS, {
  tpdf: { arity: [2, 2], fn: ([x, n]) => num(tPdf(real(x, 'tpdf'), dof(n, 'tpdf'))) },
  /** tcdf(a, b, ν): P(a ≤ T ≤ b) */
  tcdf: {
    arity: [3, 3],
    fn: ([a, b, n]) => {
      const nu = dof(n, 'tcdf');
      return num(clean(tCdf(real(b, 'tcdf'), nu) - tCdf(real(a, 'tcdf'), nu)));
    },
  },
  chisqpdf: { arity: [2, 2], fn: ([x, k]) => num(chiSqPdf(real(x, 'chisqpdf'), dof(k, 'chisqpdf'))) },
  /** chisqcdf(a, b, k): P(a ≤ X ≤ b) */
  chisqcdf: {
    arity: [3, 3],
    fn: ([a, b, k]) => {
      const kk = dof(k, 'chisqcdf');
      return num(clean(chiSqCdf(real(b, 'chisqcdf'), kk) - chiSqCdf(real(a, 'chisqcdf'), kk)));
    },
  },
} satisfies Record<string, ValueBuiltin>);
