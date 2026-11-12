import { compileReal, DEFAULT_SETTINGS, EMPTY_ENV, evaluate, parse, parseExpression, printNode, type Node } from '@math/engine';
import { add, call, div, id, mul, num, pow, tidy } from './ast';
import { diffSteps } from './derivative';
import { EXAM_TEMPLATES as BASE_EXAM, type Unit } from './exam';
import { MORE_EXAM } from './exam2';

const EXAM_TEMPLATES = { ...BASE_EXAM, ...MORE_EXAM };
import { solveSteps } from './equation';
import { polyNode, Q, toPoly, type Poly } from './rational';

/** derivative, equation and integral drill; algebra (수학Ⅰ) and calculus (수학Ⅱ) are the exam units */
export type Topic = 'derivative' | 'equation' | 'integral' | Unit;
/** basic drill, harder drill, and exam-style (평가원) problems */
export type Level = 'basic' | 'advanced' | 'exam';

/**
 * A practice problem. `question` is what is shown (a calculator line:
 * diff(…, x), an equation, integrate(…, x)); `target` is the function to
 * differentiate or integrate, or the equation's two sides.
 */
export interface Problem {
  topic: Topic;
  template: string;
  seed: number;
  question: string;
  target: Node[];
  /** one correct answer, to show after checking */
  answer: string;
  /** the solutions, for equations */
  solutions?: number[];
  /** exam problems: the sentence to show, the whole-number answer, the points and the working */
  prompt?: { en: string; ko: string };
  value?: number;
  points?: number;
  solution?: { en: string[]; ko: string[] };
}

export type Verdict =
  | { correct: true }
  | { correct: false; reason: 'empty' | 'unreadable' | 'names' | 'count' | 'wrong' };

/** A small, seedable random source, so a problem can be made again from its seed. */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const nonzero = (lo: number, hi: number) => {
    let v = 0;
    while (v === 0) v = int(lo, hi);
    return v;
  };
  const pick = <T,>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
  return { int, nonzero, pick };
}

const X = id('x');
const poly = (coeffs: number[]) => polyNode(coeffs.map((c) => new Q(c)), 'x');
const text = (n: Node) => printNode(tidy(n));

interface Template {
  topic: Topic;
  make(r: ReturnType<typeof rng>): Omit<Problem, 'topic' | 'template' | 'seed'>;
}
const integral = (f: Node, F: Node) => ({ target: [f], question: `integrate(${printNode(f)}, x)`, answer: `${text(F)} + C` });
const roots = (sols: Q[]) => {
  const uniq = sols.filter((q, k) => sols.findIndex((w) => w.eq(q)) === k).sort((p, q) => p.value - q.value);
  return { answer: uniq.map((q) => `x = ${printNode(q.node())}`).join(', '), solutions: uniq.map((q) => q.value) };
};

const derivative = (f: Node) => ({
  target: [f],
  question: `diff(${printNode(f)}, x)`,
  answer: niceDerivative(f),
});

function niceDerivative(f: Node): string {
  const p = toPoly(f, 'x');
  if (p) return printNode(polyNode(p.slice(1).map((c, k) => c.mul(new Q(k + 1))) as Poly, 'x'));
  return printNode(diffSteps(f, 'x').result);
}

