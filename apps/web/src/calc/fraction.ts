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
