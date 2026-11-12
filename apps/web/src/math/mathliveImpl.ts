import 'mathlive/fonts.css';
import 'mathlive/static.css';
import { MathfieldElement, convertLatexToMarkup } from 'mathlive';
import { KNOWN_NAMES } from './latex';

// Everything MathLive needs ships with the app: the fonts come in through the
// CSS import above, and nothing is fetched from a CDN. No keypress sounds.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;
MathfieldElement.keypressSound = null;
MathfieldElement.plonkSound = null;

const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega', 'pi'];

/**
 * What typing turns into: function names set upright as words, Greek letters,
 * √ and the two-character comparisons. Only these, so a name of your own is
 * never rewritten (MathLive's defaults turn "in", "or", "pm"… into symbols).
 */
export const SHORTCUTS: Record<string, string> = {
  ...Object.fromEntries(KNOWN_NAMES.filter((n) => n !== 'sqrt' && n !== 'cbrt').map((n) => [n, `\\operatorname{${n}}`])),
  ...Object.fromEntries(GREEK.map((g) => [g, `\\${g}`])),
  sqrt: '\\sqrt{#?}',
  cbrt: '\\sqrt[3]{#?}',
  nthroot: '\\sqrt[#?]{#?}',
  infty: '\\infty',
  infinity: '\\infty',
  // the big operators as Desmos and LaTeX users type them: the textbook form, a box to fill for each part
  // (int and lim are in WORD_SHORTCUTS: they begin integrate and limit)
  sum: '\\sum_{n=#?}^{#?}#?',
  prod: '\\prod_{n=#?}^{#?}#?',
  binom: '\\binom{#?}{#?}',
  '->': '\\to',
  '<=': '\\le',
  '>=': '\\ge',
  '!=': '\\ne',
  '*': '\\cdot',
};

/**
 * Shortcuts that are also the start of a longer name (int → integrate,
 * lim → limit). They wait for the next key: a letter that keeps spelling the
 * longer name types the word, anything else (or a pause) makes the symbol.
 */
export const WORD_SHORTCUTS: Record<string, string> = {
  int: '\\int_{#?}^{#?}#?\\,\\mathrm{d}x',
  lim: '\\lim_{x\\to #?}#?',
};

/** Typeset LaTeX as static markup (results, history, the reference). */
export function texMarkup(latex: string): string {
  return convertLatexToMarkup(latex, { defaultMode: 'math' });
}

export { MathfieldElement };
