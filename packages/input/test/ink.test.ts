import { describe, expect, it } from 'vitest';
import { recognizeInk } from '../src/ink/recognize';
import { TEMPLATES } from '../src/ink/templates';
import { row, rng, write } from './ink.helpers';

describe('handwriting: one symbol at a time', () => {
  for (const label of Object.keys(TEMPLATES)) {
    it(`${label}, written 10 ways`, () => {
      const rand = rng(label.charCodeAt(0));
      let right = 0;
      for (let k = 0; k < 10; k++) {
        const flat = label === '-' || label === '=';
        const syms = recognizeInk([...write('1', 0, 0, 40, rand), ...write(label, 40, flat ? 18 : 0, flat ? 20 : 40, rand)]).symbols;
        if (syms.length === 2 && syms[1]!.label === label) right++;
      }
      expect(right).toBeGreaterThanOrEqual(9);
    });
  }
});

describe('handwriting: expressions', () => {
  const seeds = [1, 2, 3, 4, 5];
  const check = (items: Parameters<typeof row>[0], expected: string) => {
    let right = 0;
    const got: string[] = [];
    for (const seed of seeds) {
      const r = recognizeInk(row(items, seed));
      got.push(r.text);
      if (r.text === expected) right++;
    }
    expect(right, got.join(' | ')).toBeGreaterThanOrEqual(4);
  };

  it('2x + 1', () => check([['2'], ['x'], ['+', 0.2, 0.6], ['1']], '2x + 1'));
  it('a power: x² - 5x + 6 = 0', () =>
    check([['x'], ['2', -0.05, 0.45], ['-'], ['5'], ['x'], ['+', 0.2, 0.6], ['6'], ['='], ['0']], 'x^2 - 5x + 6 = 0'));
  it('brackets: 3(x + 4)', () => check([['3'], ['('], ['x'], ['+', 0.2, 0.6], ['4'], [')']], '3(x + 4)'));
  it('y = 7x', () => check([['y'], ['='], ['7'], ['x']], 'y = 7x'));

  it('a fraction: a bar with something over and under it', () => {
    const rand = rng(9);
    const strokes = [...write('1', 30, 0, 36, rand), ...write('-', 0, 50, 6, rand).map((st) => st.map((p) => ({ x: p.x * 1, y: p.y }))), ...write('x', 20, 66, 26, rand), ...write('+', 50, 64, 26, rand), ...write('2', 80, 60, 36, rand)];
    // the bar is wide: stretch the dash across the denominator
    const bar = strokes.find((s) => s.length && Math.abs(s[0]!.y - 50) < 5 && Math.abs(s.at(-1)!.y - 50) < 5)!;
    bar.splice(0, bar.length, ...Array.from({ length: 20 }, (_, k) => ({ x: k * 6, y: 50 })));
    expect(recognizeInk(strokes).text).toBe('1/(x + 2)');
  });

  it('a root over its contents', () => {
    const rand = rng(11);
    const root = write('√', 0, 0, 50, rand);
    // stretch the root's bar over what follows
    const strokes = [...root.map((st) => st.map((p) => (p.x > 25 ? { x: p.x * 1.6, y: p.y } : p))), ...write('2', 40, 10, 36, rand)];
    expect(recognizeInk(strokes).text).toBe('sqrt(2)');
  });
});
