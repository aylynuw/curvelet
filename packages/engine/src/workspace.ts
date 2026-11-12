import { liftPower, MathError, type Node, type RelOp, type Statement } from './ast';
import { CONSTANTS, DEFAULT_SETTINGS, FUNCTIONS, VALUE_FUNCTIONS, isBuiltinName, logBase, type EvalSettings } from './builtins';
import { compileComplex, compileReal, type CompileContext, type ComplexFn } from './compile';
import { GEOMETRY_FUNCTIONS, type Pt, type Shape } from './geometry';
import { STATS_FUNCTIONS, evalFit } from './stats';
import { FIELD_FORMS, SPECIAL_FORMS, evaluate, splitName, type Env, type UserFunction } from './evaluate';
import { formatReal } from './format';
import { parse, parseExpression } from './parser';
import { printNode } from './print';
import {
  PendingError,
  SYMBOLIC_OPS,
  substitute,
  usesSymbolic,
  type SymbolicAnswer,
  type SymbolicResolver,
} from './symbolic';
import { formatValue, kindName, valuesEqual, type Value } from './value';

export type Result =
  | { status: 'empty' }
  /**
   * an expression, or a `let`/`const` value.
   * `exact` is the symbolic engine's exact form when it differs from `text` (1/3, sqrt(2)/2);
   * `numeric` marks an answer found numerically rather than exactly.
   */
  | { status: 'value'; value: Value; text: string; exact?: string; numeric?: boolean }
  /** a `let`/`const` function definition; `formula` is its body after diff/integrate/… ran */
  | { status: 'function'; name: string; params: string[]; formula?: string }
  /** a relation with only known names: 2 + 2 = 4 → true */
  | { status: 'relation'; holds: boolean }
  /**
   * a relation with two or more unknown names. `graphable` when they are only x and y;
   * otherwise `undefinedNames` lists the others, which could become sliders
   */
  | { status: 'equation'; unknowns: string[]; graphable: boolean; undefinedNames?: string[] }
  /** a formula with free symbols: 3x^2 - 12x + 11. `op` is the symbolic function that made it */
  | { status: 'symbolic'; text: string; op?: string; constant?: boolean }
  /** solutions of an equation or inequality */
  | { status: 'solved'; text: string; special?: 'none' | 'all'; periodic?: boolean; numeric?: boolean }
  /** a parametric (x(t), y(t)) or polar r = f(θ) curve, drawn on the graph */
  | { status: 'curve'; curve: 'parametric' | 'polar' | 'surface' | 'field' }
  /** waiting for the symbolic engine */
  | { status: 'pending' }
  /** `undefinedNames` lists names that could become sliders */
  | { status: 'error'; message: string; pos?: number; undefinedNames?: string[] };

/** Where a line's {…} conditions hold; t is the parameter of parametric and polar curves (NaN otherwise). */
export type Mask = (x: number, y: number, t: number) => boolean;

/** Something the graph draws, in line order. */
export type Graphable =
  /** y = f(x) (dir 'y') or x = g(y) (dir 'x'); op is the relation with y (or x) on the left */
  | { id: string; kind: 'curve'; dir: 'y' | 'x'; fn: (t: number) => number; op: RelOp; label: string; mask?: Mask }
  /** F(x, y) op 0, e.g. x^2 + y^2 - 9 = 0 */
  | { id: string; kind: 'implicit'; fn: (x: number, y: number) => number; op: RelOp; label: string; mask?: Mask }
  /** (x(t), y(t)) for t from tmin to tmax */
  | { id: string; kind: 'parametric'; fx: (t: number) => number; fy: (t: number) => number; tmin: number; tmax: number; label: string; mask?: Mask }
  /** r = f(θ) for θ from tmin to tmax; `unit` turns θ into radians (π/180 in degree mode) */
  | { id: string; kind: 'polar'; fr: (θ: number) => number; tmin: number; tmax: number; unit: number; label: string; mask?: Mask }
  /** `drag`: written as plain numbers with let, so the graph may move it */
  | { id: string; kind: 'point'; x: number; y: number; label?: string; drag?: boolean }
  /** a segment, line, ray, circle or polygon; `label` is its name when defined */
  | { id: string; kind: 'shape'; shape: Shape; label?: string }
  /** the mark of angle(A, B, C) at B; `right` when it is 90° */
  | { id: string; kind: 'angle'; a: Pt; b: Pt; c: Pt; right: boolean; label?: string }
  /** points(xs, ys): a scatter plot */
  | { id: string; kind: 'scatter'; pts: Pt[]; label?: string }
  /** z = f(x, y), or a function of two variables: drawn in the 3D view */
  | { id: string; kind: 'surface'; fn: (x: number, y: number) => number; label: string }
  /** a function of z: domain colouring on the graph, |f(z)| in the 3D view */
  | { id: string; kind: 'complex'; fn: ComplexFn; label: string }
  /** cobweb(f, x0, n): y = f(x), y = x and the staircase of the iteration */
  | { id: string; kind: 'cobweb'; fn: (x: number) => number; x0: number; steps: number; label: string }
  /**
   * slopefield(f): dy/dx = f(x, y); vectorfield(P, Q): (dx, dy) = (P, Q).
   * `seeds` are the points the solution curves pass through.
   */
  | { id: string; kind: 'field'; slope?: (x: number, y: number) => number; vector?: [(x: number, y: number) => number, (x: number, y: number) => number]; seeds: Pt[]; label: string };

export interface Definition {
  id: string;
  name: string;
  mutable: boolean;
  params: string[] | null;
  source: string;
}

interface Entry {
  source: string;
  stmt: Statement | null;
  parseError: MathError | null;
}
type Def = Extract<Statement, { kind: 'define' }>;
type CallNode = Extract<Node, { type: 'call' }>;
type Answer = Extract<SymbolicAnswer, { ok: true }>;

const EMPTY = new Set<string>();

/**
 * An ordered list of lines (like the expression list). Definitions can be used
 * on any line, before or after the line that defines them. Every change
 * re-evaluates the workspace and reports which lines' results changed.
 *
 * Symbolic functions (diff, integrate, factor, solve, …) are answered by an
 * optional resolver. Their results come back as expressions, so a derivative
 * can be defined as a function and then evaluated like any other.
 */
