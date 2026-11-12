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
import { download, exportPdf, exportPng, exportSvg, exportTikz, graphSvg, readTheme } from './exportGraph';
import { canvasToPdf, svgToCanvas } from '../geo/exportFigure';
import { exportGif, exportVideo, videoType, type Sweep } from './animate';
import { MathText } from '../components/MathText';
import { Menu, type MenuItem } from './Menu';
import { fromLocal, nice, toLocal, type GraphPicture } from './pictures';
import { useNumberForm } from '../numberForm';
import { exactNumber, prettyExact, toFraction } from '../calc/fraction';
import { crossingsWith, exactCrossing, literalPoints, pointNames, primOfShape, setLiteral, shiftLiterals, type Prim } from './handles';
import { decodedImage, pickPicture, pictureFile, readPicture, type Picture } from '../pictures';
import { GraphSettings } from './GraphSettings';
import { fitRange } from './fit';
import { FIGURE_TEMPLATES, type FigureTemplate, type Range } from '../teach/templates';
import type { TeachStrings } from '../teach/strings';
import type { Lang } from '../i18n';
import { Explain } from '../learn/Explain';
import { MathInput } from '../components/MathInput';
import { plainGuide, prettyGuide } from './guideText';
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
  /** exam guides changed by hand: new text by `id:x` / `id:y`, or null for one taken out */
  guides?: Record<string, string | null>;
}

const GRAPH_EXAMPLES = ['y = x^2 - 2x', 'x^2 + y^2 = 9', 'r = 1 + cos(θ)', '(cos(3t), sin(2t))', 'y < sin(x)', 'let P = (1, -1)'];

/** A movement smaller than this between press and release is a click, not a drag. */
const CLICK_SLOP = 4;

