import type { CasRuntime } from '@math/cas';
import type { SymbolicAnswer } from '@math/engine';

export type EngineState = 'idle' | 'loading' | 'ready';

const TIME_LIMIT_MS = 30_000;

/**
 * SymPy in a Web Worker. Starts the worker on the first request (Pyodide and
 * SymPy load once, then stay cached by the browser). A request that runs past
 * the time limit restarts the worker, since Python can't be interrupted from outside.
 */
export function createWorkerRuntime(onState: (s: EngineState) => void): CasRuntime {
  let worker: Worker | null = null;
  let nextId = 1;
  const waiting = new Map<number, { done: (a: SymbolicAnswer) => void; timer: ReturnType<typeof setTimeout> }>();

  const start = () => {
    const w = new Worker(new URL('./cas.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ type: 'ready' } | { type: 'answer'; id: number; answer: SymbolicAnswer }>) => {
      if (e.data.type === 'ready') return onState('ready');
      const job = waiting.get(e.data.id);
      if (!job) return;
      clearTimeout(job.timer);
      waiting.delete(e.data.id);
      job.done(e.data.answer);
    };
    onState('loading');
    return w;
  };

  const restart = () => {
    worker?.terminate();
    worker = null;
    for (const [, job] of waiting) {
      clearTimeout(job.timer);
      job.done({ ok: false, error: 'The symbolic engine restarted; edit the line to try again' });
    }
    waiting.clear();
    onState('idle');
  };

  return {
    run(op, sources, complex) {
      worker ??= start();
      const id = nextId++;
      return new Promise<SymbolicAnswer>((done) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          done({ ok: false, error: `This took longer than ${TIME_LIMIT_MS / 1000} seconds, so it was stopped` });
          restart();
        }, TIME_LIMIT_MS);
        waiting.set(id, { done, timer });
        worker!.postMessage({ id, op, sources, complex });
      });
    },
  };
}
