import { describe, expect, it } from 'vitest';
import { Workspace, type Result } from '../src';

/** Build a workspace from lines; ids are "1", "2", ... */
function ws(...lines: string[]): Workspace {
  const w = new Workspace();
  lines.forEach((src, k) => w.set(String(k + 1), src));
  return w;
}
const text = (r: Result | undefined) =>
  r?.status === 'value' ? r.text : r?.status === 'error' ? `error: ${r.message}` : r?.status;

describe('let and const', () => {
  it('evaluates values and functions', () => {
    const w = ws('let f(x) = x^3 - 6x^2 + 11x - 6', 'f(4)', 'let a = 2', 'f(a)', 'const g = 9.81', 'g a');
    expect(w.result('1')).toEqual({ status: 'function', name: 'f', params: ['x'] });
    expect(text(w.result('2'))).toBe('6');
    expect(text(w.result('3'))).toBe('2');
    expect(text(w.result('4'))).toBe('0');
    expect(text(w.result('6'))).toBe('19.62');
  });

  it('allows definitions after the line that uses them', () => {
    const w = ws('a + b', 'let a = 1', 'let b = a + 1');
    expect(text(w.result('1'))).toBe('3');
  });

  it('supports several parameters and functions calling functions', () => {
    const w = ws('let f(x, y) = x^2 + y^2', 'let h(t) = sqrt(f(t, 2t))', 'h(1)');
    expect(text(w.result('3'))).toBe('2.2360679775');
  });

  it('lets parameters shadow outer names and constants', () => {
    const w = ws('let x = 100', 'let f(x) = x + 1', 'f(1)', 'let g(e) = e * 2', 'g(3)');
    expect(text(w.result('3'))).toBe('2');
    expect(text(w.result('5'))).toBe('6');
  });

  it('reads a(x + 1) as multiplication when a is a value', () => {
    const w = ws('let a = 3', 'a(1 + 1)');
    expect(text(w.result('2'))).toBe('6');
  });

  it('splits run-together single letters only when every letter is defined', () => {
    const w = ws('let a = 2', 'let b = 5', 'ab', 'abc');
    expect(text(w.result('3'))).toBe('10');
    expect(text(w.result('4'))).toBe('error: abc is not defined');
  });

  it('prefers a defined multi-letter name over splitting', () => {
    const w = ws('let a = 2', 'let b = 5', 'let ab = 100', 'ab');
    expect(text(w.result('4'))).toBe('100');
  });
});

describe('errors', () => {
  it('reports undefined names, listing them for sliders', () => {
    const w = ws('m x + c');
    expect(w.result('1')).toEqual({
      status: 'error',
      message: 'c, m, x are not defined',
      undefinedNames: ['c', 'm', 'x'],
    });
  });

  it('reports undefined names inside a function body on the definition line', () => {
    const w = ws('let f(x) = k x');
    expect(text(w.result('1'))).toBe('error: k is not defined');
  });

  it('rejects redefining a const, and defining the same let twice', () => {
    const w = ws('const g = 9.81', 'let g = 10', 'let a = 1', 'let a = 2');
    expect(text(w.result('1'))).toBe('9.81');
    expect(text(w.result('2'))).toBe("error: g is a const and can't be redefined");
    expect(text(w.result('3'))).toBe('1');
    expect(text(w.result('4'))).toBe('error: a is already defined on another line');
  });

  it('rejects built-in names', () => {
    const w = ws('let pi = 3', 'let sin(x) = x');
    expect(text(w.result('1'))).toBe("error: pi is a built-in name and can't be redefined");
    expect(text(w.result('2'))).toBe("error: sin is a built-in name and can't be redefined");
  });

  it('detects circular definitions', () => {
    const w = ws('let a = b + 1', 'let b = c', 'let c = a', 'let d = 5', 'let f(x) = f(x - 1)');
    expect(text(w.result('1'))).toBe('error: Circular definition: a → b → c → a');
    expect(text(w.result('2'))).toContain('Circular definition');
    expect(text(w.result('4'))).toBe('5');
    expect(text(w.result('5'))).toBe('error: Circular definition: f → f');
  });

  it('marks lines that use a broken definition', () => {
    const w = ws('let a = sqrt(-1)', 'a + 1');
    expect(text(w.result('1'))).toContain('not a real number');
    expect(text(w.result('2'))).toBe('error: Uses a, which has an error');
  });

  it('shows parse errors with a position', () => {
    const w = ws('2 * (3 + 4');
    expect(w.result('1')).toMatchObject({ status: 'error', message: 'Missing ")"', pos: 10 });
  });

  it('checks the number of arguments of user functions', () => {
    const w = ws('let f(x, y) = x + y', 'f(1)');
    expect(text(w.result('2'))).toBe('error: f takes 2 arguments, got 1');
  });

  it('explains that derivatives need the symbolic engine', () => {
    const w = ws('let f(x) = x^2', "f'(2)", 'diff(x^2, x)');
    expect(text(w.result('2'))).toBe("error: diff needs the symbolic engine, which isn't loaded here");
    expect(text(w.result('3'))).toBe("error: diff needs the symbolic engine, which isn't loaded here");
  });
});