export class Workspace {
  private entries = new Map<string, Entry>();
  private results = new Map<string, Result>();
  /** name → id of the line that owns the definition */
  private owners = new Map<string, string>();
  private settings: EvalSettings;
  private resolver: SymbolicResolver | null;

  // rebuilt by every recompute
  /** definition-level errors, by line id */
  private problems = new Map<string, MathError>();
  /** definition bodies with symbolic functions replaced by their results, by line id */
  private bodies = new Map<string, Node | Error>();
  /** the evaluation environment of the last recompute */
  private env: Env | null = null;
  private graphCache: Graphable[] | null = null;
  private graphIssues = new Map<string, string>();

  constructor(settings: Partial<EvalSettings> = {}, resolver: SymbolicResolver | null = null) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.resolver = resolver;
  }

  /** Add or replace a line. Returns the ids whose result changed. */
  set(id: string, source: string): string[] {
    let stmt: Statement | null = null;
    let parseError: MathError | null = null;
    try {
      stmt = asDefinition(parse(source));
    } catch (e) {
      if (!(e instanceof MathError)) throw e;
      parseError = e;
    }
    this.entries.set(id, { source, stmt, parseError });
    return this.recompute();
  }

  /**
   * Put the lines in this order (the order on screen). When a name is defined
   * twice, the earlier line owns it. Ids not listed keep their place at the end.
   */
  setOrder(ids: string[]): string[] {
    const reordered = new Map<string, Entry>();
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (entry) reordered.set(id, entry);
    }
    for (const [id, entry] of this.entries) if (!reordered.has(id)) reordered.set(id, entry);
    this.entries = reordered;
    return this.recompute();
  }

  remove(id: string): string[] {
    this.entries.delete(id);
    return [...this.recompute(), id];
  }

  /** Change a `let` value, as a slider would. A `const` refuses. */
  setValue(name: string, value: number): string[] {
    const id = this.owners.get(name);
    const def = id ? this.def(id) : null;
    if (!id || !def) throw new MathError(`${name} is not defined`);
    if (def.params) throw new MathError(`${name} is a function, not a value`);
    if (!def.mutable) throw new MathError(`${name} is a const and can't be changed`);
    // a = 2 stays without let; let a = 2 keeps it
    const kw = /^\s*let\b/.test(this.entries.get(id)!.source) ? 'let ' : '';
    return this.set(id, `${kw}${name} = ${formatReal(value, 15)}`);
  }

  /** Move a point written as let A = (x, y), as dragging it on the graph would. */
  movePoint(name: string, x: number, y: number): string[] {
    const id = this.owners.get(name);
    const def = id ? this.def(id) : null;
    if (!id || !def || !draggable(def)) throw new MathError(`${name} is not a point that can be moved`);
    const restrict = this.entries.get(id)!.source.match(/\{[^}]*\}\s*$/)?.[0];
    const kw = /^\s*let\b/.test(this.entries.get(id)!.source) ? 'let ' : '';
    return this.set(id, `${kw}${name} = (${formatReal(x, 15)}, ${formatReal(y, 15)})${restrict ? ` ${restrict}` : ''}`);
  }

  updateSettings(settings: Partial<EvalSettings>): string[] {
    this.settings = { ...this.settings, ...settings };
    return this.recompute();
  }

  getSettings(): EvalSettings {
    return { ...this.settings };
  }

  setResolver(resolver: SymbolicResolver | null): string[] {
    this.resolver = resolver;
    return this.recompute();
  }

  /** Re-evaluate, e.g. when the symbolic engine has new answers. Returns the ids that changed. */
  refresh(): string[] {
    return this.recompute();
  }

  result(id: string): Result | undefined {
    return this.results.get(id);
  }

  source(id: string): string | undefined {
    return this.entries.get(id)?.source;
  }

  /** What the graph should draw, in line order. Cached until the next change. */
  graphables(): Graphable[] {
    if (this.graphCache) return this.graphCache;
    this.graphIssues = new Map();
    const out: Graphable[] = [];
    for (const [id, entry] of this.entries) {
      const r = this.results.get(id);
      if (!entry.stmt || !r || r.status === 'error' || r.status === 'pending') continue;
      try {
        const g = this.graphableFor(id, entry, r);
        if (g) out.push(g);
      } catch (e) {
        if (e instanceof MathError) this.graphIssues.set(id, e.message);
        else if (!(e instanceof PendingError)) throw e;
      }
    }
    this.graphCache = out;
    return out;
  }

  /** Why a line that looks graphable couldn't be drawn, if so. */
  graphIssue(id: string): string | undefined {
    this.graphables();
    return this.graphIssues.get(id);
  }

  /**
   * The symbolic operation a line asks for (diff, integrate, solve; f'(x) counts
   * as diff of f's formula), with every definition written out: what
   * step-by-step working explains. `at` is the point f'(a) is taken at.
   */
  symbolicCall(id: string): { op: string; args: Node[]; at?: Node } | null {
    const stmt = this.entries.get(id)?.stmt;
    if (!stmt) return null;
    const node = stmt.kind === 'expr' ? stmt.expr : stmt.kind === 'define' ? stmt.body : null;
    if (node?.type !== 'call') return null;
    const bound = new Set(stmt.kind === 'define' ? (stmt.params ?? []) : []);
    try {
      if (SYMBOLIC_OPS.has(node.name)) {
        return { op: node.name, args: node.args.map((a) => this.inline(this.expand(a, bound), bound)) };
      }
      if (node.primes > 0) {
        const fid = this.owners.get(node.name);
        const def = fid !== undefined ? this.def(fid) : null;
        if (!def?.params || def.params.length !== 1 || node.args.length !== 1) return null;
        const p = def.params[0]!;
        const formula = this.inline(this.expandedBody(fid!), new Set([p]));
        const arg = node.args[0]!;
        const at = arg.type === 'ident' && arg.name === p ? undefined : this.inline(this.expand(arg, bound), bound);
        return { op: 'diff', args: [formula, { type: 'ident', name: p }, { type: 'num', value: node.primes }], at };
      }
    } catch {
      // a nested symbolic result still on its way, or a definition with an error
      return null;
    }
    return null;
  }

  /** For the Definitions panel. */
  definitions(): Definition[] {
    const list: Definition[] = [];
    for (const [name, id] of this.owners) {
      const def = this.def(id)!;
      list.push({ id, name, mutable: def.mutable, params: def.params, source: this.entries.get(id)!.source });
    }
    return list;
  }

  // ---------------------------------------------------------------------------

  private def(id: string): Def | null {
    const stmt = this.entries.get(id)?.stmt;
    return stmt?.kind === 'define' ? stmt : null;
  }

  private known = (n: string) => this.owners.has(n) || n in CONSTANTS;
  private isFunction = (name: string): boolean => {
    const id = this.owners.get(name);
    if (id !== undefined) return this.def(id)!.params !== null;
    return (
      name in FUNCTIONS || name in VALUE_FUNCTIONS || name in GEOMETRY_FUNCTIONS || name in STATS_FUNCTIONS || SPECIAL_FORMS.has(name) ||
      SYMBOLIC_OPS.has(name) || logBase(name) !== null
    );
  };
  private unknownNames(node: Node, bound: Set<string> = EMPTY): Set<string> {
    return collectNames(node, bound, this.known, this.isFunction).unknown;
  }

  private recompute(): string[] {
    const next = new Map<string, Result>();
    this.problems = new Map();
    this.bodies = new Map();
    const problems = this.problems;

    // 1. who owns each name; duplicates and built-in names are errors
    this.owners.clear();
    for (const [id] of this.entries) {
      const def = this.def(id);
      if (!def) continue;
      if (isBuiltinName(def.name) || SYMBOLIC_OPS.has(def.name)) {
        problems.set(id, new MathError(`${def.name} is a built-in name and can't be redefined`));
        continue;
      }
      const owner = this.owners.get(def.name);
      if (owner !== undefined) {
        const ownerDef = this.def(owner)!;
        problems.set(
          id,
          new MathError(
            ownerDef.mutable
              ? `${def.name} is already defined on another line`
              : `${def.name} is a const and can't be redefined`,
          ),
        );
        continue;
      }
      this.owners.set(def.name, id);
    }

    // 2. what each definition refers to (names inside diff, solve, … may be free symbols)
    const deps = new Map<string, string[]>();
    for (const [name, id] of this.owners) {
      const def = this.def(id)!;
      const { refs, unknown } = collectNames(def.body, new Set(def.params ?? []), this.known, this.isFunction);
      deps.set(name, [...refs]);
      if (unknown.size > 0) problems.set(id, undefinedError(unknown));
    }

    // 3. circular definitions
    for (const cycle of findCycles(deps)) {
      for (const name of cycle) {
        problems.set(this.owners.get(name)!, new MathError(`Circular definition: ${[...cycle, cycle[0]].join(' → ')}`));
      }
    }

    // 4. evaluate, with each definition computed at most once
    const cache = new Map<string, Value>();
    const env: Env = {
      value: (name) => {
        const id = this.owners.get(name);
        if (id === undefined) return undefined;
        const def = this.def(id)!;
        if (def.params) return undefined;
        if (problems.has(id)) throw new MathError(`Uses ${name}, which has an error`);
        let v = cache.get(name);
        if (!v) {
          const body = this.expandedBody(id);
          const free = this.unknownNames(body);
          if (free.size > 0) {
            throw new MathError(`${name} is a formula in ${[...free].sort().join(', ')}, not a number`);
          }
          try {
            v = evaluate(body, env, this.settings);
          } catch (e) {
            if (e instanceof MathError) problems.set(id, e);
            throw e instanceof MathError ? new MathError(`Uses ${name}, which has an error`) : e;
          }
          cache.set(name, v);
        }
        return v;
      },
      func: (name): UserFunction | undefined => {
        const id = this.owners.get(name);
        if (id === undefined) return undefined;
        const def = this.def(id)!;
        if (!def.params) return undefined;
        if (problems.has(id)) throw new MathError(`Uses ${name}, which has an error`);
        return { params: def.params, body: this.expandedBody(id) };
      },
    };

    this.env = env;
    this.graphCache = null;
    for (const [id, entry] of this.entries) {
      next.set(id, this.resultFor(id, entry, env));
    }

    // 5. report what changed
    const changed: string[] = [];
    for (const [id, r] of next) {
      if (!sameResult(this.results.get(id), r)) changed.push(id);
    }
    this.results = next;
    return changed;
  }

  private resultFor(id: string, entry: Entry, env: Env): Result {
    if (entry.parseError) return errorResult(entry.parseError);
    const stmt = entry.stmt!;
    const problems = this.problems;
    try {
      switch (stmt.kind) {
        case 'empty':
          return { status: 'empty' };

        case 'define': {
          if (problems.has(id)) return errorResult(problems.get(id)!);
          const symbolic = usesSymbolic(stmt.body);
          if (stmt.params) {
            if (!symbolic) return { status: 'function', name: stmt.name, params: stmt.params };
            const body = this.expandedBody(id);
            const free = this.unknownNames(body, new Set(stmt.params));
            if (free.size > 0) return errorResult(undefinedError(free));
            return { status: 'function', name: stmt.name, params: stmt.params, formula: printNode(body) };
          }
          if (symbolic) {
            const body = this.expandedBody(id);
            if (this.unknownNames(body).size > 0) return { status: 'symbolic', text: printNode(body), op: topOp(stmt.body) };
          }
          const value = env.value(stmt.name)!;
          return { status: 'value', value, text: formatValue(value) };
        }

        case 'expr':
          return this.exprResult(stmt.expr, env);

        case 'relation': {
          const left = this.expand(stmt.left, EMPTY);
          const right = this.expand(stmt.right, EMPTY);
          const unknown = new Set([...this.unknownNames(left), ...this.unknownNames(right)]);
          if (polarSide(left, right, (n) => this.unknownNames(n))) return { status: 'curve', curve: 'polar' };
          if (surfaceSide(left, right, (n) => this.unknownNames(n))) return { status: 'curve', curve: 'surface' };
          if (unknown.size === 0) {
            return { status: 'relation', holds: compare(stmt.op, evaluate(left, env, this.settings), evaluate(right, env, this.settings)) };
          }
          // one unknown: solve it (the equation calculator)
          if (unknown.size === 1 && this.resolver) {
            const ans = this.runSymbolic('solve', [{ type: 'rel', op: stmt.op, left, right }], EMPTY);
            return solvedResult(ans);
          }
          const others = [...unknown].filter((n) => n !== 'x' && n !== 'y').sort();
          const r: Result = { status: 'equation', unknowns: [...unknown].sort(), graphable: others.length === 0 };
          if (others.length > 0) r.undefinedNames = others;
          return r;
        }
      }
    } catch (e) {
      if (e instanceof PendingError) return { status: 'pending' };
      if (e instanceof MathError) {
        // a definition that failed while being evaluated for another line
        if (stmt.kind === 'define' && problems.has(id)) return errorResult(problems.get(id)!);
        return errorResult(e);
      }
      throw e;
    }
  }

  private compileContext(vars: string[]): CompileContext {
    return {
      vars,
      angle: this.settings.angle,
      value: (name) => {
        if (vars.includes(name) || !this.env) return undefined;
        try {
          const v = this.env.value(name);
          return v?.kind === 'num' && v.z.isReal() ? v.z.re : undefined;
        } catch {
          return undefined;
        }
      },
      func: (name) => {
        const id = this.owners.get(name);
        const def = id !== undefined ? this.def(id) : null;
        return def?.params ? { params: def.params, body: this.expandedBody(id!) } : undefined;
      },
      native: (name) => {
        if (vars.includes(name) || !this.env) return undefined;
        try {
          const v = this.env.value(name);
          return v?.kind === 'fit' ? (x: number) => evalFit(v.fit, x) : undefined;
        } catch {
          return undefined;
        }
      },
    };
  }

  /**
   * A line's {…} conditions as a test of (x, y, t), plus the range of the
   * parameter t or θ: from the conditions when they bound it ({0 <= t <= 1}),
   * otherwise one full turn.
   */
  private restriction(stmt: Statement): { mask?: Mask; range: (name: 't' | 'θ') => [number, number] } {
    const turn = this.settings.angle === 'deg' ? 360 : 2 * Math.PI;
    const conds = 'restrict' in stmt ? stmt.restrict : undefined;
    if (!conds?.length) return { range: () => [0, turn] };
    const ctx = this.compileContext(['x', 'y', 't', 'θ']);
    const rels = conds.map((c) => {
      if (c.type !== 'rel') throw new MathError('Inside { } write a condition, like {x > 0}');
      return { op: c.op, left: thetaToθ(this.expand(c.left, EMPTY)), right: thetaToθ(this.expand(c.right, EMPTY)) };
    });
    const tests = rels.map(({ op, left, right }) => {
      const d = compileReal({ type: 'binary', op: '-', left, right }, ctx);
      const eps = 1e-12;
      return (v: number[]) => {
        const diff = d(v);
        return op === '<' ? diff < 0 : op === '<=' ? diff <= eps : op === '>' ? diff > 0 : op === '>=' ? diff >= -eps : Math.abs(diff) <= 1e-9;
      };
    });
    const mask: Mask = (x, y, t) => {
      const v = [x, y, t, t];
      return tests.every((test) => test(v));
    };
    const constant = (n: Node): number | null => {
      try {
        const c = compileReal(n, this.compileContext([]))([]);
        return Number.isFinite(c) ? c : null;
      } catch {
        return null;
      }
    };
    const range = (name: 't' | 'θ'): [number, number] => {
      let lo = 0;
      let hi = turn;
      const isVar = (n: Node) => n.type === 'ident' && n.name === name;
      for (const { op, left, right } of rels) {
        if (isVar(left) && constant(right) !== null) {
          if (op === '<' || op === '<=') hi = constant(right)!;
          else if (op === '>' || op === '>=') lo = constant(right)!;
        } else if (isVar(right) && constant(left) !== null) {
          if (op === '<' || op === '<=') lo = constant(left)!;
          else if (op === '>' || op === '>=') hi = constant(left)!;
        }
      }
      return [lo, hi];
    };
    return { mask, range };
  }

  private complexContext(variable: string) {
    const real = this.compileContext([variable]);
    return {
      variable,
      angle: this.settings.angle,
      func: real.func,
      value: (name: string) => {
        if (name === variable || !this.env) return undefined;
        try {
          const v = this.env.value(name);
          return v?.kind === 'num' ? v.z : undefined;
        } catch {
          return undefined;
        }
      },
    };
  }

  private graphableFor(id: string, entry: Entry, r: Result): Graphable | null {
    const stmt = entry.stmt!;
    const label = entry.source.replace(/\{[^}]*\}\s*$/, '').trim();
    const { mask, range } = this.restriction(stmt);
    const masked = mask ? { mask } : {};

    if (r.status === 'curve' && stmt.kind === 'expr' && stmt.expr.type === 'tuple') {
      const node = this.expand(stmt.expr, EMPTY) as Extract<Node, { type: 'tuple' }>;
      const ctx = this.compileContext(['t']);
      const fx = compileReal(node.items[0], ctx);
      const fy = compileReal(node.items[1], ctx);
      const [tmin, tmax] = range('t');
      return { id, kind: 'parametric', fx: (t) => fx([t]), fy: (t) => fy([t]), tmin, tmax, label, ...masked };
    }
    if (r.status === 'curve' && r.curve === 'polar' && stmt.kind === 'relation') {
      const left = this.expand(stmt.left, EMPTY);
      const right = this.expand(stmt.right, EMPTY);
      const formula = thetaToθ(left.type === 'ident' && left.name === 'r' ? right : left);
      const fr = compileReal(formula, this.compileContext(['θ']));
      const [tmin, tmax] = range('θ');
      const unit = this.settings.angle === 'deg' ? Math.PI / 180 : 1;
      return { id, kind: 'polar', fr: (θ) => fr([θ]), tmin, tmax, unit, label, ...masked };
    }

    const named = stmt.kind === 'define' ? { label: stmt.name } : {};
    if (r.status === 'value' && r.value.kind === 'point') {
      const drag = stmt.kind === 'define' && draggable(stmt) ? { drag: true } : {};
      return { id, kind: 'point', x: r.value.x, y: r.value.y, ...named, ...drag };
    }
    if (r.status === 'value' && r.value.kind === 'shape') {
      return { id, kind: 'shape', shape: r.value.shape, ...named };
    }
    if (r.status === 'value' && r.value.kind === 'points') {
      return { id, kind: 'scatter', pts: r.value.pts, ...named };
    }
    if (r.status === 'value' && r.value.kind === 'fit') {
      const fit = r.value.fit;
      return { id, kind: 'curve', dir: 'y', fn: (x) => evalFit(fit, x), op: '=', label: stmt.kind === 'define' ? `y = ${stmt.name}(x)` : label };
    }
    // cobweb(f, x0, n)
    const head = stmt.kind === 'expr' ? stmt.expr : stmt.kind === 'define' && !stmt.params ? stmt.body : null;
    if (r.status === 'value' && head?.type === 'call' && head.name === 'cobweb' && this.env) {
      const [fname, start, steps] = head.args;
      if (fname?.type === 'ident') {
        const f = compileReal({ type: 'call', name: fname.name, args: [{ type: 'ident', name: 'x' }], primes: 0 }, this.compileContext(['x']));
        const x0 = evaluate(start!, this.env, this.settings);
        const n = evaluate(steps!, this.env, this.settings);
        if (x0.kind === 'num' && n.kind === 'num') {
          return { id, kind: 'cobweb', fn: (x) => f([x]), x0: x0.z.re, steps: n.z.re, label: `y = ${fname.name}(x)` };
        }
      }
    }
    // slopefield(f, seeds…) and vectorfield(P, Q, seeds…)
    if (r.status === 'curve' && r.curve === 'field' && stmt.kind === 'expr' && stmt.expr.type === 'call' && this.env) {
      const call = stmt.expr;
      const ctx = this.compileContext(['x', 'y']);
      const fn = (n: Node) => {
        const f = compileReal(this.expand(n, EMPTY), ctx);
        return (x: number, y: number) => f([x, y]);
      };
      const slope = call.name === 'slopefield';
      const seedNodes = call.args.slice(slope ? 1 : 2);
      const seeds = seedNodes.map((n) => {
        const v = evaluate(n, this.env!, this.settings);
        if (v.kind !== 'point') throw new MathError(`${call.name}: after the formula, give points the solution curves pass through, like (0, 1)`);
        return { x: v.x, y: v.y };
      });
      return slope
        ? { id, kind: 'field', slope: fn(call.args[0]!), seeds, label }
        : { id, kind: 'field', vector: [fn(call.args[0]!), fn(call.args[1]!)], seeds, label };
    }
    // a function of z: complex
    if (stmt.kind === 'define' && stmt.params?.length === 1 && stmt.params[0] === 'z' && r.status === 'function') {
      const fn = compileComplex(this.expandedBody(id), this.complexContext('z'));
      return { id, kind: 'complex', fn, label: `${stmt.name}(z)` };
    }
    // a function of two variables, or z = f(x, y): a surface
    if (stmt.kind === 'define' && stmt.params?.length === 2 && r.status === 'function') {
      const [p, q] = stmt.params as [string, string];
      const body = substitute(this.expandedBody(id), new Map<string, Node>([[p, { type: 'ident', name: 'x' }], [q, { type: 'ident', name: 'y' }]]));
      const f = compileReal(body, this.compileContext(['x', 'y']));
      return { id, kind: 'surface', fn: (x, y) => f([x, y]), label: `z = ${stmt.name}(x, y)` };
    }
    if (r.status === 'curve' && r.curve === 'surface' && stmt.kind === 'relation') {
      const left = this.expand(stmt.left, EMPTY);
      const right = this.expand(stmt.right, EMPTY);
      const formula = left.type === 'ident' && left.name === 'z' ? right : left;
      const f = compileReal(formula, this.compileContext(['x', 'y']));
      return { id, kind: 'surface', fn: (x, y) => f([x, y]), label };
    }
    // angle(A, B, C) on its own line, or as a definition: mark it at B
    const top = stmt.kind === 'expr' ? stmt.expr : stmt.kind === 'define' && !stmt.params ? stmt.body : null;
    if (r.status === 'value' && top?.type === 'call' && top.name === 'angle' && top.args.length === 3 && this.env) {
      const [a, b, c] = top.args.map((arg) => evaluate(arg, this.env!, this.settings));
      if (a?.kind === 'point' && b?.kind === 'point' && c?.kind === 'point') {
        const deg = this.settings.angle === 'deg' ? 1 : 180 / Math.PI;
        const value = r.value.kind === 'num' ? r.value.z.re * deg : NaN;
        return { id, kind: 'angle', a, b, c, right: Math.abs(value - 90) < 1e-9, ...named };
      }
    }

    // let f(x) = …: the curve y = f(x)
    if (stmt.kind === 'define' && stmt.params?.length === 1 && r.status === 'function') {
      const body = substitute(this.expandedBody(id), new Map([[stmt.params[0]!, { type: 'ident', name: 'x' } as Node]]));
      const fn = compileReal(body, this.compileContext(['x']));
      return { id, kind: 'curve', dir: 'y', fn: (x) => fn([x]), op: '=', label: `y = ${stmt.name}(x)`, ...masked };
    }

    if (stmt.kind !== 'relation') return null;
    const left = this.expand(stmt.left, EMPTY);
    const right = this.expand(stmt.right, EMPTY);
    const lu = this.unknownNames(left);
    const ru = this.unknownNames(right);
    const all = new Set([...lu, ...ru]);
    if (all.size === 0 || [...all].some((n) => n !== 'x' && n !== 'y')) return null;

    // y = f(x), f(x) < y, x = g(y): draw as a curve; anything else as F(x, y) = 0
    for (const v of ['y', 'x'] as const) {
      const t = v === 'y' ? 'x' : 'y';
      if (left.type === 'ident' && left.name === v && !ru.has(v)) {
        const fn = compileReal(right, this.compileContext([t]));
        return { id, kind: 'curve', dir: v, fn: (a) => fn([a]), op: stmt.op, label, ...masked };
      }
      if (right.type === 'ident' && right.name === v && !lu.has(v)) {
        const fn = compileReal(left, this.compileContext([t]));
        return { id, kind: 'curve', dir: v, fn: (a) => fn([a]), op: flip(stmt.op), label, ...masked };
      }
    }
    const f = compileReal({ type: 'binary', op: '-', left, right }, this.compileContext(['x', 'y']));
    return { id, kind: 'implicit', fn: (x, y) => f([x, y]), op: stmt.op, label, ...masked };
  }

  private exprResult(expr: Node, env: Env): Result {
    if (expr.type === 'call' && FIELD_FORMS.has(expr.name) && !this.owners.has(expr.name)) {
      const need = expr.name === 'slopefield' ? 1 : 2;
      if (expr.args.length < need) {
        throw new MathError(expr.name === 'slopefield' ? 'Write slopefield(f), for dy/dx = f(x, y)' : 'Write vectorfield(P, Q), for the arrows (P, Q) at (x, y)');
      }
      return { status: 'curve', curve: 'field' };
    }
    const op = topOp(expr);
    let node: Node;
    let ans: Answer | undefined;
    if (op) {
      // the line is diff(…), solve(…), …: keep the engine's answer for how to show it
      const call = expr as CallNode;
      ans = this.runSymbolic(op, call.args.map((a) => this.expand(a, EMPTY)), EMPTY);
      if (op === 'solve' || ans.expr === undefined) return solvedResult(ans);
      node = parseAnswer(ans.expr);
    } else {
      node = this.expand(expr, EMPTY);
    }

    const symbolic = op !== undefined || usesSymbolic(expr);
    const unknown = this.unknownNames(node);
    // (cos(t), sin(t)): a parametric curve
    if (node.type === 'tuple' && unknown.size > 0 && [...unknown].every((n) => n === 't')) {
      return { status: 'curve', curve: 'parametric' };
    }
    if (unknown.size > 0 && ans?.approx) {
      // a number written with functions this engine doesn't know (erf(1)): SymPy sent its decimal
      const value = evaluate(parseAnswer(ans.approx), env, this.settings);
      return { status: 'value', value, text: formatValue(value), exact: printNode(node) };
    }
    if (unknown.size > 0) {
      if (!symbolic) return errorResult(undefinedError(unknown));
      const r: Result = { status: 'symbolic', text: printNode(node) };
      if (op) r.op = op;
      if (ans?.constant) r.constant = true;
      return r;
    }

    let value: Value;
    try {
      value = evaluate(node, env, this.settings);
    } catch (e) {
      if (!(e instanceof MathError) || !symbolic) throw e;
      // a result with a function this engine can't evaluate (erf, LambertW): use SymPy's decimal, or show the formula
      if (!ans?.approx) return { status: 'symbolic', text: printNode(node), ...(op ? { op } : {}) };
      value = evaluate(parseAnswer(ans.approx), env, this.settings);
    }
    const r: Result = { status: 'value', value, text: formatValue(value) };
    if (ans?.numeric) r.numeric = true;
    else if (ans) {
      const exact = printNode(node);
      if (exact !== r.text) r.exact = exact;
    }
    return r;
  }

  // --- symbolic expansion ----------------------------------------------------

  /** A definition's body with every symbolic function replaced by its result. */
  private expandedBody(id: string): Node {
    const cached = this.bodies.get(id);
    if (cached instanceof Error) throw cached;
    if (cached) return cached;
    const def = this.def(id)!;
    if (this.problems.has(id)) throw new MathError(`Uses ${def.name}, which has an error`);
    try {
      const node = this.expand(def.body, new Set(def.params ?? []));
      this.bodies.set(id, node);
      return node;
    } catch (e) {
      if (e instanceof PendingError) {
        this.bodies.set(id, e);
      } else if (e instanceof MathError) {
        this.problems.set(id, e);
        const wrapped = new MathError(`Uses ${def.name}, which has an error`);
        this.bodies.set(id, wrapped);
        throw wrapped;
      }
      throw e;
    }
  }

  /** Replace diff(…), integrate(…), f'(x), … by their results, innermost first. */
  private expand(node: Node, bound: Set<string>): Node {
    switch (node.type) {
      case 'num':
      case 'ident':
        return node;
      case 'unary':
      case 'abs':
      case 'factorial':
        return { ...node, arg: this.expand(node.arg, bound) };
      case 'binary':
      case 'rel':
        return { ...node, left: this.expand(node.left, bound), right: this.expand(node.right, bound) };
      case 'list':
        return { ...node, items: node.items.map((i) => this.expand(i, bound)) };
      case 'tuple':
        return { ...node, items: [this.expand(node.items[0], bound), this.expand(node.items[1], bound)] };
      case 'call': {
        const call: CallNode = { ...node, args: node.args.map((a) => this.expand(a, bound)) };
        if (SYMBOLIC_OPS.has(call.name)) {
          const ans = this.runSymbolic(call.name, call.args, bound);
          if (ans.expr === undefined) {
            throw new MathError(`The result of ${call.name} can be shown on its own line, but not used inside a calculation`);
          }
          return parseAnswer(ans.expr);
        }
        if (call.primes > 0) return this.derivative(call, bound);
        return call;
      }
    }
  }

  private runSymbolic(op: string, args: Node[], bound: Set<string>): Answer {
    if (!this.resolver) throw new MathError(`${op} needs the symbolic engine, which isn't loaded here`);
    const inlined = args.map((a) => this.inline(a, bound));
    const ans = this.resolver.resolve(op, inlined, this.settings);
    if (!ans) throw new PendingError();
    if (!ans.ok) throw new MathError(ans.error);
    return ans;
  }

  /** f'(a), f''(a): differentiate f's formula, then put a in for its parameter. */
  private derivative(call: CallNode, bound: Set<string>): Node {
    const marks = "'".repeat(call.primes);
    const id = bound.has(call.name) ? undefined : this.owners.get(call.name);
    const def = id !== undefined ? this.def(id) : null;
    if (!def?.params) throw new MathError(`${call.name}${marks}(x) needs a function defined with let ${call.name}(x) = …`);
    if (def.params.length !== 1) throw new MathError(`${call.name}${marks} needs a function of one variable`);
    if (call.args.length !== 1) throw new MathError(`${call.name}${marks} takes 1 argument, got ${call.args.length}`);
    const p = def.params[0]!;
    const formula = this.inline(this.expandedBody(id!), new Set([p]));
    const ans = this.runSymbolic('diff', [formula, { type: 'ident', name: p }, { type: 'num', value: call.primes }], new Set([p]));
    return substitute(parseAnswer(ans.expr!), new Map([[p, call.args[0]!]]));
  }

  /**
   * Put definitions in place of their names, so the symbolic engine sees exact
   * formulas (let a = 1/3 stays 1/3). Names in `bound` (parameters) and names
   * defined nowhere stay as symbols.
   */
  private inline(node: Node, bound: Set<string>): Node {
    const isKnown = (n: string) => bound.has(n) || this.known(n);
    switch (node.type) {
      case 'num':
        return node;
      case 'ident': {
        if (bound.has(node.name)) return node;
        const parts = splitName(node.name, isKnown);
        if (!parts) return node;
        if (parts.length > 1) {
          return parts
            .map((p): Node => this.inline({ type: 'ident', name: p }, bound))
            .reduce((left, right) => ({ type: 'binary', op: '*', left, right }));
        }
        const id = this.owners.get(node.name);
        if (id === undefined || this.def(id)!.params) return node;
        return this.inline(this.expandedBody(id), EMPTY);
      }
      case 'unary':
      case 'abs':
      case 'factorial':
        return { ...node, arg: this.inline(node.arg, bound) };
      case 'binary':
      case 'rel': {
        // P(1 + r)^n with P a number: the power belongs to the bracket
        const lifted = liftPower(node, (n) => {
          if (bound.has(n)) return true;
          const id = this.owners.get(n);
          return id !== undefined && !this.def(id)!.params;
        });
        if (lifted !== node) return this.inline(lifted, bound);
        return { ...node, left: this.inline(node.left, bound), right: this.inline(node.right, bound) };
      }
      case 'list':
        return { ...node, items: node.items.map((i) => this.inline(i, bound)) };
      case 'tuple':
        return { ...node, items: [this.inline(node.items[0], bound), this.inline(node.items[1], bound)] };
      case 'call': {
        const args = node.args.map((a) => this.inline(a, bound));
        const id = bound.has(node.name) ? undefined : this.owners.get(node.name);
        const def = id !== undefined ? this.def(id) : null;
        if (def?.params) {
          if (args.length !== def.params.length) {
            throw new MathError(`${node.name} takes ${def.params.length} argument${def.params.length === 1 ? '' : 's'}, got ${args.length}`);
          }
          const formula = this.inline(this.expandedBody(id!), new Set(def.params));
          return substitute(formula, new Map(def.params.map((p, k) => [p, args[k]!])));
        }
        if (def && args.length === 1) {
          // a(x + 1) where a is a value
          return { type: 'binary', op: '*', left: this.inline({ type: 'ident', name: node.name }, bound), right: args[0]! };
        }
        return { ...node, args };
      }
    }
  }
}

