import { parse } from '@math/engine';
import { recognizeImage, recognizeInk, type Stroke, type Sym } from '@math/input';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { MathInput } from '../components/MathInput';
import type { InkStrings } from './strings';
import { photoTemplates } from './templates';

const reads = (text: string) => {
  try {
    parse(text);
    return text.trim().length > 0;
  } catch {
    return false;
  }
};

/**
 * Math by hand or by photo, recognised on this device. What it read opens
 * in an editable math field, to be checked and fixed before it is added.
 */
export function InkPanel({ s, keyboard, onAdd }: { s: InkStrings; keyboard: 'text' | 'none'; onAdd: (line: string) => void }) {
  const [mode, setMode] = useState<'draw' | 'photo'>('draw');
  const [text, setText] = useState('');
  const ok = reads(text);
  return (
    <div className="ink">
      <div className="segmented" role="group" aria-label={s.modes}>
        <button type="button" aria-pressed={mode === 'draw'} onClick={() => setMode('draw')}>
          {s.draw}
        </button>
        <button type="button" aria-pressed={mode === 'photo'} onClick={() => setMode('photo')}>
          {s.photo}
        </button>
      </div>
      {mode === 'draw' ? <DrawPad s={s} onRead={setText} /> : <PhotoReader s={s} onRead={setText} />}
      <div className="ink__result">
        <span className="ink__label" id="ink-result-label">
          {s.result}
        </span>
        <div className="ink__field">
          <MathInput
            value={text}
            onChange={setText}
            label={s.result}
            describedBy="ink-result-hint"
            invalid={text.trim() !== '' && !ok}
            keyboard={keyboard}
            fieldRef={() => {}}
            onFocus={() => {}}
            onEnter={() => ok && onAdd(text)}
            onBackspaceEmpty={() => {}}
            onMoveOut={() => {}}
          />
        </div>
        <p id="ink-result-hint" className="ink__hint" aria-live="polite">
          {text.trim() === '' ? s.nothing : ok ? s.check : s.unreadable}
        </p>
        <button type="button" className="btn btn--small btn--primary" disabled={!ok} onClick={() => onAdd(text)}>
          {s.add}
        </button>
      </div>
      <p className="ink__privacy">{s.stays}</p>
    </div>
  );
}

function DrawPad({ s, onRead }: { s: InkStrings; onRead: (text: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [count, setCount] = useState(0);

  const draw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(c);
    // a faint writing line, like ruled paper
    ctx.strokeStyle = css.getPropertyValue('--color-rule').trim();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, h * 0.68);
    ctx.lineTo(w - 12, h * 0.68);
    ctx.stroke();
    ctx.strokeStyle = css.getPropertyValue('--color-ink').trim();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of [...strokes.current, ...(current.current ? [current.current] : [])]) {
      ctx.beginPath();
      st.forEach((p, k) => (k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (st.length === 1) ctx.lineTo(st[0]!.x + 0.1, st[0]!.y);
      ctx.stroke();
    }
  };
  useLayoutEffect(draw);
  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    const theme = () => draw();
    window.addEventListener('themechange', theme);
    return () => {
      ro.disconnect();
      window.removeEventListener('themechange', theme);
    };
  }, []);

  const read = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onRead(strokes.current.length ? recognizeInk(strokes.current).text : ''), 250);
  };
  const local = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div className="ink__pad-wrap">
      <canvas
        ref={canvasRef}
        className="ink__pad"
        role="img"
        aria-label={s.pad}
        aria-describedby="ink-pad-hint"
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // capture only helps strokes that leave the pad
          }
          current.current = [local(e)];
          draw();
        }}
        onPointerMove={(e) => {
          if (!current.current) return;
          // the points between frames, when the browser keeps them (an empty list means it didn't)
          const coalesced = e.nativeEvent.getCoalescedEvents?.() ?? [];
          const events = coalesced.length ? coalesced : [e.nativeEvent];
          const r = e.currentTarget.getBoundingClientRect();
          for (const ev of events) current.current.push({ x: ev.clientX - r.left, y: ev.clientY - r.top });
          draw();
        }}
        onPointerUp={() => {
          if (!current.current) return;
          strokes.current.push(current.current);
          current.current = null;
          setCount(strokes.current.length);
          read();
        }}
        onPointerCancel={() => {
          current.current = null;
          draw();
        }}
      />
      <p id="ink-pad-hint" className="ink__hint">
        {s.padHint}
      </p>
      <div className="ink__tools">
        <button
          type="button"
          className="btn btn--small"
          disabled={count === 0}
          onClick={() => {
            strokes.current.pop();
            setCount(strokes.current.length);
            read();
          }}
        >
          {s.undo}
        </button>
        <button
          type="button"
          className="btn btn--small btn--quiet"
          disabled={count === 0}
          onClick={() => {
            strokes.current = [];
            setCount(0);
            read();
          }}
        >
          {s.clear}
        </button>
      </div>
    </div>
  );
}

