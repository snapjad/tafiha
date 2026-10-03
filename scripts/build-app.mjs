// طفّيها — copies the app into www/ for the Android build (Capacitor serves it from there).
//
//   node scripts/build-app.mjs      → then: npx cap sync android
//
// The phone app gets the same files as tafiha.com, minus what only the website needs: the
// admin area, the service worker (the app's files are already on the phone) and the store art.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'www');

const FILES = ['index.html', 'privacy.html', 'terms.html', 'delete-account.html', 'manifest.webmanifest'];
const DIRS = ['css', 'js', 'assets'];
const SKIP = [/^js[\\/]admin([\\/]|$)/, /^css[\\/]admin\.css$/, /^assets[\\/]store([\\/]|$)/];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of FILES) cpSync(join(root, f), join(out, f));

let count = FILES.length;
function copy(rel) {
  if (SKIP.some((re) => re.test(rel))) return;
  const src = join(root, rel);
  if (statSync(src).isDirectory()) {
    for (const name of readdirSync(src)) copy(join(rel, name));
    return;
  }
  mkdirSync(join(out, rel, '..'), { recursive: true });
  cpSync(src, join(out, rel));
  count++;
}
for (const d of DIRS) copy(d);

if (!existsSync(join(out, 'js', 'vendor', 'supabase.js'))) throw new Error('vendor libraries missing');
console.log(`www/ ready: ${count} files`);
