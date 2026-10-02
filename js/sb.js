// طفّيها — the one Supabase client (accounts, data and realtime).
// The library ships inside the app (js/vendor), so nothing is fetched from a CDN.
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

let ready = null;

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

export function client() {
  if (!ready) {
    ready = loadScript(new URL('./vendor/supabase.js', import.meta.url).href).then(() =>
      window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: {
          storageKey: 'tafiha.auth',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true, // coming back from Google or from a reset-password link
          flowType: 'pkce',
        },
        global: {
          fetch: (url, init = {}) => fetch(url, {
            ...init,
            signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
          }),
        },
      }));
    ready.catch(() => { ready = null; });
  }
  return ready;
}
