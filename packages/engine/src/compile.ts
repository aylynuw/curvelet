import { liftPower, MathError, type Node } from './ast';
import { factorial, logBase, type AngleUnit } from './builtins';
import { Complex } from './complex';
import { compareReal, splitName } from './evaluate';
import { binomPdf, chiSqPdf, normalPdf, poissonPdf, tPdf } from './stats';
import { substitute } from './symbolic';

/** A compiled real function of the graph variables, called with their values in order. */
export type RealFn = (v: number[]) => number;

export interface CompileContext {
  /** the free variables, in the order RealFn receives them: ['x'] or ['x', 'y'] */
  vars: string[];
  /** a user-defined real number, or undefined */
  value(name: string): number | undefined;
  /** a user-defined function with its (expanded) formula, or undefined */
  func(name: string): { params: string[]; body: Node } | undefined;
  /** a function computed natively (a fitted model), or undefined */
  native?(name: string): ((x: number) => number) | undefined;
  angle: AngleUnit;
}

/** a condition in cases: a comparison, or and(…)/or(…) of them, as a test on the graph variables */
function compileCondition(cond: Node, c: (n: Node) => RealFn): (v: number[]) => boolean {
  if (cond.type === 'call' && (cond.name === 'and' || cond.name === 'or')) {
    const parts = cond.args.map((a) => compileCondition(a, c));
    return cond.name === 'and' ? (v) => parts.every((p) => p(v)) : (v) => parts.some((p) => p(v));
  }
  if (cond.type !== 'rel') throw new MathError('A case needs a condition, like x < 0');
  const [a, b] = [c(cond.left), c(cond.right)];
  const op = cond.op;
  return (v) => compareReal(op, a(v), b(v));
}

const CONST: Record<string, number> = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI, inf: Infinity };
const DEG = Math.PI / 180;

/** (-8)^(1/3) = -2: odd roots of negative numbers stay real, as in the evaluator's real mode */
export function realPow(a: number, b: number): number {
  if (a >= 0 || Number.isInteger(b)) return Math.pow(a, b);
  for (let q = 3; q <= 99; q += 2) {
    const p = Math.round(b * q);
    if (Math.abs(b * q - p) < 1e-9) {
      const m = Math.pow(-a, b);
      return p % 2 === 0 ? m : -m;
    }
  }
  return NaN;
}

function realFunctions(angle: AngleUnit): Record<string, (a: number[]) => number> {
  const toRad = angle === 'deg' ? DEG : 1;
  const fromRad = angle === 'deg' ? 1 / DEG : 1;
  return {
    sin: ([x]) => Math.sin(x! * toRad),
    cos: ([x]) => Math.cos(x! * toRad),
    tan: ([x]) => Math.tan(x! * toRad),
    sec: ([x]) => 1 / Math.cos(x! * toRad),
    csc: ([x]) => 1 / Math.sin(x! * toRad),
    cot: ([x]) => 1 / Math.tan(x! * toRad),
    // 30°: radians in rad mode, unchanged in deg mode
    degrees: ([x]) => (angle === 'deg' ? x! : x! * DEG),
    arcsin: ([x]) => Math.asin(x!) * fromRad,
    arccos: ([x]) => Math.acos(x!) * fromRad,
    arctan: ([x]) => Math.atan(x!) * fromRad,
    asin: ([x]) => Math.asin(x!) * fromRad,
    acos: ([x]) => Math.acos(x!) * fromRad,
    atan: ([x]) => Math.atan(x!) * fromRad,
    sinh: ([x]) => Math.sinh(x!),
    cosh: ([x]) => Math.cosh(x!),
    tanh: ([x]) => Math.tanh(x!),
    exp: ([x]) => Math.exp(x!),
    ln: ([x]) => Math.log(x!),
    log: (a) => (a.length === 2 ? Math.log(a[0]!) / Math.log(a[1]!) : Math.log10(a[0]!)),
    sqrt: ([x]) => Math.sqrt(x!),
    cbrt: ([x]) => Math.cbrt(x!),
    root: ([x, n]) => realPow(x!, 1 / n!),
    abs: ([x]) => Math.abs(x!),
    floor: ([x]) => Math.floor(x!),
    ceil: ([x]) => Math.ceil(x!),
    round: ([x]) => Math.round(x!),
    sign: ([x]) => Math.sign(x!),
    min: (a) => Math.min(...a),
    max: (a) => Math.max(...a),
    mod: ([a, m]) => ((a! % m!) + m!) % m!,
    factorial: ([x]) => factorial(x!),
    normalpdf: ([x, mu = 0, sigma = 1]) => normalPdf(x!, mu, sigma),
    tpdf: ([x, nu]) => tPdf(x!, nu!),
    chisqpdf: ([x, k]) => chiSqPdf(x!, k!),
    binompdf: ([n, p, k]) => (Number.isInteger(k) ? binomPdf(n!, p!, k!) : NaN),
    poissonpdf: ([l, k]) => (Number.isInteger(k) ? poissonPdf(l!, k!) : NaN),
  };
}

