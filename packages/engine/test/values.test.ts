import { describe, expect, it } from 'vitest';
import { EMPTY_ENV, Workspace, evaluate, formatValue, parseExpression, type EvalSettings } from '../src';

const calc = (src: string, s: Partial<EvalSettings> = {}) =>
  formatValue(evaluate(parseExpression(src), EMPTY_ENV, { angle: 'rad', complex: false, ...s }));

const A = '[[1, 2], [3, 4]]';

describe('matrices', () => {
  it.each([
    [A, '[[1, 2], [3, 4]]'],
    [`det(${A})`, '-2'],
    [`inv(${A})`, '[[-2, 1], [1.5, -0.5]]'],
    [`${A}^-1`, '[[-2, 1], [1.5, -0.5]]'],
    [`${A} * [[5, 6], [7, 8]]`, '[[19, 22], [43, 50]]'],
    [`${A}^2`, '[[7, 10], [15, 22]]'],
    [`${A}^0`, '[[1, 0], [0, 1]]'],
    [`${A}^T`, '[[1, 3], [2, 4]]'],
    ['transpose([[1, 2, 3]])', '[[1], [2], [3]]'],
    [`${A} * [1, 1]`, '[3, 7]'],
    [`2 * ${A}`, '[[2, 4], [6, 8]]'],
    [`${A} / 2`, '[[0.5, 1], [1.5, 2]]'],
    [`${A} + ${A}`, '[[2, 4], [6, 8]]'],
    ['rank([[1, 2], [2, 4]])', '1'],
    ['rref([[1, 2, 3], [4, 5, 6]])', '[[1, 0, -1], [0, 1, 2]]'],
    [`trace(${A})`, '5'],
    ['identity(2)', '[[1, 0], [0, 1]]'],
    ['det([[2, 0, 0], [0, 3, 0], [0, 0, 4]])', '24'],
    ['det([[0, 1], [1, 0]])', '-1'],
    ['det([[1, 2, 3], [4, 5, 6], [7, 8, 10]])', '-3'],
  ])('%s = %s', (src, expected) => expect(calc(src)).toBe(expected));

  it('works with complex entries', () => {
    expect(calc('det([[1, i], [i, 1]])', { complex: true })).toBe('2');
    expect(calc('inv([[0, i], [i, 0]])', { complex: true })).toBe('[[0, -i], [-i, 0]]');
  });

  it.each([
    ['inv([[1, 2], [2, 4]])', 'has no inverse'],
    [`${A} * [[1, 2, 3]]`, 'inner sizes must match'],
    ['[[1, 2], [3]]', 'same number of entries'],
    [`det([[1, 2, 3]])`, 'square matrix'],
    [`${A} + 1`, "Can't add a number to a matrix"],
    [`|${A}|`, 'write det(A)'],
    [`sin(${A})`, 'numbers and lists'],
    [`${A}^0.5`, 'whole number'],
  ])('%s fails: %s', (src, message) => expect(() => calc(src)).toThrow(message));
});

describe('lists and vectors', () => {
  it.each([
    ['[1, 2, 3]', '[1, 2, 3]'],
    ['[1, 2, 3] + [10, 20, 30]', '[11, 22, 33]'],
    ['2 * [1, 2]', '[2, 4]'],
    ['[1, 2]^2', '[1, 4]'],
    ['-[1, 2]', '[-1, -2]'],
    ['sin([0, pi/2])', '[0, 1]'],
    ['max([3, 9, 4])', '9'],
    ['gcd([12, 18])', '6'],
    ['dot([1, 2, 3], [4, 5, 6])', '32'],
    ['cross([1, 0, 0], [0, 1, 0])', '[0, 0, 1]'],
    ['norm([3, 4])', '5'],
    ['|[3, 4]|', '5'],
    ['[]', '[]'],
  ])('%s = %s', (src, expected) => expect(calc(src)).toBe(expected));

  it('needs equal lengths', () => {
    expect(() => calc('[1, 2] + [1, 2, 3]')).toThrow('different lengths');
    expect(() => calc('cross([1, 2], [3, 4])')).toThrow('length 3');
  });
});

describe('number theory', () => {
  it.each([
    ['isprime(97)', 'true'],
    ['isprime(91)', 'false'],
    ['isprime(1)', 'false'],
    ['isprime(2)', 'true'],
    ['isprime(2147483647)', 'true'],
    ['primefactors(360)', '[2, 2, 2, 3, 3, 5]'],
    ['primefactors(97)', '[97]'],
    ['divisors(12)', '[1, 2, 3, 4, 6, 12]'],
    ['divisors(1)', '[1]'],
  ])('%s = %s', (src, expected) => expect(calc(src)).toBe(expected));

  it('refuses non-whole numbers', () => {
    expect(() => calc('isprime(2.5)')).toThrow('whole numbers');
    expect(() => calc('primefactors(1)')).toThrow('at least 2');
  });
});

describe('number bases', () => {
  it.each([
    ['0b1010', '0b1010'],
    ['0b1010 + 1', '11'],
    ['0xff', '0xff'],
    ['0XFF', '0xff'],
    ['0o17', '0o17'],
    ['hex(255)', '0xff'],
    ['bin(10)', '0b1010'],
    ['oct(8)', '0o10'],
    ['base(10, 3)', '(101)_3'],
    ['base(35, 36)', '(z)_36'],
    ['dec(0xff)', '255'],
    ['hex(-255)', '-0xff'],
    ['hex(0b1111)', '0xf'],
  ])('%s = %s', (src, expected) => expect(calc(src)).toBe(expected));

  it('refuses fractions and bad bases', () => {
    expect(() => calc('hex(1.5)')).toThrow('whole numbers');
    expect(() => calc('base(5, 40)')).toThrow('up to 36');
  });
});

describe('in the workspace', () => {
  it('defines and uses matrices and vectors', () => {
    const w = new Workspace();
    w.set('1', `let A = ${A}`);
    w.set('2', 'let v = [1, 2]');
    w.set('3', 'A v');
    w.set('4', 'A * inv(A) = identity(2)');
    w.set('5', 'det(A)');
    w.set('6', 'A < 2');
    const text = (id: string) => {
      const r = w.result(id);
      return r?.status === 'value' ? r.text : r;
    };
    expect(text('1')).toBe('[[1, 2], [3, 4]]');
    expect(text('3')).toBe('[5, 11]');
    expect(w.result('4')).toEqual({ status: 'relation', holds: true });
    expect(text('5')).toBe('-2');
    expect(w.result('6')).toMatchObject({ status: 'error', message: '< compares numbers, not a matrix' });
  });

  it('refuses to redefine matrix built-ins', () => {
    const w = new Workspace();
    w.set('1', 'let det = 5');
    expect(w.result('1')).toMatchObject({ status: 'error' });
  });
});
