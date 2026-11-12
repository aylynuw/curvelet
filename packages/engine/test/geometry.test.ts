import { describe, expect, it } from 'vitest';
import { Workspace, type EvalSettings, type Graphable, type Result } from '../src';

function sheet(lines: string[], settings: Partial<EvalSettings> = {}): Workspace {
  const w = new Workspace(settings);
  lines.forEach((src, k) => w.set(String(k + 1), src));
  return w;
}
const text = (r: Result | undefined) => (r?.status === 'value' ? r.text : r?.status === 'error' ? `error: ${r.message}` : r?.status);
const last = (lines: string[], settings: Partial<EvalSettings> = {}) => text(sheet(lines, settings).result(String(lines.length)));

const TRI = ['let A = (0, 0)', 'let B = (4, 0)', 'let C = (0, 3)'];

describe('points as vectors', () => {
  it.each([
    ['(1, 2) + (3, 4)', '(4, 6)'],
    ['(1, 2) - (3, 4)', '(-2, -2)'],
    ['2(1, 2)', '(2, 4)'],
    ['(4, 2)/2', '(2, 1)'],
    ['-(1, 2)', '(-1, -2)'],
  ])('%s = %s', (src, expected) => expect(last([src])).toBe(expected));

  it('refuses other combinations', () => {
    expect(last(['(1, 2) * (3, 4)'])).toContain('Points can be added, subtracted and scaled');
  });
});

describe('figures and measurements', () => {
  it.each([
    ['length(segment(A, B))', '4'],
    ['distance(B, C)', '5'],
    ['area(polygon(A, B, C))', '6'],
    ['perimeter(polygon(A, B, C))', '12'],
    ['midpoint(B, C)', '(2, 1.5)'],
    ['midpoint(segment(B, C))', '(2, 1.5)'],
    ['angle(B, A, C)', '1.57079632679'],
    ['radius(circle(A, B, C))', '2.5'],
    ['center(circle(A, B, C))', '(2, 1.5)'],
    ['radius(circle(A, B))', '4'],
    ['distance(C, line(A, B))', '3'],
    ['distance(B, segment(A, C))', '4'],
    ['foot(C, line(A, B))', '(0, 0)'],
    ['foot((2, 2), line(A, (1, 1)))', '(2, 2)'],
    ['rotate(B, A, pi/2)', '(0, 4)'],
    ['reflect((1, 2), line(A, B))', '(1, -2)'],
    ['reflect((1, 2), A)', '(-1, -2)'],
  ])('%s = %s', (src, expected) => expect(last([...TRI, src])).toBe(expected));

  it('measures angles in degrees in degree mode', () => {
    expect(last([...TRI, 'angle(B, A, C)'], { angle: 'deg' })).toBe('90');
    expect(last([...TRI, 'angle(A, B, C)'], { angle: 'deg' })).toBe('36.8698976458');
    expect(last([...TRI, 'rotate(B, A, 90)'], { angle: 'deg' })).toBe('(0, 4)');
  });

  it('describes figures', () => {
    expect(last([...TRI, 'segment(A, B)'])).toBe('segment, length 4');
    expect(last([...TRI, 'line(A, (1, 2))'])).toBe('line y = 2x + 0');
    expect(last([...TRI, 'line(A, (0, 2))'])).toBe('line x = 0');
    expect(last([...TRI, 'circle(A, 2)'])).toBe('circle, centre (0, 0), radius 2');
    expect(last([...TRI, 'polygon(A, B, C)'])).toBe('polygon, area 6');
  });

  it('explains wrong inputs', () => {
    expect(last([...TRI, 'segment(A, A)'])).toBe('error: segment needs two different points');
    expect(last([...TRI, 'circle(A, -1)'])).toBe('error: A circle needs a radius greater than 0');
    expect(last([...TRI, 'circle(A, (1, 1), (2, 2))'])).toContain('on one line');
    expect(last([...TRI, 'length(circle(A, 1))'])).toContain('length needs a segment');
    expect(last([...TRI, 'midpoint(A, 3)'])).toContain('midpoint needs a point');
    expect(last([...TRI, 'segment(A, B) + 1'])).toContain("Can't do arithmetic with a segment");
  });
});

