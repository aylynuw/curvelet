import { useState, type KeyboardEvent } from 'react';
import type { Strings } from '../i18n';

/**
 * What a key does in the focused line: type characters (as if from the
 * keyboard, so ^ raises and / starts a fraction), insert a LaTeX template
 * with a place for the cursor, or an editing action.
 */
export type KeyAction =
  | { type: string }
  | { latex: string }
  | { action: 'left' | 'right' | 'backspace' | 'enter' | 'row' };

interface Key {
  label: string;
  /** spoken name when the label is a symbol */
  aria?: (t: Strings) => string;
  do: KeyAction;
  kind?: 'fn' | 'op' | 'edit' | 'enter';
}

const fn = (name: string, label = name): Key => ({ label, do: { latex: `\\operatorname{${name}}\\left(#?\\right)` }, kind: 'fn' });
const op = (label: string, type = label): Key => ({ label, do: { type }, kind: 'op' });
const tex = (label: string, latex: string, kind: Key['kind'] = 'op'): Key => ({ label, do: { latex }, kind });
const ch = (c: string): Key => ({ label: c, do: { type: c } });
const greek = (label: string, name: string): Key => ({ label, do: { latex: `\\${name}` } });

export type KeypadTab = 'num' | 'abc' | 'func' | 'calc' | 'sym';
export const KEYPAD_TABS: KeypadTab[] = ['num', 'abc', 'func', 'calc', 'sym'];
const TAB_LABEL: Record<KeypadTab, string> = { num: '123', abc: 'abc', func: 'f(x)', calc: '∫ d/dx', sym: '≤ π' };

const KEYS: Record<KeypadTab, Key[]> = {
  num: [
    fn('sin'), fn('cos'), fn('tan'), fn('ln'), fn('log'), tex('√', '\\sqrt{#?}', 'fn'),
    op('('), op(')'), op('['), op(']'), op(','), { label: 'xⁿ', aria: (t) => t.power, do: { type: '^' }, kind: 'op' },
    ch('7'), ch('8'), ch('9'), op('÷', '/'), tex('π', '\\pi'), op('i'),
    ch('4'), ch('5'), ch('6'), tex('×', '\\cdot'), op('e'), op('!'),
    ch('1'), ch('2'), ch('3'), op('−', '-'), tex('let', '\\operatorname{let}\\:'), op('='),
    ch('0'), ch('.'), ch('x'), op('+'), op('<'), op('>'),
  ],
  abc: [
    ch('x'), ch('y'), ch('z'), ch('t'), ch('a'), ch('b'),
    ch('c'), ch('d'), ch('k'), ch('m'), ch('n'), ch('r'),
    ch('f'), ch('g'), ch('h'), ch('p'), ch('q'), ch('s'),
    greek('α', 'alpha'), greek('β', 'beta'), greek('θ', 'theta'), greek('λ', 'lambda'), greek('μ', 'mu'), greek('σ', 'sigma'),
    greek('φ', 'phi'), greek('ω', 'omega'), greek('Δ', 'Delta'), greek('ε', 'epsilon'),
    { label: 'x′', aria: (t) => t.keyPrime, do: { type: "'" }, kind: 'op' },
    { label: 'x₁', aria: (t) => t.keySubscript, do: { type: '_' }, kind: 'op' },
  ],
  func: [
    fn('sin'), fn('cos'), fn('tan'), fn('sec'), fn('csc'), fn('cot'),
    fn('arcsin', 'sin⁻¹'), fn('arccos', 'cos⁻¹'), fn('arctan', 'tan⁻¹'), fn('sinh'), fn('cosh'), fn('tanh'),
    fn('ln'), fn('log'), tex('logₐ', '\\log_{#?}\\left(#?\\right)', 'fn'), fn('exp'), tex('√', '\\sqrt{#?}', 'fn'), tex('ⁿ√', '\\sqrt[#?]{#?}', 'fn'),
    tex('|x|', '\\left|#?\\right|', 'fn'), fn('floor'), fn('ceil'), fn('round'), fn('abs'), op('n!', '!'),
    tex('nCr', '\\binom{#?}{#?}', 'fn'), fn('nPr'), fn('gcd'), fn('lcm'), fn('min'), fn('max'),
  ],
  calc: [
    { label: '∫ₐᵇ', aria: (t) => t.keyDefinite, do: { latex: '\\int_{#?}^{#?}#?\\,\\mathrm{d}x' }, kind: 'fn' },
    { label: '∫', aria: (t) => t.keyIntegral, do: { latex: '\\int #?\\,\\mathrm{d}x' }, kind: 'fn' },
    { label: 'd/dx', aria: (t) => t.keyDerivative, do: { latex: '\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(#?\\right)' }, kind: 'fn' },
    { label: 'd²/dx²', aria: (t) => t.keySecond, do: { latex: '\\frac{\\mathrm{d}^{2}}{\\mathrm{d}x^{2}}\\left(#?\\right)' }, kind: 'fn' },
    { label: 'lim', aria: (t) => t.keyLimit, do: { latex: '\\lim_{x\\to #?}\\left(#?\\right)' }, kind: 'fn' },
    { label: 'Σ', aria: (t) => t.keySum, do: { latex: '\\sum_{n=#?}^{#?}\\left(#?\\right)' }, kind: 'fn' },
    { label: 'f′(x)', aria: (t) => t.keyPrime, do: { type: "'" }, kind: 'op' },
    { label: '[2×2]', aria: (t) => t.keyMatrix(2), do: { latex: '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}' }, kind: 'fn' },
    { label: '[3×3]', aria: (t) => t.keyMatrix(3), do: { latex: '\\begin{pmatrix}#?&#?&#?\\\\#?&#?&#?\\\\#?&#?&#?\\end{pmatrix}' }, kind: 'fn' },
    { label: '{ ⋯', aria: (t) => t.keyPiecewise, do: { latex: '\\begin{cases}#? & #?\\\\#? & #?\\end{cases}' }, kind: 'fn' },
    { label: '+ ⋯', aria: (t) => t.keyAddRow, do: { action: 'row' }, kind: 'op' },
    op('<'), op('>'), tex('≤', '\\le '), tex('≥', '\\ge '),
    fn('det'), fn('inv'), fn('transpose', 'Aᵀ'),
    fn('solve'), fn('factor'), fn('expand'), fn('simplify'), fn('taylor'), tex('∞', '\\infty'),
  ],
  sym: [
    op('<'), op('>'), tex('≤', '\\le '), tex('≥', '\\ge '), op('='), tex('°', '^{\\circ}'),
    tex('π', '\\pi'), op('e'), op('i'), tex('∞', '\\infty'), tex('θ', '\\theta'), tex('τ', '\\tau'),
    op('('), op(')'), op('['), op(']'), { label: '{ }', aria: (t) => t.keyRestrict, do: { latex: '\\lbrace #?\\rbrace ' }, kind: 'op' }, op(','),
    { label: '{ ⋯', aria: (t) => t.keyPiecewise, do: { latex: '\\begin{cases}#? & #?\\\\#? & #?\\end{cases}' }, kind: 'fn' },
    { label: '+ ⋯', aria: (t) => t.keyAddRow, do: { action: 'row' }, kind: 'op' }, op(':'), op(';'), tex('and', '\\operatorname{and}\\:'), tex('if', '\\operatorname{if}\\:'),
    { label: '(x, y)', aria: (t) => t.keyPoint, do: { latex: '\\left(#?,#?\\right)' }, kind: 'fn' },
    tex('|x|', '\\left|#?\\right|'), tex('×', '\\cdot'), op('÷', '/'), { label: 'xⁿ', aria: (t) => t.power, do: { type: '^' }, kind: 'op' }, op('%'),
  ],
};

