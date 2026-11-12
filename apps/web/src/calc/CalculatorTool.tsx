import { Workspace, type EvalSettings, type Result, type SymbolicResolver } from '@math/engine';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Keypad, type KeyAction } from '../components/Keypad';
import { MathInput } from '../components/MathInput';
import { MathText } from '../components/MathText';
import { NumberText } from '../components/ResultView';
import type { Strings } from '../i18n';
import { textToLatex } from '../math/latex';
import type { MathfieldElement } from '../math/mathlive';
import { newId } from '../storage';
import { toFraction } from './fraction';
import type { CalcStrings } from './strings';
import { useNumberForm } from '../numberForm';

/** one finished calculation on the tape */
export interface TapeEntry {
  id: string;
  source: string;
  /** the decimal (or symbolic) answer */
  text: string;
  /** the exact form when there is one: 1/3, sqrt(2)/2 */
  exact?: string;
}
type Format = 'exact' | 'decimal';

const TAPE_KEY = 'calculator.tape.v1';
const loadTape = (): TapeEntry[] => {
  try {
    const v = JSON.parse(localStorage.getItem(TAPE_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((e) => e && typeof e.source === 'string' && typeof e.text === 'string').slice(-200) : [];
  } catch {
    return [];
  }
};
const store = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // kept for this visit only
  }
};

/** what a result shows, in the chosen format; null when it isn't an answer */
function answer(r: Result | undefined, t: Strings): { text: string; exact?: string } | null {
  if (!r) return null;
  if (r.status === 'value') {
    if (r.value.kind === 'num' && r.value.z.im === 0) {
      const frac = toFraction(r.value.z.re);
      return { text: r.text, exact: r.exact ?? frac ?? undefined };
    }
    return { text: r.text, exact: r.exact };
  }
  if (r.status === 'symbolic' || r.status === 'solved') return { text: r.text };
  if (r.status === 'relation') return { text: r.holds ? t.yes : t.no };
  return null;
}
const shown = (a: { text: string; exact?: string }, f: Format) => (f === 'exact' && a.exact ? a.exact : a.text);

/**
 * A scientific calculator: one line at a time, a large answer, a tape of
 * earlier results, `ans` for the last one. Its own document, apart from the
 * graph's lines; any calculation can be sent to the graph.
 */
