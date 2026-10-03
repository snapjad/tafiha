// طفّيها — the admin area: sign in, the second step (an authenticator app), then the sections
// the person's role allows. The page only shows things; every action is checked again on the
// server (supabase/admin.sql): a live session, the second step (aal2) and an active staff role.
import { adminClient } from '../sb.js';
import * as Captcha from '../captcha.js';
import { authError } from '../validate.js';
import { esc, errorText, ROLE } from './util.js';
import { SECTIONS } from './views.js';

const root = document.getElementById('admin');
const IDLE_MS = 30 * 60 * 1000; // signed out after 30 minutes without activity
const WORDMARK = '<img class="adm-wordmark" src="assets/brand/tafiha-logo-transparent-dark.svg" alt="طفّيها" width="84" height="48">';
let sb = null;
let me = null;
let lastActive = Date.now();

const authCard = (title, sub, form) => `
  <main class="adm-auth">
    <div class="adm-card adm-auth-card">
      ${WORDMARK}
      <h1>${title}</h1>
      ${sub ? `<p class="adm-sub">${sub}</p>` : ''}
      ${form}
    </div>
  </main>`;

async function boot() {
  if (window.top !== window.self) { root.innerHTML = '<p class="adm-loading">هالصفحة بتشتغل لحالها بس.</p>'; return; }
  try {
    sb = await adminClient();
    const { data } = await sb.auth.getSession();
    if (!data.session) { loginView(); return; }
    await afterLogin();
  } catch (e) {
    root.innerHTML = authCard('ما قدرنا نفتح لوحة الإدارة', esc(errorText(e)), '<button class="adm-btn adm-primary" data-retry>جرّب كمان مرة</button>');
    root.querySelector('[data-retry]').onclick = () => location.reload();
  }
}

async function afterLogin() {
  const { data: who, error } = await sb.rpc('tafiha_admin_me');
  if (error) {
    await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    loginView(errorText(error));
    return;
  }
  if (!who) { noAccess(); return; }
  me = who;
  if (who.aal !== 'aal2') { if (who.totp) verifyView(); else enrollView(); return; }
  shell();
}

// ---------------------------------------------------------------- sign in

function loginView(message = '') {
  root.innerHTML = authCard('لوحة الإدارة', 'للفريق بس. الدخول بحسابك على طفّيها، وبعدها رمز من تطبيق التحقق.', `
    <form class="adm-form" novalidate>
      <label class="adm-field">الإيميل<input name="email" type="email" dir="ltr" autocomplete="username" required></label>
      <label class="adm-field">كلمة السر<input name="password" type="password" dir="ltr" autocomplete="current-password" required></label>
      <div class="auth-captcha"></div>
      <p class="adm-err" role="alert">${esc(message)}</p>
      <button class="adm-btn adm-primary adm-wide" type="submit">دخول</button>
    </form>`);
  const form = root.querySelector('form');
  const slot = root.querySelector('.auth-captcha');
  const err = root.querySelector('.adm-err');
  Captcha.mount(slot);
  form.elements.email.focus();
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    if (!email || !password) { err.textContent = 'اكتب الإيميل وكلمة السر.'; return; }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    err.textContent = '';
    try {
      const captchaToken = await Captcha.need(slot);
      let result;
      try { result = await sb.auth.signInWithPassword({ email, password, options: { captchaToken } }); }
      finally { Captcha.reset(slot); }
      if (result.error) throw result.error;
      Captcha.remove(slot);
      await afterLogin();
    } catch (e) {
      err.textContent = authError(e);
      btn.disabled = false;
    }
  };
}

function noAccess() {
  root.innerHTML = authCard('ما في صلاحية', 'حسابك ما إله صلاحية على لوحة الإدارة. إذا لازم يكون إلك، احكي مع مدير التطبيق.',
    '<button class="adm-btn adm-wide" data-out>سجّل خروج</button>');
  root.querySelector('[data-out]').onclick = signOut;
}

// ---------------------------------------------------------------- the second step (TOTP)

const codeField = '<label class="adm-field">الرمز من التطبيق<input name="code" class="adm-code" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" required></label>';

