import type { Graphable } from '@math/engine';
import {
  DEFAULT_VIEW,
  EXAM_THEME,
  buildScene,
  coordinate,
  curveAt,
  gridStep,
  drawScene,
  panBy,
  planeAt,
  pointsOfInterest,
  toPx,
  toPy,
  xmax,
  xmin,
  ymax,
  ymin,
  zoomAt,
  dashPattern,
  type Look,
  type Poi,
  type Scene,
  type Style,
  type Viewport,
} from '@math/render';
import { Suspense, lazy, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Graph3DHandle, Surface } from './Graph3D';
import type { Strings } from '../i18n';
import { exportPdf, exportPng, exportSvg, exportTikz, graphSvg, readTheme } from './exportGraph';
import { exportGif, exportVideo, videoType, type Sweep } from './animate';
import { MathText } from '../components/MathText';
import { Menu, type MenuItem } from './Menu';
import { GraphSettings } from './GraphSettings';
import { fitRange } from './fit';
import { FIGURE_TEMPLATES, type FigureTemplate, type Range } from '../teach/templates';
import type { TeachStrings } from '../teach/strings';
import type { Lang } from '../i18n';
import { Explain } from '../learn/Explain';
import type { LearnStrings } from '../learn/strings';

// three.js loads only when the 3D view is opened
const Graph3D = lazy(() => import('./Graph3D'));

export interface FigureOptions {
  /** the flat graph, a printed exam figure, or the 3D view */
  style: Style | '3d';
  axisNumbers: boolean;
  curveLabels: boolean;
  /** draw the axes; geometry figures often leave them out */
  axes: boolean;
  /** the screen grid */
  grid?: 'cartesian' | 'polar' | 'none';
  /** x-axis numbers in multiples of π */
  piTicks?: boolean;
  /** coordinates beside points (default on) */
  pointLabels?: boolean;
}

const GRAPH_EXAMPLES = ['y = x^2 - 2x', 'x^2 + y^2 = 9', 'r = 1 + cos(θ)', '(cos(3t), sin(2t))', 'y < sin(x)', 'let P = (1, -1)'];

/** A movement smaller than this between press and release is a click, not a drag. */
const CLICK_SLOP = 4;

const at = (p: Poi) => `(${coordinate(p.x)}, ${coordinate(p.y)})`;

