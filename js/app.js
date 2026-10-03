// طفّيها — dashboard
import * as S from './store.js';
import { initCraving, openCraving } from './craving.js';
import { makeStory } from './share.js';
import { initCigarette } from './cigarette.js';
import { runAssessment } from './assessment.js';
import { openReport, downloadPDF } from './report.js';
import { buildReport, planWeek, patchStepFor, gumStageFor, stepAt, APPROACHES, unitOf, targetText, planReviewReason } from './plan.js';
import * as Sync from './sync.js';
import * as Auth from './account.js';
import { merge } from './merge.js';
import { assertAssessment } from './security.js';
import * as Content from './content.js';
import * as Onboarding from './onboarding.js';
import * as Notify from './notify.js';

const $ = (sel, root = document) => root.querySelector(sel);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RING_C = 2 * Math.PI * 52;

let state = null;
let currentUser = null;
let booted = false;
let accountBound = false;
let leavingAccount = false;
// every local change: stamp it for sync, save it, and queue it for the other devices
// every change is saved, synced, and the phone's reminders follow it (a moment later)
let remindTimer = 0;
const persist = () => {
  Sync.changed(state);
  S.save(state);
  clearTimeout(remindTimer);
  remindTimer = setTimeout(() => Notify.reschedule(state), 1500);
};

// a newer copy arrived from another device
function applyRemote(next) {
  state = next;
  S.save(state);
  if (clockEls.d) renderAll();
}

const SYNC_LABEL = {
  ok: 'متزامن مع أجهزتك',
  syncing: 'عم يتزامن…',
  offline: 'بدون نت. رح يتزامن لما يرجع',
  error: 'تعذّرت المزامنة، رح نحاول كمان مرة',
  off: 'المزامنة لسّا مش مفعّلة',
};
function showSync(s) {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  dot.dataset.s = s;
  dot.setAttribute('aria-label', SYNC_LABEL[s] || '');
  dot.title = SYNC_LABEL[s] || '';
  const line = document.getElementById('syncLine');
  if (line) {
    line.lastChild.textContent = SYNC_LABEL[s] || '';
    line.querySelector('.sync-dot').dataset.s = s;
  }
}

