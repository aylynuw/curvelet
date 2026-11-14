import { Workspace, type EvalSettings, type SymbolicResolver } from '@math/engine';
import { EXAM_THEME, buildScene, sceneToSvg } from '@math/render';
import { Fragment, useMemo, type ReactNode } from 'react';
import { LatexText, MathText } from '../components/MathText';
import type { Figure } from './worksheet';

/**
 * A figure as SVG at `width` pixels, in the printed exam style. Answers
 * from SymPy (f'(a) in a tangent line) arrive later: `version` changes then,
 * and the figure is drawn again. Cached, since the page and its measuring
 * copy draw every figure twice.
 */
const cache = new Map<string, { svg: string; height: number }>();

export function figureSvg(fig: Figure, width: number, settings: EvalSettings, resolver: SymbolicResolver | undefined, version: number) {
  const key = JSON.stringify([fig, Math.round(width), settings, version]);
  const hit = cache.get(key);
  if (hit) return hit;
  const w = new Workspace(settings, resolver);
  fig.lines.forEach((src, k) => w.set(String(k), src));
  const { xmin, xmax, ymin, ymax } = fig.range;
  const scale = width / Math.max(1e-9, xmax - xmin);
  const height = Math.max(40, Math.round((ymax - ymin) * scale));
  const view = { cx: (xmin + xmax) / 2, cy: (ymin + ymax) / 2, scale, width: Math.round(width), height };
  const drawn = w.graphables().filter((g) => g.kind !== 'surface' && g.kind !== 'complex');
  const order = drawn.map((g) => g.id);
  const scene = buildScene(drawn, view, {
    style: 'exam',
    series: (id) => Math.max(0, order.indexOf(id)),
    examTicks: fig.axisNumbers ? 'integers' : 'none',
    curveLabels: fig.curveLabels,
    axes: fig.axes,
    sampleStep: 0.5,
    pointGuides: fig.guides !== false,
  });
  const out = { svg: sceneToSvg(scene, EXAM_THEME), height };
  if (cache.size > 200) cache.clear();
  cache.set(key, out);
  return out;
}

export function FigureView({
  figure,
  width,
  settings,
  resolver,
  version,
  label,
}: {
  figure: Figure;
  width: number;
  settings: EvalSettings;
  resolver?: SymbolicResolver;
  version: number;
  label: string;
}) {
  const w = width * figure.width;
  const { svg, height } = useMemo(() => figureSvg(figure, w, settings, resolver, version), [figure, w, settings, resolver, version]);
  return (
    <div className="ws-figure" role="img" aria-label={label} style={{ width: w, height }} dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

/**
 * Worksheet text: $…$ is math in the calculator's syntax, $$…$$ raw LaTeX,
 * a new line starts a new line.
 */
export function RichText({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, k) => (
        <Fragment key={k}>
          {k > 0 && <br />}
          {pieces(line)}
        </Fragment>
      ))}
    </>
  );
}

function pieces(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    out.push(m[1] !== undefined ? <LatexText key={m.index} latex={m[1]} label={m[1]} /> : <MathText key={m.index} text={m[2]!} />);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}
