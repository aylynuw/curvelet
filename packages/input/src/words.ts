import { parse, printNode } from '@math/engine';

/**
 * Plain words to a calculator line, in English or Korean:
 *   "derivative of sin x squared"      → diff(sin(x^2), x)
 *   "integral of x squared from 0 to 3" → integrate(x^2, x, 0, 3)
 *   "x제곱의 미분"                       → diff(x^2, x)
 *   "1부터 2까지 x의 3제곱 적분"           → integrate(x^3, x, 1, 2)
 * Words become symbols and the calculator's own parser does the rest
 * (precedence, implicit multiplication, sin x² as sin(x²)). Rule-based, so
 * what it read is always shown before it is used.
 */
export interface WordsResult {
  /** the calculator line, or '' when nothing could be read */
  text: string;
  /** the line parses */
  ok: boolean;
  /** an operation was named (derivative, solve, …), not just arithmetic */
  command: string | null;
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', twenty: '20', hundred: '100', half: '1/2',
};

/** spoken math → symbols, in order; each [pattern, replacement] */
const EN_MATH: [RegExp, string][] = [
  [/\bopen (?:bracket|paren(?:thesis)?)\b/g, '('],
  [/\bclose (?:bracket|paren(?:thesis)?)\b/g, ')'],
  [/\b(?:the )?square root of\b/g, 'sqrt '],
  [/\b(?:the )?cube root of\b/g, 'cbrt '],
  [/\b(?:the )?absolute value of (\S+)/g, 'abs($1)'],
  [/\b(?:the )?natural (?:log|logarithm) of\b/g, 'ln '],
  [/\b(?:the )?(?:log|logarithm) of\b/g, 'log '],
  [/\b(?:the )?(?:sine|sin) of\b/g, 'sin '],
  [/\bsine\b/g, 'sin'],
  [/\b(?:the )?(?:cosine|cos) of\b/g, 'cos '],
  [/\bcosine\b/g, 'cos'],
  [/\b(?:the )?(?:tangent|tan) of\b/g, 'tan '],
  [/\btangent\b/g, 'tan'],
  [/\be to the (?:power of )?(\S+)/g, 'e^($1)'],
  [/\bto the power of\b/g, '^'],
  [/\braised to (?:the (?:power of )?)?/g, '^'],
  [/\bto the (\d+)(?:st|nd|rd|th)?(?: power)?/g, '^$1'],
  [/\bsquared\b/g, '^2'],
  [/\bcubed\b/g, '^3'],
  [/\bmultiplied by\b/g, '*'],
  [/\bdivided by\b/g, '/'],
  [/\btimes\b/g, '*'],
  [/\bover\b/g, '/'],
  [/\bplus\b/g, '+'],
  [/\bminus\b/g, '-'],
  [/\bnegative\b/g, '-'],
  [/\b(?:is )?less than or equal to\b/g, '<='],
  [/\b(?:is )?greater than or equal to\b/g, '>='],
  [/\b(?:is )?less than\b/g, '<'],
  [/\b(?:is )?greater than\b/g, '>'],
  [/\b(?:is equal to|equals|is)\b/g, '='],
  [/\b(?:a )?half\b/g, '1/2'],
];

const KO_WORDS: [RegExp, string][] = [
  [/괄호\s*열고/g, '('],
  [/괄호\s*닫고/g, ')'],
  [/자연\s*로그/g, 'ln '],
  [/로그/g, 'log '],
  [/코사인/g, 'cos '],
  [/사인/g, 'sin '],
  [/탄젠트/g, 'tan '],
  [/파이/g, 'pi'],
  [/세타/g, 'θ'],
  [/더하기|플러스/g, ' + '],
  [/빼기|마이너스/g, ' - '],
  [/곱하기/g, ' * '],
  [/나누기/g, ' / '],
  [/는\s*같다|은\s*같다|이다|같다/g, ''],
];

/** Korean grammar that reorders: a분의 b, x의 3제곱, x의 제곱근, x의 절댓값 */
const KO_MATH: [RegExp, string | ((...m: string[]) => string)][] = [
  [/(\S+?)\s*분의\s*(\S+)/g, (_, a: string, b: string) => `(${b})/(${a})`],
  [/(\S+?)(?:\s*의)?\s*제곱근/g, (_, a: string) => `sqrt(${a})`],
  [/루트\s*/g, 'sqrt '],
  [/(\S+?)(?:\s*의)?\s*절댓값/g, (_, a: string) => `abs(${a})`],
  [/절댓값\s*(\S+)/g, (_, a: string) => `abs(${a})`],
  [/(\S+?)(?:\s*의)?\s*세제곱/g, (_, a: string) => `${a}^3`],
  [/(\S+?)(?:\s*의)?\s*(\d+)\s*제곱/g, (_, a: string, n: string) => `${a}^${n}`],
  [/(\S+?)(?:\s*의)?\s*제곱/g, (_, a: string) => `${a}^2`],
];

