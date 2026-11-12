import { describe, expect, it } from 'vitest';
import { sampleCurve } from '../src/sample';
describe('cases on the graph', () => {
  it('break at a jump, with no line across it, wherever the pixels fall', () => {
    // as compiled: a condition counts values within 1e-9 of the boundary as on it
    const fn = (x: number) => (x < 1 - 1e-9 ? x : Math.abs(x - 3) <= 1e-9 * 3 ? 1 : 3 - x / 2);
    for (const cx of [0, 0.3, 0.3125, -0.7]) {
      const v = { cx, cy: 0.2, scale: 40, width: 1024, height: 847 };
      const lines = sampleCurve(fn, 'y', v, 1, undefined, [1], [1, 3]);
      expect(lines.length).toBe(2);
      for (const l of lines) {
        for (let k = 2; k + 1 < l.length; k += 2) expect(Math.abs(l[k + 1]! - l[k - 1]!)).toBeLessThan(25);
      }
    }
  });
});
