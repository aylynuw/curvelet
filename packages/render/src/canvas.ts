import { dashPattern } from './look';
import type { Scene } from './scene';
import { isMathLabel, mathRuns, type DrawTheme } from './theme';

function segs(ctx: CanvasRenderingContext2D, s: number[]) {
  ctx.beginPath();
  for (let k = 0; k + 3 < s.length; k += 4) {
    ctx.moveTo(s[k]!, s[k + 1]!);
    ctx.lineTo(s[k + 2]!, s[k + 3]!);
  }
}
function line(ctx: CanvasRenderingContext2D, pts: number[], close = false) {
  for (let k = 0; k + 1 < pts.length; k += 2) {
    if (k === 0) ctx.moveTo(pts[0]!, pts[1]!);
    else ctx.lineTo(pts[k]!, pts[k + 1]!);
  }
  if (close) ctx.closePath();
}

const BASELINE = { top: 'top', middle: 'middle', bottom: 'alphabetic' } as const;

/** Draws a scene on a canvas whose context is already scaled for the device pixel ratio. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, theme: DrawTheme): void {
  const exam = scene.style === 'exam';
  const color = (series: number) => theme.curves[series % theme.curves.length]!;
  ctx.save();
  ctx.clearRect(0, 0, scene.width, scene.height);
  if (theme.background) {
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, scene.width, scene.height);
  }
  if (scene.image && typeof document !== 'undefined') {
    // the image is drawn at its own size off screen, then scaled up to the view
    const { width, height, step, data } = scene.image;
    const off = document.createElement('canvas');
    off.width = width;
    off.height = height;
    off.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, width * step, height * step);
    ctx.restore();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = theme.gridMinor;
  segs(ctx, scene.gridMinor);
  ctx.stroke();
  ctx.strokeStyle = theme.gridMajor;
  segs(ctx, scene.gridMajor);
  ctx.stroke();

  for (const f of scene.fills) {
    ctx.globalAlpha = f.opacity ?? theme.fillOpacity;
    ctx.fillStyle = exam ? theme.ink : (f.color ?? color(f.series));
    ctx.beginPath();
    for (const p of f.polys) line(ctx, p, true);
    for (let k = 0; k + 3 < f.rects.length; k += 4) ctx.rect(f.rects[k]!, f.rects[k + 1]!, f.rects[k + 2]!, f.rects[k + 3]!);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = theme.axisWidth;
  segs(ctx, scene.axes);
  ctx.stroke();
  segs(ctx, scene.ticks);
  ctx.stroke();
  ctx.fillStyle = theme.ink;
  for (const a of scene.arrows) {
    ctx.beginPath();
    if (a.dir === 'right') {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x - 9, a.y - 3.5);
      ctx.lineTo(a.x - 7, a.y);
      ctx.lineTo(a.x - 9, a.y + 3.5);
    } else {
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x - 3.5, a.y + 9);
      ctx.lineTo(a.x, a.y + 7);
      ctx.lineTo(a.x + 3.5, a.y + 9);
    }
    ctx.closePath();
    ctx.fill();
  }

  if (scene.guides.length) {
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 0.8;
    segs(ctx, scene.guides);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = theme.curveWidth;
  for (const c of scene.curves) {
    ctx.strokeStyle = exam || c.ink ? theme.ink : (c.color ?? color(c.series));
    ctx.lineWidth = c.width ?? theme.curveWidth * (c.weight ?? 1);
    ctx.setLineDash(dashPattern(c, exam, ctx.lineWidth));
    ctx.beginPath();
    for (const l of c.lines) line(ctx, l);
    for (let k = 0; k + 3 < c.segs.length; k += 4) {
      ctx.moveTo(c.segs[k]!, c.segs[k + 1]!);
      ctx.lineTo(c.segs[k + 2]!, c.segs[k + 3]!);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const p of scene.points) {
    ctx.fillStyle = exam ? theme.ink : (p.color ?? (p.colored ? color(p.series) : theme.ink));
    ctx.beginPath();
    ctx.arc(p.x, p.y, exam ? 2.6 : 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const l of scene.labels) {
    const small = l.kind === 'tick' && !exam;
    const size = small ? theme.fontSize - 3 : theme.fontSize;
    ctx.fillStyle = small ? theme.muted : theme.ink;
    ctx.textBaseline = BASELINE[l.baseline];
    const runs = exam && isMathLabel(l) ? mathRuns(l.text) : [{ text: l.text, italic: false }];
    const fontFor = (run: { italic: boolean; sup?: boolean }) =>
      `${run.italic ? 'italic ' : ''}${run.sup ? Math.round(size * 0.7) : size}px ${exam ? theme.mathFont : theme.font}`;
    const width = runs.reduce((w, run) => {
      ctx.font = fontFor(run);
      return w + ctx.measureText(run.text).width;
    }, 0);
    let x = l.anchor === 'start' ? l.x : l.anchor === 'middle' ? l.x - width / 2 : l.x - width;
    ctx.textAlign = 'left';
    for (const run of runs) {
      ctx.font = fontFor(run);
      const y = run.sup ? l.y - size * 0.35 : l.y;
      if (theme.halo && l.kind !== 'axis') {
        // a halo in the background colour keeps labels readable over curves
        ctx.save();
        ctx.strokeStyle = theme.halo;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeText(run.text, x, y);
        ctx.restore();
      }
      ctx.fillText(run.text, x, y);
      x += ctx.measureText(run.text).width;
    }
  }
  ctx.restore();
}
