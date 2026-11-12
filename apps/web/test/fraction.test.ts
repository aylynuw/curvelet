import { describe, expect, it } from 'vitest';
import { toFraction } from '../src/calc/fraction';

describe('toFraction', () => {
  it('finds small fractions', () => {
    expect(toFraction(0.375)).toBe('3/8');
    expect(toFraction(-1.25)).toBe('-5/4');
    expect(toFraction(1 / 3)).toBe('1/3');
    expect(toFraction(22 / 7)).toBe('22/7');
  });
  it('leaves integers and irrationals alone', () => {
    expect(toFraction(4)).toBe(null);
    expect(toFraction(Math.PI)).toBe(null);
    expect(toFraction(Math.SQRT2)).toBe(null);
  });
});
