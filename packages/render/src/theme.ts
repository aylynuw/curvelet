import type { Label } from './scene';

/** Colours and type for drawing a scene. The app fills this from its CSS tokens. */
export interface DrawTheme {
  /** null: transparent */
  background: string | null;
  ink: string;
  muted: string;
  gridMinor: string;
  gridMajor: string;
  /** curve colours by series slot */
  curves: string[];
  fillOpacity: number;
  font: string;
  /** serif face for exam figures' variables */
  mathFont: string;
  fontSize: number;
  curveWidth: number;
  axisWidth: number;
  /** drawn behind labels so they stay readable over curves; usually the background */
  halo?: string;
}

/** Printed exam figures: black on white, thin even lines, a serif math face. */
export const EXAM_THEME: DrawTheme = {
  background: '#ffffff',
  ink: '#000000',
  muted: '#000000',
  gridMinor: 'transparent',
  gridMajor: 'transparent',
  curves: ['#000000'],
  fillOpacity: 0.14,
  font: '"Times New Roman", "STIX Two Text", "Nanum Myeongjo", "AppleMyungjo", serif',
  mathFont: '"Times New Roman", "STIX Two Text", "Nanum Myeongjo", "AppleMyungjo", serif',
  fontSize: 15,
  curveWidth: 1.4,
  axisWidth: 1,
  halo: '#ffffff',
};

/** Names set upright in formulas; every other run of letters is a variable, set in italic. */
const UPRIGHT = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'ln', 'log', 'exp', 'sqrt', 'abs', 'min', 'max', 'lim', 'det', 'mod', 'gcd', 'lcm',
]);

export interface Run {
  text: string;
  italic: boolean;
  /** raised: an exponent */
  sup?: boolean;
}

/** Latin letters (the variables); Hangul and other scripts stay upright. */
const LATIN = /^[A-Za-zÀ-ɏ]+$/;

/**
 * y = f(x) → italic y, upright " = ", italic f, upright "(", italic x, upright ")".
 * x^2 and x^(n+1) raise the exponent; * between factors is left out (2x, xy).
 */
export function mathRuns(text: string, sup = false): Run[] {
  const runs: Run[] = [];
  const push = (t: string, italic: boolean) => {
    if (!t) return;
    const last = runs[runs.length - 1];
    if (last && last.italic === italic && !!last.sup === sup) last.text += t;
    else runs.push(sup ? { text: t, italic, sup } : { text: t, italic });
  };
  const plain = (chunk: string) => {
    for (const m of chunk.matchAll(/\p{L}+|[^\p{L}]+/gu)) {
      const t = m[0];
      if (t === 'pi') push('π', false);
      else if (t === 'theta') push('θ', true);
      else if (/^\p{L}/u.test(t)) push(t, (LATIN.test(t) && !UPRIGHT.has(t)) || /^[α-ω]+$/.test(t));
      else push(t.replace(/\*/g, ''), false);
    }
  };
  let i = 0;
  while (i < text.length) {
    const hat = text.indexOf('^', i);
    if (hat < 0) {
      plain(text.slice(i));
      break;
    }
    plain(text.slice(i, hat));
    let exp: string;
    if (text[hat + 1] === '(') {
      let depth = 0;
      let j = hat + 1;
      for (; j < text.length; j++) {
        if (text[j] === '(') depth++;
        else if (text[j] === ')' && --depth === 0) break;
      }
      exp = text.slice(hat + 2, j);
      i = j + 1;
    } else {
      exp = /^-?[\p{L}\p{N}_.]+/u.exec(text.slice(hat + 1))?.[0] ?? '';
      i = hat + 1 + exp.length;
    }
    for (const run of mathRuns(exp, true)) runs.push(run);
  }
  return runs;
}

/** Which labels are set as math (italic variables) in exam figures. */
export const isMathLabel = (l: Label) => l.kind === 'axis' || l.kind === 'curve' || (l.kind === 'guide' && /\p{L}/u.test(l.text));
