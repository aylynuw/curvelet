import { useEffect, useLayoutEffect, useRef } from 'react';
import { KNOWN_NAMES, latexToText, textToLatex } from '../math/latex';
import { useMathLive, type MathfieldElement } from '../math/mathlive';

export type MoveOut = 'up' | 'down';

/**
 * One worksheet line as typeset math. The line itself stays plain text
 * (`value`/`onChange`); the field shows and edits it as LaTeX.
 * ^ raises, _ lowers, / starts a fraction, brackets close themselves,
 * and → or Tab leaves an exponent or a denominator.
 */
export function MathInput({
  value,
  onChange,
  label,
  describedBy,
  invalid,
  placeholder,
  keyboard,
  fieldRef,
  onFocus,
  onEnter,
  onBackspaceEmpty,
  onMoveOut,
  onMoveLine,
}: {
  value: string;
  onChange: (text: string) => void;
  label: string;
  describedBy?: string;
  invalid?: boolean;
  placeholder?: string;
  /** 'none' keeps the phone's own keyboard away while the on-screen keypad is open */
  keyboard: 'text' | 'none';
  fieldRef: (el: MathfieldElement | null) => void;
  onFocus: () => void;
  onEnter: () => void;
  onBackspaceEmpty: () => void;
  onMoveOut: (dir: MoveOut) => void;
  /** Alt+↑ / Alt+↓: move the whole line up or down */
  onMoveLine?: (dir: -1 | 1) => void;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const fieldRef_ = useRef<MathfieldElement | null>(null);
  /** the text the field last reported, so its own edits don't reset it */
  const shown = useRef<string | null>(null);
  // handlers change every render; the listeners read the latest
  const live = useRef({ onChange, onFocus, onEnter, onBackspaceEmpty, onMoveOut, onMoveLine });
  live.current = { onChange, onFocus, onEnter, onBackspaceEmpty, onMoveOut, onMoveLine };

  const ml = useMathLive();
  useLayoutEffect(() => {
    if (!ml) return;
    const { MathfieldElement, SHORTCUTS, WORD_SHORTCUTS } = ml;
    const host = hostRef.current!;
    const mf = new MathfieldElement();
    mf.className = 'mathfield';
    mf.smartFence = true;
    mf.smartSuperscript = true;
    mf.mathModeSpace = '\\:';
    mf.popoverPolicy = 'off';
    mf.environmentPopoverPolicy = 'off';
    mf.mathVirtualKeyboardPolicy = 'manual';
    mf.inlineShortcutTimeout = 0;
    mf.letterShapeStyle = 'tex';
    host.append(mf);
    // options that need the field to be connected
    mf.inlineShortcuts = SHORTCUTS;
    mf.menuItems = [];
    fieldRef_.current = mf;
    fieldRef(mf);

    const onInput = () => {
      const text = latexToText(mf.getValue('latex-unstyled'));
      shown.current = text;
      live.current.onChange(text);
    };
    // x_1 + 2: a subscript holds a name's letters and digits; anything else leaves it
    let inSubscript = false;
    // the letters typed in a row, for int and lim (see WORD_SHORTCUTS)
    let word = '';
    let pending: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const convert = () => {
      clearTimeout(timer);
      const w = pending;
      pending = null;
      word = '';
      if (!w || !mf.hasFocus()) return;
      for (let k = 0; k < w.length; k++) mf.executeCommand('deleteBackward');
      mf.executeCommand(['insert', WORD_SHORTCUTS[w]!, { selectionMode: 'placeholder', format: 'latex' }]);
    };
    const onKey = (e: KeyboardEvent) => {
      // typing a LaTeX command after \ (\int, \frac, \alpha): MathLive's own; Enter, Tab or space finish it
      if (mf.mode === 'latex') {
        word = '';
        pending = null;
        clearTimeout(timer);
        return;
      }
      const letter = /^[a-zA-Z]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (pending) {
        const continues = letter && KNOWN_NAMES.some((n) => n.length > pending!.length && n.startsWith(word + e.key));
        if (!continues) {
          const space = e.key === ' ';
          convert();
          // a space only asked for the symbol
          if (space) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }
      if (letter) {
        word += e.key;
        clearTimeout(timer);
        pending = WORD_SHORTCUTS[word] ? word : null;
        if (pending) timer = setTimeout(convert, 700);
      } else if (!['Shift', 'Alt', 'Meta', 'Control', 'CapsLock'].includes(e.key)) {
        word = '';
      }
      if (e.key === '_') inSubscript = true;
      else if (inSubscript && !/^[\p{L}\p{N}]$/u.test(e.key) && !['Shift', 'Backspace', 'Alt', 'Meta', 'Control'].includes(e.key)) {
        inSubscript = false;
        if (e.key.length === 1) mf.executeCommand('moveAfterParent');
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && live.current.onMoveLine) {
        e.preventDefault();
        e.stopPropagation();
        live.current.onMoveLine(e.key === 'ArrowUp' ? -1 : 1);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        live.current.onEnter();
      } else if (e.key === 'Backspace' && mf.value === '') {
        e.preventDefault();
        live.current.onBackspaceEmpty();
      }
    };
    const onMove = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: string }>).detail.direction;
      if (dir === 'upward' || dir === 'downward') {
        e.preventDefault();
        live.current.onMoveOut(dir === 'upward' ? 'up' : 'down');
      }
    };
    const onFocusIn = () => {
      inSubscript = false;
      live.current.onFocus();
    };
    mf.addEventListener('input', onInput);
    mf.addEventListener('keydown', onKey, { capture: true });
    mf.addEventListener('move-out', onMove);
    mf.addEventListener('focus', onFocusIn);
    return () => {
      clearTimeout(timer);
      mf.removeEventListener('input', onInput);
      mf.removeEventListener('keydown', onKey, { capture: true });
      mf.removeEventListener('move-out', onMove);
      mf.removeEventListener('focus', onFocusIn);
      mf.remove();
      fieldRef_.current = null;
      fieldRef(null);
      shown.current = null;
    };
    // the field is made once MathLive is here; its props are applied below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ml]);

  // the line changed from outside (a slider, a dragged point, an example): show it
  useLayoutEffect(() => {
    const mf = fieldRef_.current;
    if (!mf || shown.current === value) return;
    shown.current = value;
    mf.setValue(textToLatex(value), { silenceNotifications: true });
  }, [value, ml]);

  useEffect(() => {
    const mf = fieldRef_.current;
    if (!mf) return;
    mf.setAttribute('aria-label', label);
    if (describedBy) mf.setAttribute('aria-describedby', describedBy);
    if (invalid) mf.setAttribute('aria-invalid', 'true');
    else mf.removeAttribute('aria-invalid');
    mf.placeholder = placeholder ?? '';
    // the hidden textarea MathLive types through
    const area = mf.shadowRoot?.querySelector('textarea');
    if (area) area.inputMode = keyboard;
  }, [label, describedBy, invalid, placeholder, keyboard, ml]);

  return (
    <span className="mathinput" ref={hostRef}>
      {!ml && (
        // a plain box for the moment before the math editor loads
        <input
          className="mathinput__plain"
          value={value}
          aria-label={label}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onFocus={() => live.current.onFocus()}
          onChange={(e) => live.current.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              live.current.onEnter();
            }
          }}
        />
      )}
    </span>
  );
}
