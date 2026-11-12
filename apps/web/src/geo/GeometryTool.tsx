import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactElement, type WheelEvent as RWheelEvent } from 'react';
import { newId } from '../storage';
import { exactSqrt, exactText } from './exact';
import { canvasToPdf, canvasToPng, copyFigure, download, figureBounds, figureSvg, svgToCanvas } from './exportFigure';
import { renderFigure } from './figure';
import { decorate } from './labels';
import { cloneObjects, crossings, draggable, freeRoots, measure, nextName, refs, resolve, toLines, withAncestors, without, type Deco, type GeoObject, type Pt, type Shape } from './model';
import { PropertiesPanel, type QuickAction } from './PropertiesPanel';
import { BASE_PROPS, loadPresets, savePresets, type GeoProps, type Preset } from './props';
import { recognize } from './sketch';
import type { GeoStrings, GeoTool } from './strings';

interface View {
  /** world point at the centre of the canvas */
  cx: number;
  cy: number;
  /** pixels per unit */
  s: number;
}
interface Doc {
  objects: GeoObject[];
  view: View;
  grid: boolean;
  axes: boolean;
  snap: boolean;
  /** the document's label and number settings */
  defaults: GeoProps;
  /** exam view: no grid or axes, black on white */
  exam: boolean;
  /** export margin, coordinate units */
  margin: number;
}
interface Snapshot {
  objects: GeoObject[];
  defaults: GeoProps;
}
const DOC_KEY = 'calculator.geometry.v1';
const START: Doc = { objects: [], view: { cx: 0, cy: 0, s: 50 }, grid: true, axes: true, snap: true, defaults: BASE_PROPS, exam: false, margin: 0.5 };
function loadDoc(): Doc {
  try {
    const v = JSON.parse(localStorage.getItem(DOC_KEY) ?? 'null');
    if (v && Array.isArray(v.objects) && v.view && typeof v.view.s === 'number') return { ...START, ...v, defaults: { ...BASE_PROPS, ...(v.defaults ?? {}) } };
  } catch {
    // a fresh canvas
  }
  return START;
}

type Need = 'pt' | 'line' | 'curve';
/** what each click-by-click tool picks, in order */
const NEEDS: Partial<Record<GeoTool, Need[]>> = {
  point: ['pt'],
  segment: ['pt', 'pt'], line: ['pt', 'pt'], ray: ['pt', 'pt'], circle: ['pt', 'pt'], midpoint: ['pt', 'pt'], bisector: ['pt', 'pt'],
  compass: ['pt', 'pt', 'pt'], angle: ['pt', 'pt', 'pt'],
  perpendicular: ['line', 'pt'], parallel: ['line', 'pt'], reflect: ['pt', 'line'], rotate: ['pt', 'pt'],
  intersection: ['curve', 'curve'],
  square: ['pt', 'pt'], regular: ['pt', 'pt'],
};
/** tools that draw with press, drag, release (a click still works the old way) */
const DRAG_TOOLS = new Set<GeoTool>(['segment', 'line', 'ray', 'circle', 'rect', 'square', 'triangle', 'ellipse', 'polygon']);
/** tools that draw into a box */
const BOX_TOOLS = new Set<GeoTool>(['rect', 'triangle', 'ellipse', 'square']);
const GROUPS: GeoTool[][] = [
  ['move', 'select', 'point', 'pen'],
  ['segment', 'line', 'ray', 'polygon', 'rect', 'square', 'triangle', 'regular', 'circle', 'ellipse', 'compass'],
  ['midpoint', 'perpendicular', 'parallel', 'bisector', 'intersection'],
  ['angle', 'reflect', 'rotate', 'delete'],
];
const GREEK = 'αβγδεζηθ';
const POINT_KINDS = new Set(['point', 'midpoint', 'intersection', 'reflect', 'rotate', 'vertex']);
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

/** copied objects, kept for paste (with what they are built from) */
let clipboard: GeoObject[] | null = null;

type SnapKind = 'point' | 'midpoint' | 'intersection' | 'grid' | null;
interface Snap {
  at: Pt;
  /** an existing point there, to build on instead of adding a new one */
  id: string | null;
  kind: SnapKind;
}
interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
type Op =
  | { kind: 'pan'; from: Pt; view: View; moved: boolean }
  | { kind: 'draw'; tool: GeoTool; start: Snap; startScreen: Pt; cur: Snap; moved: boolean }
  | { kind: 'move'; start: Pt; orig: Map<string, Pt>; moved: boolean; exclude: Set<string> }
  | { kind: 'resize'; handle: Handle; box: Bounds; orig: Map<string, Pt>; ell: Map<string, { rx: number; ry: number }>; moved: boolean }
  | { kind: 'turn'; center: Pt; from: number; orig: Map<string, Pt>; ell: Map<string, number>; moved: boolean }
  | { kind: 'marquee'; a: Pt; b: Pt; add: boolean }
  | { kind: 'label'; owner: string; key: string; start: Pt; orig: Pt; moved: boolean }
  | { kind: 'pinch'; d0: number; c0: Pt; view: View };

const nice = (raw: number) => {
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
};
const dist = (p: Pt, q: Pt) => Math.hypot(q.x - p.x, q.y - p.y);
const round = (v: number, d = 2) => {
  const r = Math.round(v * 10 ** d) / 10 ** d;
  return Object.is(r, -0) ? '0' : String(r);
};
/** a length for the drag readout: exact when it has a short exact form */
const lengthText = (l: number) => {
  const e = exactSqrt(l * l);
  const dec = round(l);
  if (e && e.b !== 1) return `${exactText(e)} ≈ ${dec}`;
  return dec;
};

/** the box a drag from p0 to p1 spans: Shift keeps the shape regular (aspect h/w), Alt draws it around p0 */
function boxOf(p0: Pt, p1: Pt, regular: boolean, center: boolean, aspect: number): Bounds {
  let [dx, dy] = [p1.x - p0.x, p1.y - p0.y];
  if (regular) {
    const w = Math.max(Math.abs(dx), Math.abs(dy) / aspect);
    dx = (dx < 0 ? -1 : 1) * w;
    dy = (dy < 0 ? -1 : 1) * w * aspect;
  }
  const [a, b] = center ? [{ x: p0.x - dx, y: p0.y - dy }, { x: p0.x + dx, y: p0.y + dy }] : [p0, { x: p0.x + dx, y: p0.y + dy }];
  return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
}

/** the shape a drag draws, before it is made: for the preview, the readout and the final objects */
type Draft =
  | { kind: 'poly'; pts: Pt[] }
  | { kind: 'circle'; c: Pt; r: number }
  | { kind: 'ellipse'; c: Pt; rx: number; ry: number }
  | { kind: 'seg'; a: Pt; b: Pt; extent: 'segment' | 'line' | 'ray' };
export function draftOf(tool: GeoTool, p0: Pt, p1: Pt, regular: boolean, center: boolean): { draft: Draft; readout: string } | null {
  if (tool === 'segment' || tool === 'line' || tool === 'ray') {
    let b = p1;
    if (regular) {
      const l = dist(p0, p1);
      const t = (Math.round(Math.atan2(p1.y - p0.y, p1.x - p0.x) / (Math.PI / 12)) * Math.PI) / 12;
      b = { x: p0.x + l * Math.cos(t), y: p0.y + l * Math.sin(t) };
    }
    const deg = ((Math.atan2(b.y - p0.y, b.x - p0.x) * 180) / Math.PI + 360) % 360;
    return { draft: { kind: 'seg', a: p0, b, extent: tool }, readout: `${lengthText(dist(p0, b))} · ${round(deg, 1)}°` };
  }
  if (tool === 'circle') return { draft: { kind: 'circle', c: p0, r: dist(p0, p1) }, readout: `r = ${lengthText(dist(p0, p1))}` };
  const aspect = tool === 'triangle' ? Math.sqrt(3) / 2 : 1;
  const box = boxOf(p0, p1, regular || tool === 'square', center, aspect);
  const [w, h] = [box.x1 - box.x0, box.y1 - box.y0];
  const size = `${round(w)} × ${round(h)}`;
  if (tool === 'rect' || tool === 'square')
    return { draft: { kind: 'poly', pts: [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }] }, readout: size };
  if (tool === 'triangle') return { draft: { kind: 'poly', pts: [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: (box.x0 + box.x1) / 2, y: box.y1 }] }, readout: size };
  if (tool === 'ellipse') return { draft: { kind: 'ellipse', c: { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }, rx: w / 2, ry: h / 2 }, readout: size };
  return null;
}

