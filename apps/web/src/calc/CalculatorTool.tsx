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
import { exactNumber, toFraction } from './fraction';
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
  /** a formula (x = ±√2, a derivative), set as math rather than as a number */
  math?: boolean;
  /** a definition (let f(x) = …, a = 2): kept, so later lines can use it */
  def?: string;
  /** words, not a number ("function of x") */
  note?: boolean;
}
type Format = 'exact' | 'decimal';

/** the name a line defines: let f(x) = …, const g = …, a = 2 (not ans) */
function defName(source: string): string | null {
  const m = /^\s*(?:let\s+|const\s+)?([\p{L}][\p{L}\p{N}_]*)\s*(?:\([^)]*\))?\s*=(?!=)/u.exec(source);
  return m && m[1] !== 'ans' && m[1] !== 'y' && m[1] !== 'x' ? m[1]! : null;
}

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
function answer(r: Result | undefined, t: Strings): { text: string; exact?: string; math?: boolean; note?: boolean } | null {
  if (!r) return null;
  if (r.status === 'value') {
    if (r.value.kind === 'num' && r.value.z.im === 0) {
      const frac = exactNumber(r.value.z.re);
      return { text: r.text, exact: r.exact ?? frac ?? undefined };
    }
    return { text: r.text, exact: r.exact };
  }
  if (r.status === 'symbolic' || r.status === 'solved') return { text: r.text, math: true };
  if (r.status === 'function') return { text: t.functionOf(r.params.join(', ')), note: true };
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
  const defIds = useRef(new Set<string>());
  // ans is the last answer, exact when it can be
  ws.set('ans', last ? `ans = ${last.exact ? `(${last.exact})` : last.text}` : '');
  // definitions on the tape stay, like lines in the list: the latest one for each name
  const curName = defName(input);
  const defs = new Map<string, TapeEntry>();
  for (const e of tape) if (e.def && e.def !== curName) defs.set(e.def, e);
  const keep = new Set([...defs.values()].map((e) => `def:${e.id}`));
  for (const id of defIds.current) if (!keep.has(id)) ws.remove(id);
  for (const e of defs.values()) if (ws.source(`def:${e.id}`) !== e.source) ws.set(`def:${e.id}`, e.source);
  defIds.current = keep;
  ws.set('cur', input);
  const result = input.trim() ? ws.result('cur') : undefined;
  const live = answer(result, t);

  const commit = () => {
    if (!live || !input.trim()) return;
    setTape((tp) => [...tp, { id: newId(), source: input, text: live.text, ...(live.exact ? { exact: live.exact } : {}), ...(live.math ? { math: true } : {}), ...(live.note ? { note: true } : {}), ...(curName && (result?.status === 'function' || result?.status === 'value') ? { def: curName } : {}) }]);
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
                    {e.note ? <span className="calc__note">{e.text}</span> : format === 'exact' && e.exact ? <MathText text={e.exact} block /> : e.math ? <MathText text={e.text} block /> : <NumberText text={e.text} />}
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
              {live?.note ? <span className="calc__note">{display}</span> : (format === 'exact' && live?.exact) || live?.math ? <MathText text={display} block /> : <NumberText text={display} />}
            </span>
          ) : last && !input.trim() ? (
            <span className="calc__big calc__big--quiet">
              {format === 'exact' && last.exact ? <MathText text={last.exact} block /> : last.math ? <MathText text={last.text} block /> : <NumberText text={last.text} />}
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
