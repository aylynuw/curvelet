// Builds a self-hosted Pyodide folder with SymPy, so the symbolic engine works offline
// and the app never loads code from a CDN at runtime.
//   - copies the Pyodide core files from node_modules/pyodide
//   - downloads the sympy and mpmath wheels once, checked against pyodide-lock.json's sha256
// Output: packages/cas/pyodide-dist (and a copy in apps/web/public/pyodide).
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const casDir = join(here, '..');
const out = join(casDir, 'pyodide-dist');
const webOut = join(casDir, '..', '..', 'apps', 'web', 'public', 'pyodide');
const require = createRequire(import.meta.url);
const pyodideDir = dirname(require.resolve('pyodide/package.json'));
const { version } = JSON.parse(readFileSync(join(pyodideDir, 'package.json'), 'utf8'));

const CORE = ['pyodide.mjs', 'pyodide.js', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
const PACKAGES = ['sympy', 'mpmath'];

mkdirSync(out, { recursive: true });
for (const f of CORE) cpSync(join(pyodideDir, f), join(out, f));

const lock = JSON.parse(readFileSync(join(pyodideDir, 'pyodide-lock.json'), 'utf8'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

for (const name of PACKAGES) {
  const pkg = lock.packages[name];
  const target = join(out, pkg.file_name);
  if (existsSync(target) && sha256(readFileSync(target)) === pkg.sha256) {
    console.log(`ok      ${pkg.file_name}`);
    continue;
  }
  const url = `https://cdn.jsdelivr.net/pyodide/v${version}/full/${pkg.file_name}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha256(buf) !== pkg.sha256) throw new Error(`${pkg.file_name}: sha256 mismatch, refusing to use it`);
  writeFileSync(target, buf);
  console.log(`fetched ${pkg.file_name} (${(buf.length / 1e6).toFixed(1)} MB, sha256 verified)`);
}

mkdirSync(webOut, { recursive: true });
cpSync(out, webOut, { recursive: true });
console.log(`pyodide ${version} with ${PACKAGES.join(', ')} → ${out} and ${webOut}`);
