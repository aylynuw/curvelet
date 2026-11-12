import { figureSvg } from '../geo/exportFigure';
import { resolve, type GeoObject } from '../geo/model';
import type { Graphable } from '@math/engine';
import { graphSvg } from '../graph/exportGraph';

/** the graph drawn off screen around the origin, for a project saved from another tab */
export function graphThumbOffscreen(graphables: Graphable[], series: (id: string) => number, coord?: (n: number) => string): string | null {
  if (!graphables.length) return null;
  try {
    const svg = graphSvg(graphables, { cx: 0, cy: 0, scale: 24, width: 360, height: 225 }, { style: 'screen', series, curveLabels: false, axes: true, coord }, document.documentElement);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

/** a small picture of the graph on screen, or null when the graph isn't showing */
export function graphThumb(): string | null {
  const src = document.querySelector<HTMLCanvasElement>('canvas.graph__canvas');
  if (!src || !src.width || !src.height) return null;
  const w = 360;
  const h = Math.round((w * src.height) / src.width);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, w, h);
  try {
    return c.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}

/** the geometry board drawn on white, cropped to its figure */
export function geoThumb(doc: unknown): string | null {
  const objects = (doc as { objects?: GeoObject[] } | null)?.objects;
  if (!Array.isArray(objects) || !objects.length) return null;
  try {
    const shown = objects.filter((o) => !(o.kind === 'point' && o.anchor));
    const made = figureSvg(shown, resolve(objects), { texts: [], lines: [], dots: [] }, { margin: 0.6, exam: false });
    return made ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(made.svg)}` : null;
  } catch {
    return null;
  }
}
