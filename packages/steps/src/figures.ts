/**
 * Problems that come with a figure: a graph (그래프 문제) or a drawing of a
 * shape (도형 문제). The figure is calculator lines and the part of the plane
 * to show, drawn in the printed exam style. Everything the answer needs is
 * also in the text; the figure shows the situation, as it does on the paper.
 */
import { m, minus, plus, polyTex, type ExamTemplate } from './exam';

const num = (v: number) => String(Math.round(v * 1e6) / 1e6);
/**
 * A function's graph squeezed upright like a figure on the paper: the y
 * values divided by `s` so the drawing is at most about as tall as it is
 * wide. Points on the x-axis stay where they are; nothing in the figure
 * is read off a scale, as on the 평가원 papers.
 */
function squeeze(f: (x: number) => number, x0: number, x1: number) {
  let lo = 0;
  let hi = 0;
  for (let k = 0; k <= 200; k++) {
    const y = f(x0 + ((x1 - x0) * k) / 200);
    if (Number.isFinite(y)) [lo, hi] = [Math.min(lo, y), Math.max(hi, y)];
  }
  const s = Math.max(1, (hi - lo) / ((x1 - x0) * 0.75));
  const g = (x: number) => f(x) / s;
  return { s, range: yRange(g, x0, x1) };
}

/** the range a function's graph needs over [x0, x1], with a margin */
function yRange(f: (x: number) => number, x0: number, x1: number, keep: number[] = [0]) {
  let lo = Math.min(...keep);
  let hi = Math.max(...keep);
  for (let k = 0; k <= 200; k++) {
    const y = f(x0 + ((x1 - x0) * k) / 200);
    if (Number.isFinite(y)) [lo, hi] = [Math.min(lo, y), Math.max(hi, y)];
  }
  const pad = Math.max(1, (hi - lo) * 0.12);
  return { ymin: Math.floor(lo - pad), ymax: Math.ceil(hi + pad) };
}

