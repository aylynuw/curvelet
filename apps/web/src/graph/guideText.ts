/**
 * Lengths typed on an exam figure are written like a line (integrate(f(x), x),
 * sqrt(3)/2, a^2) and printed as an exam sets them (∫f(x)dx, √3/2, a²).
 */
const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', n: 'ⁿ', a: 'ᵃ', b: 'ᵇ', x: 'ˣ', '+': '⁺' };
const SUB: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '-': '₋', a: 'ₐ', x: 'ₓ', '+': '₊' };
const small = (s: string, map: Record<string, string>) => ([...s].every((c) => map[c]) ? [...s].map((c) => map[c]).join('') : null);

/** the arguments of a call starting at `open` (the index of its '('), and the index after ')' */
function args(s: string, open: number): { parts: string[]; end: number } | null {
  let depth = 0;
  const parts: string[] = [];
  let start = open + 1;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) {
        parts.push(s.slice(start, i).trim());
        return { parts, end: i + 1 };
      }
    } else if (c === ',' && depth === 1) {
      parts.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  return null;
}

const simple = (s: string) => /^[\p{L}\p{N}.π√]+$/u.test(s);

export function prettyGuide(text: string): string {
  let s = text.trim();
  // integrate(E, x[, a, b]) → ∫ₐᵇ E dx
  for (let k = s.indexOf('integrate('); k >= 0; k = s.indexOf('integrate(')) {
    const a = args(s, k + 'integrate'.length);
    if (!a || a.parts.length < 2) break;
    const [e, v, lo, hi] = a.parts as [string, string, string?, string?];
    const limits = lo !== undefined && hi !== undefined ? `${small(lo, SUB) ?? `_${lo}`}${small(hi, SUP) ?? `^${hi}`}` : '';
    s = `${s.slice(0, k)}∫${limits}${e} d${v}${s.slice(a.end)}`;
  }
  // limit(E, x, a) → lim x→a E
  for (const name of ['limit(', 'lim(']) {
    for (let k = s.indexOf(name); k >= 0; k = s.indexOf(name)) {
      const a = args(s, k + name.length - 1);
      if (!a || a.parts.length < 3) break;
      const [e, v, to] = a.parts as [string, string, string];
      s = `${s.slice(0, k)}lim ${v}→${to} ${e}${s.slice(a.end)}`;
    }
  }
  // sqrt(X) → √X, with brackets kept when X is more than one thing
  for (let k = s.indexOf('sqrt('); k >= 0; k = s.indexOf('sqrt(')) {
    const a = args(s, k + 'sqrt'.length);
    if (!a) break;
    const x = a.parts[0]!;
    s = `${s.slice(0, k)}√${simple(x) ? x : `(${x})`}${s.slice(a.end)}`;
  }
  // short powers become raised digits: x^2 → x²
  s = s.replace(/\^\(([0-9n+-]+)\)|\^([0-9]+|n)/g, (m, a?: string, b?: string) => small(a ?? b ?? '', SUP) ?? m);
  return s
    .replace(/(?<![A-Za-z])pi(?![A-Za-z])/g, 'π')
    .replace(/(?<![A-Za-z])theta(?![A-Za-z])/g, 'θ')
    .replace(/(?<![A-Za-z])(?:infinity|inf|oo)(?![A-Za-z])/g, '∞')
    // (x²) alone needs no brackets
    .replace(/\(([\p{L}\p{N}]+[²³⁴⁵⁶⁷⁸⁹ⁿ]*)\)/gu, (m, x: string, at: number, all: string) => (at > 0 && /[\p{L}\p{N}]/u.test(all[at - 1]!) ? m : x))
    .replace(/\*/g, '');
}

/** a printed length back to something the math field reads, to edit it again */
export const plainGuide = (text: string) =>
  text
    .replace(/−/g, '-')
    .replace(/√(\d+|[\p{L}])/gu, 'sqrt($1)')
    .replace(/√\(/g, 'sqrt(')
    .replace(/π/g, 'pi');
