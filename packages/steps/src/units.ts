/**
 * Problems by unit for the basic and advanced levels: 대수 (algebra),
 * 미적분Ⅰ (calculus), 미적분Ⅱ (calc2), 확률과 통계 (stats) and 기하
 * (geometry). Like the exam problems they have one number for an answer
 * and the working in both languages, but each asks for one idea (basic)
 * or two put together (advanced). GEOMETRY_EXAM adds 기하 to the
 * 평가원-style problems.
 */
import { frac, gcdInt, m, minus, plus, polyTex, type ExamTemplate } from './exam';

const C = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
};
const P = (n: number, k: number): number => {
  let r = 1;
  for (let i = 0; i < k; i++) r *= n - i;
  return r;
};
/** a probability n/d asked as q/p, p and q coprime: the answer is p + q */
const coprime = (n: number, d: number) => {
  const g = gcdInt(n, d) || 1;
  return { q: n / g, p: d / g };
};
const pq = {
  en: 'Write it as $$\\frac{q}{p}$$ with coprime natural numbers p and q, and give p + q.',
  ko: '(단, p와 q는 서로소인 자연수이다.)',
};
/** c·x as a coefficient in front of a letter: 3x, -x, x */
const coef = (c: number, v: string) => (c === 1 ? v : c === -1 ? `-${v}` : `${c}${v}`);
/** a coefficient in front of a function: 3e^x, -e^x, e^x */
const lead = (c: number) => (c === 1 ? '' : c === -1 ? '-' : String(c));
/** right triangles with whole sides: legs a, b and hypotenuse c */
const TRIPLES = [
  [3, 4, 5],
  [4, 3, 5],
  [6, 8, 10],
  [8, 6, 10],
  [5, 12, 13],
  [12, 5, 13],
] as const;
const vec = (a: readonly number[]) => `(${a.join(', ')})`;

