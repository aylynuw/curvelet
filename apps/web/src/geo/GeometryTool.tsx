import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactElement, type WheelEvent as RWheelEvent } from 'react';
import { newId } from '../storage';
import { measure, nextName, resolve, toLines, type GeoObject, type Pt, type Shape } from './model';
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
}
const DOC_KEY = 'calculator.geometry.v1';
const START: Doc = { objects: [], view: { cx: 0, cy: 0, s: 50 }, grid: true, axes: true, snap: true };
function loadDoc(): Doc {
  try {
    const v = JSON.parse(localStorage.getItem(DOC_KEY) ?? 'null');
    if (v && Array.isArray(v.objects) && v.view && typeof v.view.s === 'number') return { ...START, ...v };
  } catch {
    // a fresh canvas
  }
  return START;
}

type Need = 'pt' | 'line' | 'curve';
const NEEDS: Partial<Record<GeoTool, Need[]>> = {
  point: ['pt'],
  segment: ['pt', 'pt'], line: ['pt', 'pt'], ray: ['pt', 'pt'], circle: ['pt', 'pt'], midpoint: ['pt', 'pt'], bisector: ['pt', 'pt'],
  compass: ['pt', 'pt', 'pt'], angle: ['pt', 'pt', 'pt'],
  perpendicular: ['line', 'pt'], parallel: ['line', 'pt'], reflect: ['pt', 'line'], rotate: ['pt', 'pt'],
  intersection: ['curve', 'curve'],
  square: ['pt', 'pt'], regular: ['pt', 'pt'],
};
const GROUPS: GeoTool[][] = [
  ['move', 'select', 'point', 'pen'],
  ['segment', 'line', 'ray', 'polygon', 'square', 'regular', 'circle', 'compass'],
  ['midpoint', 'perpendicular', 'parallel', 'bisector', 'intersection'],
  ['angle', 'reflect', 'rotate', 'delete'],
];
const GREEK = 'αβγδεζηθ';

/** the ids an object is built from */
function refs(o: GeoObject): string[] {
  switch (o.kind) {
    case 'point':
    case 'text':
      return [];
    case 'midpoint':
    case 'segment':
    case 'line':
    case 'ray':
    case 'bisector':
      return [o.a, o.b];
    case 'intersection':
      return [o.p, o.q];
    case 'reflect':
      return [o.p, o.line];
    case 'rotate':
      return [o.p, o.center];
    case 'perpendicular':
    case 'parallel':
      return [o.line, o.through];
    case 'circle':
      return [o.center, o.through];
    case 'compass':
      return [o.center, o.r1, o.r2];
    case 'polygon':
      return o.pts;
    case 'regular':
      return [o.a, o.b];
    case 'vertex':
      return [o.poly];
    case 'angle':
      return [o.a, o.vertex, o.c];
  }
}
/** the free points an object hangs on: moving them moves it */
function freeRoots(objects: GeoObject[], ids: string[]): string[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const out = new Set<string>();
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const o = byId.get(id);
    if (!o) return;
    if (o.kind === 'point') out.add(id);
    refs(o).forEach(walk);
  };
  ids.forEach(walk);
  return [...out];
}
/** remove ids and everything built on them */
function without(objects: GeoObject[], ids: Set<string>): GeoObject[] {
  const gone = new Set(ids);
  for (const o of objects) if (refs(o).some((r) => gone.has(r))) gone.add(o.id);
  return objects.filter((o) => !gone.has(o.id));
}
const nice = (raw: number) => {
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
};

