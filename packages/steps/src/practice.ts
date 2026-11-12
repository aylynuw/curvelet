import { compileReal, DEFAULT_SETTINGS, EMPTY_ENV, evaluate, parse, parseExpression, printNode, type Node } from '@math/engine';
import { call, id, mul, num, pow, tidy } from './ast';
import { diffSteps } from './derivative';
import { solveSteps } from './equation';
import { polyNode, Q, toPoly, type Poly } from './rational';

export type Topic = 'derivative' | 'equation' | 'integral';

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
  make(r: ReturnType<typeof rng>): { target: Node[]; question: string; answer: string; solutions?: number[] };
}

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
};

export const TOPIC_TEMPLATES: Record<Topic, string[]> = {
  derivative: ['derivative-polynomial', 'derivative-product', 'derivative-chain', 'derivative-quotient'],
  equation: ['equation-linear', 'equation-quadratic'],
  integral: ['integral-polynomial', 'integral-basic'],
};

export function makeProblem(template: string, seed: number): Problem {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`No practice template ${template}`);
  const made = t.make(rng(seed));
  return { topic: t.topic, template, seed, ...made };
}

/** A new problem on a topic: a random template, a random seed. */
export function nextProblem(topic: Topic, random = Math.random): Problem {
  const list = TOPIC_TEMPLATES[topic];
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