let cigarette = null;
const heroMode = () => (S.primaryHabit(state) === 'vape' ? 'vape' : 'cig');

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------------------------------------------------------------- numbers that count
function fmt(v, dec) {
  if (!dec) return S.fmtInt(v);
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function animateNum(el, from, to, dec, dur) {
  el._v = to;
  cancelAnimationFrame(el._raf);
  if (RM || Math.abs(to - from) < (dec ? 0.005 : 1)) { el.textContent = fmt(to, dec); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - k, 4);
    el.textContent = fmt(from + (to - from) * e, dec);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function setNum(el, to, dec = 0) {
  if (el._to === to && el._dec === dec) return;
  el._to = to;
  el._dec = dec;
  el.dataset.num = '';
  const card = el.closest('.card');
  if (card && !card.classList.contains('in')) return;
  animateNum(el, el._v ?? 0, to, dec, el._v == null ? 1400 : 700);
}

// ---------------------------------------------------------------- reveal on scroll
function reveal(card) {
  if (card.classList.contains('in')) return;
  card.classList.add('in');
  revealer.unobserve(card);
  const delay = RM ? 0 : (Number(getComputedStyle(card).getPropertyValue('--i')) || 0) * 70 + 200;
  setTimeout(() => {
    card.querySelectorAll('[data-num]').forEach((el) => animateNum(el, 0, el._to ?? 0, el._dec ?? 0, 1400));
  }, delay);
}

const revealer = new IntersectionObserver((entries) => {
  entries.forEach((en) => { if (en.isIntersecting) reveal(en.target); });
}, { threshold: 0.12 });

// ---------------------------------------------------------------- hero
const clockEls = {};
let daysAnimating = false;

function renderHero() {
  const types = S.activeHabits(state);
  cigarette?.setMode(heroMode());
  $('#storyDays').textContent = Math.floor(S.daysFloat(state));
  $('#storyLbl').textContent = S.word(Math.floor(S.daysFloat(state)), 'يوم', 'أيام');
}

function setUnit(k, text, label) {
  const { num, lbl } = clockEls[k];
  if (num.textContent !== text) {
    num.textContent = text;
    if (!RM && k !== 'd') {
      num.classList.remove('tick');
      void num.offsetWidth;
      num.classList.add('tick');
    }
  }
  if (lbl.textContent !== label) lbl.textContent = label;
}

const FORM_LABEL = { both: 'لزقة + علكة', patch: 'لزقة', gum: 'علكة', none: 'بدون علاج بديل' };
const isPrep = () => state.quitAt > Date.now();

function dateAr(t) {
  return new Date(t).toLocaleDateString('ar-JO-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
}

function tickClock() {
  const left = state.quitAt - Date.now();
  const review = state.assessment && planReviewReason(state.assessment);
  const eyebrow = left > 0 ? (review ? 'موعد محفوظ بحاجة مراجعة' : 'باقي لتطفّيها') : 'صارلك طافيها';
  if ($('#heroEyebrow').textContent !== eyebrow) $('#heroEyebrow').textContent = eyebrow;
  const e = left > 0 ? left : S.elapsed(state);
  const d = Math.floor(e / S.DAY);
  const h = Math.floor((e % S.DAY) / 3600000);
  const m = Math.floor((e % 3600000) / 60000);
  const s = Math.floor((e % 60000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  if (!daysAnimating) setUnit('d', String(d), S.word(d, 'يوم', 'أيام'));
  else clockEls.d.lbl.textContent = S.word(d, 'يوم', 'أيام');
  setUnit('h', pad(h), S.word(h, 'ساعة', 'ساعات'));
  setUnit('m', pad(m), S.word(m, 'دقيقة', 'دقايق'));
  setUnit('s', pad(s), S.word(s, 'ثانية', 'ثواني'));
}

function renderNext() {
  if (isPrep()) {
    const from = state.assessment?.assessedAt || state.quitAt - 7 * S.DAY;
    $('#nextName').textContent = 'يوم الإقلاع';
    $('#nextLeft').textContent = dateAr(state.quitAt);
    $('#nextBar').style.setProperty('--p', Math.min(1, Math.max(0, (Date.now() - from) / (state.quitAt - from))).toFixed(4));
    return;
  }
  const nm = S.nextMilestone(state);
  if (!nm) {
    $('#nextName').textContent = 'خلّصت كل المحطات';
    $('#nextLeft').textContent = '';
    $('#nextBar').style.setProperty('--p', 1);
    return;
  }
  $('#nextName').textContent = `المحطة الجاية: ${nm.name}`;
  $('#nextLeft').textContent = `باقي ${S.duration(nm.left)}`;
  $('#nextBar').style.setProperty('--p', nm.progress.toFixed(4));
}

// ---------------------------------------------------------------- stats
function renderStats() {
  renderSavings();
  const av = S.avoided(state);
  setNum($('#stUnits'), av.units);
  $('#stUnitsK').textContent = av.unitLabel;
  setNum($('#stBeaten'), S.beaten(state));
}

function renderSavings() {
  const balance = S.savings(state);
  const prep = isPrep();
  const net = S.money(state);
  const status = prep
    ? `التوفير بيبدأ من يوم الإقلاع المسجّل: ${dateAr(state.quitAt)}. أي إيداع قبله بينحسب مقدّم.`
    : S.dailyCost(state) <= 0 ? 'مصروف التدخين المسجّل صفر؛ راجع الكمية والسعر بالإعدادات.'
    : net.net < 0 ? 'تكلفة البدائل المسجّلة أعلى من التوفير الحالي؛ الصافي بيظهر لما يغطيها التوفير.'
    : 'صافي التوفير بيتراكم مع الوقت بعد خصم البدائل، وبيظهر لأقرب قرش. الإيداع منفصل عنه.';
  if ($('#savingsStatus').textContent !== status) $('#savingsStatus').textContent = status;
  $('#savingsDate').hidden = !prep;
  setNum($('#stMoney'), balance.earnedCents / 100, 2);
  setNum($('#depositDue'), balance.dueCents / 100, 2);
  setNum($('#depositPaid'), balance.depositedCents / 100, 2);
  $('#depositAhead').hidden = balance.aheadCents === 0;
  $('#depositAhead').textContent = balance.aheadCents ? `إيداعك متقدّم بـ ${S.fmtMoney(balance.aheadCents / 100)} د.أ` : '';
}

function commitSavings(next) {
  if (!S.save(next)) { toast('ما قدرنا نحفظ الإيداع على هالجهاز. جرّب كمان مرة.'); return false; }
  state = next;
  persist();
  renderSavings();
  renderGoal();
  return true;
}

function openDeposit() {
  const due = S.savings(state).dueCents;
  openSheet(`
    <h2>سجّل إيداع</h2>
    <div class="deposit-summary"><span>المستحق للإيداع</span><strong><bdi>${S.fmtMoney(due / 100)}</bdi> د.أ</strong></div>
    <form class="form" id="depositForm" novalidate>
      <label class="field">المبلغ المودَع (د.أ)<input name="amount" type="text" dir="ltr" inputmode="decimal" autocomplete="off" maxlength="12" value="${due > 0 ? (due / 100).toFixed(2) : ''}" placeholder="0.00" aria-describedby="depositError" required></label>
      <label class="field">تاريخ الإيداع<input name="at" type="datetime-local" value="${toLocalInput(Date.now())}" max="${toLocalInput(Date.now())}" required></label>
      <label class="field">ملاحظة (اختياري)<input name="note" maxlength="80" autocomplete="off"></label>
      <p class="deposit-error" id="depositError" role="alert"></p>
      <div class="sheet-actions"><button class="btn btn-red" type="submit"><svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>احفظ الإيداع</button><button class="btn btn-soft" type="button" data-close>إلغاء</button></div>
    </form>`, (sheet) => {
    const form = $('#depositForm', sheet);
    let saved = false;
    form.onsubmit = (ev) => {
      ev.preventDefault();
      if (saved) return;
      const cents = S.parseMoneyCents(form.elements.amount.value);
      const at = new Date(form.elements.at.value).getTime();
      const error = $('#depositError', sheet);
      if (cents === null) { error.textContent = 'اكتب مبلغ أكبر من صفر، بحد أقصى منزلتين بعد الفاصلة.'; form.elements.amount.setAttribute('aria-invalid', 'true'); form.elements.amount.focus(); return; }
      if (!Number.isSafeInteger(at) || at <= 0 || at > Date.now()) { error.textContent = 'اختار تاريخ إيداع صحيح، مش بالمستقبل.'; form.elements.at.focus(); return; }
      const next = structuredClone(state);
      const entry = S.addDeposit(next, { cents, at, note: form.elements.note.value });
      if (!commitSavings(next)) return;
      saved = true;
      closeSheet();
      toast('انسجل إيداعك', 'تراجع', () => {
        const copy = structuredClone(state);
        copy.deposits = (copy.deposits || []).filter((x) => x.id !== entry.id);
        commitSavings(copy);
      });
    };
  });
}

function openDepositHistory() {
  const entries = [...(state.deposits || [])].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  const deposited = S.savings(state).depositedCents;
  openSheet(`<h2>سجل الإيداعات</h2>
    <div class="deposit-summary"><span>مجموع الإيداعات</span><strong><bdi>${S.fmtMoney(deposited / 100)}</bdi> د.أ</strong></div>
    ${entries.length ? `<ul class="deposit-list">${entries.map((entry) => `<li class="deposit-entry">
      <div><time datetime="${new Date(entry.at).toISOString()}">${esc(new Date(entry.at).toLocaleString('ar-JO-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }))}</time>${entry.note ? `<p>${esc(entry.note)}</p>` : ''}</div>
      <strong><bdi>${S.fmtMoney(entry.cents / 100)}</bdi> د.أ</strong>
      <button class="icon-btn" data-deposit-remove="${entry.id}" aria-label="حذف سجل إيداع ${S.fmtMoney(entry.cents / 100)} دينار" title="حذف سجل الإيداع"><svg class="ico" aria-hidden="true"><use href="#i-close"/></svg></button>
    </li>`).join('')}</ul>` : '<p class="lead">لسّه ما سجّلت إيداعات.</p>'}
    <div class="sheet-actions"><button class="btn btn-red" id="historyAdd"><svg class="ico" aria-hidden="true"><use href="#i-plus"/></svg>سجّل إيداع</button><button class="btn btn-soft" data-close>سكّر</button></div>`, (sheet) => {
    $('#historyAdd', sheet).onclick = openDeposit;
    sheet.querySelectorAll('[data-deposit-remove]').forEach((button) => {
      button.onclick = async () => {
        if (!await accountChoice('تحذف سجل الإيداع؟', 'بينحذف السجل من الحصّالة، وبيتحدّث المستحق للإيداع. صافي التوفير ما بيتغيّر.', 'احذف السجل', 'احتفظ فيه')) return;
        const next = structuredClone(state);
        next.deposits = (next.deposits || []).filter((entry) => entry.id !== button.dataset.depositRemove);
        if (commitSavings(next)) { openDepositHistory(); toast('انحذف سجل الإيداع'); }
      };
    });
  });
}

// Show both registered replacements, including before the quit date.
function renderToday() {
  const n = state.nrt;
  const p = state.patch;
  $('#homeGum').hidden = !n?.active;
  $('#homePatch').hidden = !p?.active;
  $('#todayNotice').textContent = !n?.active && !p?.active
    ? 'ما في بدائل مسجّلة حالياً. إذا بتستخدم بديل، أضفه من إعدادات البدائل حسب نشرة منتجك.'
    : 'المخزون حسب العلب والاستخدام المسجّلين. التسجيل مش توصية بأخذ جرعة؛ اتبع نشرة منتجك وتوجيه الصيدلي.';
  if (n?.active) {
    $('#homeGumMg').textContent = `${n.mg} ملغ`;
    $('#homeGumUsage').textContent = `سجّلت اليوم ${S.gumToday(state)} حبة · الحد المسجّل ${n.dailyMax}`;
    $('#homeGumStock').textContent = n.packs.length ? `المتبقي عندك: ${S.gumStock(state)} حبة` : 'ما في علب مسجّلة؛ أضف العلبة لحساب المتبقي.';
  }
  if (p?.active) {
    const done = S.patchedToday(state);
    $('#homePatchUsage').textContent = done ? 'سجّلت لزقة اليوم' : 'لسّه ما سجّلت لزقة اليوم';
    $('#homePatchStock').textContent = p.packs.length ? `المتبقي عندك: ${S.patchStock(state)} لزقة` : 'ما في علب مسجّلة؛ أضف العلبة لحساب المتبقي.';
    $('#homePatchLog').disabled = done;
    $('#homePatchLog').textContent = done ? 'مسجّلة اليوم' : 'سجّل لزقة';
  }
}

function openReplacementHelp(type) {
  const card = $(type === 'gum' ? '#nrtCard' : '#patchCard');
  const content = card.querySelector('.howto').cloneNode(true);
  content.querySelector('summary').remove();
  openSheet(`<h2>${type === 'gum' ? 'طريقة استخدام العلكة' : 'طريقة استخدام اللزقة'}</h2>
    <div class="replacement-help">${content.innerHTML}</div>
    <button class="btn btn-ink" data-close>تمام</button>`);
}

// ---------------------------------------------------------------- nicotine gum
function renderNRT() {
  const card = $('#nrtCard');
  const n = state.nrt;
  card.hidden = !n.active;
  if (!n.active) return;
  $('#nrtMg').textContent = `${n.mg} ملغ`;
  const today = S.gumToday(state);
  setNum($('#nrtToday'), today);
  $('#nrtOf').textContent = `الحد المسجّل ${n.dailyMax}`;
  const prog = $('#nrtRing .prog');
  prog.style.strokeDasharray = RING_C.toFixed(2);
  prog.style.strokeDashoffset = (RING_C * (1 - Math.min(1, today / n.dailyMax))).toFixed(2);
  $('#nrtRing').classList.toggle('over', today >= n.dailyMax);

  const last = n.logs.length ? Math.max(...n.logs) : null;
  $('#nrtLast').innerHTML = today >= n.dailyMax
    ? '<strong style="color:var(--ember-deep)">وصلت الحد المسجّل؛ راجع نشرة منتجك</strong>'
    : last ? `آخر حبة: <strong>قبل ${S.duration(Date.now() - last)}</strong>` : 'لسّا ما سجّلت ولا حبة';
  const stock = S.gumStock(state);
  $('#nrtStock').innerHTML = `المتبقي عندك: <strong>${stock} ${S.word(stock, 'حبة', 'حبات')}</strong>`;

  const tx = state.assessment ? buildReport(state.assessment).tx : null;
  const wk = planWeek(state.quitAt);
  let plan = '';
  if (tx?.form === 'gum' && tx.gumSchedule?.length > 1) {
    const st = gumStageFor(wk);
    plan = wk === 0 ? `بتبلّش يوم الإقلاع: ${gumStageFor(1).text}.` : st ? `خطة الأسبوع ${wk}: ${st.text}.` : 'خلصت خطة العلكة. وقّفها إذا ما عدت محتاجها.';
  } else if (tx?.form === 'both') plan = 'مع اللزقة: حبة وقت الرغبة القوية بس.';
  $('#nrtPlan').hidden = !plan;
  $('#nrtPlan').textContent = plan;

  const week = S.perDayCounts(n.logs);
  const max = Math.max(n.dailyMax * 0.6, ...week.map((w) => w.n), 1);
  $('#nrtWeek').innerHTML = week.map((w, i) =>
    `<i class="${i === 6 ? 'today' : ''}" style="--h:${(w.n / max).toFixed(3)}" title="${w.n}"></i>`).join('');
}

const currentPlan = () => (state.assessment ? buildReport(state.assessment) : null);

// starting the patch up to two weeks before the quit day, while still smoking (Cochrane 2023)
function patchPreload() {
  const r = currentPlan();
  return !!(state.patch?.active && isPrep() && r?.meds.some((m) => m.includes('تحميل مسبق'))
    && state.quitAt - Date.now() <= 14 * S.DAY);
}

function renderPatch() {
  const p = state.patch;
  const card = $('#patchCard');
  card.hidden = !p?.active;
  if (!p?.active) return;
  const wk = planWeek(state.quitAt);
  const preload = patchPreload();
  const st = wk ? patchStepFor(p.steps, wk) : preload ? { ...p.steps[0], index: 0 } : null;
  const total = p.steps.reduce((a, x) => a + x.weeks, 0);
  $('#patchBadge').textContent = `${p.hours} ساعة`;
  $('#patchSteps').innerHTML = p.steps.map((x, i) => {
    const cls = wk === 0 ? (i === 0 ? 'now' : '') : !st ? 'done' : i < st.index ? 'done' : i === st.index ? 'now' : '';
    return `<span class="${cls}">${x.mg}<small>ملغ · ${x.weeks === 1 ? 'أسبوع' : x.weeks === 2 ? 'أسبوعين' : `${x.weeks} ${S.word(x.weeks, 'أسبوع', 'أسابيع')}`}</small></span>`;
  }).join('');
  const stock = S.patchStock(state);
  const stockTxt = stock ? ` باقي عندك ${stock} ${S.word(stock, 'لزقة', 'لزقات')}.` : ' لما تشتري علبة اضغط «اشتريت علبة».';
  $('#patchNote').textContent = preload
    ? `تحميل مسبق: لزقة ${p.steps[0].mg} ملغ كل يوم لحد يوم الإقلاع، وإنت لسّا عم تخفّف.${stockTxt}`
    : wk === 0
    ? `بتبلّش يوم الإقلاع بلزقة ${p.steps[0].mg} ملغ.${stockTxt}`
    : st ? `الأسبوع ${wk} من ${total}: لزقة ${st.mg} ملغ لآخر الأسبوع ${st.endsWeek}.${stockTxt}` : 'خلصت خطة اللزقات. مبروك!';
  const btn = $('#patchBtn');
  const done = S.patchedToday(state);
  btn.disabled = !st;
  btn.setAttribute('aria-pressed', String(done));
  btn.textContent = !st ? (wk === 0 ? 'بتبلّش يوم الإقلاع' : 'خلصت الخطة') : done ? 'حطيتها اليوم ✓' : 'حطيت لزقة اليوم';
}

function logPatch() {
  if (S.patchedToday(state)) return;
  const t = Date.now();
  state.patch.logs.push(t);
  persist();
  renderPatch();
  renderStats();
  renderToday();
  toast('سجّلت لزقة اليوم', 'تراجع', () => {
    const i = state.patch.logs.lastIndexOf(t);
    if (i > -1) state.patch.logs.splice(i, 1);
    persist();
    renderPatch();
    renderStats();
    renderToday();
  });
}

// ---------------------------------------------------------------- cutting down to the quit day
const CUT_TIPS = [
  'أجّل أول وحدة الصبح كل يوم شوي عن اليوم اللي قبله.',
  'ابدأ بشيل الوحدات المرتبطة بلحظة معينة، متل اللي بعد القهوة.',
  'خلّي الباكيت أو الجهاز بغرفة تانية، مش بجيبتك.',
  'قبل كل وحدة استنى 10 دقايق. كتير مرات الرغبة بتروح لحالها.',
  'لا تدخّن نصها وتحسبها أقل: يا كاملة يا لا.',
];

function cutWindow(step) {
  const t = step.targets[0];
  return t.per === 'week' ? [step.fromAt, step.toAt] : [S.startOfDay(Date.now()), S.startOfDay(Date.now()) + S.DAY];
}

function renderCut() {
  const card = $('#cutCard');
  const r = currentPlan();
  $('#planReview').hidden = !r?.reviewReason;
  $('#planReviewReason').textContent = r?.reviewReason || '';
  const step = r && r.approach !== 'abrupt' && isPrep() ? stepAt(r.schedule) : null;
  card.hidden = !step;
  if (!step) return;
  const t = step.targets[0];
  const [from, to] = cutWindow(step);
  const used = (state.smokes || []).filter((x) => x >= from && x < to).length;
  const left = t.value - used;
  $('#cutTitle').textContent = t.per === 'week' ? 'مسموحلك هالأسبوع' : 'مسموحلك اليوم';
  $('#cutWeek').textContent = `${step.label} من ${r.schedule.length}`;
  setNum($('#cutUsed'), used);
  $('#cutOf').textContent = `من ${t.value} ${unitOf(t)}`;
  const n = Math.max(t.value, used);
  $('#cutDots').innerHTML = Array.from({ length: Math.min(n, 40) }, (_, i) =>
    `<i class="${i < used ? (i < t.value ? 'used' : 'over') : ''}"></i>`).join('');
  const tip = CUT_TIPS[Math.floor(Date.now() / S.DAY) % CUT_TIPS.length];
  const nic = step.nic != null ? ` هالأسبوع: ليكويد ${step.nic} ملغ/مل.` : '';
  $('#cutTip').textContent = left > 0 ? `باقيلك ${left}. ${tip}${nic}`
    : left === 0 ? `خلص المسموح. إذا إجتك رغبة، اضغط «عندي رغبة».${nic}`
    : `تعدّيت المسموح، عادي. ارجع عالجدول من الوحدة الجاية.${nic}`;
  $('#cutBtn').textContent = t.type === 'cig' ? 'دخّنت وحدة' : t.type === 'vape' ? 'سحبت مرة' : 'شربت راس';
}

function logCut() {
  const t = Date.now();
  state.smokes = state.smokes || [];
  state.smokes.push(t);
  persist();
  renderCut();
  toast('انسجلت', 'تراجع', () => {
    const i = state.smokes.lastIndexOf(t);
    if (i > -1) state.smokes.splice(i, 1);
    persist();
    renderCut();
  });
}

function renderApproach() {
  const card = $('#approachCard');
  const r = currentPlan();
  card.hidden = !r;
  if (!r) return;
  const ap = APPROACHES[r.approach];
  $('#approachTitle').textContent = r.reviewReason ? 'راجع موعد الإقلاع' : ap.t;
  $('#approachDesc').textContent = r.reviewReason || ap.d;
  const now = Date.now();
  const rows = r.schedule.map((s) => {
    const cls = now >= s.toAt ? 'done' : now >= s.fromAt ? 'now' : '';
    const what = s.targets.map(targetText).join(' · ');
    return `<div class="${cls}"><span>${s.label}</span><b>${what}</b>${s.nic != null ? `<small>ليكويد ${s.nic} ملغ/مل</small>` : ''}</div>`;
  });
  rows.push(`<div class="quit ${now >= state.quitAt ? 'done' : ''}"><span>${r.future ? 'يوم الإقلاع' : 'تركت'}</span><b>${dateAr(state.quitAt)}</b></div>`);
  $('#approachSched').innerHTML = rows.join('');
  $('#approachMeds').innerHTML = r.meds.map((m) => `<li>${m}</li>`).join('');
}

function renderPlan() {
  if (!state.assessment) {
    $('#planSub').textContent = 'جاوب على مقابلة الإقلاع، وخذ تقرير وخطة كاملة إلك.';
    $('#planBtn').textContent = 'ابدأ المقابلة';
    return;
  }
  const r = buildReport(state.assessment);
  const wk = planWeek(state.quitAt);
  const form = r.safe.stop.length ? 'استشير دكتور أولاً' : FORM_LABEL[r.tx.form];
  const stage = r.reviewReason ? 'موعد الإقلاع بحاجة مراجعة' : wk === 0 ? 'قبل يوم الإقلاع' : `الأسبوع ${wk} بعد الإقلاع`;
  $('#planSub').textContent = `${stage} · اعتماد ${['منخفض', 'منخفض', 'متوسط', 'عالي'][r.dep.level]} · ${form}`;
  $('#planBtn').textContent = 'افتح التقرير';
}

const PREP = [
  ['buy', 'اشتري العلاج البديل وخلّيه جاهز'],
  ['tell', 'خبّر 2–3 ناس قريبين منك إنك رح تترك'],
  ['clean', 'ليلة الترك: شيل السجاير والولاعات والطفّايات والفيب'],
  ['plan', 'اقرأ خطتك للحظات الصعبة بالتقرير'],
  ['first', 'قرر شو رح تعمل أول ساعة بيوم الإقلاع'],
];

function renderPrep() {
  const card = $('#prepCard');
  card.hidden = !isPrep();
  if (!isPrep()) return;
  const r = state.assessment ? buildReport(state.assessment) : null;
  const items = PREP.filter(([id]) => id !== 'buy' || (r && r.tx.form !== 'none' && !r.safe.stop.length));
  state.prep = state.prep || {};
  const done = items.filter(([id]) => state.prep[id]).length;
  $('#prepCount').textContent = `${done} من ${items.length}`;
  $('#prepList').innerHTML = items.map(([id, label]) =>
    `<button type="button" data-prep="${id}" aria-pressed="${!!state.prep[id]}"><span class="box"><svg class="ico"><use href="#i-check"/></svg></span><span>${label}</span></button>`).join('');
}

function answersFromState(s) {
  return {
    name: s.name,
    products: S.activeHabits(s),
    cig_perDay: s.habits.cig.perDay, cig_packPrice: s.habits.cig.packPrice, cig_packSize: s.habits.cig.packSize,
    vp_kind: s.habits.vape.kind, vp_price: s.habits.vape.unitPrice, vp_days: s.habits.vape.daysPerUnit, vp_puffs: s.habits.vape.puffs,
    ar_perWeek: s.habits.argileh.perWeek, ar_price: s.habits.argileh.price,
    nrt_now: s.nrt.active ? 'gum' : 'none',
    gum_mg: s.nrt.mg, gum_max: s.nrt.dailyMax, gum_price: s.nrt.packPrice, gum_count: s.nrt.packCount,
    quitMode: s.quitAt > Date.now() ? 'future' : 'done', when: 'custom', pastDate: s.quitAt, futureDate: s.quitAt,
  };
}

// the intake interview, then the report; keeps history when retaken
async function intake(prev = null) {
  const a = await runAssessment(prev ? (prev.assessment || answersFromState(prev)) : { name: Auth.firstName(currentUser) });
  state = S.createFromAssessment(a, buildReport(a).tx, prev);
  persist();
  if (clockEls.d) renderAll();
  await openReport(a, { first: true });
}

function logGum(btn) {
  const t = Date.now();
  state.nrt.logs.push(t);
  persist();
  renderNRT();
  renderStats();
  renderToday();
  const host = btn?.closest('.card');
  if (!RM && host) {
    const r = btn.getBoundingClientRect();
    const c = host.getBoundingClientRect();
    const plus = document.createElement('span');
    plus.className = 'plus-one';
    plus.textContent = '+1';
    plus.style.left = `${r.left - c.left + r.width / 2 - 14}px`;
    plus.style.top = `${r.top - c.top - 10}px`;
    host.appendChild(plus);
    setTimeout(() => plus.remove(), 950);
  }
  if (!btn) return;
  toast('سجّلت حبة', 'تراجع', () => {
    const i = state.nrt.logs.lastIndexOf(t);
    if (i > -1) state.nrt.logs.splice(i, 1);
    persist();
    renderNRT();
    renderStats();
    renderToday();
  });
}

// ---------------------------------------------------------------- health
function renderHealth() {
  const list = S.milestonesFor(state);
  const e = S.elapsed(state);
  const doneN = list.filter((m) => m.at <= e).length;
  const next = S.nextMilestone(state);
  setNum($('#bodyDone'), doneN);
  $('#bodyTotal').textContent = `من ${list.length}`;
  $('#bodyNext').textContent = next ? next.name : 'خلّصت كل المحطات';
  $('#bodyLeft').textContent = next ? (isPrep() ? 'بتبلّش من يوم الإقلاع' : `باقي ${S.duration(next.left)}`) : '';
  $('#miles').innerHTML = list.map((m) => {
    const done = m.at <= e;
    const now = !done && next && m === list.find((x) => x.at === next.at && x.text === next.text);
    const cls = done ? 'done' : now ? 'now' : 'later';
    const dot = done ? '<svg class="ico"><use href="#i-check"/></svg>' : '';
    const bar = now ? `<div class="bar"><i style="--p:${next.progress.toFixed(4)}"></i></div>` : '';
    return `<li class="mile ${cls}"><span class="dot">${dot}</span><div><span class="t">${m.name}${now ? ` · باقي ${S.duration(next.left)}` : ''}</span><p>${Content.text('milestone', m.id, m.text)}</p>${bar}</div></li>`;
  }).join('');
}

// ---------------------------------------------------------------- cravings
function renderCravings() {
  const body = $('#cravBody');
  if (!state.cravings.length) {
    body.innerHTML = '<div class="empty"><b>لسّا ما في رغبات</b>كل ما تضغط «عندي رغبة» بتنحسب هون.</div>';
    return;
  }
  const days = S.perDayCounts(state.cravings, Date.now(), 7, (c) => c.at);
  const max = Math.max(3, ...days.map((d) => d.n));
  const cols = days.map((d, i) => {
    const today = i === 6;
    const name = today ? 'اليوم' : S.DAY_NAMES[new Date(d.day).getDay()];
    return `<div class="col ${today ? 'today' : ''}"><span class="n">${d.n}</span><i class="b" style="--h:${(d.n / max).toFixed(3)}"></i><span class="dn">${name}</span></div>`;
  }).join('');
  const trig = S.triggerCounts(state).slice(0, 4);
  const tmax = Math.max(1, ...trig.map((t) => t.n));
  const trows = trig.length
    ? `<div class="trig">${trig.map((t) => `<div class="trig-row"><span>${t.label}</span><div class="bar"><i style="--p:${(t.n / tmax).toFixed(3)}"></i></div><span class="n">${t.n}</span></div>`).join('')}</div>`
    : '';
  const rated = state.cravings.filter((c) => c.before && c.after);
  const avg = (k) => rated.reduce((x, c) => x + c[k], 0) / rated.length;
  const drop = rated.length
    ? `<div class="drop-stat"><span>القوة بالمعدّل</span><b style="--v:${avg('before')}">${avg('before').toFixed(1)}</b><i aria-hidden="true"></i><b style="--v:${avg('after')}">${avg('after').toFixed(1)}</b><span>بعد ما تعدّيها</span></div>`
    : '';
  body.innerHTML = `${drop}<div class="chart">${cols}</div>${trows}`;
}

// ---------------------------------------------------------------- goal
function renderGoal() {
  const body = $('#goalBody');
  const g = state.goal;
  if (!g) {
    body.innerHTML = '<div class="empty"><b>شو بدك تشتري من التوفير؟</b><button class="btn btn-ink" id="goalSet">حط هدف</button></div>';
    $('#goalSet').onclick = openGoal;
    return;
  }
  const net = S.savings(state).depositedCents / 100;
  const p = Math.min(1, net / g.amount);
  const left = g.amount - net;
  body.innerHTML = `
    <p class="card-sub" style="margin:-6px 0 6px">${esc(g.title)}</p>
    <div class="goal-amt"><span class="n" id="goalN">0</span><span class="of">من ${S.fmtMoney(g.amount)} د.أ</span></div>
    <div class="bar red"><i style="--p:${p.toFixed(4)}"></i></div>
    <p class="eta">${left <= 0 ? 'وصلت هدفك. كافئ حالك، بتستاهل.' : `باقي إيداع ${S.fmtMoney(left)} د.أ لهدفك`}</p>
    <button class="btn btn-soft" id="goalEdit" style="margin-top:12px">عدّل الهدف</button>`;
  setNum($('#goalN'), net, 2);
  $('#goalEdit').onclick = openGoal;
}

// ---------------------------------------------------------------- guardian + buddy
function renderGuardian() {
  const e = S.elapsed(state);
  const d = e / S.DAY;
  $('#guardBar').style.setProperty('--p', Math.min(1, d / 30).toFixed(4));
  $('#guardBadge').textContent = `${Math.min(30, Math.floor(d))} من 30`;
  $('#guardTxt').textContent = d >= 30 ? 'صرت حارس. بتقدر تساعد غيرك وقت رغبتهم.' : `بعد ${S.duration(30 * S.DAY - e)} بتصير حارس وبتساعد غيرك.`;
}

function renderSlips() {
  const n = S.slipUnits(state);
  const el = $('#slipNote');
  el.hidden = !n;
  if (n) {
    const what = n === 1 ? 'زلّة وحدة' : n === 2 ? 'زلّتين' : `${n} ${S.word(n, 'زلّة', 'زلّات')}`;
    el.textContent = S.primaryHabit(state) === 'vape'
      ? `سجّلت ${what} بهالمحاولة.`
      : `سجّلت ${what} بهالمحاولة، وانخصمت من التوفير والعدّ.`;
  }
}

function renderBuddy() {
}

function renderHeader() {
  const h = new Date().getHours();
  $('#greet').textContent = h >= 4 && h < 12 ? 'صباح الخير' : 'مسا الخير';
  $('#name').textContent = state.name || 'بطل';
  $('#openAccount').textContent = currentUser ? (Auth.firstName(currentUser) || state.name || 'ح').slice(0, 1) : 'حسابي';
  $('#openAccount').setAttribute('aria-label', currentUser ? 'حسابي' : 'تسجيل الدخول');
}

// ---------------------------------------------------------------- team content
// The announcement (closable) and the day's message come from the admin area.
function renderContent() {
  const box = $('#announce');
  const a = Content.announcement();
  if (a) {
    if (box.dataset.id !== a.id) {
      box.dataset.id = a.id;
      box.innerHTML = `<div class="announce-body">${a.title ? `<b>${a.title}</b>` : ''}<p>${a.body}</p>
        ${a.link ? `<a class="announce-link" href="${a.link}" target="_blank" rel="noopener">${a.label}</a>` : ''}</div>
        <button class="icon-btn" type="button" aria-label="سكّر الإعلان"><svg class="ico"><use href="#i-close"/></svg></button>`;
      box.querySelector('button').onclick = () => { Content.dismiss(a.id); box.hidden = true; delete box.dataset.id; };
    }
    box.hidden = false;
  } else {
    box.hidden = true;
    delete box.dataset.id;
  }
  const msg = $('#heroMsg');
  const day = isPrep() ? 0 : Math.floor(S.elapsed(state) / S.DAY) + 1;
  const line = Content.daily(day);
  if (msg.innerHTML !== line) msg.innerHTML = line;
  msg.hidden = !line;
}

function renderAll() {
  renderHeader();
  renderContent();
  renderHero();
  tickClock();
  renderNext();
  renderStats();
  renderNRT();
  renderHealth();
  renderCravings();
  renderGoal();
  renderGuardian();
  renderBuddy();
  renderSlips();
  renderPlan();
  renderPatch();
  renderPrep();
  renderToday();
  renderCut();
  renderApproach();
}

// ---------------------------------------------------------------- toast
let toastTimer = 0;
function toast(msg, actLabel, act) {
  const t = $('#toast');
  $('#toastMsg').textContent = msg;
  const b = $('#toastAct');
  b.hidden = !actLabel;
  if (actLabel) {
    b.textContent = actLabel;
    b.onclick = () => { act(); t.classList.remove('show'); };
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), actLabel ? 5000 : 3200);
}

// ---------------------------------------------------------------- sheets
let sheetOpener = null;
let sheetCloseTimer = 0;
let sheetOverflow = '';
function openSheet(html, mount) {
  const sheet = $('#sheet');
  const bd = $('#backdrop');
  sheetOpener = document.activeElement;
  clearTimeout(sheetCloseTimer);
  if (sheet.hidden) sheetOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.querySelector('.app').inert = true;
  document.querySelector('.tabbar').inert = true;
  sheet.innerHTML = `<div class="grab"></div>${html}`;
  sheet.hidden = false;
  bd.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    sheet.classList.add('open');
    bd.classList.add('open');
  }));
  sheet.querySelectorAll('[data-close]').forEach((b) => { b.onclick = closeSheet; });
  mount?.(sheet);
  sheet.onkeydown = (ev) => {
    if (ev.key !== 'Tab') return;
    const items = [...sheet.querySelectorAll('input, button, select, summary, a[href]')].filter((el) => !el.disabled && el.getClientRects().length);
    if (ev.shiftKey && document.activeElement === items[0]) { ev.preventDefault(); items.at(-1)?.focus(); }
    else if (!ev.shiftKey && document.activeElement === items.at(-1)) { ev.preventDefault(); items[0]?.focus(); }
  };
  setTimeout(() => sheet.querySelector('input, button:not(.danger), select')?.focus({ preventScroll: true }), 60);
}

function closeSheet() {
  const sheet = $('#sheet');
  const bd = $('#backdrop');
  if (sheet.hidden) return;
  sheet.classList.remove('open');
  bd.classList.remove('open');
  document.querySelector('.app').inert = false;
  document.querySelector('.tabbar').inert = false;
  document.body.style.overflow = sheetOverflow;
  sheetCloseTimer = setTimeout(() => { sheet.hidden = true; bd.hidden = true; sheet.innerHTML = ''; }, 450);
  sheetOpener?.focus?.({ preventScroll: true });
}

function toLocalInput(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function num(form, name, fallback) {
  const v = parseFloat(form.elements[name]?.value);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

// ---------------------------------------------------------------- reminders (the phone app)
const REMIND_KINDS = [
  ['danger', 'أوقات الخطر', 'حسب اللي حكيتلنا عنه: القهوة، بعد الأكل، السهر…'],
  ['milestones', 'الإنجازات', 'كل محطة بتوصلها، ويوم الطفي'],
  ['daily', 'تذكير يومي', 'رسالة اليوم، واللزقة الصبح'],
  ['news', 'أخبار طفّيها', 'إعلانات قليلة من فريق طفّيها'],
];

async function renderReminders(box) {
  if (!Notify.native()) {
    box.insertAdjacentHTML('beforeend', '<p class="card-sub">التذكيرات بتشتغل بتطبيق طفّيها على الموبايل.</p>');
    return;
  }
  const allowed = await Notify.permission() === 'granted';
  const p = Notify.prefs();
  box.insertAdjacentHTML('beforeend', allowed
    ? `<div class="remind-list">${REMIND_KINDS.map(([k, t, d]) => `
        <label class="remind"><span><b>${t}</b><small>${d}</small></span>
          <input type="checkbox" data-remind="${k}" ${p[k] ? 'checked' : ''}><i aria-hidden="true"></i></label>`).join('')}</div>`
    : `<p class="card-sub">التذكيرات مطفية. بنذكّرك بأوقات الخطر وبكل إنجاز، وبتقدر توقف أي نوع منها.</p>
       <button class="btn btn-soft" type="button" data-remind-on>شغّل التذكيرات</button>`);
  box.querySelectorAll('[data-remind]').forEach((input) => {
    input.onchange = () => { Notify.setPrefs({ [input.dataset.remind]: input.checked }); Notify.reschedule(state); };
  });
  const on = box.querySelector('[data-remind-on]');
  if (on) on.onclick = async () => {
    const r = await Notify.ask();
    if (r === 'granted') { Notify.reschedule(state); box.querySelectorAll(':scope > :not(legend)').forEach((el) => el.remove()); renderReminders(box); }
    else toast('التذكيرات مطفية من إعدادات التلفون. شغّلها من هناك لطفّيها.');
  };
}

// After the plan opens for the first time: ask once, in our own words, before the system asks.
async function startReminders() {
  Notify.onOpen((extra) => { if (extra.open === 'craving') openCraving(); });
  if (!Notify.native()) return;
  const permission = await Notify.permission();
  if (permission === 'granted') { Notify.reschedule(state); return; }
  if (permission !== 'prompt' || Notify.prefs().asked || !state) return;
  setTimeout(async () => {
    const yes = await accountChoice('خلّي طفّيها يذكّرك',
      'بنذكّرك بأوقات الخطر اللي حكيتلنا عنها، وبكل إنجاز بتوصله. بتقدر توقف أي نوع من الإعدادات.',
      'شغّل التذكيرات', 'بعدين');
    if (!yes) { Notify.setPrefs({ asked: true }); return; }
    if (await Notify.ask() === 'granted') { Notify.reschedule(state); toast('تمام، رح نذكّرك'); }
  }, 1200);
}

// Android's back button: close what's open, step back, or leave the app from the home page.
function wireBackButton() {
  const App = globalThis.Capacitor?.Plugins?.App;
  if (!Notify.native() || !App) return;
  App.addListener('backButton', () => {
    const dialog = document.querySelector('dialog[open]');
    if (dialog) { dialog.dispatchEvent(new Event('cancel', { cancelable: true })); return; }
    const intro = document.querySelector('.intro');
    if (intro) { const b = intro.querySelector('.intro-page:not([inert]) [data-back]'); if (b) b.click(); else App.minimizeApp(); return; }
    const overlays = [...document.querySelectorAll('.onb')];
    const top = overlays.at(-1);
    if (top) { const b = top.querySelector('.onb-back'); if (b && getComputedStyle(b).visibility !== 'hidden') b.click(); else App.minimizeApp(); return; }
    if (!$('#sheet').hidden) { closeSheet(); return; }
    const craving = $('#craving');
    if (craving && !craving.hidden) { $('#cvClose').click(); return; }
    const report = document.querySelector('.report');
    if (report) { report.querySelector('.rp-done')?.click(); return; }
    if (!document.querySelector('.page[data-page="home"]').classList.contains('is-active')) { showPage('home'); return; }
    App.minimizeApp();
  });
}

function openSettings() {
  const s = state;
  const defaults = S.createState().habits;
  const h = Object.fromEntries(Object.entries(s.habits).map(([kind, values]) => [kind, { ...defaults[kind], ...Object.fromEntries(Object.entries(values).filter(([, value]) => value != null)) }]));
  const field = (label, name, value, step = 'any', extra = '') =>
    `<label class="field" ${extra}>${label}<input type="number" inputmode="decimal" min="0" step="${step}" name="${name}" value="${esc(value)}"></label>`;
  const kinds = Object.entries(S.VAPE_KINDS)
    .map(([k, v]) => `<option value="${k}" ${h.vape.kind === k ? 'selected' : ''}>${v.label}</option>`).join('');
  openSheet(`
    <h2>إعداداتك</h2>
    <p class="lead">من هالأرقام بنحسب توفيرك ومحطاتك. عدّلها براحتك.</p>
    <form class="form" id="setForm" novalidate>
      <fieldset class="fs"><legend>أجهزتك</legend>
        <p class="sync-line" id="syncLine"><span class="sync-dot" data-s="${Sync.getStatus()}"></span><span>${SYNC_LABEL[Sync.getStatus()] || ''}</span></p>
        <p class="card-sub">${currentUser ? 'سجّل دخول بنفس الحساب على جهازك التاني.' : 'بدون حساب، رحلتك بتضل على هالجهاز بس. اعمل حساب من «حسابي» حتى تنحفظ وتتزامن.'}</p>
      </fieldset>
      <fieldset class="fs" id="remindSet"><legend>التذكيرات</legend></fieldset>
      <fieldset class="fs"><legend>إنت</legend>
        <label class="field">اسمك<input name="name" value="${esc(s.name)}" maxlength="24" autocomplete="given-name"></label>
        <label class="field">يوم الإقلاع<input type="datetime-local" name="quitAt" value="${toLocalInput(s.quitAt)}" required></label>
      </fieldset>
      <fieldset class="fs"><legend>شو كنت تستعمل؟</legend>
        <div class="toggles">
          ${Object.keys(S.HABITS).map((k) => `<label><input type="checkbox" name="h_${k}" ${h[k].active ? 'checked' : ''}><span>${S.HABITS[k].label}</span></label>`).join('')}
        </div>
        <div class="habit-fields" data-h="cig" ${h.cig.active ? '' : 'data-off'}>
          <div class="row2">${field('كم سيجارة باليوم', 'cig_perDay', h.cig.perDay, 1)}${field('سعر الباكيت (د.أ)', 'cig_packPrice', h.cig.packPrice, 0.05)}</div>
          ${field('كم سيجارة بالباكيت', 'cig_packSize', h.cig.packSize, 1)}
        </div>
        <div class="habit-fields" data-h="vape" ${h.vape.active ? '' : 'data-off'}>
          <label class="field">نوع الفيب<select name="vape_kind">${kinds}</select></label>
          <div class="row2">${field('السعر (د.أ)', 'vape_unitPrice', h.vape.unitPrice, 0.25)}${field('كم يوم بيخلص معك', 'vape_daysPerUnit', h.vape.daysPerUnit, 0.5)}</div>
          ${field('كم سحبة مكتوب عليه', 'vape_puffs', h.vape.puffs, 100, `data-puffs ${h.vape.kind === 'disposable' ? '' : 'hidden'}`)}
        </div>
        <div class="habit-fields" data-h="argileh" ${h.argileh.active ? '' : 'data-off'}>
          <div class="row2">${field('كم راس بالأسبوع', 'argileh_perWeek', h.argileh.perWeek, 1)}${field('سعر الراس (د.أ)', 'argileh_price', h.argileh.price, 0.25)}</div>
        </div>
      </fieldset>
      <fieldset class="fs"><legend>علكة النيكوتين</legend>
        <div class="toggles"><label><input type="checkbox" name="h_nrt" ${s.nrt.active ? 'checked' : ''}><span>بستعمل علكة</span></label></div>
        <div class="habit-fields" data-h="nrt" ${s.nrt.active ? '' : 'data-off'}>
          <div class="row2">
            <label class="field">التركيز<select name="nrt_mg"><option value="2" ${s.nrt.mg == 2 ? 'selected' : ''}>2 ملغ</option><option value="4" ${s.nrt.mg == 4 ? 'selected' : ''}>4 ملغ</option></select></label>
            ${field('الحد اليومي (من العلبة)', 'nrt_dailyMax', s.nrt.dailyMax, 1)}
          </div>
          <div class="row2">${field('سعر العلبة (د.أ)', 'nrt_packPrice', s.nrt.packPrice, 0.25)}${field('كم حبة بالعلبة', 'nrt_packCount', s.nrt.packCount, 1)}</div>
          <button type="button" class="btn btn-soft" id="newPack">اشتريت علبة جديدة</button>
        </div>
      </fieldset>
      <div class="sheet-actions">
        <button class="btn btn-red" type="submit">احفظ</button>
        <button class="btn btn-soft" type="button" data-close>إلغاء</button>
        <button class="btn btn-line" type="button" id="retake">أعد مقابلة الإقلاع</button>
        ${!currentUser ? '<button class="danger" type="button" id="resetAll">امسح كل بياناتي وابدأ من جديد</button>' : ''}
      </div>
    </form>`, (sheet) => {
    const f = $('#setForm', sheet);
    renderReminders($('#remindSet', sheet));
    f.addEventListener('change', (ev) => {
      const m = ev.target.name?.match(/^h_(\w+)$/);
      if (m) sheet.querySelector(`[data-h="${m[1]}"]`)?.toggleAttribute('data-off', !ev.target.checked);
      if (ev.target.name === 'vape_kind') sheet.querySelector('[data-puffs]').hidden = ev.target.value !== 'disposable';
    });
    $('#newPack', sheet).onclick = () => {
      state.nrt.packs.push(Date.now());
      persist();
      renderNRT();
      toast(`انضافت علبة. صار عندك ${S.gumStock(state)} حبة`);
    };
    $('#retake', sheet).onclick = () => { closeSheet(); setTimeout(() => intake(state), 350); };
    const reset = $('#resetAll', sheet);
    if (reset) reset.onclick = () => {
      if (!reset.dataset.armed) {
        reset.dataset.armed = '1';
        reset.textContent = 'متأكد؟ اضغط كمان مرة للمسح';
        return;
      }
      state = S.reset();
      Sync.forget();
      Sync.initSync(syncOptions());
      closeSheet();
      setTimeout(() => intake(null), 350);
    };
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const active = Object.keys(S.HABITS).filter((k) => f.elements[`h_${k}`].checked);
      if (!active.length) { toast('اختار شي واحد على الأقل كنت تستعمله'); return; }
      const q = new Date(f.elements.quitAt.value).getTime();
      state.name = f.elements.name.value.trim() || state.name;
      if (!Number.isFinite(q) || q <= 0) { toast('اختار يوم إقلاع صحيح'); return; }
      state.quitAt = q;
      if (state.assessment) state.assessment = { ...state.assessment, quitAt: q, quitMode: q > Date.now() ? 'future' : 'done' };
      Object.keys(S.HABITS).forEach((k) => { state.habits[k].active = active.includes(k); });
      Object.assign(state.habits.cig, {
        perDay: num(f, 'cig_perDay', h.cig.perDay), packPrice: num(f, 'cig_packPrice', h.cig.packPrice),
        packSize: num(f, 'cig_packSize', h.cig.packSize),
      });
      Object.assign(state.habits.vape, {
        kind: f.elements.vape_kind.value, unitPrice: num(f, 'vape_unitPrice', h.vape.unitPrice),
        daysPerUnit: num(f, 'vape_daysPerUnit', h.vape.daysPerUnit), puffs: num(f, 'vape_puffs', h.vape.puffs),
      });
      Object.assign(state.habits.argileh, {
        perWeek: num(f, 'argileh_perWeek', h.argileh.perWeek), price: num(f, 'argileh_price', h.argileh.price),
      });
      Object.assign(state.nrt, {
        active: f.elements.h_nrt.checked, mg: Number(f.elements.nrt_mg.value),
        dailyMax: num(f, 'nrt_dailyMax', s.nrt.dailyMax), packPrice: num(f, 'nrt_packPrice', s.nrt.packPrice),
        packCount: num(f, 'nrt_packCount', s.nrt.packCount),
      });
      persist();
      closeSheet();
      renderAll();
      toast('انحفظت إعداداتك');
    });
  });
}

function openGoal() {
  const g = state.goal || { title: '', amount: '' };
  openSheet(`
    <h2>هدفك من التوفير</h2>
    <p class="lead">شو بدك تشتري من المصاري اللي كانت تروح عالدخان؟</p>
    <form class="form" id="goalForm" novalidate>
      <label class="field">الهدف<input name="title" value="${esc(g.title)}" maxlength="40" placeholder="مثلاً: سفرة للعقبة"></label>
      <label class="field">المبلغ (د.أ)<input name="amount" type="number" inputmode="decimal" min="1" step="1" value="${esc(g.amount)}"></label>
      <div class="sheet-actions">
        <button class="btn btn-red" type="submit">احفظ الهدف</button>
        ${state.goal ? '<button class="btn btn-soft" type="button" id="goalDel">شيل الهدف</button>' : '<button class="btn btn-soft" type="button" data-close>إلغاء</button>'}
      </div>
    </form>`, (sheet) => {
    const f = $('#goalForm', sheet);
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const title = f.elements.title.value.trim();
      const amount = parseFloat(f.elements.amount.value);
      if (!title || !(amount > 0)) { toast('اكتب الهدف والمبلغ'); return; }
      state.goal = { title, amount };
      persist();
      closeSheet();
      renderGoal();
      toast('انحفظ هدفك');
    });
    const del = $('#goalDel', sheet);
    if (del) del.onclick = () => { state.goal = null; persist(); closeSheet(); renderGoal(); };
  });
}

