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
