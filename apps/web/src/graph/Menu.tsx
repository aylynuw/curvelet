import { useEffect, useRef, useState } from 'react';

export interface MenuItem {
  key: string;
  label: string;
  /** a second, quieter line */
  note?: string;
  run: () => void;
}

/** A button that opens a short list of actions; Escape or a click outside closes it. */
export function Menu({ label, listLabel, items, align = 'right' }: { label: string; listLabel: string; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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

  return (
    <div className="menu" ref={ref} data-align={align}>
      <button type="button" className="hud-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        {label}
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="menu__list" role="list" aria-label={listLabel}>
          {items.map((k) => (
            <li key={k.key}>
              <button
                type="button"
                className="menu__item"
                data-two-line={k.note ? true : undefined}
                onClick={() => {
                  setOpen(false);
                  k.run();
                }}
              >
                <span>{k.label}</span>
                {k.note && <span className="menu__note">{k.note}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
