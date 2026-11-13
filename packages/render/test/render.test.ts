import { Workspace, type Graphable } from '@math/engine';
import { describe, expect, it } from 'vitest';
import {
  EXAM_THEME,
  buildScene,
  contour,
  fromPx,
  fromPy,
  gridStep,
  implicitRegion,
  mathRuns,
  panBy,
  sampleCurve,
  sceneToSvg,
  tickLabel,
  toPx,
  toPy,
  zoomAt,
  type Viewport,
} from '../src';

const V: Viewport = { cx: 0, cy: 0, scale: 40, width: 400, height: 300 };

function graphs(...lines: string[]): Graphable[] {
  const w = new Workspace();
  lines.forEach((src, k) => w.set(String(k + 1), src));
  return w.graphables();
}

describe('viewport', () => {
  it('maps the plane to the screen and back', () => {
    expect([toPx(V, 0), toPy(V, 0)]).toEqual([200, 150]);
    expect([toPx(V, 1), toPy(V, 1)]).toEqual([240, 110]);
    expect([fromPx(V, 240), fromPy(V, 110)]).toEqual([1, 1]);
  });

  it('zooms around the pointer and pans by drag', () => {
    const z = zoomAt(V, 2, 240, 110); // keep (1, 1) under the pointer
    expect(fromPx(z, 240)).toBeCloseTo(1, 12);
    expect(fromPy(z, 110)).toBeCloseTo(1, 12);
    expect(panBy(V, 40, 0).cx).toBe(-1);
  });

  it('picks 1, 2, 5 grid steps', () => {
    expect(gridStep(40)).toEqual({ major: 2, minor: 0.5 });
    expect(gridStep(80).major).toBe(1);
    expect(gridStep(1).major).toBe(100);
    expect(gridStep(1000).major).toBe(0.1);
  });

  it('writes axis numbers without float noise', () => {
    expect(tickLabel(0.30000000000000004, 0.1)).toBe('0.3');
    expect(tickLabel(-0, 1)).toBe('0');
    expect(tickLabel(2e7, 1e7)).toBe('2e7');
  });
});

describe('sampling', () => {
  it('draws a smooth curve as one line', () => {
    expect(sampleCurve(Math.sin, 'y', V)).toHaveLength(1);
  });

  it('breaks at poles like 1/x and tan', () => {
    expect(sampleCurve((x) => 1 / x, 'y', V)).toHaveLength(2);
    // tan has poles at ±π/2 within x ∈ [-5, 5]: also at ±3π/2 → 5 pieces
    expect(sampleCurve(Math.tan, 'y', V)).toHaveLength(5);
  });

  it('stops where the function is undefined', () => {
    const lines = sampleCurve(Math.sqrt, 'y', V);
    expect(lines).toHaveLength(1);
    expect(fromPx(V, lines[0]![0]!)).toBeGreaterThanOrEqual(0);
  });

  it('finds x^2 + y^2 = 9 as points on the circle', () => {
    const segs = contour((x, y) => x * x + y * y - 9, V);
    expect(segs.length).toBeGreaterThan(100);
    for (let k = 0; k < segs.length; k += 2) {
      const r = Math.hypot(fromPx(V, segs[k]!), fromPy(V, segs[k + 1]!));
      expect(Math.abs(r - 3)).toBeLessThan(0.05);
    }
  });

  it('skips the false crossing at a pole', () => {
    // y = 1/x as F = y - 1/x: the sign flips across x = 0 without a zero there
    const segs = contour((x, y) => y - 1 / x, V);
    for (let k = 0; k < segs.length; k += 2) expect(Math.abs(fromPx(V, segs[k]!))).toBeGreaterThan(0.05);
  });

  it('fills only where an inequality holds', () => {
    const rects = implicitRegion((x, y) => x * x + y * y - 4, '<', V);
    const area = rects.reduce((sum, _, k) => (k % 4 === 2 ? sum + rects[k]! * rects[k + 1]! : sum), 0) / V.scale ** 2;
    expect(area).toBeCloseTo(Math.PI * 4, 0);
  });
});

