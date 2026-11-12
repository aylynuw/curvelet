import { liftPower, MathError, type Node } from './ast';
import { CONSTANTS, FUNCTIONS, VALUE_FUNCTIONS, factorial, logBase, type EvalSettings } from './builtins';
import { Complex } from './complex';
import { transpose } from './matrix';
import { GEOMETRY_FUNCTIONS } from './geometry';
import { STATS_FUNCTIONS, evalFit } from './stats';
import { SYMBOLIC_OPS } from './symbolic';
import { binary, kindName, list, mapScalar, matrix, negate, num, scalars, type Value } from './value';

export interface UserFunction {
  params: string[];
  body: Node;
}

/** Where the evaluator looks up names that aren't built in. */
export interface Env {
  value(name: string): Value | undefined;
  func(name: string): UserFunction | undefined;
}

export const EMPTY_ENV: Env = { value: () => undefined, func: () => undefined };

/**
 * Functions whose arguments aren't all plain values: seq binds its variable,
 * iterate and cobweb take a function's name, the fields have free x and y.
 */
export const SPECIAL_FORMS = new Set(['seq', 'iterate', 'cobweb', 'slopefield', 'vectorfield']);
export const FIELD_FORMS = new Set(['slopefield', 'vectorfield']);

const LIMIT = 10000;

/**
 * How a bare name is read, shared by the evaluator and the workspace's
 * dependency analysis so both agree:
 *  1. a known name (parameter, definition, constant) is itself
 *  2. otherwise a run of single letters that are all known is a product: `ab` → a·b
 *  3. otherwise null (not defined)
 */
export function splitName(name: string, isKnown: (n: string) => boolean): string[] | null {
  if (isKnown(name)) return [name];
  const letters = [...name];
  if (letters.length > 1 && letters.every((c) => /\p{L}/u.test(c) && isKnown(c))) return letters;
  return null;
}

export function evaluate(node: Node, env: Env, settings: EvalSettings): Value {
  return new Evaluator(settings).eval(node, env);
}

class Evaluator {
  constructor(private s: EvalSettings) {}

  /** In real mode, refuse results that left the real numbers. */
  private check(result: Value, what: string): Value {
    if (!this.s.complex && scalars(result).some((z) => z.im !== 0 && !z.isNaN())) {
      throw new MathError(`${what} is not a real number (turn on complex mode to see it)`);
    }
    return result;
  }

  eval(node: Node, env: Env): Value {
    switch (node.type) {
      case 'num':
        return node.base ? { kind: 'num', z: new Complex(node.value), base: node.base } : num(node.value);

      case 'ident':
        return this.ident(node.name, env);

      case 'list':
        return this.list(node.items.map((item) => this.eval(item, env)));

      case 'unary':
        return negate(this.eval(node.arg, env));

      case 'abs': {
        const v = this.eval(node.arg, env);
        if (v.kind === 'list') return num(Math.hypot(...v.items.map((z) => z.abs())));
        if (v.kind === 'matrix') throw new MathError('|A| is ambiguous for a matrix: write det(A)');
        return mapScalar(v, (z) => new Complex(z.abs()), '|…|');
      }

      case 'factorial':
        return mapScalar(this.eval(node.arg, env), (z) => {
          if (!z.isReal()) throw new MathError('! needs a real number');
          return new Complex(factorial(z.re));
        }, '!');

      case 'call':
        return this.call(node, env);

      case 'rel':
        throw new MathError('A comparison like x = 2 only works inside solve(…)');

      case 'tuple': {
        const x = this.eval(node.items[0], env);
        const y = this.eval(node.items[1], env);
        if (x.kind !== 'num' || y.kind !== 'num' || !x.z.isReal() || !y.z.isReal()) {
          throw new MathError('A point needs two real numbers: (x, y)');
        }
        return { kind: 'point', x: x.z.re, y: y.z.re };
      }

      case 'binary': {
        const lifted = liftPower(node, (n) => this.multiplies(n, env));
        if (lifted !== node) return this.eval(lifted, env);
        // A^T: transpose, unless the user defined their own T
        if (node.op === '^' && node.right.type === 'ident' && node.right.name === 'T' && env.value('T') === undefined) {
          const m = this.eval(node.left, env);
          if (m.kind === 'matrix') return matrix(transpose(m));
          if (m.kind === 'list') return matrix(transpose({ rows: 1, cols: m.items.length, data: m.items }));
          throw new MathError(`^T needs a matrix, not ${kindName(m)}`);
        }
        const a = this.eval(node.left, env);
        const b = this.eval(node.right, env);
        const result = binary(node.op, a, b, (x, y) => this.pow(x, y));
        return node.op === '^' ? this.check(result, 'This power') : result;
      }
    }
  }

