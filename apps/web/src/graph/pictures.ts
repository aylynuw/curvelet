import { PICTURES_KEY } from '../files/keys';

/** an image on the plane, like a Desmos image: centre, size in plane units, turn, opacity 0 to 1 */
export interface GraphPicture {
  id: string;
  src: string;
  /** the file it came from */
  name?: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** counter-clockwise, in radians */
  angle?: number;
  opacity: number;
}

export function loadPictures(): GraphPicture[] {
  try {
    const v = JSON.parse(localStorage.getItem(PICTURES_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((p) => p && typeof p.src === 'string') : [];
  } catch {
    return [];
  }
}
export function savePictures(list: GraphPicture[]) {
  try {
    localStorage.setItem(PICTURES_KEY, JSON.stringify(list));
  } catch {
    // too big for this browser's storage: kept for this visit (and in the project)
  }
}

/** a plane point in the picture's own frame (its centre at 0, its sides along the axes) */
export function toLocal(p: GraphPicture, x: number, y: number): [number, number] {
  const a = -(p.angle ?? 0);
  const [dx, dy] = [x - p.cx, y - p.cy];
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}
/** back from the picture's frame (turned by `angle` about `c`) to the plane */
export function fromLocal(c: [number, number], angle: number, u: number, v: number): [number, number] {
  return [c[0] + u * Math.cos(angle) - v * Math.sin(angle), c[1] + u * Math.sin(angle) + v * Math.cos(angle)];
}
export const nice = (v: number) => Number(v.toPrecision(4));
