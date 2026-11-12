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
  it('answers ≠ with known values true or false, and keeps 3! = 6 a factorial', () => {
    expect(one('2 ≠ 3')).toEqual({ status: 'relation', holds: true });
    expect(one('2 + 2 != 4')).toEqual({ status: 'relation', holds: false });
    expect(one('[1, 2] ≠ [1, 3]')).toEqual({ status: 'relation', holds: true });
    expect(one('3! = 6')).toEqual({ status: 'relation', holds: true });
  });
  it('leaves points out with {x ≠ a} and says why y ≠ x has no graph', () => {
    const w = new Workspace();
    w.set('1', 'y = 1/x {x ≠ 0}');
    w.set('2', 'y ≠ x');
    const g = w.graphables();
    expect(g.find((v) => v.id === '1')).toMatchObject({ kind: 'curve' });
    expect(g.find((v) => v.id === '2')).toBeUndefined();
    expect(w.graphIssue('2')).toMatch(/every point except/);
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
