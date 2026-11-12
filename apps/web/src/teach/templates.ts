import type { Lang } from '../i18n';

/** The part of the plane a figure shows. */
export interface Range {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

/**
 * A ready-made exam figure: worksheet lines whose numbers are `let` values
 * (so each becomes a slider), the range to show, and whether to draw axes.
 * A `let f(x) = …` line draws y = f(x) itself, so templates don't repeat it.
 */
export interface FigureTemplate {
  id: string;
  name: Record<Lang, string>;
  note: Record<Lang, string>;
  lines: string[];
  range: Range;
  axes: boolean;
}

export const FIGURE_TEMPLATES: FigureTemplate[] = [
  {
    id: 'tangent',
    name: { en: 'Tangent line', ko: '접선' },
    note: { en: 'A curve and its tangent at x = a', ko: '곡선과 x = a에서의 접선' },
    lines: ['let f(x) = x^3 - 3x', 'let a = 2', "y = f'(a)(x - a) + f(a)", 'let P = (a, f(a))'],
    range: { xmin: -3, xmax: 4, ymin: -4, ymax: 6 },
    axes: true,
  },
  {
    id: 'between',
    name: { en: 'Area between curves', ko: '두 곡선 사이의 넓이' },
    note: { en: 'The region where f(x) ≥ g(x), shaded', ko: 'f(x) ≥ g(x)인 영역을 색칠' },
    lines: ['let f(x) = -x^2 + 4', 'let g(x) = x - 2', 'y <= f(x) {y >= g(x)}'],
    range: { xmin: -4, xmax: 4, ymin: -6, ymax: 5 },
    axes: true,
  },
  {
    id: 'region',
    name: { en: 'Region over an interval', ko: '구간 위의 영역' },
    note: { en: 'Under y = f(x) for a ≤ x ≤ b, with the edges marked', ko: 'a ≤ x ≤ b에서 y = f(x) 아래, 경계 표시' },
    lines: ['let f(x) = x^2/4 + 1', 'let a = 1', 'let b = 3', 'y <= f(x) {y >= 0, a <= x <= b}', 'let A = (a, f(a))', 'let B = (b, f(b))'],
    range: { xmin: -1, xmax: 5, ymin: -1, ymax: 5 },
    axes: true,
  },
  {
    id: 'intersections',
    name: { en: 'Intersection points', ko: '교점' },
    note: { en: 'A parabola and a line, their meeting points with helper lines', ko: '포물선과 직선, 교점과 보조선' },
    lines: [
      'let m = 1',
      'let c = 2',
      'y = x^2',
      'y = m x + c',
      'let p = (m - sqrt(m^2 + 4c))/2',
      'let q = (m + sqrt(m^2 + 4c))/2',
      'let P = (p, p^2)',
      'let Q = (q, q^2)',
    ],
    range: { xmin: -3, xmax: 4, ymin: -2, ymax: 7 },
    axes: true,
  },
  {
    id: 'inscribed',
    name: { en: 'Triangle in a circle', ko: '원에 내접하는 삼각형' },
    note: { en: 'Three points on a circle of radius r, moved by their angles', ko: '반지름 r인 원 위의 세 점, 각으로 움직임' },
    lines: [
      'let r = 3',
      'let s = 2',
      'let t = 3.8',
      'let u = 5.6',
      'circle((0, 0), r)',
      'let A = (r cos(s), r sin(s))',
      'let B = (r cos(t), r sin(t))',
      'let C = (r cos(u), r sin(u))',
      'polygon(A, B, C)',
      'let O = (0, 0)',
    ],
    range: { xmin: -4.5, xmax: 4.5, ymin: -4, ymax: 4 },
    axes: false,
  },
];
