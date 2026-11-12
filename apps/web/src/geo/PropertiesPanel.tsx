import { useEffect, useState, type ReactNode } from 'react';
import { formatMeasure } from './exact';
import { measuresOf } from './labels';
import type { Deco, GeoObject, LabelPart, Shape } from './model';
import { BUILT_IN_PRESETS, propsOf, type GeoProps, type Preset } from './props';
import type { GeoStrings } from './strings';

export type QuickAction = 'lengths' | 'angles' | 'hide' | 'reset';
type Key = keyof GeoProps;
const MIXED = '\u0000mixed';
const DEFAULT = '\u0000default';

/**
 * The Properties tab: the settings of the selection, or the document's when
 * nothing is selected. Each setting of an object is Default (it follows the
 * document) or its own; with several objects selected a change applies to all
 * of them, and a setting they don't share shows as —.
 */
export function PropertiesPanel({
  s,
  selected,
  objects,
  shapes,
  defaults,
  onProps,
  onDeco,
  onRename,
  onQuick,
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
}: {
  s: GeoStrings;
  selected: GeoObject[];
  objects: GeoObject[];
  shapes: Map<string, Shape>;
  defaults: GeoProps;
  /** a value of undefined puts the setting back to Default */
  onProps: (patch: Partial<Record<Key, GeoProps[Key] | undefined>>) => void;
  onDeco: (id: string, change: (d: Deco) => Deco) => void;
  onRename: (id: string, name: string) => void;
  onQuick: (a: QuickAction) => void;
  presets: Preset[];
  onApplyPreset: (p: Preset, asDefault: boolean) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
}) {
  const doc = selected.length === 0;
  const kinds = new Set(selected.map((o) => o.kind));
  const all = doc;
  const has = (...k: string[]) => all || k.some((x) => kinds.has(x as GeoObject['kind']));
  const isPoint = has('point', 'midpoint', 'intersection', 'reflect', 'rotate', 'vertex');

  /** the shared value of a setting, Default, or mixed */
  const get = (key: Key): string => {
    if (doc) return String(defaults[key]);
    const vals = selected.map((o) => (o.props?.[key] === undefined ? DEFAULT : String(o.props[key])));
    return vals.every((v) => v === vals[0]) ? vals[0]! : MIXED;
  };
  const set = (key: Key, raw: string) => {
    if (raw === MIXED) return;
    if (raw === DEFAULT) return onProps({ [key]: undefined });
    const base = defaults[key];
    const value = typeof base === 'number' ? Number(raw) : typeof base === 'boolean' ? raw === 'true' : raw;
    onProps({ [key]: value as GeoProps[Key] });
  };

  const c: Ctx = { get, set, doc, defaults, s };
  const onOff: [string, string][] = [
    ['true', s.on],
    ['false', s.off],
  ];
  const modes: [string, string][] = ['hidden', 'value', 'custom'].map((m) => [m, s.labelModes[m]!]);
  const one = selected.length === 1 ? selected[0]! : null;
  const shape = one ? shapes.get(one.id) : undefined;
  const p = propsOf(defaults, one?.props);

  // the unit: none, cm, m, or typed
  const unitValue = get('unit');
  const [customUnit, setCustomUnit] = useState(false);
  const knownUnit = ['', 'cm', 'm', DEFAULT, MIXED].includes(unitValue);

  return (
    <div className="gp">
      <p className="gp__head">{doc ? s.docDefaults : selected.length === 1 ? `${one!.name} · ${s.kinds[one!.kind]}` : s.selectedCount(selected.length)}</p>
      {doc && <p className="gp__note">{s.docDefaultsNote}</p>}

      {one && shape && <Measures s={s} o={one} shape={shape} p={p} />}

      <Section title={s.numberFormat}>
        <Pick c={c} k="format" label={s.format} options={['auto', 'decimal', 'radical', 'fraction', 'pi'].map((f) => [f, s.formats[f]!])} />
        <Pick c={c} k="decimals" label={s.decimals} options={[0, 1, 2, 3, 4].map((d) => [String(d), String(d)])} />
        <label className="gp__row">
          <span className="gp__label">{s.unit}</span>
          <select
            className="input gp__input"
            value={customUnit || !knownUnit ? 'custom' : unitValue}
            onChange={(e) => {
              const v = e.target.value;
              setCustomUnit(v === 'custom');
              if (v !== 'custom') set('unit', v);
            }}
          >
            {unitValue === MIXED && <option value={MIXED}>{s.mixed}</option>}
            {!doc && <option value={DEFAULT}>{`${s.default} (${defaults.unit || s.units['']})`}</option>}
            {['', 'cm', 'm', 'custom'].map((u) => (
              <option key={u} value={u}>
                {s.units[u]}
              </option>
            ))}
          </select>
        </label>
        {(customUnit || !knownUnit) && (
          <label className="gp__row">
            <span className="gp__label">{s.customUnit}</span>
            <CommitInput value={knownUnit ? '' : unitValue} onCommit={(t) => set('unit', t)} />
          </label>
        )}
      </Section>

      {has('segment', 'polygon', 'regular', 'line', 'ray') && (
        <Section title={s.lengths}>
          {has('segment') && <Pick c={c} k="segLabel" label={`${s.label} (${s.kinds.segment})`} options={modes} />}
          {has('polygon', 'regular') && <Pick c={c} k="sideLabel" label={`${s.label} (${s.sideList})`} options={modes} />}
          {one?.kind === 'segment' && p.segLabel === 'custom' && <DecoText s={s} o={one} onDeco={onDeco} />}
          <Pick c={c} k="sideStyle" label={s.sideStyle} options={['beside', 'dimension'].map((m) => [m, s.sideStyles[m]!])} />
          <Num c={c} k="dimOffset" label={s.offset} step={0.1} min={0.1} max={3} />
          <Pick c={c} k="ticks" label={s.ticks} options={s.tickOptions.map((t, k) => [String(k), t])} />
          <Pick c={c} k="arrows" label={s.arrows} options={s.arrowOptions.map((t, k) => [String(k), t])} />
          {doc && <Pick c={c} k="autoTicks" label={s.autoTicks} options={onOff} />}
        </Section>
      )}

      {one && shape?.type === 'polygon' && <Parts s={s} o={one} objects={objects} count={shape.pts.length} onDeco={onDeco} />}

      {has('polygon', 'regular', 'angle') && (
        <Section title={s.angles}>
          {has('polygon', 'regular') && <Pick c={c} k="cornerLabel" label={`${s.angleLabel} (${s.kinds.polygon})`} options={modes} />}
          {has('angle') && <Pick c={c} k="angleLabel" label={`${s.angleLabel} (${s.kinds.angle})`} options={modes} />}
          {one?.kind === 'angle' && p.angleLabel === 'custom' && <DecoText s={s} o={one} onDeco={onDeco} />}
          <Pick c={c} k="angleArcs" label={s.arcs} options={s.arcOptions.map((t, k) => [String(k + 1), t])} />
          <Num c={c} k="arcSize" label={s.arcSize} step={0.1} min={0.2} max={2} />
          <Pick c={c} k="rightMark" label={s.rightMark} options={['auto', 'always', 'off'].map((m) => [m, s.rightMarks[m]!])} />
        </Section>
      )}

      {has('circle', 'compass') && (
        <Section title={s.circle}>
          <Pick c={c} k="circleLine" label={s.circleLine} options={['none', 'radius', 'diameter'].map((m) => [m, s.circleLines[m]!])} />
          <Pick c={c} k="circleValue" label={s.circleValue} options={['hidden', 'radius', 'diameter', 'area', 'circumference'].map((m) => [m, s.circleValues[m]!])} />
          <Pick c={c} k="centerMark" label={s.centerMark} options={onOff} />
          {one && (one.kind === 'circle' || one.kind === 'compass') && <DecoText s={s} o={one} onDeco={onDeco} />}
        </Section>
      )}

      {has('polygon', 'regular', 'ellipse') && (
        <Section title={s.areaTitle}>
          <Pick c={c} k="areaLabel" label={s.areaLabel} options={modes} />
          {one && (one.kind === 'polygon' || one.kind === 'regular' || one.kind === 'ellipse') && p.areaLabel === 'custom' && <DecoText s={s} o={one} onDeco={onDeco} />}
          {has('ellipse') && !has('circle') && <Pick c={c} k="centerMark" label={s.centerMark} options={onOff} />}
        </Section>
      )}

      {(isPoint || doc) && (
        <Section title={s.points}>
          <Pick c={c} k="pointLabel" label={s.showName} options={onOff} />
          {one && isPoint && (
            <label className="gp__row">
              <span className="gp__label">{s.name}</span>
              <CommitInput value={one.name} onCommit={(t) => t.trim() && onRename(one.id, t.trim())} />
            </label>
          )}
        </Section>
      )}

      <Section title={s.textStyle}>
        <Num c={c} k="fontSize" label={s.fontSize} step={0.02} min={0.12} max={1.5} />
        <Pick c={c} k="italic" label={s.italic} options={onOff} />
      </Section>

      <Section title={s.quick}>
        <div className="gp__buttons">
          <button type="button" className="btn btn--small" onClick={() => onQuick('lengths')}>
            {s.showLengths}
          </button>
          <button type="button" className="btn btn--small" onClick={() => onQuick('angles')}>
            {s.showAngles}
          </button>
          <button type="button" className="btn btn--small" onClick={() => onQuick('hide')}>
            {s.hideLabels}
          </button>
          <button type="button" className="btn btn--small btn--quiet" onClick={() => onQuick('reset')}>
            {s.resetLabels}
          </button>
        </div>
      </Section>

      <Presets s={s} presets={presets} doc={doc} onApply={onApplyPreset} onSave={onSavePreset} onDelete={onDeletePreset} />
    </div>
  );
}

