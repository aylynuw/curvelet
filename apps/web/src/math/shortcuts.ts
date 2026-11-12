import { KNOWN_NAMES } from './latex';
import { ACCENTS, BLACKBOARD, SYMBOL_CHARS } from './symbols';

/** every Greek letter LaTeX has, lower and upper case and the var- forms */
export const GREEK_LETTERS = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'varkappa',
  'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi',
  'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
];

/** shortcuts with boxes to fill: the big operators and the structures */
const TEMPLATES: Record<string, string> = {
  int: '\\int_{#?}^{#?}#?\\,\\mathrm{d}x',
  sum: '\\sum_{n=#?}^{#?}#?',
  prod: '\\prod_{n=#?}^{#?}#?',
  lim: '\\lim_{x\\to #?}#?',
  frac: '\\frac{#?}{#?}',
  sqrt: '\\sqrt{#?}',
  cbrt: '\\sqrt[3]{#?}',
  nthroot: '\\sqrt[#?]{#?}',
  binom: '\\binom{#?}{#?}',
  ...Object.fromEntries(ACCENTS.map((a) => [a, `\\${a}{#?}`])),
};

/** names that are plain symbols, with no boxes */
const PLAIN: Record<string, string> = {
  ...Object.fromEntries(GREEK_LETTERS.map((g) => [g, `\\${g}`])),
  ...Object.fromEntries(Object.keys(SYMBOL_CHARS).map((s) => [s, `\\${s}`])),
  ...Object.fromEntries(Object.keys(BLACKBOARD).map((k) => [`${k}${k}`, `\\mathbb{${k}}`])),
  infty: '\\infty',
  infinity: '\\infty',
  neq: '\\ne',
  ne: '\\ne',
  leq: '\\le',
  le: '\\le',
  geq: '\\ge',
  ge: '\\ge',
  times: '\\times',
  div: '\\div',
  cdot: '\\cdot',
  degree: '^{\\circ}',
};

/**
 * Words people also use as names (a variable called total, index or angle),
 * and the shortest ones: these become symbols only when the word ends — a
 * space, a digit, an operator or a short pause — never in the middle of a
 * longer word. The rest turn into symbols as soon as they are typed.
 */
const AT_WORD_END = new Set([
  'in', 'to', 'ne', 'le', 'ge', 'll', 'gg', 'ni', 'pm', 'mp', 'Re', 'Im', 'wp', 'ell', 'top', 'bot', 'cap', 'cup', 'neg', 'sim', 'star',
  'circ', 'angle', 'square', 'triangle', 'degree', 'wedge', 'vee', 'land', 'lor', 'iff', 'gets', 'times', 'div', 'dot', 'bar', 'hat',
  'vec', 'tilde', 'parallel', 'subset', 'because', 'therefore', 'exists', 'implies', 'prec', 'succ', 'bullet', 'int', 'lim', 'sum', 'prod',
]);

/** keystroke-to-LaTeX shortcuts: what MathLive converts as soon as it is typed */
export const SHORTCUTS: Record<string, string> = {};
/** shortcuts that wait for the end of the word (see AT_WORD_END and MathInput) */
export const WORD_SHORTCUTS: Record<string, string> = {};

/** function names: set upright as they are typed, as before (MathLive extends sin into sinh by itself) */
const FUNCTIONS: Record<string, string> = Object.fromEntries(
  KNOWN_NAMES.filter((n) => !(n in TEMPLATES) && !(n in PLAIN)).map((n) => [n, `\\operatorname{${n}}`]),
);
/** names that are also functions: typed with a bracket after them (sum(, prod(), they stay the function */
export const FUNCTION_NAMES = new Set(KNOWN_NAMES);

const symbols: Record<string, string> = { ...PLAIN, ...TEMPLATES };
/** every name that has a shortcut, for telling whether a word is still growing into a longer one */
export const SHORTCUT_NAMES = [...new Set([...KNOWN_NAMES, ...Object.keys(symbols)])];

Object.assign(SHORTCUTS, FUNCTIONS);
for (const [name, latex] of Object.entries(symbols)) {
  // a name that begins a longer one (in → int, ne → neg) can only be read once the word ends
  const prefix = SHORTCUT_NAMES.some((n) => n.length > name.length && n.startsWith(name));
  if (AT_WORD_END.has(name) || prefix) WORD_SHORTCUTS[name] = latex;
  else SHORTCUTS[name] = latex;
}

// symbols typed with keys rather than letters
Object.assign(SHORTCUTS, {
  '<=': '\\le',
  '>=': '\\ge',
  '!=': '\\ne',
  '->': '\\to',
  '=>': '\\Rightarrow',
  '*': '\\cdot',
});
