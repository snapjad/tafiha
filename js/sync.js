// Account and legacy-device sync share merge rules and one Supabase client.
import { merge, touch, snapshot, same } from './merge.js';
import { client, configured } from './sb.js';
import { assertState, assertRemote } from './security.js';

const LS = 'tafiha.sync';
let api, sb, chan, meta, snap, controller;
let userId = null;
let timer = 0;
let generation = 0;
let busy = false;
let again = false;
let ready = false;
let status = 'off';
let lastBroadcast = 0;
let detach = () => {};
const key = () => userId ? `${LS}:${userId}` : LS;

export const enabled = configured;
export const getStatus = () => status;
export const linked = () => !!(userId || meta?.key);
export function getLegacyKey() {
  try { return JSON.parse(localStorage.getItem(LS) || '{}').key || null; } catch { return null; }
}
export function retireLegacyLink() {
  if (userId) localStorage.removeItem(LS);
}
function setStatus(s) { status = s; api?.onStatus?.(s); }
function saveMeta() { localStorage.setItem(key(), JSON.stringify(meta)); }
function newKey() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function rpc(name, args) { return sb.rpc(name, args).abortSignal(controller.signal); }

export function stop() {
  generation++;
  clearTimeout(timer);
  controller?.abort();
  detach();
  if (chan && sb) sb.removeChannel(chan);
  chan = null;
  busy = again = ready = false;
}
async function subscribe(run) {
  if (!linked()) return;
  const name = userId ? `tf-account-${userId}` : `tf-${(await sha(`${meta.key}:ch`)).slice(0, 32)}`;
  if (run !== generation) return;
  if (chan) sb.removeChannel(chan);
  chan = sb.channel(name, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'rev' }, ({ payload }) => {
      if (run !== generation || !Number.isSafeInteger(payload?.rev) || payload.rev <= meta.rev) return;
      if (Date.now() - lastBroadcast < 2000) return;
      lastBroadcast = Date.now();
      refresh();
    }).subscribe();
}
export async function initSync(opts) {
  stop();
  const run = generation;
  controller = new AbortController();
  api = opts;
  userId = opts.userId || null;
  lastBroadcast = 0;
  try { meta = { key: null, rev: 0, ...JSON.parse(localStorage.getItem(key()) || '{}') }; }
  catch { meta = { key: null, rev: 0 }; }
  snap = snapshot(assertState(api.getState()));
  if (!enabled()) { setStatus('off'); return false; }
  const online = () => refresh();
  const visible = () => { if (!document.hidden) refresh(); };
  window.addEventListener('online', online);
  document.addEventListener('visibilitychange', visible);
  detach = () => {
    window.removeEventListener('online', online);
    document.removeEventListener('visibilitychange', visible);
  };
  try {
    const nextClient = await client();
    if (run !== generation) return false;
    sb = nextClient;
    if (!userId && !meta.key && api.getState()) { meta.key = newKey(); saveMeta(); }
    if (!linked()) { ready = true; setStatus('ok'); return true; }
    const ok = await pull();
    if (run !== generation) return false;
    subscribe(run);
    if (ok) retireLegacyRow(run); // a deletion that failed last time
    return ok;
  } catch {
    if (run === generation) { setStatus('offline'); schedule(30000); }
    return false;
  }
}
export function changed(state) {
  assertState(state);
  snap = touch(state, snap);
  if (!sb) return;
  if (!userId && !meta.key) { meta.key = newKey(); saveMeta(); subscribe(generation); }
  schedule();
}
function schedule(ms = 700) {
  clearTimeout(timer);
  timer = setTimeout(() => { if (ready) push(); else refresh(); }, ms);
}
async function refresh() {
  if (!sb) { if (api) await initSync(api); return; }
  if (linked()) await pull();
}
async function pull() {
  const run = generation;
  if (!sb || !linked()) return false;
  try {
    const { data, error } = await rpc(userId ? 'tafiha_me_pull' : 'tafiha_pull', userId ? {} : { k: meta.key });
    if (error) throw error;
    if (run !== generation) return false;
    assertRemote(data);
    if (data && data.rev < meta.rev && ready) return true;
    let merged = merge(api.getState(), data?.data);
    if (userId && meta.legacyKey) {
      const old = await rpc('tafiha_pull', { k: meta.legacyKey });
      if (old.error) throw old.error;
      if (run !== generation) return false;
      assertRemote(old.data);
      merged = merge(merge(api.getState(), data?.data), old.data?.data);
    }
    assertState(merged);
    meta.rev = data?.rev || 0;
    saveMeta();
    if (merged && !same(merged, api.getState())) {
      snap = snapshot(merged);
      api.setState(merged);
    }
    ready = true;
    setStatus('ok');
    if (merged && (meta.legacyKey || !same(merged, data?.data))) schedule();
    return true;
  } catch {
    if (run === generation) {
      ready = false;
      setStatus(navigator.onLine ? 'error' : 'offline');
      schedule(30000);
    }
    return false;
  }
}
// Best effort; the key stays in meta until the server confirms, so it's retried on the next open.
async function retireLegacyRow(run) {
  const k = meta?.retireKey;
  if (!userId || !k) return;
  try {
    const { error } = await rpc('tafiha_me_retire_legacy', { k });
    if (error || run !== generation) return;
    delete meta.retireKey;
    saveMeta();
  } catch { /* retried on the next open */ }
}
async function push() {
  if (!sb || !linked() || !ready) return false;
  if (busy) { again = true; return false; }
  busy = true;
  const run = generation;
  let saved = false;
  setStatus('syncing');
  try {
    for (let i = 0; i < 4; i++) {
      const local = api.getState();
      if (!local) { setStatus('ok'); saved = true; break; }
      const payload = JSON.parse(JSON.stringify(assertState(local)));
      const args = { d: payload, base: meta.rev };
      if (!userId) args.k = meta.key;
      const { data: n, error } = await rpc(userId ? 'tafiha_me_push' : 'tafiha_push', args);
      if (error) throw error;
      if (run !== generation) return false;
      if (n > 0) {
        meta.rev = n;
        // the old device copy is now inside the account: erase it from the server
        if (meta.legacyKey) { meta.retireKey = meta.legacyKey; delete meta.legacyKey; }
        saveMeta();
        retireLegacyRow(run);
        chan?.send({ type: 'broadcast', event: 'rev', payload: { rev: n } });
        again ||= !same(api.getState(), payload);
        setStatus('ok');
        saved = true;
        break;
      }
      if (!await pull()) break;
      if (run !== generation) return false;
    }
    if (!saved) { setStatus('error'); schedule(30000); }
  } catch {
    if (run === generation) { setStatus(navigator.onLine ? 'error' : 'offline'); schedule(30000); }
  } finally {
    if (run === generation) {
      busy = false;
      if (again) { again = false; schedule(300); }
    }
  }
  return saved;
}
export async function flush() {
  clearTimeout(timer);
  if (!ready && !await pull()) return false;
  const run = generation;
  for (let i = 0; busy && i < 150; i++) await new Promise((resolve) => setTimeout(resolve, 100));
  if (run !== generation || busy) return false;
  clearTimeout(timer);
  return push();
}
export async function importLegacy(legacyKey) {
  if (!userId || !legacyKey) return true;
  // Keep the original server row. A failed import can always be retried.
  meta.legacyKey = legacyKey;
  saveMeta();
  ready = false;
  if (!await pull()) return false;
  return flush();
}
export async function makeCode() {
  if (userId) throw new Error('Sign in on the other device instead');
  if (!await flush()) throw new Error('Sync failed');
  const { data, error } = await rpc('tafiha_make_code', { k: meta.key });
  if (error) throw error;
  if (typeof data !== 'string' || !/^[A-Z2-9]{8}$/.test(data)) throw new Error('Invalid pairing code');
  return data;
}
export async function claimCode(code) {
  if (userId) throw new Error('Legacy pairing is only available outside an account');
  const run = generation;
  const { data: legacyKey, error } = await rpc('tafiha_claim_code', { c: code });
  if (error) throw error;
  if (run !== generation || !legacyKey) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(legacyKey)) throw new Error('Invalid pairing key');
  const { data, error: e2 } = await rpc('tafiha_pull', { k: legacyKey });
  if (e2) throw e2;
  if (run !== generation) return false;
  assertRemote(data);
  if (!data) return false;
  // In-flight work for the old link must not update the newly linked journey.
  const options = api;
  stop();
  meta = { key: legacyKey, rev: data?.rev || 0 };
  saveMeta();
  if (data?.data) { snap = snapshot(data.data); api.setState(data.data); }
  await initSync(options);
  return true;
}
export function forget() {
  stop();
  localStorage.removeItem(key());
  meta = { key: null, rev: 0 };
  snap = null;
}
