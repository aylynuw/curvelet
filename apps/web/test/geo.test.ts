import { describe, expect, it } from 'vitest';
import { measure, nextName, resolve, toLines, type GeoObject } from '../src/geo/model';
import { recognize } from '../src/geo/sketch';

const P = (id: string, x: number, y: number): GeoObject => ({ id, kind: 'point', name: id, x, y });

describe('geometry model', () => {
  const base: GeoObject[] = [P('A', 0, 0), P('B', 4, 0), P('C', 0, 3)];
  it('builds dependent objects and measures them', () => {
    const objs: GeoObject[] = [
      ...base,
      { id: 's', kind: 'segment', name: 'f', a: 'B', b: 'C' },
      { id: 'M', kind: 'midpoint', name: 'M', a: 'B', b: 'C' },
      { id: 'T', kind: 'polygon', name: 'p', pts: ['A', 'B', 'C'] },
      { id: 'g', kind: 'angle', name: 'α', a: 'B', vertex: 'A', c: 'C' },
    ];
    const s = resolve(objs);
    expect(s.get('M')).toMatchObject({ type: 'point', at: { x: 2, y: 1.5 } });
    expect(measure(s.get('s')!)).toBe('5');
    expect(measure(s.get('T')!)).toBe('6');
    expect(measure(s.get('g')!)).toBe('90°');
  });

  it('finds crossings, perpendiculars and reflections', () => {
    const objs: GeoObject[] = [
      ...base,
      { id: 'l', kind: 'line', name: 'l', a: 'A', b: 'B' },
      { id: 'k', kind: 'circle', name: 'k', center: 'A', through: 'C' },
      { id: 'I', kind: 'intersection', name: 'I', p: 'l', q: 'k', which: 1 },
      { id: 'q', kind: 'perpendicular', name: 'q', line: 'l', through: 'B' },
      { id: 'J', kind: 'intersection', name: 'J', p: 'l', q: 'q', which: 0 },
      { id: 'R', kind: 'reflect', name: 'R', p: 'C', line: 'l' },
      { id: 'Q', kind: 'rotate', name: 'Q', p: 'B', center: 'A', degrees: 90 },
    ];
    const s = resolve(objs);
    expect(s.get('I')).toMatchObject({ at: { x: 3, y: 0 } });
    const J = s.get('J');
    expect(J?.type === 'point' && Math.abs(J.at.x - 4) < 1e-9 && Math.abs(J.at.y) < 1e-9).toBe(true);
    expect(s.get('R')).toMatchObject({ at: { x: 0, y: -3 } });
    const Q = s.get('Q');
    expect(Q?.type === 'point' && Math.abs(Q.at.x) < 1e-9 && Math.abs(Q.at.y - 4) < 1e-9).toBe(true);
  });

  it('leaves out what cannot exist, and moving a point moves its dependants', () => {
    const objs: GeoObject[] = [...base, { id: 's', kind: 'segment', name: 's', a: 'A', b: 'A' }, { id: 'M', kind: 'midpoint', name: 'M', a: 'A', b: 'B' }];
    expect(resolve(objs).has('s')).toBe(false);
    const moved = objs.map((o) => (o.id === 'B' && o.kind === 'point' ? { ...o, x: 10 } : o));
    expect(resolve(moved).get('M')).toMatchObject({ at: { x: 5, y: 0 } });
  });

  it('writes calculator lines', () => {
    const objs: GeoObject[] = [...base, { id: 's', kind: 'segment', name: 's', a: 'A', b: 'B' }, { id: 'k', kind: 'circle', name: 'k', center: 'A', through: 'C' }, { id: 'p', kind: 'polygon', name: 'p', pts: ['A', 'B', 'C'] }];
    expect(toLines(objs)).toEqual(['A = (0, 0)', 'B = (4, 0)', 'C = (0, 3)', 'segment(A, B)', 'circle(A, C)', 'polygon(A, B, C)']);
  });

  it('names points A, B, … then A_1', () => {
    expect(nextName([P('A', 0, 0)])).toBe('B');
    const all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => P(c, 0, 0));
    expect(nextName(all)).toBe('A_1');
  });
});

describe('pen shapes', () => {
  const wobble = (k: number) => Math.sin(k * 1.7) * 1.5;
  it('reads a wobbly line as a segment', () => {
    const pts = Array.from({ length: 40 }, (_, k) => ({ x: k * 5, y: 100 + wobble(k) }));
    expect(recognize(pts)?.kind).toBe('segment');
  });
  it('reads a loop as a circle', () => {
    const pts = Array.from({ length: 60 }, (_, k) => {
      const t = (k / 60) * 2 * Math.PI;
      return { x: 200 + 80 * Math.cos(t) + wobble(k), y: 200 + 80 * Math.sin(t) + wobble(k + 3) };
    });
    const r = recognize(pts);
    expect(r?.kind).toBe('circle');
    if (r?.kind === 'circle') expect(Math.abs(r.r - 80)).toBeLessThan(6);
  });
  it('reads a closed triangle as a polygon', () => {
    const corners = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 170 }];
    const pts = corners.flatMap((a, k) => {
      const b = corners[(k + 1) % 3]!;
      return Array.from({ length: 20 }, (_, j) => ({ x: a.x + ((b.x - a.x) * j) / 20 + wobble(j), y: a.y + ((b.y - a.y) * j) / 20 }));
    });
    const r = recognize(pts);
    expect(r?.kind).toBe('polygon');
    if (r?.kind === 'polygon') expect(r.pts).toHaveLength(3);
  });
  it('ignores a scribble', () => {
    const pts = Array.from({ length: 40 }, (_, k) => ({ x: (k % 7) * 30, y: k * 4 }));
    expect(recognize(pts)).toBe(null);
  });

  it('builds a square and a regular hexagon on a side, corners following the side', () => {
    const sq: GeoObject[] = [
      P('A', 0, 0),
      P('B', 2, 0),
      { id: 'q', kind: 'regular', name: 'q', a: 'A', b: 'B', n: 4 },
      { id: 'C', kind: 'vertex', name: 'C', poly: 'q', k: 2 },
      { id: 'D', kind: 'vertex', name: 'D', poly: 'q', k: 3 },
    ];
    const r = resolve(sq);
    expect(measure(r.get('q')!)).toBe('4');
    const c = r.get('C')!;
    expect(c.type === 'point' && [Math.round(c.at.x * 1e9) / 1e9, Math.round(c.at.y * 1e9) / 1e9]).toEqual([2, 2]);
    expect(toLines(sq)).toContain('D = (0, 2)');
    const hex = resolve([P('A', 0, 0), P('B', 2, 0), { id: 'h', kind: 'regular', name: 'h', a: 'A', b: 'B', n: 6 }]);
    expect(measure(hex.get('h')!)).toBe('10.392');
  });
});
