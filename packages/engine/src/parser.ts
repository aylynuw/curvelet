import { MathError, type Node, type RelOp, type Statement } from './ast';
import { tokenize, type Token } from './lexer';

/**
 * Built-in one-argument functions that may be written without parentheses:
 * `sin x`, `sin 2x`, `ln x`, `√x`, and `sin^2 x` meaning (sin x)^2.
 */
export const PARENLESS_FUNCS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'sinh', 'cosh', 'tanh',
  'arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan',
  'ln', 'log', 'exp', 'sqrt', 'cbrt',
]);
const TRIG = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot']);
const REL_OPS = new Set(['=', '<', '>', '<=', '>=', '!=']);
/** words that join or open parts of a line, never names multiplied in */
const WORDS = new Set(['let', 'const', 'if', 'else', 'otherwise', 'and', 'or']);

/** Parse one line of input. */
export function parse(src: string): Statement {
  return new Parser(tokenize(src)).statement();
}

/** Parse a single expression (no `let`, no `=`). */
export function parseExpression(src: string): Node {
  const p = new Parser(tokenize(src));
  const node = p.expr();
  p.expectEnd();
  return node;
}

class Parser {
  private i = 0;
  /** > 0 while inside |...|, so a `|` closes the bars instead of starting new ones */
  private absDepth = 0;

