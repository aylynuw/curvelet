import { parse, printNode, type Statement } from '@math/engine';
import { describe, expect, it } from 'vitest';
import { fromWords } from '../src';

/** compare by meaning: both sides parsed and printed the same way */
const shape = (s: string) => {
  const st: Statement = parse(s);
  return st.kind === 'expr' ? printNode(st.expr) : st.kind === 'relation' ? `${printNode(st.left)} ${st.op} ${printNode(st.right)}` : JSON.stringify(st);
};

const cases: [string, string][] = [
  // English
  ['derivative of sin x squared', 'diff(sin(x^2), x)'],
  ['the derivative of x cubed minus 3x', 'diff(x^3 - 3x, x)'],
  ['differentiate e to the 2x', 'diff(e^(2x), x)'],
  ['second derivative of x to the 4th power', 'diff(x^4, x, 2)'],
  ['d/dt t squared', 'diff(t^2, t)'],
  ['integral of x squared from 0 to 3', 'integrate(x^2, x, 0, 3)'],
  ['integrate 2x cos x dx', 'integrate(2x cos(x), x)'],
  ['area under sin x from 0 to pi', 'integrate(sin(x), x, 0, pi)'],
  ['solve x squared minus 5x plus 6 equals 0', 'solve(x^2 - 5x + 6 = 0, x)'],
  ['solve 2x plus 1 = 7', 'solve(2x + 1 = 7, x)'],
  ['solve x squared minus 4', 'solve(x^2 - 4 = 0, x)'],
  ['factor x squared minus 9', 'factor(x^2 - 9)'],
  ['expand (x plus 1) cubed', 'expand((x + 1)^3)'],
  ['limit of sin x over x as x approaches 0', 'limit(sin(x)/x, x, 0)'],
  ['graph x squared minus 2', 'y = x^2 - 2'],
  ['plot y is less than sin x', 'y < sin(x)'],
  ['what is the square root of 2 plus one', 'sqrt(2) + 1'],
  ['3 times 4 divided by 2', '3*4/2'],
  ['natural log of x', 'ln(x)'],
  ['the absolute value of x minus 2', 'abs(x) - 2'],
  ['mean of 3, 5 and 10', 'mean([3, 5, 10])'],
  ['Calculate 2 to the power of 10?', '2^10'],
  // Korean
  ['x제곱의 미분', 'diff(x^2, x)'],
  ['사인 x 제곱 미분해줘', 'diff(sin(x^2), x)'],
  ['x의 3제곱 빼기 3x를 미분', 'diff(x^3 - 3x, x)'],
  ['x의 3제곱 두 번 미분', 'diff(x^3, x, 2)'],
  ['1부터 2까지 x의 3제곱 적분', 'integrate(x^3, x, 1, 2)'],
  ['x 제곱을 0에서 3까지 적분', 'integrate(x^2, x, 0, 3)'],
  ['t에 대해 t 세제곱 미분', 'diff(t^3, t)'],
  ['x^2-5x+6=0 풀어', 'solve(x^2 - 5x + 6 = 0, x)'],
  ['2x 더하기 1 = 7을 풀어줘', 'solve(2x + 1 = 7, x)'],
  ['x 제곱 빼기 9 인수분해', 'factor(x^2 - 9)'],
  ['(x+1) 세제곱 전개', 'expand((x + 1)^3)'],
  ['x가 0으로 갈 때 사인 x 나누기 x의 극한', 'limit(sin(x)/x, x, 0)'],
  ['x 제곱 빼기 2의 그래프', 'y = x^2 - 2'],
  ['3분의 1 더하기 6분의 1', '1/3 + 1/6'],
  ['2의 제곱근', 'sqrt(2)'],
  ['x 제곱 빼기 4 = 0의 해', 'solve(x^2 - 4 = 0, x)'],
  ['x 세제곱 미분해', 'diff(x^3, x)'],
  ['루트 2 곱하기 루트 8', 'sqrt(2) sqrt(8)'],
  ['3 5 10의 평균', 'mean([3, 5, 10])'],
];

describe('plain words', () => {
  for (const [words, expected] of cases) {
    it(`${words} → ${expected}`, () => {
      const r = fromWords(words);
      expect(r.ok, r.text).toBe(true);
      expect(shape(r.text)).toBe(shape(expected));
    });
  }

  it('writes brackets out, as the calculator would', () => {
    expect(fromWords('derivative of sin x squared').text).toBe('diff(sin(x^2), x)');
    expect(fromWords('x 제곱 빼기 2의 그래프').text).toBe('y = x^2 - 2');
  });

  it('names the operation', () => {
    expect(fromWords('derivative of x').command).toBe('diff');
    expect(fromWords('x 적분').command).toBe('integrate');
    expect(fromWords('2 plus 2').command).toBeNull();
  });

  it('says when it could not read something', () => {
    expect(fromWords('').ok).toBe(false);
    expect(fromWords('derivative of plus plus').ok).toBe(false);
  });
});