export function GraphPanel({
  graphables,
  seriesOf,
  t,
  figure,
  onFigure,
  onInsert,
  selected,
  onSelect,
  lineNumber,
  onMovePoint,
  sliders,
  sweep,
  onAddSeed,
  learn,
  look,
  swatchOf,
  teach,
  lang,
  onTemplate,
  onAddFigure,
  fit,
}: {
  graphables: Graphable[];
  seriesOf: (id: string) => number;
  t: Strings;
  figure: FigureOptions;
  onFigure: (f: FigureOptions) => void;
  onInsert: (source: string) => void;
  /** the selected curve's line id */
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** 1-based line number of a line id, for "intersection with line 3" */
  lineNumber: (id: string) => number;
  /** a draggable point moved to (x, y) */
  onMovePoint: (name: string, x: number, y: number) => void;
  /** the worksheet's sliders, which an animation can sweep */
  sliders: { name: string; min: number; max: number }[];
  sweep: (name: string) => Sweep;
  /** a click on the graph with a field selected: a solution curve through (x, y) */
  onAddSeed: (id: string, x: number, y: number) => void;
  learn: LearnStrings;
  /** each line's colour and style, for drawing */
  look: (id: string) => Look | undefined;
  /** a line's colour, for its swatch */
  swatchOf: (id: string) => string;
  teach: TeachStrings;
  lang: Lang;
  /** start from an exam figure template */
  onTemplate: (t: FigureTemplate) => void;
  /** this graph as a worksheet figure: the part of the plane shown and how it's drawn */
  onAddFigure: (f: { range: Range; axes: boolean; axisNumbers: boolean; curveLabels: boolean }) => void;
  /** show this part of the plane (a template's range); a new nonce asks again */
  fit: { range: Range; nonce: number } | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState(DEFAULT_VIEW);
  const [fitDone, setFitDone] = useState(0);
  const [hover, setHover] = useState<{ px: number; py: number } | null>(null);
  const [pinned, setPinned] = useState<Poi | null>(null);
  const [themeVersion, themeChanged] = useReducer((n: number) => n + 1, 0);
  const [animated, setAnimated] = useState<string | null>(null);
  const [making, setMaking] = useState<{ kind: 'gif' | 'video'; pct: number } | null>(null);
  const [animError, setAnimError] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pressedAt = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  /** the name of the point being dragged */
  const dragging = useRef<string | null>(null);
  const viewport: Viewport = { ...view, ...size };
  const exam = figure.style === 'exam';
  const view3d = figure.style === '3d';
  const view3dRef = useRef<Graph3DHandle>(null);
  const surfaces = useMemo(() => graphables.filter((g): g is Surface => g.kind === 'surface' || g.kind === 'complex'), [graphables]);
  // domain colouring covers the whole plane, so it shows only for the selected
  // complex function, or when nothing else is drawn
  const others = graphables.some((g) => g.kind !== 'complex' && g.kind !== 'surface');
  const complexShown =
    !exam && !view3d ? graphables.find((g) => g.kind === 'complex' && (g.id === selected || !others)) : undefined;
  const drawn = useMemo(() => graphables.filter((g) => g.kind !== 'complex' || g.id === complexShown?.id), [graphables, complexShown]);
  const sceneOpts = {
    style: (view3d ? 'screen' : figure.style) as Style,
    series: seriesOf,
    examTicks: figure.axisNumbers ? ('integers' as const) : ('none' as const),
    curveLabels: figure.curveLabels,
    axes: figure.axes,
    look,
    grid: figure.grid,
    piTicks: figure.piTicks,
    pointLabels: figure.pointLabels,
  };

  const selectedGraph = graphables.find((g) => g.id === selected && g.kind !== 'point') ?? null;
  const explicit = selectedGraph?.kind === 'curve' && selectedGraph.dir === 'y' ? selectedGraph : null;
  const pois = useMemo(
    () => (selectedGraph && size.width ? pointsOfInterest(graphables, viewport, selectedGraph.id) : []),
    // viewport is rebuilt from view and size
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphables, selectedGraph, view, size],
  );
  useEffect(() => setPinned(null), [selected]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const box = entry!.contentRect;
      setSize({ width: Math.round(box.width), height: Math.round(box.height) });
    });
    ro.observe(el);
    const dark = matchMedia('(prefers-color-scheme: dark)');
    dark.addEventListener('change', themeChanged);
    window.addEventListener('themechange', themeChanged);
    return () => {
      ro.disconnect();
      dark.removeEventListener('change', themeChanged);
      window.removeEventListener('themechange', themeChanged);
    };
    // the 3D view replaces the stage; watch the new one when the flat graph comes back
  }, [view3d]);

  /** show a range: centred, both directions in view (x and y keep one scale) */
  const fitTo = (r: Range, margin = 0.92) => {
    if (!size.width || !size.height || !(r.xmax > r.xmin) || !(r.ymax > r.ymin)) return;
    const scale = Math.min(size.width / (r.xmax - r.xmin), size.height / (r.ymax - r.ymin)) * margin;
    setView({ cx: (r.xmin + r.xmax) / 2, cy: (r.ymin + r.ymax) / 2, scale: Math.min(1e7, Math.max(1e-6, scale)) });
  };
  // a template asks for its range
  useEffect(() => {
    if (!fit || fit.nonce === fitDone || !size.width || !size.height) return;
    fitTo(fit.range);
    setFitDone(fit.nonce);
    // fitTo reads size, which is a dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, fitDone, size]);
  // zoom box: Shift+drag, or drag after pressing the zoom-box button
  const [boxMode, setBoxMode] = useState(false);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const fitCurves = () => {
    const r = fitRange(drawn, xmin(viewport), xmax(viewport), ymin(viewport), ymax(viewport));
    if (r) fitTo(r, 1);
  };

  // the trace: the point on the selected y = f(x) curve under the pointer
  const trace = useMemo(() => {
    if (!hover || !explicit || !size.width) return null;
    const [x] = planeAt(viewport, hover.px, hover.py);
    const y = explicit.fn(x);
    if (!Number.isFinite(y) || (explicit.mask && !explicit.mask(x, y, NaN))) return null;
    return { x, y };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, explicit, view, size]);

  // a point of interest under the pointer
  const hoverPoi = useMemo(() => {
    if (!hover) return null;
    return pois.find((p) => Math.hypot(toPx(viewport, p.x) - hover.px, toPy(viewport, p.y) - hover.py) < 9) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, pois, view, size]);

  // draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width || !size.height) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scene = buildScene(drawn, viewport, sceneOpts);
    sceneRef.current = scene;
    const theme = exam ? EXAM_THEME : readTheme(wrapRef.current!);
    drawScene(ctx, scene, theme);

    // the selected curve, drawn again thicker, with its points of interest
    const sel = scene.curves.find((c) => c.id === selected);
    if (sel && !exam) {
      const color = sel.color ?? theme.curves[sel.series % theme.curves.length]!;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = (sel.width ?? theme.curveWidth) + 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash(dashPattern(sel, false, ctx.lineWidth));
      ctx.beginPath();
      for (const l of sel.lines) {
        for (let k = 0; k + 1 < l.length; k += 2) (k === 0 ? ctx.moveTo : ctx.lineTo).call(ctx, l[k]!, l[k + 1]!);
      }
      for (let k = 0; k + 3 < sel.segs.length; k += 4) {
        ctx.moveTo(sel.segs[k]!, sel.segs[k + 1]!);
        ctx.lineTo(sel.segs[k + 2]!, sel.segs[k + 3]!);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const paper = getComputedStyle(wrapRef.current!).getPropertyValue('--color-paper').trim();
      for (const p of pois) {
        ctx.beginPath();
        ctx.arc(toPx(viewport, p.x), toPy(viewport, p.y), 5, 0, Math.PI * 2);
        ctx.fillStyle = paper;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      if (trace) {
        ctx.beginPath();
        ctx.arc(toPx(viewport, trace.x), toPy(viewport, trace.y), 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.restore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, view, size, figure, themeVersion, seriesOf, selected, pois, trace, look]);

  // wheel zoom needs a non-passive listener to keep the page from scrolling
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      setView((v) => {
        const z = zoomAt({ ...v, ...size }, factor, e.clientX - rect.left, e.clientY - rect.top);
        return { cx: z.cx, cy: z.cy, scale: z.scale };
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
    // the canvas comes back after the 3D view, so listen again then
  }, [size, view3d]);

  const local = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const apply = (next: Viewport) => setView({ cx: next.cx, cy: next.cy, scale: next.scale });

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture is a convenience for drags that leave the canvas; carry on without it
    }
    const p = local(e);
    if ((boxMode || e.shiftKey) && pointers.current.size === 0 && e.button === 0) {
      setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    pointers.current.set(e.pointerId, p);
    pressedAt.current = pointers.current.size === 1 ? { ...p, moved: false } : null;
    // pressing on a point written as let A = (x, y) picks it up instead of panning
    const reach = e.pointerType === 'touch' ? 22 : 10;
    const hit = pointers.current.size === 1
      ? graphables.find((g) => g.kind === 'point' && g.drag && g.label && Math.hypot(toPx(viewport, g.x) - p.x, toPy(viewport, g.y) - p.y) <= reach)
      : undefined;
    dragging.current = hit?.kind === 'point' ? hit.label! : null;
  };
  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    if (box) {
      setBox({ ...box, x1: p.x, y1: p.y });
      return;
    }
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') setHover({ px: p.x, py: p.y });
      return;
    }
    const press = pressedAt.current;
    if (press && Math.hypot(p.x - press.x, p.y - press.y) > CLICK_SLOP) press.moved = true;
    if (dragging.current && map.size === 1) {
      // snap to the minor grid; Shift for a finer step
      const step = gridStep(viewport.scale).minor / (e.shiftKey ? 10 : 1);
      const [x, y] = planeAt(viewport, p.x, p.y).map((c) => Math.round(c / step) * step) as [number, number];
      onMovePoint(dragging.current, Number(x.toPrecision(12)), Number(y.toPrecision(12)));
      map.set(e.pointerId, p);
      return;
    }
    if (map.size === 1) {
      if (!press || press.moved) apply(panBy(viewport, p.x - prev.x, p.y - prev.y));
    } else if (map.size === 2) {
      // pinch: zoom by the change in finger distance, around their midpoint
      const other = [...map.entries()].find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(p.x - other.x, p.y - other.y);
      if (before > 0) apply(zoomAt(viewport, after / before, (p.x + other.x) / 2, (p.y + other.y) / 2));
    }
    map.set(e.pointerId, p);
  };
  const onPointerEnd = (e: PointerEvent<HTMLCanvasElement>) => {
    if (box) {
      setBox(null);
      setBoxMode(false);
      // a box too small to mean anything is a slip
      if (e.type === 'pointerup' && Math.abs(box.x1 - box.x0) > 8 && Math.abs(box.y1 - box.y0) > 8) {
        const [ax, ay] = planeAt(viewport, Math.min(box.x0, box.x1), Math.max(box.y0, box.y1));
        const [bx, by] = planeAt(viewport, Math.max(box.x0, box.x1), Math.min(box.y0, box.y1));
        fitTo({ xmin: ax, xmax: bx, ymin: ay, ymax: by }, 1);
      }
      return;
    }
    const press = pressedAt.current;
    pointers.current.delete(e.pointerId);
    pressedAt.current = null;
    const dragged = dragging.current !== null && press?.moved;
    dragging.current = null;
    if (dragged || e.type !== 'pointerup' || !press || press.moved || !sceneRef.current) return;
    // a click: a point of interest pins its label, a curve selects, empty space clears
    const p = local(e);
    const poi = pois.find((q) => Math.hypot(toPx(viewport, q.x) - p.x, toPy(viewport, q.y) - p.y) < 9);
    if (poi) return setPinned(poi);
    const hit = curveAt(sceneRef.current, p.x, p.y, e.pointerType === 'touch' ? 20 : 10);
    // with a field selected, a click away from other curves draws a solution through it
    if (selectedGraph?.kind === 'field' && (hit === null || hit === selectedGraph.id)) {
      const step = gridStep(viewport.scale).minor / 10;
      const [x, y] = planeAt(viewport, p.x, p.y).map((c) => Number((Math.round(c / step) * step).toPrecision(10))) as [number, number];
      return onAddSeed(selectedGraph.id, x, y);
    }
    onSelect(hit);
    if (e.pointerType === 'touch') setHover({ px: p.x, py: p.y });
  };

  const zoom = (factor: number) => apply(zoomAt(viewport, factor, size.width / 2, size.height / 2));
  const onKey = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const step = 40;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[e.key]) {
      e.preventDefault();
      apply(panBy(viewport, ...moves[e.key]!));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoom(1.25);
    } else if (e.key === '-') {
      e.preventDefault();
      zoom(0.8);
    } else if (e.key === '0') {
      e.preventDefault();
      setView(DEFAULT_VIEW);
    } else if (e.key === 'Escape') {
      onSelect(null);
    }
  };

  const doExport = async (kind: 'svg' | 'png' | 'pdf' | 'tex') => {
    const el = wrapRef.current!;
    const name = exam ? 'figure' : 'graph';
    if (kind === 'pdf') return exportPdf(graphables, viewport, sceneOpts, el, name);
    if (kind === 'tex') return exportTikz(graphables, viewport, sceneOpts, el, name);
    const svg = graphSvg(graphables, viewport, sceneOpts, el);
    if (kind === 'svg') exportSvg(svg, name);
    else await exportPng(svg, size.width, size.height, name);
  };

  const animName = sliders.some((s) => s.name === animated) ? animated! : sliders[0]?.name ?? null;
  const doAnimate = async (kind: 'gif' | 'video') => {
    const slider = sliders.find((s) => s.name === animName);
    if (!slider || making) return;
    setAnimError(false);
    setMaking({ kind, pct: 0 });
    const run = kind === 'gif' ? exportGif : exportVideo;
    try {
      await run(sweep(slider.name), viewport, sceneOpts, wrapRef.current!, `${exam ? 'figure' : 'graph'}-${slider.name}`, (pct) => setMaking({ kind, pct }));
    } catch {
      setAnimError(true);
    } finally {
      setMaking(null);
    }
  };
  const canRecord = useMemo(() => videoType() !== null, []);

  const describe = (p: Poi) =>
    `${t.poiKind[p.kind]}${p.kind === 'intersection' ? ` ${t.poiWith(lineNumber(p.ids[1]!))}` : ''} ${at(p)}`;
  const described = graphables.map((g) => (g.kind === 'point' ? `${g.label ?? ''} (${coordinate(g.x)}, ${coordinate(g.y)})` : g.label)).join('; ');
  const tip = hoverPoi ?? pinned;
  const readout = trace ? { x: trace.x, y: trace.y } : hover ? (([x, y]) => ({ x, y }))(planeAt(viewport, hover.px, hover.py)) : null;

  const styles = (
    <div className="segmented" role="group" aria-label={t.graphStyle}>
      {(
        [
          ['screen', t.graphView],
          ['3d', t.view3d],
          ['exam', t.examView],
        ] as const
      ).map(([style, name]) => (
        <button key={style} type="button" aria-pressed={figure.style === style} onClick={() => onFigure({ ...figure, style })}>
          {name}
        </button>
      ))}
    </div>
  );

  const exportMenu = (items: MenuItem[]) => <Menu label={t.moreExport} listLabel={t.exportLabel} items={items} />;
  const templatesMenu = (
    <Menu
      label={teach.templates}
      listLabel={teach.templatesLabel}
      align="left"
      items={FIGURE_TEMPLATES.map((tpl) => ({ key: tpl.id, label: tpl.name[lang], note: tpl.note[lang], run: () => onTemplate(tpl) }))}
    />
  );

  if (view3d) {
    return (
      <div className="graph">
        <Suspense fallback={<div className="graph__stage graph3d"><p className="graph3d__failed">{t.loading3d}</p></div>}>
          <Graph3D ref={view3dRef} surfaces={surfaces} seriesOf={seriesOf} t={t} onInsert={onInsert} />
        </Suspense>
        <div className="hud hud--top-left">{styles}</div>
        <div className="hud hud--top-right">
          {exportMenu([{ key: 'png', label: 'PNG', run: () => view3dRef.current?.png() }])}
          <div className="hud-stack" role="group" aria-label={t.zoom}>
            <button type="button" className="hud-btn hud-btn--icon" aria-label={t.resetView} title={t.resetView} onClick={() => view3dRef.current?.reset()}>
              <HomeIcon />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const info = !exam && (selectedGraph || complexShown || sliders.length > 0);

  return (
    <div className="graph">
      <div className="graph__stage" ref={wrapRef} data-style={figure.style}>
        <canvas
          ref={canvasRef}
          className={`graph__canvas${boxMode ? ' graph__canvas--box' : ''}`}
          tabIndex={0}
          role="img"
          aria-label={graphables.length ? t.graphOf(described) : t.graphEmptyLabel}
          aria-describedby="graph-help"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
          onDoubleClick={(e) => {
            const p = local(e);
            apply(zoomAt(viewport, 2, p.x, p.y));
          }}
          onKeyDown={onKey}
        />
        {box && (
          <div
            className="zoombox"
            aria-hidden="true"
            style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }}
          />
        )}
        {tip && !exam && (
          <span className="graph__tip num" style={{ left: toPx(viewport, tip.x), top: toPy(viewport, tip.y) }} aria-hidden="true">
            {describe(tip)}
          </span>
        )}
        {readout && !exam && (
          <span className="graph__readout num" aria-hidden="true">
            ({coordinate(Number(readout.x.toPrecision(4)))}, {coordinate(Number(readout.y.toPrecision(4)))})
          </span>
        )}
        {graphables.length === 0 && (
          <div className="graph__empty">
            <p>{t.graphEmpty}</p>
            <ul className="examples__list">
              {GRAPH_EXAMPLES.map((ex) => (
                <li key={ex}>
                  <button type="button" className="example" aria-label={t.insert(ex)} onClick={() => onInsert(ex)}>
                    <MathText text={ex} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="hud hud--top-left">
        {styles}
        {templatesMenu}
        <button type="button" className="hud-btn" aria-pressed={figure.axes} onClick={() => onFigure({ ...figure, axes: !figure.axes })}>
          {t.axes}
        </button>
        {!exam && (
          <GraphSettings
            t={t}
            figure={figure}
            onFigure={onFigure}
            range={{ xmin: xmin(viewport), xmax: xmax(viewport), ymin: ymin(viewport), ymax: ymax(viewport) }}
            onRange={(r) => fitTo(r, 1)}
          />
        )}
        {exam && (
          <>
            <button type="button" className="hud-btn" aria-pressed={figure.axisNumbers} onClick={() => onFigure({ ...figure, axisNumbers: !figure.axisNumbers })}>
              {t.axisNumbers}
            </button>
            <button type="button" className="hud-btn" aria-pressed={figure.curveLabels} onClick={() => onFigure({ ...figure, curveLabels: !figure.curveLabels })}>
              {t.curveLabels}
            </button>
          </>
        )}
      </div>

      <div className="hud hud--top-right">
        {exportMenu([
          ...(['svg', 'png', 'pdf', 'tex'] as const).map((kind) => ({ key: kind, label: kind === 'tex' ? 'TikZ' : kind.toUpperCase(), run: () => void doExport(kind) })),
          {
            key: 'sheet',
            label: teach.addToSheet,
            run: () =>
              onAddFigure({
                range: { xmin: xmin(viewport), xmax: xmax(viewport), ymin: ymin(viewport), ymax: ymax(viewport) },
                axes: figure.axes,
                axisNumbers: figure.axisNumbers,
                curveLabels: figure.curveLabels,
              }),
          },
        ])}
        <div className="hud-stack" role="group" aria-label={t.zoom}>
          <button type="button" className="hud-btn hud-btn--icon" aria-label={t.zoomIn} title={t.zoomIn} onClick={() => zoom(1.25)}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
          <button type="button" className="hud-btn hud-btn--icon" aria-label={t.zoomOut} title={t.zoomOut} onClick={() => zoom(0.8)}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
          <button type="button" className="hud-btn hud-btn--icon" aria-label={t.resetView} title={t.resetView} onClick={() => setView(DEFAULT_VIEW)}>
            <HomeIcon />
          </button>
          <button type="button" className="hud-btn hud-btn--icon" aria-label={t.zoomBox} title={t.zoomBoxHint} aria-pressed={boxMode} onClick={() => setBoxMode((b) => !b)}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M2.5 5V2.5H5M11 2.5h2.5V5M13.5 11v2.5H11M5 13.5H2.5V11" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <path d="M6.5 8h3M8 6.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="hud-btn hud-btn--icon" aria-label={t.fitCurves} title={t.fitCurves} disabled={!drawn.length} onClick={fitCurves}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M2.5 5.5V2.5h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 11c1.5-5 3-5 4-2s2.5 3 4-2" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {info && (
        <div className="hud hud--bottom-left">
          <section className="info" aria-live="polite">
            {selectedGraph && (
              <div className="info__section">
                <h3 className="info__title">
                  <span className="swatch" style={{ '--swatch': swatchOf(selectedGraph.id) } as React.CSSProperties} />
                  <MathText text={selectedGraph.label ?? ''} />
                </h3>
                {selectedGraph.kind === 'field' ? (
                  <p className="info__hint">{t.fieldHint}</p>
                ) : !explicit ? (
                  <p className="info__hint">{t.poiOnlyExplicit}</p>
                ) : explaining ? (
                  <Explain fn={explicit.fn} s={learn} />
                ) : pois.length === 0 ? (
                  <p className="info__hint">{t.poiNone}</p>
                ) : (
                  <ul className="poi__list">
                    {pois.map((p) => (
                      <li key={`${p.kind}-${p.x}-${p.ids.join()}`}>
                        <button
                          type="button"
                          className="poi__item"
                          aria-pressed={pinned === p}
                          aria-label={t.pinPoint(describe(p))}
                          onClick={() => setPinned(pinned === p ? null : p)}
                        >
                          <span>
                            {t.poiKind[p.kind]}
                            {p.kind === 'intersection' && <span className="poi__with"> {t.poiWith(lineNumber(p.ids[1]!))}</span>}
                          </span>
                          <span className="num poi__at">{at(p)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {explicit && (
                  <button type="button" className="btn btn--small btn--link info__explain" aria-expanded={explaining} onClick={() => setExplaining((v) => !v)}>
                    {explaining ? learn.explainHide : learn.explainTitle}
                  </button>
                )}
              </div>
            )}
            {complexShown && <p className="info__hint">{t.domainLegend(complexShown.label ?? '')}</p>}
            {sliders.length > 0 && (
              <div className="info__section animate" role="group" aria-label={t.animation}>
                <span className="animate__title">{t.animation}</span>
                {sliders.length > 1 ? (
                  <select className="animate__pick" aria-label={t.animateWhich} value={animName ?? ''} onChange={(e) => setAnimated(e.target.value)}>
                    {sliders.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="animate__name">{animName}</span>
                )}
                <button type="button" className="btn btn--small" disabled={making !== null} onClick={() => void doAnimate('gif')}>
                  GIF
                </button>
                {canRecord && (
                  <button type="button" className="btn btn--small" disabled={making !== null} onClick={() => void doAnimate('video')}>
                    {t.video}
                  </button>
                )}
                <span className="animate__status" aria-live="polite">
                  {making ? (making.kind === 'video' ? `${t.recording} ${making.pct}%` : t.making(making.pct)) : animError ? t.noVideo : ''}
                </span>
              </div>
            )}
          </section>
        </div>
      )}
      <p id="graph-help" className="visually-hidden">
        {t.graphHelp}
      </p>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2.5 7.5L8 3l5.5 4.5M4 6.5V13h8V6.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
    </svg>
  );
}