// -----------------------------------------------------------------------------

/** let A = (2, 3): a point given as plain numbers, so dragging it can rewrite the line */
function draggable(def: Def): boolean {
  if (!def.mutable || def.params || def.body.type !== 'tuple') return false;
  const plain = (n: Node) => n.type === 'num' || (n.type === 'unary' && n.arg.type === 'num');
  return def.body.items.every(plain);
}

/** `theta` and `θ` are the same polar angle */
function thetaToθ(node: Node): Node {
  return substitute(node, new Map([['theta', { type: 'ident', name: 'θ' } as Node]]));
}

/** z = f(x, y) (or f(x, y) = z): z alone on one side, only x and y on the other */
function surfaceSide(left: Node, right: Node, unknown: (n: Node) => Set<string>): boolean {
  const isZ = (n: Node) => n.type === 'ident' && n.name === 'z' && unknown(n).has('z');
  const only = (side: Node) => {
    const u = unknown(side);
    return u.size > 0 && [...u].every((n) => n === 'x' || n === 'y');
  };
  return (isZ(left) && only(right)) || (isZ(right) && only(left));
}

/** r = f(θ) (or f(θ) = r): r on one side alone, only θ on the other */
function polarSide(left: Node, right: Node, unknown: (n: Node) => Set<string>): boolean {
  const angle = (n: string) => n === 'θ' || n === 'theta';
  const only = (side: Node) => [...unknown(side)].every(angle);
  // r itself must be undefined: with let r = 3, the line r = 2 is just a comparison
  const isR = (n: Node) => n.type === 'ident' && n.name === 'r' && unknown(n).has('r');
  return (isR(left) && only(right)) || (isR(right) && only(left));
}

