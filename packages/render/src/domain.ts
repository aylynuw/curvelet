import { Complex, type ComplexFn } from '@math/engine';
import { fromPx, fromPy, type Viewport } from './viewport';

/** An RGBA image covering the view, `step` screen pixels per image pixel. */
export interface DomainImage {
  width: number;
  height: number;
  step: number;
  data: Uint8ClampedArray;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * The colour of a value w = f(z): hue from its angle (red at 0, through
 * yellow, green, blue as the angle turns), lightness from its size (dark near
 * 0, light near ∞), with faint bands where |w| doubles, so zeros and poles
 * stand out as points where all colours meet.
 */
export function colourOf(w: Complex): [number, number, number] {
  const r = w.abs();
  if (!Number.isFinite(r) || Number.isNaN(w.re) || Number.isNaN(w.im)) return r === Infinity ? [255, 255, 255] : [128, 128, 128];
  const hue = ((w.arg() / (2 * Math.PI)) % 1 + 1) % 1;
  const band = r > 0 ? ((Math.log2(r) % 1) + 1) % 1 : 0;
  const light = 0.08 + 0.84 * (2 / Math.PI) * Math.atan(r) - 0.07 * band;
  return hslToRgb(hue, 0.85, Math.max(0.03, Math.min(0.97, light)));
}

/** Domain colouring of f over the view. */
export function domainColoring(fn: ComplexFn, v: Viewport, step = 2): DomainImage {
  const width = Math.max(1, Math.ceil(v.width / step));
  const height = Math.max(1, Math.ceil(v.height / step));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let j = 0; j < height; j++) {
    const y = fromPy(v, (j + 0.5) * step);
    for (let i = 0; i < width; i++) {
      let w: Complex;
      try {
        w = fn(new Complex(fromPx(v, (i + 0.5) * step), y));
      } catch {
        w = new Complex(NaN, NaN);
      }
      const [r, g, b] = colourOf(w);
      const k = (j * width + i) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = 255;
    }
  }
  return { width, height, step, data };
}
