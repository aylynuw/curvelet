import { MathError, type EvalSettings, type Node } from '@math/engine';

/**
 * Expression tree → SymPy source, evaluated by python.ts in a namespace where
 * Sym(name) makes a symbol and _det, _cbrt, … are helpers.
 * Names are only ever letters, digits and _, so quoting them with JSON is safe.
 */
export function toPython(node: Node, s: EvalSettings, op = 'this'): string {
  const t = (n: Node) => toPython(n, s, op);
  const deg = (a: string) => (s.angle === 'deg' ? `((${a})*pi/180)` : a);
  const toDeg = (a: string) => (s.angle === 'deg' ? `((${a})*180/pi)` : a);

  switch (node.type) {
    case 'num': {
      const v = node.value;
      if (v === Infinity) return 'oo';
      if (Number.isSafeInteger(v)) return `Integer(${v})`;
      // decimals stay exact: 0.1 → 1/10
      return `Rational('${String(v)}')`;
    }
    case 'ident':
      switch (node.name) {
        case 'pi': return 'pi';
        case 'e': return 'E';
        case 'i': return 'I';
        case 'tau': return '(2*pi)';
        case 'inf': return 'oo';
        default: return `Sym(${JSON.stringify(node.name)})`;
      }
    case 'unary':
      return `(-${t(node.arg)})`;
    case 'abs':
      return `Abs(${t(node.arg)})`;
    case 'factorial':
      return `factorial(${t(node.arg)})`;
    case 'binary': {
      if (node.op === '^' && node.right.type === 'ident' && node.right.name === 'T') return `_transpose(${t(node.left)})`;
      const op2 = node.op === '^' ? '**' : node.op;
      return `(${t(node.left)} ${op2} ${t(node.right)})`;
    }
    case 'tuple':
      throw new MathError(`Points can't be used inside ${op}`);
    case 'rel': {
      const fn = { '=': 'Eq', '<': 'Lt', '>': 'Gt', '<=': 'Le', '>=': 'Ge', '!=': 'Ne' }[node.op];
      return `${fn}(${t(node.left)}, ${t(node.right)})`;
    }
    case 'list': {
      if (node.items.length > 0 && node.items.every((i) => i.type === 'list')) {
        return `Matrix([${node.items.map((row) => `[${(row as { items: Node[] }).items.map(t).join(', ')}]`).join(', ')}])`;
      }
      return `Matrix([${node.items.map(t).join(', ')}])`;
    }
    case 'call': {
      const a = node.args.map(t);
      const name = node.name;
      const one = () => {
        if (a.length !== 1) throw new MathError(`${name} takes 1 argument, got ${a.length}`);
        return a[0]!;
      };
      const log = /^log_(\d+)$/.exec(name);
      if (log) return `log(${one()}, ${log[1]})`;
      switch (name) {
        case 'piecewise':
        case 'if': {
          // SymPy's Piecewise((value, cond), …, (otherwise, True))
          const parts: string[] = [];
          for (let k = 0; k + 1 < a.length; k += 2) parts.push(`(${a[k + 1]}, ${a[k]})`);
          if (a.length % 2 === 1) parts.push(`(${a[a.length - 1]}, True)`);
          return `Piecewise(${parts.join(', ')})`;
        }
        case 'and': return `And(${a.join(', ')})`;
        case 'or': return `Or(${a.join(', ')})`;
        case 'sin': case 'cos': case 'tan': case 'sec': case 'csc': case 'cot':
          return `${name}(${deg(one())})`;
        case 'arcsin': case 'asin': return toDeg(`asin(${one()})`);
        case 'arccos': case 'acos': return toDeg(`acos(${one()})`);
        case 'arctan': case 'atan': return toDeg(`atan(${one()})`);
        case 'arg': return toDeg(`arg(${one()})`);
        case 'sinh': case 'cosh': case 'tanh': case 'exp': case 'sqrt': case 'floor': case 'sign': case 're': case 'im': case 'factorial':
          return `${name}(${one()})`;
        case 'ln': return `log(${one()})`;
        case 'log': return a.length === 2 ? `log(${a[0]}, ${a[1]})` : `log(${one()}, 10)`;
        case 'cbrt': return `_cbrt(${one()})`;
        case 'root': return `_root(${a.join(', ')})`;
        case 'abs': return `Abs(${one()})`;
        case 'ceil': return `ceiling(${one()})`;
        case 'round': return `_round(${one()})`;
        case 'conj': return `conjugate(${one()})`;
        case 'min': return `Min(${a.join(', ')})`;
        case 'max': return `Max(${a.join(', ')})`;
        case 'gcd': case 'lcm': return `${name}(${a.join(', ')})`;
        case 'mod': return `Mod(${a.join(', ')})`;
        case 'nCr': case 'ncr': return `binomial(${a.join(', ')})`;
        case 'nPr': case 'npr': return `ff(${a.join(', ')})`;
        case 'det': case 'inv': case 'transpose': case 'trace': case 'rank': case 'rref': case 'dot': case 'cross': case 'norm':
          return `_${name}(${a.join(', ')})`;
        case 'identity': return `eye(${one()})`;
        case 'isprime': case 'primefactors': case 'divisors': case 'bin': case 'oct': case 'hex': case 'dec': case 'base':
        case 'segment': case 'line': case 'ray': case 'circle': case 'polygon': case 'midpoint': case 'foot': case 'perpendicular':
        case 'parallel': case 'perpbisector': case 'bisector': case 'tangent': case 'intersect': case 'angle': case 'distance':
        case 'length': case 'area': case 'perimeter': case 'center': case 'radius': case 'rotate': case 'reflect':
        case 'mean': case 'median': case 'sum': case 'count': case 'var': case 'stdev': case 'pvar': case 'pstdev': case 'quantile':
        case 'corr': case 'points': case 'linreg': case 'quadreg': case 'polyreg': case 'expreg': case 'logreg': case 'powreg':
        case 'normalpdf': case 'normalcdf': case 'invnorm': case 'binompdf': case 'binomcdf': case 'poissonpdf': case 'poissoncdf':
        case 'tpdf': case 'tcdf': case 'chisqpdf': case 'chisqcdf': case 'seq': case 'iterate': case 'cobweb': case 'slopefield': case 'vectorfield':
          throw new MathError(`${name} can't be used inside ${op}`);
        default:
          // a function defined nowhere: SymPy keeps it as f(x), so diff(f(x), x) still means something
          return `Fn(${JSON.stringify(name)})(${a.join(', ')})`;
      }
    }
  }
}