/**
 * Compile an expression into a plain JavaScript function of the graph
 * variables, for drawing curves fast (thousands of points on every pan).
 * Only real arithmetic: anything else (complex numbers, lists, matrices)
 * throws a MathError, and the line simply isn't graphed.
 */
export function compileReal(node: Node, ctx: CompileContext): RealFn {
  return compile(node, ctx, realFunctions(ctx.angle), 0);
}

function compile(node: Node, ctx: CompileContext, fns: Record<string, (a: number[]) => number>, depth: number): RealFn {
  const c = (n: Node) => compile(n, ctx, fns, depth);
  switch (node.type) {
    case 'num': {
      const v = node.value;
      return () => v;
    }
    case 'ident': {
      const k = ctx.vars.indexOf(node.name);
      if (k >= 0) return (v) => v[k]!;
      const value = ctx.value(node.name);
      if (value !== undefined) return () => value;
      if (node.name in CONST) {
        const r = CONST[node.name]!;
        return () => r;
      }
      const parts = splitName(node.name, (n) => ctx.vars.includes(n) || ctx.value(n) !== undefined || n in CONST);
      if (parts && parts.length > 1) {
        const factors = parts.map((p) => c({ type: 'ident', name: p }));
        return (v) => factors.reduce((acc, f) => acc * f(v), 1);
      }
      if (node.name === 'i') throw new MathError('Complex numbers can’t be graphed on the real plane');
      throw new MathError(`${node.name} is not defined`);
    }
    case 'unary': {
      const a = c(node.arg);
      return (v) => -a(v);
    }
    case 'abs': {
      const a = c(node.arg);
      return (v) => Math.abs(a(v));
    }
    case 'factorial': {
      const a = c(node.arg);
      return (v) => factorial(a(v));
    }
    case 'call': {
      if (node.primes > 0) throw new MathError(`${node.name}' can't be graphed directly; define it with let g(x) = diff(…)`);
      const user = ctx.func(node.name);
      if (user) {
        if (depth > 64) throw new MathError('Functions call each other too deeply to graph');
        if (node.args.length !== user.params.length) {
          throw new MathError(`${node.name} takes ${user.params.length} argument${user.params.length === 1 ? '' : 's'}`);
        }
        const body = substitute(user.body, new Map(user.params.map((p, k) => [p, node.args[k]!])));
        return compile(body, ctx, fns, depth + 1);
      }
      if (node.name === 'piecewise' || node.name === 'if') {
        // the first branch whose condition holds; no branch (and no otherwise): no graph there
        const conds: ((v: number[]) => boolean)[] = [];
        const values: RealFn[] = [];
        for (let k = 0; k + 1 < node.args.length; k += 2) {
          conds.push(compileCondition(node.args[k]!, c));
          values.push(c(node.args[k + 1]!));
        }
        const rest = node.args.length % 2 === 1 ? c(node.args[node.args.length - 1]!) : null;
        return (v) => {
          for (let k = 0; k < conds.length; k++) if (conds[k]!(v)) return values[k]!(v);
          return rest ? rest(v) : NaN;
        };
      }
      const args = node.args.map(c);
      // x(1 - x) with x a variable: multiplication
      const k = ctx.vars.indexOf(node.name);
      if (k >= 0 && args.length === 1) {
        const a = args[0]!;
        return (v) => v[k]! * a(v);
      }
      const native = ctx.native?.(node.name);
      if (native && args.length === 1) {
        const a = args[0]!;
        return (v) => native(a(v));
      }
      const base = logBase(node.name);
      if (base !== null && args.length === 1) {
        const a = args[0]!;
        const ln = Math.log(base);
        return (v) => Math.log(a(v)) / ln;
      }
      const fn = fns[node.name];
      if (fn) {
        if (args.length === 1) {
          const a = args[0]!;
          return (v) => fn([a(v)]);
        }
        return (v) => fn(args.map((a) => a(v)));
      }
      // a(x + 1) where a is a number
      const value = ctx.value(node.name);
      if (value !== undefined && args.length === 1) {
        const a = args[0]!;
        return (v) => value * a(v);
      }
      throw new MathError(`${node.name} can't be graphed`);
    }
    case 'list':
    case 'tuple':
    case 'rel':
      throw new MathError('Only real-valued formulas can be graphed');
    case 'binary': {
      const lifted = liftPower(node, (n) => !ctx.func(n) && !(n in fns) && logBase(n) === null && !ctx.native?.(n) && (ctx.vars.includes(n) || ctx.value(n) !== undefined));
      if (lifted !== node) return compile(lifted, ctx, fns, depth);
      const a = c(node.left);
      const b = c(node.right);
      switch (node.op) {
        case '+': return (v) => a(v) + b(v);
        case '-': return (v) => a(v) - b(v);
        case '*': return (v) => a(v) * b(v);
        case '/': return (v) => a(v) / b(v);
        case '^': return (v) => realPow(a(v), b(v));
      }
    }
  }
}

