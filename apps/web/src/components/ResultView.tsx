import { formatComplex, formatReal, formatValue, polygonArea, type Complex, type Result, type Shape, type Value } from '@math/engine';
import type { ReactNode } from 'react';
import type { Strings } from '../i18n';
import { MathText } from './MathText';
import { exactNumber } from '../calc/fraction';
import { fractionsIn, useNumberForm, type NumberForm } from '../numberForm';

/** A figure in words, in the interface language: Triangle, area 6 / 삼각형, 넓이 6 */
function shapeText(s: Shape, t: Strings): string {
  const n = (x: number) => formatReal(x, 6).replace('-', '−');
  const at = (p: { x: number; y: number }) => `(${n(p.x)}, ${n(p.y)})`;
  switch (s.type) {
    case 'segment':
      return t.shapeText.segment(n(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)));
    case 'ray':
      return t.shapeText.ray(at(s.a));
    case 'line': {
      const dx = s.b.x - s.a.x;
      const dy = s.b.y - s.a.y;
      if (Math.abs(dx) < 1e-12) return t.shapeText.line(`x = ${n(s.a.x)}`);
      const m = dy / dx;
      const c = s.a.y - m * s.a.x;
      const slope = Math.abs(m) < 1e-12 ? '' : `${m === 1 ? '' : m === -1 ? '−' : n(m)}x`;
      const constant = Math.abs(c) < 1e-12 ? (slope ? '' : '0') : `${slope ? (c < 0 ? ' − ' : ' + ') : c < 0 ? '−' : ''}${n(Math.abs(c))}`;
      return t.shapeText.line(`y = ${slope}${constant}`);
    }
    case 'circle':
      return t.shapeText.circle(at(s.c), n(s.r));
    case 'polygon':
      return t.shapeText.polygon(s.pts.length, n(polygonArea(s.pts)));
    case 'path':
      return t.shapeText.path(Math.round((s.controls.length - 1) / 3) + 1, s.closed);
  }
}

