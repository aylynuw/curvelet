import { useState } from 'react';
import type { Lang } from '../i18n';
import { MathText } from '../components/MathText';
import { LESSONS, TUTORIAL_STRINGS } from './lessons';

const KEY = 'curvelet.tutorial.done';
/** the lesson left open, kept while the tab is switched away and back */
let lastOpen: string | null | undefined;

function loadDone(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function saveDone(done: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(done));
  } catch {
    /* private window: progress just isn't kept */
  }
}

/** The Tutorial tab: short lessons whose examples go straight into the expression list. */
export default function TutorialPanel({
  lang,
  onTry,
  onOpenTool,
}: {
  lang: Lang;
  onTry: (lines: string[], name: string) => void;
  onOpenTool: (tool: 'calc' | 'geo' | 'sheet') => void;
}) {
  const s = TUTORIAL_STRINGS[lang];
  const lessons = LESSONS[lang];
  const [done, setDone] = useState<string[]>(loadDone);
  const [open, setOpenState] = useState<string | null>(
    () => (lastOpen !== undefined ? lastOpen : (lessons.find((l) => !loadDone().includes(l.id))?.id ?? lessons[0]!.id)),
  );
  const setOpen = (id: string | null) => {
    lastOpen = id;
    setOpenState(id);
  };

  const toggleDone = (id: string) => {
    const next = done.includes(id) ? done.filter((d) => d !== id) : [...done, id];
    setDone(next);
    saveDone(next);
    if (!done.includes(id)) {
      const after = lessons.slice(lessons.findIndex((l) => l.id === id) + 1).find((l) => !next.includes(l.id));
      setOpen(after?.id ?? null);
      // bring the next lesson's title up to where the reader is
      if (after) requestAnimationFrame(() => document.getElementById(`lesson-${after.id}`)?.parentElement?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
    }
  };

  return (
    <div className="tutorial">
      <p className="tutorial__intro">{s.intro}</p>
      <p className="tutorial__progress num" aria-live="polite">
        {s.progress(done.length, lessons.length)}
        {done.length > 0 && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setDone([]);
              saveDone([]);
              setOpen(lessons[0]!.id);
            }}
          >
            {s.reset}
          </button>
        )}
      </p>
      <ol className="tutorial__list">
        {lessons.map((lesson, i) => {
          const isOpen = open === lesson.id;
          const isDone = done.includes(lesson.id);
          return (
            <li key={lesson.id} className="lesson" data-done={isDone || undefined}>
              <h3 className="lesson__head">
                <button
                  type="button"
                  className="lesson__toggle"
                  aria-expanded={isOpen}
                  aria-controls={`lesson-${lesson.id}`}
                  onClick={() => setOpen(isOpen ? null : lesson.id)}
                >
                  <span className="lesson__num num" aria-hidden="true">
                    {isDone ? '✓' : i + 1}
                  </span>
                  <span className="lesson__title">{lesson.title}</span>
                  {isDone && <span className="visually-hidden">{s.done}</span>}
                </button>
              </h3>
              {isOpen && (
                <div className="lesson__body" id={`lesson-${lesson.id}`}>
                  {lesson.steps.map((step, k) => (
                    <div key={k} className="lesson__step">
                      <p className="lesson__text">{step.text}</p>
                      {step.lines && (
                        <>
                          <ul className="lesson__examples">
                            {step.lines.map((line) => (
                              <li key={line}>
                                <MathText className="lesson__math" text={line} />
                              </li>
                            ))}
                          </ul>
                          <button type="button" className="btn btn--small" onClick={() => onTry(step.lines!, lesson.title)}>
                            {s.tryIt}
                          </button>
                        </>
                      )}
                      {step.tool && (
                        <button type="button" className="btn btn--small" onClick={() => onOpenTool(step.tool!)}>
                          {s.open[step.tool]}
                        </button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="btn btn--small lesson__done" aria-pressed={isDone} onClick={() => toggleDone(lesson.id)}>
                    {isDone ? s.done : s.markDone}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
