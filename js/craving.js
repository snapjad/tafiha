// طفّيها — "عندي رغبة": rate it, name what set it off, get the plan for that moment,
// ride the wave for three minutes of paced breathing, then rate it again.
// Based on urge surfing and the usual quit-support advice (delay, breathe, water, do something else).
import * as S from './store.js';
import { TRIGGERS, REASONS } from './plan.js';
import * as Content from './content.js';

const $ = (sel) => document.querySelector(sel);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SURF = 180000;
const BREATH = [{ name: 'شهيق', ms: 4000 }, { name: 'زفير', ms: 6000 }];
const CUES = [
  { id: 'coffee', label: 'قهوة أو شاي' },
  { id: 'meal', label: 'بعد الأكل' },
  { id: 'stress', label: 'توتر' },
  { id: 'bored', label: 'ملل' },
  { id: 'friends', label: 'مع الأصحاب' },
  { id: 'car', label: 'بالسيارة' },
  { id: 'wake', label: 'صحيت هلأ' },
  { id: 'phone', label: 'عالتلفون' },
  { id: 'night', label: 'سهر' },
  { id: 'other', label: 'ولا إشي' },
];
export const GENERIC = 'غيّر مكانك هلأ، اشرب كاسة مي باردة، وخلّي إيدك مشغولة بإشي.';

let ctx = null;
let root, body, dots, opener;
let cur = null;
let raf = 0;

export function initCraving(c) {
  ctx = c;
  root = $('#craving');
  body = $('#cvBody');
  dots = $('#cvDots');
  $('#cvClose').onclick = () => close(false);
  root.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(false); });
}

export function openCraving(origin) {
  opener = origin || document.activeElement;
  const r = origin?.getBoundingClientRect();
  if (r) {
    root.style.setProperty('--ox', `${r.left + r.width / 2}px`);
    root.style.setProperty('--oy', `${r.top + r.height / 2}px`);
  }
  cur = { at: Date.now(), before: null, after: null, trigger: null, gum: false, rounds: 0 };
  root.hidden = false;
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
  show('rate');
}

function close(save) {
  cancelAnimationFrame(raf);
  if (save && cur) {
    const s = ctx.getState();
    s.cravings.push({
      at: cur.at, dur: Date.now() - cur.at, outcome: 'beaten',
      before: cur.before, after: cur.after, trigger: cur.trigger, gum: cur.gum,
    });
    ctx.persist();
    ctx.onChange();
    ctx.toast(`طفّيتها. هاي رقم ${S.beaten(s)}`);
  }
  root.classList.remove('open');
  setTimeout(() => {
    root.hidden = true;
    document.body.style.overflow = '';
    body.innerHTML = '';
    ctx.onClose?.();
  }, 700);
  opener?.focus?.({ preventScroll: true });
}

