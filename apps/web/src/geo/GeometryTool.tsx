import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactElement, type WheelEvent as RWheelEvent } from 'react';
import { newId } from '../storage';
import { exactSqrt, exactText } from './exact';
import { canvasToPdf, canvasToPng, copyFigure, download, figureBounds, figureSvg, svgToCanvas } from './exportFigure';
import { renderFigure } from './figure';
import { decorate } from './labels';
import { cloneObjects, cornerIds, crossings, type PathNode, draggable, freeRoots, measure, nextName, refs, resolve, toLines, withAncestors, without, type Deco, type GeoObject, type Pt, type Shape } from './model';
import { PropertiesPanel, type AngleTarget, type LengthTarget } from './PropertiesPanel';
import { BASE_PROPS, type GeoProps } from './props';
import { GEO_KEY, notifyEdit } from '../files/keys';
import { slotOf, slotVar } from '../graph/looks';
import { pickPicture, pictureFile, readPicture, type Picture } from '../pictures';

type QuickAction = 'lengths' | 'angles' | 'hide' | 'reset';
import { recognize } from './sketch';
import { solvePolygon, turnArm, type Target } from './solve';
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
  /** snap to midpoints and crossings (existing points always catch) */
  snapPoints: boolean;
  /** snap into line with other points, with guides drawn */
  guides: boolean;
}
interface Snapshot {
  objects: GeoObject[];
  defaults: GeoProps;
}
const DOC_KEY = GEO_KEY;
const START: Doc = { objects: [], view: { cx: 0, cy: 0, s: 50 }, grid: true, axes: true, snap: true, defaults: BASE_PROPS, exam: false, margin: 0.5, snapPoints: true, guides: true };
function loadDoc(): Doc {
  try {
    const v = JSON.parse(localStorage.getItem(DOC_KEY) ?? 'null');
    if (v && Array.isArray(v.objects) && v.view && typeof v.view.s === 'number') return { ...START, ...v, defaults: { ...BASE_PROPS, ...(v.defaults ?? {}), areaLabel: 'hidden' } };
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
type Group = 'line' | 'shape' | 'construct';
/** the toolbar: the tools used most, and groups that open for the rest */
const TOOLBAR: (GeoTool | Group)[] = ['select', 'bezier', 'point', 'line', 'shape', 'angle', 'construct'];
const GROUP_TOOLS: Record<Group, GeoTool[]> = {
  line: ['segment', 'line', 'ray'],
  shape: ['rect', 'triangle', 'regular', 'polygon', 'circle', 'ellipse', 'pen'],
  construct: ['midpoint', 'perpendicular', 'parallel', 'bisector', 'intersection', 'compass', 'reflect', 'rotate'],
};
/** one-letter shortcuts, as in drawing apps */
const KEYS: Record<string, GeoTool> = {
  v: 'select', p: 'bezier', d: 'point', a: 'angle',
  // lines
  l: 'segment', i: 'line', y: 'ray',
  // shapes
  r: 'rect', t: 'triangle', n: 'regular', g: 'polygon', o: 'circle', e: 'ellipse', b: 'pen',
  // constructions
  m: 'midpoint', u: 'perpendicular', j: 'parallel', w: 'bisector', x: 'intersection', c: 'compass', f: 'reflect', q: 'rotate',
};
const KEY_OF = Object.fromEntries(Object.entries(KEYS).map(([k, t]) => [t, k.toUpperCase()])) as Partial<Record<GeoTool, string>>;
const GREEK = 'αβγδεζηθ';
const POINT_KINDS = new Set(['point', 'midpoint', 'intersection', 'reflect', 'rotate', 'vertex']);
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type Handle = (typeof HANDLES)[number];

/** copied objects, kept for paste (with what they are built from) */
let clipboard: GeoObject[] | null = null;

type SnapKind = 'point' | 'midpoint' | 'intersection' | 'guide' | 'grid' | null;
interface Snap {
  at: Pt;
  /** an existing point there, to build on instead of adding a new one */
  id: string | null;
  kind: SnapKind;
  /** alignment guides: the x and/or y another point shares */
  guides?: { x?: number; y?: number };
}
/** a side of a polygon, or a segment: its two end points */
interface SideHit {
  owner: string;
  k: number;
  ids: [string, string];
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
  | { kind: 'resize'; handle: Handle; box: Bounds; orig: Map<string, Pt>; ell: Map<string, { rx: number; ry: number }>; moved: boolean; paths: Map<string, PathNode[]>; imgs: Map<string, { w: number; h: number }> }
  | { kind: 'turn'; center: Pt; from: number; orig: Map<string, Pt>; ell: Map<string, number>; moved: boolean; paths: Map<string, PathNode[]> }
  | { kind: 'marquee'; a: Pt; b: Pt; add: boolean }
  | { kind: 'label'; owner: string; key: string; start: Pt; orig: Pt; moved: boolean }
  | { kind: 'pinch'; d0: number; c0: Pt; view: View }
  | { kind: 'angle'; first: SideHit; cur: SideHit | null }
  /** the pen: dragging out the handles of the anchor just placed */
  | { kind: 'pen'; path: string; k: number; anchor: Pt; moved: boolean }
  /** a path's handle dragged: the other side follows unless Alt breaks it */
  | { kind: 'handle'; path: string; k: number; which: 'in' | 'out'; anchor: Pt; moved: boolean }

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

/** an object's colour as CSS: a palette slot follows the theme */
const cssColor = (c: string | undefined) => {
  if (!c) return undefined;
  const k = slotOf(c);
  return k !== null ? slotVar(k) : /^#[0-9a-f]{6}$/i.test(c) ? c : undefined;
};

/** pen anchors no path uses any more go with it */
function pruneAnchors(list: GeoObject[]): GeoObject[] {
  const used = new Set(list.flatMap((o) => (o.kind === 'path' ? o.nodes.map((n) => n.p) : [])));
  return list.some((o) => o.kind === 'point' && o.anchor && !used.has(o.id)) ? list.filter((o) => !(o.kind === 'point' && o.anchor && !used.has(o.id))) : list;
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
  /** the pen path being drawn, until Enter, Esc or another tool */
  const [penPath, setPenPath] = useState<string | null>(null);
  const [op, setOpState] = useState<Op | null>(null);
  const opRef = useRef<Op | null>(null);
  const setOp = (o: Op | null) => {
    opRef.current = o;
    setOpState(o);
  };
  const [snapMark, setSnapMark] = useState<Snap | null>(null);
  const [mods, setMods] = useState({ shift: false, alt: false });
  const [locks, setLocks] = useState({ regular: false, center: false });
  const [panel, setPanel] = useState<'objects' | 'props'>('props');
  const [menu, setMenu] = useState<Pt | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** the toolbar menu that is open, where its button is */
  const [openMenu, setOpenMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  /** the last tool used from each group, shown on the group's button */
  const [last, setLast] = useState<Record<Group, GeoTool>>({ line: 'segment', shape: 'rect', construct: 'midpoint' });
  // a menu closes when the press lands somewhere else
  useEffect(() => {
    if (!openMenu) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!t.closest('.geo__pop') && !t.closest('[aria-expanded="true"]')) setOpenMenu(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [openMenu]);
  const touchUI = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);
  const [spaceDown, setSpaceDown] = useState(false);
  const [readout, setReadoutState] = useState<{ text: string; at: Pt } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const touches = useRef(new Map<number, Pt>());
  const press = useRef<{ timer: number; at: Pt } | null>(null);
  const coarse = useRef(false);

  const firstDoc = useRef(true);
  useEffect(() => {
    try {
      localStorage.setItem(DOC_KEY, JSON.stringify(doc));
    } catch {
      // kept for this visit only
    }
    if (firstDoc.current) firstDoc.current = false;
    else notifyEdit();
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
  const penPaths = useMemo(() => objects.filter((o): o is Extract<GeoObject, { kind: 'path' }> => o.kind === 'path' && (o.id === penPath || selSet.has(o.id) || o.nodes.some((n) => selSet.has(n.p)))), [objects, penPath, selSet]);
  const showAnchors = useMemo(() => new Set(penPaths.flatMap((o) => o.nodes.map((n) => n.p))), [penPaths]);
  /** a pen anchor nobody can see: not snapped to, not picked */
  const hiddenAnchor = (id: string) => {
    const o = byId.get(id);
    return o?.kind === 'point' && Boolean(o.anchor) && !showAnchors.has(id);
  };
  // Shift keeps shapes regular and resizing even; Alt works from the centre. On touch screens two buttons stand in for them.
  const regular = mods.shift || (touchUI && locks.regular);
  const fromCenter = mods.alt || (touchUI && locks.center);

  // ---- history: every action is one step, objects and document settings together
  const commit = (next: GeoObject[], nextDefaults: GeoProps = defaults) => {
    setPast((p) => [...p, { objects, defaults }].slice(-200));
    setFuture([]);
    setDoc((d) => ({ ...d, objects: pruneAnchors(next), defaults: nextDefaults }));
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
      if (sh.type !== 'point' || exclude?.has(id) || hiddenAnchor(id)) continue;
      const d = near(sh.at);
      if (d < bestD) [best, bestD] = [{ at: sh.at, id, kind: 'point' }, d];
    }
    if (best) return best;
    if (doc.snapPoints) {
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
    }
    const w = toWorld(sp);
    const g = gridStep / 2;
    const grid = doc.snap ? { x: Math.round(w.x / g) * g, y: Math.round(w.y / g) * g } : null;
    // in line with another point: across, down, or both
    if (doc.guides) {
      let gx: number | undefined;
      let gy: number | undefined;
      let [dx, dy] = [R * 0.8, R * 0.8];
      for (const [id, sh] of shapes) {
        if (sh.type !== 'point' || exclude?.has(id) || hiddenAnchor(id)) continue;
        const q = toScreen(sh.at);
        if (Math.abs(q.x - sp.x) < dx) [gx, dx] = [sh.at.x, Math.abs(q.x - sp.x)];
        if (Math.abs(q.y - sp.y) < dy) [gy, dy] = [sh.at.y, Math.abs(q.y - sp.y)];
      }
      if (gx !== undefined || gy !== undefined) {
        const along = (v: number, gv: number | null) => (gv !== null && Math.abs((gv - v) * view.s) < R ? gv : v);
        const at = { x: gx ?? along(w.x, grid?.x ?? null), y: gy ?? along(w.y, grid?.y ?? null) };
        return { at, id: null, kind: 'guide', guides: { x: gx, y: gy } };
      }
    }
    if (grid && near(grid) < R) return { at: grid, id: null, kind: 'grid' };
    return { at: w, id: null, kind: null };
  };

  // ---- hit testing, in screen pixels
  const hitPoint = (sp: Pt, skip?: string): string | null => {
    let best: string | null = null;
    let bestD = reach() + 2;
    for (const [id, sh] of shapes) {
      if (sh.type !== 'point' || id === skip || hiddenAnchor(id)) continue;
      const q = toScreen(sh.at);
      const d = Math.hypot(q.x - sp.x, q.y - sp.y);
      if (d < bestD) [best, bestD] = [id, d];
    }
    return best;
  };
  const distToShape = (sp: Pt, sh: Shape): number => {
    if (sh.type === 'image' || sh.type === 'text') return Infinity;
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
    if (sh.type === 'path') {
      let best = Infinity;
      for (let k = 0; k + 1 < sh.pts.length; k++) best = Math.min(best, seg(sh.pts[k]!, sh.pts[k + 1]!, 'segment'));
      return best;
    }
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
      if (sh.type === 'image') {
        if (Math.abs(w.x - sh.c.x) <= sh.w / 2 && Math.abs(w.y - sh.c.y) <= sh.h / 2) return id;
        continue;
      }
      if (sh.type !== 'polygon' && !(sh.type === 'path' && sh.closed)) continue;
      let inside = false;
      for (let i = 0, j = sh.pts.length - 1; i < sh.pts.length; j = i++) {
        const [p, q] = [sh.pts[i]!, sh.pts[j]!];
        if (p.y > w.y !== q.y > w.y && w.x < ((q.x - p.x) * (w.y - p.y)) / (q.y - p.y) + p.x) inside = !inside;
      }
      if (inside) return id;
    }
    return null;
  };

  /** the segment or polygon side under the pointer, with its end points */
  const hitSide = (sp: Pt, skip?: SideHit | null): SideHit | null => {
    let best: SideHit | null = null;
    let bestD = coarse.current ? 16 : 9;
    for (const o of objects) {
      const sh = shapes.get(o.id);
      if (!sh) continue;
      const sides: SideHit[] = [];
      if (o.kind === 'segment') sides.push({ owner: o.id, k: 0, ids: [o.a, o.b] });
      if (sh.type === 'polygon') {
        const ids = cornerIds(o, objects);
        ids.forEach((id, k) => sides.push({ owner: o.id, k, ids: [id, ids[(k + 1) % ids.length]!] }));
      }
      for (const side of sides) {
        if (skip && skip.owner === side.owner && skip.k === side.k) continue;
        const [a, b] = side.ids.map((id) => shapes.get(id)) as [Shape | undefined, Shape | undefined];
        if (a?.type !== 'point' || b?.type !== 'point') continue;
        const d = distToShape(sp, { type: 'line', a: a.at, b: b.at, extent: 'segment' });
        if (d < bestD) [best, bestD] = [side, d];
      }
    }
    return best;
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
      if (o?.kind === 'point' || o?.kind === 'text' || o?.kind === 'image') orig.set(r, { x: o.x, y: o.y });
    }
    return orig;
  };
  const selBox = useMemo((): Bounds | null => {
    if (!selected.some(draggable)) return null;
    return figureBounds(selected, shapes, { texts: [], lines: [], dots: [] });
  }, [selected, shapes]);
  type Ellipse = Extract<GeoObject, { kind: 'ellipse' }>;
  const setPositions = (orig: Map<string, Pt>, f: (p: Pt) => Pt, ell?: (o: Ellipse) => Partial<Ellipse>, pens?: { paths: Map<string, PathNode[]>; vec: (v: Pt) => Pt }, sizes?: (o: Extract<GeoObject, { kind: 'image' }>) => { w: number; h: number } | null) =>
    setDoc((d) => ({
      ...d,
      objects: d.objects.map((o) => {
        if ((o.kind === 'point' || o.kind === 'text' || o.kind === 'image') && orig.has(o.id)) {
          const p = f(orig.get(o.id)!);
          const sized = o.kind === 'image' ? sizes?.(o) : null;
          return { ...o, x: p.x, y: p.y, ...sized };
        }
        if (o.kind === 'ellipse' && ell) return { ...o, ...ell(o) };
        if (o.kind === 'path' && pens?.paths.has(o.id)) {
          const v = pens.vec;
          return { ...o, nodes: pens.paths.get(o.id)!.map((n) => ({ ...n, in: n.in && v(n.in), out: n.out && v(n.out) })) };
        }
        return o;
      }),
    }));

  const deleteSel = () => {
    if (!selSet.size) return;
    const gone = new Set(selSet);
    const kept = objects.map((o) => {
      if (o.kind !== 'path' || !o.nodes.some((n) => gone.has(n.p) && byId.get(n.p)?.kind === 'point' && (byId.get(n.p) as { anchor?: boolean }).anchor)) return o;
      const nodes = o.nodes.filter((n) => !gone.has(n.p));
      if (nodes.length < 2) gone.add(o.id);
      return { ...o, nodes };
    });
    for (const o of objects) if (o.kind === 'point' && o.anchor && gone.has(o.id)) gone.delete(o.id);
    commit(pruneAnchors(without(kept, gone)));
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
  const live = useRef({ step, deleteSel, duplicate, nudge, objects, selSet, gridStep, op, setOp, picks, boxStart, penPath, finishPen: () => {}, chooseTool: ((t: GeoTool) => void t) as (t: GeoTool) => void, showKeys: () => {} });
  live.current = { step, deleteSel, duplicate, nudge, objects, selSet, gridStep, op, setOp, picks, boxStart, penPath, finishPen: () => finishPen(), chooseTool: (t: GeoTool) => chooseToolRef.current(t), showKeys: () => setOpenMenu((m) => (m?.id === 'keys' ? null : { id: 'keys', x: Math.max(8, window.innerWidth - 320), y: 110 })) };
  const chooseToolRef = useRef<(t: GeoTool) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setMods({ shift: e.shiftKey, alt: e.altKey });
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      // anywhere but a text field: the geometry tool is the page while it is open
      const inGeo = !el || el === document.body || Boolean(el.closest('.geo')) || el.tagName === 'BUTTON';
      if (!inGeo) return;
      const L = live.current;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (e.key === '?') {
        e.preventDefault();
        L.showKeys();
        return;
      }
      if (!mod && !e.altKey && KEYS[k] && !e.repeat) {
        L.chooseTool(KEYS[k]!);
        return;
      }
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
      } else if ((e.key === 'Escape' || e.key === 'Enter') && L.penPath) {
        e.preventDefault();
        L.finishPen();
      } else if (e.key === 'Escape') {
        setMenu(null);
        setExportOpen(false);
        setOpenMenu(null);
        if (L.op?.kind === 'draw' || L.op?.kind === 'marquee' || L.op?.kind === 'angle') L.setOp(null);
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
  const openMenuAt = (sp: Pt) => {
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
      press.current = { at: sp, timer: window.setTimeout(() => openMenuAt(sp), 550) };
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
    if (tool === 'bezier' || tool === 'select') {
      const knob = (e.target as Element).closest?.('[data-pen]')?.getAttribute('data-pen');
      if (knob) {
        const [path, k, which] = knob.split(':') as [string, string, 'in' | 'out'];
        const po = byId.get(path);
        const at = po?.kind === 'path' ? shapes.get(po.nodes[+k]!.p) : undefined;
        if (at?.type === 'point') {
          beginEdit();
          setOp({ kind: 'handle', path, k: +k, which, anchor: at.at, moved: false });
          return;
        }
      }
    }
    if (tool === 'bezier') {
      penDown(sp);
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
          setOp({ kind: 'turn', center, from: Math.atan2(w.y - center.y, w.x - center.x), orig: origOf(roots), ell, moved: false, paths: pathsOf(roots) });
        } else {
          const ell = new Map<string, { rx: number; ry: number }>();
          for (const id of roots) {
            const o = byId.get(id);
            if (o?.kind === 'ellipse') ell.set(id, { rx: o.rx, ry: o.ry });
          }
          const imgs = new Map<string, { w: number; h: number }>();
          for (const id of roots) {
            const o = byId.get(id);
            if (o?.kind === 'image') imgs.set(id, { w: o.w, h: o.h });
          }
          setOp({ kind: 'resize', handle: handle as Handle, box: selBox, orig: origOf(roots), ell, moved: false, paths: pathsOf(roots), imgs });
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
    if (tool === 'angle' && !picks.length) {
      const first = hitSide(sp);
      if (first) {
        setOp({ kind: 'angle', first, cur: null });
        return;
      }
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
    if (o.kind === 'pen' || o.kind === 'handle') {
      // a short wobble on a fresh anchor leaves it a corner
      if (o.kind === 'pen' && !o.moved && dist(sp, toScreen(o.anchor)) < 4) return;
      o.moved = true;
      const w = toWorld(sp);
      let v = { x: w.x - o.anchor.x, y: w.y - o.anchor.y };
      if (e.shiftKey) {
        const a = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4)) * (Math.PI / 4);
        const l = Math.hypot(v.x, v.y);
        v = { x: l * Math.cos(a), y: l * Math.sin(a) };
      }
      const which = o.kind === 'pen' ? 'out' : o.which;
      const other = which === 'out' ? 'in' : 'out';
      const broken = o.kind === 'handle' && e.altKey;
      setDoc((d) => ({
        ...d,
        objects: d.objects.map((x) => {
          if (x.id !== o.path || x.kind !== 'path') return x;
          const nodes = x.nodes.map((n, j) => {
            if (j !== o.k) return n;
            const m: PathNode = { ...n, [which]: v };
            if (!broken) {
              const l = Math.hypot(v.x, v.y) || 1;
              const keep = o.kind === 'handle' && n[other] ? Math.hypot(n[other]!.x, n[other]!.y) : l;
              m[other] = { x: (-v.x / l) * keep, y: (-v.y / l) * keep };
            }
            return m;
          });
          return { ...x, nodes };
        }),
      }));
      return;
    }
    if (o.kind === 'angle') {
      setOp({ ...o, cur: hitSide(sp, o.first) });
      return;
    }
    if (o.kind === 'label') {
      // a press that hardly moves is a click on the shape, not a drag of its label
      if (!o.moved && dist(sp, toScreen(o.start)) < 4) return;
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
      // the handle lands on the grid, so the corners stay on simple numbers (and their lengths exact)
      const w0 = toWorld(sp);
      const g = gridStep / 2;
      const w = doc.snap ? { x: Math.round(w0.x / g) * g, y: Math.round(w0.y / g) * g } : w0;
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
        { paths: o.paths, vec: (v) => ({ x: v.x * sx, y: v.y * sy }) },
        (im) => (o.imgs.has(im.id) ? { w: o.imgs.get(im.id)!.w * Math.abs(sx), h: o.imgs.get(im.id)!.h * Math.abs(sy) } : null),
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
        { paths: o.paths, vec: (v) => ({ x: v.x * c - v.y * si, y: v.x * si + v.y * c }) },
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
    if (o.kind === 'pen') return;
    if (o.kind === 'move' || o.kind === 'resize' || o.kind === 'turn' || o.kind === 'label' || o.kind === 'handle') {
      if (!o.moved) setPast((p) => p.slice(0, -1));
      if (!o.moved && o.kind === 'label') setSel(e.shiftKey ? (cur) => (cur.includes(o.owner) ? cur : [...cur, o.owner]) : [o.owner]);
      else setFuture([]);
      // points dragged by hand, or a shape stretched: its typed values no longer hold, so they let go
      // (moving or turning a whole shape keeps every length and angle, so those stay)
      if (o.moved && (o.kind === 'move' || o.kind === 'resize')) {
        const moved = o.orig;
        setDoc((d) => ({
          ...d,
          objects: d.objects.map((x) => {
            if (x.kind !== 'polygon' || !x.pts.some((id) => moved.has(id))) return x;
            if (o.kind === 'move' && x.pts.every((id) => moved.has(id))) return x;
            const strip = (list?: Deco['sides']) => list?.map(({ len: _l, deg: _d, at: _a, ...rest }) => rest);
            return { ...x, deco: { ...x.deco, sides: strip(x.deco?.sides), corners: strip(x.deco?.corners) } };
          }),
        }));
      }
      return;
    }
    if (o.kind === 'angle') {
      const second = o.cur ?? hitSide(eventPt(e), o.first);
      if (second) markAngle(o.first, second);
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
                : sh.type === 'polygon' || sh.type === 'path'
                  ? sh.pts
                  : sh.type === 'image'
                    ? [{ x: sh.c.x - sh.w / 2, y: sh.c.y - sh.h / 2 }, { x: sh.c.x + sh.w / 2, y: sh.c.y + sh.h / 2 }]
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

  /** a picture placed at `at` (the middle of the view by default), 60% of the view at most, selected */
  const placePicture = (pic: Picture, at?: Pt) => {
    const vw = size.w / view.s;
    const vh = size.h / view.s;
    const aspect = pic.w / pic.h;
    const w = Math.min(vw * 0.6, vh * 0.6 * aspect);
    const id = newId();
    const c = at ?? { x: view.cx, y: view.cy };
    const t = (v: number) => Number(v.toPrecision(4));
    // pictures go first, under every shape
    commit([{ id, kind: 'image', name: `img${objects.filter((o) => o.kind === 'image').length + 1}`, x: t(c.x), y: t(c.y), w: t(w), h: t(w / aspect), src: pic.src, opacity: 1 }, ...objects]);
    chooseTool('select');
    setSel([id]);
  };
  const addPicture = async () => {
    const pic = await pickPicture();
    if (pic) placePicture(pic);
  };

  /** the pen: a click adds an anchor (a drag pulls out its handles); the first anchor closes the path */
  const penDown = (sp: Pt) => {
    const cur = penPath ? byId.get(penPath) : undefined;
    const path = cur?.kind === 'path' ? cur : null;
    const sn = snapAt(sp);
    if (path && path.nodes.length >= 2 && sn.id === path.nodes[0]!.p) {
      commit(objects.map((o) => (o.id === path.id ? { ...path, closed: true } : o)));
      setPenPath(null);
      setSel([path.id]);
      return;
    }
    let list = objects;
    let pid: string;
    if (sn.id && !path?.nodes.some((n) => n.p === sn.id)) pid = sn.id;
    else {
      pid = newId();
      list = [...list, { id: pid, kind: 'point', name: '', x: sn.at.x, y: sn.at.y, anchor: true }];
    }
    let id: string;
    let k: number;
    if (path) {
      id = path.id;
      k = path.nodes.length;
      // the path goes after its new anchor, so the anchor is placed first when the figure is worked out
      list = [...list.filter((o) => o.id !== id), { ...path, nodes: [...path.nodes, { p: pid }] }];
    } else {
      id = newId();
      k = 0;
      list = [...list, { id, kind: 'path', name: lowerName(list), nodes: [{ p: pid }], closed: false }];
      setPenPath(id);
    }
    commit(list);
    setOp({ kind: 'pen', path: id, k, anchor: sn.at, moved: false });
  };
  /** the pen lets go of its path; one anchor alone is no path */
  const finishPen = () => {
    if (!penPath) return;
    const id = penPath;
    setPenPath(null);
    setDoc((d) => {
      const o = d.objects.find((x) => x.id === id);
      if (o?.kind !== 'path' || o.nodes.length >= 2) return d;
      return { ...d, objects: pruneAnchors(d.objects.filter((x) => x.id !== id)) };
    });
    setSel([id]);
  };
  const pathsOf = (roots: string[]) => {
    const r = new Set(roots);
    const m = new Map<string, PathNode[]>();
    for (const o of objects) if (o.kind === 'path' && o.nodes.every((n) => r.has(n.p))) m.set(o.id, o.nodes);
    return m;
  };

  /** the angle between two sides that meet: a polygon's own corner, or a new angle */
  const markAngle = (a: SideHit, b: SideHit) => {
    const vertex = a.ids.find((id) => b.ids.includes(id));
    if (!vertex) {
      setMessage(s.sidesMustMeet);
      return;
    }
    const owner = byId.get(a.owner);
    if (a.owner === b.owner && owner && (owner.kind === 'polygon' || owner.kind === 'regular')) {
      const ids = cornerIds(owner, objects);
      const k = ids.indexOf(vertex);
      const corners = [...(owner.deco?.corners ?? [])];
      while (corners.length < ids.length) corners.push({});
      corners[k] = { ...corners[k], label: corners[k]?.text ? 'custom' : 'value' };
      commit(objects.map((x) => (x.id === owner.id ? { ...x, deco: { ...x.deco, corners } } : x)));
      setSel([owner.id]);
      return;
    }
    const other = (h: SideHit) => h.ids.find((id) => id !== vertex)!;
    const list = objects;
    commit([...list, { id: newId(), kind: 'angle', name: angleName(list), a: other(a), vertex, c: other(b) }]);
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
  const onDeco = (id: string, change: (d: Deco) => Deco, props?: Partial<Record<keyof GeoProps, unknown>>) =>
    patchObjects(new Set([id]), (o) => {
      const own = { ...o.props, ...props } as Record<string, unknown>;
      for (const k of Object.keys(own)) if (own[k] === undefined) delete own[k];
      return { ...o, deco: change(o.deco ?? {}), props: own as Partial<GeoProps> };
    });
  const onPropsFor = (ids: string[], patch: Partial<Record<keyof GeoProps, unknown>>) => patchObjects(new Set(ids), (o) => ({ ...o, props: { ...o.props, ...(patch as Partial<GeoProps>) } }));
  /** the two points a side (or a radius) runs between */
  const endsOf = (t: LengthTarget): [string, string] | null => {
    const o = byId.get(t.owner);
    if (!o) return null;
    if ('radius' in t) return o.kind === 'circle' ? [o.center, o.through] : null;
    if (o.kind === 'segment') return [o.a, o.b];
    const ids = cornerIds(o, objects);
    return ids.length ? [ids[t.side]!, ids[(t.side + 1) % ids.length]!] : null;
  };
  const isFree = (id: string) => byId.get(id)?.kind === 'point';
  const canEditLength = (t: LengthTarget) => {
    const o = byId.get(t.owner);
    if (o?.kind === 'polygon') return o.pts.some(isFree);
    const ends = endsOf(t);
    return Boolean(ends && (isFree(ends[1]) || ('side' in t && isFree(ends[0]))));
  };

  /**
   * A polygon redrawn to the values typed for it, after one more is typed (or let go).
   * Too many values for the shape to hold: the oldest give way.
   */
  const relock = (ownerId: string, change: { which: 'sides' | 'corners'; k: number; value: number | undefined }) => {
    const o = byId.get(ownerId);
    const sh = shapes.get(ownerId);
    if (o?.kind !== 'polygon' || sh?.type !== 'polygon') return;
    const n = o.pts.length;
    const sides = Array.from({ length: n }, (_, k) => ({ ...(o.deco?.sides?.[k] ?? {}) }));
    const corners = Array.from({ length: n }, (_, k) => ({ ...(o.deco?.corners?.[k] ?? {}) }));
    const list = change.which === 'sides' ? sides : corners;
    const key = change.which === 'sides' ? 'len' : 'deg';
    const part = list[change.k]!;
    if (change.value === undefined) {
      delete part[key];
      delete part.at;
    } else {
      part[key] = change.value;
      part.at = Date.now();
      // a value shows once it is typed
      if (part.label === 'hidden' || part.label === undefined) part.label = part.text ? 'custom' : 'value';
    }
    const locks = () =>
      [
        ...sides.map((p, k) => (p.len !== undefined ? { list: sides, k, key: 'len' as const, at: p.at ?? 0 } : null)),
        ...corners.map((p, k) => (p.deg !== undefined ? { list: corners, k, key: 'deg' as const, at: p.at ?? 0 } : null)),
      ]
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .filter((x) => !(x.list === list && x.k === change.k))
        .sort((a, b) => a.at - b.at);
    const free = (part: { len?: number; deg?: number; at?: number }, k: 'len' | 'deg') => {
      delete part[k];
      delete part.at;
    };
    const count = () => sides.filter((p) => p.len !== undefined).length + corners.filter((p) => p.deg !== undefined).length;
    while (count() > 2 * n - 3 && locks().length) {
      const old = locks()[0]!;
      free(old.list[old.k]!, old.key);
    }
    // all the angles can't be chosen: they add up to (n − 2)·180°
    if (corners.every((p) => p.deg !== undefined)) {
      const old = locks().find((x) => x.key === 'deg');
      if (old) free(old.list[old.k]!, 'deg');
    }
    const targets: Target[] = [
      ...sides.flatMap((p, k) => (p.len !== undefined ? [{ kind: 'len' as const, side: k, value: p.len }] : [])),
      ...corners.flatMap((p, k) => (p.deg !== undefined ? [{ kind: 'ang' as const, corner: k, value: p.deg }] : [])),
    ];
    const { pts, miss } = solvePolygon(sh.pts, o.pts.map(isFree), targets);
    if (miss > 1e-6) setNotice(s.cannotFit);
    const at = new Map(o.pts.map((id, k) => [id, pts[k]!]));
    commit(
      objects.map((x) => {
        if (x.id === ownerId) return { ...x, deco: { ...x.deco, sides, corners } };
        const p = at.get(x.id);
        return p && x.kind === 'point' ? { ...x, x: p.x, y: p.y } : x;
      }),
    );
  };
  const canEditAngle = (t: AngleTarget) => {
    const o = byId.get(t.owner);
    if (o?.kind === 'polygon') return o.pts.some(isFree);
    if (o?.kind === 'angle') return isFree(o.c) || isFree(o.a);
    return false;
  };
  /** an angle typed: a polygon is redrawn; an angle's free arm swings to it */
  const onAngle = (t: AngleTarget, deg: number) => {
    const o = byId.get(t.owner);
    if (o?.kind === 'polygon' && 'corner' in t) return relock(o.id, { which: 'corners', k: t.corner, value: deg });
    if (o?.kind !== 'angle') return;
    const [a, v, c] = [o.a, o.vertex, o.c].map((id) => shapes.get(id)) as (Shape | undefined)[];
    if (a?.type !== 'point' || v?.type !== 'point' || c?.type !== 'point') return;
    const [move, to] = isFree(o.c) ? [o.c, turnArm(a.at, v.at, c.at, deg)] : [o.a, turnArm(c.at, v.at, a.at, deg)];
    commit(objects.map((x) => (x.id === move && x.kind === 'point' ? { ...x, x: to.x, y: to.y } : x)));
  };
  const onUnlock = (owner: string, which: 'sides' | 'corners', k: number) => relock(owner, { which, k, value: undefined });

  /** a side typed to a length: a polygon is redrawn; a segment's far end (or near one) slides along it */
  const onLength = (t: LengthTarget, length: number) => {
    const owner = byId.get(t.owner);
    if (owner?.kind === 'polygon' && 'side' in t) return relock(owner.id, { which: 'sides', k: t.side, value: length });
    const ends = endsOf(t);
    if (!ends) return;
    const [pa, pb] = ends.map((id) => shapes.get(id)) as [Shape | undefined, Shape | undefined];
    if (pa?.type !== 'point' || pb?.type !== 'point') return;
    const d = dist(pa.at, pb.at) || 1;
    const u = { x: (pb.at.x - pa.at.x) / d, y: (pb.at.y - pa.at.y) / d };
    const [move, at] = isFree(ends[1]) ? [ends[1], { x: pa.at.x + u.x * length, y: pa.at.y + u.y * length }] : [ends[0], { x: pb.at.x - u.x * length, y: pb.at.y - u.y * length }];
    commit(objects.map((o) => (o.id === move && o.kind === 'point' ? { ...o, x: at.x, y: at.y } : o)));
  };
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
  const figure = renderFigure({ objects, shapes, deco, toScreen, scale: view.s, far, highlight, interactive: true, showAnchors, colorOf: doc.exam ? undefined : (o) => cssColor(o.color) });

  // pen paths in hand: their handles, and the next piece following the cursor
  let penMarks: ReactElement | null = null;
  if (tool === 'select' || tool === 'bezier') {
    const parts: ReactElement[] = [];
    const ks = coarse.current ? 7 : 4.5;
    for (const o of penPaths) {
      o.nodes.forEach((n, k) => {
        const a = shapes.get(n.p);
        if (a?.type !== 'point') return;
        const as = toScreen(a.at);
        for (const which of ['in', 'out'] as const) {
          const h = n[which];
          if (!h || Math.hypot(h.x, h.y) * view.s < 1) continue;
          const hs = toScreen({ x: a.at.x + h.x, y: a.at.y + h.y });
          parts.push(
            <g key={`${o.id}:${k}:${which}`}>
              <line className="geo__pen-arm" x1={as.x} y1={as.y} x2={hs.x} y2={hs.y} />
              <circle className="geo__pen-knob" data-pen={`${o.id}:${k}:${which}`} cx={hs.x} cy={hs.y} r={ks} />
            </g>,
          );
        }
      });
    }
    const drawing = penPath ? byId.get(penPath) : undefined;
    if (tool === 'bezier' && drawing?.kind === 'path' && hover && (!op || op.kind !== 'pen')) {
      const lastNode = drawing.nodes[drawing.nodes.length - 1]!;
      const a = shapes.get(lastNode.p);
      if (a?.type === 'point') {
        const out = lastNode.out ?? { x: 0, y: 0 };
        const [p0, c1, p1] = [toScreen(a.at), toScreen({ x: a.at.x + out.x, y: a.at.y + out.y }), toScreen(snapAt(toScreen(hover)).at)];
        parts.push(<path key="next" className="geo__pen-next" d={`M${p0.x},${p0.y} C${c1.x},${c1.y} ${p1.x},${p1.y} ${p1.x},${p1.y}`} />);
      }
    }
    penMarks = parts.length ? <g>{parts}</g> : null;
  }

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
    finishPen();
    setTool(id);
    setPicks([]);
    setBoxStart(null);
    setMessage(null);
    setOpenMenu(null);
    const g = (Object.keys(GROUP_TOOLS) as Group[]).find((x) => GROUP_TOOLS[x].includes(id));
    if (g) setLast((l) => ({ ...l, [g]: id }));
    if (id !== 'select' && id !== 'move' && !penPath) setSel([]);
  };
  chooseToolRef.current = chooseTool;
  const openAt = (id: string, el: Element) => {
    if (openMenu?.id === id) return setOpenMenu(null);
    const r = el.getBoundingClientRect();
    setOpenMenu({ id, x: r.left, y: r.bottom + 4 });
  };
  const toolButton = (id: GeoTool) => (
    <button key={id} type="button" className="geo__tool" aria-pressed={tool === id} title={KEY_OF[id] ? `${s.tools[id]} (${KEY_OF[id]})` : s.tools[id]} onClick={() => chooseTool(id)}>
      {s.tools[id]}
    </button>
  );
  const popover = (id: string, children: ReactElement | ReactElement[]) =>
    openMenu?.id === id && (
      <div
        className="geo__pop"
        role="menu"
        style={{ transform: `translate(${Math.round(openMenu.x)}px, ${Math.round(openMenu.y)}px)` }}
        ref={(el) => {
          // kept inside the window: a menu opened from a button near the right edge opens leftwards
          if (!el) return;
          const x = Math.max(8, Math.min(openMenu.x, window.innerWidth - el.offsetWidth - 8));
          const y = Math.max(8, Math.min(openMenu.y, window.innerHeight - el.offsetHeight - 8));
          el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
        }}
      >
        {children}
      </div>
    );
  const check = (label: string, on: boolean, set: (v: boolean) => void) => (
    <label key={label} className="geo__pop-check">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      {label}
    </label>
  );

  // the sides the angle tool is joining
  let angleMarks: ReactElement | null = null;
  if (op?.kind === 'angle') {
    const line = (h: SideHit, key: string) => {
      const [a, b] = h.ids.map((id) => shapes.get(id)) as [Shape | undefined, Shape | undefined];
      if (a?.type !== 'point' || b?.type !== 'point') return null;
      const [p, q] = [toScreen(a.at), toScreen(b.at)];
      return <line key={key} className="geo__side-pick" x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
    };
    angleMarks = (
      <g>
        {line(op.first, 'a')}
        {op.cur && line(op.cur, 'b')}
      </g>
    );
  }
  // alignment guides across the canvas
  const guideLines =
    snapMark?.kind === 'guide' && snapMark.guides ? (
      <g className="geo__guides">
        {snapMark.guides.x !== undefined && <line x1={toScreen({ x: snapMark.guides.x, y: 0 }).x} x2={toScreen({ x: snapMark.guides.x, y: 0 }).x} y1={0} y2={size.h} />}
        {snapMark.guides.y !== undefined && <line x1={0} x2={size.w} y1={toScreen({ x: 0, y: snapMark.guides.y }).y} y2={toScreen({ x: 0, y: snapMark.guides.y }).y} />}
      </g>
    ) : null;

  return (
    <div className="geo">
      <div className="geo__tools" role="toolbar" aria-label={s.toolbar}>
        <div className="geo__group" role="group">
          {TOOLBAR.map((item) => {
            if (!(item in GROUP_TOOLS)) return toolButton(item as GeoTool);
            const g = item as Group;
            const inGroup = GROUP_TOOLS[g].includes(tool);
            const shown = inGroup ? tool : last[g];
            return (
              <span key={g} className="geo__split">
                <button type="button" className="geo__tool" aria-pressed={inGroup} title={KEY_OF[shown] ? `${s.tools[shown]} (${KEY_OF[shown]})` : s.tools[shown]} onClick={() => chooseTool(shown)}>
                  {g === 'construct' && !inGroup ? s.groups.construct : s.tools[shown]}
                </button>
                <button type="button" className="geo__tool geo__more" aria-label={s.moreTools(s.groups[g]!)} aria-expanded={openMenu?.id === g} onClick={(e) => openAt(g, e.currentTarget)}>
                  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
                    <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {popover(
                  g,
                  GROUP_TOOLS[g].map((t) => (
                    <button key={t} type="button" role="menuitemradio" aria-checked={tool === t} className="menu__item geo__pop-item" onClick={() => chooseTool(t)}>
                      <span>{s.tools[t]}</span>
                      {KEY_OF[t] && <kbd className="geo__kbd">{KEY_OF[t]}</kbd>}
                    </button>
                  )),
                )}
              </span>
            );
          })}
        </div>
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
        {touchUI && (
          <div className="geo__group geo__locks" role="group">
            <button type="button" className="geo__tool" aria-pressed={locks.regular} onClick={() => setLocks((l) => ({ ...l, regular: !l.regular }))}>
              {s.regularShape}
            </button>
            <button type="button" className="geo__tool" aria-pressed={locks.center} onClick={() => setLocks((l) => ({ ...l, center: !l.center }))}>
              {s.fromCenter}
            </button>
          </div>
        )}

        <div className="geo__tools-end">
          <button type="button" className="btn btn--small btn--quiet" title={s.addImageHint} onClick={() => void addPicture()}>
            {s.addImage}
          </button>
          <button type="button" className="icon-btn" aria-label={s.undo} title={`${s.undo} (⌘Z)`} disabled={!past.length} onClick={() => step('undo')}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M6 4L3 7l3 3M3 7h6.5a3.5 3.5 0 010 7H8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="icon-btn" aria-label={s.redo} title={`${s.redo} (⇧⌘Z)`} disabled={!future.length} onClick={() => step('redo')}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M10 4l3 3-3 3M13 7H6.5a3.5 3.5 0 000 7H8" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="geo__split">
            <button type="button" className="btn btn--small btn--quiet" aria-expanded={openMenu?.id === 'snap'} onClick={(e) => openAt('snap', e.currentTarget)}>
              {s.snapMenu}
            </button>
            {popover('snap', [
              check(s.snapGrid, doc.snap, (v) => setDoc((d) => ({ ...d, snap: v }))),
              check(s.snapPoints, doc.snapPoints, (v) => setDoc((d) => ({ ...d, snapPoints: v }))),
              check(s.snapGuides, doc.guides, (v) => setDoc((d) => ({ ...d, guides: v }))),
            ])}
          </span>
          <span className="geo__split">
            <button type="button" className="btn btn--small btn--quiet" aria-expanded={openMenu?.id === 'view'} onClick={(e) => openAt('view', e.currentTarget)}>
              {s.viewMenu}
            </button>
            {popover('view', [
              check(s.grid, doc.grid, (v) => setDoc((d) => ({ ...d, grid: v }))),
              check(s.axes, doc.axes, (v) => setDoc((d) => ({ ...d, axes: v }))),
              check(s.examView, doc.exam, (v) => setDoc((d) => ({ ...d, exam: v }))),
              <button
                key="fit"
                type="button"
                className="menu__item geo__pop-item"
                onClick={() => {
                  fit();
                  setOpenMenu(null);
                }}
              >
                {s.fit}
              </button>,
              <button key="keys" type="button" className="menu__item geo__pop-item" onClick={() => setOpenMenu((m) => m && { ...m, id: 'keys' })}>
                <span>{s.shortcuts}</span>
                <kbd className="geo__kbd">?</kbd>
              </button>,
            ])}
            {popover(
              'keys',
              <dl className="geo__keys">
                {Object.entries(KEYS).map(([key, t]) => (
                  <div key={key} className="geo__keys-row">
                    <dt>{s.tools[t]}</dt>
                    <dd>
                      <kbd className="geo__kbd">{key.toUpperCase()}</kbd>
                    </dd>
                  </div>
                ))}
                {s.editKeys.map(([what, keys]) => (
                  <div key={what} className="geo__keys-row">
                    <dt>{what}</dt>
                    <dd>
                      <kbd className="geo__kbd">{keys}</kbd>
                    </dd>
                  </div>
                ))}
              </dl>,
            )}
          </span>
          <span className="geo__split">
            <button type="button" className="btn btn--small" aria-expanded={openMenu?.id === 'export'} onClick={(e) => openAt('export', e.currentTarget)}>
              {s.exportMenu}
            </button>
            {popover(
              'export',
              <div className="geo__export-menu">
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
              </div>,
            )}
          </span>
        </div>
      </div>

      <div className="geo__body">
        <section
          className="geo__stage"
          aria-label={s.canvas}
          onDragOver={(e) => {
            if ([...e.dataTransfer.types].includes('Files')) e.preventDefault();
          }}
          onDrop={async (e) => {
            const file = pictureFile(e.dataTransfer);
            if (!file) return;
            e.preventDefault();
            const at = toWorld(eventPt(e));
            const pic = await readPicture(file);
            if (pic) placePicture(pic, at);
          }}
        >
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
              openMenuAt(eventPt(e));
            }}
          >
            {gridLines()}
            {guideLines}
            {figure}
            {angleMarks}
            {preview}
            {penMarks}
            {stroke && <polyline className="geo__ink" points={stroke.map((p) => `${p.x},${p.y}`).join(' ')} />}
            {snapMark?.kind && (
              <g className="geo__snap">
                <circle cx={toScreen(snapMark.at).x} cy={toScreen(snapMark.at).y} r={snapMark.kind === 'guide' ? 4 : 7} />
                <text x={toScreen(snapMark.at).x + 10} y={toScreen(snapMark.at).y - 10}>
                  {snapMark.kind === 'guide' ? s.guide : s.snapKinds[snapMark.kind]}
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
          <div className="segmented geo__panel-tabs" role="group" aria-label={s.objects}>
            <button type="button" aria-pressed={panel === 'props'} onClick={() => setPanel('props')}>
              {s.propertiesTab}
            </button>
            <button type="button" aria-pressed={panel === 'objects'} onClick={() => setPanel('objects')}>
              {s.objectsTab}
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
              onPropsFor={onPropsFor}
              onDeco={onDeco}
              onRename={(id, name) => patchObjects(new Set([id]), (o) => ({ ...o, name }))}
              onLength={onLength}
              canEditLength={canEditLength}
              onAngle={onAngle}
              canEditAngle={canEditAngle}
              onUnlock={onUnlock}
              onColor={(ids, color) => patchObjects(new Set(ids), (o) => ({ ...o, color }))}
              onImage={(id, patch) => patchObjects(new Set([id]), (o) => (o.kind === 'image' ? { ...o, ...patch } : o))}
            />
          ) : objects.length === 0 ? (
            <p className="geo__empty">{s.empty}</p>
          ) : (
            <ul className="geo__list">
              {objects.map((o) => {
                if (o.kind === 'point' && o.anchor) return null;
                const sh = shapes.get(o.id);
                const m = sh && (sh.type === 'line' || sh.type === 'circle' || sh.type === 'angle') ? measure(sh) : null;
                const on = selSet.has(o.id);
                return (
                  <li key={o.id} className={`geo__item${on ? ' is-selected' : ''}`}>
                    <button
                      type="button"
                      className="geo__item-main"
                      onClick={(e) => {
                        if (tool !== 'select') chooseTool('select');
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

/** right-click or long-press: quick label actions and the edit commands */
function ContextMenu({
  s,
  at,
  hasSel,
  canPaste,
  onClose,
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
  const item = (label: string, run: () => void, disabled = false, keys?: string) => (
    <button
      type="button"
      role="menuitem"
      className="menu__item geo__pop-item"
      disabled={disabled}
      onClick={() => {
        run();
        onClose();
      }}
    >
      <span>{label}</span>
      {keys && <kbd className="geo__kbd">{keys}</kbd>}
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
      {item(s.showLengths, () => onQuick('lengths'))}
      {item(s.showAngles, () => onQuick('angles'))}
      {item(s.hideLabels, () => onQuick('hide'))}
      {item(s.resetLabels, () => onQuick('reset'))}
      <hr className="geo__menu-rule" />
      {item(s.duplicate, onDuplicate, !hasSel, '⌘D')}
      {item(s.copy, onCopy, !hasSel, '⌘C')}
      {item(s.paste, onPaste, !canPaste, '⌘V')}
      {item(s.deleteSelected, onDelete, !hasSel, '⌫')}
      <hr className="geo__menu-rule" />
      {item(s.moreProperties, onMore)}
    </div>
  );
}