export const TEMPLATES: Record<string, Template> = {
  'derivative-polynomial': {
    topic: 'derivative',
    make: (r) => {
      const n = r.int(2, 5);
      const coeffs = Array.from({ length: n + 1 }, (_, k) => (k === n ? r.nonzero(-6, 6) : r.int(0, 2) === 0 ? 0 : r.nonzero(-9, 9)));
      return derivative(poly(coeffs));
    },
  },
  'derivative-product': {
    topic: 'derivative',
    make: (r) => {
      const n = r.int(1, 4);
      const g = r.pick(['sin', 'cos', 'exp', 'ln'] as const);
      const right = g === 'exp' ? pow(id('e'), X) : call(g, X);
      return derivative(mul(n === 1 ? X : pow(X, num(n)), right));
    },
  },
  'derivative-chain': {
    topic: 'derivative',
    make: (r) => {
      const a = r.nonzero(-5, 5);
      const b = r.int(-6, 6);
      const kind = r.pick(['trig', 'power', 'exp', 'ln'] as const);
      const inner = kind === 'trig' || kind === 'exp' ? poly([b, 0, a]) : poly([b, a]);
      if (kind === 'trig') return derivative(call(r.pick(['sin', 'cos']), inner));
      if (kind === 'power') return derivative(pow(inner, num(r.int(2, 6))));
      if (kind === 'exp') return derivative(pow(id('e'), inner));
      return derivative(call('ln', inner));
    },
  },
  'derivative-quotient': {
    topic: 'derivative',
    make: (r) => {
      const [a, b, c, d] = [r.nonzero(-5, 5), r.int(-6, 6), r.nonzero(-4, 4), r.nonzero(-6, 6)];
      return derivative({ type: 'binary', op: '/', left: poly([b, a]), right: poly([d, c]) });
    },
  },
  'equation-linear': {
    topic: 'equation',
    make: (r) => {
      const s = r.int(-9, 9);
      const a = r.nonzero(-9, 9);
      let c = r.int(-9, 9);
      if (c === a) c = a + 1;
      const b = r.int(-15, 15);
      const d = (a - c) * s + b;
      const left = poly([b, a]);
      const right = poly([d, c]);
      return { target: [left, right], question: `${printNode(left)} = ${printNode(right)}`, answer: `x = ${s}`, solutions: [s] };
    },
  },
  'equation-quadratic': {
    topic: 'equation',
    make: (r) => {
      const r1 = r.int(-7, 7);
      let r2 = r.int(-7, 7);
      if (r2 === r1 && r.int(0, 3) > 0) r2 = r1 + r.nonzero(1, 3);
      const k = r.pick([1, 1, 1, 2, -1]);
      // k(x − r1)(x − r2), written out
      const coeffs = [k * r1 * r2, -k * (r1 + r2), k];
      const left = poly(coeffs);
      const sols = [...new Set([r1, r2])].sort((p, q) => p - q);
      return { target: [left, num(0)], question: `${printNode(left)} = 0`, answer: sols.map((v) => `x = ${v}`).join(', '), solutions: sols };
    },
  },
  'integral-polynomial': {
    topic: 'integral',
    make: (r) => {
      const n = r.int(1, 4);
      const coeffs = Array.from({ length: n + 1 }, (_, k) => (k === n ? r.nonzero(-6, 6) * (k + 1) : r.int(0, 1) === 0 ? 0 : r.nonzero(-5, 5) * (k + 1)));
      const f = poly(coeffs);
      const F = polyNode([new Q(0), ...coeffs.map((c, k) => new Q(c, k + 1))], 'x');
      return { target: [f], question: `integrate(${printNode(f)}, x)`, answer: `${printNode(F)} + C` };
    },
  },
  'integral-basic': {
    topic: 'integral',
    make: (r) => {
      const a = r.nonzero(-4, 4);
      const k = r.nonzero(1, 6);
      const kind = r.pick(['exp', 'cos', 'sin'] as const);
      const ax = a === 1 ? X : mul(num(a), X);
      const f = kind === 'exp' ? mul(num(k), pow(id('e'), ax)) : mul(num(k), call(kind, ax));
      // ∫ k e^(ax) = (k/a) e^(ax); ∫ k cos(ax) = (k/a) sin(ax); ∫ k sin(ax) = −(k/a) cos(ax)
      const c = new Q(kind === 'sin' ? -k : k, a);
      const F = kind === 'exp' ? pow(id('e'), ax) : call(kind === 'cos' ? 'sin' : 'cos', ax);
      return { target: [f], question: `integrate(${printNode(f)}, x)`, answer: `${text(mul(c.node(), F))} + C` };
    },
  },

  // ---- advanced: the same topics, with two rules at once
  'derivative-exp-trig': {
    topic: 'derivative',
    make: (r) => {
      const [a, b, k] = [r.nonzero(-3, 3), r.nonzero(1, 4), r.nonzero(1, 5)];
      const ex = pow(id('e'), a === 1 ? X : mul(num(a), X));
      const trig = call(r.pick(['sin', 'cos']), b === 1 ? X : mul(num(b), X));
      return derivative(k === 1 ? mul(ex, trig) : mul(num(k), mul(ex, trig)));
    },
  },
  'derivative-power-of-trig': {
    topic: 'derivative',
    make: (r) => {
      const [n, a] = [r.int(2, 5), r.nonzero(1, 4)];
      const inner = call(r.pick(['sin', 'cos', 'tan']), a === 1 ? X : mul(num(a), X));
      return derivative(mul(pow(X, num(r.int(1, 3))), pow(inner, num(n))));
    },
  },
  'derivative-log-quotient': {
    topic: 'derivative',
    make: (r) => {
      const [a, b] = [r.int(1, 5), r.int(1, 9)];
      const top = call('ln', poly([b, 0, a]));
      return derivative(div(top, r.int(0, 1) ? X : poly([r.int(1, 4), 0, 1])));
    },
  },
  'equation-cubic': {
    topic: 'equation',
    make: (r) => {
      const pick = new Set<number>();
      while (pick.size < 3) pick.add(r.int(-5, 5));
      const [r1, r2, r3] = [...pick] as [number, number, number];
      const k = r.pick([1, 1, 2, -1]);
      // k(x − r1)(x − r2)(x − r3)
      const coeffs = [-k * r1 * r2 * r3, k * (r1 * r2 + r1 * r3 + r2 * r3), -k * (r1 + r2 + r3), k];
      const left = poly(coeffs);
      return { target: [left, num(0)], question: `${printNode(left)} = 0`, ...roots([r1, r2, r3].map((v) => new Q(v))) };
    },
  },
  'equation-fraction-roots': {
    topic: 'equation',
    make: (r) => {
      const [p, q, u, v] = [r.int(2, 5), r.nonzero(-7, 7), r.int(1, 4), r.nonzero(-7, 7)];
      // (p x − q)(u x − v) = 0, written out
      const coeffs = [q * v, -(p * v + q * u), p * u];
      const left = poly(coeffs);
      return { target: [left, num(0)], question: `${printNode(left)} = 0`, ...roots([new Q(q, p), new Q(v, u)]) };
    },
  },
  'integral-substitution': {
    topic: 'integral',
    make: (r) => {
      const [k, a] = [r.nonzero(1, 6), r.int(1, 9)];
      const inner = poly([a, 0, 1]);
      if (r.int(0, 1)) {
        // k x (x² + a)^n  →  k/(2(n+1)) (x² + a)^(n+1)
        const n = r.int(2, 5);
        return integral(mul(num(2 * k), mul(X, pow(inner, num(n)))), mul(new Q(k, n + 1).node(), pow(inner, num(n + 1))));
      }
      // 2k x e^(x²)  →  k e^(x²)
      return integral(mul(num(2 * k), mul(X, pow(id('e'), pow(X, num(2))))), mul(num(k), pow(id('e'), pow(X, num(2)))));
    },
  },
  'integral-parts': {
    topic: 'integral',
    make: (r) => {
      const a = r.nonzero(-3, 3);
      const ax = a === 1 ? X : mul(num(a), X);
      const inv = new Q(1, a);
      const inv2 = new Q(1, a * a);
      const kind = r.pick(['exp', 'cos', 'sin'] as const);
      if (kind === 'exp') {
        // ∫ x e^(ax) = (x/a − 1/a²) e^(ax)
        return integral(mul(X, pow(id('e'), ax)), mul(add(mul(inv.node(), X), inv2.neg().node()), pow(id('e'), ax)));
      }
      if (kind === 'cos') {
        // ∫ x cos(ax) = x sin(ax)/a + cos(ax)/a²
        return integral(mul(X, call('cos', ax)), add(mul(inv.node(), mul(X, call('sin', ax))), mul(inv2.node(), call('cos', ax))));
      }
      // ∫ x sin(ax) = −x cos(ax)/a + sin(ax)/a²
      return integral(mul(X, call('sin', ax)), add(mul(inv.neg().node(), mul(X, call('cos', ax))), mul(inv2.node(), call('sin', ax))));
    },
  },

  // ---- exam-style (평가원): see exam.ts
  ...Object.fromEntries(
    Object.entries(EXAM_TEMPLATES).map(([name, t]) => [
      name,
      {
        topic: t.unit,
        make: (r: ReturnType<typeof rng>) => {
          const made = t.make(r);
          return { target: [], question: made.prompt.en, answer: String(made.value), value: made.value, points: t.points, prompt: made.prompt, solution: made.solution };
        },
      } satisfies Template,
    ]),
  ),
};

