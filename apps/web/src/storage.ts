import type { Table } from './table/table';
import type { LineLook } from './graph/looks';
import type { EvalSettings } from '@math/engine';
import type { Lang } from './i18n';

export interface Line {
  id: string;
  source: string;
  /** colour, style, hidden */
  look?: LineLook;
  /** a slider's own range, step and speed */
  slider?: SliderSettings;
  /** a table of points; the line's source is written from it */
  table?: Table;
  /** a note line: plain text, not calculated (source stays empty) */
  note?: string;
  /** a folder heading: the lines below it, up to the next folder, are inside */
  folder?: Folder;
}
export interface Folder {
  title: string;
  /** its lines are folded away in the list */
  collapsed?: boolean;
  /** its lines are left off the graph */
  hidden?: boolean;
}
/** a line without its id: what share links and files carry */
export type LineData = Omit<Line, 'id'>;
export interface SliderSettings {
  min?: number;
  max?: number;
  step?: number;
  /** 1 sweeps the range in about six seconds */
  speed?: number;
}
export interface HistoryItem {
  id: string;
  source: string;
  text: string;
}
export interface Saved {
  lines: Line[];
  history: HistoryItem[];
  settings: EvalSettings;
  lang: Lang;
  keypad: boolean;
  theme?: Theme;
}

export type Theme = 'system' | 'light' | 'dark';

const KEY = 'calculator.v1';

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Browser storage can be missing or blocked (private windows); the app works without it. */
export function load(): Partial<Saved> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Saved>) : {};
  } catch {
    return {};
  }
}

export function save(state: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage full or blocked: keep working in memory
  }
}
