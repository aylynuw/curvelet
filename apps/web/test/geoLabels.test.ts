import { describe, expect, it } from 'vitest';
import { exactSqrt, exactText, formatMeasure, mathText } from '../src/geo/exact';
import { figureSvg } from '../src/geo/exportFigure';
import { draftOf } from '../src/geo/GeometryTool';
import { decorate, lengthMeasure, measuresOf } from '../src/geo/labels';
import { cloneObjects, draggable, freeRoots, resolve, type GeoObject } from '../src/geo/model';
import { BASE_PROPS, propsOf } from '../src/geo/props';

const P = (id: string, x: number, y: number): GeoObject => ({ id, kind: 'point', name: id, x, y });
const texts = (objs: GeoObject[], defaults = BASE_PROPS) => decorate(objs, resolve(objs), defaults).texts.map((t) => t.text);

describe('exact values', () => {
  it('writes radicals, fractions and π the way a textbook does', () => {
    expect(exactText(exactSqrt(18)!)).toBe('3√2');
    expect(exactText(exactSqrt(13 / 4)!)).toBe('√13/2');
    expect(exactText(exactSqrt(12)!)).toBe('2√3');
    expect(exactText(exactSqrt(49 / 9)!)).toBe('7/3');
    expect(exactText({ a: 4, b: 1, c: 1 }, true)).toBe('4π');
    expect(exactSqrt(Math.PI)).toBe(null);
  });
  it('follows the chosen format, and says when a value has no exact form', () => {
    const m = lengthMeasure({ x: 0, y: 0 }, { x: 1, y: 1 });
    const f = (format: typeof BASE_PROPS.format, decimals = 2, unit = '') => formatMeasure(m, { format, decimals, unit });
    expect(f('auto').text).toBe('√2');
    expect(f('radical').text).toBe('√2');
    expect(f('decimal').text).toBe('1.41');
    expect(f('fraction')).toEqual({ text: '1.41', approx: true });
    expect(f('auto', 2, 'cm').text).toBe('√2 cm');
  });
  it('reads simple math in custom text', () => {
    expect(mathText('sqrt(13)')).toBe('√13');
    expect(mathText('2pi')).toBe('2π');
    expect(mathText('spin')).toBe('spin');
    expect(mathText('x^2 + theta')).toBe('x² + θ');
    expect(mathText('5 cm')).toBe('5 cm');
  });
});

describe('labels', () => {
  const seg: GeoObject[] = [P('A', 0, 0), P('B', 1, 1), { id: 's', kind: 'segment', name: 's', a: 'A', b: 'B' }];
  const withSeg = (props: GeoObject['props'], deco?: GeoObject['deco']) => [...seg.slice(0, 2), { ...seg[2]!, props, deco }];

  it('a segment from (0,0) to (1,1) shows √2, 1.41, x or nothing', () => {
    expect(texts(seg)).toContain('√2');
    expect(texts(withSeg({ format: 'decimal' }))).toContain('1.41');
    expect(texts(withSeg({ segLabel: 'custom' }, { text: 'x' }))).toContain('x');
    expect(texts(withSeg({ segLabel: 'hidden', pointLabel: false }))).not.toContain('√2');
  });

  it('a circle of radius 2 shows its area as 4π or 12.57', () => {
    const c: GeoObject[] = [P('O', 0, 0), P('R', 2, 0), { id: 'c', kind: 'circle', name: 'c', center: 'O', through: 'R', props: { circleValue: 'area' } }];
    expect(texts(c)).toContain('S = 4π');
    const dec = [...c.slice(0, 2), { ...c[2]!, props: { circleValue: 'area' as const, format: 'decimal' as const } }];
    expect(texts(dec)).toContain('S = 12.57');
  });

  it('the document default reaches objects left on Default, not ones with their own setting', () => {
    const objs: GeoObject[] = [P('A', 0, 0), P('B', 3, 0), P('C', 0, 2), P('D', 2, 2), { id: 's', kind: 'segment', name: 's', a: 'A', b: 'B' }, { id: 't', kind: 'segment', name: 't', a: 'C', b: 'D', props: { format: 'radical' } }];
    const defaults = { ...BASE_PROPS, unit: 'cm', format: 'decimal' as const, decimals: 1 };
    const t = texts(objs, defaults);
    expect(t).toContain('3.0 cm');
    expect(t).toContain('2 cm');
    expect(propsOf(defaults, objs[5]!.props).format).toBe('radical');
  });

  it('a triangle shows 5 cm, x and a 60° angle at once, and exports as SVG in exam view', () => {
    const h = Math.sqrt(3);
    const tri: GeoObject[] = [
      P('A', 0, 0),
      P('B', 2, 0),
      P('C', 1, h),
      {
        id: 't',
        kind: 'polygon',
        name: 't',
        pts: ['A', 'B', 'C'],
        props: { areaLabel: 'hidden' },
        deco: { sides: [{ label: 'custom', text: '5 cm' }, { label: 'custom', text: 'x' }], corners: [{ label: 'value' }] },
      },
    ];
    const t = texts(tri);
    expect(t).toEqual(expect.arrayContaining(['5 cm', 'x', '60°']));
    const shapes = resolve(tri);
    const fig = figureSvg(tri, shapes, decorate(tri, shapes, BASE_PROPS), { margin: 0.5, exam: true })!;
    expect(fig.svg).toContain('<svg');
    expect(fig.svg).toContain('5 cm');
    expect(fig.svg).toContain('60°');
    expect(fig.svg).not.toContain('var(--');
  });

  it('marks a right angle with a square, and ticks equal sides when asked', () => {
    const sq: GeoObject[] = [P('A', 0, 0), P('B', 2, 0), P('C', 2, 2), P('D', 0, 2), { id: 'q', kind: 'polygon', name: 'q', pts: ['A', 'B', 'C', 'D'], props: { cornerLabel: 'value' } }];
    const d = decorate(sq, resolve(sq), { ...BASE_PROPS, autoTicks: true });
    expect(d.texts.map((x) => x.text)).not.toContain('90°');
    // four right-angle squares (3 points each) and four single ticks (2 points each)
    expect(d.lines.filter((l) => l.pts.length === 3).length).toBe(4);
    expect(d.lines.filter((l) => l.pts.length === 2).length).toBe(4);
  });

  it('gives the measures the panel lists', () => {
    const c: GeoObject[] = [P('O', 0, 0), P('R', 2, 0), { id: 'c', kind: 'circle', name: 'c', center: 'O', through: 'R' }];
    const m = measuresOf(c[2]!, resolve(c).get('c')!);
    expect(formatMeasure(m.area!, BASE_PROPS).text).toBe('4π');
    expect(formatMeasure(m.circumference!, BASE_PROPS).text).toBe('4π');
    expect(formatMeasure(m.radius!, BASE_PROPS).text).toBe('2');
  });
});