describe('scenes', () => {
  it('draws a grid, axes and curves on screen', () => {
    const s = buildScene(graphs('y = x^2', 'let P = (1, 2)'), V, { style: 'screen', series: () => 0 });
    expect(s.gridMajor.length).toBeGreaterThan(0);
    expect(s.axes).toHaveLength(8);
    expect(s.curves[0]!.lines.length).toBe(1);
    expect(s.labels.find((l) => l.kind === 'point')?.text).toBe('P (1, 2)');
  });

  it('dashes strict inequalities and fills their side', () => {
    const s = buildScene(graphs('y > x'), V, { style: 'screen', series: () => 0 });
    expect(s.curves[0]!.dashed).toBe(true);
    expect(s.fills[0]!.polys).toHaveLength(1);
  });

  it('draws an exam figure: no grid, arrows, x, y, O, guides to the axes', () => {
    const s = buildScene(graphs('let f(x) = x^2/2', 'let A = (2, 2)'), V, { style: 'exam', series: () => 0 });
    expect(s.gridMajor).toEqual([]);
    expect(s.arrows).toHaveLength(2);
    expect(s.labels.filter((l) => l.kind === 'axis').map((l) => l.text)).toEqual(['x', 'y']);
    expect(s.labels.find((l) => l.kind === 'origin')?.text).toBe('O');
    expect(s.guides).toHaveLength(8);
    expect(s.labels.filter((l) => l.kind === 'guide').map((l) => l.text)).toEqual(['2', '2']);
    expect(s.labels.find((l) => l.kind === 'point')?.text).toBe('A');
    expect(s.labels.find((l) => l.kind === 'curve')?.text).toBe('y = f(x)');
    const neg = buildScene(graphs('let B = (-3, -1)'), V, { style: 'exam', series: () => 0 });
    expect(neg.labels.filter((l) => l.kind === 'guide').map((l) => l.text)).toEqual(['\u22123', '\u22121']);
  });

  it('sets exam guide numbers as stacked fractions, and takes hand edits', () => {
    const coord = (n: number) => (n === 2.2 ? '11/5' : n === -0.5 ? '-1/2' : String(n));
    const g = graphs('let A = (2.2, -0.5)');
    const s = buildScene(g, V, { style: 'exam', series: () => 0, coord });
    expect(s.labels.filter((l) => l.kind === 'guide').map((l) => l.text)).toEqual(['11/5', '\u22121/2']);
    const svg = sceneToSvg(s, EXAM_THEME);
    expect(svg).toContain('>11</text>');
    expect(svg).toContain('>5</text>');
    expect(svg).toContain('>\u2212</text>');
    const id = g[0]!.id;
    const edited = buildScene(g, V, { style: 'exam', series: () => 0, coord, guideText: { [`${id}:x`]: null, [`${id}:y`]: 'k' } });
    expect(edited.labels.filter((l) => l.kind === 'guide').map((l) => l.text)).toEqual(['k']);
    expect(edited.guides).toHaveLength(4);
  });

  it('writes an SVG with italic variables and raised exponents', () => {
    const s = buildScene(graphs('y = x^2'), V, { style: 'exam', series: () => 0 });
    const svg = sceneToSvg(s, EXAM_THEME);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('baseline-shift="super"');
    expect(svg).toContain('>O</text>');
    expect(svg).not.toContain('NaN');
  });

  it('splits math labels into italic, upright and raised runs', () => {
    expect(mathRuns('y = sin(x)^2')).toEqual([
      { text: 'y', italic: true },
      { text: ' = sin(', italic: false },
      { text: 'x', italic: true },
      { text: ')', italic: false },
      { text: '2', italic: false, sup: true },
    ]);
    expect(mathRuns('y = 2*x^(n+1)').map((r) => r.text)).toEqual(['y', ' = 2', 'x', 'n', '+1']);
  });
});

import { curveAt, pointsOfInterest, sampleParametric, sceneToPdf, sceneToTikz } from '../src';

