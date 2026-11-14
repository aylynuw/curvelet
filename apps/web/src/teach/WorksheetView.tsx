import type { EvalSettings, SymbolicResolver } from '@math/engine';
import { latexToText } from '../math/latex';
import { prettyGuide } from '../graph/guideText';
import { levelTopics, type Level, type Topic } from '@math/steps';
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import type { Lang } from '../i18n';
import type { LearnStrings } from '../learn/strings';
import { Pages } from './Pages';
import type { TeachStrings } from './strings';
import { generateProblems, mockSheet } from './fromPractice';
import { FIGURE_TEMPLATES } from './templates';
import { blankProblem, newId, PAPER, PX_PER_MM, type Figure, type Paper, type Problem, type Worksheet } from './worksheet';

/**
 * The worksheet builder: page settings and the list of problems on the left,
 * the printed pages on the right. Printing (or saving as PDF from the print
 * dialog) prints only the pages.
 */
export function WorksheetView({
  sheet,
  onChange,
  s,
  learn,
  lang,
  settings,
  resolver,
  onAnswer,
  calculatorLines,
}: {
  sheet: Worksheet;
  onChange: (w: Worksheet) => void;
  s: TeachStrings;
  learn: LearnStrings;
  lang: Lang;
  settings: EvalSettings;
  resolver?: SymbolicResolver;
  onAnswer: (l: () => void) => () => void;
  /** the calculator's lines, for a figure taken from it */
  calculatorLines: () => string[];
}) {
  // SymPy answers (f'(a) in a figure) redraw the figures
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onAnswer(bump), [onAnswer]);

  const set = (patch: Partial<Worksheet>) => onChange({ ...sheet, ...patch });
  const setProblem = (k: number, patch: Partial<Problem>) => set({ problems: sheet.problems.map((p, j) => (j === k ? { ...p, ...patch } : p)) });
  const move = (k: number, by: number) => {
    const list = [...sheet.problems];
    const [p] = list.splice(k, 1);
    list.splice(k + by, 0, p!);
    set({ problems: list });
  };
  const [open, setOpen] = useState<string | null>(null);

  // the pages fit the space beside the editor
  const previewRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.6);
  useLayoutEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const available = el.clientWidth - 32;
      setZoom(Math.min(1, available / (PAPER[sheet.paper].width * PX_PER_MM)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [sheet.paper]);

  // @page size for printing follows the paper
  useEffect(() => {
    const style = document.createElement('style');
    const p = PAPER[sheet.paper];
    style.textContent = `@page { size: ${p.width}mm ${p.height}mm; margin: 0; }`;
    document.head.append(style);
    return () => style.remove();
  }, [sheet.paper]);

  const [genLevel, setGenLevel] = useState<Level>('exam');
  const [genTopic, setGenTopic] = useState<Topic>('calculus');
  const [genCount, setGenCount] = useState(4);
  const generate = () => set({ problems: [...sheet.problems, ...generateProblems(genLevel, genTopic, genCount, lang, learn)] });
  const [mockElective, setMockElective] = useState<'calc2' | 'stats' | 'geometry'>('calc2');
  const makeMock = () => {
    if (sheet.problems.length > 0 && !window.confirm(s.mockReplace)) return;
    set({
      title: s.mockTitle,
      subtitle: s.mockSubtitle(learn.topics[mockElective]),
      columns: 2,
      answerKey: true,
      problems: mockSheet(mockElective, lang),
    });
  };

  const addProblem = () => {
    const p = blankProblem();
    set({ problems: [...sheet.problems, p] });
    setOpen(p.id);
  };

  return (
    <div className="ws">
      <aside className="ws-editor" aria-label={s.worksheet}>
        <div className="ws-editor__bar">
          <button type="button" className="btn btn--primary" onClick={() => window.print()}>
            {s.print}
          </button>
          <button
            type="button"
            className="btn btn--quiet"
            onClick={() => {
              if (sheet.problems.length === 0 || window.confirm(s.clearConfirm)) set({ problems: [] });
            }}
          >
            {s.clear}
          </button>
        </div>
        <p className="ws-editor__hint">{s.printHint}</p>

        <section className="ws-section" aria-labelledby="ws-page-title">
          <h2 id="ws-page-title" className="ws-section__title">
            {s.page}
          </h2>
          <Field label={s.title}>
            <input className="input" value={sheet.title} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label={s.subtitle}>
            <input className="input" value={sheet.subtitle} placeholder={s.subtitleHint} onChange={(e) => set({ subtitle: e.target.value })} />
          </Field>
          <Field label={s.instructions}>
            <textarea className="input" rows={2} value={sheet.instructions} onChange={(e) => set({ instructions: e.target.value })} />
          </Field>
          <div className="ws-row">
            <Field label={s.paper}>
              <select className="input" value={sheet.paper} onChange={(e) => set({ paper: e.target.value as Paper })}>
                {(Object.keys(PAPER) as Paper[]).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={s.columns}>
              <select className="input" value={sheet.columns} onChange={(e) => set({ columns: Number(e.target.value) as 1 | 2 })}>
                <option value={1}>{s.one}</option>
                <option value={2}>{s.two}</option>
              </select>
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" checked={sheet.nameLine} onChange={(e) => set({ nameLine: e.target.checked })} />
            {s.nameLine}
          </label>
          <label className="check">
            <input type="checkbox" checked={sheet.answerKey} onChange={(e) => set({ answerKey: e.target.checked })} />
            {s.answerKey}
          </label>
        </section>

        <section className="ws-section" aria-labelledby="ws-problems-title">
          <h2 id="ws-problems-title" className="ws-section__title">
            {s.problems} <span className="tab__count num">{sheet.problems.length}</span>
          </h2>
          {sheet.problems.length === 0 && <p className="ws-editor__hint">{s.noProblems}</p>}
          <ol className="ws-list">
            {sheet.problems.map((p, k) => (
              <li key={p.id} className="ws-item" data-open={open === p.id || undefined}>
                <div className="ws-item__head">
                  <button type="button" className="ws-item__toggle" aria-expanded={open === p.id} aria-label={s.edit(k + 1)} onClick={() => setOpen(open === p.id ? null : p.id)}>
                    <span className="ws-item__num num">{k + 1}</span>
                    <span className="ws-item__preview">{preview(p.text) || s.problem(k + 1)}</span>
                    {p.figure && <span className="tag">{s.figure}</span>}
                  </button>
                  <div className="ws-item__tools">
                    <IconButton label={s.moveUp(k + 1)} disabled={k === 0} onClick={() => move(k, -1)} d="M4 10l4-4 4 4" />
                    <IconButton label={s.moveDown(k + 1)} disabled={k === sheet.problems.length - 1} onClick={() => move(k, 1)} d="M4 6l4 4 4-4" />
                    <IconButton
                      label={s.duplicate(k + 1)}
                      onClick={() => set({ problems: [...sheet.problems.slice(0, k + 1), { ...p, id: newId() }, ...sheet.problems.slice(k + 1)] })}
                      d="M5.5 5.5h7v7h-7zM3.5 10.5v-7h7"
                    />
                    <IconButton label={s.remove(k + 1)} onClick={() => set({ problems: sheet.problems.filter((_, j) => j !== k) })} d="M4 4l8 8M12 4l-8 8" />
                  </div>
                </div>
                {open === p.id && (
                  <ProblemEditor p={p} n={k + 1} s={s} lang={lang} onChange={(patch) => setProblem(k, patch)} calculatorLines={calculatorLines} />
                )}
              </li>
            ))}
          </ol>
          <div className="ws-add">
            <button type="button" className="btn btn--small btn--add" onClick={addProblem}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              {s.addProblem}
            </button>
          </div>
          <div className="ws-generate" role="group" aria-label={s.generate}>
            <Field label={s.generateLevel}>
              <select
                className="input"
                value={genLevel}
                onChange={(e) => {
                  const l = e.target.value as Level;
                  setGenLevel(l);
                  if (!levelTopics(l).includes(genTopic)) setGenTopic(levelTopics(l)[0]!);
                }}
              >
                {(['basic', 'advanced', 'exam'] as Level[]).map((l) => (
                  <option key={l} value={l}>
                    {learn.levels[l]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={s.generateTopic}>
              <select className="input" value={genTopic} onChange={(e) => setGenTopic(e.target.value as Topic)}>
                {levelTopics(genLevel).map((t) => (
                  <option key={t} value={t}>
                    {learn.topics[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={s.generateCount}>
              <input className="input input--num" type="number" min={1} max={20} value={genCount} onChange={(e) => setGenCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} />
            </Field>
            <button type="button" className="btn btn--small" onClick={generate}>
              {s.generate}
            </button>
          </div>
          <div className="ws-mock" role="group" aria-labelledby="ws-mock-title">
            <h3 id="ws-mock-title" className="ws-mock__title">
              {s.mock}
            </h3>
            <p className="ws-mock__note">{s.mockNote}</p>
            <div className="ws-mock__row">
              <Field label={s.mockElective}>
                <select className="input" value={mockElective} onChange={(e) => setMockElective(e.target.value as 'calc2' | 'stats' | 'geometry')}>
                  <option value="calc2">{learn.topics.calc2}</option>
                  <option value="stats">{learn.topics.stats}</option>
                  <option value="geometry">{learn.topics.geometry}</option>
                </select>
              </Field>
              <button type="button" className="btn btn--small btn--primary" onClick={makeMock}>
                {s.mockMake}
              </button>
            </div>
          </div>
        </section>
      </aside>

      <section className="ws-preview" ref={previewRef} aria-label={s.preview}>
        <Pages sheet={sheet} s={s} settings={settings} resolver={resolver} version={version} zoom={zoom} />
      </section>
    </div>
  );
}

/** a one-line summary of a problem's text: its math written out in one line, $ marks dropped */
function preview(text: string): string {
  // raw LaTeX read back as text, then printed the way a figure prints it (√, π, x²)
  const read = (tex: string) => {
    try {
      return prettyGuide(latexToText(tex));
    } catch {
      return '…';
    }
  };
  return text
    .replace(/\$\$([^$]*)\$\$/g, (_, tex: string) => read(tex))
    .replace(/\$([^$]*)\$/g, (_, m: string) => prettyGuide(m))
    .replace(/\s+/g, ' ')
    .trim();
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

function IconButton({ label, onClick, d, disabled }: { label: string; onClick: () => void; d: string; disabled?: boolean }) {
  return (
    <button type="button" className="icon-btn icon-btn--small" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d={d} stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function ProblemEditor({
  p,
  n,
  s,
  lang,
  onChange,
  calculatorLines,
}: {
  p: Problem;
  n: number;
  s: TeachStrings;
  lang: Lang;
  onChange: (patch: Partial<Problem>) => void;
  calculatorLines: () => string[];
}) {
  const figure = p.figure;
  const setFigure = (patch: Partial<Figure>) => onChange({ figure: { ...figure!, ...patch } });
  const fromTemplate = (id: string) => {
    const t = FIGURE_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    onChange({ figure: { lines: t.lines, range: t.range, axes: t.axes, axisNumbers: false, curveLabels: true, width: 0.85 } });
  };
  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v.trim() !== '' ? Number(v) : fallback);

  return (
    <div className="ws-item__body">
      <Field label={s.text}>
        <textarea className="input" rows={3} value={p.text} onChange={(e) => onChange({ text: e.target.value })} aria-describedby={`ws-text-hint-${p.id}`} />
      </Field>
      <p className="field__hint" id={`ws-text-hint-${p.id}`}>
        {s.textHint}
      </p>
      <Field label={s.answer}>
        <textarea className="input" rows={2} value={p.answer} onChange={(e) => onChange({ answer: e.target.value })} aria-describedby={`ws-answer-hint-${p.id}`} />
      </Field>
      <p className="field__hint" id={`ws-answer-hint-${p.id}`}>
        {s.answerHint}
      </p>
      <div className="ws-row">
        <Field label={s.points}>
          <input className="input input--num" type="number" min={0} max={100} value={p.points} onChange={(e) => onChange({ points: Math.max(0, num(e.target.value, 0)) })} />
        </Field>
        <Field label={s.space}>
          <input className="input input--num" type="number" min={0} max={30} value={p.space} onChange={(e) => onChange({ space: Math.max(0, Math.min(30, num(e.target.value, 0))) })} />
        </Field>
      </div>

      <div className="ws-figure-edit">
        <span className="field__label">{s.figure}</span>
        {!figure ? (
          <div className="ws-row">
            <select className="input" value="" aria-label={s.fromTemplate} onChange={(e) => fromTemplate(e.target.value)}>
              <option value="" disabled>
                {s.fromTemplate}
              </option>
              {FIGURE_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name[lang]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn--small"
              onClick={() =>
                onChange({ figure: { lines: calculatorLines(), range: { xmin: -5, xmax: 5, ymin: -4, ymax: 4 }, axes: true, axisNumbers: false, curveLabels: true, width: 0.85 } })
              }
            >
              {s.fromCalculator}
            </button>
          </div>
        ) : (
          <>
            <Field label={s.figureLines}>
              <textarea
                className="input input--code"
                rows={Math.min(10, figure.lines.length + 1)}
                value={figure.lines.join('\n')}
                onChange={(e) => setFigure({ lines: e.target.value.split('\n') })}
                aria-describedby={`ws-fig-hint-${p.id}`}
              />
            </Field>
            <p className="field__hint" id={`ws-fig-hint-${p.id}`}>
              {s.figureLinesHint}
            </p>
            <div className="ws-row">
              <Range label={s.xRange} lo={figure.range.xmin} hi={figure.range.xmax} s={s} onChange={(lo, hi) => setFigure({ range: { ...figure.range, xmin: lo, xmax: hi } })} />
              <Range label={s.yRange} lo={figure.range.ymin} hi={figure.range.ymax} s={s} onChange={(lo, hi) => setFigure({ range: { ...figure.range, ymin: lo, ymax: hi } })} />
            </div>
            <Field label={`${s.width} ${Math.round(figure.width * 100)}%`}>
              <input type="range" className="slider" min={30} max={100} step={5} value={Math.round(figure.width * 100)} onChange={(e) => setFigure({ width: Number(e.target.value) / 100 })} />
            </Field>
            <div className="ws-checks">
              <label className="check">
                <input type="checkbox" checked={figure.axes} onChange={(e) => setFigure({ axes: e.target.checked })} />
                {s.axes}
              </label>
              <label className="check">
                <input type="checkbox" checked={figure.axisNumbers} onChange={(e) => setFigure({ axisNumbers: e.target.checked })} />
                {s.axisNumbers}
              </label>
              <label className="check">
                <input type="checkbox" checked={figure.curveLabels} onChange={(e) => setFigure({ curveLabels: e.target.checked })} />
                {s.curveLabels}
              </label>
            </div>
            <button type="button" className="btn btn--small btn--quiet" onClick={() => onChange({ figure: null })}>
              {s.removeFigure}
            </button>
          </>
        )}
      </div>
      <span className="visually-hidden">{s.problem(n)}</span>
    </div>
  );
}

function Range({ label, lo, hi, s, onChange }: { label: string; lo: number; hi: number; s: TeachStrings; onChange: (lo: number, hi: number) => void }) {
  const [a, setA] = useState(String(lo));
  const [b, setB] = useState(String(hi));
  useEffect(() => setA(String(lo)), [lo]);
  useEffect(() => setB(String(hi)), [hi]);
  const commit = (x: string, y: string) => {
    const [p, q] = [Number(x), Number(y)];
    if (Number.isFinite(p) && Number.isFinite(q) && q > p) onChange(p, q);
  };
  return (
    <fieldset className="ws-range">
      <legend className="field__label">{label}</legend>
      <input className="input input--num" inputMode="decimal" aria-label={`${label}: ${s.from}`} value={a} onChange={(e) => (setA(e.target.value), commit(e.target.value, b))} />
      <span aria-hidden="true">~</span>
      <input className="input input--num" inputMode="decimal" aria-label={`${label}: ${s.to}`} value={b} onChange={(e) => (setB(e.target.value), commit(a, e.target.value))} />
    </fieldset>
  );
}
