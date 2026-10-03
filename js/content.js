// طفّيها — what the team edits in the admin area: announcements, the day's message, craving
// plans and milestone texts. Kept on the device, refreshed when the app opens; the built-in
// texts are the fallback, so everything works offline and before the first fetch.
// Everything coming from here is plain text: it is escaped before it reaches the page.
import { client, configured } from './sb.js';

const LS = 'tafiha.content';
const DISMISSED = 'tafiha.dismissed';
const STALE = 30 * 60 * 1000;
const KINDS = ['announcement', 'daily', 'craving', 'milestone'];
const hasStorage = () => typeof localStorage !== 'undefined';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const str = (v, max) => typeof v === 'string' && v.length <= max;

function valid(x) {
  return !!x && typeof x === 'object' && KINDS.includes(x.kind) && str(x.key, 40) && str(x.body, 600) && x.body.length > 0
    && (x.title === undefined || str(x.title, 80))
    && (x.link === undefined || x.link === '' || (str(x.link, 300) && /^https:\/\/[^\s<>"]+$/.test(x.link)))
    && (x.link_label === undefined || str(x.link_label, 30));
}

let items = [];
let fetchedAt = 0;
let inflight = null;

function load() {
  if (!hasStorage()) return;
  try {
    const c = JSON.parse(localStorage.getItem(LS) || 'null');
    if (c && Array.isArray(c.items)) { items = c.items.filter(valid); fetchedAt = Number(c.at) || 0; }
  } catch { items = []; }
}
load();

// Fetches the latest content when the copy on the device is older than 30 minutes.
// Resolves true when something new arrived.
export function refresh(force = false) {
  if (!configured() || (!force && Date.now() - fetchedAt < STALE)) return Promise.resolve(false);
  inflight ||= (async () => {
    try {
      const c = await client();
      const { data, error } = await c.rpc('tafiha_public_content');
      if (error || !Array.isArray(data)) return false;
      const next = data.filter(valid);
      const changed = JSON.stringify(next) !== JSON.stringify(items);
      items = next;
      fetchedAt = Date.now();
      if (hasStorage()) localStorage.setItem(LS, JSON.stringify({ at: fetchedAt, items }));
      return changed;
    } catch { return false; } finally { inflight = null; }
  })();
  return inflight;
}

const find = (kind, key) => items.find((x) => x.kind === kind && x.key === key);

// An edited text when there is one, otherwise the built-in one; escaped for HTML either way.
export function text(kind, key, fallback) {
  return esc(find(kind, key)?.body ?? fallback);
}

// The message for day `day` of the journey (1 = quit day), escaped, or ''.
export function daily(day) {
  return day >= 1 ? esc(find('daily', String(day))?.body || '') : '';
}

function dismissed() {
  if (!hasStorage()) return [];
  try { const d = JSON.parse(localStorage.getItem(DISMISSED) || '[]'); return Array.isArray(d) ? d : []; } catch { return []; }
}

// The newest announcement that is running now and wasn't closed on this device, or null.
// Fields are escaped; `link` is an https address or ''.
export function announcement(now = Date.now()) {
  const closed = dismissed();
  const live = items.filter((x) => x.kind === 'announcement' && !closed.includes(x.id)
    && (!x.starts_at || Date.parse(x.starts_at) <= now) && (!x.ends_at || Date.parse(x.ends_at) > now));
  const a = live[0];
  return a ? { id: a.id, title: esc(a.title || ''), body: esc(a.body), link: a.link ? esc(a.link) : '', label: esc(a.link_label || 'افتح') } : null;
}

export function dismiss(id) {
  if (!hasStorage()) return;
  localStorage.setItem(DISMISSED, JSON.stringify([id, ...dismissed().filter((x) => x !== id)].slice(0, 50)));
}

// for tests
export function _set(list) { items = list.filter(valid); }