interface Ctx {
  get: (k: Key) => string;
  set: (k: Key, raw: string) => void;
  doc: boolean;
  defaults: GeoProps;
  s: GeoStrings;
}

function Pick({ c, k, label, options }: { c: Ctx; k: Key; label: string; options: [string, string][] }) {
  const v = c.get(k);
  return (
    <label className="gp__row">
      <span className="gp__label">{label}</span>
      <select className="input gp__input" value={v} onChange={(e) => c.set(k, e.target.value)}>
        {v === MIXED && <option value={MIXED}>{c.s.mixed}</option>}
        {!c.doc && <option value={DEFAULT}>{`${c.s.default} (${optionText(options, String(c.defaults[k]))})`}</option>}
        {options.map(([val, text]) => (
          <option key={val} value={val}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Num({ c, k, label, step, min, max }: { c: Ctx; k: Key; label: string; step: number; min: number; max: number }) {
  const v = c.get(k);
  return (
    <label className="gp__row">
      <span className="gp__label">{label}</span>
      <span className="gp__num">
        <CommitInput
          type="number"
          step={step}
          min={min}
          max={max}
          value={v === DEFAULT ? String(c.defaults[k]) : v === MIXED ? '' : v}
          placeholder={v === MIXED ? c.s.mixed : undefined}
          onCommit={(t) => t !== '' && Number.isFinite(Number(t)) && c.set(k, String(Math.min(max, Math.max(min, Number(t)))))}
        />
        {!c.doc && v !== DEFAULT && (
          <button type="button" className="btn btn--small btn--quiet" onClick={() => c.set(k, DEFAULT)}>
            {c.s.default}
          </button>
        )}
      </span>
    </label>
  );
}

function optionText(options: [string, string][], v: string) {
  return options.find(([k]) => k === v)?.[1] ?? v;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gp__section">
      <h3 className="gp__title">{title}</h3>
      {children}
    </section>
  );
}

/** a text box that applies its value when you leave it or press Enter: one undo step, not one per letter */
function CommitInput({ value, onCommit, ...rest }: { value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="input gp__input"
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        e.stopPropagation();
      }}
    />
  );
}

function DecoText({ s, o, onDeco }: { s: GeoStrings; o: GeoObject; onDeco: (id: string, change: (d: Deco) => Deco) => void }) {
  return (
    <label className="gp__row">
      <span className="gp__label">{s.customText}</span>
      <CommitInput value={o.deco?.text ?? ''} placeholder={s.customHint} onCommit={(t) => onDeco(o.id, (d) => ({ ...d, text: t }))} />
    </label>
  );
}

/** the object's numbers in the chosen format, with ≈ when there is no exact form */
function Measures({ s, o, shape, p }: { s: GeoStrings; o: GeoObject; shape: Shape; p: GeoProps }) {
  const ms = Object.entries(measuresOf(o, shape));
  if (!ms.length) return null;
  return (
    <dl className="gp__measures">
      {ms.map(([name, m]) => {
        const f = formatMeasure(m, p);
        return (
          <div key={name} className="gp__measure">
            <dt>{s.measure[name] ?? name}</dt>
            <dd>
              {f.text}
              {f.approx && (
                <span className="gp__approx" title={s.approxNote}>
                  {' '}≈
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** each side and corner of one polygon: its own label, text and marks */
function Parts({ s, o, objects, count, onDeco }: { s: GeoStrings; o: GeoObject; objects: GeoObject[]; count: number; onDeco: (id: string, change: (d: Deco) => Deco) => void }) {
  const byId = new Map(objects.map((x) => [x.id, x]));
  const ids =
    o.kind === 'polygon'
      ? o.pts
      : o.kind === 'regular'
        ? [o.a, o.b, ...objects.filter((v) => v.kind === 'vertex' && v.poly === o.id).sort((x, y) => (x as { k: number }).k - (y as { k: number }).k).map((v) => v.id)]
        : [];
  const nameOf = (k: number) => byId.get(ids[k % count] ?? '')?.name ?? String(k + 1);
  const patch = (which: 'sides' | 'corners', k: number, change: Partial<LabelPart>) =>
    onDeco(o.id, (d) => {
      const list = [...(d[which] ?? [])];
      while (list.length < count) list.push({});
      const next = { ...list[k], ...change };
      for (const key of Object.keys(next) as (keyof LabelPart)[]) if (next[key] === undefined) delete next[key];
      list[k] = next;
      return { ...d, [which]: list };
    });
  const modeOptions = (
    <>
      <option value="">{s.default}</option>
      {['hidden', 'value', 'custom'].map((m) => (
        <option key={m} value={m}>
          {s.labelModes[m]}
        </option>
      ))}
    </>
  );
  const sides = o.deco?.sides ?? [];
  const corners = o.deco?.corners ?? [];
  return (
    <>
      <Section title={s.sideList}>
        {Array.from({ length: count }, (_, k) => {
          const part = sides[k] ?? {};
          return (
            <div key={k} className="gp__part">
              <span className="gp__part-name">
                {nameOf(k)}
                {nameOf(k + 1)}
              </span>
              <select className="input gp__input" aria-label={`${s.label} ${nameOf(k)}${nameOf(k + 1)}`} value={part.label ?? ''} onChange={(e) => patch('sides', k, { label: (e.target.value || undefined) as LabelPart['label'] })}>
                {modeOptions}
              </select>
              <select className="input gp__input gp__input--short" aria-label={`${s.ticks} ${nameOf(k)}${nameOf(k + 1)}`} value={part.ticks ?? ''} onChange={(e) => patch('sides', k, { ticks: e.target.value === '' ? undefined : Number(e.target.value) })}>
                <option value="">{s.ticks}</option>
                {s.tickOptions.map((t, j) => (
                  <option key={j} value={j}>
                    {t}
                  </option>
                ))}
              </select>
              <select className="input gp__input gp__input--short" aria-label={`${s.arrows} ${nameOf(k)}${nameOf(k + 1)}`} value={part.arrows ?? ''} onChange={(e) => patch('sides', k, { arrows: e.target.value === '' ? undefined : Number(e.target.value) })}>
                <option value="">{s.arrows}</option>
                {s.arrowOptions.map((t, j) => (
                  <option key={j} value={j}>
                    {t}
                  </option>
                ))}
              </select>
              {part.label === 'custom' && <CommitInput aria-label={`${s.customText} ${nameOf(k)}${nameOf(k + 1)}`} value={part.text ?? ''} placeholder={s.customHint} onCommit={(t) => patch('sides', k, { text: t })} />}
            </div>
          );
        })}
      </Section>
      <Section title={s.corners}>
        {Array.from({ length: count }, (_, k) => {
          const part = corners[k] ?? {};
          return (
            <div key={k} className="gp__part">
              <span className="gp__part-name">∠{nameOf(k)}</span>
              <select className="input gp__input" aria-label={`${s.angleLabel} ${nameOf(k)}`} value={part.label ?? ''} onChange={(e) => patch('corners', k, { label: (e.target.value || undefined) as LabelPart['label'] })}>
                {modeOptions}
              </select>
              <select className="input gp__input gp__input--short" aria-label={`${s.arcs} ${nameOf(k)}`} value={part.arcs ?? ''} onChange={(e) => patch('corners', k, { arcs: e.target.value === '' ? undefined : Number(e.target.value) })}>
                <option value="">{s.arcs}</option>
                {s.arcOptions.map((t, j) => (
                  <option key={j} value={j + 1}>
                    {t}
                  </option>
                ))}
              </select>
              {part.label === 'custom' && <CommitInput aria-label={`${s.customText} ∠${nameOf(k)}`} value={part.text ?? ''} placeholder={s.customHint} onCommit={(t) => patch('corners', k, { text: t })} />}
            </div>
          );
        })}
      </Section>
    </>
  );
}

function Presets({ s, presets, doc, onApply, onSave, onDelete }: { s: GeoStrings; presets: Preset[]; doc: boolean; onApply: (p: Preset, asDefault: boolean) => void; onSave: (name: string) => void; onDelete: (id: string) => void }) {
  const [name, setName] = useState('');
  const list = [...BUILT_IN_PRESETS, ...presets];
  return (
    <Section title={s.presets}>
      <ul className="gp__presets">
        {list.map((p) => {
          const label = p.name ?? s.presetNames[p.id] ?? p.id;
          return (
            <li key={p.id} className="gp__preset">
              <span className="gp__preset-name">{label}</span>
              {!doc && (
                <button type="button" className="btn btn--small" onClick={() => onApply(p, false)}>
                  {s.applyPreset}
                </button>
              )}
              <button type="button" className="btn btn--small btn--quiet" onClick={() => onApply(p, true)}>
                {s.setAsDefault}
              </button>
              {p.name && (
                <button type="button" className="icon-btn icon-btn--small" aria-label={s.deletePreset(label)} title={s.deletePreset(label)} onClick={() => onDelete(p.id)}>
                  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  </svg>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <form
        className="gp__save"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) {
            onSave(name.trim());
            setName('');
          }
        }}
      >
        <input className="input gp__input" aria-label={s.presetName} placeholder={s.presetName} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <button type="submit" className="btn btn--small" disabled={!name.trim()}>
          {s.savePreset}
        </button>
      </form>
    </Section>
  );
}
