import { describe, expect, it } from 'vitest';
import { exactNumber } from '../src/calc/fraction';

describe('exactNumber', () => {
  it('writes fractions, roots and multiples of π', () => {
    expect(exactNumber(0.5)).toBe('1/2');
    expect(exactNumber(Math.sqrt(8))).toBe('2sqrt(2)');
    expect(exactNumber(Math.sqrt(3) / 2)).toBe('sqrt(3)/2');
    expect(exactNumber(-Math.sqrt(2))).toBe('-sqrt(2)');
    expect(exactNumber(Math.PI / 6)).toBe('pi/6');
    expect(exactNumber((3 * Math.sqrt(5)) / 4)).toBe('3sqrt(5)/4');
  });
  it('leaves other decimals alone', () => {
    expect(exactNumber(Math.E)).toBeNull();
    expect(exactNumber(2)).toBeNull();
    expect(exactNumber(1.23456789)).toBeNull();
  });
});