// --- complex functions, for domain colouring and |f(z)| surfaces ----------------------

export type ComplexFn = (z: Complex) => Complex;

export interface ComplexContext {
  /** the variable's name, usually z */
  variable: string;
  value(name: string): Complex | undefined;
  func(name: string): { params: string[]; body: Node } | undefined;
  angle: AngleUnit;
}

const C_CONST: Record<string, Complex> = {
  pi: new Complex(Math.PI),
  e: new Complex(Math.E),
  tau: new Complex(2 * Math.PI),
  i: Complex.I,
};

function complexFunctions(angle: AngleUnit): Record<string, (a: Complex[]) => Complex> {
  const toRad = new Complex(angle === 'deg' ? DEG : 1);
  const fromRad = new Complex(angle === 'deg' ? 1 / DEG : 1);
  const one = Complex.ONE;
  const ln10 = new Complex(Math.LN10);
  return {
    sin: ([z]) => z!.mul(toRad).sin(),
    cos: ([z]) => z!.mul(toRad).cos(),
    tan: ([z]) => z!.mul(toRad).tan(),
    sec: ([z]) => one.div(z!.mul(toRad).cos()),
    csc: ([z]) => one.div(z!.mul(toRad).sin()),
    cot: ([z]) => z!.mul(toRad).cos().div(z!.mul(toRad).sin()),
    degrees: ([z]) => (angle === 'deg' ? z! : z!.mul(new Complex(DEG))),
    arcsin: ([z]) => z!.asin().mul(fromRad),
    arccos: ([z]) => z!.acos().mul(fromRad),
    arctan: ([z]) => z!.atan().mul(fromRad),
    asin: ([z]) => z!.asin().mul(fromRad),
    acos: ([z]) => z!.acos().mul(fromRad),
    atan: ([z]) => z!.atan().mul(fromRad),
    sinh: ([z]) => z!.sinh(),
    cosh: ([z]) => z!.cosh(),
    tanh: ([z]) => z!.tanh(),
    exp: ([z]) => z!.exp(),
    ln: ([z]) => z!.log(),
    log: ([z]) => z!.log().div(ln10),
    sqrt: ([z]) => z!.sqrt(),
    abs: ([z]) => new Complex(z!.abs()),
    re: ([z]) => new Complex(z!.re),
    im: ([z]) => new Complex(z!.im),
    arg: ([z]) => new Complex(z!.arg()).mul(fromRad),
    conj: ([z]) => z!.conj(),
  };
}

