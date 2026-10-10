// Composition — prints the sw.js ASSETS block for the current src/ tree.
// Usage: node scripts/gen-sw-manifest.mjs
// Paste the output into sw.js and bump CACHE (composition-vNN).
// Paths are the compiled dist/js locations (tsc: rootDir src -> outDir dist/js).
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
function walk(dir, base) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = (base ? base + '/' : '') + name;
    if (statSync(full).isDirectory()) {
      if (name === '.git' || name === 'dist' || name === 'node_modules' || name === '.temp') continue;
      walk(full, rel);
    } else if (/\.ts$/.test(name) && rel.startsWith('src/')) {
      files.push('./js/' + rel.slice(4).replace(/\.ts$/, '.js'));
    }
  }
}
walk(join(ROOT, 'src'), 'src');
const fixed = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/maskable.svg'
];
console.log([...fixed, ...files].map((f) => `  '${f}',`).join('\n'));