const hangul = (s: string) => /[가-힣]/.test(s);

function mathEn(s: string): string {
  let out = ` ${s} `;
  for (const [re, to] of EN_MATH) out = out.replace(re, to);
  out = out.replace(/\b([a-z]+)\b/g, (w) => NUMBER_WORDS[w] ?? w);
  // filler words around the math
  out = out.replace(/\b(?:the|of|please|what|whats|find|calculate|compute|evaluate)\b/g, ' ');
  return tidy(out);
}

function mathKo(s: string): string {
  let out = s;
  for (const [re, to] of KO_WORDS) out = out.replace(re, to);
  for (const [re, to] of KO_MATH) out = out.replace(re, to as string);
  // a particle left on the math: x를, f(x)의, 식은
  out = out.replace(/([^\s가-힣])\s*(?:을|를|의|은|는|이|가)(?=\s|$)/g, '$1');
  return tidy(out);
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/\s*([()^])\s*/g, '$1').trim();
const math = (s: string, ko: boolean) => (ko ? mathKo(s) : mathEn(s));

/** = for an equation, written either way */
const hasEquals = (s: string) => /=/.test(s);

export function fromWords(input: string): WordsResult {
  const raw = input.trim().replace(/[?？.!。]+$/u, '');
  if (!raw) return { text: '', ok: false, command: null };
  const ko = hangul(raw);
  const s = ko ? raw : raw.toLowerCase();
  const done = (text: string, command: string | null): WordsResult => {
    let clean = text.replace(/\s+/g, ' ').trim();
    let ok = false;
    try {
      // written back out by the calculator itself: brackets made explicit, sin(x^2) not sin x^2
      const st = parse(clean);
      if (st.kind === 'expr') clean = printNode(st.expr);
      else if (st.kind === 'relation') clean = `${printNode(st.left)} ${st.op} ${printNode(st.right)}`;
      ok = clean.length > 0;
    } catch {
      ok = false;
    }
    return { text: clean, ok, command };
  };
  return ko ? korean(s, done) : english(s, done);
}

type Done = (text: string, command: string | null) => WordsResult;

