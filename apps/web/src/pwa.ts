/**
 * The service worker: offline use and updates, on the web only. The iOS,
 * Android and desktop apps carry every file already, so they skip it.
 */
type Native = { Capacitor?: { isNativePlatform?: () => boolean }; __TAURI_INTERNALS__?: unknown };

export const isNativeApp = () => {
  const w = window as unknown as Native;
  return !!w.__TAURI_INTERNALS__ || !!w.Capacitor?.isNativePlatform?.();
};

let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();

/** called when a new version has downloaded and is ready to switch to */
export function onUpdateReady(fn: () => void): () => void {
  listeners.add(fn);
  if (waiting) fn();
  return () => listeners.delete(fn);
}

/** switch to the new version: the page reloads once it has taken over */
export function applyUpdate(): void {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage('skip-waiting');
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || isNativeApp()) return;
  if (!/^https?:$/.test(location.protocol)) return;
  const ready = (sw: ServiceWorker) => {
    // the first install takes over quietly; only a replacement asks
    if (!navigator.serviceWorker.controller) return;
    waiting = sw;
    for (const fn of listeners) fn();
  };
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        if (reg.waiting) ready(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          sw?.addEventListener('statechange', () => {
            if (sw.state === 'installed') ready(sw);
          });
        });
        // look for a new version now and then while the app stays open
        setInterval(() => void reg.update(), 60 * 60 * 1000);
      })
      .catch(() => {
        // no offline copy this time; the app still works online
      });
  });
}
