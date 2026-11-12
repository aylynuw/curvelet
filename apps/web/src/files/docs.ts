import { cleanLine } from '../lines';
import { newId, type LineData } from '../storage';

/** a worksheet as kept in the browser or written to a file */
export interface Doc {
  id: string;
  name: string;
  lines: LineData[];
  /** ms since 1970 */
  updated: number;
}

const DOCS_KEY = 'calculator.docs.v1';
const FORMAT = 'calculator-worksheet';

export function listDocs(): Doc[] {
  try {
    const v = JSON.parse(localStorage.getItem(DOCS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((d): d is Doc => d && typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.lines)).sort((a, b) => b.updated - a.updated) : [];
  } catch {
    return [];
  }
}
function writeDocs(docs: Doc[]): boolean {
  try {
    localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
    return true;
  } catch {
    return false;
  }
}
/** saves over a worksheet of the same name; false when the browser won't store it */
export function saveDoc(name: string, lines: Doc['lines']): Doc | null {
  const docs = listDocs();
  const same = docs.find((d) => d.name === name);
  const doc: Doc = { id: same?.id ?? newId(), name, lines, updated: Date.now() };
  return writeDocs([doc, ...docs.filter((d) => d.id !== doc.id)]) ? doc : null;
}
export function deleteDoc(id: string): void {
  writeDocs(listDocs().filter((d) => d.id !== id));
}

/** the file's text: readable JSON that says what it is */
export function toFile(name: string, lines: Doc['lines']): string {
  return JSON.stringify({ format: FORMAT, version: 1, name, lines }, null, 2);
}

/** a file's text back into a worksheet; null when it isn't one */
export function fromFile(text: string, fallbackName: string): { name: string; lines: Doc['lines'] } | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.format !== FORMAT || !Array.isArray(o.lines)) return null;
  const lines = o.lines.slice(0, 2000).flatMap((l) => cleanLine(l) ?? []);
  return { name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 80) : fallbackName, lines };
}

/** a file name made from a worksheet name */
export const fileName = (name: string) => `${name.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'worksheet'}.calc.json`;
