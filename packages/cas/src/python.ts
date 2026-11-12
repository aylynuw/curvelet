/**
 * The Python side of the symbolic engine, run inside Pyodide with SymPy.
 * `run(op, sources_json, complex)` evaluates each argument (SymPy source made by
 * translate.ts), runs the operation and returns JSON matching SymbolicAnswer,
 * with results printed in the calculator's own syntax (x^2, ln, e, i, inf).
 */
export const CAS_PY = String.raw`
import json
import re as _rx  # sympy's star import brings its own re() (real part)
from sympy import *
from sympy.core.relational import Relational
from sympy.logic.boolalg import BooleanAtom
from sympy.printing.str import StrPrinter
from sympy.sets.sets import Interval, Union, FiniteSet, Complement
from sympy.sets.fancysets import ImageSet
from sympy.matrices import MatrixBase


class CasError(Exception):
    pass


_RENAME = {'log': 'ln', 'Abs': 'abs', 'ceiling': 'ceil', 'binomial': 'nCr', 'ff': 'nPr',
           'conjugate': 'conj', 'Min': 'min', 'Max': 'max', 'Mod': 'mod',
           'asin': 'arcsin', 'acos': 'arccos', 'atan': 'arctan'}
_RENAME_RE = _rx.compile(r'\b(' + '|'.join(_RENAME) + r')\(')


class _Printer(StrPrinter):
    def _print_Exp1(self, e): return 'e'
    def _print_ImaginaryUnit(self, e): return 'i'
    def _print_Infinity(self, e): return 'inf'
    def _print_NegativeInfinity(self, e): return '-inf'
    def _print_ComplexInfinity(self, e):
        raise CasError('The result is undefined (it is infinite in every direction)')
    def _print_NaN(self, e):
        raise CasError('The result is undefined')
    def _print_exp(self, e):
        # e^x reads better than exp(x) for students
        arg = self._print(e.args[0])
        return 'e^' + (arg if e.args[0].is_Symbol or (e.args[0].is_Integer and e.args[0] >= 0) else '(' + arg + ')')
    def _print_MatrixBase(self, m):
        if m.cols == 1:
            return '[' + ', '.join(self._print(x) for x in m) + ']'
        rows = ('[' + ', '.join(self._print(x) for x in m.row(r)) + ']' for r in range(m.rows))
        return '[' + ', '.join(rows) + ']'
    _print_MutableDenseMatrix = _print_MatrixBase
    _print_ImmutableDenseMatrix = _print_MatrixBase
    _print_ImmutableMatrix = _print_MatrixBase
    _print_Matrix = _print_MatrixBase


def T(e):
    """SymPy expression -> the calculator's syntax."""
    s = _Printer().doprint(e)
    s = s.replace('**', '^')
    s = _RENAME_RE.sub(lambda m: _RENAME[m.group(1)] + '(', s)
    s = _rx.sub(r'(?<![\w.^])(\d+)\*(?=[^\W\d_]|\()', r'\1', s)
    return s.replace(')*(', ')(')


def _approx(e):
    """A decimal for exact numbers like sqrt(pi)*erf(1)/2, which the calculator may not evaluate itself."""
    try:
        if getattr(e, 'is_number', False) and not e.is_Rational:
            n = N(e, 15)
            if n.is_number and not n.has(oo, -oo, zoo, nan):
                return T(n)
    except Exception:
        pass
    return None


def _answer(e, **extra):
    out = {'expr': T(e)}
    a = _approx(e)
    if a is not None:
        out['approx'] = a
    out.update(extra)
    return out


def _make_ns(real):
    ns = {}
    exec('from sympy import *', ns)
    ns['Sym'] = (lambda n: Symbol(n, real=True)) if real else (lambda n: Symbol(n))
    ns['Fn'] = lambda n: Function(n)
    ns['_cbrt'] = (lambda x: real_root(x, 3)) if real else (lambda x: x ** Rational(1, 3))
    ns['_root'] = (lambda x, n: real_root(x, n)) if real else (lambda x, n: x ** (1 / Integer(n)))
    ns['_round'] = lambda x: floor(x + Rational(1, 2))
    def mat(m, name):
        if not isinstance(m, MatrixBase):
            raise CasError(name + ' needs a matrix')
        return m
    ns['_det'] = lambda m: mat(m, 'det').det()
    ns['_inv'] = lambda m: mat(m, 'inv').inv()
    ns['_transpose'] = lambda m: mat(m, 'transpose').T
    ns['_trace'] = lambda m: mat(m, 'trace').trace()
    ns['_rank'] = lambda m: Integer(mat(m, 'rank').rank())
    ns['_rref'] = lambda m: mat(m, 'rref').rref()[0]
    ns['_dot'] = lambda a, b: mat(a, 'dot').dot(mat(b, 'dot'))
    ns['_cross'] = lambda a, b: mat(a, 'cross').cross(mat(b, 'cross'))
    ns['_norm'] = lambda a: mat(a, 'norm').norm()
    return ns


_NS = {True: _make_ns(True), False: _make_ns(False)}


def _var(expr, opname, given=None):
    if given is not None:
        if not isinstance(given, Symbol):
            raise CasError(opname + ': the variable must be a name like x')
        return given
    fs = sorted(getattr(expr, 'free_symbols', set()), key=str)
    if len(fs) == 1:
        return fs[0]
    if not fs:
        raise CasError(opname + ' needs an expression with a variable, like ' + opname + '(x^2, x)')
    raise CasError(opname + ' needs to know the variable: write ' + opname + '(..., ' + str(fs[0]) + ')')


def _split_var(args, opname):
    """(expr, [var], rest...) -> expr, var, rest"""
    if not args:
        raise CasError(opname + ' needs an expression')
    expr, rest = args[0], list(args[1:])
    given = rest.pop(0) if rest and isinstance(rest[0], Symbol) else None
    return expr, _var(expr, opname, given), rest


def _whole(n, opname, least=0):
    if not (getattr(n, 'is_Integer', False) and n >= least):
        raise CasError(opname + ' needs a whole number of at least ' + str(least) + ' there')
    return int(n)


def op_diff(args, cplx):
    expr, v, rest = _split_var(args, 'diff')
    if len(rest) > 1:
        raise CasError('Write diff(f, x) or diff(f, x, n)')
    n = _whole(rest[0], 'diff', 1) if rest else 1
    return _answer(diff(expr, v, n))


def op_integrate(args, cplx):
    expr, v, rest = _split_var(args, 'integrate')
    if not rest:
        r = integrate(expr, v)
        if r.has(Integral):
            raise CasError('No closed form found for this integral')
        return _answer(r, constant=True)
    if len(rest) == 2:
        a, b = rest
        r = integrate(expr, (v, a, b))
        if r.has(Integral) or r.has(Piecewise):
            n = Integral(expr, (v, a, b)).evalf(15)
            if not n.is_number or n.has(Integral):
                raise CasError("Couldn't calculate this integral")
            return {'expr': T(n), 'numeric': True}
        return _answer(r)
    raise CasError('Write integrate(f, x) or integrate(f, x, a, b)')


def _rule_tree(rule, budget):
    """SymPy's integral_steps record as JSON: the method, the integrand, the result, and the parts it used."""
    import dataclasses
    budget[0] -= 1
    if budget[0] < 0:
        raise CasError('These steps are too long to show')
    out = {'rule': type(rule).__name__, 'integrand': T(rule.integrand)}
    try:
        out['result'] = T(rule.eval())
    except Exception:
        pass
    parts = []
    for f in dataclasses.fields(rule):
        if f.name in ('integrand', 'variable'):
            continue
        val = getattr(rule, f.name)
        if hasattr(val, 'integrand') and hasattr(val, 'eval'):
            parts.append(_rule_tree(val, budget))
        elif isinstance(val, (list, tuple)) and val and all(hasattr(x, 'eval') for x in val):
            parts.extend(_rule_tree(x, budget) for x in val)
        elif isinstance(val, Basic):
            out[f.name] = T(val)
        elif isinstance(val, (int, str)) and not isinstance(val, bool):
            out[f.name] = str(val)
    if parts:
        out['parts'] = parts
    return out


def op_integral_steps(args, cplx):
    from sympy.integrals.manualintegrate import integral_steps
    expr, v, rest = _split_var(args, 'integrate')
    rule = integral_steps(expr, v)
    if type(rule).__name__ == 'DontKnowRule' or _unknown(rule):
        raise CasError('No step-by-step method found for this integral')
    # SymPy's substitution variable is a dummy named _u; students write u
    tree = json.loads(_rx.sub(r'(?<![\w])_u(?![\w])', 'u', json.dumps(_rule_tree(rule, [200]))))
    out = {'steps': tree, 'var': T(v)}
    if len(rest) == 2:
        out['bounds'] = [T(rest[0]), T(rest[1])]
    return out


def _unknown(rule):
    """a DontKnowRule anywhere inside"""
    import dataclasses
    if type(rule).__name__ == 'DontKnowRule':
        return True
    for f in dataclasses.fields(rule):
        val = getattr(rule, f.name)
        if hasattr(val, 'integrand') and hasattr(val, 'eval') and _unknown(val):
            return True
        if isinstance(val, (list, tuple)) and any(hasattr(x, 'eval') and _unknown(x) for x in val):
            return True
    return False


def op_limit(args, cplx):
    if len(args) == 2:
        expr, a = args
        v = _var(expr, 'limit')
    elif len(args) == 3:
        expr, v, a = args
        v = _var(expr, 'limit', v)
    else:
        raise CasError('Write limit(f, x, a)')
    if a in (oo, -oo):
        r = limit(expr, v, a)
    else:
        left, right = limit(expr, v, a, '-'), limit(expr, v, a, '+')
        if left != right:
            raise CasError('The limit does not exist: from the left it is ' + T(left) + ', from the right ' + T(right))
        r = left
    if isinstance(r, AccumBounds) or r.has(AccumBounds):
        raise CasError("The limit does not exist (the values keep oscillating)")
    return _answer(r)


def op_taylor(args, cplx):
    expr, v, rest = _split_var(args, 'taylor')
    a = rest[0] if len(rest) >= 1 else Integer(0)
    n = _whole(rest[1], 'taylor', 0) if len(rest) >= 2 else 5
    return _answer(series(expr, v, a, n + 1).removeO())


def op_factor(args, cplx):
    if len(args) != 1:
        raise CasError('factor takes one expression')
    e = args[0]
    if getattr(e, 'is_Integer', False) and abs(e) > 1:
        parts = [Pow(p, k, evaluate=False) if k > 1 else p for p, k in sorted(factorint(abs(e)).items())]
        out = Mul(*parts, evaluate=False) if len(parts) > 1 else parts[0]
        return {'expr': ('-' if e < 0 else '') + T(out)}
    if cplx:
        try:
            return _answer(factor(e, gaussian=True))
        except Exception:
            pass
    return _answer(factor(e))


def op_expand(args, cplx):
    if len(args) != 1:
        raise CasError('expand takes one expression')
    return _answer(expand(args[0]))


def op_simplify(args, cplx):
    if len(args) != 1:
        raise CasError('simplify takes one expression')
    return _answer(simplify(args[0]))


def op_apart(args, cplx):
    expr, v, rest = _split_var(args, 'apart')
    return _answer(apart(expr, v))


def _sort_key(e):
    try:
        return (0, float(re(e)), float(im(e)))
    except Exception:
        return (1, 0.0, 0.0)


def _set_text(s, v):
    V = T(v)
    if isinstance(s, FiniteSet):
        return ' or '.join(V + ' = ' + T(e) for e in sorted(s, key=_sort_key))
    if isinstance(s, Interval):
        a, b = s.start, s.end
        lo = '<' if s.left_open else '≤'
        hi = '<' if s.right_open else '≤'
        if a == -oo:
            return V + ' ' + hi + ' ' + T(b)
        if b == oo:
            return V + (' > ' if s.left_open else ' ≥ ') + T(a)
        return T(a) + ' ' + lo + ' ' + V + ' ' + hi + ' ' + T(b)
    if isinstance(s, Union):
        return ' or '.join(_set_text(part, v) for part in s.args)
    if isinstance(s, Complement) and s.args[0] in (S.Reals, S.Complexes) and isinstance(s.args[1], FiniteSet):
        return ' and '.join(V + ' ≠ ' + T(e) for e in sorted(s.args[1], key=_sort_key))
    raise CasError("Couldn't describe the solutions")


def _numeric_roots(f, v):
    roots = []
    for k in range(41):
        guess = -10 + 0.5 * k
        try:
            r = complex(nsolve(f, v, guess, prec=15))
        except Exception:
            continue
        if abs(r.imag) > 1e-9 or abs(r.real) > 1e6:
            continue
        x = r.real
        if all(abs(x - q) > 1e-7 * max(1.0, abs(x)) for q in roots):
            roots.append(x)
    return sorted(roots)


def _solve_one(eq, v, cplx):
    V = T(v)
    if eq.rel_op == '!=':
        # x ≠ a: every real number except where the two sides are equal
        same = solveset(Eq(eq.lhs, eq.rhs), v, S.Reals)
        if same is S.EmptySet:
            return {'special': 'all', 'display': ''}
        if same == S.Reals:
            return {'special': 'none', 'display': ''}
        if isinstance(same, FiniteSet):
            return {'display': ' and '.join(V + ' ≠ ' + T(e) for e in sorted(same, key=_sort_key))}
        return {'display': _set_text(solveset(eq, v, S.Reals), v)}
    if eq.rel_op != '==':
        s = solveset(eq, v, S.Reals)
        if s is S.EmptySet:
            return {'special': 'none', 'display': ''}
        if s == S.Reals:
            return {'special': 'all', 'display': ''}
        return {'display': _set_text(s, v)}

    domain = S.Complexes if cplx else S.Reals
    s = solveset(eq, v, domain)
    if s is S.EmptySet:
        return {'special': 'none', 'display': '', 'expr': '[]'}
    if s == domain:
        return {'special': 'all', 'display': ''}
    if isinstance(s, FiniteSet):
        items = sorted((simplify(e) for e in s), key=_sort_key)
        return {'expr': '[' + ', '.join(T(e) for e in items) + ']',
                'display': ', '.join(V + ' = ' + T(e) for e in items)}
    parts = s.args if isinstance(s, Union) else (s,)
    if all(isinstance(p, (ImageSet, FiniteSet)) for p in parts) and any(isinstance(p, ImageSet) for p in parts):
        n = Symbol('n', integer=True)
        out = []
        for p in parts:
            if isinstance(p, ImageSet):
                out.append(V + ' = ' + T(expand(simplify(p.lamda.expr.subs(p.lamda.variables[0], n)))))
            else:
                out.extend(V + ' = ' + T(e) for e in sorted(p, key=_sort_key))
        return {'display': ', '.join(out), 'periodic': True}
    if isinstance(s, (Interval, Union, Complement)):
        return {'display': _set_text(s, v)}

    # no exact answer: look for real roots numerically
    roots = _numeric_roots(eq.lhs - eq.rhs, v)
    if not roots:
        raise CasError("Couldn't solve this exactly, and found no real solution numerically")
    texts = [T(Float(r, 12)) for r in roots]
    return {'expr': '[' + ', '.join(texts) + ']',
            'display': ', '.join(V + ' ≈ ' + t for t in texts), 'numeric': True}


def op_solve(args, cplx):
    eqs, given = [], []
    for a in args:
        if isinstance(a, Symbol) and eqs:
            given.append(a)
        else:
            eqs.append(a)
    if not eqs:
        raise CasError('solve needs an equation, like solve(x^2 = 4, x)')
    eqs = [e if isinstance(e, (Relational, BooleanAtom)) else Eq(e, 0) for e in eqs]
    # with real symbols SymPy already knows some answers: x^2 = -1 is simply False
    if any(e is S.false for e in eqs):
        return {'special': 'none', 'display': '', 'expr': '[]'}
    eqs = [e for e in eqs if e is not S.true]
    if not eqs:
        return {'special': 'all', 'display': ''}
    names = sorted(set().union(*[e.free_symbols for e in eqs]), key=str)
    vars_ = given or names
    if not vars_:
        raise CasError('There is nothing to solve for')
    if len(eqs) == 1 and len(vars_) == 1:
        return _solve_one(eqs[0], vars_[0], cplx)
    if any(e.rel_op != '==' for e in eqs):
        raise CasError('Systems of inequalities are not supported yet')
    sols = solve(eqs, vars_, dict=True)
    if not cplx:
        sols = [d for d in sols if all(val.is_real is not False for val in d.values())]
    if not sols:
        return {'special': 'none', 'display': ''}
    shown = [', '.join(T(k) + ' = ' + T(d[k]) for k in vars_ if k in d) for d in sols]
    return {'display': ' or '.join(shown)}


def op_eigenvals(args, cplx):
    m = args[0] if len(args) == 1 else None
    if not isinstance(m, MatrixBase) or not m.is_square:
        raise CasError('eigenvals needs a square matrix')
    vals = []
    for val, mult in m.eigenvals().items():
        vals += [val] * mult
    if not cplx and any(v.is_real is False for v in vals):
        raise CasError('Some eigenvalues are complex: turn on complex mode to see them')
    vals.sort(key=_sort_key)
    return {'expr': '[' + ', '.join(T(v) for v in vals) + ']'}


_OPS = {'diff': op_diff, 'integrate': op_integrate, 'limit': op_limit, 'taylor': op_taylor,
        'factor': op_factor, 'expand': op_expand, 'simplify': op_simplify, 'apart': op_apart,
        'solve': op_solve, 'eigenvals': op_eigenvals, 'integral_steps': op_integral_steps}


def run(op, sources_json, cplx):
    try:
        ns = _NS[not cplx]
        args = [eval(src, ns) for src in json.loads(sources_json)]
        out = _OPS[op](args, bool(cplx))
        out['ok'] = True
        return json.dumps(out)
    except CasError as e:
        return json.dumps({'ok': False, 'error': str(e)})
    except NotImplementedError:
        return json.dumps({'ok': False, 'error': "The symbolic engine can't do this one yet"})
    except Exception as e:
        return json.dumps({'ok': False, 'error': 'Symbolic engine error: ' + type(e).__name__ + ': ' + str(e)})
`;
