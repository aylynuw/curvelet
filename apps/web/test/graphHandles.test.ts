import { describe, expect, it } from 'vitest';
import { crossingsWith, literalPoints, pointNames, setLiteral, shiftLiterals } from '../src/graph/handles';
import { textToLatex } from '../src/math/latex';

describe('graph shape handles', () => {
  it('finds the written points and rewrites one or all', () => {
    const src = 'polygon(A, B, (2, 3), (-1.5, 0))';
    expect(literalPoints(src).map((l) => [l.x, l.y])).toEqual([[2, 3], [-1.5, 0]]);
    expect(setLiteral(src, 1, 4, -2)).toBe('polygon(A, B, (2, 3), (4, -2))');
    expect(shiftLiterals(src, 1, 0.5)).toBe('polygon(A, B, (3, 3.5), (-0.5, 0.5))');
    expect(pointNames(src)).toEqual(['A', 'B']);
    expect(pointNames('M = midpoint(A, B_1)')).toEqual(['A', 'B_1']);
  });
  it('finds where two polylines cross', () => {
    expect(crossingsWith([0, 0, 10, 10], [0, 10, 10, 0])).toEqual([{ x: 5, y: 5 }]);
  });
  it('keeps a point inside a call visible as a pair', () => {
    expect(textToLatex('bezier((1, 2), (3, 4))')).toBe('\\operatorname{bezier}(\\left(1,2\\right),\\left(3,4\\right))');
  });
});

import { exactCrossing, primOfShape } from '../src/graph/handles';
describe('exact crossings', () => {
  const near = (p: { x: number; y: number } | null, x: number, y: number) => {
    expect(p).not.toBeNull();
    expect(p!.x).toBeCloseTo(x, 12);
    expect(p!.y).toBeCloseTo(y, 12);
  };
  it('a polygon side and a line', () => {
    const side = primOfShape({ type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 3 }] }, { x: 3.1, y: 1.4 })!;
    // y = x/2 meets the side (4,0)-(2,3) at x = 3
    near(exactCrossing(side, { kind: 'fn', f: (x) => x / 2 }, { x: 3.01, y: 1.49 }, 0.1), 3, 1.5);
  });
  it('a line and a circle, and two circles', () => {
    near(exactCrossing({ kind: 'line', a: { x: -5, y: 0 }, b: { x: 5, y: 0 } }, { kind: 'circle', c: { x: 0, y: 0 }, r: 2 }, { x: 1.98, y: 0.01 }, 0.1), 2, 0);
    near(exactCrossing({ kind: 'circle', c: { x: 0, y: 0 }, r: 5 }, { kind: 'circle', c: { x: 8, y: 0 }, r: 5 }, { x: 4.01, y: 2.98 }, 0.1), 4, 3);
  });
});

describe('exact crossings with pen curves', () => {
  // one cubic piece from (0, 0) to (3, 0), bulging up
  const shape = { type: 'path', controls: [{ x: 0, y: 0 }, { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 0 }] };
  const on = (q: { x: number; y: number }, f: (x: number) => number) => Math.abs(q.y - f(q.x));
  it('finds where a pen curve meets a line, a circle, y = f(x) and another pen curve', () => {
    // each `near` is where the drawn curves cross on screen, as the graph finds it
    const near = { x: 1.01, y: 1.99 };
    const pen = primOfShape(shape, near)!;
    expect(pen.kind).toBe('bezier');
    const line = exactCrossing(pen, { kind: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 2 } }, near, 0.1)!;
    expect(on(line, (x) => 2 * x)).toBeLessThan(1e-9);
    const circle = exactCrossing({ kind: 'circle', c: { x: 0, y: 0 }, r: 1.3 }, pen, { x: 0.48, y: 1.21 }, 0.1)!;
    expect(Math.abs(Math.hypot(circle.x, circle.y) - 1.3)).toBeLessThan(1e-9);
    const fn = exactCrossing({ kind: 'fn', f: (x) => x * x }, pen, { x: 1.49, y: 2.24 }, 0.2)!;
    expect(on(fn, (x) => x * x)).toBeLessThan(1e-9);
    const other = primOfShape({ type: 'path', controls: [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }] }, near)!;
    const both = exactCrossing(pen, other, { x: 1.01, y: 2 }, 0.2)!;
    expect(Math.abs(both.y - 2)).toBeLessThan(1e-9);
  });
});
