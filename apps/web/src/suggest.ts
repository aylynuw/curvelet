import { FUNCTIONS, type Result } from '@math/engine';
import type { Lang } from './i18n';

/** names that take brackets: sin, ln, sqrt … */
const FNS = [...new Set([...Object.keys(FUNCTIONS), 'sqrt', 'cbrt', 'log', 'ln', 'exp', 'abs'])].filter((n) => n.length > 1);

export interface Suggestion {
  /** the line rewritten, when there is one clear fix */
  fix?: string;
  /** what to say */
  say: string;
}

const S = {
  en: {
    didYouMean: (fix: string) => `Did you mean ${fix}?`,
    endsEarly: 'This line stops before it is finished: something is missing after the last sign or bracket.',
    percent: 'For a remainder write mod(a, b); for a percentage, divide by 100.',
  },
  ko: {
    didYouMean: (fix: string) => `${fix}를 뜻했나요?`,
    endsEarly: '식이 끝나지 않았습니다. 마지막 기호나 괄호 뒤에 무언가가 빠졌습니다.',
    percent: '나머지는 mod(a, b)로, 퍼센트는 100으로 나눠 쓰세요.',
  },
} satisfies Record<Lang, unknown>;

/** Levenshtein distance, stopping early past `max` */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

/** sinx → sin(x), lnx2 → ln(x2): a function name run into its argument */
function splitCall(name: string): string | null {
  const fn = FNS.filter((f) => name.startsWith(f) && name.length > f.length).sort((a, b) => b.length - a.length)[0];
  if (!fn) return null;
  const arg = name.slice(fn.length);
  return /^(?:[a-zA-Zα-ω]|\d+(?:\.\d+)?)$/.test(arg) ? `${fn}(${arg})` : null;
}

/** a near miss for a name: wrong case, or one or two letters off a function */
function nearName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower !== name && FNS.includes(lower)) return lower;
  if (name.length < 3) return null;
  const best = FNS.map((f) => [f, distance(lower, f, 2)] as const)
    .filter(([f, d]) => d <= (Math.max(f.length, name.length) >= 5 ? 2 : 1))
    .sort((a, b) => a[1] - b[1])[0];
  return best ? best[0] : null;
}

const replaceName = (source: string, name: string, by: string) =>
  source.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'u'), by);

/** A friendlier reading of a line that went wrong, with a fix when one is clear. */
export function suggest(source: string, result: Result | undefined, lang: Lang): Suggestion | null {
  if (!result) return null;
  const s = S[lang];
  const names = result.status === 'error' || result.status === 'equation' ? result.undefinedNames ?? [] : [];
  for (const name of names) {
    const call = splitCall(name);
    if (call) {
      const fix = replaceName(source, name, call);
      return { fix, say: s.didYouMean(fix) };
    }
    const near = nearName(name);
    if (near) {
      const fix = replaceName(source, name, near);
      return { fix, say: s.didYouMean(fix) };
    }
  }
  if (result.status !== 'error') return null;
  if (/ends too early/i.test(result.message)) return { say: s.endsEarly };
  if (/"%"/.test(result.message)) return { say: s.percent };
  return null;
}
