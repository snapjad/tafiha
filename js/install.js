// طفّيها — «حطّ طفّيها على شاشتك»: one tap from the home screen instead of finding the link again.
// Android and desktop Chrome/Edge get the browser's own install prompt; iPhone gets the two
// Safari steps; inside Instagram's (or another app's) browser it first asks to open the site in
// the real browser, because those can't add to the home screen. Hidden in the phone app, once
// installed, and after «لا، شكراً».
const LS = 'tafiha.install-dismissed';
const ua = () => navigator.userAgent || '';
const isIOS = () => /iPhone|iPad|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const inApp = () => /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Snapchat|Line\//.test(ua());
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let deferred = null;
let onChange = () => {};
if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); deferred = ev; onChange(); });
  addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem(LS, '1'); } catch { /* hidden anyway */ } onChange(); });
}

function dismissed() { try { return localStorage.getItem(LS) === '1'; } catch { return false; } }

const SHARE = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M6 11v8.5h12V11"/></svg>';
const PLUS = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>';

// what to show, or null for nothing
function mode(native) {
  if (native || installed() || dismissed()) return null;
  if (inApp()) return 'inapp';
  if (isIOS()) return /CriOS|FxiOS|EdgiOS/.test(ua()) ? 'ios-other' : 'ios';
  if (deferred) return 'prompt';
  return null; // Firefox desktop and others: no way to install, so nothing to say
}

export function renderInstall(card, { native = false } = {}) {
  if (!card) return;
  onChange = () => renderInstall(card, { native });
  const m = mode(native);
  card.hidden = !m;
  if (!m) return;
  const body = {
    prompt: `<p class="card-sub">بتفتحه بكبسة متل أي تطبيق، وبيشتغل حتى بدون نت.</p>
      <div class="inst-actions"><button class="btn btn-red" type="button" data-inst="go">ثبّته</button><button class="btn btn-soft" type="button" data-inst="no">لا، شكراً</button></div>`,
    ios: `<ol class="inst-steps">
        <li><i>1</i><span>اكبس زر المشاركة ${SHARE} تحت بسفاري</span></li>
        <li><i>2</i><span>اختار «إضافة إلى الشاشة الرئيسية» ${PLUS}</span></li>
      </ol>
      <div class="inst-actions"><button class="btn btn-soft" type="button" data-inst="no">تمام، فهمت</button></div>`,
    'ios-other': `<p class="card-sub">على الآيفون الإضافة للشاشة بتزبط من سفاري. افتح tafiha.com بسفاري، وسجّل دخول بنفس حسابك.</p>
      <div class="inst-actions"><button class="btn btn-soft" type="button" data-inst="no">تمام</button></div>`,
    inapp: `<p class="card-sub">إنت فاتح طفّيها من جوّا تطبيق ثاني. افتحه بالمتصفح (من زر «…» فوق، ثم «فتح بالمتصفح») حتى تقدر تحطه على شاشتك، وسجّل دخول بنفس حسابك.</p>
      <div class="inst-actions"><button class="btn btn-soft" type="button" data-inst="copy">انسخ الرابط</button><button class="btn btn-soft" type="button" data-inst="no">بعدين</button></div>`,
  }[m];
  card.innerHTML = `<div class="card-head"><img class="head-ico" src="assets/icon-192.png" alt="" width="192" height="192"><h2 class="card-title">حطّ طفّيها على شاشتك</h2></div>${body}`;
  card.querySelectorAll('[data-inst]').forEach((b) => {
    b.onclick = async () => {
      const what = b.dataset.inst;
      if (what === 'go' && deferred) {
        const ev = deferred;
        deferred = null;
        ev.prompt();
        const choice = await ev.userChoice.catch(() => null);
        if (choice?.outcome === 'accepted') { try { localStorage.setItem(LS, '1'); } catch { /* fine */ } }
      } else if (what === 'copy') {
        try { await navigator.clipboard.writeText('https://tafiha.com/'); b.textContent = 'انسخ ✓'; } catch { b.textContent = 'tafiha.com'; }
        return;
      } else {
        try { localStorage.setItem(LS, '1'); } catch { /* hidden for this visit */ }
      }
      renderInstall(card, { native });
    };
  });
}
