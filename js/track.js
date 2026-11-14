// طفّيها — anonymous daily counts for the admin area (supabase/visits.sql): a device opened the site,
// came from Instagram, started the interview, finished it. Each step is sent at most once per device
// per day, as one word. Nothing about the person or the device is sent or stored.
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

const LS = 'tafiha.counted';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' });

export function count(step) {
  try {
    const seen = JSON.parse(localStorage.getItem(LS) || '{}');
    if (seen[step] === today()) return;
    seen[step] = today();
    localStorage.setItem(LS, JSON.stringify(seen));
  } catch { return; } // no storage (private mode): don't count, rather than count every load
  if (!SUPABASE_URL || !SUPABASE_ANON) return;
  fetch(`${SUPABASE_URL}/rest/v1/rpc/tafiha_count`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ what: step }),
    keepalive: true,
  }).catch(() => { /* offline: this day's count is a little low */ });
}

// on load: the visit, and Instagram when the link came from there (its in-app browser or ?utm_source=instagram)
export function countVisit() {
  count('visit');
  const src = new URLSearchParams(location.search).get('utm_source') || '';
  if (/^(ig|instagram)$/i.test(src) || /Instagram/.test(navigator.userAgent) || /instagram\.com/.test(document.referrer)) count('instagram');
}
