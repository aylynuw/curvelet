import type { EvalSettings, SymbolicResolver } from '@math/engine';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { FigureView, RichText } from './FigureView';
import type { TeachStrings } from './strings';
import { MARGIN, PAPER, PX_PER_MM, paginate, type Page, type Worksheet } from './worksheet';

const GAP_MM = 8;
const FOOTER_MM = 8;
const ITEM_GAP_MM = 6;
/** one line of space for working */
const LINE_MM = 8;

/**
 * The worksheet as printed pages, at their real size (scaled to fit the
 * screen by `zoom`, and printed at 100%). Every block is measured in a
 * hidden copy first, then packed into columns and pages.
 */
export function Pages({
  sheet,
  s,
  settings,
  resolver,
  version,
  zoom,
}: {
  sheet: Worksheet;
  s: TeachStrings;
  settings: EvalSettings;
  resolver?: SymbolicResolver;
  version: number;
  zoom: number;
}) {
  const paper = PAPER[sheet.paper];
  const px = (mm: number) => mm * PX_PER_MM;
  const contentW = px(paper.width - 2 * MARGIN);
  const columnW = sheet.columns === 2 ? (contentW - px(GAP_MM)) / 2 : contentW;
  const contentH = px(paper.height - 2 * MARGIN - FOOTER_MM);

  const measureRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<{ header: number; problems: number[]; answers: number[]; key: number }>({
    header: 0,
    problems: [],
    answers: [],
    key: 0,
  });
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    void document.fonts?.ready.then(() => setFontsReady((n) => n + 1));
  }, []);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const h = (sel: string) => [...el.querySelectorAll<HTMLElement>(sel)].map((n) => n.getBoundingClientRect().height);
    const next = {
      header: h('[data-measure="header"]')[0] ?? 0,
      problems: h('[data-measure="problem"]'),
      answers: h('[data-measure="answer"]'),
      key: h('[data-measure="key-title"]')[0] ?? 0,
    };
    if (JSON.stringify(next) !== JSON.stringify(heights)) setHeights(next);
  });
  void fontsReady;

  const gap = px(ITEM_GAP_MM);
  const pages: Page[] = paginate(heights.problems, { column: contentH, first: contentH - heights.header, columns: sheet.columns, gap });
  const keyPages: Page[] = sheet.answerKey && sheet.problems.length
    ? paginate(heights.answers, { column: contentH, first: contentH - heights.key, columns: sheet.columns, gap: px(3) })
    : [];
  const total = pages.length + keyPages.length;

  const problem = (k: number) => {
    const p = sheet.problems[k]!;
    return (
      <div className="ws-problem" key={p.id}>
        <div className="ws-problem__head">
          <span className="ws-num">{k + 1}.</span>
          <div className="ws-text">
            <RichText text={p.text} />
            {p.points > 0 && <span className="ws-points"> {s.pointsMark(p.points)}</span>}
          </div>
        </div>
        {p.figure && (
          <div className="ws-figure-wrap">
            <FigureView figure={p.figure} width={columnW - px(6)} settings={settings} resolver={resolver} version={version} label={`${s.figure} ${k + 1}`} />
          </div>
        )}
        {p.space > 0 && <div className="ws-space" style={{ height: px(p.space * LINE_MM) }} />}
      </div>
    );
  };
  const answer = (k: number) => {
    const p = sheet.problems[k]!;
    return (
      <div className="ws-answer" key={p.id}>
        <span className="ws-num">{k + 1}.</span>
        <div className="ws-text">{p.answer.trim() ? <RichText text={p.answer} /> : s.emptyAnswer}</div>
      </div>
    );
  };
  const header = (
    <header className="ws-header">
      <div className="ws-header__titles">
        <h2 className="ws-title">{sheet.title}</h2>
        {sheet.subtitle && <p className="ws-subtitle">{sheet.subtitle}</p>}
      </div>
      {sheet.nameLine && (
        <div className="ws-name">
          <span>
            {s.klass} <span className="ws-blank ws-blank--short" />
          </span>
          <span>
            {s.name} <span className="ws-blank" />
          </span>
        </div>
      )}
      {sheet.instructions && (
        <p className="ws-instructions">
          <RichText text={sheet.instructions} />
        </p>
      )}
    </header>
  );
  const keyTitle = <h2 className="ws-key-title">{s.answers}</h2>;

  const page = (k: number, top: ReactNode, cols: ReactNode[][]) => (
    <article
      className="ws-page"
      key={k}
      aria-label={s.pageOf(k + 1, total)}
      style={{ width: px(paper.width), height: px(paper.height), padding: px(MARGIN) }}
    >
      {top}
      <div className="ws-columns" data-columns={sheet.columns} style={{ gap: px(GAP_MM) }}>
        {cols.map((c, j) => (
          <div className="ws-column" key={j} style={{ gap }}>
            {c}
          </div>
        ))}
      </div>
      <footer className="ws-footer">{s.pageOf(k + 1, total)}</footer>
    </article>
  );

  return (
    <>
      {/* the measuring copy: same widths, out of sight */}
      <div className="ws-measure" ref={measureRef} aria-hidden="true" style={{ width: contentW }}>
        <div data-measure="header">{header}</div>
        <div data-measure="key-title">{keyTitle}</div>
        <div style={{ width: columnW }}>
          {sheet.problems.map((_, k) => (
            <div data-measure="problem" key={k}>
              {problem(k)}
            </div>
          ))}
          {sheet.problems.map((_, k) => (
            <div data-measure="answer" key={k}>
              {answer(k)}
            </div>
          ))}
        </div>
      </div>

      <div className="ws-pages" style={{ zoom }}>
        {pages.map((pg, k) => page(k, k === 0 ? header : null, pg.columns.map((c) => c.map(problem))))}
        {keyPages.map((pg, k) => page(pages.length + k, k === 0 ? keyTitle : null, pg.columns.map((c) => c.map(answer))))}
      </div>
    </>
  );
}
