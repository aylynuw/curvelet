/**
 * A decimal as a fraction with a small denominator, when it is one:
 * 0.375 → "3/8", -1.25 → "-5/4". Null for integers and for numbers no
 * fraction with a denominator up to `maxDen` matches to 1e-10.
 */
export function toFraction(x: number, maxDen = 10000): string | null {
  if (!Number.isFinite(x) || Number.isInteger(x)) return null;
  const sign = x < 0 ? '-' : '';
  const v = Math.abs(x);
  // continued fraction convergents
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let r = v;
  for (let step = 0; step < 32; step++) {
    const a = Math.floor(r);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (k1 > maxDen) return null;
    if (Math.abs(h1 / k1 - v) <= 1e-10 * Math.max(1, v)) return k1 === 1 ? null : `${sign}${h1}/${k1}`;
    const frac = r - a;
    if (frac < 1e-12) return null;
    r = 1 / frac;
  }
  return null;
}

const SQUAREFREE = Array.from({ length: 199 }, (_, k) => k + 2).filter((n) => {
  for (let d = 2; d * d <= n; d++) if (n % (d * d) === 0) return false;
  return true;
});

/** p/q as a whole number or fraction: [p, q] with q > 0, when x is one with a small denominator */
function ratio(x: number, maxDen: number): [number, number] | null {
  if (Math.abs(x - Math.round(x)) <= 1e-10 * Math.max(1, Math.abs(x))) return [Math.round(x), 1];
  const f = toFraction(x, maxDen);
  if (!f) return null;
  const [p, q] = f.split('/').map(Number) as [number, number];
  return [p, q];
}

/** c·name/q written as the engine reads it: 2sqrt(2), -sqrt(3)/2, pi/6 */
function scaled(p: number, q: number, name: string): string {
  const c = p === 1 ? '' : p === -1 ? '-' : String(p);
  return `${c}${name}${q === 1 ? '' : `/${q}`}`;
}

/**
 * A decimal that is a root or a multiple of π written exactly: 2.828… → 2sqrt(2),
 * 0.866… → sqrt(3)/2, 0.5235… → pi/6. Fractions first; null when it is none of these.
 */
export function exactNumber(x: number): string | null {
  if (!Number.isFinite(x) || Number.isInteger(x) || Math.abs(x) > 1e6) return null;
  const frac = toFraction(x);
  if (frac) return frac;
  const close = (a: number) => Math.abs(a - x) <= 1e-10 * Math.max(1, Math.abs(x));
  for (const n of SQUAREFREE) {
    const r = ratio(x / Math.sqrt(n), 100);
    if (r && r[0] !== 0 && close((r[0] / r[1]) * Math.sqrt(n))) return scaled(r[0], r[1], `sqrt(${n})`);
  }
  const r = ratio(x / Math.PI, 24);
  if (r && r[0] !== 0 && close((r[0] / r[1]) * Math.PI)) return scaled(r[0], r[1], 'pi');
  return null;
}

/** an exact number as a figure prints it: 2sqrt(2) → 2√2, pi/6 → π/6 */
export const prettyExact = (s: string | null): string | null => s && s.replace(/sqrt\((\d+)\)/g, '√$1').replace(/\bpi\b/g, 'π');
