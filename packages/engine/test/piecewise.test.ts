import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, EMPTY_ENV, Workspace, compileReal, evaluate, parse, parseExpression } from '../src';

/** f defined with the given cases, evaluated at x */
const at = (cases: string, x: number) => {
  const w = new Workspace();
  w.set('f', `f(x) = ${cases}`);
  w.set('v', `f(${x})`);
  const r = w.result('v');
  return r?.status === 'value' ? r.text : r?.status === 'error' ? `error: ${r.message}` : r?.status;
};

describe('piecewise functions', () => {
  const forms = [
    '{x < 0: -x, x^2}',
    '{x < 0: -x, x >= 0: x^2}',
    '{x < 0: -x; x >= 0: x^2}',
    '-x if x < 0, x^2 otherwise',
    '-x if x < 0, x^2 if x >= 0',
    '-x if x < 0; else x^2',
    '{-x (x < 0), x^2 (x >= 0)}',
    '-x (x < 0), x^2 (x >= 0)',
    'piecewise(x < 0, -x, x^2)',
    'if(x < 0, -x, x^2)',
  ];
  for (const f of forms) {
    it(`reads ${f}`, () => {
      expect(at(f, -3)).toBe('3');
      expect(at(f, 2)).toBe('4');
    });
  }
  it('takes chains and joined conditions', () => {
    expect(at('{-1 < x <= 1: 1, 0}', 1)).toBe('1');
    expect(at('{-1 < x <= 1: 1, 0}', -1)).toBe('0');
    expect(at('{x < -1 or x > 1: 2, 0}', 3)).toBe('2');
    expect(at('{x > 0 and x < 2: 5, 0}', 1)).toBe('5');
  });
  it('says so when no case covers the value', () => {
    expect(at('{x < 0: -x}', 2)).toMatch(/^error/);
  });
  it('still reads a domain restriction and brackets that multiply', () => {
    expect(parse('y = x^2 {x > 0}').kind).toBe('relation');
    const v = evaluate(parseExpression('3(2 + 1)'), EMPTY_ENV, DEFAULT_SETTINGS);
    expect(v.kind === 'num' && v.z.re).toBe(9);
  });
  it('graphs, with a gap where no case applies', () => {
    const f = compileReal(parseExpression('{x < 0: -x, 0 < x < 2: x^2}'), { vars: ['x'], value: () => undefined, func: () => undefined, angle: 'rad' });
    expect(f([-3])).toBe(3);
    expect(f([1])).toBe(1);
    expect(f([5])).toBeNaN();
    const w = new Workspace();
    w.set('g', 'y = {x < 0: -x, x^2}');
    expect(w.graphables().length).toBe(1);
  });
});

describe('the ends of cases on a graph', () => {
  const edges = (src: string, lo = -5, hi = 5) => {
    const w = new Workspace();
    w.set('g', src);
    const g = w.graphables().find((x) => x.id === 'g');
    if (g?.kind !== 'curve' || !g.edges) throw new Error('no edges');
    return g.edges(lo, hi);
  };
  it('a jump: ● on the side that holds the boundary, ○ on the other, and a break', () => {
    const e = edges('y = {x < 1: x, 3}');
    expect(e.cuts).toEqual([1]);
    expect(e.dots).toEqual(expect.arrayContaining([{ t: 1, v: 3, open: false }]));
    const open = e.dots.find((d) => d.open)!;
    expect(open.t).toBe(1);
    expect(open.v).toBeCloseTo(1, 5);
  });
  it('a point lifted off the curve: a hole and the point', () => {
    const e = edges('y = {x = 2: 5, x^2}');
    expect(e.dots.find((d) => !d.open)).toMatchObject({ t: 2, v: 5 });
    expect(e.dots.find((d) => d.open)!.v).toBeCloseTo(4, 5);
  });
  it('a continuous join has nothing to mark', () => {
    expect(edges('y = {x < 0: -x, x^2}')).toEqual({ cuts: [], dots: [] });
  });
  it('the end of a case with nothing past it: ○ when left out, ● when included', () => {
    expect(edges('y = {x < 2: x}').dots).toEqual([{ t: 2, v: expect.closeTo(2, 5), open: true }]);
    expect(edges('y = {x <= 2: x}').dots).toEqual([{ t: 2, v: 2, open: false }]);
  });
  it('boundaries from any condition, and through a defined function', () => {
    expect(edges('y = {x^2 < 4: 1, 0}').cuts).toEqual([-2, 2]);
    const w = new Workspace();
    w.set('f', 'f(x) = {x < 0: -1, 1}');
    const g = w.graphables().find((x) => x.id === 'f');
    expect(g?.kind === 'curve' && g.edges?.(-3, 3).cuts).toEqual([0]);
  });
});