/**
 * Compile a formula in one complex variable into a function on Complex values.
 * Anything else (lists, matrices, factorials) throws, and the line isn't drawn.
 */
export function compileComplex(node: Node, ctx: ComplexContext): ComplexFn {
  return compileC(node, ctx, complexFunctions(ctx.angle), 0);
}

function compileC(node: Node, ctx: ComplexContext, fns: Record<string, (a: Complex[]) => Complex>, depth: number): ComplexFn {
  const c = (n: Node) => compileC(n, ctx, fns, depth);
  switch (node.type) {
    case 'num': {
      const v = new Complex(node.value);
      return () => v;
    }
    case 'ident': {
      if (node.name === ctx.variable) return (z) => z;
      const value = ctx.value(node.name);
      if (value) return () => value;
      const k = C_CONST[node.name];
      if (k) return () => k;
      const parts = splitName(node.name, (n) => n === ctx.variable || ctx.value(n) !== undefined || n in C_CONST);
      if (parts && parts.length > 1) {
        const factors = parts.map((p) => c({ type: 'ident', name: p }));
        return (z) => factors.reduce((acc, f) => acc.mul(f(z)), Complex.ONE);
      }
      throw new MathError(`${node.name} is not defined`);
    }
    case 'unary': {
      const a = c(node.arg);
      return (z) => a(z).neg();
    }
    case 'abs': {
      const a = c(node.arg);
      return (z) => new Complex(a(z).abs());
    }
    case 'call': {
      if (node.primes > 0) throw new MathError(`${node.name}' can't be drawn directly`);
      const user = ctx.func(node.name);
      if (user) {
        if (depth > 64) throw new MathError('Functions call each other too deeply to draw');
        if (node.args.length !== user.params.length) throw new MathError(`${node.name} takes ${user.params.length} argument(s)`);
        return compileC(substitute(user.body, new Map(user.params.map((p, k) => [p, node.args[k]!]))), ctx, fns, depth + 1);
      }
      const args = node.args.map(c);
      if (node.name === ctx.variable && args.length === 1) {
        const a = args[0]!;
        return (z) => z.mul(a(z));
      }
      const base = logBase(node.name);
      if (base !== null && args.length === 1) {
        const lnb = new Complex(Math.log(base));
        const a = args[0]!;
        return (z) => a(z).log().div(lnb);
      }
      const fn = fns[node.name];
      if (fn && args.length === 1) {
        const a = args[0]!;
        return (z) => fn([a(z)]);
      }
      const value = ctx.value(node.name);
      if (value && args.length === 1) {
        const a = args[0]!;
        return (z) => value.mul(a(z));
      }
      throw new MathError(`${node.name} can't be drawn as a complex function`);
    }
    case 'factorial':
    case 'list':
    case 'tuple':
    case 'rel':
      throw new MathError('Only formulas in complex numbers can be drawn here');
    case 'binary': {
      const lifted = liftPower(node, (n) => !ctx.func(n) && !(n in fns) && ctx.value(n) !== undefined);
      if (lifted !== node) return compileC(lifted, ctx, fns, depth);
      const a = c(node.left);
      const b = c(node.right);
      switch (node.op) {
        case '+': return (z) => a(z).add(b(z));
        case '-': return (z) => a(z).sub(b(z));
        case '*': return (z) => a(z).mul(b(z));
        case '/': return (z) => a(z).div(b(z));
        case '^': return (z) => a(z).pow(b(z));
      }
    }
  }
}