describe('parametric and polar curves', () => {
  it('samples a circle, every point on it', () => {
    const lines = sampleParametric((t) => 3 * Math.cos(t), (t) => 3 * Math.sin(t), 0, 2 * Math.PI, V);
    expect(lines).toHaveLength(1);
    for (let k = 0; k < lines[0]!.length; k += 2) {
      expect(Math.hypot(fromPx(V, lines[0]![k]!), fromPy(V, lines[0]![k + 1]!))).toBeCloseTo(3, 6);
    }
  });

  it('breaks (t, tan t) at its asymptotes', () => {
    expect(sampleParametric((t) => t, Math.tan, -4, 4, V).length).toBeGreaterThanOrEqual(3);
  });

  it('draws polar curves and limited ranges from the workspace', () => {
    const s = buildScene(graphs('r = 2', '(t, t^2) {0 <= t <= 1}'), V, { style: 'screen', series: () => 0 });
    expect(s.curves).toHaveLength(2);
    const circle = s.curves[0]!.lines.flat();
    expect(Math.hypot(fromPx(V, circle[0]!), fromPy(V, circle[1]!))).toBeCloseTo(2, 6);
    const part = s.curves[1]!.lines[0]!;
    expect(fromPx(V, part[0]!)).toBeCloseTo(0, 6);
    expect(fromPx(V, part[part.length - 2]!)).toBeCloseTo(1, 6);
  });

  it('hides a curve outside its {…} conditions', () => {
    const s = buildScene(graphs('y = x {x > 0}'), V, { style: 'screen', series: () => 0 });
    for (const line of s.curves[0]!.lines) for (let k = 0; k < line.length; k += 2) expect(fromPx(V, line[k]!)).toBeGreaterThan(0);
  });
});

describe('points of interest', () => {
  it('finds intercepts, the minimum and intersections', () => {
    const gs = graphs('y = x^2 - 2x', 'y = x');
    expect(pointsOfInterest(gs, V, '1')).toEqual([
      { x: 0, y: 0, kind: 'intersection', ids: ['1', '2'] },
      { x: 0, y: 0, kind: 'x-intercept', ids: ['1'] },
      { x: 0, y: 0, kind: 'y-intercept', ids: ['1'] },
      { x: 1, y: -1, kind: 'min', ids: ['1'] },
      { x: 2, y: 0, kind: 'x-intercept', ids: ['1'] },
      { x: 3, y: 3, kind: 'intersection', ids: ['1', '2'] },
    ]);
  });

  it('finds a maximum and a root where the curve only touches the axis', () => {
    const pois = pointsOfInterest(graphs('y = -(x - 1)^2'), V, '1');
    expect(pois.filter((p) => p.kind === 'max')).toEqual([{ x: 1, y: 0, kind: 'max', ids: ['1'] }]);
    expect(pois.some((p) => p.kind === 'x-intercept' && p.x === 1)).toBe(true);
  });

  it('does not mistake a pole for a root', () => {
    expect(pointsOfInterest(graphs('y = 1/x'), V, '1').filter((p) => p.kind === 'x-intercept')).toEqual([]);
  });

  it('picks the curve nearest to a click', () => {
    const s = buildScene(graphs('y = 1', 'y = -1'), V, { style: 'screen', series: () => 0 });
    expect(curveAt(s, 100, toPy(V, 1) + 3)).toBe('1');
    expect(curveAt(s, 100, toPy(V, -1) - 2)).toBe('2');
    expect(curveAt(s, 100, toPy(V, 0))).toBeNull();
  });
});

