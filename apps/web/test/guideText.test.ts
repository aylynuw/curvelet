import { describe, expect, it } from 'vitest';
import { plainGuide, prettyGuide } from '../src/graph/guideText';

describe('exam lengths typed as math', () => {
  it('prints integrals, roots and powers as an exam does', () => {
    expect(prettyGuide('integrate(f(x), x)')).toBe('∫f(x) dx');
    expect(prettyGuide('integrate(f(x), x, 0, 1)')).toBe('∫₀¹f(x) dx');
    expect(prettyGuide('sqrt(3)/2')).toBe('√3/2');
    expect(prettyGuide('sqrt(a+b)')).toBe('√(a+b)');
    expect(prettyGuide('a^2+2pi')).toBe('a²+2π');
    expect(prettyGuide('k')).toBe('k');
  });
  it('reads a printed number back for editing', () => {
    expect(plainGuide('−√2/2')).toBe('-sqrt(2)/2');
    expect(plainGuide('π/6')).toBe('pi/6');
  });
});

describe('problem summaries', () => {
  it('writes limits in one line', () => {
    expect(prettyGuide('limit((f(x) - x^3)/(x^2), x, inf) = 5')).toBe('lim x→∞ (f(x) - x³)/x² = 5');
    expect(prettyGuide('limit(f(x)/x, x, 0)')).toBe('lim x→0 f(x)/x');
  });
});
