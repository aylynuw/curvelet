import type { Definition } from '@math/engine';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { type Lang, type Strings } from '../i18n';
import type { HistoryItem } from '../storage';
import { MathText } from './MathText';
import { NumberText } from './ResultView';

export type Tab = 'lines' | 'definitions' | 'history' | 'functions' | 'practice';
const TABS: Tab[] = ['lines', 'definitions', 'history', 'functions', 'practice'];

export function SidePanel({
  tab,
  onTab,
  t,
  lang,
  definitions,
  history,
  onGoTo,
  onInsert,
  onClearHistory,
  children,
  footer,
  practice,
  formulas,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  t: Strings;
  lang: Lang;
  definitions: Definition[];
  history: HistoryItem[];
  onGoTo: (id: string) => void;
  onInsert: (source: string) => void;
  onClearHistory: () => void;
  /** the worksheet's lines, the first tab */
  children: ReactNode;
  /** under every tab: the keypad */
  footer?: ReactNode;
  /** the Practice tab */
  practice: ReactNode;
  /** the Formulas tab, with the function reference inside */
  formulas: ReactNode;
}) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // arrow keys move between tabs (WAI-ARIA tabs pattern)
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = TABS.indexOf(tab);
    const n = TABS.length;
    const next = e.key === 'ArrowRight' ? TABS[(k + 1) % n] : e.key === 'ArrowLeft' ? TABS[(k + n - 1) % n] : null;
    if (next) {
      e.preventDefault();
      onTab(next);
      tabRefs.current[next]?.focus();
    }
  };

  return (
    <section className="panel" aria-label={t.sheet}>
      <div className="tabs" role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            ref={(el) => {
              tabRefs.current[name] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${name}`}
            aria-selected={tab === name}
            aria-controls={`tabpanel-${name}`}
            tabIndex={tab === name ? 0 : -1}
            className="tab"
            onClick={() => onTab(name)}
            onKeyDown={onTabKey}
          >
            {t[name]}
            {name === 'definitions' && definitions.length > 0 && <span className="tab__count num">{definitions.length}</span>}
          </button>
        ))}
      </div>

      <div className="tabpanel" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'definitions' &&
          (definitions.length === 0 ? (
            <p className="empty">{t.noDefinitions}</p>
          ) : (
            <ul className="deflist">
              {definitions.map((d) => (
                <li key={d.id}>
                  <button type="button" className="row-btn" onClick={() => onGoTo(d.id)} aria-label={t.goToLine(d.name)}>
                    <span className="tag">{d.mutable ? t.changeable : t.locked}</span>
                    <MathText className="row-btn__math" text={d.source.replace(/^\s*(let|const)\s+/, '')} />
                  </button>
                </li>
              ))}
            </ul>
          ))}

        {tab === 'history' &&
          (history.length === 0 ? (
            <p className="empty">{t.noHistory}</p>
          ) : (
            <>
              <ul className="deflist">
                {history.map((h) => (
                  <li key={h.id}>
                    <button type="button" className="row-btn row-btn--stack" onClick={() => onInsert(h.source)} aria-label={t.insert(h.source)}>
                      <MathText className="row-btn__math" text={h.source} />
                      <span className="row-btn__result num">
                        = <NumberText text={h.text} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn--small panel__footer-btn" onClick={onClearHistory}>
                {t.clearHistory}
              </button>
            </>
          ))}

        <h2 className="visually-hidden">{t[tab]}</h2>
        {tab === 'lines' && children}
        {tab === 'practice' && practice}
        {tab === 'functions' && formulas}
      </div>
      {footer}
    </section>
  );
}
