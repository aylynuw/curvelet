import { N, normalize, type P, type Stroke } from './pdollar';
import { classify, layout, tidyLine, type Box, type Sym, type Template } from './recognize';

/** A one-bit image: 1 where there is ink. */
export interface Mask {
  w: number;
  h: number;
  data: Uint8Array;
}

/**
 * Ink from a photo: dark marks on lighter paper, judged against the local
 * brightness (a window about 1/12 of the picture), so shadows and uneven
 * light don't swallow the writing. Light ink on a dark board is flipped.
 */
export function binarize(rgba: Uint8ClampedArray, w: number, h: number): Mask {
  const gray = new Float64Array(w * h);
  let mean = 0;
  for (let p = 0; p < w * h; p++) {
    gray[p] = 0.299 * rgba[p * 4]! + 0.587 * rgba[p * 4 + 1]! + 0.114 * rgba[p * 4 + 2]!;
    mean += gray[p]!;
  }
  mean /= w * h;
  // a dark background (a blackboard): flip, so ink is always the darker
  if (mean < 110) for (let p = 0; p < w * h; p++) gray[p] = 255 - gray[p]!;
  // integral image for local means
  const sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x]!;
      sum[(y + 1) * (w + 1) + x + 1] = sum[y * (w + 1) + x + 1]! + row;
    }
  }
  const r = Math.max(4, Math.round(Math.max(w, h) / 24));
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [x0, y0, x1, y1] = [Math.max(0, x - r), Math.max(0, y - r), Math.min(w, x + r + 1), Math.min(h, y + r + 1)];
      const area = (x1 - x0) * (y1 - y0);
      const local = (sum[y1 * (w + 1) + x1]! - sum[y0 * (w + 1) + x1]! - sum[y1 * (w + 1) + x0]! + sum[y0 * (w + 1) + x0]!) / area;
      // darker than its surroundings by a clear margin, and dark enough to be ink
      data[y * w + x] = gray[y * w + x]! < local * 0.82 && gray[y * w + x]! < 200 ? 1 : 0;
    }
  }
  return { w, h, data };
}

export interface Component {
  pixels: number[];
  box: Box;
}

/** connected pieces of ink (8-connected); specks under `minPixels` are dust */
export function components(m: Mask, minPixels = 6): Component[] {
  const seen = new Uint8Array(m.w * m.h);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < m.data.length; start++) {
    if (!m.data[start] || seen[start]) continue;
    const pixels: number[] = [];
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      pixels.push(p);
      const x = p % m.w;
      const y = (p - x) / m.w;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
          const q = ny * m.w + nx;
          if (m.data[q] && !seen[q]) {
            seen[q] = 1;
            stack.push(q);
          }
        }
      }
    }
    if (pixels.length >= minPixels) out.push({ pixels, box: { x0, y0, x1: x1 + 1, y1: y1 + 1 } });
  }
  return out;
}

/** n points spread evenly over a set (farthest-point sampling), keeping which piece each came from */
export function spread(points: P[], n = N): P[] {
  if (points.length <= n) {
    const out = [...points];
    while (out.length < n) out.push({ ...points[out.length % points.length]! });
    return out;
  }
  const chosen: P[] = [points[0]!];
  const dist = points.map((p) => Math.hypot(p.x - points[0]!.x, p.y - points[0]!.y));
  while (chosen.length < n) {
    let far = 0;
    for (let i = 1; i < points.length; i++) if (dist[i]! > dist[far]!) far = i;
    const q = points[far]!;
    chosen.push(q);
    for (let i = 0; i < points.length; i++) dist[i] = Math.min(dist[i]!, Math.hypot(points[i]!.x - q.x, points[i]!.y - q.y));
  }
  return chosen;
}

/** strokes drawn as thick ink into a mask: to make photo templates from the handwriting ones, and for tests */
export function rasterize(strokes: Stroke[], w: number, h: number, pen: number): Mask {
  const data = new Uint8Array(w * h);
  const r = pen / 2;
  const dot = (cx: number, cy: number) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if (x >= 0 && y >= 0 && x < w && y < h && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) data[y * w + x] = 1;
  };
  for (const st of strokes) {
    for (let i = 0; i < st.length; i++) {
      const a = st[i]!;
      const b = st[i + 1] ?? a;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (r * 0.5 || 1)));
      for (let k = 0; k <= n; k++) dot(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n);
    }
  }
  return { w, h, data };
}