function openSlip() {
  openSheet(`
    <h2>زلّيت؟ عادي.</h2>
    <p class="lead">أغلب اللي تركوا زلّوا مرة أو أكتر قبل ما يثبتوا. المهم شو بتعمل هلأ.</p>
    <div class="sheet-actions">
      <button class="btn btn-ink" id="slipKeep">زلّة وحدة، وبكمّل</button>
      <button class="btn btn-line" id="slipReset">رجعت، بدي أبلّش من جديد</button>
      <button class="btn btn-soft" data-close>إلغاء</button>
    </div>`, (sheet) => {
    $('#slipKeep', sheet).onclick = () => {
      state.slips.push({ at: Date.now(), n: 1 });
      persist();
      closeSheet();
      renderAll();
      toast(S.primaryHabit(state) === 'vape' ? 'انسجلت. عدّادك مكمّل، وإنت كمان.' : 'انسجلت وانخصمت من أرقامك. عدّادك مكمّل، وإنت كمان.');
    };
    const r = $('#slipReset', sheet);
    r.onclick = () => {
      if (!r.dataset.armed) {
        r.dataset.armed = '1';
        r.textContent = 'متأكد؟ العدّاد رح يبلّش من هلأ';
        return;
      }
      S.restartJourney(state);
      persist();
      closeSheet();
      renderAll();
      toast('بلّشنا من جديد. أول دقيقة هي أهم دقيقة.');
    };
  });
}

