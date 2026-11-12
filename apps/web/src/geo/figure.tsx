/**
 * Draws a figure as SVG: the shapes, then their labels and marks. The canvas
 * uses it with the page's styles (classes); exports pass `paint`, explicit
 * colours and fonts, so the SVG stands on its own in a document.
 */
import type { ReactElement } from 'react';
import { runs, type Decorations } from './labels';
import type { GeoObject, Pt, Shape } from './model';

export interface Paint {
  ink: string;
  line: string;
  fill: string;
  paper: string;
  /** stroke width in px */
  width: number;
  font: string;
}
/** exam style: black on white, one line weight */
export const EXAM_PAINT: Paint = { ink: '#000000', line: '#000000', fill: 'none', paper: '#ffffff', width: 1.4, font: "'Times New Roman', 'KaTeX_Main', 'Nanum Myeongjo', serif" };
/** colour, for an export outside exam view */
export const COLOR_PAINT: Paint = { ink: '#1a1d24', line: '#2b5fbf', fill: 'rgba(43, 95, 191, 0.10)', paper: '#ffffff', width: 1.8, font: "'Times New Roman', 'KaTeX_Main', serif" };

export function renderFigure({
  objects,
  shapes,
  deco,
  toScreen,
  scale,
  far,
  highlight,
  paint,
  interactive,
  showAnchors,
}: {
  objects: GeoObject[];
  shapes: Map<string, Shape>;
  deco: Decorations;
  toScreen: (p: Pt) => Pt;
  /** pixels per coordinate unit */
  scale: number;
  /** how far (coordinate units) to run a line or ray off-screen */
  far: number;
  highlight?: Set<string>;
  paint?: Paint;
  /** labels carry data for dragging them */
  interactive?: boolean;
  /** pen anchors to show (those of the path being drawn or edited); the rest stay hidden */
  showAnchors?: Set<string>;
}): ReactElement[] {
  const hl = (id: string) => (highlight?.has(id) ? ' is-picked' : '');
  const stroke = paint ? { stroke: paint.line, strokeWidth: paint.width, fill: 'none' } : {};
  const images: ReactElement[] = [];
  const fills: ReactElement[] = [];
  const strokes: ReactElement[] = [];
  const dots: ReactElement[] = [];
  const texts: ReactElement[] = [];
  const ends = (a: Pt, b: Pt, extent: 'segment' | 'line' | 'ray'): [Pt, Pt] => {
    if (extent === 'segment') return [a, b];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const d = { x: ((b.x - a.x) / l) * far, y: ((b.y - a.y) / l) * far };
    return [extent === 'line' ? { x: a.x - d.x, y: a.y - d.y } : a, { x: b.x + d.x, y: b.y + d.y }];
  };

  for (const o of objects) {
    const sh = shapes.get(o.id);
    if (!sh) continue;
    if (sh.type === 'polygon') {
      const pts = sh.pts.map(toScreen).map((p) => `${r(p.x)},${r(p.y)}`).join(' ');
      fills.push(<polygon key={o.id} data-id={o.id} className={`geo__poly${hl(o.id)}`} points={pts} {...(paint ? { fill: paint.fill, stroke: paint.line, strokeWidth: paint.width, strokeLinejoin: 'round' } : {})} />);
    } else if (sh.type === 'line') {
      const [a, b] = ends(sh.a, sh.b, sh.extent).map(toScreen) as [Pt, Pt];
      const built = !['segment', 'line', 'ray'].includes(o.kind);
      strokes.push(<line key={o.id} data-id={o.id} className={`geo__line${built ? ' geo__line--built' : ''}${hl(o.id)}`} x1={r(a.x)} y1={r(a.y)} x2={r(b.x)} y2={r(b.y)} {...stroke} strokeLinecap="round" />);
    } else if (sh.type === 'circle') {
      const c = toScreen(sh.c);
      strokes.push(<circle key={o.id} data-id={o.id} className={`geo__circle${hl(o.id)}`} cx={r(c.x)} cy={r(c.y)} r={r(sh.r * scale)} {...stroke} />);
    } else if (sh.type === 'ellipse') {
      const c = toScreen(sh.c);
      strokes.push(
        <ellipse key={o.id} data-id={o.id} className={`geo__circle${hl(o.id)}`} cx={r(c.x)} cy={r(c.y)} rx={r(sh.rx * scale)} ry={r(sh.ry * scale)} transform={sh.rot ? `rotate(${r(-sh.rot)} ${r(c.x)} ${r(c.y)})` : undefined} {...stroke} />,
      );
    } else if (sh.type === 'path') {
      const d = sh.pts.map(toScreen).map((p, k) => `${k ? 'L' : 'M'}${r(p.x)},${r(p.y)}`).join(' ') + (sh.closed ? ' Z' : '');
      (sh.closed ? fills : strokes).push(
        <path
          key={o.id}
          data-id={o.id}
          className={`geo__pen${sh.closed ? ' geo__pen--closed' : ''}${hl(o.id)}`}
          d={d}
          {...(paint ? { fill: sh.closed ? paint.fill : 'none', stroke: paint.line, strokeWidth: paint.width, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const } : {})}
        />,
      );
    } else if (sh.type === 'point') {
      if (o.kind === 'point' && o.anchor && !showAnchors?.has(o.id)) continue;
      const p = toScreen(sh.at);
      const rad = paint ? paint.width * 1.8 : sh.free ? 5 : 4;
      dots.push(
        <circle
          key={o.id}
          data-id={o.id}
          className={`geo__pt${sh.free ? '' : ' geo__pt--built'}${hl(o.id)}`}
          cx={r(p.x)}
          cy={r(p.y)}
          r={rad}
          {...(paint ? { fill: paint.ink, stroke: 'none' } : {})}
        />,
      );
    } else if (sh.type === 'image') {
      const p = toScreen({ x: sh.c.x - sh.w / 2, y: sh.c.y + sh.h / 2 });
      images.push(
        <image key={o.id} data-id={o.id} className={`geo__img${hl(o.id)}`} href={sh.src} x={r(p.x)} y={r(p.y)} width={r(sh.w * scale)} height={r(sh.h * scale)} opacity={sh.opacity} preserveAspectRatio="none" />,
      );
    } else if (sh.type === 'text') {
      const p = toScreen(sh.at);
      texts.push(
        <text key={o.id} className="geo__label" x={r(p.x)} y={r(p.y)} {...(paint ? { fill: paint.ink, fontFamily: paint.font, fontSize: 0.4 * scale } : {})}>
          {sh.text}
        </text>,
      );
    }
  }

  const marks = deco.lines.map((l, k) => {
    const d = l.pts.map(toScreen).map((p, j) => `${j ? 'L' : 'M'}${r(p.x)},${r(p.y)}`).join(' ') + (l.closed ? ' Z' : '');
    return (
      <path
        key={`m${k}`}
        className={l.fill ? 'geo__mark geo__mark--fill' : 'geo__mark'}
        d={d}
        {...(paint ? (l.fill ? { fill: paint.ink, stroke: 'none' } : { fill: 'none', stroke: paint.ink, strokeWidth: paint.width * 0.85, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }) : {})}
      />
    );
  });
  const centers = deco.dots.map((d, k) => {
    const p = toScreen(d.at);
    return <circle key={`c${k}`} className="geo__center" cx={r(p.x)} cy={r(p.y)} r={paint ? paint.width * 1.4 : 2.5} {...(paint ? { fill: paint.ink } : {})} />;
  });
  const labels = deco.texts.map((t) => {
    const p = toScreen(t.at);
    const size = t.size * scale;
    const parts = t.math ? runs(t.text, t.italic) : [{ text: t.text, italic: false }];
    return (
      <text
        key={t.key}
        className="geo__label"
        x={r(p.x)}
        y={r(p.y + size * 0.35)}
        textAnchor="middle"
        fontSize={r(size)}
        {...(interactive ? { 'data-label': t.key, 'data-owner': t.owner } : {})}
        {...(paint ? { fill: paint.ink, fontFamily: paint.font } : {})}
      >
        {parts.map((part, j) => (
          <tspan key={j} fontStyle={part.italic ? 'italic' : undefined}>
            {part.text}
          </tspan>
        ))}
      </text>
    );
  });
  return [...images, ...fills, ...strokes, ...marks, ...centers, ...dots, ...labels, ...texts];
}

const r = (v: number) => Math.round(v * 100) / 100;
