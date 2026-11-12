import { parse, tokenize } from '@math/engine';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXAMPLES, REFERENCE } from '../src/i18n';
import { latexToText, textToLatex } from '../src/math/latex';

/** Lines quoted in the engine's tests: every '…' string that parses. */
function corpus(): string[] {
  const dir = new URL('../../../packages/engine/test/', import.meta.url);
  const found = new Set<string>();
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
      const s = m[1]!.replace(/\\'/g, "'");
      if (s.length < 2 || s.length > 80) continue;
      try {
        parse(s);
        found.add(s);
      } catch {
        /* not a line */
      }
    }
  }
  for (const ex of EXAMPLES) found.add(ex);
  for (const g of REFERENCE.en) for (const item of g.items) for (const s of item.syntax.split(/ {2,}/)) {
    try {
      parse(s);
      found.add(s);
    } catch {
      /* prose */
    }
  }
  return [...found];
}

const shape = (s: string) => JSON.stringify(parse(s), (k, v) => (k === 'pos' ? undefined : v === 'theta' ? 'θ' : v));

describe('text ⇄ LaTeX', () => {
  const lines = corpus();
  it('has a real corpus', () => expect(lines.length).toBeGreaterThan(300));

  it('keeps the meaning of every line through a round trip', () => {
    const broken: string[] = [];
    for (const s of lines) {
      const tex = textToLatex(s);
      const back = latexToText(tex);
      let same = false;
      try {
        same = shape(back) === shape(s);
      } catch {
        same = false;
      }
      if (!same) broken.push(`${s}\n    tex: ${tex}\n    back: ${back}`);
    }
    expect(broken.slice(0, 25).join('\n')).toBe('');
  });

  it('reads what MathLive writes', () => {
    const cases: [string, string][] = [
      ['\\frac{1}{2}x', '1/2x'],
      ['\\frac{x+1}{x-1}', '(x + 1)/(x - 1)'],
      ['y=x^{2}-2x', 'y = x^2 - 2x'],
      ['x^{\\frac{1}{3}}', 'x^(1/3)'],
      ['e^{-x}', 'e^(-x)'],
      ['\\sqrt{x+1}', 'sqrt(x + 1)'],
      ['\\sqrt[3]{x}', 'cbrt(x)'],
      ['\\sin\\left(x\\right)', 'sin(x)'],
      ['\\sin x', 'sin x'],
      ['a\\sin x', 'a sin x'],
      ['2\\pi r', '2pi r'],
      ['f^{\\prime}\\left(x\\right)', "f'(x)"],
      ['f\'(x)', "f'(x)"],
      ['\\operatorname{let}\\:a=2', 'let a = 2'],
      ['x_{1}+x_2', 'x_1 + x_2'],
      ['\\left|x-1\\right|', '|x - 1|'],
      ['x\\le3', 'x <= 3'],
      ['x^2y', 'x^2y'],
      ['2\\frac{3}{4}', '2*3/4'],
      ['\\sin^{2}\\left(x\\right)', 'sin^2(x)'],
      ['\\frac{a}{b}x', 'a/b*x'],
      ['a\\frac{b+1}{c}', 'a*(b + 1)/c'],
      ['\\theta', 'θ'],
      ['r=1+\\cos\\theta', 'r = 1 + cos θ'],
      ['\\left\\lbrack1,2\\right\\rbrack', '[1, 2]'],
      ['y=x\\left\\lbrace x>0\\right\\rbrace', 'y = x{x > 0}'],
      ['3\\cdot4', '3*4'],
      ['\\operatorname{\\mathrm{sinh}}\\left(x\\right)+\\operatorname{\\mathrm{logreg}}', 'sinh(x) + logreg'],
      ['1\\times10^{-3}', '1*10^(-3)'],
    ];
    for (const [tex, text] of cases) expect([tex, latexToText(tex)]).toEqual([tex, text]);
  });

  it('keeps unreadable text as text', () => {
    const tex = textToLatex('2 # 3');
    expect(latexToText(tex)).toBe('2 # 3');
    void tokenize;
  });
});