export function GeometryTool({ s, onSendToGraph }: { s: GeoStrings; onSendToGraph: (lines: string[]) => void }) {
  const [doc, setDoc] = useState<Doc>(loadDoc);
  const { objects, view } = doc;
  const [past, setPast] = useState<GeoObject[][]>([]);
  const [future, setFuture] = useState<GeoObject[][]>([]);
  const [tool, setTool] = useState<GeoTool>('move');
  const [picks, setPicks] = useState<string[]>([]);
  const [degrees, setDegrees] = useState(90);
  const [sides, setSides] = useState(5);
  /** the Select tool's objects */
  const [sel, setSel] = useState<string[]>([]);
  const [box, setBox] = useState<{ a: Pt; b: Pt } | null>(null);
  const group = useRef<{ start: Pt; orig: Map<string, Pt>; moved: boolean } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<Pt | null>(null);
  const [stroke, setStroke] = useState<Pt[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const drag = useRef<{ id: string | null; from: Pt; view: View; moved: boolean } | null>(null);

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

  const shapes = useMemo(() => resolve(objects), [objects]);
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);

  // ---- history
  const commit = (next: GeoObject[]) => {
    setPast((p) => [...p, objects].slice(-200));
    setFuture([]);
    setDoc((d) => ({ ...d, objects: next }));
  };
  const step = (dir: 'undo' | 'redo') => {
    if (dir === 'undo' && past.length) {
      setFuture((f) => [objects, ...f]);
      setDoc((d) => ({ ...d, objects: past[past.length - 1]! }));
      setPast((p) => p.slice(0, -1));
    } else if (dir === 'redo' && future.length) {
      setPast((p) => [...p, objects]);
      setDoc((d) => ({ ...d, objects: future[0]! }));
      setFuture((f) => f.slice(1));
    }
    setPicks([]);
  };
  const deleteSel = () => {
    if (!sel.length) return;
    commit(without(objects, new Set(sel)));
    setSel([]);
  };
  const live = useRef({ step, selected, objects, sel, deleteSel });
  live.current = { step, selected, objects, sel, deleteSel };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        live.current.step(e.shiftKey ? 'redo' : 'undo');
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        live.current.step('redo');
      } else if (e.key === 'Escape') {
        setPicks([]);
        setStroke(null);
        setSel([]);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && live.current.sel.length && el?.closest('.geo')) {
        e.preventDefault();
        live.current.deleteSel();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && live.current.selected && el?.closest('.geo')) {
        e.preventDefault();
        const id = live.current.selected;
        setPast((p) => [...p, live.current.objects]);
        setDoc((d) => ({ ...d, objects: without(d.objects, new Set([id])) }));
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- coordinates
  const toScreen = (p: Pt): Pt => ({ x: size.w / 2 + (p.x - view.cx) * view.s, y: size.h / 2 - (p.y - view.cy) * view.s });
  const toWorld = (p: Pt): Pt => ({ x: view.cx + (p.x - size.w / 2) / view.s, y: view.cy - (p.y - size.h / 2) / view.s });
  const eventPt = (e: { clientX: number; clientY: number }): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const gridStep = nice(60 / view.s);
  const snapped = (w: Pt): Pt => {
    if (!doc.snap) return w;
    const g = gridStep / 2;
    const r = { x: Math.round(w.x / g) * g, y: Math.round(w.y / g) * g };
    return Math.hypot(r.x - w.x, r.y - w.y) * view.s < 10 ? r : w;
  };

  // ---- hit testing, in screen pixels
  const hitPoint = (sp: Pt, skip?: string): string | null => {
    let best: string | null = null;
    let bestD = 12;
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
    return Infinity;
  };
  const hitCurve = (sp: Pt, need: Need | 'any'): string | null => {
    let best: string | null = null;
    let bestD = 8;
    for (const [id, sh] of shapes) {
      const ok = need === 'any' ? sh.type !== 'point' : need === 'line' ? sh.type === 'line' : sh.type === 'line' || sh.type === 'circle';
      if (!ok) continue;
      const d = distToShape(sp, sh);
      if (d < bestD) [best, bestD] = [id, d];
    }
    if (best || need !== 'any') return best;
    // inside a filled polygon: the topmost one
    for (const [id, sh] of [...shapes].reverse()) {
      if (sh.type !== 'polygon') continue;
      const pts = sh.pts.map(toScreen);
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [p, q] = [pts[i]!, pts[j]!];
        if (p.y > sp.y !== q.y > sp.y && sp.x < ((q.x - p.x) * (sp.y - p.y)) / (q.y - p.y) + p.x) inside = !inside;
      }
      if (inside) return id;
    }
    return null;
  };

  // ---- building
  const kindOfLine = new Set(['segment', 'line', 'ray', 'perpendicular', 'parallel', 'bisector']);
  const lowerName = (list: GeoObject[]) => nextName(list, true);
  const angleName = (list: GeoObject[]) => {
    const used = new Set(list.map((o) => o.name));
    for (let r = 0; ; r++) for (const g of GREEK) if (!used.has(r ? `${g}_${r}` : g)) return r ? `${g}_${r}` : g;
  };
  const addPoint = (list: GeoObject[], at: Pt): [GeoObject[], string] => {
    const id = newId();
    return [[...list, { id, kind: 'point', name: nextName(list), x: at.x, y: at.y }], id];
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
      case 'regular': {
        if (a === b) return null;
        const n = t === 'square' ? 4 : Math.max(3, Math.min(60, Math.round(sides)));
        let next: GeoObject[] = [...list, { id, kind: 'regular', name: lowerName(list), a, b, n }];
        for (let k = 2; k < n; k++) next = [...next, { id: newId(), kind: 'vertex', name: nextName(next), poly: id, k }];
        return next;
      }
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

  const pick = (sp: Pt) => {
    setMessage(null);
    let list = objects;
    if (tool === 'delete') {
      const id = hitPoint(sp) ?? hitCurve(sp, 'any');
      if (id) commit(without(objects, new Set([id])));
      return;
    }
    if (tool === 'point') {
      if (hitPoint(sp)) return;
      commit(addPoint(objects, snapped(toWorld(sp)))[0]);
      return;
    }
    if (tool === 'polygon') {
      let id = hitPoint(sp);
      if (id && picks.length >= 3 && id === picks[0]) {
        commit([...list, { id: newId(), kind: 'polygon', name: lowerName(list), pts: picks }]);
        setPicks([]);
        return;
      }
      if (!id) [list, id] = addPoint(list, snapped(toWorld(sp)));
      if (list !== objects) commit(list);
      setPicks((p) => [...p, id!]);
      return;
    }
    const needs = NEEDS[tool];
    if (!needs) return;
    const need = needs[picks.length]!;
    let id: string | null;
    if (need === 'pt') {
      id = hitPoint(sp);
      if (!id) [list, id] = addPoint(list, snapped(toWorld(sp)));
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

  // ---- pointer
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const sp = eventPt(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool === 'pen') {
      setStroke([sp]);
      return;
    }
    if (tool === 'select') {
      const id = hitPoint(sp) ?? hitCurve(sp, 'any');
      if (!id) {
        if (!e.shiftKey) setSel([]);
        setBox({ a: sp, b: sp });
        return;
      }
      let next = sel;
      if (e.shiftKey) next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      else if (!sel.includes(id)) next = [id];
      setSel(next);
      if (!next.includes(id)) return;
      const roots = freeRoots(objects, next);
      const orig = new Map<string, Pt>();
      for (const r of roots) {
        const o = byId.get(r);
        if (o?.kind === 'point') orig.set(r, { x: o.x, y: o.y });
      }
      setPast((p) => [...p, objects]);
      group.current = { start: toWorld(sp), orig, moved: false };
      return;
    }
    if (tool === 'move') {
      const id = hitPoint(sp);
      const free = id && byId.get(id)?.kind === 'point' ? id : null;
      setSelected(id ?? hitCurve(sp, 'any'));
      if (free) setPast((p) => [...p, objects]);
      drag.current = { id: free, from: sp, view, moved: false };
      return;
    }
    pick(sp);
  };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const sp = eventPt(e);
    setHover(toWorld(sp));
    if (stroke) {
      setStroke((st) => (st ? [...st, sp] : st));
      return;
    }
    if (box) {
      setBox({ a: box.a, b: sp });
      return;
    }
    const g = group.current;
    if (g) {
      g.moved = true;
      const w = toWorld(sp);
      let [dx, dy] = [w.x - g.start.x, w.y - g.start.y];
      // the first point lands on the grid, the rest keep their places relative to it
      const first = g.orig.values().next().value;
      if (first) {
        const to = snapped({ x: first.x + dx, y: first.y + dy });
        [dx, dy] = [to.x - first.x, to.y - first.y];
      }
      setDoc((doc0) => ({ ...doc0, objects: doc0.objects.map((o) => (o.kind === 'point' && g.orig.has(o.id) ? { ...o, x: g.orig.get(o.id)!.x + dx, y: g.orig.get(o.id)!.y + dy } : o)) }));
      return;
    }
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    if (d.id) {
      const w = snapped(toWorld(sp));
      setDoc((doc0) => ({ ...doc0, objects: doc0.objects.map((o) => (o.id === d.id && o.kind === 'point' ? { ...o, x: w.x, y: w.y } : o)) }));
    } else {
      setDoc((doc0) => ({ ...doc0, view: { ...d.view, cx: d.view.cx - (sp.x - d.from.x) / d.view.s, cy: d.view.cy + (sp.y - d.from.y) / d.view.s } }));
    }
  };
  const onUp = (e: RPointerEvent<SVGSVGElement>) => {
    if (stroke) {
      finishStroke(stroke);
      setStroke(null);
    }
    if (box) {
      const [x0, x1] = [Math.min(box.a.x, box.b.x), Math.max(box.a.x, box.b.x)];
      const [y0, y1] = [Math.min(box.a.y, box.b.y), Math.max(box.a.y, box.b.y)];
      if (x1 - x0 > 3 || y1 - y0 > 3) {
        const inside = (p: Pt) => {
          const q = toScreen(p);
          return q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
        };
        const hit: string[] = [];
        for (const [id, sh] of shapes) {
          const pts =
            sh.type === 'point' || sh.type === 'text' ? [sh.at]
            : sh.type === 'line' ? [sh.a, sh.b]
            : sh.type === 'circle' ? [{ x: sh.c.x - sh.r, y: sh.c.y - sh.r }, { x: sh.c.x + sh.r, y: sh.c.y + sh.r }]
            : sh.type === 'polygon' ? sh.pts
            : [sh.a, sh.v, sh.c];
          if (pts.every(inside)) hit.push(id);
        }
        setSel((cur) => (e.shiftKey ? [...new Set([...cur, ...hit])] : hit));
      }
      setBox(null);
    }
    const g = group.current;
    if (g) {
      if (!g.moved) setPast((p) => p.slice(0, -1));
      else setFuture([]);
      group.current = null;
    }
    const d = drag.current;
    // a click on a free point that didn't move isn't an edit
    if (d?.id && !d.moved) setPast((p) => p.slice(0, -1));
    if (d?.id && d.moved) setFuture([]);
    drag.current = null;
  };
  const finishStroke = (st: Pt[]) => {
    const r = recognize(st);
    if (!r) {
      setMessage(s.notRecognised);
      return;
    }
    let list = objects;
    const pointAt = (sp: Pt, snap = true): string => {
      const hit = hitPoint(sp);
      if (hit) return hit;
      let id: string;
      [list, id] = addPoint(list, snap ? snapped(toWorld(sp)) : toWorld(sp));
      return id;
    };
    if (r.kind === 'segment') {
      const [a, b] = [pointAt(r.a), pointAt(r.b)];
      if (a !== b) list = [...list, { id: newId(), kind: 'segment', name: lowerName(list), a, b }];
    } else if (r.kind === 'circle') {
      const c = pointAt(r.c);
      // the drawn size, not the nearest grid step
      const t = pointAt({ x: r.c.x + r.r, y: r.c.y }, false);
      list = [...list, { id: newId(), kind: 'circle', name: lowerName(list), center: c, through: t }];
    } else {
      const pts = r.pts.map((p) => pointAt(p));
      if (new Set(pts).size >= 3) list = [...list, { id: newId(), kind: 'polygon', name: lowerName(list), pts }];
    }
    commit(list);
  };
  const onWheel = (e: RWheelEvent<SVGSVGElement>) => {
    const sp = eventPt(e);
    const before = toWorld(sp);
    const s1 = Math.min(5000, Math.max(2, view.s * Math.exp(-e.deltaY * 0.0015)));
    // keep the point under the cursor in place
    setDoc((d) => ({ ...d, view: { s: s1, cx: before.x - (sp.x - size.w / 2) / s1, cy: before.y + (sp.y - size.h / 2) / s1 } }));
  };
  // the page must not scroll while zooming the canvas
  useEffect(() => {
    const el = svgRef.current!;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  const fit = () => {
    const pts: Pt[] = [];
    for (const sh of shapes.values()) {
      if (sh.type === 'point') pts.push(sh.at);
      if (sh.type === 'circle') pts.push({ x: sh.c.x - sh.r, y: sh.c.y - sh.r }, { x: sh.c.x + sh.r, y: sh.c.y + sh.r });
    }
    if (!pts.length) return setDoc((d) => ({ ...d, view: START.view }));
    const [x0, x1] = [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x))];
    const [y0, y1] = [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))];
    const sc = Math.min(size.w / Math.max(1, x1 - x0), size.h / Math.max(1, y1 - y0)) * 0.75;
    setDoc((d) => ({ ...d, view: { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: Math.min(400, Math.max(4, sc)) } }));
  };

  // ---- drawing
  const far = (size.w + size.h) / view.s * 4;
  const lineEnds = (a: Pt, b: Pt, extent: 'segment' | 'line' | 'ray'): [Pt, Pt] => {
    if (extent === 'segment') return [a, b];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const d = { x: ((b.x - a.x) / len) * far, y: ((b.y - a.y) / len) * far };
    return [extent === 'line' ? { x: a.x - d.x, y: a.y - d.y } : a, { x: b.x + d.x, y: b.y + d.y }];
  };
  const gridLines = () => {
    const out: ReactElement[] = [];
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

  const highlight = (id: string) => (id === selected || picks.includes(id) || sel.includes(id) ? ' is-picked' : '');
  const fills: ReactElement[] = [];
  const strokes: ReactElement[] = [];
  const dots: ReactElement[] = [];
  const labels: ReactElement[] = [];
  for (const o of objects) {
    const sh = shapes.get(o.id);
    if (!sh) continue;
    const m = measure(sh);
    if (sh.type === 'polygon') {
      const pts = sh.pts.map(toScreen);
      fills.push(<polygon key={o.id} className={`geo__poly${highlight(o.id)}`} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} />);
      const c = toScreen({ x: sh.pts.reduce((t, p) => t + p.x, 0) / sh.pts.length, y: sh.pts.reduce((t, p) => t + p.y, 0) / sh.pts.length });
      if (m) labels.push(<text key={`${o.id}m`} className="geo__measure" x={c.x} y={c.y} textAnchor="middle">{m}</text>);
    } else if (sh.type === 'line') {
      const [a, b] = lineEnds(sh.a, sh.b, sh.extent).map(toScreen) as [Pt, Pt];
      strokes.push(<line key={o.id} className={`geo__line${kindOfLine.has(o.kind) && o.kind !== 'segment' && o.kind !== 'line' && o.kind !== 'ray' ? ' geo__line--built' : ''}${highlight(o.id)}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />);
      if (m) {
        const mid = toScreen({ x: (sh.a.x + sh.b.x) / 2, y: (sh.a.y + sh.b.y) / 2 });
        labels.push(<text key={`${o.id}m`} className="geo__measure" x={mid.x + 6} y={mid.y - 6}>{m}</text>);
      }
    } else if (sh.type === 'circle') {
      const c = toScreen(sh.c);
      strokes.push(<circle key={o.id} className={`geo__circle${highlight(o.id)}`} cx={c.x} cy={c.y} r={sh.r * view.s} />);
      if (m) labels.push(<text key={`${o.id}m`} className="geo__measure" x={c.x + sh.r * view.s * 0.7 + 4} y={c.y - sh.r * view.s * 0.7 - 4}>{m}</text>);
    } else if (sh.type === 'angle') {
      const v = toScreen(sh.v);
      const r = 26;
      const t1 = Math.atan2(-(sh.a.y - sh.v.y), sh.a.x - sh.v.x);
      let t2 = Math.atan2(-(sh.c.y - sh.v.y), sh.c.x - sh.v.x);
      let sweep = t2 - t1;
      while (sweep <= -Math.PI) sweep += 2 * Math.PI;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      t2 = t1 + sweep;
      const p1 = { x: v.x + r * Math.cos(t1), y: v.y + r * Math.sin(t1) };
      const p2 = { x: v.x + r * Math.cos(t2), y: v.y + r * Math.sin(t2) };
      strokes.push(<path key={o.id} className={`geo__angle${highlight(o.id)}`} d={`M${v.x},${v.y} L${p1.x},${p1.y} A${r},${r} 0 0 ${sweep > 0 ? 1 : 0} ${p2.x},${p2.y} Z`} />);
      const mid = t1 + sweep / 2;
      labels.push(<text key={`${o.id}m`} className="geo__measure" x={v.x + (r + 16) * Math.cos(mid)} y={v.y + (r + 16) * Math.sin(mid) + 4} textAnchor="middle">{`${o.name} = ${m}`}</text>);
    } else if (sh.type === 'point') {
      const p = toScreen(sh.at);
      dots.push(<circle key={o.id} className={`geo__pt${sh.free ? '' : ' geo__pt--built'}${highlight(o.id)}`} cx={p.x} cy={p.y} r={sh.free ? 5 : 4} />);
      labels.push(<text key={`${o.id}n`} className="geo__name" x={p.x + 8} y={p.y - 8}>{o.name}</text>);
    }
  }

  const needs = tool === 'polygon' ? null : NEEDS[tool];
  const stepsText = s.steps[tool];
  const hint = message ?? stepsText[Math.min(tool === 'polygon' ? (picks.length ? 1 : 0) : picks.length, stepsText.length - 1)] ?? '';
  const describe = (o: GeoObject) => {
    const names = refs(o).map((r) => byId.get(r)?.name ?? '?');
    return names.length ? `${s.kinds[o.kind]} ${s.of(names.join(', '))}` : s.kinds[o.kind];
  };
  const cursor = tool === 'move' ? (drag.current ? 'grabbing' : 'grab') : tool === 'select' ? 'default' : 'crosshair';

  return (
    <div className="geo">
      <div className="geo__tools" role="toolbar" aria-label={s.toolbar}>
        {GROUPS.map((group, k) => (
          <div key={k} className="geo__group" role="group">
            {group.map((id) => (
              <button
                key={id}
                type="button"
                className="geo__tool"
                aria-pressed={tool === id}
                onClick={() => {
                  setTool(id);
                  setPicks([]);
                  setMessage(null);
                  if (id !== 'select') setSel([]);
                }}
              >
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
        {tool === 'select' && (
          <div className="geo__selbar" role="group" aria-label={s.tools.select}>
            <span className="geo__selcount" aria-live="polite">{s.selected(sel.length)}</span>
            <button type="button" className="btn btn--small" onClick={() => setSel(objects.map((o) => o.id))} disabled={!objects.length}>
              {s.selectAll}
            </button>
            <button type="button" className="btn btn--small" onClick={deleteSel} disabled={!sel.length}>
              {s.deleteSelected}
            </button>
            <button type="button" className="btn btn--small btn--quiet" onClick={() => setSel([])} disabled={!sel.length}>
              {s.clearSelection}
            </button>
          </div>
        )}
        {tool === 'rotate' && (
          <label className="geo__deg">
            {s.degrees}
            <input className="input input--code" type="number" value={degrees} step={15} onChange={(e) => setDegrees(Number(e.target.value) || 0)} />°
          </label>
        )}
      </div>

      <div className="geo__body">
        <section className="geo__stage" aria-label={s.canvas}>
          <p className="geo__hint" role="status">
            {hint}
            {needs && picks.length > 0 && ` (${picks.length}/${needs.length})`}
          </p>
          <svg
            ref={svgRef}
            className="geo__svg"
            style={{ cursor }}
            tabIndex={0}
            aria-label={s.canvas}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => setHover(null)}
            onWheel={onWheel}
          >
            {gridLines()}
            {fills}
            {strokes}
            {stroke && <polyline className="geo__ink" points={stroke.map((p) => `${p.x},${p.y}`).join(' ')} />}
            {dots}
            {labels}
            {box && <rect className="geo__box" x={Math.min(box.a.x, box.b.x)} y={Math.min(box.a.y, box.b.y)} width={Math.abs(box.b.x - box.a.x)} height={Math.abs(box.b.y - box.a.y)} />}
          </svg>
          {hover && <span className="geo__readout">({+hover.x.toFixed(2)}, {+hover.y.toFixed(2)})</span>}
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
            <button type="button" className="btn btn--small btn--quiet" onClick={fit}>
              {s.fit}
            </button>
          </div>
          <h2 className="geo__heading">{s.objects}</h2>
          {objects.length === 0 ? (
            <p className="geo__empty">{s.empty}</p>
          ) : (
            <ul className="geo__list">
              {objects.map((o) => {
                const sh = shapes.get(o.id);
                const m = sh ? measure(sh) : null;
                return (
                  <li key={o.id} className={`geo__item${o.id === selected ? ' is-selected' : ''}`}>
                    <button type="button" className="geo__item-main" onClick={() => setSelected(o.id === selected ? null : o.id)} aria-pressed={o.id === selected}>
                      <span className="geo__item-name">{o.name}</span>
                      <span className="geo__item-kind">{describe(o)}</span>
                      {m && <span className="geo__item-measure">{m}</span>}
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
