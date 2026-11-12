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
