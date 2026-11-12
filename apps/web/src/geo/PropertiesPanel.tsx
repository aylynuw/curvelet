import { DEFAULT_SETTINGS, EMPTY_ENV, evaluate, parse } from '@math/engine';
import { useEffect, useState, type ReactNode } from 'react';
import { formatMeasure } from './exact';
import { angleAt, angleMeasure, lengthMeasure, typedLength } from './labels';
import { cornerIds, type Deco, type GeoObject, type LabelPart, type Pt, type Shape } from './model';
import { propsOf, type GeoProps } from './props';
import type { GeoStrings } from './strings';

/** which length a row edits */
export type LengthTarget = { owner: string; side: number } | { owner: string; radius: true };
/** which angle a row edits: a polygon's corner, or an angle object */
export type AngleTarget = { owner: string; corner: number } | { owner: string; arm: true };

/**
 * The Properties tab, kept to what a figure for a worksheet needs: each side
 * as a row (변 AB: shown or not, its length, its label, an equal-length mark),
 * each angle (∠ABC), a circle's radius, point names, and how numbers are
 * written. With nothing selected it shows the document's number settings.
 */
export function PropertiesPanel({
  s,
  selected,
  objects,
  shapes,
  defaults,
  onProps,
  onPropsFor,
  onDeco,
  onRename,
  onLength,
  canEditLength,
  onAngle,
  canEditAngle,
  onUnlock,
  onImage,
}: {
  s: GeoStrings;
  selected: GeoObject[];
  objects: GeoObject[];
  shapes: Map<string, Shape>;
  defaults: GeoProps;
  /** the selection's settings, or the document's with nothing selected; undefined puts one back to the document's */
  onProps: (patch: Partial<Record<keyof GeoProps, unknown>>) => void;
  /** settings for particular objects (a polygon's corner points) */
  onPropsFor: (ids: string[], patch: Partial<Record<keyof GeoProps, unknown>>) => void;
  onDeco: (id: string, change: (d: Deco) => Deco) => void;
  onRename: (id: string, name: string) => void;
  onLength: (t: LengthTarget, length: number) => void;
  canEditLength: (t: LengthTarget) => boolean;
  /** an angle typed in degrees: the shape is redrawn to it */
  onAngle: (t: AngleTarget, deg: number) => void;
  canEditAngle: (t: AngleTarget) => boolean;
  /** let a typed value go */
  onUnlock: (owner: string, which: 'sides' | 'corners', k: number) => void;
  /** a picture's size or opacity changed */
  onImage: (id: string, patch: { w?: number; h?: number; opacity?: number }) => void;
}) {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const name = (id: string) => byId.get(id)?.name ?? '?';
  const one = selected.length === 1 ? selected[0]! : null;
  const shape = one ? shapes.get(one.id) : undefined;
  const p = propsOf(defaults, one?.props);
  const fmt = (v: ReturnType<typeof lengthMeasure>) => formatMeasure(v, p);

  /** a side's or corner's own settings, changed */
  const setPart = (o: GeoObject, which: 'sides' | 'corners', k: number, count: number, change: Partial<LabelPart>) =>
    onDeco(o.id, (d) => {
      const list = [...(d[which] ?? [])];
      while (list.length < count) list.push({});
      const next: LabelPart = { ...list[k], ...change };
      for (const key of Object.keys(next) as (keyof LabelPart)[]) if (next[key] === undefined || next[key] === '') delete next[key];
      list[k] = next;
      return { ...d, [which]: list };
    });

  let body: ReactNode;
  if (!selected.length) {
    body = (
      <>
        <p className="gp__note">{s.docNote}</p>
        <Notation s={s} value={defaults} doc onChange={onProps} />
        <Toggle label={s.vertexNames} on={defaults.pointLabel} onChange={(v) => onProps({ pointLabel: v })} />
        <Toggle label={s.equalTicks} on={defaults.autoTicks} onChange={(v) => onProps({ autoTicks: v })} />
      </>
    );
  } else if (one && shape?.type === 'polygon') {
    const ids = cornerIds(one, objects);
    const n = shape.pts.length;
    const sideMode = (k: number) => one.deco?.sides?.[k]?.label ?? p.sideLabel;
    const cornerMode = (k: number) => one.deco?.corners?.[k]?.label ?? p.cornerLabel;
    const points = ids.map((id) => byId.get(id)).filter((o): o is GeoObject => Boolean(o));
    body = (
      <>
        <Section title={s.sidesTitle}>
          {shape.pts.map((a, k) => {
            const b = shape.pts[(k + 1) % n]!;
            const ab = `${name(ids[k]!)}${name(ids[(k + 1) % n]!)}`;
            const part = one.deco?.sides?.[k] ?? {};
            const target = { owner: one.id, side: k };
            return (
              <Row
                key={k}
                s={s}
                title={s.sideRow(ab)}
                shown={sideMode(k) !== 'hidden'}
                onShown={(v) => setPart(one, 'sides', k, n, { label: v ? (part.text ? 'custom' : 'value') : 'hidden' })}
                value={fmt(part.len !== undefined ? typedLength(part.len) : lengthMeasure(a, b))}
                locked={part.len !== undefined}
                onUnlock={() => onUnlock(one.id, 'sides', k)}
                length={canEditLength(target) ? { now: Math.hypot(b.x - a.x, b.y - a.y), set: (l) => onLength(target, l) } : null}
                label={part.label === 'custom' ? (part.text ?? '') : ''}
                onLabel={(t) => setPart(one, 'sides', k, n, t ? { label: 'custom', text: t } : { label: sideMode(k) === 'hidden' ? 'hidden' : 'value', text: undefined })}
                ticks={part.ticks ?? p.ticks}
                onTicks={(t) => setPart(one, 'sides', k, n, { ticks: t })}
              />
            );
          })}
        </Section>
        <Section title={s.anglesTitle}>
          {shape.pts.map((v, k) => {
            const [prev, next] = [shape.pts[(k + n - 1) % n]!, shape.pts[(k + 1) % n]!];
            const abc = `${name(ids[(k + n - 1) % n]!)}${name(ids[k]!)}${name(ids[(k + 1) % n]!)}`;
            const part = one.deco?.corners?.[k] ?? {};
            return (
              <Row
                key={k}
                s={s}
                title={s.angleRow(abc)}
                shown={cornerMode(k) !== 'hidden'}
                onShown={(on) => setPart(one, 'corners', k, n, { label: on ? (part.text ? 'custom' : 'value') : 'hidden' })}
                value={formatMeasure(angleMeasure(part.deg ?? angleAt(prev, v, next)), p)}
                angle
                length={canEditAngle({ owner: one.id, corner: k }) ? { now: part.deg ?? angleAt(prev, v, next), set: (d) => onAngle({ owner: one.id, corner: k }, d) } : null}
                locked={part.deg !== undefined}
                onUnlock={() => onUnlock(one.id, 'corners', k)}
                label={part.label === 'custom' ? (part.text ?? '') : ''}
                onLabel={(t) => setPart(one, 'corners', k, n, t ? { label: 'custom', text: t } : { label: cornerMode(k) === 'hidden' ? 'hidden' : 'value', text: undefined })}
              />
            );
          })}
        </Section>
        <Toggle
          label={s.vertexNames}
          on={points.every((o) => propsOf(defaults, o.props).pointLabel)}
          onChange={(v) => onPropsFor(points.map((o) => o.id), { pointLabel: v })}
        />
        <Notation s={s} value={p} own={one.props} onChange={onProps} />
      </>
    );
  } else if (one && shape?.type === 'line' && one.kind === 'segment') {
    const target = { owner: one.id, side: 0 };
    body = (
      <>
        <Section title={s.sidesTitle}>
          <Row
            s={s}
            title={s.segRow(`${name(one.a)}${name(one.b)}`)}
            shown={p.segLabel !== 'hidden'}
            onShown={(v) => onProps({ segLabel: v ? (one.deco?.text ? 'custom' : 'value') : 'hidden' })}
            value={fmt(lengthMeasure(shape.a, shape.b))}
            length={canEditLength(target) ? { now: Math.hypot(shape.b.x - shape.a.x, shape.b.y - shape.a.y), set: (l) => onLength(target, l) } : null}
            label={p.segLabel === 'custom' ? (one.deco?.text ?? '') : ''}
            onLabel={(t) => {
              onDeco(one.id, (d) => ({ ...d, text: t || undefined }));
              onProps({ segLabel: t ? 'custom' : p.segLabel === 'hidden' ? 'hidden' : 'value' });
            }}
            ticks={p.ticks}
            onTicks={(t) => onProps({ ticks: t })}
          />
        </Section>
        <Notation s={s} value={p} own={one.props} onChange={onProps} />
      </>
    );
  } else if (one && shape?.type === 'circle') {
    const target = { owner: one.id, radius: true as const };
    const shown = p.circleLine === 'radius' || p.circleValue === 'radius';
    body = (
      <>
        <Section title={s.kinds[one.kind]}>
          <Row
            s={s}
            title={s.radiusRow}
            shown={shown}
            onShown={(v) => onProps(v ? { circleLine: 'radius', circleValue: 'radius' } : { circleLine: 'none', circleValue: 'hidden' })}
            value={fmt({ value: shape.r, exact: lengthMeasure({ x: 0, y: 0 }, { x: shape.r, y: 0 }).exact, kind: 'length' })}
            length={canEditLength(target) ? { now: shape.r, set: (l) => onLength(target, l) } : null}
            label={one.deco?.text ?? ''}
            onLabel={(t) => {
              onDeco(one.id, (d) => ({ ...d, text: t || undefined }));
              if (t && !shown) onProps({ circleLine: 'radius', circleValue: 'radius' });
            }}
          />
        </Section>
        <Notation s={s} value={p} own={one.props} onChange={onProps} />
      </>
    );
  } else if (one && shape?.type === 'angle' && one.kind === 'angle') {
    body = (
      <Section title={s.anglesTitle}>
        <Row
          s={s}
          title={s.angleRow(`${name(one.a)}${name(one.vertex)}${name(one.c)}`)}
          shown={p.angleLabel !== 'hidden'}
          onShown={(v) => onProps({ angleLabel: v ? (one.deco?.text ? 'custom' : 'value') : 'hidden' })}
          value={formatMeasure(angleMeasure(shape.degrees), p)}
          angle
          length={canEditAngle({ owner: one.id, arm: true }) ? { now: shape.degrees, set: (d) => onAngle({ owner: one.id, arm: true }, d) } : null}
          label={p.angleLabel === 'custom' ? (one.deco?.text ?? '') : ''}
          onLabel={(t) => {
            onDeco(one.id, (d) => ({ ...d, text: t || undefined }));
            onProps({ angleLabel: t ? 'custom' : 'value' });
          }}
        />
      </Section>
    );
  } else if (one && one.kind === 'image') {
    const ratio = one.props?.imageRatio !== false;
    const num = (v: number) => String(Number(v.toPrecision(4)));
    const size = (which: 'w' | 'h') => (t: string) => {
      const v = Number(t);
      if (!Number.isFinite(v) || v <= 0) return;
      if (!ratio) return onImage(one.id, { [which]: v });
      const k = v / one[which];
      onImage(one.id, { w: one.w * k, h: one.h * k });
    };
    body = (
      <Section title={s.kinds.image}>
        <label className="gp__row">
          <span className="gp__label">{s.imageWidth}</span>
          <CommitInput className="input gp__input" inputMode="decimal" value={num(one.w)} onCommit={size('w')} />
        </label>
        <label className="gp__row">
          <span className="gp__label">{s.imageHeight}</span>
          <CommitInput className="input gp__input" inputMode="decimal" value={num(one.h)} onCommit={size('h')} />
        </label>
        <Toggle label={s.imageRatio} on={ratio} onChange={(v) => onPropsFor([one.id], { imageRatio: v })} />
        <label className="gp__row gp__range">
          <span className="gp__label">{s.imageOpacity}</span>
          <input type="range" min="0" max="100" value={Math.round(one.opacity * 100)} onChange={(e) => onImage(one.id, { opacity: e.target.valueAsNumber / 100 })} />
          <span className="gp__value">{Math.round(one.opacity * 100)}%</span>
        </label>
      </Section>
    );
  } else if (one && shape?.type === 'point') {
    body = (
      <>
        <label className="gp__row">
          <span className="gp__label">{s.pointRow}</span>
          <CommitInput className="input gp__input" value={one.name} onCommit={(t) => t.trim() && onRename(one.id, t.trim())} />
        </label>
        <Toggle label={s.vertexNames} on={p.pointLabel} onChange={(v) => onProps({ pointLabel: v })} />
      </>
    );
  } else {
    body = <Notation s={s} value={p} own={one ? one.props : sharedOwn(selected)} onChange={onProps} />;
  }

  return (
    <div className="gp">
      <p className="gp__head">{!selected.length ? s.docTitle : one ? `${one.name} · ${s.kinds[one.kind]}` : s.selectedCount(selected.length)}</p>
      {body}
    </div>
  );
}

