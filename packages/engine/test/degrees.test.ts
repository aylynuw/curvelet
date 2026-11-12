import { describe, expect, it } from 'vitest';
import { Workspace, compileReal, parseExpression } from '../src';

const one = (src: string, angle: 'rad' | 'deg' = 'rad') => {
  const w = new Workspace({ angle });
  w.set('1', src);
  return w.result('1');
};
const text = (src: string, angle: 'rad' | 'deg' = 'rad') => {
  const r = one(src, angle);
  return r?.status === 'value' ? r.text : r?.status === 'error' ? `error: ${r.message}` : r?.status;
};

describe('degree sign and ≠', () => {
  it('reads 30° in either angle mode', () => {
    expect(text('sin(30°)')).toBe('0.5');
    expect(text('sin(30°)', 'deg')).toBe('0.5');
    expect(text('90°')).toBe(text('pi/2'));
  });
  it('says plainly that ≠ is not supported instead of reading x! = 2', () => {
    expect(text('x != 2')).toMatch(/≠/);
    expect(text('x ≠ 2')).toMatch(/≠/);
    expect(text('3! = 6')).not.toMatch(/≠/);
  });
});

describe('degrees on the graph', () => {
  const ctx = (angle: 'rad' | 'deg') => ({ vars: ['x'], value: () => undefined, func: () => undefined, angle });
  it('graphs sin(x°) with a period of 360 in either mode', () => {
    for (const angle of ['rad', 'deg'] as const) {
      expect(compileReal(parseExpression('sin(x°)'), ctx(angle))([90])).toBeCloseTo(1, 12);
    }
  });
});
