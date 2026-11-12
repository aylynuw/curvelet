import type { Graphable, Pt, Shape } from '@math/engine';
import { domainColoring, type DomainImage } from './domain';
import type { Look } from './look';
import { cobwebPath, fieldMarks, solutionThrough } from './fields';
import { contour, curveRegions, implicitRegion, sampleCurve, sampleParametric, type Polyline } from './sample';
import { fromPx, fromPy, gridStep, tickLabel, toPx, toPy, xmax, xmin, ymax, ymin, type Viewport } from './viewport';

/** 'screen': the interactive graph. 'exam': a printed exam figure (수능 style). */
export type Style = 'screen' | 'exam';

export interface SceneOptions {
  style: Style;
  /** colour slot for a line's curve; it follows the line, not its position */
  series: (id: string) => number;
  /** exam figures: numbers on the axes besides the points' guides */
  examTicks?: 'none' | 'integers';
  /** exam figures: write y = f(x) next to each curve */
  curveLabels?: boolean;
  /** pixels between samples; 1 on screen, finer for export */
  sampleStep?: number;
  /** draw the axes (geometry figures often leave them out); default true */
  axes?: boolean;
  /** the user's style for a line, by its id */
  look?: (id: string) => Look | undefined;
  /** the screen grid: squares (default), circles around the origin, or none */
  grid?: 'cartesian' | 'polar' | 'none';
  /** x-axis numbers in multiples of π (π/2, π, 3π/2 …) */
  piTicks?: boolean;
  /** coordinates beside points on screen (default true) */
  pointLabels?: boolean;
}

const PI_STEPS: [number, number][] = [[1, 12], [1, 6], [1, 4], [1, 2], [1, 1], [2, 1], [4, 1], [8, 1], [16, 1], [32, 1]];
/** the multiple of π to number the x-axis by: at least `min` units apart */
export function piStep(min: number): { step: number; num: number; den: number } {
  for (const [num, den] of PI_STEPS) if ((num * Math.PI) / den >= min * 0.9) return { step: (num * Math.PI) / den, num, den };
  const k = 2 ** Math.ceil(Math.log2(min / Math.PI));
  return { step: k * Math.PI, num: k, den: 1 };
}
/** k steps of num·π/den, written as a reduced fraction of π: π/2, −3π/4, 2π */
export function piLabel(k: number, num: number, den: number): string {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  let n = k * num;
  let d = den;
  if (n === 0) return '0';
  const g = gcd(Math.abs(n), d);
  n /= g;
  d /= g;
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  return `${sign}${a === 1 ? '' : a}π${d === 1 ? '' : `/${d}`}`;
}

export interface Label {
  x: number;
  y: number;
  text: string;
  kind: 'tick' | 'axis' | 'origin' | 'point' | 'curve' | 'guide';
  anchor: 'start' | 'middle' | 'end';
  baseline: 'top' | 'middle' | 'bottom';
  series?: number;
}

/** Everything to draw, in screen pixels. Canvas and SVG renderers both read this. */
export interface Scene {
  width: number;
  height: number;
  style: Style;
  /** flat segment lists: x1 y1 x2 y2 … */
  gridMinor: number[];
  gridMajor: number[];
  axes: number[];
  ticks: number[];
  arrows: { x: number; y: number; dir: 'right' | 'up' }[];
  fills: { series: number; polys: Polyline[]; rects: number[]; id?: string; color?: string; opacity?: number }[];
  /** `weight`: a multiple of the curve width (field marks are thin); `ink`: drawn in ink, not the line's colour (y = x of a cobweb) */
  curves: {
    id: string;
    series: number;
    dashed: boolean;
    lines: Polyline[];
    segs: number[];
    weight?: number;
    ink?: boolean;
    /** the user's colour, dash and width (pixels) */
    color?: string;
    dash?: Look['dash'];
    width?: number;
  }[];
  guides: number[];
  /** `colored`: drawn in its line's colour (scatter data) rather than ink */
  /** `open`: a hollow dot, a value the graph leaves out (the ○ at a jump in cases) */
  points: { id: string; x: number; y: number; series: number; colored?: boolean; color?: string; open?: boolean }[];
  /** domain colouring of a complex function, drawn under everything else */
  image?: DomainImage;
  labels: Label[];
}

