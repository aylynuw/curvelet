import { describe, expect, it } from 'vitest';
import { Complex, Workspace, erf, type Graphable, type Result } from '../src';

function sheet(lines: string[]): Workspace {
  const w = new Workspace();
  lines.forEach((src, k) => w.set(String(k + 1), src));
  return w;
}
const text = (r: Result | undefined) => (r?.status === 'value' ? r.text : r?.status === 'error' ? `error: ${r.message}` : r?.status);
const last = (lines: string[]) => text(sheet(lines).result(String(lines.length)));

const D = 'let d = [2, 4, 4, 4, 5, 5, 7, 9]';

describe('descriptive statistics', () => {
  it.each([
    ['mean([1, 2, 3, 4])', '2.5'],
    ['median([3, 1, 2])', '2'],
    ['median([1, 2, 3, 4])', '2.5'],
    ['sum([1, 2, 3])', '6'],
    ['count([1, 2, 3])', '3'],
    ['pvar(d)', '4'],
    ['pstdev(d)', '2'],
    ['var(d)', '4.57142857143'],
    ['stdev(d)', '2.1380899353'],
    ['quantile([1, 2, 3, 4, 5], 0.25)', '2'],
    ['quantile([1, 2, 3, 4], 0.5)', '2.5'],
    ['corr([1, 2, 3], [2, 4, 6])', '1'],
    ['corr([1, 2, 3], [3, 2, 1])', '-1'],
  ])('%s = %s', (src, expected) => expect(last([D, src])).toBe(expected));

  it('explains bad input', () => {
    expect(last(['stdev([1])'])).toContain('at least 2');
    expect(last(['mean(3)'])).toContain('needs a list of numbers');
    expect(last(['corr([1, 2], [1, 2, 3])'])).toContain('same length');
    expect(last(['quantile([1, 2], 2)'])).toContain('probability between 0 and 1');
  });

  it('keeps the names free to define', () => {
    expect(last(['let mean = 3', 'mean + 1'])).toBe('4');
  });
});

describe('regression', () => {
  it.each([
    ['linreg([1, 2, 3, 4], [3, 5, 7, 9])', 'y = 2x + 1, R² = 1'],
    ['quadreg([0, 1, 2, 3], [1, 2, 5, 10])', 'y = x^2 + 1, R² = 1'],
    ['expreg([0, 1, 2], [3, 6, 12])', 'y = 3e^(0.693147x), R² = 1'],
    ['expreg([0, 1, 2], [1, e, e^2])', 'y = 1e^x, R² = 1'],
    ['powreg([1, 2, 4], [3, 12, 48])', 'y = 3x^2, R² = 1'],
    ['logreg([1, e, e^2], [1, 3, 5])', 'y = 1 + 2ln(x), R² = 1'],
    ['polyreg([0, 1, 2, 3, 4], [0, 1, 8, 27, 64], 3)', 'y = x^3, R² = 1'],
  ])('%s → %s', (src, expected) => expect(last([src])).toBe(expected));

  it('reports how well a noisy fit does', () => {
    expect(last(['linreg([1, 2, 3, 4, 5], [2.1, 3.9, 6.2, 7.8, 10.1])'])).toBe('y = 1.99x + 0.05, R² = 0.997305');
  });

  it('evaluates a fit like a function, and graphs it', () => {
    const w = sheet(['let f = linreg([1, 2, 3], [3, 5, 7])', 'f(10)', 'f([0, 1])', 'y = f(x) + 1']);
    expect(text(w.result('2'))).toBe('21');
    expect(text(w.result('3'))).toBe('[1, 3]');
    const [fit, shifted] = w.graphables() as Extract<Graphable, { kind: 'curve' }>[];
    expect(fit).toMatchObject({ kind: 'curve', label: 'y = f(x)' });
    expect(fit!.fn(4)).toBe(9);
    expect(shifted!.fn(4)).toBe(10);
  });

  it('refuses data a model cannot take', () => {
    expect(last(['expreg([1, 2], [1, -1])'])).toContain('every y above 0');
    expect(last(['linreg([1, 1], [2, 3])'])).toContain('Not enough different x values');
    expect(last(['polyreg([1, 2, 3], [1, 2, 3], 7)'])).toContain('up to degree 6');
  });

  it('draws points(xs, ys) as a scatter plot', () => {
    const w = sheet(['points([1, 2], [3, 4])']);
    expect(text(w.result('1'))).toBe('2 points');
    expect(w.graphables()[0]).toMatchObject({ kind: 'scatter', pts: [{ x: 1, y: 3 }, { x: 2, y: 4 }] });
  });
});

