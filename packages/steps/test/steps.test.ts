import { compileReal, parseExpression, printNode, type Node } from '@math/engine';
import { describe, expect, it } from 'vitest';
import { diffSteps, flattenDiff, NoSteps, solveSteps } from '../src';

const ctx = { vars: ['x'], value: () => undefined, func: () => undefined, angle: 'rad' as const };
const f = (n: Node) => compileReal(n, ctx);
const P = (s: string) => parseExpression(s);

describe('derivative steps', () => {
  const cases = [
    'x^3', '5', '3x^2 - 2x + 7', 'x^3 sin(x)', 'sin(x^2)', 'e^(2x)', '2^x', 'ln(3x + 1)', '(x + 1)/(x - 1)',
    'sqrt(x^2 + 1)', 'cos(x)^2', 'tan(x)', 'x^x', 'arctan(2x)', '1/x', '-x^2', 'x e^x', 'log(x)', 'sec(x)', '(2x + 1)^5',
    'sin(cos(x))', 'e^x sin(x)', 'cbrt(x)', 'x/3',
  ];
  for (const src of cases) {
    it(`d/dx ${src} matches the slope`, () => {
      const step = diffSteps(P(src), 'x');
      const g = f(P(src));
      const dg = f(step.result);
      for (const x of [0.37, 1.3, 2.1]) {
        const h = 1e-5;
        const slope = (g([x + h]) - g([x - h])) / (2 * h);
        expect(dg([x])).toBeCloseTo(slope, 4);
      }
    });
  }

  it('names the rules a student expects', () => {
    const s = diffSteps(P('x^3 sin(x)'), 'x');
    expect(s.rule).toBe('product');
    expect(s.sub.map((k) => k.rule)).toEqual(['power', 'function']);
    const chain = diffSteps(P('sin(x^2)'), 'x');
    expect([chain.rule, chain.fn, printNode(chain.inner!)]).toEqual(['function', 'sin', 'x^2']);
    expect(printNode(chain.result)).toBe('2x*cos(x^2)');
    expect(printNode(diffSteps(P('3x^2 - 2x + 7'), 'x').result)).toBe('6x - 2');
    expect(printNode(diffSteps(P('x ln(x)'), 'x').result)).toBe('ln(x) + 1');
  });

  it('lists the steps in reading order, without d/dx x = 1', () => {
    const rows = flattenDiff(diffSteps(P('3x^2 - 2x + 7'), 'x'));
    expect(rows.map((r) => [r.step.rule, r.depth])).toEqual([
      ['sum', 0], ['sum', 1], ['constantMultiple', 2], ['power', 3], ['constantMultiple', 2], ['constant', 1],
    ]);
  });

  it('says when it has no rule', () => {
    expect(() => diffSteps(P('abs(x)'), 'x')).toThrow(NoSteps);
  });
});

describe('equation steps', () => {
  const check = (src: string, expected: number[], complex = false) => {
    const [l, r] = src.split('=').map((s) => P(s.trim()));
    const out = solveSteps(l!, r!, 'x', complex);
    expect(out.solutions).not.toBeNull();
    const vals = out.solutions!.map((s) => f(s)([0])).sort((a, b) => a - b);
    expect(vals.length).toBe(expected.length);
    vals.forEach((v, k) => expect(v).toBeCloseTo(expected[k]!, 10));
    // and each one really solves it
    const lhs = f(l!);
    const rhs = f(r!);
    for (const v of vals) expect(lhs([v]) - rhs([v])).toBeCloseTo(0, 8);
    return out.steps.map((s) => s.rule);
  };

  it('linear: collect, divide', () => {
    expect(check('3x + 5 = x - 7', [-6])).toEqual(['given', 'isolate', 'divide', 'solutions']);
    expect(check('2x = 8', [4])).toEqual(['given', 'divide', 'solutions']);
    expect(check('x/4 + 1 = 0.5', [-2])).toContain('divide');
  });

  it('quadratic: factoring, square roots, the formula', () => {
    expect(check('x^2 - 5x + 6 = 0', [2, 3])).toEqual(['given', 'factor', 'zeroProduct', 'solutions']);
    expect(check('2x^2 = 3x + 2', [-0.5, 2])).toEqual(['given', 'collect', 'factor', 'zeroProduct', 'solutions']);
    expect(check('x^2 - 2x - 1 = 0', [1 - Math.SQRT2, 1 + Math.SQRT2])).toEqual(['given', 'formula', 'discriminant', 'formulaValues', 'solutions']);
    expect(check('x^2 = 9', [-3, 3])).toContain('squareRoot');
    expect(check('x^2 - 4x + 4 = 0', [2])).toContain('factor');
    expect(check('x^2 + 3x = 0', [-3, 0])).toContain('factorOut');
  });

  it('factors the way a textbook does', () => {
    const show = (src: string) => {
      const [l, r] = src.split('=').map((t) => P(t.trim()));
      return solveSteps(l!, r!, 'x').steps.filter((s) => s.rule === 'factor' || s.rule === 'zeroProduct' || s.rule === 'rationalRoot').map((s) => s.eqs.map((e) => printNode(e)).join(' | '));
    };
    expect(show('2x^2 = 3x + 2')).toEqual(['(2x + 1)(x - 2) = 0', '2x + 1 = 0 | x - 2 = 0']);
    expect(show('x^2 + 5x + 6 = 0')).toEqual(['(x + 3)(x + 2) = 0', 'x + 3 = 0 | x + 2 = 0']);
    expect(show('4x^2 - 4x + 1 = 0')).toEqual(['(2x - 1)^2 = 0']);
    expect(show('x^3 - 6x^2 + 11x - 6 = 0')[0]).toBe('(x - 1)(x^2 - 5x + 6) = 0');
  });

  it('no real solutions', () => {
    const [l, r] = [P('x^2 + x + 1'), P('0')];
    const out = solveSteps(l, r, 'x');
    expect(out.solutions).toEqual([]);
    expect(out.steps.map((s) => s.rule)).toContain('noReal');
  });

  it('higher degrees: a two-term power and rational roots', () => {
    expect(check('x^3 = 8', [2])).toContain('nthRoot');
    expect(check('x^4 - 16 = 0', [-2, 2])).toContain('nthRoot');
    expect(check('x^3 - 6x^2 + 11x - 6 = 0', [1, 2, 3])).toContain('rationalRoot');
    expect(check('2x^3 - 3x^2 - 3x + 2 = 0', [-1, 0.5, 2])).toContain('rationalRoot');
  });

  it('stops where no method fits', () => {
    const out = solveSteps(P('sin(x)'), P('1/2'), 'x');
    expect(out.solutions).toBeNull();
    expect(out.steps.at(-1)!.rule).toBe('unsolved');
  });

  it('0 = 0 and 1 = 0', () => {
    expect(solveSteps(P('x + 1'), P('1 + x'), 'x').all).toBe(true);
    expect(solveSteps(P('x + 1'), P('x + 2'), 'x').solutions).toEqual([]);
  });
});
