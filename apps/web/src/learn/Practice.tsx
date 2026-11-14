import type { EvalSettings, Node } from '@math/engine';
import { printNode } from '@math/engine';
import { checkAnswer, freshProblem, levelTopics, problemKey, type Level, type Problem, type Topic, type Verdict } from '@math/steps';
import { useRef, useState } from 'react';
import type { Lang } from '../i18n';
import { RichText } from '../teach/FigureView';
import { latexToText } from '../math/latex';
import { MathInput } from '../components/MathInput';
import { LatexText, MathText } from '../components/MathText';
import { textToLatex } from '../math/latex';
import type { MathfieldElement } from '../math/mathlive';
import { markSeen, recentOf } from './recent';
import { StepsView, type IntegralAsk } from './StepsView';
import type { LearnStrings } from './strings';

const LEVELS: Level[] = ['basic', 'advanced', 'exam'];
const PREF = 'curvelet.practice.v1';
/** a problem the student hasn't seen lately, remembered as seen */
function newProblem(topic: Topic, level: Level): Problem {
  const p = freshProblem(topic, level, recentOf(level, topic));
  markSeen(level, topic, problemKey(p));
  return p;
}

function loadPref(): { level: Level; topic: Topic } {
  try {
    const v = JSON.parse(localStorage.getItem(PREF) ?? 'null');
    if (v && LEVELS.includes(v.level) && levelTopics(v.level).includes(v.topic)) return v;
  } catch {
    // the first visit
  }
  return { level: 'basic', topic: 'derivative' };
}

/** The problem as it is written in a book: d/dx(…), ∫ … dx, or the equation. */
export function questionTex(p: Problem): string {
  const f = (n: Node) => textToLatex(printNode(n), { display: true });
  if (p.topic === 'derivative') return `\\frac{d}{dx}\\left(${f(p.target[0]!)}\\right)`;
  if (p.topic === 'integral') return `\\int ${f(p.target[0]!)}\\,dx`;
  return `${f(p.target[0]!)}=${f(p.target[1]!)}`;
}

/**
 * Practice: a problem with new numbers each time, an answer typed as math,
 * checked by value (any equal form is right), then the answer and the steps.
 */
