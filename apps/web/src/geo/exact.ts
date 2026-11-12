/**
 * Exact values for figure measurements. Points placed on the grid have
 * rational coordinates, so a squared length, an area or a squared radius is
 * rational, and a length is a·√b / c. These are recovered from the float
 * coordinates (a fraction with a small denominator that matches to 1e-9) and
 * written as 3√2, √13/2, 7/3 or 4π; anything else falls back to a decimal.
 */
import type { GeoProps } from './props';

/** a·√b / c with b square-free, c > 0, gcd(a, c) = 1 */
export interface Exact {
  a: number;
  b: number;
  c: number;
}

const gcd = (x: number, y: number): number => {
  [x, y] = [Math.abs(x), Math.abs(y)];
  while (y) [x, y] = [y, x % y];
  return x;
};

/**
 * the fraction n/d (d ≤ 1000) equal to x, or null. The match must be very close: values worked out
 * from grid points are exact to about 1e-15, while an irrational length lands near some fraction
 * with a big denominator by chance.
 */
export function rational(x: number): { n: number; d: number } | null {
  if (!Number.isFinite(x)) return null;
  if (Math.abs(x - Math.round(x)) < 1e-11 * Math.max(1, Math.abs(x))) return { n: Math.round(x), d: 1 };
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let v = x;
  for (let i = 0; i < 24; i++) {
    const a = Math.floor(v);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (k1 > 1000) return null;
    if (Math.abs(h1 / k1 - x) < 1e-11 * Math.max(1, Math.abs(x))) return { n: h1, d: k1 };
    v = 1 / (v - a);
    if (!Number.isFinite(v)) break;
  }
  return null;
}

/** a rational as an Exact (b = 1) */
export function exactRational(x: number): Exact | null {
  const q = rational(x);
  return q ? { a: q.n, b: 1, c: q.d } : null;
}

/** √x for a rational x ≥ 0: √(n/d) = √(n·d)/d, with the square part taken out */
export function exactSqrt(x: number): Exact | null {
  const q = rational(x);
  if (!q || q.n < 0) return null;
  let m = q.n * q.d;
  if (!Number.isSafeInteger(m)) return null;
  let out = 1;
  for (let f = 2; f * f <= m; f++) while (m % (f * f) === 0) [m, out] = [m / (f * f), out * f];
  const g = gcd(out, q.d) || 1;
  return { a: out / g, b: m, c: q.d / g };
}

/** an Exact times a rational */
export function scale(e: Exact, n: number, d = 1): Exact {
  const [a, c] = [e.a * n, e.c * d];
  const g = gcd(a, c) || 1;
  return { a: a / g, b: e.b, c: c / g };
}

/** 3√2, √13/2, −7/3, 5 — and with π after the number: 4π, √2π/2 */
export function exactText(e: Exact, pi = false): string {
  const sign = e.a < 0 ? '−' : '';
  const a = Math.abs(e.a);
  if (a === 0) return '0';
  const root = e.b === 1 ? '' : `√${e.b}`;
  const lead = a === 1 && (root || pi) ? '' : String(a);
  const top = `${lead}${root}${pi ? 'π' : ''}`;
  return `${sign}${top}${e.c === 1 ? '' : `/${e.c}`}`;
}

/** A measured number: its value, and its exact form if it has one. `pi` means the value is (exact)·π. */
export interface Measure {
  value: number;
  exact: Exact | null;
  pi?: boolean;
  kind: 'length' | 'area' | 'angle';
  /** an angle's exact form as an inverse trig function, when its sides allow one */
  trig?: string;
}

