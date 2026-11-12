import { useEffect, useState } from 'react';

/**
 * MathLive is about a third of the app, so it loads right after the first
 * paint instead of before it. Until it arrives, fields are plain text boxes
 * and formulas show as text; both upgrade in place.
 */
export type { MathfieldElement } from './mathliveImpl';
type MathLive = typeof import('./mathliveImpl');

let loaded: MathLive | null = null;
let pending: Promise<MathLive> | null = null;

export function loadMathLive(): Promise<MathLive> {
  pending ??= import('./mathliveImpl').then((m) => (loaded = m));
  return pending;
}

/** MathLive once it has loaded, null before */
export function useMathLive(): MathLive | null {
  const [m, setM] = useState(loaded);
  useEffect(() => {
    if (m) return;
    let live = true;
    void loadMathLive().then((mod) => live && setM(mod));
    return () => {
      live = false;
    };
  }, [m]);
  return m;
}
