import { describe, expect, it } from 'vitest';
import { fractionsIn, writeNumber } from '../src/numberForm';

describe('fractions or decimals', () => {
  it('shows decimals that are fractions as fractions', () => {
    expect(fractionsIn('(2.2, 4.048)')).toBe('(11/5, 506/125)');
    expect(fractionsIn('0.333333333333')).toBe('1/3');
    expect(fractionsIn('3.14159265359')).toBe('3.14159265359');
    expect(fractionsIn('1.5e-7')).toBe('1.5e-7');
    expect(fractionsIn('(-1.1, 2)')).toBe('(-11/10, 2)');
  });
  it('writes a coordinate in the chosen form', () => {
    expect(writeNumber(2.2, 'exact')).toBe('11/5');
    expect(writeNumber(2.2, 'decimal')).toBe('2.2');
    expect(writeNumber(-3, 'exact')).toBe('-3');
    expect(writeNumber(Math.PI, 'exact')).toBe('pi');
    expect(writeNumber(Math.SQRT2 / 2, 'exact')).toBe('sqrt(2)/2');
    expect(writeNumber(Math.PI, 'decimal')).toBe('3.1416');
  });
});
