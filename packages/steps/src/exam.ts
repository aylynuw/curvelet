/**
 * Exam-style problems in the manner of the Korean CSAT (수능, set by 평가원):
 * a short sentence with the conditions, one whole-number answer (단답형),
 * and 2, 3 or 4 points. Each template picks the answer's ingredients first
 * and builds the conditions from them, so every problem has a clean answer.
 *
 * Text is written for the worksheet's rich text: $$…$$ is LaTeX.
 */

export type Unit = 'algebra' | 'calculus' | 'calc2' | 'stats' | 'geometry';
export type Rng = {
  int: (lo: number, hi: number) => number;
  nonzero: (lo: number, hi: number) => number;
  pick: <T>(list: readonly T[]) => T;
};
export interface ExamMade {
  prompt: { en: string; ko: string };
  value: number;
  /** the working, one line per step, in both languages */
  solution: { en: string[]; ko: string[] };
}
export interface ExamTemplate {
  unit: Unit;
  points: 2 | 3 | 4;
  make: (r: Rng) => ExamMade;
}

// ---- LaTeX helpers
/** c·body as the next term of a sum: "+ 3x", "- x", "+ 5" */
export function term(c: number, body: string, first: boolean): string {
  if (c === 0) return '';
  const a = Math.abs(c);
  const coef = body && a === 1 ? '' : String(a);
  const sign = c < 0 ? (first ? '-' : ' - ') : first ? '' : ' + ';
  return `${sign}${coef}${body}`;
}
/** coefficients from the highest power down: [1, 0, -3, 2] → x^{3} - 3x + 2 */
export function polyTex(coeffs: number[], v = 'x'): string {
  const n = coeffs.length - 1;
  let out = '';
  coeffs.forEach((c, k) => {
    const p = n - k;
    const body = p === 0 ? '' : p === 1 ? v : `${v}^{${p}}`;
    const t = term(c, body, out === '');
    out += t;
  });
  return out || '0';
}
/** x − a written properly: x - 2, x + 3 */
export const minus = (v: string, a: number) => (a === 0 ? v : a > 0 ? `${v} - ${a}` : `${v} + ${-a}`);
/** a number added on: + 3, - 3 */
export const plus = (a: number) => (a < 0 ? `- ${-a}` : `+ ${a}`);
export const frac = (n: number, d: number) => {
  const g = gcdInt(Math.abs(n), Math.abs(d)) || 1;
  const [p, q] = [n / g, d / g];
  if (q === 1) return String(p);
  return `${p < 0 ? '-' : ''}\\frac{${Math.abs(p)}}{${q}}`;
};
export function gcdInt(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}
export const m = (tex: string) => `$$${tex}$$`;

