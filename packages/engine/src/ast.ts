export type BinaryOp = '+' | '-' | '*' | '/' | '^';
export type RelOp = '=' | '<' | '>' | '<=' | '>=' | '!=';

export type Node =
  /** base is set for 0b/0o/0x literals so results can be shown in that base */
  | { type: 'num'; value: number; base?: number }
  /** [a, b, c]; a list of lists of equal length is a matrix */
  | { type: 'list'; items: Node[] }
  | { type: 'ident'; name: string }
  | { type: 'unary'; op: '-'; arg: Node }
  | { type: 'binary'; op: BinaryOp; left: Node; right: Node }
  /** primes = derivative order written as f'(x), f''(x) */
  | { type: 'call'; name: string; args: Node[]; primes: number }
  | { type: 'abs'; arg: Node }
  | { type: 'factorial'; arg: Node }
  /** a point (x, y) */
  | { type: 'tuple'; items: [Node, Node] }
  /** a comparison inside a function's arguments, as in solve(x^2 = 4, x) */
  | { type: 'rel'; op: RelOp; left: Node; right: Node };

/**
 * `{x > 0}`, `{0 <= t <= 1}` at the end of a line: where its graph is drawn
 * (each a `rel` node; a chain a < x < b becomes two).
 */
export type Restriction = Node[];

export type Statement =
  | { kind: 'empty' }
  | { kind: 'expr'; expr: Node; restrict?: Restriction }
  | { kind: 'relation'; op: RelOp; left: Node; right: Node; restrict?: Restriction }
  | {
      kind: 'define';
      restrict?: Restriction;
      /** true for `let`, false for `const` */
      mutable: boolean;
      /** written without let: f(x) = …, a = 3 */
      implicit?: boolean;
      name: string;
      /** null for a value (`let a = 2`), a list for a function (`let f(x) = ...`) */
      params: string[] | null;
      body: Node;
    };

export class MathError extends Error {
  constructor(
    message: string,
    /** character offset in the source, when known */
    public pos?: number,
  ) {
    super(message);
    this.name = 'MathError';
  }
}

/**
 * P(1 + r)^n with P a number, not a function, is P·(1 + r)^n: the power
 * belongs to the bracket, as on paper. `multiplies` says whether a name in
 * front of a bracket is a number (so the bracket multiplies it).
 */
export function liftPower(node: Node, multiplies: (name: string) => boolean): Node {
  if (
    node.type === 'binary' &&
    node.op === '^' &&
    node.left.type === 'call' &&
    node.left.primes === 0 &&
    node.left.args.length === 1 &&
    multiplies(node.left.name)
  ) {
    return {
      type: 'binary',
      op: '*',
      left: { type: 'ident', name: node.left.name },
      right: { type: 'binary', op: '^', left: node.left.args[0]!, right: node.right },
    };
  }
  return node;
}
