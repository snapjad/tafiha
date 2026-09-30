// طفّيها — live sync between a person's devices.
//
// The device keeps a random secret key; the server stores the whole state under
// its hash and hands it back only to holders of the key (see supabase/schema.sql).
// Saves are optimistic: push with the last revision we saw, and on a conflict
// pull, merge and try again. After each save the device pings the others over a
// realtime channel (the ping carries only the revision number), and they pull.
import { merge, touch, snapshot } from './merge.js';
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

const LS = 'tafiha.sync';
const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let api = null;          // { getState, setState, onStatus }
let sb = null;
let chan = null;
let meta = { key: null, rev: 0 };
let snap = null;
let timer = 0;
let busy = false;
let again = false;
let status = 'off';

export const enabled = () => !!SUPABASE_ANON;
export const getStatus = () => status;
export const linked = () => !!meta.key;

function setStatus(s) {
  status = s;
  api?.onStatus?.(s);
}

function loadMeta() {
  try { return { key: null, rev: 0, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch (e) { return { key: null, rev: 0 }; }
}

function saveMeta() {
  try { localStorage.setItem(LS, JSON.stringify(meta)); } catch (e) { /* ignore */ }
}

function newKey() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function client() {
  if (sb) return sb;
  const mod = await import(SDK);
  sb = mod.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return sb;
}

async function subscribe() {
  if (!sb || !meta.key) return;
  if (chan) sb.removeChannel(chan);
  const name = `tf-${(await sha(`${meta.key}:ch`)).slice(0, 32)}`;
  chan = sb.channel(name, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'rev' }, ({ payload }) => { if ((payload?.rev || 0) > meta.rev) pull(); })
    .subscribe();
}

export async function initSync(opts) {
  api = opts;
  meta = loadMeta();
  snap = snapshot(api.getState());
  if (!enabled()) { setStatus('off'); return; }
  try { await client(); } catch (e) { setStatus('offline'); return; }
  window.addEventListener('online', () => { if (meta.key) { pull(); schedule(200); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && meta.key) pull(); });
  if (!meta.key && api.getState()) { meta.key = newKey(); saveMeta(); }
  if (!meta.key) { setStatus('ok'); return; }
  await pull();
  schedule(0);
  subscribe();
}

// call after every local change (before saving to localStorage)
export function changed(state) {
  snap = touch(state, snap);
  if (!sb) return;
  if (!meta.key) { meta.key = newKey(); saveMeta(); subscribe(); }
  schedule();
}

function schedule(ms = 700) {
  clearTimeout(timer);
  timer = setTimeout(push, ms);
}

async function push() {
  if (!sb || !meta.key) return;
  if (busy) { again = true; return; }
  busy = true;
  setStatus('syncing');
  try {
    for (let i = 0; i < 4; i++) {
      const local = api.getState();
      if (!local) break;
      const { data: n, error } = await sb.rpc('tafiha_push', { k: meta.key, d: local, base: meta.rev });
      if (error) throw error;
      if (n > 0) {
        meta.rev = n;
        saveMeta();
        chan?.send({ type: 'broadcast', event: 'rev', payload: { rev: n } });
        setStatus('ok');
        break;
      }
      await pull(true); // someone saved first: take their copy, merge, try again
    }
  } catch (e) {
    setStatus(navigator.onLine ? 'error' : 'offline');
  }
  busy = false;
  if (again) { again = false; schedule(300); }
}

async function pull(quiet = false) {
  if (!sb || !meta.key) return;
  try {
    const { data, error } = await sb.rpc('tafiha_pull', { k: meta.key });
    if (error) throw error;
    if (!data) { if (!quiet) setStatus('ok'); return; }
    const local = api.getState();
    const merged = merge(local, data.data);
    meta.rev = data.rev;
    saveMeta();
    const was = JSON.stringify(local);
    const now = JSON.stringify(merged);
    if (now !== was) { snap = snapshot(merged); api.setState(merged); }
    if (now !== JSON.stringify(data.data)) schedule(300); // this device has something the server lacks
    else if (!quiet) setStatus('ok');
  } catch (e) {
    setStatus(navigator.onLine ? 'error' : 'offline');
  }
}

// make sure the server has our latest copy (needed before linking)
export async function flush() {
  clearTimeout(timer);
  if (!meta.key) { meta.key = newKey(); saveMeta(); }
  await push();
}

export async function makeCode() {
  await client();
  await flush();
  const { data, error } = await sb.rpc('tafiha_make_code', { k: meta.key });
  if (error) throw error;
  return data;
}

// join another device's data; this device's copy is replaced by theirs
export async function claimCode(code) {
  await client();
  const { data: key, error } = await sb.rpc('tafiha_claim_code', { c: code });
  if (error) throw error;
  if (!key) return false;
  const { data, error: e2 } = await sb.rpc('tafiha_pull', { k: key });
  if (e2) throw e2;
  meta = { key, rev: data?.rev || 0 };
  saveMeta();
  if (data?.data) {
    snap = snapshot(data.data);
    api.setState(data.data);
  }
  subscribe();
  setStatus('ok');
  return true;
}

// start over with a fresh, unlinked copy
export function forget() {
  if (chan && sb) sb.removeChannel(chan);
  chan = null;
  meta = { key: null, rev: 0 };
  saveMeta();
  snap = null;
}
