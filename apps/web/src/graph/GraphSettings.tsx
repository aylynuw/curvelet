import { useEffect, useRef, useState } from 'react';
import type { Strings } from '../i18n';
import type { Range } from '../teach/templates';
import type { FigureOptions } from './GraphPanel';

const round = (v: number) => {
  const r = Number(v.toPrecision(4));
  return Object.is(r, -0) ? 0 : r;
};

/**
 * The graph's settings, from a HUD button: the grid (squares, polar, none),
 * x-axis numbers in multiples of π, coordinates beside points, and a window
 * typed as x and y ranges.
 */
export function GraphSettings({
  t,
  figure,
  onFigure,
  range,
  onRange,
}: {
  t: Strings;
  figure: FigureOptions;
  onFigure: (f: FigureOptions) => void;
  range: Range;
  onRange: (r: Range) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // the range fields start from the window as it is when opened
  const [draft, setDraft] = useState<Record<keyof Range, string>>({ xmin: '', xmax: '', ymin: '', ymax: '' });
  // the fields follow the window until one is edited
  const [edited, setEdited] = useState(false);
  const shown = { xmin: String(round(range.xmin)), xmax: String(round(range.xmax)), ymin: String(round(range.ymin)), ymax: String(round(range.ymax)) };
  const shownKey = Object.values(shown).join(' ');
  useEffect(() => {
    if (!open) setEdited(false);
    else if (!edited) setDraft(shown);
    // shownKey stands for shown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edited, shownKey]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const nums = Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v)])) as Record<keyof Range, number>;
  const valid = Object.values(draft).every((v) => v.trim() !== '' && Number.isFinite(Number(v))) && nums.xmax > nums.xmin && nums.ymax > nums.ymin;
  const grid = figure.grid ?? 'cartesian';

  return (
    <div className="menu gsettings" ref={ref} data-align="left">
      <button type="button" className="hud-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        {t.graphSettings}
      </button>
      {open && (
        <div className="gsettings__panel" role="dialog" aria-label={t.graphSettings}>
          <div className="gsettings__row">
            <span className="field__label">{t.gridLabel}</span>
            <div className="segmented" role="group" aria-label={t.gridLabel}>
              {(
                [
                  ['cartesian', t.gridSquares],
                  ['polar', t.gridPolar],
                  ['none', t.gridNone],
                ] as const
              ).map(([g, label]) => (
                <button key={g} type="button" aria-pressed={grid === g} onClick={() => onFigure({ ...figure, grid: g })}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="gsettings__row">
            <span className="field__label">{t.xNumbers}</span>
            <div className="segmented" role="group" aria-label={t.xNumbers}>
              <button type="button" aria-pressed={!figure.piTicks} onClick={() => onFigure({ ...figure, piTicks: false })}>
                {t.xDecimal}
              </button>
              <button type="button" aria-pressed={!!figure.piTicks} onClick={() => onFigure({ ...figure, piTicks: true })}>
                {t.xPi}
              </button>
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={figure.pointLabels !== false} onChange={(e) => onFigure({ ...figure, pointLabels: e.target.checked })} />
            {t.pointCoords}
          </label>
          <form
            className="gsettings__range"
            aria-label={t.rangeLabel}
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              onRange(nums);
              setEdited(false);
            }}
          >
            <span className="field__label">{t.rangeLabel}</span>
            <div className="gsettings__grid">
              {(['xmin', 'xmax', 'ymin', 'ymax'] as const).map((k) => (
                <label key={k} className="gsettings__cell">
                  <span className="gsettings__key">{`${k[0]} ${k.slice(1) === 'min' ? 'min' : 'max'}`}</span>
                  <input className="input input--code" inputMode="decimal" value={draft[k]} onChange={(e) => {
                      setEdited(true);
                      setDraft((d) => ({ ...d, [k]: e.target.value }));
                    }} />
                </label>
              ))}
            </div>
            <button type="submit" className="btn btn--small" disabled={!valid}>
              {t.rangeApply}
            </button>
            <p className="gsettings__note">{t.rangeNote}</p>
          </form>
        </div>
      )}
    </div>
  );
}
