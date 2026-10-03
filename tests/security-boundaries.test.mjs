import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { assertState, assertRemote, assertJSON } from '../js/security.js';
import { createState, load, save } from '../js/store.js';
import { createPreview } from '../scripts/preview.mjs';

test('malformed numeric fields and prototype keys cannot enter a journey', () => {
  for (const change of [
    (s) => { s.nrt.dailyMax = '<img src=x onerror=alert(1)>'; },
    (s) => { s.goal = { title: 'test', amount: '" autofocus onfocus=alert(1)' }; },
    (s) => { s.nrt.logs = [NaN]; },
    (s) => { s.cravings = [{ at: 'invalid' }]; },
    (s) => { s._del = JSON.parse('{"__proto__":123}'); },
    (s) => { s.assessment = { products: ['cig'], nrt_pref: 'constructor' }; },
  ]) {
    const s = createState(); change(s);
    assert.throws(() => assertState(s));
  }
  const s = createState({ name: '<b>Plain text name</b>' });
  assert.equal(assertState(s), s, 'Free text is escaped by templates, not destroyed');
  assert.throws(() => assertRemote({ rev: '1', data: s }));
  assert.throws(() => assertRemote({ rev: 1, data: null }));
  let deep = {};
  for (let i = 0; i < 15; i++) deep = { deep };
  assert.throws(() => assertJSON(deep));
});

test('invalid stored data is preserved instead of becoming an empty journey', () => {
  let raw = '{bad json';
  globalThis.localStorage = { getItem: () => raw, setItem: (_, v) => { raw = v; } };
  assert.throws(() => load());
  assert.equal(raw, '{bad json');
  assert.throws(() => save({}));
  assert.equal(raw, '{bad json');
});

test('preview exposes only public app files and sends security headers', async () => {
  const server = await createPreview();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    for (const path of ['/.env.local', '/.git/config', '/supabase/schema.sql', '/tests/live-accounts.mjs', '/js/', '/js/%2e%2e%2f.env.local', '/js%5c..%5c.env.local']) {
      const res = await fetch(base + path);
      assert.equal(res.status, 404, path);
    }
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    const hostileHost = await new Promise((resolve, reject) => {
      http.get(base, { headers: { host: 'untrusted.example' } }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(hostileHost, 403);
    assert.equal((await fetch(base + '/js/security.js')).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('offline cache excludes callback URLs, APIs, unknown files and unrelated caches', async () => {
  const listeners = {}, deleted = [], puts = [];
  const scope = 'https://tafiha.example/app/';
  const swText = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  const current = swText.match(/const CACHE = '(tafiha-v\d+)'/)[1];
  const older = ['tafiha-v9', 'tafiha-v11', 'tafiha-v12', 'tafiha-v13', 'tafiha-v14'].filter((k) => k !== current);
  const caches = {
    keys: async () => [...older, current, 'other-app-cache'],
    delete: async (key) => { deleted.push(key); },
    open: async () => ({ put: async (...args) => { puts.push(args); } }),
    match: async () => undefined,
  };
  const sandbox = {
    self: { registration: { scope }, addEventListener: (name, fn) => { listeners[name] = fn; }, clients: { claim() {} } },
    location: new URL(scope), URL, Set, Promise, Response, caches,
    fetch: async () => new Response('ok'),
  };
  vm.runInNewContext(swText, sandbox);
  let activation;
  listeners.activate({ waitUntil: (p) => { activation = p; } });
  await activation;
  assert.deepEqual(deleted, older, 'old versions of this app go, the current one and other apps stay');
  for (const url of [scope + '?code=secret', scope + '?r=reset', scope + '.env.local', scope + 'missing.js', 'https://wgwbgutzwqkrugfkcchc.supabase.co/rest/v1/rpc/tafiha_me_pull', 'https://evilfonts.gstatic.com/font']) {
    listeners.fetch({ request: { url, method: 'GET' }, respondWith: () => assert.fail(`Unexpected cache: ${url}`) });
  }
  let response;
  const waits = [];
  const request = { url: scope + 'js/security.js', method: 'GET' };
  listeners.fetch({ request, respondWith: (p) => { response = p; }, waitUntil: (p) => { waits.push(p); } });
  assert.equal((await response).status, 200);
  await Promise.all(waits);
  assert.equal(puts.length, 1);
  sandbox.fetch = async () => { throw new Error('offline'); };
  listeners.fetch({ request, respondWith: (p) => { response = p; } });
  assert.equal((await response).type, 'error', 'A missing JS file must not receive HTML');
});

test('every app module is in the offline shell, and the only outside script is Turnstile', async () => {
  const { readdir } = await import('node:fs/promises');
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  for (const file of await readdir(new URL('../js/', import.meta.url))) {
    if (file.endsWith('.js')) assert.ok(sw.includes(`'./js/${file}'`), `sw.js SHELL is missing js/${file}`);
  }
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const csp = index.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const directive = (name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `));
  assert.equal(directive('script-src'), "script-src 'self' https://challenges.cloudflare.com");
  assert.equal(directive('frame-src'), "frame-src 'self' https://challenges.cloudflare.com");
  assert.match(index, /<meta name="referrer" content="strict-origin-when-cross-origin">/);
});

test('the admin page is locked down and never cached for offline use', async () => {
  const admin = await readFile(new URL('../admin.html', import.meta.url), 'utf8');
  const csp = admin.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(admin, /<meta name="robots" content="noindex, nofollow">/);
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sw, /admin/);
  const sql = await readFile(new URL('../supabase/admin.sql', import.meta.url), 'utf8');
  // every admin function checks the role and the second step on the server
  for (const fn of sql.matchAll(/create or replace function public\.(tafiha_admin_(?!me)\w+)/g)) {
    const body = sql.slice(fn.index, sql.indexOf('end $$;', fn.index));
    assert.match(body, /tafiha_staff_check\(array\['owner'/, `${fn[1]} must check the staff role`);
  }
  assert.match(sql, /coalesce\(auth\.jwt\(\) ->> 'aal', 'aal1'\) <> 'aal2'/);
});
