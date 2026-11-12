import 'mathlive/fonts.css';
import 'mathlive/static.css';
import { MathfieldElement, convertLatexToMarkup } from 'mathlive';

// Everything MathLive needs ships with the app: the fonts come in through the
// CSS import above, and nothing is fetched from a CDN. No keypress sounds.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;
MathfieldElement.keypressSound = null;
MathfieldElement.plonkSound = null;

// what typing turns into lives in shortcuts.ts (pure, so it can be tested)
export { SHORTCUTS, WORD_SHORTCUTS, SHORTCUT_NAMES, FUNCTION_NAMES } from './shortcuts';

/** Typeset LaTeX as static markup (results, history, the reference). */
export function texMarkup(latex: string): string {
  return convertLatexToMarkup(latex, { defaultMode: 'math' });
}

export { MathfieldElement };
