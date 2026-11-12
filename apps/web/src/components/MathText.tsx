import { useMemo } from 'react';
import { textToLatex } from '../math/latex';
import { useMathLive } from '../math/mathlive';

/**
 * A formula from the engine, typeset the way it is written on paper
 * (x^2/3 as a fraction with a raised 2, sqrt(x) under a radical, pi as π).
 * Screen readers get the plain text.
 */
export function MathText({ text, className, block }: { text: string; className?: string; /** full-size fractions, for a large answer */ block?: boolean }) {
  const ml = useMathLive();
  const html = useMemo(() => ml?.texMarkup(`${block ? '\\displaystyle ' : ''}${textToLatex(text, { display: true })}`) ?? null, [ml, text, block]);
  return (
    <span className={`tex${className ? ` ${className}` : ''}`} role="math" aria-label={text}>
      {html === null ? <span aria-hidden="true">{text}</span> : <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />}
    </span>
  );
}

/** A line's text typeset, for history and definitions. */
export function LatexText({ latex, label }: { latex: string; label: string }) {
  const ml = useMathLive();
  const html = useMemo(() => ml?.texMarkup(latex) ?? null, [ml, latex]);
  return (
    <span className="tex" role="math" aria-label={label}>
      {html === null ? <span aria-hidden="true">{label}</span> : <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />}
    </span>
  );
}