/** the settings every selected object sets the same way */
function sharedOwn(list: GeoObject[]): Partial<GeoProps> {
  const first = list[0]?.props ?? {};
  const out: Partial<GeoProps> = {};
  for (const k of Object.keys(first) as (keyof GeoProps)[]) if (list.every((o) => o.props?.[k] === first[k])) (out as Record<string, unknown>)[k] = first[k];
  return out;
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
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
        e.stopPropagation();
      }}
    />
  );
}

/** a number typed as math: 5, 2.5, √13, 2√3, sqrt(2)*3 */
export function readLength(text: string): number | null {
  const src = text
    .trim()
    .replace(/√\s*\(([^()]*)\)/g, 'sqrt($1)')
    .replace(/√\s*([0-9.]+)/g, 'sqrt($1)')
    .replace(/(\d)\s*sqrt/g, '$1*sqrt')
    .replace(/×/g, '*')
    .replace(/π/g, 'pi');
  if (!src) return null;
  try {
    const st = parse(src);
    if (st.kind !== 'expr') return null;
    const v = evaluate(st.expr, EMPTY_ENV, DEFAULT_SETTINGS);
    return v.kind === 'num' && v.z.isReal() && v.z.re > 0 && Number.isFinite(v.z.re) ? v.z.re : null;
  } catch {
    return null;
  }
}

