import { Complex } from './complex';

/** Relative size below which one part of a complex number is treated as rounding noise. */
const NOISE = 1e-14;

/**
 * 3, -0.5, 0.333333333333, 2.43290200818e+18, 1e-7.
 * Exponent form from 10^15 up (beyond that, plain digits would show more precision
 * than a double holds) and below 10^-6.
 */
export function formatReal(x: number, digits = 12): string {
  if (!Number.isFinite(x)) return 'undefined';
  const rounded = Number(x.toPrecision(digits));
  if (rounded === 0) return '0';
  const size = Math.abs(rounded);
  if (size >= 1e15 || size < 1e-6) {
    const [mantissa, exponent] = rounded.toExponential(digits - 1).split('e');
    const trimmed = mantissa!.includes('.') ? mantissa!.replace(/\.?0+$/, '') : mantissa!;
    return `${trimmed}e${exponent}`;
  }
  return String(rounded);
}

/**
 * Plain-text result: 3, -0.5, 2 + 3i, -i, 1e+21, undefined.
 * Drops a real or imaginary part that is only rounding noise, so e^(iπ) shows -1.
 */
export function formatComplex(z: Complex, digits = 12): string {
  if (!Number.isFinite(z.re) || !Number.isFinite(z.im)) return 'undefined';
  const scale = Math.max(Math.abs(z.re), Math.abs(z.im));
  const re = Math.abs(z.re) <= NOISE * scale ? 0 : z.re;
  const im = Math.abs(z.im) <= NOISE * scale ? 0 : z.im;

  if (im === 0) return formatReal(re, digits);
  const imAbs = formatReal(Math.abs(im), digits);
  const imText = imAbs === '1' ? 'i' : `${imAbs}i`;
  if (re === 0) return im < 0 ? `-${imText}` : imText;
  return `${formatReal(re, digits)} ${im < 0 ? '-' : '+'} ${imText}`;
}
