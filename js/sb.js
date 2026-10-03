// طفّيها — the Supabase clients (accounts, data and realtime).
// The library ships inside the app (js/vendor), so nothing is fetched from a CDN.
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

let ready = null;
let adminReady = null;

export const configured = () => !!SUPABASE_ANON;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.supabase?.createClient) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('sdk'));
    document.head.appendChild(s);
  });
}

function create(storageKey, detectSessionInUrl) {
  return loadScript(new URL('./vendor/supabase.js', import.meta.url).href).then(() =>
    window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        storageKey,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl,
        flowType: 'pkce',
      },
      global: {
        fetch: (url, init = {}) => fetch(url, {
          ...init,
          signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
        }),
      },
    }));
}

export function client() {
  if (!ready) {
    ready = create('tafiha.auth', true); // coming back from Google or from a reset-password link
    ready.catch(() => { ready = null; });
  }
  return ready;
}

// The admin area keeps its own session, apart from the app's in the same browser.
export function adminClient() {
  if (!adminReady) {
    adminReady = create('tafiha.admin', false);
    adminReady.catch(() => { adminReady = null; });
  }
  return adminReady;
}