describe('constructions', () => {
  it('intersects lines, segments, rays and circles, left to right', () => {
    expect(last([...TRI, 'intersect(line(A, (1, 1)), line(B, C))'])).toBe('(1.71428571429, 1.71428571429)');
    expect(last([...TRI, 'intersect(line(A, B), circle((1, 0), 2))'])).toBe('(-1, 0)');
    expect(last([...TRI, 'intersect(line(A, B), circle((1, 0), 2), 2)'])).toBe('(3, 0)');
    expect(last([...TRI, 'intersect(circle(A, 5), circle(B, 3), 2)'])).toBe('(4, 3)');
    expect(last([...TRI, 'intersect(segment(A, B), segment(C, (1, 5)))'])).toBe("error: These figures don't meet");
    expect(last([...TRI, 'intersect(ray(A, (1, 1)), polygon((2, 0), (4, 0), (4, 4)))'])).toBe('(4, 4)');
    expect(last([...TRI, 'intersect(line(A, B), circle(A, 1), 3)'])).toContain('there are 2 answers');
  });

  it('builds perpendiculars, parallels, bisectors and tangents', () => {
    expect(last([...TRI, 'perpendicular(line(A, B), (2, 5))'])).toBe('line x = 2');
    expect(last([...TRI, 'parallel(line(A, B), C)'])).toBe('line y = 0x + 3');
    expect(last([...TRI, 'perpbisector(A, B)'])).toBe('line x = 2');
    expect(last([...TRI, 'intersect(bisector(B, A, C), segment(B, C))'])).toBe('(1.71428571429, 1.71428571429)');
    // tangents from (0, 5) to the circle of radius 3 about the origin touch at (±12/5, 9/5)
    expect(last([...TRI, 'intersect(tangent(circle(A, 3), (0, 5), 2), line(A, B))'])).toBe('(3.75, 0)');
    expect(last([...TRI, 'tangent(circle(A, 3), (3, 0))'])).toBe('line x = 3');
    expect(last([...TRI, 'tangent(circle(A, 3), (1, 0))'])).toContain('inside the circle');
  });

  it('follows its points when they move', () => {
    const w = sheet([...TRI, 'let M = midpoint(B, C)']);
    expect(text(w.result('4'))).toBe('(2, 1.5)');
    w.movePoint('C', 0, 5);
    expect(w.source('3')).toBe('let C = (0, 5)');
    expect(text(w.result('4'))).toBe('(2, 2.5)');
    expect(() => w.movePoint('M', 1, 1)).toThrow('not a point that can be moved');
  });

  it('keeps geometry names free to define', () => {
    expect(last(['let area = 5', 'area * 2'])).toBe('10');
    expect(last(['let length(s) = 7', 'length(1)'])).toBe('7');
  });
});

describe('graph entries', () => {
  const graphs = (lines: string[]): Graphable[] => sheet(lines).graphables();

  it('draws figures and marks angles, right angles with a square', () => {
    const gs = graphs([...TRI, 'let T = polygon(A, B, C)', 'angle(B, A, C)', 'let θ = angle(A, B, C)']);
    expect(gs.map((g) => g.kind)).toEqual(['point', 'point', 'point', 'shape', 'angle', 'angle']);
    expect(gs[3]).toMatchObject({ kind: 'shape', label: 'T', shape: { type: 'polygon' } });
    expect(gs[4]).toMatchObject({ kind: 'angle', b: { x: 0, y: 0 }, right: true });
    expect(gs[5]).toMatchObject({ kind: 'angle', right: false, label: 'θ' });
  });

  it('lets only plain let points be dragged', () => {
    const gs = graphs(['let A = (1, -2)', 'const B = (0, 0)', 'let M = midpoint(A, B)', '(3, 3)']);
    expect(gs.map((g) => g.kind === 'point' && g.drag === true)).toEqual([true, false, false, false]);
  });

  it('drags fraction points and points that ride on a number', () => {
    const ws = new Workspace();
    ws.set('1', 'let a = 1');
    ws.set('2', 'f(x) = x^2');
    ws.set('3', 'P = (a, f(a))');
    ws.set('4', 'Q = (11/5, -1/2)');
    const drag = ws.graphables().filter((g) => g.kind === 'point').map((g) => g.kind === 'point' && g.drag === true);
    expect(drag).toEqual([true, true]);
    ws.movePoint('P', 2, 9, (n) => String(n));
    expect(ws.source('1')).toBe('let a = 2');
    expect(ws.graphables().find((g) => g.kind === 'point' && g.label === 'P')).toMatchObject({ x: 2, y: 4 });
    ws.movePoint('Q', 1.5, 3, (n) => (n === 1.5 ? '3/2' : String(n)));
    expect(ws.source('4')).toBe('Q = (3/2, 3)');
  });
});
