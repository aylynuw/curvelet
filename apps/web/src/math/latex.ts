import {
  FUNCTIONS,
  GEOMETRY_FUNCTIONS,
  PARENLESS_FUNCS,
  SPECIAL_FORMS,
  STATS_FUNCTIONS,
  SYMBOLIC_OPS,
  tokenize,
  type Token,
} from '@math/engine';
import { ACCENTS, BLACKBOARD, CHAR_LATEX, SYMBOL_CHARS, SYMBOL_CHAR_RE } from './symbols';

/**
 * The calculator keeps each line as plain text (`let f(x) = x^2/3`); the
 * editor shows and edits it as typeset math (LaTeX in a MathLive field).
 * These two functions convert between them. Round trips keep the meaning,
 * not always the spelling: `x^(1/3)` comes back as `x^(1/3)`, `(1/2)x` as `1/2x`.
 */

const GREEK = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu',
  'xi', 'omicron', 'rho', 'sigma', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega', 'varkappa', 'varpi', 'varrho', 'varsigma',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
];
const GREEK_CHAR: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι',
  kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', rho: 'ρ', sigma: 'σ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ',
  psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  varkappa: 'ϰ', varpi: 'ϖ', varrho: 'ϱ', varsigma: 'ς', Pi: 'Π', Upsilon: 'Υ',
};
const CHAR_GREEK: Record<string, string> = Object.fromEntries(Object.entries(GREEK_CHAR).map(([k, v]) => [v, k]));

/** Names written upright, as words: functions, commands and the two keywords. */
export const KNOWN_NAMES: string[] = [
  ...new Set([
    ...Object.keys(FUNCTIONS),
    ...Object.keys(STATS_FUNCTIONS),
    ...Object.keys(GEOMETRY_FUNCTIONS),
    ...SYMBOLIC_OPS,
    ...SPECIAL_FORMS,
    ...PARENLESS_FUNCS,
    'let', 'const', 'mod', 'nCr', 'nPr', 'gcd', 'lcm', 'ans',
  ]),
].filter((n) => n.length > 1 && /^[a-zA-Z]+$/.test(n));
const KNOWN = new Set(KNOWN_NAMES);

/** LaTeX's own operator commands, which MathLive writes for these names. */
const LATEX_OPERATORS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'coth', 'arcsin', 'arccos', 'arctan', 'ln', 'log', 'exp',
  'det', 'gcd', 'min', 'max', 'lim', 'arg', 'deg', 'dim', 'ker', 'Pr', 'sup', 'inf', 'lg', 'mod', 'bmod',
]);

// ---------------------------------------------------------------- text → LaTeX

function nameTex(name: string): string {
  if (CHAR_LATEX[name]) return `${CHAR_LATEX[name]} `;
  if (name === 'pi') return '\\pi';
  if (name === 'tau') return '\\tau';
  if (name === 'inf') return '\\infty';
  if (GREEK.includes(name)) return `\\${name}`;
  if (CHAR_GREEK[name]) return `\\${CHAR_GREEK[name]}`;
  if (KNOWN.has(name)) return `\\operatorname{${name}}`;
  // x_1, a_n: a subscript
  const sub = /^([\p{L}][\p{L}\p{N}]*)_([\p{L}\p{N}_]+)$/u.exec(name);
  if (sub) return `${nameTex(sub[1]!)}_{${sub[2]!.replace(/_/g, '\\_')}}`;
  if ([...name].length === 1) return name;
  // a longer name of the user's own, as typed
  return `\\mathrm{${name}}`;
}

const isWord = (t: Token | undefined) => t?.type === 'ident' || t?.type === 'num';

const D = '\\mathrm{d}';
const paren = (tex: string) => `\\left(${tex}\\right)`;
/** a plain variable name, as an argument like the x in diff(f, x) */
const isVar = (tex: string | undefined) => !!tex && /^(?:[a-zA-Z]|\\[a-zA-Z]+)$/.test(tex);

/**
 * Calls shown in textbook form. Each gets its arguments as LaTeX (and the
 * tokens from its opening bracket) and returns null to fall back to f(a, b).
 */