async function openShare() {
  const btn = $('#shareBtn');
  btn.disabled = true;
  try {
    const blob = await makeStory(state, heroMode());
    const url = URL.createObjectURL(blob);
    const file = new File([blob], 'tafiha-story.png', { type: 'image/png' });
    const canShare = navigator.canShare?.({ files: [file] });
    openSheet(`
      <h2>ستوري جاهزة</h2>
      <p class="lead">نزّلها وحطها عالستوري، أو شاركها مباشرة.</p>
      <img class="story-preview" src="${url}" alt="صورة الستوري">
      <div class="sheet-actions">
        ${canShare ? '<button class="btn btn-red" id="doShare">شارك</button>' : ''}
        <a class="btn ${canShare ? 'btn-soft' : 'btn-red'}" id="doSave" href="${url}" download="tafiha-story.png">نزّل الصورة</a>
        <button class="btn btn-soft" data-close>سكّر</button>
      </div>`, (sheet) => {
      const s = $('#doShare', sheet);
      if (s) s.onclick = () => navigator.share({ files: [file], title: 'طفّيها' }).catch(() => {});
    });
  } finally {
    btn.disabled = false;
  }
}

async function invite() {
  const d = Math.floor(S.daysFloat(state));
  const text = `أنا تارك الدخان صارلي ${d} ${S.word(d, 'يوم', 'أيام')} مع طفّيها. تعال اتركه معي؟`;
  const url = location.href.split('#')[0];
  if (navigator.share) {
    try { await navigator.share({ title: 'طفّيها', text, url }); } catch (e) { /* cancelled */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast('نسخت الدعوة. ابعتها لصاحبك');
  } catch (e) {
    toast('ما قدرت أنسخ الدعوة');
  }
}

// ---------------------------------------------------------------- boot
// ---------------------------------------------------------------- pages
function showPage(name) {
  const next = document.querySelector(`.page[data-page="${name}"]`);
  const cur = document.querySelector('.page.is-active');
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  });
  if (next === cur) { window.scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' }); return; }
  cur?.classList.remove('is-active');
  next.classList.add('is-active');
  window.scrollTo(0, 0);
  next.querySelectorAll('.card').forEach((c) => {
    const r = c.getBoundingClientRect();
    if (r.top < innerHeight) reveal(c);
  });
  cigarette?.setMode(name === 'home' ? heroMode() : 'off');
}