describe('PDF and TikZ export', () => {
  const scene = () => buildScene(graphs('y = x^2/4', 'let A = (-2, 1)'), V, { style: 'exam', series: () => 0 });

  it('writes a well-formed one-page PDF', () => {
    const bytes = sceneToPdf(scene(), EXAM_THEME);
    const text = String.fromCharCode(...bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/BaseFont /Times-Italic');
    expect(text).toContain('/MediaBox [0 0 300 225]');
    // the xref offset points at the xref table, and every object offset at its object
    const startxref = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, k) => expect(text.slice(o, o + 7)).toBe(`${k + 1} 0 obj`));
    // the minus sign is the en dash (0x96) in WinAnsi
    expect(text).toContain('(\x962) Tj');
    expect(text).not.toContain('NaN');
  });

  it('writes a TikZ picture with math labels', () => {
    const tex = sceneToTikz(scene(), EXAM_THEME);
    expect(tex).toContain('\\begin{tikzpicture}[x=0.75pt, y=-0.75pt');
    expect(tex).toContain('{$x$}');
    expect(tex).toContain('{$y = x^{2}/4$}');
    expect(tex).toContain('{$-2$}');
    expect(tex).toContain('{O}');
    expect(tex).toContain('\\end{tikzpicture}');
    expect(tex).not.toContain('NaN');
  });
});

describe('geometry figures', () => {
  const TRI = ['let A = (0, 0)', 'let B = (4, 0)', 'let C = (0, 3)'];

  it('draws a triangle closed, a circle round, a line across the screen', () => {
    const s = buildScene(graphs(...TRI, 'polygon(A, B, C)', 'circle(A, 2)', 'line(A, B)'), V, { style: 'screen', series: () => 0 });
    const [tri, circle, line] = s.curves;
    const t = tri!.lines[0]!;
    expect([t[0], t[1]]).toEqual([t[t.length - 2], t[t.length - 1]]);
    expect(s.fills).toHaveLength(1);
    const c = circle!.lines[0]!;
    for (let k = 0; k < c.length; k += 2) expect(Math.hypot(fromPx(V, c[k]!), fromPy(V, c[k + 1]!))).toBeCloseTo(2, 9);
    const l = line!.lines[0]!;
    expect(l[0]!).toBeLessThan(0);
    expect(l[2]!).toBeGreaterThan(V.width);
  });

  it('marks a right angle with a square and others with an arc, named', () => {
    const s = buildScene(graphs(...TRI, 'angle(B, A, C)', 'let θ = angle(A, B, C)'), V, { style: 'exam', series: () => 0 });
    const [square, arc] = s.curves;
    expect(square!.lines[0]).toHaveLength(6);
    expect(arc!.lines[0]!.length).toBeGreaterThan(20);
    // every arc point is the mark's radius (14 px in exam figures) from B
    const bx = toPx(V, 4);
    const by = toPy(V, 0);
    const pts = arc!.lines[0]!;
    for (let k = 0; k < pts.length; k += 2) expect(Math.hypot(pts[k]! - bx, pts[k + 1]! - by)).toBeCloseTo(14, 6);
    expect(s.labels.find((l) => l.text === 'θ')).toMatchObject({ kind: 'curve' });
  });

  it('leaves out the axes when asked, and puts labels outside the triangle', () => {
    const s = buildScene(graphs(...TRI, 'polygon(A, B, C)'), V, { style: 'exam', series: () => 0, axes: false });
    expect(s.axes).toEqual([]);
    expect(s.arrows).toEqual([]);
    expect(s.guides).toEqual([]);
    expect(s.labels.some((l) => l.kind === 'origin')).toBe(false);
    const label = (name: string) => s.labels.find((l) => l.text === name)!;
    // A is bottom left of the triangle's middle, B to the right, C at the top
    expect(label('A')).toMatchObject({ anchor: 'end', baseline: 'top' });
    expect(label('B')).toMatchObject({ anchor: 'start' });
    expect(label('C')).toMatchObject({ baseline: 'bottom' });
  });

  it('exports geometry to SVG, PDF and TikZ', () => {
    const s = buildScene(graphs(...TRI, 'polygon(A, B, C)', 'angle(B, A, C)', 'circle(A, B, C)'), V, { style: 'exam', series: () => 0, axes: false });
    expect(sceneToSvg(s, EXAM_THEME)).not.toContain('NaN');
    expect(String.fromCharCode(...sceneToPdf(s, EXAM_THEME))).not.toContain('NaN');
    expect(sceneToTikz(s, EXAM_THEME)).not.toContain('NaN');
  });
});

