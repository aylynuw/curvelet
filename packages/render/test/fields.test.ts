import { Workspace, type Graphable } from '@math/engine';
import { describe, expect, it } from 'vitest';
import { EXAM_THEME, buildScene, cobwebPath, encodeGif, fieldMarks, fromPx, fromPy, sceneToSvg, solutionThrough, type Viewport } from '../src';

const V: Viewport = { cx: 0, cy: 0, scale: 40, width: 400, height: 300 };

function graphs(...lines: string[]): Graphable[] {
  const w = new Workspace();
  lines.forEach((src, k) => w.set(String(k + 1), src));
  return w.graphables();
}
const only = <K extends Graphable['kind']>(g: Graphable[], kind: K) => g.find((x) => x.kind === kind) as Extract<Graphable, { kind: K }>;

describe('slope and vector fields', () => {
  it('puts one mark per grid point, pointing along the slope', () => {
    const g = only(graphs('slopefield(x)'), 'field');
    const segs = fieldMarks(g, V);
    // 400×300 at 28 px: 14 × 10 marks, four numbers each
    expect(segs.length).toBe(14 * 10 * 4);
    for (let k = 0; k < segs.length; k += 4) {
      const [x0, y0, x1, y1] = segs.slice(k, k + 4) as [number, number, number, number];
      const mx = fromPx(V, (x0 + x1) / 2);
      // screen y flips, so the slope on screen is minus the plane's
      expect(-(y1 - y0) / (x1 - x0)).toBeCloseTo(mx, 6);
      void fromPy;
    }
  });

  it('draws arrows (a shaft and two head strokes) for vector fields', () => {
    const g = only(graphs('vectorfield(-y, x)'), 'field');
    const segs = fieldMarks(g, V);
    // the mark at the origin has zero length and is left out
    expect(segs.length % 12).toBe(0);
    expect(segs.length / 12).toBeGreaterThan(100);
  });

  it('follows dy/dx = y through (0, 1) as e^x', () => {
    const g = only(graphs('slopefield(y, (0, 1))'), 'field');
    const line = solutionThrough(g, { x: 0, y: 1 }, V);
    expect(line.length).toBeGreaterThan(40);
    let worst = 0;
    for (let k = 0; k < line.length; k += 2) {
      const x = fromPx(V, line[k]!);
      const y = fromPy(V, line[k + 1]!);
      worst = Math.max(worst, Math.abs(y - Math.exp(x)));
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it('closes the circles of vectorfield(-y, x)', () => {
    const g = only(graphs('vectorfield(-y, x, (2, 0))'), 'field');
    const line = solutionThrough(g, { x: 2, y: 0 }, V);
    for (let k = 0; k < line.length; k += 2) {
      expect(Math.hypot(fromPx(V, line[k]!), fromPy(V, line[k + 1]!))).toBeCloseTo(2, 4);
    }
    // once round (2π·2 long, about 1.5 px a step), then stops
    expect(line.length / 2).toBeLessThan((4 * Math.PI * 40) / 1.5 + 10);
  });

  it('builds a scene with thin marks, solution curves and the seeds', () => {
    const s = buildScene(graphs('slopefield(x - y, (0, 0), (0, 2))'), V, { style: 'screen', series: () => 0 });
    const marks = s.curves.find((c) => c.id.endsWith(':marks'))!;
    expect(marks.weight).toBeLessThan(1);
    expect(s.curves.find((c) => c.id === '1')!.lines).toHaveLength(2);
    expect(s.points.filter((p) => p.id === '1')).toHaveLength(2);
    expect(sceneToSvg(s, EXAM_THEME)).toContain('<svg');
  });
});

describe('cobweb diagrams', () => {
  it('goes up to the curve and across to y = x', () => {
    const path = cobwebPath((x) => Math.cos(x), 1, 3, V);
    const pts: [number, number][] = [];
    for (let k = 0; k < path.length; k += 2) pts.push([fromPx(V, path[k]!), fromPy(V, path[k + 1]!)]);
    expect(pts[0]).toEqual([1, 0]);
    expect(pts[1]![1]).toBeCloseTo(Math.cos(1), 12);
    expect(pts[2]![0]).toBeCloseTo(Math.cos(1), 12);
    expect(pts[2]![1]).toBeCloseTo(Math.cos(1), 12);
    expect(pts).toHaveLength(1 + 2 * 3);
  });

  it('draws y = x in ink beside the curve', () => {
    const s = buildScene(graphs('let f(x) = 3.2x(1 - x)', 'cobweb(f, 0.2, 20)'), { ...V, scale: 200, cx: 0.5, cy: 0.5 }, { style: 'screen', series: () => 1 });
    expect(s.curves.find((c) => c.id === '2:diagonal')!.ink).toBe(true);
    expect(s.curves.find((c) => c.id === '2:path')!.lines[0]!.length).toBe(2 * 41);
  });
});

describe('GIF encoder', () => {
  it('writes a looping GIF89a with one image per frame', () => {
    const w = 37;
    const h = 23;
    const frames = [0, 1, 2].map((k) => {
      const f = new Uint8ClampedArray(w * h * 4);
      for (let p = 0; p < w * h; p++) {
        const red = (p % w) < 10 + k * 5;
        f.set(red ? [220, 40, 40, 255] : [255, 255, 255, 255], p * 4);
      }
      return f;
    });
    const gif = encodeGif(frames, w, h, 5);
    expect(String.fromCharCode(...gif.slice(0, 6))).toBe('GIF89a');
    expect(gif[6]! | (gif[7]! << 8)).toBe(w);
    expect(gif[8]! | (gif[9]! << 8)).toBe(h);
    expect(gif.at(-1)).toBe(0x3b);
    expect(String.fromCharCode(...gif.slice(13 + 768 + 3, 13 + 768 + 14))).toBe('NETSCAPE2.0');
    // count image descriptors by walking the blocks
    let at = 13 + 768;
    let images = 0;
    while (gif[at] !== 0x3b) {
      if (gif[at] === 0x21) {
        at += 2;
        while (gif[at] !== 0) at += gif[at]! + 1;
        at++;
      } else if (gif[at] === 0x2c) {
        images++;
        at += 10 + 1;
        while (gif[at] !== 0) at += gif[at]! + 1;
        at++;
      } else throw new Error(`bad block at ${at}`);
    }
    expect(images).toBe(3);
  });
});

describe('exam curve labels', () => {
  it('stay inside the figure when two steep curves leave at the top together', () => {
    const s = buildScene(graphs('y = 10x', 'y = 10x + 0.4', 'y = 10x - 0.4'), V, { style: 'exam', series: () => 0, curveLabels: true });
    const labels = s.labels.filter((l) => l.kind === 'curve');
    expect(labels).toHaveLength(3);
    for (const l of labels) {
      expect(l.y).toBeGreaterThanOrEqual(15);
      expect(l.y).toBeLessThanOrEqual(V.height);
    }
    // and apart from each other
    const ys = labels.map((l) => l.y).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThan(10);
    expect(ys[2]! - ys[1]!).toBeGreaterThan(10);
  });
});

describe('line looks', () => {
  it("the user's colour, dash, width and fill reach every renderer; no dashes by default", () => {
    const g = graphs('y < x^2', 'y = 2x', 'y = sin(x)');
    const look = (id: string) => (id === '1' ? { color: '#ff8800', dash: 'dotted' as const, width: 4, fill: 0.4 } : undefined);
    const s = buildScene(g, V, { style: 'screen', series: () => 9, look });
    const c1 = s.curves.find((c) => c.id === '1')!;
    expect([c1.color, c1.dash, c1.width]).toEqual(['#ff8800', 'dotted', 4]);
    expect(s.fills.find((f) => f.id === '1')!.opacity).toBe(0.4);
    // a high colour slot no longer means dash-dot
    const svg = sceneToSvg(s, { ...EXAM_THEME, curves: ['#111', '#222'] });
    expect(svg).toContain('stroke="#ff8800"');
    expect(svg.match(/stroke-dasharray/g)?.length).toBe(1);
  });
});
