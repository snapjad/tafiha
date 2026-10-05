// طفّيها — Google Play store art: the feature graphic and the phone screenshots, in assets/store/play/.
//
//   node scripts/store-art.mjs
//
// The screens are the real app: the local preview in headless Chrome, a sample journey, and a
// stand-in for the account server (nothing is sent anywhere). Each screen is then framed with a
// caption. Captions live in SHOTS below; the listing text itself is in assets/store/play/listing.md.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPreview } from './preview.mjs';
import { createFromAssessment, DAY } from '../js/store.js';
import { buildReport } from '../js/plan.js';
import { assertAssessment } from '../js/security.js';
import { SUPABASE_URL, SUPABASE_ANON } from '../js/config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'assets', 'store', 'play');
const href = (p) => pathToFileURL(join(root, p)).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found. Set CHROME=/path/to/chrome');

// ---------------------------------------------------------------- the sample journey
// A smoker, 20 a day, quit 12 days ago with patches and gum.
const NOW = Date.now();
const quitAt = NOW - 12 * DAY - 7 * 3600e3 - 41 * 60e3;
const answers = assertAssessment({
  name: 'سامي', age: '25-34', pregnancy: 'no', products: ['cig'], years: '6-10',
  cig_perDay: 20, cig_packPrice: 2.85, cig_packSize: 20,
  ftnd_ttfc: '30', ftnd_forbidden: false, ftnd_hate: 'first', ftnd_morning: true, ftnd_ill: false,
  attempts: '1', triggers: ['coffee', 'car', 'friends'], friends: 'some',
  importance: 9, confidence: 6, reasons: ['health', 'money', 'family'],
  conditions: [], meds: [], nrt_now: 'none', nrt_pref: 'advise', approach: 'abrupt',
  quitMode: 'past', quitAt, assessedAt: quitAt - 2 * DAY,
});
const state = createFromAssessment(answers, buildReport(answers).tx);
state.journeyAt = answers.assessedAt;
const TRIG = ['coffee', 'car', 'friends', 'coffee', 'bored', 'car', 'coffee'];
state.cravings = [3, 3.4, 5.2, 6.1, 8.3, 9.7, 11.2].map((d, i) => ({
  at: quitAt + d * DAY, dur: 190e3, outcome: 'beaten', before: [8, 7, 7, 6, 5, 5, 4][i], after: [4, 3, 3, 3, 2, 2, 1][i], trigger: TRIG[i], gum: i < 3,
}));

// the published texts (daily messages…), read like the app reads them; none if offline
async function publicContent() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tafiha_public_content`, {
      method: 'POST', headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' }, body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

// stands in for js/vendor/supabase.js: a signed-in account holding the sample journey
const fakeServer = (signedIn, content) => `
  const user = ${JSON.stringify({ id: 'store-shot', email: 'sami@example.com', user_metadata: { full_name: 'سامي' } })};
  const done = (v) => { const p = Promise.resolve(v); p.abortSignal = () => p; return p; };
  const answer = {
    tafiha_me_pull: { data: { data: ${JSON.stringify(state)}, rev: 1 } },
    tafiha_me_push: { data: 2 },
    tafiha_public_content: { data: ${JSON.stringify(content)} },
    tafiha_app_config: { data: { signups_open: true, consult_enabled: false, min_version: 0 } },
  };
  window.supabase = { createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: ${signedIn ? '{ user }' : 'null'} } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    rpc: (name) => done(answer[name] || { data: null }),
    channel: () => { const c = { on: () => c, subscribe: () => c, send() {} }; return c; },
    removeChannel() {},
  }) };`;

// ---------------------------------------------------------------- Chrome over the DevTools protocol
async function launch() {
  const dir = mkdtempSync(join(tmpdir(), 'tafiha-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb',
    '--allow-file-access-from-files', '--lang=ar', 'about:blank'], { stdio: 'ignore' });
  let url = null;
  for (let i = 0; i < 150 && !url; i++) {
    try { const [port, path] = readFileSync(join(dir, 'DevToolsActivePort'), 'utf8').split('\n'); url = `ws://127.0.0.1:${port}${path}`; }
    catch { await sleep(100); }
  }
  if (!url) throw new Error('Chrome did not start');
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map(), listeners = new Set();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else for (const f of listeners) f(msg);
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  return {
    send,
    on: (f) => listeners.add(f),
    async close() { ws.close(); proc.kill(); await sleep(300); rmSync(dir, { recursive: true, force: true }); },
  };
}

