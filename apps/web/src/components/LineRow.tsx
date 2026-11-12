import type { Result } from '@math/engine';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Strings } from '../i18n';
import type { MathfieldElement } from '../math/mathlive';
import { MathInput, type MoveOut } from './MathInput';
import { ResultView } from './ResultView';
import { LookPicker } from './LookPicker';
import { suggest } from '../suggest';
import { TableEditor } from '../table/TableEditor';
import { FolderHead, NoteEditor } from './LineKinds';
import type { Folder } from '../storage';
import type { Model, Table } from '../table/table';
import type { LineLook } from '../graph/looks';
import type { SliderSettings } from '../storage';
import type { Lang } from '../i18n';
import { StepsView, type Call, type IntegralAsk } from '../learn/StepsView';
import type { LearnStrings } from '../learn/strings';
import type { EvalSettings } from '@math/engine';
import { fractionsIn, useNumberForm } from '../numberForm';

/** let a = 2 gets a slider: its name and value */
export function sliderOf(source: string): { name: string; value: number; min: number; max: number } | null {
  // let a = 2 or a = 2
  const m = /^\s*(?:let\s+)?([\p{L}][\p{L}\p{N}_]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*$/u.exec(source);
  if (!m) return null;
  const value = Number(m[2]);
  return { name: m[1]!, value, min: Math.min(-10, Math.floor(value)), max: Math.max(10, Math.ceil(value)) };
}

/** what a dragged line carries: its index */
const DRAG_TYPE = 'application/x-calculator-line';

const fmt = (n: number) => String(n).replace('-', '−');

export function LineRow({
  index,
  source,
  result,
  t,
  keyboard,
  fieldRef,
  onChange,
  onEnter,
  onBackspaceEmpty,
  onMoveOut,
  onFocus,
  onDelete,
  onDefine,
  onSwitch,
  pendingNote,
  swatch,
  graphIssue,
  onSlide,
  curveRange,
  steps,
  look,
  swatchColor,
  onLook,
  lang,
  fillable,
  sliderSettings,
  onSliderSettings,
  onMoveLine,
  onMoveFrom,
  table,
  onTable,
  onFit,
  note,
  onNote,
  folder,
  folderCount,
  onFolder,
  inFolder,
  folderHidden,
}: {
  index: number;
  source: string;
  result: Result | undefined;
  t: Strings;
  keyboard: 'text' | 'none';
  fieldRef: (el: MathfieldElement | null) => void;
  onChange: (value: string) => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onMoveOut: (dir: MoveOut) => void;
  onFocus: () => void;
  onDelete: () => void;
  onDefine: (name: string) => void;
  onSwitch: (to: 'factor' | 'expand') => void;
  pendingNote: string | null;
  /** colour slot of this line's curve, when it's on the graph */
  swatch?: number | 'point';
  graphIssue?: string;
  onSlide: (name: string, value: number) => void;
  /** 0 ≤ t ≤ 2π for parametric and polar curves */
  curveRange?: string;
  /** step-by-step working, for lines that call diff, integrate or solve */
  steps?: { call: Call; s: LearnStrings; settings: EvalSettings; askIntegral: IntegralAsk; onAnswer: (l: () => void) => () => void };
  look?: LineLook;
  /** the colour the line is drawn in, for its swatch */
  swatchColor?: string;
  onLook: (look: LineLook | undefined) => void;
  lang: Lang;
  /** the line draws a region (an inequality, a polygon) */
  fillable: boolean;
  sliderSettings?: SliderSettings;
  onSliderSettings: (s: SliderSettings | undefined) => void;
  /** move this line to another index */
  onMoveLine: (to: number) => void;
  /** another line dropped onto this one */
  onMoveFrom: (from: number, to: number) => void;
  /** set when this line is a table */
  table?: Table;
  onTable: (t: Table) => void;
  onFit: (m: Model) => void;
  /** set when this line is a note */
  note?: string;
  onNote: (text: string) => void;
  /** set when this line is a folder heading */
  folder?: Folder;
  folderCount: number;
  onFolder: (f: Folder) => void;
  /** the line sits inside a folder */
  inFolder: boolean;
  /** its folder is off the graph */
  folderHidden: boolean;
}) {
  const n = index + 1;
  const slider = sliderOf(source);
  const sliderValue = slider?.value ?? 0;
  const sliderName = slider?.name ?? null;
  const range = { min: sliderSettings?.min ?? slider?.min ?? -10, max: sliderSettings?.max ?? slider?.max ?? 10 };
  if (range.max <= range.min) range.max = range.min + 1;
  const step = sliderSettings?.step && sliderSettings.step > 0 ? sliderSettings.step : 0.1;
  const speed = sliderSettings?.speed && sliderSettings.speed > 0 ? sliderSettings.speed : 1;
  const [tuning, setTuning] = useState(false);
  const [dropAt, setDropAt] = useState<'above' | 'below' | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  // the loop reads the latest value and handler without restarting
  const live = useRef({ value: sliderValue, onSlide, range, step, speed });
  live.current = { value: sliderValue, onSlide, range, step, speed };
  useEffect(() => {
    if (!playing || !sliderName) return;
    let dir = 1;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const { value, onSlide, range, step, speed } = live.current;
      // the whole range in about six seconds at speed 1
      let v = value + (dir * speed * (range.max - range.min) * Math.min(now - last, 100)) / 6000;
      last = now;
      if (v >= range.max) [v, dir] = [range.max, -1];
      if (v <= range.min) [v, dir] = [range.min, 1];
      // on the step when it is coarse, else to two places
      const snapped = step >= 0.1 ? Math.round(v / step) * step : v;
      onSlide(sliderName, Math.round(snapped * 1e6) / 1e6);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, sliderName]);
  useEffect(() => {
    if (!sliderName) setPlaying(false);
  }, [sliderName]);

  const isError = result?.status === 'error';
  // sinx → sin(x), Sin → sin, a missing end: said plainly, with a fix to click
  const hint = source.trim() && !table && note === undefined && !folder ? suggest(source, result, lang) : null;
  const resultId = `result-${n}`;
  const colour = swatch !== undefined ? swatchColor : undefined;
  const [styling, setStyling] = useState(false);
  // a slider's own value is already on the line
  const form = useNumberForm();
  // a point written as numbers says nothing more, unless its fractions read differently
  const quietPoint = literalKind(source) === 'point' && result?.status === 'value' && (form === 'decimal' || fractionsIn(result.text) === result.text);
  const hasResult = !!result && result.status !== 'empty' && !(slider && result.status === 'value') && !quietPoint;
  return (
    <li
      className={`line${inFolder ? ' line--in-folder' : ''}${folder ? ' line--folder' : ''}${note !== undefined ? ' line--note' : ''}`}
      data-state={result?.status ?? 'empty'}
      data-drop={dropAt ?? undefined}
      style={colour ? ({ '--swatch': colour } as CSSProperties) : undefined}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        setDropAt(e.clientY < r.top + r.height / 2 ? 'above' : 'below');
      }}
      onDragLeave={() => setDropAt(null)}
      onDrop={(e) => {
        const from = Number(e.dataTransfer.getData(DRAG_TYPE));
        const where = dropAt;
        setDropAt(null);
        if (!Number.isInteger(from) || !where) return;
        e.preventDefault();
        // the index this line ends up at once the dragged one is taken out
        let to = where === 'above' ? index : index + 1;
        if (from < to) to -= 1;
        if (from !== to) onMoveFrom(from, to);
      }}
    >
      <span className="line__gutter">
        <span
          className="line__no num"
          aria-hidden="true"
          draggable
          title={t.dragLine}
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, String(index));
            e.dataTransfer.effectAllowed = 'move';
          }}
        >
          {n}
        </span>
        {swatch !== undefined && (
          <button
            type="button"
            className="swatch-btn"
            aria-label={t.styleLine(n)}
            aria-expanded={styling}
            onClick={() => setStyling((v) => !v)}
          >
            <span className={`swatch${swatch === 'point' ? ' swatch--point' : ''}${look?.hidden || folderHidden ? ' swatch--hidden' : ''}`} />
          </button>
        )}
        {styling && swatch !== undefined && (
          <LookPicker
            n={n}
            lang={lang}
            look={look}
            slot={typeof swatch === 'number' ? swatch : 0}
            fillable={fillable}
            point={swatch === 'point'}
            onChange={onLook}
            onClose={() => setStyling(false)}
          />
        )}
      </span>
      <div className="line__body">
        {note !== undefined ? (
          <NoteEditor n={n} t={t} text={note} onChange={onNote} onEnter={onEnter} />
        ) : folder ? (
          <FolderHead n={n} t={t} folder={folder} count={folderCount} onChange={onFolder} />
        ) : table ? (
          <TableEditor n={n} t={t} table={table} onChange={onTable} onFit={onFit} />
        ) : (
        <MathInput
          value={source}
          onChange={onChange}
          label={t.lineLabel(n)}
          describedBy={hasResult ? resultId : undefined}
          invalid={isError}
          placeholder={index === 0 ? t.placeholderTex : undefined}
          keyboard={keyboard}
          fieldRef={fieldRef}
          onFocus={onFocus}
          onEnter={onEnter}
          onBackspaceEmpty={onBackspaceEmpty}
          onMoveOut={onMoveOut}
          onMoveLine={(dir) => onMoveLine(index + dir)}
        />
        )}
        {slider && result?.status === 'value' && (
          <div className="slider-row">
            <button
              type="button"
              className="icon-btn slider__play"
              aria-label={playing ? t.pause(slider.name) : t.play(slider.name)}
              aria-pressed={playing}
              onClick={() => setPlaying((p) => !p)}
            >
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                {playing ? <path d="M5 3.5v9M11 3.5v9" stroke="currentColor" strokeWidth="2" fill="none" /> : <path d="M5 3l8 5-8 5z" fill="currentColor" />}
              </svg>
            </button>
            <span className="slider__bound num" aria-hidden="true">{fmt(range.min)}</span>
            <input
              type="range"
              className="slider"
              aria-label={t.slider(slider.name)}
              min={range.min}
              max={range.max}
              step={step}
              value={sliderValue}
              onChange={(e) => {
                setPlaying(false);
                onSlide(slider.name, Number(e.target.value));
              }}
            />
            <span className="slider__bound num" aria-hidden="true">{fmt(range.max)}</span>
            <button type="button" className="icon-btn slider__tune" aria-label={t.sliderSettings(slider.name)} aria-expanded={tuning} onClick={() => setTuning((v) => !v)}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M3 5h10M3 11h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="6" cy="5" r="1.8" fill="var(--color-paper)" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="10" cy="11" r="1.8" fill="var(--color-paper)" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        )}
        {slider && result?.status === 'value' && tuning && (
          <div className="slider-settings" role="group" aria-label={t.sliderSettings(slider.name)}>
            {(
              [
                ['min', t.sliderMin, range.min],
                ['max', t.sliderMax, range.max],
                ['step', t.sliderStep, step],
                ['speed', t.sliderSpeed, speed],
              ] as const
            ).map(([key, label, shown]) => (
              <label key={key} className="field slider-settings__field">
                <span className="field__label">{label}</span>
                <input
                  className="input input--code"
                  type="number"
                  defaultValue={shown}
                  step={key === 'speed' ? 0.25 : 'any'}
                  min={key === 'step' || key === 'speed' ? 0 : undefined}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (e.target.value.trim() === '' || !Number.isFinite(v)) return;
                    onSliderSettings({ ...sliderSettings, [key]: v });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                />
              </label>
            ))}
            <button
              type="button"
              className="btn btn--small btn--quiet"
              onClick={() => {
                onSliderSettings(undefined);
                setTuning(false);
              }}
            >
              {t.sliderReset}
            </button>
          </div>
        )}
        <output className="line__result" id={resultId} aria-live="polite" hidden={!hasResult}>
          <ResultView literal={literalKind(source)} result={result} t={t} pendingNote={pendingNote} onDefine={onDefine} onSwitch={onSwitch} graphIssue={graphIssue} curveRange={curveRange} hidden={!!look?.hidden || folderHidden} />
        </output>
        {hint && (
          <p className="line__hint">
            {hint.fix ? (
              <button type="button" className="btn btn--small btn--link" onClick={() => onChange(hint.fix!)}>
                {hint.say}
              </button>
            ) : (
              hint.say
            )}
          </p>
        )}
        {steps && (
          <div className="line__steps">
            <button type="button" className="btn btn--small btn--link" aria-expanded={showSteps} onClick={() => setShowSteps((v) => !v)}>
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path d={showSteps ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {showSteps ? steps.s.hideSteps : steps.s.showSteps}
            </button>
            {showSteps && <StepsView call={steps.call} settings={steps.settings} s={steps.s} askIntegral={steps.askIntegral} onAnswer={steps.onAnswer} />}
          </div>
        )}
      </div>
      <button type="button" className="icon-btn line__delete" aria-label={t.deleteLine(n)} onClick={onDelete}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
    </li>
  );
}

const NUM = String.raw`[-−]?\d*\.?\d+`;
const NUMBER_LINE = new RegExp(String.raw`^\s*(let\s+|const\s+)?[A-Za-z]\w*\s*=\s*${NUM}\s*$`);
const POINT_LINE = new RegExp(String.raw`^\s*(let\s+|const\s+)?[A-Za-z]\w*\s*=\s*\(\s*${NUM}\s*,\s*${NUM}\s*\)\s*(\{[^}]*\})?\s*$`);
/** a line that is only numbers as typed (a = -1.1, Q = (2.2, 4.048)): its answer would repeat it */
function literalKind(source: string): 'number' | 'point' | undefined {
  return NUMBER_LINE.test(source) ? 'number' : POINT_LINE.test(source) ? 'point' : undefined;
}
