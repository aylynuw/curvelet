import { dashPattern } from './look';
import { isTransparent, parseHex, type Rgb } from './color';
import type { Label, Scene } from './scene';
import { isMathLabel, mathRuns, type DrawTheme } from './theme';

const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp', 'det', 'gcd', 'max', 'min', 'arcsin', 'arccos', 'arctan']);

/** A formula label in LaTeX: y = f(x), x^{2}, \sin(x), \pi. */
function latex(text: string): string {
  return mathRuns(text)
    .map((r) => {
      let t = r.text
        .replace(/−/g, '-')
        .replace(/\bpi\b|π/g, '\\pi ')
        .replace(/\btheta\b|θ/g, '\\theta ')
        .replace(/[{}%#&_]/g, (c) => `\\${c}`);
      if (!r.italic) t = t.replace(/\p{L}+/gu, (w) => (FUNCTIONS.has(w) ? `\\${w}` : w === 'pi' || w === 'theta' ? w : `\\mathrm{${w}}`));
      return r.sup ? `^{${t}}` : t;
    })
    .join('');
}

const ANCHOR: Record<string, string> = {
  'start top': 'north west', 'middle top': 'north', 'end top': 'north east',
  'start middle': 'west', 'middle middle': 'center', 'end middle': 'east',
  'start bottom': 'base west', 'middle bottom': 'base', 'end bottom': 'base east',
};

/**
 * A scene as a TikZ picture for LaTeX documents (needs \usepackage{tikz}).
 * Coordinates stay in screen pixels; the picture's x and y units turn them
 * into points with y upwards, so the figure keeps its size: 1 px = 0.75 pt.
 */
export function sceneToTikz(scene: Scene, theme: DrawTheme, rgb: (css: string) => Rgb = parseHex): string {
  const exam = scene.style === 'exam';
  const n = (v: number) => String(Math.round(v * 10) / 10);
  const pt = (px: number) => `${n(px * 0.75)}pt`;
  const colors = new Map<string, string>();
  const name = (css: string) => {
    if (!colors.has(css)) colors.set(css, `fig${colors.size}`);
    return colors.get(css)!;
  };
  const body: string[] = [];
  const coords = (p: number[]) => {
    const parts: string[] = [];
    for (let k = 0; k + 1 < p.length; k += 2) parts.push(`(${n(p[k]!)},${n(p[k + 1]!)})`);
    // a line break every 8 points keeps the file readable
    return parts.reduce((s, c, k) => s + (k === 0 ? '' : k % 8 === 0 ? ' --\n    ' : ' -- ') + c, '');
  };
  const segs = (s: number[]) => {
    const out: string[] = [];
    for (let k = 0; k + 3 < s.length; k += 4) out.push(`(${n(s[k]!)},${n(s[k + 1]!)}) -- (${n(s[k + 2]!)},${n(s[k + 3]!)})`);
    return out.join(' ');
  };
  const draw = (css: string, width: number, path: string, extra = '') => {
    if (!path || isTransparent(css)) return;
    body.push(`\\draw[${name(css)}, line width=${pt(width)}${extra}] ${path};`);
  };

  if (theme.background && !isTransparent(theme.background) && !exam) {
    body.push(`\\fill[${name(theme.background)}] (0,0) rectangle (${scene.width},${scene.height});`);
  }
  draw(theme.gridMinor, 1, segs(scene.gridMinor));
  draw(theme.gridMajor, 1, segs(scene.gridMajor));
  for (const f of scene.fills) {
    const fill = name(exam ? theme.ink : (f.color ?? theme.curves[f.series % theme.curves.length]!));
    const opacity = f.opacity ?? theme.fillOpacity;
    for (const p of f.polys) body.push(`\\fill[${fill}, opacity=${opacity}] ${coords(p)} -- cycle;`);
    for (let k = 0; k + 3 < f.rects.length; k += 4) {
      body.push(`\\fill[${fill}, opacity=${opacity}] (${n(f.rects[k]!)},${n(f.rects[k + 1]!)}) rectangle ++(${n(f.rects[k + 2]!)},${n(f.rects[k + 3]!)});`);
    }
  }
  draw(theme.ink, theme.axisWidth, segs(scene.axes));
  draw(theme.ink, theme.axisWidth, segs(scene.ticks));
  for (const a of scene.arrows) {
    const tri =
      a.dir === 'right'
        ? `(${n(a.x)},${n(a.y)}) -- ++(-9,-3.5) -- ++(2,3.5) -- ++(-2,3.5) -- cycle`
        : `(${n(a.x)},${n(a.y)}) -- ++(-3.5,9) -- ++(3.5,-2) -- ++(3.5,2) -- cycle`;
    body.push(`\\fill[${name(theme.ink)}] ${tri};`);
  }
  draw(theme.ink, 0.8, segs(scene.guides), ', dash pattern=on 2.25pt off 2.25pt');
  for (const c of scene.curves) {
    const css = exam || c.ink ? theme.ink : (c.color ?? theme.curves[c.series % theme.curves.length]!);
    const width = c.width ?? theme.curveWidth * (c.weight ?? 1);
    const pattern = dashPattern(c, exam, width);
    const dash = pattern.length ? `, dash pattern=on ${pt(pattern[0]!)} off ${pt(pattern[1]!)}` : '';
    for (const l of c.lines) draw(css, width, coords(l), dash);
    if (c.segs.length) draw(css, width, segs(c.segs), dash);
  }
  for (const p of scene.points) {
    const css = exam ? theme.ink : (p.color ?? (p.colored ? theme.curves[p.series % theme.curves.length]! : theme.ink));
    body.push(`\\fill[${name(css)}] (${n(p.x)},${n(p.y)}) circle[radius=${pt(exam ? 2.6 : 4.5)}];`);
  }
  for (const l of scene.labels) body.push(label(l));

  function label(l: Label): string {
    const anchor = ANCHOR[`${l.anchor} ${l.baseline}`];
    const math = exam && isMathLabel(l);
    const numeric = l.kind === 'guide' || l.kind === 'tick';
    const content = math ? `$${latex(l.text)}$` : numeric ? `$${l.text.replace(/−/g, '-')}$` : l.text.replace(/[{}%#&_\\]/g, (c) => `\\${c}`);
    const size = l.kind === 'tick' && !exam ? ', font=\\scriptsize' : '';
    return `\\node[anchor=${anchor}, inner sep=0pt${size}] at (${n(l.x)},${n(l.y)}) {${content}};`;
  }

  const defs = [...colors].map(([css, id]) => `\\definecolor{${id}}{RGB}{${rgb(css).join(',')}}`);
  return [
    '% A figure from the calculator. Needs \\usepackage{tikz} in the preamble.',
    ...defs,
    `\\begin{tikzpicture}[x=0.75pt, y=-0.75pt, line cap=round, line join=round]`,
    `\\clip (0,0) rectangle (${scene.width},${scene.height});`,
    ...body,
    '\\end{tikzpicture}',
    '',
  ].join('\n');
}
