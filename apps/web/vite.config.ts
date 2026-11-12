import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** every file under a folder, as paths relative to it */
function walk(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p, root) : [relative(root, p).split('\\').join('/')];
  });
}

/**
 * Writes dist/sw.js after the build: the service worker that makes the app
 * work offline. The app itself (HTML, scripts, styles, fonts, icons) is
 * stored when it installs; Pyodide (17 MB) is stored the first time the
 * symbolic engine loads it, so the first visit isn't slowed by it. The
 * version is a hash of the file list and contents, so a new build replaces
 * the old cache.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'calculator-service-worker',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files = walk(outDir).filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      // browsers take .woff2, and the Cyrillic and Vietnamese subsets only when the text needs them: those are cached when used.
      // Greek stays: π and θ appear all over the app
      const core = files.filter((f) => !f.startsWith('pyodide/') && !/\.woff$/.test(f) && !/-(cyrillic|vietnamese)(-ext)?-/.test(f));
      const hash = createHash('sha256');
      for (const f of core) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync(new URL('./src/sw-template.js', import.meta.url), 'utf8');
      const sw = template.replace('__VERSION__', version).replace('__CORE__', JSON.stringify(['./', ...core.map((f) => `./${f}`)]));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  // relative paths, so the same build runs on a web server, in Capacitor and in Tauri
  base: './',
  plugins: [react(), serviceWorker()],
  server: { port: 5173, strictPort: true },
});
