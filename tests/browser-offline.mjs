import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createState } from '../js/store.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const browser = await chromium.connectOverCDP(process.env.TAFIHA_CDP);
const base = process.env.TAFIHA_PREVIEW || 'http://127.0.0.1:5186';
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
const errors = [];
try {
  await context.addInitScript(({ state }) => {
    const user = { id: 'qa-offline', email: 'offline@example.com', user_metadata: { full_name: 'Offline QA' } };
    window.supabase = { createClient: () => ({
      auth: { getSession: async () => ({ data: { session: { user } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      rpc: (name) => ({ abortSignal: async () => name.endsWith('pull') ? { data: { data: state, rev: 1 } } : { data: 2 } }),
      channel: () => { const c = { on: () => c, subscribe: () => c, send() {} }; return c; }, removeChannel() {},
    }) };
  }, { state: createState({ name: 'Offline QA', habits: ['vape'], quitAt: Date.now() - 3 * 864e5 }) });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator('body:not(.booting)').waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.goto(base + '/?code=qa-not-a-real-token');
  await page.locator('body:not(.booting)').waitFor();
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (await Promise.all(names.map(async (name) => (await (await caches.open(name)).keys()).map((r) => r.url)))).flat();
  });
  assert.ok(cached.some((url) => url.endsWith('/js/vendor/jspdf.js')));
  assert.equal(cached.some((url) => new URL(url).searchParams.has('code') || url.includes('supabase.co/') || url.includes('.env')), false);
  await context.setOffline(true);
  await page.reload();
  await page.locator('body:not(.booting)').waitFor();
  assert.equal(await page.locator('#name').textContent(), 'Offline QA');
  const libraries = await page.evaluate(async () => {
    const responses = await Promise.all(['./js/vendor/jspdf.js', './js/vendor/html2canvas.js'].map((url) => fetch(url)));
    return responses.map((r) => ({ status: r.status, type: r.headers.get('content-type') }));
  });
  assert.ok(libraries.every((r) => r.status === 200 && r.type.includes('javascript')));
  const unknown = await page.evaluate(() => fetch('./does-not-exist.js').then(() => 'unexpected response', () => 'network error'));
  assert.equal(unknown, 'network error');
  assert.deepEqual(errors, []);
  console.log('PASS real service worker install, offline reload, cached PDF libraries and callback exclusion');
} finally {
  await context.close();
  await browser.close();
}
