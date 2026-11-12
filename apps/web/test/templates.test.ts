import { Workspace } from '@math/engine';
import { describe, expect, it } from 'vitest';
import { FIGURE_TEMPLATES } from '../src/teach/templates';

describe('exam figure templates', () => {
  for (const t of FIGURE_TEMPLATES) {
    it(`${t.id}: every line works and something is drawn`, () => {
      const w = new Workspace();
      t.lines.forEach((src, k) => w.set(String(k), src));
      for (let k = 0; k < t.lines.length; k++) {
        const r = w.result(String(k));
        // f'(a) needs SymPy, which isn't loaded in this test
        if (r?.status === 'error') expect(r.message, t.lines[k]).toMatch(/symbolic engine/);
        expect(w.graphIssue(String(k)), t.lines[k]).toBeUndefined();
      }
      expect(w.graphables().length).toBeGreaterThan(1);
      // the numbers to change are let definitions (sliders, or the functions' formulas)
      expect(t.lines.some((l) => l.startsWith('let '))).toBe(true);
      expect(t.range.xmax).toBeGreaterThan(t.range.xmin);
      expect(t.name.ko && t.note.ko).toBeTruthy();
    });
  }
});
