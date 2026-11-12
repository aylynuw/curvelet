import { useEffect, useState } from 'react';
import type { Strings } from '../i18n';
import { nice, type GraphPicture } from '../graph/pictures';

/**
 * An image in the expression list, like Desmos: its file, a way to swap it,
 * and the centre, angle, width, height and opacity, each typed in place.
 */
export function PictureRow({
  pic,
  t,
  degrees,
  selected,
  onSelect,
  onChange,
  onReplace,
  onDelete,
}: {
  pic: GraphPicture;
  t: Strings;
  /** angles shown in degrees (the worksheet's angle setting) */
  degrees: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<GraphPicture>) => void;
  onReplace: () => void;
  onDelete: () => void;
}) {
  const angle = pic.angle ?? 0;
  const shownAngle = degrees ? nice((angle * 180) / Math.PI) : nice(angle);
  const name = pic.name?.trim() || t.pictureUntitled;
  return (
    <li className={`line pic${selected ? ' is-selected' : ''}`} data-pic={pic.id} onFocusCapture={onSelect} onPointerDown={onSelect}>
      <span className="line__gutter">
        <img className="pic__thumb" src={pic.src} alt="" />
      </span>
      <div className="line__body pic__body">
        <div className="pic__head">
          <span className="pic__name" title={name}>
            {name}
          </span>
          <button type="button" className="btn btn--small btn--link" onClick={onReplace}>
            {t.pictureChange}
          </button>
        </div>
        <div className="pic__grid">
          <Field
            label={t.pictureCenter}
            value={`(${nice(pic.cx)}, ${nice(pic.cy)})`}
            parse={(s) => {
              const m = /^\(?\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)?$/.exec(s.trim());
              const [x, y] = m ? [num(m[1]!), num(m[2]!)] : [NaN, NaN];
              return Number.isFinite(x) && Number.isFinite(y) ? { cx: x, cy: y } : null;
            }}
            onChange={onChange}
          />
          <Field
            label={t.pictureAngle}
            unit={degrees ? '°' : 'rad'}
            value={String(shownAngle)}
            parse={(s) => {
              const v = num(s.replace(/°|rad/g, ''));
              return Number.isFinite(v) ? { angle: degrees ? (v * Math.PI) / 180 : v } : null;
            }}
            onChange={onChange}
          />
          <Field
            label={t.pictureWidth}
            value={String(nice(pic.w))}
            parse={(s) => {
              const v = num(s);
              return v > 0 ? { w: v } : null;
            }}
            onChange={onChange}
          />
          <Field
            label={t.pictureHeight}
            value={String(nice(pic.h))}
            parse={(s) => {
              const v = num(s);
              return v > 0 ? { h: v } : null;
            }}
            onChange={onChange}
          />
          <label className="pic__field pic__field--wide">
            <span className="pic__label">{t.pictureOpacity}</span>
            <input className="pic__range" type="range" min="0" max="100" value={Math.round(pic.opacity * 100)} aria-valuetext={`${Math.round(pic.opacity * 100)}%`} onChange={(e) => onChange({ opacity: e.target.valueAsNumber / 100 })} />
            <span className="pic__value num">{nice(pic.opacity)}</span>
          </label>
        </div>
      </div>
      <button type="button" className="icon-btn line__delete" aria-label={t.pictureDelete} onClick={onDelete}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
    </li>
  );
}

/** a typed value: kept as text while typing, applied on Enter or leaving the field */
function Field({ label, value, unit, parse, onChange }: { label: string; value: string; unit?: string; parse: (s: string) => Partial<GraphPicture> | null; onChange: (p: Partial<GraphPicture>) => void }) {
  const [draft, setDraft] = useState(value);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setDraft(value);
    setBad(false);
  }, [value]);
  const commit = () => {
    if (draft === value) return;
    const p = parse(draft);
    if (p) onChange(p);
    else setBad(true);
  };
  return (
    <label className="pic__field">
      <span className="pic__label">{label}</span>
      <input
        className={`input pic__input num${bad ? ' is-bad' : ''}`}
        value={draft}
        inputMode="decimal"
        spellCheck={false}
        aria-invalid={bad || undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          setBad(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(value);
        }}
      />
      {unit && <span className="pic__unit">{unit}</span>}
    </label>
  );
}

/** a number as typed: 1.5, -3/4, π, 2π/3, pi/2 */
export function num(text: string): number {
  const s = text.trim().replace(/pi/gi, 'π').replace(/\s+/g, '').replace(/−/g, '-');
  const m = /^([+-]?)(\d*\.?\d*)(π?)(?:\/(\d*\.?\d+))?$/.exec(s);
  if (!m || (!m[2] && !m[3])) return NaN;
  const k = m[2] ? Number(m[2]) : 1;
  const v = (k * (m[3] ? Math.PI : 1)) / (m[4] ? Number(m[4]) : 1);
  return m[1] === '-' ? -v : v;
}