function english(s: string, done: Done): WordsResult {
  const lead = /^(?:what is |what's |find |calculate |compute |evaluate |work out )?(?:the )?/;
  const body = s.replace(lead, '');
  let m: RegExpMatchArray | null;

  if ((m = body.match(/^(?:second derivative|second-derivative) (?:of )?(.+?)(?: with respect to (\w))?$/))) {
    return done(`diff(${mathEn(m[1]!)}, ${m[2] ?? 'x'}, 2)`, 'diff');
  }
  if ((m = body.match(/^(?:derivative|differentiate|d\/d(\w)) ?(?:of )?(.+?)(?: with respect to (\w))?$/))) {
    return done(`diff(${mathEn(m[2]!)}, ${m[3] ?? m[1] ?? 'x'})`, 'diff');
  }
  if ((m = body.match(/^(?:area under|integral|integrate|antiderivative)(?: of)? (.+?)(?: d(\w))?(?: from (.+?) to (.+?))?(?: d(\w))?$/))) {
    const v = m[2] ?? m[5] ?? 'x';
    const bounds = m[3] !== undefined ? `, ${mathEn(m[3])}, ${mathEn(m[4]!)}` : '';
    return done(`integrate(${mathEn(m[1]!)}, ${v}${bounds})`, 'integrate');
  }
  if ((m = body.match(/^(?:limit|lim)(?: of)? (.+?) as (\w) (?:approaches|goes to|tends to|->|→) (.+)$/))) {
    return done(`limit(${mathEn(m[1]!)}, ${m[2]}, ${mathEn(m[3]!)})`, 'limit');
  }
  if ((m = body.match(/^solve (.+?)(?: for (\w))?$/))) {
    const eq = mathEn(m[1]!);
    return done(`solve(${hasEquals(eq) ? eq : `${eq} = 0`}, ${m[2] ?? 'x'})`, 'solve');
  }
  for (const op of ['factor', 'expand', 'simplify'] as const) {
    if ((m = body.match(new RegExp(`^(?:${op}|${op}ise|${op}ize) (.+)$`)))) return done(`${op}(${mathEn(m[1]!)})`, op);
  }
  if ((m = body.match(/^(?:graph|plot|draw|sketch) (?:of )?(.+)$/))) {
    const e = mathEn(m[1]!);
    return done(hasEquals(e) || /[<>]/.test(e) ? e : `y = ${e}`, 'graph');
  }
  if ((m = body.match(/^(mean|average|median|sum|standard deviation|stdev) (?:of )?(.+)$/))) {
    const fn = m[1] === 'average' ? 'mean' : m[1] === 'standard deviation' ? 'stdev' : m[1]!;
    const items = m[2]!.split(/,|\band\b/).map((t) => mathEn(t)).filter(Boolean);
    return done(`${fn}([${items.join(', ')}])`, 'stats');
  }
  return done(mathEn(body), null);
}

function korean(s: string, done: Done): WordsResult {
  // polite endings and question words
  let body = s
    .replace(/\s*(?:줘|주세요|주라)$/u, '')
    // 미분해, 적분하기 … but not 인수분해, and not 의 해 (the solution)
    .replace(/\s*(?:(?<!인수\s*분|의\s*)해|하세요|해라|하면|하기|한\s*값|은|는|을\s*구하시오|를\s*구하시오|구하기|구해|구하시오)\s*$/u, '')
    .trim();
  let m: RegExpMatchArray | null;

  // a부터 b까지 / a에서 b까지: bounds for an integral
  let bounds = '';
  body = body.replace(/(\S+?)\s*(?:부터|에서)\s*(\S+?)\s*까지\s*/u, (_, a: string, b: string) => {
    bounds = `, ${mathKo(a)}, ${mathKo(b)}`;
    return '';
  });
  // x에 대해(서)
  let v = 'x';
  body = body.replace(/([a-zA-Z])\s*에\s*대(?:해서?|하여)\s*/u, (_, w: string) => {
    v = w;
    return '';
  });
  const strip = (e: string) => e.replace(/\s*(?:을|를|의|은|는)\s*$/u, '').trim();

  if ((m = body.match(/^(.+?)\s*(?:을|를|의)?\s*(?:두\s*번\s*미분|이계\s*도함수)$/u))) return done(`diff(${mathKo(strip(m[1]!))}, ${v}, 2)`, 'diff');
  if ((m = body.match(/^(.+?)\s*(?:을|를|의)?\s*(?:미분|도함수)$/u))) return done(`diff(${mathKo(strip(m[1]!))}, ${v})`, 'diff');
  if ((m = body.match(/^(.+?)\s*(?:을|를|의)?\s*(?:정)?적분$/u))) return done(`integrate(${mathKo(strip(m[1]!))}, ${v}${bounds})`, 'integrate');
  if ((m = body.match(/^([a-zA-Z])\s*(?:가|이)\s*(.+?)\s*(?:으로|로)\s*(?:갈\s*때|가면|다가갈\s*때)\s*(.+?)\s*(?:의)?\s*극한(?:값)?$/u))) {
    return done(`limit(${mathKo(strip(m[3]!))}, ${m[1]}, ${mathKo(m[2]!)})`, 'limit');
  }
  if ((m = body.match(/^(.+?)\s*(?:을|를)?\s*(?:풀어|풀기|풀이|의\s*해|의\s*근)$/u))) {
    const eq = mathKo(strip(m[1]!));
    return done(`solve(${hasEquals(eq) ? eq : `${eq} = 0`}, ${v})`, 'solve');
  }
  const ops: [RegExp, string][] = [
    [/인수\s*분해$/u, 'factor'],
    [/전개$/u, 'expand'],
    [/(?:간단히|정리)$/u, 'simplify'],
  ];
  for (const [re, op] of ops) {
    if ((m = body.match(new RegExp(`^(.+?)\\s*(?:을|를|의)?\\s*${re.source}`, 'u')))) return done(`${op}(${mathKo(strip(m[1]!))})`, op);
  }
  if ((m = body.match(/^(.+?)\s*(?:의)?\s*(?:그래프(?:\s*그리기)?|그려\s*줘|그려)$/u))) {
    const e = mathKo(strip(m[1]!));
    return done(hasEquals(e) || /[<>]/.test(e) ? e : `y = ${e}`, 'graph');
  }
  if ((m = body.match(/^(.+?)\s*(?:의)?\s*(평균|중앙값|합|표준\s*편차)$/u))) {
    const fn = { 평균: 'mean', 중앙값: 'median', 합: 'sum' }[m[2]!] ?? 'stdev';
    const items = m[1]!.split(/,|\s+/).map((t) => mathKo(t)).filter(Boolean);
    return done(`${fn}([${items.join(', ')}])`, 'stats');
  }
  return done(mathKo(strip(body.replace(/\s*(?:의\s*값|값|계산)$/u, ''))), null);
}