// ======================================================================
// Basic: one idea each
// ======================================================================
export const BASIC_UNITS: Record<string, ExamTemplate> = {
  // ---------------- 수학Ⅰ
  'basic-alg-power': {
    unit: 'algebra',
    points: 2,
    make: (r) => {
      const n = r.pick([2, 3] as const);
      const c = r.pick(n === 2 ? [2, 3, 5] : [2, 3]);
      let k = r.int(1, n === 2 ? 5 : 4);
      if (gcdInt(k, n) !== 1) k += 1;
      while (c ** k > 999) k -= n;
      const base = c ** n;
      const value = c ** k;
      return {
        prompt: { en: `Find ${m(`${base}^{\\frac{${k}}{${n}}}`)}.`, ko: `${m(`${base}^{\\frac{${k}}{${n}}}`)}의 값은?` },
        value,
        solution: {
          en: [`${m(`${base} = ${c}^{${n}}`)}, so ${m(`${base}^{\\frac{${k}}{${n}}} = ${c}^{${n} \\times \\frac{${k}}{${n}}} = ${c}^{${k}} = ${value}`)}.`],
          ko: [`${m(`${base} = ${c}^{${n}}`)}이므로 ${m(`${base}^{\\frac{${k}}{${n}}} = ${c}^{${n} \\times \\frac{${k}}{${n}}} = ${c}^{${k}} = ${value}`)}`],
        },
      };
    },
  },
  'basic-alg-log': {
    unit: 'algebra',
    points: 2,
    make: (r) => {
      const b = r.pick([2, 3, 5] as const);
      const k = r.int(2, b === 2 ? 6 : 3);
      const p = r.pick(b === 2 ? [3, 5, 6, 7, 10] : b === 3 ? [2, 4, 5, 6] : [2, 3, 4, 6]);
      const second = frac(b ** k, p);
      return {
        prompt: { en: `Find ${m(`\\log_{${b}} ${p} + \\log_{${b}} ${second}`)}.`, ko: `${m(`\\log_{${b}} ${p} + \\log_{${b}} ${second}`)}의 값은?` },
        value: k,
        solution: {
          en: [`The sum of logs is the log of the product: ${m(`\\log_{${b}} \\left(${p} \\times ${second}\\right) = \\log_{${b}} ${b ** k} = ${k}`)}.`],
          ko: [`로그의 합은 곱의 로그이므로 ${m(`\\log_{${b}} \\left(${p} \\times ${second}\\right) = \\log_{${b}} ${b ** k} = ${k}`)}`],
        },
      };
    },
  },
  'basic-alg-arithmetic': {
    unit: 'algebra',
    points: 2,
    make: (r) => {
      const [a, d, n] = [r.int(-9, 9), r.nonzero(-5, 5), r.int(5, 15)];
      const value = a + (n - 1) * d;
      return {
        prompt: {
          en: `An arithmetic sequence has ${m(`a_{1} = ${a}`)} and common difference ${m(String(d))}. Find ${m(`a_{${n}}`)}.`,
          ko: `첫째항이 ${m(String(a))}이고 공차가 ${m(String(d))}인 등차수열 ${m('\\{a_{n}\\}')}에 대하여 ${m(`a_{${n}}`)}의 값은?`,
        },
        value,
        solution: {
          en: [`${m(`a_{n} = a_{1} + (n - 1)d`)}, so ${m(`a_{${n}} = ${a} + ${n - 1} \\times (${d}) = ${value}`)}.`],
          ko: [`${m(`a_{n} = a_{1} + (n - 1)d`)}이므로 ${m(`a_{${n}} = ${a} + ${n - 1} \\times (${d}) = ${value}`)}`],
        },
      };
    },
  },
  'basic-alg-trig': {
    unit: 'algebra',
    points: 2,
    make: (r) => {
      // values in halves: sin π/6 = 1/2 is 1
      const ANGLES = [
        ['\\sin\\frac{\\pi}{6}', 1],
        ['\\cos\\frac{\\pi}{3}', 1],
        ['\\cos\\frac{2}{3}\\pi', -1],
        ['\\sin\\frac{7}{6}\\pi', -1],
        ['\\tan\\frac{\\pi}{4}', 2],
        ['\\tan\\frac{3}{4}\\pi', -2],
        ['\\sin\\frac{\\pi}{2}', 2],
        ['\\cos\\pi', -2],
      ] as const;
      const first = r.pick(ANGLES);
      let second = r.pick(ANGLES);
      while (second[0] === first[0]) second = r.pick(ANGLES);
      const [a, b] = [2 * r.int(1, 3), 2 * r.nonzero(-3, 3)];
      const value = (a * first[1] + b * second[1]) / 2;
      const expr = `${a}${first[0]} ${b < 0 ? '-' : '+'} ${Math.abs(b)}${second[0]}`;
      const half = (h: number) => (h % 2 === 0 ? String(h / 2) : frac(h, 2));
      return {
        prompt: { en: `Find ${m(expr)}.`, ko: `${m(expr)}의 값은?` },
        value,
        solution: {
          en: [`${m(`${first[0]} = ${half(first[1])}`)} and ${m(`${second[0]} = ${half(second[1])}`)}.`, `${m(`${a} \\times \\left(${half(first[1])}\\right) ${b < 0 ? '-' : '+'} ${Math.abs(b)} \\times \\left(${half(second[1])}\\right) = ${value}`)}.`],
          ko: [`${m(`${first[0]} = ${half(first[1])}`)}, ${m(`${second[0]} = ${half(second[1])}`)}`, `${m(`${a} \\times \\left(${half(first[1])}\\right) ${b < 0 ? '-' : '+'} ${Math.abs(b)} \\times \\left(${half(second[1])}\\right) = ${value}`)}`],
        },
      };
    },
  },

  // ---------------- 수학Ⅱ
  'basic-calc-limit': {
    unit: 'calculus',
    points: 2,
    make: (r) => {
      const a = r.nonzero(-5, 5);
      let b = r.int(-6, 6);
      if (b === -a) b += 1;
      // (x − a)(x + b) over (x − a)
      const top = polyTex([1, b - a, -a * b]);
      const value = a + b;
      return {
        prompt: { en: `Find ${m(`\\lim_{x \\to ${a}} \\frac{${top}}{${minus('x', a)}}`)}.`, ko: `${m(`\\lim_{x \\to ${a}} \\frac{${top}}{${minus('x', a)}}`)}의 값은?` },
        value,
        solution: {
          en: [`Factor the top: ${m(`${top} = (${minus('x', a)})(${minus('x', -b)})`)}.`, `Cancel ${m(minus('x', a))}: the limit is ${m(`${a} ${plus(b)} = ${value}`)}.`],
          ko: [`분자를 인수분해하면 ${m(`${top} = (${minus('x', a)})(${minus('x', -b)})`)}`, `분모와 분자를 약분하면 극한값은 ${m(`${a} ${plus(b)} = ${value}`)}`],
        },
      };
    },
  },
  'basic-calc-derivative': {
    unit: 'calculus',
    points: 2,
    make: (r) => {
      const [p, q, s, t] = [r.nonzero(-3, 3), r.int(-5, 5), r.int(-6, 6), r.int(-9, 9)];
      const a = r.int(-3, 3);
      const value = 3 * p * a * a + 2 * q * a + s;
      return {
        prompt: {
          en: `For ${m(`f(x) = ${polyTex([p, q, s, t])}`)}, find ${m(`f'(${a})`)}.`,
          ko: `함수 ${m(`f(x) = ${polyTex([p, q, s, t])}`)}에 대하여 ${m(`f'(${a})`)}의 값은?`,
        },
        value,
        solution: {
          en: [`${m(`f'(x) = ${polyTex([3 * p, 2 * q, s])}`)}.`, `${m(`f'(${a}) = ${value}`)}.`],
          ko: [`${m(`f'(x) = ${polyTex([3 * p, 2 * q, s])}`)}`, `${m(`f'(${a}) = ${value}`)}`],
        },
      };
    },
  },
  'basic-calc-definite': {
    unit: 'calculus',
    points: 2,
    make: (r) => {
      const [c, d, e, k] = [r.nonzero(-2, 3), r.int(-3, 3), r.int(-5, 5), r.int(1, 3)];
      const integrand = polyTex([3 * c, 2 * d, e]);
      const value = c * k ** 3 + d * k * k + e * k;
      return {
        prompt: { en: `Find ${m(`\\int_{0}^{${k}} \\left(${integrand}\\right)dx`)}.`, ko: `${m(`\\int_{0}^{${k}} \\left(${integrand}\\right)dx`)}의 값은?` },
        value,
        solution: {
          en: [`An antiderivative is ${m(polyTex([c, d, e, 0]))}.`, `At ${m(`x = ${k}`)} minus at ${m('x = 0')}: ${m(String(value))}.`],
          ko: [`부정적분은 ${m(polyTex([c, d, e, 0]))}`, `${m(`x = ${k}`)}일 때의 값에서 ${m('x = 0')}일 때의 값을 빼면 ${m(String(value))}`],
        },
      };
    },
  },

  // ---------------- 미적분
  'basic-c2-seq-limit': {
    unit: 'calc2',
    points: 2,
    make: (r) => {
      const [c, v, b, d] = [r.int(1, 5), r.nonzero(-6, 6), r.int(-9, 9), r.int(1, 9)];
      const top = polyTex([c * v, b], 'n');
      const bottom = polyTex([c, d], 'n');
      return {
        prompt: { en: `Find ${m(`\\lim_{n \\to \\infty} \\frac{${top}}{${bottom}}`)}.`, ko: `${m(`\\lim_{n \\to \\infty} \\frac{${top}}{${bottom}}`)}의 값은?` },
        value: v,
        solution: {
          en: [`Divide top and bottom by ${m('n')}: ${m(`\\frac{${c * v} ${plus(b)}/n}{${c} ${plus(d)}/n} \\to \\frac{${c * v}}{${c}} = ${v}`)}.`],
          ko: [`분모, 분자를 ${m('n')}으로 나누면 ${m(`\\frac{${c * v} ${plus(b)}/n}{${c} ${plus(d)}/n} \\to \\frac{${c * v}}{${c}} = ${v}`)}`],
        },
      };
    },
  },
  'basic-c2-trig-limit': {
    unit: 'calc2',
    points: 2,
    make: (r) => {
      const [b, v] = [r.int(1, 4), r.int(1, 5)];
      const a = b * v;
      const fn = r.pick(['sin', 'tan'] as const);
      const lim = `\\lim_{x \\to 0} \\frac{\\${fn} ${a}x}{${b === 1 ? '' : b}x}`;
      return {
        prompt: { en: `Find ${m(lim)}.`, ko: `${m(lim)}의 값은?` },
        value: v,
        solution: {
          en: [`${m(`\\frac{\\${fn} ${a}x}{${a}x} \\to 1`)}, so the limit is ${m(`\\frac{${a}}{${b}} = ${v}`)}.`],
          ko: [`${m(`\\frac{\\${fn} ${a}x}{${a}x} \\to 1`)}이므로 극한값은 ${m(`\\frac{${a}}{${b}} = ${v}`)}`],
        },
      };
    },
  },
  'basic-c2-exp-derivative': {
    unit: 'calc2',
    points: 2,
    make: (r) => {
      const [k, a, c] = [r.int(1, 5), r.nonzero(-3, 3), r.int(-6, 6)];
      if (r.int(0, 1)) {
        // f(x) = k e^(ax) + c x  →  f'(0) = ka + c
        const value = k * a + c;
        const f = `${k === 1 ? '' : k}e^{${coef(a, 'x')}} ${c === 0 ? '' : c < 0 ? `- ${coef(-c, 'x')}` : `+ ${coef(c, 'x')}`}`.trim();
        return {
          prompt: { en: `For ${m(`f(x) = ${f}`)}, find ${m("f'(0)")}.`, ko: `함수 ${m(`f(x) = ${f}`)}에 대하여 ${m("f'(0)")}의 값은?` },
          value,
          solution: {
            en: [`${m(`f'(x) = ${lead(k * a)}e^{${coef(a, 'x')}} ${c === 0 ? '' : plus(c)}`)}.`, `${m(`f'(0) = ${k * a} ${plus(c)} = ${value}`)}.`],
            ko: [`${m(`f'(x) = ${lead(k * a)}e^{${coef(a, 'x')}} ${c === 0 ? '' : plus(c)}`)}`, `${m(`f'(0) = ${k * a} ${plus(c)} = ${value}`)}`],
          },
        };
      }
      // f(x) = k ln(ax + 1)... with a > 0 so it is defined at 0
      const b = Math.abs(a);
      const value = k * b;
      const f = `${k === 1 ? '' : k}\\ln(${coef(b, 'x')} + 1)`;
      return {
        prompt: { en: `For ${m(`f(x) = ${f}`)}, find ${m("f'(0)")}.`, ko: `함수 ${m(`f(x) = ${f}`)}에 대하여 ${m("f'(0)")}의 값은?` },
        value,
        solution: {
          en: [`${m(`f'(x) = \\frac{${k * b}}{${coef(b, 'x')} + 1}`)}.`, `${m(`f'(0) = ${value}`)}.`],
          ko: [`${m(`f'(x) = \\frac{${k * b}}{${coef(b, 'x')} + 1}`)}`, `${m(`f'(0) = ${value}`)}`],
        },
      };
    },
  },

  // ---------------- 확률과 통계
  'basic-st-perm': {
    unit: 'stats',
    points: 2,
    make: (r) => {
      const [n, k] = [r.int(4, 8), r.int(2, 3)];
      const comb = r.int(0, 1) === 1;
      const value = comb ? C(n, k) : P(n, k);
      const sym = comb ? `{}_{${n}}\\mathrm{C}_{${k}}` : `{}_{${n}}\\mathrm{P}_{${k}}`;
      const work = comb ? `\\frac{${Array.from({ length: k }, (_, j) => n - j).join(' \\times ')}}{${k}!}` : Array.from({ length: k }, (_, j) => n - j).join(' \\times ');
      return {
        prompt: { en: `Find ${m(sym)}.`, ko: `${m(sym)}의 값은?` },
        value,
        solution: { en: [`${m(`${sym} = ${work} = ${value}`)}.`], ko: [`${m(`${sym} = ${work} = ${value}`)}`] },
      };
    },
  },
  'basic-st-linear': {
    unit: 'stats',
    points: 2,
    make: (r) => {
      const [a, b] = [r.nonzero(-4, 4), r.int(-6, 6)];
      const [E, V] = [r.int(1, 9), r.int(1, 6)];
      const Y = `${coef(a, 'X')} ${b === 0 ? '' : plus(b)}`.trim();
      if (r.int(0, 1)) {
        const value = a * E + b;
        return {
          prompt: { en: `A random variable has ${m(`\\mathrm{E}(X) = ${E}`)}. Find ${m(`\\mathrm{E}(${Y})`)}.`, ko: `확률변수 ${m('X')}에 대하여 ${m(`\\mathrm{E}(X) = ${E}`)}일 때, ${m(`\\mathrm{E}(${Y})`)}의 값은?` },
          value,
          solution: { en: [`${m(`\\mathrm{E}(aX + b) = a\\mathrm{E}(X) + b = ${value}`)}.`], ko: [`${m(`\\mathrm{E}(aX + b) = a\\mathrm{E}(X) + b = ${value}`)}`] },
        };
      }
      const value = a * a * V;
      return {
        prompt: { en: `A random variable has ${m(`\\mathrm{V}(X) = ${V}`)}. Find ${m(`\\mathrm{V}(${Y})`)}.`, ko: `확률변수 ${m('X')}에 대하여 ${m(`\\mathrm{V}(X) = ${V}`)}일 때, ${m(`\\mathrm{V}(${Y})`)}의 값은?` },
        value,
        solution: { en: [`${m(`\\mathrm{V}(aX + b) = a^{2}\\mathrm{V}(X) = ${a * a} \\times ${V} = ${value}`)}.`], ko: [`${m(`\\mathrm{V}(aX + b) = a^{2}\\mathrm{V}(X) = ${a * a} \\times ${V} = ${value}`)}`] },
      };
    },
  },
  'basic-st-coins': {
    unit: 'stats',
    points: 2,
    make: (r) => {
      const n = r.int(3, 5);
      const k = r.int(1, n - 1);
      const { q, p } = coprime(C(n, k), 2 ** n);
      return {
        prompt: {
          en: `A coin is tossed ${n} times. The probability of exactly ${k} heads is ${m('\\frac{q}{p}')}. ${pq.en}`,
          ko: `한 개의 동전을 ${n}번 던질 때, 앞면이 정확히 ${k}번 나올 확률은 ${m('\\frac{q}{p}')}이다. ${m('p + q')}의 값은? ${pq.ko}`,
        },
        value: p + q,
        solution: {
          en: [`${m(`{}_{${n}}\\mathrm{C}_{${k}} \\left(\\frac{1}{2}\\right)^{${n}} = \\frac{${C(n, k)}}{${2 ** n}} = ${frac(C(n, k), 2 ** n)}`)}, so ${m(`p + q = ${p + q}`)}.`],
          ko: [`${m(`{}_{${n}}\\mathrm{C}_{${k}} \\left(\\frac{1}{2}\\right)^{${n}} = \\frac{${C(n, k)}}{${2 ** n}} = ${frac(C(n, k), 2 ** n)}`)}이므로 ${m(`p + q = ${p + q}`)}`],
        },
      };
    },
  },

  // ---------------- 기하
  'basic-geo-dot': {
    unit: 'geometry',
    points: 2,
    make: (r) => {
      const a = [r.nonzero(-5, 5), r.int(-5, 5)];
      const b = [r.int(-5, 5), r.nonzero(-5, 5)];
      const value = a[0]! * b[0]! + a[1]! * b[1]!;
      return {
        prompt: {
          en: `For ${m(`\\vec{a} = ${vec(a)}`)} and ${m(`\\vec{b} = ${vec(b)}`)}, find ${m('\\vec{a} \\cdot \\vec{b}')}.`,
          ko: `두 벡터 ${m(`\\vec{a} = ${vec(a)}`)}, ${m(`\\vec{b} = ${vec(b)}`)}에 대하여 ${m('\\vec{a} \\cdot \\vec{b}')}의 값은?`,
        },
        value,
        solution: {
          en: [`${m(`\\vec{a} \\cdot \\vec{b} = (${a[0]})(${b[0]}) + (${a[1]})(${b[1]}) = ${value}`)}.`],
          ko: [`${m(`\\vec{a} \\cdot \\vec{b} = (${a[0]})(${b[0]}) + (${a[1]})(${b[1]}) = ${value}`)}`],
        },
      };
    },
  },
  'basic-geo-length': {
    unit: 'geometry',
    points: 2,
    make: (r) => {
      const [x, y, len] = r.pick(TRIPLES);
      const sx = r.pick([1, -1]) * x;
      const sy = r.pick([1, -1]) * y;
      const a = [r.int(-5, 5), r.int(-5, 5)];
      const b = [sx - a[0]!, sy - a[1]!];
      return {
        prompt: {
          en: `For ${m(`\\vec{a} = ${vec(a)}`)} and ${m(`\\vec{b} = ${vec(b)}`)}, find ${m('|\\vec{a} + \\vec{b}|')}.`,
          ko: `두 벡터 ${m(`\\vec{a} = ${vec(a)}`)}, ${m(`\\vec{b} = ${vec(b)}`)}에 대하여 ${m('|\\vec{a} + \\vec{b}|')}의 값은?`,
        },
        value: len,
        solution: {
          en: [`${m(`\\vec{a} + \\vec{b} = (${sx}, ${sy})`)}.`, `${m(`|\\vec{a} + \\vec{b}| = \\sqrt{${sx * sx} + ${sy * sy}} = ${len}`)}.`],
          ko: [`${m(`\\vec{a} + \\vec{b} = (${sx}, ${sy})`)}`, `${m(`|\\vec{a} + \\vec{b}| = \\sqrt{${sx * sx} + ${sy * sy}} = ${len}`)}`],
        },
      };
    },
  },
  'basic-geo-conic': {
    unit: 'geometry',
    points: 2,
    make: (r) => {
      if (r.int(0, 1)) {
        const p = r.nonzero(-6, 6);
        return {
          prompt: {
            en: `The parabola ${m(`y^{2} = ${4 * p}x`)} has focus ${m('(a, 0)')}. Find ${m('a')}.`,
            ko: `포물선 ${m(`y^{2} = ${4 * p}x`)}의 초점의 좌표가 ${m('(a, 0)')}일 때, ${m('a')}의 값은?`,
          },
          value: p,
          solution: {
            en: [`${m('y^{2} = 4px')} has focus ${m('(p, 0)')}; here ${m(`4p = ${4 * p}`)}, so ${m(`p = ${p}`)}.`],
            ko: [`포물선 ${m('y^{2} = 4px')}의 초점은 ${m('(p, 0)')}이고 ${m(`4p = ${4 * p}`)}이므로 ${m(`p = ${p}`)}`],
          },
        };
      }
      // an ellipse with its foci on the x-axis: c² = a² − b²
      const [b, c, a] = r.pick([[4, 3, 5], [3, 4, 5], [8, 6, 10], [6, 8, 10], [12, 5, 13], [5, 12, 13]] as const);
      return {
        prompt: {
          en: `The ellipse ${m(`\\frac{x^{2}}{${a * a}} + \\frac{y^{2}}{${b * b}} = 1`)} has foci ${m('(c, 0)')} and ${m('(-c, 0)')} with ${m('c > 0')}. Find ${m('c')}.`,
          ko: `타원 ${m(`\\frac{x^{2}}{${a * a}} + \\frac{y^{2}}{${b * b}} = 1`)}의 두 초점의 좌표가 ${m('(c, 0)')}, ${m('(-c, 0)')}일 때, 양수 ${m('c')}의 값은?`,
        },
        value: c,
        solution: {
          en: [`${m(`c^{2} = ${a * a} - ${b * b} = ${c * c}`)}, so ${m(`c = ${c}`)}.`],
          ko: [`${m(`c^{2} = ${a * a} - ${b * b} = ${c * c}`)}이므로 ${m(`c = ${c}`)}`],
        },
      };
    },
  },
  'basic-geo-space': {
    unit: 'geometry',
    points: 2,
    make: (r) => {
      const [dx, dy, dz, d] = r.pick([[1, 2, 2, 3], [2, 3, 6, 7], [1, 4, 8, 9], [4, 4, 7, 9], [2, 6, 9, 11], [2, 1, 2, 3], [6, 2, 3, 7]] as const);
      const A = [r.int(-4, 4), r.int(-4, 4), r.int(-4, 4)];
      const s = [r.pick([1, -1]), r.pick([1, -1]), r.pick([1, -1])];
      const B = [A[0]! + s[0]! * dx, A[1]! + s[1]! * dy, A[2]! + s[2]! * dz];
      return {
        prompt: {
          en: `Find the distance between ${m(`\\mathrm{A}${vec(A)}`)} and ${m(`\\mathrm{B}${vec(B)}`)}.`,
          ko: `좌표공간의 두 점 ${m(`\\mathrm{A}${vec(A)}`)}, ${m(`\\mathrm{B}${vec(B)}`)} 사이의 거리는?`,
        },
        value: d,
        solution: {
          en: [`${m(`\\overline{\\mathrm{AB}} = \\sqrt{${dx}^{2} + ${dy}^{2} + ${dz}^{2}} = \\sqrt{${d * d}} = ${d}`)}.`],
          ko: [`${m(`\\overline{\\mathrm{AB}} = \\sqrt{${dx}^{2} + ${dy}^{2} + ${dz}^{2}} = \\sqrt{${d * d}} = ${d}`)}`],
        },
      };
    },
  },
};

