// طفّيها — dashboard
import * as S from './store.js';
import { initCraving, openCraving } from './craving.js';
import { makeStory } from './share.js';
import { initCigarette } from './cigarette.js';
import { runAssessment } from './assessment.js';
import { openReport, downloadPDF } from './report.js';
import { buildReport, planWeek, patchStepFor, gumStageFor } from './plan.js';
import * as Sync from './sync.js';

const $ = (sel, root = document) => root.querySelector(sel);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RING_C = 2 * Math.PI * 52;

let state = S.load();
// every local change: stamp it for sync, save it, and queue it for the other devices
const persist = () => { Sync.changed(state); S.save(state); };

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
  if (line) line.lastChild.textContent = SYNC_LABEL[s] || '';
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
  el._to = to;
  el._dec = dec;
  el.dataset.num = '';
  if (!el.closest('.card')?.classList.contains('in')) return;
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
  const eyebrow = left > 0 ? 'باقي لتطفّيها' : 'صارلك طافيها';
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
    $('#nextName').textContent = 'يوم الترك';
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
  const mo = S.money(state);
  setNum($('#stMoney'), Math.max(0, mo.net), 2);
  const av = S.avoided(state);
  setNum($('#stUnits'), av.units);
  $('#stUnitsK').textContent = av.unitLabel;
  setNum($('#stBeaten'), S.beaten(state));
}

// today's nicotine replacement, one line on the home page
function renderToday() {
  const card = $('#todayCard');
  const n = state.nrt;
  const p = state.patch;
  const prep = isPrep();
  const btn = $('#todayBtn');
  if (p?.active && !prep) {
    const wk = planWeek(state.quitAt);
    const st = patchStepFor(p.steps, wk);
    card.hidden = !st;
    if (!st) return;
    const done = S.patchedToday(state);
    $('#todayIco').src = 'assets/icons/patch.webp';
    $('#todayK').textContent = 'لزقة اليوم';
    $('#todayMain').textContent = `${st.mg} ملغ`;
    btn.textContent = done ? 'حطيتها ✓' : 'حطيتها';
    btn.setAttribute('aria-pressed', String(done));
    btn.onclick = () => logPatch();
    return;
  }
  if (n.active && !prep) {
    card.hidden = false;
    const today = S.gumToday(state);
    $('#todayIco').src = 'assets/icons/gum.webp';
    $('#todayK').textContent = 'علكة اليوم';
    $('#todayMain').innerHTML = `<b>${today}</b> من ${n.dailyMax}`;
    btn.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-plus"/></svg>حبة';
    btn.setAttribute('aria-pressed', 'false');
    btn.onclick = (ev) => logGum(ev.currentTarget);
    return;
  }
  card.hidden = true;
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
  $('#nrtOf').textContent = `من ${n.dailyMax} اليوم`;
  const prog = $('#nrtRing .prog');
  prog.style.strokeDasharray = RING_C.toFixed(2);
  prog.style.strokeDashoffset = (RING_C * (1 - Math.min(1, today / n.dailyMax))).toFixed(2);
  $('#nrtRing').classList.toggle('over', today >= n.dailyMax);

  const last = n.logs.length ? Math.max(...n.logs) : null;
  $('#nrtLast').innerHTML = today >= n.dailyMax
    ? '<strong style="color:var(--ember-deep)">وصلت الحد اليومي المكتوب على علبتك</strong>'
    : last ? `آخر حبة: <strong>قبل ${S.duration(Date.now() - last)}</strong>` : 'لسّا ما سجّلت ولا حبة';
  const stock = S.gumStock(state);
  $('#nrtStock').innerHTML = `باقي بالعلبة: <strong>${stock} ${S.word(stock, 'حبة', 'حبات')}</strong>`;

  const tx = state.assessment ? buildReport(state.assessment).tx : null;
  const wk = planWeek(state.quitAt);
  let plan = '';
  if (tx?.form === 'gum' && tx.gumSchedule?.length > 1) {
    const st = gumStageFor(wk);
    plan = wk === 0 ? `بتبلّش يوم الترك: ${gumStageFor(1).text}.` : st ? `خطة الأسبوع ${wk}: ${st.text}.` : 'خلصت خطة العلكة. وقّفها إذا ما عدت محتاجها.';
  } else if (tx?.form === 'both') plan = 'مع اللزقة: حبة وقت الرغبة القوية بس.';
  $('#nrtPlan').hidden = !plan;
  $('#nrtPlan').textContent = plan;

  const week = S.perDayCounts(n.logs);
  const max = Math.max(n.dailyMax * 0.6, ...week.map((w) => w.n), 1);
  $('#nrtWeek').innerHTML = week.map((w, i) =>
    `<i class="${i === 6 ? 'today' : ''}" style="--h:${(w.n / max).toFixed(3)}" title="${w.n}"></i>`).join('');
}

