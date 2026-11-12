import type { Node } from './ast';
import { formatReal } from './format';

/**
 * Turns an expression back into text the parser reads again:
 * 3x^2 - 12x + 11, (x - 1)(x + 1), x^(1/3), -sin(x)/2.
 * Uses the fewest parentheses that keep the meaning, and writes a number
 * in front of a name or a bracket without a `*` (2x, 2sin(x), 2(x + 1)).
 */
export function printNode(node: Node): string {
  return print(node).text;
}

// higher binds tighter
const PREC = { rel: 0, add: 1, mul: 2, unary: 3, pow: 4, atom: 6 } as const;

interface Printed {
  text: string;
  prec: number;
}

const wrap = (p: Printed, min: number) => (p.prec < min ? `(${p.text})` : p.text);

function print(n: Node): Printed {
  switch (n.type) {
    case 'num': {
      const prefix = n.base === 2 ? '0b' : n.base === 8 ? '0o' : n.base === 16 ? '0x' : null;
      if (prefix) return { text: `${prefix}${n.value.toString(n.base)}`, prec: PREC.atom };
      // negative literals (from substitution) bind like a unary minus
      return { text: formatReal(n.value), prec: n.value < 0 ? PREC.unary : PREC.atom };
    }
    case 'ident':
      return { text: n.name, prec: PREC.atom };
    case 'call':
      return { text: `${n.name}${"'".repeat(n.primes)}(${n.args.map(printNode).join(', ')})`, prec: PREC.atom };
    case 'list':
      return { text: `[${n.items.map(printNode).join(', ')}]`, prec: PREC.atom };
    case 'tuple':
      return { text: `(${printNode(n.items[0])}, ${printNode(n.items[1])})`, prec: PREC.atom };
    case 'abs':
      return { text: `|${printNode(n.arg)}|`, prec: PREC.atom };
    case 'factorial':
      return { text: `${wrap(print(n.arg), PREC.atom)}!`, prec: PREC.atom };
    case 'unary':
      return { text: `-${wrap(print(n.arg), PREC.mul)}`, prec: PREC.unary };
    case 'rel':
      return { text: `${printNode(n.left)} ${n.op} ${printNode(n.right)}`, prec: PREC.rel };
    case 'binary': {
      const l = print(n.left);
      const r = print(n.right);
      switch (n.op) {
        case '+':
          // a + (-b) reads as a - b
          if (n.right.type === 'unary') return { text: `${l.text} - ${wrap(print(n.right.arg), PREC.mul)}`, prec: PREC.add };
          return { text: `${l.text} + ${wrap(r, PREC.add)}`, prec: PREC.add };
        case '-':
          return { text: `${l.text} - ${wrap(r, PREC.mul)}`, prec: PREC.add };
        case '*': {
          const left = wrap(l, PREC.mul);
          const right = wrap(r, PREC.mul + 0.5);
          // 2x, 2x^2, 2sin(x), 2(x + 1): a plain number in front needs no `*`
          // (but never 2e5, which would read back as 200000)
          const implicit =
            n.left.type === 'num' && n.left.value >= 0 && !n.left.base && /^[\p{L}(]/u.test(right) && !/^[eE]\d/.test(right);
          // (x - 1)(x + 1): two bracketed groups side by side
          const groups = left.endsWith(')') && right.startsWith('(');
          return { text: implicit || groups ? `${left}${right}` : `${left}*${right}`, prec: PREC.mul };
        }
        case '/':
          return { text: `${wrap(l, PREC.mul)}/${wrap(r, PREC.unary)}`, prec: PREC.mul };
        case '^':
          return { text: `${wrap(l, PREC.atom)}^${wrap(r, PREC.atom)}`, prec: PREC.pow };
      }
    }
  }
}
