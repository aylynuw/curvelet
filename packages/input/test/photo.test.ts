import { describe, expect, it } from 'vitest';
import { photoTemplatesFromStrokes, rasterize, recognizeImage } from '../src';
import { TEMPLATES } from '../src/ink/templates';
import { row } from './ink.helpers';

const templates = photoTemplatesFromStrokes(TEMPLATES);

/** handwriting as a photo: dark ink on light, slightly uneven paper */
function photo(items: Parameters<typeof row>[0], seed: number) {
  const strokes = row(items, seed);
  const w = Math.ceil(Math.max(...strokes.flat().map((p) => p.x))) + 30;
  const h = 90;
  const m = rasterize(strokes, w, h, 4);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    // paper brighter on the left, like a lamp to one side
    const paper = 225 + Math.round(25 * (1 - (p % w) / w));
    const v = m.data[p] ? 40 : paper;
    rgba.set([v, v, v, 255], p * 4);
  }
  return { rgba, w, h };
}

describe('photos of written math', () => {
  const check = (items: Parameters<typeof row>[0], expected: string) => {
    let right = 0;
    const got: string[] = [];
    for (const seed of [1, 2, 3, 4, 5]) {
      const { rgba, w, h } = photo(items, seed);
      const r = recognizeImage(rgba, w, h, templates);
      got.push(r.text);
      if (r.text === expected) right++;
    }
    expect(right, got.join(' | ')).toBeGreaterThanOrEqual(4);
  };
  it('2x + 1', () => check([['2'], ['x'], ['+', 0.2, 0.6], ['1']], '2x + 1'));
  it('x² - 5x + 6 = 0', () => check([['x'], ['2', -0.05, 0.45], ['-'], ['5'], ['x'], ['+', 0.2, 0.6], ['6'], ['='], ['0']], 'x^2 - 5x + 6 = 0'));
  it('3(x + 4)', () => check([['3'], ['('], ['x'], ['+', 0.2, 0.6], ['4'], [')']], '3(x + 4)'));

  it('a blank page reads as nothing', () => {
    const rgba = new Uint8ClampedArray(100 * 60 * 4).fill(235);
    expect(recognizeImage(rgba, 100, 60, templates).ok).toBe(false);
  });
});
