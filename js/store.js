// طفّيها — state, persistence and all the numbers the dashboard shows.
const KEY = 'tafiha.v1';
export const DAY = 86400000;
const HOUR = 3600000;
const MIN = 60000;

export const HABITS = {
  cig: { label: 'سجاير' },
  vape: { label: 'فيب' },
  argileh: { label: 'أرجيلة' },
};

export const VAPE_KINDS = {
  disposable: { label: 'جهاز استعمال مرة', unit: 'جهاز' },
  pod: { label: 'بودات', unit: 'بود' },
  liquid: { label: 'ليكويد', unit: 'قنينة' },
};

export const TRIGGERS = [
  { id: 'coffee', label: 'قهوة' },
  { id: 'stress', label: 'توتر' },
  { id: 'friends', label: 'مع الشباب' },
  { id: 'meal', label: 'بعد الأكل' },
  { id: 'bored', label: 'ملل' },
  { id: 'car', label: 'بالسيارة' },
  { id: 'wake', label: 'أول ما أصحى' },
  { id: 'other', label: 'غير هيك' },
];

// General guidance from WHO ("health benefits of smoking cessation") and the NHS
// quit timeline, filtered per habit. `smoke` = only for burnt tobacco
// (cigarettes, argileh); `vapeOnly` = shown when nothing burnt was used.
export const MILESTONES = [
  { at: 20 * MIN, name: '20 دقيقة', text: 'نبض قلبك وضغطك بلّشوا يرجعوا لطبيعتهم.' },
  { at: 12 * HOUR, name: '12 ساعة', text: 'أول أكسيد الكربون بدمّك رجع لمستواه الطبيعي.', smoke: true },
  { at: 48 * HOUR, name: 'يومين', text: 'حاسّة الشم والطعم بلّشت تتحسن.', smoke: true },
  { at: 72 * HOUR, name: '3 أيام', text: 'أعراض الانسحاب عادةً بتكون بأعلى حالاتها، ومن هون بتبلّش تخف.' },
  { at: 7 * DAY, name: 'أسبوع', text: 'عدّيت أصعب أسبوع. الرغبات بتصير أقصر وأبعد عن بعض.' },
  { at: 14 * DAY, name: 'أسبوعين', text: 'دورتك الدموية ورئتك بيبلّشوا يتحسنوا، والمشي والدرج بيصيروا أسهل.', smoke: true },
  { at: 14 * DAY, name: 'أسبوعين', text: 'نومك وتركيزك بيبلّشوا يرجعوا لطبيعتهم.', vapeOnly: true },
  { at: 30 * DAY, name: 'شهر', text: 'أغلب أعراض الانسحاب بتكون خفّت كتير أو راحت.' },
  { at: 90 * DAY, name: '3 شهور', text: 'السعال وضيق النفس بيبلّشوا يخفّوا ورئتك بتشتغل أحسن.', smoke: true },
  { at: 90 * DAY, name: '3 شهور', text: 'العادة صارت أضعف بكتير والرغبات صارت نادرة.', vapeOnly: true },
  { at: 365 * DAY, name: 'سنة', text: 'خطر أمراض القلب التاجية صار تقريباً نص خطر المدخّن.', smoke: true },
  { at: 365 * DAY, name: 'سنة', text: 'سنة كاملة بلا فيب. إنت حارس من زمان.', vapeOnly: true },
  { at: 5 * 365 * DAY, name: '5 سنين', text: 'خطر الجلطة الدماغية بينزل وبيقرب من خطر اللي عمره ما دخّن.', smoke: true },
  { at: 10 * 365 * DAY, name: '10 سنين', text: 'خطر سرطان الرئة صار تقريباً نص خطر المدخّن.', smoke: true },
];

// Builds a profile from the onboarding answers (and fills anything missing).
export function createState(a = {}) {
  const on = a.habits || ['cig'];
  return {
    v: 1,
    name: (a.name || '').trim(),
    quitAt: Math.min(a.quitAt || Date.now(), Date.now()),
    habits: {
      cig: { active: on.includes('cig'), perDay: 20, packSize: 20, packPrice: 2.85, ...a.cig },
      vape: { active: on.includes('vape'), kind: 'disposable', unitPrice: 8, daysPerUnit: 4, puffs: 6000, ...a.vape },
      argileh: { active: on.includes('argileh'), perWeek: 3, price: 3.5, ...a.argileh },
    },
    nrt: {
      active: !!a.nrt, mg: 4, packPrice: 6, packCount: 30, dailyMax: 15,
      packs: a.nrt ? [Date.now()] : [], logs: [], ...(a.nrt || {}),
    },
    cravings: [],
    slips: [],
    goal: null,
  };
}