const EDIT: Key[] = [
  { label: '←', aria: (t) => t.moveLeft, do: { action: 'left' }, kind: 'edit' },
  { label: '→', aria: (t) => t.moveRight, do: { action: 'right' }, kind: 'edit' },
  { label: '⌫', aria: (t) => t.backspace, do: { action: 'backspace' }, kind: 'edit' },
  { label: '', aria: (t) => t.enter, do: { action: 'enter' }, kind: 'enter' },
];

const TAB_KEY = 'calculator.keypad-tab.v1';
const loadTab = (): KeypadTab => {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return KEYPAD_TABS.includes(v as KeypadTab) ? (v as KeypadTab) : 'num';
  } catch {
    return 'num';
  }
};

export function Keypad({ t, onKey }: { t: Strings; onKey: (k: KeyAction) => void }) {
  const [tab, setTab] = useState<KeypadTab>(loadTab);
  const choose = (next: KeypadTab) => {
    setTab(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // remembered for this visit only
    }
  };
  // arrow keys move between tabs, as in any tab strip
  const onTabsKey = (e: KeyboardEvent) => {
    const k = KEYPAD_TABS.indexOf(tab);
    const to = e.key === 'ArrowRight' ? k + 1 : e.key === 'ArrowLeft' ? k - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const next = KEYPAD_TABS[(to + KEYPAD_TABS.length) % KEYPAD_TABS.length]!;
    choose(next);
    (e.currentTarget.querySelector(`[data-tab="${next}"]`) as HTMLElement | null)?.focus();
  };
  const button = (k: Key, i: number) => (
    <button
      key={i}
      type="button"
      className={`key${k.kind ? ` key--${k.kind}` : ''}`}
      aria-label={k.aria?.(t)}
      title={k.aria?.(t)}
      // keep focus in the line being edited
      onPointerDown={(e) => e.preventDefault()}
      onClick={() => onKey(k.do)}
    >
      {k.kind === 'enter' ? t.enter : k.label}
    </button>
  );
  return (
    <div className="keypad-wrap">
      <div className="keypad__tabs" role="tablist" aria-label={t.keypad} onKeyDown={onTabsKey}>
        {KEYPAD_TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            data-tab={id}
            id={`keypad-tab-${id}`}
            aria-controls="keypad-panel"
            aria-selected={tab === id}
            aria-label={t.keypadTab[id]}
            tabIndex={tab === id ? 0 : -1}
            className="keypad__tab"
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => choose(id)}
          >
            {TAB_LABEL[id]}
          </button>
        ))}
      </div>
      <div className="keypad" id="keypad-panel" role="tabpanel" aria-labelledby={`keypad-tab-${tab}`}>
        {KEYS[tab].map(button)}
      </div>
      <div className="keypad keypad--edit">{EDIT.map(button)}</div>
    </div>
  );
}
