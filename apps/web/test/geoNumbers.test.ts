import { describe, expect, it } from 'vitest';
import { formatMeasure } from '../src/geo/exact';
import { angleMeasure, lengthMeasure } from '../src/geo/labels';

const exact = { format: 'auto' as const, decimals: 2, unit: '' };
const dec = { format: 'decimal' as const, decimals: 2, unit: '' };

describe('geometry numbers', () => {
  it('shows exact forms by default and decimals when chosen', () => {
    expect(formatMeasure(lengthMeasure({ x: 0, y: 0 }, { x: 2, y: 4 }), exact).text).toBe('2√5');
    expect(formatMeasure(lengthMeasure({ x: 0, y: 0 }, { x: 2, y: 4 }), dec).text).toBe('4.47');
    expect(formatMeasure(angleMeasure(45), exact).text).toBe('45°');
    expect(formatMeasure(angleMeasure(45), dec).text).toBe('45.00°');
  });
  it('a value with no exact form drops trailing zeros in exact view', () => {
    expect(formatMeasure(angleMeasure(63.4349), exact).text).toBe('63.43°');
    expect(formatMeasure(angleMeasure(44.9999999), exact).text).toBe('45°');
    expect(formatMeasure(angleMeasure(22.5), exact).text).toBe('22.5°');
  });
});
