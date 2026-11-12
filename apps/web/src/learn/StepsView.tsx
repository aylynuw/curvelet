import { parseExpression, printNode, type EvalSettings, type IntegralStep, type Node, type SymbolicAnswer } from '@math/engine';
import { diffSteps, flattenDiff, NoSteps, solveSteps, type DiffStep, type EqStep } from '@math/steps';
import { Fragment, useEffect, useReducer, type ReactNode } from 'react';
import { LatexText, MathText } from '../components/MathText';
import { textToLatex } from '../math/latex';
import type { LearnStrings } from './strings';

/** A sentence with $math$ in it: the math typeset, the rest as text. */
export function Rich({ text }: { text: string }) {
  const parts = text.split('$');
  return (
    <>
      {parts.map((p, k) => (k % 2 === 1 ? <MathText key={k} text={p} className="rich__math" /> : <Fragment key={k}>{p}</Fragment>))}
    </>
  );
}

const tex = (n: Node | string) => textToLatex(typeof n === 'string' ? n : printNode(n), { display: true });
const show = (n: Node) => printNode(n);

/** What a line asks the symbolic engine for, as Workspace.symbolicCall gives it. */
export interface Call {
  op: string;
  args: Node[];
  at?: Node;
}

/** Asks SymPy for integral steps; undefined while it works. */
export type IntegralAsk = (args: Node[]) => SymbolicAnswer | undefined;

export function StepsView({
  call,
  settings,
  s,
  askIntegral,
  onAnswer,
}: {
  call: Call;
  settings: EvalSettings;
  s: LearnStrings;
  askIntegral: IntegralAsk;
  /** subscribes to SymPy answers, so integral steps appear when they arrive */
  onAnswer: (listener: () => void) => () => void;
}) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onAnswer(rerender), [onAnswer]);

  const variable = (k: number, fallback = 'x') => {
    const v = call.args[k];
    return v?.type === 'ident' ? v.name : fallback;
  };

  let body: ReactNode;
  if (call.op === 'diff') {
    const order = call.args[2]?.type === 'num' ? call.args[2].value : 1;
    try {
      const step = diffSteps(call.args[0]!, variable(1));
      body = (
        <>
          <DiffList step={step} x={variable(1)} s={s} />
          {order > 1 && <p className="steps__note">{s.firstDerivativeOnly}</p>}
          {call.at && order === 1 && (
            <p className="steps__note">
              <Rich text={s.atPoint(show(call.at))} />
            </p>
          )}
        </>
      );
    } catch (e) {
      if (!(e instanceof NoSteps)) throw e;
      body = <p className="steps__note">{s.noSteps}</p>;
    }
  } else if (call.op === 'solve') {
    const target = call.args[0]!;
    const x = variable(1);
    const [left, right] = target.type === 'rel' && target.op === '=' ? [target.left, target.right] : [target, { type: 'num', value: 0 } as Node];
    body = <EqList steps={solveSteps(left, right, x, settings.complex).steps} s={s} />;
  } else if (call.op === 'integrate') {
    const answer = askIntegral(call.args);
    if (!answer) body = <p className="steps__note">{s.stepsLoading}</p>;
    else if (!answer.ok || !answer.steps) body = <p className="steps__note">{s.noSteps}</p>;
    else {
      const x = answer.var ?? variable(1);
      body = (
        <>
          <IntList step={answer.steps} x={x} s={s} />
          {answer.bounds && (
            <p className="steps__line">
              <LatexText
                latex={`\\left[${tex(answer.steps.result ?? '')}\\right]_{${tex(answer.bounds[0])}}^{${tex(answer.bounds[1])}}`}
                label={`F(${answer.bounds[1]}) - F(${answer.bounds[0]})`}
              />
            </p>
          )}
        </>
      );
    }
  } else body = <p className="steps__note">{s.noSteps}</p>;

  return (
    <section className="steps" aria-label={s.stepsTitle}>
      {body}
    </section>
  );
}

function diffNote(st: DiffStep, s: LearnStrings): string {
  const d = s.diff;
  let note: string;
  switch (st.rule) {
    case 'constant':
      note = d.constant;
      break;
    case 'variable':
      note = d.variable;
      break;
    case 'sum':
      note = d.sum;
      break;
    case 'negation':
      note = d.negation;
      break;
    case 'constantMultiple':
      note = d.constantMultiple(show(st.factor!));
      break;
    case 'power':
      note = d.power(show(st.factor!));
      break;
    case 'product':
      note = d.product(show(st.sub[0]!.expr), show(st.sub[1]!.expr));
      break;
    case 'quotient':
      note = d.quotient(show(st.sub[0]!.expr), show(st.sub[1]!.expr));
      break;
    case 'exponential':
      note = d.exponential;
      break;
    case 'exponentialBase': {
      const base = st.expr.type === 'binary' ? show(st.expr.left) : 'a';
      note = d.exponentialBase(base);
      break;
    }
    case 'generalPower':
      note = d.generalPower;
      break;
    case 'function': {
      const formula = show(diffSteps(parseExpression(`${st.fn}(x)`), 'x').result);
      note = d.function(st.fn!, formula);
      break;
    }
  }
  return st.inner ? `${note} ${d.chain(show(st.inner))}` : note;
}

