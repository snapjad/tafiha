// طفّيها — admin helpers: escaping, Arabic dates and numbers, readable errors, dialogs.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const dateFmt = new Intl.DateTimeFormat('ar-JO-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('ar-JO-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const numFmt = new Intl.NumberFormat('en-US');

const toDate = (v) => (v === null || v === undefined || v === '' ? null : new Date(typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : v));
export function fmtDate(v, withTime = false) {
  const d = toDate(v);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return (withTime ? dateTimeFmt : dateFmt).format(d);
}
export const fmtNum = (n) => (n === null || n === undefined ? '—' : numFmt.format(n));

// 1 حساب، 2 حسابين، 3–10 حسابات، 11+ حساب
export function count(n, [one, two, few, many]) {
  if (n === 1) return `${one} واحد`;
  if (n === 2) return two;
  return `${fmtNum(n)} ${n >= 3 && n <= 10 ? few : many}`;
}

export function ago(v) {
  const d = toDate(v);
  if (!d || Number.isNaN(d.getTime())) return '—';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 2) return 'هلأ';
  if (min < 60) return `قبل ${min} دقيقة`;
  const h = Math.round(min / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const days = Math.round(h / 24);
  if (days < 31) return `قبل ${days} يوم`;
  return fmtDate(d);
}

export const ROLE = { owner: 'مدير', doctor: 'دكتور', editor: 'محرر محتوى' };

const MESSAGES = [
  ['second step required', 'لازم تكمّل التحقق الثنائي.'],
  ['forbidden', 'ما عندك صلاحية لهالشي.'],
  ['session expired', 'خلصت الجلسة. سجّل دخول من جديد.'],
  ['no such account', 'ما في حساب طفّيها بهالإيميل. لازم يعمل حساب أول.'],
  ['not on yourself', 'ما بتقدر تعمل هالشي على حسابك.'],
  ['remove staff role first', 'هاد من الفريق. شيل صلاحيته أول.'],
  ['not staff', 'هاد مش من الفريق.'],
  ['invalid value', 'القيمة مش مزبوطة.'],
  ['invalid role', 'الدور مش مزبوط.'],
  ['unknown setting', 'إعداد مش معروف.'],
];
export function errorText(e) {
  const msg = String(e?.message || e || '');
  for (const [k, v] of MESSAGES) if (msg.includes(k)) return v;
  if (/fetch|network|timeout|abort/i.test(msg)) return 'ما في نت أو السيرفر مش راد. جرّب كمان مرة.';
  return 'صار خطأ. جرّب كمان مرة.';
}

// A confirm dialog. With `type`, the button only works after that exact text is typed.
export function confirmDialog({ title, body, yes = 'تأكيد', danger = false, type = '' }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'adm-dialog';
    d.innerHTML = `<form method="dialog">
      <h2>${esc(title)}</h2>
      <p>${body}</p>
      ${type ? `<label class="adm-field">اكتب <b dir="ltr">${esc(type)}</b> للتأكيد<input name="check" dir="ltr" autocomplete="off"></label>` : ''}
      <div class="adm-actions">
        <button class="adm-btn ${danger ? 'adm-danger' : 'adm-primary'}" value="yes" ${type ? 'disabled' : ''}>${esc(yes)}</button>
        <button class="adm-btn" value="no" formnovalidate>إلغاء</button>
      </div></form>`;
    document.body.appendChild(d);
    const check = d.querySelector('[name=check]');
    const ok = d.querySelector('[value=yes]');
    check?.addEventListener('input', () => { ok.disabled = check.value.trim() !== type; });
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      if (d.open) d.close();
      d.remove();
      resolve(v);
    };
    d.querySelector('form').addEventListener('submit', (ev) => { ev.preventDefault(); finish(ev.submitter?.value === 'yes' && !ok.disabled); });
    d.addEventListener('cancel', (ev) => { ev.preventDefault(); finish(false); }); // Escape
    d.showModal();
    (check || ok).focus();
  });
}

let toastTimer = 0;
export function toast(text, bad = false) {
  let t = document.querySelector('.adm-toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'adm-toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.toggle('bad', bad);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}