const TYPESET: Record<string, (args: string[], rest: Token[]) => string | null> = {
  integrate: ([f, x, a, b]) => {
    if (!f || !isVar(x)) return null;
    if (a !== undefined && b !== undefined) return `\\int_{${a}}^{${b}}${f}\\,${D}${x}`;
    return a === undefined ? `\\int ${f}\\,${D}${x}` : null;
  },
  diff: ([f, x, n]) => {
    if (!f) return null;
    const v = x ?? 'x';
    if (!isVar(v)) return null;
    if (n === undefined) return `\\frac{${D}}{${D}${v}}${paren(f)}`;
    return /^\d+$/.test(n) ? `\\frac{${D}^{${n}}}{${D}${v}^{${n}}}${paren(f)}` : null;
  },
  limit: ([f, x, a, ...more]) => (f && isVar(x) && a !== undefined && more.length === 0 ? `\\lim_{${x}\\to ${a}}${paren(f)}` : null),
  nCr: ([n, r, ...more]) => (n !== undefined && r !== undefined && more.length === 0 ? `\\binom{${n}}{${r}}` : null),
  root: ([x, n, ...more]) => (x !== undefined && n !== undefined && more.length === 0 ? `\\sqrt[${n}]{${x}}` : null),
  // sum(seq(f, n, a, b)) is Σ; sum of a list stays sum([…])
  ...Object.fromEntries(ACCENTS.map((a) => [a, ([x, ...more]: string[]) => (x !== undefined && !more.length ? `\\${a}{${x}}` : null)])),
  sum: (args, rest) => bigOperator('\\sum', args, rest),
  prod: (args, rest) => bigOperator('\\prod', args, rest),
};

/** sum(seq(f, n, a, b)) as Σ, prod(seq(…)) as Π; a list's sum stays sum([…]) */
function bigOperator(op: string, args: string[], rest: Token[]): string | null {
  if (args.length !== 1 || rest[1]?.value !== 'seq') return null;
  const m = /^\\operatorname\{seq\}\((.*)\)$/s.exec(args[0]!);
  if (!m) return null;
  const inner = splitTop(m[1]!);
  if (inner.length !== 4 || !isVar(inner[1])) return null;
  const [f, n, a, b] = inner as [string, string, string, string];
  return `${op}_{${n}=${a}}^{${b}}${paren(f)}`;
}

/** a,b,c at the top level of a LaTeX string (not inside braces or brackets) */
function splitTop(tex: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let k = 0; k < tex.length; k++) {
    const c = tex[k]!;
    if (c === '\\') {
      k++;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(tex.slice(start, k));
      start = k + 1;
    }
  }
  out.push(tex.slice(start));
  return out;
}

/** Plain text of a line → LaTeX for the editor. Text the lexer can't read is kept as text. */
/**
 * The rows of a cases block as text: {x < 0: -x, x >= 0: x^2}. A condition may be written
 * x < 0, (x < 0), if x < 0, x < 0일 때; an empty one (or otherwise, else, 그 외) is everywhere else.
 */
function casesText(inner: string): string {
  const branches: string[] = [];
  let fallback: string | null = null;
  for (const row of inner.split(/\\\\/)) {
    const [rawValue = '', rawCond = ''] = row.split('&');
    const value = latexToText(rawValue).trim();
    if (!value) continue;
    let cond = latexToText(rawCond.replace(/\\(?:text|mathrm|operatorname)\{\s*(?:if|when|for)\s*\}/g, ''))
      .trim()
      .replace(/^(?:if|when|for)\s+/i, '')
      .replace(/\s*(?:일\s*때|인\s*경우)\s*$/u, '')
      .trim();
    if (/^\(.*\)$/.test(cond)) cond = cond.slice(1, -1).trim();
    if (!cond || /^(?:otherwise|else|그\s*외|나머지)$/iu.test(cond)) fallback = value;
    else branches.push(`${cond}: ${value}`);
  }
  if (fallback !== null) branches.push(fallback);
  return `{${branches.join(', ')}}`;
}

