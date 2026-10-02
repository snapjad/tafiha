import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../js/store.js';
import { merge } from '../js/merge.js';

const values = new Map();
globalThis.localStorage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
let handle, broadcast;
let calls = [];
const fakeClient = {
  rpc(name, args) {
    return { abortSignal(signal) {
      calls.push({ name, args: structuredClone(args) });
      return handle(name, args, signal);
    } };
  },
  channel() {
    const channel = { on(type, filter, cb) { broadcast = cb; return channel; }, subscribe() { return channel; }, send() {} };
    return channel;
  },
  removeChannel() {},
};
window.supabase = { createClient: () => fakeClient };
const Sync = await import('../js/sync.js');
const clone = (s) => structuredClone(s);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let state;
const options = (userId = 'alice') => ({ userId, getState: () => state, setState: (s) => { state = s; } });
test.afterEach(() => { Sync.stop(); values.clear(); calls = []; });

test('failed initial read never uploads over an unseen account', async () => {
  state = createState({ name: 'Local' });
  handle = async () => ({ error: new Error('offline') });
  assert.equal(await Sync.initSync(options()), false);
  state.nrt.logs.push(11);
  Sync.changed(state);
  await pause(800);
  assert.equal(calls.some((c) => c.name === 'tafiha_me_push'), false);
});

test('malformed remote journey is rejected without overwriting the local copy', async () => {
  state = createState({ name: 'Local' });
  const bad = clone(state); bad.nrt.dailyMax = '<img src=x onerror=alert(1)>';
  handle = async () => ({ data: { data: bad, rev: 1 } });
  assert.equal(await Sync.initSync(options()), false);
  assert.equal(state.nrt.dailyMax, 15);
  assert.equal(await Sync.flush(), false);
  assert.equal(calls.some((c) => c.name.endsWith('push')), false);
});

test('late old-link writes cannot mutate a newly paired journey', async () => {
  const oldKey = 'a'.repeat(43), nextKey = 'b'.repeat(43);
  values.set('tafiha.sync', JSON.stringify({ key: oldKey, rev: 1 }));
  state = createState({ name: 'Old' });
  const next = createState({ name: 'New' });
  let deliver;
  handle = async (name, args) => {
    if (name === 'tafiha_claim_code') return { data: nextKey };
    if (name === 'tafiha_pull') return { data: { data: args.k === oldKey ? clone(state) : clone(next), rev: 1 } };
    return new Promise((resolve) => { deliver = resolve; });
  };
  await Sync.initSync(options(null));
  const writing = Sync.flush();
  await pause(0);
  assert.equal(await Sync.claimCode('ABCDEFGH'), true);
  deliver({ data: 99 });
  await writing;
  assert.equal(state.name, 'New');
  assert.deepEqual(JSON.parse(values.get('tafiha.sync')), { key: nextKey, rev: 1 });
});

test('revision conflicts merge logs before retrying the write', async () => {
  state = createState({ name: 'Alice', nrt: {} });
  state.nrt.logs = [1];
  let remote = clone(state), rev = 1, collide = true;
  handle = async (name, args) => {
    if (name === 'tafiha_me_pull') return { data: { data: clone(remote), rev } };
    if (collide) { collide = false; remote.nrt.logs.push(2); rev++; return { data: -1 }; }
    assert.equal(args.base, rev);
    remote = clone(args.d);
    return { data: ++rev };
  };
  await Sync.initSync(options());
  state.nrt.logs.push(3);
  Sync.changed(state);
  assert.equal(await Sync.flush(), true);
  assert.deepEqual(remote.nrt.logs, [1, 2, 3]);
});

test('receiving an identical remote revision does not create a broadcast write loop', async () => {
  state = createState({ name: 'Alice' });
  state = merge(state, state);
  const remote = Object.fromEntries(Object.entries(clone(state)).reverse());
  handle = async () => ({ data: { data: remote, rev: 2 } });
  await Sync.initSync(options());
  broadcast({ payload: { rev: 3 } });
  await pause(850);
  assert.equal(calls.filter((c) => c.name === 'tafiha_me_push').length, 0);
});

