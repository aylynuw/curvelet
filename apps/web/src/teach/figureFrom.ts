import { Workspace, type EvalSettings } from '@math/engine';
import type { ProblemFigure } from '@math/steps';
import { toLines } from '../geo/model';
import { GEO_KEY } from '../files/keys';
import { fitRange, type Range } from '../graph/fit';
import type { Figure } from './worksheet';

/**
 * A worksheet figure from calculator lines: in `view` when given (the part
 * of the Graph tab on screen), otherwise framed so everything drawn fits.
 * Null when nothing is drawn.
 */
export function figureOf(lines: string[], settings: EvalSettings, axes: boolean, view?: Range | null): Figure | null {
  const kept = lines.map((l) => l.trim()).filter(Boolean);
  if (!kept.length) return null;
  const w = new Workspace(settings);
  kept.forEach((src, k) => w.set(String(k), src));
  const drawn = w.graphables().filter((g) => g.kind !== 'surface' && g.kind !== 'complex');
  if (!drawn.length) return null;
  // with no view, a function's tall ends are cut at ±8 so the figure keeps a sensible shape
  const fit = fitRange(drawn, -5, 5, -8, 8);
  const r = view ?? (fit ? { ...fit, ymin: Math.max(fit.ymin, -8), ymax: Math.min(fit.ymax, 8) } : { xmin: -5, xmax: 5, ymin: -4, ymax: 4 });
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    lines: kept,
    range: { xmin: round(r.xmin), xmax: round(r.xmax), ymin: round(r.ymin), ymax: round(r.ymax) },
    axes,
    axisNumbers: false,
    curveLabels: axes,
    width: 0.85,
    // a drawing's points are named, not measured
    guides: axes,
  };
}

/** what is on the Geometry board now, as calculator lines */
export function geometryLines(): string[] {
  try {
    const doc = JSON.parse(localStorage.getItem(GEO_KEY) ?? 'null') as { objects?: unknown[] } | null;
    return Array.isArray(doc?.objects) ? toLines(doc.objects as Parameters<typeof toLines>[0]) : [];
  } catch {
    return [];
  }
}

/** a practice problem's figure as one on the worksheet */
export const sheetFigure = (f: ProblemFigure): Figure => ({ lines: f.lines, range: f.range, axes: f.axes, axisNumbers: false, curveLabels: false, width: 0.8, guides: false });