const MAX_SIDE = 1200;

function PhotoReader({ s, onRead }: { s: InkStrings; onRead: (text: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const image = useRef<ImageData | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [crop, setCrop] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const [symbols, setSymbols] = useState<Sym[]>([]);
  const [state, setState] = useState<'idle' | 'reading' | 'bad'>('idle');

  const open = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const w = Math.round(img.width * k);
      const h = Math.round(img.height * k);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, w, h);
      image.current = ctx.getImageData(0, 0, w, h);
      URL.revokeObjectURL(url);
      setCrop(null);
      setState('idle');
      setLoaded((n) => n + 1);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setState('bad');
    };
    img.src = url;
  };

  // read the picture (or the dragged part of it) once it or the crop changes
  useEffect(() => {
    const img = image.current;
    if (!img) return;
    let cancelled = false;
    setState('reading');
    const t = setTimeout(async () => {
      const templates = await photoTemplates();
      const r = crop ? cropOf(img, crop) : { data: img.data, w: img.width, h: img.height, dx: 0, dy: 0 };
      const out = recognizeImage(r.data, r.w, r.h, templates);
      if (cancelled) return;
      setSymbols(out.symbols.map((sym) => ({ ...sym, box: { x0: sym.box.x0 + r.dx, y0: sym.box.y0 + r.dy, x1: sym.box.x1 + r.dx, y1: sym.box.y1 + r.dy } })));
      onRead(out.text);
      setState('idle');
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // onRead is the parent's setter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, crop]);

  // the picture, the crop and what was found
  useLayoutEffect(() => {
    const c = canvasRef.current;
    const img = image.current;
    if (!c || !img) return;
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.putImageData(img, 0, 0);
    const css = getComputedStyle(c);
    const accent = css.getPropertyValue('--color-accent').trim();
    ctx.lineWidth = Math.max(2, img.width / 400);
    if (crop) {
      ctx.fillStyle = css.getPropertyValue('--color-scrim').trim();
      ctx.fillRect(0, 0, img.width, img.height);
      ctx.putImageData(img, 0, 0, crop.x0, crop.y0, crop.x1 - crop.x0, crop.y1 - crop.y0);
      ctx.strokeStyle = accent;
      ctx.strokeRect(crop.x0, crop.y0, crop.x1 - crop.x0, crop.y1 - crop.y0);
    }
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.7;
    for (const sym of symbols) ctx.strokeRect(sym.box.x0 - 2, sym.box.y0 - 2, sym.box.x1 - sym.box.x0 + 4, sym.box.y1 - sym.box.y0 + 4);
    ctx.globalAlpha = 1;
  });

  const toImage = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const img = image.current!;
    return { x: ((e.clientX - r.left) / r.width) * img.width, y: ((e.clientY - r.top) / r.height) * img.height };
  };

  return (
    <div className="ink__photo">
      <label className="btn btn--small ink__choose">
        {s.choose}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="visually-hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) open(f);
            e.target.value = '';
          }}
        />
      </label>
      <p className="ink__hint">{state === 'bad' ? s.badImage : s.photoHint}</p>
      {image.current && (
        <canvas
          ref={canvasRef}
          className="ink__preview"
          role="img"
          aria-label={s.photoAlt}
          onPointerDown={(e) => {
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // fine without
            }
            dragFrom.current = toImage(e);
          }}
          onPointerUp={(e) => {
            const a = dragFrom.current;
            dragFrom.current = null;
            if (!a) return;
            const b = toImage(e);
            const box = { x0: Math.round(Math.min(a.x, b.x)), y0: Math.round(Math.min(a.y, b.y)), x1: Math.round(Math.max(a.x, b.x)), y1: Math.round(Math.max(a.y, b.y)) };
            // a tap clears the crop; a drag sets it
            setCrop(box.x1 - box.x0 > 12 && box.y1 - box.y0 > 12 ? box : null);
          }}
        />
      )}
      {state === 'reading' && <p className="ink__hint" aria-live="polite">{s.reading}</p>}
    </div>
  );
}

function cropOf(img: ImageData, c: { x0: number; y0: number; x1: number; y1: number }) {
  const w = c.x1 - c.x0;
  const h = c.y1 - c.y0;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) data.set(img.data.subarray(((c.y0 + y) * img.width + c.x0) * 4, ((c.y0 + y) * img.width + c.x0 + w) * 4), y * w * 4);
  return { data, w, h, dx: c.x0, dy: c.y0 };
}