function setDots(i) {
  dots.innerHTML = i < 0 ? '' : [0, 1, 2, 3].map((k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('');
}

function paint(html, i) {
  cancelAnimationFrame(raf);
  setDots(i);
  body.innerHTML = `<div class="cv-step">${html}</div>`;
  const first = body.querySelector('button');
  setTimeout(() => first?.focus({ preventScroll: true }), 80);
}

function scale(selected) {
  return `<div class="cv-scale">${Array.from({ length: 10 }, (_, k) => {
    const v = k + 1;
    return `<button type="button" data-v="${v}" style="--v:${v}" aria-pressed="${selected === v}">${v}</button>`;
  }).join('')}</div><div class="cv-ends"><span>خفيفة</span><span>قوية كتير</span></div>`;
}

function onScale(cb) {
  body.querySelectorAll('.cv-scale button').forEach((b) => {
    b.onclick = () => {
      body.querySelectorAll('.cv-scale button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      const v = Number(b.dataset.v);
      const big = body.querySelector('.cv-big-n');
      if (big) { big.textContent = v; big.style.setProperty('--v', v); big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop'); }
      setTimeout(() => cb(v), 320);
    };
  });
}

// ---------------------------------------------------------------- steps
function show(step) {
  const s = ctx.getState();
  if (step === 'rate') {
    paint(`
      <h2 class="cv-h">قديش قوية الرغبة؟</h2>
      <b class="cv-big-n" style="--v:5">؟</b>
      ${scale(cur.before)}`, 0);
    onScale((v) => { cur.before = v; show('why'); });
  }

  if (step === 'why') {
    paint(`
      <h2 class="cv-h">شو عم يصير هلأ؟</h2>
      <div class="cv-chips">${CUES.map((c) => `<button type="button" data-t="${c.id}">${c.label}</button>`).join('')}</div>`, 1);
    body.querySelectorAll('[data-t]').forEach((b) => {
      b.onclick = () => {
        b.setAttribute('aria-pressed', 'true');
        cur.trigger = b.dataset.t;
        setTimeout(() => show('plan'), 260);
      };
    });
  }

  if (step === 'plan') {
    const t = TRIGGERS.find((x) => x.id === cur.trigger);
    const n = s.nrt;
    const gumOk = n?.active && S.gumToday(s) < n.dailyMax && s.quitAt <= Date.now();
    const needPatch = s.patch?.active && s.quitAt <= Date.now() && !S.patchedToday(s);
    const reasons = (s.assessment?.reasons || []).map((r) => REASONS[r]).filter(Boolean).slice(0, 3);
    paint(`
      <h2 class="cv-h">خطتك لهاللحظة</h2>
      <div class="cv-card">
        <p>${Content.text('craving', t ? t.id : 'other', t ? t.plan : GENERIC)}</p>
      </div>
      ${gumOk ? `<button type="button" class="cv-aid" id="cvGum"><img src="assets/icons/gum.webp" alt=""><span>خذ حبة علكة هلأ</span></button>` : ''}
      ${needPatch ? `<button type="button" class="cv-aid" id="cvPatch"><img src="assets/icons/patch.webp" alt=""><span>ما حطيت لزقة اليوم. حطها هلأ</span></button>` : ''}
      ${reasons.length ? `<p class="cv-why"><span>تذكّر ليش:</span> ${reasons.join(' · ')}</p>` : ''}
      <div class="cv-actions"><button type="button" class="btn btn-white" id="cvGo">يلا نعدّيها سوا · 3 دقايق</button></div>`, 2);
    const g = $('#cvGum');
    if (g) g.onclick = () => { if (cur.gum) return; ctx.logGum(); cur.gum = true; g.classList.add('done'); g.querySelector('span').textContent = 'أخدت حبة ✓ امضغها ببطء'; };
    const p = $('#cvPatch');
    if (p) p.onclick = () => { ctx.logPatch(); p.classList.add('done'); p.querySelector('span').textContent = 'حطيت اللزقة ✓'; };
    $('#cvGo').onclick = () => show('surf');
  }

  if (step === 'surf') surf();

  if (step === 'after') {
    paint(`
      <h2 class="cv-h">وهلأ قديش؟</h2>
      <b class="cv-big-n" style="--v:${cur.before}">${cur.before}</b>
      ${scale(null)}`, 3);
    onScale((v) => { cur.after = v; show('result'); });
  }

  if (step === 'result') {
    const down = cur.after < cur.before;
    if (down) {
      paint(`
        <div class="cv-result">
          <div class="cv-fall"><b style="--v:${cur.before}">${cur.before}</b><i aria-hidden="true"></i><b style="--v:${cur.after}">${cur.after}</b></div>
          <h2 class="cv-win">طفّيتها</h2>
          <p class="cv-sub">نزلت ${cur.before - cur.after} ${S.word(cur.before - cur.after, 'درجة', 'درجات')}. كل رغبة بتعدّيها بتضعّف اللي بعدها.</p>
        </div>
        <div class="cv-actions"><button type="button" class="btn btn-white" id="cvFin">تمام</button></div>`, -1);
      burst();
    } else {
      paint(`
        <div class="cv-result">
          <h2 class="cv-h">لسّا قوية؟ عادي.</h2>
          <p class="cv-sub">بعض الرغبات بدها وقت أطول شوي. إنت لسّا ما دخّنت، وهاد المهم.</p>
        </div>
        <div class="cv-actions">
          <button type="button" class="btn btn-white" id="cvMore">كمان 3 دقايق</button>
          <button type="button" class="btn btn-ghost-light" id="cvFin">عدّيتها، سكّر</button>
        </div>`, -1);
      $('#cvMore').onclick = () => show('surf');
    }
    $('#cvFin').onclick = () => close(true);
  }
}

// ---------------------------------------------------------------- the wave
function curve(peak) {
  // a craving rises fast, peaks, then fades: gamma-like shape, peak at 22% of the time
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const x = i / 60;
    const k = x / 0.22;
    const v = 1.2 + (peak - 1.2) * k * Math.exp(1 - k);
    pts.push([312 - x * 304, 132 - (v / 10) * 118]);
  }
  return pts;
}

function surf() {
  cur.rounds++;
  const peak = Math.max(3, cur.before || 7);
  const pts = curve(peak);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  paint(`
    <h2 class="cv-h">الرغبة موجة</h2>
    <p class="cv-sub">بتعلى، بتوصل القمة، وبتنزل. إنت بس خلّيك عليها.</p>
    <svg class="wave" viewBox="0 0 320 140" aria-hidden="true">
      <defs><linearGradient id="wg" x1="1" x2="0"><stop offset="0" stop-color="#e5a548"/><stop offset=".3" stop-color="#ff5a2b"/><stop offset="1" stop-color="#e5a548"/></linearGradient></defs>
      <path class="w-track" d="${d}"/>
      <path class="w-prog" d="${d}"/>
      <circle class="w-dot" r="7"/>
    </svg>
    <div class="breath-wrap"><div class="breath-ring" id="cvRing"></div><span class="breath-txt" id="cvPhase">شهيق</span></div>
    <p class="cv-time" id="cvTime">3:00</p>
    <div class="cv-actions">
      <button type="button" class="btn btn-white" id="cvDone">هديت، يلا نكمّل</button>
      <button type="button" class="btn btn-ghost-light" id="cvSlip">زلّيت</button>
    </div>`, 3);
  const prog = body.querySelector('.w-prog');
  const dot = body.querySelector('.w-dot');
  const len = prog.getTotalLength();
  prog.style.strokeDasharray = `${len}`;
  const ring = $('#cvRing');
  const phaseEl = $('#cvPhase');
  const timeEl = $('#cvTime');
  let lastPhase = -1;
  let lastSec = -1;
  const t0 = performance.now();
  const cycle = BREATH[0].ms + BREATH[1].ms;
  const ease = (x) => 0.5 - Math.cos(Math.PI * x) / 2;

  const frame = (now) => {
    const t = now - t0;
    const p = Math.min(1, t / SURF);
    prog.style.strokeDashoffset = `${len * (1 - p)}`;
    const pt = prog.getPointAtLength(len * p);
    dot.setAttribute('cx', pt.x.toFixed(1));
    dot.setAttribute('cy', pt.y.toFixed(1));
    const c = t % cycle;
    const phase = c < BREATH[0].ms ? 0 : 1;
    const sc = phase === 0 ? 0.7 + 0.3 * ease(c / BREATH[0].ms) : 1 - 0.3 * ease((c - BREATH[0].ms) / BREATH[1].ms);
    if (!RM) ring.style.transform = `scale(${sc.toFixed(4)})`;
    if (phase !== lastPhase) { lastPhase = phase; phaseEl.textContent = BREATH[phase].name; }
    const left = Math.ceil((SURF - t) / 1000);
    if (left !== lastSec && left >= 0) { lastSec = left; timeEl.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; }
    if (p >= 1) { show('after'); return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  $('#cvDone').onclick = () => show('after');
  $('#cvSlip').onclick = () => { close(false); setTimeout(() => ctx.openSlip(), 450); };
}

// a few sparks when the craving comes down
function burst() {
  if (RM) return;
  const host = body.querySelector('.cv-result');
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    const a = (Math.PI * 2 * i) / 18;
    s.style.setProperty('--dx', `${Math.cos(a) * (60 + Math.random() * 60)}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * (60 + Math.random() * 60) - 30}px`);
    s.style.animationDelay = `${Math.random() * 120}ms`;
    host.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
}
