import { describe, expect, it } from 'vitest';
import { insideAngle, solvePolygon, turnArm } from '../src/geo/solve';

const P = (x: number, y: number) => ({ x, y });
const len = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(q.x - p.x, q.y - p.y);
const deg = (pts: { x: number; y: number }[], k: number) => (insideAngle(pts, k, true) * 180) / Math.PI;

describe('redrawing a polygon to typed values', () => {
  it('a rectangle given a new width stays a rectangle', () => {
    const rect = [P(0, 0), P(4, 0), P(4, 3), P(0, 3)];
    const { pts, miss } = solvePolygon(rect, [true, true, true, true], [{ kind: 'len', side: 0, value: 6 }]);
    expect(miss).toBeLessThan(1e-9);
    expect(len(pts[0]!, pts[1]!)).toBeCloseTo(6, 9);
    for (let k = 0; k < 4; k++) expect(deg(pts, k)).toBeCloseTo(90, 6);
    // grid numbers come back as they were: the height is exactly 3
    expect(len(pts[1]!, pts[2]!)).toBe(3);
  });

  it('a triangle takes a typed angle exactly', () => {
    const tri = [P(0, 0), P(4, 0), P(1, 3)];
    const { pts, miss } = solvePolygon(tri, [true, true, true], [{ kind: 'ang', corner: 1, value: 60 }]);
    expect(miss).toBeLessThan(1e-9);
    expect(deg(pts, 1)).toBeCloseTo(60, 9);
    // the base stays level
    expect(pts[1]!.y - pts[0]!.y).toBeCloseTo(0, 6);
  });

  it('two sides and the angle between them fix a triangle (SAS)', () => {
    const tri = [P(0, 0), P(4, 0), P(1, 3)];
    const { pts, miss } = solvePolygon(tri, [true, true, true], [
      { kind: 'len', side: 0, value: 5 },
      { kind: 'len', side: 1, value: 3 },
      { kind: 'ang', corner: 1, value: 90 },
    ]);
    expect(miss).toBeLessThan(1e-9);
    expect(len(pts[2]!, pts[0]!)).toBeCloseTo(Math.sqrt(34), 9);
  });

  it('keeps points that hang on other objects where they are', () => {
    const tri = [P(0, 0), P(4, 0), P(1, 3)];
    const { pts } = solvePolygon(tri, [false, true, true], [{ kind: 'len', side: 0, value: 2 }]);
    expect(pts[0]).toEqual(P(0, 0));
    expect(len(pts[0]!, pts[1]!)).toBeCloseTo(2, 9);
  });

  it('says how far off it is when the values cannot all hold', () => {
    const tri = [P(0, 0), P(4, 0), P(1, 3)];
    const { miss } = solvePolygon(tri, [true, true, true], [
      { kind: 'len', side: 0, value: 1 },
      { kind: 'len', side: 1, value: 1 },
      { kind: 'len', side: 2, value: 5 },
    ]);
    expect(miss).toBeGreaterThan(0.1);
  });

  it('turns an arm of an angle to a typed size', () => {
    const c = turnArm(P(1, 0), P(0, 0), P(0, 2), 60);
    expect(c.x).toBeCloseTo(1, 9);
    expect(c.y).toBeCloseTo(Math.sqrt(3), 9);
  });
});