/** Names a plain `name = …` line graphs rather than defines. */
const GRAPH_NAMES = new Set(['x', 'y', 'z', 'r', 'θ', 'theta']);

/**
 * f(x) = 3x + 1 and a = 3 define, as let does: when the left side is a
 * name (or a name with plain parameters) that isn't a graph's variable or
 * built in, and the right side doesn't use it.
 */
export function asDefinition(stmt: Statement): Statement {
  if (stmt.kind !== 'relation' || stmt.op !== '=') return stmt;
  const { left, right, restrict } = stmt;
  const free = (name: string) => !GRAPH_NAMES.has(name) && !isBuiltinName(name) && !(name in CONSTANTS) && !SYMBOLIC_OPS.has(name);
  const uses = (node: Node, name: string): boolean => {
    let found = false;
    const walk = (n: Node) => {
      if (found) return;
      if ((n.type === 'ident' || n.type === 'call') && n.name === name) found = true;
      if (n.type === 'call') n.args.forEach(walk);
      else if (n.type === 'binary' || n.type === 'rel') (walk(n.left), walk(n.right));
      else if (n.type === 'unary' || n.type === 'abs' || n.type === 'factorial') walk(n.arg);
      else if (n.type === 'list' || n.type === 'tuple') n.items.forEach(walk);
    };
    walk(node);
    return found;
  };
  if (left.type === 'ident' && free(left.name) && !uses(right, left.name)) {
    return { kind: 'define', mutable: true, implicit: true, name: left.name, params: null, body: right, ...(restrict ? { restrict } : {}) };
  }
  if (left.type === 'call' && left.primes === 0 && left.args.length > 0 && free(left.name) && !uses(right, left.name)) {
    const params = left.args.map((a) => (a.type === 'ident' ? a.name : null));
    if (params.every((p): p is string => p !== null) && new Set(params).size === params.length) {
      return { kind: 'define', mutable: true, implicit: true, name: left.name, params, body: right, ...(restrict ? { restrict } : {}) };
    }
  }
  return stmt;
}