const strict = (op: string) => op === '<' || op === '>';

export function buildScene(graphables: Graphable[], v: Viewport, opts: SceneOptions): Scene {
  const exam = opts.style === 'exam';
  const scene: Scene = {
    width: v.width, height: v.height, style: opts.style,
    gridMinor: [], gridMajor: [], axes: [], ticks: [], arrows: [],
    fills: [], curves: [], guides: [], points: [], labels: [],
  };
  const { major, minor } = gridStep(v.scale, exam ? 60 : 80);

  // where the axes cross the screen (null when off screen)
  const axes = opts.axes !== false;
  const axisY = axes && ymin(v) <= 0 && ymax(v) >= 0 ? toPy(v, 0) : null;
  const axisX = axes && xmin(v) <= 0 && xmax(v) >= 0 ? toPx(v, 0) : null;

  const pi = opts.piTicks ? piStep(major) : null;
  const grid = opts.grid ?? 'cartesian';

  // --- grid (screen only) ----------------------------------------------------
  if (!exam && grid === 'polar') {
    // circles around the origin and spokes every 15° (30° stronger)
    const o = { x: toPx(v, 0), y: toPy(v, 0) };
    const far = Math.max(...[[0, 0], [v.width, 0], [0, v.height], [v.width, v.height]].map(([x, y]) => Math.hypot(x! - o.x, y! - o.y)));
    const near = o.x >= 0 && o.x <= v.width && o.y >= 0 && o.y <= v.height ? 0 : Math.hypot(Math.max(0, -o.x, o.x - v.width), Math.max(0, -o.y, o.y - v.height));
    const ring = (r: number, into: number[]) => {
      const pr = r * v.scale;
      if (pr < near - 1 || pr > far + 1) return;
      const n = Math.min(360, Math.max(48, Math.round(pr / 4)));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 2 * Math.PI;
        const b = ((k + 1) / n) * 2 * Math.PI;
        into.push(o.x + pr * Math.cos(a), o.y - pr * Math.sin(a), o.x + pr * Math.cos(b), o.y - pr * Math.sin(b));
      }
    };
    const maxR = far / v.scale;
    for (let r = minor; r <= maxR + minor; r += minor) {
      if (Math.abs(r / major - Math.round(r / major)) < 1e-9) ring(r, scene.gridMajor);
      else ring(r, scene.gridMinor);
    }
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg * Math.PI) / 180;
      (deg % 30 === 0 ? scene.gridMajor : scene.gridMinor).push(o.x, o.y, o.x + far * Math.cos(a), o.y - far * Math.sin(a));
    }
  }
  if (!exam && grid === 'cartesian') {
    const lines = (step0: number, into: number[], skip0?: number) => {
      // with π numbers the vertical lines follow π: major on the step, minor halfway
      const step = pi ? (skip0 ? pi.step : pi.step / 2) : step0;
      const skip = pi ? (skip0 ? undefined : pi.step) : skip0;
      for (let x = Math.ceil(xmin(v) / step) * step; x <= xmax(v); x += step) {
        if (skip && Math.abs(x / skip - Math.round(x / skip)) < 1e-9) continue;
        const px = toPx(v, x);
        into.push(px, 0, px, v.height);
      }
      for (let y = Math.ceil(ymin(v) / step0) * step0; y <= ymax(v); y += step0) {
        if (skip0 && Math.abs(y / skip0 - Math.round(y / skip0)) < 1e-9) continue;
        const py = toPy(v, y);
        into.push(0, py, v.width, py);
      }
    };
    lines(minor, scene.gridMinor, major);
    lines(major, scene.gridMajor);
  }

  // --- axes ------------------------------------------------------------------
  const tickLen = 4;
  if (axisY !== null) {
    scene.axes.push(0, axisY, v.width - (exam ? 2 : 0), axisY);
    if (exam) {
      scene.arrows.push({ x: v.width - 2, y: axisY, dir: 'right' });
      scene.labels.push({ x: v.width - 6, y: axisY + 8, text: 'x', kind: 'axis', anchor: 'end', baseline: 'top' });
    }
  }
  if (axisX !== null) {
    scene.axes.push(axisX, v.height, axisX, exam ? 2 : 0);
    if (exam) {
      scene.arrows.push({ x: axisX, y: 2, dir: 'up' });
      scene.labels.push({ x: axisX + 8, y: 6, text: 'y', kind: 'axis', anchor: 'start', baseline: 'top' });
    }
  }
  if (exam && axisX !== null && axisY !== null) {
    scene.labels.push({ x: axisX - 5, y: axisY + 5, text: 'O', kind: 'origin', anchor: 'end', baseline: 'top' });
  }

  // --- axis numbers ----------------------------------------------------------
  const numbered = axes && (!exam || opts.examTicks === 'integers');
  if (numbered) {
    const step = exam ? Math.max(1, major) : major;
    // when an axis is off screen its numbers stay at the nearest edge
    const ly = axisY === null ? (ymax(v) < 0 ? 4 : v.height - 18) : Math.min(v.height - 18, Math.max(0, axisY + 4));
    const xs = pi ? pi.step : step;
    for (let x = Math.ceil(xmin(v) / xs) * xs; x <= xmax(v); x += xs) {
      if (Math.abs(x) < xs * 1e-9) continue;
      const px = toPx(v, x);
      if (px < 8 || px > v.width - 8) continue;
      const text = pi ? piLabel(Math.round(x / xs), pi.num, pi.den) : tickLabel(x, step);
      scene.labels.push({ x: px, y: ly, text, kind: 'tick', anchor: 'middle', baseline: 'top' });
      if (exam && axisY !== null) scene.ticks.push(px, axisY - tickLen, px, axisY + tickLen);
    }
    const lx = axisX === null ? (xmax(v) < 0 ? v.width - 4 : 4) : Math.max(4, Math.min(v.width - 4, axisX - 6));
    const yAnchor = axisX === null && xmax(v) >= 0 ? 'start' : 'end';
    for (let y = Math.ceil(ymin(v) / step) * step; y <= ymax(v); y += step) {
      if (Math.abs(y) < step * 1e-9) continue;
      const py = toPy(v, y);
      if (py < 8 || py > v.height - 8) continue;
      scene.labels.push({ x: lx, y: py, text: tickLabel(y, step), kind: 'tick', anchor: yAnchor, baseline: 'middle' });
      if (exam && axisX !== null) scene.ticks.push(axisX - tickLen, py, axisX + tickLen, py);
    }
    if (!exam && axisX !== null && axisY !== null) {
      scene.labels.push({ x: axisX - 6, y: axisY + 4, text: '0', kind: 'tick', anchor: 'end', baseline: 'top' });
    }
  }

  // --- curves and regions ----------------------------------------------------
  // a complex function: domain colouring behind the graph (the last one listed; the screen shows one at a time)
  const complex = graphables.filter((g) => g.kind === 'complex').at(-1);
  if (complex?.kind === 'complex' && !exam) scene.image = domainColoring(complex.fn, v, opts.sampleStep && opts.sampleStep < 1 ? 1 : 2);

  for (const g of graphables) {
    // points are drawn in ink and don't take a colour slot; surfaces belong to the 3D view
    if (g.kind === 'point' || g.kind === 'surface' || g.kind === 'complex') continue;
    const series = opts.series(g.id);
    if (g.kind === 'curve') {
      // cases: break at the jumps, mark the ends ● (the point is on the graph) or ○ (it isn't)
      const [lo, hi] = g.dir === 'y' ? [xmin(v), xmax(v)] : [ymin(v), ymax(v)];
      const edges = g.edges?.(lo, hi);
      const lines = sampleCurve(g.fn, g.dir, v, opts.sampleStep ?? 1, g.mask, edges?.cuts, edges?.dots.map((d) => d.t));
      const polys = curveRegions(lines, g.dir, g.op, v);
      if (polys.length) scene.fills.push({ id: g.id, series, polys, rects: [] });
      scene.curves.push({ id: g.id, series, dashed: strict(g.op), lines, segs: [] });
      for (const d of edges?.dots ?? []) {
        const [px, py] = g.dir === 'y' ? [toPx(v, d.t), toPy(v, d.v)] : [toPx(v, d.v), toPy(v, d.t)];
        if (px >= -10 && px <= v.width + 10 && py >= -10 && py <= v.height + 10) scene.points.push({ id: g.id, x: px, y: py, series, colored: true, open: d.open });
      }
    } else if (g.kind === 'implicit') {
      const cell = exam ? 2 : 4;
      const rects = implicitRegion(g.fn, g.op, v, cell, g.mask);
      if (rects.length) scene.fills.push({ id: g.id, series, polys: [], rects });
      scene.curves.push({ id: g.id, series, dashed: strict(g.op), lines: [], segs: contour(g.fn, v, cell, g.mask) });
    } else if (g.kind === 'parametric') {
      const lines = sampleParametric(g.fx, g.fy, g.tmin, g.tmax, v, g.mask);
      scene.curves.push({ id: g.id, series, dashed: false, lines, segs: [] });
    } else if (g.kind === 'polar') {
      const { fr, unit } = g;
      const fx = (θ: number) => fr(θ) * Math.cos(θ * unit);
      const fy = (θ: number) => fr(θ) * Math.sin(θ * unit);
      const lines = sampleParametric(fx, fy, g.tmin, g.tmax, v, g.mask ? (x, y, θ) => g.mask!(x, y, θ) : undefined);
      scene.curves.push({ id: g.id, series, dashed: false, lines, segs: [] });
    } else if (g.kind === 'scatter') {
      for (const p of g.pts) {
        const px = toPx(v, p.x);
        const py = toPy(v, p.y);
        if (px >= -10 && px <= v.width + 10 && py >= -10 && py <= v.height + 10) scene.points.push({ id: g.id, x: px, y: py, series, colored: true });
      }
    } else if (g.kind === 'shape') {
      const lines = shapeLines(g.shape, v);
      // polygons get a light fill on screen; printed figures stay as lines
      if ((g.shape.type === 'polygon' || (g.shape.type === 'path' && g.shape.closed)) && !exam) scene.fills.push({ id: g.id, series, polys: lines, rects: [] });
      scene.curves.push({ id: g.id, series, dashed: false, lines, segs: [] });
    } else if (g.kind === 'field') {
      // the marks thin, the solution curves through the seeds at full weight
      scene.curves.push({ id: `${g.id}:marks`, series, dashed: false, lines: [], segs: fieldMarks(g, v), weight: exam ? 0.6 : 0.7 });
      const lines = g.seeds.map((p) => solutionThrough(g, p, v)).filter((l) => l.length >= 4);
      scene.curves.push({ id: g.id, series, dashed: false, lines, segs: [] });
      for (const p of g.seeds) scene.points.push({ id: g.id, x: toPx(v, p.x), y: toPy(v, p.y), series, colored: true });
    } else if (g.kind === 'cobweb') {
      // y = x in ink, y = f(x) in the line's colour, then the staircase
      const ends = [toPx(v, Math.min(xmin(v), ymin(v))), toPy(v, Math.min(xmin(v), ymin(v))), toPx(v, Math.max(xmax(v), ymax(v))), toPy(v, Math.max(xmax(v), ymax(v)))];
      scene.curves.push({ id: `${g.id}:diagonal`, series, dashed: false, lines: [], segs: ends, ink: true, weight: 0.7 });
      scene.curves.push({ id: g.id, series, dashed: false, lines: sampleCurve(g.fn, 'y', v, opts.sampleStep ?? 1), segs: [] });
      scene.curves.push({ id: `${g.id}:path`, series, dashed: false, lines: [cobwebPath(g.fn, g.x0, g.steps, v)], segs: [], weight: 0.8 });
    } else if (g.kind === 'angle') {
      const mark = angleMark(g.a, g.b, g.c, g.right, v, exam ? 14 : 18);
      scene.curves.push({ id: g.id, series, dashed: false, lines: [mark.line], segs: [] });
      if (g.label) {
        scene.labels.push({ x: mark.labelAt[0], y: mark.labelAt[1], text: g.label, kind: 'curve', anchor: 'middle', baseline: 'middle' });
      }
    }
  }

  // --- points ----------------------------------------------------------------
  // labels go on the side facing away from the middle of all the points,
  // so a triangle's A, B, C sit outside it
  const pts = graphables.filter((g) => g.kind === 'point');
  const mid = pts.length > 1 ? [pts.reduce((s, g) => s + toPx(v, g.x), 0) / pts.length, pts.reduce((s, g) => s + toPy(v, g.y), 0) / pts.length] : null;
  const fontSize = exam ? 15 : 13;
  const box = (l: Pick<Label, 'x' | 'y' | 'anchor' | 'baseline' | 'text'>) => {
    const w = l.text.length * fontSize * 0.55;
    const x0 = l.anchor === 'start' ? l.x : l.anchor === 'middle' ? l.x - w / 2 : l.x - w;
    const y0 = l.baseline === 'top' ? l.y : l.baseline === 'middle' ? l.y - fontSize / 2 : l.y - fontSize;
    return [x0, y0, x0 + w, y0 + fontSize] as const;
  };
  const hits = (a: readonly number[], b: readonly number[]) => a[0]! < b[2]! && b[0]! < a[2]! && a[1]! < b[3]! && b[1]! < a[3]!;
  /**
   * A point's label: on the side away from the middle of all the points when
   * that is free, otherwise the nearest free direction around the point.
   */
  const away = (px: number, py: number, gap: number, text: string) => {
    let dx = mid ? px - mid[0]! : 1;
    let dy = mid ? py - mid[1]! : -1;
    if (Math.hypot(dx, dy) < 1) [dx, dy] = [1, -1];
    const pref = Math.atan2(dy, dx);
    const turns = [0, 1, -1, 2, -2, 3, -3, 4].map((k) => pref + (k * Math.PI) / 4);
    let first: (Pick<Label, 'x' | 'y' | 'anchor' | 'baseline'>) | null = null;
    for (const a of turns) {
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const spot = {
        x: px + ux * gap,
        y: py + uy * gap,
        anchor: (ux > 0.38 ? 'start' : ux < -0.38 ? 'end' : 'middle') as Label['anchor'],
        baseline: (uy > 0.38 ? 'top' : uy < -0.38 ? 'bottom' : 'middle') as Label['baseline'],
      };
      first ??= spot;
      const b = box({ ...spot, text });
      const clear = !scene.labels.some((l) => hits(box(l), b)) && !scene.points.some((q) => hits([q.x - 3, q.y - 3, q.x + 3, q.y + 3], b));
      if (clear) return spot;
    }
    return first!;
  };
  for (const g of pts) {
    if (g.kind !== 'point') continue;
    const px = toPx(v, g.x);
    const py = toPy(v, g.y);
    if (px < -20 || px > v.width + 20 || py < -20 || py > v.height + 20) continue;
    scene.points.push({ id: g.id, x: px, y: py, series: 0 });
    if (exam) {
      if (g.label) scene.labels.push({ ...away(px, py, 8, g.label), text: g.label, kind: 'point' });
      // dashed guides down/across to the axes, with the coordinates written there
      if (axisY !== null && Math.abs(py - axisY) > 1) {
        scene.guides.push(px, py, px, axisY);
        if (g.x !== 0) {
          scene.labels.push({ x: px, y: axisY + (g.y >= 0 ? 5 : -5), text: coordinate(g.x), kind: 'guide', anchor: 'middle', baseline: g.y >= 0 ? 'top' : 'bottom' });
        }
      }
      if (axisX !== null && Math.abs(px - axisX) > 1) {
        scene.guides.push(px, py, axisX, py);
        if (g.y !== 0) {
          scene.labels.push({ x: axisX + (g.x >= 0 ? -6 : 6), y: py, text: coordinate(g.y), kind: 'guide', anchor: g.x >= 0 ? 'end' : 'start', baseline: 'middle' });
        }
      }
    } else if (opts.pointLabels !== false) {
      const text = `${g.label ? `${g.label} ` : ''}(${coordinate(g.x)}, ${coordinate(g.y)})`;
      scene.labels.push({ ...away(px, py, 10, text), text, kind: 'point' });
    }
  }

  // --- curve labels (exam) ---------------------------------------------------
  if (exam && opts.curveLabels !== false) {
    // rough boxes of placed labels, so curve labels don't land on each other
    const size = 15;
    const box = (l: Label) => {
      const w = l.text.length * size * 0.5;
      const x0 = l.anchor === 'start' ? l.x : l.anchor === 'middle' ? l.x - w / 2 : l.x - w;
      const y0 = l.baseline === 'top' ? l.y : l.baseline === 'middle' ? l.y - size / 2 : l.y - size;
      return [x0, y0, x0 + w, y0 + size] as const;
    };
    const overlaps = (a: readonly number[], b: readonly number[]) => a[0]! < b[2]! && b[0]! < a[2]! && a[1]! < b[3]! && b[1]! < a[3]!;
    for (const g of graphables) {
      // figures and angles carry their own names; curves get "y = f(x)"
      if (g.kind === 'point' || g.kind === 'shape' || g.kind === 'angle' || g.kind === 'scatter' || g.kind === 'surface' || g.kind === 'complex' || g.kind === 'field') continue;
      const c = scene.curves.find((k) => k.id === g.id);
      const spot = c ? labelSpot(c, v) : null;
      if (!spot) continue;
      const label: Label = { x: spot[0] - 4, y: spot[1] - 6, text: g.label, kind: 'curve', anchor: 'end', baseline: 'bottom' };
      // on a collision, try just below, then above, further each time, never past the figure's edges
      const y0 = label.y;
      const inside = (y: number) => y - size >= 2 && y <= v.height - 2;
      for (let k = 1; k <= 8 && scene.labels.some((l) => overlaps(box(l), box(label))); k++) {
        const step = Math.ceil(k / 2) * size * 1.2 * (k % 2 ? 1 : -1);
        if (inside(y0 + step)) label.y = y0 + step;
      }
      if (!inside(label.y)) label.y = Math.min(v.height - 2, Math.max(size + 2, label.y));
      scene.labels.push(label);
    }
  }
  // printed math uses a true minus sign, not a hyphen
  if (exam) for (const l of scene.labels) l.text = l.text.replace(/-/g, '\u2212');
  // the user's styles: "3:marks" belongs to line 3
  if (opts.look) {
    const of = (id: string) => opts.look!(id.split(':')[0]!);
    for (const c of scene.curves) {
      const look = of(c.id);
      if (!look) continue;
      if (look.color && !c.ink) c.color = look.color;
      if (look.dash) c.dash = look.dash;
      if (look.width) c.width = look.width * (c.weight ?? 1);
    }
    for (const f of scene.fills) {
      const look = f.id ? of(f.id) : undefined;
      if (look?.color) f.color = look.color;
      if (look?.fill !== undefined) f.opacity = look.fill;
    }
    for (const p of scene.points) {
      const look = of(p.id);
      if (look?.color) p.color = look.color;
      else if (look?.slot !== undefined) {
        p.colored = true;
        p.series = look.slot;
      }
    }
  }
  return scene;
}

