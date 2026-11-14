import type { Range } from './fit';

/**
 * The part of the plane the Graph tab showed last, so a worksheet figure
 * taken from the graph shows what the student was looking at. Kept for
 * this visit only.
 */
let last: Range | null = null;
export const graphView = () => last;
export function setGraphView(r: Range) {
  last = r;
}
