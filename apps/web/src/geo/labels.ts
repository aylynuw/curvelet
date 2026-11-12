/**
 * The labels and marks of a figure, worked out in coordinate units: side
 * lengths (beside the side or on a dimension line), equal-length ticks,
 * parallel arrows, angle arcs and right-angle squares, a circle's radius or
 * diameter, point names. The canvas and every export draw the same list.
 */
import { exactRational, exactSqrt, formatMeasure, mathText, scale, type Measure } from './exact';
import { cornerIds, type GeoObject, type LabelPart, type Pt, type Shape } from './model';
import { propsOf, type GeoProps, type LabelMode } from './props';

export interface DecoText {
  /** stable id of the label, for dragging it and remembering where it was put */
  key: string;
  owner: string;
  at: Pt;
  text: string;
  size: number;
  /** names and custom text: letters may be set in italic */
  math: boolean;
  italic: boolean;
  /** the value has no exact form in the asked format */
  approx: boolean;
  /** which way to push the label when it runs into another */
  push: Pt;
}
export interface DecoLine {
  owner: string;
  pts: Pt[];
  closed?: boolean;
  /** filled (arrowheads) rather than stroked */
  fill?: boolean;
}
export interface Decorations {
  texts: DecoText[];
  lines: DecoLine[];
  dots: { owner: string; at: Pt }[];
}

const add = (p: Pt, q: Pt): Pt => ({ x: p.x + q.x, y: p.y + q.y });
const sub = (p: Pt, q: Pt): Pt => ({ x: p.x - q.x, y: p.y - q.y });
const mul = (p: Pt, k: number): Pt => ({ x: p.x * k, y: p.y * k });
const len = (p: Pt) => Math.hypot(p.x, p.y);
const unit = (p: Pt): Pt => {
  const l = len(p) || 1;
  return { x: p.x / l, y: p.y / l };
};
const mid = (p: Pt, q: Pt): Pt => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });

/** a length from its square: exact as a·√b/c when the square is rational */
export function lengthMeasure(p: Pt, q: Pt): Measure {
  const sq = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
  return { value: Math.sqrt(sq), exact: exactSqrt(sq), kind: 'length' };
}
/** an area: a fraction, or a·√b/c when its square is rational (an equilateral triangle on the grid) */
export function areaMeasure(value: number, pi = false): Measure {
  const coef = pi ? value / Math.PI : value;
  return { value, exact: exactRational(coef) ?? (coef > 0 ? exactSqrt(coef * coef) : null), pi, kind: 'area' };
}
/** a length as it was typed: exact when its square is a fraction (5, 2√3) */
export function typedLength(l: number): Measure {
  return { value: l, exact: exactSqrt(l * l), kind: 'length' };
}
export function angleMeasure(deg: number): Measure {
  return { value: deg, exact: Math.abs(deg - Math.round(deg)) < 1e-7 ? { a: Math.round(deg), b: 1, c: 1 } : null, kind: 'angle' };
}
export function polygonArea(pts: Pt[]): number {
  let a = 0;
  pts.forEach((q, k) => {
    const r = pts[(k + 1) % pts.length]!;
    a += q.x * r.y - r.x * q.y;
  });
  return a / 2;
}
/** the angle at v between the rays to a and c, 0–180° */
export function angleAt(a: Pt, v: Pt, c: Pt): number {
  const t1 = Math.atan2(a.y - v.y, a.x - v.x);
  const t2 = Math.atan2(c.y - v.y, c.x - v.x);
  let d = (((t2 - t1) * 180) / Math.PI) % 360;
  if (d < 0) d += 360;
  return d > 180 ? 360 - d : d;
}

