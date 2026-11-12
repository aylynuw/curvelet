import { parse, printNode } from '@math/engine';
import { cloud, greedyMatch, type P, type Stroke } from './pdollar';
import { TEMPLATES, TEXT } from './templates';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** one recognized symbol, where it is, and how sure the match is (lower is better) */
export interface Sym {
  label: string;
  box: Box;
  cost: number;
  /** the other labels it was close to, best first, so a wrong guess can be swapped */
  alternatives: string[];
}

export interface Template {
  label: string;
  cloud: P[];
  /** how many strokes (or, in a photo, pieces) it is made of */
  strokes: number;
}

/** the built-in handwriting templates, as clouds */
export const HAND_TEMPLATES: Template[] = Object.entries(TEMPLATES).flatMap(([label, variants]) => variants.map((v) => ({ label, cloud: cloud(v), strokes: v.length })));

/**
 * A square-root sign: the stroke's last part runs right along the top of
 * its box, for at least half its width, after a dip below the middle.
 */
export function rootShape(points: { x: number; y: number }[]): boolean {
  if (points.length < 4) return false;
  const b = boxOf([points]);
  if (w(b) < 0.8 * h(b)) return false;
  const top = b.y0 + 0.12 * h(b);
  // where the stroke reaches the top for good
  let k = points.length - 1;
  while (k > 0 && points[k - 1]!.y <= top) k--;
  const tail = points.slice(k);
  const tailWidth = (tail.at(-1)?.x ?? 0) - (tail[0]?.x ?? 0);
  // the check mark: its lowest point is near the left, well below the middle
  const lowest = points.slice(0, k + 1).reduce((a, p) => (p.y > a.y ? p : a), points[0]!);
  return tailWidth > 0.5 * w(b) && lowest.y > b.y0 + 0.6 * h(b) && lowest.x < b.x0 + 0.4 * w(b) && k >= 2;
}

export const boxOf = (strokes: Stroke[]): Box => {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const st of strokes)
    for (const p of st) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  return { x0, y0, x1, y1 };
};
const w = (b: Box) => b.x1 - b.x0;
const h = (b: Box) => b.y1 - b.y0;
const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

/**
 * The best label for a cloud of points. Flat shapes (a dash), and specks
 * (a dot), are told by their size first: their clouds say little.
 */
export function classify(points: P[], box: Box, lineHeight: number, templates: Template[], anyStrokes = false): Omit<Sym, 'box'> {
  const flat = h(box) < 0.22 * Math.max(w(box), 1e-9) && w(box) > 0.25 * lineHeight;
  const strokes = new Set(points.map((p) => p.s)).size;
  // costs like a good match (0.3), so a dash isn't favoured over a symbol that contains one
  if (flat && strokes === 1) return { label: '-', cost: 0.3, alternatives: [] };
  if (Math.max(w(box), h(box)) < 0.18 * lineHeight) return { label: '.', cost: 0.3, alternatives: [] };
  // a root: a check mark, then a bar along the top as long as what it covers
  // only shapes drawn with as many strokes: a root and the 2 under it are never one symbol
  // (in a photo, pieces of ink don't count strokes: a printed + is one piece)
  const fit = anyStrokes ? templates : templates.filter((t) => t.strokes === strokes);
  if (fit.length === 0) return { label: '?', cost: Infinity, alternatives: [] };
  const scored = fit.map((t) => ({ label: t.label, d: greedyMatch(points, t.cloud) })).sort((a, b) => a.d - b.d);
  const best = scored[0]!;
  const alternatives = [...new Set(scored.slice(1).map((s) => s.label))].filter((l) => l !== best.label).slice(0, 3);
  return { label: best.label, cost: best.d, alternatives };
}

/**
 * Strokes, in the order they were drawn, to symbols: neighbouring strokes
 * that overlap are tried together (a +, an x, an =, a π), and the grouping
 * with the best total match wins.
 */
export function strokesToSymbols(strokes: Stroke[], templates: Template[] = HAND_TEMPLATES): Sym[] {
  const kept = strokes.filter((s) => s.length > 0);
  if (kept.length === 0) return [];
  const boxes = kept.map((s) => boxOf([s]));
  // the size of an ordinary symbol: the median stroke group height, roughly
  const heights = boxes.map((b) => Math.max(h(b), w(b))).sort((a, b) => a - b);
  const lineHeight = heights[Math.floor(heights.length / 2)]! || 1;

  const near = (a: Box, b: Box) => {
    const tol = 0.2 * Math.max(h(a), w(a), h(b), w(b), lineHeight * 0.3);
    if (a.x0 - tol <= b.x1 && b.x0 - tol <= a.x1 && a.y0 - tol <= b.y1 && b.y0 - tol <= a.y1) return true;
    // stacked: the two bars of =, the dot of i
    const overlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const gap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
    return overlap > 0.5 * Math.min(w(a), w(b)) && gap < 0.6 * lineHeight;
  };
  // a good match costs about 0.35 and a wrong one 0.9 or more (measured on the templates):
  // 0.5 a symbol joins strokes that make one symbol, and keeps neighbours apart
  const PER_SYMBOL = 0.5;
  const best: { cost: number; syms: Sym[] }[] = [{ cost: 0, syms: [] }];
  for (let i = 1; i <= kept.length; i++) {
    best[i] = { cost: Infinity, syms: [] };
    for (let k = 1; k <= Math.min(3, i); k++) {
      const group = kept.slice(i - k, i);
      const gboxes = boxes.slice(i - k, i);
      // every stroke in a group touches the rest of it
      if (k > 1 && !gboxes.every((b, j) => gboxes.some((o, m) => m !== j && near(b, o)))) continue;
      const box = gboxes.reduce(union);
      // the points keep their stroke numbers within the group
      const pts = cloud(group);
      // rootShape needs the stroke as drawn, not resampled
      const r = k === 1 && rootShape(group[0]!.map((p) => ({ ...p, s: 0 }))) ? { label: '√', cost: 0.3, alternatives: [] } : classify(pts, box, lineHeight, templates);
      // strokes are joined only into a symbol they clearly make
      if (k > 1 && r.cost > 1) continue;
      // two strokes read as one symbol only when that symbol is drawn with several strokes
      const cost = best[i - k]!.cost + r.cost + PER_SYMBOL;
      if (cost < best[i]!.cost) best[i] = { cost, syms: [...best[i - k]!.syms, { ...r, box }] };
    }
  }
  return best[kept.length]!.syms;
}