/** A figure as screen polylines; lines and rays run well past the screen edges. */
function shapeLines(shape: Shape, v: Viewport): Polyline[] {
  const P = (p: Pt) => [toPx(v, p.x), toPy(v, p.y)];
  switch (shape.type) {
    case 'segment':
      return [[...P(shape.a), ...P(shape.b)]];
    case 'line':
    case 'ray': {
      const dx = shape.b.x - shape.a.x;
      const dy = shape.b.y - shape.a.y;
      const n = Math.hypot(dx, dy);
      // far enough to leave the screen from anywhere on it
      const far = ((v.width + v.height) / v.scale) * 2 + Math.hypot(shape.a.x - v.cx, shape.a.y - v.cy);
      const end = { x: shape.a.x + (dx / n) * far, y: shape.a.y + (dy / n) * far };
      const start = shape.type === 'ray' ? shape.a : { x: shape.a.x - (dx / n) * far, y: shape.a.y - (dy / n) * far };
      return [[...P(start), ...P(end)]];
    }
    case 'circle': {
      const line: number[] = [];
      const steps = 256;
      for (let k = 0; k <= steps; k++) {
        const t = (2 * Math.PI * k) / steps;
        line.push(...P({ x: shape.c.x + shape.r * Math.cos(t), y: shape.c.y + shape.r * Math.sin(t) }));
      }
      return [line];
    }
    case 'polygon':
      return [[...shape.pts.flatMap(P), ...P(shape.pts[0]!)]];
    case 'path':
      return [shape.pts.flatMap(P)];
  }
}