async function newPage(chrome, { width, height, scale }) {
  const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await chrome.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => chrome.send(method, params, sessionId);
  await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: scale > 1 });
  const evaluate = async (expression) => {
    const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate failed');
    return r.result.value;
  };
  const until = async (expression, ms = 15000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(150)) if (await evaluate(expression).catch(() => false)) return;
    throw new Error(`timed out waiting for ${expression}`);
  };
  const shot = async () => Buffer.from((await s('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  return { s, sessionId, evaluate, until, shot, close: () => chrome.send('Target.closeTarget', { targetId }) };
}

// One app screen: open the preview with the stand-in server, then run `act` and photograph it.
const BOOTED = "!!document.body && !document.body.classList.contains('booting')";
async function appScreen(chrome, base, { signedIn = true, content, act = '', wait = 2600, ready = BOOTED }) {
  // 390×750 fills the frame below the caption exactly, tab bar included
  const page = await newPage(chrome, { width: 390, height: 750, scale: 3 });
  // the website's offline cache (service worker) would answer before the stand-in server can
  await page.s('Network.enable');
  await page.s('Network.setBypassServiceWorker', { bypass: true });
  await page.s('Fetch.enable', { patterns: [{ urlPattern: '*/js/vendor/supabase.js' }, { urlPattern: 'https://*.supabase.co/*' }] });
  chrome.on((msg) => {
    if (msg.method !== 'Fetch.requestPaused' || msg.sessionId !== page.sessionId) return;
    const { requestId, request } = msg.params;
    if (request.url.endsWith('/js/vendor/supabase.js')) {
      page.s('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from(fakeServer(signedIn, content)).toString('base64') }).catch(() => {});
    } else page.s('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
  });
  await page.s('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear();
      ${signedIn ? `localStorage.setItem('tafiha.intro', '1');
      localStorage.setItem('tafiha.v1:store-shot', ${JSON.stringify(JSON.stringify(state))});` : ''}
      sessionStorage.setItem('seeded', '1');
    }` });
  await page.s('Page.navigate', { url: base });
  await page.until(`document.fonts.status === 'loaded' && ${ready}`);
  if (act) await page.evaluate(`(async () => { ${act} })()`);
  await sleep(wait);
  await page.evaluate('document.activeElement?.blur()'); // no focus rings in the pictures
  const png = await page.shot();
  await page.close();
  return png;
}

// ---------------------------------------------------------------- the frames
const INK = '#1b1716', EMBER = '#e1261c';
const fonts = `<link rel="stylesheet" href="${href('css/fonts.css')}">`;

const SHOTS = [
  { name: 'screen-1-home', title: 'كل ثانية بدون دخان محسوبة', sub: 'عدّاد إقلاعك، وكم سيجارة ما دخّنت، وكم وفّرت' },
  { name: 'screen-2-craving', title: 'جاتك رغبة؟ اكبس وخلّيها تعدّي', sub: 'تنفّس معنا، والموجة بتنزل خلال دقايق', wait: 4200,
    act: `const tap = async (sel, ms) => { document.querySelector(sel).click(); await new Promise(r => setTimeout(r, ms)); };
      await tap('#cravingBtn', 900); await tap('[data-v="7"]', 900); await tap('[data-t=coffee]', 900); await tap('#cvGo', 0);` },
  { name: 'screen-3-report', title: 'تقرير وخطة على مقاسك', sub: 'من مقابلة قصيرة، ومبنية على مصادر طبية موثوقة', act: `document.querySelector('[data-tab=plan]').click(); await new Promise(r => setTimeout(r, 400)); document.querySelector('#planBtn').click();` },
  { name: 'screen-4-plan', title: 'العلكة واللزقات بجدول واضح', sub: 'بتعرف شو تاخد، وقديش، وإيمتى تخفّف', act: `document.querySelector('[data-tab=plan]').click();` },
  { name: 'screen-5-body', title: 'شوف جسمك كيف عم يتصلّح', sub: 'من أول 20 دقيقة لسنين لقدّام', act: `document.querySelector('[data-tab=body]').click();` },
  { name: 'screen-6-welcome', title: 'سجاير، فيب، أرجيلة', sub: 'بنطفّيها سوا، خطوة خطوة', signedIn: false, wait: 3200, ready: "!!document.querySelector('.intro-page')" },
];

const frame = (shotFile, { title, sub }) => `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">${fonts}
<style>
  html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: ${INK}; color: #fff; }
  body { position: relative; }
  .ember { position: absolute; top: 0; left: 0; right: 0; height: 14px; background: ${EMBER}; }
  header { position: absolute; top: 110px; left: 70px; right: 70px; text-align: center; }
  h1 { margin: 0; font-family: 'Alexandria', sans-serif; font-weight: 800; font-size: 78px; line-height: 1.25; }
  p { margin: 26px 0 0; font-family: 'Readex Pro', sans-serif; font-size: 40px; line-height: 1.45; color: #c9c3bf; }
  .phone { box-sizing: border-box; position: absolute; left: 50%; top: 470px; width: 780px; transform: translateX(-50%);
    border-radius: 64px 64px 0 0; padding: 18px 18px 0; background: #2b2523; box-shadow: 0 -10px 80px rgba(225, 38, 28, .18); }
  .phone img { display: block; width: 100%; border-radius: 48px 48px 0 0; }
</style>
<body><i class="ember"></i>
  <header><h1>${title}</h1><p>${sub}</p></header>
  <div class="phone"><img src="${pathToFileURL(shotFile).href}" alt=""></div>
</body></html>`;

const feature = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">${fonts}
<style>
  html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; background: ${INK}; color: #fff; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; }
  .word { width: 380px; display: block; }
  h1 { margin: 0; font-family: 'Alexandria', sans-serif; font-weight: 800; font-size: 44px; }
  p { margin: 0; font-family: 'Readex Pro', sans-serif; font-size: 26px; color: #b9b4b0; }
  .ember { position: absolute; bottom: 0; left: 0; right: 0; height: 10px; background: ${EMBER}; }
</style>
<body>
  <img class="word" src="${href('assets/brand/tafiha-logo-transparent-light.svg')}" alt="">
  <h1>بنطفّيها سوا، خطوة خطوة.</h1>
  <p>سجاير · فيب · أرجيلة</p>
  <i class="ember"></i>
</body></html>`;

async function render(chrome, html, size, file) {
  const work = mkdtempSync(join(tmpdir(), 'tafiha-frame-'));
  try {
    const page = await newPage(chrome, { ...size, scale: 1 });
    writeFileSync(join(work, 'f.html'), html);
    await page.s('Page.navigate', { url: pathToFileURL(join(work, 'f.html')).href });
    await page.until(`document.readyState === 'complete' && document.fonts.status === 'loaded' && [...document.images].every((i) => i.complete && i.naturalWidth)`);
    await sleep(300);
    writeFileSync(file, await page.shot());
    await page.close();
  } finally { rmSync(work, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- go
mkdirSync(out, { recursive: true });
const server = await createPreview();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const chrome = await launch();
const raw = mkdtempSync(join(tmpdir(), 'tafiha-raw-'));
try {
  const content = await publicContent();
  for (const shot of SHOTS) {
    const file = join(raw, `${shot.name}.png`);
    writeFileSync(file, await appScreen(chrome, base, { content, ...shot }));
    await render(chrome, frame(file, shot), { width: 1080, height: 1920 }, join(out, `${shot.name}.png`));
    console.log(`assets/store/play/${shot.name}.png`);
  }
  await render(chrome, feature, { width: 1024, height: 500 }, join(out, 'feature-graphic.png'));
  console.log('assets/store/play/feature-graphic.png');
} finally {
  await chrome.close();
  server.close();
  rmSync(raw, { recursive: true, force: true });
}
