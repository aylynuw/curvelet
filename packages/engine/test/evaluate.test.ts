import { describe, expect, it } from 'vitest';
import { EMPTY_ENV, evaluate, formatValue, parseExpression, type EvalSettings } from '../src';

const RAD_REAL: EvalSettings = { angle: 'rad', complex: false };
const calc = (src: string, s: Partial<EvalSettings> = {}) =>
  formatValue(evaluate(parseExpression(src), EMPTY_ENV, { ...RAD_REAL, ...s }));

describe('arithmetic', () => {
  it.each([
    ['1 + 2 * 3', '7'],
    ['2^10', '1024'],
    ['-2^2', '-4'],
    ['(-2)^2', '4'],
    ['7 / 2', '3.5'],
    ['0.1 + 0.2', '0.3'],
    ['1/3', '0.333333333333'],
    ['5!', '120'],
    ['0!', '1'],
    ['|-3|', '3'],
    ['1/0', 'undefined'],
    ['2^0.5', '1.41421356237'],
    ['(-8)^(1/3)', '-2'],
    ['(-32)^(3/5)', '-8'],
    ['(-8)^(2/3)', '4'],
    ['1e21', '1e+21'],
  ])('%s = %s', (src, expected) => expect(calc(src)).toBe(expected));
});

describe('built-in functions', () => {
  it.each([
    ['sqrt(16)', '4'],
    ['√2', '1.41421356237'],
    ['cbrt(-27)', '-3'],
    ['root(-32, 5)', '-2'],
    ['ln(e)', '1'],
    ['log(1000)', '3'],
    ['log_2(8)', '3'],
    ['exp(0)', '1'],
    ['floor(-2.5)', '-3'],
    ['ceil(2.1)', '3'],
    ['round(2.5)', '3'],
    ['max(3, 9, 4)', '9'],
    ['gcd(12, 18)', '6'],
    ['gcd(12, 18, 8)', '2'],
    ['lcm(4, 6)', '12'],
    ['mod(17, 5)', '2'],
    ['mod(-7, 3)', '2'],
    ['nCr(5, 2)', '10'],
    ['nCr(52, 5)', '2598960'],
    ['nPr(5, 2)', '20'],
    ['factorial(0.5)', '0.886226925453'],
    ['factorial(-0.5)', '1.77245385091'],
    ['factorial(20)', '2.43290200818e+18'],
    ['10^15', '1e+15'],
    ['10^14', '100000000000000'],
    ['0.000001', '0.000001'],
    ['0.0000001', '1e-7'],
    ['-1/3 * 10^-7', '-3.33333333333e-8'],
    ['(-1)!', 'undefined'],
  ])('%s = %s', (src, expected) => expect(calc(src)).toBe(expected));

  it('complains about the wrong number of arguments', () => {
    expect(() => calc('sin(1, 2)')).toThrow('sin takes 1 argument, got 2');
    expect(() => calc('mod(1)')).toThrow('mod takes 2 arguments, got 1');
  });

  it('needs whole numbers where it should', () => {
    expect(() => calc('gcd(1.5, 3)')).toThrow('whole numbers');
  });

  it('hints when parentheses are missing from a run-together name', () => {
    expect(() => calc('sinx')).toThrow('Did you mean sin(x)?');
  });
});

describe('trigonometry', () => {
  it.each([
    ['sin(pi)', '0'],
    ['cos(pi/2)', '0'],
    ['sin(pi/6)', '0.5'],
    ['tan(pi/4)', '1'],
    ['sin^2(1) + cos^2(1)', '1'],
    ['tan(pi/2)', 'undefined'],
  ])('rad: %s = %s', (src, expected) => expect(calc(src)).toBe(expected));

  it.each([
    ['sin(30)', '0.5'],
    ['sin(180)', '0'],
    ['cos(90)', '0'],
    ['cos(360)', '1'],
    ['tan(45)', '1'],
    ['tan(90)', 'undefined'],
    ['arcsin(1)', '90'],
    ['arctan(1)', '45'],
  ])('deg: %s = %s', (src, expected) => expect(calc(src, { angle: 'deg' })).toBe(expected));
});

describe('real mode vs complex mode', () => {
  it('refuses non-real results in real mode', () => {
    expect(() => calc('sqrt(-1)')).toThrow('not a real number');
    expect(() => calc('ln(-1)')).toThrow('not a real number');
    expect(() => calc('i')).toThrow('complex mode');
  });

  it.each([
    ['sqrt(-4)', '2i'],
    ['i^2', '-1'],
    ['(1 + 2i)(3 - i)', '5 + 5i'],
    ['(1 + i)/(1 - i)', 'i'],
    ['e^(i pi)', '-1'],
    ['e^(i pi) + 1', '0'],
    ['|3 + 4i|', '5'],
    ['abs(3 + 4i)', '5'],
    ['conj(2 + 3i)', '2 - 3i'],
    ['re(2 + 3i)', '2'],
    ['im(2 + 3i)', '3'],
    ['arg(i)', '1.57079632679'],
    ['ln(-1)', '3.14159265359i'],
    ['i^i', '0.207879576351'],
    ['sqrt(i)', '0.707106781187 + 0.707106781187i'],
    ['-i', '-i'],
    ['(-8)^(1/3)', '1 + 1.73205080757i'],
  ])('%s = %s', (src, expected) => expect(calc(src, { complex: true })).toBe(expected));
});
