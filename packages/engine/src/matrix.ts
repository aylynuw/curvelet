import { MathError } from './ast';
import { Complex } from './complex';

/** Row-major matrix of complex entries. */
export interface Matrix {
  rows: number;
  cols: number;
  data: Complex[];
}

const at = (m: Matrix, r: number, c: number) => m.data[r * m.cols + c]!;

/** Pivots smaller than this (relative to the largest entry) count as zero. */
function tolerance(m: Matrix): number {
  const largest = m.data.reduce((acc, z) => Math.max(acc, z.abs()), 0);
  return 1e-10 * Math.max(1, largest);
}

export function identity(n: number): Matrix {
  const data: Complex[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data.push(r === c ? Complex.ONE : Complex.ZERO);
  return { rows: n, cols: n, data };
}

export function transpose(m: Matrix): Matrix {
  const data: Complex[] = [];
  for (let c = 0; c < m.cols; c++) for (let r = 0; r < m.rows; r++) data.push(at(m, r, c));
  return { rows: m.cols, cols: m.rows, data };
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  if (a.cols !== b.rows) {
    throw new MathError(`Can't multiply ${a.rows}×${a.cols} by ${b.rows}×${b.cols}: inner sizes must match`);
  }
  const data: Complex[] = [];
  for (let r = 0; r < a.rows; r++) {
    for (let c = 0; c < b.cols; c++) {
      let sum = Complex.ZERO;
      for (let k = 0; k < a.cols; k++) sum = sum.add(at(a, r, k).mul(at(b, k, c)));
      data.push(sum);
    }
  }
  return { rows: a.rows, cols: b.cols, data };
}

function requireSquare(m: Matrix, what: string): void {
  if (m.rows !== m.cols) throw new MathError(`${what} needs a square matrix, not ${m.rows}×${m.cols}`);
}

export function matPowInt(m: Matrix, n: number): Matrix {
  requireSquare(m, 'A matrix power');
  let base = n < 0 ? inverse(m) : m;
  let k = Math.abs(n);
  let result = identity(m.rows);
  while (k > 0) {
    if (k & 1) result = matMul(result, base);
    base = matMul(base, base);
    k >>= 1;
  }
  return result;
}

/**
 * Gauss-Jordan elimination with partial pivoting.
 * Returns the reduced row echelon form, the pivot columns, and the determinant
 * factor (sign changes and pivot scalings) for square inputs.
 */
function eliminate(m: Matrix): { rref: Matrix; pivots: number[]; det: Complex } {
  const rows = m.rows;
  const cols = m.cols;
  const a = m.data.slice();
  const get = (r: number, c: number) => a[r * cols + c]!;
  const tol = tolerance(m);
  const pivots: number[] = [];
  let det = Complex.ONE;
  let r = 0;

  for (let c = 0; c < cols && r < rows; c++) {
    let best = r;
    for (let k = r + 1; k < rows; k++) if (get(k, c).abs() > get(best, c).abs()) best = k;
    if (get(best, c).abs() <= tol) {
      det = Complex.ZERO;
      continue;
    }
    if (best !== r) {
      for (let k = 0; k < cols; k++) [a[r * cols + k], a[best * cols + k]] = [get(best, k), get(r, k)];
      det = det.neg();
    }
    const pivot = get(r, c);
    det = det.mul(pivot);
    for (let k = 0; k < cols; k++) a[r * cols + k] = get(r, k).div(pivot);
    for (let k = 0; k < rows; k++) {
      if (k === r) continue;
      const factor = get(k, c);
      if (factor.abs() === 0) continue;
      for (let j = 0; j < cols; j++) a[k * cols + j] = get(k, j).sub(factor.mul(get(r, j)));
    }
    pivots.push(c);
    r++;
  }
  if (pivots.length < Math.min(rows, cols)) det = Complex.ZERO;
  // clean entries that are rounding noise
  const cleaned = a.map((z) => new Complex(Math.abs(z.re) <= tol ? 0 : z.re, Math.abs(z.im) <= tol ? 0 : z.im));
  return { rref: { rows, cols, data: cleaned }, pivots, det };
}

export function determinant(m: Matrix): Complex {
  requireSquare(m, 'det');
  return eliminate(m).det;
}

export function rref(m: Matrix): Matrix {
  return eliminate(m).rref;
}

export function rank(m: Matrix): number {
  return eliminate(m).pivots.length;
}

export function trace(m: Matrix): Complex {
  requireSquare(m, 'trace');
  let sum = Complex.ZERO;
  for (let k = 0; k < m.rows; k++) sum = sum.add(at(m, k, k));
  return sum;
}

export function inverse(m: Matrix): Matrix {
  requireSquare(m, 'inv');
  const n = m.rows;
  // eliminate [A | I]; A is invertible when its left half reduces to I
  const augmented: Complex[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) augmented.push(at(m, r, c));
    for (let c = 0; c < n; c++) augmented.push(r === c ? Complex.ONE : Complex.ZERO);
  }
  const { rref: reduced, pivots } = eliminate({ rows: n, cols: 2 * n, data: augmented });
  if (pivots.length < n || pivots[n - 1]! >= n) throw new MathError('This matrix has no inverse (its determinant is 0)');
  const data: Complex[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) data.push(at(reduced, r, n + c));
  return { rows: n, cols: n, data };
}
