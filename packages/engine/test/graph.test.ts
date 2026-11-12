import { describe, expect, it } from 'vitest';
import { Workspace, compileReal, parseExpression, realPow, type CompileContext, type Graphable } from '../src';

const ctx = (vars: string[], values: Record<string, number> = {}, angle: 'rad' | 'deg' = 'rad'): CompileContext => ({
  vars,
  angle,
  value: (n) => values[n],
  func: () => undefined,
});
const fn = (src: string, vars = ['x'], values: Record<string, number> = {}) => compileReal(parseExpression(src), ctx(vars, values));

describe('compileReal', () => {
  it.each([
    ['x^2 + 1', 3, 10],
    ['2x', 4, 8],
    ['sin(pi/2)', 0, 1],
    ['sqrt(x)', -1, NaN],
    ['(x)^(1/3)', -8, -2],
    ['|x - 5|', 2, 3],
    ['ln(e^x)', 2.5, 2.5],
    ['log_2(x)', 8, 3],
    ['max(x, 3)', 1, 3],
    ['x!', 4, 24],
  ])('%s at %d = %d', (src, x, expected) => {
    const r = fn(src)([x]);
    if (Number.isNaN(expected)) expect(r).toBeNaN();
    else expect(r).toBeCloseTo(expected, 12);
  });

  it('uses defined values and two variables', () => {
    expect(fn('a x + y', ['x', 'y'], { a: 2 })([3, 1])).toBe(7);
    expect(fn('xy', ['x', 'y'])([3, 4])).toBe(12);
  });

  it('follows the angle setting', () => {
    expect(compileReal(parseExpression('sin(x)'), ctx(['x'], {}, 'deg'))([90])).toBeCloseTo(1, 12);
  });

  it('refuses what is not a real formula', () => {
    expect(() => fn('k x')).toThrow('k is not defined');
    expect(() => fn('x + i')).toThrow('Complex');
    expect(() => fn('det(x)')).toThrow("can't be graphed");
  });

  it('realPow keeps odd roots real', () => {
    expect(realPow(-27, 1 / 3)).toBeCloseTo(-3, 12);
    expect(realPow(-8, 2 / 3)).toBeCloseTo(4, 12);
    expect(realPow(-2, 0.5)).toBeNaN();
  });
});

type Curve = Extract<Graphable, { kind: 'curve' }>;
type Implicit = Extract<Graphable, { kind: 'implicit' }>;

function graphs(...lines: string[]): Graphable[] {
  const w = new Workspace();
  lines.forEach((src, k) => w.set(String(k + 1), src));
  return w.graphables();
}

describe('graphables', () => {
  it('graphs y = f(x), x = g(y) and defined functions as curves', () => {
    const [a, b, c] = graphs('y = x^2', 'x = y^2 - 1', 'let f(x) = 2x + 1');
    expect(a).toMatchObject({ kind: 'curve', dir: 'y', op: '=', label: 'y = x^2' });
    expect((a as Curve).fn(3)).toBe(9);
    expect(b).toMatchObject({ kind: 'curve', dir: 'x', op: '=' });
    expect((b as Curve).fn(2)).toBe(3);
    expect(c).toMatchObject({ kind: 'curve', dir: 'y', label: 'y = f(x)' });
    expect((c as Curve).fn(1)).toBe(3);
  });

  it('turns f(x) > y around so the curve keeps y on the left', () => {
    const [g] = graphs('x^2 > y');
    expect(g).toMatchObject({ kind: 'curve', dir: 'y', op: '<' });
  });

  it('graphs other equations implicitly', () => {
    const [g] = graphs('x^2 + y^2 = 9');
    expect(g).toMatchObject({ kind: 'implicit', op: '=' });
    expect((g as Implicit).fn(3, 0)).toBe(0);
  });

  it('uses defined values, and updates when they change', () => {
    const w = new Workspace();
    w.set('1', 'let a = 2');
    w.set('2', 'y = a x');
    const curve = () => w.graphables().find((g) => g.id === '2')!;
    expect((curve() as Curve).fn(3)).toBe(6);
    w.setValue('a', 5);
    expect((curve() as Curve).fn(3)).toBe(15);
  });

  it('draws points, labelled by their name', () => {
    const gs = graphs('let P = (2, 3)', '(1, -1)');
    expect(gs).toEqual([
      { id: '1', kind: 'point', x: 2, y: 3, label: 'P', drag: true },
      { id: '2', kind: 'point', x: 1, y: -1 },
    ]);
  });

  it('leaves out lines that cannot be graphed, and says why', () => {
    const w = new Workspace();
    w.set('1', 'y = x + k');
    w.set('2', '2 + 2');
    w.set('3', 'let g(x) = det(x)');
    expect(w.graphables()).toEqual([]);
    expect(w.result('1')).toMatchObject({ status: 'equation', graphable: false, undefinedNames: ['k'] });
    expect(w.graphIssue('3')).toContain("can't be graphed");
  });

  it('shows points as values', () => {
    const w = new Workspace();
    w.set('1', 'let P = (2, 1/2)');
    expect(w.result('1')).toMatchObject({ status: 'value', text: '(2, 0.5)' });
    w.set('2', '(1, 2, 3)');
    expect(w.result('2')).toMatchObject({ status: 'error', message: 'A point has two coordinates: (x, y)' });
  });
});