/** the measures an object shows in the Properties panel, by name */
export function measuresOf(o: GeoObject, s: Shape): Record<string, Measure> {
  if (s.type === 'line' && s.extent === 'segment') return { length: lengthMeasure(s.a, s.b) };
  if (s.type === 'polygon') {
    const per = s.pts.reduce((t, p, k) => t + len(sub(s.pts[(k + 1) % s.pts.length]!, p)), 0);
    return { area: areaMeasure(Math.abs(polygonArea(s.pts))), perimeter: { value: per, exact: null, kind: 'length' } };
  }
  if (s.type === 'circle') {
    const r2 = s.r * s.r;
    const r = exactSqrt(r2);
    return {
      radius: { value: s.r, exact: r, kind: 'length' },
      diameter: { value: 2 * s.r, exact: r && scale(r, 2), kind: 'length' },
      area: { value: Math.PI * r2, exact: exactRational(r2), pi: true, kind: 'area' },
      circumference: { value: 2 * Math.PI * s.r, exact: r && scale(r, 2), pi: true, kind: 'length' },
    };
  }
  if (s.type === 'ellipse') return { area: areaMeasure(Math.PI * s.rx * s.ry, true) };
  if (s.type === 'angle') return { angle: angleMeasure(s.degrees) };
  void o;
  return {};
}

type Owned = { owner: string; key: string };