export function textToLatex(text: string, { display = false }: { display?: boolean } = {}): string {
  let tokens: Token[];
  try {
    tokens = tokenize(text);
  } catch {
    // ≈, ∈, → and the like: each piece between them converted on its own, the symbols as their commands
    if (SYMBOL_CHAR_RE.test(text)) {
      return text
        .split(SYMBOL_CHAR_RE)
        .map((part) => (CHAR_LATEX[part] ? `${CHAR_LATEX[part]} ` : part.trim() ? textToLatex(part, { display }) : ''))
        .join('')
        .trim();
    }
    return `\\text{${text.replace(/[\\{}$&#^_%~]/g, (c) => `\\${c}`)}}`;
  }
  let i = 0;
  const peek = () => tokens[i]!;
  const isOp = (v: string) => peek().type === 'op' && peek().value === v;

  /** An atom, with what binds to it after: ^, !, primes, a call's brackets. */
  const atom = (): string | null => {
    const t = peek();
    if (t.type === 'eof') return null;
    if (t.type === 'num') {
      i++;
      return postfix(t.value);
    }
    if (t.type === 'ident') {
      i++;
      const typeset = TYPESET[t.value];
      if (typeset && isOp('(')) {
        const at = i;
        const args = callArgs();
        const tex = typeset(args, tokens.slice(at));
        if (tex !== null) return postfix(tex);
        i = at;
      }
      // sqrt(x) and cbrt(x) as radicals
      if ((t.value === 'sqrt' || t.value === 'cbrt') && isOp('(')) {
        const inner = group('(', ')', true);
        return postfix(t.value === 'sqrt' ? `\\sqrt{${inner}}` : `\\sqrt[3]{${inner}}`);
      }
      let tex = nameTex(t.value);
      while (isOp("'")) {
        i++;
        tex += "'";
      }
      if (isOp('(')) tex += group('(', ')');
      return postfix(tex);
    }
    if (t.value === '(') return postfix(group('(', ')'));
    if (t.value === '[' && tokens[i + 1]?.value === '[') {
      const m = matrixRows();
      if (m) return postfix(m);
    }
    if (t.value === '[') return postfix(group('[', ']'));
    if (t.value === '{') {
      const cases = casesTex();
      if (cases) return postfix(cases);
      return postfix(group('{', '}'));
    }
    if (t.value === '|') {
      i++;
      const inner = seq(['|']);
      if (isOp('|')) i++;
      return postfix(`\\left|${inner}\\right|`);
    }
    if (t.value === '-' || t.value === '+') {
      i++;
      const a = atom();
      return `${t.value}${a ?? ''}`;
    }
    return null;
  };

  /** {cond: value, …, otherwise} as \begin{cases}value & (cond)\\…\end{cases}, or null when the braces hold no : */
  const casesTex = (): string | null => {
    // a colon at the top level of these braces makes them cases
    let depth = 0;
    let colon = false;
    for (let k = i; k < tokens.length; k++) {
      const v = tokens[k]!;
      if (v.type === 'eof') break;
      if (v.type !== 'op') continue;
      if (v.value === '(' || v.value === '[' || v.value === '{') depth++;
      else if (v.value === ')' || v.value === ']' || v.value === '}') {
        depth--;
        if (depth === 0) break;
      } else if (depth === 1 && v.value === ':') colon = true;
    }
    if (!colon) return null;
    i++; // {
    const rows: string[] = [];
    for (;;) {
      const first = seq([':', ',', ';', '}']);
      if (isOp(':')) {
        i++;
        const value = seq([',', ';', '}']);
        rows.push(`${value}&(${first})`);
      } else if (first.trim()) rows.push(`${first}&`);
      if (isOp(',') || isOp(';')) {
        i++;
        continue;
      }
      if (isOp('}')) i++;
      break;
    }
    return `\\begin{cases}${rows.join('\\\\')}\\end{cases}`;
  };

  /** f(a, b, c) → each argument as LaTeX, the brackets consumed */
  const callArgs = (): string[] => {
    i++; // (
    const args: string[] = [];
    for (;;) {
      args.push(seq([',', ')']));
      if (isOp(',')) {
        i++;
        continue;
      }
      if (isOp(')')) i++;
      return args;
    }
  };

  // plain brackets: \left( would add TeX's space in f(x)
  const LEFT: Record<string, string> = { '(': '(', '[': '\\lbrack ', '{': '\\lbrace ' };
  const RIGHT: Record<string, string> = { ')': ')', ']': '\\rbrack ', '}': '\\rbrace ' };
  /** ( … ), or bare contents for a radical or an exponent. */
  const group = (open: string, close: string, bare = false): string => {
    // a bracket straight after "(" or "," (a point inside a call: bezier((1, 2), …)) is written
    // \left( … \right), or MathLive merges the two "((" and drops the inner pair
    const before = tokens[i - 1];
    const nested = open === '(' && before?.type === 'op' && (before.value === '(' || before.value === ',');
    i++; // open
    const inner = seq([close]);
    if (isOp(close)) i++;
    if (bare) return inner;
    return nested ? `\\left(${inner}\\right)` : `${LEFT[open]}${inner}${RIGHT[close]}`;
  };

  /** [[1, 2], [3, 4]] as a matrix, or null (cursor unmoved) when it isn't a list of lists */
  const matrixRows = (): string | null => {
    const at = i;
    i++; // outer [
    const rows: string[][] = [];
    while (isOp('[')) {
      i++;
      const cells: string[] = [];
      for (;;) {
        cells.push(seq([',', ']']));
        if (isOp(',')) {
          i++;
          continue;
        }
        break;
      }
      if (!isOp(']')) break;
      i++;
      rows.push(cells);
      if (isOp(',')) i++;
    }
    if (!isOp(']') || rows.length === 0) {
      i = at;
      return null;
    }
    i++;
    return `\\begin{pmatrix}${rows.map((r) => r.join('&')).join('\\\\')}\\end{pmatrix}`;
  };

  /** The operand of ^ or a denominator: one atom, brackets dropped. */
  const operand = (): string => {
    if (isOp('(')) {
      const inner = group('(', ')', true);
      return postfix(inner, true);
    }
    if (isOp('-')) {
      i++;
      return `-${operand()}`;
    }
    const t = peek();
    if (t.type === 'num' || t.type === 'ident') {
      i++;
      // a power's exponent: x^n, e^x, x^2 (not x^2y, which is (x^2)y)
      let tex = t.type === 'ident' ? nameTex(t.value) : t.value;
      if (t.type === 'ident' && isOp('(')) tex += group('(', ')');
      return tex;
    }
    return atom() ?? '';
  };

  const postfix = (base: string, bare = false): string => {
    let tex = base;
    for (;;) {
      if (isOp('^')) {
        i++;
        tex = `${bare ? `(${tex})` : tex}^{${operand()}}`;
        bare = false;
      } else if (isOp('!')) {
        i++;
        tex += '!';
      } else if (isOp('°')) {
        i++;
        tex += '^{\\circ}';
      } else return tex;
    }
  };

  const REL: Record<string, string> = { '<=': '\\le ', '>=': '\\ge ', '!=': '\\ne ', '<': '<', '>': '>', '=': '=' };
  /** A run of atoms and operators up to one of `stops`. */
  const seq = (stops: string[]): string => {
    const parts: string[] = [];
    let prev: Token | undefined;
    while (peek().type !== 'eof' && !(peek().type === 'op' && stops.includes(peek().value))) {
      const t = peek();
      if (t.type === 'op' && t.value === '/') {
        i++;
        const num = parts.pop() ?? '';
        // (a + b)/c: the numerator's brackets go, the bar groups it
        const wrapped = num.startsWith('(') && closesAtEnd(num);
        // −1/2 is −½: the sign goes in front of the bar
        const sign = !wrapped && /^-[^-+]/.test(num) ? '-' : '';
        const top = wrapped ? num.slice(1, -1) : sign ? num.slice(1) : num;
        parts.push(`${sign}\\frac{${top}}{${operand()}}`);
        prev = tokens[i - 1];
        continue;
      }
      if (t.type === 'op' && t.value === '*') {
        i++;
        // shown, not edited: 3x²·sin(x) reads as 3x² sin(x); 2·3 keeps its dot
        const after = peek();
        const quiet = display && (prev?.type === 'ident' || prev?.type === 'num' || prev?.value === ')') && (after.type === 'ident' || after.value === '(') && !(prev?.type === 'num' && after.type === 'num');
        parts.push(quiet ? '\\,' : '\\cdot ');
        prev = t;
        continue;
      }
      if (t.type === 'op' && (REL[t.value] !== undefined || t.value === ',' || (t.value === '-' && isWord(prev)) || (t.value === '+' && isWord(prev)))) {
        i++;
        parts.push(REL[t.value] ?? t.value);
        prev = t;
        continue;
      }
      if (t.type === 'op' && (t.value === '-' || t.value === '+') && prev?.type === 'op' && [')', ']', '}', '|', '!', "'"].includes(prev.value)) {
        i++;
        parts.push(t.value);
        prev = t;
        continue;
      }
      const before = i;
      const a = atom();
      if (a === null || i === before) {
        // a stray closer or operator: keep it
        i++;
        parts.push(t.value === '}' ? '\\}' : t.value === '{' ? '\\{' : t.value);
        prev = t;
        continue;
      }
      // two words written apart stay apart: let a, a sin x
      const last = tokens[before - 1];
      if (isWord(t) && isWord(last) && last!.pos + last!.value.length < t.pos) parts.push('\\:');
      parts.push(a);
      prev = tokens[i - 1];
    }
    return parts.join('');
  };

  const out = seq([]);
  // a stray closer at the top level was kept by seq; anything left is dropped
  return out;
}

