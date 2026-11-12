import { cleanLook } from './graph/looks';
import type { Folder, Line, LineData, SliderSettings } from './storage';
import { cleanTable, tableSource } from './table/table';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function cleanSlider(v: unknown): SliderSettings | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const out: SliderSettings = {};
  if (finite(o.min)) out.min = o.min;
  if (finite(o.max)) out.max = o.max;
  if (finite(o.step) && o.step > 0) out.step = o.step;
  if (finite(o.speed) && o.speed > 0 && o.speed <= 20) out.speed = o.speed;
  return Object.keys(out).length ? out : undefined;
}

function cleanFolder(v: unknown): Folder | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.title !== 'string') return undefined;
  return { title: o.title.slice(0, 80), ...(o.collapsed === true ? { collapsed: true } : {}), ...(o.hidden === true ? { hidden: true } : {}) };
}

/**
 * A line as it comes from storage, a share link or a file, with only known
 * fields and sensible values. A table's line is rewritten from its cells; a
 * note or folder has no math.
 */
export function cleanLine(v: unknown): LineData | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const look = cleanLook(o.look);
  const slider = cleanSlider(o.slider);
  const table = cleanTable(o.table);
  const note = typeof o.note === 'string' ? o.note.slice(0, 4000) : undefined;
  const folder = note === undefined && !table ? cleanFolder(o.folder) : undefined;
  // something that isn't a line at all
  if (typeof o.source !== 'string' && note === undefined && !folder && !table) return null;
  const source = table ? tableSource(table) : note !== undefined || folder ? '' : typeof o.source === 'string' ? o.source.slice(0, 4000) : '';
  return {
    source,
    ...(look ? { look } : {}),
    ...(slider ? { slider } : {}),
    ...(table ? { table } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(folder ? { folder } : {}),
  };
}

/** what a line carries besides its id, for share links and files */
export const lineData = ({ id: _id, ...rest }: Line): LineData => rest;

/** the folder heading each line sits under (headings themselves excluded) */
export function foldersOf(lines: Line[]): Map<string, Line> {
  const out = new Map<string, Line>();
  let current: Line | null = null;
  for (const l of lines) {
    if (l.folder) current = l;
    else if (current) out.set(l.id, current);
  }
  return out;
}
