import type { Level, Topic } from '@math/steps';

/**
 * The problems a student has been shown lately, per level and unit, so
 * "New problem" doesn't bring one back for a while. Kept on this device.
 */
const KEY = 'curvelet.practice.recent.v1';
/** how many to remember per level and topic */
export const RECENT = 150;

type Store = Record<string, string[]>;
function load(): Store {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store) ?? {};
  } catch {
    return {};
  }
}
let store: Store = load();

export const recentOf = (level: Level, topic: Topic): string[] => store[`${level}:${topic}`] ?? [];

/** remembers a problem as just seen, oldest first */
export function markSeen(level: Level, topic: Topic, key: string): void {
  const id = `${level}:${topic}`;
  const list = (store[id] ?? []).filter((k) => k !== key);
  list.push(key);
  store = { ...store, [id]: list.slice(-RECENT) };
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // remembered for this visit
  }
}