const syncOptions = () => ({ userId: currentUser?.id, getState: () => state, setState: applyRemote, onStatus: showSync });

function accountChoice(title, message, yes, no) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'account-dialog';
    dialog.setAttribute('aria-labelledby', 'accountDecisionTitle');
    dialog.innerHTML = `<img src="assets/icons/shield.webp" width="72" height="72" alt="">
      <h2 id="accountDecisionTitle">${esc(title)}</h2><p>${esc(message)}</p>
      <div class="sheet-actions"><button class="btn btn-red" data-yes>${esc(yes)}</button><button class="btn btn-soft" data-no>${esc(no)}</button></div>`;
    document.body.appendChild(dialog);
    const finish = (answer) => { dialog.close(); dialog.remove(); resolve(answer); };
    dialog.querySelector('[data-yes]').onclick = () => finish(true);
    dialog.querySelector('[data-no]').onclick = () => finish(false);
    dialog.addEventListener('cancel', (ev) => { ev.preventDefault(); finish(false); });
    dialog.showModal();
  });
}

async function openAccount() {
  if (!currentUser) {
    const result = await Auth.runAuth({ name: state?.name, allowLocal: true });
    if (result?.user) location.reload();
    else if (result === 'home') showPage('home');
    return;
  }
  const details = currentUser.user_metadata || {};
  const iso = details.phone_country || 'JO';
  openSheet(`<div class="account-heading"><span class="account-avatar">${esc((Auth.firstName(currentUser) || 'ح').slice(0, 1))}</span>
    <div><h2>حسابي</h2><p class="account-email" dir="ltr">${esc(currentUser.email || '')}</p></div>
    <button class="icon-btn" data-close aria-label="إغلاق"><svg class="ico"><use href="#i-close"/></svg></button></div>
    <form class="form account-form" novalidate>
      <label class="field">اسمك<input name="full_name" autocomplete="name" maxlength="40" value="${esc(details.full_name || details.name || state.name)}"></label>
      ${Auth.phoneField('profilePhone', iso, Auth.nationalPart(details.phone, iso))}
      <p class="onb-err" role="alert"></p><button class="btn btn-red" type="submit">احفظ التعديلات</button>
    </form>
    <div class="account-actions">
      <p class="sync-line" id="syncLine"><span class="sync-dot" data-s="${Sync.getStatus()}"></span><span>${SYNC_LABEL[Sync.getStatus()]}</span></p>
      <button class="btn btn-soft" id="accountPassword">غيّر كلمة السر</button>
      <button class="btn btn-line" id="accountLogout">سجّل خروج</button>
      <button class="btn btn-line" id="accountLogoutAll">سجّل خروج من كل الأجهزة</button>
      <button class="danger" id="accountDelete">احذف حسابي وبياناتي</button>
      <nav class="legal-links" aria-label="الصفحات القانونية"><a href="privacy.html" target="_blank" rel="noopener">الخصوصية</a><a href="terms.html" target="_blank" rel="noopener">الشروط</a><a href="delete-account.html" target="_blank" rel="noopener">عن حذف الحساب</a></nav>
    </div>`, (sheet) => {
    const form = sheet.querySelector('form');
    const err = sheet.querySelector('[role="alert"]');
    Auth.wirePhone(form);
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const name = form.elements.full_name.value.trim();
      const phone = Auth.readPhone(form);
      if (!name) { err.textContent = 'اكتب اسمك.'; form.elements.full_name.focus(); return; }
      if (phone === false) { err.textContent = 'رقم التلفون مش مزبوط.'; form.elements.phone.focus(); return; }
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      err.textContent = '';
      try {
        currentUser = await Auth.updateProfile({ full_name: name, phone: phone?.e164 || '', phone_country: phone?.iso || iso });
        state.name = name.split(/\s+/)[0];
        persist();
        renderHeader();
        toast('انحفظت معلومات حسابك');
      } catch (e) { err.textContent = Auth.authError(e); }
      btn.disabled = false;
    };
    // a code to the account's email, then the new password (same screens as "forgot password")
    $('#accountPassword', sheet).onclick = async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      const result = await Auth.runAuth({ mode: 'password', email: currentUser.email });
      if (result?.user) { currentUser = result.user; toast('تغيّرت كلمة السر'); }
      if (result === 'home') { closeSheet(); showPage('home'); return; }
      btn.disabled = false;
      btn.focus({ preventScroll: true });
    };
    const leave = async (btn, scope) => {
      btn.disabled = true;
      leavingAccount = true;
      try {
        const saved = await Sync.flush();
        if (!saved && !await accountChoice('في تعديلات لسه ما تزامنت', 'بتضل نسخة محفوظة على هالجهاز، وبتتزامن لما ترجع تسجّل دخول بنفس الحساب.', 'سجّل خروج', 'خلّيني هون')) return;
        Sync.stop();
        await Auth.signOut(scope);
        // A synced journey can be restored after login; do not leave health data
        // behind on a shared device. Unsynced copies are kept only after consent.
        if (saved) { S.reset(); Sync.forget(); }
        location.reload();
      } catch (e) { err.textContent = Auth.authError(e); await Sync.initSync(syncOptions()); }
      finally { leavingAccount = false; btn.disabled = false; }
    };
    $('#accountLogout', sheet).onclick = (ev) => leave(ev.currentTarget, 'local');
    $('#accountLogoutAll', sheet).onclick = async (ev) => {
      const btn = ev.currentTarget;
      if (!await accountChoice('تطلع من كل الأجهزة؟', 'كل جهاز مسجّل بحسابك رح يطلع منه، وهالجهاز كمان. استعملها إذا ضاع جوالك أو شكّيت إنه حدا تاني دخل على حسابك.', 'اطلع من كل الأجهزة', 'إلغاء')) return;
      leave(btn, 'global');
    };
    $('#accountDelete', sheet).onclick = async (ev) => {
      const btn = ev.currentTarget;
      if (!await accountChoice('تحذف حسابك نهائياً؟', 'رح ينحذف حسابك وخطتك وسجلاتك المحفوظة فيه. ما بنقدر نرجعهم بعد الحذف.', 'احذف حسابي نهائياً', 'احتفظ بحسابي')) return;
      btn.disabled = true;
      leavingAccount = true;
      Sync.stop();
      try {
        await Auth.deleteAccount();
        S.reset();
        Sync.forget();
        location.reload();
      } catch (e) { err.textContent = Auth.authError(e); await Sync.initSync(syncOptions()); }
      finally { leavingAccount = false; btn.disabled = false; }
    };
  });
}