  constructor(private tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.i + offset, this.tokens.length - 1)]!;
  }
  private next(): Token {
    return this.tokens[this.i++]!;
  }
  private isOp(value: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.type === 'op' && t.value === value;
  }
  private expectOp(value: string): Token {
    const t = this.next();
    if (t.type !== 'op' || t.value !== value) {
      throw new MathError(t.type === 'eof' ? `Missing "${value}"` : `Expected "${value}" but found "${t.value}"`, t.pos);
    }
    return t;
  }
  private expectIdent(what: string): Token {
    const t = this.next();
    if (t.type !== 'ident') throw new MathError(`Expected ${what}`, t.pos);
    return t;
  }
  expectEnd(): void {
    const t = this.peek();
    if (t.type !== 'eof') {
      throw new MathError(t.value === ')' ? 'Unmatched ")"' : `Unexpected "${t.value}"`, t.pos);
    }
  }

  statement(): Statement {
    if (this.peek().type === 'eof') return { kind: 'empty' };

    const first = this.peek();
    if (first.type === 'ident' && (first.value === 'let' || first.value === 'const')) {
      this.next();
      return this.definition(first.value === 'let');
    }

    const left = this.value();
    const t = this.peek();
    if (t.type === 'op' && REL_OPS.has(t.value)) {
      this.next();
      const right = this.value();
      const restrict = this.restriction();
      this.expectEnd();
      return { kind: 'relation', op: t.value as RelOp, left, right, ...restrict };
    }
    const restrict = this.restriction();
    this.expectEnd();
    return { kind: 'expr', expr: left, ...restrict };
  }

  /** {x > 0}, {-1 < x < 2, y > 0}: comparisons, chains split into pairs */
  private restriction(): { restrict?: Node[] } {
    if (!this.isOp('{')) return {};
    const open = this.next();
    const conds: Node[] = [];
    do {
      let left = this.expr();
      let found = false;
      for (;;) {
        const t = this.peek();
        if (!(t.type === 'op' && REL_OPS.has(t.value))) break;
        this.next();
        const right = this.expr();
        conds.push({ type: 'rel', op: t.value as RelOp, left, right });
        left = right;
        found = true;
      }
      if (!found) throw new MathError('Inside { } write a condition, like {x > 0}', open.pos);
    } while (this.isOp(',') && this.next());
    this.expectOp('}');
    return { restrict: conds };
  }

  private definition(mutable: boolean): Statement {
    const name = this.expectIdent('a name after let/const').value;
    let params: string[] | null = null;
    if (this.isOp('(')) {
      this.next();
      params = [];
      if (!this.isOp(')')) {
        do {
          const p = this.expectIdent('a parameter name');
          if (params.includes(p.value)) throw new MathError(`Parameter "${p.value}" is listed twice`, p.pos);
          params.push(p.value);
        } while (this.isOp(',') && this.next());
      }
      this.expectOp(')');
    }
    this.expectOp('=');
    const body = this.value();
    const restrict = this.restriction();
    this.expectEnd();
    return { kind: 'define', mutable, name, params, body, ...restrict };
  }

  /** a function argument: an expression, or a comparison such as x^2 = 4 (or a chain, -1 < x < 2, with and/or) */
  private argument(): Node {
    const left = this.expr();
    const t = this.peek();
    if (t.type === 'op' && REL_OPS.has(t.value)) return this.conditionFrom(left);
    return left;
  }

  /**
   * A condition, its first expression already read: x < 0, -1 < x <= 2 (a chain),
   * x > 0 and x < 3, x < -1 or x > 1. One comparison stays a `rel`; more become and(…)/or(…).
   */
  private conditionFrom(first: Node): Node {
    const chain = (left: Node): Node => {
      const parts: Node[] = [];
      for (;;) {
        const t = this.peek();
        if (!(t.type === 'op' && REL_OPS.has(t.value))) break;
        this.next();
        const right = this.expr();
        parts.push({ type: 'rel', op: t.value as RelOp, left, right });
        left = right;
      }
      if (!parts.length) throw new MathError('A condition compares, like x < 0', this.peek().pos);
      return parts.length === 1 ? parts[0]! : { type: 'call', name: 'and', args: parts, primes: 0 };
    };
    let node = chain(first);
    for (;;) {
      const t = this.peek();
      if (t.type !== 'ident' || (t.value !== 'and' && t.value !== 'or')) return node;
      this.next();
      const next = chain(this.expr());
      node = { type: 'call', name: t.value, args: [node, next], primes: 0 };
    }
  }

  /** is the bracket at the cursor a condition, like the (x < 0) in x^2 (x < 0)? */
  private bracketHoldsCondition(): boolean {
    if (!this.isOp('(')) return false;
    let depth = 0;
    for (let k = this.i; k < this.tokens.length; k++) {
      const t = this.tokens[k]!;
      if (t.type === 'eof') return false;
      if (t.type !== 'op') continue;
      if (t.value === '(' || t.value === '[' || t.value === '{') depth++;
      else if (t.value === ')' || t.value === ']' || t.value === '}') {
        depth--;
        if (depth === 0) return false;
      } else if (depth === 1 && REL_OPS.has(t.value)) return true;
    }
    return false;
  }

  /**
   * Cases, as a piecewise(cond, value, cond, value, …, otherwise) call. One branch is
   * any of: `cond: value`, `value if cond`, `value (cond)`, and the last may be a bare
   * value (or `value otherwise`, `else value`) for everywhere else. Branches are
   * separated by , or ; and the list ends at `end` (a closing brace) or the line's end.
   */
  private cases(first: Node | null, end: '}' | null): Node {
    const args: Node[] = [];
    let fallback: Node | null = null;
    let item: Node | null = first;
    for (;;) {
      if (item === null) {
        if (this.peek().type === 'ident' && (this.peek().value === 'else' || this.peek().value === 'otherwise')) {
          this.next();
          if (this.isOp(':')) this.next();
        }
        item = this.expr();
      }
      const t = this.peek();
      if (t.type === 'op' && REL_OPS.has(t.value)) {
        // cond: value
        const cond = this.conditionFrom(item);
        this.expectOp(':');
        args.push(cond, this.expr());
      } else if (t.type === 'ident' && t.value === 'if') {
        this.next();
        args.push(this.conditionFrom(this.expr()), item);
      } else if (this.bracketHoldsCondition()) {
        this.next();
        const cond = this.conditionFrom(this.expr());
        this.expectOp(')');
        args.push(cond, item);
      } else {
        if (t.type === 'ident' && (t.value === 'otherwise' || t.value === 'else')) this.next();
        fallback = item;
      }
      item = null;
      if ((this.isOp(',') || this.isOp(';')) && fallback === null) {
        this.next();
        continue;
      }
      break;
    }
    if (end) this.expectOp(end);
    if (!args.length) throw new MathError('Cases need a condition, like {x < 0: -x, x}', this.peek().pos);
    if (fallback) args.push(fallback);
    return { type: 'call', name: 'piecewise', args, primes: 0 };
  }

  /** a line's value: an expression, or cases written out (-x if x < 0, x otherwise; x^2 (x < 0), …) */
  private value(): Node {
    const v = this.expr();
    const t = this.peek();
    if ((t.type === 'ident' && t.value === 'if') || this.bracketHoldsCondition()) return this.cases(v, null);
    return v;
  }

  expr(): Node {
    let left = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.next().value as '+' | '-';
      left = { type: 'binary', op, left, right: this.term() };
    }
    return left;
  }

  /** * and / and implicit multiplication (2x, 2(x+1), (a)(b)), all left to right */
  private term(): Node {
    let left = this.unary();
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = this.next().value as '*' | '/';
        left = { type: 'binary', op, left, right: this.unary() };
      } else if (this.startsImplicitFactor()) {
        left = { type: 'binary', op: '*', left, right: this.power() };
      } else {
        return left;
      }
    }
  }

  private startsImplicitFactor(): boolean {
    const t = this.peek();
    if (t.type === 'ident') return !WORDS.has(t.value);
    if (t.type === 'num') {
      throw new MathError('Missing operator between numbers', t.pos);
    }
    if (t.type === 'op') return (t.value === '(' && !this.bracketHoldsCondition()) || (t.value === '|' && this.absDepth === 0);
    return false;
  }

  private unary(): Node {
    if (this.isOp('-')) {
      this.next();
      return { type: 'unary', op: '-', arg: this.unary() };
    }
    if (this.isOp('+')) {
      this.next();
      return this.unary();
    }
    return this.power();
  }

  /** right-associative: 2^3^2 = 2^9; binds tighter than unary minus: -x^2 = -(x^2) */
  private power(): Node {
    const base = this.postfix();
    if (this.isOp('^')) {
      this.next();
      return { type: 'binary', op: '^', left: base, right: this.unary() };
    }
    return base;
  }

  private postfix(): Node {
    let node = this.primary();
    for (;;) {
      if (this.isOp('!')) {
        this.next();
        node = { type: 'factorial', arg: node };
      } else if (this.isOp('°')) {
        // 30°: degrees in either angle mode
        this.next();
        node = { type: 'call', name: 'degrees', args: [node], primes: 0 };
      } else return node;
    }
  }

  private primary(): Node {
    const t = this.next();
    if (t.type === 'num') {
      const prefix = t.value.slice(0, 2).toLowerCase();
      const base = prefix === '0b' ? 2 : prefix === '0o' ? 8 : prefix === '0x' ? 16 : undefined;
      return base ? { type: 'num', value: Number(t.value), base } : { type: 'num', value: Number(t.value) };
    }

    if (t.type === 'op' && t.value === '[') {
      const saved = this.absDepth;
      this.absDepth = 0;
      const items: Node[] = [];
      if (!this.isOp(']')) {
        do items.push(this.expr());
        while (this.isOp(',') && this.next());
      }
      this.absDepth = saved;
      this.expectOp(']');
      return { type: 'list', items };
    }

    if (t.type === 'op' && t.value === '(') {
      const saved = this.absDepth;
      this.absDepth = 0;
      const inner = this.expr();
      let point: Node | null = null;
      if (this.isOp(',')) {
        // (x, y) is a point
        this.next();
        point = { type: 'tuple', items: [inner, this.expr()] };
        if (this.isOp(',')) throw new MathError('A point has two coordinates: (x, y)', this.peek().pos);
      }
      this.absDepth = saved;
      this.expectOp(')');
      return point ?? inner;
    }
    if (t.type === 'op' && t.value === '{') {
      // {x < 0: -x, x}: cases
      const saved = this.absDepth;
      this.absDepth = 0;
      const node = this.cases(null, '}');
      this.absDepth = saved;
      return node;
    }
    if (t.type === 'op' && t.value === '|') {
      this.absDepth++;
      const inner = this.expr();
      this.absDepth--;
      this.expectOp('|');
      return { type: 'abs', arg: inner };
    }
    if (t.type === 'ident') return this.identifier(t);

    if (t.type === 'eof') throw new MathError('Expression ends too early', t.pos);
    throw new MathError(`Unexpected "${t.value}"`, t.pos);
  }

  private identifier(t: Token): Node {
    const name = t.value;
    if (name === 'let' || name === 'const') {
      throw new MathError(`"${name}" can only start a line`, t.pos);
    }

    let primes = 0;
    while (this.isOp("'")) {
      this.next();
      primes++;
    }
    // x (x < 0) in cases is x for x < 0, not a call of x: a one-letter name never takes a condition
    if (this.isOp('(') && !(/^[a-zA-Z](_\w+)?$/.test(name) && primes === 0 && this.bracketHoldsCondition())) {
      this.next();
      const args: Node[] = [];
      const saved = this.absDepth;
      this.absDepth = 0;
      if (!this.isOp(')')) {
        do args.push(this.argument());
        while (this.isOp(',') && this.next());
      }
      this.absDepth = saved;
      this.expectOp(')');
      return { type: 'call', name, args, primes };
    }
    if (primes > 0) throw new MathError(`Write ${name}${"'".repeat(primes)}(x) with an argument`, t.pos);

    if (PARENLESS_FUNCS.has(name)) return this.parenlessCall(name, t);
    return { type: 'ident', name };
  }

  /** sin x, sin 2x, sin^2 x = (sin x)^2, sin x cos x = (sin x)(cos x) */
  private parenlessCall(name: string, t: Token): Node {
    let exponent: Node | null = null;
    if (this.isOp('^')) {
      this.next();
      exponent = this.unary();
      if (TRIG.has(name) && exponent.type === 'unary' && exponent.arg.type === 'num' && exponent.arg.value === 1) {
        throw new MathError(`${name}^-1 is ambiguous: write arc${name}(x) for the inverse or (${name} x)^-1 for 1/${name} x`, t.pos);
      }
    }
    let call: Node;
    if (exponent === null && (this.isOp(',') || this.isOp(')'))) {
      // just the name, as an argument: iterate(cos, 1, 5)
      return { type: 'ident', name };
    }
    if (this.isOp('(')) {
      call = this.identifier(t); // falls into the parenthesised call branch
    } else {
      const start = this.peek();
      if (start.type !== 'num' && start.type !== 'ident' && !this.isOp('|') && !this.isOp('[')) {
        throw new MathError(`${name} needs an argument`, start.pos);
      }
      // argument: a chain of implicit factors, stopping at the next built-in function
      let arg = this.power();
      while (this.peek().type === 'ident' && !PARENLESS_FUNCS.has(this.peek().value) && this.startsImplicitFactor()) {
        arg = { type: 'binary', op: '*', left: arg, right: this.power() };
      }
      call = { type: 'call', name, args: [arg], primes: 0 };
    }
    return exponent ? { type: 'binary', op: '^', left: call, right: exponent } : call;
  }
}