// patch step-down from the strength someone already uses (product labels)
export function stepsFrom(mg) {
  const table = {
    21: [{ mg: 21, weeks: 6 }, { mg: 14, weeks: 2 }, { mg: 7, weeks: 2 }],
    14: [{ mg: 14, weeks: 6 }, { mg: 7, weeks: 2 }],
    7: [{ mg: 7, weeks: 2 }],
    25: [{ mg: 25, weeks: 8 }, { mg: 15, weeks: 2 }, { mg: 10, weeks: 2 }],
    15: [{ mg: 15, weeks: 2 }, { mg: 10, weeks: 2 }],
    10: [{ mg: 10, weeks: 2 }],
  };
  return table[mg] || table[21];
}

// Profile from the intake interview. `prev` keeps history (logs, cravings, goal) on a re-take.
export function createFromAssessment(a, tx, prev = null) {
  const now = Date.now();
  const usingGum = a.nrt_now === 'gum' || a.nrt_now === 'both';
  const usingPatch = a.nrt_now === 'patch' || a.nrt_now === 'both';
  const gumOn = usingGum || tx.form === 'gum' || tx.form === 'both';
  const patchOn = usingPatch || tx.form === 'patch' || tx.form === 'both';
  const s = createState({
    name: a.name,
    habits: a.products,
    quitAt: a.quitAt,
    cig: { perDay: a.cig_perDay, packPrice: a.cig_packPrice, packSize: a.cig_packSize },
    vape: { kind: a.vp_kind, unitPrice: a.vp_price, daysPerUnit: a.vp_days, puffs: a.vp_puffs || 6000 },
    argileh: { perWeek: a.ar_perWeek, price: a.ar_price },
    nrt: gumOn ? {
      mg: usingGum ? a.gum_mg : tx.gumMg,
      dailyMax: usingGum ? a.gum_max : 15,
      packPrice: usingGum ? a.gum_price : 6,
      packCount: usingGum ? a.gum_count : 30,
      packs: usingGum ? [now] : [],
      logs: [],
    } : null,
  });
  // times in the future are allowed here: a planned quit day
  s.quitAt = a.quitAt;
  s.assessment = a;
  s.patch = {
    active: patchOn,
    steps: usingPatch ? stepsFrom(a.patch_mg) : tx.patchSteps,
    hours: [25, 15, 10].includes(a.patch_mg) ? 16 : 24,
    packPrice: usingPatch ? a.patch_price : 12,
    packCount: usingPatch ? a.patch_count : 7,
    packs: usingPatch ? [now] : [],
    logs: [],
  };
  s.prep = {};
  s.smokes = [];
  if (prev) {
    s.smokes = prev.smokes || [];
    s.nrt.logs = prev.nrt?.logs || [];
    s.nrt.packs = prev.nrt?.packs?.length ? prev.nrt.packs : s.nrt.packs;
    s.patch.logs = prev.patch?.logs || [];
    s.patch.packs = prev.patch?.packs?.length ? prev.patch.packs : s.patch.packs;
    s.cravings = prev.cravings || [];
    s.slips = prev.slips || [];
    s.goal = prev.goal || null;
    s.prep = prev.prep || {};
  }
  return s;
}

// null means "no profile yet" → the app shows the intake interview
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* storage blocked */ }
  return null;
}

export function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

export function reset() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------- numbers
export const elapsed = (s, now = Date.now()) => Math.max(0, now - s.quitAt);
export const daysFloat = (s, now) => elapsed(s, now) / DAY;

export function activeHabits(s) {
  return Object.keys(HABITS).filter((k) => s.habits[k]?.active);
}

export function primaryHabit(s) {
  return activeHabits(s)[0] || 'cig';
}

export function costPerDay(type, h) {
  if (type === 'cig') return (h.perDay / h.packSize) * h.packPrice;
  if (type === 'vape') return h.unitPrice / Math.max(0.1, h.daysPerUnit);
  if (type === 'argileh') return (h.perWeek * h.price) / 7;
  return 0;
}

export function dailyCost(s) {
  return activeHabits(s).reduce((a, k) => a + costPerDay(k, s.habits[k]), 0);
}

export const gumPrice = (s) => s.nrt.packPrice / Math.max(1, s.nrt.packCount);

export const patchPrice = (s) => (s.patch ? s.patch.packPrice / Math.max(1, s.patch.packCount) : 0);

// gum and patches used since the current quit date (a restart starts the count again)
export function nrtSpent(s) {
  const gum = s.nrt.active ? s.nrt.logs.filter((t) => t >= s.quitAt).length * gumPrice(s) : 0;
  const patch = s.patch?.active ? s.patch.logs.filter((t) => t >= s.quitAt).length * patchPrice(s) : 0;
  return gum + patch;
}

export function patchedToday(s, now = Date.now()) {
  const sod = startOfDay(now);
  return (s.patch?.logs || []).some((t) => t >= sod);
}

export function patchStock(s) {
  if (!s.patch) return 0;
  return Math.max(0, s.patch.packs.length * s.patch.packCount - s.patch.logs.length);
}