// The interview answers wait here while the person makes an account, so they
// survive the trip to Google and back, or closing the app on the sign-up screen.
const PENDING = 'tafiha.pending';
function loadPending() {
  try {
    const a = JSON.parse(localStorage.getItem(PENDING) || 'null');
    return a ? assertAssessment(a) : null;
  } catch { clearPending(); return null; }
}
function savePending(a) { try { localStorage.setItem(PENDING, JSON.stringify(a)); } catch { /* the copy in memory still works */ } }
function clearPending() { try { localStorage.removeItem(PENDING); } catch { /* ignore */ } }

// First visit: the interview, then an account (needed to see the report).
// «عندي حساب» on the first screen goes straight to signing in.
// Before there's an account: the welcome screens (first launch, or the logo), the interview,
// then an account to open the report. Answers already given are kept on the way.
async function welcome(error) {
  let answers = loadPending();
  let mode = answers ? 'gate' : null;
  let intro = !answers && !error && !Onboarding.seen();
  for (;;) {
    if (intro) {
      intro = false;
      const { consult_enabled: consult } = await Content.appConfig();
      // «عندي حساب» goes straight to signing in; «ابدأ استشارتك» to the interview, or back to the report gate
      mode = await Onboarding.run({ consult }) === 'login' ? 'login' : answers ? 'gate' : null;
    }
    if (!answers && mode !== 'login') {
      const r = await runAssessment({}, { onLogin: true, onHome: true });
      if (r.__home) { intro = true; continue; }
      if (r.__login) mode = 'login';
      else { answers = r; savePending(answers); mode = 'gate'; }
    }
    const result = await Auth.runAuth({ mode, name: answers?.name, error, onRedirect: () => answers && savePending(answers) });
    error = '';
    if (result?.user) return result.user;
    if (result === 'home') { intro = true; continue; }
    mode = answers ? 'gate' : null; // left the sign-in screen: back to the interview, or to the gate
  }
}

