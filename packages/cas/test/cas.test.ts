import { Workspace, type EvalSettings, type Result } from '@math/engine';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { CasResolver } from '../src';
import { createNodeRuntime } from '../src/node';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'pyodide-dist');
let resolver: CasResolver;

beforeAll(async () => {
  resolver = new CasResolver(await createNodeRuntime(DIST));
}, 120_000);

/** Run lines in a fresh workspace until no line is waiting for SymPy. */
async function sheet(lines: string[], settings: Partial<EvalSettings> = {}): Promise<Workspace> {
  const w = new Workspace(settings, resolver);
  lines.forEach((src, k) => w.set(String(k + 1), src));
  for (let round = 0; round < 10; round++) {
    await resolver.idle();
    w.refresh();
    if (!lines.some((_, k) => w.result(String(k + 1))?.status === 'pending')) return w;
  }
  throw new Error('still pending after 10 rounds');
}
async function one(src: string, settings: Partial<EvalSettings> = {}): Promise<Result | undefined> {
  return (await sheet([src], settings)).result('1');
}
const text = (r: Result | undefined) =>
  r?.status === 'value' || r?.status === 'symbolic' || r?.status === 'solved' ? r.text : r?.status === 'error' ? `error: ${r.message}` : r?.status;

describe('derivatives', () => {
  it.each([
    ['diff(x^3 - 6x^2 + 11x - 6, x)', '3x^2 - 12x + 11'],
    ['diff(x^3 - 6x^2 + 11x - 6)', '3x^2 - 12x + 11'],
    ['diff(sin(x)^2, x)', '2sin(x)*cos(x)'],
    ['diff(e^(2x), x)', '2e^(2x)'],
    ['diff(e^x, x)', 'e^x'],
    ['diff(ln(x), x)', '1/x'],
    ['diff(x^4, x, 2)', '12x^2'],
    ['diff(x^2 y^3, y)', '3x^2*y^2'],
  ])('%s = %s', async (src, expected) => expect(text(await one(src))).toBe(expected));

  it("works with f', f'' and functions defined from derivatives", async () => {
    const w = await sheet(['let f(x) = x^3 - 6x^2 + 11x - 6', "f'(x)", "f''(x)", "f'(2)", 'let g(x) = diff(f(x), x)', 'g(1)']);
    expect(text(w.result('2'))).toBe('3x^2 - 12x + 11');
    expect(text(w.result('3'))).toBe('6(x - 2)');
    expect(text(w.result('4'))).toBe('-1');
    expect(w.result('5')).toMatchObject({ status: 'function', formula: '3x^2 - 12x + 11' });
    expect(text(w.result('6'))).toBe('2');
  });

  it('needs a variable when there are several', async () => {
    expect(text(await one('diff(x y)'))).toContain('needs to know the variable');
  });
});

describe('integrals', () => {
  it('indefinite integrals are marked for + C', async () => {
    expect(await one('integrate(x^2, x)')).toEqual({ status: 'symbolic', text: 'x^3/3', op: 'integrate', constant: true });
    expect(text(await one('integrate(cos(x), x)'))).toBe('sin(x)');
    expect(text(await one('integrate(1/x, x)'))).toBe('ln(x)');
  });

  it('definite integrals give exact values with decimals', async () => {
    expect(await one('integrate(x^2, x, 0, 1)')).toMatchObject({ status: 'value', text: '0.333333333333', exact: '1/3' });
    expect(await one('integrate(sin(x), x, 0, pi)')).toMatchObject({ status: 'value', text: '2' });
    expect(await one('integrate(1/(1 + x^2), x, 0, 1)')).toMatchObject({ status: 'value', text: '0.785398163397', exact: 'pi/4' });
  });

  it('uses a decimal from SymPy when the exact answer has functions like erf', async () => {
    expect(await one('integrate(e^(-x^2), x, 0, 1)')).toMatchObject({ status: 'value', text: '0.746824132812', exact: 'sqrt(pi)*erf(1)/2' });
  });

  it('reports integrals without a closed form', async () => {
    expect(text(await one('integrate(x^x, x)'))).toBe('error: No closed form found for this integral');
  });
});

