import type { EvalSettings } from '@math/engine';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Lang, Strings } from '../i18n';
import type { Theme } from '../storage';
import type { FileStrings } from './strings';

/** A modal on the native <dialog>: focus stays inside, Escape and the backdrop close it. */
function Modal({ title, open, onClose, closeLabel, children }: { title: string; open: boolean; onClose: () => void; closeLabel: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={`${title}-title`}
      onClose={onClose}
      onClick={(e) => {
        // a click on the backdrop lands on the dialog itself
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog__head">
        <h2 id={`${title}-title`} className="dialog__title">
          {title}
        </h2>
        <button type="button" className="icon-btn" aria-label={closeLabel} onClick={onClose}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
      </div>
      <div className="dialog__body">{children}</div>
    </dialog>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="dialog__row">
      <span className="field__label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsDialog({
  open,
  onClose,
  s,
  t,
  lang,
  onLang,
  theme,
  onTheme,
  settings,
  onSettings,
  keypad,
  onKeypad,
}: {
  open: boolean;
  onClose: () => void;
  s: FileStrings;
  t: Strings;
  lang: Lang;
  onLang: (l: Lang) => void;
  theme: Theme;
  onTheme: (th: Theme) => void;
  settings: EvalSettings;
  onSettings: (patch: Partial<EvalSettings>) => void;
  keypad: boolean;
  onKeypad: (on: boolean) => void;
}) {
  return (
    <Modal title={s.settings} open={open} onClose={onClose} closeLabel={s.close}>
      <Choice label={t.angle} value={settings.angle} options={[{ value: 'rad', label: t.rad }, { value: 'deg', label: t.deg }]} onChange={(angle) => onSettings({ angle })} />
      <Choice
        label={t.numbers}
        value={settings.complex ? 'complex' : 'real'}
        options={[{ value: 'real', label: t.real }, { value: 'complex', label: t.complex }]}
        onChange={(v) => onSettings({ complex: v === 'complex' })}
      />
      <Choice label={s.theme} value={theme} options={(['system', 'light', 'dark'] as const).map((v) => ({ value: v, label: t.themeName[v] }))} onChange={onTheme} />
      <Choice label={s.language} value={lang} options={[{ value: 'en', label: 'English' }, { value: 'ko', label: '한국어' }]} onChange={onLang} />
      <label className="check">
        <input type="checkbox" checked={keypad} onChange={(e) => onKeypad(e.target.checked)} />
        {s.keypadOn}
      </label>
      <p className="dialog__note">{s.settingsNote}</p>
    </Modal>
  );
}