/** (…) whose first bracket closes at the very end, so it can be dropped */
function closesAtEnd(s: string): boolean {
  let depth = 0;
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '(') depth++;
    else if (s[k] === ')' && --depth === 0) return k === s.length - 1;
  }
  return false;
}

// ---------------------------------------------------------------- LaTeX → text

type Piece = { text: string; kind: 'word' | 'cmd' | 'pow' | 'frac' | 'open' | 'close' | 'op' | 'space' };

const OPEN: Record<string, string> = { '(': '(', '[': '[', '\\lbrack': '[', '\\{': '{', '\\lbrace': '{', '|': '|', '\\vert': '|', '\\lvert': '|', '\\|': '|', '.': '' };
const CLOSE: Record<string, string> = { ')': ')', ']': ']', '\\rbrack': ']', '\\}': '}', '\\rbrace': '}', '|': '|', '\\vert': '|', '\\rvert': '|', '\\|': '|', '.': '' };
const SYMBOL: Record<string, string> = {
  '\\cdot': '*', '\\times': '*', '\\ast': '*', '\\div': '/',
  '\\le': '<=', '\\leq': '<=', '\\leqslant': '<=', '\\ge': '>=', '\\geq': '>=', '\\geqslant': '>=',
  '\\lt': '<', '\\gt': '>', '\\ne': '≠', '\\neq': '≠',
  '\\lbrack': '[', '\\rbrack': ']', '\\lbrace': '{', '\\rbrace': '}', '\\{': '{', '\\}': '}', '\\vert': '|', '\\lvert': '|', '\\rvert': '|', '\\mid': '|',
  '\\prime': "'", '\\%': '%', '\\_': '_',
};
const SPACES = new Set(['\\:', '\\,', '\\;', '\\ ', '~', '\\quad', '\\qquad', '\\>', '\\!']);
const WORD_CMD: Record<string, string> = { '\\pi': 'pi', '\\tau': 'tau', '\\infty': 'inf', '\\exponentialE': 'e', '\\imaginaryI': 'i', '\\differentialD': 'd' };