export function GeometryTool({ s, onSendToGraph }: { s: GeoStrings; onSendToGraph: (lines: string[]) => void }) {
  const [doc, setDoc] = useState<Doc>(loadDoc);
  const { objects, view, defaults } = doc;
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [tool, setTool] = useState<GeoTool>('select');
  const [picks, setPicks] = useState<string[]>([]);
  const [boxStart, setBoxStart] = useState<Snap | null>(null);
  const [degrees, setDegrees] = useState(90);
  const [sides, setSides] = useState(5);
  const [message, setMessage] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [hover, setHover] = useState<Pt | null>(null);
  const [stroke, setStroke] = useState<Pt[] | null>(null);
  const [op, setOpState] = useState<Op | null>(null);
  const opRef = useRef<Op | null>(null);
  const setOp = (o: Op | null) => {
    opRef.current = o;
    setOpState(o);
  };
  const [snapMark, setSnapMark] = useState<Snap | null>(null);
  const [mods, setMods] = useState({ shift: false, alt: false });
  const [locks, setLocks] = useState({ regular: false, center: false });
  const [panel, setPanel] = useState<'objects' | 'props'>('objects');
  const [menu, setMenu] = useState<Pt | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [spaceDown, setSpaceDown] = useState(false);
  const [readout, setReadoutState] = useState<{ text: string; at: Pt } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const touches = useRef(new Map<number, Pt>());
  const press = useRef<{ timer: number; at: Pt } | null>(null);
  const coarse = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(DOC_KEY, JSON.stringify(doc));
    } catch {
      // kept for this visit only
    }
  }, [doc]);
  useLayoutEffect(() => {
    const el = svgRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const shapes = useMemo(() => resolve(objects), [objects]);
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const deco = useMemo(() => decorate(objects, shapes, defaults), [objects, shapes, defaults]);
  const selSet = useMemo(() => new Set(sel.filter((id) => byId.has(id))), [sel, byId]);
  const regular = mods.shift || locks.regular;
  const fromCenter = mods.alt || locks.center;

  // ---- history: every action is one step, objects and document settings together
  const commit = (next: GeoObject[], nextDefaults: GeoProps = defaults) => {
    setPast((p) => [...p, { objects, defaults }].slice(-200));
    setFuture([]);
    setDoc((d) => ({ ...d, objects: next, defaults: nextDefaults }));
  };
  /** the first frame of a drag: the state before it goes on the undo list */
  const beginEdit = () => setPast((p) => [...p, { objects, defaults }].slice(-200));
  const step = (dir: 'undo' | 'redo') => {
    if (dir === 'undo' && past.length) {
      const last = past[past.length - 1]!;
      setFuture((f) => [{ objects, defaults }, ...f]);
      setDoc((d) => ({ ...d, objects: last.objects, defaults: last.defaults }));
      setPast((p) => p.slice(0, -1));
    } else if (dir === 'redo' && future.length) {
      const next = future[0]!;
      setPast((p) => [...p, { objects, defaults }]);
      setDoc((d) => ({ ...d, objects: next.objects, defaults: next.defaults }));
      setFuture((f) => f.slice(1));
    }
    setPicks([]);
  };

  // ---- coordinates
  const toScreen = (p: Pt): Pt => ({ x: size.w / 2 + (p.x - view.cx) * view.s, y: size.h / 2 - (p.y - view.cy) * view.s });
  const toWorld = (p: Pt): Pt => ({ x: view.cx + (p.x - size.w / 2) / view.s, y: view.cy - (p.y - size.h / 2) / view.s });
  const eventPt = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const gridStep = nice(60 / view.s);
  const reach = () => (coarse.current ? 22 : 10);

  // ---- snapping: points, then midpoints, then crossings, then the grid
  const midpoints = useMemo(() => {
    const out: Pt[] = [];
    for (const sh of shapes.values()) {
      if (sh.type === 'line' && sh.extent === 'segment') out.push({ x: (sh.a.x + sh.b.x) / 2, y: (sh.a.y + sh.b.y) / 2 });
      if (sh.type === 'polygon')
        sh.pts.forEach((p, k) => {
          const q = sh.pts[(k + 1) % sh.pts.length]!;
          out.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
        });
    }
    return out;
  }, [shapes]);
  const meetings = useMemo(() => {
    const parts: Shape[] = [];
    for (const sh of shapes.values()) {
      if (sh.type === 'line' || sh.type === 'circle') parts.push(sh);
      if (sh.type === 'polygon') sh.pts.forEach((p, k) => parts.push({ type: 'line', a: p, b: sh.pts[(k + 1) % sh.pts.length]!, extent: 'segment' }));
    }
    const out: Pt[] = [];
    for (let i = 0; i < parts.length && out.length < 400; i++) for (let j = i + 1; j < parts.length; j++) out.push(...crossings(parts[i]!, parts[j]!));
    return out;
  }, [shapes]);
  const snapAt = (sp: Pt, exclude?: Set<string>): Snap => {
    const R = reach();
    const near = (p: Pt) => {
      const q = toScreen(p);
      return Math.hypot(q.x - sp.x, q.y - sp.y);
    };
    let best: Snap | null = null;
    let bestD = R;
    for (const [id, sh] of shapes) {
      if (sh.type !== 'point' || exclude?.has(id)) continue;
      const d = near(sh.at);
      if (d < bestD) [best, bestD] = [{ at: sh.at, id, kind: 'point' }, d];
    }
    if (best) return best;
    for (const p of midpoints) {
      const d = near(p);
      if (d < bestD) [best, bestD] = [{ at: p, id: null, kind: 'midpoint' }, d];
    }
    if (best) return best;
    for (const p of meetings) {
      const d = near(p);
      if (d < bestD) [best, bestD] = [{ at: p, id: null, kind: 'intersection' }, d];
    }
    if (best) return best;
    const w = toWorld(sp);
    if (doc.snap) {
      const g = gridStep / 2;
      const r = { x: Math.round(w.x / g) * g, y: Math.round(w.y / g) * g };
      if (near(r) < R) return { at: r, id: null, kind: 'grid' };
    }
    return { at: w, id: null, kind: null };
  };

  // ---- hit testing, in screen pixels
  const hitPoint = (sp: Pt, skip?: string): string | null => {
    let best: string | null = null;
    let bestD = reach() + 2;
    for (const [id, sh] of shapes) {
      if (sh.type !== 'point' || id === skip) continue;
      const q = toScreen(sh.at);
      const d = Math.hypot(q.x - sp.x, q.y - sp.y);
      if (d < bestD) [best, bestD] = [id, d];
    }
    return best;
  };
  const distToShape = (sp: Pt, sh: Shape): number => {
    if (sh.type === 'circle') {
      const c = toScreen(sh.c);
      return Math.abs(Math.hypot(sp.x - c.x, sp.y - c.y) - sh.r * view.s);
    }
    if (sh.type === 'ellipse') {
      const w = toWorld(sp);
      const t = (-sh.rot * Math.PI) / 180;
      const [dx, dy] = [w.x - sh.c.x, w.y - sh.c.y];
      const [x, y] = [dx * Math.cos(t) - dy * Math.sin(t), dx * Math.sin(t) + dy * Math.cos(t)];
      return Math.abs(Math.hypot(x / sh.rx, y / sh.ry) - 1) * Math.min(sh.rx, sh.ry) * view.s;
    }
    const seg = (a: Pt, b: Pt, extent: 'segment' | 'line' | 'ray') => {
      const [p, q] = [toScreen(a), toScreen(b)];
      const d = { x: q.x - p.x, y: q.y - p.y };
      let t = ((sp.x - p.x) * d.x + (sp.y - p.y) * d.y) / (d.x * d.x + d.y * d.y);
      if (extent !== 'line') t = Math.max(0, t);
      if (extent === 'segment') t = Math.min(1, t);
      return Math.hypot(sp.x - (p.x + t * d.x), sp.y - (p.y + t * d.y));
    };
    if (sh.type === 'line') return seg(sh.a, sh.b, sh.extent);
    if (sh.type === 'polygon') return Math.min(...sh.pts.map((p, k) => seg(p, sh.pts[(k + 1) % sh.pts.length]!, 'segment')));
    if (sh.type === 'angle') return Math.hypot(sp.x - toScreen(sh.v).x, sp.y - toScreen(sh.v).y) < 26 ? 0 : Infinity;
    return Infinity;
  };
  const hitCurve = (sp: Pt, need: Need | 'any'): string | null => {
    let best: string | null = null;
    let bestD = coarse.current ? 16 : 8;
    for (const [id, sh] of shapes) {
      const ok = need === 'any' ? sh.type !== 'point' : need === 'line' ? sh.type === 'line' : sh.type === 'line' || sh.type === 'circle';
      if (!ok) continue;
      const d = distToShape(sp, sh);
      if (d < bestD) [best, bestD] = [id, d];
    }
    if (best || need !== 'any') return best;
    // inside a filled polygon or ellipse: the topmost one
    const w = toWorld(sp);
    for (const [id, sh] of [...shapes].reverse()) {
      if (sh.type === 'ellipse') {
        const t = (-sh.rot * Math.PI) / 180;
        const [dx, dy] = [w.x - sh.c.x, w.y - sh.c.y];
        if (Math.hypot((dx * Math.cos(t) - dy * Math.sin(t)) / sh.rx, (dx * Math.sin(t) + dy * Math.cos(t)) / sh.ry) <= 1) return id;
      }
      if (sh.type !== 'polygon') continue;
      let inside = false;
      for (let i = 0, j = sh.pts.length - 1; i < sh.pts.length; j = i++) {
        const [p, q] = [sh.pts[i]!, sh.pts[j]!];
        if (p.y > w.y !== q.y > w.y && w.x < ((q.x - p.x) * (w.y - p.y)) / (q.y - p.y) + p.x) inside = !inside;
      }
      if (inside) return id;
    }
    return null;
  };

  // ---- building
  const lowerName = (list: GeoObject[]) => nextName(list, true);
  const angleName = (list: GeoObject[]) => {
    const used = new Set(list.map((o) => o.name));
    for (let r = 0; ; r++) for (const g of GREEK) if (!used.has(r ? `${g}_${r}` : g)) return r ? `${g}_${r}` : g;
  };
  const addPoint = (list: GeoObject[], at: Pt): [GeoObject[], string] => {
    const id = newId();
    return [[...list, { id, kind: 'point', name: nextName(list), x: at.x, y: at.y }], id];
  };
  /** the point at a snap: the existing one, or a new free point there */
  const pointAt = (list: GeoObject[], snap: Snap): [GeoObject[], string] => (snap.id ? [list, snap.id] : addPoint(list, snap.at));
  /** a point at `at`: one of the snaps if it sits there, else a new one */
  const pointNear = (list: GeoObject[], at: Pt, snaps: Snap[]): [GeoObject[], string] => {
    const hit = snaps.find((sn) => sn.id && dist(sn.at, at) < 1e-9);
    return hit ? [list, hit.id!] : addPoint(list, at);
  };
  const regularOn = (list: GeoObject[], a: string, b: string, n: number): GeoObject[] => {
    const id = newId();
    const count = Math.max(3, Math.min(60, Math.round(n)));
    let next: GeoObject[] = [...list, { id, kind: 'regular', name: lowerName(list), a, b, n: count }];
    for (let k = 2; k < count; k++) next = [...next, { id: newId(), kind: 'vertex', name: nextName(next), poly: id, k }];
    return next;
  };

  /** the objects a finished pick list makes */
  const build = (list: GeoObject[], t: GeoTool, ids: string[]): GeoObject[] | null => {
    const id = newId();
    const [a, b, c] = ids as [string, string, string];
    switch (t) {
      case 'segment':
      case 'line':
      case 'ray':
        return a === b ? null : [...list, { id, kind: t, name: lowerName(list), a, b }];
      case 'circle':
        return a === b ? null : [...list, { id, kind: 'circle', name: lowerName(list), center: a, through: b }];
      case 'compass':
        return a === b ? null : [...list, { id, kind: 'compass', name: lowerName(list), r1: a, r2: b, center: c }];
      case 'midpoint':
        return a === b ? null : [...list, { id, kind: 'midpoint', name: nextName(list), a, b }];
      case 'square':
      case 'regular':
        return a === b ? null : regularOn(list, a, b, t === 'square' ? 4 : sides);
      case 'bisector':
        return a === b ? null : [...list, { id, kind: 'bisector', name: lowerName(list), a, b }];
      case 'perpendicular':
      case 'parallel':
        return [...list, { id, kind: t, name: lowerName(list), line: a, through: b }];
      case 'reflect':
        return [...list, { id, kind: 'reflect', name: `${byId.get(a)?.name ?? 'P'}′`, p: a, line: b }];
      case 'rotate':
        return a === b ? null : [...list, { id, kind: 'rotate', name: `${byId.get(a)?.name ?? 'P'}″`, p: a, center: b, degrees }];
      case 'angle':
        return a === b || b === c ? null : [...list, { id, kind: 'angle', name: angleName(list), a, vertex: b, c }];
      case 'intersection': {
        if (a === b) return null;
        const first: GeoObject = { id, kind: 'intersection', name: nextName(list), p: a, q: b, which: 0 };
        const trial = resolve([...list, first, { ...first, id: 'second', which: 1 }]);
        if (!trial.has(id)) {
          setMessage(s.noCrossing);
          return null;
        }
        const two = trial.get('second');
        const at0 = trial.get(id);
        const distinct = two?.type === 'point' && at0?.type === 'point' && Math.hypot(two.at.x - at0.at.x, two.at.y - at0.at.y) > 1e-9;
        const next = [...list, first];
        return distinct ? [...next, { id: newId(), kind: 'intersection', name: nextName(next), p: a, q: b, which: 1 }] : next;
      }
      default:
        return null;
    }
  };

  /** the click-by-click way of building: each click picks a point (or a line), the last one builds */
  const pick = (sp: Pt) => {
    setMessage(null);
    let list = objects;
    if (tool === 'delete') {
      const id = hitPoint(sp) ?? hitCurve(sp, 'any');
      if (id) commit(without(objects, new Set([id])));
      return;
    }
    if (tool === 'point') {
      const sn = snapAt(sp);
      if (sn.id) return;
      commit(addPoint(objects, sn.at)[0]);
      return;
    }
    if (tool === 'polygon') {
      const sn = snapAt(sp);
      let id = sn.id;
      if (id && picksRef.current.length >= 3 && id === picksRef.current[0]) {
        commit([...list, { id: newId(), kind: 'polygon', name: lowerName(list), pts: picksRef.current }]);
        setPicks([]);
        picksRef.current = [];
        return;
      }
      if (!id) [list, id] = addPoint(list, sn.at);
      if (list !== objects) commit(list);
      picksRef.current = [...picksRef.current, id!];
      setPicks(picksRef.current);
      return;
    }
    const needs = NEEDS[tool];
    if (!needs) return;
    const need = needs[picks.length]!;
    let id: string | null;
    if (need === 'pt') {
      [list, id] = pointAt(list, snapAt(sp));
    } else {
      id = hitCurve(sp, need);
      if (!id) {
        setMessage(need === 'line' ? s.needsLine : s.needsCurve);
        return;
      }
    }
    const nextPicks = [...picks, id];
    if (nextPicks.length < needs.length) {
      if (list !== objects) commit(list);
      setPicks(nextPicks);
      return;
    }
    const built = build(list, tool, nextPicks);
    if (built) commit(built);
    else if (list !== objects) commit(list);
    setPicks([]);
  };
  // a polygon's corners as they are placed (a drag places two before React re-renders)
  const picksRef = useRef<string[]>([]);
  useEffect(() => {
    picksRef.current = picks;
  }, [picks]);

  /** a drag (or two clicks) from `a` to `b` with a drawing tool: the shape it makes */
  const finishDraw = (t: GeoTool, a: Snap, b: Snap) => {
    const made = draftOf(t, a.at, b.at, regular, fromCenter);
    if (!made) return;
    const d = made.draft;
    let list = objects;
    let id: string;
    const ids: string[] = [];
    const snaps = [a, b];
    if (d.kind === 'seg') {
      if (dist(d.a, d.b) < 1e-9) return;
      [list, id] = pointAt(list, a);
      ids.push(id);
      [list, id] = regular ? pointNear(list, d.b, snaps) : pointAt(list, b);
      ids.push(id);
      const built = build(list, t, ids);
      if (built) commit(built);
    } else if (d.kind === 'circle') {
      if (d.r < 1e-9) return;
      [list, id] = pointAt(list, a);
      ids.push(id);
      [list, id] = pointAt(list, b);
      ids.push(id);
      const built = build(list, 'circle', ids);
      if (built) commit(built);
    } else if (d.kind === 'ellipse') {
      if (d.rx < 1e-9 || d.ry < 1e-9) return;
      [list, id] = pointNear(list, d.c, snaps);
      commit([...list, { id: newId(), kind: 'ellipse', name: lowerName(list), center: id, rx: d.rx, ry: d.ry, rot: 0 }]);
    } else {
      const area = Math.abs(d.pts.reduce((acc, p, k) => acc + p.x * d.pts[(k + 1) % d.pts.length]!.y - d.pts[(k + 1) % d.pts.length]!.x * p.y, 0));
      if (area < 1e-9) return;
      if (t === 'square') {
        let l2 = list;
        let pa: string;
        let pb: string;
        [l2, pa] = pointNear(l2, d.pts[0]!, snaps);
        [l2, pb] = pointNear(l2, d.pts[1]!, snaps);
        commit(regularOn(l2, pa, pb, 4));
        return;
      }
      for (const p of d.pts) {
        [list, id] = pointNear(list, p, snaps);
        ids.push(id);
      }
      commit([...list, { id: newId(), kind: 'polygon', name: lowerName(list), pts: ids }]);
    }
  };

  // ---- selection helpers
  const selected = useMemo(() => objects.filter((o) => selSet.has(o.id)), [objects, selSet]);
  /** the free points a selection moves with: only from objects that can be dragged */
  const moversOf = (ids: Iterable<string>) => freeRoots(objects, [...ids].filter((id) => byId.get(id) && draggable(byId.get(id)!)));
  const origOf = (roots: string[]) => {
    const orig = new Map<string, Pt>();
    for (const r of roots) {
      const o = byId.get(r);
      if (o?.kind === 'point' || o?.kind === 'text') orig.set(r, { x: o.x, y: o.y });
    }
    return orig;
  };
  const selBox = useMemo((): Bounds | null => {
    if (!selected.some(draggable)) return null;
    return figureBounds(selected, shapes, { texts: [], lines: [], dots: [] });
  }, [selected, shapes]);
  type Ellipse = Extract<GeoObject, { kind: 'ellipse' }>;
  const setPositions = (orig: Map<string, Pt>, f: (p: Pt) => Pt, ell?: (o: Ellipse) => Partial<Ellipse>) =>
    setDoc((d) => ({
      ...d,
      objects: d.objects.map((o) => {
        if ((o.kind === 'point' || o.kind === 'text') && orig.has(o.id)) {
          const p = f(orig.get(o.id)!);
          return { ...o, x: p.x, y: p.y };
        }
        if (o.kind === 'ellipse' && ell) return { ...o, ...ell(o) };
        return o;
      }),
    }));

  const deleteSel = () => {
    if (!selSet.size) return;
    commit(without(objects, selSet));
    setSel([]);
  };
  const duplicate = (list: GeoObject[] | null = null) => {
    const source = list ?? withAncestors(objects, selSet);
    if (!source.length) return;
    const clones = cloneObjects(source, objects, { x: gridStep, y: -gridStep }, newId);
    commit([...objects, ...clones]);
    // select the copies of what was selected (or everything pasted)
    const map = new Map(source.map((o, k) => [o.id, clones[k]!.id]));
    setSel(list ? clones.map((c) => c.id) : [...selSet].map((id) => map.get(id)!).filter(Boolean));
    setTool('select');
  };
  const nudge = (dx: number, dy: number) => {
    const roots = moversOf(selSet);
    if (!roots.length) return;
    const orig = origOf(roots);
    beginEdit();
    setFuture([]);
    setPositions(orig, (p) => ({ x: p.x + dx, y: p.y + dy }));
  };

  // ---- keys: shortcuts like a drawing app (Cmd on Mac, Ctrl elsewhere)
  const live = useRef({ step, deleteSel, duplicate, nudge, objects, selSet, gridStep, op, setOp, picks, boxStart });
  live.current = { step, deleteSel, duplicate, nudge, objects, selSet, gridStep, op, setOp, picks, boxStart };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setMods({ shift: e.shiftKey, alt: e.altKey });
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      const inGeo = !el || el === document.body || Boolean(el.closest('.geo'));
      if (!inGeo) return;
      const L = live.current;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (e.key === ' ') {
        if (el?.tagName === 'BUTTON') return;
        e.preventDefault();
        setSpaceDown(true);
      } else if (mod && k === 'z') {
        e.preventDefault();
        L.step(e.shiftKey ? 'redo' : 'undo');
      } else if (e.ctrlKey && k === 'y') {
        e.preventDefault();
        L.step('redo');
      } else if (mod && k === 'a') {
        e.preventDefault();
        setTool('select');
        setSel(L.objects.map((o) => o.id));
      } else if (mod && k === 'd') {
        e.preventDefault();
        L.duplicate();
      } else if (mod && k === 'c') {
        if (!L.selSet.size) return;
        e.preventDefault();
        clipboard = withAncestors(L.objects, L.selSet);
      } else if (mod && k === 'v') {
        if (!clipboard) return;
        e.preventDefault();
        L.duplicate(clipboard);
      } else if (e.key === 'Escape') {
        setMenu(null);
        setExportOpen(false);
        if (L.op?.kind === 'draw' || L.op?.kind === 'marquee') L.setOp(null);
        else if (L.picks.length || L.boxStart) {
          setPicks([]);
          setBoxStart(null);
        } else setSel([]);
        setStroke(null);
        setSnapMark(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && L.selSet.size) {
        e.preventDefault();
        L.deleteSel();
      } else if (e.key.startsWith('Arrow') && L.selSet.size) {
        e.preventDefault();
        const d = e.shiftKey ? L.gridStep : L.gridStep / 10;
        L.nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowDown' ? -d : e.key === 'ArrowUp' ? d : 0);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      setMods({ shift: e.shiftKey, alt: e.altKey });
      if (e.key === ' ') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // ---- pointer
  const openMenu = (sp: Pt) => {
    const id = hitPoint(sp) ?? hitCurve(sp, 'any');
    if (id && !selSet.has(id)) setSel([id]);
    setMenu(sp);
    setExportOpen(false);
  };
  const setReadout = (text: string, at: Pt) => setReadoutState({ text, at });
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    coarse.current = e.pointerType === 'touch' || e.pointerType === 'pen';
    const sp = eventPt(e);
    setMenu(null);
    setExportOpen(false);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, sp);
      if (touches.current.size === 2) {
        // two fingers: pan and zoom; whatever one finger started is dropped
        if (press.current) clearTimeout(press.current.timer);
        const [p, q] = [...touches.current.values()] as [Pt, Pt];
        setOp({ kind: 'pinch', d0: dist(p, q), c0: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, view });
        setStroke(null);
        return;
      }
      press.current = { at: sp, timer: window.setTimeout(() => openMenu(sp), 550) };
    }
    if (e.button === 2) return;
    if (e.button === 1 || spaceDown) {
      setOp({ kind: 'pan', from: sp, view, moved: false });
      return;
    }
    if (tool === 'pen') {
      setStroke([sp]);
      return;
    }
    // a label: drag it to a place of its own
    const labelEl = (e.target as Element).closest?.('[data-label]');
    if (labelEl && (tool === 'select' || tool === 'move')) {
      const owner = labelEl.getAttribute('data-owner')!;
      const key = labelEl.getAttribute('data-label')!;
      beginEdit();
      setOp({ kind: 'label', owner, key, start: toWorld(sp), orig: byId.get(owner)?.deco?.moved?.[key] ?? { x: 0, y: 0 }, moved: false });
      return;
    }
    if (tool === 'select') {
      const handle = (e.target as Element).closest?.('[data-handle]')?.getAttribute('data-handle');
      if (handle && selBox) {
        const roots = moversOf(selSet);
        beginEdit();
        if (handle === 'rot') {
          const center = { x: (selBox.x0 + selBox.x1) / 2, y: (selBox.y0 + selBox.y1) / 2 };
          const w = toWorld(sp);
          const ell = new Map<string, number>();
          for (const id of roots) {
            const o = byId.get(id);
            if (o?.kind === 'ellipse') ell.set(id, o.rot);
          }
          setOp({ kind: 'turn', center, from: Math.atan2(w.y - center.y, w.x - center.x), orig: origOf(roots), ell, moved: false });
        } else {
          const ell = new Map<string, { rx: number; ry: number }>();
          for (const id of roots) {
            const o = byId.get(id);
            if (o?.kind === 'ellipse') ell.set(id, { rx: o.rx, ry: o.ry });
          }
          setOp({ kind: 'resize', handle: handle as Handle, box: selBox, orig: origOf(roots), ell, moved: false });
        }
        return;
      }
      const id = hitPoint(sp) ?? hitCurve(sp, 'any');
      if (!id) {
        if (!e.shiftKey) setSel([]);
        setOp({ kind: 'marquee', a: sp, b: sp, add: e.shiftKey });
        return;
      }
      if (e.shiftKey) {
        setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
        return;
      }
      const o = byId.get(id)!;
      // a free corner of something selected: drag just that corner, keep the selection
      if (o.kind === 'point' && selSet.size && !selSet.has(id) && moversOf(selSet).includes(id)) {
        beginEdit();
        setOp({ kind: 'move', start: toWorld(sp), orig: origOf([id]), moved: false, exclude: new Set([id]) });
        return;
      }
      const next = selSet.has(id) ? [...selSet] : [id];
      if (!selSet.has(id)) setSel(next);
      const roots = moversOf(next);
      if (!draggable(o) || !roots.length) return;
      beginEdit();
      setOp({ kind: 'move', start: toWorld(sp), orig: origOf(roots), moved: false, exclude: new Set(roots) });
      return;
    }
    if (tool === 'move') {
      const id = hitPoint(sp);
      const o = id ? byId.get(id) : null;
      if (id) setSel([id]);
      if (o?.kind === 'point') {
        beginEdit();
        setOp({ kind: 'move', start: toWorld(sp), orig: origOf([id!]), moved: false, exclude: new Set([id!]) });
      } else setOp({ kind: 'pan', from: sp, view, moved: false });
      return;
    }
    const clicking = (tool === 'square' || ['segment', 'line', 'ray', 'circle'].includes(tool)) && picks.length > 0;
    if (DRAG_TOOLS.has(tool) && !clicking) {
      const start = snapAt(sp);
      if (tool === 'polygon') pick(sp);
      setOp({ kind: 'draw', tool, start, startScreen: sp, cur: start, moved: false });
      return;
    }
    pick(sp);
  };

  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const sp = eventPt(e);
    setHover(toWorld(sp));
    setMods({ shift: e.shiftKey, alt: e.altKey });
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, sp);
    if (press.current && dist(press.current.at, sp) > 8) {
      clearTimeout(press.current.timer);
      press.current = null;
    }
    if (stroke) {
      setStroke((st) => (st ? [...st, sp] : st));
      return;
    }
    const o = opRef.current;
    if (!o) {
      if (DRAG_TOOLS.has(tool) || NEEDS[tool]?.[picks.length] === 'pt') setSnapMark(snapAt(sp));
      else setSnapMark(null);
      return;
    }
    if (o.kind === 'pinch') {
      if (touches.current.size < 2) return;
      const [p, q] = [...touches.current.values()] as [Pt, Pt];
      const d = dist(p, q);
      const c = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const s1 = Math.min(5000, Math.max(2, (o.view.s * d) / (o.d0 || 1)));
      // the world point under the first centre stays under the fingers
      const wx = o.view.cx + (o.c0.x - size.w / 2) / o.view.s;
      const wy = o.view.cy - (o.c0.y - size.h / 2) / o.view.s;
      setDoc((dd) => ({ ...dd, view: { s: s1, cx: wx - (c.x - size.w / 2) / s1, cy: wy + (c.y - size.h / 2) / s1 } }));
      return;
    }
    if (o.kind === 'pan') {
      setDoc((d) => ({ ...d, view: { ...o.view, cx: o.view.cx - (sp.x - o.from.x) / o.view.s, cy: o.view.cy + (sp.y - o.from.y) / o.view.s } }));
      return;
    }
    if (o.kind === 'draw') {
      const cur = snapAt(sp);
      setSnapMark(cur.kind ? cur : null);
      setOp({ ...o, cur, moved: o.moved || dist(sp, o.startScreen) > 4 });
      return;
    }
    if (o.kind === 'marquee') {
      setOp({ ...o, b: sp });
      return;
    }
    if (o.kind === 'label') {
      const w = toWorld(sp);
      const moved = { x: o.orig.x + w.x - o.start.x, y: o.orig.y + w.y - o.start.y };
      o.moved = true;
      setDoc((d) => ({ ...d, objects: d.objects.map((x) => (x.id === o.owner ? { ...x, deco: { ...x.deco, moved: { ...x.deco?.moved, [o.key]: moved } } } : x)) }));
      return;
    }
    if (o.kind === 'move') {
      o.moved = true;
      const w = toWorld(sp);
      let [dx, dy] = [w.x - o.start.x, w.y - o.start.y];
      // the first point lands on a snap, the rest keep their places relative to it
      const first = o.orig.values().next().value as Pt | undefined;
      if (first) {
        const sn = snapAt(toScreen({ x: first.x + dx, y: first.y + dy }), o.exclude);
        setSnapMark(sn.kind ? sn : null);
        [dx, dy] = [sn.at.x - first.x, sn.at.y - first.y];
      }
      setPositions(o.orig, (p) => ({ x: p.x + dx, y: p.y + dy }));
      return;
    }
    if (o.kind === 'resize') {
      o.moved = true;
      const w = toWorld(sp);
      const { box, handle } = o;
      const usesX = handle !== 'n' && handle !== 's';
      const usesY = handle !== 'e' && handle !== 'w';
      const hx = handle.includes('w') ? box.x0 : box.x1;
      const hy = handle.includes('s') ? box.y0 : box.y1;
      const center = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
      const anchor = fromCenter ? center : { x: handle.includes('w') ? box.x1 : box.x0, y: handle.includes('s') ? box.y1 : box.y0 };
      const safe = (v: number) => (Math.abs(v) < 1e-9 ? 1e-9 : v);
      let sx = usesX ? (w.x - anchor.x) / safe(hx - anchor.x) : 1;
      let sy = usesY ? (w.y - anchor.y) / safe(hy - anchor.y) : 1;
      if (regular) {
        if (usesX && usesY) {
          const m = Math.max(Math.abs(sx), Math.abs(sy));
          [sx, sy] = [Math.sign(sx || 1) * m, Math.sign(sy || 1) * m];
        } else if (usesX) sy = Math.abs(sx);
        else sx = Math.abs(sy);
      }
      setPositions(
        o.orig,
        (p) => ({ x: anchor.x + (p.x - anchor.x) * sx, y: anchor.y + (p.y - anchor.y) * sy }),
        (el) => (o.ell.has(el.id) ? { rx: o.ell.get(el.id)!.rx * Math.abs(sx), ry: o.ell.get(el.id)!.ry * Math.abs(sy) } : {}),
      );
      setReadout(`${round((box.x1 - box.x0) * Math.abs(sx))} × ${round((box.y1 - box.y0) * Math.abs(sy))}`, sp);
      return;
    }
    if (o.kind === 'turn') {
      o.moved = true;
      const w = toWorld(sp);
      let t = Math.atan2(w.y - o.center.y, w.x - o.center.x) - o.from;
      if (regular) t = Math.round(t / (Math.PI / 12)) * (Math.PI / 12);
      const [c, si] = [Math.cos(t), Math.sin(t)];
      setPositions(
        o.orig,
        (p) => ({ x: o.center.x + (p.x - o.center.x) * c - (p.y - o.center.y) * si, y: o.center.y + (p.x - o.center.x) * si + (p.y - o.center.y) * c }),
        (el) => (o.ell.has(el.id) ? { rot: o.ell.get(el.id)! + (t * 180) / Math.PI } : {}),
      );
      setReadout(`${round(((((t * 180) / Math.PI) % 360) + 540) % 360 - 180, 1)}°`, sp);
    }
  };

  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    touches.current.delete(e.pointerId);
    if (press.current) {
      clearTimeout(press.current.timer);
      press.current = null;
    }
    setReadoutState(null);
    if (stroke) {
      finishStroke(stroke);
      setStroke(null);
    }
    const o = opRef.current;
    if (o?.kind === 'pinch' && touches.current.size) return;
    setOp(null);
    setSnapMark(null);
    if (!o || o.kind === 'pinch' || o.kind === 'pan') return;
    if (o.kind === 'move' || o.kind === 'resize' || o.kind === 'turn' || o.kind === 'label') {
      if (!o.moved) setPast((p) => p.slice(0, -1));
      else setFuture([]);
      return;
    }
    if (o.kind === 'marquee') {
      const [x0, x1] = [Math.min(o.a.x, o.b.x), Math.max(o.a.x, o.b.x)];
      const [y0, y1] = [Math.min(o.a.y, o.b.y), Math.max(o.a.y, o.b.y)];
      if (x1 - x0 < 3 && y1 - y0 < 3) return;
      const inside = (p: Pt) => {
        const q = toScreen(p);
        return q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
      };
      const hit: string[] = [];
      for (const [id, sh] of shapes) {
        const big = sh.type === 'circle' ? sh.r : sh.type === 'ellipse' ? Math.max(sh.rx, sh.ry) : 0;
        const pts =
          sh.type === 'point' || sh.type === 'text'
            ? [sh.at]
            : sh.type === 'line'
              ? [sh.a, sh.b]
              : sh.type === 'circle' || sh.type === 'ellipse'
                ? [{ x: sh.c.x - big, y: sh.c.y - big }, { x: sh.c.x + big, y: sh.c.y + big }]
                : sh.type === 'polygon'
                  ? sh.pts
                  : [sh.a, sh.v, sh.c];
        if (pts.every(inside)) hit.push(id);
      }
      setSel((cur) => (o.add ? [...new Set([...cur, ...hit])] : hit));
      return;
    }
    if (o.kind === 'draw') {
      if (o.tool === 'polygon') {
        if (o.moved) pick(eventPt(e));
        return;
      }
      if (o.moved) {
        finishDraw(o.tool, o.start, o.cur);
        setBoxStart(null);
        return;
      }
      // a click: box tools take two clicks, the others pick as before
      if (BOX_TOOLS.has(o.tool) && o.tool !== 'square') {
        if (boxStart) {
          finishDraw(o.tool, boxStart, o.start);
          setBoxStart(null);
        } else setBoxStart(o.start);
        return;
      }
      pick(o.startScreen);
    }
  };

  const finishStroke = (st: Pt[]) => {
    const r = recognize(st);
    if (!r) {
      setMessage(s.notRecognised);
      return;
    }
    let list = objects;
    const at = (sp: Pt, snap = true): string => {
      let id: string;
      [list, id] = snap ? pointAt(list, snapAt(sp)) : addPoint(list, toWorld(sp));
      return id;
    };
    if (r.kind === 'segment') {
      const [a, b] = [at(r.a), at(r.b)];
      if (a !== b) list = [...list, { id: newId(), kind: 'segment', name: lowerName(list), a, b }];
    } else if (r.kind === 'circle') {
      const c = at(r.c);
      // the drawn size, not the nearest grid step
      const t = at({ x: r.c.x + r.r, y: r.c.y }, false);
      list = [...list, { id: newId(), kind: 'circle', name: lowerName(list), center: c, through: t }];
    } else {
      const pts = r.pts.map((p) => at(p));
      if (new Set(pts).size >= 3) list = [...list, { id: newId(), kind: 'polygon', name: lowerName(list), pts }];
    }
    commit(list);
  };
  // scroll pans; Cmd/Ctrl + scroll (and a trackpad pinch) zooms about the cursor
  const onWheel = (e: RWheelEvent<SVGSVGElement>) => {
    if (e.ctrlKey || e.metaKey) {
      const sp = eventPt(e);
      const before = toWorld(sp);
      const rate = Math.abs(e.deltaY) < 40 ? 0.01 : 0.0015;
      const s1 = Math.min(5000, Math.max(2, view.s * Math.exp(-e.deltaY * rate)));
      setDoc((d) => ({ ...d, view: { s: s1, cx: before.x - (sp.x - size.w / 2) / s1, cy: before.y + (sp.y - size.h / 2) / s1 } }));
    } else {
      setDoc((d) => ({ ...d, view: { ...d.view, cx: d.view.cx + e.deltaX / d.view.s, cy: d.view.cy - e.deltaY / d.view.s } }));
    }
  };
  // the page must not scroll or zoom while the canvas does
  useEffect(() => {
    const el = svgRef.current!;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  const fit = () => {
    const b = figureBounds(objects, shapes, deco);
    if (!b) return setDoc((d) => ({ ...d, view: START.view }));
    const sc = Math.min(size.w / Math.max(1, b.x1 - b.x0), size.h / Math.max(1, b.y1 - b.y0)) * 0.75;
    setDoc((d) => ({ ...d, view: { cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, s: Math.min(400, Math.max(4, sc)) } }));
  };

  // ---- properties
  const patchObjects = (ids: Set<string>, f: (o: GeoObject) => GeoObject) => commit(objects.map((o) => (ids.has(o.id) ? f(o) : o)));
  const onProps = (patch: Partial<Record<keyof GeoProps, unknown>>) => {
    if (!selSet.size) {
      commit(objects, { ...defaults, ...(patch as Partial<GeoProps>) });
      return;
    }
    patchObjects(selSet, (o) => {
      const props = { ...o.props, ...patch } as Record<string, unknown>;
      for (const k of Object.keys(props)) if (props[k] === undefined) delete props[k];
      return { ...o, props: props as Partial<GeoProps> };
    });
  };
  const onDeco = (id: string, change: (d: Deco) => Deco) => patchObjects(new Set([id]), (o) => ({ ...o, deco: change(o.deco ?? {}) }));
  const onQuick = (a: QuickAction) => {
    const ids = new Set((selSet.size ? selected : objects).map((o) => o.id));
    patchObjects(ids, (o) => {
      const props: Partial<GeoProps> = { ...o.props };
      let next: Deco = { ...o.deco };
      const clear = (list: Deco['sides'], only?: 'hidden') => list?.map((p) => (!only || p.label === only ? { ...p, label: undefined } : p));
      if (a === 'lengths') {
        if (o.kind === 'segment') props.segLabel = 'value';
        if (o.kind === 'polygon' || o.kind === 'regular') {
          props.sideLabel = 'value';
          next = { ...next, sides: clear(next.sides, 'hidden') };
        }
      } else if (a === 'angles') {
        if (o.kind === 'polygon' || o.kind === 'regular') {
          props.cornerLabel = 'value';
          next = { ...next, corners: clear(next.corners, 'hidden') };
        }
        if (o.kind === 'angle') props.angleLabel = 'value';
      } else if (a === 'hide') {
        Object.assign(props, { segLabel: 'hidden', sideLabel: 'hidden', cornerLabel: 'hidden', angleLabel: 'hidden', areaLabel: 'hidden', circleValue: 'hidden', pointLabel: false });
        next = { ...next, sides: clear(next.sides), corners: clear(next.corners), text: o.kind === 'circle' || o.kind === 'compass' ? undefined : next.text };
      } else {
        next = { ...next, moved: undefined };
      }
      return { ...o, props, deco: next };
    });
  };
  const onApplyPreset = (p: Preset, asDefault: boolean) => {
    if (asDefault) commit(objects, { ...defaults, ...p.props });
    else patchObjects(selSet, (o) => ({ ...o, props: { ...o.props, ...p.props } }));
  };
  const onSavePreset = (name: string) => {
    const props = selSet.size ? { ...defaults, ...selected[0]!.props } : defaults;
    const next = [...presets, { id: newId(), name, props }];
    setPresets(next);
    savePresets(next);
  };
  const onDeletePreset = (id: string) => {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    savePresets(next);
  };

  // ---- export
  const exportAs = async (kind: 'png2' | 'png4' | 'svg' | 'pdf' | 'copy') => {
    setExportOpen(false);
    const fig = figureSvg(objects, shapes, deco, { only: selSet.size ? [...selSet] : undefined, margin: doc.margin, exam: doc.exam });
    if (!fig) return setNotice(s.nothingToExport);
    const name = 'curvelet-figure';
    try {
      if (kind === 'svg') return download(new Blob([fig.svg], { type: 'image/svg+xml' }), `${name}.svg`);
      const canvas = await svgToCanvas(fig.svg, fig.width, fig.height, kind === 'png2' ? 2 : 4);
      if (kind === 'pdf') return download(await canvasToPdf(canvas, fig.width, fig.height), `${name}.pdf`);
      const png = await canvasToPng(canvas);
      if (kind === 'copy') {
        const how = await copyFigure(png, fig.svg);
        return setNotice(how === 'vector' ? s.copiedVector : s.copied);
      }
      download(png, `${name}@${kind === 'png2' ? 2 : 4}x.png`);
    } catch {
      setNotice(s.copyFailed);
    }
  };

  // ---- drawing
  const far = ((size.w + size.h) / view.s) * 4;
  const gridLines = () => {
    const out: ReactElement[] = [];
    if (doc.exam) return out;
    const tl = toWorld({ x: 0, y: 0 });
    const br = toWorld({ x: size.w, y: size.h });
    const g = gridStep;
    if (doc.grid) {
      for (let x = Math.ceil(tl.x / g) * g; x <= br.x; x += g) {
        const sx = toScreen({ x, y: 0 }).x;
        out.push(<line key={`gx${x}`} className="geo__grid" x1={sx} x2={sx} y1={0} y2={size.h} />);
      }
      for (let y = Math.ceil(br.y / g) * g; y <= tl.y; y += g) {
        const sy = toScreen({ x: 0, y }).y;
        out.push(<line key={`gy${y}`} className="geo__grid" x1={0} x2={size.w} y1={sy} y2={sy} />);
      }
    }
    if (doc.axes) {
      const o = toScreen({ x: 0, y: 0 });
      out.push(<line key="ax" className="geo__axis" x1={0} x2={size.w} y1={o.y} y2={o.y} />, <line key="ay" className="geo__axis" x1={o.x} x2={o.x} y1={0} y2={size.h} />);
      for (let x = Math.ceil(tl.x / g) * g; x <= br.x; x += g) {
        if (Math.abs(x) < g / 2) continue;
        const q = toScreen({ x, y: 0 });
        out.push(<text key={`tx${x}`} className="geo__tick" x={q.x} y={Math.min(size.h - 4, Math.max(12, o.y + 14))} textAnchor="middle">{+x.toFixed(6)}</text>);
      }
      for (let y = Math.ceil(br.y / g) * g; y <= tl.y; y += g) {
        if (Math.abs(y) < g / 2) continue;
        const q = toScreen({ x: 0, y });
        out.push(<text key={`ty${y}`} className="geo__tick" x={Math.min(size.w - 4, Math.max(4, o.x - 6))} y={q.y + 4} textAnchor="end">{+y.toFixed(6)}</text>);
      }
    }
    return out;
  };
  const highlight = new Set([...selSet, ...picks]);
  const figure = renderFigure({ objects, shapes, deco, toScreen, scale: view.s, far, highlight, interactive: true });

  // the shape being drawn, dashed, with its size by the cursor
  let preview: ReactElement | null = null;
  let previewText: { text: string; at: Pt } | null = null;
  const drawFrom = op?.kind === 'draw' && op.moved && op.tool !== 'polygon' ? { t: op.tool, a: op.start, b: op.cur } : boxStart && hover && BOX_TOOLS.has(tool) ? { t: tool, a: boxStart, b: snapAt(toScreen(hover)) } : null;
  if (drawFrom) {
    const made = draftOf(drawFrom.t, drawFrom.a.at, drawFrom.b.at, regular, fromCenter);
    if (made) {
      const d = made.draft;
      if (d.kind === 'seg') {
        const [a, b] = [toScreen(d.a), toScreen(d.b)];
        preview = <line className="geo__draft" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
      } else if (d.kind === 'circle') {
        const c = toScreen(d.c);
        const e = toScreen(drawFrom.b.at);
        preview = (
          <g>
            <circle className="geo__draft" cx={c.x} cy={c.y} r={d.r * view.s} />
            <line className="geo__draft" x1={c.x} y1={c.y} x2={e.x} y2={e.y} />
          </g>
        );
      } else if (d.kind === 'ellipse') {
        const c = toScreen(d.c);
        preview = <ellipse className="geo__draft" cx={c.x} cy={c.y} rx={d.rx * view.s} ry={d.ry * view.s} />;
      } else {
        preview = <polygon className="geo__draft" points={d.pts.map(toScreen).map((p) => `${p.x},${p.y}`).join(' ')} />;
      }
      previewText = { text: made.readout, at: toScreen(drawFrom.b.at) };
    }
  }
  const shownReadout = readout ?? previewText;

  // the selection's box: eight handles to resize, one above to turn
  let handles: ReactElement | null = null;
  if (tool === 'select' && selBox && (!op || op.kind === 'marquee')) {
    const [a, b] = [toScreen({ x: selBox.x0, y: selBox.y1 }), toScreen({ x: selBox.x1, y: selBox.y0 })];
    const pad = 6;
    const [x0, y0, x1, y1] = [a.x - pad, a.y - pad, b.x + pad, b.y + pad];
    const hs = coarse.current ? 16 : 9;
    const at: Record<Handle, Pt> = { nw: { x: x0, y: y0 }, n: { x: (x0 + x1) / 2, y: y0 }, ne: { x: x1, y: y0 }, e: { x: x1, y: (y0 + y1) / 2 }, se: { x: x1, y: y1 }, s: { x: (x0 + x1) / 2, y: y1 }, sw: { x: x0, y: y1 }, w: { x: x0, y: (y0 + y1) / 2 } };
    const cursorOf: Record<Handle, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
    handles = (
      <g className="geo__bbox">
        <rect className="geo__bbox-frame" x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
        <line className="geo__bbox-frame" x1={(x0 + x1) / 2} y1={y0} x2={(x0 + x1) / 2} y2={y0 - 20} />
        <circle className="geo__handle geo__handle--rot" data-handle="rot" cx={(x0 + x1) / 2} cy={y0 - 24} r={hs / 2 + 1} style={{ cursor: 'grab' }} />
        {HANDLES.map((h) => (
          <rect key={h} className="geo__handle" data-handle={h} x={at[h].x - hs / 2} y={at[h].y - hs / 2} width={hs} height={hs} style={{ cursor: cursorOf[h] }} />
        ))}
      </g>
    );
  }

  const needs = tool === 'polygon' ? null : NEEDS[tool];
  const stepsText = s.steps[tool];
  const hint = message ?? stepsText[Math.min(tool === 'polygon' ? (picks.length ? 1 : 0) : BOX_TOOLS.has(tool) && boxStart ? 1 : picks.length, stepsText.length - 1)] ?? '';
  const describe = (o: GeoObject) => {
    const names = refs(o).map((r) => byId.get(r)?.name ?? '?');
    return names.length ? `${s.kinds[o.kind]} ${s.of(names.join(', '))}` : s.kinds[o.kind];
  };
  const cursor = op?.kind === 'pan' ? 'grabbing' : spaceDown || tool === 'move' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  const chooseTool = (id: GeoTool) => {
    setTool(id);
    setPicks([]);
    setBoxStart(null);
    setMessage(null);
    if (id !== 'select' && id !== 'move') setSel([]);
  };

  return (
    <div className="geo">
      <div className="geo__tools" role="toolbar" aria-label={s.toolbar}>
        {GROUPS.map((group, k) => (
          <div key={k} className="geo__group" role="group">
            {group.map((id) => (
              <button key={id} type="button" className="geo__tool" aria-pressed={tool === id} onClick={() => chooseTool(id)}>
                {s.tools[id]}
              </button>
            ))}
          </div>
        ))}
        {tool === 'regular' && (
          <label className="geo__deg">
            {s.sides}
            <input className="input input--code" type="number" min={3} max={60} value={sides} onChange={(e) => setSides(Math.max(3, Math.min(60, Math.round(Number(e.target.value) || 3))))} />
          </label>
        )}
        {tool === 'rotate' && (
          <label className="geo__deg">
            {s.degrees}
            <input className="input input--code" type="number" value={degrees} step={15} onChange={(e) => setDegrees(Number(e.target.value) || 0)} />°
          </label>
        )}
        <div className="geo__group geo__locks" role="group">
          <button type="button" className="geo__tool" aria-pressed={locks.regular} title="Shift" onClick={() => setLocks((l) => ({ ...l, regular: !l.regular }))}>
            {s.regularShape}
          </button>
          <button type="button" className="geo__tool" aria-pressed={locks.center} title="Alt / Option" onClick={() => setLocks((l) => ({ ...l, center: !l.center }))}>
            {s.fromCenter}
          </button>
        </div>
      </div>

      <div className="geo__body">
        <section className="geo__stage" aria-label={s.canvas}>
          <p className="geo__hint" role="status">
            {hint}
            {needs && picks.length > 0 && ` (${picks.length}/${needs.length})`}
          </p>
          <svg
            ref={svgRef}
            className={`geo__svg${doc.exam ? ' geo__svg--exam' : ''}`}
            style={{ cursor }}
            tabIndex={0}
            aria-label={s.canvas}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => setHover(null)}
            onWheel={onWheel}
            onContextMenu={(e) => {
              e.preventDefault();
              openMenu(eventPt(e));
            }}
          >
            {gridLines()}
            {figure}
            {preview}
            {stroke && <polyline className="geo__ink" points={stroke.map((p) => `${p.x},${p.y}`).join(' ')} />}
            {snapMark?.kind && (
              <g className="geo__snap">
                <circle cx={toScreen(snapMark.at).x} cy={toScreen(snapMark.at).y} r={7} />
                <text x={toScreen(snapMark.at).x + 10} y={toScreen(snapMark.at).y - 10}>
                  {s.snapKinds[snapMark.kind]}
                </text>
              </g>
            )}
            {handles}
            {op?.kind === 'marquee' && <rect className="geo__box" x={Math.min(op.a.x, op.b.x)} y={Math.min(op.a.y, op.b.y)} width={Math.abs(op.b.x - op.a.x)} height={Math.abs(op.b.y - op.a.y)} />}
          </svg>
          {shownReadout && (
            <span className="geo__cursor-readout" style={{ transform: `translate(${Math.round(shownReadout.at.x + 14)}px, ${Math.round(shownReadout.at.y + 14)}px)` }}>
              {shownReadout.text}
            </span>
          )}
          {hover && <span className="geo__readout">({+hover.x.toFixed(2)}, {+hover.y.toFixed(2)})</span>}
          {notice && (
            <p className="geo__notice" role="status">
              {notice}
            </p>
          )}
          {menu && (
            <ContextMenu
              s={s}
              at={menu}
              hasSel={selSet.size > 0}
              canPaste={Boolean(clipboard)}
              onClose={() => setMenu(null)}
              onProps={onProps}
              onQuick={onQuick}
              onDuplicate={() => duplicate()}
              onCopy={() => {
                clipboard = withAncestors(objects, selSet);
              }}
              onPaste={() => clipboard && duplicate(clipboard)}
              onDelete={deleteSel}
              onMore={() => setPanel('props')}
            />
          )}
        </section>

        <aside className="geo__side" aria-label={s.objects}>
          <div className="geo__actions">
            <button type="button" className="icon-btn" aria-label={s.undo} title={s.undo} disabled={!past.length} onClick={() => step('undo')}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M6 4L3 7l3 3M3 7h6.5a3.5 3.5 0 010 7H8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button type="button" className="icon-btn" aria-label={s.redo} title={s.redo} disabled={!future.length} onClick={() => step('redo')}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M10 4l3 3-3 3M13 7H6.5a3.5 3.5 0 000 7H8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <label className="check">
              <input type="checkbox" checked={doc.grid} onChange={(e) => setDoc((d) => ({ ...d, grid: e.target.checked }))} />
              {s.grid}
            </label>
            <label className="check">
              <input type="checkbox" checked={doc.axes} onChange={(e) => setDoc((d) => ({ ...d, axes: e.target.checked }))} />
              {s.axes}
            </label>
            <label className="check">
              <input type="checkbox" checked={doc.snap} onChange={(e) => setDoc((d) => ({ ...d, snap: e.target.checked }))} />
              {s.snap}
            </label>
            <label className="check">
              <input type="checkbox" checked={doc.exam} onChange={(e) => setDoc((d) => ({ ...d, exam: e.target.checked }))} />
              {s.examView}
            </label>
            <button type="button" className="btn btn--small btn--quiet" onClick={fit}>
              {s.fit}
            </button>
            <div className="geo__export">
              <button type="button" className="btn btn--small" aria-expanded={exportOpen} onClick={() => setExportOpen((v) => !v)}>
                {s.exportMenu}
              </button>
              {exportOpen && (
                <div className="geo__export-menu" role="group" aria-label={s.exportMenu}>
                  <p className="geo__export-scope">{selSet.size ? s.exportScopeSel : s.exportScopeAll}</p>
                  <label className="geo__export-margin">
                    {s.margin}
                    <input className="input input--num" type="number" min={0} max={5} step={0.1} value={doc.margin} onChange={(e) => setDoc((d) => ({ ...d, margin: Math.max(0, Math.min(5, Number(e.target.value) || 0)) }))} />
                  </label>
                  <div className="geo__export-buttons">
                    <button type="button" className="btn btn--small" onClick={() => exportAs('png2')}>
                      {s.exportPng(2)}
                    </button>
                    <button type="button" className="btn btn--small" onClick={() => exportAs('png4')}>
                      {s.exportPng(4)}
                    </button>
                    <button type="button" className="btn btn--small" onClick={() => exportAs('svg')}>
                      {s.exportSvg}
                    </button>
                    <button type="button" className="btn btn--small" onClick={() => exportAs('pdf')}>
                      {s.exportPdf}
                    </button>
                    <button type="button" className="btn btn--small btn--primary" onClick={() => exportAs('copy')}>
                      {s.copyImage}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="segmented geo__panel-tabs" role="group" aria-label={s.objects}>
            <button type="button" aria-pressed={panel === 'objects'} onClick={() => setPanel('objects')}>
              {s.objectsTab}
            </button>
            <button type="button" aria-pressed={panel === 'props'} onClick={() => setPanel('props')}>
              {s.propertiesTab}
            </button>
          </div>

          {panel === 'props' ? (
            <PropertiesPanel
              s={s}
              selected={selected}
              objects={objects}
              shapes={shapes}
              defaults={defaults}
              onProps={onProps}
              onDeco={onDeco}
              onRename={(id, name) => patchObjects(new Set([id]), (o) => ({ ...o, name }))}
              onQuick={onQuick}
              presets={presets}
              onApplyPreset={onApplyPreset}
              onSavePreset={onSavePreset}
              onDeletePreset={onDeletePreset}
            />
          ) : objects.length === 0 ? (
            <p className="geo__empty">{s.empty}</p>
          ) : (
            <ul className="geo__list">
              {objects.map((o) => {
                const sh = shapes.get(o.id);
                const m = sh ? measure(sh) : null;
                const on = selSet.has(o.id);
                return (
                  <li key={o.id} className={`geo__item${on ? ' is-selected' : ''}`}>
                    <button
                      type="button"
                      className="geo__item-main"
                      onClick={(e) => {
                        if (tool !== 'select' && tool !== 'move') setTool('select');
                        setSel((cur) => (e.shiftKey || e.metaKey || e.ctrlKey ? (cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id]) : on && cur.length === 1 ? [] : [o.id]));
                      }}
                      aria-pressed={on}
                    >
                      <span className="geo__item-name">{o.name}</span>
                      <span className="geo__item-kind">{describe(o)}</span>
                      {m && !POINT_KINDS.has(o.kind) && <span className="geo__item-measure">{m}</span>}
                    </button>
                    <button type="button" className="icon-btn geo__item-delete" aria-label={s.remove(o.name)} onClick={() => commit(without(objects, new Set([o.id])))}>
                      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="geo__send">
            <button type="button" className="btn btn--small" disabled={!objects.length} onClick={() => onSendToGraph(toLines(objects))}>
              {s.sendToGraph}
            </button>
            <button type="button" className="btn btn--small btn--quiet" disabled={!objects.length} onClick={() => commit([])}>
              {s.clear}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** right-click or long-press: the common label settings and the edit commands */
function ContextMenu({
  s,
  at,
  hasSel,
  canPaste,
  onClose,
  onProps,
  onQuick,
  onDuplicate,
  onCopy,
  onPaste,
  onDelete,
  onMore,
}: {
  s: GeoStrings;
  at: Pt;
  hasSel: boolean;
  canPaste: boolean;
  onClose: () => void;
  onProps: (patch: Partial<Record<keyof GeoProps, unknown>>) => void;
  onQuick: (a: QuickAction) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDelete: () => void;
  onMore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
  }, []);
  const item = (label: string, run: () => void, disabled = false) => (
    <button
      type="button"
      role="menuitem"
      className="menu__item"
      disabled={disabled}
      onClick={() => {
        run();
        onClose();
      }}
    >
      {label}
    </button>
  );
  const chip = (label: string, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="geo__chip"
      onClick={() => {
        run();
        onClose();
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      ref={ref}
      className="geo__menu"
      role="menu"
      style={{ transform: `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)` }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
          const k = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(k + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
        }
      }}
    >
      <p className="geo__menu-title">{s.format}</p>
      <div className="geo__menu-row">
        {chip(s.formats.auto!.split(' ')[0]!, () => onProps({ format: 'auto' }))}
        {chip('9.07', () => onProps({ format: 'decimal' }))}
        {chip('3√2', () => onProps({ format: 'radical' }))}
        {chip('7/3', () => onProps({ format: 'fraction' }))}
        {chip('4π', () => onProps({ format: 'pi' }))}
      </div>
      <p className="geo__menu-title">{s.ticks}</p>
      <div className="geo__menu-row">{s.tickOptions.map((t, k) => <span key={k}>{chip(t, () => onProps({ ticks: k }))}</span>)}</div>
      <p className="geo__menu-title">{s.arrows}</p>
      <div className="geo__menu-row">{s.arrowOptions.map((t, k) => <span key={k}>{chip(t, () => onProps({ arrows: k }))}</span>)}</div>
      <hr className="geo__menu-rule" />
      {item(s.showLengths, () => onQuick('lengths'))}
      {item(s.showAngles, () => onQuick('angles'))}
      {item(s.hideLabels, () => onQuick('hide'))}
      {item(s.resetLabels, () => onQuick('reset'))}
      <hr className="geo__menu-rule" />
      {item(s.duplicate, onDuplicate, !hasSel)}
      {item(s.copy, onCopy, !hasSel)}
      {item(s.paste, onPaste, !canPaste)}
      {item(s.deleteSelected, onDelete, !hasSel)}
      {item(s.moreProperties, onMore)}
    </div>
  );
}
