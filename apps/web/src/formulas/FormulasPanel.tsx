import { Workspace, type EvalSettings, type SymbolicResolver } from '@math/engine';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { MathText } from '../components/MathText';
import { NumberText } from '../components/ResultView';
import { REFERENCE, type Lang } from '../i18n';
import { FORMULAS, formulaLines, inputName, SUBJECTS, type Formula, type Subject } from './library';
import { loadPrefs, savePrefs, type FormulaPrefs, type FormulaStrings } from './strings';

/**
 * The Formulas tab: a searchable library by subject, with favorites and
 * recently used ones first. A formula opens with its values to fill in and
 * the result worked out live; Insert puts it in the worksheet as let lines.
 * The function reference is the tab's second view.
 */
export function FormulasPanel({
  s,
  lang,
  settings,
  resolver,
  onAnswer,
  taken,
  onInsert,
}: {
  s: FormulaStrings;
  lang: Lang;
  settings: EvalSettings;
  resolver?: SymbolicResolver;
  onAnswer: (l: () => void) => () => void;
  /** names already defined in the worksheet */
  taken: () => Set<string>;
  onInsert: (lines: string[], name: string) => void;
}) {
  const [view, setView] = useState<'library' | 'reference'>('library');
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<Subject | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [prefs, setPrefsState] = useState<FormulaPrefs>(loadPrefs);
  // written straight to storage: inserting switches tabs, and this panel is gone before any state update or effect
  const setPrefs = (change: (p: FormulaPrefs) => FormulaPrefs) => {
    const next = change(loadPrefs());
    savePrefs(next);
    setPrefsState(next);
  };

  const q = query.trim().toLowerCase();
  const matches = (f: Formula) =>
    (subject === 'all' || f.subject === subject) &&
    (!q || f.name.en.toLowerCase().includes(q) || f.name.ko.includes(q) || f.formula.toLowerCase().includes(q) || s.subjects[f.subject].toLowerCase().includes(q));
  const list = FORMULAS.filter(matches);
  const byId = (id: string) => FORMULAS.find((f) => f.id === id);
  const favorites = prefs.favorites.map(byId).filter((f): f is Formula => !!f && matches(f));
  const recent = prefs.recent.map(byId).filter((f): f is Formula => !!f && matches(f) && !prefs.favorites.includes(f.id)).slice(0, 5);

  const toggleFavorite = (id: string) =>
    setPrefs((p) => ({ ...p, favorites: p.favorites.includes(id) ? p.favorites.filter((x) => x !== id) : [id, ...p.favorites] }));
  const insert = (f: Formula, values: Record<string, string>) => {
    setPrefs((p) => ({ ...p, recent: [f.id, ...p.recent.filter((x) => x !== f.id)].slice(0, 8) }));
    onInsert(formulaLines(f, values, taken()), f.name[lang]);
  };

  const card = (f: Formula, where: string) => (
    <FormulaCard
      key={`${where}-${f.id}`}
      f={f}
      s={s}
      lang={lang}
      open={open === `${where}-${f.id}`}
      onToggle={() => setOpen(open === `${where}-${f.id}` ? null : `${where}-${f.id}`)}
      favorite={prefs.favorites.includes(f.id)}
      onFavorite={() => toggleFavorite(f.id)}
      onInsert={(values) => insert(f, values)}
      settings={settings}
      resolver={resolver}
      onAnswer={onAnswer}
    />
  );

  return (
    <div className="formulas">
      <div className="formulas__bar">
        <div className="segmented" role="group" aria-label={s.views}>
          <button type="button" aria-pressed={view === 'library'} onClick={() => setView('library')}>
            {s.library}
          </button>
          <button type="button" aria-pressed={view === 'reference'} onClick={() => setView('reference')}>
            {s.reference}
          </button>
        </div>
      </div>

      {view === 'reference' ? (
        <div className="reference">
          {REFERENCE[lang].map((group) => (
            <section key={group.title} className="reference__group">
              <h3>{group.title}</h3>
              <dl>
                {group.items.map((item) => (
                  <div key={item.syntax} className="reference__item">
                    <dt>
                      <code>{item.syntax}</code>
                    </dt>
                    <dd>{item.note}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      ) : (
        <>
          <div className="formulas__find">
            <input
              className="input"
              type="search"
              aria-label={s.search}
              placeholder={s.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="chips" role="group" aria-label={s.search}>
              {(['all', ...SUBJECTS] as const).map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={subject === k} onClick={() => setSubject(k)}>
                  {k === 'all' ? s.all : s.subjects[k]}
                </button>
              ))}
            </div>
          </div>

          {favorites.length > 0 && (
            <section className="formulas__group" aria-labelledby="formulas-favorites">
              <h3 id="formulas-favorites" className="formulas__heading">
                {s.favorites}
              </h3>
              <ul className="formulas__list">{favorites.map((f) => card(f, 'fav'))}</ul>
            </section>
          )}
          {recent.length > 0 && !q && (
            <section className="formulas__group" aria-labelledby="formulas-recent">
              <h3 id="formulas-recent" className="formulas__heading">
                {s.recent}
              </h3>
              <ul className="formulas__list">{recent.map((f) => card(f, 'recent'))}</ul>
            </section>
          )}
          <section className="formulas__group" aria-labelledby="formulas-all">
            <h3 id="formulas-all" className="formulas__heading">
              {subject === 'all' ? s.everything : s.subjects[subject]} <span className="tab__count num">{list.length}</span>
            </h3>
            {list.length === 0 ? <p className="empty">{s.none}</p> : <ul className="formulas__list">{list.map((f) => card(f, 'all'))}</ul>}
          </section>
        </>
      )}
    </div>
  );
}

function FormulaCard({
  f,
  s,
  lang,
  open,
  onToggle,
  favorite,
  onFavorite,
  onInsert,
  settings,
  resolver,
  onAnswer,
}: {
  f: Formula;
  s: FormulaStrings;
  lang: Lang;
  open: boolean;
  onToggle: () => void;
  favorite: boolean;
  onFavorite: () => void;
  onInsert: (values: Record<string, string>) => void;
  settings: EvalSettings;
  resolver?: SymbolicResolver;
  onAnswer: (l: () => void) => () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  return (
    <li className="formula" data-open={open || undefined}>
      <div className="formula__head">
        <button type="button" className="formula__toggle" aria-expanded={open} aria-label={s.open(f.name[lang])} onClick={onToggle}>
          <span className="formula__name">{f.name[lang]}</span>
          <MathText className="formula__math" text={f.formula} />
        </button>
        <button type="button" className="icon-btn icon-btn--small formula__star" aria-pressed={favorite} aria-label={s.favorite(f.name[lang])} title={s.favorite(f.name[lang])} onClick={onFavorite}>
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
            <path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6z" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="formula__body">
          <div className="formula__inputs">
            {f.inputs.map((i) => (
              <label key={i.name} className="formula__input">
                <span className="formula__var">
                  <MathText text={i.name} />
                  <span className="formula__note">{i.fn ? `${i.note[lang]}, ${s.fnHint}` : i.note[lang]}</span>
                </span>
                <input
                  className="input input--code"
                  value={values[i.name] ?? i.value}
                  inputMode={i.fn ? 'text' : 'decimal'}
                  onChange={(e) => setValues((v) => ({ ...v, [i.name]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <Result f={f} values={values} s={s} settings={settings} resolver={resolver} onAnswer={onAnswer} />
          <button type="button" className="btn btn--small btn--primary formula__insert" onClick={() => onInsert(values)}>
            {s.insert}
          </button>
        </div>
      )}
    </li>
  );
}

/** The formula worked out with the values filled in, in a workspace of its own. */
function Result({
  f,
  values,
  s,
  settings,
  resolver,
  onAnswer,
}: {
  f: Formula;
  values: Record<string, string>;
  s: FormulaStrings;
  settings: EvalSettings;
  resolver?: SymbolicResolver;
  onAnswer: (l: () => void) => () => void;
}) {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onAnswer(bump), [onAnswer]);
  const { res, bad } = useMemo(() => {
    const w = new Workspace(settings, resolver);
    const lines = formulaLines(f, values, new Set());
    lines.forEach((src, k) => w.set(String(k), src));
    // the first input with an error says what to fix
    const k = f.inputs.findIndex((_, n) => w.result(String(n))?.status === 'error');
    const e = k >= 0 ? w.result(String(k)) : undefined;
    return { res: w.result(String(lines.length - 1)), bad: e?.status === 'error' ? `${inputName(f.inputs[k]!.name)}: ${e.message}` : null };
    // version: SymPy answered
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, values, settings, resolver, version]);
  let body: React.ReactNode;
  if (bad) body = <span className="result__error">{bad}</span>;
  else if (!res || res.status === 'pending') body = <span className="result__note">{s.working}</span>;
  else if (res.status === 'error') body = <span className="result__error">{res.message}</span>;
  else if (res.status === 'value')
    body = (
      <span className="result__value">
        {res.exact ? <MathText text={res.exact} /> : <NumberText text={res.text} />}
        {f.unit && <span className="formula__unit"> {f.unit}</span>}
      </span>
    );
  else if (res.status === 'symbolic' || res.status === 'solved') body = <MathText text={res.text} />;
  else body = <span className="result__note">{s.graphNote}</span>;
  return (
    <div className="formula__result" aria-live="polite">
      <span className="formula__result-label">{s.result}</span>
      {body}
    </div>
  );
}