export function Practice({
  s,
  lang,
  onAddToSheet,
  onMakeSheet,
  settings,
  keyboard,
  fieldRef,
  onFocusField,
  askIntegral,
  onAnswer,
}: {
  s: LearnStrings;
  lang: Lang;
  /** put this problem on the worksheet */
  onAddToSheet: (p: Problem) => void;
  /** fill the worksheet with problems like this one */
  onMakeSheet: (level: Level, topic: Topic) => void;
  settings: EvalSettings;
  keyboard: 'text' | 'none';
  /** the answer field, so the on-screen keypad can type into it */
  fieldRef: (el: MathfieldElement | null) => void;
  onFocusField: () => void;
  askIntegral: IntegralAsk;
  onAnswer: (listener: () => void) => () => void;
}) {
  const [{ level, topic }, setPref] = useState(loadPref);
  const [problem, setProblem] = useState<Problem>(() => newProblem(topic, level));
  const exam = problem.value !== undefined;
  const [input, setInput] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [steps, setSteps] = useState(false);
  const [score, setScore] = useState({ right: 0, tried: 0, counted: false, solved: false });
  const field = useRef<MathfieldElement | null>(null);
  const [added, setAdded] = useState<number | null>(null);
  const [checks, setChecks] = useState(0);

  const fresh = (t: Topic, l: Level = level) => {
    setPref({ level: l, topic: t });
    try {
      localStorage.setItem(PREF, JSON.stringify({ level: l, topic: t }));
    } catch {
      // kept for this visit
    }
    setProblem(newProblem(t, l));
    setInput('');
    setVerdict(null);
    setRevealed(false);
    setSteps(false);
    setScore((sc) => ({ ...sc, counted: false, solved: false }));
  };

  const check = () => {
    // read the field itself: its last input event can arrive after Enter
    const text = field.current ? latexToText(field.current.getValue('latex-unstyled')) : input;
    if (text !== input) setInput(text);
    const v = checkAnswer(problem, text);
    setVerdict(v);
    setChecks((n) => n + 1);
    if (v.correct === false && v.reason === 'empty') return;
    setScore((sc) => ({
      right: sc.right + (v.correct && !sc.solved && !revealed ? 1 : 0),
      tried: sc.tried + (sc.counted ? 0 : 1),
      counted: true,
      solved: sc.solved || v.correct,
    }));
  };

  const call =
    problem.topic === 'derivative'
      ? { op: 'diff', args: [problem.target[0]!, { type: 'ident', name: 'x' } as Node] }
      : problem.topic === 'integral'
        ? { op: 'integrate', args: [problem.target[0]!, { type: 'ident', name: 'x' } as Node] }
        : { op: 'solve', args: [{ type: 'rel', op: '=', left: problem.target[0]!, right: problem.target[1]! } as Node, { type: 'ident', name: 'x' } as Node] };

  return (
    <div className="practice">
      <div className="practice__choose">
        <div className="segmented" role="group" aria-label={s.level}>
          {LEVELS.map((l) => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => fresh(levelTopics(l).includes(topic) ? topic : levelTopics(l)[0]!, l)}>
              {s.levels[l]}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label={s.topic}>
          {levelTopics(level).map((t) => (
            <button key={t} type="button" aria-pressed={topic === t} onClick={() => fresh(t)}>
              {s.topics[t]}
            </button>
          ))}
        </div>
      </div>

      <section className="practice__card" aria-labelledby="practice-task">
        <h3 id="practice-task" className="practice__task">
          {s.task[problem.topic]}
          {exam && problem.points ? <span className="practice__points"> {lang === 'ko' ? `[${problem.points}점]` : `(${problem.points} points)`}</span> : null}
        </h3>
        {exam ? (
          <p className="practice__prompt" key={`p${problem.seed}`}>
            <RichText text={problem.prompt![lang]} />
          </p>
        ) : (
          <p className="practice__question" key={`q${problem.seed}`}>
            <LatexText latex={questionTex(problem)} label={problem.question} />
          </p>
        )}

        <span className="practice__label" aria-hidden="true">
          {s.yourAnswer}
        </span>
        <div className="practice__field">
          <MathInput
            key={`${problem.template}-${problem.seed}`}
            value={input}
            onChange={(v) => {
              if (v === input) return;
              setInput(v);
              setVerdict(null);
            }}
            label={`${s.yourAnswer}: ${s.task[problem.topic]}`}
            describedBy="practice-answer-hint"
            invalid={verdict?.correct === false && verdict.reason !== 'empty'}
            keyboard={keyboard}
            fieldRef={(el) => {
              field.current = el;
              fieldRef(el);
            }}
            onFocus={onFocusField}
            onEnter={check}
            onBackspaceEmpty={() => {}}
            onMoveOut={() => {}}
          />
        </div>
        <p id="practice-answer-hint" className="practice__hint">
          {s.answerHint[problem.topic]}
        </p>

        <div className="practice__actions">
          <button type="button" className="btn btn--primary" onClick={check}>
            {s.check}
          </button>
          <button type="button" className="btn" aria-expanded={steps} onClick={() => setSteps((v) => !v)}>
            {steps ? s.hideSteps : s.showSteps}
          </button>
          <button type="button" className="btn" aria-expanded={revealed} onClick={() => setRevealed(true)}>
            {s.reveal}
          </button>
          <button type="button" className="btn btn--quiet practice__next" onClick={() => fresh(topic)}>
            {s.next}
          </button>
        </div>

        <p className="practice__verdict" role="status" data-correct={verdict ? String(verdict.correct) : undefined}>
          {verdict && (
            <span key={checks} className="practice__verdict-text">
              {verdict.correct ? s.correct : s.verdict[verdict.reason]}
            </span>
          )}
        </p>

        {revealed && (
          <p className="practice__answer">
            {s.answerIs} <MathText text={problem.answer.replace(/ \+ C$/, '')} />
            {problem.topic === 'integral' && ' + C'}
          </p>
        )}
        {steps &&
          (exam ? (
            <section className="practice__solution" aria-label={s.solutionTitle}>
              <h4 className="practice__solution-title">{s.solutionTitle}</h4>
              <ol>
                {problem.solution![lang].map((line, k) => (
                  <li key={k}>
                    <RichText text={line} />
                  </li>
                ))}
              </ol>
            </section>
          ) : (
            <StepsView call={call} settings={settings} s={s} askIntegral={askIntegral} onAnswer={onAnswer} />
          ))}

        <div className="practice__sheet">
          <button
            type="button"
            className="btn btn--small btn--quiet"
            onClick={() => {
              onAddToSheet(problem);
              setAdded(problem.seed);
            }}
            disabled={added === problem.seed}
          >
            {added === problem.seed ? s.addedToSheet : s.addToSheet}
          </button>
          <button type="button" className="btn btn--small btn--quiet" onClick={() => onMakeSheet(level, topic)}>
            {s.makeSheet}
          </button>
        </div>
      </section>

      {score.tried > 0 && <p className="practice__score">{s.score(score.right, score.tried)}</p>}
    </div>
  );
}
