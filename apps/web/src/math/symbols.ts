/**
 * LaTeX commands that stand for one symbol, and the character a line stores
 * for each. The engine works with plain text, so ≈ or ∈ are kept as these
 * characters and turned back into the commands when the line is shown.
 * Symbols the engine calculates with (≤, ≥, ≠, ×, ÷, ·, ∞, π, °) are handled
 * where they always were; these are the rest.
 */
export const SYMBOL_CHARS: Record<string, string> = {
  // relations
  approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫', prec: '≺', succ: '≻',
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', perp: '⊥', parallel: '∥',
  // arrows
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒', implies: '⇒', Leftarrow: '⇐',
  Leftrightarrow: '⇔', iff: '⇔', mapsto: '↦', uparrow: '↑', downarrow: '↓', longrightarrow: '⟶', longleftarrow: '⟵',
  // operators
  pm: '±', mp: '∓', star: '⋆', circ: '∘', bullet: '∙', oplus: '⊕', ominus: '⊖', otimes: '⊗', odot: '⊙',
  cup: '∪', cap: '∩', setminus: '∖', wedge: '∧', land: '∧', vee: '∨', lor: '∨', neg: '¬', lnot: '¬',
  // calculus, logic, sets and the rest
  partial: '∂', nabla: '∇', forall: '∀', exists: '∃', nexists: '∄', emptyset: '∅', varnothing: '∅',
  angle: '∠', measuredangle: '∡', triangle: '△', square: '□', top: '⊤', bot: '⊥',
  hbar: 'ℏ', ell: 'ℓ', aleph: 'ℵ', Re: 'ℜ', Im: 'ℑ', wp: '℘',
  ldots: '…', cdots: '⋯', vdots: '⋮', ddots: '⋱', therefore: '∴', because: '∵',
  iint: '∬', iiint: '∭', oint: '∮',
};

/** \mathbb{R} and the like */
export const BLACKBOARD: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ' };

/** the command to write for a stored character: ≈ → \approx, ℝ → \mathbb{R} */
export const CHAR_LATEX: Record<string, string> = {
  ...Object.fromEntries(Object.entries(BLACKBOARD).map(([k, ch]) => [ch, `\\mathbb{${k}}`])),
  // the first name listed for a character is the one shown
  ...Object.fromEntries(
    Object.entries(SYMBOL_CHARS)
      .reverse()
      .map(([name, ch]) => [ch, `\\${name}`]),
  ),
};

/** accents over one letter or expression: \vec{v} is stored as vec(v) */
export const ACCENTS = ['vec', 'hat', 'bar', 'overline', 'underline', 'dot', 'ddot', 'tilde', 'widehat', 'overrightarrow'];

/** one of the stored symbol characters (for splitting a line around them) */
export const SYMBOL_CHAR_RE = new RegExp(`([${[...new Set(Object.keys(CHAR_LATEX))].join('').replace(/[\]\\^-]/g, '\\$&')}])`, 'u');
