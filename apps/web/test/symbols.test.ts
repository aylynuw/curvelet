import { describe, expect, it } from 'vitest';
import { latexToText, textToLatex } from '../src/math/latex';
import { SHORTCUTS, WORD_SHORTCUTS } from '../src/math/shortcuts';
import { BLACKBOARD, SYMBOL_CHARS } from '../src/math/symbols';

describe('every LaTeX symbol', () => {
  it('survives LaTeX → text → LaTeX', () => {
    for (const name of Object.keys(SYMBOL_CHARS)) {
      const text = latexToText(`a \\${name} b`);
      expect(text, name).toContain(SYMBOL_CHARS[name]);
      // the same character comes back as a command that means it
      expect(latexToText(textToLatex(text)), name).toBe(text);
    }
  });
  it('keeps relations spaced and blackboard letters', () => {
    expect(latexToText('x\\approx 2')).toBe('x ≈ 2');
    expect(latexToText('x\\in\\mathbb{R}')).toBe('x ∈ ℝ');
    expect(textToLatex('x ∈ ℝ')).toBe('x\\in \\mathbb{R}');
    expect(latexToText(textToLatex('f: ℝ → ℝ'))).toBe('f: ℝ → ℝ');
    for (const [k, ch] of Object.entries(BLACKBOARD)) expect(latexToText(`\\mathbb{${k}}`)).toBe(ch);
  });
  it('keeps every Greek letter and the accents', () => {
    for (const g of ['varkappa', 'varpi', 'varrho', 'varsigma', 'Pi', 'Upsilon', 'alpha', 'Omega']) {
      const text = latexToText(`\\${g}`);
      expect(textToLatex(text), g).toBe(`\\${g}`);
    }
    expect(latexToText('\\vec{v}')).toBe('vec(v)');
    expect(textToLatex('vec(v)')).toBe('\\vec{v}');
    expect(textToLatex('hat(x)')).toBe('\\hat{x}');
  });
});

describe('typed shortcuts', () => {
  it('covers Greek, relations, arrows, sets and structures', () => {
    const all = { ...SHORTCUTS, ...WORD_SHORTCUTS };
    for (const n of ['alpha', 'Gamma', 'varphi', 'neq', 'approx', 'leq', 'geq', 'equiv', 'rightarrow', 'Rightarrow', 'mapsto', 'subseteq', 'emptyset', 'forall', 'exists', 'partial', 'nabla', 'infty', 'pm', 'times', 'cdot', 'frac', 'sqrt', 'nthroot', 'binom', 'vec', 'RR', 'int', 'sum', 'prod', 'lim']) {
      expect(all[n], n).toBeDefined();
    }
    expect(SHORTCUTS.alpha).toBe('\\alpha');
    expect(SHORTCUTS.neq).toBe('\\ne');
    expect(SHORTCUTS.RR).toBe('\\mathbb{R}');
  });
  it('waits for the end of words that are also names or begin longer ones', () => {
    // in → int, infty; ne → neq, neg; le → leq, left; to → total (a variable)
    for (const n of ['in', 'ne', 'le', 'ge', 'to', 'angle', 'star', 'times', 'int', 'lim', 'sum', 'prod']) expect(WORD_SHORTCUTS[n], n).toBeDefined();
    for (const n of ['in', 'ne', 'le', 'to', 'int']) expect(SHORTCUTS[n], n).toBeUndefined();
    // function names still convert as they are typed
    expect(SHORTCUTS.sin).toBe('\\operatorname{sin}');
    expect(SHORTCUTS.integrate).toBe('\\operatorname{integrate}');
  });
});