describe('drawing by dragging', () => {
  it('Shift makes a square from a rectangle and an equilateral triangle', () => {
    const r = draftOf('rect', { x: 0, y: 0 }, { x: 3, y: 1 }, true, false)!.draft;
    if (r.kind !== 'poly') throw new Error('poly');
    const [w, h] = [r.pts[1]!.x - r.pts[0]!.x, r.pts[2]!.y - r.pts[1]!.y];
    expect(w).toBeCloseTo(3);
    expect(h).toBeCloseTo(3);
    const t = draftOf('triangle', { x: 0, y: 0 }, { x: 2, y: 5 }, true, false)!.draft;
    if (t.kind !== 'poly') throw new Error('poly');
    const side = (i: number, j: number) => Math.hypot(t.pts[j]!.x - t.pts[i]!.x, t.pts[j]!.y - t.pts[i]!.y);
    expect(side(0, 1)).toBeCloseTo(side(1, 2), 9);
    expect(side(1, 2)).toBeCloseTo(side(2, 0), 9);
  });
  it('a circle drawn from its centre has the drag distance as its radius; Alt draws a box around the start', () => {
    const c = draftOf('circle', { x: 1, y: 1 }, { x: 4, y: 5 }, false, false)!.draft;
    expect(c).toEqual({ kind: 'circle', c: { x: 1, y: 1 }, r: 5 });
    const e = draftOf('ellipse', { x: 0, y: 0 }, { x: 2, y: 1 }, false, true)!.draft;
    expect(e).toEqual({ kind: 'ellipse', c: { x: 0, y: 0 }, rx: 2, ry: 1 });
  });
  it('Shift turns a segment in 15° steps', () => {
    const s = draftOf('segment', { x: 0, y: 0 }, { x: 10, y: 1 }, true, false)!.draft;
    if (s.kind !== 'seg') throw new Error('seg');
    expect(s.b.y).toBeCloseTo(0, 9);
  });
});

describe('editing keeps dependencies', () => {
  const objs: GeoObject[] = [P('A', 0, 0), P('B', 4, 0), { id: 's', kind: 'segment', name: 's', a: 'A', b: 'B' }, { id: 'M', kind: 'midpoint', name: 'M', a: 'A', b: 'B' }];
  it('a segment moves by its free ends; a midpoint cannot be dragged by itself', () => {
    expect(freeRoots(objs, ['s']).sort()).toEqual(['A', 'B']);
    expect(draggable(objs[3]!)).toBe(false);
    expect(draggable(objs[2]!)).toBe(true);
  });
  it('a duplicate is built the same way, on copies of its points', () => {
    const copies = cloneObjects(objs, objs, { x: 1, y: 1 }, (() => {
      let n = 0;
      return () => `n${n++}`;
    })());
    const all = [...objs, ...copies];
    const m = resolve(all).get(copies[3]!.id)!;
    expect(m.type === 'point' && m.at).toEqual({ x: 3, y: 1 });
  });
});

describe('exact values stay honest', () => {
  it('a length that is only close to a fraction stays a decimal', () => {
    // C moved along a side to length 5 from B: the far side CA is irrational
    const u = { x: -2 / Math.sqrt(20), y: 4 / Math.sqrt(20) };
    const C = { x: 4 + 5 * u.x, y: -1 + 5 * u.y };
    const m = lengthMeasure(C, { x: 0, y: -1 });
    expect(formatMeasure(m, BASE_PROPS).approx).toBe(true);
    expect(formatMeasure(lengthMeasure({ x: 4, y: -1 }, C), BASE_PROPS).text).toBe('5');
  });
});