type Corner = 'nw' | 'ne' | 'se' | 'sw';

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
  pictures,
  setPictures,
  picSel,
  onPicSel,
  placeRef,
  sourceOf,
  onEditLine,
  onDeleteLine,
  onAddPoint,
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
  /** the graph's images; the expression list shows and edits them too */
  pictures: GraphPicture[];
  setPictures: React.Dispatch<React.SetStateAction<GraphPicture[]>>;
  picSel: string | null;
  onPicSel: (id: string | null) => void;
  /** set to a function that places a picture in the middle of the view */
  placeRef: React.MutableRefObject<((pic: Picture) => void) | null>;
  /** a line's text, to edit a shape by the numbers in it */
  sourceOf: (id: string) => string | undefined;
  onEditLine: (id: string, source: string) => void;
  onDeleteLine: (id: string) => void;
  /** marks a point (a crossing, a point of interest) as a new line */
  onAddPoint: (x: number, y: number) => void;
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
  const [overPoint, setOverPoint] = useState(false);
  /** exam lengths: where each is, the one picked, the one being retyped */
  const [guideSpots, setGuideSpots] = useState<{ ref: string; text: string; x: number; y: number; w: number; h: number }[]>([]);
  const [guideSel, setGuideSel] = useState<string | null>(null);
  const [guideEdit, setGuideEditState] = useState<string | null>(null);
  /** what is being typed for a length, written as a line is (integrate(f(x), x), sqrt(3)/2) */
  const [guideDraft, setGuideDraft] = useState('');
  const setGuideEdit = (ref: string | null) => {
    if (ref) {
      const own = figure.guides?.[ref];
      setGuideDraft(typeof own === 'string' ? own : plainGuide(guideSpots.find((q) => q.ref === ref)?.text ?? ''));
    }
    setGuideEditState(ref);
  };
  const commitGuide = (ref: string) => {
    if (guideEdit !== ref) return;
    const v = guideDraft.trim();
    setGuide(ref, v ? v : null);
    setGuideEditState(null);
    setGuideSel(null);
    wrapRef.current?.querySelector<HTMLCanvasElement>('canvas')?.focus();
  };
  const setGuide = (ref: string, text: string | null | undefined) => {
    const next = { ...(figure.guides ?? {}) };
    if (text === undefined) delete next[ref];
    else next[ref] = text;
    onFigure({ ...figure, guides: next });
  };
  const [tool, setTool] = useState<'select' | 'point' | 'pen'>('select');
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
  const numberForm = useNumberForm();
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
    // fractions beside points when numbers are shown exactly (11/5, not 2.2)
    // typed lengths are kept as written and printed as an exam sets them
    guideText: figure.guides && Object.fromEntries(Object.entries(figure.guides).map(([k, v]) => [k, v === null ? null : prettyGuide(v)])),
    coord: numberForm === 'exact' ? (n: number) => (Number.isInteger(n) ? String(n) : prettyExact(toFraction(n, 1000) ?? exactNumber(n)) ?? coordinate(n)) : undefined,
  };

  const selectedGraph = graphables.find((g) => g.id === selected && g.kind !== 'point') ?? null;
  // the selected shape's handles: the pairs written in its line, and the named points it is built on
  const shapeSource = selectedGraph?.kind === 'shape' ? (sourceOf(selectedGraph.id) ?? '') : '';
  const shapeHandles = useMemo(() => {
    if (!shapeSource) return { literals: [], named: [] as { name: string; x: number; y: number }[] };
    const own = shapeSource.match(/^\s*(?:let\s+|const\s+)?([A-Za-z]\w*)\s*=/)?.[1];
    const named = pointNames(shapeSource)
      .filter((n) => n !== own)
      .flatMap((n) => {
        const g = graphables.find((q) => q.kind === 'point' && q.label === n && q.drag);
        return g && g.kind === 'point' ? [{ name: n, x: g.x, y: g.y }] : [];
      });
    return { literals: literalPoints(shapeSource), named };
  }, [shapeSource, graphables]);
  /** a whole shape being moved: its line as it was, and its named points where they were */
  const shapeDrag = useRef<{ id: string; start: [number, number]; src: string; named: { name: string; x: number; y: number }[]; moved: boolean } | null>(null);
  const handleDrag = useRef<{ id: string; src: string; k: number } | { name: string } | null>(null);
  /** where the selected curve or shape crosses the others, in plane coordinates */
  const [crossings, setCrossings] = useState<{ x: number; y: number }[]>([]);
  const explicit = selectedGraph?.kind === 'curve' && selectedGraph.dir === 'y' ? selectedGraph : null;
  const pois = useMemo(
    () => (selectedGraph && size.width ? pointsOfInterest(graphables, viewport, selectedGraph.id) : []),
    // viewport is rebuilt from view and size
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphables, selectedGraph, view, size],
  );
  /** with the point tool, every curve's roots, turning points and crossings are places a point snaps to */
  const snapPois = useMemo(
    () =>
      tool === 'point' && size.width
        ? graphables
            .filter((g) => g.kind === 'curve' && g.dir === 'y')
            .slice(0, 8)
            .flatMap((g) => pointsOfInterest(graphables, viewport, g.id))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphables, tool, view, size],
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
  /** a phone's folded graph options, opened */
  const [hudOpen, setHudOpen] = useState(false);
  // pictures under the curves, like Desmos images; the list keeps them, one selected at a time
  const [picsReady, picLoaded] = useReducer((n: number) => n + 1, 0);
  const picDrag = useRef<{ id: string; mode: 'move' | 'rot' | Corner; start: [number, number]; orig: GraphPicture } | null>(null);
  const picture = pictures.find((p) => p.id === picSel) ?? null;
  const setPicSel = onPicSel;
  const patchPicture = (id: string, patch: Partial<GraphPicture>) => setPictures((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const placePicture = (pic: Picture, at?: [number, number]) => {
    const vw = (size.width || 800) / view.scale;
    const vh = (size.height || 600) / view.scale;
    const aspect = pic.w / pic.h;
    const w = Math.min(vw * 0.6, vh * 0.6 * aspect);
    const id = Math.random().toString(36).slice(2, 10);
    setPictures((ps) => [...ps, { id, src: pic.src, name: pic.name, cx: nice(at?.[0] ?? view.cx), cy: nice(at?.[1] ?? view.cy), w: nice(w), h: nice(w / aspect), angle: 0, opacity: 1 }]);
    setPicSel(id);
    onSelect(null);
  };
  placeRef.current = placePicture;
  const addPicture = async () => {
    const pic = await pickPicture();
    if (pic) placePicture(pic);
  };
  const pictureAt = (px: number, py: number) => {
    const [x, y] = planeAt(viewport, px, py);
    for (let k = pictures.length - 1; k >= 0; k--) {
      const p = pictures[k]!;
      const [u, v] = toLocal(p, x, y);
      if (Math.abs(u) <= p.w / 2 && Math.abs(v) <= p.h / 2) return p.id;
    }
    return null;
  };
  const onPicDown = (e: PointerEvent<HTMLElement>, mode: 'move' | 'rot' | Corner) => {
    if (!picture || e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = canvasRef.current!.getBoundingClientRect();
    picDrag.current = { id: picture.id, mode, start: planeAt(viewport, e.clientX - r.left, e.clientY - r.top) as [number, number], orig: picture };
  };
  const onPicMove = (e: PointerEvent<HTMLElement>) => {
    const d = picDrag.current;
    if (!d) return;
    const r = canvasRef.current!.getBoundingClientRect();
    const [x, y] = planeAt(viewport, e.clientX - r.left, e.clientY - r.top);
    const o = d.orig;
    if (d.mode === 'move') return patchPicture(d.id, { cx: nice(o.cx + x - d.start[0]), cy: nice(o.cy + y - d.start[1]) });
    const angle = o.angle ?? 0;
    if (d.mode === 'rot') {
      // the handle sits straight above the centre: its direction, less a quarter turn
      let t = Math.atan2(y - o.cy, x - o.cx) - Math.PI / 2;
      if (e.shiftKey) t = Math.round(t / (Math.PI / 12)) * (Math.PI / 12);
      t = Math.atan2(Math.sin(t), Math.cos(t));
      return patchPicture(d.id, { angle: Number(t.toPrecision(6)) });
    }
    // in the picture's own frame the opposite corner stays put
    const sx = d.mode.includes('w') ? -1 : 1;
    const sy = d.mode.includes('n') ? 1 : -1;
    const [au, av] = [(-sx * o.w) / 2, (-sy * o.h) / 2];
    const [u, v] = toLocal(o, x, y);
    const min = 4 / view.scale;
    let w = Math.max(min, sx * (u - au));
    let h = Math.max(min, sy * (v - av));
    if (e.shiftKey) {
      const k = Math.max(w / o.w, h / o.h);
      [w, h] = [o.w * k, o.h * k];
    }
    const [cx, cy] = fromLocal([o.cx, o.cy], angle, au + (sx * w) / 2, av + (sy * h) / 2);
    patchPicture(d.id, { w: nice(w), h: nice(h), cx: nice(cx), cy: nice(cy) });
  };
  const onPicUp = () => {
    picDrag.current = null;
  };
  const onDropPicture = async (e: React.DragEvent) => {
    const file = pictureFile(e.dataTransfer);
    if (!file) return;
    e.preventDefault();
    const pic = await readPicture(file);
    if (!pic) return;
    const r = canvasRef.current!.getBoundingClientRect();
    placePicture(pic, planeAt(viewport, e.clientX - r.left, e.clientY - r.top) as [number, number]);
  };
  // the pen: anchors in plane coordinates, each with one handle (the other mirrors it)
  /** the graph's tools: select (pick, move, reshape), point (drop a point), pen (draw a curve) */
  const penMode = tool === 'pen';
  const setPenMode = (on: boolean) => setTool(on ? 'pen' : 'select');
  const chooseTool = (next: 'select' | 'point' | 'pen') => {
    if (penMode && next !== 'pen') finishPen(false);
    setTool(next);
    setBoxMode(false);
    setGuideSel(null);
  };
  const [pen, setPen] = useState<{ x: number; y: number; out?: { x: number; y: number } }[]>([]);
  const penDrag = useRef<{ k: number; px: number; py: number; moved: boolean } | null>(null);
  const finishPen = (closed: boolean) => {
    const nodes = pen;
    setPen([]);
    if (nodes.length < 2) return;
    const f = (v: number) => String(Number(v.toFixed(2)));
    const pt = (x: number, y: number) => `(${f(x)}, ${f(y)})`;
    const parts = [pt(nodes[0]!.x, nodes[0]!.y)];
    const piece = (a: (typeof nodes)[number], b: (typeof nodes)[number]) => {
      const ao = a.out ?? { x: 0, y: 0 };
      const bo = b.out ?? { x: 0, y: 0 };
      parts.push(pt(a.x + ao.x, a.y + ao.y), pt(b.x - bo.x, b.y - bo.y), pt(b.x, b.y));
    };
    for (let k = 0; k + 1 < nodes.length; k++) piece(nodes[k]!, nodes[k + 1]!);
    if (closed) piece(nodes[nodes.length - 1]!, nodes[0]!);
    onInsert(`bezier(${parts.join(', ')})`);
    // back to selecting, so the new curve can be picked, moved or deleted
    setPenMode(false);
  };
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
    // the exam's lengths, as boxes the select tool can pick
    setGuideSpots(
      exam
        ? scene.labels.flatMap((l) => {
            if (!l.ref) return [];
            const tall = /^[\u2212-]?[^/\s()∫]+\/[^/\s()]+$/.test(l.text);
            const h = tall ? 30 : 18;
            const w = Math.max(16, (tall ? Math.max(...l.text.replace(/^[\u2212-]/, '').split('/').map((s) => s.length)) + 1.5 : l.text.length) * 8.5);
            const x = l.anchor === 'start' ? l.x : l.anchor === 'middle' ? l.x - w / 2 : l.x - w;
            const y = l.baseline === 'top' ? l.y : l.baseline === 'middle' ? l.y - h / 2 : l.y - h;
            return [{ ref: l.ref, text: l.text, x, y, w, h }];
          })
        : [],
    );
    const theme = exam ? EXAM_THEME : readTheme(wrapRef.current!);
    drawScene(ctx, scene, theme, (c) => {
      for (const p of pictures) {
        const img = decodedImage(p.src, picLoaded);
        if (!img) continue;
        c.save();
        c.globalAlpha = Math.max(0, Math.min(1, p.opacity));
        c.translate(toPx(viewport, p.cx), toPy(viewport, p.cy));
        c.rotate(-(p.angle ?? 0));
        const [w, h] = [p.w * viewport.scale, p.h * viewport.scale];
        c.drawImage(img, -w / 2, -h / 2, w, h);
        c.restore();
      }
    });

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
  }, [drawn, view, size, figure, themeVersion, seriesOf, selected, pois, trace, look, pictures, picsReady, numberForm]);
  // where the selection crosses the other curves and shapes; with the point tool, where any two cross
  // (points of interest already show their own)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || penMode || (exam && tool !== 'point') || (!selectedGraph && tool !== 'point')) return setCrossings([]);
    const pieces = new Map<string, number[]>();
    for (const c of scene.curves) {
      const id = c.id.split(':')[0]!;
      const into = pieces.get(id) ?? [];
      for (const l of c.lines) for (let k = 0; k + 3 < l.length; k += 2) into.push(l[k]!, l[k + 1]!, l[k + 2]!, l[k + 3]!);
      for (let k = 0; k + 3 < c.segs.length; k += 4) into.push(c.segs[k]!, c.segs[k + 1]!, c.segs[k + 2]!, c.segs[k + 3]!);
      pieces.set(id, into);
    }
    const ids = [...pieces.keys()].slice(0, 16);
    const pairs: [string, string][] = selectedGraph
      ? ids.filter((id) => id !== selectedGraph.id).map((id) => [selectedGraph.id, id])
      : ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b] as [string, string]));
    const primOf = (id: string, near: { x: number; y: number }): Prim | null => {
      const g = graphables.find((q) => q.id === id);
      if (g?.kind === 'curve' && g.dir === 'y') return { kind: 'fn', f: g.fn };
      if (g?.kind === 'shape') return primOfShape(g.shape as Parameters<typeof primOfShape>[0], near);
      return null;
    };
    const found: { x: number; y: number }[] = [];
    for (const [a, b] of pairs) {
      const pa = pieces.get(a);
      const pb = pieces.get(b);
      if (!pa?.length || !pb?.length) continue;
      for (const q of crossingsWith(pa, pb, 30)) {
        let [x, y] = planeAt(viewport, q.x, q.y) as [number, number];
        // worked out exactly from what the two are (curves, sides, lines, circles), when it can be
        const [pa2, pb2] = [primOf(a, { x, y }), primOf(b, { x, y })];
        const exact = pa2 && pb2 ? exactCrossing(pa2, pb2, { x, y }, 3 / viewport.scale) : null;
        if (exact && Number.isFinite(exact.x) && Number.isFinite(exact.y) && Math.hypot(exact.x - x, exact.y - y) * viewport.scale < 6) [x, y] = [exact.x, exact.y];
        const clean = (v: number) => (Math.abs(v - Math.round(v * 1e9) / 1e9) < 1e-10 ? Math.round(v * 1e9) / 1e9 : v);
        const pt = { x: clean(x), y: clean(y) };
        if (!found.some((o) => Math.hypot(toPx(viewport, o.x) - toPx(viewport, pt.x), toPy(viewport, o.y) - toPy(viewport, pt.y)) < 6)) found.push(pt);
      }
    }
    // a crossing already marked by a point (or shown as a point of interest) isn't offered again
    const taken = [...pois, ...graphables.filter((g): g is Extract<Graphable, { kind: 'point' }> => g.kind === 'point')];
    setCrossings(found.filter((q) => !taken.some((p) => Math.hypot(toPx(viewport, p.x) - toPx(viewport, q.x), toPy(viewport, p.y) - toPy(viewport, q.y)) < 8)).slice(0, 80));
    // the scene is read after the draw above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, view, size, selected, pois, tool]);

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
    if (penMode && pointers.current.size === 0 && e.button === 0 && e.isPrimary) {
      const first = pen[0];
      if (first && pen.length >= 2 && Math.hypot(toPx(viewport, first.x) - p.x, toPy(viewport, first.y) - p.y) <= (e.pointerType === 'touch' ? 22 : 10)) {
        finishPen(true);
        return;
      }
      // anchors land on the minor grid; Shift for a finer step
      const step = gridStep(viewport.scale).minor / (e.shiftKey ? 10 : 2);
      const [x, y] = planeAt(viewport, p.x, p.y).map((c) => Number((Math.round(c / step) * step).toPrecision(12))) as [number, number];
      penDrag.current = { k: pen.length, px: p.x, py: p.y, moved: false };
      setPen((ns) => [...ns, { x, y }]);
      return;
    }
    if ((boxMode || e.shiftKey) && pointers.current.size === 0 && e.button === 0) {
      setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    // a press on the selected shape picks the whole shape up
    if (selectedGraph?.kind === 'shape' && !exam && e.button === 0 && pointers.current.size === 0 && sceneRef.current && (shapeHandles.literals.length || shapeHandles.named.length)) {
      if (curveAt(sceneRef.current, p.x, p.y, e.pointerType === 'touch' ? 20 : 10) === selectedGraph.id) {
        shapeDrag.current = { id: selectedGraph.id, start: planeAt(viewport, p.x, p.y) as [number, number], src: shapeSource, named: shapeHandles.named, moved: false };
        pointers.current.set(e.pointerId, p);
        pressedAt.current = { ...p, moved: false };
        return;
      }
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
    const drag = penDrag.current;
    if (drag) {
      if (!drag.moved && Math.hypot(p.x - drag.px, p.y - drag.py) < CLICK_SLOP) return;
      drag.moved = true;
      const [wx, wy] = planeAt(viewport, p.x, p.y);
      setPen((ns) => ns.map((n, k) => (k === drag.k ? { ...n, out: { x: wx - n.x, y: wy - n.y } } : n)));
      return;
    }
    const sd = shapeDrag.current;
    if (sd) {
      const press = pressedAt.current;
      if (!sd.moved && press && Math.hypot(p.x - press.x, p.y - press.y) < CLICK_SLOP) return;
      sd.moved = true;
      if (press) press.moved = true;
      // moved in whole grid steps (Shift for finer), so the numbers stay simple
      const step = gridStep(viewport.scale).minor / (e.shiftKey ? 10 : 2);
      const [x, y] = planeAt(viewport, p.x, p.y);
      const [dx, dy] = [Math.round((x - sd.start[0]) / step) * step, Math.round((y - sd.start[1]) / step) * step];
      const next = shiftLiterals(sd.src, dx, dy);
      if (next !== sd.src || dx || dy) onEditLine(sd.id, next);
      for (const n of sd.named) onMovePoint(n.name, Number((n.x + dx).toPrecision(12)), Number((n.y + dy).toPrecision(12)));
      return;
    }
    if (penMode && e.pointerType === 'mouse') setHover({ px: p.x, py: p.y });
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') {
        setHover({ px: p.x, py: p.y });
        // over a point that can be dragged, the cursor says so instead of the panning hand
        const over = tool !== 'pen' && graphables.some((g) => g.kind === 'point' && g.drag && g.label && Math.hypot(toPx(viewport, g.x) - p.x, toPy(viewport, g.y) - p.y) <= 10);
        if (over !== overPoint) setOverPoint(over);
      }
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
  /** where the point tool puts a point: on a point of interest or crossing, on a curve y = f(x), else on the grid */
  const pointAt = (px: number, py: number, free: boolean, touch: boolean): [number, number] => {
    const reach = touch ? 20 : 10;
    const near = [...pois, ...crossings, ...snapPois].find((q) => Math.hypot(toPx(viewport, q.x) - px, toPy(viewport, q.y) - py) < reach);
    if (near) return [near.x, near.y];
    const [x0, y0] = planeAt(viewport, px, py);
    const step = gridStep(viewport.scale).minor / (free ? 10 : 2);
    const snap = (v: number) => Number((Math.round(v / step) * step).toPrecision(12));
    const hit = sceneRef.current ? curveAt(sceneRef.current, px, py, reach) : null;
    const g = hit ? graphables.find((q) => q.id === hit) : undefined;
    if (g?.kind === 'curve' && g.dir === 'y') {
      // on the curve: x on the grid, y the curve's own value there
      const x = snap(x0);
      const y = g.fn(x);
      if (Number.isFinite(y) && Math.abs(toPy(viewport, y) - py) < reach * 2) return [x, Number(y.toPrecision(12))];
    }
    return [snap(x0), snap(y0)];
  };
  const onPointerEnd = (e: PointerEvent<HTMLCanvasElement>) => {
    if (penDrag.current) {
      penDrag.current = null;
      return;
    }
    const sd = shapeDrag.current;
    if (sd) {
      shapeDrag.current = null;
      if (sd.moved) {
        pointers.current.delete(e.pointerId);
        pressedAt.current = null;
        return;
      }
    }
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
    if (tool === 'point') return onAddPoint(...pointAt(p.x, p.y, e.shiftKey, e.pointerType === 'touch'));
    const poi = pois.find((q) => Math.hypot(toPx(viewport, q.x) - p.x, toPy(viewport, q.y) - p.y) < 9);
    if (poi) return setPinned(poi);
    const hit = curveAt(sceneRef.current, p.x, p.y, e.pointerType === 'touch' ? 20 : 10);
    // with a field selected, a click away from other curves draws a solution through it
    if (selectedGraph?.kind === 'field' && (hit === null || hit === selectedGraph.id)) {
      const step = gridStep(viewport.scale).minor / 10;
      const [x, y] = planeAt(viewport, p.x, p.y).map((c) => Number((Math.round(c / step) * step).toPrecision(10))) as [number, number];
      return onAddSeed(selectedGraph.id, x, y);
    }
    const pic = hit === null ? pictureAt(p.x, p.y) : null;
    setPicSel(pic);
    setGuideSel(null);
    onSelect(pic ? null : hit);
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
    } else if ((e.key === 'Enter' || e.key === 'Escape') && pen.length) {
      e.preventDefault();
      finishPen(false);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && guideSel && exam) {
      e.preventDefault();
      setGuide(guideSel, null);
      setGuideSel(null);
    } else if (e.key === 'Enter' && guideSel && exam) {
      e.preventDefault();
      setGuideEdit(guideSel);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && picSel) {
      e.preventDefault();
      setPictures((ps) => ps.filter((p) => p.id !== picSel));
      setPicSel(null);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && sourceOf(selected) !== undefined) {
      e.preventDefault();
      onDeleteLine(selected);
      onSelect(null);
    } else if (!e.metaKey && !e.ctrlKey && !e.altKey && TOOL_KEYS[e.key.toLowerCase()]) {
      e.preventDefault();
      chooseTool(TOOL_KEYS[e.key.toLowerCase()]!);
    } else if (e.key === 'Escape') {
      if (tool !== 'select') chooseTool('select');
      setGuideSel(null);
      setPicSel(null);
      onSelect(null);
    }
  };

  const doExport = async (kind: 'svg' | 'png' | 'pdf' | 'tex') => {
    const el = wrapRef.current!;
    const name = exam ? 'figure' : 'graph';
    // the pictures go in the file too, under the curves as on screen
    const underlay = pictures
      .map((p) => {
        const [x, y] = [toPx(viewport, p.cx), toPy(viewport, p.cy)];
        const [w, h] = [p.w * viewport.scale, p.h * viewport.scale];
        const turn = p.angle ? ` transform="rotate(${(-(p.angle * 180) / Math.PI).toFixed(3)} ${x.toFixed(2)} ${y.toFixed(2)})"` : '';
        return `<image href="${p.src}" x="${(x - w / 2).toFixed(2)}" y="${(y - h / 2).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" opacity="${p.opacity}" preserveAspectRatio="none"${turn}/>`;
      })
      .join('');
    if (kind === 'tex') return exportTikz(graphables, viewport, sceneOpts, el, name);
    if (kind === 'pdf' && !underlay) return exportPdf(graphables, viewport, sceneOpts, el, name);
    const svg = graphSvg(graphables, viewport, sceneOpts, el, underlay);
    if (kind === 'svg') return exportSvg(svg, name);
    if (kind === 'png') return exportPng(svg, size.width, size.height, name);
    // a PDF with pictures: the page as a fine image (the vector writer has no pictures)
    const canvas = await svgToCanvas(svg, size.width, size.height, 4);
    await download(await canvasToPdf(canvas, size.width, size.height), `${name}.pdf`);
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

  /** the selected shape's handles: drag one to move that point of it */
  const onHandleMove = (e: PointerEvent<SVGElement>) => {
    const h = handleDrag.current;
    if (!h) return;
    const r = canvasRef.current!.getBoundingClientRect();
    const step = gridStep(viewport.scale).minor / (e.shiftKey ? 10 : 2);
    const [x, y] = planeAt(viewport, e.clientX - r.left, e.clientY - r.top).map((c) => Number((Math.round(c / step) * step).toPrecision(12))) as [number, number];
    if ('name' in h) onMovePoint(h.name, x, y);
    else onEditLine(h.id, setLiteral(h.src, h.k, x, y));
  };
  const shapeOverlay = () => {
    const { literals, named } = shapeHandles;
    if (!selectedGraph || (!literals.length && !named.length)) return null;
    const id = selectedGraph.id;
    const bez = /^\s*bezier\s*\(/.test(shapeSource) && literals.length >= 4;
    const X = (x: number) => toPx(viewport, x);
    const Y = (y: number) => toPy(viewport, y);
    const grab = (e: PointerEvent<SVGElement>, h: { id: string; src: string; k: number } | { name: string }) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      handleDrag.current = h;
    };
    const release = () => {
      handleDrag.current = null;
    };
    return (
      <svg className="ghandles" width={size.width} height={size.height} aria-hidden="true">
        {bez &&
          literals.map((l, k) => {
            if (k % 3 === 0) return null;
            const a = literals[k % 3 === 1 ? k - 1 : k + 1];
            return a ? <line key={`arm${k}`} className="ghandles__arm" x1={X(a.x)} y1={Y(a.y)} x2={X(l.x)} y2={Y(l.y)} /> : null;
          })}
        {literals.map((l, k) => (
          <circle
            key={`l${k}`}
            className={`ghandles__knob${bez && k % 3 !== 0 ? ' ghandles__knob--control' : ''}`}
            cx={X(l.x)}
            cy={Y(l.y)}
            r={bez && k % 3 !== 0 ? 4 : 5.5}
            onPointerDown={(e) => grab(e, { id, src: shapeSource, k })}
            onPointerMove={onHandleMove}
            onPointerUp={release}
            onPointerCancel={release}
          />
        ))}
        {named.map((n) => (
          <circle key={n.name} className="ghandles__knob" cx={X(n.x)} cy={Y(n.y)} r={5.5} onPointerDown={(e) => grab(e, { name: n.name })} onPointerMove={onHandleMove} onPointerUp={release} onPointerCancel={release} />
        ))}
      </svg>
    );
  };

  // only lengths of points still on the graph count; a deleted point's edits are left behind
  const hiddenGuides = Object.entries(figure.guides ?? {}).filter(([ref, v]) => v === null && graphables.some((g) => g.kind === 'point' && `${g.id}:${ref.slice(-1)}` === ref)).length;
  /** the exam's lengths: pick one to delete it, double-click (or Edit) to write it another way */
  const guideOverlay = () => (
    <>
      {guideSpots.map((s) =>
        guideEdit === s.ref ? (
          <div
            key={s.ref}
            className="gguide__input"
            style={{ left: s.x - 6, top: s.y + s.h / 2 - 18, minWidth: Math.max(96, s.w + 24) }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setGuideEdit(null);
              }
            }}
            onBlur={(e) => {
              // leaving the field keeps what was typed, as Enter does
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commitGuide(s.ref);
            }}
          >
            <MathInput
              value={guideDraft}
              onChange={setGuideDraft}
              label={t.guideLabel(s.text)}
              keyboard="text"
              fieldRef={(el) => {
                if (el && !el.hasFocus()) requestAnimationFrame(() => el.focus());
              }}
              onFocus={() => {}}
              onEnter={() => commitGuide(s.ref)}
              onBackspaceEmpty={() => {}}
              onMoveOut={() => {}}
            />
          </div>
        ) : (
          <button
            key={s.ref}
            type="button"
            className="gguide"
            aria-pressed={guideSel === s.ref}
            aria-label={t.guideLabel(s.text)}
            style={{ left: s.x - 3, top: s.y - 2, width: s.w + 6, height: s.h + 4 }}
            onClick={() => {
              setGuideSel(s.ref);
              onSelect(null);
            }}
            onDoubleClick={() => setGuideEdit(s.ref)}
            onKeyDown={(e) => {
              if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                setGuide(s.ref, null);
                setGuideSel(null);
              }
            }}
          />
        ),
      )}
      {(() => {
        const s = guideSpots.find((q) => q.ref === guideSel);
        if (!s || guideEdit) return null;
        return (
          <div className="gguide__menu" style={{ left: s.x + s.w / 2, top: s.y - 6 }}>
            <button type="button" className="btn btn--small" onClick={() => setGuideEdit(s.ref)}>
              {t.guideEdit}
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => {
                setGuide(s.ref, null);
                setGuideSel(null);
              }}
            >
              {t.guideDelete}
            </button>
            {typeof figure.guides?.[s.ref] === 'string' && (
              <button type="button" className="btn btn--small" onClick={() => setGuide(s.ref, undefined)}>
                {t.guideReset}
              </button>
            )}
          </div>
        );
      })()}
    </>
  );
  /** the curve being drawn: its pieces, handles, and the next piece to the cursor */
  const penOverlay = () => {
    const X = (x: number) => toPx(viewport, x);
    const Y = (y: number) => toPy(viewport, y);
    let d = '';
    pen.forEach((n, k) => {
      if (!k) return void (d = `M${X(n.x)},${Y(n.y)}`);
      const a = pen[k - 1]!;
      const ao = a.out ?? { x: 0, y: 0 };
      const no = n.out ?? { x: 0, y: 0 };
      d += ` C${X(a.x + ao.x)},${Y(a.y + ao.y)} ${X(n.x - no.x)},${Y(n.y - no.y)} ${X(n.x)},${Y(n.y)}`;
    });
    const last = pen[pen.length - 1];
    const next = last && hover && !penDrag.current?.moved ? `M${X(last.x)},${Y(last.y)} C${X(last.x + (last.out?.x ?? 0))},${Y(last.y + (last.out?.y ?? 0))} ${hover.px},${hover.py} ${hover.px},${hover.py}` : '';
    return (
      <svg className="graph__pen" width={size.width} height={size.height} aria-hidden="true">
        {next && <path className="graph__pen-next" d={next} />}
        {d && <path className="graph__pen-path" d={d} />}
        {pen.map((n, k) =>
          n.out ? (
            <g key={`h${k}`}>
              <line className="graph__pen-arm" x1={X(n.x - n.out.x)} y1={Y(n.y - n.out.y)} x2={X(n.x + n.out.x)} y2={Y(n.y + n.out.y)} />
              <circle className="graph__pen-knob" cx={X(n.x + n.out.x)} cy={Y(n.y + n.out.y)} r={3.5} />
              <circle className="graph__pen-knob" cx={X(n.x - n.out.x)} cy={Y(n.y - n.out.y)} r={3.5} />
            </g>
          ) : null,
        )}
        {pen.map((n, k) => (
          <circle key={k} className="graph__pen-anchor" cx={X(n.x)} cy={Y(n.y)} r={k === 0 && pen.length >= 2 ? 6 : 4.5} />
        ))}
      </svg>
    );
  };

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
      <div
        className="graph__stage"
        ref={wrapRef}
        data-style={figure.style}
        onDragOver={(e) => {
          if ([...e.dataTransfer.types].includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => void onDropPicture(e)}
      >
        <canvas
          ref={canvasRef}
          className={`graph__canvas${overPoint ? ' graph__canvas--point' : boxMode || tool !== 'select' ? ' graph__canvas--box' : ''}`}
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
        {picture && !exam && (
          <div
            className="gpic"
            title={t.pictureHint}
            style={{ left: toPx(viewport, picture.cx), top: toPy(viewport, picture.cy), width: picture.w * viewport.scale, height: picture.h * viewport.scale, transform: `translate(-50%, -50%) rotate(${-(picture.angle ?? 0)}rad)` }}
            onPointerDown={(e) => onPicDown(e, 'move')}
            onPointerMove={onPicMove}
            onPointerUp={onPicUp}
            onPointerCancel={onPicUp}
          >
            {(['nw', 'ne', 'se', 'sw'] as const).map((c) => (
              <span key={c} className={`gpic__handle gpic__handle--${c}`} onPointerDown={(e) => onPicDown(e, c)} onPointerMove={onPicMove} onPointerUp={onPicUp} />
            ))}
            <span className="gpic__arm" aria-hidden="true" />
            <span className="gpic__handle gpic__handle--rot" onPointerDown={(e) => onPicDown(e, 'rot')} onPointerMove={onPicMove} onPointerUp={onPicUp} />
          </div>
        )}
        {!penMode && !exam && selectedGraph?.kind === 'shape' && shapeOverlay()}
        {exam && tool === 'select' && guideOverlay()}
        {!penMode && (!exam || tool === 'point') &&
          crossings.map((q) => (
            <button
              key={`${q.x},${q.y}`}
              type="button"
              className="gcross"
              style={{ left: toPx(viewport, q.x), top: toPy(viewport, q.y) }}
              title={t.markCrossing(at({ x: q.x, y: q.y } as Poi))}
              aria-label={t.markCrossing(at({ x: q.x, y: q.y } as Poi))}
              onClick={() => onAddPoint(q.x, q.y)}
            />
          ))}
        {tool === 'point' && hover && (() => {
          // where a click would put the point, snapped to crossings, roots and curves
          const [x, y] = pointAt(hover.px, hover.py, false, false);
          return <span className="gghost" aria-hidden="true" style={{ left: toPx(viewport, x), top: toPy(viewport, y) }} />;
        })()}
        {tool === 'point' && (
          <div className="graph__pen-hint" role="status">
            <span>{t.pointToolHint}</span>
          </div>
        )}
        {penMode && penOverlay()}
        {penMode && (
          <div className="graph__pen-hint" role="status">
            <span>{t.penHint}</span>
            {pen.length >= 2 && (
              <button type="button" className="btn btn--small" onClick={() => finishPen(false)}>
                {t.penDone}
              </button>
            )}
          </div>
        )}
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
        {!exam && (
          <div className="segmented graph__tools" role="group" aria-label={t.graphTools}>
            {(['select', 'point', 'pen'] as const).map((k) => (
              <button key={k} type="button" aria-pressed={tool === k} title={`${t.toolName[k]} (${TOOL_KEY_OF[k]})`} onClick={() => chooseTool(k)}>
                <ToolIcon tool={k} />
                <span>{t.toolName[k]}</span>
              </button>
            ))}
          </div>
        )}
        {/* on a phone the rest folds behind one button, so the graph stays in view */}
        <button type="button" className="hud-btn hud-btn--icon hud__more-toggle" aria-expanded={hudOpen} aria-label={t.graphOptions} title={t.graphOptions} onClick={() => setHudOpen((v) => !v)}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
            <circle cx="8" cy="8" r="1.3" fill="currentColor" />
            <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
          </svg>
        </button>
        <div className="hud__more" data-open={hudOpen || undefined}>
        {styles}
        {templatesMenu}
        <button type="button" className="hud-btn" title={t.addPicture} onClick={() => void addPicture()}>
          {t.picture}
        </button>
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
            {hiddenGuides > 0 && (
              <button type="button" className="hud-btn" onClick={() => onFigure({ ...figure, guides: Object.fromEntries(Object.entries(figure.guides ?? {}).filter(([, v]) => v !== null)) })}>
                {t.guidesBack(hiddenGuides)}
              </button>
            )}
          </>
        )}
        </div>
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

      {info && !picture && (
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
                        <button type="button" className="icon-btn poi__mark" aria-label={t.markPoint(at(p))} title={t.markPoint(at(p))} onClick={() => onAddPoint(p.x, p.y)}>
                          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                            <circle cx="8" cy="8" r="2.5" fill="currentColor" />
                            <path d="M8 1.5v2.5M8 12v2.5M1.5 8h2.5M12 8h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                          </svg>
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

const TOOL_KEYS: Record<string, 'select' | 'point' | 'pen'> = { v: 'select', d: 'point', p: 'pen' };
const TOOL_KEY_OF = { select: 'V', point: 'D', pen: 'P' } as const;

function ToolIcon({ tool }: { tool: 'select' | 'point' | 'pen' }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      {tool === 'select' && <path d="M3.5 2.5l9 5.2-4 .9-1.9 3.9z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />}
      {tool === 'point' && (
        <>
          <circle cx="8" cy="8" r="2.6" fill="currentColor" />
          <path d="M8 1.8v2.4M8 11.8v2.4M1.8 8h2.4M11.8 8h2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </>
      )}
      {tool === 'pen' && (
        <>
          <path d="M8 2.5l4 5-2.2 5.5H6.2L4 7.5z" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
          <path d="M8 2.5V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M2.5 7.5L8 3l5.5 4.5M4 6.5V13h8V6.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
    </svg>
  );
}