const examOf = (unit: Unit) => Object.entries(EXAM_TEMPLATES).filter(([, t]) => t.unit === unit).map(([name]) => name);

/** the templates for each level and topic */
export const LEVEL_TEMPLATES: Record<Level, Partial<Record<Topic, string[]>>> = {
  basic: {
    derivative: ['derivative-polynomial', 'derivative-product', 'derivative-chain', 'derivative-quotient'],
    equation: ['equation-linear', 'equation-quadratic'],
    integral: ['integral-polynomial', 'integral-basic'],
  },
  advanced: {
    derivative: ['derivative-exp-trig', 'derivative-power-of-trig', 'derivative-log-quotient', 'derivative-quotient'],
    equation: ['equation-cubic', 'equation-fraction-roots'],
    integral: ['integral-substitution', 'integral-parts'],
  },
  exam: { algebra: examOf('algebra'), calculus: examOf('calculus'), calc2: examOf('calc2'), stats: examOf('stats') },
};
/** the basic templates, by topic */
export const TOPIC_TEMPLATES = LEVEL_TEMPLATES.basic as Record<'derivative' | 'equation' | 'integral', string[]>;
/** the topics a level offers, in order */
export const levelTopics = (level: Level): Topic[] => Object.keys(LEVEL_TEMPLATES[level]) as Topic[];

