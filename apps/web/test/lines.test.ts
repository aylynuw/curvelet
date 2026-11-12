import { describe, expect, it } from 'vitest';
import { cleanLine, foldersOf } from '../src/lines';

describe('line data', () => {
  it('keeps known fields and drops the rest', () => {
    expect(cleanLine({ source: 'a = 2', slider: { min: 0, max: 5, step: -1, speed: 'x' }, junk: 1 })).toEqual({ source: 'a = 2', slider: { min: 0, max: 5 } });
    expect(cleanLine({ source: 'y = x', table: { x: ['1', '2'], y: ['3', '4'] } })).toEqual({ source: 'points([1, 2], [3, 4])', table: { x: ['1', '2'], y: ['3', '4'] } });
    expect(cleanLine({ source: 'y = x', note: 'Remember the slope' })).toEqual({ source: '', note: 'Remember the slope' });
    expect(cleanLine({ source: 'y = x', folder: { title: 'Lines', collapsed: true, hidden: 'yes' } })).toEqual({ source: '', folder: { title: 'Lines', collapsed: true } });
    expect(cleanLine('nope')).toBe(null);
  });
  it('puts lines in the folder above them, up to the next folder', () => {
    const L = (id: string, folder?: boolean) => ({ id, source: '', ...(folder ? { folder: { title: id } } : {}) });
    const m = foldersOf([L('a'), L('F', true), L('b'), L('c'), L('G', true), L('d')]);
    expect(m.has('a')).toBe(false);
    expect(m.get('b')?.id).toBe('F');
    expect(m.get('c')?.id).toBe('F');
    expect(m.get('d')?.id).toBe('G');
    expect(m.has('F')).toBe(false);
  });
});
