import { nextProblem, type Level, type Problem as Drill, type Topic } from '@math/steps';
import type { Lang } from '../i18n';
import { questionTex } from '../learn/Practice';
import type { LearnStrings } from '../learn/strings';
import { blankProblem, type Problem } from './worksheet';

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