/** a < b is b > a */
function flip(op: RelOp): RelOp {
  return op === '<' ? '>' : op === '>' ? '<' : op === '<=' ? '>=' : op === '>=' ? '<=' : op;
}

function topOp(node: Node): string | undefined {
  return node.type === 'call' && SYMBOLIC_OPS.has(node.name) ? node.name : undefined;
}

function parseAnswer(text: string): Node {
  try {
    return parseExpression(text);
  } catch {
    throw new MathError(`Couldn't read the symbolic result: ${text}`);
  }
}

function solvedResult(ans: Answer): Result {
  const r: Result = { status: 'solved', text: ans.display ?? ans.expr ?? '' };
  if (ans.special) r.special = ans.special;
  if (ans.periodic) r.periodic = true;
  if (ans.numeric) r.numeric = true;
  return r;
}

/**
 * Names a node refers to. `refs` are user definitions it depends on,
 * `unknown` are names that aren't defined anywhere (inside diff, solve, …
 * those are symbols, so they don't count).
 */
function collectNames(
  node: Node,
  bound: Set<string>,
  known: (n: string) => boolean,
  isFunction: (n: string) => boolean,
): { refs: Set<string>; unknown: Set<string> } {
  const refs = new Set<string>();
  const unknown = new Set<string>();
  const isKnown = (n: string) => bound.has(n) || known(n);
  let symbolicDepth = 0;

  const addValueName = (name: string) => {
    const parts = splitName(name, isKnown);
    if (!parts) {
      if (!isFunction(name) && symbolicDepth === 0) unknown.add(name);
      return;
    }
    for (const p of parts) if (!bound.has(p) && !(p in CONSTANTS)) refs.add(p);
  };

  const walk = (n: Node): void => {
    switch (n.type) {
      case 'num':
        return;
      case 'ident':
        return addValueName(n.name);
      case 'unary':
      case 'abs':
      case 'factorial':
        return walk(n.arg);
      case 'binary':
      case 'rel':
        walk(n.left);
        walk(n.right);
        return;
      case 'list':
      case 'tuple':
        n.items.forEach(walk);
        return;
      case 'call':
        if (SYMBOLIC_OPS.has(n.name)) {
          symbolicDepth++;
          n.args.forEach(walk);
          symbolicDepth--;
          return;
        }
        if (!known(n.name) && (n.name === 'seq' || FIELD_FORMS.has(n.name))) {
          // seq without a variable name: let the evaluator explain the form
          if (n.name === 'seq' && n.args[1]?.type !== 'ident') {
            symbolicDepth++;
            n.args.forEach(walk);
            symbolicDepth--;
            return;
          }
          const inner = n.name === 'seq' ? [(n.args[1] as { name: string }).name] : ['x', 'y'];
          const scoped = n.name === 'seq' ? n.args.slice(0, 1) : n.args;
          const rest = n.name === 'seq' ? n.args.slice(2) : [];
          for (const a of scoped) {
            const sub = collectNames(a, new Set([...bound, ...inner]), known, isFunction);
            sub.refs.forEach((r) => refs.add(r));
            sub.unknown.forEach((u) => symbolicDepth === 0 && unknown.add(u));
          }
          rest.forEach(walk);
          return;
        }
        if (!known(n.name) && (n.name === 'iterate' || n.name === 'cobweb')) {
          const f = n.args[0];
          if (f?.type === 'ident') {
            if (known(f.name)) refs.add(f.name);
            else if (!isFunction(f.name)) unknown.add(f.name);
          }
          n.args.slice(1).forEach(walk);
          return;
        }
        n.args.forEach(walk);
        if (bound.has(n.name)) return; // parameter used as a multiplier: a(x+1)
        if (isFunction(n.name)) {
          if (known(n.name)) refs.add(n.name);
          return;
        }
        return addValueName(n.name); // a(x+1) with a defined value
    }
  };
  walk(node);
  return { refs, unknown };
}