export const EXAM_TEMPLATES: Record<string, ExamTemplate> = {
  // ---------------- 수학Ⅰ
  'exam-exponent': {
    unit: 'algebra',
    points: 2,
    make: (r) => {
      const b = r.pick([2, 3]);
      const e = r.int(1, b === 2 ? 5 : 3);
      const c = r.pick([2, 3, 4]);
      const p = r.int(1, e * c - 1);
      const q = e * c - p;
      const expr = `\\sqrt[${c}]{${b}^{${p}}} \\times ${b}^{${frac(q, c)}}`;
      return {
        prompt: { en: `Find the value of ${m(expr)}.`, ko: `${m(expr)}의 값은?` },
        value: b ** e,
        solution: {
          en: [`Write the root as a power: ${m(`\\sqrt[${c}]{${b}^{${p}}} = ${b}^{${frac(p, c)}}`)}.`, `Add the exponents: ${m(`${frac(p, c)} + ${frac(q, c)} = ${e}`)}.`, `So the value is ${m(`${b}^{${e}} = ${b ** e}`)}.`],
          ko: [`거듭제곱근을 지수로 나타내면 ${m(`\\sqrt[${c}]{${b}^{${p}}} = ${b}^{${frac(p, c)}}`)}`, `지수끼리 더하면 ${m(`${frac(p, c)} + ${frac(q, c)} = ${e}`)}`, `따라서 ${m(`${b}^{${e}} = ${b ** e}`)}`],
        },
      };
    },
  },
  'exam-log': {
    unit: 'algebra',
    points: 2,
    make: (r) => {
      const b = r.pick([2, 3]);
      const c = r.pick(b === 2 ? [3, 5, 7] : [2, 5, 7]);
      const e = r.int(2, b === 2 ? 6 : 4);
      const i = r.int(1, e);
      const a = c * b ** i;
      const top = b ** (e - i);
      const expr = `\\log_{${b}} ${a} + \\log_{${b}} \\frac{${top}}{${c}}`;
      return {
        prompt: { en: `Find the value of ${m(expr)}.`, ko: `${m(expr)}의 값은?` },
        value: e,
        solution: {
          en: [`A sum of logs with the same base is the log of the product: ${m(`\\log_{${b}}\\left(${a} \\times \\frac{${top}}{${c}}\\right) = \\log_{${b}} ${b ** e}`)}.`, `${m(`${b ** e} = ${b}^{${e}}`)}, so the value is ${e}.`],
          ko: [`밑이 같은 로그의 합은 곱의 로그이므로 ${m(`\\log_{${b}}\\left(${a} \\times \\frac{${top}}{${c}}\\right) = \\log_{${b}} ${b ** e}`)}`, `${m(`${b ** e} = ${b}^{${e}}`)}이므로 값은 ${e}`],
        },
      };
    },
  },
  'exam-arithmetic': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const a1 = r.int(-10, 12);
      const d = r.nonzero(-5, 5);
      const a = (n: number) => a1 + (n - 1) * d;
      const p = r.int(2, 4);
      const q = r.int(p + 1, 7);
      let k = r.int(1, 8);
      while (p + q === 2 * k || k === p || k === q) k = (k % 8) + 1;
      const n = r.int(9, 15);
      const cond = `a_{${p}} + a_{${q}} = ${a(p) + a(q)}, \\quad a_{${k}} = ${a(k)}`;
      return {
        prompt: {
          en: `An arithmetic sequence ${m('\\{a_n\\}')} has ${m(cond)}. Find ${m(`a_{${n}}`)}.`,
          ko: `등차수열 ${m('\\{a_n\\}')}에 대하여 ${m(cond)}일 때, ${m(`a_{${n}}`)}의 값은?`,
        },
        value: a(n),
        solution: {
          en: [`With first term ${m('a')} and common difference ${m('d')}: ${m(`2a + ${p + q - 2}d = ${a(p) + a(q)}`)} and ${m(`a + ${k - 1}d = ${a(k)}`)}.`, `Solving, ${m(`a = ${a1}`)} and ${m(`d = ${d}`)}.`, `${m(`a_{${n}} = ${a1} + ${n - 1} \\times (${d}) = ${a(n)}`)}.`],
          ko: [`첫째항을 ${m('a')}, 공차를 ${m('d')}라 하면 ${m(`2a + ${p + q - 2}d = ${a(p) + a(q)}`)}, ${m(`a + ${k - 1}d = ${a(k)}`)}`, `두 식을 연립하면 ${m(`a = ${a1}`)}, ${m(`d = ${d}`)}`, `${m(`a_{${n}} = ${a1} + ${n - 1} \\times (${d}) = ${a(n)}`)}`],
        },
      };
    },
  },
  'exam-geometric': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const ratio = r.pick([2, 3]);
      const c = r.int(1, ratio === 2 ? 6 : 4);
      const a = (n: number) => c * ratio ** (n - 1);
      const cond = `a_{2} = ${a(2)}, \\quad \\frac{a_{6}}{a_{4}} = ${ratio ** 2}`;
      return {
        prompt: {
          en: `A geometric sequence ${m('\\{a_n\\}')} with every term positive has ${m(cond)}. Find ${m('a_{5}')}.`,
          ko: `모든 항이 양수인 등비수열 ${m('\\{a_n\\}')}에 대하여 ${m(cond)}일 때, ${m('a_{5}')}의 값은?`,
        },
        value: a(5),
        solution: {
          en: [`${m(`\\frac{a_6}{a_4} = r^2 = ${ratio ** 2}`)}, and the terms are positive, so ${m(`r = ${ratio}`)}.`, `${m(`a_5 = a_2 r^3 = ${a(2)} \\times ${ratio ** 3} = ${a(5)}`)}.`],
          ko: [`공비를 ${m('r')}라 하면 ${m(`\\frac{a_6}{a_4} = r^2 = ${ratio ** 2}`)}, 모든 항이 양수이므로 ${m(`r = ${ratio}`)}`, `${m(`a_5 = a_2 r^3 = ${a(2)} \\times ${ratio ** 3} = ${a(5)}`)}`],
        },
      };
    },
  },
  'exam-sigma': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const n = r.int(5, 10);
      const a = r.nonzero(-4, 4);
      const squares = r.int(0, 1) === 1;
      const S1 = (n * (n + 1)) / 2;
      const S2 = (n * (n + 1) * (2 * n + 1)) / 6;
      const b = squares ? 0 : r.int(-5, 5);
      const body = squares ? polyTex([1, a, 0], 'k') : polyTex([a, b], 'k');
      const value = squares ? S2 + a * S1 : a * S1 + b * n;
      const expr = `\\sum_{k=1}^{${n}} \\left(${body}\\right)`;
      return {
        prompt: { en: `Find the value of ${m(expr)}.`, ko: `${m(expr)}의 값은?` },
        value,
        solution: {
          en: [`${m(`\\sum_{k=1}^{${n}} k = ${S1}`)}${squares ? ` and ${m(`\\sum_{k=1}^{${n}} k^2 = ${S2}`)}` : ''}.`, squares ? `${m(`${S2} + (${a}) \\times ${S1} = ${value}`)}.` : `${m(`(${a}) \\times ${S1} + (${b}) \\times ${n} = ${value}`)}.`],
          ko: [`${m(`\\sum_{k=1}^{${n}} k = ${S1}`)}${squares ? `, ${m(`\\sum_{k=1}^{${n}} k^2 = ${S2}`)}` : ''}`, squares ? `${m(`${S2} + (${a}) \\times ${S1} = ${value}`)}` : `${m(`(${a}) \\times ${S1} + (${b}) \\times ${n} = ${value}`)}`],
        },
      };
    },
  },
  'exam-trig': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const [x, y, h] = r.pick([[3, 4, 5], [4, 3, 5], [5, 12, 13], [12, 5, 13], [8, 15, 17], [15, 8, 17], [7, 24, 25]] as const);
      const quadrant = r.pick([2, 3, 4] as const);
      const sx = quadrant === 2 || quadrant === 3 ? -1 : 1; // the sign of cos
      const sy = quadrant === 2 ? 1 : -1; // the sign of sin
      const range = { 2: '\\frac{\\pi}{2} < \\theta < \\pi', 3: '\\pi < \\theta < \\frac{3}{2}\\pi', 4: '\\frac{3}{2}\\pi < \\theta < 2\\pi' }[quadrant];
      const askTan = r.int(0, 1) === 1;
      const value = askTan ? sx * sy * y : sx * x;
      const ask = askTan ? `${x}\\tan\\theta` : `${h}\\cos\\theta`;
      const cond = `${range}, \\quad \\sin\\theta = ${frac(sy * y, h)}`;
      return {
        prompt: { en: `If ${m(cond)}, find the value of ${m(ask)}.`, ko: `${m(cond)}일 때, ${m(ask)}의 값은?` },
        value,
        solution: {
          en: [`${m(`\\cos^2\\theta = 1 - \\sin^2\\theta = \\frac{${x * x}}{${h * h}}`)}; in this quadrant ${m(`\\cos\\theta ${sx < 0 ? '<' : '>'} 0`)}, so ${m(`\\cos\\theta = ${frac(sx * x, h)}`)}.`, askTan ? `${m(`\\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta} = ${frac(sx * sy * y, x)}`)}, so ${m(`${x}\\tan\\theta = ${value}`)}.` : `${m(`${h}\\cos\\theta = ${sx * x}`)}.`],
          ko: [`${m(`\\cos^2\\theta = 1 - \\sin^2\\theta = \\frac{${x * x}}{${h * h}}`)}이고 이 범위에서 ${m(`\\cos\\theta ${sx < 0 ? '<' : '>'} 0`)}이므로 ${m(`\\cos\\theta = ${frac(sx * x, h)}`)}`, askTan ? `${m(`\\tan\\theta = \\frac{\\sin\\theta}{\\cos\\theta} = ${frac(sx * sy * y, x)}`)}이므로 ${m(`${x}\\tan\\theta = ${value}`)}` : `${m(`${h}\\cos\\theta = ${sx * x}`)}`],
        },
      };
    },
  },

  // ---------------- 수학Ⅱ
  'exam-limit': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      const a = r.nonzero(-4, 4);
      const k = r.int(-8, 8);
      const b = k - 2 * a;
      const c = -a * a - a * b;
      const expr = `\\lim_{x \\to ${a}} \\frac{x^{2} + ax + b}{${minus('x', a)}} = ${k}`;
      return {
        prompt: {
          en: `The constants ${m('a')} and ${m('b')} satisfy ${m(expr)}. Find ${m('a + b')}.`,
          ko: `${m(expr)}를 만족시키는 두 상수 ${m('a')}, ${m('b')}에 대하여 ${m('a + b')}의 값은?`,
        },
        value: b + c,
        solution: {
          en: [`The denominator tends to 0 and the limit is finite, so the numerator is 0 at ${m(`x = ${a}`)}: ${m(`${a * a} ${plus(a)}a + b = 0`)}.`, `Then ${m(`x^2 + ax + b = (${minus('x', a)})(x ${plus(a)} + a)`)}, and the limit is ${m(`${2 * a} + a = ${k}`)}.`, `So ${m(`a = ${b}`)}, ${m(`b = ${c}`)} and ${m(`a + b = ${b + c}`)}.`],
          ko: [`분모가 0으로 가고 극한값이 존재하므로 ${m(`x = ${a}`)}에서 분자도 0: ${m(`${a * a} ${plus(a)}a + b = 0`)}`, `${m(`x^2 + ax + b = (${minus('x', a)})(x ${plus(a)} + a)`)}이므로 극한값은 ${m(`${2 * a} + a = ${k}`)}`, `따라서 ${m(`a = ${b}`)}, ${m(`b = ${c}`)}이고 ${m(`a + b = ${b + c}`)}`],
        },
      };
    },
  },
  'exam-derivative': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      const p = r.int(-6, 6);
      const q = r.int(-8, 8);
      const A = 3 + p;
      const B = 1 + p + q;
      const value = 8 + 2 * p + q;
      return {
        prompt: {
          en: `For ${m('f(x) = x^{3} + ax + b')} with constants ${m('a, b')}, ${m(`f'(1) = ${A}`)} and ${m(`f(1) = ${B}`)}. Find ${m('f(2)')}.`,
          ko: `두 상수 ${m('a, b')}에 대하여 함수 ${m('f(x) = x^{3} + ax + b')}가 ${m(`f'(1) = ${A}`)}, ${m(`f(1) = ${B}`)}를 만족시킬 때, ${m('f(2)')}의 값은?`,
        },
        value,
        solution: {
          en: [`${m(`f'(x) = 3x^2 + a`)}, so ${m(`3 + a = ${A}`)} and ${m(`a = ${p}`)}.`, `${m(`f(1) = 1 + a + b = ${B}`)}, so ${m(`b = ${q}`)}.`, `${m(`f(2) = 8 + 2(${p}) + (${q}) = ${value}`)}.`],
          ko: [`${m(`f'(x) = 3x^2 + a`)}이므로 ${m(`3 + a = ${A}`)}, ${m(`a = ${p}`)}`, `${m(`f(1) = 1 + a + b = ${B}`)}이므로 ${m(`b = ${q}`)}`, `${m(`f(2) = 8 + 2(${p}) + (${q}) = ${value}`)}`],
        },
      };
    },
  },
  'exam-tangent': {
    unit: 'calculus',
    points: 4,
    make: (r) => {
      const a = r.int(-4, 4);
      const b = r.int(-6, 6);
      const t = r.nonzero(-2, 3);
      const f = polyTex([1, -a, 0, b]);
      const ft = t ** 3 - a * t * t + b;
      const slope = 3 * t * t - 2 * a * t;
      const value = ft - t * slope;
      return {
        prompt: {
          en: `Find the y-intercept of the tangent to the curve ${m(`y = ${f}`)} at the point ${m(`(${t}, ${ft})`)}.`,
          ko: `곡선 ${m(`y = ${f}`)} 위의 점 ${m(`(${t}, ${ft})`)}에서의 접선의 ${m('y')}절편은?`,
        },
        value,
        solution: {
          en: [`${m(`y' = ${polyTex([3, -2 * a, 0])}`)}, so the slope at ${m(`x = ${t}`)} is ${m(String(slope))}.`, `The tangent is ${m(`y = ${slope}(${minus('x', t)}) ${plus(ft)}`)}.`, `At ${m('x = 0')}: ${m(`y = ${-slope * t} ${plus(ft)} = ${value}`)}.`],
          ko: [`${m(`y' = ${polyTex([3, -2 * a, 0])}`)}이므로 ${m(`x = ${t}`)}에서 접선의 기울기는 ${m(String(slope))}`, `접선의 방정식은 ${m(`y = ${slope}(${minus('x', t)}) ${plus(ft)}`)}`, `${m('x = 0')}을 대입하면 ${m(`y = ${-slope * t} ${plus(ft)} = ${value}`)}`],
        },
      };
    },
  },
  'exam-extremum': {
    unit: 'calculus',
    points: 4,
    make: (r) => {
      const a = r.int(1, 3);
      const M = r.int(-5, 20);
      const k = M - 2 * a ** 3;
      const value = M - 4 * a ** 3;
      return {
        prompt: {
          en: `The function ${m(`f(x) = x^{3} - ${3 * a * a}x + k`)} has a local maximum of ${m(String(M))}. Find its local minimum.`,
          ko: `함수 ${m(`f(x) = x^{3} - ${3 * a * a}x + k`)}의 극댓값이 ${m(String(M))}일 때, 함수 ${m('f(x)')}의 극솟값은? (단, ${m('k')}는 상수이다.)`,
        },
        value,
        solution: {
          en: [`${m(`f'(x) = 3x^2 - ${3 * a * a} = 3(x + ${a})(x - ${a})`)}: a maximum at ${m(`x = ${-a}`)}, a minimum at ${m(`x = ${a}`)}.`, `${m(`f(${-a}) = ${2 * a ** 3} + k = ${M}`)}, so ${m(`k = ${k}`)}.`, `${m(`f(${a}) = ${-2 * a ** 3} + k = ${value}`)}.`],
          ko: [`${m(`f'(x) = 3x^2 - ${3 * a * a} = 3(x + ${a})(x - ${a})`)}이므로 ${m(`x = ${-a}`)}에서 극대, ${m(`x = ${a}`)}에서 극소`, `${m(`f(${-a}) = ${2 * a ** 3} + k = ${M}`)}이므로 ${m(`k = ${k}`)}`, `극솟값은 ${m(`f(${a}) = ${-2 * a ** 3} + k = ${value}`)}`],
        },
      };
    },
  },
  'exam-integral': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      if (r.int(0, 1) === 0) {
        const n = r.int(1, 4);
        const p = 2 * r.int(-3, 3);
        const q = r.int(-5, 5);
        const value = n ** 3 + (p / 2) * n * n + q * n;
        const expr = `\\int_{0}^{${n}} \\left(${polyTex([3, p, q])}\\right) dx`;
        return {
          prompt: { en: `Find the value of ${m(expr)}.`, ko: `${m(expr)}의 값은?` },
          value,
          solution: {
            en: [`An antiderivative is ${m(`F(x) = ${polyTex([1, p / 2, q, 0])}`)}.`, `${m(`F(${n}) - F(0) = ${value}`)}.`],
            ko: [`부정적분 하나는 ${m(`F(x) = ${polyTex([1, p / 2, q, 0])}`)}`, `${m(`F(${n}) - F(0) = ${value}`)}`],
          },
        };
      }
      // symmetric bounds: the odd terms drop out
      const n = r.int(1, 3);
      const p = 3 * r.nonzero(-2, 2);
      const q = r.int(-6, 6);
      const c = r.int(-4, 4);
      const value = 2 * ((p * n ** 3) / 3 + c * n);
      const expr = `\\int_{-${n}}^{${n}} \\left(${polyTex([1, p, q, c])}\\right) dx`;
      return {
        prompt: { en: `Find the value of ${m(expr)}.`, ko: `${m(expr)}의 값은?` },
        value,
        solution: {
          en: [`On ${m(`[-${n}, ${n}]`)} the odd terms ${m(`x^3`)} and ${m(`${q}x`)} integrate to 0.`, `${m(`2\\int_{0}^{${n}} (${polyTex([p, 0, c])}) dx = 2\\left(${frac(p * n ** 3, 3)} ${plus(c * n)}\\right) = ${value}`)}.`],
          ko: [`구간 ${m(`[-${n}, ${n}]`)}에서 홀수 차수 항 ${m('x^3')}, ${m(`${q}x`)}의 정적분은 0`, `${m(`2\\int_{0}^{${n}} (${polyTex([p, 0, c])}) dx = 2\\left(${frac(p * n ** 3, 3)} ${plus(c * n)}\\right) = ${value}`)}`],
        },
      };
    },
  },
  'exam-area': {
    unit: 'calculus',
    points: 4,
    make: (r) => {
      const [k, w] = r.pick([[1, 6], [3, 2], [3, 4], [2, 3], [6, 2], [6, 3], [2, 6], [1, 12]] as const);
      const value = (k * w ** 3) / 6;
      const curve = polyTex([-k, k * w, 0]);
      return {
        prompt: {
          en: `Find the area of the region enclosed by the curve ${m(`y = ${curve}`)} and the x-axis.`,
          ko: `곡선 ${m(`y = ${curve}`)}와 ${m('x')}축으로 둘러싸인 부분의 넓이는?`,
        },
        value,
        solution: {
          en: [`${m(`${curve} = ${k === 1 ? '' : k}x(${w} - x)`)} meets the x-axis at ${m('x = 0')} and ${m(`x = ${w}`)}, and is positive between.`, `${m(`\\int_{0}^{${w}} (${curve}) dx = ${value}`)}.`],
          ko: [`${m(`${curve} = ${k === 1 ? '' : k}x(${w} - x)`)}는 ${m('x = 0')}, ${m(`x = ${w}`)}에서 ${m('x')}축과 만나고 그 사이에서 양수`, `${m(`\\int_{0}^{${w}} (${curve}) dx = ${value}`)}`],
        },
      };
    },
  },
  'exam-continuity': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      const c = r.nonzero(-3, 3);
      const a = r.int(-6, 6);
      const k = r.nonzero(-4, 4);
      const n = c * c + a * c - k * c;
      const f = `f(x) = \\begin{cases} x^{2} + ax & (x < ${c}) \\\\ ${polyTex([k, n])} & (x \\ge ${c}) \\end{cases}`;
      return {
        prompt: {
          en: `The function ${m(f)} is continuous for all real ${m('x')}. Find the constant ${m('a')}.`,
          ko: `함수 ${m(f)}가 실수 전체의 집합에서 연속일 때, 상수 ${m('a')}의 값은?`,
        },
        value: a,
        solution: {
          en: [`Both pieces must agree at ${m(`x = ${c}`)}: ${m(`${c * c} ${plus(c)}a = ${k * c + n}`)}.`, `So ${m(`a = ${a}`)}.`],
          ko: [`${m(`x = ${c}`)}에서 두 식의 값이 같아야 하므로 ${m(`${c * c} ${plus(c)}a = ${k * c + n}`)}`, `따라서 ${m(`a = ${a}`)}`],
        },
      };
    },
  },
  'exam-motion': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      const a = r.int(1, 6);
      const b = r.int(-5, 8);
      const t = r.int(1, 4);
      const x = polyTex([1, -a, b, 0], 't');
      const acc = r.int(0, 1) === 1;
      const value = acc ? 6 * t - 2 * a : 3 * t * t - 2 * a * t + b;
      const what = acc ? { en: 'acceleration', ko: '가속도' } : { en: 'velocity', ko: '속도' };
      return {
        prompt: {
          en: `A point P moves on a number line with position ${m(`x(t) = ${x}`)} at time ${m('t')}. Find the ${what.en} of P at ${m(`t = ${t}`)}.`,
          ko: `수직선 위를 움직이는 점 P의 시각 ${m('t')}에서의 위치가 ${m(`x(t) = ${x}`)}일 때, 시각 ${m(`t = ${t}`)}에서 점 P의 ${what.ko}는?`,
        },
        value,
        solution: {
          en: [`Velocity ${m(`v(t) = x'(t) = ${polyTex([3, -2 * a, b], 't')}`)}${acc ? `, acceleration ${m(`a(t) = v'(t) = ${polyTex([6, -2 * a], 't')}`)}` : ''}.`, `At ${m(`t = ${t}`)}: ${m(String(value))}.`],
          ko: [`속도 ${m(`v(t) = x'(t) = ${polyTex([3, -2 * a, b], 't')}`)}${acc ? `, 가속도 ${m(`a(t) = v'(t) = ${polyTex([6, -2 * a], 't')}`)}` : ''}`, `${m(`t = ${t}`)}을 대입하면 ${m(String(value))}`],
        },
      };
    },
  },
};