// ======================================================================
// Advanced: two ideas each
// ======================================================================
export const ADVANCED_UNITS: Record<string, ExamTemplate> = {
  // ---------------- 수학Ⅰ
  'adv-alg-log-system': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const i = r.int(1, 8);
      let j = r.int(0, 8);
      if (j === i) j = (j + 3) % 9;
      const value = 2 ** i + 2 ** j;
      return {
        prompt: {
          en: `Positive numbers ${m('x, y')} satisfy ${m(`\\log_{2} x + \\log_{2} y = ${i + j}`)} and ${m(`\\log_{2} x - \\log_{2} y = ${i - j}`)}. Find ${m('x + y')}.`,
          ko: `두 양수 ${m('x, y')}가 ${m(`\\log_{2} x + \\log_{2} y = ${i + j}`)}, ${m(`\\log_{2} x - \\log_{2} y = ${i - j}`)}를 만족시킬 때, ${m('x + y')}의 값은?`,
        },
        value,
        solution: {
          en: [`Adding: ${m(`2\\log_{2} x = ${2 * i}`)}, so ${m(`x = 2^{${i}} = ${2 ** i}`)}.`, `Then ${m(`\\log_{2} y = ${j}`)}, ${m(`y = ${2 ** j}`)}, and ${m(`x + y = ${value}`)}.`],
          ko: [`두 식을 더하면 ${m(`2\\log_{2} x = ${2 * i}`)}이므로 ${m(`x = 2^{${i}} = ${2 ** i}`)}`, `${m(`\\log_{2} y = ${j}`)}에서 ${m(`y = ${2 ** j}`)}이므로 ${m(`x + y = ${value}`)}`],
        },
      };
    },
  },
  'adv-alg-geometric': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const [a, q] = [r.int(1, 3), r.pick([2, 3] as const)];
      const value = a * q ** 5;
      return {
        prompt: {
          en: `A geometric sequence of positive numbers has ${m(`a_{2} = ${a * q}`)} and ${m(`a_{4} = ${a * q ** 3}`)}. Find ${m('a_{6}')}.`,
          ko: `모든 항이 양수인 등비수열 ${m('\\{a_{n}\\}')}에 대하여 ${m(`a_{2} = ${a * q}`)}, ${m(`a_{4} = ${a * q ** 3}`)}일 때, ${m('a_{6}')}의 값은?`,
        },
        value,
        solution: {
          en: [`${m(`\\frac{a_{4}}{a_{2}} = r^{2} = ${q * q}`)}, so ${m(`r = ${q}`)}.`, `${m(`a_{6} = a_{4} r^{2} = ${a * q ** 3} \\times ${q * q} = ${value}`)}.`],
          ko: [`${m(`\\frac{a_{4}}{a_{2}} = r^{2} = ${q * q}`)}이므로 공비 ${m(`r = ${q}`)}`, `${m(`a_{6} = a_{4} r^{2} = ${a * q ** 3} \\times ${q * q} = ${value}`)}`],
        },
      };
    },
  },
  'adv-alg-sigma': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const [n, c] = [r.int(4, 10), r.nonzero(-5, 5)];
      const sq = (n * (n + 1) * (2 * n + 1)) / 6;
      const value = sq + c * n;
      const body = `k^{2} ${c === 0 ? '' : plus(c)}`.trim();
      return {
        prompt: { en: `Find ${m(`\\sum_{k=1}^{${n}} \\left(${body}\\right)`)}.`, ko: `${m(`\\sum_{k=1}^{${n}} \\left(${body}\\right)`)}의 값은?` },
        value,
        solution: {
          en: [`${m(`\\sum_{k=1}^{${n}} k^{2} = \\frac{${n} \\times ${n + 1} \\times ${2 * n + 1}}{6} = ${sq}`)}.`, `Add ${m(`${n} \\times (${c})`)}: ${m(String(value))}.`],
          ko: [`${m(`\\sum_{k=1}^{${n}} k^{2} = \\frac{${n} \\times ${n + 1} \\times ${2 * n + 1}}{6} = ${sq}`)}`, `여기에 ${m(`${n} \\times (${c})`)}를 더하면 ${m(String(value))}`],
        },
      };
    },
  },
  'adv-alg-trig-max': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const [a, b, R] = r.pick(TRIPLES);
      const c = r.nonzero(-6, 6);
      const value = R + c;
      const f = `${a}\\sin x + ${b}\\cos x ${c === 0 ? '' : plus(c)}`.trim();
      return {
        prompt: { en: `Find the maximum value of ${m(`f(x) = ${f}`)}.`, ko: `함수 ${m(`f(x) = ${f}`)}의 최댓값은?` },
        value,
        solution: {
          en: [`${m(`${a}\\sin x + ${b}\\cos x = ${R}\\sin(x + \\alpha)`)} with ${m(`\\sqrt{${a * a} + ${b * b}} = ${R}`)}.`, `Its largest value is ${m(String(R))}, so the maximum is ${m(`${R} ${plus(c)} = ${value}`)}.`],
          ko: [`${m(`${a}\\sin x + ${b}\\cos x = ${R}\\sin(x + \\alpha)`)} (${m(`\\sqrt{${a * a} + ${b * b}} = ${R}`)})`, `최댓값은 ${m(`${R} ${plus(c)} = ${value}`)}`],
        },
      };
    },
  },

  // ---------------- 수학Ⅱ
  'adv-calc-local-max': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      const [a, c] = [r.int(1, 3), r.int(-6, 6)];
      const value = 2 * a ** 3 + c;
      const f = polyTex([1, 0, -3 * a * a, c]);
      return {
        prompt: { en: `Find the local maximum value of ${m(`f(x) = ${f}`)}.`, ko: `함수 ${m(`f(x) = ${f}`)}의 극댓값은?` },
        value,
        solution: {
          en: [`${m(`f'(x) = 3x^{2} - ${3 * a * a} = 3(x + ${a})(x - ${a})`)}.`, `${m("f'")} changes from + to − at ${m(`x = -${a}`)}: ${m(`f(-${a}) = ${value}`)}.`],
          ko: [`${m(`f'(x) = 3x^{2} - ${3 * a * a} = 3(x + ${a})(x - ${a})`)}`, `${m(`x = -${a}`)}의 좌우에서 ${m("f'(x)")}의 부호가 양에서 음으로 바뀌므로 극댓값은 ${m(`f(-${a}) = ${value}`)}`],
        },
      };
    },
  },
  'adv-calc-tangent': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      const [a, b, c] = [r.nonzero(-4, 4), r.int(-5, 5), r.int(-9, 9)];
      const fa = a * a + b * a + c;
      const slope = 2 * a + b;
      const value = c - a * a;
      return {
        prompt: {
          en: `The tangent to ${m(`y = ${polyTex([1, b, c])}`)} at ${m(`x = ${a}`)} meets the y-axis at ${m('(0, k)')}. Find ${m('k')}.`,
          ko: `곡선 ${m(`y = ${polyTex([1, b, c])}`)} 위의 ${m(`x = ${a}`)}인 점에서의 접선의 ${m('y')}절편을 ${m('k')}라 할 때, ${m('k')}의 값은?`,
        },
        value,
        solution: {
          en: [`The point is ${m(`(${a}, ${fa})`)} and the slope is ${m(`y' = 2x ${plus(b)} = ${slope}`)}.`, `Tangent: ${m(`y = ${slope}(${minus('x', a)}) ${plus(fa)}`)}; at ${m('x = 0')}, ${m(`k = ${value}`)}.`],
          ko: [`접점은 ${m(`(${a}, ${fa})`)}, 기울기는 ${m(`y' = 2x ${plus(b)} = ${slope}`)}`, `접선 ${m(`y = ${slope}(${minus('x', a)}) ${plus(fa)}`)}에 ${m('x = 0')}을 대입하면 ${m(`k = ${value}`)}`],
        },
      };
    },
  },
  'adv-calc-area': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      const [a, k] = r.pick([[3, 2], [3, 4], [3, 6], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [1, 6], [2, 3], [2, 6], [4, 3]] as const);
      const value = (a * k ** 3) / 6;
      const f = polyTex([a, -a * k, 0]);
      return {
        prompt: {
          en: `Find the area enclosed by ${m(`y = ${f}`)} and the x-axis.`,
          ko: `곡선 ${m(`y = ${f}`)}와 ${m('x')}축으로 둘러싸인 부분의 넓이는?`,
        },
        value,
        solution: {
          en: [`${m(`${f} = ${a === 1 ? '' : a}x(x - ${k})`)} meets the x-axis at ${m('0')} and ${m(String(k))}, and is negative between.`, `${m(`\\int_{0}^{${k}} \\left\\{-(${f})\\right\\}dx = \\frac{${a} \\times ${k}^{3}}{6} = ${value}`)}.`],
          ko: [`${m(`${f} = ${a === 1 ? '' : a}x(x - ${k})`)}이므로 ${m('x')}축과 ${m('x = 0')}, ${m(`x = ${k}`)}에서 만나고 그 사이에서 음수`, `${m(`\\int_{0}^{${k}} \\left\\{-(${f})\\right\\}dx = \\frac{${a} \\times ${k}^{3}}{6} = ${value}`)}`],
        },
      };
    },
  },

  // ---------------- 미적분
  'adv-c2-chain': {
    unit: 'calc2',
    points: 3,
    make: (r) => {
      const [n, a] = [r.int(2, 4), r.int(0, 3)];
      const value = n * (1 + a) ** (n - 1) * 2;
      const inner = `x^{2} ${a === 0 ? '' : plus(a)}`.trim();
      return {
        prompt: { en: `For ${m(`f(x) = (${inner})^{${n}}`)}, find ${m("f'(1)")}.`, ko: `함수 ${m(`f(x) = (${inner})^{${n}}`)}에 대하여 ${m("f'(1)")}의 값은?` },
        value,
        solution: {
          en: [`By the chain rule ${m(`f'(x) = ${n}(${inner})^{${n - 1}} \\times 2x`)}.`, `${m(`f'(1) = ${n} \\times ${1 + a}^{${n - 1}} \\times 2 = ${value}`)}.`],
          ko: [`합성함수의 미분법에 의하여 ${m(`f'(x) = ${n}(${inner})^{${n - 1}} \\times 2x`)}`, `${m(`f'(1) = ${n} \\times ${1 + a}^{${n - 1}} \\times 2 = ${value}`)}`],
        },
      };
    },
  },
  'adv-c2-quotient': {
    unit: 'calc2',
    points: 3,
    make: (r) => {
      const [c, v, a] = [r.int(1, 3), r.nonzero(-5, 5), r.nonzero(-5, 5)];
      const b = a * c - v * c * c;
      const top = polyTex([a, b]);
      const value = v;
      return {
        prompt: { en: `For ${m(`f(x) = \\frac{${top}}{${minus('x', -c)}}`)}, find ${m("f'(0)")}.`, ko: `함수 ${m(`f(x) = \\frac{${top}}{${minus('x', -c)}}`)}에 대하여 ${m("f'(0)")}의 값은?` },
        value,
        solution: {
          en: [`${m(`f'(x) = \\frac{${a}(${minus('x', -c)}) - (${top})}{(${minus('x', -c)})^{2}}`)}.`, `${m(`f'(0) = \\frac{${a * c} - (${b})}{${c * c}} = ${value}`)}.`],
          ko: [`${m(`f'(x) = \\frac{${a}(${minus('x', -c)}) - (${top})}{(${minus('x', -c)})^{2}}`)}`, `${m(`f'(0) = \\frac{${a * c} - (${b})}{${c * c}} = ${value}`)}`],
        },
      };
    },
  },
  'adv-c2-telescoping': {
    unit: 'calc2',
    points: 3,
    make: (r) => {
      const [p, v] = [r.int(0, 3), r.int(1, 6)];
      const c = v * (p + 1);
      const term = `\\frac{${c}}{(n ${p === 0 ? '' : plus(p)})(n ${plus(p + 1)})}`.replace('(n )', 'n');
      return {
        prompt: { en: `Find ${m(`\\sum_{n=1}^{\\infty} ${term}`)}.`, ko: `${m(`\\sum_{n=1}^{\\infty} ${term}`)}의 값은?` },
        value: v,
        solution: {
          en: [`${m(`${term} = ${c}\\left(\\frac{1}{n ${p === 0 ? '' : plus(p)}} - \\frac{1}{n ${plus(p + 1)}}\\right)`)}, so the partial sums telescope.`, `The sum is ${m(`${c} \\times \\frac{1}{${p + 1}} = ${v}`)}.`],
          ko: [`${m(`${term} = ${c}\\left(\\frac{1}{n ${p === 0 ? '' : plus(p)}} - \\frac{1}{n ${plus(p + 1)}}\\right)`)}이므로 부분합에서 항이 차례로 지워진다`, `급수의 합은 ${m(`${c} \\times \\frac{1}{${p + 1}} = ${v}`)}`],
        },
      };
    },
  },

  // ---------------- 확률과 통계
  'adv-st-binomial': {
    unit: 'stats',
    points: 3,
    make: (r) => {
      const [d, step] = r.pick([[2, 4], [3, 9], [4, 16]] as const);
      const n = step * r.int(1, d === 4 ? 2 : 4);
      const E = n / d;
      const V = (n * (d - 1)) / (d * d);
      const value = E + V;
      return {
        prompt: {
          en: `${m('X')} follows the binomial distribution ${m(`\\mathrm{B}\\left(${n}, \\frac{1}{${d}}\\right)`)}. Find ${m('\\mathrm{E}(X) + \\mathrm{V}(X)')}.`,
          ko: `확률변수 ${m('X')}가 이항분포 ${m(`\\mathrm{B}\\left(${n}, \\frac{1}{${d}}\\right)`)}를 따를 때, ${m('\\mathrm{E}(X) + \\mathrm{V}(X)')}의 값은?`,
        },
        value,
        solution: {
          en: [`${m(`\\mathrm{E}(X) = ${n} \\times \\frac{1}{${d}} = ${E}`)}, ${m(`\\mathrm{V}(X) = ${n} \\times \\frac{1}{${d}} \\times \\frac{${d - 1}}{${d}} = ${V}`)}.`, `Their sum is ${m(String(value))}.`],
          ko: [`${m(`\\mathrm{E}(X) = ${n} \\times \\frac{1}{${d}} = ${E}`)}, ${m(`\\mathrm{V}(X) = ${n} \\times \\frac{1}{${d}} \\times \\frac{${d - 1}}{${d}} = ${V}`)}`, `따라서 ${m(String(value))}`],
        },
      };
    },
  },
  'adv-st-union': {
    unit: 'stats',
    points: 3,
    make: (r) => {
      // in twelfths: P(A), P(B), P(A∪B), and P(A∩B) = a + b − u > 0
      let a = 0;
      let b = 0;
      let u = 0;
      do {
        a = r.int(2, 8);
        b = r.int(2, 8);
        u = r.int(Math.max(a, b), 11);
      } while (a + b - u <= 0 || a + b - u > Math.min(a, b));
      const both = a + b - u;
      const { q, p } = coprime(both, 12);
      const f = (n: number) => frac(n, 12);
      const reduced = both === q && p === 12 ? '' : ` = ${f(both)}`;
      return {
        prompt: {
          en: `Events ${m('A, B')} have ${m(`\\mathrm{P}(A) = ${f(a)}`)}, ${m(`\\mathrm{P}(B) = ${f(b)}`)} and ${m(`\\mathrm{P}(A \\cup B) = ${f(u)}`)}. ${m('\\mathrm{P}(A \\cap B)')} is ${m('\\frac{q}{p}')}. ${pq.en}`,
          ko: `두 사건 ${m('A, B')}에 대하여 ${m(`\\mathrm{P}(A) = ${f(a)}`)}, ${m(`\\mathrm{P}(B) = ${f(b)}`)}, ${m(`\\mathrm{P}(A \\cup B) = ${f(u)}`)}일 때, ${m('\\mathrm{P}(A \\cap B) = \\frac{q}{p}')}이다. ${m('p + q')}의 값은? ${pq.ko}`,
        },
        value: p + q,
        solution: {
          en: [`${m('\\mathrm{P}(A \\cap B) = \\mathrm{P}(A) + \\mathrm{P}(B) - \\mathrm{P}(A \\cup B)')} ${m(`= \\frac{${both}}{12}${reduced}`)}.`, `${m(`p + q = ${p + q}`)}.`],
          ko: [`${m('\\mathrm{P}(A \\cap B) = \\mathrm{P}(A) + \\mathrm{P}(B) - \\mathrm{P}(A \\cup B)')} ${m(`= \\frac{${both}}{12}${reduced}`)}`, `${m(`p + q = ${p + q}`)}`],
        },
      };
    },
  },
  'adv-st-repeated': {
    unit: 'stats',
    points: 3,
    make: (r) => {
      const [n, k] = [r.int(2, 4), r.int(3, 7)];
      const value = C(n + k - 1, k);
      return {
        prompt: {
          en: `In how many ways can ${m(String(k))} identical balls be put into ${m(String(n))} different boxes (a box may stay empty)?`,
          ko: `서로 같은 공 ${m(String(k))}개를 서로 다른 상자 ${m(String(n))}개에 남김없이 나누어 넣는 경우의 수는? (단, 빈 상자가 있을 수 있다.)`,
        },
        value,
        solution: {
          en: [`Repeated combinations: ${m(`{}_{${n}}\\mathrm{H}_{${k}} = {}_{${n + k - 1}}\\mathrm{C}_{${k}} = ${value}`)}.`],
          ko: [`중복조합의 수 ${m(`{}_{${n}}\\mathrm{H}_{${k}} = {}_{${n + k - 1}}\\mathrm{C}_{${k}} = ${value}`)}`],
        },
      };
    },
  },

  // ---------------- 기하
  'adv-geo-vector-norms': {
    unit: 'geometry',
    points: 3,
    make: (r) => {
      const [p, q] = [r.int(1, 5), r.int(1, 5)];
      const R = r.int((p - q) ** 2 + 1, (p + q) ** 2 - 1);
      const root = Math.sqrt(R);
      const shown = Number.isInteger(root) ? String(root) : `\\sqrt{${R}}`;
      const value = 2 * p * p + 2 * q * q - R;
      return {
        prompt: {
          en: `Vectors with ${m(`|\\vec{a}| = ${p}`)}, ${m(`|\\vec{b}| = ${q}`)} and ${m(`|\\vec{a} + \\vec{b}| = ${shown}`)}. Find ${m('|\\vec{a} - \\vec{b}|^{2}')}.`,
          ko: `두 벡터 ${m('\\vec{a}, \\vec{b}')}에 대하여 ${m(`|\\vec{a}| = ${p}`)}, ${m(`|\\vec{b}| = ${q}`)}, ${m(`|\\vec{a} + \\vec{b}| = ${shown}`)}일 때, ${m('|\\vec{a} - \\vec{b}|^{2}')}의 값은?`,
        },
        value,
        solution: {
          en: [`${m('|\\vec{a} + \\vec{b}|^{2} + |\\vec{a} - \\vec{b}|^{2} = 2|\\vec{a}|^{2} + 2|\\vec{b}|^{2}')}.`, `${m(`|\\vec{a} - \\vec{b}|^{2} = ${2 * p * p} + ${2 * q * q} - ${R} = ${value}`)}.`],
          ko: [`${m('|\\vec{a} + \\vec{b}|^{2} + |\\vec{a} - \\vec{b}|^{2} = 2|\\vec{a}|^{2} + 2|\\vec{b}|^{2}')}`, `${m(`|\\vec{a} - \\vec{b}|^{2} = ${2 * p * p} + ${2 * q * q} - ${R} = ${value}`)}`],
        },
      };
    },
  },
  'adv-geo-hyperbola': {
    unit: 'geometry',
    points: 3,
    make: (r) => {
      const [a, b, c] = r.pick(TRIPLES);
      const value = 2 * c;
      return {
        prompt: {
          en: `Find the distance between the foci of the hyperbola ${m(`\\frac{x^{2}}{${a * a}} - \\frac{y^{2}}{${b * b}} = 1`)}.`,
          ko: `쌍곡선 ${m(`\\frac{x^{2}}{${a * a}} - \\frac{y^{2}}{${b * b}} = 1`)}의 두 초점 사이의 거리는?`,
        },
        value,
        solution: {
          en: [`For a hyperbola ${m(`c^{2} = a^{2} + b^{2} = ${a * a} + ${b * b} = ${c * c}`)}, so ${m(`c = ${c}`)}.`, `The foci are ${m(`(\\pm ${c}, 0)`)}, ${m(String(value))} apart.`],
          ko: [`쌍곡선에서 ${m(`c^{2} = a^{2} + b^{2} = ${a * a} + ${b * b} = ${c * c}`)}이므로 ${m(`c = ${c}`)}`, `두 초점 ${m(`(\\pm ${c}, 0)`)} 사이의 거리는 ${m(String(value))}`],
        },
      };
    },
  },
  'adv-geo-sphere': {
    unit: 'geometry',
    points: 3,
    make: (r) => {
      const [h, k, l, R] = [r.int(-4, 4), r.int(-4, 4), r.int(-4, 4), r.int(1, 6)];
      const d = h * h + k * k + l * l - R * R;
      const lin = (c: number, v: string) => (c === 0 ? '' : ` ${c < 0 ? '-' : '+'} ${coef(Math.abs(c), v)}`);
      const eq = `x^{2} + y^{2} + z^{2}${lin(-2 * h, 'x')}${lin(-2 * k, 'y')}${lin(-2 * l, 'z')}${d === 0 ? '' : ` ${plus(d)}`} = 0`;
      return {
        prompt: { en: `Find the radius of the sphere ${m(eq)}.`, ko: `구 ${m(eq)}의 반지름의 길이는?` },
        value: R,
        solution: {
          en: [`Completing the squares: ${m(`(${minus('x', h)})^{2} + (${minus('y', k)})^{2} + (${minus('z', l)})^{2} = ${R * R}`)}.`, `The radius is ${m(String(R))}.`],
          ko: [`완전제곱식으로 고치면 ${m(`(${minus('x', h)})^{2} + (${minus('y', k)})^{2} + (${minus('z', l)})^{2} = ${R * R}`)}`, `반지름의 길이는 ${m(String(R))}`],
        },
      };
    },
  },
};

