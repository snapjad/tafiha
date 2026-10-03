// طفّيها — bot protection (Cloudflare Turnstile) for the auth calls that send an email or check
// a password: sign up, sign in, password reset and "send the code again". Supabase checks the
// token on its side (Authentication → Attack Protection → CAPTCHA).
// The widget solves by itself in the background and only shows up when a person has to click.
// It's on for the real site only: the widget is tied to the tafiha.com hostname, and local
// previews and tests run against mocks.
import { TURNSTILE_SITE_KEY, TURNSTILE_HOSTS } from './config.js';

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const widgets = new WeakMap();
let loading = null;

export const captchaOn = () => !!TURNSTILE_SITE_KEY && TURNSTILE_HOSTS.includes(location.hostname);

function load() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('captcha')));
    s.onerror = () => { loading = null; s.remove(); reject(new Error('captcha')); };
    document.head.appendChild(s);
  });
  return loading;
}

function settle(w) {
  const waiting = w.waiting.splice(0);
  waiting.forEach((done) => done(w.token));
}

// One widget per slot element; the slot must stay in the page while it's used.
export function mount(slot) {
  if (!captchaOn() || !slot || widgets.has(slot)) return;
  const w = { id: null, token: '', waiting: [] };
  widgets.set(slot, w);
  load().then((ts) => {
    if (!slot.isConnected || w.removed) return;
    w.id = ts.render(slot, {
      sitekey: TURNSTILE_SITE_KEY,
      language: 'ar',
      theme: 'light',
      size: 'flexible',
      appearance: 'interaction-only',
      callback: (t) => { w.token = t; slot.classList.remove('show'); settle(w); },
      'expired-callback': () => { w.token = ''; },
      'before-interactive-callback': () => slot.classList.add('show'),
      'error-callback': () => { w.token = ''; settle(w); return true; }, // Turnstile retries by itself
    });
  }).catch(() => settle(w));
}

// The token for the next auth call ('' when the check isn't done yet), or undefined when
// protection is off. A token works once: call reset() after every request that used it.
export async function token(slot, ms = 12000) {
  if (!captchaOn()) return undefined;
  mount(slot);
  const w = widgets.get(slot);
  if (w.token) return w.token;
  if (slot.classList.contains('show')) return ''; // waiting for the person to click: say so now
  return new Promise((resolve) => {
    const timer = setTimeout(() => { w.waiting = w.waiting.filter((d) => d !== done); resolve(''); }, ms);
    const done = (t) => { clearTimeout(timer); resolve(t); };
    w.waiting.push(done);
  });
}

export function reset(slot) {
  const w = slot && widgets.get(slot);
  if (!w) return;
  w.token = '';
  if (w.id !== null) { try { window.turnstile.reset(w.id); } catch { /* removed */ } }
}

export function remove(slot) {
  const w = slot && widgets.get(slot);
  if (!w) return;
  w.removed = true;
  settle(w);
  if (w.id !== null) { try { window.turnstile.remove(w.id); } catch { /* already gone */ } }
  widgets.delete(slot);
}

// For the calls that need a token: throws a readable error when the check isn't done.
export async function need(slot) {
  const t = await token(slot);
  if (t === '') {
    if (slot?.classList.contains('show')) slot.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    throw Object.assign(new Error('captcha pending'), { code: 'captcha_pending' });
  }
  return t;
}
