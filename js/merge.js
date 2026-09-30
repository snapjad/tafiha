// طفّيها — merging two copies of the app state (this device and another one).
//
// Settings-like fields (name, quit date, habits, plan...) carry the time they
// were last changed in `_t`, and the newer copy wins field by field.
// Logs (gum, patches, cravings, slips) only grow, so both copies are unioned;
// removals (an "undo") leave a tombstone in `_del` so they don't come back.

const CONFIG = {
  name: (s) => s.name,
  quitAt: (s) => s.quitAt,
  habits: (s) => s.habits,
  goal: (s) => s.goal,
  assessment: (s) => s.assessment,
  prep: (s) => s.prep,
  nrt: (s) => (s.nrt ? strip(s.nrt) : null),
  patch: (s) => (s.patch ? strip(s.patch) : null),
};
const NUMS = ['nrt.logs', 'nrt.packs', 'patch.logs', 'patch.packs'];
const OBJS = ['cravings', 'slips'];

function strip(o) {
  const { logs, packs, ...rest } = o;
  return rest;
}

function get(s, path) {
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), s);
}

function put(s, path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((o, k) => (o ? o[k] : undefined), s);
  if (parent) parent[last] = v;
}

const idOf = (path, item) => `${path}:${typeof item === 'object' ? item.at : item}`;

// what we compare against to notice local changes
export function snapshot(s) {
  const cfg = {};
  const sets = {};
  if (!s) return { cfg, sets };
  for (const k of Object.keys(CONFIG)) cfg[k] = JSON.stringify(CONFIG[k](s) ?? null);
  for (const p of [...NUMS, ...OBJS]) sets[p] = (get(s, p) || []).map((x) => idOf(p, x));
  return { cfg, sets };
}

// stamp what changed since `snap` and record removals; returns the new snapshot
export function touch(s, snap, now = Date.now()) {
  if (!s) return snapshot(s);
  s._t = s._t || {};
  s._del = s._del || {};
  const next = snapshot(s);
  if (snap) {
    for (const k of Object.keys(CONFIG)) if (next.cfg[k] !== snap.cfg[k]) s._t[k] = now;
    for (const p of [...NUMS, ...OBJS]) {
      const after = new Set(next.sets[p]);
      for (const id of snap.sets[p] || []) if (!after.has(id)) s._del[id] = now;
    }
  }
  return next;
}

export function merge(a, b) {
  if (!b) return a;
  if (!a) return b;
  const out = JSON.parse(JSON.stringify(a));
  const ta = a._t || {};
  const tb = b._t || {};
  out._t = { ...ta };

  for (const k of Object.keys(CONFIG)) {
    if ((tb[k] || 0) <= (ta[k] || 0)) continue;
    out._t[k] = tb[k];
    if (k === 'nrt' || k === 'patch') {
      out[k] = b[k] ? { ...JSON.parse(JSON.stringify(strip(b[k]))), logs: out[k]?.logs || [], packs: out[k]?.packs || [] } : null;
    } else {
      out[k] = b[k] === undefined ? undefined : JSON.parse(JSON.stringify(b[k]));
    }
  }

  const del = { ...(a._del || {}) };
  for (const [id, t] of Object.entries(b._del || {})) del[id] = Math.max(del[id] || 0, t);
  out._del = del;

  for (const p of NUMS) {
    if (!get(out, p.split('.')[0])) continue;
    const all = new Set([...(get(a, p) || []), ...(get(b, p) || [])]);
    put(out, p, [...all].filter((v) => !del[idOf(p, v)]).sort((x, y) => x - y));
  }
  for (const p of OBJS) {
    const byAt = new Map();
    for (const item of [...(get(a, p) || []), ...(get(b, p) || [])]) {
      const prev = byAt.get(item.at);
      // the fuller record wins (e.g. one that already has the trigger filled in)
      if (!prev || JSON.stringify(item).length > JSON.stringify(prev).length) byAt.set(item.at, item);
    }
    out[p] = [...byAt.values()].filter((x) => !del[idOf(p, x)]).sort((x, y) => x.at - y.at);
  }
  return out;
}
