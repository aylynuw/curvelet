import { MathError, type BinaryOp } from './ast';
import { Complex } from './complex';
import { formatComplex, formatReal } from './format';
import { describeShape, type Pt, type Shape } from './geometry';
import { fitFormula, type Fit } from './stats';
import { matMul, matPowInt, type Matrix } from './matrix';

/**
 * Everything an expression can evaluate to.
 *  - num: a real or complex number; `base` asks for display in base 2/8/16/…
 *  - bool: the result of isprime(n) and similar
 *  - list: [1, 2, 3]; also used as a vector by dot, cross, norm and A·v
 *  - matrix: [[1, 2], [3, 4]], stored row by row
 */
export type Value =
  | { kind: 'num'; z: Complex; base?: number }
  | { kind: 'bool'; b: boolean }
  | { kind: 'list'; items: Complex[] }
  | ({ kind: 'matrix' } & Matrix)
  /** a point (x, y) with real coordinates */
  | { kind: 'point'; x: number; y: number }
  /** a figure: segment, line, ray, circle, polygon */
  | { kind: 'shape'; shape: Shape }
  /** a fitted model from linreg, expreg, …; calling it like f(3) evaluates it */
  | { kind: 'fit'; fit: Fit }
  /** data points from points(xs, ys), drawn as a scatter plot */
  | { kind: 'points'; pts: Pt[] };

export const num = (z: Complex | number): Value => ({ kind: 'num', z: typeof z === 'number' ? new Complex(z) : z });
export const list = (items: Complex[]): Value => ({ kind: 'list', items });
export const matrix = (m: Matrix): Value => ({ kind: 'matrix', ...m });

const KIND_NAME = { num: 'a number', bool: 'true/false', list: 'a list', matrix: 'a matrix', point: 'a point' } as const;
export const kindName = (v: Value): string =>
  v.kind === 'shape' ? `a ${v.shape.type}` : v.kind === 'fit' ? 'a fitted model' : v.kind === 'points' ? 'a set of points' : KIND_NAME[v.kind];

export function asNumber(v: Value, what: string): Complex {
  if (v.kind !== 'num') throw new MathError(`${what} needs a number, not ${kindName(v)}`);
  return v.z;
}

/** Every complex number inside a value (for checks like "is everything real?"). */
export function scalars(v: Value): Complex[] {
  switch (v.kind) {
    case 'num': return [v.z];
    case 'bool': return [];
    case 'list': return v.items;
    case 'matrix': return v.data;
    case 'point': return [];
    case 'shape':
    case 'fit':
    case 'points':
      return [];
  }
}

function scalarOp(op: BinaryOp, a: Complex, b: Complex): Complex {
  switch (op) {
    case '+': return a.add(b);
    case '-': return a.sub(b);
    case '*': return a.mul(b);
    case '/': return a.div(b);
    case '^': return a.pow(b);
  }
}

/**
 * Arithmetic between values. Numbers combine with lists and matrices entry by entry;
 * lists combine entry by entry; matrices follow linear algebra (A·B, A·v, A^n).
 * `pow` lets the evaluator substitute its real-mode power rule.
 */
export function binary(
  op: BinaryOp,
  a: Value,
  b: Value,
  pow: (x: Complex, y: Complex) => Complex = (x, y) => x.pow(y),
): Value {
  const f = (x: Complex, y: Complex) => (op === '^' ? pow(x, y) : scalarOp(op, x, y));
  if (a.kind === 'bool' || b.kind === 'bool') throw new MathError(`Can't do arithmetic with true/false`);
  for (const v of [a, b]) {
    if (v.kind === 'shape' || v.kind === 'fit' || v.kind === 'points') throw new MathError(`Can't do arithmetic with ${kindName(v)}`);
  }
  if (a.kind === 'point' || b.kind === 'point') return pointArithmetic(op, a, b);

  if (a.kind === 'num' && b.kind === 'num') return num(f(a.z, b.z));

  if (a.kind === 'list' || b.kind === 'list') {
    if (a.kind === 'matrix' && b.kind === 'list' && op === '*') {
      const col = matMul(a, { rows: b.items.length, cols: 1, data: b.items });
      return list(col.data);
    }
    if (a.kind === 'matrix' || b.kind === 'matrix') {
      throw new MathError(`Can't combine a matrix and a list with ${op}`);
    }
    if (a.kind === 'list' && b.kind === 'list') {
      if (a.items.length !== b.items.length) {
        throw new MathError(`Lists have different lengths (${a.items.length} and ${b.items.length})`);
      }
      return list(a.items.map((x, k) => f(x, b.items[k]!)));
    }
    if (a.kind === 'list') return list(a.items.map((x) => f(x, (b as { z: Complex }).z)));
    return list((b as { items: Complex[] }).items.map((y) => f((a as { z: Complex }).z, y)));
  }

  // at least one matrix, the other a matrix or a number
  if (a.kind === 'matrix' && b.kind === 'matrix') {
    if (op === '*') return matrix(matMul(a, b));
    if (op === '+' || op === '-') {
      if (a.rows !== b.rows || a.cols !== b.cols) {
        throw new MathError(`Matrix sizes differ (${a.rows}×${a.cols} and ${b.rows}×${b.cols})`);
      }
      return matrix({ rows: a.rows, cols: a.cols, data: a.data.map((x, k) => f(x, b.data[k]!)) });
    }
    throw new MathError(op === '/' ? 'Matrices can\'t be divided: use inv(B)' : `Can't raise a matrix to a matrix`);
  }
  if (a.kind === 'matrix' && b.kind === 'num') {
    if (op === '^') {
      if (!b.z.isReal() || !Number.isInteger(b.z.re)) throw new MathError('A matrix power needs a whole number');
      return matrix(matPowInt(a, b.z.re));
    }
    if (op === '*' || op === '/') return matrix({ ...a, data: a.data.map((x) => f(x, b.z)) });
    throw new MathError(`Can't ${op === '+' ? 'add a number to' : 'subtract a number from'} a matrix`);
  }
  if (a.kind === 'num' && b.kind === 'matrix' && op === '*') {
    return matrix({ ...b, data: b.data.map((y) => a.z.mul(y)) });
  }
  throw new MathError(`Can't combine ${kindName(a)} and ${kindName(b)} with ${op}`);
}