// ======================================================================
// 기하, 평가원 style
// ======================================================================
export const GEOMETRY_EXAM: Record<string, ExamTemplate> = {
  'exam-geo-parabola': {
    unit: 'geometry',
    points: 3,
    make: (r) => {
      const p = r.int(1, 5);
      const x = r.int(1, 8);
      const d = x + p;
      const value = 4 * p * x;
      return {
        prompt: {
          en: `${m('\\mathrm{F}')} is the focus of the parabola ${m(`y^{2} = ${4 * p}x`)}, and ${m('\\mathrm{P}(a, b)')} is a point on it with ${m(`\\overline{\\mathrm{PF}} = ${d}`)}. Find ${m('b^{2}')}.`,
          ko: `포물선 ${m(`y^{2} = ${4 * p}x`)}의 초점을 ${m('\\mathrm{F}')}라 하자. 이 포물선 위의 점 ${m('\\mathrm{P}(a, b)')}에 대하여 ${m(`\\overline{\\mathrm{PF}} = ${d}`)}일 때, ${m('b^{2}')}의 값은?`,
        },
        value,
        solution: {
          en: [`The distance to the focus equals the distance to the directrix ${m(`x = -${p}`)}: ${m(`a + ${p} = ${d}`)}, so ${m(`a = ${x}`)}.`, `${m(`b^{2} = ${4 * p} \\times ${x} = ${value}`)}.`],
          ko: [`포물선의 정의에 의하여 점 ${m('\\mathrm{P}')}에서 준선 ${m(`x = -${p}`)}까지의 거리도 ${m(String(d))}이므로 ${m(`a + ${p} = ${d}`)}, ${m(`a = ${x}`)}`, `${m(`b^{2} = ${4 * p} \\times ${x} = ${value}`)}`],
        },
      };
    },
  },
  'exam-geo-ellipse-triangle': {
    unit: 'geometry',
    points: 3,
    make: (r) => {
      const [b, c, a] = r.pick([[4, 3, 5], [3, 4, 5], [8, 6, 10], [6, 8, 10], [12, 5, 13], [5, 12, 13], [15, 8, 17], [8, 15, 17]] as const);
      const value = 2 * a + 2 * c;
      return {
        prompt: {
          en: `${m('\\mathrm{F}, \\mathrm{F}\'')} are the foci of the ellipse ${m(`\\frac{x^{2}}{${a * a}} + \\frac{y^{2}}{${b * b}} = 1`)}, and ${m('\\mathrm{P}')} is a point on it, not on the x-axis. Find the perimeter of triangle ${m('\\mathrm{PFF\'}')}.`,
          ko: `타원 ${m(`\\frac{x^{2}}{${a * a}} + \\frac{y^{2}}{${b * b}} = 1`)}의 두 초점을 ${m('\\mathrm{F}, \\mathrm{F}\'')}이라 하자. 이 타원 위의 점 ${m('\\mathrm{P}')}에 대하여 삼각형 ${m('\\mathrm{PFF\'}')}의 둘레의 길이는? (단, 점 ${m('\\mathrm{P}')}는 ${m('x')}축 위에 있지 않다.)`,
        },
        value,
        solution: {
          en: [`On the ellipse ${m(`\\overline{\\mathrm{PF}} + \\overline{\\mathrm{PF\'}} = 2 \\times ${a} = ${2 * a}`)}.`, `${m(`c^{2} = ${a * a} - ${b * b}`)} gives ${m(`c = ${c}`)}, so ${m(`\\overline{\\mathrm{FF\'}} = ${2 * c}`)} and the perimeter is ${m(String(value))}.`],
          ko: [`타원의 정의에 의하여 ${m(`\\overline{\\mathrm{PF}} + \\overline{\\mathrm{PF\'}} = 2 \\times ${a} = ${2 * a}`)}`, `${m(`c^{2} = ${a * a} - ${b * b}`)}에서 ${m(`c = ${c}`)}이므로 ${m(`\\overline{\\mathrm{FF\'}} = ${2 * c}`)}, 둘레의 길이는 ${m(String(value))}`],
        },
      };
    },
  },
  'exam-geo-hyperbola-point': {
    unit: 'geometry',
    points: 3,
    make: (r) => {
      const [a, b, c] = r.pick(TRIPLES);
      // P on the right branch: PF' − PF = 2a, and PF ≥ c − a
      const far = a + c + r.int(0, 8);
      const value = far - 2 * a;
      return {
        prompt: {
          en: `${m('\\mathrm{F}(c, 0)')} and ${m("\\mathrm{F}'(-c, 0)")} (${m('c > 0')}) are the foci of ${m(`\\frac{x^{2}}{${a * a}} - \\frac{y^{2}}{${b * b}} = 1`)}. ${m('\\mathrm{P}')} is on the branch with ${m('x > 0')} and ${m(`\\overline{\\mathrm{PF\'}} = ${far}`)}. Find ${m('\\overline{\\mathrm{PF}}')}.`,
          ko: `두 초점이 ${m('\\mathrm{F}(c, 0)')}, ${m("\\mathrm{F}'(-c, 0)")} (${m('c > 0')})인 쌍곡선 ${m(`\\frac{x^{2}}{${a * a}} - \\frac{y^{2}}{${b * b}} = 1`)} 위의 점 ${m('\\mathrm{P}')}의 ${m('x')}좌표가 양수이고 ${m(`\\overline{\\mathrm{PF\'}} = ${far}`)}일 때, ${m('\\overline{\\mathrm{PF}}')}의 값은?`,
        },
        value,
        solution: {
          en: [`On the branch nearer ${m('\\mathrm{F}')}: ${m(`\\overline{\\mathrm{PF\'}} - \\overline{\\mathrm{PF}} = 2 \\times ${a} = ${2 * a}`)}.`, `${m(`\\overline{\\mathrm{PF}} = ${far} - ${2 * a} = ${value}`)}.`],
          ko: [`쌍곡선의 정의에 의하여 ${m(`\\overline{\\mathrm{PF\'}} - \\overline{\\mathrm{PF}} = 2 \\times ${a} = ${2 * a}`)}`, `${m(`\\overline{\\mathrm{PF}} = ${far} - ${2 * a} = ${value}`)}`],
        },
      };
    },
  },
  'exam-geo-perpendicular': {
    unit: 'geometry',
    points: 2,
    make: (r) => {
      const p = r.nonzero(-4, 4);
      const q = r.nonzero(-5, 5);
      const s = p * r.nonzero(-3, 3);
      const k = (-q * s) / p;
      return {
        prompt: {
          en: `Vectors ${m(`\\vec{a} = (k, ${s})`)} and ${m(`\\vec{b} = (${p}, ${q})`)} are perpendicular. Find ${m('k')}.`,
          ko: `두 벡터 ${m(`\\vec{a} = (k, ${s})`)}, ${m(`\\vec{b} = (${p}, ${q})`)}가 서로 수직일 때, ${m('k')}의 값은?`,
        },
        value: k,
        solution: {
          en: [`Perpendicular means ${m('\\vec{a} \\cdot \\vec{b} = 0')}: ${m(`${coef(p, 'k')} ${plus(q * s)} = 0`)}.`, `${m(`k = ${k}`)}.`],
          ko: [`두 벡터가 수직이므로 ${m('\\vec{a} \\cdot \\vec{b} = 0')}, ${m(`${coef(p, 'k')} ${plus(q * s)} = 0`)}`, `${m(`k = ${k}`)}`],
        },
      };
    },
  },
  'exam-geo-projection-points': {
    unit: 'geometry',
    points: 2,
    make: (r) => {
      const [a, b, c] = [r.nonzero(-6, 6), r.nonzero(-6, 6), r.nonzero(-6, 6)];
      const value = a * a + c * c;
      return {
        prompt: {
          en: `${m('\\mathrm{B}')} and ${m('\\mathrm{C}')} are where ${m(`\\mathrm{A}(${a}, ${b}, ${c})`)} projects onto the xy-plane and the yz-plane. Find ${m('\\overline{\\mathrm{BC}}^{2}')}.`,
          ko: `좌표공간의 점 ${m(`\\mathrm{A}(${a}, ${b}, ${c})`)}에서 ${m('xy')}평면과 ${m('yz')}평면에 내린 수선의 발을 각각 ${m('\\mathrm{B}, \\mathrm{C}')}라 할 때, ${m('\\overline{\\mathrm{BC}}^{2}')}의 값은?`,
        },
        value,
        solution: {
          en: [`${m(`\\mathrm{B}(${a}, ${b}, 0)`)} and ${m(`\\mathrm{C}(0, ${b}, ${c})`)}.`, `${m(`\\overline{\\mathrm{BC}}^{2} = ${a * a} + 0 + ${c * c} = ${value}`)}.`],
          ko: [`${m(`\\mathrm{B}(${a}, ${b}, 0)`)}, ${m(`\\mathrm{C}(0, ${b}, ${c})`)}`, `${m(`\\overline{\\mathrm{BC}}^{2} = ${a * a} + 0 + ${c * c} = ${value}`)}`],
        },
      };
    },
  },
  'exam-geo-projection-area': {
    unit: 'geometry',
    points: 4,
    make: (r) => {
      // a triangle with whole sides whose area is whole, tilted by θ: area × cos θ
      const [legs, angle, cosTex, num, den] = r.pick([
        [[6, 8], '\\frac{\\pi}{3}', '\\frac{1}{2}', 1, 2],
        [[4, 6], '\\frac{\\pi}{3}', '\\frac{1}{2}', 1, 2],
        [[6, 10], '\\frac{\\pi}{3}', '\\frac{1}{2}', 1, 2],
        [[8, 12], '\\frac{\\pi}{3}', '\\frac{1}{2}', 1, 2],
      ] as const);
      const k = r.int(1, 3);
      const [x, y] = [legs[0] * k, legs[1] * k];
      const area = (x * y) / 2;
      const value = (area * num) / den;
      return {
        prompt: {
          en: `A right triangle with legs ${m(String(x))} and ${m(String(y))} lies in a plane that makes the angle ${m(angle)} with the plane ${m('\\alpha')}. Find the area of its orthogonal projection onto ${m('\\alpha')}.`,
          ko: `두 변의 길이가 ${m(String(x))}, ${m(String(y))}이고 그 끼인각이 직각인 삼각형이 평면 ${m('\\alpha')}와 이루는 각의 크기가 ${m(angle)}인 평면 위에 있다. 이 삼각형의 평면 ${m('\\alpha')} 위로의 정사영의 넓이는?`,
        },
        value,
        solution: {
          en: [`The triangle's area is ${m(`\\frac{1}{2} \\times ${x} \\times ${y} = ${area}`)}.`, `The projection has area ${m(`${area} \\times \\cos ${angle} = ${area} \\times ${cosTex} = ${value}`)}.`],
          ko: [`삼각형의 넓이는 ${m(`\\frac{1}{2} \\times ${x} \\times ${y} = ${area}`)}`, `정사영의 넓이는 ${m(`${area} \\times \\cos ${angle} = ${area} \\times ${cosTex} = ${value}`)}`],
        },
      };
    },
  },
};
