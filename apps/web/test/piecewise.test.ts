import { describe, expect, it } from 'vitest';
import { parse } from '@math/engine';
import { latexToText, textToLatex } from '../src/math/latex';
import { SHORTCUTS, WORD_SHORTCUTS } from '../src/math/shortcuts';

describe('piecewise in the math field', () => {
  it('reads a cases block, conditions written any common way', () => {
    expect(latexToText('\\begin{cases}-x & x<0\\\\x^2 & x\\ge0\\end{cases}')).toBe('{x < 0: -x, x >= 0: x^2}');
    expect(latexToText('\\begin{cases}-x & (x<0)\\\\x^2 & \\text{otherwise}\\end{cases}')).toBe('{x < 0: -x, x^2}');
    expect(latexToText('\\begin{cases}1 & \\text{if } x>0\\\\0 & \\end{cases}')).toBe('{x > 0: 1, 0}');
  });
  it('what it reads, the engine understands', () => {
    for (const latex of ['\\begin{cases}-x & x<0\\\\x^2 & x\\ge0\\end{cases}', '\\begin{cases}\\frac{1}{x} & x\\ne0\\\\0 & \\end{cases}']) {
      expect(() => parse(`y = ${latexToText(latex)}`)).not.toThrow();
    }
  });
  it('shows {cond: value, …} as cases, conditions in brackets', () => {
    const tex = textToLatex('{x < 0: -x, x^2}');
    expect(tex).toContain('\\begin{cases}');
    expect(tex).toContain('&(x<0)');
    // and back again
    expect(latexToText(tex)).toBe('{x < 0: -x, x^2}');
    // a restriction stays braces
    expect(textToLatex('x^2 {x > 0}')).not.toContain('cases');
  });
  it('typing cases or piecewise gives the template', () => {
    const tpl = WORD_SHORTCUTS.cases ?? SHORTCUTS.cases;
    expect(tpl).toContain('\\begin{cases}');
    expect(WORD_SHORTCUTS.piecewise ?? SHORTCUTS.piecewise).toContain('\\begin{cases}');
  });
});
