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
  infty: '\\infty',
  '<=': '\\le',
  '>=': '\\ge',
  '*': '\\cdot',
};

/** Typeset LaTeX as static markup (results, history, the reference). */
export function texMarkup(latex: string): string {
  return convertLatexToMarkup(latex, { defaultMode: 'math' });
}

export { MathfieldElement };
