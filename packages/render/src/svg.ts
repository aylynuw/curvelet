import { dashPattern } from './look';
import { stackedFraction, type Scene } from './scene';
import { isMathLabel, mathRuns, type DrawTheme } from './theme';

const r = (n: number) => String(Math.round(n * 100) / 100);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function segPath(segs: number[]): string {
  let d = '';
  for (let k = 0; k + 3 < segs.length; k += 4) d += `M${r(segs[k]!)} ${r(segs[k + 1]!)}L${r(segs[k + 2]!)} ${r(segs[k + 3]!)}`;
  return d;
}
function linePath(pts: number[], close = false): string {
  let d = '';
  for (let k = 0; k + 1 < pts.length; k += 2) d += `${k === 0 ? 'M' : 'L'}${r(pts[k]!)} ${r(pts[k + 1]!)}`;
  return close ? `${d}Z` : d;
}
function rectPath(rects: number[]): string {
  let d = '';
  for (let k = 0; k + 3 < rects.length; k += 4) d += `M${r(rects[k]!)} ${r(rects[k + 1]!)}h${r(rects[k + 2]!)}v${r(rects[k + 3]!)}h${r(-rects[k + 2]!)}Z`;
  return d;
}

const BASELINE = { top: 'hanging', middle: 'central', bottom: 'alphabetic' } as const;

/** A scene as a standalone SVG document (for export and exam figures). */
export function sceneToSvg(scene: Scene, theme: DrawTheme, underlay = ''): string {
  const exam = scene.style === 'exam';
  const color = (series: number) => theme.curves[series % theme.curves.length]!;
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}" font-family="${esc(theme.font)}" font-size="${theme.fontSize}">`,
  );
  if (theme.background) out.push(`<rect width="100%" height="100%" fill="${theme.background}"/>`);
  // the caller's pictures, under the grid and curves
  if (underlay) out.push(underlay);
  if (scene.gridMinor.length) out.push(`<path d="${segPath(scene.gridMinor)}" stroke="${theme.gridMinor}" stroke-width="1" fill="none"/>`);
  if (scene.gridMajor.length) out.push(`<path d="${segPath(scene.gridMajor)}" stroke="${theme.gridMajor}" stroke-width="1" fill="none"/>`);

  for (const f of scene.fills) {
    const d = f.polys.map((p) => linePath(p, true)).join('') + rectPath(f.rects);
    out.push(`<path d="${d}" fill="${exam ? theme.ink : (f.color ?? color(f.series))}" fill-opacity="${f.opacity ?? theme.fillOpacity}" stroke="none"/>`);
  }
  out.push(`<path d="${segPath(scene.axes)}" stroke="${theme.ink}" stroke-width="${theme.axisWidth}" fill="none"/>`);
  if (scene.ticks.length) out.push(`<path d="${segPath(scene.ticks)}" stroke="${theme.ink}" stroke-width="${theme.axisWidth}" fill="none"/>`);
  for (const a of scene.arrows) {
    const d =
      a.dir === 'right'
        ? `M${r(a.x)} ${r(a.y)}l-9 -3.5l2 3.5l-2 3.5Z`
        : `M${r(a.x)} ${r(a.y)}l-3.5 9l3.5 -2l3.5 2Z`;
    out.push(`<path d="${d}" fill="${theme.ink}"/>`);
  }
  if (scene.guides.length) {
    out.push(`<path d="${segPath(scene.guides)}" stroke="${theme.ink}" stroke-width="0.8" stroke-dasharray="3 3" fill="none"/>`);
  }
  for (const c of scene.curves) {
    const d = c.lines.map((l) => linePath(l)).join('') + segPath(c.segs);
    if (!d) continue;
    const width = c.width ?? theme.curveWidth * (c.weight ?? 1);
    const pattern = dashPattern(c, exam, width);
    const dash = pattern.length ? ` stroke-dasharray="${pattern.join(' ')}"` : '';
    out.push(
      `<path d="${d}" stroke="${exam || c.ink ? theme.ink : (c.color ?? color(c.series))}" stroke-width="${width}" fill="none" stroke-linejoin="round" stroke-linecap="round"${dash}/>`,
    );
  }
  for (const p of scene.points) {
    const ink = exam ? theme.ink : (p.color ?? (p.colored ? color(p.series) : theme.ink));
    out.push(
      p.open
        ? `<circle cx="${r(p.x)}" cy="${r(p.y)}" r="${exam ? 3 : 4.5}" fill="${theme.background ?? theme.halo ?? '#ffffff'}" stroke="${ink}" stroke-width="${exam ? 1.2 : 2}"/>`
        : `<circle cx="${r(p.x)}" cy="${r(p.y)}" r="${exam ? 2.6 : 4.5}" fill="${ink}"/>`,
    );
  }
  for (const l of scene.labels) {
    const fill = l.kind === 'tick' && !exam ? theme.muted : theme.ink;
    const halo = theme.halo && l.kind !== 'axis' ? ` stroke="${theme.halo}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"` : '';
    const attrs = `x="${r(l.x)}" y="${r(l.y)}" text-anchor="${l.anchor}" dominant-baseline="${BASELINE[l.baseline]}" fill="${fill}"${halo}`;
    const size = l.kind === 'tick' && !exam ? ` font-size="${theme.fontSize - 3}"` : '';
    const frac = exam ? stackedFraction(l) : null;
    if (frac) {
      // a stacked fraction; widths estimated from the digits
      const [sign, num, den] = frac;
      const size = theme.fontSize;
      const fs = Math.round(size * 0.85);
      const bar = Math.max(num.length, den.length) * fs * 0.55 + 4;
      const sw = sign ? size * 0.6 : 0;
      const w = sw + bar;
      const h = fs * 2 + 4;
      const cy = l.baseline === 'top' ? l.y + h / 2 : l.baseline === 'bottom' ? l.y - h / 2 : l.y;
      const x0 = l.anchor === 'start' ? l.x : l.anchor === 'middle' ? l.x - w / 2 : l.x - w;
      const cx = x0 + sw + bar / 2;
      const font = ` font-family="${esc(theme.mathFont)}" fill="${fill}"${halo}`;
      if (sign) out.push(`<text x="${r(x0)}" y="${r(cy + size * 0.32)}"${font}>${sign}</text>`);
      out.push(`<text x="${r(cx)}" y="${r(cy - 3)}" text-anchor="middle" font-size="${fs}"${font}>${num}</text>`);
      out.push(`<text x="${r(cx)}" y="${r(cy + 2 + fs * 0.78)}" text-anchor="middle" font-size="${fs}"${font}>${den}</text>`);
      out.push(`<rect x="${r(x0 + sw)}" y="${r(cy - 0.5)}" width="${r(bar)}" height="1" fill="${fill}"/>`);
      continue;
    }
    if (exam && isMathLabel(l)) {
      const spans = mathRuns(l.text)
        .map((run, k, all) => {
          const italic = run.italic ? ' font-style="italic"' : '';
          // raise exponents, and drop back to the baseline after them
          const shift = run.sup ? ' baseline-shift="super" font-size="70%"' : all[k - 1]?.sup ? ' baseline-shift="baseline"' : '';
          return `<tspan${italic}${shift} font-family="${esc(theme.mathFont)}">${esc(run.text)}</tspan>`;
        })
        .join('');
      out.push(`<text ${attrs}${size}>${spans}</text>`);
    } else {
      out.push(`<text ${attrs}${size}>${esc(l.text)}</text>`);
    }
  }
  out.push('</svg>');
  return out.join('\n');
}
