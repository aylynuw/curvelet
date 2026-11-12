/**
 * How the user styled a line: its colour (any CSS colour, already adjusted
 * for the theme), dash, width in pixels, and how strongly a region is filled.
 * Anything left out falls back to the line's colour slot and the defaults.
 */
export interface Look {
  color?: string;
  dash?: 'solid' | 'dashed' | 'dotted';
  width?: number;
  /** fill opacity of a region, 0 to 1 */
  fill?: number;
  /** a palette colour chosen for a point (curves take theirs through their series) */
  slot?: number;
}

/**
 * The dash pattern for a curve: the user's choice when there is one;
 * otherwise dashed only where it means something (the edge of a strict
 * inequality, which isn't part of the region).
 */
export function dashPattern(c: { dashed: boolean; dash?: Look['dash'] }, exam: boolean, width: number): number[] {
  if (c.dash === 'solid') return [];
  if (c.dash === 'dotted') return [0.1, Math.max(4, width * 2.4)];
  // dashes grow with the line, or round caps close the gaps on a thick one
  if (c.dash === 'dashed' || c.dashed) return exam ? [5, 4] : [Math.max(8, width * 3.2), Math.max(6, width * 2.4)];
  return [];
}
