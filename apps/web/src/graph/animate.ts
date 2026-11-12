import type { Graphable } from '@math/engine';
import { drawScene, encodeGif, type SceneOptions, type Viewport } from '@math/render';
import { download, exportScene } from './exportGraph';

/** One slider swept from min to max and back, as the export sees it. */
export interface Sweep {
  name: string;
  min: number;
  max: number;
  /** the graph with the slider at v */
  at(v: number): Graphable[];
  /** put the worksheet back as it was */
  restore(): void;
}

/** n values from min to max and back again, so the loop has no jump. */
function pingPong(min: number, max: number, n: number): number[] {
  const half = Array.from({ length: n }, (_, k) => min + ((max - min) * k) / (n - 1));
  return [...half, ...half.slice(1, -1).reverse()];
}

/** The frame size: the view, at most 720 px wide (GIFs get big fast). */
function frameSize(view: Viewport) {
  const k = Math.min(1, 720 / view.width);
  return { width: Math.round(view.width * k), height: Math.round(view.height * k), k };
}

function frameCanvas(view: Viewport) {
  const { width, height, k } = frameSize(view);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  return { canvas, ctx, width, height };
}

const nextTask = () => new Promise<void>((done) => setTimeout(done));

export async function exportGif(sweep: Sweep, view: Viewport, opts: SceneOptions, el: Element, name: string, progress: (pct: number) => void) {
  const { ctx, width, height } = frameCanvas(view);
  const frames: Uint8ClampedArray[] = [];
  const values = pingPong(sweep.min, sweep.max, 31);
  try {
    for (const [k, v] of values.entries()) {
      const { scene, theme } = exportScene(sweep.at(v), view, opts, el);
      drawScene(ctx, scene, { ...theme, background: theme.background ?? '#ffffff' });
      frames.push(ctx.getImageData(0, 0, width, height).data);
      progress(Math.round((80 * (k + 1)) / values.length));
      // let the page breathe between frames
      await nextTask();
    }
  } finally {
    sweep.restore();
  }
  const gif = encodeGif(frames, width, height, 6);
  progress(100);
  download(new Blob([gif as BlobPart], { type: 'image/gif' }), `${name}.gif`);
}

/** MP4 where the browser can record it (Safari, recent Chrome), WebM elsewhere. */
export function videoType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mime, ext] of [
    ['video/mp4;codecs=avc1', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm', 'webm'],
  ] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

/** Records the sweep in real time, 30 frames a second, about six seconds. */
export async function exportVideo(sweep: Sweep, view: Viewport, opts: SceneOptions, el: Element, name: string, progress: (pct: number) => void) {
  const type = videoType();
  if (!type) throw new Error('no video');
  const { canvas, ctx } = frameCanvas(view);
  const values = pingPong(sweep.min, sweep.max, 91);
  const draw = (v: number) => {
    const { scene, theme } = exportScene(sweep.at(v), view, opts, el);
    drawScene(ctx, scene, { ...theme, background: theme.background ?? '#ffffff' });
  };
  draw(values[0]!);
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((done) => (recorder.onstop = () => done()));
  recorder.start();
  try {
    const start = performance.now();
    for (let k = 0; k < values.length; k++) {
      // keep to the clock: a frame every 1/30 s
      const due = start + (k * 1000) / 30;
      await new Promise<void>((done) => setTimeout(done, Math.max(0, due - performance.now())));
      draw(values[k]!);
      progress(Math.round((100 * (k + 1)) / values.length));
    }
    await new Promise<void>((done) => setTimeout(done, 100));
  } finally {
    recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    sweep.restore();
  }
  await stopped;
  download(new Blob(chunks, { type: type.mime.split(';')[0] }), `${name}.${type.ext}`);
}
