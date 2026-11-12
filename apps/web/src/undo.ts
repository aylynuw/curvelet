import type { Line } from './storage';

/** how long a run of typing in one line stays a single undo step */
export const MERGE_MS = 1000;
const LIMIT = 200;

export interface UndoState {
  past: Line[][];
  future: Line[][];
  /** the line being typed into and when, so a burst of keystrokes is one step */
  last: { id: string; at: number } | null;
}

export const emptyUndo = (): UndoState => ({ past: [], future: [], last: null });

/** the one line whose source changed, when that is the only difference */
function typedLine(before: Line[], after: Line[]): string | null {
  if (before.length !== after.length) return null;
  let id: string | null = null;
  for (let i = 0; i < before.length; i++) {
    const a = before[i]!;
    const b = after[i]!;
    if (a === b) continue;
    if (a.id !== b.id || a.look !== b.look || id) return null;
    id = a.id;
  }
  return id;
}

/** Record a change from `before` to `after`. New edits clear the redo list. */
export function record(s: UndoState, before: Line[], after: Line[], now: number): UndoState {
  if (before === after) return s;
  const typed = typedLine(before, after);
  if (typed && s.last && s.last.id === typed && now - s.last.at < MERGE_MS && s.past.length > 0) {
    return { past: s.past, future: [], last: { id: typed, at: now } };
  }
  return { past: [...s.past, before].slice(-LIMIT), future: [], last: typed ? { id: typed, at: now } : null };
}

export function undo(s: UndoState, current: Line[]): { state: UndoState; lines: Line[] } | null {
  const prev = s.past[s.past.length - 1];
  if (!prev) return null;
  return { state: { past: s.past.slice(0, -1), future: [current, ...s.future], last: null }, lines: prev };
}

export function redo(s: UndoState, current: Line[]): { state: UndoState; lines: Line[] } | null {
  const next = s.future[0];
  if (!next) return null;
  return { state: { past: [...s.past, current], future: s.future.slice(1), last: null }, lines: next };
}

/** Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z and Ctrl+Y redo. */
export function undoKey(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): 'undo' | 'redo' | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && e.ctrlKey && !e.metaKey) return 'redo';
  return null;
}
