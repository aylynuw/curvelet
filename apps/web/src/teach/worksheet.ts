import type { Range } from './templates';

export type Paper = 'A4' | 'B4' | 'Letter';

/** Page sizes in millimetres. B4 is the JIS size used for Korean exam papers. */
export const PAPER: Record<Paper, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  B4: { width: 257, height: 364 },
  Letter: { width: 215.9, height: 279.4 },
};
export const MARGIN = 15;
/** CSS pixels per millimetre */
export const PX_PER_MM = 96 / 25.4;

/** A graph drawn on the page: the calculator lines that make it and the part of the plane shown. */
export interface Figure {
  lines: string[];
  range: Range;
  axes: boolean;
  axisNumbers: boolean;
  curveLabels: boolean;
  /** share of the column's width, 0.3 to 1 */
  width: number;
}

/**
 * One problem. `text` and `answer` are plain text where $…$ is math in the
 * calculator's syntax and $$…$$ is raw LaTeX.
 */
export interface Problem {
  id: string;
  text: string;
  answer: string;
  /** points, shown as [3점] / (3 points); 0 hides them */
  points: number;
  /** blank lines left for working */
  space: number;
  figure: Figure | null;
  /** a 평가원 problem: year, month and number, YYYYMMNN */
  source?: string;
}

export interface Worksheet {
  title: string;
  subtitle: string;
  instructions: string;
  paper: Paper;
  columns: 1 | 2;
  /** Name ____ Class ____ in the header */
  nameLine: boolean;
  /** pages with the answers, after the problems */
  answerKey: boolean;
  problems: Problem[];
}

export const newId = () => Math.random().toString(36).slice(2, 10);

export function blankProblem(): Problem {
  return { id: newId(), text: '', answer: '', points: 0, space: 4, figure: null };
}

export function defaultWorksheet(lang: 'en' | 'ko'): Worksheet {
  return {
    title: lang === 'ko' ? '수학 학습지' : 'Math worksheet',
    subtitle: '',
    instructions: '',
    paper: lang === 'ko' ? 'B4' : 'A4',
    columns: 2,
    nameLine: true,
    answerKey: true,
    problems: [],
  };
}

const KEY = 'calculator.worksheet.v1';

/** Like the calculator's own storage: blocked or full storage leaves the worksheet in memory only. */
export function loadWorksheet(lang: 'en' | 'ko'): Worksheet {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaultWorksheet(lang), ...(JSON.parse(raw) as Partial<Worksheet>) };
  } catch {
    // fall through to a new one
  }
  return defaultWorksheet(lang);
}

export function saveWorksheet(w: Worksheet): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(w));
  } catch {
    // keep working in memory
  }
}

/** A page: its columns, each a list of item indexes, in reading order. */
export interface Page {
  columns: number[][];
}

/**
 * Fills pages column by column, never splitting an item. `first` is the
 * height the first page has for items (less: the header takes the top).
 * An item taller than a whole column gets a column of its own and overflows.
 */
export function paginate(heights: number[], opts: { column: number; first: number; columns: number; gap: number }): Page[] {
  const pages: Page[] = [];
  let page: Page = { columns: [[]] };
  let left = opts.first;
  let full = opts.first;
  const nextColumn = () => {
    if (page.columns.length < opts.columns) page.columns.push([]);
    else {
      pages.push(page);
      page = { columns: [[]] };
      full = opts.column;
    }
    left = full;
  };
  heights.forEach((h, k) => {
    const col = page.columns[page.columns.length - 1]!;
    const need = col.length ? h + opts.gap : h;
    if (need > left && col.length > 0) {
      nextColumn();
      page.columns[page.columns.length - 1]!.push(k);
      left -= h;
      return;
    }
    col.push(k);
    left -= need;
  });
  if (page.columns.some((c) => c.length) || pages.length === 0) pages.push(page);
  return pages;
}
