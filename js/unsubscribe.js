// طفّيها — the «ما بدي إيميلات التذكير» link in every reminder email (supabase/mail.sql).
// The link carries a signed token; the database checks it, so no sign-in is needed.
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';

const title = document.getElementById('unsubTitle');
const text = document.getElementById('unsubText');
const show = (t, p) => { if (title) title.textContent = t; if (text) text.textContent = p; };

async function run() {
  const t = new URLSearchParams(location.search).get('t') || '';
  history.replaceState(null, '', location.pathname); // the token doesn't stay in the address bar
  if (!/^[0-9a-f-]{36}\.[0-9a-f]{32}$/.test(t)) {
    show('الرابط ناقص', 'افتح الرابط من الإيميل كامل، أو وقّف الإيميلات من الإعدادات بالتطبيق.');
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/tafiha_mail_unsubscribe`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ t }),
    });
    const ok = res.ok && (await res.json()) === true;
    if (ok) show('وقّفنا إيميلات التذكير', 'ما رح يوصلك منا إيميلات تذكير بعد هيك. بتقدر ترجّعها بأي وقت من الإعدادات بالتطبيق. إيميلات الحساب الضرورية، متل رمز تغيير كلمة السر، بتضل توصل.');
    else show('الرابط ما اشتغل', 'جرّب الرابط من آخر إيميل وصلك، أو وقّف الإيميلات من الإعدادات بالتطبيق.');
  } catch {
    show('ما قدرنا نوصل', 'تأكد من النت وافتح الرابط كمان مرة.');
  }
}
run();