/** the text for a measure, and whether it is only approximate (no exact form for the asked format) */
export function formatMeasure(m: Measure, p: Pick<GeoProps, 'format' | 'decimals' | 'unit'> & Partial<Pick<GeoProps, 'angleForm'>>): { text: string; approx: boolean } {
  /** `trim`: in exact view a value with no exact form drops trailing zeros (4.4, not 4.40) */
  const decimal = (trim = false) => {
    const d = Math.max(0, Math.min(4, Math.round(p.decimals)));
    const t = trim ? String(Number(m.value.toFixed(d))) : m.value.toFixed(d);
    return Object.is(Number(t), -0) ? (0).toFixed(trim ? 0 : d) : t.replace('-', '−');
  };
  let text: string;
  let approx = false;
  if (m.kind === 'angle') {
    const whole = m.exact && m.exact.c === 1 && m.exact.b === 1;
    if (!whole && p.format !== 'decimal' && p.angleForm === 'trig' && m.trig) return { text: m.trig, approx: false };
    text = `${m.exact && m.exact.c === 1 && m.exact.b === 1 && p.format !== 'decimal' ? m.exact.a : decimal(p.format !== 'decimal')}°`;
    return { text, approx: !m.exact && p.format !== 'decimal' };
  }
  const exactWanted = p.format === 'auto' || p.format === 'radical' || p.format === 'pi' || (p.format === 'fraction' && (!m.exact || m.exact.b === 1));
  if (p.format === 'decimal') text = decimal();
  else if (m.exact && exactWanted && !(p.format === 'fraction' && m.exact.b !== 1)) text = exactText(m.exact, m.pi);
  else {
    text = decimal(true);
    approx = true;
  }
  const unit = p.unit.trim();
  if (unit) text += ` ${unit}${m.kind === 'area' ? '²' : ''}`;
  return { text, approx };
}

/**
 * Custom label text with simple math: sqrt(2) or sqrt2 → √2, pi → π,
 * theta/alpha/beta → θ/α/β, x^2 → x², a_1 → a₁ ("5 cm", "2a", "?" stay as they are).
 */
export function mathText(raw: string): string {
  const sup: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', n: 'ⁿ' };
  const sub: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  const greek: Record<string, string> = { theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', phi: 'φ', pi: 'π' };
  return raw
    .replace(/sqrt\s*\(([^()]*)\)/g, '√$1')
    .replace(/sqrt\s*(\w+)/g, '√$1')
    .replace(/(^|[^a-zA-Z])(theta|alpha|beta|gamma|phi|pi)(?![a-zA-Z])/g, (_, pre: string, w: string) => pre + greek[w]!)
    .replace(/\^\{?([0-9n-]+)\}?/g, (_, d: string) => [...d].map((ch) => sup[ch] ?? ch).join(''))
    .replace(/_\{?([0-9]+)\}?/g, (_, d: string) => [...d].map((ch) => sub[ch] ?? ch).join(''));
}

/**
 * The angle at v between the rays to a and c as an inverse trig function, when
 * it has an exact form: tan⁻¹ of the tangent for an acute angle (rational when
 * the corners sit on the grid), cos⁻¹ of the cosine for an obtuse one.
 */
export function angleTrig(a: { x: number; y: number }, v: { x: number; y: number }, c: { x: number; y: number }): string | null {
  const [ux, uy, wx, wy] = [a.x - v.x, a.y - v.y, c.x - v.x, c.y - v.y];
  const dot = ux * wx + uy * wy;
  const cross = Math.abs(ux * wy - uy * wx);
  const lu = Math.hypot(ux, uy);
  const lw = Math.hypot(wx, wy);
  if (!lu || !lw || Math.abs(dot) < 1e-12 * lu * lw || cross < 1e-12 * lu * lw) return null;
  const wrap = (t: string) => (t.includes('/') || (t.includes('√') && !t.startsWith('√')) ? `(${t})` : t);
  if (dot > 0) {
    const t = cross / dot;
    const e = exactSqrt(t * t);
    return e ? `tan⁻¹${wrap(exactText(e))}` : null;
  }
  const cos = dot / (lu * lw);
  const e = exactSqrt(cos * cos);
  return e ? `cos⁻¹(−${exactText(e)})` : null;
}
