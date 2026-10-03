// طفّيها — accounts: making one (Google, or name + phone + email + password),
// signing in, resetting a forgotten password, and the account itself.
// Phone sign-in with a one-time code comes later; for now the number is kept
// (international format) in the account's details.
import { client, configured } from './sb.js';
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';
import * as Captcha from './captcha.js';
import {
  COUNTRIES, country, flag, guessCountry, parsePhone, nationalPart,
  isEmail, passwordOk, passwordProblem, PASSWORD_HINT, authError, latinDigits,
} from './validate.js';

export { configured, authError };

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const here = () => location.origin + location.pathname;

// ---------------------------------------------------------------- the account

export async function session() {
  const c = await client();
  const { data, error } = await c.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function onAuthChange(cb) {
  const c = await client();
  const { data } = c.auth.onAuthStateChange((event, s) => { setTimeout(() => cb(event, s), 0); });
  return () => data.subscription.unsubscribe();
}

// 'local' ends this device's session; 'global' ends every session of the account
// (a lost or stolen phone): the server checks the session on every data call.
export async function signOut(scope = 'local') {
  const c = await client();
  const { error } = await c.auth.signOut({ scope });
  if (error) throw error;
}

// removes the account and everything stored for it
export async function deleteAccount() {
  const c = await client();
  const { error } = await c.rpc('tafiha_me_delete');
  if (error) throw error;
  // The account is already gone; a failed logout request must not leave its cache visible.
  try { await signOut(); } catch { localStorage.removeItem('tafiha.auth'); }
}

export async function updateProfile(data) {
  const c = await client();
  const { data: d, error } = await c.auth.updateUser({ data });
  if (error) throw error;
  return d.user;
}

export const firstName = (user) => String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim().split(/\s+/)[0] || '';

// Google shows up by itself once it's switched on in Supabase
let googleOn = null;
async function googleEnabled() {
  if (googleOn !== null) return googleOn;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON } });
    googleOn = !!(await r.json()).external?.google;
  } catch (e) {
    return false;
  }
  return googleOn;
}

// ---------------------------------------------------------------- the phone field (also used in settings)

export function phoneField(id, iso = guessCountry(), national = '') {
  const c = country(iso);
  const opts = COUNTRIES.map((x) =>
    `<option value="${x.iso}" ${x.iso === c.iso ? 'selected' : ''}>${flag(x.iso)} ${x.name}${x.dial ? ` (+${x.dial})` : ''}</option>`).join('');
  return `
    <div class="field">
      <label for="${id}">رقم تلفونك</label>
      <div class="phone-row" dir="ltr">
        <span class="cc"><span class="cc-view">${flag(c.iso)} ${c.dial ? `+${c.dial}` : '+'}</span>
          <select aria-label="الدولة" data-cc>${opts}</select></span>
        <input id="${id}" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20"
          value="${esc(national)}" placeholder="${esc(c.ex)}">
      </div>
    </div>`;
}

export function wirePhone(root) {
  const sel = root.querySelector('[data-cc]');
  if (!sel) return;
  sel.addEventListener('change', () => {
    const c = country(sel.value);
    root.querySelector('.cc-view').textContent = `${flag(c.iso)} ${c.dial ? `+${c.dial}` : '+'}`;
    const inp = root.querySelector('input[name="phone"]');
    inp.placeholder = c.ex;
    inp.focus();
  });
}

// → { e164, iso } | null (empty) | false (typed but not a real number)
export function readPhone(root) {
  const raw = root.querySelector('input[name="phone"]').value.trim();
  if (!raw) return null;
  return parsePhone(root.querySelector('[data-cc]').value, raw) || false;
}

// ---------------------------------------------------------------- the screens

