import { describe, expect, it } from 'vitest';
import { cleanLook, forDark, hexToOklch, oklchToHex, renderLook, slotOf } from '../src/graph/looks';

describe('line looks', () => {
  it('hex ⇄ OKLCH round trip', () => {
    for (const hex of ['#ff8800', '#1a2b3c', '#2d70b3', '#ffffff', '#000000', '#c74440']) {
      const [L, C, H] = hexToOklch(hex);
      expect(oklchToHex(L, C, H)).toBe(hex);
    }
  });
  it('dark colours are lifted in dark mode, light ones kept', () => {
    expect(hexToOklch(forDark('#1a237e'))[0]).toBeCloseTo(0.72, 1);
    expect(forDark('#ffd54f')).toBe('#ffd54f');
    expect(renderLook({ color: '#1a237e', exact: true }, true)?.color).toBe('#1a237e');
  });
  it('slots and cleaning', () => {
    expect(slotOf('c3')).toBe(2);
    expect(slotOf('#123456')).toBeNull();
    expect(cleanLook({ color: '#ABCDEF', dash: 'dotted', width: 99, hidden: true, evil: 1 })).toEqual({ color: '#abcdef', dash: 'dotted', hidden: true });
    expect(cleanLook({ color: 'red' })).toBeUndefined();
  });
});
