import { describe, expect, it } from 'vitest';
import {
  Workspace,
  parseExpression,
  printNode,
  type Result,
  type SymbolicAnswer,
  type SymbolicResolver,
} from '../src';

/**
 * A stand-in for SymPy: answers from a table keyed by `op(args)` as printed,
 * records what it was asked, and can hold answers back to test the pending state.
 */
class FakeResolver implements SymbolicResolver {
  asked: string[] = [];
  holding = false;
  constructor(private table: Record<string, SymbolicAnswer>) {}
  resolve(op: string, args: Parameters<SymbolicResolver['resolve']>[1]): SymbolicAnswer | undefined {
    const key = `${op}(${args.map(printNode).join(', ')})`;
    this.asked.push(key);
    if (this.holding) return undefined;
    return this.table[key] ?? { ok: false, error: `fake resolver has no answer for ${key}` };
  }
}

const F = 'x^3 - 6x^2 + 11x - 6';
const ok = (expr: string, extra: Partial<Extract<SymbolicAnswer, { ok: true }>> = {}): SymbolicAnswer => ({ ok: true, expr, ...extra });

function setup(table: Record<string, SymbolicAnswer>, ...lines: string[]) {
  const resolver = new FakeResolver(table);
  const w = new Workspace({}, resolver);
  lines.forEach((src, k) => w.set(String(k + 1), src));
  return { w, resolver };
}
const show = (r: Result | undefined) =>
  r?.status === 'value' ? r.text : r?.status === 'symbolic' || r?.status === 'solved' ? r.text : r?.status === 'error' ? `error: ${r.message}` : r?.status;

describe('printNode', () => {
  it.each([
    ['3x^2 - 12x + 11', '3x^2 - 12x + 11'],
    ['(x - 1)(x + 1)', '(x - 1)(x + 1)'],
    ['x^(1/3)', 'x^(1/3)'],
    ['-x^2', '-x^2'],
    ['(-1)^n', '(-1)^n'],
    ['a - (b - c)', 'a - (b - c)'],
    ['a/(b c)', 'a/(b*c)'],
    ['2sin(x)', '2sin(x)'],
    ['2(x + 1)', '2(x + 1)'],
    ['-(a + b)', '-(a + b)'],
    ['x^2/2', 'x^2/2'],
    ['[1, 2]', '[1, 2]'],
    ['solve(x^2 = 4, x)', 'solve(x^2 = 4, x)'],
  ])('%s prints as %s and reads back the same', (src, printed) => {
    const node = parseExpression(src);
    expect(printNode(node)).toBe(printed);
    expect(parseExpression(printed)).toEqual(node);
  });
});

