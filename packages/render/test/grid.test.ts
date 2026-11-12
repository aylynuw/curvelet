import { describe, expect, it } from 'vitest';
import { buildScene, piLabel, piStep, type Viewport } from '../src';

const v: Viewport = { width: 800, height: 600, cx: 0, cy: 0, scale: 50 };
const scene = (opts: Partial<Parameters<typeof buildScene>[2]> = {}) => buildScene([], v, { style: 'screen', series: () => 0, ...opts });

describe('graph settings', () => {
  it('numbers the x-axis in multiples of π', () => {
    expect(piLabel(1, 1, 2)).toBe('π/2');
    expect(piLabel(-3, 1, 2)).toBe('−3π/2');
    expect(piLabel(2, 1, 2)).toBe('π');
    expect(piLabel(4, 1, 2)).toBe('2π');
    expect(piStep(1.5).step).toBeCloseTo(Math.PI / 2);
    const ticks = scene({ piTicks: true }).labels.filter((l) => l.kind === 'tick').map((l) => l.text);
    expect(ticks).toContain('π');
    expect(ticks).toContain('−π');
  });
  it('draws a polar grid or none', () => {
    const polar = scene({ grid: 'polar' });
    const square = scene();
    expect(polar.gridMajor.length).toBeGreaterThan(0);
    // rings are many short segments, not full-width lines
    expect(polar.gridMajor.length).toBeGreaterThan(square.gridMajor.length);
    const none = scene({ grid: 'none' });
    expect(none.gridMajor.length + none.gridMinor.length).toBe(0);
  });
});