// slips since the current quit date; each one is a cigarette (or a session) smoked
export const slipsNow = (s) => s.slips.filter((x) => !x.reset && x.at >= s.quitAt);
export const slipUnits = (s) => slipsNow(s).reduce((a, x) => a + (x.n || 1), 0);

// what one slip costs, for the main habit
export function slipCost(s) {
  const type = primaryHabit(s);
  const h = s.habits[type];
  if (type === 'cig') return slipUnits(s) * (h.packPrice / h.packSize);
  if (type === 'argileh') return slipUnits(s) * h.price;
  return 0;
}

export function money(s, now) {
  const gross = Math.max(0, dailyCost(s) * daysFloat(s, now) - slipCost(s));
  const nrt = nrtSpent(s);
  return { gross, nrt, net: gross - nrt };
}

// What the dashboard counts as "not consumed" for the main habit.
export function avoided(s, now) {
  const type = primaryHabit(s);
  const h = s.habits[type];
  const d = daysFloat(s, now);
  if (type === 'cig') {
    const units = Math.max(0, h.perDay * d - slipUnits(s));
    return {
      units, unitLabel: 'سيجارة ما دخّنتها',
      packs: units / h.packSize, packLabel: 'باكيت ما اشتريتها',
    };
  }
  if (type === 'vape') {
    const kind = VAPE_KINDS[h.kind] || VAPE_KINDS.disposable;
    const units = d / Math.max(0.1, h.daysPerUnit);
    const puffs = h.kind === 'disposable' && h.puffs ? units * h.puffs : null;
    return puffs != null
      ? { units: puffs, unitLabel: 'سحبة ما سحبتها', packs: units, packLabel: `${kind.unit} ما اشتريته` }
      : { units, unitLabel: `${kind.unit} ما اشتريته`, packs: d * 24, packLabel: 'ساعة بلا فيب' };
  }
  const heads = Math.max(0, (h.perWeek / 7) * d - slipUnits(s));
  return { units: heads, unitLabel: 'راس ما شربته', packs: d / 7, packLabel: 'أسبوع بلا أرجيلة' };
}

export function milestonesFor(s) {
  const types = activeHabits(s);
  const smoke = types.includes('cig') || types.includes('argileh');
  return MILESTONES.filter((m) => (m.smoke ? smoke : m.vapeOnly ? !smoke : true));
}

export function nextMilestone(s, now) {
  const e = elapsed(s, now);
  const list = milestonesFor(s);
  const i = list.findIndex((m) => m.at > e);
  if (i === -1) return null;
  const prev = i > 0 ? list[i - 1].at : 0;
  return { ...list[i], left: list[i].at - e, progress: (e - prev) / (list[i].at - prev) };
}

export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function gumToday(s, now = Date.now()) {
  const sod = startOfDay(now);
  return s.nrt.logs.filter((t) => t >= sod).length;
}

export function gumStock(s) {
  return Math.max(0, s.nrt.packs.length * s.nrt.packCount - s.nrt.logs.length);
}

export function perDayCounts(list, now = Date.now(), days = 7, pick = (x) => x) {
  const sod = startOfDay(now);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const from = sod - i * DAY;
    const to = from + DAY;
    out.push({ day: from, n: list.filter((x) => pick(x) >= from && pick(x) < to).length });
  }
  return out;
}

export function triggerCounts(s) {
  const c = {};
  s.cravings.forEach((x) => { if (x.trigger) c[x.trigger] = (c[x.trigger] || 0) + 1; });
  return TRIGGERS.map((t) => ({ ...t, n: c[t.id] || 0 }))
    .filter((t) => t.n > 0).sort((a, b) => b.n - a.n);
}

export const beaten = (s) => s.cravings.filter((c) => c.outcome === 'beaten').length;

// ---------------------------------------------------------------- words
const few = (n) => n >= 3 && n <= 10;
export function word(n, one, many) { return few(n) ? many : one; }

function count(n, one, two, many, rest) {
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${few(n) ? many : rest}`;
}

export function duration(ms) {
  const m = Math.max(1, Math.ceil(ms / MIN));
  if (m < 60) return count(m, 'دقيقة', 'دقيقتين', 'دقايق', 'دقيقة');
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) {
    const hs = count(h, 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
    return rm && h < 6 ? `${hs} و${count(rm, 'دقيقة', 'دقيقتين', 'دقايق', 'دقيقة')}` : hs;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  const ds = count(d, 'يوم', 'يومين', 'أيام', 'يوم');
  return rh && d < 7 ? `${ds} و${count(rh, 'ساعة', 'ساعتين', 'ساعات', 'ساعة')}` : ds;
}

export const DAY_NAMES = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

export function fmtMoney(v) {
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtInt(v) {
  return Math.floor(v).toLocaleString('en-US');
}
