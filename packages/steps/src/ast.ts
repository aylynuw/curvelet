import type { Node } from '@math/engine';

/** Small builders and tests for expression trees, so the rules read like the math. */

export const num = (value: number): Node => (value < 0 ? neg({ type: 'num', value: -value }) : { type: 'num', value });
export const id = (name: string): Node => ({ type: 'ident', name });
export const call = (name: string, ...args: Node[]): Node => ({ type: 'call', name, args, primes: 0 });
export const neg = (arg: Node): Node => ({ type: 'unary', op: '-', arg });
const bin = (op: '+' | '-' | '*' | '/' | '^') => (left: Node, right: Node): Node => ({ type: 'binary', op, left, right });
export const add = bin('+');
export const sub = bin('-');
export const mul = bin('*');
export const div = bin('/');
export const pow = bin('^');

/** Does `node` mention the variable? */
export function has(node: Node, x: string): boolean {
  switch (node.type) {
    case 'num':
      return false;
    case 'ident':
      return node.name === x;
    case 'unary':
    case 'abs':
    case 'factorial':
      return has(node.arg, x);
    case 'binary':
    case 'rel':
      return has(node.left, x) || has(node.right, x);
    case 'call':
      return node.args.some((a) => has(a, x));
    case 'list':
      return node.items.some((a) => has(a, x));
    case 'tuple':
      return has(node.items[0], x) || has(node.items[1], x);
  }
}

export const isNum = (n: Node, v?: number): n is Extract<Node, { type: 'num' }> => n.type === 'num' && (v === undefined || n.value === v);
export const isVar = (n: Node, x: string) => n.type === 'ident' && n.name === x;

/** The number a constant node stands for, when it is a plain number (or minus one). */
export function numValue(n: Node): number | null {
  if (n.type === 'num') return n.value;
  if (n.type === 'unary') {
    const v = numValue(n.arg);
    return v === null ? null : -v;
  }
  return null;
}

/**
 * Tidies an expression the way a person writing steps would: 1·x is x, x + 0
 * is x, x^1 is x, numbers combine (only exactly: 6/4 stays a fraction, made
 * smaller), and a number moves in front of a product. Not a full simplifier.
 */
export function tidy(node: Node): Node {
  switch (node.type) {
    case 'unary': {
      const a = tidy(node.arg);
      const v = numValue(a);
      if (v !== null) return num(-v);
      if (a.type === 'unary') return a.arg;
      return neg(a);
    }
    case 'call':
      return { ...node, args: node.args.map(tidy) };
    case 'abs':
      return { ...node, arg: tidy(node.arg) };
    case 'binary': {
      const l = tidy(node.left);
      const r = tidy(node.right);
      const a = numValue(l);
      const b = numValue(r);
      switch (node.op) {
        case '+':
          if (a === 0) return r;
          if (b === 0) return l;
          if (a !== null && b !== null) return num(a + b);
          // a + (−b) is a − b
          if (r.type === 'unary') return { type: 'binary', op: '-', left: l, right: r.arg };
          return add(l, r);
        case '-':
          if (b === 0) return l;
          if (a === 0) return tidy(neg(r));
          if (a !== null && b !== null) return num(a - b);
          if (r.type === 'unary') return add(l, r.arg);
          return sub(l, r);
        case '*': {
          if (a === 0 || b === 0) return num(0);
          if (a === 1) return r;
          if (b === 1) return l;
          if (a === -1) return tidy(neg(r));
          if (b === -1) return tidy(neg(l));
          if (a !== null && b !== null) return num(a * b);
          // a number goes in front: x·3 is 3x
          if (b !== null) return tidy(mul(r, l));
          // −a · b is −(a b)
          if (l.type === 'unary') return tidy(neg(mul(l.arg, r)));
          if (r.type === 'unary') return tidy(neg(mul(l, r.arg)));
          // a · (1/b) is a/b, and x · (1/x) is 1
          const same = (p: Node, q: Node) => JSON.stringify(p) === JSON.stringify(q);
          if (r.type === 'binary' && r.op === '/' && numValue(r.left) === 1) return same(l, r.right) ? num(1) : tidy(div(l, r.right));
          if (l.type === 'binary' && l.op === '/' && numValue(l.left) === 1) return same(r, l.right) ? num(1) : tidy(div(r, l.right));
          // 2 · (3 x) is 6x
          if (a !== null && r.type === 'binary' && r.op === '*' && numValue(r.left) !== null) return tidy(mul(num(a * numValue(r.left)!), r.right));
          // x · x^n and the like stay as written: steps show the rule, not the algebra
          return mul(l, r);
        }
        case '/': {
          if (a === 0) return num(0);
          if (b === 1) return l;
          if (a !== null && b !== null && b !== 0) {
            if (Number.isInteger(a) && Number.isInteger(b)) {
              const g = gcd(Math.abs(a), Math.abs(b));
              const [p, q] = [a / g, b / g];
              const [sp, sq] = q < 0 ? [-p, -q] : [p, q];
              return sq === 1 ? num(sp) : sp < 0 ? neg(div(num(-sp), num(sq))) : div(num(sp), num(sq));
            }
            return num(a / b);
          }
          if (l.type === 'unary') return tidy(neg(div(l.arg, r)));
          return div(l, r);
        }
        case '^': {
          if (b === 0) return num(1);
          if (b === 1) return l;
          if (a !== null && b !== null && Number.isInteger(b) && b >= 0 && Number.isInteger(a) && Math.abs(a ** b) < 1e15) return num(a ** b);
          return pow(l, r);
        }
      }
    }
    // eslint-disable-next-line no-fallthrough
    default:
      return node;
  }
}

export function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}
