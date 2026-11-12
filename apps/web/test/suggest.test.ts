import { Workspace } from '@math/engine';
import { describe, expect, it } from 'vitest';
import { suggest } from '../src/suggest';

const of = (src: string) => {
  const w = new Workspace();
  w.set('1', src);
  return suggest(src, w.result('1'), 'en');
};

describe('suggestions for lines that went wrong', () => {
  it('splits a function run into its argument', () => {
    expect(of('sinx')?.fix).toBe('sin(x)');
    expect(of('y = cosx + 1')?.fix).toBe('y = cos(x) + 1');
    expect(of('arcsinx')?.fix).toBe('arcsin(x)');
    expect(of('lnx')?.say).toBe('Did you mean ln(x)?');
  });
  it('fixes the case and near misses of a name', () => {
    expect(of('Sin(x)')?.fix).toBe('sin(x)');
    expect(of('SQRT(4)')?.fix).toBe('sqrt(4)');
    expect(of('sqroot(4)')?.fix).toBe('sqrt(4)');
  });
  it('explains what it cannot fix, and leaves good lines alone', () => {
    expect(of('y = 2x +')?.say).toMatch(/stops before/);
    expect(of('5 % 2')?.say).toMatch(/mod/);
    expect(of('sin(x)')).toBe(null);
    expect(of('r^2')).toBe(null);
  });
});
