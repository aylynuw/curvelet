import { describe, expect, it } from 'vitest';
import { Workspace, chiSqCdf, tCdf, tPdf, type Graphable, type Result } from '../src';

function sheet(lines: string[]): Workspace {
  const w = new Workspace();
  lines.forEach((src, k) => w.set(String(k + 1), src));
  return w;
}
const text = (r: Result | undefined) => (r?.status === 'value' ? r.text : r?.status === 'error' ? `error: ${r.message}` : r?.status);
const last = (lines: string[]) => text(sheet(lines).result(String(lines.length)));

/** Simpson's rule, as an independent check on the cumulative functions */
function simpson(f: (x: number) => number, a: number, b: number, n = 2000): number {
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let k = 1; k < n; k++) s += f(a + k * h) * (k % 2 ? 4 : 2);
  return (s * h) / 3;
}

describe('t and χ² distributions', () => {
  it('match the usual table values', () => {
    expect(tCdf(2.228138851986273, 10)).toBeCloseTo(0.975, 12);
    expect(chiSqCdf(3.841458820694124, 1)).toBeCloseTo(0.95, 12);
    expect(chiSqCdf(18.307038053275146, 10)).toBeCloseTo(0.95, 12);
    expect(last(['tcdf(-inf, 2.228138851986273, 10)'])).toBe('0.975');
    expect(last(['chisqcdf(0, 3.841458820694124, 1)'])).toBe('0.95');
  });

  it('agree with integrating their densities', () => {
    expect(tCdf(2, 5) - 0.5).toBeCloseTo(simpson((t) => tPdf(t, 5), 0, 2), 10);
    expect(tCdf(1.3, 2.5) - tCdf(-0.4, 2.5)).toBeCloseTo(simpson((t) => tPdf(t, 2.5), -0.4, 1.3), 10);
  });

  it('approach the normal distribution for many degrees of freedom', () => {
    expect(Number(last(['tcdf(-1, 1, 1000000)']))).toBeCloseTo(0.682689492137, 6);
  });

  it('check degrees of freedom', () => {
    expect(last(['tpdf(0, 0)'])).toContain('degrees of freedom greater than 0');
  });

  it('can be graphed, with a shaded probability', () => {
    const w = sheet(['y = tpdf(x, 3)', 'y < normalpdf(x) {-1 < x < 1, y > 0}']);
    const [t, shade] = w.graphables() as Extract<Graphable, { kind: 'curve' }>[];
    expect(t!.fn(0)).toBeCloseTo(tPdf(0, 3), 14);
    expect(shade).toMatchObject({ kind: 'curve', op: '<' });
    expect(shade!.mask!(0, 0.1, NaN)).toBe(true);
    expect(shade!.mask!(2, 0.1, NaN)).toBe(false);
  });
});

describe('sequences', () => {
  it.each([
    ['seq(n^2, n, 1, 5)', '[1, 4, 9, 16, 25]'],
    ['seq(k/2, k, 0, 1, 0.5)', '[0, 0.25, 0.5]'],
    ['seq(2^n, n, 3, 0, -1)', '[8, 4, 2, 1]'],
    ['sum(seq(1/n^2, n, 1, 1000))', '1.64393456668'],
  ])('%s = %s', (src, expected) => expect(last([src])).toBe(expected));

  it('keeps the sequence variable local', () => {
    expect(last(['let n = 100', 'seq(n, n, 1, 3)', 'n'])).toBe('100');
  });

  it('explains mistakes', () => {
    expect(last(['seq(n^2, 1, 5)'])).toContain('Write seq(expression, n, from, to)');
    expect(last(['seq(n, n, 1, 5, -1)'])).toContain('step must head');
  });

  it('iterates a function: x(n+1) = f(x(n))', () => {
    expect(last(['let f(x) = 2x', 'iterate(f, 0.2, 3)'])).toBe('[0.2, 0.4, 0.8, 1.6]');
    expect(last(['iterate(cos, 1, 2)'])).toBe('[1, 0.540302305868, 0.857553215846]');
    expect(last(['let q = 3', 'iterate(q, 1, 2)'])).toContain("q isn't one");
    expect(last(['let f(x) = x', 'iterate(f, 1, 1.5)'])).toContain('whole number');
  });
});

describe('cobweb diagrams and fields', () => {
  it('draws a cobweb, and its value is the iteration', () => {
    const w = sheet(['let f(x) = 3.2x(1 - x)', 'cobweb(f, 0.2, 4)']);
    expect(text(w.result('2'))).toMatch(/^\[0.2, 0.512, /);
    const g = w.graphables().find((k) => k.kind === 'cobweb') as Extract<Graphable, { kind: 'cobweb' }>;
    expect(g).toMatchObject({ x0: 0.2, steps: 4, label: 'y = f(x)' });
    expect(g.fn(0.5)).toBeCloseTo(0.8, 14);
  });

  it('reads slope and vector fields, with x and y free', () => {
    const w = sheet(['slopefield(x - y, (0, 1), (0, -2))', 'vectorfield(y, -x, (1, 0))']);
    expect(w.result('1')).toEqual({ status: 'curve', curve: 'field' });
    const [s, v] = w.graphables() as Extract<Graphable, { kind: 'field' }>[];
    expect(s!.slope!(3, 1)).toBe(2);
    expect(s!.seeds).toEqual([{ x: 0, y: 1 }, { x: 0, y: -2 }]);
    expect(v!.vector![0](2, 5)).toBe(5);
    expect(v!.vector![1](2, 5)).toBe(-2);
  });

  it('explains field mistakes', () => {
    expect(last(['vectorfield(y)'])).toContain('Write vectorfield(P, Q)');
    expect(sheet(['slopefield(x, 3)']).graphIssue('1')).toContain('give points');
  });
});
