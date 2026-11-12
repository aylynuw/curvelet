import { Workspace } from '@math/engine';
import { describe, expect, it } from 'vitest';
import { FORMULAS, formulaLines, SUBJECTS } from '../src/formulas/library';

describe('formula library', () => {
  it('covers every subject, with unique ids and both languages', () => {
    expect(new Set(FORMULAS.map((f) => f.id)).size).toBe(FORMULAS.length);
    for (const s of SUBJECTS) expect(FORMULAS.filter((f) => f.subject === s).length, s).toBeGreaterThanOrEqual(3);
    for (const f of FORMULAS) {
      expect(f.name.ko && f.name.en, f.id).toBeTruthy();
      for (const i of f.inputs) expect(i.note.ko && i.note.en, `${f.id} ${i.name}`).toBeTruthy();
    }
  });

  for (const f of FORMULAS) {
    it(`${f.id}: its lines work with the default values`, () => {
      const w = new Workspace();
      const lines = formulaLines(f, {}, new Set());
      lines.forEach((src, k) => w.set(String(k), src));
      for (let k = 0; k < lines.length; k++) {
        const r = w.result(String(k));
        // solve, f'(a) and integrate need SymPy, which isn't loaded in this test
        if (r?.status === 'error') expect(r.message, lines[k]).toMatch(/symbolic engine/);
      }
      const last = w.result(String(lines.length - 1));
      if (last?.status === 'value' && last.value.kind === 'num') expect(Number.isFinite(last.value.z.re), lines.at(-1)).toBe(true);
    });
  }

  it('known answers', () => {
    const value = (id: string) => {
      const w = new Workspace();
      const lines = formulaLines(FORMULAS.find((f) => f.id === id)!, {}, new Set());
      lines.forEach((src, k) => w.set(String(k), src));
      const r = w.result(String(lines.length - 1));
      return r?.status === 'value' ? r.text : r?.status;
    };
    expect(value('distance')).toBe('5');
    expect(value('pythagoras')).toBe('5');
    expect(value('heron')).toBe('14.6969384567');
    expect(value('arith-sum')).toBe('210');
    expect(value('z')).toBe('1.5');
    expect(value('midpoint')).toBe('(1, 3)');
  });

  it('renames inputs that clash with the worksheet, and uses filled-in values', () => {
    const f = FORMULAS.find((x) => x.id === 'circle-area')!;
    expect(formulaLines(f, { r: '5' }, new Set(['r', 'A']))).toEqual(['let r_2 = 5', 'let A_2 = pi r_2^2']);
    const t = FORMULAS.find((x) => x.id === 'tangent')!;
    expect(formulaLines(t, {}, new Set(['f']))).toEqual(['let f_2(x) = x^3 - 3x', 'let a = 2', "y = f_2'(a)(x - a) + f_2(a)"]);
  });
});
