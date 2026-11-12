/**
 * A figure, or the selected part of it, as a standalone SVG, a PNG, a PDF or
 * a clipboard image — cropped to the drawing with a margin, one coordinate
 * unit to one centimetre, so it drops into an exam paper at a sensible size.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderFigure, COLOR_PAINT, EXAM_PAINT } from './figure';
import type { Decorations } from './labels';
import { withAncestors, type GeoObject, type Pt, type Shape } from './model';

/** an object's colour as a value a standalone SVG can use (palette slots read from the page's theme) */
export function resolvedColor(c: string | undefined): string | undefined {
  if (!c) return undefined;
  const m = /^c([1-9])$/.exec(c);
  if (!m) return /^#[0-9a-f]{6}$/i.test(c) ? c : undefined;
  if (typeof document === 'undefined') return undefined;
  return getComputedStyle(document.documentElement).getPropertyValue(`--color-curve-${m[1]}`).trim() || undefined;
}

/** 1 cm at 96 px per inch */
export const PX_PER_UNIT = 96 / 2.54;

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** what a figure covers: its shapes, marks and labels */
export function figureBounds(objects: GeoObject[], shapes: Map<string, Shape>, deco: Decorations): Bounds | null {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const take = (p: Pt, pad = 0) => {
    b.x0 = Math.min(b.x0, p.x - pad);
    b.x1 = Math.max(b.x1, p.x + pad);
    b.y0 = Math.min(b.y0, p.y - pad);
    b.y1 = Math.max(b.y1, p.y + pad);
  };
  const ids = new Set(objects.map((o) => o.id));
  for (const id of ids) {
    const s = shapes.get(id);
    if (!s) continue;
    if (s.type === 'point' || s.type === 'text') take(s.at);
    else if (s.type === 'line') [s.a, s.b].forEach((p) => take(p));
    else if (s.type === 'polygon' || s.type === 'path') s.pts.forEach((p) => take(p));
    else if (s.type === 'circle') take(s.c, s.r);
    else if (s.type === 'ellipse') take(s.c, Math.max(s.rx, s.ry));
    else if (s.type === 'angle') take(s.v);
    else if (s.type === 'image') [take({ x: s.c.x - s.w / 2, y: s.c.y - s.h / 2 }), take({ x: s.c.x + s.w / 2, y: s.c.y + s.h / 2 })];
  }
  for (const t of deco.texts) if (ids.has(t.owner)) take(t.at, t.size * Math.max(1, t.text.length) * 0.3);
  for (const l of deco.lines) if (ids.has(l.owner)) l.pts.forEach((p) => take(p));
  return Number.isFinite(b.x0) ? b : null;
}

/** the figure (or the objects in `only` and what they are built from) as an SVG document */
export function figureSvg(
  objects: GeoObject[],
  shapes: Map<string, Shape>,
  deco: Decorations,
  opts: { only?: string[]; margin: number; exam: boolean },
): { svg: string; width: number; height: number } | null {
  const list = opts.only?.length ? withAncestors(objects, opts.only) : objects;
  const ids = new Set(list.map((o) => o.id));
  const part: Decorations = { texts: deco.texts.filter((t) => ids.has(t.owner)), lines: deco.lines.filter((l) => ids.has(l.owner)), dots: deco.dots.filter((d) => ids.has(d.owner)) };
  const b = figureBounds(list, shapes, part);
  if (!b) return null;
  const m = Math.max(0, opts.margin);
  const [x0, y0, x1, y1] = [b.x0 - m, b.y0 - m, b.x1 + m, b.y1 + m];
  const s = PX_PER_UNIT;
  const width = Math.max(1, Math.ceil((x1 - x0) * s));
  const height = Math.max(1, Math.ceil((y1 - y0) * s));
  const paint = opts.exam ? EXAM_PAINT : COLOR_PAINT;
  const body = renderFigure({ objects: list, shapes, deco: part, toScreen: (p) => ({ x: (p.x - x0) * s, y: (y1 - p.y) * s }), scale: s, far: (x1 - x0 + y1 - y0) * 2, paint, colorOf: opts.exam ? undefined : (o) => resolvedColor(o.color) });
  const markup = renderToStaticMarkup(
    createElement(
      'svg',
      { xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${width} ${height}` },
      createElement('rect', { width, height, fill: paint.paper }),
      ...body,
    ),
  );
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`, width, height };
}

/** an SVG drawn into a canvas at `scale` times its size */
export async function svgToCanvas(svg: string, width: number, height: number, scale: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const canvasToPng = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG failed'))), 'image/png'));

/**
 * A one-page PDF holding the figure as a high-resolution image, the page the
 * figure's real size. (The labels use √, π and Korean, which the PDF base
 * fonts can't show, so the page is an image at 4× rather than vector text.)
 */
export async function canvasToPdf(canvas: HTMLCanvasElement, widthPx: number, heightPx: number): Promise<Blob> {
  const ctx = canvas.getContext('2d')!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) [rgb[j], rgb[j + 1], rgb[j + 2]] = [data[i]!, data[i + 1]!, data[i + 2]!];
  const deflated = new Uint8Array(await new Response(new Blob([rgb]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const [w, h] = [(widthPx * 72) / 96, (heightPx * 72) / 96];
  const n = (v: number) => (Math.round(v * 100) / 100).toString();
  const content = `q ${n(w)} 0 0 ${n(h)} 0 0 cm /Im0 Do Q`;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    size += bytes.length;
  };
  const obj = (k: number, body: (string | Uint8Array)[]) => {
    offsets[k] = size;
    push(`${k} 0 obj\n`);
    body.forEach(push);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
  obj(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(w)} ${n(h)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${deflated.length} >>\nstream\n`, deflated, '\nendstream']);
  obj(5, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  const xref = size;
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** the image on the clipboard: PNG always, the SVG beside it where the system takes vector images */
export async function copyFigure(png: Blob, svg: string): Promise<'vector' | 'image'> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png, 'image/svg+xml': svgBlob })]);
    return 'vector';
  } catch {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return 'image';
  }
}