describe('updates', () => {
  it('reports which lines changed when a definition changes', () => {
    const w = ws('let a = 1', 'a + 1', '10', 'let f(x) = a x', 'f(2)');
    const changed = w.set('1', 'let a = 5');
    expect(changed.sort()).toEqual(['1', '2', '5']);
    expect(text(w.result('2'))).toBe('6');
    expect(text(w.result('5'))).toBe('10');
  });

  it('recovers when a missing definition is added', () => {
    const w = ws('k + 1');
    expect(w.result('1')?.status).toBe('error');
    w.set('2', 'let k = 4');
    expect(text(w.result('1'))).toBe('5');
  });

  it('turns dependents into errors when a definition is removed', () => {
    const w = ws('let a = 1', 'a + 1');
    const changed = w.remove('1');
    expect(changed).toEqual(['2', '1']);
    expect(w.result('1')).toBeUndefined();
    expect(text(w.result('2'))).toBe('error: a is not defined');
  });

  it('changes a let with setValue, but refuses a const', () => {
    const w = ws('let a = 1', 'const g = 9.81', 'a g');
    w.setValue('a', 2);
    expect(w.source('1')).toBe('let a = 2');
    expect(text(w.result('3'))).toBe('19.62');
    expect(() => w.setValue('g', 10)).toThrow("g is a const and can't be changed");
  });

  it('follows the on-screen order for which line owns a name', () => {
    const w = ws('let a = 1', 'let a = 2', 'a');
    expect(text(w.result('3'))).toBe('1');
    w.setOrder(['2', '1', '3']);
    expect(text(w.result('3'))).toBe('2');
    expect(text(w.result('1'))).toBe('error: a is already defined on another line');
  });

  it('re-evaluates when settings change', () => {
    const w = ws('sin(90)', 'sqrt(-4)');
    expect(text(w.result('2'))).toContain('not a real number');
    w.updateSettings({ angle: 'deg', complex: true });
    expect(text(w.result('1'))).toBe('1');
    expect(text(w.result('2'))).toBe('2i');
  });

  it('lists definitions for the Definitions panel', () => {
    const w = ws('let a = 1', '2 + 2', 'const g = 9.81', 'let f(x) = x');
    expect(w.definitions().map((d) => [d.name, d.mutable, d.params])).toEqual([
      ['a', true, null],
      ['g', false, null],
      ['f', true, ['x']],
    ]);
  });
});

describe('relations', () => {
  it('checks relations between known values', () => {
    const w = ws('2 + 2 = 4', '0.1 + 0.2 = 0.3', '3 < 2', 'let a = 5', 'a >= 5');
    expect(w.result('1')).toEqual({ status: 'relation', holds: true });
    expect(w.result('2')).toEqual({ status: 'relation', holds: true });
    expect(w.result('3')).toEqual({ status: 'relation', holds: false });
    expect(w.result('5')).toEqual({ status: 'relation', holds: true });
  });

  it('keeps equations with unknowns for later phases', () => {
    const w = ws('let f(x) = x^2', 'y = f(x)');
    expect(w.result('2')).toEqual({ status: 'equation', unknowns: ['x', 'y'], graphable: true });
  });
});

describe('definitions without let', () => {
  const sheet = (lines: string[]) => {
    const w = new Workspace();
    lines.forEach((s, k) => w.set(String(k), s));
    return (k: number) => w.result(String(k));
  };

  it('f(x) = … defines a function and a = … a value', () => {
    const r = sheet(['f(x) = 3x + 1', 'f(2)', 'a = 4', 'a^2', 'g(x, y) = x y', 'g(2, 5)', 'A = (1, 2)']);
    expect(r(0)?.status).toBe('function');
    const value = (k: number) => {
      const res = r(k);
      return res?.status === 'value' ? res : null;
    };
    expect(value(1)?.text).toBe('7');
    expect(value(3)?.text).toBe('16');
    expect(value(5)?.text).toBe('10');
    expect(value(6)?.value.kind).toBe('point');
  });

  it('graphs stay graphs, and equations stay equations', () => {
    const r = sheet(['y = 2x', 'x = 3', 'r = 1 + cos(θ)', 'a = a + 1', 'x^2 = 4', 'f(2) = 5', 'sin(x) = 1']);
    expect(r(0)?.status).toBe('equation');
    expect(r(1)?.status).toBe('equation');
    expect(r(2)?.status).toBe('curve');
    expect(r(3)?.status).not.toBe('value');
    expect(r(4)?.status).toBe('equation');
    expect(r(5)?.status).not.toBe('function');
    expect(r(6)?.status).not.toBe('function');
  });

  it('a slider moved keeps the line as written', () => {
    const w = new Workspace();
    w.set('1', 'a = 2');
    w.setValue('a', 3.5);
    expect(w.source('1')).toBe('a = 3.5');
    w.set('2', 'let b = 1');
    w.setValue('b', 2);
    expect(w.source('2')).toBe('let b = 2');
  });

  it('a name defined twice says so', () => {
    const r = sheet(['a = 2', 'a = 3']);
    expect(r(1)?.status).toBe('error');
  });
});
