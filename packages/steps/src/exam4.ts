/**
 * Four-point exam problems for the units that had few: 대수, 미적분Ⅱ,
 * 확률과 통계 and 기하. Each puts two or three steps together the way the
 * harder short-answer problems do, and picks its numbers so the answer is
 * a whole number.
 */
import { frac, gcdInt, m, minus, type ExamTemplate } from './exam';

const C = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
};
const coprime = (n: number, d: number) => {
  const g = gcdInt(n, d) || 1;
  return { q: n / g, p: d / g };
};
const pq = {
  en: 'Write it as $$\\frac{q}{p}$$ with coprime natural numbers p and q, and give p + q.',
  ko: '(단, p와 q는 서로소인 자연수이다.)',
};
const coef = (c: number, v: string) => (c === 1 ? v : c === -1 ? `-${v}` : `${c}${v}`);

export const FOUR_POINT: Record<string, ExamTemplate> = {
  // ---------------- 대수
  'exam-alg-recurrence-back': {
    unit: 'algebra',
    points: 4,
    make: (r) => {
      // a(n+1) = a(n)/2 when even, a(n) + k when odd; every a(1) with a(steps+1) = target
      for (;;) {
        const k = r.pick([1, 3, 5] as const);
        const steps = r.int(3, 4);
        const target = r.int(1, 6);
        const step = (a: number) => (a % 2 === 0 ? a / 2 : a + k);
        const starts: number[] = [];
        for (let a = 1; a <= 400; a++) {
          let x = a;
          for (let s = 0; s < steps; s++) x = step(x);
          if (x === target) starts.push(a);
        }
        const value = starts.reduce((s, a) => s + a, 0);
        if (starts.length < 2 || starts.length > 6 || value > 999) continue;
        const n = steps + 1;
        return {
          prompt: {
            en: `A sequence of natural numbers has ${m(`a_{n+1} = \\frac{a_{n}}{2}`)} when ${m('a_{n}')} is even and ${m(`a_{n+1} = a_{n} + ${k}`)} when it is odd. If ${m(`a_{${n}} = ${target}`)}, find the sum of all possible values of ${m('a_{1}')}.`,
            ko: `모든 항이 자연수인 수열 ${m('\\{a_{n}\\}')}이 모든 자연수 ${m('n')}에 대하여 ${m(`a_{n+1} = \\begin{cases} \\frac{a_{n}}{2} & (a_{n}\\text{이 짝수인 경우}) \\\\ a_{n} + ${k} & (a_{n}\\text{이 홀수인 경우}) \\end{cases}`)}를 만족시킨다. ${m(`a_{${n}} = ${target}`)}일 때, 가능한 모든 ${m('a_{1}')}의 값의 합은?`,
          },
          value,
          solution: {
            en: [`Work backwards: a term before ${m('x')} is ${m('2x')} (always) or ${m(`x - ${k}`)} (if that is odd and positive).`, `Going back ${steps} steps from ${m(String(target))} gives ${m(starts.join(', '))}.`, `Their sum is ${m(String(value))}.`],
            ko: [`거꾸로 생각하면 ${m('x')}의 앞 항은 ${m('2x')}이거나, ${m(`x - ${k}`)}가 홀수인 자연수일 때 ${m(`x - ${k}`)}`, `${m(String(target))}에서 ${steps}단계 거슬러 올라가면 ${m('a_{1}')}은 ${m(starts.join(', '))}`, `합은 ${m(String(value))}`],
          },
        };
      }
    },
  },
  'exam-alg-trig-sum': {
    unit: 'algebra',
    points: 4,
    make: (r) => {
      const b = r.int(2, 4);
      const [tex, sign] = r.pick([
        ['\\frac{1}{2}', 1],
        ['\\frac{\\sqrt{3}}{2}', 1],
        ['\\frac{1}{3}', 1],
        ['-\\frac{1}{2}', -1],
        ['-\\frac{\\sqrt{2}}{2}', -1],
        ['-\\frac{2}{3}', -1],
      ] as const);
      // in each period the two roots add up to π/b (s > 0) or 3π/b (s < 0), shifted by the period
      const value = 2 * b - sign;
      const per = sign > 0 ? '\\frac{\\pi}{' + b + '}' : '\\frac{3\\pi}{' + b + '}';
      return {
        prompt: {
          en: `The solutions of ${m(`\\sin ${b}x = ${tex}`)} with ${m('0 \\le x < 2\\pi')} add up to ${m('k\\pi')}. Find ${m('k')}.`,
          ko: `${m('0 \\le x < 2\\pi')}일 때, 방정식 ${m(`\\sin ${b}x = ${tex}`)}의 모든 해의 합이 ${m('k\\pi')}이다. ${m('k')}의 값은?`,
        },
        value,
        solution: {
          en: [`${m(`\\sin ${b}x`)} has period ${m(`\\frac{2\\pi}{${b}}`)}, so there are ${m(String(b))} periods with two solutions each.`, `In the first period the two solutions are symmetric about ${m(sign > 0 ? `x = \\frac{\\pi}{${2 * b}}` : `x = \\frac{3\\pi}{${2 * b}}`)}, adding to ${m(per)}; each later period adds ${m(`2 \\times \\frac{2\\pi}{${b}}`)} more per step.`, `Sum: ${m(`${b} \\times ${per} + \\frac{4\\pi}{${b}}(0 + 1 + \\cdots + ${b - 1}) = ${value}\\pi`)}.`],
          ko: [`${m(`\\sin ${b}x`)}의 주기는 ${m(`\\frac{2\\pi}{${b}}`)}이므로 한 주기마다 해가 2개씩, ${m(String(b))}주기`, `첫 주기의 두 해는 직선 ${m(sign > 0 ? `x = \\frac{\\pi}{${2 * b}}` : `x = \\frac{3\\pi}{${2 * b}}`)}에 대하여 대칭이므로 합은 ${m(per)}, 다음 주기마다 합이 ${m(`2 \\times \\frac{2\\pi}{${b}}`)}씩 늘어난다`, `모든 해의 합은 ${m(`${b} \\times ${per} + \\frac{4\\pi}{${b}}(0 + 1 + \\cdots + ${b - 1}) = ${value}\\pi`)}`],
        },
      };
    },
  },
  'exam-alg-arith-abs': {
    unit: 'algebra',
    points: 4,
    make: (r) => {
      // a(n) = d(n − mid): |a(p)| = |a(q)| with p + q = 2·mid, and a(s) given
      for (;;) {
        const mid = r.int(4, 8);
        const d = r.nonzero(-4, 4);
        const gap = r.int(1, 3);
        const [p, q] = [mid - gap, mid + gap];
        let s = r.int(1, 12);
        if (s === mid) s += 1;
        const N = r.int(mid + 2, 15);
        const a = (n: number) => d * (n - mid);
        const value = Array.from({ length: N }, (_, k) => Math.abs(a(k + 1))).reduce((x, y) => x + y, 0);
        if (value > 999) continue;
        return {
          prompt: {
            en: `An arithmetic sequence with nonzero common difference has ${m(`|a_{${p}}| = |a_{${q}}|`)} and ${m(`a_{${s}} = ${a(s)}`)}. Find ${m(`\\sum_{k=1}^{${N}} |a_{k}|`)}.`,
            ko: `공차가 0이 아닌 등차수열 ${m('\\{a_{n}\\}')}에 대하여 ${m(`|a_{${p}}| = |a_{${q}}|`)}, ${m(`a_{${s}} = ${a(s)}`)}일 때, ${m(`\\sum_{k=1}^{${N}} |a_{k}|`)}의 값은?`,
          },
          value,
          solution: {
            en: [`${m(`a_{${p}} \\ne a_{${q}}`)}, so ${m(`a_{${p}} = -a_{${q}}`)}: the middle term ${m(`a_{${mid}} = 0`)}.`, `${m(`a_{${s}} = ${coef(s - mid, 'd')} = ${a(s)}`)} gives ${m(`d = ${d}`)}, so ${m(`a_{n} = ${d}(${minus('n', mid)})`)}.`, `${m(`\\sum_{k=1}^{${N}} |a_{k}| = ${Math.abs(d)}\\left(\\sum_{j=1}^{${mid - 1}} j + \\sum_{j=1}^{${N - mid}} j\\right) = ${value}`)}.`],
            ko: [`공차가 0이 아니므로 ${m(`a_{${p}} = -a_{${q}}`)}, 즉 ${m(`a_{${mid}} = 0`)}`, `${m(`a_{${s}} = ${coef(s - mid, 'd')} = ${a(s)}`)}에서 ${m(`d = ${d}`)}, ${m(`a_{n} = ${d}(${minus('n', mid)})`)}`, `${m(`\\sum_{k=1}^{${N}} |a_{k}| = ${Math.abs(d)}\\left(\\sum_{j=1}^{${mid - 1}} j + \\sum_{j=1}^{${N - mid}} j\\right) = ${value}`)}`],
          },
        };
      }
    },
  },

  // ---------------- 미적분Ⅱ
  'exam-c2-inverse-integral': {
    unit: 'calc2',
    points: 4,
    make: (r) => {
      const [b, p] = [r.pick([2, 4] as const), r.int(1, 9)];
      const fb = b ** 3 + p * b;
      const value = (3 * b ** 4) / 4 + (p * b * b) / 2;
      return {
        prompt: {
          en: `${m('g')} is the inverse of ${m(`f(x) = x^{3} + ${coef(p, 'x')}`)}. Find ${m(`\\int_{0}^{${fb}} g(x)\\,dx`)}.`,
          ko: `함수 ${m(`f(x) = x^{3} + ${coef(p, 'x')}`)}의 역함수를 ${m('g(x)')}라 할 때, ${m(`\\int_{0}^{${fb}} g(x)\\,dx`)}의 값은?`,
        },
        value,
        solution: {
          en: [`${m(`f(0) = 0`)}, ${m(`f(${b}) = ${fb}`)}: the areas under ${m('f')} on ${m(`[0, ${b}]`)} and under ${m('g')} on ${m(`[0, ${fb}]`)} fill the rectangle ${m(`${b} \\times ${fb}`)}.`, `${m(`\\int_{0}^{${b}} f(x)\\,dx = \\frac{${b}^{4}}{4} + \\frac{${p} \\times ${b}^{2}}{2} = ${b ** 4 / 4 + (p * b * b) / 2}`)}.`, `${m(`\\int_{0}^{${fb}} g(x)\\,dx = ${b * fb} - ${b ** 4 / 4 + (p * b * b) / 2} = ${value}`)}.`],
          ko: [`${m('f(0) = 0')}, ${m(`f(${b}) = ${fb}`)}이므로 ${m(`\\int_{0}^{${b}} f(x)\\,dx + \\int_{0}^{${fb}} g(x)\\,dx = ${b} \\times ${fb}`)}`, `${m(`\\int_{0}^{${b}} f(x)\\,dx = \\frac{${b}^{4}}{4} + \\frac{${p} \\times ${b}^{2}}{2} = ${b ** 4 / 4 + (p * b * b) / 2}`)}`, `${m(`\\int_{0}^{${fb}} g(x)\\,dx = ${b * fb} - ${b ** 4 / 4 + (p * b * b) / 2} = ${value}`)}`],
        },
      };
    },
  },
  'exam-c2-exp-extrema': {
    unit: 'calc2',
    points: 4,
    make: (r) => {
      // f'(x) = (x² + (a+2)x + a + b)eˣ with roots s < t
      const s = r.int(-5, 1);
      const t = s + r.int(1, 5);
      const a = -(s + t) - 2;
      const b = s * t - a;
      const value = a * b;
      return {
        prompt: {
          en: `${m('f(x) = (x^{2} + ax + b)e^{x}')} has local extrema at ${m(`x = ${s}`)} and ${m(`x = ${t}`)}. Find ${m('ab')}.`,
          ko: `함수 ${m('f(x) = (x^{2} + ax + b)e^{x}')}가 ${m(`x = ${s}`)}, ${m(`x = ${t}`)}에서 극값을 가질 때, ${m('ab')}의 값은? (단, ${m('a, b')}는 상수이다.)`,
        },
        value,
        solution: {
          en: [`${m("f'(x) = \\{x^{2} + (a + 2)x + a + b\\}e^{x}")}, and ${m('e^{x} > 0')}.`, `The quadratic has roots ${m(`${s}, ${t}`)}: ${m(`a + 2 = ${-(s + t)}`)}, ${m(`a + b = ${s * t}`)}.`, `${m(`a = ${a}`)}, ${m(`b = ${b}`)}, ${m(`ab = ${value}`)}.`],
          ko: [`${m("f'(x) = \\{x^{2} + (a + 2)x + a + b\\}e^{x}")}이고 ${m('e^{x} > 0')}`, `이차식의 두 근이 ${m(`${s}, ${t}`)}이므로 ${m(`a + 2 = ${-(s + t)}`)}, ${m(`a + b = ${s * t}`)}`, `${m(`a = ${a}`)}, ${m(`b = ${b}`)}이므로 ${m(`ab = ${value}`)}`],
        },
      };
    },
  },
  'exam-c2-riemann': {
    unit: 'calc2',
    points: 4,
    make: (r) => {
      for (;;) {
        const [q, k] = [r.int(1, 2), r.int(1, 3)];
        const t = r.int(1, 4);
        const p = q * (k + 1) * t;
        const value = t * ((1 + q) ** (k + 1) - 1);
        if (value > 999) continue;
        const inner = `1 + \\frac{${q === 1 ? '' : q}k}{n}`;
        return {
          prompt: {
            en: `Find ${m(`\\lim_{n \\to \\infty} \\sum_{k=1}^{n} \\frac{${p}}{n}\\left(${inner}\\right)^{${k}}`)}.`,
            ko: `${m(`\\lim_{n \\to \\infty} \\sum_{k=1}^{n} \\frac{${p}}{n}\\left(${inner}\\right)^{${k}}`)}의 값은?`,
          },
          value,
          solution: {
            en: [`With ${m(`x = ${inner}`)} and ${m(`\\Delta x = \\frac{${q}}{n}`)}, the sum is ${m(`\\frac{${p}}{${q}}\\sum x^{${k}}\\Delta x`)}.`, `${m(`\\frac{${p}}{${q}}\\int_{1}^{${1 + q}} x^{${k}}\\,dx = \\frac{${p}}{${q}} \\times \\frac{${1 + q}^{${k + 1}} - 1}{${k + 1}} = ${value}`)}.`],
            ko: [`${m(`x = ${inner}`)}로 놓으면 ${m(`\\Delta x = \\frac{${q}}{n}`)}이므로 ${m(`\\frac{${p}}{${q}}\\sum x^{${k}}\\Delta x`)}`, `${m(`\\frac{${p}}{${q}}\\int_{1}^{${1 + q}} x^{${k}}\\,dx = \\frac{${p}}{${q}} \\times \\frac{${1 + q}^{${k + 1}} - 1}{${k + 1}} = ${value}`)}`],
          },
        };
      }
    },
  },

  // ---------------- 확률과 통계
  'exam-st-functions': {
    unit: 'stats',
    points: 4,
    make: (r) => {
      const n = r.int(4, 6);
      const c = r.int(2, n - 1);
      // f(1) ≤ f(2) = c ≤ f(3) ≤ f(4): c ways before, H(n − c + 1, 2) after
      const value = c * C(n - c + 2, 2);
      return {
        prompt: {
          en: `How many functions ${m(`f : \\{1, 2, 3, 4\\} \\to \\{${Array.from({ length: n }, (_, k) => k + 1).join(', ')}\\}`)} have ${m('f(1) \\le f(2) \\le f(3) \\le f(4)')} and ${m(`f(2) = ${c}`)}?`,
          ko: `두 집합 ${m('X = \\{1, 2, 3, 4\\}')}, ${m(`Y = \\{${Array.from({ length: n }, (_, k) => k + 1).join(', ')}\\}`)}에 대하여 ${m('f(1) \\le f(2) \\le f(3) \\le f(4)')}, ${m(`f(2) = ${c}`)}를 만족시키는 함수 ${m('f : X \\to Y')}의 개수는?`,
        },
        value,
        solution: {
          en: [`${m(`f(1) \\le ${c}`)}: ${m(String(c))} choices.`, `${m(`${c} \\le f(3) \\le f(4) \\le ${n}`)}: ${m(`{}_{${n - c + 1}}\\mathrm{H}_{2} = {}_{${n - c + 2}}\\mathrm{C}_{2} = ${C(n - c + 2, 2)}`)}.`, `${m(`${c} \\times ${C(n - c + 2, 2)} = ${value}`)}.`],
          ko: [`${m(`f(1) \\le ${c}`)}인 경우 ${m(String(c))}가지`, `${m(`${c} \\le f(3) \\le f(4) \\le ${n}`)}인 경우 ${m(`{}_{${n - c + 1}}\\mathrm{H}_{2} = {}_{${n - c + 2}}\\mathrm{C}_{2} = ${C(n - c + 2, 2)}`)}가지`, `${m(`${c} \\times ${C(n - c + 2, 2)} = ${value}`)}`],
        },
      };
    },
  },
  'exam-st-sample-mean': {
    unit: 'stats',
    points: 4,
    make: (r) => {
      for (;;) {
        const a = r.int(2, 6);
        const n = r.pick([2, 4, 8] as const);
        if ((a * a) % (2 * n) !== 0) continue;
        const value = (a * a) / (2 * n) + a * a;
        return {
          prompt: {
            en: `A population has ${m(`\\mathrm{P}(X = 0) = \\frac{1}{4}`)}, ${m(`\\mathrm{P}(X = ${a}) = \\frac{1}{2}`)}, ${m(`\\mathrm{P}(X = ${2 * a}) = \\frac{1}{4}`)}. ${m('\\overline{X}')} is the mean of a random sample of size ${m(String(n))}. Find ${m('\\mathrm{E}(\\overline{X}^{2})')}.`,
            ko: `모집단의 확률변수 ${m('X')}가 ${m(`\\mathrm{P}(X = 0) = \\frac{1}{4}`)}, ${m(`\\mathrm{P}(X = ${a}) = \\frac{1}{2}`)}, ${m(`\\mathrm{P}(X = ${2 * a}) = \\frac{1}{4}`)}이다. 이 모집단에서 크기가 ${m(String(n))}인 표본을 임의추출하여 구한 표본평균을 ${m('\\overline{X}')}라 할 때, ${m('\\mathrm{E}(\\overline{X}^{2})')}의 값은?`,
          },
          value,
          solution: {
            en: [`${m(`\\mathrm{E}(X) = ${a}`)}, ${m(`\\mathrm{V}(X) = \\frac{1}{4}(${a})^{2} \\times 2 = ${(a * a) / 2}`)}.`, `${m(`\\mathrm{E}(\\overline{X}) = ${a}`)}, ${m(`\\mathrm{V}(\\overline{X}) = \\frac{${(a * a) / 2}}{${n}} = ${(a * a) / (2 * n)}`)}.`, `${m(`\\mathrm{E}(\\overline{X}^{2}) = \\mathrm{V}(\\overline{X}) + \\{\\mathrm{E}(\\overline{X})\\}^{2} = ${value}`)}.`],
            ko: [`${m(`\\mathrm{E}(X) = ${a}`)}, ${m(`\\mathrm{V}(X) = \\frac{1}{4}(${a})^{2} \\times 2 = ${(a * a) / 2}`)}`, `${m(`\\mathrm{E}(\\overline{X}) = ${a}`)}, ${m(`\\mathrm{V}(\\overline{X}) = \\frac{${(a * a) / 2}}{${n}} = ${(a * a) / (2 * n)}`)}`, `${m(`\\mathrm{E}(\\overline{X}^{2}) = \\mathrm{V}(\\overline{X}) + \\{\\mathrm{E}(\\overline{X})\\}^{2} = ${value}`)}`],
          },
        };
      }
    },
  },
  'exam-st-more-white': {
    unit: 'stats',
    points: 4,
    make: (r) => {
      const [w, b] = [r.int(3, 6), r.int(2, 5)];
      const draw = 3;
      // more white than black among 3: 2 or 3 white
      const good = C(w, 2) * C(b, 1) + C(w, 3);
      const all = C(w + b, draw);
      const { q, p } = coprime(good, all);
      return {
        prompt: {
          en: `A bag holds ${m(String(w))} white and ${m(String(b))} black balls. Three are drawn at once. The probability that there are more white than black among them is ${m('\\frac{q}{p}')}. ${pq.en}`,
          ko: `흰 공 ${m(String(w))}개와 검은 공 ${m(String(b))}개가 들어 있는 주머니에서 임의로 ${m('3')}개의 공을 동시에 꺼낼 때, 꺼낸 흰 공의 개수가 검은 공의 개수보다 많을 확률은 ${m('\\frac{q}{p}')}이다. ${m('p + q')}의 값은? ${pq.ko}`,
        },
        value: p + q,
        solution: {
          en: [`More white means 2 or 3 white: ${m(`{}_{${w}}\\mathrm{C}_{2} \\times {}_{${b}}\\mathrm{C}_{1} + {}_{${w}}\\mathrm{C}_{3} = ${good}`)}.`, `Out of ${m(`{}_{${w + b}}\\mathrm{C}_{3} = ${all}`)}: ${m(`\\frac{${good}}{${all}} = ${frac(good, all)}`)}, so ${m(`p + q = ${p + q}`)}.`],
          ko: [`흰 공이 2개 또는 3개인 경우: ${m(`{}_{${w}}\\mathrm{C}_{2} \\times {}_{${b}}\\mathrm{C}_{1} + {}_{${w}}\\mathrm{C}_{3} = ${good}`)}`, `전체 ${m(`{}_{${w + b}}\\mathrm{C}_{3} = ${all}`)}가지이므로 ${m(`\\frac{${good}}{${all}} = ${frac(good, all)}`)}, ${m(`p + q = ${p + q}`)}`],
        },
      };
    },
  },

  // ---------------- 기하
  'exam-geo-ellipse-min': {
    unit: 'geometry',
    points: 4,
    make: (r) => {
      const [b, c, a] = r.pick([[4, 3, 5], [3, 4, 5], [8, 6, 10], [6, 8, 10], [12, 5, 13], [5, 12, 13]] as const);
      const value = 2 * a * a;
      return {
        prompt: {
          en: `${m('\\mathrm{F}, \\mathrm{F}\'')} are the foci of ${m(`\\frac{x^{2}}{${a * a}} + \\frac{y^{2}}{${b * b}} = 1`)}. For ${m('\\mathrm{P}')} on the ellipse, find the least value of ${m("\\overline{\\mathrm{PF}}^{2} + \\overline{\\mathrm{PF}'}^{2}")}.`,
          ko: `타원 ${m(`\\frac{x^{2}}{${a * a}} + \\frac{y^{2}}{${b * b}} = 1`)}의 두 초점을 ${m("\\mathrm{F}, \\mathrm{F}'")}이라 하자. 이 타원 위의 점 ${m('\\mathrm{P}')}에 대하여 ${m("\\overline{\\mathrm{PF}}^{2} + \\overline{\\mathrm{PF}'}^{2}")}의 최솟값은?`,
        },
        value,
        solution: {
          en: [`${m(`\\overline{\\mathrm{PF}} + \\overline{\\mathrm{PF}'} = ${2 * a}`)}, so ${m(`\\overline{\\mathrm{PF}}^{2} + \\overline{\\mathrm{PF}'}^{2} = ${4 * a * a} - 2\\,\\overline{\\mathrm{PF}} \\times \\overline{\\mathrm{PF}'}`)}.`, `The product is largest, ${m(`${a}^{2} = ${a * a}`)}, when ${m(`\\overline{\\mathrm{PF}} = \\overline{\\mathrm{PF}'} = ${a}`)} (P on the y-axis).`, `Least value ${m(`${4 * a * a} - ${2 * a * a} = ${value}`)}.`],
          ko: [`${m(`\\overline{\\mathrm{PF}} + \\overline{\\mathrm{PF}'} = ${2 * a}`)}이므로 ${m(`\\overline{\\mathrm{PF}}^{2} + \\overline{\\mathrm{PF}'}^{2} = ${4 * a * a} - 2\\,\\overline{\\mathrm{PF}} \\times \\overline{\\mathrm{PF}'}`)}`, `산술평균과 기하평균의 관계에 의하여 곱은 ${m(`\\overline{\\mathrm{PF}} = \\overline{\\mathrm{PF}'} = ${a}`)}일 때 최대 ${m(String(a * a))}`, `최솟값은 ${m(`${4 * a * a} - ${2 * a * a} = ${value}`)}`],
        },
      };
    },
  },
  'exam-geo-dot-max': {
    unit: 'geometry',
    points: 4,
    make: (r) => {
      for (;;) {
        const [d, c, rad] = [r.int(1, 5), r.int(1, 6), r.int(1, 5)];
        const value = (c + rad) ** 2 - d * d;
        if (value <= 0) continue;
        return {
          prompt: {
            en: `${m(`\\mathrm{A}(-${d}, 0)`)}, ${m(`\\mathrm{B}(${d}, 0)`)}, and ${m('\\mathrm{P}')} moves on the circle ${m(`x^{2} + (${minus('y', c)})^{2} = ${rad * rad}`)}. Find the greatest value of ${m('\\overrightarrow{\\mathrm{PA}} \\cdot \\overrightarrow{\\mathrm{PB}}')}.`,
            ko: `좌표평면 위의 두 점 ${m(`\\mathrm{A}(-${d}, 0)`)}, ${m(`\\mathrm{B}(${d}, 0)`)}과 원 ${m(`x^{2} + (${minus('y', c)})^{2} = ${rad * rad}`)} 위를 움직이는 점 ${m('\\mathrm{P}')}에 대하여 ${m('\\overrightarrow{\\mathrm{PA}} \\cdot \\overrightarrow{\\mathrm{PB}}')}의 최댓값은?`,
          },
          value,
          solution: {
            en: [`With ${m('\\mathrm{O}')} the midpoint of AB: ${m('\\overrightarrow{\\mathrm{PA}} \\cdot \\overrightarrow{\\mathrm{PB}} = |\\overrightarrow{\\mathrm{PO}}|^{2} - |\\overrightarrow{\\mathrm{OA}}|^{2}')} ${m(`= |\\overrightarrow{\\mathrm{PO}}|^{2} - ${d * d}`)}.`, `${m('|\\overrightarrow{\\mathrm{PO}}|')} is at most ${m(`${c} + ${rad} = ${c + rad}`)} (the centre ${m(`(0, ${c})`)} is ${m(String(c))} from O).`, `Greatest value ${m(`${(c + rad) ** 2} - ${d * d} = ${value}`)}.`],
            ko: [`선분 AB의 중점은 원점 ${m('\\mathrm{O}')}이므로 ${m('\\overrightarrow{\\mathrm{PA}} \\cdot \\overrightarrow{\\mathrm{PB}} = |\\overrightarrow{\\mathrm{PO}}|^{2} - |\\overrightarrow{\\mathrm{OA}}|^{2}')} ${m(`= |\\overrightarrow{\\mathrm{PO}}|^{2} - ${d * d}`)}`, `원의 중심 ${m(`(0, ${c})`)}와 원점 사이의 거리가 ${m(String(c))}이므로 ${m('|\\overrightarrow{\\mathrm{PO}}|')}의 최댓값은 ${m(`${c} + ${rad} = ${c + rad}`)}`, `최댓값은 ${m(`${(c + rad) ** 2} - ${d * d} = ${value}`)}`],
          },
        };
      }
    },
  },
  'exam-geo-focal-chord': {
    unit: 'geometry',
    points: 4,
    make: (r) => {
      const slope = r.pick([1, 2] as const);
      const p = slope === 1 ? r.int(1, 6) : 4 * r.int(1, 3);
      // a chord through the focus with slope m: x1 + x2 = 2p + 4p/m², length = x1 + x2 + 2p
      const sum = 2 * p + (4 * p) / (slope * slope);
      const value = sum + 2 * p;
      return {
        prompt: {
          en: `A line through the focus ${m('\\mathrm{F}')} of ${m(`y^{2} = ${4 * p}x`)} with slope ${m(String(slope))} meets the parabola at ${m('\\mathrm{A}, \\mathrm{B}')}. Find ${m('\\overline{\\mathrm{AB}}')}.`,
          ko: `포물선 ${m(`y^{2} = ${4 * p}x`)}의 초점 ${m('\\mathrm{F}')}를 지나고 기울기가 ${m(String(slope))}인 직선이 이 포물선과 만나는 두 점을 ${m('\\mathrm{A}, \\mathrm{B}')}라 할 때, 선분 ${m('\\mathrm{AB}')}의 길이는?`,
        },
        value,
        solution: {
          en: [`The line is ${m(`y = ${coef(slope, `(${minus('x', p)})`)}`)}; putting it into the parabola: ${m(`${slope * slope}x^{2} - ${2 * p * slope * slope + 4 * p}x + ${slope * slope * p * p} = 0`)}, so ${m(`x_{1} + x_{2} = ${sum}`)}.`, `By the definition of the parabola ${m('\\overline{\\mathrm{AF}} = x_{1} + ' + p)} and ${m('\\overline{\\mathrm{BF}} = x_{2} + ' + p)}.`, `${m(`\\overline{\\mathrm{AB}} = ${sum} + ${2 * p} = ${value}`)}.`],
          ko: [`직선 ${m(`y = ${coef(slope, `(${minus('x', p)})`)}`)}를 포물선의 식에 대입하면 ${m(`${slope * slope}x^{2} - ${2 * p * slope * slope + 4 * p}x + ${slope * slope * p * p} = 0`)}이므로 ${m(`x_{1} + x_{2} = ${sum}`)}`, `포물선의 정의에 의하여 ${m('\\overline{\\mathrm{AF}} = x_{1} + ' + p)}, ${m('\\overline{\\mathrm{BF}} = x_{2} + ' + p)}`, `${m(`\\overline{\\mathrm{AB}} = ${sum} + ${2 * p} = ${value}`)}`],
        },
      };
    },
  },
};