function renderPatch() {
  const p = state.patch;
  const card = $('#patchCard');
  card.hidden = !p?.active;
  if (!p?.active) return;
  const wk = planWeek(state.quitAt);
  const st = wk ? patchStepFor(p.steps, wk) : null;
  const total = p.steps.reduce((a, x) => a + x.weeks, 0);
  $('#patchBadge').textContent = `${p.hours} ساعة`;
  $('#patchSteps').innerHTML = p.steps.map((x, i) => {
    const cls = wk === 0 ? (i === 0 ? 'now' : '') : !st ? 'done' : i < st.index ? 'done' : i === st.index ? 'now' : '';
    return `<span class="${cls}">${x.mg}<small>ملغ · ${x.weeks === 1 ? 'أسبوع' : x.weeks === 2 ? 'أسبوعين' : `${x.weeks} ${S.word(x.weeks, 'أسبوع', 'أسابيع')}`}</small></span>`;
  }).join('');
  const stock = S.patchStock(state);
  const stockTxt = stock ? ` باقي عندك ${stock} ${S.word(stock, 'لزقة', 'لزقات')}.` : ' لما تشتري علبة اضغط «اشتريت علبة».';
  $('#patchNote').textContent = wk === 0
    ? `بتبلّش يوم الترك بلزقة ${p.steps[0].mg} ملغ.${stockTxt}`
    : st ? `الأسبوع ${wk} من ${total}: لزقة ${st.mg} ملغ لآخر الأسبوع ${st.endsWeek}.${stockTxt}` : 'خلصت خطة اللزقات. مبروك!';
  const btn = $('#patchBtn');
  const done = S.patchedToday(state);
  btn.disabled = wk === 0 || !st;
  btn.setAttribute('aria-pressed', String(done));
  btn.textContent = wk === 0 ? 'بتبلّش يوم الترك' : !st ? 'خلصت الخطة' : done ? 'حطيتها اليوم ✓' : 'حطيت لزقة اليوم';
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

function renderPlan() {
  if (!state.assessment) {
    $('#planSub').textContent = 'جاوب على مقابلة الإقلاع، وخذ تقرير وخطة كاملة إلك.';
    $('#planBtn').textContent = 'ابدأ المقابلة';
    return;
  }
  const r = buildReport(state.assessment);
  const wk = planWeek(state.quitAt);
  const form = r.safe.stop.length ? 'استشير دكتور أولاً' : FORM_LABEL[r.tx.form];
  const stage = wk === 0 ? 'قبل يوم الترك' : wk <= 12 ? `الأسبوع ${wk} من 12` : 'بعد الـ 12 أسبوع';
  $('#planSub').textContent = `${stage} · اعتماد ${['منخفض', 'منخفض', 'متوسط', 'عالي'][r.dep.level]} · ${form}`;
  $('#planBtn').textContent = 'افتح التقرير';
}

const PREP = [
  ['buy', 'اشتري العلاج البديل وخلّيه جاهز'],
  ['tell', 'خبّر 2–3 ناس قريبين منك إنك رح تترك'],
  ['clean', 'ليلة الترك: شيل السجاير والولاعات والطفّايات والفيب'],
  ['plan', 'اقرأ خطتك للحظات الصعبة بالتقرير'],
  ['first', 'قرر شو رح تعمل أول ساعة بيوم الترك'],
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
  const onLink = !prev && Sync.enabled() ? (code) => Sync.claimCode(code) : null;
  const a = await runAssessment(prev ? (prev.assessment || answersFromState(prev)) : {}, { onLink });
  if (a.__linked) {
    state = S.load();
    if (clockEls.d) renderAll();
    return;
  }
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
  $('#bodyLeft').textContent = next ? (isPrep() ? 'بتبلّش من يوم الترك' : `باقي ${S.duration(next.left)}`) : '';
  $('#miles').innerHTML = list.map((m) => {
    const done = m.at <= e;
    const now = !done && next && m === list.find((x) => x.at === next.at && x.text === next.text);
    const cls = done ? 'done' : now ? 'now' : 'later';
    const dot = done ? '<svg class="ico"><use href="#i-check"/></svg>' : '';
    const bar = now ? `<div class="bar"><i style="--p:${next.progress.toFixed(4)}"></i></div>` : '';
    return `<li class="mile ${cls}"><span class="dot">${dot}</span><div><span class="t">${m.name}${now ? ` · باقي ${S.duration(next.left)}` : ''}</span><p>${m.text}</p>${bar}</div></li>`;
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
function netPerDay() {
  const recent = state.nrt.active
    ? state.nrt.logs.filter((t) => t > Date.now() - 3 * S.DAY).length / 3 * S.gumPrice(state)
    : 0;
  return Math.max(0.01, S.dailyCost(state) - recent);
}

function renderGoal() {
  const body = $('#goalBody');
  const g = state.goal;
  if (!g) {
    body.innerHTML = '<div class="empty"><b>شو بدك تشتري من التوفير؟</b><button class="btn btn-ink" id="goalSet">حط هدف</button></div>';
    $('#goalSet').onclick = openGoal;
    return;
  }
  const net = Math.max(0, S.money(state).net);
  const p = Math.min(1, net / g.amount);
  const left = g.amount - net;
  body.innerHTML = `
    <p class="card-sub" style="margin:-6px 0 6px">${esc(g.title)}</p>
    <div class="goal-amt"><span class="n" id="goalN">0</span><span class="of">من ${S.fmtMoney(g.amount)} د.أ</span></div>
    <div class="bar red"><i style="--p:${p.toFixed(4)}"></i></div>
    <p class="eta">${left <= 0 ? 'وصلت هدفك. كافئ حالك، بتستاهل.' : `بتوصله بعد ${S.duration((left / netPerDay()) * S.DAY)} تقريباً`}</p>
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
}

function renderAll() {
  renderHeader();
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
function openSheet(html, mount) {
  const sheet = $('#sheet');
  const bd = $('#backdrop');
  sheetOpener = document.activeElement;
  sheet.innerHTML = `<div class="grab"></div>${html}`;
  sheet.hidden = false;
  bd.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    sheet.classList.add('open');
    bd.classList.add('open');
  }));
  sheet.querySelectorAll('[data-close]').forEach((b) => { b.onclick = closeSheet; });
  mount?.(sheet);
  setTimeout(() => sheet.querySelector('input, button:not(.danger), select')?.focus({ preventScroll: true }), 60);
}

function closeSheet() {
  const sheet = $('#sheet');
  const bd = $('#backdrop');
  if (sheet.hidden) return;
  sheet.classList.remove('open');
  bd.classList.remove('open');
  setTimeout(() => { sheet.hidden = true; bd.hidden = true; sheet.innerHTML = ''; }, 450);
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

function openSettings() {
  const s = state;
  const h = s.habits;
  const field = (label, name, value, step = 'any', extra = '') =>
    `<label class="field" ${extra}>${label}<input type="number" inputmode="decimal" min="0" step="${step}" name="${name}" value="${value}"></label>`;
  const kinds = Object.entries(S.VAPE_KINDS)
    .map(([k, v]) => `<option value="${k}" ${h.vape.kind === k ? 'selected' : ''}>${v.label}</option>`).join('');
  openSheet(`
    <h2>إعداداتك</h2>
    <p class="lead">من هالأرقام بنحسب توفيرك ومحطاتك. عدّلها براحتك.</p>
    <form class="form" id="setForm" novalidate>
      <fieldset class="fs"><legend>أجهزتك</legend>
        <p class="sync-line" id="syncLine"><span class="sync-dot" data-s="${Sync.getStatus()}"></span><span>${SYNC_LABEL[Sync.getStatus()] || ''}</span></p>
        <div class="row2">
          <button type="button" class="btn btn-ink" id="linkMake" ${Sync.enabled() ? '' : 'disabled'}>اربط جهاز تاني</button>
          <button type="button" class="btn btn-soft" id="linkClaim" ${Sync.enabled() ? '' : 'disabled'}>عندي رمز</button>
        </div>
        <div id="linkArea"></div>
      </fieldset>
      <fieldset class="fs"><legend>إنت</legend>
        <label class="field">اسمك<input name="name" value="${esc(s.name)}" maxlength="24" autocomplete="given-name"></label>
        <label class="field">إيمتى تركت؟<input type="datetime-local" name="quitAt" value="${toLocalInput(s.quitAt)}" max="${toLocalInput(Date.now())}"></label>
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
        <button class="danger" type="button" id="resetAll">امسح كل بياناتي وابدأ من جديد</button>
      </div>
    </form>`, (sheet) => {
    const f = $('#setForm', sheet);
    const area = $('#linkArea', sheet);
    let countdown = 0;
    $('#linkMake', sheet).onclick = async () => {
      clearInterval(countdown);
      area.innerHTML = '<p class="card-sub">عم جهّز الرمز…</p>';
      try {
        const code = await Sync.makeCode();
        const until = Date.now() + 10 * 60000;
        area.innerHTML = `<div class="pair-code" dir="ltr">${code.slice(0, 4)}-${code.slice(4)}</div>
          <p class="card-sub">افتح طفّيها على جهازك التاني، واختار «عندي بيانات على جهاز تاني» أو «عندي رمز»، واكتب هالرمز.</p>
          <p class="card-sub" id="pairLeft"></p>`;
        const tick = () => {
          const left = Math.max(0, until - Date.now());
          const el = $('#pairLeft', sheet);
          if (!el) { clearInterval(countdown); return; }
          el.textContent = left ? `شغّال لمدة ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}` : 'خلص وقت الرمز. اطلب واحد جديد.';
          if (!left) clearInterval(countdown);
        };
        tick();
        countdown = setInterval(tick, 1000);
      } catch (e) {
        area.innerHTML = '<p class="card-sub">ما قدرت أجهّز رمز. تأكد من النت وجرّب كمان مرة.</p>';
      }
    };
    $('#linkClaim', sheet).onclick = () => {
      clearInterval(countdown);
      area.innerHTML = `<p class="card-sub">البيانات على هالجهاز رح تتبدّل ببيانات الجهاز التاني.</p>
        <div class="row2"><label class="field">الرمز<input id="claimInput" dir="ltr" autocomplete="off" autocapitalize="characters" maxlength="9" placeholder="XXXX-XXXX"></label>
        <button type="button" class="btn btn-red" id="claimGo" style="align-self:end">اربط</button></div>`;
      $('#claimInput', sheet).focus();
      $('#claimGo', sheet).onclick = async () => {
        const btn = $('#claimGo', sheet);
        btn.disabled = true;
        try {
          const ok = await Sync.claimCode($('#claimInput', sheet).value);
          if (!ok) { toast('الرمز غلط أو خلص وقته'); btn.disabled = false; return; }
          closeSheet();
          renderAll();
          toast('انربط الجهاز. بياناتك صارت هون');
        } catch (e) {
          toast('ما زبط الربط. تأكد من النت');
          btn.disabled = false;
        }
      };
    };
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
    reset.onclick = () => {
      if (!reset.dataset.armed) {
        reset.dataset.armed = '1';
        reset.textContent = 'متأكد؟ اضغط كمان مرة للمسح';
        return;
      }
      state = S.reset();
      Sync.forget();
      closeSheet();
      setTimeout(() => intake(null), 350);
    };
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const active = Object.keys(S.HABITS).filter((k) => f.elements[`h_${k}`].checked);
      if (!active.length) { toast('اختار شي واحد على الأقل كنت تستعمله'); return; }
      const q = new Date(f.elements.quitAt.value).getTime();
      state.name = f.elements.name.value.trim() || state.name;
      if (Number.isFinite(q)) state.quitAt = Math.min(q, Date.now());
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
      <label class="field">المبلغ (د.أ)<input name="amount" type="number" inputmode="decimal" min="1" step="1" value="${g.amount}"></label>
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
    <h2>زلّة مش فشل</h2>
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
      state.slips.push({ at: Date.now(), reset: true });
      state.quitAt = Date.now();
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

async function boot() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  Sync.initSync({ getState: () => state, setState: applyRemote, onStatus: showSync });
  if (!state) await intake(null);
  start();
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

  let lastMinute = new Date().getMinutes();
  setInterval(() => {
    tickClock();
    const m = new Date().getMinutes();
    if (m !== lastMinute) {
      lastMinute = m;
      renderAll();
    }
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

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
  $('#gumPackBtn').onclick = () => {
    state.nrt.packs.push(Date.now());
    persist();
    renderNRT();
    toast(`انضافت علبة. صار عندك ${S.gumStock(state)} حبة`);
  };
  $('#patchBtn').onclick = logPatch;
  $('#patchPackBtn').onclick = () => {
    state.patch.packs.push(Date.now());
    persist();
    renderPatch();
    toast(`انضافت علبة. صار عندك ${S.patchStock(state)} لزقة`);
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
  $('#slipBtn').onclick = openSlip;
  $('#shareBtn').onclick = openShare;
  $('#inviteBtn').onclick = invite;
  $('#backdrop').onclick = closeSheet;
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeSheet(); });

}

boot();
