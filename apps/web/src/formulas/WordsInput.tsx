import { fromWords } from '@math/input';
import { useMemo, useState } from 'react';
import { MathText } from '../components/MathText';
import type { FormulaStrings } from './strings';

/**
 * Math typed as words, in English or Korean: "derivative of sin x squared",
 * "1부터 2까지 x제곱 적분". What it was read as is always shown, typeset,
 * before it becomes a line.
 */
export function WordsInput({ s, onAdd }: { s: FormulaStrings; onAdd: (line: string) => void }) {
  const [text, setText] = useState('');
  const read = useMemo(() => (text.trim() ? fromWords(text) : null), [text]);
  const add = () => {
    if (!read?.ok) return;
    onAdd(read.text);
    setText('');
  };
  return (
    <div className="words">
      <label className="words__label" htmlFor="words-input">
        {s.words}
      </label>
      <div className="words__row">
        <input
          id="words-input"
          className="input"
          value={text}
          placeholder={s.wordsPlaceholder}
          autoComplete="off"
          aria-describedby="words-preview"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter while a Korean syllable is still being composed finishes it, nothing more
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn--small" disabled={!read?.ok} onClick={add}>
          {s.wordsAdd}
        </button>
      </div>
      <p id="words-preview" className="words__preview" aria-live="polite">
        {read &&
          (read.ok ? (
            <>
              <span className="words__reads">{s.wordsReads}</span> <MathText text={read.text} />
            </>
          ) : (
            s.wordsUnreadable
          ))}
      </p>
    </div>
  );
}