/** symbols laid out on the page, to a calculator line: powers raised, fractions stacked, roots over their contents */
export function layout(symbols: Sym[]): string {
  if (symbols.length === 0) return '';
  return read(symbols.map((s) => ({ ...s, kind: 'sym' as const })));
}

type Item = (Sym & { kind: 'sym' }) | { kind: 'group'; text: string; box: Box; label: string };

const OPERATORS = new Set(['-', '=', '+', '<', '>', '.']);

function read(items: Item[]): string {
  if (items.length === 0) return '';
  const heights = items.filter((i) => i.kind === 'group' || !'-.='.includes(i.label)).map((i) => h(i.box)).sort((a, b) => a - b);
  const H = heights[Math.floor(heights.length / 2)] ?? h(items[0]!.box);

  // fraction bars: a dash wider than what is above and below it
  const bars = items
    .filter((i): i is Sym & { kind: 'sym' } => i.kind === 'sym' && i.label === '-')
    .sort((a, b) => w(b.box) - w(a.box));
  for (const bar of bars) {
    const inX = (i: Item) => {
      const c = (i.box.x0 + i.box.x1) / 2;
      return i !== bar && c >= bar.box.x0 && c <= bar.box.x1;
    };
    const cy = (i: Item) => (i.box.y0 + i.box.y1) / 2;
    const above = items.filter((i) => inX(i) && cy(i) < bar.box.y0);
    const below = items.filter((i) => inX(i) && cy(i) > bar.box.y1);
    if (above.length && below.length) {
      const rest = items.filter((i) => i !== bar && !above.includes(i) && !below.includes(i));
      const box = [bar.box, ...above.map((i) => i.box), ...below.map((i) => i.box)].reduce(union);
      const group: Item = { kind: 'group', text: `(${read(above)})/(${read(below)})`, box, label: 'frac' };
      return read([...rest, group]);
    }
  }

  // a root: what sits under its bar
  const root = items.find((i) => i.kind === 'sym' && i.label === '√');
  if (root) {
    const lead = root.box.x0 + 0.3 * w(root.box);
    const inside = items.filter((i) => i !== root && (i.box.x0 + i.box.x1) / 2 > lead && (i.box.x0 + i.box.x1) / 2 < root.box.x1 + 0.05 * H);
    const rest = items.filter((i) => i !== root && !inside.includes(i));
    const group: Item = { kind: 'group', text: `sqrt(${read(inside)})`, box: [root.box, ...inside.map((i) => i.box)].reduce(union), label: 'sqrt' };
    return read([...rest, group]);
  }

  // left to right; a symbol whose bottom sits above the middle of the one before it starts an exponent
  const row = [...items].sort((a, b) => a.box.x0 - b.box.x0);
  let out = '';
  let base: Item | null = null;
  const isOp = (i: Item) => i.kind === 'sym' && OPERATORS.has(i.label);
  const raised = (i: Item, b: Item) => !isOp(i) && !isOp(b) && i.box.y1 < b.box.y0 + 0.5 * h(b.box) && h(i.box) < 1.1 * h(b.box);
  for (let k = 0; k < row.length; k++) {
    const it = row[k]!;
    if (base && raised(it, base)) {
      const exp: Item[] = [];
      while (k < row.length && raised(row[k]!, base)) exp.push(row[k++]!);
      k--;
      out += `^(${read(exp)})`;
      continue;
    }
    out += it.kind === 'group' ? it.text : (TEXT[it.label] ?? it.label);
    base = it;
  }
  return out;
}

/** the line written back out by the calculator (2x+1 → 2x + 1), or as read when it doesn't parse yet */
export function tidyLine(text: string): { text: string; ok: boolean } {
  try {
    const st = parse(text);
    if (st.kind === 'expr') return { text: printNode(st.expr), ok: true };
    if (st.kind === 'relation') return { text: `${printNode(st.left)} ${st.op} ${printNode(st.right)}`, ok: true };
    return { text, ok: true };
  } catch {
    return { text, ok: false };
  }
}

/** strokes to a calculator line */
export function recognizeInk(strokes: Stroke[], templates?: Template[]): { text: string; ok: boolean; symbols: Sym[] } {
  const symbols = strokesToSymbols(strokes, templates);
  return { ...tidyLine(layout(symbols)), symbols };
}
