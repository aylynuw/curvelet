/// <reference lib="webworker" />
// Runs SymPy (in Pyodide) off the main thread. Pyodide and the SymPy wheels are
// served from this app's own /pyodide/ folder, so nothing loads from a CDN.
import { CAS_PY } from '@math/cas/src/python';

type Run = (op: string, sources: string, complex: boolean) => string;
let ready: Promise<Run> | null = null;

async function init(): Promise<Run> {
  // built, this worker sits in assets/ beside the app's pyodide/ folder, wherever the app is served from
  const base = import.meta.env.DEV ? `${self.location.origin}/pyodide/` : new URL('../pyodide/', self.location.href).href;
  const { loadPyodide } = (await import(/* @vite-ignore */ `${base}pyodide.mjs`)) as typeof import('pyodide');
  const py = await loadPyodide({ indexURL: base });
  await py.loadPackage(['sympy']);
  py.runPython(CAS_PY);
  self.postMessage({ type: 'ready' });
  return py.globals.get('run') as Run;
}

self.onmessage = async (e: MessageEvent<{ id: number; op: string; sources: string[]; complex: boolean }>) => {
  const { id, op, sources, complex } = e.data;
  try {
    ready ??= init();
    const run = await ready;
    self.postMessage({ type: 'answer', id, answer: JSON.parse(run(op, JSON.stringify(sources), complex)) });
  } catch (err) {
    ready = null;
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'answer', id, answer: { ok: false, error: `The symbolic engine couldn't start: ${message}` } });
  }
};
