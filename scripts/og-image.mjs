// طفّيها — the link preview image (Instagram, WhatsApp, X, Facebook…): assets/og-image.png, 1200×630.
//
//   node scripts/og-image.mjs
//
// The wordmark sits in the middle so a square crop (some apps show one) still shows it whole.
// Renders with headless Chrome and the app's own fonts.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'assets', 'og-image.png');
const href = (p) => pathToFileURL(join(root, p)).href;

const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found. Set CHROME=/path/to/chrome');

const page = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<link rel="stylesheet" href="${href('css/fonts.css')}">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #1b1716; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; color: #fff; }
  .word { width: 430px; height: auto; display: block; margin-top: 10px; }
  h1 { margin: 0; font-family: 'Alexandria', sans-serif; font-weight: 800; font-size: 46px; line-height: 1.3; }
  p { margin: 0; font-family: 'Readex Pro', sans-serif; font-size: 27px; color: #b9b4b0; }
  .url { position: absolute; bottom: 34px; left: 0; right: 0; text-align: center; direction: ltr;
    font-family: 'Readex Pro', sans-serif; font-weight: 500; font-size: 24px; color: #7f7976; letter-spacing: .5px; }
  .ember { position: absolute; top: 0; left: 0; right: 0; height: 8px; background: #e1261c; }
</style>
<body>
  <i class="ember"></i>
  <img class="word" src="${href('assets/brand/tafiha-logo-transparent-light.svg')}" alt="">
  <h1>بنطفّيها سوا، خطوة خطوة.</h1>
  <p>سجاير · فيب · أرجيلة</p>
  <div class="url">tafiha.com</div>
</body></html>`;

const work = join(tmpdir(), `tafiha-og-${process.pid}`);
mkdirSync(work, { recursive: true });
try {
  const file = join(work, 'og.html');
  writeFileSync(file, page);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--virtual-time-budget=3000',
    '--window-size=1200,630', `--screenshot=${out}`, pathToFileURL(file).href,
  ], { stdio: 'ignore' });
  if (!existsSync(out) || statSync(out).size < 1000) throw new Error('Render failed');
  console.log(`assets/og-image.png  1200×630  ${Math.round(statSync(out).size / 1024)} KB`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