/**
 * The mark of an angle at b, in screen pixels: an arc of radius r from the ray
 * towards a to the ray towards c (the shorter way), or a small square when the
 * angle is right. Also where its name goes, just outside the mark.
 */
function angleMark(a: Pt, b: Pt, c: Pt, right: boolean, v: Viewport, r: number): { line: Polyline; labelAt: [number, number] } {
  const bx = toPx(v, b.x);
  const by = toPy(v, b.y);
  const unit = (p: Pt) => {
    const dx = toPx(v, p.x) - bx;
    const dy = toPy(v, p.y) - by;
    const n = Math.hypot(dx, dy) || 1;
    return [dx / n, dy / n] as const;
  };
  const [ux, uy] = unit(a);
  const [wx, wy] = unit(c);
  const [mx, my] = [ux + wx, uy + wy];
  const mn = Math.hypot(mx, my) || 1;
  const labelAt: [number, number] = [bx + (mx / mn) * (r + 11), by + (my / mn) * (r + 11)];
  if (right) {
    const s = r * 0.7;
    return { line: [bx + ux * s, by + uy * s, bx + (ux + wx) * s, by + (uy + wy) * s, bx + wx * s, by + wy * s], labelAt };
  }
  const t1 = Math.atan2(uy, ux);
  let sweep = Math.atan2(wy, wx) - t1;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  const line: number[] = [];
  const steps = 32;
  for (let k = 0; k <= steps; k++) {
    const t = t1 + (sweep * k) / steps;
    line.push(bx + r * Math.cos(t), by + r * Math.sin(t));
  }
  return { line, labelAt };
}

/** Point coordinates on the figure: whole numbers as they are, others to 3 decimals. */
export function coordinate(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(3)));
}

/** The right-most visible point of a curve, inset from the edges, for its label. */
function labelSpot(c: Scene['curves'][number], v: Viewport): [number, number] | null {
  const margin = 24;
  let best: [number, number] | null = null;
  const consider = (x: number, y: number) => {
    if (x < margin || x > v.width - margin || y < margin || y > v.height - margin) return;
    if (!best || x > best[0]) best = [x, y];
  };
  for (const line of c.lines) for (let k = 0; k < line.length; k += 2) consider(line[k]!, line[k + 1]!);
  for (let k = 0; k < c.segs.length; k += 2) consider(c.segs[k]!, c.segs[k + 1]!);
  return best;
}

/** Plane coordinates under a screen point, for hover read-outs. */
export function planeAt(v: Viewport, px: number, py: number): [number, number] {
  return [fromPx(v, px), fromPy(v, py)];
}