async function boot() {
  // Never run inside someone else's page: a framing site could trick people into
  // clicking (clickjacking). GitHub Pages can't send a frame-ancestors header.
  if (window.top !== window.self) {
    document.getElementById('bootStatus').innerHTML = '<p>طفّيها بيشتغل بصفحته بس.</p><a class="btn btn-red" href="https://tafiha.com/" target="_top" rel="noopener">افتح طفّيها</a>';
    return;
  }
  // the phone app has its files on the phone already; only the website needs the offline cache
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !Notify.native()) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  wireBackButton();
  const guest = S.loadGuest();
  const query = new URL(location.href);
  const recovery = query.searchParams.get('r') === 'reset' || location.hash.includes('type=recovery');
  const callbackError = query.searchParams.has('error') || /error=/.test(location.hash);
  if (Auth.configured()) {
    await Auth.onAuthChange((event, session) => {
      if ((!booted && !accountBound) || leavingAccount) return;
      if ((session?.user?.id || null) !== (currentUser?.id || null)) {
        document.body.classList.add('booting');
        Sync.stop();
        location.reload();
      } else if (session?.user) currentUser = session.user;
    });
    const session = await Auth.session();
    currentUser = session?.user || null;
    for (const param of ['r', 'code', 'error', 'error_description', 'error_code']) query.searchParams.delete(param);
    if (location.hash.includes('access_token') || location.hash.includes('error=')) query.hash = '';
    history.replaceState(null, '', query.pathname + query.search + query.hash);
    if (recovery && currentUser) {
      const result = await Auth.runAuth({ mode: 'recovery' });
      currentUser = result.user;
    }
    if (!currentUser) {
      const linkError = callbackError || recovery ? 'الرابط ما اشتغل أو خلص وقته. سجّل دخول أو اطلب رسالة جديدة.' : '';
      if (guest) {
        // a journey on this device from before accounts goes into the account;
        // without internet it keeps working here until the next open
        const result = await Auth.runAuth({ mode: 'required', name: guest.name, allowLocal: !navigator.onLine, error: linkError });
        currentUser = result?.user || null;
      } else {
        currentUser = await welcome(linkError);
      }
    }
  }
  S.selectAccount(currentUser?.id);
  accountBound = true;
  state = S.load();
  let synced = await Sync.initSync(syncOptions());
  // An unavailable server is not an empty account. Never overwrite an unseen journey.
  while (currentUser && !state && !synced) {
    const retry = await accountChoice('ما قدرنا نجيب رحلتك', 'تأكد من النت، وبنرجع نحاول نجيب البيانات المحفوظة بحسابك.', 'حاول كمان مرة', 'سجّل خروج');
    if (!retry) { await Auth.signOut(); location.reload(); return; }
    synced = await Sync.initSync(syncOptions());
  }
  if (currentUser && guest && !S.guestDismissed()) {
    const useGuest = await accountChoice('تضيف رحلتك الموجودة؟', `في رحلة محفوظة على هالجهاز باسم ${guest.name || 'بدون اسم'}. بتحب تضيفها لحساب ${currentUser.email || Auth.firstName(currentUser)}؟`, 'أضف رحلتي للحساب', 'كمّل ببيانات الحساب');
    if (useGuest) {
      state = merge(state, guest);
      if (!S.save(state)) throw new Error('local-storage');
      await Sync.importLegacy(Sync.getLegacyKey());
      persist();
      if (S.retireGuest()) Sync.retireLegacyLink();
    } else S.dismissGuest();
  }
  const answers = currentUser && loadPending();
  if (answers) {
    // the interview from before signing up: now the plan is made and the report shown
    if (!answers.name) answers.name = Auth.firstName(currentUser);
    state = S.createFromAssessment(answers, buildReport(answers).tx, state);
    persist();
    clearPending();
    document.body.classList.remove('booting');
    await openReport(answers, { first: true });
  } else if (!state) await intake(null);
  document.body.classList.remove('booting');
  start();
  booted = true;
}

