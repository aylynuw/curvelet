import { compileReal, parseExpression } from '@math/engine';
import { describe, expect, it } from 'vitest';
import { explainGraph, type Interval } from '../src';

const ctx = { vars: ['x'], value: () => undefined, func: () => undefined, angle: 'rad' as const };
const ex = (src: string) => {
  const g = compileReal(parseExpression(src), ctx);
  return explainGraph((x) => g([x]));
};
const iv = (i: Interval) => `${i.loClosed ? '[' : '('}${i.lo?.text ?? '-inf'}, ${i.hi?.text ?? 'inf'}${i.hiClosed ? ']' : ')'}`;
const pts = (p: { x: { text: string }; y: { text: string } }[]) => p.map((q) => `(${q.x.text}, ${q.y.text})`);

describe('explain this graph', () => {
  it('a parabola', () => {
    const e = ex('x^2 - 4');
    expect(e.allReals).toBe(true);
    expect(e.xIntercepts.map((n) => n.text)).toEqual(['-2', '2']);
    expect(e.yIntercept?.text).toBe('-4');
    expect(pts(e.minima)).toEqual(['(0, -4)']);
    expect(e.maxima).toEqual([]);
    expect(e.decreasing.map(iv)).toEqual(['(-inf, 0]']);
    expect(e.increasing.map(iv)).toEqual(['[0, inf)']);
    expect(e.concaveUp.map(iv)).toEqual(['(-inf, inf)']);
    expect(e.symmetry).toBe('even');
    expect(e.period).toBeNull();
  });

  it('a cubic', () => {
    const e = ex('x^3 - 3x');
    expect(e.xIntercepts.map((n) => n.text)).toEqual(['-sqrt(3)', '0', 'sqrt(3)']);
    expect(pts(e.maxima)).toEqual(['(-1, 2)']);
    expect(pts(e.minima)).toEqual(['(1, -2)']);
    expect(pts(e.inflections)).toEqual(['(0, 0)']);
    expect(e.concaveDown.map(iv)).toEqual(['(-inf, 0]']);
    expect(e.symmetry).toBe('odd');
  });

  it('a rational function: a hole in the domain, two asymptotes', () => {
    const e = ex('1/(x - 1)');
    expect(e.excluded.map((n) => n.text)).toEqual(['1']);
    expect(e.vertical.map((n) => n.text)).toEqual(['1']);
    expect(e.horizontal.map((h) => [h.side, h.y.text])).toEqual([['both', '0']]);
    expect(e.decreasing.map(iv)).toEqual(['(-inf, 1)', '(1, inf)']);
    expect(e.xIntercepts).toEqual([]);
  });

  it('an oblique asymptote', () => {
    const e = ex('(x^2 + 1)/x');
    expect(e.oblique.map((o) => [o.side, o.m.text, o.b.text])).toEqual([['both', '1', '0']]);
    expect(pts(e.minima)).toEqual(['(1, 2)']);
    expect(pts(e.maxima)).toEqual(['(-1, -2)']);
  });

  it('square root and logarithm: where the domain starts', () => {
    const r = ex('sqrt(x)');
    expect(r.domain.map(iv)).toEqual(['[0, inf)']);
    expect(r.increasing.map(iv)).toEqual(['[0, inf)']);
    const l = ex('ln(x)');
    expect(l.domain.map(iv)).toEqual(['(0, inf)']);
    expect(l.xIntercepts.map((n) => n.text)).toEqual(['1']);
    expect(l.concaveDown.map(iv)).toEqual(['(0, inf)']);
  });

  it('sine: one period, exact multiples of π', () => {
    const e = ex('sin(x)');
    expect(e.period?.text).toBe('2pi');
    expect(e.xIntercepts.map((n) => n.text)).toEqual(['0', 'pi']);
    expect(pts(e.maxima)).toEqual(['(pi/2, 1)']);
    expect(pts(e.minima)).toEqual(['(3pi/2, -1)']);
    expect(e.symmetry).toBe('odd');
  });

  it('tangent: repeating asymptotes', () => {
    const e = ex('tan(x)');
    expect(e.period?.text).toBe('pi');
    expect(e.excludedEvery && [e.excludedEvery.start.text, e.excludedEvery.step.text]).toEqual(['pi/2', 'pi']);
  });

  it('e^x levels off on the left; a line is straight', () => {
    const e = ex('e^x');
    expect(e.horizontal.map((h) => [h.side, h.y.text])).toEqual([['left', '0']]);
    const line = ex('2x + 1');
    expect(line.straight).toBe(true);
    expect(line.xIntercepts.map((n) => n.text)).toEqual(['-1/2']);
  });
});
