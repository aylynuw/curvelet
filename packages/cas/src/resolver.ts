import { MathError, type EvalSettings, type Node, type SymbolicAnswer, type SymbolicResolver } from '@math/engine';
import { toPython } from './translate';

/** Runs one operation in SymPy. Implemented in-process for Node and as a Web Worker in the app. */
export interface CasRuntime {
  run(op: string, sources: string[], complex: boolean): Promise<SymbolicAnswer>;
}

/**
 * The workspace's link to SymPy: answers from a cache, otherwise starts the
 * work and returns undefined (the line shows as pending). Listeners hear when
 * an answer arrives, so the app can call workspace.refresh().
 */
export class CasResolver implements SymbolicResolver {
  private cache = new Map<string, SymbolicAnswer | 'pending'>();
  private listeners = new Set<() => void>();
  private inflight = 0;
  private waiters: (() => void)[] = [];

  constructor(private runtime: CasRuntime) {}

  /** Called after each answer arrives. Returns an unsubscribe function. */
  onAnswer(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** True while SymPy is working on something. */
  get busy(): boolean {
    return this.inflight > 0;
  }

  /** Resolves when nothing is in flight (for tests and loading states). */
  idle(): Promise<void> {
    return this.inflight === 0 ? Promise.resolve() : new Promise((done) => this.waiters.push(done));
  }

  resolve(op: string, args: Node[], settings: EvalSettings): SymbolicAnswer | undefined {
    let sources: string[];
    try {
      sources = args.map((a) => toPython(a, settings, op));
    } catch (e) {
      if (e instanceof MathError) return { ok: false, error: e.message };
      throw e;
    }
    const key = JSON.stringify([op, sources, settings.complex]);
    const hit = this.cache.get(key);
    if (hit === 'pending') return undefined;
    if (hit) return hit;

    this.cache.set(key, 'pending');
    this.inflight++;
    this.runtime
      .run(op, sources, settings.complex)
      .catch((e: unknown): SymbolicAnswer => ({ ok: false, error: e instanceof Error ? e.message : String(e) }))
      .then((answer) => {
        this.cache.set(key, answer);
        this.inflight--;
        for (const l of this.listeners) l();
        if (this.inflight === 0) this.waiters.splice(0).forEach((w) => w());
      });
    return undefined;
  }
}