const OPENERS = new Set(['{', '\\left', '\\begin', '(', '[', '\\lbrack', '\\{', '\\lbrace']);
const CLOSERS = new Set(['}', '\\right', '\\end', ')', ']', '\\rbrack', '\\}', '\\rbrace']);

class LatexReader {
  i = 0;
  constructor(private s: string) {}
  done() {
    return this.i >= this.s.length;
  }
  /** One token: a command, an escaped character, or a character. Whitespace is skipped. */
  next(): string {
    while (/\s/.test(this.s[this.i] ?? '')) this.i++;
    const c = this.s[this.i];
    if (c === undefined) return '';
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|.)/s.exec(this.s.slice(this.i))!;
      this.i += m[0].length;
      return m[0];
    }
    this.i++;
    return c;
  }
  peek(): string {
    const at = this.i;
    const t = this.next();
    this.i = at;
    return t;
  }
  /** The contents of {…}, or one token. */
  arg(): string {
    if (this.peek() === '{') {
      this.next();
      const start = this.i;
      let depth = 1;
      while (this.i < this.s.length) {
        const t = this.next();
        if (t === '{') depth++;
        else if (t === '}' && --depth === 0) return this.s.slice(start, this.i - 1);
      }
      return this.s.slice(start);
    }
    return this.next();
  }
  /** _{…} and ^{…} after \int, \sum, \lim, in either order */
  limits(): { sub?: string; sup?: string } {
    const out: { sub?: string; sup?: string } = {};
    for (;;) {
      const p = this.peek();
      if (p === '_' && out.sub === undefined) {
        this.next();
        out.sub = this.arg();
      } else if (p === '^' && out.sup === undefined) {
        this.next();
        out.sup = this.arg();
      } else if (p === '\\limits' || p === '\\nolimits') this.next();
      else return out;
    }
  }
  /**
   * What an operator like d/dx, lim or Σ applies to: a \left( … \right) group,
   * or else everything up to a top-level relation or comma.
   */
  body(): string {
    if (this.peek() === '\\left') {
      const at = this.i;
      this.next();
      const open = this.next();
      if (open === '(') {
        const start = this.i;
        let depth = 1;
        while (!this.done()) {
          const before = this.i;
          const t = this.next();
          if (t === '\\left') depth++;
          else if (t === '\\right' && --depth === 0) {
            const inner = this.s.slice(start, before);
            this.next(); // the closing delimiter
            return inner;
          }
        }
      }
      this.i = at;
    }
    return this.until(['=', '<', '>', ',', '\\le', '\\ge', '\\leq', '\\geq', '\\ne', '\\neq', '\\lt', '\\gt']);
  }
  /** raw LaTeX up to one of `stops` at depth 0 (not consumed) */
  until(stops: string[]): string {
    const start = this.i;
    let depth = 0;
    while (!this.done()) {
      const at = this.i;
      const t = this.next();
      if (depth === 0 && stops.includes(t)) {
        this.i = at;
        return this.s.slice(start, at);
      }
      // every kind of bracket nests: a comma inside [1, 2, 3] or f(a, b) doesn't end the body
      if (OPENERS.has(t)) depth++;
      else if (CLOSERS.has(t)) depth--;
    }
    return this.s.slice(start);
  }
  /** [n] after \sqrt */
  optional(): string | null {
    if (this.peek() !== '[') return null;
    this.next();
    const start = this.i;
    while (this.i < this.s.length && this.s[this.i] !== ']') this.i++;
    const inner = this.s.slice(start, this.i);
    this.i++;
    return inner;
  }
}