/** Each strongly connected group of definitions that refer to each other (Tarjan). */
function findCycles(deps: Map<string, string[]>): string[][] {
  let index = 0;
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];

  const visit = (v: string) => {
    indices.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    for (const w of deps.get(v) ?? []) {
      if (!deps.has(w)) continue;
      if (!indices.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, indices.get(w)!));
      }
    }
    if (low.get(v) === indices.get(v)) {
      const group: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        group.push(w);
      } while (w !== v);
      const selfLoop = group.length === 1 && (deps.get(v) ?? []).includes(v);
      if (group.length > 1 || selfLoop) cycles.push(group.reverse());
    }
  };
  for (const v of deps.keys()) if (!indices.has(v)) visit(v);
  return cycles;
}

function compare(op: RelOp, a: Value, b: Value): boolean {
  if (op === '=') return valuesEqual(a, b);
  if (a.kind !== 'num' || b.kind !== 'num') {
    throw new MathError(`${op} compares numbers, not ${kindName(a.kind !== 'num' ? a : b)}`);
  }
  const l = a.z;
  const r = b.z;
  if (!l.isReal() || !r.isReal()) throw new MathError(`Complex numbers can't be compared with ${op}`);
  switch (op) {
    case '<': return l.re < r.re;
    case '>': return l.re > r.re;
    case '<=': return l.re <= r.re;
    case '>=': return l.re >= r.re;
  }
}

function undefinedError(names: Set<string>): MathError & { undefinedNames: string[] } {
  const list = [...names].sort();
  const err = new MathError(
    list.length === 1 ? `${list[0]} is not defined` : `${list.join(', ')} are not defined`,
  ) as MathError & { undefinedNames: string[] };
  err.undefinedNames = list;
  return err;
}

function errorResult(e: MathError & { undefinedNames?: string[] }): Result {
  const r: Result = { status: 'error', message: e.message };
  if (e.pos !== undefined) r.pos = e.pos;
  if (e.undefinedNames) r.undefinedNames = e.undefinedNames;
  return r;
}

function sameResult(a: Result | undefined, b: Result): boolean {
  if (!a || a.status !== b.status) return false;
  // results are small plain objects; compare by content, with complex values by text
  const strip = (r: Result) => (r.status === 'value' ? { ...r, value: undefined } : r);
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}