const G_LOGO = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>`;
const EYE = '<svg class="ico" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg class="ico" viewBox="0 0 24 24"><path d="M4 4l16 16M9.9 6A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.7M14.1 17.9a9.4 9.4 0 0 1-2.1.6C6 18.5 2.5 12 2.5 12a16.8 16.8 0 0 1 4-4.6M10 10a3 3 0 0 0 4 4"/></svg>';

function passField(id, label, autocomplete, hint = '') {
  return `
    <div class="field">
      <label for="${id}">${label}</label>
      <span class="pass"><input id="${id}" name="password" type="password" dir="ltr" autocomplete="${autocomplete}" maxlength="72">
        <button type="button" class="eye" aria-label="أظهر كلمة السر" aria-pressed="false">${EYE}</button></span>
      ${hint ? `<small>${hint}</small>` : ''}
    </div>`;
}

const emailField = (id, value = '', locked = false) => `
  <div class="field">
    <label for="${id}">إيميلك</label>
    <input id="${id}" name="email" type="email" inputmode="email" dir="ltr" autocomplete="email" maxlength="120" value="${esc(value)}" placeholder="name@example.com"${locked ? ' readonly' : ''}>
  </div>`;

const RESEND_AFTER = 60;

// modes: 'gate' (after the interview: make an account to see the report),
// 'login' (from the first screen: "I have an account"), 'required' (data on this
// device from before accounts), 'recovery' (opened a reset-password link),
// 'password' (signed in, changing the password with a code sent to opts.email).
// Resolves { user } when signed in, or 'back' when someone leaves the login screen.
export function runAuth(opts = {}) {
  const mode = opts.mode || 'welcome';
  return new Promise((resolve) => {
    let tab = mode === 'login' ? 'login' : 'signup';
    let view = mode === 'recovery' ? 'newpass' : mode === 'password' ? 'forgot' : 'main';
    let email = opts.email || '';
    let codeType = 'recovery';
    let resendTimer = 0;
    let finished = false;
    let submitting = false;
    let unsubscribe = () => {};
    const previousOverflow = document.body.style.overflow;
    const covered = [...document.body.children].filter((el) => !['SCRIPT', 'SVG'].includes(el.tagName));
    const inertBefore = covered.map((el) => el.inert);
    covered.forEach((el) => { el.inert = true; });

    const root = document.createElement('div');
    root.className = 'onb auth';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'حسابك');
    root.innerHTML = `
      <div class="onb-top auth-top">
        <button class="onb-back" type="button" aria-label="رجوع"><svg class="ico"><use href="#i-arrow" transform="rotate(180 12 12)"/></svg></button>
        <div class="brand"><img class="wordmark" src="assets/brand/tafiha-logo-transparent-dark.svg" alt="طفّيها" width="84" height="48"></div>
        <span class="auth-top-note">كل يوم، خطوة إلك</span>
      </div>
      <div class="onb-body"></div>`;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    const body = root.querySelector('.onb-body');
    const back = root.querySelector('.onb-back');
    // The bot check lives outside the steps, so switching steps doesn't restart it.
    const slot = document.createElement('div');
    slot.className = 'auth-captcha';
    body.appendChild(slot);
    Captcha.mount(slot);
    // Sends a request that needs a bot-check token; a token works once.
    async function guarded(call) {
      const captchaToken = await Captcha.need(slot);
      try { return await call(captchaToken); } finally { Captcha.reset(slot); }
    }

    back.onclick = () => {
      if (submitting) return;
      if (mode === 'password') {
        if (view === 'forgot') finish('back');
        else { view = 'forgot'; render(-1); }
        return;
      }
      if (view !== 'main' && view !== 'newpass') { view = 'main'; render(-1); return; }
      if (mode === 'login') finish('back');
    };

    function finish(v) {
      if (finished) return;
      finished = true;
      unsubscribe();
      clearInterval(resendTimer);
      Captcha.remove(slot);
      root.classList.add('leave');
      root.inert = true;
      document.body.style.overflow = previousOverflow;
      covered.forEach((el, i) => { el.inert = inertBefore[i]; });
      root.remove();
      resolve(v);
    }

    function heading() {
      const name = opts.name ? ` يا ${esc(opts.name)}` : '';
      if (view === 'forgot' && mode === 'password') return ['تغيير كلمة السر', 'بنبعتلك رمز على إيميلك، وبعدها بتختار كلمة سر جديدة.'];
      if (view === 'forgot') return ['نسيت كلمة السر؟', 'اكتب إيميلك وبنبعتلك رمز ترجع فيه لحسابك.'];
      if (view === 'code') {
        return codeType === 'signup' || mode === 'password'
          ? [codeType === 'signup' ? 'أكّد إيميلك' : 'تفقد إيميلك', `بعتنالك رمز من 6 أرقام على <b dir="ltr">${esc(email)}</b>. اكتبه هون.`]
          : ['تفقد إيميلك', `إذا الإيميل مسجّل، بيوصلك رمز من 6 أرقام على <b dir="ltr">${esc(email)}</b>.`];
      }
      if (view === 'newpass') return ['كلمة سر جديدة', 'اختار كلمة سر جديدة لحسابك.'];
      if (mode === 'gate') return [`تقريرك جاهز${name}`, 'اعمل حساب حتى تشوفه، وتضل خطتك محفوظة على كل أجهزتك.'];
      if (mode === 'required') return ['رحلتك بتكمّل معك', 'سجّل دخول أو اعمل حساب. بعدها بتختار تضيف رحلتك الموجودة إله.'];
      return tab === 'login' ? ['أهلاً فيك من جديد', 'خطتك وإنجازاتك بانتظارك.'] : ['بداية جديدة إلك', 'اعمل حسابك، وخلّي كل خطوة محفوظة.'];
    }

    function formHTML() {
      if (view === 'forgot') {
        return `${emailField('au-email', email, mode === 'password')}
          <p class="onb-err" role="alert"></p>
          <button class="btn btn-red auth-submit" type="submit">ابعتلي الرمز</button>`;
      }
      if (view === 'code') {
        return `
          <div class="field">
            <label for="au-code">الرمز</label>
            <input id="au-code" name="code" class="otp-input" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="••••••">
          </div>
          ${codeType === 'recovery' ? passField('au-pass', 'كلمة السر الجديدة', 'new-password', PASSWORD_HINT) : ''}
          <p class="onb-err" role="alert"></p>
          <button class="btn btn-red auth-submit" type="submit">${codeType === 'recovery' ? 'غيّر كلمة السر' : 'تأكيد'}</button>
          <button class="link-btn" type="button" data-resend disabled></button>
          <p class="auth-note">إذا ما لقيت الرسالة، تفقد مجلد الرسائل غير المرغوبة (Spam).</p>`;
      }
      if (view === 'newpass') {
        return `${passField('au-pass', 'كلمة السر الجديدة', 'new-password', PASSWORD_HINT)}
          <p class="onb-err" role="alert"></p>
          <button class="btn btn-red auth-submit" type="submit">احفظ كلمة السر</button>`;
      }
      if (tab === 'login') {
        return `${emailField('au-email', email)}
          ${passField('au-pass', 'كلمة السر', 'current-password')}
          <button class="link-btn" type="button" data-forgot>نسيت كلمة السر؟</button>
          <p class="onb-err" role="alert"></p>
          <button class="btn btn-red auth-submit" type="submit">سجّل دخول</button>`;
      }
      return `
        <div class="field">
          <label for="au-name">اسمك</label>
          <input id="au-name" name="name" autocomplete="name" maxlength="40" value="${esc(opts.name || '')}">
        </div>
        ${phoneField('au-phone')}
        ${emailField('au-email', email)}
        ${passField('au-pass', 'كلمة السر', 'new-password', PASSWORD_HINT)}
        <p class="onb-err" role="alert"></p>
        <button class="btn btn-red auth-submit" type="submit">أنشئ حسابي</button>
        <p class="auth-legal">بإنشاء الحساب بتوافق على <a href="terms.html" target="_blank" rel="noopener">شروط الاستخدام</a> و<a href="privacy.html" target="_blank" rel="noopener">سياسة الخصوصية</a>.</p>`;
    }

    function render(dir = 1) {
      clearInterval(resendTimer);
      const [title, sub] = heading();
      const main = view === 'main';
      back.style.visibility = (!main && view !== 'newpass') || (main && mode === 'login') || mode === 'password' ? 'visible' : 'hidden';
      const tpl = document.createElement('template');
      tpl.innerHTML = `
        <div class="onb-step auth-step ${dir < 0 ? 'back' : ''}">
          <div class="auth-hero">
            <span class="auth-kicker">${main ? 'رحلتك مع طفّيها' : 'حسابك مع طفّيها'}</span>
            <h1 class="q-title">${title}</h1>
            <p class="sub">${sub}</p>
          </div>
          ${main ? `
            <div class="seg" role="group" aria-label="نوع الدخول" data-tab="${tab}">
              <button type="button" aria-pressed="${tab === 'signup'}" data-tab="signup">حساب جديد</button>
              <button type="button" aria-pressed="${tab === 'login'}" data-tab="login">عندي حساب</button>
              <i class="seg-thumb" aria-hidden="true"></i>
            </div>
            <button class="btn btn-google" type="button" data-google hidden>${G_LOGO}<span>المتابعة مع Google</span></button>
            <div class="or" data-or hidden><span>أو بالإيميل</span></div>` : ''}
          <form class="auth-form" novalidate>${formHTML()}</form>
          ${main && opts.allowLocal ? '<button class="link-btn auth-local" type="button" data-local>كمّل على هالجهاز</button>' : ''}
        </div>`;
      const step = tpl.content.firstElementChild;
      const old = body.querySelector('.auth-step');
      if (old) old.replaceWith(step); else body.prepend(step);
      wire(step);
      const titleEl = body.querySelector('h1');
      titleEl.tabIndex = -1;
      titleEl.focus({ preventScroll: true });
      root.scrollTop = 0;
    }

    function wire(el) {
      const form = el.querySelector('form');
      const err = el.querySelector('.onb-err');
      const submit = el.querySelector('.auth-submit');
      wirePhone(el);
      el.querySelector('[data-local]')?.addEventListener('click', () => { if (!submitting) finish('local'); });

      el.querySelectorAll('.eye').forEach((b) => {
        b.onclick = () => {
          const inp = b.previousElementSibling;
          const show = inp.type === 'password';
          inp.type = show ? 'text' : 'password';
          b.innerHTML = show ? EYE_OFF : EYE;
          b.setAttribute('aria-pressed', String(show));
          b.setAttribute('aria-label', show ? 'خبّي كلمة السر' : 'أظهر كلمة السر');
        };
      });

      el.querySelectorAll('.seg [data-tab]').forEach((b) => {
        b.onclick = () => {
          if (submitting || tab === b.dataset.tab) return;
          email = form.elements.email?.value.trim() || email;
          tab = b.dataset.tab;
          render();
        };
      });

      const g = el.querySelector('[data-google]');
      if (g && g.hidden) {
        googleEnabled().then((on) => {
          if (!on || !g.isConnected) return;
          g.hidden = false;
          el.querySelector('[data-or]').hidden = false;
        });
      }
      if (g) {
        g.onclick = async () => {
          if (submitting) return;
          submitting = true;
          el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
          try {
            opts.onRedirect?.();
            const c = await client();
            const { error } = await c.auth.signInWithOAuth({
              provider: 'google',
              options: { redirectTo: here(), queryParams: { prompt: 'select_account' } },
            });
            if (error) throw error;
          } catch (e) {
            err.textContent = authError(e);
            submitting = false;
            el.querySelectorAll('button').forEach((b) => { b.disabled = false; });
          }
        };
      }

      el.querySelector('[data-forgot]')?.addEventListener('click', () => {
        email = form.elements.email?.value.trim() || email;
        view = 'forgot';
        render();
      });

      const resend = el.querySelector('[data-resend]');
      if (resend) {
        let left = RESEND_AFTER;
        const tick = () => {
          left--;
          resend.disabled = left > 0;
          resend.textContent = left > 0 ? `ما وصلك؟ بتقدر تطلب رمز جديد بعد ${left} ثانية` : 'ابعتلي رمز جديد';
          if (left <= 0) clearInterval(resendTimer);
        };
        tick();
        resendTimer = setInterval(tick, 1000);
        resend.onclick = async () => {
          resend.disabled = true;
          try {
            await sendCode();
            err.textContent = '';
            render();
          } catch (e) {
            err.textContent = authError(e);
            resend.disabled = false;
          }
        };
      }

      form.addEventListener('input', (ev) => {
        ev.target.removeAttribute?.('aria-invalid');
        if (ev.target.name === 'code') ev.target.value = ev.target.value.replace(/[^\d٠-٩۰-۹]/g, '');
      });

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        if (submitting || submit.disabled) return;
        err.textContent = '';
        const bad = (name, msg) => {
          const f = form.elements[name];
          f?.setAttribute('aria-invalid', 'true');
          err.id = 'authError';
          f?.setAttribute('aria-describedby', err.id);
          f?.focus();
          err.textContent = msg;
        };
        const label = submit.innerHTML;
        const busy = (on) => {
          submitting = on;
          el.querySelectorAll('button').forEach((b) => { b.disabled = on; });
          back.disabled = on;
          form.setAttribute('aria-busy', String(on));
          submit.innerHTML = on ? '<span class="spin" aria-hidden="true"></span><span>لحظة…</span>' : label;
        };
        try {
          if (view === 'main' && tab === 'signup') {
            const name = form.elements.name.value.trim();
            const phone = readPhone(form);
            email = form.elements.email.value.trim();
            const password = form.elements.password.value;
            if (!name) return bad('name', 'اكتب اسمك.');
            if (!phone) return bad('phone', phone === false ? 'رقم التلفون مش مزبوط. اختار دولتك واكتب رقمك.' : 'اكتب رقم تلفونك.');
            if (!isEmail(email)) return bad('email', 'الإيميل مش مزبوط.');
            if (!passwordOk(password)) return bad('password', passwordProblem(password));
            busy(true);
            const c = await client();
            const { data, error } = await guarded((captchaToken) => c.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: here(), captchaToken, data: { full_name: name, phone: phone.e164, phone_country: phone.iso } },
            }));
            if (error) throw error;
            if (data.session) { finish({ user: data.user, name }); return; }
            if (data.user && !data.user.identities?.length) throw Object.assign(new Error('exists'), { code: 'user_already_exists' });
            codeType = 'signup';
            view = 'code';
            submitting = false;
            back.disabled = false;
            render();
            return;
          }
          if (view === 'main' && tab === 'login') {
            email = form.elements.email.value.trim();
            const password = form.elements.password.value;
            if (!isEmail(email)) return bad('email', 'الإيميل مش مزبوط.');
            if (!password) return bad('password', 'اكتب كلمة السر.');
            busy(true);
            const c = await client();
            const { data, error } = await guarded((captchaToken) => c.auth.signInWithPassword({ email, password, options: { captchaToken } }));
            if (error?.code === 'email_not_confirmed') {
              codeType = 'signup';
              await sendCode();
              view = 'code';
              submitting = false;
              back.disabled = false;
              render();
              return;
            }
            if (error) throw error;
            finish({ user: data.user });
            return;
          }
          if (view === 'forgot') {
            email = form.elements.email.value.trim();
            if (!isEmail(email)) return bad('email', 'الإيميل مش مزبوط.');
            busy(true);
            codeType = 'recovery';
            await sendCode();
            view = 'code';
            submitting = false;
            back.disabled = false;
            render();
            return;
          }
          if (view === 'code') {
            const token = latinDigits(form.elements.code.value).replace(/\D/g, '');
            if (!/^\d{6,8}$/.test(token)) return bad('code', 'اكتب الرمز كامل.');
            const password = form.elements.password?.value;
            if (codeType === 'recovery' && !passwordOk(password)) return bad('password', passwordProblem(password));
            busy(true);
            const c = await client();
            const { data, error } = await c.auth.verifyOtp({ email, token, type: codeType });
            if (error) throw error;
            if (codeType === 'recovery') {
              const { error: e2 } = await c.auth.updateUser({ password });
              if (e2) {
                // A verified code is consumed. Retry the password, not the same code.
                submitting = false;
                back.disabled = false;
                view = 'newpass';
                render();
                body.querySelector('.onb-err').textContent = authError(e2);
                return;
              }
            }
            finish({ user: data.user });
            return;
          }
          if (view === 'newpass') {
            const password = form.elements.password.value;
            if (!passwordOk(password)) return bad('password', passwordProblem(password));
            busy(true);
            const c = await client();
            const { data, error } = await c.auth.updateUser({ password });
            if (error) throw error;
            finish({ user: data.user });
          }
        } catch (e) {
          err.textContent = authError(e);
          busy(false);
        }
      });

      setTimeout(() => {
        const first = [...form.querySelectorAll('input')].find((i) => !i.value) || null;
        if (view !== 'main' || tab === 'login') first?.focus({ preventScroll: true });
      }, 80);
    }

    async function sendCode() {
      const c = await client();
      const { error } = await guarded((captchaToken) => (codeType === 'recovery'
        ? c.auth.resetPasswordForEmail(email, { redirectTo: `${here()}?r=reset`, captchaToken })
        : c.auth.resend({ type: 'signup', email, options: { emailRedirectTo: here(), captchaToken } })));
      if (error) throw error;
    }

    render();
    onAuthChange((event, session) => {
      if (!finished && !submitting && event === 'SIGNED_IN' && session?.user && mode !== 'recovery' &&
          (view === 'main' || (view === 'code' && codeType === 'signup'))) finish({ user: session.user });
    }).then((off) => { if (finished) off(); else unsubscribe = off; }).catch(() => {});
    root.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Tab') return;
      const items = [...root.querySelectorAll('button, input, select')].filter((el) => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
      const first = items[0], last = items.at(-1);
      if (ev.shiftKey && (document.activeElement === first || document.activeElement.tagName === 'H1')) { ev.preventDefault(); last?.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first?.focus(); }
    });
    if (opts.error) body.querySelector('.onb-err').textContent = opts.error;
  });
}

export { nationalPart };
