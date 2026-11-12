/**
 * Projects: everything one piece of work holds (graph lines and pictures,
 * the geometry board, the study sheet, settings), kept in the browser's
 * IndexedDB so pictures fit, and written to a .curvelet file to move it.
 */
import type { EvalSettings } from '@math/engine';
import { cleanLine } from '../lines';
import { newId, type LineData } from '../storage';
import { listDocs } from './docs';

export type ProjectTool = 'graph' | 'calc' | 'geo' | 'sheet';

export interface ProjectData {
  name: string;
  lines: LineData[];
  /** the geometry board as GeometryTool keeps it */
  geo: unknown;
  /** the graph's pictures */
  pictures: unknown[];
  /** graph look: grid, π numbers, axes, point labels */
  figure: Record<string, unknown>;
  settings?: Partial<EvalSettings>;
  /** the study sheet */
  sheet?: unknown;
  /** the tool it was last saved from, opened again with it */
  tool: ProjectTool;
}

export interface Project extends ProjectData {
  id: string;
  created: number;
  updated: number;
  /** a small picture of the graph or board, as a data URL */
  thumb?: string;
}

/** what a card shows without opening the project */
export const projectCounts = (p: ProjectData) => ({
  lines: p.lines.filter((l) => (l.source ?? '').trim() || l.note || l.folder).length,
  shapes: Array.isArray((p.geo as { objects?: unknown[] } | null)?.objects) ? (p.geo as { objects: { kind?: string; anchor?: boolean }[] }).objects.filter((o) => !(o.kind === 'point' && o.anchor)).length : 0,
  pictures: p.pictures.length,
});

// ---- IndexedDB, wrapped in promises

const DB = 'curvelet';
const STORE = 'projects';
let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}
async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = f(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const MIGRATED = 'curvelet.projects.migrated';

/** every project, the latest first; worksheets saved by the old Files dialog come over once */
export async function listProjects(): Promise<Project[]> {
  let migrate = false;
  try {
    migrate = !localStorage.getItem(MIGRATED);
  } catch {
    // no storage: nothing to bring over
  }
  if (migrate) {
    const old = listDocs();
    for (const d of old) await putProject({ id: newId(), created: d.updated, updated: d.updated, name: d.name, lines: d.lines, geo: null, pictures: [], figure: {}, tool: 'graph' });
    try {
      localStorage.setItem(MIGRATED, '1');
    } catch {
      // brought over again next time; names stay the same
    }
  }
  const all = await run<Project[]>('readonly', (s) => s.getAll() as IDBRequest<Project[]>);
  return all.sort((a, b) => b.updated - a.updated);
}
export const getProject = (id: string) => run<Project | undefined>('readonly', (s) => s.get(id) as IDBRequest<Project | undefined>);
export const putProject = (p: Project) => run('readwrite', (s) => s.put(p)).then(() => p);
export const deleteProject = (id: string) => run('readwrite', (s) => s.delete(id)).then(() => undefined);

/** a free name like "Heart (2)" when the name is taken */
export function freeName(name: string, taken: string[]): string {
  const set = new Set(taken);
  if (!set.has(name)) return name;
  const base = name.replace(/ \(\d+\)$/, '');
  for (let k = 2; ; k++) if (!set.has(`${base} (${k})`)) return `${base} (${k})`;
}

// ---- files

const FORMAT = 'curvelet-project';
const OLD_FORMAT = 'calculator-worksheet';

export function projectFile(p: ProjectData & { thumb?: string }): string {
  const { name, lines, geo, pictures, figure, settings, sheet, tool, thumb } = p;
  return JSON.stringify({ format: FORMAT, version: 1, name, tool, lines, geo, pictures, figure, settings, sheet, thumb }, null, 1);
}

/** a file's text back into a project; worksheets from the old Files dialog open too */
export function readProjectFile(text: string, fallbackName: string): (ProjectData & { thumb?: string }) | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if ((o.format !== FORMAT && o.format !== OLD_FORMAT) || !Array.isArray(o.lines)) return null;
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 80) : fallbackName;
  const tool: ProjectTool = ['graph', 'calc', 'geo', 'sheet'].includes(o.tool as string) ? (o.tool as ProjectTool) : 'graph';
  return {
    name,
    tool,
    lines: o.lines.slice(0, 2000).flatMap((l) => cleanLine(l) ?? []),
    geo: o.geo && typeof o.geo === 'object' ? o.geo : null,
    pictures: Array.isArray(o.pictures) ? o.pictures.filter((p) => p && typeof p === 'object' && typeof (p as { src?: unknown }).src === 'string') : [],
    figure: o.figure && typeof o.figure === 'object' ? (o.figure as Record<string, unknown>) : {},
    settings: o.settings && typeof o.settings === 'object' ? (o.settings as Partial<EvalSettings>) : undefined,
    sheet: o.sheet && typeof o.sheet === 'object' ? o.sheet : undefined,
    thumb: typeof o.thumb === 'string' && o.thumb.startsWith('data:image/') ? o.thumb : undefined,
  };
}

export const projectFileName = (name: string) => `${name.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'project'}.curvelet`;

export function downloadText(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