describe('textbook forms', () => {
  // text → LaTeX → text comes back the same
  const ROUND = [
    'integrate(x^2, x)',
    'integrate(e^(-x^2), x, 0, 1)',
    'diff(x^3 + 2x, x)',
    'diff(sin(x), x, 2)',
    'limit(sin(x)/x, x, 0)',
    'sum(seq(1/n^2, n, 1, 100))',
    'prod(seq(k, k, 1, 5))',
    'nCr(5, 2)',
    'root(32, 5)',
    '[[1, 2], [3, 4]]',
    'sin(30°)',
    'log_2(8)',
  ];
  for (const s of ROUND) {
    it(`round trips ${s}`, () => expect(latexToText(textToLatex(s))).toBe(s));
  }

  it('shows them as a textbook would', () => {
    expect(textToLatex('integrate(x^2, x, 0, 1)')).toBe('\\int_{0}^{1}x^{2}\\,\\mathrm{d}x');
    expect(textToLatex('nCr(5, 2)')).toBe('\\binom{5}{2}');
    expect(textToLatex('[[1, 2], [3, 4]]')).toBe('\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}');
    expect(textToLatex('sum([1, 2])')).toContain('\\operatorname{sum}');
  });

  it('reads what MathLive writes for the keypad templates', () => {
    expect(latexToText('\\int_{0}^{\\pi}\\sin(x)\\,\\mathrm{d}x')).toBe('integrate(sin(x), x, 0, pi)');
    expect(latexToText('\\int x\\,dx')).toBe('integrate(x, x)');
    expect(latexToText('\\frac{d}{dx}\\left(x^2\\right)')).toBe('diff(x^2, x)');
    expect(latexToText('\\frac{\\mathrm{d}^2}{\\mathrm{d}x^2}\\left(x^4\\right)')).toBe('diff(x^4, x, 2)');
    expect(latexToText('\\lim_{x\\to\\infty}\\left(\\frac{1}{x}\\right)')).toBe('limit(1/x, x, inf)');
    expect(latexToText('\\sum_{k=1}^{10}\\left(k^2\\right)')).toBe('sum(seq(k^2, k, 1, 10))');
    expect(latexToText('\\sqrt[4]{16}')).toBe('root(16, 4)');
    expect(latexToText('\\begin{bmatrix}1&0\\\\0&1\\end{bmatrix}')).toBe('[[1, 0], [0, 1]]');
    expect(latexToText('90^{\\circ}')).toBe('90°');
    expect(latexToText('x\\ne 2')).toBe('x ≠ 2');
    expect(latexToText('3!=6')).toBe('3! = 6');
    expect(latexToText('\\int_{0}^{1}\\operatorname{round}(x)\\,\\mathrm{d}x')).toBe('integrate(round(x), x, 0, 1)');
    expect(latexToText('\\int_{\\placeholder{}}^{\\placeholder{}}\\placeholder{}\\,\\mathrm{d}x')).toBe('integrate(, x)');
    // the typed shortcuts with some boxes left empty still give a working line
    expect(latexToText('\\int_{\\placeholder{}}^{\\placeholder{}}x^2\\,\\mathrm{d}x')).toBe('integrate(x^2, x)');
    expect(latexToText('\\sum_{n=\\placeholder{}}^{\\placeholder{}}\\lbrack 1,2,3\\rbrack')).toBe('sum([1, 2, 3])');
    expect(latexToText('\\sum_{n=1}^{10}n^2')).toBe('sum(seq(n^2, n, 1, 10))');
    expect(latexToText('\\prod_{k=1}^{5}k')).toBe('prod(seq(k, k, 1, 5))');
    expect(latexToText('\\lim_{x\\to 0}\\frac{\\sin(x)}{x}')).toBe('limit(sin(x)/x, x, 0)');
    // a plain fraction with d in it stays a fraction
    expect(latexToText('\\frac{d}{2}')).toBe('d/2');
  });
});

describe('shown results', () => {
  it('puts a number coefficient over the bar, letters after it', () => {
    expect(textToLatex('3*x^4/4 - 2*x^3/3 + 2*x^2', { display: true })).toBe('\\frac{3}{4}x^{4}-\\frac{2}{3}x^{3}+2\\,x^{2}');
    expect(textToLatex('-3*x^2/2', { display: true })).toBe('-\\frac{3}{2}x^{2}');
    expect(textToLatex('x^4/4', { display: true })).toBe('\\frac{x^{4}}{4}');
  });
});