function start() {
  cigarette = initCigarette($('#stage'), { reduceMotion: RM });
  ['d', 'h', 'm', 's'].forEach((k) => {
    clockEls[k] = { num: $(`.num[data-k="${k}"]`), lbl: $(`.lbl[data-l="${k}"]`) };
  });
  renderAll();

  // days number counts up once on load
  const d = Math.floor(S.daysFloat(state));
  if (!RM && d > 0) {
    daysAnimating = true;
    clockEls.d.num.textContent = '0';
    setTimeout(() => {
      animateNum(clockEls.d.num, 0, d, 0, 1500);
      setTimeout(() => { daysAnimating = false; }, 1600);
    }, 350);
  }

  document.querySelectorAll('.card').forEach((c) => revealer.observe(c));
  // anything already on screen shows right away, even if the observer is slow to fire
  requestAnimationFrame(() => {
    document.querySelectorAll('.card').forEach((c) => {
      const r = c.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) reveal(c);
    });
  });

  let lastMinute = Math.floor(Date.now() / 60000);
  let wasPrep = isPrep();
  setInterval(() => {
    tickClock();
    renderStats();
    const m = Math.floor(Date.now() / 60000);
    const prep = isPrep();
    if (m !== lastMinute || prep !== wasPrep) {
      lastMinute = m;
      wasPrep = prep;
      renderAll();
    }
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    renderAll();
    Content.refresh().then((changed) => { if (changed) renderAll(); });
  });
  Content.refresh().then((changed) => { if (changed) renderAll(); });

  initCraving({
    getState: () => state,
    persist,
    onChange: () => { renderStats(); renderCravings(); },
    logGum: () => logGum(null),
    logPatch: () => logPatch(),
    openSlip,
    toast,
  });
  $('#cravingBtn').onclick = (ev) => openCraving(ev.currentTarget);
  // the logo: the home page from anywhere in the app
  $('#homeLogo').onclick = (ev) => { ev.preventDefault(); showPage('home'); };
  startReminders();
  document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => showPage(t.dataset.tab); });
  $('#planPdfBtn').onclick = async () => {
    if (!state.assessment) { intake(state); return; }
    const b = $('#planPdfBtn');
    if (b.disabled) return;
    b.disabled = true;
    const label = b.innerHTML;
    b.textContent = 'عم جهّز الملف…';
    try { await downloadPDF(state.assessment); toast('نزل ملف التقرير'); } catch (e) { toast('ما زبط. تأكد من النت وجرّب كمان مرة'); }
    b.disabled = false;
    b.innerHTML = label;
  };
  $('#gumBtn').onclick = (ev) => logGum(ev.currentTarget);
  $('#todaySettings').onclick = openSettings;
  $('#savingsDate').onclick = openSettings;
  $('#homeGumLog').onclick = (ev) => logGum(ev.currentTarget);
  $('#homePatchLog').onclick = logPatch;
  $('#homeGumHow').onclick = () => openReplacementHelp('gum');
  $('#homePatchHow').onclick = () => openReplacementHelp('patch');
  $('#homeGumPack').onclick = () => $('#gumPackBtn').click();
  $('#homePatchPack').onclick = () => $('#patchPackBtn').click();
  $('#gumPackBtn').onclick = () => {
    state.nrt.packs.push(Date.now());
    persist();
    renderNRT();
    toast(`انضافت علبة. صار عندك ${S.gumStock(state)} حبة`);
    renderToday();
  };
  $('#patchBtn').onclick = logPatch;
  $('#cutBtn').onclick = logCut;
  $('#reviewPlanBtn').onclick = () => intake(state);
  $('#patchPackBtn').onclick = () => {
    state.patch.packs.push(Date.now());
    persist();
    renderPatch();
    toast(`انضافت علبة. صار عندك ${S.patchStock(state)} لزقة`);
    renderToday();
  };
  $('#planBtn').onclick = () => (state.assessment ? openReport(state.assessment) : intake(state));
  $('#prepList').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-prep]');
    if (!b) return;
    state.prep = state.prep || {};
    state.prep[b.dataset.prep] = !state.prep[b.dataset.prep];
    persist();
    renderPrep();
  });
  $('#openSettings').onclick = openSettings;
  $('#depositAdd').onclick = openDeposit;
  $('#depositHistory').onclick = openDepositHistory;
  $('#openAccount').onclick = openAccount;
  $('#slipBtn').onclick = openSlip;
  $('#shareBtn').onclick = openShare;
  $('#inviteBtn').onclick = invite;
  $('#backdrop').onclick = closeSheet;
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeSheet(); });

}

boot().catch(() => {
  Sync.stop();
  const status = document.getElementById('bootStatus');
  status.innerHTML = '<p>ما قدرنا نفتح رحلتك. بياناتك المحفوظة لسه موجودة.</p><button class="btn btn-red" id="bootRetry">حاول كمان مرة</button>';
  document.getElementById('bootRetry').onclick = () => location.reload();
});
