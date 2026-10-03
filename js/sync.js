// Sync of a person's journey across their devices, through their account only.
// Without an account the journey stays on this device (nothing is sent anywhere);
// the anonymous pre-accounts endpoints are closed on the server (supabase/hardening.sql).
// A copy synced before accounts existed can still be moved into the account once.
import { merge, touch, snapshot, same } from './merge.js';
import { client, configured } from './sb.js';
import { assertState, assertRemote } from './security.js';

const LS = 'tafiha.sync';
const CHANNEL = /^tf-[0-9a-f]{64}$/;
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
export const linked = () => !!userId;
export function getLegacyKey() {
  try { return JSON.parse(localStorage.getItem(LS) || '{}').key || null; } catch { return null; }
}
export function retireLegacyLink() {
  if (userId) localStorage.removeItem(LS);
}
function setStatus(s) { status = s; api?.onStatus?.(s); }
function saveMeta() { localStorage.setItem(key(), JSON.stringify(meta)); }
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

// The account's realtime channel has a secret name from the server (an HMAC of the user id),
// so nobody else can listen for its pings or send fake ones. Pings carry only a revision.
async function subscribe(run) {
  if (!userId) return;
  let name;
  try {
    const { data, error } = await rpc('tafiha_me_channel', {});
    if (error || typeof data !== 'string' || !CHANNEL.test(data)) return; // sync still works on focus and reconnect
    name = data;
  } catch { return; }
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
  try { meta = { rev: 0, ...JSON.parse(localStorage.getItem(key()) || '{}') }; }
  catch { meta = { rev: 0 }; }
  snap = snapshot(assertState(api.getState()));
  if (!enabled() || !userId) { setStatus('off'); return true; } // no account: this device only
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
  if (!sb || !userId) return;
  schedule();
}

function schedule(ms = 700) {
  clearTimeout(timer);
  timer = setTimeout(() => { if (ready) push(); else refresh(); }, ms);
}

async function refresh() {
  if (!userId) return;
  if (!sb) { if (api) await initSync(api); return; }
  await pull();
}

async function pull() {
  const run = generation;
  if (!sb || !userId) return false;
  try {
    const { data, error } = await rpc('tafiha_me_pull', {});
    if (error) throw error;
    if (run !== generation) return false;
    assertRemote(data);
    if (data && data.rev < meta.rev && ready) return true;
    let merged = merge(api.getState(), data?.data);
    if (meta.legacyKey) {
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
  if (!sb || !userId || !ready) return false;
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
      const { data: n, error } = await rpc('tafiha_me_push', { d: payload, base: meta.rev });
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
  if (!userId) return true; // nothing to send without an account
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
  // Keep the original server row until the account copy is saved. A failed import can be retried.
  meta.legacyKey = legacyKey;
  saveMeta();
  ready = false;
  if (!await pull()) return false;
  return flush();
}

export function forget() {
  stop();
  localStorage.removeItem(key());
  meta = { rev: 0 };
  snap = null;
}