function DiffList({ step, x, s }: { step: DiffStep; x: string; s: LearnStrings }) {
  const rows = flattenDiff(step);
  return (
    <ol className="steps__list">
      {rows.map(({ step: st, depth }, k) => (
        <li key={k} className="steps__row" style={{ '--depth': depth } as React.CSSProperties} data-nested={depth > 0 || undefined}>
          <span className="steps__line">
            <LatexText latex={`\\frac{d}{d${x}}\\left(${tex(st.expr)}\\right)=${tex(st.result)}`} label={`d/d${x} ${show(st.expr)} = ${show(st.result)}`} />
          </span>
          <span className="steps__note">
            <Rich text={diffNote(st, s)} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function EqList({ steps, s }: { steps: EqStep[]; s: LearnStrings }) {
  return (
    <ol className="steps__list">
      {steps.map((st, k) => {
        const msg = s.eq[st.rule];
        const note = typeof msg === 'function' ? msg(st.value ? show(st.value) : '') : msg;
        return (
          <li key={k} className="steps__row">
            <span className="steps__note">
              <Rich text={note} />
            </span>
            {st.tex && (
              <span className="steps__line">
                <LatexText latex={st.tex} label={note} />
              </span>
            )}
            {st.eqs.length > 0 && (
              <span className="steps__line">
                {st.eqs.map((e, j) => (
                  <Fragment key={j}>
                    {j > 0 && <span className="steps__or"> {s.or} </span>}
                    <MathText text={show(e)} />
                  </Fragment>
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const BASIC = new Set(['SinRule', 'CosRule', 'Sec2Rule', 'Csc2Rule', 'SecTanRule', 'CscCotRule', 'SinhRule', 'CoshRule', 'TanRule', 'CotRule']);
const SPECIAL = new Set(['ErfRule', 'FresnelSRule', 'FresnelCRule', 'LiRule', 'EiRule', 'SiRule', 'CiRule', 'ShiRule', 'ChiRule', 'PolylogRule', 'UpperGammaRule', 'EllipticFRule', 'EllipticERule']);

function intNote(st: IntegralStep, s: LearnStrings): string {
  const i = s.int as Record<string, string | ((...a: string[]) => string)>;
  const f = (k: string, ...a: string[]) => {
    const m = i[k];
    return typeof m === 'function' ? m(...a) : (m as string);
  };
  switch (st.rule) {
    case 'ConstantTimesRule':
      return f('ConstantTimesRule', String(st.constant ?? ''));
    case 'URule':
      return f('URule', String(st.u_func ?? ''));
    case 'PartsRule':
      return f('PartsRule', String(st.u ?? ''), String(st.dv ?? ''));
    case 'RewriteRule':
      return f('RewriteRule', String(st.rewritten ?? ''));
    default:
      if (i[st.rule]) return f(st.rule);
      if (BASIC.has(st.rule)) return f('basic');
      if (SPECIAL.has(st.rule)) return f('special');
      return f('other', st.rule.replace(/Rule$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
  }
}

/** SymPy's tree in reading order; inside a substitution the variable is u */
function flattenInt(step: IntegralStep, v: string, depth: number): { step: IntegralStep; v: string; depth: number }[] {
  // SymPy offers alternatives; the first is the one it used
  if (step.rule === 'AlternativeRule' && step.parts?.[0]) return flattenInt(step.parts[0], v, depth);
  const inner = step.rule === 'URule' ? 'u' : v;
  return [{ step, v, depth }, ...(step.parts ?? []).flatMap((p) => flattenInt(p, inner, depth + 1))];
}

function IntList({ step, x, s }: { step: IntegralStep; x: string; s: LearnStrings }) {
  return (
    <ol className="steps__list">
      {flattenInt(step, x, 0).map(({ step: st, v, depth }, k) => (
        <li key={k} className="steps__row" style={{ '--depth': depth } as React.CSSProperties} data-nested={depth > 0 || undefined}>
          <span className="steps__line">
            <LatexText
              latex={`\\int ${tex(st.integrand)}\\,d${v}${st.result ? `=${tex(st.result)}` : ''}`}
              label={`∫ ${st.integrand} d${v}${st.result ? ` = ${st.result}` : ''}`}
            />
          </span>
          <span className="steps__note">
            <Rich text={intNote(st, s)} />
          </span>
        </li>
      ))}
    </ol>
  );
}