  /** [1, 2, 3] is a list; [[1, 2], [3, 4]] (lists of equal length) is a matrix */
  private list(items: Value[]): Value {
    if (items.length === 0) return list([]);
    if (items.every((v) => v.kind === 'num')) return list(items.map((v) => (v as { z: Complex }).z));
    if (items.every((v) => v.kind === 'list')) {
      const rows = items as Extract<Value, { kind: 'list' }>[];
      const cols = rows[0]!.items.length;
      if (cols === 0 || rows.some((r) => r.items.length !== cols)) {
        throw new MathError('Every row of a matrix needs the same number of entries');
      }
      return matrix({ rows: rows.length, cols, data: rows.flatMap((r) => r.items) });
    }
    throw new MathError('A list holds numbers; a matrix holds rows like [[1, 2], [3, 4]]');
  }

  /** In real mode, odd roots of negative numbers stay real: (-8)^(1/3) = -2 */
  private pow(a: Complex, b: Complex): Complex {
    if (!this.s.complex && a.isReal() && b.isReal() && a.re < 0 && !Number.isInteger(b.re)) {
      for (let q = 3; q <= 99; q += 2) {
        const p = Math.round(b.re * q);
        if (Math.abs(b.re * q - p) < 1e-9) {
          const magnitude = Math.pow(-a.re, b.re);
          return new Complex(p % 2 === 0 ? magnitude : -magnitude);
        }
      }
    }
    return a.pow(b);
  }

  private ident(name: string, env: Env): Value {
    const isKnown = (n: string) => env.value(n) !== undefined || n in CONSTANTS;
    const parts = splitName(name, isKnown);
    if (!parts) {
      if (env.func(name) || name in FUNCTIONS || name in VALUE_FUNCTIONS || name in GEOMETRY_FUNCTIONS || name in STATS_FUNCTIONS) {
        throw new MathError(`${name} is a function: write ${name}(x)`);
      }
      const fn = Object.keys(FUNCTIONS).find((f) => name.startsWith(f) && name.length > f.length);
      const hint = fn ? ` Did you mean ${fn}(${name.slice(fn.length)})?` : '';
      throw new MathError(`${name} is not defined.${hint}`);
    }
    return parts.map((p) => this.single(p, env)).reduce((acc, v) => binary('*', acc, v));
  }

  private single(name: string, env: Env): Value {
    const v = env.value(name);
    if (v !== undefined) return v;
    if (name === 'i' && !this.s.complex) throw new MathError('i is only available in complex mode');
    return num(CONSTANTS[name]!);
  }

