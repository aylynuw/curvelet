/**
 * Problem sets kept as a file (problems/bank.json in the repository): fixed
 * problems written by hand, added to the generated ones. A set is checked
 * before use, and loading one replaces the set loaded before.
 */
import type { Unit } from './exam';
import { LEVEL_TEMPLATES, TEMPLATES, type Level, type Problem } from './practice';

export interface BankProblem {
  id: string;
  unit: Unit;
  level: Level;
  points: 2 | 3 | 4;
  prompt: { ko: string; en: string };
  answer: number;
  solution: { ko: string[]; en: string[] };
}

export interface Bank {
  title: { ko: string; en: string };
  problems: BankProblem[];
}

const UNITS: Unit[] = ['algebra', 'calculus', 'calc2', 'stats', 'geometry'];
const LEVELS: Level[] = ['basic', 'advanced', 'exam'];
const PREFIX = 'bank-';

const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isPair = (v: unknown): v is { ko: string; en: string } => !!v && typeof v === 'object' && isText((v as { ko?: unknown }).ko) && isText((v as { en?: unknown }).en);
const isLines = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Reads a problem set. Problems that don't fit the format are left out and
 * named in `skipped`; a file that isn't a problem set at all throws.
 */
export function parseBank(data: unknown): { bank: Bank; skipped: string[] } {
  const d = data as { format?: unknown; title?: unknown; problems?: unknown };
  if (!d || typeof d !== 'object' || d.format !== 'curvelet-problems' || !Array.isArray(d.problems)) throw new Error('Not a Curvelet problem set');
  const skipped: string[] = [];
  const seen = new Set<string>();
  const problems: BankProblem[] = [];
  d.problems.forEach((raw: unknown, k: number) => {
    const p = raw as Partial<BankProblem> & { level?: unknown };
    const id = typeof p?.id === 'string' ? p.id : `#${k + 1}`;
    const level = (p.level ?? 'exam') as Level;
    const ok =
      typeof p === 'object' &&
      isText(p.id) &&
      !seen.has(p.id) &&
      UNITS.includes(p.unit as Unit) &&
      LEVELS.includes(level) &&
      [2, 3, 4].includes(p.points as number) &&
      isPair(p.prompt) &&
      typeof p.answer === 'number' &&
      Number.isFinite(p.answer) &&
      !!p.solution &&
      isLines(p.solution.ko) &&
      isLines(p.solution.en);
    if (!ok) {
      skipped.push(id);
      return;
    }
    seen.add(p.id!);
    problems.push({ id: p.id!, unit: p.unit!, level, points: p.points!, prompt: p.prompt!, answer: p.answer!, solution: p.solution! });
  });
  const title = isPair(d.title) ? d.title : { ko: '문제집', en: 'Problem set' };
  return { bank: { title, problems }, skipped };
}

/** Puts a set's problems among the practice problems of their level and unit, in place of the set before. */
export function loadBank(bank: Bank | null): void {
  for (const name of Object.keys(TEMPLATES)) if (name.startsWith(PREFIX)) delete TEMPLATES[name];
  for (const level of LEVELS)
    for (const [topic, list] of Object.entries(LEVEL_TEMPLATES[level]))
      LEVEL_TEMPLATES[level][topic as Unit] = list!.filter((n) => !n.startsWith(PREFIX));
  if (!bank) return;
  for (const p of bank.problems) {
    const name = PREFIX + p.id;
    TEMPLATES[name] = {
      topic: p.unit,
      make: (): Omit<Problem, 'topic' | 'template' | 'seed'> => ({
        target: [],
        question: p.prompt.en,
        answer: String(p.answer),
        value: p.answer,
        points: p.points,
        prompt: p.prompt,
        solution: p.solution,
      }),
    };
    const list = LEVEL_TEMPLATES[p.level][p.unit] ?? [];
    LEVEL_TEMPLATES[p.level][p.unit] = [...list, name];
  }
}

/** how many of a set's problems each unit has */
export function bankCounts(bank: Bank): Partial<Record<Unit, number>> {
  const out: Partial<Record<Unit, number>> = {};
  for (const p of bank.problems) out[p.unit] = (out[p.unit] ?? 0) + 1;
  return out;
}
