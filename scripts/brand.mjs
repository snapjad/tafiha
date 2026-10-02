// طفّيها — makes every icon size from the brand files in assets/brand/ (see BRAND.md).
//
//   node scripts/brand.mjs                 → writes into assets/
//   node scripts/brand.mjs --out .qa/brand → writes somewhere else (to look before replacing)
//
// Source: assets/brand/tafiha-icon.svg, the app icon (square, full-bleed ink background,
// the mark at ~60% of the height). The mark sits inside the maskable safe zone (the central
// 80% circle), so the same artwork works as Android's maskable icon without padding.
// Renders with headless Chrome, so no image packages are needed.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const icon = join(root, 'assets', 'brand', 'tafiha-icon.svg');
const outArg = process.argv.indexOf('--out');
const out = outArg > 0 ? resolve(process.argv[outArg + 1]) : join(root, 'assets');
const INK = '#1b1716';

const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found. Set CHROME=/path/to/chrome');
if (!existsSync(icon)) throw new Error(`Missing ${icon}`);

const OUTPUTS = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180], // iOS rounds the corners itself
  ['favicon-32.png', 32],
  ['store/play-icon-512.png', 512],
  ['store/ios-icon-1024.png', 1024],
  ['store/instagram-profile-320.png', 320],
];

const work = join(tmpdir(), `tafiha-brand-${process.pid}`);
mkdirSync(work, { recursive: true });
try {
  for (const [file, size] of OUTPUTS) {
    const page = join(work, `${file.replace(/\W/g, '_')}.html`);
    writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>
      html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:${INK}}
      img{display:block;width:${size}px;height:${size}px}
    </style><img src="${pathToFileURL(icon).href}">`);
    const dest = join(out, file);
    mkdirSync(join(dest, '..'), { recursive: true });
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      `--window-size=${size},${size}`, `--screenshot=${dest}`, pathToFileURL(page).href,
    ], { stdio: 'ignore' });
    if (!existsSync(dest) || statSync(dest).size < 100) throw new Error(`Render failed: ${file}`);
    console.log(`  ${file}  ${size}×${size}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (out === join(root, 'assets')) {
  // installed apps only fetch new icons when the service worker's cache name changes
  const swPath = join(root, 'sw.js');
  const sw = readFileSync(swPath, 'utf8');
  const next = sw.replace(/const CACHE = 'tafiha-v(\d+)';/, (_, n) => `const CACHE = 'tafiha-v${Number(n) + 1}';`);
  writeFileSync(swPath, next);
  console.log(`  sw.js → ${next.match(/tafiha-v\d+/)[0]}`);
}
console.log(`\nDone → ${out}`);
