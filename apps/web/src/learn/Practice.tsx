import type { EvalSettings, Node } from '@math/engine';
import { printNode } from '@math/engine';
import { checkAnswer, nextProblem, type Problem, type Topic, type Verdict } from '@math/steps';
import { useRef, useState } from 'react';
import { latexToText } from '../math/latex';
import { MathInput } from '../components/MathInput';
import { LatexText, MathText } from '../components/MathText';
import { textToLatex } from '../math/latex';
import type { MathfieldElement } from '../math/mathlive';
import { StepsView, type IntegralAsk } from './StepsView';
import type { LearnStrings } from './strings';

const TOPICS: Topic[] = ['derivative', 'equation', 'integral'];

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
  settings,
  keyboard,
  fieldRef,
  onFocusField,
  askIntegral,
  onAnswer,
}: {
  s: LearnStrings;
  settings: EvalSettings;
  keyboard: 'text' | 'none';
  /** the answer field, so the on-screen keypad can type into it */
  fieldRef: (el: MathfieldElement | null) => void;
  onFocusField: () => void;
  askIntegral: IntegralAsk;
  onAnswer: (listener: () => void) => () => void;
}) {
  const [topic, setTopic] = useState<Topic>('derivative');
  const [problem, setProblem] = useState<Problem>(() => nextProblem('derivative'));
  const [input, setInput] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [steps, setSteps] = useState(false);
  const [score, setScore] = useState({ right: 0, tried: 0, counted: false, solved: false });
  const field = useRef<MathfieldElement | null>(null);

  const fresh = (t: Topic) => {
    setTopic(t);
    setProblem(nextProblem(t));
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
      <div className="segmented practice__topics" role="group" aria-label={s.practice}>
        {TOPICS.map((t) => (
          <button key={t} type="button" aria-pressed={topic === t} onClick={() => fresh(t)}>
            {s.topics[t]}
          </button>
        ))}
      </div>

      <section className="practice__card" aria-labelledby="practice-task">
        <h3 id="practice-task" className="practice__task">
          {s.task[problem.topic]}
        </h3>
        <p className="practice__question">
          <LatexText latex={questionTex(problem)} label={problem.question} />
        </p>

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
          {verdict && (verdict.correct ? s.correct : s.verdict[verdict.reason])}
        </p>

        {revealed && (
          <p className="practice__answer">
            {s.answerIs} <MathText text={problem.answer.replace(/ \+ C$/, '')} />
            {problem.topic === 'integral' && ' + C'}
          </p>
        )}
        {steps && <StepsView call={call} settings={settings} s={s} askIntegral={askIntegral} onAnswer={onAnswer} />}
      </section>

      {score.tried > 0 && <p className="practice__score">{s.score(score.right, score.tried)}</p>}
    </div>
  );
}
