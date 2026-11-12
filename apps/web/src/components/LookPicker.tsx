import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { CURVES, isHex, slotOf, slotVar, type LineLook } from '../graph/looks';

const STRINGS = {
  en: {
    title: (n: number) => `Style of line ${n}`,
    show: 'Show on the graph',
    palette: 'Colours',
    colour: (k: number) => `Colour ${k}`,
    custom: 'Any colour',
    hex: 'Hex code',
    pick: 'Pick a colour',
    recent: 'Recent colours',
    exact: 'Keep this exact colour in dark mode',
    style: 'Line',
    solid: 'Solid',
    dashed: 'Dashed',
    dotted: 'Dotted',
    width: (w: number) => `Thickness ${w} px`,
    fill: (p: number) => `Fill ${p}%`,
    reset: 'Reset style',
  },
  ko: {
    title: (n: number) => `${n}번 줄 스타일`,
    show: '그래프에 표시',
    palette: '색',
    colour: (k: number) => `${k}번 색`,
    custom: '원하는 색',
    hex: '헥스 코드',
    pick: '색 고르기',
    recent: '최근 쓴 색',
    exact: '다크 모드에서도 이 색 그대로',
    style: '선',
    solid: '실선',
    dashed: '파선',
    dotted: '점선',
    width: (w: number) => `굵기 ${w}px`,
    fill: (p: number) => `채우기 ${p}%`,
    reset: '스타일 초기화',
  },
} satisfies Record<Lang, unknown>;

const RECENT_KEY = 'calculator.colors.v1';
const loadRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && isHex(x)).slice(0, 8) : [];
  } catch {
    return [];
  }
};
const saveRecent = (hex: string) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([hex, ...loadRecent().filter((c) => c !== hex)].slice(0, 8)));
  } catch {
    // remembered for this visit only
  }
};

/**
 * A line's style, opened from its swatch: shown or hidden, a palette colour
 * or any hex colour, solid / dashed / dotted, thickness, and how strongly a
 * region is filled.
 */
export function LookPicker({
  n,
  lang,
  look,
  slot,
  fillable,
  point,
  onChange,
  onClose,
}: {
  n: number;
  lang: Lang;
  look: LineLook | undefined;
  /** the line's own palette slot */
  slot: number;
  fillable: boolean;
  point: boolean;
  onChange: (look: LineLook | undefined) => void;
  onClose: () => void;
}) {
  const s = STRINGS[lang];
  const ref = useRef<HTMLDivElement>(null);
  const cur = look ?? {};
  const set = (patch: Partial<LineLook>) => {
    const next: LineLook = { ...cur, ...patch };
    for (const k of Object.keys(next) as (keyof LineLook)[]) if (next[k] === undefined || next[k] === false) delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  const hex = cur.color && isHex(cur.color) ? cur.color : '';
  const [hexText, setHexText] = useState(hex);
  useEffect(() => setHexText(hex), [hex]);
  const [recent, setRecent] = useState(loadRecent);
  const chooseHex = (h: string) => {
    set({ color: h.toLowerCase() });
    saveRecent(h.toLowerCase());
    setRecent(loadRecent());
  };
  const chosenSlot = slotOf(cur.color) ?? (hex ? null : slot);

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    ref.current?.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true });
    // all of it in view, above the keypad, when it opens near the bottom of the list
    requestAnimationFrame(() => ref.current?.scrollIntoView({ block: 'nearest' }));
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [onClose]);

  return (
    <div className="look" ref={ref} role="dialog" aria-label={s.title(n)}>
      <label className="check">
        <input type="checkbox" checked={!cur.hidden} onChange={(e) => set({ hidden: !e.target.checked || undefined })} />
        {s.show}
      </label>

      <div className="look__group" role="group" aria-label={s.palette}>
        {Array.from({ length: CURVES }, (_, k) => (
          <button
            key={k}
            type="button"
            className="look__chip"
            style={{ '--chip': slotVar(k) } as React.CSSProperties}
            aria-label={s.colour(k + 1)}
            aria-pressed={chosenSlot === k}
            onClick={() => set({ color: k === slot ? undefined : `c${k + 1}`, exact: undefined })}
          />
        ))}
      </div>

      <div className="look__custom">
        <span className="field__label">{s.custom}</span>
        <div className="look__row">
          <input type="color" className="look__picker" aria-label={s.pick} value={hex || '#2d70b3'} onChange={(e) => chooseHex(e.target.value)} />
          <input
            className="input input--code look__hex"
            aria-label={s.hex}
            value={hexText}
            placeholder="#2d70b3"
            maxLength={7}
            onChange={(e) => {
              const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
              setHexText(e.target.value);
              if (isHex(v)) chooseHex(v);
            }}
          />
        </div>
        {recent.length > 0 && (
          <div className="look__group" role="group" aria-label={s.recent}>
            {recent.map((c) => (
              <button key={c} type="button" className="look__chip" style={{ '--chip': c } as React.CSSProperties} aria-label={c} aria-pressed={hex === c} onClick={() => chooseHex(c)} />
            ))}
          </div>
        )}
        {hex && (
          <label className="check">
            <input type="checkbox" checked={!!cur.exact} onChange={(e) => set({ exact: e.target.checked || undefined })} />
            {s.exact}
          </label>
        )}
      </div>

      {!point && (
        <>
          <div className="segmented" role="group" aria-label={s.style}>
            {(['solid', 'dashed', 'dotted'] as const).map((d) => (
              <button key={d} type="button" aria-pressed={(cur.dash ?? 'solid') === d} onClick={() => set({ dash: d === 'solid' ? undefined : d })}>
                {s[d]}
              </button>
            ))}
          </div>
          <label className="field">
            <span className="field__label">{s.width(cur.width ?? 2.5)}</span>
            <input type="range" className="slider" min={1} max={8} step={0.5} value={cur.width ?? 2.5} onChange={(e) => set({ width: Number(e.target.value) === 2.5 ? undefined : Number(e.target.value) })} />
          </label>
        </>
      )}
      {fillable && (
        <label className="field">
          <span className="field__label">{s.fill(Math.round((cur.fill ?? 0.16) * 100))}</span>
          <input type="range" className="slider" min={0} max={100} step={2} value={Math.round((cur.fill ?? 0.16) * 100)} onChange={(e) => set({ fill: Number(e.target.value) / 100 })} />
        </label>
      )}
      <button type="button" className="btn btn--small btn--quiet look__reset" onClick={() => onChange(cur.hidden ? { hidden: true } : undefined)}>
        {s.reset}
      </button>
    </div>
  );
}
