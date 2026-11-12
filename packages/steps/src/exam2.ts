/**
 * More exam-style problems, each one a question type that comes back year
 * after year in 평가원 papers (수능 and the June/September mock exams):
 * the common subjects 수학Ⅰ and 수학Ⅱ, and the two electives, 미적분
 * (calc2) and 확률과 통계 (stats). The numbers are new each time; the
 * shape of the question is the one students meet in the exam.
 */
import { frac, gcdInt, m, minus, plus, polyTex, term, type ExamTemplate } from './exam';

const C = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
};
const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
/** a probability n/d asked as q/p, p and q coprime: the answer is p + q */
const coprime = (n: number, d: number) => {
  const g = gcdInt(n, d) || 1;
  return { q: n / g, p: d / g };
};
const pq = {
  en: 'Write the answer as $$\\frac{q}{p}$$ with coprime natural numbers p and q, and give p + q.',
  ko: '(단, p와 q는 서로소인 자연수이다.)',
};
const over = (a: string) => `\\overline{${a}}`;
/** the factor x − a, bare when a = 0 */
const fac = (a: number) => (a === 0 ? 'x' : `(${minus('x', a)})`);

export const MORE_EXAM: Record<string, ExamTemplate> = {
  // =============== 수학Ⅰ: 지수와 로그
  'exam-log-pair': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const s = r.int(1, 5);
      let t = r.int(0, 5);
      if (t === s) t = s - 1;
      const cond = `\\log_{2} a + \\log_{2} b = ${s + t}, \\quad \\log_{2} a - \\log_{2} b = ${s - t}`;
      return {
        prompt: { en: `Positive numbers ${m('a, b')} satisfy ${m(cond)}. Find ${m('a + b')}.`, ko: `두 양수 ${m('a, b')}가 ${m(cond)}를 만족시킬 때, ${m('a + b')}의 값은?` },
        value: 2 ** s + 2 ** t,
        solution: {
          en: [`Adding and subtracting: ${m(`\\log_{2} a = ${s}`)}, ${m(`\\log_{2} b = ${t}`)}.`, `${m(`a + b = 2^{${s}} + 2^{${t}} = ${2 ** s + 2 ** t}`)}.`],
          ko: [`두 식을 더하고 빼면 ${m(`\\log_{2} a = ${s}`)}, ${m(`\\log_{2} b = ${t}`)}`, `${m(`a + b = 2^{${s}} + 2^{${t}} = ${2 ** s + 2 ** t}`)}`],
        },
      };
    },
  },
  'exam-exp-graph': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const [a, b, e] = [r.int(-3, 3), r.int(-5, 5), r.int(1, 4)];
      const [c, y] = [a + e, 2 ** e + b];
      return {
        prompt: {
          en: `For constants ${m('a, b')}, the graph of ${m('y = 2^{x - a} + b')} has the asymptote ${m(`y = ${b}`)} and passes through ${m(`(${c}, ${y})`)}. Find ${m('a + b')}.`,
          ko: `두 상수 ${m('a, b')}에 대하여 함수 ${m('y = 2^{x - a} + b')}의 그래프의 점근선이 직선 ${m(`y = ${b}`)}이고, 이 그래프가 점 ${m(`(${c}, ${y})`)}를 지날 때, ${m('a + b')}의 값은?`,
        },
        value: a + b,
        solution: {
          en: [`The asymptote is ${m('y = b')}, so ${m(`b = ${b}`)}.`, `${m(`2^{${c} - a} = ${y} ${plus(-b)} = ${2 ** e}`)}, so ${m(`${c} - a = ${e}`)} and ${m(`a = ${a}`)}.`, `${m(`a + b = ${a + b}`)}.`],
          ko: [`점근선이 ${m('y = b')}이므로 ${m(`b = ${b}`)}`, `${m(`2^{${c} - a} = ${y} ${plus(-b)} = ${2 ** e}`)}이므로 ${m(`${c} - a = ${e}`)}, ${m(`a = ${a}`)}`, `${m(`a + b = ${a + b}`)}`],
        },
      };
    },
  },
  'exam-log-graph': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const [a, b, e] = [r.nonzero(-4, 4), r.int(-4, 4), r.int(1, 4)];
      const [x, y] = [2 ** e - a, e + b];
      return {
        prompt: {
          en: `For constants ${m('a, b')}, the graph of ${m('y = \\log_{2}(x + a) + b')} has the asymptote ${m(`x = ${-a}`)} and passes through ${m(`(${x}, ${y})`)}. Find ${m('a + b')}.`,
          ko: `두 상수 ${m('a, b')}에 대하여 함수 ${m('y = \\log_{2}(x + a) + b')}의 그래프의 점근선이 직선 ${m(`x = ${-a}`)}이고, 이 그래프가 점 ${m(`(${x}, ${y})`)}를 지날 때, ${m('a + b')}의 값은?`,
        },
        value: a + b,
        solution: {
          en: [`The asymptote is ${m('x = -a')}, so ${m(`a = ${a}`)}.`, `${m(`\\log_{2} ${2 ** e} + b = ${e} + b = ${y}`)}, so ${m(`b = ${b}`)} and ${m(`a + b = ${a + b}`)}.`],
          ko: [`점근선이 ${m('x = -a')}이므로 ${m(`a = ${a}`)}`, `${m(`\\log_{2} ${2 ** e} + b = ${e} + b = ${y}`)}이므로 ${m(`b = ${b}`)}, ${m(`a + b = ${a + b}`)}`],
        },
      };
    },
  },
  'exam-exp-equation': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const p = r.int(0, 3);
      const q = r.int(p + 1, 5);
      const [t1, t2] = [2 ** p, 2 ** q];
      const eq = `4^{x} - ${t1 + t2} \\times 2^{x} + ${t1 * t2} = 0`;
      return {
        prompt: { en: `The equation ${m(eq)} has two real roots ${m('\\alpha, \\beta')}. Find ${m('\\alpha + \\beta')}.`, ko: `방정식 ${m(eq)}의 두 실근을 ${m('\\alpha, \\beta')}라 할 때, ${m('\\alpha + \\beta')}의 값은?` },
        value: p + q,
        solution: {
          en: [`Let ${m('t = 2^{x}')}: ${m(`t^{2} - ${t1 + t2}t + ${t1 * t2} = (t - ${t1})(t - ${t2}) = 0`)}.`, `${m(`2^{x} = ${t1}`)} or ${m(`2^{x} = ${t2}`)}, so ${m(`x = ${p}`)} or ${m(`x = ${q}`)}: the sum is ${p + q}.`],
          ko: [`${m('2^{x} = t')}로 놓으면 ${m(`t^{2} - ${t1 + t2}t + ${t1 * t2} = (t - ${t1})(t - ${t2}) = 0`)}`, `${m(`2^{x} = ${t1}`)} 또는 ${m(`2^{x} = ${t2}`)}이므로 ${m(`x = ${p}`)} 또는 ${m(`x = ${q}`)}, 합은 ${p + q}`],
        },
      };
    },
  },
  'exam-log-inequality': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const b = r.pick([2, 3]);
      const a = r.int(-5, 5);
      const k1 = r.int(0, 1);
      const k2 = r.int(k1 + 1, b === 2 ? 5 : 3);
      const ineq = `${k1} \\le \\log_{${b}}(${minus('x', a)}) \\le ${k2}`;
      const count = b ** k2 - b ** k1 + 1;
      return {
        prompt: { en: `How many integers ${m('x')} satisfy ${m(ineq)}?`, ko: `부등식 ${m(ineq)}를 만족시키는 정수 ${m('x')}의 개수는?` },
        value: count,
        solution: {
          en: [`The log increases, so ${m(`${b ** k1} \\le ${minus('x', a)} \\le ${b ** k2}`)}.`, `${m(`${b ** k1 + a} \\le x \\le ${b ** k2 + a}`)}: ${count} integers.`],
          ko: [`밑이 1보다 크므로 ${m(`${b ** k1} \\le ${minus('x', a)} \\le ${b ** k2}`)}`, `${m(`${b ** k1 + a} \\le x \\le ${b ** k2 + a}`)}이므로 정수는 ${count}개`],
        },
      };
    },
  },

  // =============== 수학Ⅰ: 삼각함수
  'exam-trig-graph': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const [a, b, c] = [r.int(1, 5), r.int(1, 4), r.int(-3, 3)];
      const period = { 1: '2\\pi', 2: '\\pi', 3: '\\frac{2}{3}\\pi', 4: '\\frac{\\pi}{2}' }[b]!;
      const cond = `f(x) = a\\sin bx + c`;
      return {
        prompt: {
          en: `For constants ${m('a > 0, b > 0, c')}, ${m(cond)} has maximum ${m(String(a + c))}, minimum ${m(String(c - a))} and period ${m(period)}. Find ${m('a + b + c')}.`,
          ko: `세 상수 ${m('a, b, c')}에 대하여 함수 ${m(cond)}의 최댓값이 ${m(String(a + c))}, 최솟값이 ${m(String(c - a))}, 주기가 ${m(period)}일 때, ${m('a + b + c')}의 값은? (단, ${m('a > 0, b > 0')})`,
        },
        value: a + b + c,
        solution: {
          en: [`Maximum ${m('a + c')} and minimum ${m('-a + c')}: ${m(`a = ${a}`)}, ${m(`c = ${c}`)}.`, `The period is ${m(`\\frac{2\\pi}{b} = ${period}`)}, so ${m(`b = ${b}`)}; ${m(`a + b + c = ${a + b + c}`)}.`],
          ko: [`최댓값 ${m('a + c')}, 최솟값 ${m('-a + c')}에서 ${m(`a = ${a}`)}, ${m(`c = ${c}`)}`, `주기 ${m(`\\frac{2\\pi}{b} = ${period}`)}이므로 ${m(`b = ${b}`)}, ${m(`a + b + c = ${a + b + c}`)}`],
        },
      };
    },
  },
  'exam-trig-equation': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      // sin x = v at these multiples of π/6 in [0, 2π)
      const SOL: [number, number[]][] = [[1, [3]], [-1, [9]], [0, [0, 6]], [0.5, [1, 5]], [-0.5, [7, 11]]];
      const i = r.int(0, SOL.length - 1);
      let j = r.int(0, SOL.length - 2);
      if (j >= i) j++;
      const [[v1, s1], [v2, s2]] = [SOL[i]!, SOL[j]!];
      let [A, B, Cc] = [4, -4 * (v1 + v2), 4 * v1 * v2];
      const g = gcdInt(gcdInt(Math.abs(A), Math.abs(B)), Math.abs(Cc)) || 1;
      [A, B, Cc] = [A / g, B / g, Cc / g];
      const eq = `${term(A, '\\sin^{2} x', true)}${term(B, '\\sin x', false)}${term(Cc, '', false)} = 0`;
      const sixths = [...s1, ...s2].reduce((t, k) => t + k, 0);
      const { q, p } = coprime(sixths, 6);
      const show = (v: number) => (v === 0.5 ? '\\frac{1}{2}' : v === -0.5 ? '-\\frac{1}{2}' : String(v));
      return {
        prompt: {
          en: `For ${m('0 \\le x < 2\\pi')}, the solutions of ${m(eq)} add up to ${m('\\frac{q}{p}\\pi')}. ${pq.en}`,
          ko: `${m('0 \\le x < 2\\pi')}일 때, 방정식 ${m(eq)}의 모든 해의 합이 ${m('\\frac{q}{p}\\pi')}이다. ${m('p + q')}의 값은? ${pq.ko}`,
        },
        value: p + q,
        solution: {
          en: [`Factor: ${m(`\\sin x = ${show(v1)}`)} or ${m(`\\sin x = ${show(v2)}`)}.`, `The solutions are ${m([...s1, ...s2].sort((x, y) => x - y).map((k) => (k === 0 ? '0' : `\\frac{${k}}{6}\\pi`)).join(', '))}, with sum ${m(`${frac(q, p)}\\pi`)}; ${m(`p + q = ${p + q}`)}.`],
          ko: [`인수분해하면 ${m(`\\sin x = ${show(v1)}`)} 또는 ${m(`\\sin x = ${show(v2)}`)}`, `해는 ${m([...s1, ...s2].sort((x, y) => x - y).map((k) => (k === 0 ? '0' : `\\frac{${k}}{6}\\pi`)).join(', '))}이고 합은 ${m(`${frac(q, p)}\\pi`)}, ${m(`p + q = ${p + q}`)}`],
        },
      };
    },
  },
  'exam-cosine-law': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const [b, c] = [r.int(2, 8), r.int(2, 8)];
      const wide = r.int(0, 1) === 1;
      const value = b * b + c * c + (wide ? b * c : -b * c);
      const angle = wide ? '\\frac{2}{3}\\pi' : '\\frac{\\pi}{3}';
      const cond = `${over('AB')} = ${c}, \\quad ${over('AC')} = ${b}, \\quad \\angle A = ${angle}`;
      return {
        prompt: { en: `In triangle ABC, ${m(cond)}. Find ${m(`${over('BC')}^{2}`)}.`, ko: `삼각형 ABC에서 ${m(cond)}일 때, ${m(`${over('BC')}^{2}`)}의 값은?` },
        value,
        solution: {
          en: [`Law of cosines: ${m(`${over('BC')}^{2} = ${c}^{2} + ${b}^{2} - 2 \\times ${c} \\times ${b} \\times \\cos ${angle}`)}.`, `${m(`\\cos ${angle} = ${wide ? '-' : ''}\\frac{1}{2}`)}, so ${m(`${over('BC')}^{2} = ${value}`)}.`],
          ko: [`코사인법칙에 의하여 ${m(`${over('BC')}^{2} = ${c}^{2} + ${b}^{2} - 2 \\times ${c} \\times ${b} \\times \\cos ${angle}`)}`, `${m(`\\cos ${angle} = ${wide ? '-' : ''}\\frac{1}{2}`)}이므로 ${m(`${over('BC')}^{2} = ${value}`)}`],
        },
      };
    },
  },
  'exam-sine-law': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const R2 = r.int(2, 12);
      const [angle, mult] = r.pick([['\\frac{\\pi}{6}', 1], ['\\frac{\\pi}{4}', 2], ['\\frac{\\pi}{3}', 3], ['\\frac{2}{3}\\pi', 3], ['\\frac{3}{4}\\pi', 2]] as const);
      const value = mult * R2;
      return {
        prompt: {
          en: `The circumcircle of triangle ABC has area ${m(`${R2}\\pi`)}, and ${m(`\\angle A = ${angle}`)}. Find ${m(`${over('BC')}^{2}`)}.`,
          ko: `삼각형 ABC의 외접원의 넓이가 ${m(`${R2}\\pi`)}이고 ${m(`\\angle A = ${angle}`)}일 때, ${m(`${over('BC')}^{2}`)}의 값은?`,
        },
        value,
        solution: {
          en: [`The radius ${m('R')} has ${m(`R^{2} = ${R2}`)}.`, `Law of sines: ${m(`${over('BC')} = 2R\\sin A`)}, so ${m(`${over('BC')}^{2} = 4R^{2}\\sin^{2} A = 4 \\times ${R2} \\times ${frac(mult, 4)} = ${value}`)}.`],
          ko: [`외접원의 반지름을 ${m('R')}라 하면 ${m(`R^{2} = ${R2}`)}`, `사인법칙에 의하여 ${m(`${over('BC')} = 2R\\sin A`)}, ${m(`${over('BC')}^{2} = 4R^{2}\\sin^{2} A = 4 \\times ${R2} \\times ${frac(mult, 4)} = ${value}`)}`],
        },
      };
    },
  },

  // =============== 수학Ⅰ: 수열
  'exam-sigma-rules': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const [A, B, p, q, c] = [r.int(5, 30), r.int(3, 20), r.int(1, 3), r.int(1, 3), r.int(-3, 3)];
      const body = `${term(p, 'a_k', true)}${term(-q, 'b_k', false)}${term(c, '', false)}`;
      const value = p * A - q * B + 10 * c;
      return {
        prompt: {
          en: `If ${m(`\\sum_{k=1}^{10} a_k = ${A}`)} and ${m(`\\sum_{k=1}^{10} b_k = ${B}`)}, find ${m(`\\sum_{k=1}^{10} (${body})`)}.`,
          ko: `${m(`\\sum_{k=1}^{10} a_k = ${A}`)}, ${m(`\\sum_{k=1}^{10} b_k = ${B}`)}일 때, ${m(`\\sum_{k=1}^{10} (${body})`)}의 값은?`,
        },
        value,
        solution: {
          en: [`Split the sum: ${m(`${p} \\times ${A} - ${q} \\times ${B} ${plus(c)} \\times 10 = ${value}`)}.`],
          ko: [`시그마의 성질에 의하여 ${m(`${p} \\times ${A} - ${q} \\times ${B} ${plus(c)} \\times 10 = ${value}`)}`],
        },
      };
    },
  },
  'exam-recurrence': {
    unit: 'algebra',
    points: 4,
    make: (r) => {
      const halving = r.int(0, 1) === 1;
      const a1 = r.int(halving ? 3 : 1, halving ? 40 : 12);
      const c = r.pick([1, 3, 5]);
      const [T, d, e] = [r.int(5, 10), r.int(2, 5), r.int(1, 4)];
      const next = (a: number) => (halving ? (a % 2 === 0 ? a / 2 : a + c) : a >= T ? a - d : a + e);
      const seq = [a1];
      for (let k = 1; k < 20; k++) seq.push(next(seq[k - 1]!));
      const sumAsk = r.int(0, 1) === 1;
      const n = r.int(sumAsk ? 6 : 8, sumAsk ? 10 : 20);
      const value = sumAsk ? seq.slice(0, n).reduce((s, v) => s + v, 0) : seq[n - 1]!;
      const rule = halving
        ? `a_{n+1} = \\begin{cases} \\frac{a_n}{2} & (a_n\\text{ is even}) \\\\ a_n + ${c} & (a_n\\text{ is odd}) \\end{cases}`
        : `a_{n+1} = \\begin{cases} a_n - ${d} & (a_n \\ge ${T}) \\\\ a_n + ${e} & (a_n < ${T}) \\end{cases}`;
      const ruleKo = halving ? rule.replace('\\text{ is even}', '\\text{이 짝수}').replace('\\text{ is odd}', '\\text{이 홀수}') : rule;
      const ask = sumAsk ? `\\sum_{k=1}^{${n}} a_k` : `a_{${n}}`;
      const shown = seq.slice(0, Math.min(n, 12));
      return {
        prompt: {
          en: `The sequence ${m('\\{a_n\\}')} has ${m(`a_1 = ${a1}`)} and, for every natural number ${m('n')}, ${m(rule)}. Find ${m(ask)}.`,
          ko: `수열 ${m('\\{a_n\\}')}은 ${m(`a_1 = ${a1}`)}이고, 모든 자연수 ${m('n')}에 대하여 ${m(ruleKo)}를 만족시킨다. ${m(ask)}의 값은?`,
        },
        value,
        solution: {
          en: [`Work out the terms in turn: ${m(shown.join(', ') + (n > 12 ? ', \\ldots' : ''))}.`, `Carry on the same way up to ${m(`a_{${n}}`)}.`, `${m(`${ask} = ${value}`)}.`],
          ko: [`차례로 구하면 ${m(shown.join(', ') + (n > 12 ? ', \\ldots' : ''))}`, `같은 방법으로 ${m(`a_{${n}}`)}까지 구한다.`, `${m(`${ask} = ${value}`)}`],
        },
      };
    },
  },
  'exam-arith-sum': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const [a1, d, mm] = [r.int(-10, 10), r.nonzero(-4, 4), r.int(4, 10)];
      const S = mm * a1 + (mm * (mm - 1) * d) / 2;
      const k = r.int(10, 20);
      const value = a1 + (k - 1) * d;
      return {
        prompt: {
          en: `For an arithmetic sequence ${m('\\{a_n\\}')}, let ${m('S_n')} be the sum of its first ${m('n')} terms. If ${m(`a_1 = ${a1}`)} and ${m(`S_{${mm}} = ${S}`)}, find ${m(`a_{${k}}`)}.`,
          ko: `등차수열 ${m('\\{a_n\\}')}의 첫째항부터 제${m('n')}항까지의 합을 ${m('S_n')}이라 하자. ${m(`a_1 = ${a1}`)}, ${m(`S_{${mm}} = ${S}`)}일 때, ${m(`a_{${k}}`)}의 값은?`,
        },
        value,
        solution: {
          en: [`${m(`S_{${mm}} = \\frac{${mm}(2a_1 + ${mm - 1}d)}{2} = ${S}`)}, so ${m(`d = ${d}`)}.`, `${m(`a_{${k}} = ${a1} + ${k - 1} \\times (${d}) = ${value}`)}.`],
          ko: [`${m(`S_{${mm}} = \\frac{${mm}(2a_1 + ${mm - 1}d)}{2} = ${S}`)}이므로 ${m(`d = ${d}`)}`, `${m(`a_{${k}} = ${a1} + ${k - 1} \\times (${d}) = ${value}`)}`],
        },
      };
    },
  },
  'exam-geo-sum': {
    unit: 'algebra',
    points: 4,
    make: (r) => {
      const ratio = r.pick([2, 3]);
      const c = r.int(1, ratio === 2 ? 8 : 3);
      const value = c * ratio ** 4;
      return {
        prompt: {
          en: `A geometric sequence ${m('\\{a_n\\}')} with a positive common ratio has ${m(`a_1 = ${c}`)}; the sum ${m('S_n')} of its first ${m('n')} terms satisfies ${m(`\\frac{S_4}{S_2} = ${1 + ratio ** 2}`)}. Find ${m('a_5')}.`,
          ko: `공비가 양수인 등비수열 ${m('\\{a_n\\}')}의 첫째항부터 제${m('n')}항까지의 합을 ${m('S_n')}이라 하자. ${m(`a_1 = ${c}`)}, ${m(`\\frac{S_4}{S_2} = ${1 + ratio ** 2}`)}일 때, ${m('a_5')}의 값은?`,
        },
        value,
        solution: {
          en: [`${m('S_4 = S_2 + r^{2}S_2')}, so ${m(`\\frac{S_4}{S_2} = 1 + r^{2} = ${1 + ratio ** 2}`)} and ${m(`r = ${ratio}`)}.`, `${m(`a_5 = ${c} \\times ${ratio}^{4} = ${value}`)}.`],
          ko: [`${m('S_4 = S_2 + r^{2}S_2')}이므로 ${m(`\\frac{S_4}{S_2} = 1 + r^{2} = ${1 + ratio ** 2}`)}, ${m(`r = ${ratio}`)}`, `${m(`a_5 = ${c} \\times ${ratio}^{4} = ${value}`)}`],
        },
      };
    },
  },

  // =============== 수학Ⅱ
  'exam-poly-limits': {
    unit: 'calculus',
    points: 4,
    make: (r) => {
      const [a, b, k] = [r.int(-5, 5), r.int(-5, 5), r.int(1, 3)];
      const value = k ** 3 + a * k * k + b * k;
      const c1 = `\\lim_{x \\to \\infty} \\frac{f(x) - x^{3}}{x^{2}} = ${a}`;
      const c2 = `\\lim_{x \\to 0} \\frac{f(x)}{x} = ${b}`;
      return {
        prompt: {
          en: `A polynomial ${m('f(x)')} satisfies ${m(c1)} and ${m(c2)}. Find ${m(`f(${k})`)}.`,
          ko: `다항함수 ${m('f(x)')}가 ${m(c1)}, ${m(c2)}를 만족시킬 때, ${m(`f(${k})`)}의 값은?`,
        },
        value,
        solution: {
          en: [`The first limit makes ${m('f(x) - x^{3}')} a quadratic with leading coefficient ${a}: ${m(`f(x) = x^{3} ${plus(a)}x^{2} + px + q`)}.`, `The second needs ${m('f(0) = 0')}, so ${m('q = 0')}, and then ${m(`p = ${b}`)}.`, `${m(`f(${k}) = ${value}`)}.`],
          ko: [`첫째 조건에서 ${m('f(x) - x^{3}')}은 최고차항의 계수가 ${a}인 이차 이하의 다항식: ${m(`f(x) = x^{3} ${plus(a)}x^{2} + px + q`)}`, `둘째 조건에서 ${m('f(0) = 0')}이므로 ${m('q = 0')}, ${m(`p = ${b}`)}`, `${m(`f(${k}) = ${value}`)}`],
        },
      };
    },
  },
  'exam-derivative-def': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      const [a, b, c, p, k] = [r.int(-3, 3), r.int(-5, 5), r.int(-5, 5), r.int(-2, 2), r.int(2, 4)];
      const fp = 3 * p * p + 2 * a * p + b;
      const lim = `\\lim_{h \\to 0} \\frac{f(${p === 0 ? '' : `${p} + `}${k}h) - f(${p})}{h}`;
      return {
        prompt: { en: `For ${m(`f(x) = ${polyTex([1, a, b, c])}`)}, find ${m(lim)}.`, ko: `함수 ${m(`f(x) = ${polyTex([1, a, b, c])}`)}에 대하여 ${m(lim)}의 값은?` },
        value: k * fp,
        solution: {
          en: [`The limit is ${m(`${k}f'(${p})`)}.`, `${m(`f'(x) = ${polyTex([3, 2 * a, b])}`)}, ${m(`f'(${p}) = ${fp}`)}, so the value is ${k * fp}.`],
          ko: [`주어진 극한은 ${m(`${k}f'(${p})`)}`, `${m(`f'(x) = ${polyTex([3, 2 * a, b])}`)}, ${m(`f'(${p}) = ${fp}`)}이므로 값은 ${k * fp}`],
        },
      };
    },
  },
  'exam-differentiable': {
    unit: 'calculus',
    points: 4,
    make: (r) => {
      const c = r.pick([-2, -1, 1, 2]);
      const k = r.nonzero(-6, 6);
      const a = k - 2 * c;
      const b = k * c - c * c - a * c;
      const f = `f(x) = \\begin{cases} x^{2} + ax + b & (x < ${c}) \\\\ ${term(k, 'x', true)} & (x \\ge ${c}) \\end{cases}`;
      return {
        prompt: {
          en: `For constants ${m('a, b')}, ${m(f)} is differentiable for all real ${m('x')}. Find ${m('a + b')}.`,
          ko: `두 상수 ${m('a, b')}에 대하여 함수 ${m(f)}가 실수 전체의 집합에서 미분가능할 때, ${m('a + b')}의 값은?`,
        },
        value: a + b,
        solution: {
          en: [`Continuous at ${m(`x = ${c}`)}: ${m(`${c * c} ${plus(c)}a + b = ${k * c}`)}.`, `Equal slopes: ${m(`${2 * c} + a = ${k}`)}, so ${m(`a = ${a}`)} and ${m(`b = ${b}`)}.`, `${m(`a + b = ${a + b}`)}.`],
          ko: [`${m(`x = ${c}`)}에서 연속: ${m(`${c * c} ${plus(c)}a + b = ${k * c}`)}`, `미분계수가 같아야 하므로 ${m(`${2 * c} + a = ${k}`)}, ${m(`a = ${a}`)}, ${m(`b = ${b}`)}`, `${m(`a + b = ${a + b}`)}`],
        },
      };
    },
  },
  'exam-increasing': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      const k = r.int(1, 6);
      const d = r.int(-5, 5);
      const f = `f(x) = x^{3} - ax^{2} + ${k === 1 ? '' : k}ax ${plus(d)}`;
      return {
        prompt: {
          en: `How many integers ${m('a')} make ${m(f)} increasing on all real numbers?`,
          ko: `함수 ${m(f)}가 실수 전체의 집합에서 증가하도록 하는 정수 ${m('a')}의 개수는?`,
        },
        value: 3 * k + 1,
        solution: {
          en: [`Need ${m(`f'(x) = 3x^{2} - 2ax + ${k === 1 ? '' : k}a \\ge 0`)} for all ${m('x')}.`, `Discriminant: ${m(`\\frac{D}{4} = a^{2} - ${3 * k}a \\le 0`)}, so ${m(`0 \\le a \\le ${3 * k}`)}: ${3 * k + 1} integers.`],
          ko: [`모든 실수 ${m('x')}에 대하여 ${m(`f'(x) = 3x^{2} - 2ax + ${k === 1 ? '' : k}a \\ge 0`)}이어야 한다.`, `${m(`\\frac{D}{4} = a^{2} - ${3 * k}a \\le 0`)}에서 ${m(`0 \\le a \\le ${3 * k}`)}, 정수 ${m('a')}는 ${3 * k + 1}개`],
        },
      };
    },
  },
  'exam-real-roots': {
    unit: 'calculus',
    points: 4,
    make: (r) => {
      const p = r.int(-3, 2);
      const q = p + r.pick([2, 4]);
      const [A, B] = [(-3 * (p + q)) / 2, 3 * p * q];
      const f = (x: number) => x ** 3 + A * x * x + B * x;
      const three = r.int(0, 1) === 1;
      const eq = `${polyTex([1, A, B, 0])} + k = 0`;
      const value = three ? f(p) - f(q) - 1 : -(f(p) + f(q));
      return {
        prompt: three
          ? { en: `How many integers ${m('k')} make ${m(eq)} have three different real roots?`, ko: `방정식 ${m(eq)}가 서로 다른 세 실근을 갖도록 하는 정수 ${m('k')}의 개수는?` }
          : { en: `Find the sum of all real ${m('k')} for which ${m(eq)} has exactly two different real roots.`, ko: `방정식 ${m(eq)}의 서로 다른 실근의 개수가 2가 되도록 하는 모든 실수 ${m('k')}의 값의 합은?` },
        value,
        solution: {
          en: [`Let ${m(`g(x) = ${polyTex([1, A, B, 0])}`)}; the roots are where ${m('y = g(x)')} meets ${m('y = -k')}.`, `${m(`g'(x) = 3${fac(p)}${fac(q)}`)}: local maximum ${m(`g(${p}) = ${f(p)}`)}, local minimum ${m(`g(${q}) = ${f(q)}`)}.`, three ? `Three roots when ${m(`${f(q)} < -k < ${f(p)}`)}: ${value} integers.` : `Two roots when ${m(`-k = ${f(p)}`)} or ${m(`-k = ${f(q)}`)}: the sum of ${m('k')} is ${value}.`],
          ko: [`${m(`g(x) = ${polyTex([1, A, B, 0])}`)}라 하면 실근은 ${m('y = g(x)')}와 ${m('y = -k')}의 교점`, `${m(`g'(x) = 3${fac(p)}${fac(q)}`)}이므로 극댓값 ${m(`g(${p}) = ${f(p)}`)}, 극솟값 ${m(`g(${q}) = ${f(q)}`)}`, three ? `${m(`${f(q)} < -k < ${f(p)}`)}일 때 세 실근: 정수 ${m('k')}는 ${value}개` : `${m(`-k = ${f(p)}`)} 또는 ${m(`-k = ${f(q)}`)}일 때 두 실근: ${m('k')}의 합은 ${value}`],
        },
      };
    },
  },
  'exam-extremum-gap': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      const p = r.int(-3, 2);
      const q = p + r.int(1, 3);
      const d = r.int(-5, 5);
      const f = `f(x) = ${polyTex([2, -3 * (p + q), 6 * p * q, d])}`;
      const value = (q - p) ** 3;
      return {
        prompt: { en: `Find (local maximum) − (local minimum) of ${m(f)}.`, ko: `함수 ${m(f)}의 극댓값과 극솟값의 차는?` },
        value,
        solution: {
          en: [`${m(`f'(x) = 6${fac(p)}${fac(q)}`)}: maximum at ${m(`x = ${p}`)}, minimum at ${m(`x = ${q}`)}.`, `${m(`f(${p}) - f(${q}) = -\\int_{${p}}^{${q}} f'(x)\\,dx = (${q} - ${p < 0 ? `(${p})` : p})^{3} = ${value}`)}.`],
          ko: [`${m(`f'(x) = 6${fac(p)}${fac(q)}`)}이므로 ${m(`x = ${p}`)}에서 극대, ${m(`x = ${q}`)}에서 극소`, `${m(`f(${p}) - f(${q}) = -\\int_{${p}}^{${q}} f'(x)\\,dx = (${q} - ${p < 0 ? `(${p})` : p})^{3} = ${value}`)}`],
        },
      };
    },
  },
  'exam-integral-function': {
    unit: 'calculus',
    points: 4,
    make: (r) => {
      const c = r.pick([-1, 1, 2]);
      const a = r.int(-4, 4);
      const b = -(c ** 3) - a * c * c;
      const k = r.int(1, 3);
      const value = 3 * k * k + 2 * a * k;
      const eq = `\\int_{${c}}^{x} f(t)\\,dt = x^{3} + ax^{2} ${plus(b)}`;
      return {
        prompt: {
          en: `For a polynomial ${m('f(x)')} and a constant ${m('a')}, ${m(eq)} for every real ${m('x')}. Find ${m(`f(${k})`)}.`,
          ko: `다항함수 ${m('f(x)')}와 상수 ${m('a')}가 모든 실수 ${m('x')}에 대하여 ${m(eq)}를 만족시킬 때, ${m(`f(${k})`)}의 값은?`,
        },
        value,
        solution: {
          en: [`Put ${m(`x = ${c}`)}: ${m(`0 = ${c ** 3} ${plus(c * c)}a ${plus(b)}`)}, so ${m(`a = ${a}`)}.`, `Differentiate: ${m(`f(x) = ${polyTex([3, 2 * a, 0])}`)}, so ${m(`f(${k}) = ${value}`)}.`],
          ko: [`${m(`x = ${c}`)}를 대입하면 ${m(`0 = ${c ** 3} ${plus(c * c)}a ${plus(b)}`)}, ${m(`a = ${a}`)}`, `양변을 미분하면 ${m(`f(x) = ${polyTex([3, 2 * a, 0])}`)}, ${m(`f(${k}) = ${value}`)}`],
        },
      };
    },
  },
  'exam-integral-constant': {
    unit: 'calculus',
    points: 4,
    make: (r) => {
      const p = r.pick([3, 6, 9]);
      const q = r.pick([-2, 4]);
      const c = r.int(-3, 3);
      const rr = q === -2 ? 2 * c - p / 3 : -c - p / 3;
      const f = `f(x) = ${p}x^{2} ${q < 0 ? '-' : '+'} ${Math.abs(q)}x\\int_{0}^{1} f(t)\\,dt${rr ? ` ${plus(rr)}` : ''}`;
      const value = 4 * p + 2 * q * c + rr;
      return {
        prompt: { en: `A function satisfies ${m(f)}. Find ${m('f(2)')}.`, ko: `함수 ${m('f(x)')}가 ${m(f)}를 만족시킬 때, ${m('f(2)')}의 값은?` },
        value,
        solution: {
          en: [`Let ${m('k = \\int_{0}^{1} f(t)\\,dt')}; then ${m(`f(x) = ${p}x^{2} ${q < 0 ? '-' : '+'} ${Math.abs(q)}kx${rr ? ` ${plus(rr)}` : ''}`)}.`, `${m(`k = ${p / 3} ${q < 0 ? '-' : '+'} ${Math.abs(q / 2) === 1 ? '' : Math.abs(q / 2)}k${rr ? ` ${plus(rr)}` : ''}`)}, so ${m(`k = ${c}`)}.`, `${m(`f(2) = ${value}`)}.`],
          ko: [`${m('k = \\int_{0}^{1} f(t)\\,dt')}로 놓으면 ${m(`f(x) = ${p}x^{2} ${q < 0 ? '-' : '+'} ${Math.abs(q)}kx${rr ? ` ${plus(rr)}` : ''}`)}`, `${m(`k = ${p / 3} ${q < 0 ? '-' : '+'} ${Math.abs(q / 2) === 1 ? '' : Math.abs(q / 2)}k${rr ? ` ${plus(rr)}` : ''}`)}이므로 ${m(`k = ${c}`)}`, `${m(`f(2) = ${value}`)}`],
        },
      };
    },
  },
  'exam-distance': {
    unit: 'calculus',
    points: 4,
    make: (r) => {
      const p = r.pick([2, 4]);
      const T = p + r.int(1, 3);
      const X = (t: number) => t ** 3 - 1.5 * p * t * t;
      const value = X(T) + p ** 3;
      const v = `v(t) = ${polyTex([3, -3 * p, 0], 't')}`;
      return {
        prompt: {
          en: `A point P moves on a number line with velocity ${m(v)} at time ${m('t \\ (t \\ge 0)')}. Find the distance P travels from ${m('t = 0')} to ${m(`t = ${T}`)}.`,
          ko: `수직선 위를 움직이는 점 P의 시각 ${m('t \\ (t \\ge 0)')}에서의 속도가 ${m(v)}일 때, 시각 ${m('t = 0')}에서 ${m(`t = ${T}`)}까지 점 P가 움직인 거리는?`,
        },
        value,
        solution: {
          en: [`${m('v(t) < 0')} on ${m(`(0, ${p})`)} and ${m('v(t) > 0')} after.`, `${m(`\\int_{0}^{${T}} |v(t)|\\,dt = ${p ** 3 / 2} + ${value - p ** 3 / 2} = ${value}`)}.`],
          ko: [`${m(`0 < t < ${p}`)}에서 ${m('v(t) < 0')}, ${m(`t > ${p}`)}에서 ${m('v(t) > 0')}`, `${m(`\\int_{0}^{${T}} |v(t)|\\,dt = ${p ** 3 / 2} + ${value - p ** 3 / 2} = ${value}`)}`],
        },
      };
    },
  },
  'exam-area-curve-line': {
    unit: 'calculus',
    points: 4,
    make: (r) => {
      const w = r.pick([2, 4, 6]);
      const s = r.int(0, w - 1);
      const t = w - s;
      const value = w ** 3 / 2;
      const [curve, line] = [polyTex([3, -3 * s, 0]), `${3 * t}x`];
      return {
        prompt: {
          en: `Find the area enclosed by the curve ${m(`y = ${curve}`)} and the line ${m(`y = ${line}`)}.`,
          ko: `곡선 ${m(`y = ${curve}`)}와 직선 ${m(`y = ${line}`)}로 둘러싸인 부분의 넓이는?`,
        },
        value,
        solution: {
          en: [`They meet where ${m(`3x^{2} - ${3 * w}x = 0`)}: ${m('x = 0')} and ${m(`x = ${w}`)}.`, `${m(`\\int_{0}^{${w}} (${polyTex([-3, 3 * w, 0])})\\,dx = ${value}`)}.`],
          ko: [`${m(`3x^{2} - ${3 * w}x = 0`)}에서 ${m('x = 0')}, ${m(`x = ${w}`)}`, `${m(`\\int_{0}^{${w}} (${polyTex([-3, 3 * w, 0])})\\,dx = ${value}`)}`],
        },
      };
    },
  },
  'exam-tangent-from-point': {
    unit: 'calculus',
    points: 4,
    make: (r) => {
      const [t, a] = [r.nonzero(-2, 2), r.int(-5, 5)];
      const k = a - 2 * t ** 3;
      return {
        prompt: {
          en: `A line through ${m(`(0, ${k})`)} touches the curve ${m(`y = x^{3} ${plus(a)}`)}. Find its slope.`,
          ko: `점 ${m(`(0, ${k})`)}에서 곡선 ${m(`y = x^{3} ${plus(a)}`)}에 그은 접선의 기울기는?`,
        },
        value: 3 * t * t,
        solution: {
          en: [`The tangent at ${m('x = s')}: ${m(`y = 3s^{2}(x - s) + s^{3} ${plus(a)}`)}.`, `Through ${m(`(0, ${k})`)}: ${m(`${k} = -2s^{3} ${plus(a)}`)}, so ${m(`s = ${t}`)} and the slope is ${m(`3s^{2} = ${3 * t * t}`)}.`],
          ko: [`접점의 ${m('x')}좌표를 ${m('s')}라 하면 접선은 ${m(`y = 3s^{2}(x - s) + s^{3} ${plus(a)}`)}`, `점 ${m(`(0, ${k})`)}를 지나므로 ${m(`${k} = -2s^{3} ${plus(a)}`)}, ${m(`s = ${t}`)}, 기울기는 ${m(`3s^{2} = ${3 * t * t}`)}`],
        },
      };
    },
  },

  // =============== 미적분
  'exam-seq-limit': {
    unit: 'calc2',
    points: 2,
    make: (r) => {
      if (r.int(0, 1)) {
        const [d, v, b, e] = [r.int(1, 4), r.nonzero(-5, 5), r.int(-5, 5), r.int(1, 7)];
        const lim = `\\lim_{n \\to \\infty} \\frac{${polyTex([d * v, b, 1], 'n')}}{${polyTex([d, 0, e], 'n')}}`;
        return {
          prompt: { en: `Find ${m(lim)}.`, ko: `${m(lim)}의 값은?` },
          value: v,
          solution: { en: [`Divide top and bottom by ${m('n^{2}')}: the limit is ${m(`\\frac{${d * v}}{${d}} = ${v}`)}.`], ko: [`분모, 분자를 ${m('n^{2}')}으로 나누면 ${m(`\\frac{${d * v}}{${d}} = ${v}`)}`] },
        };
      }
      const a = 2 * r.int(1, 6);
      const lim = `\\lim_{n \\to \\infty} \\left(\\sqrt{n^{2} + ${a}n} - n\\right)`;
      return {
        prompt: { en: `Find ${m(lim)}.`, ko: `${m(lim)}의 값은?` },
        value: a / 2,
        solution: {
          en: [`Multiply by the conjugate: ${m(`\\frac{${a}n}{\\sqrt{n^{2} + ${a}n} + n}`)}.`, `Divide by ${m('n')}: ${m(`\\frac{${a}}{1 + 1} = ${a / 2}`)}.`],
          ko: [`유리화하면 ${m(`\\frac{${a}n}{\\sqrt{n^{2} + ${a}n} + n}`)}`, `분모, 분자를 ${m('n')}으로 나누면 ${m(`\\frac{${a}}{1 + 1} = ${a / 2}`)}`],
        },
      };
    },
  },
  'exam-geo-series': {
    unit: 'calc2',
    points: 3,
    make: (r) => {
      const k = r.int(2, 5);
      const v = r.int(1, 9);
      const a = (k - 1) * v;
      const s = `\\sum_{n=1}^{\\infty} \\frac{${a}}{${k}^{n}}`;
      return {
        prompt: { en: `Find ${m(s)}.`, ko: `${m(s)}의 값은?` },
        value: v,
        solution: {
          en: [`A geometric series with first term ${m(frac(a, k))} and ratio ${m(frac(1, k))}.`, `${m(`\\frac{${frac(a, k)}}{1 - ${frac(1, k)}} = ${v}`)}.`],
          ko: [`첫째항 ${m(frac(a, k))}, 공비 ${m(frac(1, k))}인 등비급수`, `${m(`\\frac{${frac(a, k)}}{1 - ${frac(1, k)}} = ${v}`)}`],
        },
      };
    },
  },
  'exam-exp-log-limit': {
    unit: 'calc2',
    points: 2,
    make: (r) => {
      const [b, v] = [r.int(1, 4), r.int(1, 5)];
      const a = b * v;
      const lim = `\\lim_{x \\to 0} \\frac{e^{${a}x} - 1}{\\ln(1 + ${b === 1 ? '' : b}x)}`;
      return {
        prompt: { en: `Find ${m(lim)}.`, ko: `${m(lim)}의 값은?` },
        value: v,
        solution: {
          en: [`${m(`\\frac{e^{${a}x} - 1}{${a}x} \\to 1`)} and ${m(`\\frac{\\ln(1 + ${b === 1 ? '' : b}x)}{${b === 1 ? '' : b}x} \\to 1`)}.`, `The limit is ${m(`\\frac{${a}}{${b}} = ${v}`)}.`],
          ko: [`${m(`\\frac{e^{${a}x} - 1}{${a}x} \\to 1`)}, ${m(`\\frac{\\ln(1 + ${b === 1 ? '' : b}x)}{${b === 1 ? '' : b}x} \\to 1`)}`, `극한값은 ${m(`\\frac{${a}}{${b}} = ${v}`)}`],
        },
      };
    },
  },
  'exam-parametric': {
    unit: 'calc2',
    points: 3,
    make: (r) => {
      const s = r.int(1, 3);
      let p = r.int(-4, 4);
      if (2 * s + p === 0) p++;
      const v = r.int(-5, 5);
      const q = v * (2 * s + p) - 3 * s * s;
      const curve = `x = ${polyTex([1, p, 0], 't')}, \\quad y = ${polyTex([1, 0, q, 0], 't')}`;
      return {
        prompt: { en: `For the curve ${m(curve)}, find ${m('\\frac{dy}{dx}')} at ${m(`t = ${s}`)}.`, ko: `매개변수 ${m('t')}로 나타내어진 곡선 ${m(curve)}에서 ${m(`t = ${s}`)}일 때, ${m('\\frac{dy}{dx}')}의 값은?` },
        value: v,
        solution: {
          en: [`${m(`\\frac{dy}{dx} = \\frac{3t^{2} ${plus(q)}}{2t ${plus(p)}}`)}.`, `At ${m(`t = ${s}`)}: ${m(`\\frac{${3 * s * s + q}}{${2 * s + p}} = ${v}`)}.`],
          ko: [`${m(`\\frac{dy}{dx} = \\frac{3t^{2} ${plus(q)}}{2t ${plus(p)}}`)}`, `${m(`t = ${s}`)}일 때 ${m(`\\frac{${3 * s * s + q}}{${2 * s + p}} = ${v}`)}`],
        },
      };
    },
  },
  'exam-log-integral': {
    unit: 'calc2',
    points: 3,
    make: (r) => {
      const [n, k] = r.pick([[1, 2], [1, 4], [1, 6], [2, 3], [2, 6], [3, 2], [3, 4]] as const);
      const value = k ** (n + 1) / (n + 1);
      const top = n === 1 ? '\\ln x' : `(\\ln x)^{${n}}`;
      const s = `\\int_{1}^{e^{${k}}} \\frac{${top}}{x}\\,dx`;
      return {
        prompt: { en: `Find ${m(s)}.`, ko: `${m(s)}의 값은?` },
        value,
        solution: {
          en: [`Let ${m('u = \\ln x')}: ${m('du = \\frac{1}{x}dx')}, and ${m('u')} runs from 0 to ${k}.`, `${m(`\\int_{0}^{${k}} u^{${n}}\\,du = \\frac{${k}^{${n + 1}}}{${n + 1}} = ${value}`)}.`],
          ko: [`${m('\\ln x = u')}로 치환하면 ${m('du = \\frac{1}{x}dx')}, ${m('u')}는 0에서 ${k}까지`, `${m(`\\int_{0}^{${k}} u^{${n}}\\,du = \\frac{${k}^{${n + 1}}}{${n + 1}} = ${value}`)}`],
        },
      };
    },
  },
  'exam-inverse-derivative': {
    unit: 'calc2',
    points: 4,
    make: (r) => {
      const [a, b, t] = [r.int(1, 5), r.int(-5, 5), r.int(-2, 2)];
      const Y = t ** 3 + a * t + b;
      const f = `f(x) = x^{3} + ${a === 1 ? '' : a}x ${plus(b)}`;
      return {
        prompt: {
          en: `Let ${m('g')} be the inverse of ${m(f)}. Find ${m(`\\frac{1}{g'(${Y})}`)}.`,
          ko: `함수 ${m(f)}의 역함수를 ${m('g(x)')}라 할 때, ${m(`\\frac{1}{g'(${Y})}`)}의 값은?`,
        },
        value: 3 * t * t + a,
        solution: {
          en: [`${m(`f(${t}) = ${Y}`)}, so ${m(`g(${Y}) = ${t}`)}.`, `${m(`g'(${Y}) = \\frac{1}{f'(${t})}`)} and ${m(`f'(${t}) = ${3 * t * t + a}`)}.`],
          ko: [`${m(`f(${t}) = ${Y}`)}이므로 ${m(`g(${Y}) = ${t}`)}`, `${m(`g'(${Y}) = \\frac{1}{f'(${t})}`)}이고 ${m(`f'(${t}) = ${3 * t * t + a}`)}`],
        },
      };
    },
  },

  // =============== 확률과 통계
  'exam-arrangements': {
    unit: 'stats',
    points: 2,
    make: (r) => {
      const counts = r.pick([[2, 2, 1], [3, 2, 1], [2, 2, 2], [3, 1, 1], [2, 1, 1, 1], [3, 2, 2], [4, 2, 1], [3, 3, 1]] as const);
      const letters = counts.flatMap((c, k) => Array.from({ length: c }, () => 'abcd'[k]!));
      const n = letters.length;
      const value = fact(n) / counts.reduce((p: number, c: number) => p * fact(c), 1);
      return {
        prompt: {
          en: `In how many ways can the ${n} letters ${m(letters.join(', '))} be put in a row?`,
          ko: `${n}개의 문자 ${m(letters.join(', '))}를 모두 일렬로 나열하는 경우의 수는?`,
        },
        value,
        solution: {
          en: [`Arrangements with repeats: ${m(`\\frac{${n}!}{${counts.map((c) => `${c}!`).join('\\,')}} = ${value}`)}.`],
          ko: [`같은 것이 있는 순열의 수: ${m(`\\frac{${n}!}{${counts.map((c) => `${c}!`).join('\\,')}} = ${value}`)}`],
        },
      };
    },
  },
  'exam-binomial-term': {
    unit: 'stats',
    points: 2,
    make: (r) => {
      if (r.int(0, 1)) {
        const n = r.int(4, 7);
        const k = r.int(1, 3);
        let rr = r.int(1, n - 1);
        while (C(n, rr) * k ** (n - rr) > 999) rr++;
        const value = C(n, rr) * k ** (n - rr);
        return {
          prompt: { en: `Find the coefficient of ${m(`x^{${rr}}`)} in the expansion of ${m(`(x + ${k})^{${n}}`)}.`, ko: `다항식 ${m(`(x + ${k})^{${n}}`)}의 전개식에서 ${m(`x^{${rr}}`)}의 계수는?` },
          value,
          solution: {
            en: [`The general term is ${m(`{}_{${n}}\\mathrm{C}_{r}\\,x^{r}\\,${k}^{${n} - r}`)}; take ${m(`r = ${rr}`)}.`, `${m(`{}_{${n}}\\mathrm{C}_{${rr}} \\times ${k}^{${n - rr}} = ${value}`)}.`],
            ko: [`일반항은 ${m(`{}_{${n}}\\mathrm{C}_{r}\\,x^{r}\\,${k}^{${n} - r}`)}, ${m(`r = ${rr}`)}일 때`, `${m(`{}_{${n}}\\mathrm{C}_{${rr}} \\times ${k}^{${n - rr}} = ${value}`)}`],
          },
        };
      }
      const [n, a] = [r.pick([4, 6]), r.int(1, 3)];
      const j = n / 2;
      const value = C(n, j) * a ** j;
      return {
        prompt: { en: `Find the constant term in the expansion of ${m(`\\left(x + \\frac{${a}}{x}\\right)^{${n}}`)}.`, ko: `${m(`\\left(x + \\frac{${a}}{x}\\right)^{${n}}`)}의 전개식에서 상수항은?` },
        value,
        solution: {
          en: [`The general term is ${m(`{}_{${n}}\\mathrm{C}_{r}\\,x^{${n} - r}\\left(\\frac{${a}}{x}\\right)^{r}`)}; the power of ${m('x')} is 0 when ${m(`r = ${j}`)}.`, `${m(`{}_{${n}}\\mathrm{C}_{${j}} \\times ${a}^{${j}} = ${value}`)}.`],
          ko: [`일반항 ${m(`{}_{${n}}\\mathrm{C}_{r}\\,x^{${n} - r}\\left(\\frac{${a}}{x}\\right)^{r}`)}에서 ${m(`r = ${j}`)}일 때 상수항`, `${m(`{}_{${n}}\\mathrm{C}_{${j}} \\times ${a}^{${j}} = ${value}`)}`],
        },
      };
    },
  },
  'exam-repeated-combination': {
    unit: 'stats',
    points: 3,
    make: (r) => {
      const vars = r.pick([3, 4]);
      const names = vars === 3 ? 'x + y + z' : 'x + y + z + w';
      const natural = r.int(0, 1) === 1;
      const n = vars === 3 ? r.int(natural ? 6 : 4, 14) : r.int(natural ? 6 : 3, 10);
      const value = natural ? C(n - 1, vars - 1) : C(n + vars - 1, vars - 1);
      const kind = natural ? { en: 'natural numbers', ko: '자연수' } : { en: 'non-negative integers', ko: '음이 아닌 정수' };
      return {
        prompt: {
          en: `How many ordered solutions in ${kind.en} does ${m(`${names} = ${n}`)} have?`,
          ko: `방정식 ${m(`${names} = ${n}`)}을 만족시키는 ${kind.ko} ${m(vars === 3 ? 'x, y, z' : 'x, y, z, w')}의 모든 순서쌍의 개수는?`,
        },
        value,
        solution: natural
          ? {
              en: [`Put ${m("x = x' + 1")} and so on: ${m(`x' + \\cdots = ${n - vars}`)} in non-negative integers.`, `${m(`{}_{${vars}}\\mathrm{H}_{${n - vars}} = {}_{${n - 1}}\\mathrm{C}_{${vars - 1}} = ${value}`)}.`],
              ko: [`${m("x = x' + 1")} 꼴로 놓으면 ${m(`x' + \\cdots = ${n - vars}`)}의 음이 아닌 정수해`, `${m(`{}_{${vars}}\\mathrm{H}_{${n - vars}} = {}_{${n - 1}}\\mathrm{C}_{${vars - 1}} = ${value}`)}`],
            }
          : {
              en: [`Repeated combinations: ${m(`{}_{${vars}}\\mathrm{H}_{${n}} = {}_{${n + vars - 1}}\\mathrm{C}_{${vars - 1}} = ${value}`)}.`],
              ko: [`중복조합의 수 ${m(`{}_{${vars}}\\mathrm{H}_{${n}} = {}_{${n + vars - 1}}\\mathrm{C}_{${vars - 1}} = ${value}`)}`],
            },
      };
    },
  },
  'exam-draw-probability': {
    unit: 'stats',
    points: 3,
    make: (r) => {
      const [red, blue] = [r.int(2, 6), r.int(2, 6)];
      const total = C(red + blue, 2);
      const same = C(red, 2) + C(blue, 2);
      const { q, p } = coprime(same, total);
      return {
        prompt: {
          en: `A bag holds ${red} red and ${blue} blue balls. Two are drawn at once; the probability they are the same colour is ${m('\\frac{q}{p}')}. ${pq.en}`,
          ko: `주머니에 빨간 공 ${red}개와 파란 공 ${blue}개가 들어 있다. 이 주머니에서 임의로 2개의 공을 동시에 꺼낼 때, 꺼낸 공이 서로 같은 색일 확률은 ${m('\\frac{q}{p}')}이다. ${m('p + q')}의 값은? ${pq.ko}`,
        },
        value: p + q,
        solution: {
          en: [`${m(`\\frac{{}_{${red}}\\mathrm{C}_{2} + {}_{${blue}}\\mathrm{C}_{2}}{{}_{${red + blue}}\\mathrm{C}_{2}} = \\frac{${same}}{${total}} = ${frac(same, total)}`)}.`, `${m(`p + q = ${p + q}`)}.`],
          ko: [`${m(`\\frac{{}_{${red}}\\mathrm{C}_{2} + {}_{${blue}}\\mathrm{C}_{2}}{{}_{${red + blue}}\\mathrm{C}_{2}} = \\frac{${same}}{${total}} = ${frac(same, total)}`)}`, `${m(`p + q = ${p + q}`)}`],
        },
      };
    },
  },
  'exam-conditional': {
    unit: 'stats',
    points: 4,
    make: (r) => {
      const [red, blue] = [r.int(2, 6), r.int(2, 6)];
      const atLeast = C(red + blue, 2) - C(blue, 2);
      const both = C(red, 2);
      const { q, p } = coprime(both, atLeast);
      return {
        prompt: {
          en: `A bag holds ${red} red and ${blue} blue balls. Two are drawn at once. Given that at least one is red, the probability both are red is ${m('\\frac{q}{p}')}. ${pq.en}`,
          ko: `주머니에 빨간 공 ${red}개와 파란 공 ${blue}개가 들어 있다. 이 주머니에서 임의로 2개의 공을 동시에 꺼낼 때, 꺼낸 공 중 빨간 공이 적어도 1개일 때, 꺼낸 공이 모두 빨간 공일 확률은 ${m('\\frac{q}{p}')}이다. ${m('p + q')}의 값은? ${pq.ko}`,
        },
        value: p + q,
        solution: {
          en: [`At least one red: ${m(`{}_{${red + blue}}\\mathrm{C}_{2} - {}_{${blue}}\\mathrm{C}_{2} = ${atLeast}`)} ways; both red: ${m(`{}_{${red}}\\mathrm{C}_{2} = ${both}`)}.`, `${m(`\\frac{${both}}{${atLeast}} = ${frac(both, atLeast)}`)}, so ${m(`p + q = ${p + q}`)}.`],
          ko: [`빨간 공이 적어도 1개인 경우 ${m(`{}_{${red + blue}}\\mathrm{C}_{2} - {}_{${blue}}\\mathrm{C}_{2} = ${atLeast}`)}, 모두 빨간 공인 경우 ${m(`{}_{${red}}\\mathrm{C}_{2} = ${both}`)}`, `${m(`\\frac{${both}}{${atLeast}} = ${frac(both, atLeast)}`)}이므로 ${m(`p + q = ${p + q}`)}`],
        },
      };
    },
  },
  'exam-binomial-dist': {
    unit: 'stats',
    points: 3,
    make: (r) => {
      const k = r.pick([2, 3, 4]);
      const n = k * k * r.int(1, k === 4 ? 4 : 6);
      const V = (n * (k - 1)) / (k * k);
      const E = n / k;
      if (r.int(0, 1)) {
        const a = r.int(2, 3);
        const b = r.int(-5, 5);
        return {
          prompt: {
            en: `A random variable ${m('X')} follows the binomial distribution ${m(`\\mathrm{B}\\left(${n}, \\frac{1}{${k}}\\right)`)}. Find ${m(`\\mathrm{V}(${a}X ${plus(b)})`)}.`,
            ko: `확률변수 ${m('X')}가 이항분포 ${m(`\\mathrm{B}\\left(${n}, \\frac{1}{${k}}\\right)`)}를 따를 때, ${m(`\\mathrm{V}(${a}X ${plus(b)})`)}의 값은?`,
          },
          value: a * a * V,
          solution: {
            en: [`${m(`\\mathrm{V}(X) = ${n} \\times \\frac{1}{${k}} \\times \\frac{${k - 1}}{${k}} = ${V}`)}.`, `${m(`\\mathrm{V}(${a}X ${plus(b)}) = ${a * a}\\mathrm{V}(X) = ${a * a * V}`)}.`],
            ko: [`${m(`\\mathrm{V}(X) = ${n} \\times \\frac{1}{${k}} \\times \\frac{${k - 1}}{${k}} = ${V}`)}`, `${m(`\\mathrm{V}(${a}X ${plus(b)}) = ${a * a}\\mathrm{V}(X) = ${a * a * V}`)}`],
          },
        };
      }
      return {
        prompt: {
          en: `A random variable ${m('X')} follows ${m(`\\mathrm{B}\\left(${n}, \\frac{1}{${k}}\\right)`)}. Find ${m('\\mathrm{E}(X^{2})')}.`,
          ko: `확률변수 ${m('X')}가 이항분포 ${m(`\\mathrm{B}\\left(${n}, \\frac{1}{${k}}\\right)`)}를 따를 때, ${m('\\mathrm{E}(X^{2})')}의 값은?`,
        },
        value: V + E * E,
        solution: {
          en: [`${m(`\\mathrm{E}(X) = ${E}`)}, ${m(`\\mathrm{V}(X) = ${V}`)}.`, `${m(`\\mathrm{E}(X^{2}) = \\mathrm{V}(X) + \\{\\mathrm{E}(X)\\}^{2} = ${V + E * E}`)}.`],
          ko: [`${m(`\\mathrm{E}(X) = ${E}`)}, ${m(`\\mathrm{V}(X) = ${V}`)}`, `${m(`\\mathrm{E}(X^{2}) = \\mathrm{V}(X) + \\{\\mathrm{E}(X)\\}^{2} = ${V + E * E}`)}`],
        },
      };
    },
  },
  'exam-dice': {
    unit: 'stats',
    points: 3,
    make: (r) => {
      const atLeast = r.int(0, 1) === 1;
      const s = atLeast ? r.int(8, 11) : r.int(3, 11);
      let count = 0;
      for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (atLeast ? a + b >= s : a + b === s) count++;
      const { q, p } = coprime(count, 36);
      const what = atLeast ? { en: `at least ${s}`, ko: `${s} 이상` } : { en: `${s}`, ko: `${s}` };
      return {
        prompt: {
          en: `Two dice are thrown. The probability that the sum of the numbers is ${what.en} is ${m('\\frac{q}{p}')}. ${pq.en}`,
          ko: `한 개의 주사위를 두 번 던질 때, 나온 두 눈의 수의 합이 ${what.ko}일 확률은 ${m('\\frac{q}{p}')}이다. ${m('p + q')}의 값은? ${pq.ko}`,
        },
        value: p + q,
        solution: {
          en: [`Of the 36 equally likely outcomes, ${count} have sum ${what.en}.`, `${m(`\\frac{${count}}{36} = ${frac(count, 36)}`)}, so ${m(`p + q = ${p + q}`)}.`],
          ko: [`모든 경우 36가지 중 합이 ${what.ko}인 경우는 ${count}가지`, `${m(`\\frac{${count}}{36} = ${frac(count, 36)}`)}이므로 ${m(`p + q = ${p + q}`)}`],
        },
      };
    },
  },
};
