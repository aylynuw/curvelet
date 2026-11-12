import type { SymbolicAnswer } from '@math/engine';
import { CAS_PY } from './python';
import type { CasRuntime } from './resolver';

/**
 * SymPy in the current Node process, loaded from a self-hosted Pyodide folder
 * (see scripts/vendor-pyodide.mjs). Used by tests; the app uses a Web Worker.
 */
export async function createNodeRuntime(distDir: string): Promise<CasRuntime> {
  const { loadPyodide } = await import('pyodide');
  const py = await loadPyodide({ indexURL: distDir.endsWith('/') ? distDir : `${distDir}/` });
  await py.loadPackage(['sympy']);
  py.runPython(CAS_PY);
  const run = py.globals.get('run') as (op: string, sources: string, complex: boolean) => string;
  return {
    run: async (op, sources, complex) => JSON.parse(run(op, JSON.stringify(sources), complex)) as SymbolicAnswer,
  };
}
