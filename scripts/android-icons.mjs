// طفّيها — launcher icons for Android 7.0–7.1 (API 24–25), which can't use the adaptive icon
// in res/mipmap-anydpi-v26/ (the vector mark on ink). Newer phones never read these PNGs.
//
//   node scripts/android-icons.mjs
//
// Renders assets/brand/tafiha-icon.svg with headless Chrome on a transparent page: a rounded
// square (ic_launcher.png) and a circle (ic_launcher_round.png) for every density.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const icon = join(root, 'assets', 'brand', 'tafiha-icon.svg');
const res = join(root, 'android', 'app', 'src', 'main', 'res');
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found. Set CHROME=/path/to/chrome');

const work = join(tmpdir(), `tafiha-android-icons-${process.pid}`);
mkdirSync(work, { recursive: true });
try {
  for (const [density, size] of Object.entries(DENSITIES)) {
    for (const [file, radius] of [['ic_launcher.png', '22%'], ['ic_launcher_round.png', '50%']]) {
      const page = join(work, `${density}-${file}.html`);
      // a 1-px inset keeps the anti-aliased edge inside the canvas
      writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>
        html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}
        div{position:absolute;left:1px;top:1px;width:${size - 2}px;height:${size - 2}px;border-radius:${radius};overflow:hidden}
        img{display:block;width:100%;height:100%}
      </style><div><img src="${pathToFileURL(icon).href}"></div>`);
      const dest = join(res, `mipmap-${density}`, file);
      mkdirSync(join(dest, '..'), { recursive: true });
      execFileSync(CHROME, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        '--default-background-color=00000000', `--window-size=${size},${size}`,
        `--screenshot=${dest}`, pathToFileURL(page).href,
      ], { stdio: 'ignore' });
      if (!existsSync(dest) || statSync(dest).size < 100) throw new Error(`Render failed: ${density}/${file}`);
      console.log(`  mipmap-${density}/${file}  ${size}×${size}`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