export function makeProblem(template: string, seed: number): Problem {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`No practice template ${template}`);
  const made = t.make(rng(seed));
  return { topic: t.topic, template, seed, ...made };
}

/** A new problem on a topic: a random template, a random seed. */
export function nextProblem(topic: Topic, random = Math.random, level: Level = 'basic'): Problem {
  const list = LEVEL_TEMPLATES[level][topic] ?? LEVEL_TEMPLATES.basic[topic] ?? LEVEL_TEMPLATES.exam[topic]!;
  return makeProblem(list[Math.floor(random() * list.length)]!, Math.floor(random() * 2 ** 31));
}

const ctx = { vars: ['x'], value: () => undefined, func: () => undefined, angle: 'rad' as const };
const POINTS = [0.37, 0.81, 1.23, 1.77, 2.31, 2.93, -0.53, -1.41];

/** the right side of `y = …`, `f'(x) = …`; a trailing + C dropped */
function answerExpression(input: string): Node {
  let s = input.trim().replace(/\+\s*C\s*$/u, '').trim();
  const eq = s.lastIndexOf('=');
  if (eq >= 0) s = s.slice(eq + 1);
  return parseExpression(s);
}

/**
 * Is the answer right? Expressions are compared by value at several points
 * (so 2x(x+1) and 2x^2 + 2x are both right); antiderivatives by their
 * differences, so any + C is fine; equations by their set of solutions.
 */
