import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadMathLive } from './math/mathlive';
import { registerServiceWorker } from './pwa';
import { installIndicators } from './ui/indicator';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
installIndicators();

// the opening screen: it stays until its animation has played (about 0.9 s from
// the page's start), then fades away over the app's first paint
function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = still ? 0 : Math.max(0, 950 - performance.now());
  setTimeout(() => {
    requestAnimationFrame(() => {
      splash.classList.add('is-leaving');
      setTimeout(() => splash.remove(), 400);
    });
  }, wait);
}
requestAnimationFrame(hideSplash);

// the math editor follows the first paint
void loadMathLive();

// offline use and updates (the web only)
registerServiceWorker();