  private call(node: Extract<Node, { type: 'call' }>, env: Env): Value {
    const { name, primes } = node;
    if (primes > 0 || SYMBOLIC_OPS.has(name)) {
      // the workspace replaces these before evaluating; reaching here means no symbolic engine
      throw new MathError(`${primes > 0 ? `${name}${"'".repeat(primes)}` : name} needs the symbolic engine`);
    }

    const user = env.func(name);
    if (user) {
      if (node.args.length !== user.params.length) {
        throw new MathError(`${name} takes ${user.params.length} argument${user.params.length === 1 ? '' : 's'}, got ${node.args.length}`);
      }
      const args = node.args.map((a) => this.eval(a, env));
      const local: Env = {
        value: (n) => {
          const k = user.params.indexOf(n);
          return k >= 0 ? args[k] : env.value(n);
        },
        func: (n) => env.func(n),
      };
      return this.eval(user.body, local);
    }

    if (name === 'seq') return this.seq(node, env);
    if (name === 'iterate' || name === 'cobweb') return this.iterate(node, env);
    if (FIELD_FORMS.has(name)) throw new MathError(`${name} is drawn on the graph and has no value of its own`);

    const base = logBase(name);
    if (base !== null) {
      if (node.args.length !== 1) throw new MathError(`${name} takes 1 argument`);
      const lnBase = new Complex(Math.log(base));
      return this.check(mapScalar(this.eval(node.args[0]!, env), (z) => z.log().div(lnBase), name), name);
    }

    const valueFn = VALUE_FUNCTIONS[name] ?? GEOMETRY_FUNCTIONS[name] ?? STATS_FUNCTIONS[name];
    if (valueFn) {
      this.checkArity(name, valueFn.arity, node.args.length);
      const args = node.args.map((a) => this.eval(a, env));
      return this.check(valueFn.fn(args, this.s), `${name}(…)`);
    }

    const builtin = FUNCTIONS[name];
    if (builtin) {
      let args = node.args.map((a) => this.eval(a, env));
      const [min, max] = builtin.arity;
      // max([3, 1, 2]): a variadic function spreads a single list
      const only = args.length === 1 ? args[0]! : null;
      if (max === Infinity && only?.kind === 'list') args = only.items.map((z) => num(z));
      this.checkArity(name, [min, max], args.length);
      return this.check(this.applyScalar(name, args, builtin.fn), `${name}(${args.length === 1 ? '…' : '…, …'})`);
    }

    // f(6) where f = linreg(…): evaluate the fitted model
    const fitted = env.value(name);
    if (fitted?.kind === 'fit') {
      if (node.args.length !== 1) throw new MathError(`${name} takes 1 argument`);
      const fit = fitted.fit;
      return mapScalar(this.eval(node.args[0]!, env), (z) => {
        if (!z.isReal()) throw new MathError(`${name} needs a real number`);
        return new Complex(evalFit(fit, z.re));
      }, name);
    }

    // a(x + 1) where a is a number means a · (x + 1)
    const isKnown = (n: string) => env.value(n) !== undefined || n in CONSTANTS;
    if (splitName(name, isKnown) && node.args.length === 1) {
      return binary('*', this.ident(name, env), this.eval(node.args[0]!, env));
    }
    throw new MathError(`${name} is not defined`);
  }

  /** a name in front of a bracket that multiplies it (a number), rather than a function */
  private multiplies(name: string, env: Env): boolean {
    if (env.func(name) || FUNCTIONS[name] || VALUE_FUNCTIONS[name] || GEOMETRY_FUNCTIONS[name] || STATS_FUNCTIONS[name]) return false;
    if (logBase(name) !== null || SPECIAL_FORMS.has(name) || SYMBOLIC_OPS.has(name) || env.value(name)?.kind === 'fit') return false;
    return !!splitName(name, (n) => env.value(n) !== undefined || n in CONSTANTS);
  }

  private realArg(node: Node | undefined, env: Env, what: string): number {
    const v = node ? this.eval(node, env) : undefined;
    if (v?.kind === 'num' && v.z.isReal()) return v.z.re;
    throw new MathError(`${what} needs a real number there`);
  }