test('late data from a stopped account cannot replace the next account', async () => {
  let deliver;
  state = null;
  handle = () => new Promise((resolve) => { deliver = resolve; });
  const first = Sync.initSync(options('alice'));
  await pause(0);
  Sync.stop();
  state = createState({ name: 'Bob' });
  handle = async () => ({ data: { data: clone(state), rev: 1 } });
  await Sync.initSync(options('bob'));
  deliver({ data: { data: createState({ name: 'Alice' }), rev: 99 } });
  await first;
  assert.equal(state.name, 'Bob');
  assert.equal(JSON.parse(values.get('tafiha.sync:bob')).rev, 1);
});

test('legacy import keeps the original server row and retries after failure', async () => {
  state = createState({ name: 'Alice', nrt: {} });
  state.nrt.logs = [1];
  let remote = clone(state), offline = true;
  const old = clone(state); old.nrt.logs = [2];
  handle = async (name, args) => {
    if (name === 'tafiha_me_pull') return { data: { data: clone(remote), rev: 1 } };
    if (name === 'tafiha_pull') return offline ? { error: new Error('offline') } : { data: { data: old, rev: 1 } };
    if (name === 'tafiha_me_retire_legacy') return { data: true };
    remote = clone(args.d); return { data: 2 };
  };
  await Sync.initSync(options());
  assert.equal(await Sync.importLegacy('legacy-key'), false);
  assert.equal(JSON.parse(values.get('tafiha.sync:alice')).legacyKey, 'legacy-key');
  offline = false;
  assert.equal(await Sync.flush(), true);
  assert.deepEqual(remote.nrt.logs, [1, 2]);
  assert.equal(JSON.parse(values.get('tafiha.sync:alice')).legacyKey, undefined);
  assert.equal(calls.some((c) => c.name === 'tafiha_me_adopt'), false);
});

test('a journey with empty (undefined) settings is saved once, not over and over', async () => {
  state = createState({ name: 'Smoker' });
  state.habits.vape.unitPrice = undefined; // what a cigarette-only interview leaves behind
  state.habits.argileh.price = undefined;
  let remote = null, rev = 0;
  handle = async (name, args) => {
    if (name === 'tafiha_me_pull') return { data: remote && { data: clone(remote), rev } };
    remote = JSON.parse(JSON.stringify(args.d)); // the server stores JSON
    return { data: ++rev };
  };
  await Sync.initSync(options());
  state.nrt.logs.push(5);
  Sync.changed(state);
  await pause(2500);
  assert.equal(calls.filter((c) => c.name === 'tafiha_me_push').length, 1);
});

test('the old device copy is erased only after the account copy is saved, and retried if that fails', async () => {
  state = createState({ name: 'Alice', nrt: {} });
  state.nrt.logs = [1];
  const old = clone(state); old.nrt.logs = [2];
  let remote = clone(state), rev = 1, retireFails = true;
  const order = [];
  handle = async (name, args) => {
    order.push(name);
    if (name === 'tafiha_me_pull') return { data: { data: clone(remote), rev } };
    if (name === 'tafiha_pull') return { data: { data: old, rev: 1 } };
    if (name === 'tafiha_me_retire_legacy') return retireFails ? { error: new Error('offline') } : { data: true };
    remote = clone(args.d); return { data: ++rev };
  };
  await Sync.initSync(options());
  assert.equal(await Sync.importLegacy('legacy-key'), true);
  await pause(50);
  assert.deepEqual(remote.nrt.logs, [1, 2]);
  assert.ok(order.indexOf('tafiha_me_retire_legacy') > order.indexOf('tafiha_me_push'), 'erase comes after the save');
  assert.equal(JSON.parse(values.get('tafiha.sync:alice')).retireKey, 'legacy-key', 'kept for a retry');
  retireFails = false;
  await Sync.initSync(options());
  await pause(50);
  assert.equal(JSON.parse(values.get('tafiha.sync:alice')).retireKey, undefined);
});