export function CalculatorTool({
  s,
  t,
  settings,
  resolver,
  onAnswer,
  onSendToGraph,
  onNotice,
  onFormat,
}: {
  s: CalcStrings;
  t: Strings;
  settings: EvalSettings;
  resolver: SymbolicResolver;
  onAnswer: (listener: () => void) => () => void;
  onSendToGraph: (source: string) => void;
  onNotice: (text: string) => void;
  /** the app's number setting: exact or decimal */
  onFormat: (f: Format) => void;
}) {
  const [tape, setTape] = useState<TapeEntry[]>(loadTape);
  const [input, setInput] = useState('');
  const format: Format = useNumberForm();
  const setFormat = onFormat;
  const field = useRef<MathfieldElement | null>(null);
  const tapeRef = useRef<HTMLOListElement>(null);
  // the symbolic engine answers later; show it when it does
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onAnswer(rerender), [onAnswer]);

  useEffect(() => store(TAPE_KEY, tape), [tape]);
  useEffect(() => {
    tapeRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }, [tape.length]);

  const last = tape[tape.length - 1];
  const ws = useMemo(() => new Workspace(settings, resolver), [settings, resolver]);
  // ans is the last answer, exact when it can be
  ws.set('ans', last ? `ans = ${last.exact && /^-?\d+\/\d+$/.test(last.exact) ? `(${last.exact})` : last.text}` : '');
  ws.set('cur', input);
  const result = input.trim() ? ws.result('cur') : undefined;
  const live = answer(result, t);

  const commit = () => {
    if (!live || !input.trim()) return;
    setTape((tp) => [...tp, { id: newId(), source: input, text: live.text, ...(live.exact ? { exact: live.exact } : {}) }]);
    setInput('');
  };

  const copyLatex = async (text: string) => {
    try {
      await navigator.clipboard.writeText(textToLatex(text));
      onNotice(s.copied);
    } catch {
      onNotice(s.copyFailed);
    }
  };

  const onKey = (k: KeyAction) => {
    const mf = field.current;
    if (!mf) return;
    if (!mf.hasFocus()) mf.focus();
    if ('type' in k) mf.executeCommand(['typedText', k.type]);
    else if ('latex' in k) mf.executeCommand(['insert', k.latex, { selectionMode: 'placeholder', format: 'latex' }]);
    else if (k.action === 'backspace') mf.executeCommand('deleteBackward');
    else if (k.action === 'left') mf.executeCommand('moveToPreviousChar');
    else if (k.action === 'right') mf.executeCommand('moveToNextChar');
    else commit();
  };

  const display = live ? shown(live, format) : null;
  const target = input.trim() ? input : last?.source;

  return (
    <div className="calc">
      <section className="calc__tape" aria-label={s.tape}>
        {tape.length === 0 ? (
          <p className="calc__empty">{s.emptyTape}</p>
        ) : (
          <ol ref={tapeRef}>
            {tape.map((e) => (
              <li key={e.id}>
                <button type="button" className="calc__entry" aria-label={s.reuse(e.source)} onClick={() => setInput(e.source)}>
                  <span className="calc__src">
                    <MathText text={e.source} />
                  </span>
                  <span className="calc__ans">
                    {format === 'exact' && e.exact ? <MathText text={e.exact} block /> : <NumberText text={e.text} />}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="calc__display">
        <MathInput
          value={input}
          onChange={setInput}
          label={s.input}
          // MathLive reads a placeholder as math; \text keeps its words and spaces
          placeholder={`\\text{${s.placeholder}}`}
          invalid={result?.status === 'error'}
          keyboard="text"
          fieldRef={(el) => (field.current = el)}
          onFocus={() => {}}
          onEnter={commit}
          onBackspaceEmpty={() => {}}
          onMoveOut={() => {}}
        />
        <output className="calc__result" aria-live="polite">
          {result?.status === 'pending' ? (
            <span className="calc__note">{s.waiting}</span>
          ) : result?.status === 'error' ? (
            <span className="calc__note calc__note--error">{result.message}</span>
          ) : display !== null ? (
            <span className="calc__big">
              {format === 'decimal' && live?.exact && '≈ '}
              {format === 'exact' && live?.exact ? <MathText text={display} block /> : <NumberText text={display} />}
            </span>
          ) : last && !input.trim() ? (
            <span className="calc__big calc__big--quiet">
              {format === 'exact' && last.exact ? <MathText text={last.exact} block /> : <NumberText text={last.text} />}
            </span>
          ) : null}
        </output>
        <div className="calc__bar">
          <div className="segmented" role="group" aria-label={s.format}>
            {(['exact', 'decimal'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>
                {s[f]}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--small" aria-label={s.ansLabel} disabled={!last} onPointerDown={(e) => e.preventDefault()} onClick={() => onKey({ type: 'ans' })}>
            {s.ans}
          </button>
          <span className="calc__spacer" />
          <button type="button" className="btn btn--small btn--quiet" disabled={!target} onClick={() => target && void copyLatex(target)}>
            {s.copyLatex}
          </button>
          <button type="button" className="btn btn--small" disabled={!target} onClick={() => target && onSendToGraph(target)}>
            {s.sendToGraph}
          </button>
          {tape.length > 0 && (
            <button type="button" className="btn btn--small btn--quiet" onClick={() => setTape([])}>
              {s.clear}
            </button>
          )}
        </div>
      </section>

      <div className="calc__keypad">
        <Keypad t={t} onKey={onKey} />
      </div>
    </div>
  );
}
