import type { Node } from './ast';
import type { EvalSettings } from './builtins';

/**
 * Functions answered by a computer algebra system (SymPy in the apps).
 * Inside their arguments, names that aren't defined are symbols, not errors.
 */
export const SYMBOLIC_OPS = new Set([
  'diff', 'integrate', 'limit', 'taylor',
  'factor', 'expand', 'simplify', 'apart',
  'solve', 'eigenvals',
]);

export type SymbolicAnswer =
  | {
      ok: true;
      /** the result in this engine's syntax, for further calculation; absent when it can only be shown */
      expr?: string;
      /** how to show it, when that differs from expr (x = 2, x = 3; x < -1 or x > 3) */
      display?: string;
      /** found numerically, not exactly */
      numeric?: boolean;
      /** a decimal for an exact number this engine may not evaluate itself (sqrt(pi)*erf(1)/2) */
      approx?: string;
      /** step-by-step working (integral_steps): SymPy's record of the methods used */
      steps?: IntegralStep;
      var?: string;
      bounds?: [string, string];
      /** an indefinite integral: show "+ C" */
      constant?: boolean;
      /** solve found no solution / every number is a solution */
      special?: 'none' | 'all';
      /** solutions repeat: n is any integer */
      periodic?: boolean;
    }
  | { ok: false; error: string };

/**
 * The workspace is synchronous; a resolver answers from its cache, or starts
 * the work, returns undefined, and tells the app to call workspace.refresh()
 * when the answer arrives.
 */
export interface SymbolicResolver {
  resolve(op: string, args: Node[], settings: EvalSettings): SymbolicAnswer | undefined;
}

/**
 * One method SymPy used for an integral: PowerRule, URule (substitution),
 * PartsRule, … with the integrand, the antiderivative, the method's own
 * values (u, dv, the substitution) and the parts it split into.
 */
export interface IntegralStep {
  rule: string;
  integrand: string;
  result?: string;
  parts?: IntegralStep[];
  [field: string]: string | IntegralStep[] | undefined;
}

/** Thrown while an answer is still being computed. */
export class PendingError extends Error {
  constructor() {
    super('pending');
    this.name = 'PendingError';
  }
}

/** Replace names by expressions (parameters by arguments). */
export function substitute(node: Node, values: Map<string, Node>): Node {
  const sub = (n: Node): Node => substitute(n, values);
  switch (node.type) {
    case 'num':
      return node;
    case 'ident':
      return values.get(node.name) ?? node;
    case 'unary':
    case 'abs':
    case 'factorial':
      return { ...node, arg: sub(node.arg) };
    case 'binary':
    case 'rel':
      return { ...node, left: sub(node.left), right: sub(node.right) };
    case 'list':
      return { ...node, items: node.items.map(sub) };
    case 'tuple':
      return { ...node, items: [sub(node.items[0]), sub(node.items[1])] };
    case 'call':
      return { ...node, args: node.args.map(sub) };
  }
}

/** Does the expression use diff, integrate, …, or f'(x)? */
export function usesSymbolic(node: Node): boolean {
  switch (node.type) {
    case 'num':
    case 'ident':
      return false;
    case 'unary':
    case 'abs':
    case 'factorial':
      return usesSymbolic(node.arg);
    case 'binary':
    case 'rel':
      return usesSymbolic(node.left) || usesSymbolic(node.right);
    case 'list':
    case 'tuple':
      return node.items.some(usesSymbolic);
    case 'call':
      return SYMBOLIC_OPS.has(node.name) || node.primes > 0 || node.args.some(usesSymbolic);
  }
}
