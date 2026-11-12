/**
 * Editing a graphed shape by its numbers: the points written out in its line,
 * "(3, 4)", become handles; dragging one rewrites just that pair.
 */
const NUM = String.raw`[-−]?\d*\.?\d+(?:e[-+]?\d+)?`;
const pairRe = () => new RegExp(String.raw`\(\s*(${NUM})\s*,\s*(${NUM})\s*\)`, 'g');
const read = (s: string) => Number(s.replace('−', '-'));

export interface Literal {
  x: number;
  y: number;
  start: number;
  end: number;
}

/** every (x, y) written with plain numbers, in reading order */
export function literalPoints(src: string): Literal[] {
  const out: Literal[] = [];
  for (const m of src.matchAll(pairRe())) out.push({ x: read(m[1]!), y: read(m[2]!), start: m.index!, end: m.index! + m[0].length });
  return out;
}

/** a coordinate as it is written back: four decimals at most, whole numbers plain */
export function fmt(v: number): string {
  const r = Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) : Number(v.toFixed(4));
  return Object.is(r, -0) ? '0' : String(r);
}

/** the line with its k-th pair moved to (x, y) */
export function setLiteral(src: string, k: number, x: number, y: number): string {
  const l = literalPoints(src)[k];
  if (!l) return src;
  return `${src.slice(0, l.start)}(${fmt(x)}, ${fmt(y)})${src.slice(l.end)}`;
}

/** the line with every pair moved by (dx, dy) */
export function shiftLiterals(src: string, dx: number, dy: number): string {
  let out = '';
  let at = 0;
  for (const l of literalPoints(src)) {
    out += `${src.slice(at, l.start)}(${fmt(l.x + dx)}, ${fmt(l.y + dy)})`;
    at = l.end;
  }
  return out + src.slice(at);
}

/** the point names a line uses (A, B, P_1), in order, once each */
export function pointNames(src: string): string[] {
  const body = src.replace(/^\s*(let\s+|const\s+)?[A-Za-z]\w*\s*=/, '');
  return [...new Set([...body.matchAll(/(?<![\w.])([A-Z](?:_\{?\w+\}?)?)(?![\w(])/g)].map((m) => m[1]!))];
}

/**
 * Where the polylines of one curve cross those of the others, in screen pixels.
 * `segs` lists each curve's pieces as x1, y1, x2, y2.
 */
export function crossingsWith(mine: number[], others: number[], limit = 60): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  if (mine.length > 24000 || others.length > 400000) return out;
  // others bucketed on a 40 px grid, so each piece of mine meets only its neighbours
  const cell = 40;
  const grid = new Map<string, number[]>();
  for (let k = 0; k + 3 < others.length; k += 4) {
    const [x0, x1] = [Math.min(others[k]!, others[k + 2]!), Math.max(others[k]!, others[k + 2]!)];
    const [y0, y1] = [Math.min(others[k + 1]!, others[k + 3]!), Math.max(others[k + 1]!, others[k + 3]!)];
    if (x1 - x0 > 4000 || y1 - y0 > 4000) continue;
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++)
      for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) {
        const key = `${i},${j}`;
        const list = grid.get(key);
        if (list) list.push(k);
        else grid.set(key, [k]);
      }
  }
  const seen = new Set<number>();
  for (let a = 0; a + 3 < mine.length && out.length < limit; a += 4) {
    const [ax, ay, bx, by] = [mine[a]!, mine[a + 1]!, mine[a + 2]!, mine[a + 3]!];
    seen.clear();
    for (let i = Math.floor(Math.min(ax, bx) / cell); i <= Math.floor(Math.max(ax, bx) / cell); i++)
      for (let j = Math.floor(Math.min(ay, by) / cell); j <= Math.floor(Math.max(ay, by) / cell); j++)
        for (const k of grid.get(`${i},${j}`) ?? []) {
          if (seen.has(k)) continue;
          seen.add(k);
          const [cx, cy, dx, dy] = [others[k]!, others[k + 1]!, others[k + 2]!, others[k + 3]!];
          const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
          if (Math.abs(den) < 1e-12) continue;
          const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
          const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          const p = { x: ax + t * (bx - ax), y: ay + t * (by - ay) };
          if (!out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 6)) out.push(p);
        }
  }
  return out;
}