import { colourOf, domainColoring } from '../src';
import { Complex } from '@math/engine';

describe('statistics and complex functions on the graph', () => {
  it('draws points(xs, ys) in their line colour and fits as curves', () => {
    const s = buildScene(graphs('points([1, 2, 3], [0.5, 1, 1.5])', 'linreg([1, 2, 3], [0.5, 1, 1.5])'), V, { style: 'screen', series: (id) => Number(id) });
    expect(s.points).toHaveLength(3);
    expect(s.points.every((p) => p.colored && p.series === 1)).toBe(true);
    expect(s.curves[0]!.lines[0]!.length).toBeGreaterThan(100);
  });

  it('colours a complex function: angle as hue, zeros dark, poles light', () => {
    const red = colourOf(new Complex(1, 0));
    expect(red[0]).toBeGreaterThan(red[1]);
    expect(red[0]).toBeGreaterThan(red[2]);
    const small = colourOf(new Complex(1e-6, 0));
    const big = colourOf(new Complex(1e6, 0));
    const lightness = (c: number[]) => (c[0]! + c[1]! + c[2]!) / 3;
    expect(lightness(small)).toBeLessThan(40);
    expect(lightness(big)).toBeGreaterThan(200);
  });

  it('puts the domain colouring behind the screen graph, not in exam figures', () => {
    const gs = graphs('let g(z) = z^2 - 1');
    const img = buildScene(gs, V, { style: 'screen', series: () => 0 }).image!;
    expect(img.width).toBe(200);
    expect(img.data.length).toBe(img.width * img.height * 4);
    expect(buildScene(gs, V, { style: 'exam', series: () => 0 }).image).toBeUndefined();
    // the centre pixel is f(0) = -1: a mid-lightness cyan (angle π)
    const direct = domainColoring((z) => z.mul(z).sub(Complex.ONE), V, 2);
    expect(direct.data.length).toBe(img.data.length);
  });

  it('leaves surfaces to the 3D view', () => {
    expect(buildScene(graphs('z = x y'), V, { style: 'screen', series: () => 0 }).curves).toEqual([]);
  });
});

describe('exports keep exam fractions and pictures', () => {
  const V = { cx: 0, cy: 0, scale: 40, width: 400, height: 300 } as never;
  const w = new Workspace();
  w.set('a', 'A = (2.2, -0.5)');
  const coord = (n: number) => (n === 2.2 ? '11/5' : n === -0.5 ? '-√2/2' : String(n));
  const s = buildScene(w.graphables(), V, { style: 'exam', series: () => 0, coord });
  it('writes stacked fractions in TikZ and PDF', () => {
    const tex = sceneToTikz(s, EXAM_THEME);
    expect(tex).toContain('\\frac{11}{5}');
    expect(tex).toContain('-\\frac{\\sqrt{2}}{2}');
    const pdf = String.fromCharCode(...sceneToPdf(s, EXAM_THEME));
    // numerator and denominator drawn apart, with a bar between
    expect(pdf).toContain('(11) Tj');
    expect(pdf).toContain('(5) Tj');
    expect(pdf).toMatch(/ \d+(\.\d+)? 1 re f/);
  });
  it('puts pictures in the PDF as images, the figure still vector', () => {
    const pic = { cx: 200, cy: 150, w: 100, h: 50, angle: 0.3, opacity: 0.5, pw: 2, ph: 1, rgb: new Uint8Array([1, 2, 3]), alpha: new Uint8Array([4, 5]) };
    const pdf = String.fromCharCode(...sceneToPdf(s, EXAM_THEME, undefined, [pic]));
    expect(pdf).toContain('/Subtype /Image /Width 2 /Height 1 /ColorSpace /DeviceRGB');
    expect(pdf).toContain('/SMask');
    expect(pdf).toContain('/Im0 Do');
    // the image is listed in the page's resources, or readers skip it
    expect(pdf).toMatch(/\/Resources << \/XObject << \/Im0 \d+ 0 R >>/);
    expect(pdf).toContain('/ca 0.5');
    expect(pdf).toContain('(11) Tj');
  });
});