async function enrollView() {
  root.innerHTML = authCard('فعّل التحقق الثنائي', 'خطوة لازمة للفريق، مرة وحدة بس.', '<p class="adm-loading">لحظة…</p>');
  try {
    // an earlier, unfinished try leaves an unverified factor behind
    const { data: list } = await sb.auth.mfa.listFactors();
    for (const f of (list?.all || []).filter((x) => x.status !== 'verified')) await sb.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'tafiha-admin' });
    if (error) throw error;
    const qr = data.totp.qr_code.startsWith('data:') ? data.totp.qr_code : `data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`;
    const secret = data.totp.secret.replace(/(.{4})/g, '$1 ').trim();
    root.querySelector('.adm-auth-card').innerHTML = `${WORDMARK}
      <h1>فعّل التحقق الثنائي</h1>
      <ol class="adm-steps">
        <li>نزّل تطبيق <b>Google Authenticator</b> أو <b>Microsoft Authenticator</b> على تلفونك.</li>
        <li>من التطبيق اكبس <b>+</b> وامسح هالرمز:</li>
      </ol>
      <img class="adm-qr" src="${esc(qr)}" alt="رمز QR لتطبيق التحقق" width="200" height="200">
      <details class="adm-secret"><summary>ما بتقدر تمسح؟ اكتب المفتاح يدوي</summary><code dir="ltr">${esc(secret)}</code></details>
      <ol class="adm-steps" start="3"><li>اكتب الرمز اللي طلعلك بالتطبيق:</li></ol>
      <form class="adm-form" novalidate>
        ${codeField}
        <p class="adm-err" role="alert"></p>
        <button class="adm-btn adm-primary adm-wide" type="submit">فعّل وادخل</button>
        <button class="adm-link" type="button" data-out>إلغاء وخروج</button>
      </form>`;
    wireCode(data.id);
  } catch (e) {
    root.querySelector('.adm-auth-card').insertAdjacentHTML('beforeend', `<p class="adm-err">${esc(errorText(e))}</p><button class="adm-btn" data-out>خروج</button>`);
    root.querySelector('[data-out]').onclick = signOut;
  }
}

async function verifyView() {
  root.innerHTML = authCard('رمز التحقق', 'افتح تطبيق التحقق على تلفونك واكتب الرمز تبع طفّيها.', `
    <form class="adm-form" novalidate>
      ${codeField}
      <p class="adm-err" role="alert"></p>
      <button class="adm-btn adm-primary adm-wide" type="submit">تأكيد</button>
      <button class="adm-link" type="button" data-out>خروج</button>
    </form>`);
  const { data } = await sb.auth.mfa.listFactors();
  const factor = (data?.totp || []).find((f) => f.status === 'verified');
  if (!factor) { enrollView(); return; }
  wireCode(factor.id);
}

function wireCode(factorId) {
  const form = root.querySelector('form');
  const err = root.querySelector('.adm-err');
  const input = form.elements.code;
  root.querySelector('[data-out]').onclick = signOut;
  input.focus();
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const code = input.value.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
    if (code.length !== 6) { err.textContent = 'الرمز 6 أرقام.'; return; }
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    err.textContent = '';
    try {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      await afterLogin();
    } catch (e) {
      err.textContent = /invalid|code/i.test(String(e?.message)) ? 'الرمز غلط أو خلص وقته. اكتب الرمز الجديد.' : errorText(e);
      btn.disabled = false;
      input.select();
    }
  };
}

// ---------------------------------------------------------------- the admin area

function shell() {
  const allowed = SECTIONS.filter((s) => s.roles.includes(me.role));
  root.innerHTML = `
    <header class="adm-top">
      <div class="adm-brand">${WORDMARK}<span>الإدارة</span></div>
      <nav class="adm-nav" aria-label="الأقسام">
        ${allowed.map((s) => `<a href="#${s.id}" data-id="${s.id}">${s.label}</a>`).join('')}
      </nav>
      <div class="adm-who"><span>${esc(me.name || '')} · ${esc(ROLE[me.role] || me.role)}</span><button class="adm-link" data-out>خروج</button></div>
    </header>
    <main class="adm-main" id="section" tabindex="-1"></main>`;
  root.querySelector('[data-out]').onclick = signOut;
  const show = () => {
    const id = location.hash.slice(1);
    const section = allowed.find((s) => s.id === id) || allowed[0];
    root.querySelectorAll('.adm-nav a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.id === section.id)));
    const el = root.querySelector('#section');
    el.innerHTML = '<p class="adm-loading">لحظة…</p>';
    section.render(el, { sb, me, onAuthError }).catch((e) => onAuthError(e) || (el.innerHTML = `<p class="adm-err">${esc(errorText(e))}</p>`));
  };
  window.onhashchange = show;
  show();
}

// a section's call failed because the session or the second step is gone: back to sign in
function onAuthError(e) {
  const msg = String(e?.message || '');
  if (!/session expired|second step required|forbidden|JWT/i.test(msg)) return false;
  window.onhashchange = null;
  afterLogin().catch(() => loginView());
  return true;
}

async function signOut() {
  window.onhashchange = null;
  try { await sb.auth.signOut({ scope: 'local' }); } catch { localStorage.removeItem('tafiha.admin'); }
  me = null;
  history.replaceState(null, '', location.pathname);
  loginView();
}

['pointerdown', 'keydown'].forEach((t) => document.addEventListener(t, () => { lastActive = Date.now(); }, { passive: true }));
setInterval(() => {
  if (me && Date.now() - lastActive > IDLE_MS) signOut().then(() => { root.querySelector('.adm-err').textContent = 'طلعناك بعد 30 دقيقة بدون نشاط.'; });
}, 60000);

boot();