/** Everything to draw besides the shapes themselves. */
export function decorate(objects: GeoObject[], shapes: Map<string, Shape>, defaults: GeoProps): Decorations {
  const out: Decorations = { texts: [], lines: [], dots: [] };
  const P = (o: GeoObject) => propsOf(defaults, o.props);

  // ---- equal-length ticks found by themselves: sides of the same length share a mark
  const autoTick = new Map<string, number>();
  {
    const groups = new Map<string, string[]>();
    const consider = (key: string, a: Pt, b: Pt) => {
      const l = Math.round(len(sub(b, a)) * 1e6) / 1e6;
      groups.set(String(l), [...(groups.get(String(l)) ?? []), key]);
    };
    for (const o of objects) {
      const s = shapes.get(o.id);
      const p = P(o);
      if (!s || !p.autoTicks || o.props?.ticks !== undefined) continue;
      if (o.kind === 'segment' && s.type === 'line') consider(`${o.id}:0`, s.a, s.b);
      if (s.type === 'polygon')
        s.pts.forEach((q, k) => {
          if (o.deco?.sides?.[k]?.ticks === undefined) consider(`${o.id}:${k}`, q, s.pts[(k + 1) % s.pts.length]!);
        });
    }
    let n = 0;
    for (const keys of groups.values()) {
      if (keys.length < 2) continue;
      n++;
      if (n > 3) break;
      for (const k of keys) autoTick.set(k, n);
    }
  }

  const text = (t: Owned & { at: Pt; text: string; p: GeoProps; math: boolean; approx?: boolean; push: Pt }, moved?: Record<string, Pt>) => {
    const m = moved?.[t.key];
    out.texts.push({ key: t.key, owner: t.owner, at: m ? add(t.at, m) : t.at, text: t.text, size: t.p.fontSize, math: t.math, italic: t.p.italic, approx: t.approx ?? false, push: t.push });
  };
  const valueText = (m: Measure, p: GeoProps) => formatMeasure(m, p);

  /** ticks, arrows and the length label of one side a→b; `out` points away from the shape */
  const side = (o: GeoObject, key: string, a: Pt, b: Pt, outward: Pt, mode: LabelMode, custom: string | undefined, ticks: number, arrows: number, p: GeoProps, locked?: number) => {
    const u = unit(sub(b, a));
    const m = mid(a, b);
    for (let j = 0; j < ticks; j++) {
      const c = add(m, mul(u, (j - (ticks - 1) / 2) * 0.1));
      out.lines.push({ owner: o.id, pts: [add(c, mul(outward, 0.15)), add(c, mul(outward, -0.15))] });
    }
    for (let j = 0; j < arrows; j++) {
      const c = add(m, mul(u, (j - (arrows - 1) / 2) * 0.16 + 0.08));
      out.lines.push({ owner: o.id, pts: [add(sub(c, mul(u, 0.16)), mul(outward, 0.12)), c, add(sub(c, mul(u, 0.16)), mul(outward, -0.12))] });
    }
    if (mode === 'hidden') return;
    const label = mode === 'custom' ? { text: mathText(custom ?? ''), approx: false } : valueText(locked !== undefined ? typedLength(locked) : lengthMeasure(a, b), p);
    if (!label.text) return;
    if (p.sideStyle === 'dimension') {
      const off = mul(outward, p.dimOffset);
      const [a2, b2] = [add(a, off), add(b, off)];
      out.lines.push({ owner: o.id, pts: [add(a, mul(outward, 0.08)), add(a2, mul(outward, 0.12))] });
      out.lines.push({ owner: o.id, pts: [add(b, mul(outward, 0.08)), add(b2, mul(outward, 0.12))] });
      out.lines.push({ owner: o.id, pts: [a2, b2] });
      const head = (tip: Pt, dir: Pt) => out.lines.push({ owner: o.id, fill: true, closed: true, pts: [tip, add(sub(tip, mul(dir, 0.2)), mul(outward, 0.07)), add(sub(tip, mul(dir, 0.2)), mul(outward, -0.07))] });
      head(a2, mul(u, -1));
      head(b2, u);
      text({ owner: o.id, key, at: add(mid(a2, b2), mul(outward, p.fontSize * 0.75)), text: label.text, p, math: mode === 'custom', approx: label.approx, push: outward }, o.deco?.moved);
    } else {
      text({ owner: o.id, key, at: add(m, mul(outward, p.fontSize * 0.85 + 0.05)), text: label.text, p, math: mode === 'custom', approx: label.approx, push: outward }, o.deco?.moved);
    }
  };

  /** an angle at v from the ray to a round to the ray to c (the smaller turn), with its label */
  const corner = (o: GeoObject, key: string, a: Pt, v: Pt, c: Pt, mode: LabelMode, custom: string | undefined, arcs: number, p: GeoProps, reflex = false, locked?: number) => {
    const deg = locked ?? (reflex ? 360 - angleAt(a, v, c) : angleAt(a, v, c));
    const right = Math.abs(deg - 90) < 1e-6;
    const showMark = mode !== 'hidden' || p.rightMark === 'always';
    const [u1, u2] = [unit(sub(a, v)), unit(sub(c, v))];
    let bis = unit(add(u1, u2));
    if (len(add(u1, u2)) < 1e-9) bis = { x: -u1.y, y: u1.x };
    if (reflex) bis = mul(bis, -1);
    const r = p.arcSize;
    if (showMark && p.rightMark !== 'off' && (right || p.rightMark === 'always') && !reflex) {
      const s = Math.min(r * 0.6, 0.35);
      out.lines.push({ owner: o.id, pts: [add(v, mul(u1, s)), add(add(v, mul(u1, s)), mul(u2, s)), add(v, mul(u2, s))] });
    } else if (mode !== 'hidden') {
      let t1 = Math.atan2(u1.y, u1.x);
      let sweep = Math.atan2(u2.y, u2.x) - t1;
      while (sweep <= -Math.PI) sweep += 2 * Math.PI;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      if (reflex) {
        t1 += sweep;
        sweep = 2 * Math.PI - Math.abs(sweep);
        if (sweep < 0) sweep = -sweep;
      }
      for (let j = 0; j < Math.max(1, Math.min(2, arcs)); j++) {
        const rr = r + j * 0.1;
        const pts: Pt[] = [];
        for (let k = 0; k <= 24; k++) {
          const t = t1 + (sweep * k) / 24;
          pts.push({ x: v.x + rr * Math.cos(t), y: v.y + rr * Math.sin(t) });
        }
        out.lines.push({ owner: o.id, pts });
      }
    }
    if (mode === 'hidden' || (right && mode === 'value' && p.rightMark !== 'off')) return;
    const label = mode === 'custom' ? { text: mathText(custom ?? ''), approx: false } : valueText(angleMeasure(deg), p);
    if (label.text) text({ owner: o.id, key, at: add(v, mul(bis, r + p.fontSize * 0.9)), text: label.text, p, math: mode === 'custom', approx: label.approx, push: bis }, o.deco?.moved);
  };

  // which polygon each point is a corner of, for putting its name outside
  const outwardOf = new Map<string, Pt>();
  for (const o of objects) {
    const s = shapes.get(o.id);
    if (s?.type !== 'polygon') continue;
    const ids = cornerIds(o, objects);
    const cen = mul(s.pts.reduce((t, q) => add(t, q), { x: 0, y: 0 }), 1 / s.pts.length);
    ids.forEach((id, k) => {
      const q = s.pts[k];
      if (q) outwardOf.set(id, unit(sub(q, cen)));
    });
  }

  for (const o of objects) {
    const s = shapes.get(o.id);
    if (!s) continue;
    const p = P(o);
    const sideOf = (k: number): LabelPart => o.deco?.sides?.[k] ?? {};
    const cornerOf = (k: number): LabelPart => o.deco?.corners?.[k] ?? {};

    if (s.type === 'point') {
      if (!p.pointLabel) continue;
      const dir = outwardOf.get(o.id) ?? unit({ x: 1, y: 1 });
      text({ owner: o.id, key: `${o.id}:name`, at: add(s.at, mul(dir, p.fontSize * 0.95)), text: o.name, p, math: true, push: dir }, o.deco?.moved);
    } else if (s.type === 'line') {
      const n0 = unit({ x: -(s.b.y - s.a.y), y: s.b.x - s.a.x });
      const outward = n0.y < -1e-9 || (Math.abs(n0.y) < 1e-9 && n0.x < 0) ? mul(n0, -1) : n0;
      const ticks = o.props?.ticks ?? autoTick.get(`${o.id}:0`) ?? p.ticks;
      if (o.kind === 'segment') side(o, `${o.id}:len`, s.a, s.b, outward, p.segLabel, o.deco?.text, ticks, p.arrows, p);
      else if (p.arrows || p.ticks) side(o, `${o.id}:len`, s.a, s.b, outward, 'hidden', undefined, p.ticks, p.arrows, p);
    } else if (s.type === 'polygon') {
      const ccw = polygonArea(s.pts) > 0;
      const n = s.pts.length;
      s.pts.forEach((a, k) => {
        const b = s.pts[(k + 1) % n]!;
        const d = unit(sub(b, a));
        const outward = ccw ? { x: d.y, y: -d.x } : { x: -d.y, y: d.x };
        const part = sideOf(k);
        const ticks = part.ticks ?? o.props?.ticks ?? autoTick.get(`${o.id}:${k}`) ?? p.ticks;
        side(o, `${o.id}:side${k}`, a, b, outward, part.label ?? p.sideLabel, part.text, ticks, part.arrows ?? p.arrows, p, part.len);
      });
      s.pts.forEach((v, k) => {
        const part = cornerOf(k);
        const [prev, next] = [s.pts[(k + n - 1) % n]!, s.pts[(k + 1) % n]!];
        // a reflex corner of a concave polygon turns the other way
        const cross = (v.x - prev.x) * (next.y - v.y) - (v.y - prev.y) * (next.x - v.x);
        const reflex = ccw ? cross < 0 : cross > 0;
        corner(o, `${o.id}:corner${k}`, prev, v, next, part.label ?? p.cornerLabel, part.text, part.arcs ?? p.angleArcs, p, reflex, part.deg);
      });
      if (p.areaLabel !== 'hidden') {
        const label = p.areaLabel === 'custom' ? { text: mathText(o.deco?.text ?? ''), approx: false } : valueText(areaMeasure(Math.abs(polygonArea(s.pts))), p);
        const cen = mul(s.pts.reduce((t, q) => add(t, q), { x: 0, y: 0 }), 1 / n);
        if (label.text) text({ owner: o.id, key: `${o.id}:area`, at: cen, text: label.text, p, math: p.areaLabel === 'custom', approx: label.approx, push: { x: 0, y: 1 } }, o.deco?.moved);
      }
    } else if (s.type === 'circle') {
      if (p.centerMark) out.dots.push({ owner: o.id, at: s.c });
      const dir = unit({ x: 1, y: 1 });
      if (p.circleLine !== 'none') out.lines.push({ owner: o.id, pts: [p.circleLine === 'diameter' ? sub(s.c, mul(dir, s.r)) : s.c, add(s.c, mul(dir, s.r))] });
      const m = measuresOf(o, s);
      const custom = o.deco?.text?.trim();
      if (p.circleValue === 'hidden' && !custom) continue;
      const which = p.circleValue === 'hidden' ? 'radius' : p.circleValue;
      const label = custom ? { text: mathText(custom), approx: false } : valueText(m[which]!, p);
      const onLine = p.circleLine !== 'none' && (which === 'radius' || which === 'diameter');
      const prefix = custom || onLine ? '' : { radius: 'r = ', diameter: 'd = ', area: 'S = ', circumference: 'l = ' }[which];
      const normal = { x: -dir.y, y: dir.x };
      const at = onLine ? add(add(s.c, mul(dir, p.circleLine === 'diameter' ? 0 : s.r / 2)), mul(normal, p.fontSize * 0.8)) : add(s.c, mul(dir, s.r + p.fontSize * 1.1));
      text({ owner: o.id, key: `${o.id}:value`, at, text: `${prefix}${label.text}`, p, math: Boolean(custom), approx: label.approx, push: onLine ? normal : dir }, o.deco?.moved);
    } else if (s.type === 'ellipse') {
      if (p.centerMark) out.dots.push({ owner: o.id, at: s.c });
      if (p.areaLabel !== 'hidden') {
        const label = p.areaLabel === 'custom' ? { text: mathText(o.deco?.text ?? ''), approx: false } : valueText(areaMeasure(Math.PI * s.rx * s.ry, true), p);
        if (label.text) text({ owner: o.id, key: `${o.id}:area`, at: add(s.c, { x: 0, y: -p.fontSize * 1.2 }), text: label.text, p, math: p.areaLabel === 'custom', approx: label.approx, push: { x: 0, y: -1 } }, o.deco?.moved);
      }
    } else if (s.type === 'angle') {
      corner(o, `${o.id}:angle`, s.a, s.v, s.c, p.angleLabel, o.deco?.text, p.angleArcs, p);
    }
  }

  // labels that run into each other move apart, each along its own outward direction
  const box = (t: DecoText) => {
    const w = Math.max(1, t.text.length) * t.size * 0.55;
    return { x0: t.at.x - w / 2, x1: t.at.x + w / 2, y0: t.at.y - t.size / 2, y1: t.at.y + t.size / 2 };
  };
  for (let i = 0; i < out.texts.length; i++) {
    const t = out.texts[i]!;
    const owner = objects.find((o) => o.id === t.owner);
    if (owner?.deco?.moved?.[t.key]) continue;
    for (let round = 0; round < 3; round++) {
      const b = box(t);
      const hit = out.texts.slice(0, i).some((u) => {
        const c = box(u);
        return b.x0 < c.x1 && c.x0 < b.x1 && b.y0 < c.y1 && c.y0 < b.y1;
      });
      if (!hit) break;
      t.at = add(t.at, mul(unit(t.push), t.size * 0.8));
    }
  }
  return out;
}

/** text split into runs: lower-case letters and Greek in italic (variables), the rest upright (numbers, units, point names) */
export function runs(text: string, italic: boolean): { text: string; italic: boolean }[] {
  if (!italic) return [{ text, italic: false }];
  const UNITS = new Set(['cm', 'mm', 'm', 'km', 'kg', 'g', 'L', 'mL', 'sin', 'cos', 'tan', 'log', 'ln']);
  const out: { text: string; italic: boolean }[] = [];
  for (const part of text.split(/([a-zα-ωA-Z]+)/u)) {
    if (!part) continue;
    const it = /^[a-zα-ω]+$/u.test(part) && !UNITS.has(part);
    const last = out[out.length - 1];
    if (last && last.italic === it) last.text += part;
    else out.push({ text: part, italic: it });
  }
  return out;
}
