import { loadBank, parseBank, type Bank } from '@math/steps';
import BUNDLED from '../../../../problems/bank.json?raw';
import { readZip } from './zip';

/**
 * The exam-style problem set. The app ships with the one in the repository
 * (problems/bank.json); "Get the latest set" downloads that file again from
 * GitHub, and a set can also be read from a file. The set in use is kept on
 * this device, so it works offline.
 */
export const BANK_URL = 'https://raw.githubusercontent.com/aylynuw/curvelet/main/problems/bank.json';
const KEY = 'curvelet.bank.v1';

export type BankSource = 'bundled' | 'download' | 'file';
export interface BankState {
  bank: Bank;
  source: BankSource;
}

function read(text: string): Bank {
  return parseBank(JSON.parse(text)).bank;
}

/** the set in use: the kept one, or the one the app came with */
function initial(): BankState {
  try {
    const kept = localStorage.getItem(KEY);
    if (kept) {
      const { source, text } = JSON.parse(kept) as { source: BankSource; text: string };
      return { bank: read(text), source };
    }
  } catch {
    // a kept set that no longer reads: fall back to the one the app came with
  }
  return { bank: read(BUNDLED), source: 'bundled' };
}

let state: BankState = initial();
loadBank(state.bank);
const listeners = new Set<() => void>();

export const bankState = () => state;
export function onBank(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Uses a set given as JSON text. Throws if it isn't a problem set or has no problems that read. */
export function setBankText(text: string, source: BankSource): { count: number; skipped: number } {
  const { bank, skipped } = parseBank(JSON.parse(text));
  if (bank.problems.length === 0) throw new Error('No problems in this set');
  loadBank(bank);
  state = { bank, source };
  try {
    if (source === 'bundled') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ source, text }));
  } catch {
    // in use for this visit
  }
  listeners.forEach((l) => l());
  return { count: bank.problems.length, skipped: skipped.length };
}

/** Downloads the latest set from the repository. */
export async function downloadBank(): Promise<{ count: number; skipped: number }> {
  const res = await fetch(BANK_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return setBankText(await res.text(), 'download');
}

/** Goes back to the set the app came with. */
export const resetBank = () => setBankText(BUNDLED, 'bundled');

/**
 * Uses a set from a file: one set (.json), or a pack (.zip) of sets whose
 * problems are put together into one.
 */
export async function openBankFile(file: File): Promise<{ count: number; skipped: number }> {
  if (!/\.zip$/i.test(file.name)) return setBankText(await file.text(), 'file');
  const files = (await readZip(await file.arrayBuffer())).filter((f) => /\.json$/i.test(f.name) && !/(^|\/)(__MACOSX|\.)/.test(f.name));
  const sets = files
    .map((f) => {
      try {
        return JSON.parse(f.text) as { format?: string; title?: unknown; problems?: unknown[] };
      } catch {
        return null;
      }
    })
    .filter((s): s is { format: string; title?: unknown; problems: unknown[] } => s?.format === 'curvelet-problems' && Array.isArray(s.problems));
  if (sets.length === 0) throw new Error('No problem sets in this file');
  const name = file.name.replace(/\.zip$/i, '');
  const title = sets.length === 1 && sets[0]!.title ? sets[0]!.title : { ko: `문제집 묶음 (${name})`, en: `Problem pack (${name})` };
  return setBankText(JSON.stringify({ format: 'curvelet-problems', version: 1, title, problems: sets.flatMap((s) => s.problems) }), 'file');
}