/** one side, angle or radius: shown or hidden, its value (editable for a length), its label, its equal-length mark */
function Row({
  s,
  title,
  shown,
  onShown,
  value,
  length,
  label,
  onLabel,
  ticks,
  onTicks,
  angle,
  locked,
  onUnlock,
}: {
  s: GeoStrings;
  angle?: boolean;
  locked?: boolean;
  onUnlock?: () => void;
  title: string;
  shown: boolean;
  onShown: (v: boolean) => void;
  value: { text: string; approx: boolean };
  length?: { now: number; set: (l: number) => void } | null;
  label: string;
  onLabel: (t: string) => void;
  ticks?: number;
  onTicks?: (t: number) => void;
}) {
  return (
    <div className={`gp__item${shown ? '' : ' is-hidden'}`}>
      <button type="button" className="gp__eye" aria-pressed={shown} aria-label={shown ? s.hideLabel(title) : s.showLabel(title)} title={shown ? s.hideLabel(title) : s.showLabel(title)} onClick={() => onShown(!shown)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          {shown ? (
            <>
              <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.3" fill="none" />
              <circle cx="8" cy="8" r="2" fill="currentColor" />
            </>
          ) : (
            <>
              <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.3" fill="none" />
              <path d="M2.5 13.5l11-11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>
      <span className="gp__item-name">
        <span className="gp__item-title">{title}</span>
        {locked && (
          <button type="button" className="gp__lock" aria-label={s.lockedValue(title)} title={s.lockedValue(title)} onClick={onUnlock}>
            <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
              <rect x="2.5" y="5.2" width="7" height="5" rx="1" fill="currentColor" />
              <path d="M4 5.2V4a2 2 0 014 0v1.2" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          </button>
        )}
      </span>
      {length ? (
        <CommitInput
          className="input gp__value"
          aria-label={`${title} ${angle ? s.angleField : s.lengthField}`}
          title={value.approx ? s.approxNote : undefined}
          value={value.text}
          onCommit={(t) => {
            const l = readLength(angle ? t.replace(/°/g, '') : t);
            if (!l || (angle && l >= 360) || (Math.abs(l - length.now) < 1e-12 && !angle)) return;
            length.set(l);
          }}
        />
      ) : (
        <span className="gp__value gp__value--fixed" title={value.approx ? s.approxNote : undefined}>
          {value.text}
        </span>
      )}
      <CommitInput className="input gp__tag" aria-label={`${title} ${s.labelField}`} placeholder={s.labelPlaceholder} value={label} onCommit={(t) => onLabel(t.trim())} />
      {onTicks ? (
        <button type="button" className="gp__ticks" aria-label={s.ticksCycle(title)} title={s.ticksCycle(title)} onClick={() => onTicks(((ticks ?? 0) + 1) % 4)}>
          {['–', '|', '||', '|||'][ticks ?? 0]}
        </button>
      ) : (
        <span className="gp__ticks gp__ticks--empty" aria-hidden="true" />
      )}
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="gp__toggle">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** how numbers are written: exact (√2, 4π) or decimal with its places, and the unit */
function Notation({ s, value, own, doc, onChange }: { s: GeoStrings; value: GeoProps; own?: Partial<GeoProps>; doc?: boolean; onChange: (patch: Partial<Record<keyof GeoProps, unknown>>) => void }) {
  const mode = !doc && own?.format === undefined ? 'doc' : value.format === 'decimal' ? 'decimal' : 'exact';
  const known = ['', 'cm', 'm'].includes(value.unit);
  const [custom, setCustom] = useState(!known);
  return (
    <Section title={s.notation}>
      <div className="segmented gp__seg" role="group" aria-label={s.notation}>
        {!doc && (
          <button type="button" aria-pressed={mode === 'doc'} onClick={() => onChange({ format: undefined, decimals: undefined, unit: undefined })}>
            {s.notationDoc}
          </button>
        )}
        <button type="button" aria-pressed={mode === 'exact'} onClick={() => onChange({ format: 'auto' })}>
          {s.notationExact}
        </button>
        <button type="button" aria-pressed={mode === 'decimal'} onClick={() => onChange({ format: 'decimal' })}>
          {s.notationDecimal}
        </button>
      </div>
      <div className="gp__line">
        {value.format === 'decimal' && (
          <label className="gp__mini">
            {s.places}
            <select className="input" value={value.decimals} onChange={(e) => onChange({ decimals: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
        <select
          className="input gp__unit"
          aria-label={s.unit}
          value={custom ? 'custom' : value.unit}
          onChange={(e) => {
            const v = e.target.value;
            setCustom(v === 'custom');
            if (v !== 'custom') onChange({ unit: v });
          }}
        >
          <option value="">{s.unitNone}</option>
          <option value="cm">cm</option>
          <option value="m">m</option>
          <option value="custom">{s.unitCustom}</option>
        </select>
        {custom && <CommitInput className="input gp__unit" aria-label={s.customUnit} value={known ? '' : value.unit} onCommit={(t) => onChange({ unit: t.trim() })} />}
      </div>
    </Section>
  );
}

export type { Pt };