describe('distributions', () => {
  it.each([
    ['normalpdf(0)', '0.398942280401'],
    ['normalcdf(-1, 1)', '0.682689492137'],
    ['normalcdf(-1.96, 1.96)', '0.950004209704'],
    ['normalcdf(-inf, 0)', '0.5'],
    ['normalcdf(85, 115, 100, 15)', '0.682689492137'],
    ['invnorm(0.975)', '1.95996398454'],
    ['invnorm(0.5, 100, 15)', '100'],
    ['binompdf(10, 0.5, 3)', '0.1171875'],
    ['binomcdf(10, 0.5, 3)', '0.171875'],
    ['binomcdf(10, 0.5, 10)', '1'],
    ['poissonpdf(2, 0)', '0.135335283237'],
    ['poissoncdf(2, 1)', '0.40600584971'],
  ])('%s = %s', (src, expected) => expect(last([src])).toBe(expected));

  it('computes erf to double precision', () => {
    expect(erf(0.5)).toBeCloseTo(0.5204998778130465, 14);
    expect(erf(2.9)).toBeCloseTo(0.9999589021219005, 14);
    // either side of the switch from series to continued fraction (references: Python's math.erf)
    expect(erf(1.99)).toBeCloseTo(0.995111413199617, 14);
    expect(erf(2.01)).toBeCloseTo(0.9955248493552482, 14);
    expect(erf(3.5)).toBeCloseTo(0.999999256901628, 14);
    expect(erf(-1)).toBeCloseTo(-0.8427007929497149, 14);
    expect(erf(Infinity)).toBe(1);
  });

  it('checks parameters', () => {
    expect(last(['binompdf(10, 1.5, 3)'])).toContain('probability between 0 and 1');
    expect(last(['normalpdf(0, 0, 0)'])).toContain('standard deviation greater than 0');
  });
});

describe('surfaces and complex functions', () => {
  it('reads z = f(x, y) and two-variable functions as surfaces', () => {
    const w = sheet(['z = x^2 - y^2', 'let h(u, v) = u v']);
    expect(w.result('1')).toEqual({ status: 'curve', curve: 'surface' });
    const [a, b] = w.graphables() as Extract<Graphable, { kind: 'surface' }>[];
    expect(a!.fn(2, 1)).toBe(3);
    expect(b).toMatchObject({ kind: 'surface', label: 'z = h(x, y)' });
    expect(b!.fn(2, 3)).toBe(6);
  });

  it('reads a function of z as a complex function', () => {
    const w = sheet(['let g(z) = (z^2 - 1)/(z^2 + 1)', 'let k = 2', 'let q(z) = k z + i']);
    const [g, q] = w.graphables() as Extract<Graphable, { kind: 'complex' }>[];
    expect(g).toMatchObject({ kind: 'complex', label: 'g(z)' });
    const at = (f: (z: Complex) => Complex, re: number, im: number) => {
      const r = f(new Complex(re, im));
      return [Math.round(r.re * 1e12) / 1e12, Math.round(r.im * 1e12) / 1e12];
    };
    // g(1) = 0, g(i) is a pole
    expect(at(g!.fn, 1, 0)).toEqual([0, 0]);
    expect(at(q!.fn, 1, 1)).toEqual([2, 3]);
  });
});
