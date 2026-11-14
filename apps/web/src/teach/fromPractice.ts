import { mockExam, nextProblem, type Level, type Problem as Drill, type Topic } from '@math/steps';
import type { Lang } from '../i18n';
import { questionTex } from '../learn/Practice';
import type { LearnStrings } from '../learn/strings';
import { blankProblem, type Problem } from './worksheet';
import { sheetFigure } from './figureFrom';

/** A practice problem as a worksheet problem: exam ones keep their points and put the working in the answer key. */
export function toSheetProblem(p: Drill, lang: Lang, learn: LearnStrings): Problem {
  if (p.prompt && p.value !== undefined) {
    const working = p.solution?.[lang] ?? [];
    return {
      ...blankProblem(),
      text: p.prompt[lang],
      answer: [String(p.value), ...working].join('\n'),
      points: p.points ?? 0,
      space: (p.points ?? 3) + 3,
      ...(p.source ? { source: p.source } : {}),
      ...(p.figure ? { figure: sheetFigure(p.figure) } : {}),
    };
  }
  return {
    ...blankProblem(),
    text: `${learn.task[p.topic]} $$${questionTex(p)}$$`,
    answer: `$${p.answer}$`,
    space: p.topic === 'equation' ? 5 : 4,
  };
}

/** `count` new problems on a topic and level, none repeated */
export function generateProblems(level: Level, topic: Topic, count: number, lang: Lang, learn: LearnStrings): Problem[] {
  const seen = new Set<string>();
  const out: Problem[] = [];
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const p = nextProblem(topic, Math.random, level);
    if (seen.has(p.question)) continue;
    seen.add(p.question);
    out.push(toSheetProblem(p, lang, learn));
  }
  return out;
}

const CIRCLED = ['①', '②', '③', '④', '⑤'];

/** A whole mock exam as worksheet problems: the choices under each five-choice problem, the answer key with its working. */
export function mockSheet(elective: 'calc2' | 'stats' | 'geometry', lang: Lang): Problem[] {
  return mockExam(elective).map((item) => {
    const working = item.solution?.[lang] ?? [];
    const choices = item.choices?.map((v, k) => `${CIRCLED[k]} $$${v}$$`).join('  ');
    const at = item.choices?.indexOf(item.value!) ?? -1;
    return {
      ...blankProblem(),
      text: choices ? `${item.prompt![lang]}\n${choices}` : item.prompt![lang],
      answer: [at >= 0 ? `${CIRCLED[at]} ${item.value}` : String(item.value), ...working].join('\n'),
      points: item.points ?? 0,
      space: (item.points ?? 3) + 3,
      ...(item.figure ? { figure: sheetFigure(item.figure) } : {}),
    };
  });
}
