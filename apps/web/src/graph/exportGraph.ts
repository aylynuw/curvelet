import {
  EXAM_THEME,
  buildScene,
  sceneToPdf,
  sceneToSvg,
  sceneToTikz,
  type DrawTheme,
  type Rgb,
  type Scene,
  type SceneOptions,
  type Viewport,
} from '@math/render';
import type { Graphable } from '@math/engine';
import { saveBlob } from '../files/save';

/** The graph's colours and type, read from the page's CSS tokens. */
export function readTheme(el: Element): DrawTheme {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  const font = v('--font-body') || 'sans-serif';
  return {
    background: null,
    ink: v('--color-ink'),
    muted: v('--color-muted'),
    gridMinor: v('--color-grid'),
    gridMajor: v('--color-grid-2'),
    curves: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => v(`--color-curve-${k}`)),
    fillOpacity: 0.16,
    font,
    mathFont: font,
    fontSize: 13,
    curveWidth: 2.5,
    axisWidth: 1.25,
    halo: v('--color-paper'),
  };
}

/** saves the file: a download in a browser, the Save dialog in the desktop app */
export const download = (blob: Blob, name: string) => saveBlob(blob, name);

/**
 * Any CSS colour (the theme uses oklch) as sRGB, through a one-pixel canvas.
 * Translucent colours (the grid) are blended over `under`, the page colour,
 * since PDF and TikZ get them as solid colours.
 */
export function cssToRgb(css: string, under = '#ffffff'): Rgb {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!ctx) return [0, 0, 0];
  ctx.fillStyle = under;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r ?? 0, g ?? 0, b ?? 0];
}

/** The scene and colours a file export uses: finer sampling, and the page background behind screen-style graphs. */
export function exportScene(graphables: Graphable[], view: Viewport, opts: SceneOptions, el: Element): { scene: Scene; theme: DrawTheme } {
  const exam = opts.style === 'exam';
  const theme = exam ? EXAM_THEME : { ...readTheme(el), background: getComputedStyle(el).getPropertyValue('--color-paper').trim() };
  return { scene: buildScene(graphables, view, { ...opts, sampleStep: 0.5 }), theme };
}

/** The current view as an SVG document. */
export function graphSvg(graphables: Graphable[], view: Viewport, opts: SceneOptions, el: Element): string {
  const { scene, theme } = exportScene(graphables, view, opts, el);
  return sceneToSvg(scene, theme);
}

export function exportPdf(graphables: Graphable[], view: Viewport, opts: SceneOptions, el: Element, name: string) {
  const { scene, theme } = exportScene(graphables, view, opts, el);
  const rgb = (css: string) => cssToRgb(css, theme.background ?? '#ffffff');
  download(new Blob([sceneToPdf(scene, theme, rgb) as BlobPart], { type: 'application/pdf' }), `${name}.pdf`);
}

export function exportTikz(graphables: Graphable[], view: Viewport, opts: SceneOptions, el: Element, name: string) {
  const { scene, theme } = exportScene(graphables, view, opts, el);
  const rgb = (css: string) => cssToRgb(css, theme.background ?? '#ffffff');
  download(new Blob([sceneToTikz(scene, theme, rgb)], { type: 'text/x-tex' }), `${name}.tex`);
}

export function exportSvg(svg: string, name: string) {
  download(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
}

/** PNG at `scale`× the view's size (3× ≈ 300 dpi for a figure printed at its screen size). */
export async function exportPng(svg: string, width: number, height: number, name: string, scale = 3) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    await new Promise<void>((done, fail) => {
      img.onload = () => done();
      img.onerror = () => fail(new Error('The figure could not be drawn as an image'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
    if (blob) download(blob, `${name}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
