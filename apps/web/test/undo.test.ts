import { describe, expect, it } from 'vitest';
import { emptyUndo, MERGE_MS, record, redo, undo, undoKey } from '../src/undo';
import type { Line } from '../src/storage';

const L = (id: string, source: string): Line => ({ id, source });

describe('undo', () => {
  it('merges a burst of typing in one line into one step', () => {
    const a = [L('1', 'x')];
    const b = [L('1', 'x+')];
    const c = [L('1', 'x+1')];
    let s = record(emptyUndo(), a, b, 0);
    s = record(s, b, c, 300);
    expect(s.past).toEqual([a]);
    const u = undo(s, c)!;
    expect(u.lines).toEqual(a);
    expect(redo(u.state, u.lines)!.lines).toEqual(c);
  });

  it('starts a new step after a pause, another line, or a structural change', () => {
    const a = [L('1', 'x'), L('2', 'y')];
    const b = [L('1', 'x1'), L('2', 'y')];
    const c = [L('1', 'x1'), L('2', 'y1')];
    const d = [L('1', 'x1')];
    let s = record(emptyUndo(), a, b, 0);
    s = record(s, b, c, 100);
    s = record(s, c, d, 150);
    expect(s.past).toEqual([a, b, c]);
    const later = record(emptyUndo(), a, b, 0);
    expect(record(later, b, [L('1', 'x12'), L('2', 'y')], MERGE_MS + 1).past).toHaveLength(2);
  });

  it('clears redo on a new edit', () => {
    const a = [L('1', 'x')];
    const b = [L('1', 'x2')];
    const u = undo(record(emptyUndo(), a, b, 0), b)!;
    expect(u.state.future).toHaveLength(1);
    expect(record(u.state, a, [L('1', 'z')], 5000).future).toHaveLength(0);
  });

  it('reads the shortcuts', () => {
    const k = (key: string, o: { metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean } = {}) =>
      undoKey({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });
    expect(k('z', { metaKey: true })).toBe('undo');
    expect(k('Z', { metaKey: true, shiftKey: true })).toBe('redo');
    expect(k('y', { ctrlKey: true })).toBe('redo');
    expect(k('z')).toBe(null);
  });
});
