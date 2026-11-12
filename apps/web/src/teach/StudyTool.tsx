import type { EvalSettings, SymbolicResolver } from '@math/engine';
import { useState } from 'react';
import type { Lang } from '../i18n';
import { Practice } from '../learn/Practice';
import type { IntegralAsk } from '../learn/StepsView';
import type { LearnStrings } from '../learn/strings';
import type { MathfieldElement } from '../math/mathlive';
import { generateProblems, toSheetProblem } from './fromPractice';
import type { TeachStrings } from './strings';
import { WorksheetView } from './WorksheetView';
import type { Worksheet } from './worksheet';

type View = 'practice' | 'worksheet';
const VIEW_KEY = 'curvelet.study.view';
function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'worksheet' ? 'worksheet' : 'practice';
  } catch {
    return 'practice';
  }
}

/** Practice and the worksheet in one place: problems you try, and problems you print. */
export function StudyTool({
  sheet,
  setSheet,
  s,
  learn,
  lang,
  settings,
  resolver,
  onAnswer,
  askIntegral,
  keyboard,
  fieldRef,
  onFocusField,
  onNotice,
  calculatorLines,
}: {
  sheet: Worksheet;
  setSheet: (f: (w: Worksheet) => Worksheet) => void;
  s: TeachStrings;
  learn: LearnStrings;
  lang: Lang;
  settings: EvalSettings;
  resolver?: SymbolicResolver;
  onAnswer: (l: () => void) => () => void;
  askIntegral: IntegralAsk;
  keyboard: 'text' | 'none';
  fieldRef: (el: MathfieldElement | null) => void;
  onFocusField: () => void;
  onNotice: (text: string) => void;
  calculatorLines: () => string[];
}) {
  const [view, setViewState] = useState<View>(loadView);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // remembered for this visit
    }
  };

  return (
    <div className={`study study--${view}`}>
      <div className="study__bar">
        <div className="segmented" role="group" aria-label={s.study}>
          {(['practice', 'worksheet'] as View[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'practice' ? s.practice : s.worksheet}
              {v === 'worksheet' && sheet.problems.length > 0 && <span className="tab__count num">{sheet.problems.length}</span>}
            </button>
          ))}
        </div>
      </div>
      {view === 'practice' ? (
        <div className="study__practice">
          <Practice
            s={learn}
            lang={lang}
            settings={settings}
            keyboard={keyboard}
            fieldRef={fieldRef}
            onFocusField={onFocusField}
            askIntegral={askIntegral}
            onAnswer={onAnswer}
            onAddToSheet={(p) => setSheet((w) => ({ ...w, problems: [...w.problems, toSheetProblem(p, lang, learn)] }))}
            onMakeSheet={(level, topic) => {
              const made = generateProblems(level, topic, 10, lang, learn);
              setSheet((w) => ({ ...w, problems: [...w.problems, ...made] }));
              setView('worksheet');
              onNotice(learn.madeSheet(made.length));
            }}
          />
        </div>
      ) : (
        <WorksheetView
          sheet={sheet}
          onChange={(w) => setSheet(() => w)}
          s={s}
          learn={learn}
          lang={lang}
          settings={settings}
          resolver={resolver}
          onAnswer={onAnswer}
          calculatorLines={calculatorLines}
        />
      )}
    </div>
  );
}