/** Points as vectors: P + Q, P - Q, 2P, P/2 */
function pointArithmetic(op: BinaryOp, a: Value, b: Value): Value {
  const scalar = (v: Value) => (v.kind === 'num' && v.z.isReal() ? v.z.re : null);
  if (a.kind === 'point' && b.kind === 'point' && (op === '+' || op === '-')) {
    const s = op === '+' ? 1 : -1;
    return { kind: 'point', x: a.x + s * b.x, y: a.y + s * b.y };
  }
  if (a.kind === 'point' && scalar(b) !== null && (op === '*' || op === '/')) {
    const k = op === '*' ? scalar(b)! : 1 / scalar(b)!;
    return { kind: 'point', x: a.x * k, y: a.y * k };
  }
  if (b.kind === 'point' && scalar(a) !== null && op === '*') {
    return { kind: 'point', x: b.x * scalar(a)!, y: b.y * scalar(a)! };
  }
  throw new MathError(`Points can be added, subtracted and scaled by a number, not combined with ${op} like this`);
}

export function negate(v: Value): Value {
  switch (v.kind) {
    case 'num': return num(v.z.neg());
    case 'list': return list(v.items.map((z) => z.neg()));
    case 'matrix': return matrix({ ...v, data: v.data.map((z) => z.neg()) });
    case 'bool': throw new MathError(`Can't negate true/false`);
    case 'point': return { kind: 'point', x: -v.x, y: -v.y };
    case 'shape':
    case 'fit':
    case 'points':
      throw new MathError(`Can't negate ${kindName(v)}`);
  }
}

/** Apply a number → number function to a number, or to each entry of a list. */
export function mapScalar(v: Value, fn: (z: Complex) => Complex, what: string): Value {
  if (v.kind === 'num') return num(fn(v.z));
  if (v.kind === 'list') return list(v.items.map(fn));
  throw new MathError(`${what} works on numbers and lists, not ${kindName(v)}`);
}

export function valuesEqual(a: Value, b: Value): boolean {
  if (a.kind === 'bool' || b.kind === 'bool') return a.kind === 'bool' && b.kind === 'bool' && a.b === b.b;
  for (const k of ['shape', 'fit', 'points'] as const) {
    if (a.kind === k || b.kind === k) return a.kind === b.kind && JSON.stringify(a) === JSON.stringify(b);
  }
  if (a.kind === 'point' || b.kind === 'point') {
    return a.kind === 'point' && b.kind === 'point' && Math.abs(a.x - b.x) <= 1e-12 && Math.abs(a.y - b.y) <= 1e-12;
  }
  const close = (x: Complex, y: Complex) => x.sub(y).abs() <= 1e-12 * Math.max(1, x.abs(), y.abs());
  if (a.kind === 'num' && b.kind === 'num') return close(a.z, b.z);
  if (a.kind === 'list' && b.kind === 'list') {
    return a.items.length === b.items.length && a.items.every((x, k) => close(x, b.items[k]!));
  }
  if (a.kind === 'matrix' && b.kind === 'matrix') {
    return a.rows === b.rows && a.cols === b.cols && a.data.every((x, k) => close(x, b.data[k]!));
  }
  return false;
}

const BASE_PREFIX: Record<number, string> = { 2: '0b', 8: '0o', 16: '0x' };

/** Plain-text form of a value: 3, 2 + 3i, 0xff, true, [1, 2], [[1, 2], [3, 4]] */
export function formatValue(v: Value, digits = 12): string {
  switch (v.kind) {
    case 'num': {
      if (v.base && v.z.isReal() && Number.isInteger(v.z.re)) {
        const digitsText = Math.abs(v.z.re).toString(v.base);
        const prefix = BASE_PREFIX[v.base];
        const body = prefix ? `${prefix}${digitsText}` : `(${digitsText})_${v.base}`;
        return v.z.re < 0 ? `-${body}` : body;
      }
      return formatComplex(v.z, digits);
    }
    case 'bool': return v.b ? 'true' : 'false';
    case 'point': return `(${formatReal(v.x, digits)}, ${formatReal(v.y, digits)})`;
    case 'shape': return describeShape(v.shape, (n) => formatReal(n, 6));
    case 'fit': return `y = ${fitFormula(v.fit, (n) => formatReal(n, 6))}, R² = ${formatReal(v.fit.r2, 6)}`;
    case 'points': return `${v.pts.length} point${v.pts.length === 1 ? '' : 's'}`;
    case 'list': return `[${v.items.map((z) => formatComplex(z, digits)).join(', ')}]`;
    case 'matrix': {
      const rows: string[] = [];
      for (let r = 0; r < v.rows; r++) {
        rows.push(`[${v.data.slice(r * v.cols, (r + 1) * v.cols).map((z) => formatComplex(z, digits)).join(', ')}]`);
      }
      return `[${rows.join(', ')}]`;
    }
  }
}