export const FIGURE_TEMPLATES: Record<string, ExamTemplate> = {
  // ---------------- graphs
  'fig-cubic-roots': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      for (;;) {
        const roots = new Set<number>();
        while (roots.size < 3) roots.add(r.nonzero(-4, 4));
        const [a, b, c] = [...roots].sort((p, q) => p - q) as [number, number, number];
        const k = r.pick([1, -1, 2, -2] as const);
        const f = (x: number) => k * (x - a) * (x - b) * (x - c);
        const t = r.pick([c + 1, a - 1, (a + b) / 2 === Math.round((a + b) / 2) ? (a + b) / 2 : c + 2]);
        const value = f(t);
        if (Math.abs(value) > 999 || value === 0 || t === 0) continue;
        const [x0, x1] = [a - 1.5, c + 1.5];
        const sq = squeeze(f, a - 1.2, c + 1.2);
        const fx = `${num(k / sq.s)}*(${minus('x', a)})*(${minus('x', b)})*(${minus('x', c)})`;
        return {
          prompt: {
            en: `The figure shows the graph of a cubic ${m('y = f(x)')}, which meets the x-axis at ${m(`(${a}, 0), (${b}, 0), (${c}, 0)`)}. If ${m(`f(0) = ${f(0)}`)}, find ${m(`f(${t})`)}.`,
            ko: `그림과 같이 삼차함수 ${m('y = f(x)')}의 그래프가 ${m('x')}축과 세 점 ${m(`(${a}, 0), (${b}, 0), (${c}, 0)`)}에서 만난다. ${m(`f(0) = ${f(0)}`)}일 때, ${m(`f(${t})`)}의 값은?`,
          },
          value,
          solution: {
            en: [`${m(`f(x) = k(${minus('x', a)})(${minus('x', b)})(${minus('x', c)})`)}.`, `${m(`f(0) = k \\times (${-a})(${-b})(${-c}) = ${f(0)}`)}, so ${m(`k = ${k}`)}.`, `${m(`f(${t}) = ${k} \\times (${t - a})(${t - b})(${t - c}) = ${value}`)}.`],
            ko: [`${m(`f(x) = k(${minus('x', a)})(${minus('x', b)})(${minus('x', c)})`)}로 놓으면`, `${m(`f(0) = k \\times (${-a})(${-b})(${-c}) = ${f(0)}`)}에서 ${m(`k = ${k}`)}`, `${m(`f(${t}) = ${k} \\times (${t - a})(${t - b})(${t - c}) = ${value}`)}`],
          },
          figure: {
            lines: [`y = ${fx}`, `let A = (${a}, 0)`, `let B = (${b}, 0)`, `let C = (${c}, 0)`],
            range: { xmin: Math.floor(x0), xmax: Math.ceil(x1), ...sq.range },
            axes: true,
          },
        };
      }
    },
  },
  'fig-shaded-area': {
    unit: 'calculus',
    points: 3,
    make: (r) => {
      const [a, k] = r.pick([[3, 2], [3, 4], [6, 1], [6, 2], [6, 3], [1, 6], [2, 3], [2, 6], [4, 3], [12, 1], [12, 2]] as const);
      const value = (a * k ** 3) / 6;
      const f = (x: number) => a * x * (x - k);
      const sq = squeeze(f, -0.6, k + 0.6);
      return {
        prompt: {
          en: `The figure shows ${m(`y = ${polyTex([a, -a * k, 0])}`)}. Find the area of the shaded region between the curve and the x-axis.`,
          ko: `그림과 같이 곡선 ${m(`y = ${polyTex([a, -a * k, 0])}`)}와 ${m('x')}축으로 둘러싸인 부분(색칠한 부분)의 넓이는?`,
        },
        value,
        solution: {
          en: [`The curve meets the x-axis at ${m('x = 0')} and ${m(`x = ${k}`)}, and is below it between.`, `${m(`\\int_{0}^{${k}} \\left\\{-(${polyTex([a, -a * k, 0])})\\right\\}dx = \\frac{${a} \\times ${k}^{3}}{6} = ${value}`)}.`],
          ko: [`곡선은 ${m('x')}축과 ${m('x = 0')}, ${m(`x = ${k}`)}에서 만나고 그 사이에서 ${m('x')}축 아래에 있다`, `${m(`\\int_{0}^{${k}} \\left\\{-(${polyTex([a, -a * k, 0])})\\right\\}dx = \\frac{${a} \\times ${k}^{3}}{6} = ${value}`)}`],
        },
        figure: {
          lines: [`let f(x) = ${num(a / sq.s)}*x*(x - ${k})`, 'y >= f(x) {y <= 0}', `let A = (${k}, 0)`],
          range: { xmin: -1, xmax: k + 1, ...sq.range },
          axes: true,
        },
      };
    },
  },
  'fig-exp-graph': {
    unit: 'algebra',
    points: 2,
    make: (r) => {
      const [p, q] = [r.int(-3, 3), r.int(-3, 3)];
      const value = p + q;
      const base = r.pick([2, 3] as const);
      const f = (x: number) => base ** (x - p) + q;
      return {
        prompt: {
          en: `The figure shows the graph of ${m(`y = ${base}^{x - p} + q`)} and its asymptote ${m(`y = ${q}`)}. The graph passes through ${m(`(${p}, ${q + 1})`)}. Find ${m('p + q')}.`,
          ko: `그림은 함수 ${m(`y = ${base}^{x - p} + q`)}의 그래프와 점근선 ${m(`y = ${q}`)}를 나타낸 것이다. 이 그래프가 점 ${m(`(${p}, ${q + 1})`)}을 지날 때, ${m('p + q')}의 값은? (단, ${m('p, q')}는 상수이다.)`,
        },
        value,
        solution: {
          en: [`The asymptote of ${m(`y = ${base}^{x - p} + q`)} is ${m('y = q')}, so ${m(`q = ${q}`)}.`, `${m(`${base}^{${p} - p} ${plus(q)} = ${q + 1}`)} means ${m(`${base}^{${p} - p} = 1`)}, so ${m(`p = ${p}`)} and ${m(`p + q = ${value}`)}.`],
          ko: [`점근선이 ${m('y = q')}이므로 ${m(`q = ${q}`)}`, `${m(`${base}^{${p} - p} ${plus(q)} = ${q + 1}`)}에서 ${m(`${base}^{${p} - p} = 1`)}이므로 ${m(`p = ${p}`)}, ${m(`p + q = ${value}`)}`],
        },
        figure: {
          lines: [`y = ${base}^(${minus('x', p)})${q === 0 ? '' : q > 0 ? ` + ${q}` : ` - ${-q}`}`, `y = ${q}`, `let P = (${p}, ${q + 1})`],
          range: { xmin: p - 4, xmax: p + (base === 2 ? 3 : 2), ymin: Math.min(-1, q - 2), ymax: Math.max(1, Math.ceil(f(p + (base === 2 ? 2.6 : 1.8))) + 1) },
          axes: true,
        },
      };
    },
  },

  // ---------------- shapes
  'fig-inscribed-triangle': {
    unit: 'algebra',
    points: 3,
    make: (r) => {
      const R = r.int(2, 9);
      // BC subtends 60° at the centre, so ∠A = 30° on the major arc
      const angle = (d: number) => [R * Math.cos((d * Math.PI) / 180), R * Math.sin((d * Math.PI) / 180)];
      const tilt = r.int(-40, 40);
      const [B, C, A] = [angle(-120 + tilt), angle(-60 + tilt), angle(90 + tilt + r.int(-50, 50))];
      return {
        prompt: {
          en: `Triangle ${m('\\mathrm{ABC}')} is inscribed in a circle, with ${m(`\\overline{\\mathrm{BC}} = ${R}`)} and ${m('\\angle \\mathrm{BAC} = \\frac{\\pi}{6}')}. The circle has area ${m('k\\pi')}. Find ${m('k')}.`,
          ko: `그림과 같이 원에 내접하는 삼각형 ${m('\\mathrm{ABC}')}에서 ${m(`\\overline{\\mathrm{BC}} = ${R}`)}, ${m('\\angle \\mathrm{BAC} = \\frac{\\pi}{6}')}이다. 이 원의 넓이가 ${m('k\\pi')}일 때, ${m('k')}의 값은?`,
        },
        value: R * R,
        solution: {
          en: [`By the law of sines ${m(`\\frac{${R}}{\\sin\\frac{\\pi}{6}} = 2r`)}, so the radius is ${m(`r = ${R}`)}.`, `The area is ${m(`${R * R}\\pi`)}: ${m(`k = ${R * R}`)}.`],
          ko: [`사인법칙에 의하여 ${m(`\\frac{${R}}{\\sin\\frac{\\pi}{6}} = 2r`)}이므로 외접원의 반지름 ${m(`r = ${R}`)}`, `원의 넓이는 ${m(`${R * R}\\pi`)}이므로 ${m(`k = ${R * R}`)}`],
        },
        figure: {
          lines: [`circle((0, 0), ${R})`, `let A = (${num(A[0]!)}, ${num(A[1]!)})`, `let B = (${num(B[0]!)}, ${num(B[1]!)})`, `let C = (${num(C[0]!)}, ${num(C[1]!)})`, 'polygon(A, B, C)'],
          range: { xmin: -R * 1.3, xmax: R * 1.3, ymin: -R * 1.25, ymax: R * 1.25 },
          axes: false,
        },
      };
    },
  },
  'fig-parallelogram': {
    unit: 'geometry',
    points: 3,
    make: (r) => {
      for (;;) {
        const A = [r.int(-3, 1), r.int(-3, 0)];
        const u = [r.int(3, 6), r.int(-1, 2)];
        const v = [r.int(-1, 2), r.int(2, 5)];
        if (u[0]! * v[1]! - u[1]! * v[0]! < 6) continue;
        const B = [A[0]! + u[0]!, A[1]! + u[1]!];
        const D = [A[0]! + v[0]!, A[1]! + v[1]!];
        const Cp = [B[0]! + v[0]!, B[1]! + v[1]!];
        const value = u[0]! * v[0]! + u[1]! * v[1]!;
        if (value === 0) continue;
        const xs = [A[0]!, B[0]!, D[0]!, Cp[0]!];
        const ys = [A[1]!, B[1]!, D[1]!, Cp[1]!];
        return {
          prompt: {
            en: `${m('\\mathrm{ABCD}')} is a parallelogram with ${m(`\\mathrm{A}(${A})`)}, ${m(`\\mathrm{B}(${B})`)} and ${m(`\\mathrm{D}(${D})`)}. Find ${m('\\overrightarrow{\\mathrm{AB}} \\cdot \\overrightarrow{\\mathrm{AD}}')}.`.replace(/,(?=\S)/g, ', '),
            ko: `그림과 같이 좌표평면 위의 평행사변형 ${m('\\mathrm{ABCD}')}에서 ${m(`\\mathrm{A}(${A})`)}, ${m(`\\mathrm{B}(${B})`)}, ${m(`\\mathrm{D}(${D})`)}일 때, ${m('\\overrightarrow{\\mathrm{AB}} \\cdot \\overrightarrow{\\mathrm{AD}}')}의 값은?`.replace(/,(?=\S)/g, ', '),
          },
          value,
          solution: {
            en: [`${m(`\\overrightarrow{\\mathrm{AB}} = (${u.join(', ')})`)}, ${m(`\\overrightarrow{\\mathrm{AD}} = (${v.join(', ')})`)}.`, `${m(`\\overrightarrow{\\mathrm{AB}} \\cdot \\overrightarrow{\\mathrm{AD}} = (${u[0]})(${v[0]}) + (${u[1]})(${v[1]}) = ${value}`)}.`],
            ko: [`${m(`\\overrightarrow{\\mathrm{AB}} = (${u.join(', ')})`)}, ${m(`\\overrightarrow{\\mathrm{AD}} = (${v.join(', ')})`)}`, `${m(`\\overrightarrow{\\mathrm{AB}} \\cdot \\overrightarrow{\\mathrm{AD}} = (${u[0]})(${v[0]}) + (${u[1]})(${v[1]}) = ${value}`)}`],
          },
          figure: {
            lines: [`let A = (${A.join(', ')})`, `let B = (${B.join(', ')})`, `let C = (${Cp.join(', ')})`, `let D = (${D.join(', ')})`, 'polygon(A, B, C, D)'],
            range: { xmin: Math.min(...xs, 0) - 1.5, xmax: Math.max(...xs, 0) + 1.5, ymin: Math.min(...ys, 0) - 1.5, ymax: Math.max(...ys, 0) + 1.5 },
            axes: true,
          },
        };
      }
    },
  },
  'fig-ellipse-foci': {
    unit: 'geometry',
    points: 3,
    make: (r) => {
      const [b, c, a] = r.pick([[4, 3, 5], [3, 4, 5], [8, 6, 10], [6, 8, 10], [12, 5, 13]] as const);
      const d = r.int(a - c + 1, a + c - 1);
      // where on the ellipse PF₁ = d: PF₁ = a − (c/a)x
      const x = ((a - d) * a) / c;
      const y = b * Math.sqrt(Math.max(0, 1 - (x * x) / (a * a)));
      const value = 2 * a - d;
      return {
        prompt: {
          en: `The ellipse ${m(`\\frac{x^{2}}{${a * a}} + \\frac{y^{2}}{${b * b}} = 1`)} has foci ${m(`\\mathrm{F}_{1}(${c}, 0)`)} and ${m(`\\mathrm{F}_{2}(-${c}, 0)`)}. A point ${m('\\mathrm{P}')} on it has ${m(`\\overline{\\mathrm{PF}_{1}} = ${d}`)}. Find ${m('\\overline{\\mathrm{PF}_{2}}')}.`,
          ko: `그림과 같이 두 초점이 ${m(`\\mathrm{F}_{1}(${c}, 0)`)}, ${m(`\\mathrm{F}_{2}(-${c}, 0)`)}인 타원 ${m(`\\frac{x^{2}}{${a * a}} + \\frac{y^{2}}{${b * b}} = 1`)} 위의 점 ${m('\\mathrm{P}')}에 대하여 ${m(`\\overline{\\mathrm{PF}_{1}} = ${d}`)}일 때, ${m('\\overline{\\mathrm{PF}_{2}}')}의 값은?`,
        },
        value,
        solution: {
          en: [`On the ellipse ${m(`\\overline{\\mathrm{PF}_{1}} + \\overline{\\mathrm{PF}_{2}} = 2 \\times ${a} = ${2 * a}`)}.`, `${m(`\\overline{\\mathrm{PF}_{2}} = ${2 * a} - ${d} = ${value}`)}.`],
          ko: [`타원의 정의에 의하여 ${m(`\\overline{\\mathrm{PF}_{1}} + \\overline{\\mathrm{PF}_{2}} = 2 \\times ${a} = ${2 * a}`)}`, `${m(`\\overline{\\mathrm{PF}_{2}} = ${2 * a} - ${d} = ${value}`)}`],
        },
        figure: {
          lines: [`x^2/${a * a} + y^2/${b * b} = 1`, `let F_1 = (${c}, 0)`, `let F_2 = (${-c}, 0)`, `let P = (${num(x)}, ${num(y)})`, 'segment(P, F_1)', 'segment(P, F_2)'],
          range: { xmin: -a * 1.25, xmax: a * 1.25, ymin: -b * 1.3, ymax: b * 1.3 },
          axes: true,
        },
      };
    },
  },
};