const width = (b: Box) => b.x1 - b.x0;
const height = (b: Box) => b.y1 - b.y0;

/**
 * Pieces that make one symbol: the two bars of =, the dot of i or ÷.
 * A fraction bar is never merged with what is above or below it: only
 * bars of about the same width pair up.
 */
function groupPieces(comps: Component[], lineHeight: number): Component[][] {
  const flat = (c: Component) => height(c.box) < 0.3 * width(c.box);
  const speck = (c: Component) => Math.max(width(c.box), height(c.box)) < 0.2 * lineHeight;
  const used = new Set<number>();
  const groups: Component[][] = [];
  comps.forEach((a, i) => {
    if (used.has(i)) return;
    const group = [a];
    used.add(i);
    comps.forEach((b, j) => {
      if (used.has(j)) return;
      const overlap = Math.min(a.box.x1, b.box.x1) - Math.max(a.box.x0, b.box.x0);
      const gap = Math.max(a.box.y0, b.box.y0) - Math.min(a.box.y1, b.box.y1);
      if (overlap < 0.5 * Math.min(width(a.box), width(b.box)) || gap > 0.6 * lineHeight) return;
      const bars = flat(a) && flat(b) && Math.abs(width(a.box) - width(b.box)) < 0.35 * Math.max(width(a.box), width(b.box));
      const dotOver = (speck(a) && !speck(b)) || (speck(b) && !speck(a) && !flat(a));
      if (bars || (dotOver && !flat(a) && !flat(b))) {
        group.push(b);
        used.add(j);
      }
    });
    groups.push(group);
  });
  return groups;
}

/** a symbol's pieces as one point cloud, each piece keeping its own id */
export function piecesCloud(pieces: Component[], m: Mask): P[] {
  // every inked pixel, spread out: thinning thick pen strokes leaves spurs that mislead the match
  const pts = pieces.flatMap((c, s) => c.pixels.map((p) => ({ x: p % m.w, y: Math.floor(p / m.w), s })));
  return normalize(spread(pts.length ? pts : [{ x: 0, y: 0, s: 0 }]));
}

/** templates for photos: shapes drawn as ink, thinned, the same way a photo is read */
export function photoTemplatesFromStrokes(shapes: Record<string, Stroke[][]>): Template[] {
  const S = 64;
  // a fine pen and a thick one: small symbols in a photo are thick for their size, and thin badly
  return Object.entries(shapes).flatMap(([label, variants]) =>
    variants.flatMap((v) =>
      [5, 9].map((pen) => {
        const scaled = v.map((st) => st.map((p) => ({ x: 12 + p.x * S * 0.8, y: 12 + p.y * S * 0.8 })));
        const m = rasterize(scaled, S * 2, S * 2, pen);
        const comps = components(m, 1);
        return { label, cloud: piecesCloud(comps, m), strokes: comps.length };
      }),
    ),
  );
}

/** a picture of written or printed math to a calculator line */
export function recognizeImage(rgba: Uint8ClampedArray, w: number, h: number, templates: Template[]): { text: string; ok: boolean; symbols: Sym[] } {
  const m = binarize(rgba, w, h);
  const comps = components(m, Math.max(6, Math.round((w * h) / 40000)));
  if (comps.length === 0) return { text: '', ok: false, symbols: [] };
  // drop pieces touching the picture's edge that span most of it: page edges, a table
  const kept = comps.filter((c) => !(width(c.box) > 0.8 * w || height(c.box) > 0.8 * h));
  const sizes = kept.map((c) => height(c.box)).sort((a, b) => a - b);
  const lineHeight = sizes[Math.floor(sizes.length * 0.75)] ?? 1;
  const symbols: Sym[] = groupPieces(kept, lineHeight).map((pieces) => {
    const box = pieces.map((c) => c.box).reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }));
    const flatPair = pieces.length === 2 && pieces.every((c) => height(c.box) < 0.3 * width(c.box));
    if (flatPair) return { label: '=', box, cost: 0.3, alternatives: [] };
    const r = classify(piecesCloud(pieces, m), box, lineHeight, templates, true);
    return { ...r, box };
  });
  return { ...tidyLine(layout(symbols)), symbols };
}