/** 2.43290200818e+18 → 2.43290200818 × 10¹⁸ (as markup) */
export function NumberText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /(\d+(?:\.\d+)?)e([+-]\d+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    const exponent = String(Number(m[2]));
    parts.push(
      <span key={m.index}>
        {m[1]}
        {' × 10'}
        <sup>{exponent}</sup>
      </span>,
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function MatrixView({ value }: { value: Extract<Value, { kind: 'matrix' }> }) {
  return (
    <>
      <span className="matrix" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${value.cols}, auto)` }}>
        {value.data.map((z: Complex, k: number) => (
          <span key={k} className="matrix__cell">
            <NumberText text={formatComplex(z)} />
          </span>
        ))}
      </span>
      <span className="visually-hidden">{`${value.rows} × ${value.cols}: ${formatValue(value)}`}</span>
    </>
  );
}

export function ResultView(props: Parameters<typeof ResultViewInner>[0]) {
  return <ResultViewInner {...props} form={useNumberForm()} />;
}

function ResultViewInner({
  result,
  t,
  pendingNote,
  onDefine,
  onSwitch,
  graphIssue,
  curveRange,
  hidden,
  form = 'exact',
  literal,
}: {
  /** the line is only numbers as typed: a number (a = -1.1) stays as typed; a point shows only its fractions, when they differ */
  literal?: 'number' | 'point';
  form?: NumberForm;
  result: Result | undefined;
  t: Strings;
  /** text under a pending result; null shows the bar alone */
  pendingNote: string | null;
  onDefine: (name: string) => void;
  /** factor(…) ⇄ expand(…) */
  onSwitch: (to: 'factor' | 'expand') => void;
  /** why a function or equation couldn't be graphed */
  graphIssue?: string;
  curveRange?: string;
  /** the user hid this line from the graph */
  hidden?: boolean;
}) {
  if (!result || result.status === 'empty') return null;

  switch (result.status) {
    case 'value': {
      const v = result.value;
      if (v.kind === 'matrix') return <MatrixView value={v} />;
      if (v.kind === 'bool') return <span className="result__value">{v.b ? t.yes : t.no}</span>;
      if (v.kind === 'shape') return <span className="result__note">{shapeText(v.shape, t)}</span>;
      if (v.kind === 'points') return <span className="result__note">{t.pointsNote(v.pts.length)}</span>;
      if (v.kind === 'fit') {
        // y = 2x + 1 over R² = 0.98
        const [formula, r2] = result.text.replace(/^y = /, '').split(', R² = ');
        return (
          <span className="result__stack">
            <span className="result__value result__formula">
              <MathText text={`y = ${formula}`} />
            </span>
            <span className="result__note">{t.fitNote(r2 ?? '')}</span>
          </span>
        );
      }
      if (result.exact && form === 'exact') {
        // exact form first, the decimal under it
        return (
          <span className="result__stack">
            <span className="result__value">
              <MathText text={result.exact} />
            </span>
            <span className="result__note">
              ≈ <NumberText text={result.text} />
            </span>
          </span>
        );
      }
      // exact view: decimals that are fractions read as fractions, (2.2, 4.048) → (11/5, 506/125)
      const plain = formatValue(v);
      const exactly = form === 'exact' && literal !== 'number' && !result.numeric;
      // roots and π too: 2.828… → 2√2, (0.707…, 0.707…) → (√2/2, √2/2)
      const exactText = !exactly
        ? null
        : v.kind === 'num' && v.z.im === 0
          ? exactNumber(v.z.re)
          : v.kind === 'point' && (exactNumber(v.x) || exactNumber(v.y))
            ? `(${exactNumber(v.x) ?? formatReal(v.x)}, ${exactNumber(v.y) ?? formatReal(v.y)})`
            : null;
      const asFractions = exactText ?? (exactly && (v.kind === 'num' || v.kind === 'point') ? fractionsIn(plain) : plain);
      // a point written as numbers: nothing to add, unless the fractions read differently
      if (literal === 'point') {
        return asFractions !== plain ? (
          <span className="result__value">
            <MathText text={asFractions} />
          </span>
        ) : null;
      }
      if (asFractions !== plain) {
        return (
          <span className="result__stack">
            <span className="result__value">
              <MathText text={asFractions} />
            </span>
            <span className="result__note">
              = <NumberText text={plain} />
            </span>
          </span>
        );
      }
      return (
        <span className="result__stack">
          <span className="result__value">
            {result.numeric && '≈ '}
            <NumberText text={plain} />
          </span>
          {result.numeric && <span className="result__note">{t.numericNote}</span>}
        </span>
      );
    }

    case 'symbolic': {
      const switchTo = result.op === 'factor' ? 'expand' : result.op === 'expand' ? 'factor' : null;
      return (
        <span className="result__stack">
          <span className="result__value result__formula">
            <MathText text={result.text} />
            {result.constant && <span className="result__muted"> {t.plusC}</span>}
          </span>
          {switchTo && (
            <button type="button" className="btn btn--small" onClick={() => onSwitch(switchTo)}>
              {switchTo === 'expand' ? t.toExpand : t.toFactor}
            </button>
          )}
        </span>
      );
    }

    case 'solved': {
      const body =
        result.special === 'none' ? t.noSolution : result.special === 'all' ? t.allNumbers : <MathText text={result.text} />;
      return (
        <span className="result__stack">
          <span className="result__value result__formula">{body}</span>
          {result.periodic && <span className="result__note">{t.periodicNote}</span>}
          {result.numeric && <span className="result__note">{t.numericNote}</span>}
        </span>
      );
    }

    case 'pending':
      return (
        <span className="result__pending">
          <span className="skeleton" aria-hidden="true" />
          {pendingNote && <span className="result__note">{pendingNote}</span>}
        </span>
      );

    case 'function': {
      const issue = graphIssue && <span className="result__note">{t.notGraphed(graphIssue)}</span>;
      if (!result.formula) {
        const complex = result.params.length === 1 && result.params[0] === 'z';
        return (
          <span className="result__stack">
            <span className="result__note">{complex ? t.complexFunction : t.functionOf(result.params.join(', '))}</span>
            {issue}
          </span>
        );
      }
      return (
        <span className="result__stack">
          <span className="result__value result__formula">
            <MathText text={`${result.name}(${result.params.join(', ')}) = ${result.formula}`} />
          </span>
          <span className="result__note">{t.functionOf(result.params.join(', '))}</span>
          {issue}
        </span>
      );
    }

    case 'relation':
      return <span className="result__value">{result.holds ? t.yes : t.no}</span>;

    case 'curve': {
      const range = curveRange ?? '';
      const text = result.curve === 'field' ? t.fieldCurve : result.curve === 'surface' ? t.surfaceCurve : result.curve === 'polar' ? t.polarCurve(range) : t.parametricCurve(range);
      return <span className="result__note">{graphIssue ? t.notGraphed(graphIssue) : text}</span>;
    }

    case 'equation': {
      if (result.graphable) {
        return <span className="result__note">{graphIssue ? t.notGraphed(graphIssue) : hidden ? t.hiddenLine : t.graphed}</span>;
      }
      const names = result.undefinedNames ?? [];
      return (
        <span className="result__stack">
          <span className="result__note">{t.defineToGraph(names.join(', '))}</span>
          <span className="result__actions">
            {names
              .filter((name) => [...name].length === 1)
              .map((name) => (
                <button key={name} type="button" className="btn btn--small" onClick={() => onDefine(name)}>
                  {t.define(name)}
                </button>
              ))}
          </span>
        </span>
      );
    }

    case 'error': {
      // single-letter names can be defined with one click, as a first step towards sliders
      const definable = (result.undefinedNames ?? []).filter((n) => [...n].length === 1);
      return (
        <span className="result__error" role="status">
          <span>
            {result.message}
          </span>
          {definable.length > 0 && (
            <span className="result__actions">
              {definable.map((name) => (
                <button key={name} type="button" className="btn btn--small" onClick={() => onDefine(name)}>
                  {t.define(name)}
                </button>
              ))}
            </span>
          )}
        </span>
      );
    }
  }
}
