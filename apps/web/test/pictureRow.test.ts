import { describe, expect, it } from 'vitest';
import { num } from '../src/components/PictureRow';
import { fromLocal, toLocal } from '../src/graph/pictures';

describe('image fields', () => {
  it('reads numbers and multiples of π', () => {
    expect(num('1.5')).toBe(1.5);
    expect(num('-3/4')).toBe(-0.75);
    expect(num('π')).toBeCloseTo(Math.PI);
    expect(num('2π/3')).toBeCloseTo((2 * Math.PI) / 3);
    expect(num('-pi/2')).toBeCloseTo(-Math.PI / 2);
    expect(num('abc')).toBeNaN();
    expect(num('')).toBeNaN();
  });
  it('turns points into and out of a turned picture', () => {
    const p = { id: 'a', src: '', cx: 1, cy: 2, w: 4, h: 2, angle: Math.PI / 6, opacity: 1 };
    const [x, y] = fromLocal([p.cx, p.cy], p.angle, 2, 1);
    const [u, v] = toLocal(p, x, y);
    expect(u).toBeCloseTo(2);
    expect(v).toBeCloseTo(1);
  });
});