describe('symbolic functions in the workspace', () => {
  it('shows a formula and keeps free symbols as symbols', () => {
    const { w, resolver } = setup({ 'diff(x^2, x)': ok('2x') }, 'diff(x^2, x)');
    expect(w.result('1')).toEqual({ status: 'symbolic', text: '2x', op: 'diff' });
    expect(resolver.asked).toEqual(['diff(x^2, x)']);
  });

  it('puts definitions in exactly, so 1/3 stays 1/3', () => {
    const { w, resolver } = setup({ 'simplify(1/3 + 1/6)': ok('1/2') }, 'let a = 1/3', 'simplify(a + 1/6)');
    expect(resolver.asked).toContain('simplify(1/3 + 1/6)');
    expect(w.result('2')).toMatchObject({ status: 'value', text: '0.5', exact: '1/2' });
  });

  it("differentiates a defined function with f'", () => {
    const { w } = setup({ [`diff(${F}, x, 1)`]: ok('3x^2 - 12x + 11') }, `let f(x) = ${F}`, "f'(x)", "f'(2)", "f'(t + 1)");
    expect(show(w.result('2'))).toBe('3x^2 - 12x + 11');
    expect(show(w.result('3'))).toBe('-1');
    expect(show(w.result('4'))).toBe('3(t + 1)^2 - 12(t + 1) + 11');
  });

  it('defines a function from a derivative and evaluates it numerically', () => {
    const { w } = setup({ [`diff(${F}, x)`]: ok('3x^2 - 12x + 11') }, `let f(x) = ${F}`, 'let g(x) = diff(f(x), x)', 'g(2)');
    expect(w.result('2')).toEqual({ status: 'function', name: 'g', params: ['x'], formula: '3x^2 - 12x + 11' });
    expect(show(w.result('3'))).toBe('-1');
  });

  it('keeps formulas as symbolic values that other symbolic functions can use', () => {
    const { w, resolver } = setup(
      { 'expand((x + 1)^2)': ok('x^2 + 2x + 1'), 'factor(x^2 + 2x + 1)': ok('(x + 1)^2') },
      'let p = expand((x + 1)^2)',
      'factor(p)',
      'p + 1',
    );
    expect(w.result('1')).toEqual({ status: 'symbolic', text: 'x^2 + 2x + 1', op: 'expand' });
    expect(resolver.asked).toContain('factor(x^2 + 2x + 1)');
    expect(w.result('2')).toEqual({ status: 'symbolic', text: '(x + 1)^2', op: 'factor' });
    expect(show(w.result('3'))).toBe('error: p is a formula in x, not a number');
  });

  it('marks indefinite integrals for "+ C"', () => {
    const { w } = setup({ 'integrate(x^2, x)': ok('x^3/3', { constant: true }) }, 'integrate(x^2, x)');
    expect(w.result('1')).toEqual({ status: 'symbolic', text: 'x^3/3', op: 'integrate', constant: true });
  });

  it('flags numerically found answers', () => {
    const { w } = setup({ 'integrate(e^(-x^2), x, 0, 1)': ok('0.746824132812427', { numeric: true }) }, 'integrate(e^(-x^2), x, 0, 1)');
    expect(w.result('1')).toMatchObject({ status: 'value', text: '0.746824132812', numeric: true });
  });

  it('solves an equation line with one unknown', () => {
    const { w, resolver } = setup(
      { 'solve(x^2 - 5x + 6 = 0)': ok('[2, 3]', { display: 'x = 2, x = 3' }) },
      'x^2 - 5x + 6 = 0',
      'y = x^2',
    );
    expect(resolver.asked).toContain('solve(x^2 - 5x + 6 = 0)');
    expect(w.result('1')).toEqual({ status: 'solved', text: 'x = 2, x = 3' });
    expect(w.result('2')).toEqual({ status: 'equation', unknowns: ['x', 'y'], graphable: true });
  });

  it('uses solutions as a list in calculations', () => {
    const { w } = setup({ 'solve(x^2 = 4, x)': ok('[-2, 2]', { display: 'x = -2, x = 2' }) }, 'let s = solve(x^2 = 4, x)', 's^2', 'solve(x^2 = 4, x)');
    expect(show(w.result('1'))).toBe('[-2, 2]');
    expect(show(w.result('2'))).toBe('[4, 4]');
    expect(w.result('3')).toEqual({ status: 'solved', text: 'x = -2, x = 2' });
  });

  it('refuses a display-only answer inside a calculation', () => {
    const { w } = setup({ 'solve(x^2 > 4)': { ok: true, display: 'x < -2 or x > 2' } }, 'solve(x^2 > 4)', '1 + solve(x^2 > 4)');
    expect(w.result('1')).toEqual({ status: 'solved', text: 'x < -2 or x > 2' });
    expect(show(w.result('2'))).toContain("can be shown on its own line, but not used inside a calculation");
  });

  it('shows errors from the symbolic engine', () => {
    const { w } = setup({ 'integrate(x^x, x)': { ok: false, error: 'No closed form found for this integral' } }, 'integrate(x^x, x)');
    expect(show(w.result('1'))).toBe('error: No closed form found for this integral');
  });

  it('is pending until the answer arrives, then updates', () => {
    const { w, resolver } = setup({ 'factor(x^2 - 1)': ok('(x - 1)(x + 1)') });
    resolver.holding = true;
    w.set('1', 'factor(x^2 - 1)');
    w.set('2', 'let k = diff(x^2, x)');
    expect(w.result('1')).toEqual({ status: 'pending' });
    resolver.holding = false;
    const changed = w.refresh();
    expect(changed).toContain('1');
    expect(show(w.result('1'))).toBe('(x - 1)(x + 1)');
  });

  it('still reports undefined names outside symbolic functions', () => {
    const { w } = setup({ 'diff(x^2, x)': ok('2x') }, 'diff(x^2, x) + q');
    expect(w.result('1')).toEqual({ status: 'symbolic', text: '2x + q' });
    const { w: w2 } = setup({}, 'm x + c');
    expect(w2.result('1')).toMatchObject({ status: 'error', undefinedNames: ['c', 'm', 'x'] });
  });

  it("explains f' on something that isn't a function", () => {
    const { w } = setup({}, 'let a = 2', "a'(3)");
    expect(show(w.result('2'))).toContain("needs a function defined with let a(x)");
  });

  it('refuses to redefine symbolic function names', () => {
    const { w } = setup({}, 'let diff = 3');
    expect(show(w.result('1'))).toBe("error: diff is a built-in name and can't be redefined");
  });
});