export function checkAnswer(p: Problem, input: string): Verdict {
  if (!input.trim()) return { correct: false, reason: 'empty' };
  if (p.value !== undefined) return checkValue(p.value, input);
  if (p.topic === 'equation') return checkSolutions(p, input);

  let given: (v: number[]) => number;
  try {
    given = compileReal(answerExpression(input), ctx);
  } catch (e) {
    return { correct: false, reason: /not defined|unknown|can't be graphed/i.test(String(e)) ? 'names' : 'unreadable' };
  }
  const expected =
    p.topic === 'derivative'
      ? compileReal(diffSteps(p.target[0]!, 'x').result, ctx)
      : // the integrand: compare F(b) − F(a) with ∫ₐᵇ f by Simpson's rule
        compileReal(p.target[0]!, ctx);
  const at = POINTS.filter((x) => Number.isFinite(expected([x])) && Number.isFinite(given([x])));
  if (at.length < 3) return { correct: false, reason: 'wrong' };
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
  if (p.topic === 'derivative') return at.every((x) => close(given([x]), expected([x]))) ? { correct: true } : { correct: false, reason: 'wrong' };
  const integral = (a: number, b: number) => {
    const n = 200;
    const hh = (b - a) / n;
    let s = expected([a]) + expected([b]);
    for (let k = 1; k < n; k++) s += (k % 2 ? 4 : 2) * expected([a + k * hh]);
    return (s * hh) / 3;
  };
  for (let k = 0; k + 1 < at.length; k++) {
    const [a, b] = [Math.min(at[k]!, at[k + 1]!), Math.max(at[k]!, at[k + 1]!)];
    if (!close(given([b]) - given([a]), integral(a, b))) return { correct: false, reason: 'wrong' };
  }
  return { correct: true };
}

/** a number answer: any form with the same value (12, 24/2, 2^2 * 3) */
function checkValue(expected: number, input: string): Verdict {
  const eq = input.lastIndexOf('=');
  try {
    const st = parse(eq >= 0 ? input.slice(eq + 1) : input);
    if (st.kind !== 'expr') return { correct: false, reason: 'unreadable' };
    const v = evaluate(st.expr, EMPTY_ENV, DEFAULT_SETTINGS);
    if (v.kind !== 'num' || !v.z.isReal()) return { correct: false, reason: 'unreadable' };
    return Math.abs(v.z.re - expected) <= 1e-9 * Math.max(1, Math.abs(expected)) ? { correct: true } : { correct: false, reason: 'wrong' };
  } catch (e) {
    return { correct: false, reason: /not defined/i.test(String(e)) ? 'names' : 'unreadable' };
  }
}

function checkSolutions(p: Problem, input: string): Verdict {
  const parts = input
    .replace(/[{}]/g, '')
    .split(/,|;|\bor\b|또는/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const values: number[] = [];
  for (const part of parts) {
    const eq = part.lastIndexOf('=');
    const rhs = eq >= 0 ? part.slice(eq + 1) : part;
    try {
      const st = parse(rhs);
      if (st.kind !== 'expr') return { correct: false, reason: 'unreadable' };
      const v = evaluate(st.expr, EMPTY_ENV, DEFAULT_SETTINGS);
      if (v.kind !== 'num' || !v.z.isReal()) return { correct: false, reason: 'unreadable' };
      values.push(v.z.re);
    } catch {
      return { correct: false, reason: 'unreadable' };
    }
  }
  const expected = p.solutions ?? [];
  const unique = values.filter((v, k) => values.findIndex((w) => Math.abs(w - v) < 1e-9) === k);
  if (unique.length !== expected.length) return { correct: false, reason: 'count' };
  const ok = expected.every((s) => unique.some((v) => Math.abs(v - s) < 1e-9 * Math.max(1, Math.abs(s))));
  return ok ? { correct: true } : { correct: false, reason: 'wrong' };
}

/** the steps for a problem's working, where the steps engine has them (integrals come from SymPy) */
export function problemSteps(p: Problem) {
  if (p.topic === 'derivative') return { kind: 'derivative' as const, steps: diffSteps(p.target[0]!, 'x') };
  if (p.topic === 'equation') return { kind: 'equation' as const, steps: solveSteps(p.target[0]!, p.target[1]!, 'x') };
  return null;
}


/** a mock exam problem: its number on the paper, and five choices when it is multiple choice */
export interface ExamItem extends Problem {
  number: number;
  choices?: number[];
}

/**
 * A full paper laid out like the 수능 mathematics section: 22 common
 * problems (수학Ⅰ and 수학Ⅱ: 1–15 five-choice, 16–22 short answer) and 8 on
 * the elective (23–28 five-choice, 29–30 short answer), 100 points in all,
 * easiest first in each part. Short answers are natural numbers below 1000.
 */
export function mockExam(elective: 'calc2' | 'stats', random = Math.random): ExamItem[] {
  const parts: { units: Unit[]; points: number[]; choice: boolean }[] = [
    { units: ['algebra', 'calculus'], points: [2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4], choice: true },
    { units: ['algebra', 'calculus'], points: [3, 3, 3, 3, 4, 4, 4], choice: false },
    { units: [elective], points: [2, 3, 3, 3, 3, 4], choice: true },
    { units: [elective], points: [4, 4], choice: false },
  ];
  const used = new Set<string>();
  const out: ExamItem[] = [];
  let turn = 0;
  for (const part of parts) {
    for (const points of part.points) {
      const unit = part.units[turn++ % part.units.length]!;
      const pool = Object.entries(EXAM_TEMPLATES).filter(([name, t]) => t.unit === unit && !used.has(name));
      const all = pool.length ? pool : Object.entries(EXAM_TEMPLATES).filter(([, t]) => t.unit === unit);
      // the same points if there are any left, the nearest otherwise
      const best = Math.min(...all.map(([, t]) => Math.abs(t.points - points)));
      const fits = all.filter(([, t]) => Math.abs(t.points - points) === best);
      let made: Problem | null = null;
      for (let tries = 0; tries < 120 && !made; tries++) {
        // the right points first; any template of the unit if those can't give a natural answer
        const from = tries < 60 ? fits : all.length > 1 ? all : Object.entries(EXAM_TEMPLATES).filter(([, t]) => t.unit === unit);
        const [name] = from[Math.floor(random() * from.length)]!;
        const p = makeProblem(name, Math.floor(random() * 2 ** 31));
        if (!part.choice && !(p.value! >= 1 && p.value! <= 999)) continue;
        made = p;
        used.add(name);
      }
      if (!made) continue;
      const item: ExamItem = { ...made, points, number: out.length + 1 };
      if (part.choice) {
        const v = made.value!;
        const step = Math.max(1, Math.round(Math.abs(v) / 12));
        let at = Math.floor(random() * 5);
        // a positive answer gets positive choices, as on the paper
        if (v >= 1) at = Math.min(at, Math.floor((v - 1) / step));
        item.choices = Array.from({ length: 5 }, (_, j) => v + (j - at) * step);
      }
      out.push(item);
    }
  }
  return out;
}
