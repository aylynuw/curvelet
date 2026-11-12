import { dashPattern } from './look';
import { isTransparent, parseHex, type Rgb } from './color';
import type { Label, Scene } from './scene';
import { isMathLabel, mathRuns, type DrawTheme, type Run } from './theme';

/**
 * A scene as a one-page vector PDF, page size = figure size (1 px = 0.75 pt).
 * Text uses the PDF base fonts (Times for exam figures, Helvetica otherwise),
 * which every PDF reader has, so nothing is embedded. Those fonts cover Latin
 * text only: other scripts print as "?".
 */
export function sceneToPdf(scene: Scene, theme: DrawTheme, rgb: (css: string) => Rgb = parseHex): Uint8Array {
  const exam = scene.style === 'exam';
  const W = scene.width;
  const H = scene.height;
  const n = (v: number) => String(Math.round(v * 100) / 100);
  const col = (css: string) => rgb(css).map((c) => n(c / 255)).join(' ');
  const color = (series: number) => theme.curves[series % theme.curves.length]!;
  const ops: string[] = [];

  // 1 px = 0.75 pt, y downwards like the screen
  ops.push(`0.75 0 0 -0.75 0 ${n(H * 0.75)} cm`);
  if (theme.background && !isTransparent(theme.background)) ops.push(`${col(theme.background)} rg 0 0 ${W} ${H} re f`);

  const segs = (s: number[]) => {
    let d = '';
    for (let k = 0; k + 3 < s.length; k += 4) d += `${n(s[k]!)} ${n(s[k + 1]!)} m ${n(s[k + 2]!)} ${n(s[k + 3]!)} l `;
    return d;
  };
  const poly = (p: number[], close = false) => {
    let d = '';
    for (let k = 0; k + 1 < p.length; k += 2) d += `${n(p[k]!)} ${n(p[k + 1]!)} ${k === 0 ? 'm' : 'l'} `;
    return close ? `${d}h ` : d;
  };
  const stroke = (css: string, width: number, path: string, dash = '') => {
    if (!path || isTransparent(css)) return;
    ops.push(`${col(css)} RG ${n(width)} w [${dash}] 0 d ${path}S`);
  };

  stroke(theme.gridMinor, 1, segs(scene.gridMinor));
  stroke(theme.gridMajor, 1, segs(scene.gridMajor));

  for (const f of scene.fills) {
    let path = f.polys.map((p) => poly(p, true)).join('');
    for (let k = 0; k + 3 < f.rects.length; k += 4) path += `${n(f.rects[k]!)} ${n(f.rects[k + 1]!)} ${n(f.rects[k + 2]!)} ${n(f.rects[k + 3]!)} re `;
    if (path) ops.push(`/Fill gs ${col(exam ? theme.ink : (f.color ?? color(f.series)))} rg ${path}f /Opaque gs`);
  }
  stroke(theme.ink, theme.axisWidth, segs(scene.axes));
  stroke(theme.ink, theme.axisWidth, segs(scene.ticks));
  for (const a of scene.arrows) {
    const tri =
      a.dir === 'right'
        ? `${n(a.x)} ${n(a.y)} m ${n(a.x - 9)} ${n(a.y - 3.5)} l ${n(a.x - 7)} ${n(a.y)} l ${n(a.x - 9)} ${n(a.y + 3.5)} l h`
        : `${n(a.x)} ${n(a.y)} m ${n(a.x - 3.5)} ${n(a.y + 9)} l ${n(a.x)} ${n(a.y + 7)} l ${n(a.x + 3.5)} ${n(a.y + 9)} l h`;
    ops.push(`${col(theme.ink)} rg ${tri} f`);
  }
  stroke(theme.ink, 0.8, segs(scene.guides), '3 3');
  ops.push('1 J 1 j');
  for (const c of scene.curves) {
    const path = c.lines.map((l) => poly(l)).join('') + segs(c.segs);
    const width = c.width ?? theme.curveWidth * (c.weight ?? 1);
    stroke(exam || c.ink ? theme.ink : (c.color ?? color(c.series)), width, path, dashPattern(c, exam, width).join(' '));
  }
  for (const p of scene.points) {
    const r = exam ? 2.6 : 4.5;
    const k = 0.5523 * r;
    const [x, y] = [p.x, p.y];
    ops.push(
      `${col(exam ? theme.ink : (p.color ?? (p.colored ? color(p.series) : theme.ink)))} rg ${n(x + r)} ${n(y)} m ` +
        `${n(x + r)} ${n(y + k)} ${n(x + k)} ${n(y + r)} ${n(x)} ${n(y + r)} c ` +
        `${n(x - k)} ${n(y + r)} ${n(x - r)} ${n(y + k)} ${n(x - r)} ${n(y)} c ` +
        `${n(x - r)} ${n(y - k)} ${n(x - k)} ${n(y - r)} ${n(x)} ${n(y - r)} c ` +
        `${n(x + k)} ${n(y - r)} ${n(x + r)} ${n(y - k)} ${n(x + r)} ${n(y)} c f`,
    );
  }

  for (const l of scene.labels) ops.push(text(l));

  function text(l: Label): string {
    const small = l.kind === 'tick' && !exam;
    const size = small ? theme.fontSize - 3 : theme.fontSize;
    const runs: Run[] = exam && isMathLabel(l) ? mathRuns(l.text) : [{ text: l.text, italic: false }];
    const sizeOf = (r: Run) => (r.sup ? size * 0.7 : size);
    const width = runs.reduce((w, r) => w + textWidth(r.text, sizeOf(r), exam), 0);
    let x = l.anchor === 'start' ? l.x : l.anchor === 'middle' ? l.x - width / 2 : l.x - width;
    const base = l.baseline === 'top' ? l.y + size * 0.72 : l.baseline === 'middle' ? l.y + size * 0.35 : l.y;
    const fill = small ? theme.muted : theme.ink;
    let out = '';
    for (const piece of splitGreek(runs)) {
      const r = piece;
      // Greek letters come from the Symbol base font (θ is "q" there, π is "p")
      const font = piece.greek ? '/F3' : r.italic ? '/F2' : '/F1';
      const y = r.sup ? base - size * 0.35 : base;
      const s = pdfString(piece.greek ? toSymbol(r.text) : r.text);
      // flip the text matrix back, since the page's y runs downwards
      const place = `BT ${font} ${n(sizeOf(r))} Tf 1 0 0 -1 ${n(x)} ${n(y)} Tm`;
      if (theme.halo && l.kind !== 'axis') out += `${col(theme.halo)} RG 3 w 1 Tr ${place} ${s} Tj ET `;
      out += `${col(fill)} rg 0 Tr ${place} ${s} Tj ET `;
      x += textWidth(r.text, sizeOf(r), exam);
    }
    return out;
  }

  const content = ops.join('\n');
  const fonts = exam ? ['Times-Roman', 'Times-Italic'] : ['Helvetica', 'Helvetica-Oblique'];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(W * 0.75)} ${n(H * 0.75)}] ` +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 9 0 R >> /ExtGState << /Fill 7 0 R /Opaque 8 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /${fonts[0]} /Encoding /WinAnsiEncoding >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /${fonts[1]} /Encoding /WinAnsiEncoding >>`,
    `<< /Type /ExtGState /ca ${n(theme.fillOpacity)} >>`,
    '<< /Type /ExtGState /ca 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>',
  ];
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  objects.forEach((body, k) => {
    offsets.push(pdf.length);
    pdf += `${k + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // every character above is a single byte (WinAnsi), so offsets are byte offsets
  return Uint8Array.from(pdf, (c) => c.charCodeAt(0) & 0xff);
}

const SYMBOL: Record<string, string> = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', θ: 'q', λ: 'l', μ: 'm', π: 'p', σ: 's', τ: 't', φ: 'f', ω: 'w',
};
const isGreek = (ch: string) => ch in SYMBOL;
const toSymbol = (s: string) => [...s].map((c) => SYMBOL[c] ?? '?').join('');

/** Split runs so that Greek letters form their own pieces. */
function splitGreek(runs: Run[]): (Run & { greek: boolean })[] {
  const out: (Run & { greek: boolean })[] = [];
  for (const r of runs) {
    for (const m of r.text.matchAll(/[α-ω]+|[^α-ω]+/g)) out.push({ ...r, text: m[0], greek: isGreek(m[0][0]!) });
  }
  return out;
}

/** Text as a PDF string in WinAnsi: − becomes the en dash (same width as a minus in Times), other scripts "?". */
function pdfString(s: string): string {
  let out = '(';
  for (const ch of s) {
    const code = ch === '−' ? 0x96 : ch.codePointAt(0)!;
    const c = code < 256 ? String.fromCharCode(code) : '?';
    out += c === '(' || c === ')' || c === '\\' ? `\\${c}` : c;
  }
  return `${out})`;
}

/** Approximate advance widths (in 1/1000 em) of the base fonts, for centring and right-aligning labels. */
function textWidth(s: string, size: number, times: boolean): number {
  let units = 0;
  for (const ch of s) {
    if (/[0-9]/.test(ch)) units += times ? 500 : 556;
    else if (ch === ' ') units += times ? 250 : 278;
    else if ('.,'.includes(ch)) units += times ? 250 : 278;
    else if ('()-'.includes(ch)) units += 333;
    else if ('+=<>'.includes(ch)) units += 564;
    else if (ch === '−') units += times ? 500 : 556;
    else if ('ijlt'.includes(ch)) units += 278;
    else if ('frs'.includes(ch)) units += times ? 350 : 400;
    else if ('mw'.includes(ch)) units += 760;
    else if (/[a-z]/.test(ch)) units += times ? 480 : 540;
    else if (/[A-Z]/.test(ch)) units += 680;
    else units += 600;
  }
  return (units / 1000) * size;
}
