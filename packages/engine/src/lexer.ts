import { MathError } from './ast';

export type TokenType = 'num' | 'ident' | 'op' | 'eof';
export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

/** Unicode symbols people type or paste, mapped to the canonical form. */
const SYMBOLS: Record<string, string> = {
  '×': '*', '·': '*', '⋅': '*', '∗': '*',
  '÷': '/', '−': '-', '–': '-',
  '≤': '<=', '≥': '>=', '≠': '!=', '°': '°',
};
const GREEK_NAMES: Record<string, string> = { 'π': 'pi', 'τ': 'tau', '√': 'sqrt', '∛': 'cbrt', '∞': 'inf' };

const OPS = ['**', '!=', '<=', '>=', '+', '-', '*', '/', '^', '(', ')', '[', ']', '{', '}', ',', '=', '<', '>', '!', "'", '|', ':', ';'];

const IDENT_START = /[\p{L}]/u;
const IDENT_PART = /[\p{L}\p{N}_]/u;

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if (src.startsWith('//', i)) break; // comment to end of line

    // 0b1010, 0o17, 0xff: whole numbers in another base (Number() reads all three)
    const based = /^0([bB][01]+|[oO][0-7]+|[xX][0-9a-fA-F]+)(?![\p{L}\p{N}_])/u.exec(src.slice(i));
    if (based) {
      tokens.push({ type: 'num', value: based[0], pos: i });
      i += based[0].length;
      continue;
    }

    // number: 12, 1.5, .5, 1e-3
    const num = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
    if (num) {
      tokens.push({ type: 'num', value: num[0], pos: i });
      i += num[0].length;
      continue;
    }

    if (GREEK_NAMES[ch]) {
      tokens.push({ type: 'ident', value: GREEK_NAMES[ch]!, pos: i });
      i++;
      continue;
    }
    if (SYMBOLS[ch]) {
      tokens.push({ type: 'op', value: SYMBOLS[ch]!, pos: i });
      i++;
      continue;
    }

    if (IDENT_START.test(ch)) {
      let j = i + 1;
      while (j < src.length && IDENT_PART.test(src[j]!)) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }

    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      tokens.push({ type: 'op', value: op === '**' ? '^' : op, pos: i });
      i += op.length;
      continue;
    }
    throw new MathError(`Unexpected character "${ch}"`, i);
  }
  tokens.push({ type: 'eof', value: '', pos: src.length });
  return tokens;
}
