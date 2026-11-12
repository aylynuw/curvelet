import { describe, expect, it } from 'vitest';
import { parse, parseExpression, MathError, type Node } from '../src';

/** Fully parenthesised form, so precedence is visible in assertions. */
function show(n: Node): string {
  switch (n.type) {
    case 'num': return String(n.value);
    case 'list': return `[${n.items.map(show).join(', ')}]`;
    case 'ident': return n.name;
    case 'unary': return `(-${show(n.arg)})`;
    case 'binary': return `(${show(n.left)} ${n.op} ${show(n.right)})`;
    case 'call': return `${n.name}${"'".repeat(n.primes)}(${n.args.map(show).join(', ')})`;
    case 'abs': return `|${show(n.arg)}|`;
    case 'factorial': return `(${show(n.arg)})!`;
    case 'tuple': return `(${show(n.items[0])}, ${show(n.items[1])})`;
    case 'rel': return `(${show(n.left)} ${n.op} ${show(n.right)})`;
  }
}
const p = (src: string) => show(parseExpression(src));

describe('precedence', () => {
  it.each([
    ['1 + 2 * 3', '(1 + (2 * 3))'],
    ['2^3^2', '(2 ^ (3 ^ 2))'],
    ['-x^2', '(-(x ^ 2))'],
    ['2^-1', '(2 ^ (-1))'],
    ['1/2x', '((1 / 2) * x)'],
    ['3!^2', '((3)! ^ 2)'],
    ['a - b - c', '((a - b) - c)'],
  ])('%s → %s', (src, expected) => expect(p(src)).toBe(expected));
});

describe('implicit multiplication', () => {
  it.each([
    ['2x', '(2 * x)'],
    ['2(x+1)', '(2 * (x + 1))'],
    ['(x+1)(x-1)', '((x + 1) * (x - 1))'],
    ['3x^2', '(3 * (x ^ 2))'],
    ['2|x|', '(2 * |x|)'],
    ['|x||y|', '(|x| * |y|)'],
    ['2pi r', '((2 * pi) * r)'],
  ])('%s → %s', (src, expected) => expect(p(src)).toBe(expected));

  it('rejects two numbers side by side', () => {
    expect(() => p('2 3')).toThrow('Missing operator');
  });
});

describe('functions', () => {
  it.each([
    ['f(x)', 'f(x)'],
    ['max(1, 2, 3)', 'max(1, 2, 3)'],
    ["f'(x)", "f'(x)"],
    ["f''(2)", "f''(2)"],
    ['sin x', 'sin(x)'],
    ['sin 2x', 'sin((2 * x))'],
    ['sin x cos x', '(sin(x) * cos(x))'],
    ['sin^2 x', '(sin(x) ^ 2)'],
    ['sin^2(x) + cos^2(x)', '((sin(x) ^ 2) + (cos(x) ^ 2))'],
    ['sin x^2', 'sin((x ^ 2))'],
    ['2 sin x + 1', '((2 * sin(x)) + 1)'],
    ['√x', 'sqrt(x)'],
    ['log_2(8)', 'log_2(8)'],
  ])('%s → %s', (src, expected) => expect(p(src)).toBe(expected));

  it('rejects the ambiguous sin^-1', () => {
    expect(() => p('sin^-1 x')).toThrow('ambiguous');
  });
});

describe('unicode and coder-friendly input', () => {
  it.each([
    ['2 × 3', '(2 * 3)'],
    ['6 ÷ 2', '(6 / 2)'],
    ['5 − 1', '(5 - 1)'],
    ['2π', '(2 * pi)'],
    ['2**3', '(2 ^ 3)'],
    ['1.5e3', '1500'],
    ['.5', '0.5'],
    ['θ + 1', '(θ + 1)'],
    ['x // comment', 'x'],
  ])('%s → %s', (src, expected) => expect(p(src)).toBe(expected));
});

describe('statements', () => {
  it('parses let values and functions', () => {
    expect(parse('let a = 2')).toMatchObject({ kind: 'define', mutable: true, name: 'a', params: null });
    expect(parse('const g = 9.81')).toMatchObject({ kind: 'define', mutable: false, name: 'g', params: null });
    expect(parse('let f(x, y) = x + y')).toMatchObject({ kind: 'define', name: 'f', params: ['x', 'y'] });
  });

  it('parses relations', () => {
    expect(parse('y = x^2')).toMatchObject({ kind: 'relation', op: '=' });
    expect(parse('x ≤ 3')).toMatchObject({ kind: 'relation', op: '<=' });
  });

  it('parses empty lines', () => {
    expect(parse('   ')).toEqual({ kind: 'empty' });
    expect(parse('// just a note')).toEqual({ kind: 'empty' });
  });

  it('reports errors with a position', () => {
    const cases: [string, string, number][] = [
      ['(1 + 2', 'Missing ")"', 6],
      ['1 + 2)', 'Unmatched ")"', 5],
      ['1 +', 'Expression ends too early', 3],
      ['2 $ 3', 'Unexpected character "$"', 2],
      ['let f(x, x) = x', 'listed twice', 9],
      ['let = 3', 'Expected a name', 4],
    ];
    for (const [src, message, pos] of cases) {
      try {
        parse(src);
        expect.unreachable(`${src} should fail`);
      } catch (e) {
        expect(e).toBeInstanceOf(MathError);
        expect((e as MathError).message).toContain(message);
        expect((e as MathError).pos).toBe(pos);
      }
    }
  });
});
