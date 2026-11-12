import type { Node } from '@math/engine';
import { add, call, div, has, id, isNum, isVar, mul, neg, num, numValue, pow, sub, tidy } from './ast';

export type DiffRule =
  | 'constant' | 'variable' | 'sum' | 'constantMultiple' | 'negation'
  | 'power' | 'product' | 'quotient' | 'exponential' | 'exponentialBase' | 'generalPower'
  | 'function';

/**
 * One step: d/dx of `expr` is `result`, by `rule`. `fn` names the function
 * for the function rule (sin, ln, …); `inner` is set when the chain rule
 * applies (the inside isn't just x). `sub` are the derivatives this step needed.
 */
export interface DiffStep {
  expr: Node;
  rule: DiffRule;
  result: Node;
  fn?: string;
  inner?: Node;
  /** the constant pulled out by the constant-multiple rule, the exponent of the power rule */
  factor?: Node;
  sub: DiffStep[];
}

export class NoSteps extends Error {}

/** f'(u) for each function f, written with u. */
const DERIVATIVES: Record<string, (u: Node) => Node> = {
  sin: (u) => call('cos', u),
  cos: (u) => neg(call('sin', u)),
  tan: (u) => pow(call('sec', u), num(2)),
  sec: (u) => mul(call('sec', u), call('tan', u)),
  csc: (u) => neg(mul(call('csc', u), call('cot', u))),
  cot: (u) => neg(pow(call('csc', u), num(2))),
  ln: (u) => div(num(1), u),
  log: (u) => div(num(1), mul(u, call('ln', num(10)))),
  exp: (u) => call('exp', u),
  sqrt: (u) => div(num(1), mul(num(2), call('sqrt', u))),
  cbrt: (u) => div(num(1), mul(num(3), pow(call('cbrt', u), num(2)))),
  arcsin: (u) => div(num(1), call('sqrt', sub(num(1), pow(u, num(2))))),
  arccos: (u) => neg(div(num(1), call('sqrt', sub(num(1), pow(u, num(2)))))),
  arctan: (u) => div(num(1), add(num(1), pow(u, num(2)))),
  sinh: (u) => call('cosh', u),
  cosh: (u) => call('sinh', u),
  tanh: (u) => sub(num(1), pow(call('tanh', u), num(2))),
};
const ALIAS: Record<string, string> = { asin: 'arcsin', acos: 'arccos', atan: 'arctan' };

/**
 * d/dx of an expression, with the rule used at every level.
 * Throws NoSteps for anything outside the rules (abs, user functions left unexpanded, lists).
 */
export function diffSteps(expr: Node, x: string): DiffStep {
  const d = (n: Node) => diffSteps(n, x);
  const done = (rule: DiffRule, result: Node, sub: DiffStep[] = [], extra: Partial<DiffStep> = {}): DiffStep => ({
    expr,
    rule,
    result: tidy(result),
    sub,
    ...extra,
  });

  if (!has(expr, x)) return done('constant', num(0));
  switch (expr.type) {
    case 'ident':
      return done('variable', num(1));
    case 'unary': {
      const s = d(expr.arg);
      return done('negation', neg(s.result), [s]);
    }
    case 'binary': {
      const { op, left: u, right: v } = expr;
      if (op === '+' || op === '-') {
        const [su, sv] = [d(u), d(v)];
        return done('sum', op === '+' ? add(su.result, sv.result) : sub(su.result, sv.result), [su, sv]);
      }
      if (op === '*') {
        // c · u: the constant stays in front
        if (!has(u, x)) {
          const s = d(v);
          return done('constantMultiple', mul(u, s.result), [s], { factor: u });
        }
        if (!has(v, x)) {
          const s = d(u);
          return done('constantMultiple', mul(v, s.result), [s], { factor: v });
        }
        const [su, sv] = [d(u), d(v)];
        return done('product', add(mul(su.result, v), mul(u, sv.result)), [su, sv]);
      }
      if (op === '/') {
        if (!has(v, x)) {
          const s = d(u);
          return done('constantMultiple', div(s.result, v), [s], { factor: div(num(1), v) });
        }
        const [su, sv] = [d(u), d(v)];
        return done('quotient', div(sub(mul(su.result, v), mul(u, sv.result)), pow(v, num(2))), [su, sv]);
      }
      if (op === '^') {
        // u^n: the power rule, with the chain rule when u isn't x
        if (!has(v, x)) {
          const n = numValue(v);
          const lowered = n !== null ? num(n - 1) : sub(v, num(1));
          const outer = mul(v, pow(u, lowered));
          if (isVar(u, x)) return done('power', outer, [], { factor: v });
          const s = d(u);
          return done('power', mul(s.result, outer), [s], { factor: v, inner: u });
        }
        // e^u and a^u
        if (!has(u, x)) {
          const isE = u.type === 'ident' && u.name === 'e';
          const outer = isE ? pow(u, v) : mul(pow(u, v), call('ln', u));
          if (isVar(v, x)) return done(isE ? 'exponential' : 'exponentialBase', outer);
          const s = d(v);
          return done(isE ? 'exponential' : 'exponentialBase', mul(s.result, outer), [s], { inner: v });
        }
        // u^v: write it as e^(v ln u)
        const [su, sv] = [d(u), d(v)];
        return done('generalPower', mul(expr, add(mul(sv.result, call('ln', u)), div(mul(v, su.result), u))), [su, sv]);
      }
      break;
    }
    case 'call': {
      const name = ALIAS[expr.name] ?? expr.name;
      const rule = DERIVATIVES[name];
      if (!rule || expr.args.length !== 1 || expr.primes > 0) break;
      const u = expr.args[0]!;
      const outer = rule(u);
      if (isVar(u, x)) return done('function', outer, [], { fn: name });
      const s = d(u);
      // the inside's derivative in front, as it is usually written: 2x cos(x²)
      return done('function', mul(s.result, outer), [s], { fn: name, inner: u });
    }
  }
  throw new NoSteps(`No step-by-step rule for this expression`);
}

/** The steps in reading order: each step, then the steps it needed. d/dx x = 1 is left out. */
export function flattenDiff(step: DiffStep, depth = 0): { step: DiffStep; depth: number }[] {
  const out = [{ step, depth }];
  for (const s of step.sub) {
    if (s.rule === 'variable') continue;
    out.push(...flattenDiff(s, depth + 1));
  }
  return out;
}

export { isNum, id };
