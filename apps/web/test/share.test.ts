import { DEFAULT_SETTINGS } from '@math/engine';
import { describe, expect, it } from 'vitest';
import { decodeShared, encodeShared } from '../src/share';

describe('share links', () => {
  it('carry tables, sliders, notes, folders, looks and the name', async () => {
    const items = [
      { source: '', folder: { title: 'Data', collapsed: true } },
      { source: 'points([1, 2], [3, 5])', table: { x: ['1', '2', ''], y: ['3', '5', ''] } },
      { source: 'a = 2', slider: { min: 0, max: 5, step: 0.5 } },
      { source: '', note: 'Slope is a' },
      { source: 'y = a x', look: { color: '#ff8800', dash: 'dashed' as const } },
    ];
    const back = await decodeShared(await encodeShared({ items, settings: DEFAULT_SETTINGS, name: 'Lesson 3' }));
    expect(back).toEqual({ items, settings: DEFAULT_SETTINGS, name: 'Lesson 3' });
  });
  it('still open links made before (sources with looks by position)', async () => {
    const old = `j${Buffer.from(JSON.stringify({ lines: ['y = x', 'a = 1'], looks: [{ color: '#112233' }, null], settings: DEFAULT_SETTINGS })).toString('base64url')}`;
    expect((await decodeShared(old))?.items).toEqual([{ source: 'y = x', look: { color: '#112233' } }, { source: 'a = 1' }]);
  });
});