  /** seq(expr, n, from, to[, step]): expr for n = from, from + step, …, up to to */
  private seq(node: Extract<Node, { type: 'call' }>, env: Env): Value {
    const [expr, variable, a, b, s] = node.args;
    if (node.args.length < 4 || node.args.length > 5 || variable?.type !== 'ident' || !expr) {
      throw new MathError('Write seq(expression, n, from, to), like seq(n^2, n, 1, 10)');
    }
    const from = this.realArg(a, env, 'seq');
    const to = this.realArg(b, env, 'seq');
    const step = s ? this.realArg(s, env, 'seq') : 1;
    if (step === 0 || Math.sign(to - from) * Math.sign(step) < 0) throw new MathError('seq: the step must head from the start towards the end');
    const count = Math.floor((to - from) / step + 1e-9) + 1;
    if (count > LIMIT) throw new MathError(`seq makes at most ${LIMIT} terms`);
    const items: Complex[] = [];
    for (let k = 0; k < count; k++) {
      const n = num(from + k * step);
      const local: Env = { value: (name) => (name === variable.name ? n : env.value(name)), func: (name) => env.func(name) };
      const v = this.eval(expr, local);
      if (v.kind !== 'num') throw new MathError('seq: each term must be a number');
      items.push(v.z);
    }
    return list(items);
  }

  /** A function given by name, for iterate and cobweb: a definition, a built-in like cos, or a fit. */
  functionArg(node: Node | undefined, env: Env, what: string): (x: number) => number {
    if (node?.type !== 'ident') throw new MathError(`${what} needs the name of a function of one variable, like f`);
    const name = node.name;
    const user = env.func(name);
    const known = (user && user.params.length === 1) || name in FUNCTIONS || env.value(name)?.kind === 'fit';
    if (!known) throw new MathError(`${what} needs the name of a function of one variable; ${name} isn't one`);
    return (x) => {
      const v = this.call({ type: 'call', name, args: [{ type: 'num', value: x }], primes: 0 }, env);
      return v.kind === 'num' && v.z.isReal() ? v.z.re : NaN;
    };
  }

  /** iterate(f, x0, n): x0, f(x0), f(f(x0)), … with n steps */
  private iterate(node: Extract<Node, { type: 'call' }>, env: Env): Value {
    if (node.args.length !== 3) throw new MathError(`Write ${node.name}(f, start, steps), like ${node.name}(f, 0.5, 20)`);
    const f = this.functionArg(node.args[0], env, node.name);
    let x = this.realArg(node.args[1], env, node.name);
    const steps = this.realArg(node.args[2], env, node.name);
    if (!Number.isInteger(steps) || steps < 0 || steps > LIMIT) throw new MathError(`${node.name}: the number of steps must be a whole number from 0 to ${LIMIT}`);
    const items = [new Complex(x)];
    for (let k = 0; k < steps; k++) {
      x = f(x);
      items.push(new Complex(x));
    }
    return list(items);
  }

  private checkArity(name: string, [min, max]: [number, number], n: number): void {
    if (n >= min && n <= max) return;
    const expected = min === max ? `${min}` : max === Infinity ? `at least ${min}` : `${min}–${max}`;
    throw new MathError(`${name} takes ${expected} argument${min === 1 && max === 1 ? '' : 's'}, got ${n}`);
  }

  /** Scalar functions work on numbers, and entry by entry on lists: sin([0, pi]) */
  private applyScalar(name: string, args: Value[], fn: (a: Complex[], s: EvalSettings) => Complex): Value {
    const lists = args.filter((a) => a.kind === 'list') as Extract<Value, { kind: 'list' }>[];
    for (const a of args) {
      if (a.kind === 'matrix' || a.kind === 'bool' || a.kind === 'point' || a.kind === 'shape') throw new MathError(`${name} works on numbers and lists, not ${kindName(a)}`);
    }
    if (lists.length === 0) return num(fn(args.map((a) => (a as { z: Complex }).z), this.s));
    const length = lists[0]!.items.length;
    if (lists.some((l) => l.items.length !== length)) throw new MathError(`${name}: lists have different lengths`);
    const items: Complex[] = [];
    for (let k = 0; k < length; k++) {
      items.push(fn(args.map((a) => (a.kind === 'list' ? a.items[k]! : (a as { z: Complex }).z)), this.s));
    }
    return list(items);
  }
}
