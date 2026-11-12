import { describe, expect, it } from 'vitest';
import { paginate } from '../src/teach/worksheet';

describe('pagination', () => {
  const opts = { column: 100, first: 70, columns: 2, gap: 10 };

  it('fills the first column, then the second, then a new page', () => {
    const pages = paginate([30, 30, 30, 40, 40, 50, 50], opts);
    // page 1 has 70 for items in each column; later pages 100
    // the second column on page 1: 30 + gap 10 + 40 = 80 > 70, so 3 starts page 2
    expect(pages.map((p) => p.columns)).toEqual([
      [[0, 1], [2]],
      [[3, 4], [5]],
      [[6]],
    ]);
  });

  it('one column', () => {
    expect(paginate([60, 60, 60], { ...opts, columns: 1 }).map((p) => p.columns)).toEqual([[[0]], [[1]], [[2]]]);
  });

  it('a tall item gets its own column instead of vanishing', () => {
    expect(paginate([20, 500, 20], opts).map((p) => p.columns)).toEqual([[[0], [1]], [[2]]]);
  });

  it('an empty worksheet is one empty page', () => {
    expect(paginate([], opts)).toEqual([{ columns: [[]] }]);
  });
});
