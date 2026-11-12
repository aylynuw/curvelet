/**
 * What part of the plane is on screen. Equal scale on both axes, so circles
 * stay round: `scale` is pixels per unit, (cx, cy) the centre in plane units.
 */
export interface Viewport {
  cx: number;
  cy: number;
  scale: number;
  width: number;
  height: number;
}

export const DEFAULT_VIEW = { cx: 0, cy: 0, scale: 40 };

export const xmin = (v: Viewport) => v.cx - v.width / 2 / v.scale;
export const xmax = (v: Viewport) => v.cx + v.width / 2 / v.scale;
export const ymin = (v: Viewport) => v.cy - v.height / 2 / v.scale;
export const ymax = (v: Viewport) => v.cy + v.height / 2 / v.scale;

/** plane → screen pixels (y grows downwards on screen) */
export const toPx = (v: Viewport, x: number) => (x - v.cx) * v.scale + v.width / 2;
export const toPy = (v: Viewport, y: number) => v.height / 2 - (y - v.cy) * v.scale;
/** screen pixels → plane */
export const fromPx = (v: Viewport, px: number) => (px - v.width / 2) / v.scale + v.cx;
export const fromPy = (v: Viewport, py: number) => (v.height / 2 - py) / v.scale + v.cy;

export const MIN_SCALE = 1e-4;
export const MAX_SCALE = 1e7;

/** Zoom by `factor` keeping the plane point under (px, py) fixed. */
export function zoomAt(v: Viewport, factor: number, px: number, py: number): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
  const x = fromPx(v, px);
  const y = fromPy(v, py);
  return { ...v, scale, cx: x - (px - v.width / 2) / scale, cy: y - (v.height / 2 - py) / scale };
}

/** Move the view by a screen-pixel drag. */
export function panBy(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, cx: v.cx - dx / v.scale, cy: v.cy + dy / v.scale };
}

/**
 * Grid spacing: 1, 2 or 5 × 10^k units, the smallest at least `minPx` pixels apart.
 * Returns the major step and how many minor steps divide it.
 */
export function gridStep(scale: number, minPx = 80): { major: number; minor: number } {
  const raw = minPx / scale;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const m of [1, 2, 5, 10]) {
    const major = m * pow;
    if (major >= raw * 0.999) return { major, minor: major / (m === 2 ? 4 : 5) };
  }
  return { major: 10 * pow, minor: 2 * pow };
}

/** Axis numbers: 0.1 + 0.2 shows as 0.3, -0 as 0, very large or small in exponent form. */
export function tickLabel(value: number, step: number): string {
  if (Math.abs(value) < step * 1e-9) return '0';
  const size = Math.abs(value);
  if (size >= 1e6 || size < 1e-4) {
    const [m, e] = value.toExponential(3).split('e');
    return `${Number(m)}e${Number(e)}`;
  }
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return String(Number(value.toFixed(Math.min(12, decimals))));
}
