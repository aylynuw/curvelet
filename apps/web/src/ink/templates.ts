import { components, INK_SHAPES, photoTemplatesFromStrokes, piecesCloud, type Mask, type Template } from '@math/input';

/** the characters a printed symbol is drawn with, per label */
const GLYPHS: Record<string, string> = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  x: 'x', y: 'y', a: 'a', b: 'b', n: 'n', t: 't', e: 'e',
  '+': '+', '-': '−', '=': '=', '(': '(', ')': ')', '/': '/', '√': '√', π: 'π', '<': '<', '>': '>',
};
/** the app's own fonts (always loaded) and the system's, upright and italic as math is printed */
const FONTS = ['500 64px "IBM Plex Sans"', '64px KaTeX_Main', 'italic 64px KaTeX_Math', '64px serif', '64px sans-serif'];

let cached: Template[] | null = null;

/**
 * Templates for photos: printed glyphs rendered from fonts, plus the
 * handwriting shapes drawn as ink. Built once, in the browser.
 */
export async function photoTemplates(): Promise<Template[]> {
  if (cached) return cached;
  await document.fonts?.ready;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const out: Template[] = [];
  for (const font of FONTS) {
    for (const [label, ch] of Object.entries(GLYPHS)) {
      // letters only in the math italic, digits and signs in every face
      if (font.includes('KaTeX_Math') && !/^[a-z]$/.test(label)) continue;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = '#000';
      ctx.font = font;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(ch, size / 2, size / 2);
      const img = ctx.getImageData(0, 0, size, size).data;
      const data = new Uint8Array(size * size);
      for (let p = 0; p < size * size; p++) data[p] = img[p * 4]! < 128 ? 1 : 0;
      const m: Mask = { w: size, h: size, data };
      const comps = components(m, 1);
      if (comps.length === 0) continue;
      out.push({ label, cloud: piecesCloud(comps, m), strokes: comps.length });
    }
  }
  cached = [...out, ...photoTemplatesFromStrokes(INK_SHAPES)];
  return cached;
}
