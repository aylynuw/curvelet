import { Workspace } from '@math/engine';
import { describe, expect, it } from 'vitest';
import { cleanTable, fitSource, pairs, tableSource, withSpareRow } from '../src/table/table';

describe('tables', () => {
  const t = { x: ['1', '2', '3', '', 'a'], y: ['3', '5', '7.5', '9', '2'] };
  it('keeps the complete numeric rows', () => {
    expect(pairs(t)).toEqual([['1', '3'], ['2', '5'], ['3', '7.5']]);
    expect(tableSource(t)).toBe('points([1, 2, 3], [3, 5, 7.5])');
    expect(tableSource({ x: [''], y: [''] })).toBe('');
  });
  it('writes lines the engine graphs and fits', () => {
    const w = new Workspace();
    w.set('1', tableSource(t));
    expect(w.graphables()[0]).toMatchObject({ kind: 'scatter' });
    w.set('2', fitSource({ x: ['1', '2', '3'], y: ['3', '5', '7'] }, 'linreg'));
    const r = w.result('2');
    expect(r?.status === 'value' ? r.text : r?.status).toBe('y = 2x + 1, R² = 1');
  });
  it('keeps one empty row to type into, and cleans stored tables', () => {
    expect(withSpareRow({ x: ['1'], y: ['2'] })).toEqual({ x: ['1', ''], y: ['2', ''] });
    expect(withSpareRow({ x: ['1', ''], y: ['2', ''] }).x).toHaveLength(2);
    expect(cleanTable({ x: ['1', 2], y: ['3'] })).toEqual({ x: ['1'], y: ['3'] });
    expect(cleanTable('nope')).toBe(undefined);
  });
});