type Param = Extract<Graphable, { kind: 'parametric' }>;
type Polar = Extract<Graphable, { kind: 'polar' }>;

describe('parametric, polar and domain limits', () => {
  it('reads (x(t), y(t)) as a parametric curve over one turn', () => {
    const w = new Workspace();
    w.set('1', '(cos(t), sin(t))');
    expect(w.result('1')).toEqual({ status: 'curve', curve: 'parametric' });
    const [g] = w.graphables() as Param[];
    expect(g).toMatchObject({ kind: 'parametric', tmin: 0, tmax: 2 * Math.PI, label: '(cos(t), sin(t))' });
    expect(g!.fx(0)).toBe(1);
    expect(g!.fy(Math.PI / 2)).toBeCloseTo(1, 12);
  });

  it('takes the parameter range from {…}', () => {
    const [g] = graphs('(t, t^2) {-1 <= t <= 2}') as Param[];
    expect([g!.tmin, g!.tmax]).toEqual([-1, 2]);
    expect(g!.label).toBe('(t, t^2)');
  });

  it('reads r = f(θ) as a polar curve, also r = 2 and theta', () => {
    const w = new Workspace();
    w.set('1', 'r = 1 + cos(θ)');
    w.set('2', 'r = 2');
    w.set('3', 'r = theta {0 <= theta <= 4pi}');
    expect(w.result('1')).toEqual({ status: 'curve', curve: 'polar' });
    const [a, b, c] = w.graphables() as Polar[];
    expect(a!.fr(0)).toBe(2);
    expect(b!.fr(1)).toBe(2);
    expect([c!.tmin, c!.tmax]).toEqual([0, 4 * Math.PI]);
  });

  it('uses degrees for the default range in degree mode', () => {
    const w = new Workspace({ angle: 'deg' });
    w.set('1', 'r = 1');
    expect((w.graphables()[0] as Polar).tmax).toBe(360);
  });

  it("doesn't treat r = 2 as polar when r is defined", () => {
    const w = new Workspace();
    w.set('1', 'let r = 3');
    w.set('2', 'r = 2');
    expect(w.result('2')).toEqual({ status: 'relation', holds: false });
  });

  it('masks curves by their conditions', () => {
    const [g] = graphs('y = x^2 {x > 0, y < 4}');
    expect((g as Curve).mask).toBeTruthy();
    const mask = (g as Curve).mask!;
    expect(mask(1, 1, NaN)).toBe(true);
    expect(mask(-1, 1, NaN)).toBe(false);
    expect(mask(3, 9, NaN)).toBe(false);
  });

  it('still evaluates a limited function everywhere', () => {
    const w = new Workspace();
    w.set('1', 'let f(x) = x^2 {x > 0}');
    w.set('2', 'f(-2)');
    expect(w.result('2')).toMatchObject({ text: '4' });
  });

  it('explains a malformed condition', () => {
    const w = new Workspace();
    w.set('1', 'y = x {x}');
    expect(w.result('1')).toMatchObject({ status: 'error', message: 'Inside { } write a condition, like {x > 0}' });
  });
});

describe('variables used as multipliers', () => {
  it('graphs 3.2x(1 - x), where x(…) means x times', () => {
    const [g] = graphs('let f(x) = 3.2x(1 - x)');
    expect(g).toMatchObject({ kind: 'curve' });
    expect((g as Curve).fn(0.5)).toBeCloseTo(0.8, 14);
  });
});

describe('a number in front of a bracket with a power', () => {
  it('P(1 + r)^n is P·(1 + r)^n, in values, graphs and symbolic input', () => {
    const w = new Workspace();
    ['let P = 1000', 'let r = 0.05', 'let A = P(1 + r)^2', 'y = P(1 + x)^2', 'let a = 2', 'let f(x) = a(x + 1)^2'].forEach((s, k) => w.set(String(k), s));
    const A = w.result('2');
    expect(A?.status === 'value' && A.text).toBe('1102.5');
    const g = w.graphables().find((k) => k.id === '3');
    expect(g?.kind === 'curve' && g.fn(1)).toBe(4000);
    const f = w.graphables().find((k) => k.id === '5');
    expect(f?.kind === 'curve' && f.fn(1)).toBe(8);
  });

  it('a function stays a function: f(x)^2 is (f(x))^2', () => {
    const w = new Workspace();
    ['let f(x) = x + 1', 'f(2)^2', 'sin(1)^2'].forEach((s, k) => w.set(String(k), s));
    const r = w.result('1');
    expect(r?.status === 'value' && r.text).toBe('9');
    const s = w.result('2');
    expect(s?.status === 'value' && Number(s.text)).toBeCloseTo(Math.sin(1) ** 2, 10);
  });
});
