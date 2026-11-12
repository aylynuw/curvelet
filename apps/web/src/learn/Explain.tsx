import { explainGraph, type Explanation, type Interval, type Num, type Point } from '@math/steps';
import { useMemo, type ReactNode } from 'react';
import { LatexText } from '../components/MathText';
import { textToLatex } from '../math/latex';
import type { LearnStrings } from './strings';

const n = (v: Num) => `${v.approx ? '\\approx ' : ''}${textToLatex(v.text, { display: true })}`;
const ivTex = (i: Interval) =>
  `${i.loClosed ? '\\left[' : '\\left('}${i.lo ? n(i.lo) : '-\\infty'},\\ ${i.hi ? n(i.hi) : '\\infty'}${i.hiClosed ? '\\right]' : '\\right)'}`;
const union = (list: Interval[]) => list.map(ivTex).join('\\cup ');
const ptTex = (p: Point) => `\\left(${n(p.x)},\\ ${n(p.y)}\\right)`;
const plain = (v: Num) => `${v.approx ? '≈' : ''}${v.text}`;
const ivPlain = (list: Interval[]) =>
  list.map((i) => `${i.loClosed ? '[' : '('}${i.lo ? plain(i.lo) : '−∞'}, ${i.hi ? plain(i.hi) : '∞'}${i.hiClosed ? ']' : ')'}`).join(' ∪ ');

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="explain__fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const Tex = ({ latex, label }: { latex: string; label: string }) => <LatexText latex={latex} label={label} />;

/** What y = f(x) does, in sentences a student would write: domain, intercepts, rise and fall, bends, asymptotes, symmetry. */
export function Explain({ fn, s }: { fn: (x: number) => number; s: LearnStrings }) {
  const e: Explanation = useMemo(() => explainGraph(fn), [fn]);
  const x = s.ex;

  const domain = e.allReals ? (
    x.allReals
  ) : e.excludedEvery ? (
    <>
      <Tex latex={`x\\ne ${n(e.excludedEvery.start)}+${n(e.excludedEvery.step)}\\,n`} label={`x ≠ ${plain(e.excludedEvery.start)} + ${plain(e.excludedEvery.step)}n`} /> {x.every}
    </>
  ) : e.excluded.length > 0 ? (
    <Tex latex={e.excluded.map((v) => `x\\ne ${n(v)}`).join(',\\ ')} label={e.excluded.map((v) => `x ≠ ${plain(v)}`).join(', ')} />
  ) : (
    <Tex latex={union(e.domain)} label={ivPlain(e.domain)} />
  );

  const slant = (m: Num, b: Num) => {
    const mx = m.text === '1' ? 'x' : m.text === '-1' ? '-x' : `${m.text}x`;
    return b.text === '0' ? `y = ${mx}` : b.text.startsWith('-') ? `y = ${mx} - ${b.text.slice(1)}` : `y = ${mx} + ${b.text}`;
  };

  return (
    <div className="explain">
    <dl className="explain__list">
      <Fact label={x.domain}>{domain}</Fact>
      {e.period && (
        <Fact label={x.period}>
          <Tex latex={n(e.period)} label={plain(e.period)} />
          <span className="explain__aside">{x.periodNote}</span>
        </Fact>
      )}
      <Fact label={x.intercepts}>
        <span className="explain__item">
          {x.yIntercept}{' '}
          {e.yIntercept ? <Tex latex={`\\left(0,\\ ${n(e.yIntercept)}\\right)`} label={`(0, ${plain(e.yIntercept)})`} /> : x.none}
        </span>
        <span className="explain__item">
          {e.xIntercepts.length === 0 ? (
            x.noX
          ) : (
            <>
              {x.xIntercepts}{' '}
              <Tex latex={e.xIntercepts.map((v) => `x=${n(v)}`).join(',\\ ')} label={e.xIntercepts.map((v) => `x = ${plain(v)}`).join(', ')} />
            </>
          )}
        </span>
      </Fact>
      {e.constant ? (
        <Fact label={x.rises}>{x.constant}</Fact>
      ) : (
        <>
          {e.increasing.length > 0 && (
            <Fact label={x.rises}>
              <Tex latex={union(e.increasing)} label={ivPlain(e.increasing)} />
            </Fact>
          )}
          {e.decreasing.length > 0 && (
            <Fact label={x.falls}>
              <Tex latex={union(e.decreasing)} label={ivPlain(e.decreasing)} />
            </Fact>
          )}
        </>
      )}
      {e.maxima.length > 0 && (
        <Fact label={x.maxima}>
          <Tex latex={e.maxima.map(ptTex).join(',\\ ')} label={e.maxima.map((p) => `(${plain(p.x)}, ${plain(p.y)})`).join(', ')} />
        </Fact>
      )}
      {e.minima.length > 0 && (
        <Fact label={x.minima}>
          <Tex latex={e.minima.map(ptTex).join(',\\ ')} label={e.minima.map((p) => `(${plain(p.x)}, ${plain(p.y)})`).join(', ')} />
        </Fact>
      )}
      {e.straight ? (
        <Fact label={x.concaveUp}>{x.straight}</Fact>
      ) : (
        <>
          {e.concaveUp.length > 0 && (
            <Fact label={x.concaveUp}>
              <Tex latex={union(e.concaveUp)} label={ivPlain(e.concaveUp)} />
            </Fact>
          )}
          {e.concaveDown.length > 0 && (
            <Fact label={x.concaveDown}>
              <Tex latex={union(e.concaveDown)} label={ivPlain(e.concaveDown)} />
            </Fact>
          )}
          {e.inflections.length > 0 && (
            <Fact label={x.inflections}>
              <Tex latex={e.inflections.map(ptTex).join(',\\ ')} label={e.inflections.map((p) => `(${plain(p.x)}, ${plain(p.y)})`).join(', ')} />
            </Fact>
          )}
        </>
      )}
      {e.vertical.length > 0 && (
        <Fact label={x.vertical}>
          <Tex latex={e.vertical.map((v) => `x=${n(v)}`).join(',\\ ')} label={e.vertical.map((v) => `x = ${plain(v)}`).join(', ')} />
        </Fact>
      )}
      {e.horizontal.map((h) => (
        <Fact key={h.side} label={x.horizontal}>
          <Tex latex={`y=${n(h.y)}`} label={`y = ${plain(h.y)}`} /> <span className="explain__aside">{x.sides[h.side]}</span>
        </Fact>
      ))}
      {e.oblique.map((o) => (
        <Fact key={o.side} label={x.oblique}>
          <Tex latex={textToLatex(slant(o.m, o.b), { display: true })} label={slant(o.m, o.b)} />{' '}
          <span className="explain__aside">{x.sides[o.side]}</span>
        </Fact>
      ))}
      {e.symmetry && <Fact label={e.symmetry === 'even' ? x.even.split(':')[0]! : x.odd.split(':')[0]!}>{(e.symmetry === 'even' ? x.even : x.odd).split(': ')[1]}</Fact>}
    </dl>
    <p className="explain__note">{x.note(e.range)}</p>
    </div>
  );
}