describe('algebra', () => {
  it.each([
    ['factor(x^2 - 1)', '(x - 1)(x + 1)'],
    ['factor(x^3 - 6x^2 + 11x - 6)', '(x - 3)(x - 2)(x - 1)'],
    ['expand((x + 1)^3)', 'x^3 + 3x^2 + 3x + 1'],
    ['expand((a - b)(a + b))', 'a^2 - b^2'],
    ['factor(x^2 + 1)', 'x^2 + 1'],
  ])('%s = %s', async (src, expected) => expect(text(await one(src))).toBe(expected));

  it('factors over the complex numbers in complex mode', async () => {
    expect(text(await one('factor(x^2 + 1)', { complex: true }))).toBe('(x - i)(x + i)');
  });

  it('factors whole numbers into primes', async () => {
    expect(await one('factor(360)')).toMatchObject({ status: 'value', text: '360', exact: '2^3*3^2*5' });
  });

  it('simplifies', async () => {
    expect(text(await one('simplify(sin(x)^2 + cos(x)^2)'))).toBe('1');
    expect(text(await one('simplify((x^2 - 1)/(x - 1))'))).toBe('x + 1');
  });

  it('keeps defined values exact', async () => {
    const w = await sheet(['let a = 1/3', 'simplify(a + 1/6)', 'let p = expand((x + 1)^2)', 'factor(p)']);
    expect(w.result('2')).toMatchObject({ status: 'value', text: '0.5', exact: '1/2' });
    expect(text(w.result('4'))).toBe('(x + 1)^2');
  });

  it('splits into partial fractions', async () => {
    expect(text(await one('apart(1/(x^2 - 1))'))).toBe('-1/(2(x + 1)) + 1/(2(x - 1))');
  });
});

describe('equations', () => {
  it('solves an equation line with one unknown', async () => {
    expect(await one('x^2 - 5x + 6 = 0')).toEqual({ status: 'solved', text: 'x = 2, x = 3' });
    expect(text(await one('2x + 1 = 7'))).toBe('x = 3');
  });

  it('respects real and complex mode', async () => {
    expect(await one('x^2 = -1')).toEqual({ status: 'solved', text: '', special: 'none' });
    expect(await one('x^2 + 1 > 0')).toEqual({ status: 'solved', text: '', special: 'all' });
    expect(text(await one('x^2 = -1', { complex: true }))).toBe('x = -i, x = i');
  });

  it('describes periodic solutions', async () => {
    expect(await one('sin(x) = 0')).toEqual({ status: 'solved', text: 'x = 2pi*n, x = 2pi*n + pi', periodic: true });
  });

  it('answers in degrees in degree mode', async () => {
    expect(text(await one('solve(sin(x) = 1/2, x)', { angle: 'deg' }))).toBe('x = 360n + 30, x = 360n + 150');
  });

  it('solves inequalities', async () => {
    expect(text(await one('x^2 > 4'))).toBe('x < -2 or x > 2');
    expect(text(await one('solve(x^2 - 1 <= 0)'))).toBe('-1 ≤ x ≤ 1');
  });

  it('falls back to numeric roots', async () => {
    expect(await one('cos(x) = x')).toEqual({ status: 'solved', text: 'x ≈ 0.739085133215', numeric: true });
  });

  it('solves systems', async () => {
    expect(text(await one('solve(x + y = 3, x - y = 1)'))).toBe('x = 2, y = 1');
  });

  it('gives solutions as a list for further use', async () => {
    const w = await sheet(['let s = solve(x^2 = 9, x)', 'sum = s^2']);
    expect(text(w.result('1'))).toBe('[-3, 3]');
  });
});

describe('limits, series, eigenvalues', () => {
  it.each([
    ['limit(sin(x)/x, x, 0)', '1'],
    ['limit((1 + 1/n)^n, n, inf)', '2.71828182846'],
    ['limit((x^2 - 1)/(x - 1), x, 1)', '2'],
    ['taylor(sin(x), x, 0, 5)', 'x^5/120 - x^3/6 + x'],
    ['eigenvals([[2, 1], [1, 2]])', '[1, 3]'],
  ])('%s = %s', async (src, expected) => expect(text(await one(src))).toBe(expected));

  it('reports limits that do not exist', async () => {
    expect(text(await one('limit(1/x, x, 0)'))).toContain('does not exist');
  });

  it('refuses complex eigenvalues in real mode', async () => {
    expect(text(await one('eigenvals([[0, -1], [1, 0]])'))).toContain('complex mode');
    expect(text(await one('eigenvals([[0, -1], [1, 0]])', { complex: true }))).toBe('[-i, i]');
  });
});