/** One token or a plain name: needs no brackets around it in ^ or a fraction. */
const simple = (t: string) => /^(?:[\p{L}][\p{L}\p{N}_]*'*|\d+(?:\.\d+)?|\.\d+)$/u.test(t) || /^[\p{L}][\p{L}\p{N}_]*'*\([^()]*\)$/u.test(t);

function convert(latex: string): Piece[] {
  // an empty box in a template is nothing yet
  const r = new LatexReader(latex.replace(/\\placeholder(?:\[[^\]]*\])?\{[^{}]*\}/g, ''));
  const pieces: Piece[] = [];
  const push = (text: string, kind: Piece['kind']) => pieces.push({ text, kind });
  while (!r.done()) {
    const t = r.next();
    if (t === '') break;
    if (t === '{' || t === '}') continue; // stray grouping braces
    if (t === '\\int') {
      const { sub, sup } = r.limits();
      // the body runs to its differential: \,dx, \mathrm{d}x, \differentialD x
      const rest = r.until([]);
      // an upright d (\mathrm{d}x), the last one for the outermost integral; else a plain dx at the end
      const upright = [...rest.matchAll(/(?:\\[,:;!]|\s)*(?:\\mathrm\{d\}|\\differentialD|\\operatorname\{d\})\s*([a-zA-Z])/g)].pop();
      const m = upright
        ? [rest, rest.slice(0, upright.index), upright[1]!, rest.slice(upright.index! + upright[0].length)]
        : /^(.*?)(?:\\[,:;!]|\s)*d\s*([a-zA-Z])\s*$()/s.exec(rest);
      if (m) {
        const v = m[2]!;
        // ∫ with its bound boxes still empty is an indefinite integral
        const bounds = sub?.trim() && sup?.trim() ? `, ${toText(sub)}, ${toText(sup)}` : '';
        push(`integrate(${toText(m[1]!)}, ${v}${bounds})`, 'cmd');
        pieces.push(...convert(m[3]!));
      } else push(`integrate(${toText(rest)}, x)`, 'cmd');
      continue;
    }
    if (t === '\\lim') {
      const { sub } = r.limits();
      const m = /^\s*([a-zA-Z]|\\[a-zA-Z]+)\s*(?:\\to|\\rightarrow|\\longrightarrow|→)\s*(.*)$/s.exec(sub ?? '');
      const body = toText(r.body());
      push(m && m[2]!.trim() ? `limit(${body}, ${toText(m[1]!)}, ${toText(m[2]!)})` : `limit(${body})`, 'cmd');
      continue;
    }
    if (t === '\\sum' || t === '\\prod') {
      const fn = t === '\\sum' ? 'sum' : 'prod';
      const { sub, sup } = r.limits();
      const m = /^\s*([a-zA-Z])\s*=\s*(.*)$/s.exec(sub ?? '');
      const body = toText(r.body());
      // Σ over a range; with the bounds still empty, the sum (or product) of a list
      push(m && m[2]!.trim() && sup?.trim() ? `${fn}(seq(${body}, ${m[1]}, ${toText(m[2]!)}, ${toText(sup)}))` : `${fn}(${body})`, 'cmd');
      continue;
    }
    if (t === '\\binom' || t === '\\dbinom' || t === '\\tbinom') {
      const n = toText(r.arg());
      const k = toText(r.arg());
      push(`nCr(${n}, ${k})`, 'cmd');
      continue;
    }
    if (t === '\\begin') {
      const env = r.arg();
      const inner = r.until(['\\end']);
      r.next();
      r.arg();
      if (/cases$/.test(env)) {
        push(casesText(inner), 'cmd');
        continue;
      }
      const rows = inner.split(/\\\\/).map((row) => row.split('&').map((c) => toText(c))).filter((row) => row.some((c) => c !== ''));
      if (/matrix$/.test(env)) push(`[${rows.map((row) => `[${row.join(', ')}]`).join(', ')}]`, 'cmd');
      else push(rows.map((row) => row.join(' ')).join(', '), 'word');
      continue;
    }
    if (t === '\\degree' || t === '°') {
      push('°', 'op');
      continue;
    }
    if (t === '\\frac' || t === '\\dfrac' || t === '\\tfrac' || t === '\\cfrac') {
      const rawN = r.arg();
      const rawD = r.arg();
      // d/dx, d²/dx²: a derivative of what follows
      const dn = /^\s*(?:\\mathrm\{d\}|\\differentialD|d)\s*(?:\^\{?(\d)\}?)?\s*$/.exec(rawN);
      const dd = /^\s*(?:\\mathrm\{d\}|\\differentialD|d)\s*([a-zA-Z])\s*(?:\^\{?(\d)\}?)?\s*$/.exec(rawD);
      if (dn && dd && (dn[1] ?? '1') === (dd[2] ?? '1')) {
        const order = dn[1] && dn[1] !== '1' ? `, ${dn[1]}` : '';
        push(`diff(${toText(r.body())}, ${dd[1]}${order})`, 'cmd');
        continue;
      }
      const n = toText(rawN);
      const d = toText(rawD);
      push(`${simple(n) ? n : `(${n})`}/${simple(d) ? d : `(${d})`}`, 'frac');
      continue;
    }
    if (t === '\\sqrt') {
      const index = r.optional();
      const inner = toText(r.arg());
      if (!index || index.trim() === '2') push(`sqrt(${inner})`, 'cmd');
      else if (index.trim() === '3') push(`cbrt(${inner})`, 'cmd');
      else push(`root(${inner}, ${toText(index)})`, 'cmd');
      continue;
    }
    if (t === '^' || t === '_') {
      const raw = r.arg();
      const inner = toText(raw);
      if (t === '^' && /^\\circ\s*$/.test(raw.trim())) {
        push('°', 'op');
        continue;
      }
      if (t === '^' && /^'+$/.test(inner.replace(/\s/g, ''))) {
        push(inner.replace(/\s/g, ''), 'word');
        continue;
      }
      if (t === '_') {
        push(`_${inner.replace(/[^\p{L}\p{N}_]/gu, '')}`, 'word');
        continue;
      }
      const last = pieces[pieces.length - 1];
      // sin^2(x): a function's power, its brackets still the call's
      const fnPower = last?.kind === 'cmd' && KNOWN.has(last.text);
      push(`^${simple(inner) ? inner : `(${inner})`}`, fnPower ? 'word' : 'pow');
      continue;
    }
    if (t === '\\left' || t === '\\bigl' || t === '\\Bigl' || t === '\\big' || t === '\\Big') {
      const d = r.next();
      push(OPEN[d] ?? d, 'open');
      continue;
    }
    if (t === '\\right' || t === '\\bigr' || t === '\\Bigr') {
      const d = r.next();
      push(CLOSE[d] ?? d, 'close');
      continue;
    }
    if (t === '\\operatorname' || t === '\\mathrm' || t === '\\text' || t === '\\textrm' || t === '\\mathit' || t === '\\mathbf' || t === '\\textit' || t === '\\mathsf') {
      const raw = r.arg();
      // \operatorname{\mathrm{sin}}: MathLive nests them
      const inner = t.startsWith('\\text') ? raw.replace(/\\_/g, '_').replace(/\\([{}$&#%~^])/g, '$1') : toText(raw).replace(/\s+/g, '');
      push(inner, t === '\\mathit' ? 'word' : 'cmd');
      continue;
    }
    if (t === '\\placeholder') {
      r.optional();
      r.arg();
      continue;
    }
    if (SPACES.has(t)) {
      push(' ', 'space');
      continue;
    }
    if (WORD_CMD[t]) {
      push(WORD_CMD[t]!, 'cmd');
      continue;
    }
    if (SYMBOL[t]) {
      push(SYMBOL[t]!, 'op');
      continue;
    }
    if (t === '\\mathbb' || t === '\\Bbb') {
      const letter = r.arg().trim();
      push(BLACKBOARD[letter] ?? letter, 'cmd');
      continue;
    }
    if (t.startsWith('\\') && ACCENTS.includes(t.slice(1))) {
      push(`${t.slice(1)}(${toText(r.arg())})`, 'cmd');
      continue;
    }
    if (t.startsWith('\\') && SYMBOL_CHARS[t.slice(1)]) {
      const ch = SYMBOL_CHARS[t.slice(1)]!;
      // ℓ, ℏ, ℜ are letters to the lexer (names); ≈, ∈, → stand between things
      push(ch, /\p{L}/u.test(ch) ? 'cmd' : 'op');
      continue;
    }
    if (t.startsWith('\\')) {
      const name = t.slice(1);
      if (GREEK_CHAR[name]) push(GREEK_CHAR[name]!, 'cmd');
      else push(name, 'cmd');
      continue;
    }
    if (t === '(' || t === '[') push(t, 'open');
    else if (t === ')' || t === ']') push(t, 'close');
    else if (/[\p{L}\p{N}.']/u.test(t)) push(t, 'word');
    else push(t, 'op');
  }
  return pieces;
}

/** Joins pieces so the lexer reads back what the typeset math shows. */
function join(pieces: Piece[]): string {
  let out = '';
  let prev: Piece | null = null;
  for (const p of pieces) {
    if (p.kind === 'space') {
      if (!out.endsWith(' ')) out += ' ';
      continue;
    }
    const endsWord = /[\p{L}\p{N}_.']$/u.test(out);
    const startsWord = /^[\p{L}\p{N}]/u.test(p.text);
    if (prev && endsWord) {
      if (p.kind === 'frac' || prev.kind === 'frac' || prev.kind === 'pow') {
        // only where the text would read differently: names or numbers merging, brackets read as a call
        const merges = (/[\p{L}_']$/u.test(out) && startsWord) || (/\d$/.test(out) && /^[\d.]/.test(p.text));
        if (merges || p.text.startsWith('(')) out += '*';
      } else if (startsWord && (p.kind === 'cmd' || prev.kind === 'cmd')) {
        // a sin x, 2 pi stays 2pi; a pi needs the space
        out += /\d$/.test(out) && !/^\d/.test(p.text) ? '' : ' ';
      } else if (startsWord && /\d$/.test(out) && /^\d/.test(p.text) && prev.kind !== 'word') {
        out += '*';
      }
    } else if (prev && (prev.kind === 'close' || prev.kind === 'frac' || prev.kind === 'pow') && p.kind === 'frac') {
      out += '*';
    }
    out += p.text;
    prev = p;
  }
  return out;
}

function toText(latex: string): string {
  return join(convert(latex)).replace(/\s+/g, ' ').trim();
}

/** relations, arrows and set operators are written with a space each side, like = */
const SPACED = new Set([...'≈≡∼≃≅∝≪≫≺≻∈∉∋⊂⊃⊆⊇⊥∥→←↔⇒⇐⇔↦⟶⟵±∓∪∩∖∧∨⊕⊖⊗⊙∘⋆']);

/** Spaces around = < > and binary + −, after commas: how the worksheet has always written lines. */
function tidy(text: string): string {
  let out = '';
  let k = 0;
  const lastSig = () => out.trimEnd().slice(-1);
  while (k < text.length) {
    const two = text.slice(k, k + 2);
    if (two === '<=' || two === '>=') {
      out = `${out.trimEnd()} ${two} `;
      k += 2;
      continue;
    }
    const c = text[k]!;
    if (c === '=' || c === '<' || c === '>' || c === '≠' || SPACED.has(c)) {
      out = `${out.trimEnd()} ${c} `;
    } else if (c === ',' || c === ';') {
      out = `${out.trimEnd()}${c} `;
    } else if (c === ':') {
      // f: ℝ → ℝ, and a case's condition: its value
      out = `${out.trimEnd()}: `;
    } else if ((c === '+' || c === '-') && /[\p{L}\p{N}_.)\]|!'}]/u.test(lastSig()) && !/\d[eE]$/.test(out.trimEnd()) && !/[\^]$/.test(out.trimEnd())) {
      out = `${out.trimEnd()} ${c} `;
    } else if (c === ' ') {
      if (!out.endsWith(' ')) out += ' ';
    } else {
      out += c;
    }
    k++;
  }
  return out.replace(/\s+/g, ' ').replace(/([([{|]) /g, '$1').replace(/ ([)\]}])/g, '$1').trim();
}

/** LaTeX from the editor → the line's plain text. */
export function latexToText(latex: string): string {
  return conditionBrackets(tidy(toText(latex)));
}

/** x^2*(x >= 0): a bracket holding a condition is a case's condition, not a factor, so it loses the * */
function conditionBrackets(text: string): string {
  let out = text;
  for (let k = out.indexOf('*('); k >= 0; k = out.indexOf('*(', k + 1)) {
    let depth = 0;
    let rel = false;
    for (let j = k + 1; j < out.length; j++) {
      const c = out[j]!;
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        if (--depth === 0) break;
      } else if (depth === 1 && /[<>=≠≤≥]/.test(c)) rel = true;
    }
    if (rel) out = `${out.slice(0, k)} ${out.slice(k + 1)}`;
  }
  return out;
}
