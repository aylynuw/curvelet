import { Workspace } from '@math/engine';
import { describe, expect, it } from 'vitest';
import { fitRange } from '../src/graph/fit';

const graph = (...src: string[]) => {
  const w = new Workspace();
  src.forEach((s, k) => w.set(String(k), s));
  return w.graphables();
};

describe('fit to curves', () => {
  it('fits y to a parabola over the current x range', () => {
    const r = fitRange(graph('y = x^2 + 30'), -10, 10, -10, 10)!;
    expect(r.ymin).toBeGreaterThan(20);
    expect(r.ymax).toBeGreaterThan(125);
    expect(r.ymax).toBeLessThan(150);
  });
  it('takes in points and whole parametric curves', () => {
    const r = fitRange(graph('(5cos(t) + 40, 5sin(t))', 'P = (0, 0)'), -10, 10, -10, 10)!;
    expect(r.xmin).toBeLessThan(0);
    expect(r.xmax).toBeGreaterThan(45);
  });
  it('is not thrown by an asymptote', () => {
    const r = fitRange(graph('y = tan(x)'), -10, 10, -10, 10)!;
    expect(r.ymax - r.ymin).toBeLessThan(200);
  });
  it('has nothing to fit with no curves', () => {
    expect(fitRange([], -10, 10, -10, 10)).toBe(null);
  });
});
