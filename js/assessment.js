// طفّيها — the intake interview, like the first visit at a quit-smoking clinic.
// Questions are declared as data (items can depend on earlier answers) and shown one per screen.
import { CONDITIONS, MEDS, TRIGGERS, WITHDRAWAL } from './plan.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const YES = [[true, 'آه'], [false, 'لا']];
const has = (k, v) => (a) => (a[k] || []).includes(v);
const is = (k, ...v) => (a) => v.includes(a[k]);

function toLocalInput(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const SECTIONS = [
  {
    title: 'خلّينا نتعرّف عليك',
    sub: 'هاي نفس الأسئلة اللي بتسألك ياها عيادة الإقلاع. جاوب بصراحة، وبالآخر بتاخد تقرير وخطة إلك إنت.',
    hero: true,
    items: [
      { type: 'text', id: 'name', label: 'شو اسمك؟', placeholder: 'اختياري' },
      { type: 'choice', id: 'age', label: 'عمرك', req: true, options: [['u18', 'أقل من 18'], ['18-24', '18–24'], ['25-34', '25–34'], ['35-44', '35–44'], ['45-54', '45–54'], ['55+', '55 وأكبر']] },
      { type: 'choice', id: 'pregnancy', label: 'في حمل أو رضاعة؟', hint: 'مهم لأمان العلاج البديل.', req: true, options: [['no', 'لا، أو ما بينطبق'], ['pregnant', 'حمل'], ['breastfeeding', 'رضاعة']] },
    ],
  },
  {
    title: 'شو بتستعمل؟',
    sub: 'اختار كل اللي بتستعمله، ومن أرقامك بنحسب اعتمادك وتكلفتك.',
    items: [
      { type: 'multi', id: 'products', req: true, cards: true, options: [['cig', 'سجاير', 'باكيت وسيجارة'], ['vape', 'فيب', 'ديسبوزبل، بودات أو ليكويد'], ['argileh', 'أرجيلة', 'راس وقعدة']] },
      { type: 'choice', id: 'years', label: 'من قديش بتدخّن؟', req: true, options: [['<1', 'أقل من سنة'], ['1-5', '1–5 سنين'], ['6-10', '6–10'], ['11-20', '11–20'], ['20+', 'أكتر من 20']] },
      { type: 'group', title: 'السجاير', when: has('products', 'cig'), items: [
        { type: 'num', id: 'cig_perDay', label: 'كم سيجارة باليوم؟', step: 1, value: 20 },
        { type: 'num', id: 'cig_packPrice', label: 'سعر الباكيت (د.أ)', step: 0.05, value: 2.85 },
        { type: 'num', id: 'cig_packSize', label: 'كم سيجارة بالباكيت', step: 1, value: 20 },
      ] },
      { type: 'group', title: 'الفيب', when: has('products', 'vape'), items: [
        { type: 'choice', id: 'vp_kind', label: 'النوع', req: true, options: [['disposable', 'استعمال مرة'], ['pod', 'بودات'], ['liquid', 'ليكويد']] },
        { type: 'num', id: 'vp_price', label: 'سعر الجهاز أو البود أو القنينة (د.أ)', step: 0.25, value: 8 },
        { type: 'num', id: 'vp_days', label: 'كم يوم بيخلص معك؟', step: 0.5, value: 4 },
        { type: 'num', id: 'vp_puffs', label: 'كم سحبة مكتوب عليه؟', step: 100, value: 6000, when: is('vp_kind', 'disposable') },
        { type: 'choice', id: 'vp_nicotine', label: 'تركيز النيكوتين (ملغ/مل)', hint: 'مكتوب على العلبة. 5% = 50 ملغ/مل.', req: true, options: [[0, '0'], [3, '3'], [6, '6'], [12, '12'], [20, '18–20'], [35, '30–35'], [50, '50 أو أكتر'], [-1, 'مش عارف']] },
      ] },
      { type: 'group', title: 'الأرجيلة', when: has('products', 'argileh'), items: [
        { type: 'num', id: 'ar_perWeek', label: 'كم راس بالأسبوع؟', step: 1, value: 3 },
        { type: 'num', id: 'ar_price', label: 'سعر الراس (د.أ)', step: 0.25, value: 3.5 },
        { type: 'choice', id: 'ar_minutes', label: 'قديش بتطوّل القعدة؟', req: true, options: [['short', 'أقل من نص ساعة'], ['mid', 'نص ساعة لساعة'], ['long', 'أكتر من ساعة']] },
      ] },
    ],
  },
  {
    title: 'عن السجاير',
    sub: 'مقياس فاغرستروم للاعتماد على النيكوتين، اللي بتستعمله عيادات الإقلاع.',
    when: has('products', 'cig'),
    items: [
      { type: 'choice', id: 'ftnd_ttfc', label: 'بعد ما تصحى، إيمتى بتدخّن أول سيجارة؟', req: true, options: [['5', 'خلال 5 دقايق'], ['30', '6–30 دقيقة'], ['60', '31–60 دقيقة'], ['more', 'بعد أكتر من ساعة']] },
      { type: 'choice', id: 'ftnd_forbidden', label: 'بيصعب عليك ما تدخّن بأماكن ممنوعة؟ (مستشفى، طيارة، مكتب)', req: true, options: YES },
      { type: 'choice', id: 'ftnd_hate', label: 'أي سيجارة أصعب وحدة تتخلى عنها؟', req: true, options: [['first', 'أول وحدة الصبح'], ['other', 'أي وحدة تانية']] },
      { type: 'choice', id: 'ftnd_morning', label: 'بتدخّن أكتر بالساعات الأولى بعد ما تصحى من باقي اليوم؟', req: true, options: YES },
      { type: 'choice', id: 'ftnd_ill', label: 'بتدخّن وإنت مريض ونايم بالتخت معظم النهار؟', req: true, options: YES },
    ],
  },
  {
    title: 'عن الفيب',
    sub: 'مقياس Penn State للاعتماد على السيجارة الإلكترونية.',
    when: has('products', 'vape'),
    items: [
      { type: 'choice', id: 'vp_times', label: 'كم مرة باليوم بتستعمله؟', hint: 'المرة الوحدة حوالي 15 سحبة أو 10 دقايق.', req: true, options: [['0-4', '0–4'], ['5-9', '5–9'], ['10-14', '10–14'], ['15-19', '15–19'], ['20-29', '20–29'], ['30+', '30 أو أكتر']] },
      { type: 'choice', id: 'vp_ttfu', label: 'بالأيام اللي بتقدر تستعمله براحتك، إيمتى أول مرة بعد ما تصحى؟', req: true, options: [['5', '0–5 دقايق'], ['15', '6–15'], ['30', '16–30'], ['60', '31–60'], ['120', '61–120'], ['more', 'أكتر من ساعتين']] },
      { type: 'choice', id: 'vp_night', label: 'بتصحى بالليل أحياناً لتسحب؟', req: true, options: YES },
      { type: 'choice', id: 'vp_nights', label: 'كم ليلة بالأسبوع تقريباً؟', req: true, when: is('vp_night', true), options: [['0-1', '0–1'], ['2-3', '2–3'], ['4+', '4 أو أكتر']] },
      { type: 'choice', id: 'vp_hard', label: 'بتستعمله لأنه صعب كتير تبطّله؟', req: true, options: YES },
      { type: 'choice', id: 'vp_crave', label: 'بيجيك اشتياق قوي إلو؟', req: true, options: YES },
      { type: 'choice', id: 'vp_urge', label: 'آخر أسبوع، قديش كانت الرغبة قوية؟', req: true, options: [['none', 'ما في أو خفيفة'], ['mid', 'متوسطة أو قوية'], ['high', 'قوية كتير']] },
      { type: 'choice', id: 'vp_forbidden', label: 'بيصعب عليك ما تستعمله بأماكن ممنوعة؟', req: true, options: YES },
      { type: 'choice', id: 'vp_irritable', label: 'لما ما بتقدر تستعمله، بتصير عصبي أكتر؟', req: true, options: YES },
      { type: 'choice', id: 'vp_anxious', label: 'ولما ما بتقدر، بتحس بتوتر أو قلق أو ما بتقدر تقعد؟', req: true, options: YES },
    ],
  },
  {
    title: 'عن الأرجيلة',
    sub: 'ما في مقياس عالمي موحّد للأرجيلة، فهاي أسئلة بتعطي مؤشر تقريبي لاعتمادك.',
    when: has('products', 'argileh'),
    items: [
      { type: 'choice', id: 'ar_alone', label: 'بتشربها لحالك كمان، مش بس مع الناس؟', req: true, options: YES },
      { type: 'choice', id: 'ar_first', label: 'بتدوّر عليها أول ما تفضى أو تصحى؟', req: true, options: YES },
      { type: 'choice', id: 'ar_stopHard', label: 'حاولت تخففها أو تبطّلها وما قدرت؟', req: true, options: YES },
      { type: 'choice', id: 'ar_nervous', label: 'بتتوتر أو بتعصّب إذا ما قدرت تشربها بوقتها؟', req: true, options: YES },
      { type: 'choice', id: 'ar_priority', label: 'بتقدّمها على أشياء تانية، أو بتصرف عليها بدل أشياء مهمة؟', req: true, options: YES },
    ],
  },
  {
    title: 'محاولاتك قبل',
    sub: 'كل محاولة قبل بتعلّمنا شو بيصعب عليك.',
    items: [
      { type: 'choice', id: 'attempts', label: 'كم مرة حاولت تترك قبل؟', req: true, options: [['0', 'ولا مرة'], ['1-2', 'مرة أو مرتين'], ['3+', '3 أو أكتر']] },
      { type: 'choice', id: 'longest', label: 'أطول مدة قدرت فيها؟', req: true, when: (a) => a.attempts && a.attempts !== '0', options: [['<1d', 'أقل من يوم'], ['1-7d', 'يوم لأسبوع'], ['1-4w', 'أسبوع لشهر'], ['1-6m', 'شهر لـ 6 شهور'], ['6m+', 'أكتر من 6 شهور']] },
      { type: 'multi', id: 'methods', label: 'شو استعملت؟', when: (a) => a.attempts && a.attempts !== '0', options: [['will', 'إرادة بس'], ['gum', 'علكة'], ['patch', 'لزقات'], ['vape', 'فيب'], ['meds', 'أدوية من دكتور'], ['clinic', 'عيادة أو تطبيق']] },
      { type: 'multi', id: 'relapse', label: 'شو رجّعك؟', when: (a) => a.attempts && a.attempts !== '0', options: [['craving', 'الرغبة القوية'], ['stress', 'التوتر والضغط'], ['friends', 'الأصحاب والسهرات'], ['habit', 'القهوة والعادات'], ['weight', 'زيادة الوزن'], ['mood', 'العصبية والمزاج'], ['unknown', 'ما بعرف']] },
      { type: 'multi', id: 'withdrawal', label: 'شو الأعراض اللي حسّيت فيها؟', when: (a) => a.attempts && a.attempts !== '0', options: WITHDRAWAL.map((w) => [w.id, w.label]) },
    ],
  },
  {
    title: 'وين وإيمتى بتدخّن؟',
    sub: 'هاي اللحظات اللي بدنا نجهّزلك إلها خطة.',
    items: [
      { type: 'multi', id: 'triggers', label: 'إيمتى أكتر إشي بتدخّن؟', req: true, options: TRIGGERS.map((t) => [t.id, t.label]) },
      { type: 'multi', id: 'places', label: 'وين؟', options: [['home_in', 'بالبيت جوّا'], ['home_out', 'بالبلكونة أو برّا البيت'], ['car', 'بالسيارة'], ['work', 'بالشغل أو الجامعة'], ['cafe', 'بالكافيهات'], ['friends', 'عند الأصحاب']] },
      { type: 'choice', id: 'homeSmokers', label: 'في حدا بيدخّن معك بالبيت؟', req: true, options: YES },
      { type: 'choice', id: 'friends', label: 'أصحابك المقرّبين؟', req: true, options: [['most', 'أغلبهم بيدخّنوا'], ['some', 'بعضهم'], ['none', 'ولا حدا']] },
    ],
  },
  {
    title: 'دافعك',
    sub: 'الدافع والثقة من أقوى الأشياء اللي بتحدد النجاح.',
    items: [
      { type: 'scale', id: 'importance', label: 'من 0 لـ 10، قديش مهم عندك تترك هلأ؟', req: true, low: 'مش مهم', high: 'مهم كتير' },
      { type: 'scale', id: 'confidence', label: 'ومن 0 لـ 10، قديش واثق إنك بتقدر؟', req: true, low: 'مش واثق', high: 'واثق كتير' },
      { type: 'multi', id: 'reasons', label: 'ليش بدك تترك؟', req: true, options: [['health', 'صحتي'], ['family', 'عيلتي وولادي'], ['money', 'المصاري'], ['fitness', 'الرياضة واللياقة'], ['smell', 'الريحة والأسنان'], ['freedom', 'ما بدي أكون معتمد على إشي'], ['faith', 'الدين'], ['baby', 'حمل أو تخطيط للولاد'], ['doctor', 'الدكتور نصحني']] },
    ],
  },
  {
    title: 'صحتك',
    sub: 'حتى نعرف شو العلاج الآمن إلك. معلوماتك بتضل على جهازك بس.',
    items: [
      { type: 'multi', id: 'conditions', label: 'عندك أي من هدول؟', req: true, none: 'ولا وحدة', options: CONDITIONS.map((c) => [c.id, c.label]) },
      { type: 'multi', id: 'meds', label: 'بتاخد أي من هالأدوية؟', hint: 'ترك الدخان بيغيّر مستواها بالدم.', req: true, none: 'ولا واحد', options: MEDS.map((m) => [m.id, m.label]) },
    ],
  },
  {
    title: 'العلاج البديل',
    sub: 'اللزقات والعلكة بيعطوك نيكوتين بدون دخان، وبيخففوا الانسحاب.',
    items: [
      { type: 'choice', id: 'nrt_now', label: 'بتستعمل هلأ إشي منهم؟', req: true, options: [['none', 'لا'], ['gum', 'علكة'], ['patch', 'لزقات'], ['both', 'الاتنين']] },
      { type: 'group', title: 'العلكة', when: is('nrt_now', 'gum', 'both'), items: [
        { type: 'choice', id: 'gum_mg', label: 'التركيز', req: true, options: [[2, '2 ملغ'], [4, '4 ملغ']] },
        { type: 'num', id: 'gum_max', label: 'الحد اليومي (مكتوب على العلبة)', step: 1, value: 15 },
        { type: 'num', id: 'gum_price', label: 'سعر العلبة (د.أ)', step: 0.25, value: 6 },
        { type: 'num', id: 'gum_count', label: 'كم حبة بالعلبة', step: 1, value: 30 },
      ] },
      { type: 'group', title: 'اللزقات', when: is('nrt_now', 'patch', 'both'), items: [
        { type: 'choice', id: 'patch_mg', label: 'قوة اللزقة', req: true, options: [[21, '21 ملغ · 24 ساعة'], [14, '14 ملغ · 24 ساعة'], [7, '7 ملغ · 24 ساعة'], [25, '25 ملغ · 16 ساعة'], [15, '15 ملغ · 16 ساعة'], [10, '10 ملغ · 16 ساعة']] },
        { type: 'num', id: 'patch_price', label: 'سعر العلبة (د.أ)', step: 0.25, value: 12 },
        { type: 'num', id: 'patch_count', label: 'كم لزقة بالعلبة', step: 1, value: 7 },
      ] },
      { type: 'choice', id: 'nrt_pref', label: 'شو بتحب تجرّب؟', req: true, when: is('nrt_now', 'none'), options: [['advise', 'انصحني إنت'], ['patch', 'لزقات'], ['gum', 'علكة'], ['both', 'الاتنين سوا'], ['none', 'بدون علاج']] },
    ],
  },
  {
    title: 'يوم الترك',
    sub: 'الأفضل تحدد يوم خلال أسبوعين، وتتجهّز قبله.',
    items: [
      { type: 'choice', id: 'quitMode', label: 'وين إنت هلأ؟', req: true, cards: true, options: [['done', 'تركت خلص'], ['future', 'لسّا بدخّن، بدي أحدد يوم']] },
      { type: 'choice', id: 'when', label: 'إيمتى طفّيت آخر وحدة؟', req: true, when: is('quitMode', 'done'), options: [['now', 'هلأ'], ['morning', 'اليوم الصبح'], ['yesterday', 'مبارح'], ['custom', 'تاريخ تاني']] },
      { type: 'date', id: 'pastDate', label: 'التاريخ والساعة', when: (a) => a.quitMode === 'done' && a.when === 'custom', past: true },
      { type: 'date', id: 'futureDate', label: 'يوم الترك', when: is('quitMode', 'future'), future: true },
    ],
  },
];

// ---------------------------------------------------------------- one question per screen
// Every item becomes its own screen; a group of numbers shares one screen.
// Single choices move on by themselves, so most answers are a single tap.
function buildSteps(a) {
  const steps = [{ key: 'intro', intro: true }];
  for (const sec of SECTIONS) {
    if (sec.when && !sec.when(a)) continue;
    for (const it of sec.items) {
      if (it.type === 'text') continue;
      if (it.when && !it.when(a)) continue;
      if (it.type === 'group') {
        const live = it.items.filter((x) => !x.when || x.when(a));
        live.filter((x) => x.type !== 'num').forEach((x) => steps.push({ key: x.id, sec, group: it.title, items: [x] }));
        const nums = live.filter((x) => x.type === 'num');
        if (nums.length) steps.push({ key: nums.map((x) => x.id).join('+'), sec, group: it.title, items: nums, nums: true });
      } else {
        steps.push({ key: it.id, sec, items: [it] });
      }
    }
  }
  return steps;
}

function stepper(it, a) {
  const v = a[it.id] ?? it.value;
  return `<div class="stepper" data-id="${it.id}" data-step="${it.step}">
    <span class="st-label">${it.label}</span>
    <div class="st-row">
      <button type="button" class="st-btn" data-d="1" aria-label="زيد">+</button>
      <input type="number" inputmode="decimal" min="0" step="${it.step}" name="${it.id}" value="${v}" aria-label="${it.label}">
      <button type="button" class="st-btn" data-d="-1" aria-label="نقّص">−</button>
    </div>
  </div>`;
}

function control(step, a) {
  const it = step.items[0];
  if (step.nums) return `<div class="steppers">${step.items.map((x) => stepper(x, a)).join('')}</div>`;
  if (it.type === 'date') {
    const now = Date.now();
    const def = it.future ? (() => { const d = new Date(now + 7 * 864e5); d.setHours(8, 0, 0, 0); return d.getTime(); })() : now;
    const lim = it.future ? `min="${toLocalInput(now)}" max="${toLocalInput(now + 60 * 864e5)}"` : `max="${toLocalInput(now)}"`;
    return `<input class="big-input" type="datetime-local" name="${it.id}" value="${toLocalInput(a[it.id] || def)}" ${lim}>`;
  }
  if (it.type === 'scale') {
    return `<div class="q-scale">${Array.from({ length: 11 }, (_, i) => `<button type="button" data-q="${it.id}" data-v="${i}" aria-pressed="${a[it.id] === i}" style="--v:${i}">${i}</button>`).join('')}</div>
      <div class="scale-ends"><span>${it.low}</span><span>${it.high}</span></div>`;
  }
  if (it.type === 'choice') {
    const yesno = it.options.length === 2 && typeof it.options[0][0] === 'boolean';
    const cls = yesno ? 'big-opts two' : it.options.length > 4 ? 'big-opts grid' : 'big-opts';
    return `<div class="${cls}" role="radiogroup">${it.options.map(([v, l, h]) =>
      `<button type="button" role="radio" data-q="${it.id}" data-v='${JSON.stringify(v)}' aria-checked="${a[it.id] === v}" aria-pressed="${a[it.id] === v}"><span class="t">${l}</span>${h ? `<span class="h">${h}</span>` : ''}</button>`).join('')}</div>`;
  }
  if (it.type === 'multi') {
    const cur = a[it.id] || [];
    const opts = [...it.options, ...(it.none ? [['__none', it.none]] : [])];
    return `<div class="${it.cards ? 'big-opts' : 'chip-opts'}">${opts.map(([v, l, h]) => {
      const on = v === '__none' ? (Array.isArray(a[it.id]) && !cur.length) : cur.includes(v);
      return `<button type="button" data-m="${it.id}" data-v="${v}" aria-pressed="${!!on}"><span class="t">${l}</span>${h ? `<span class="h">${h}</span>` : ''}</button>`;
    }).join('')}</div>`;
  }
  return '';
}

export function runAssessment(prev = {}, opts = {}) {
  return new Promise((resolve) => {
    const a = { ...prev };
    let idx = 0;
    let dir = 1;

    const root = document.createElement('div');
    root.className = 'onb';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'مقابلة الإقلاع');
    root.innerHTML = `
      <div class="onb-top">
        <button class="onb-back" type="button" aria-label="رجوع"><svg class="ico"><use href="#i-arrow" transform="rotate(180 12 12)"/></svg></button>
        <div class="onb-bar" aria-hidden="true"><i></i></div>
      </div>
      <div class="onb-body"></div>`;
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    const body = root.querySelector('.onb-body');
    root.querySelector('.onb-back').onclick = () => { if (idx > 0) { dir = -1; idx--; render(); } };

    function render() {
      const steps = buildSteps(a);
      idx = Math.min(idx, steps.length - 1);
      const step = steps[idx];
      root.querySelector('.onb-bar i').style.width = `${((idx + 1) / steps.length) * 100}%`;
      root.querySelector('.onb-back').style.visibility = idx === 0 ? 'hidden' : 'visible';
      const last = idx === steps.length - 1;
      let html;
      if (step.intro) {
        html = `
          <div class="onb-hero"><img src="assets/apple-touch-icon.png" alt="" width="76" height="76"><span class="word">طفّيها</span></div>
          <h1 class="q-title">خلّينا نتعرّف عليك</h1>
          <p class="sub">نفس أسئلة عيادة الإقلاع، وبالآخر بتاخد تقرير وخطة إلك إنت.</p>
          <label class="field">اسمك<input name="name" value="${esc(a.name)}" maxlength="24" autocomplete="given-name" placeholder="اختياري"></label>
          <p class="onb-err" role="alert"></p>
          <div class="onb-actions">
            <button class="btn btn-red" data-next>يلا نبلّش</button>
            ${opts.onLink ? '<button class="btn btn-line" type="button" data-link>عندي بيانات على جهاز تاني</button>' : ''}
          </div>`;
      } else {
        const it = step.items[0];
        const title = step.nums ? step.group : (it.label || step.sec.title);
        const auto = !step.nums && (it.type === 'choice' || it.type === 'scale');
        html = `
          ${(step.group && !step.nums ? step.group : step.sec.title) !== title ? `<p class="q-eyebrow">${step.group && !step.nums ? step.group : step.sec.title}</p>` : ''}
          <h1 class="q-title">${title}</h1>
          ${it.hint && !step.nums ? `<p class="q-hint">${it.hint}</p>` : ''}
          ${control(step, a)}
          <p class="onb-err" role="alert"></p>
          <div class="onb-actions">${auto && !last ? '' : `<button class="btn ${last ? 'btn-red' : 'btn-ink'}" data-next>${last ? 'شوف تقريري' : 'التالي'}</button>`}</div>`;
      }
      body.innerHTML = `<div class="onb-step ${dir < 0 ? 'back' : ''}">${html}</div>`;
      wire(body.firstElementChild, step, last);
      root.scrollTop = 0;
    }

    function read(el) {
      el.querySelectorAll('input[name]').forEach((inp) => {
        if (inp.type === 'number') a[inp.name] = parseFloat(inp.value);
        else if (inp.type === 'datetime-local') a[inp.name] = new Date(inp.value).getTime();
        else a[inp.name] = inp.value.trim();
      });
    }

    function check(step) {
      if (step.intro) return '';
      for (const it of step.items) {
        if (it.type === 'num' && !(a[it.id] > 0)) return `«${it.label}» لازم يكون أكبر من صفر.`;
        if (it.type === 'date' && !Number.isFinite(a[it.id])) return 'اختار التاريخ.';
        if (it.type === 'date' && it.future && a[it.id] <= Date.now()) return 'يوم الترك لازم يكون بالمستقبل.';
        if (!it.req) continue;
        if ((it.type === 'choice' || it.type === 'scale') && a[it.id] === undefined) return 'اختار جواب.';
        if (it.type === 'multi' && (!Array.isArray(a[it.id]) || (!it.none && !a[it.id].length))) return 'اختار شي واحد على الأقل.';
      }
      return '';
    }

    // answers can add or remove later questions, so "last" is decided after reading them
    function next(el, step) {
      read(el);
      const err = check(step);
      if (err) { el.querySelector('.onb-err').textContent = err; return; }
      if (idx >= buildSteps(a).length - 1) { finish(); return; }
      dir = 1;
      idx++;
      render();
    }

    function wire(el, step, last) {
      el.addEventListener('click', (ev) => {
        const st = ev.target.closest('.st-btn');
        if (st) {
          const box = st.closest('.stepper');
          const inp = box.querySelector('input');
          const stepV = parseFloat(box.dataset.step) || 1;
          const v = Math.max(0, Math.round(((parseFloat(inp.value) || 0) + stepV * Number(st.dataset.d)) * 100) / 100);
          inp.value = v;
          inp.classList.remove('bump');
          void inp.offsetWidth;
          inp.classList.add('bump');
          return;
        }
        const b = ev.target.closest('button[data-q], button[data-m]');
        if (!b) return;
        if (b.dataset.q) {
          a[b.dataset.q] = JSON.parse(b.dataset.v);
          b.parentElement.querySelectorAll('button').forEach((x) => {
            x.setAttribute('aria-pressed', String(x === b));
            if (x.getAttribute('role') === 'radio') x.setAttribute('aria-checked', String(x === b));
          });
          const stillLast = idx >= buildSteps(a).length - 1;
          if (!stillLast) setTimeout(() => next(el, step), 280);
          else if (!el.querySelector('[data-next]')) {
            el.querySelector('.onb-actions').innerHTML = '<button class="btn btn-red" data-next>شوف تقريري</button>';
            el.querySelector('[data-next]').addEventListener('click', () => next(el, step));
          }
          return;
        }
        const id = b.dataset.m;
        let cur = Array.isArray(a[id]) ? [...a[id]] : [];
        if (b.dataset.v === '__none') cur = [];
        else cur = cur.includes(b.dataset.v) ? cur.filter((x) => x !== b.dataset.v) : [...cur, b.dataset.v];
        a[id] = cur;
        b.parentElement.querySelectorAll('button').forEach((x) => {
          x.setAttribute('aria-pressed', String(x.dataset.v === '__none' ? !cur.length : cur.includes(x.dataset.v)));
        });
        el.querySelector('.onb-err').textContent = '';
      });
      el.querySelector('[data-next]')?.addEventListener('click', () => next(el, step));
      el.querySelector('[data-link]')?.addEventListener('click', () => linkForm(el));
      setTimeout(() => (el.querySelector('input:not([type=number])') || el.querySelector('button[aria-pressed="true"], button[data-q], button[data-m], [data-next]'))?.focus({ preventScroll: true }), 60);
    }

    // join the data of another device with a code shown there
    function linkForm(el) {
      el.innerHTML = `
        <h1 class="q-title" style="margin-top:5vh">اربط هالجهاز</h1>
        <p class="sub">على جهازك التاني: الإعدادات ← أجهزتك ← «اربط جهاز تاني»، واكتب الرمز اللي بيطلعلك هون.</p>
        <input class="big-input code-input" dir="ltr" autocomplete="off" autocapitalize="characters" maxlength="9" placeholder="XXXX-XXXX">
        <p class="onb-err" role="alert"></p>
        <div class="onb-actions">
          <button class="btn btn-red" data-go>اربط</button>
          <button class="btn btn-soft" type="button" data-cancel>رجوع</button>
        </div>`;
      const inp = el.querySelector('.code-input');
      inp.focus();
      el.querySelector('[data-cancel]').onclick = () => render();
      el.querySelector('[data-go]').onclick = async () => {
        const go = el.querySelector('[data-go]');
        go.disabled = true;
        go.textContent = 'عم يربط…';
        try {
          const ok = await opts.onLink(inp.value);
          if (ok) {
            root.classList.add('leave');
            document.body.style.overflow = '';
            setTimeout(() => root.remove(), 520);
            resolve({ __linked: true });
            return;
          }
          el.querySelector('.onb-err').textContent = 'الرمز غلط أو خلص وقته. اطلب رمز جديد من الجهاز التاني.';
        } catch (e) {
          el.querySelector('.onb-err').textContent = 'ما زبط الربط. تأكد من النت وجرّب كمان مرة.';
        }
        go.disabled = false;
        go.textContent = 'اربط';
      };
    }

    function finish() {
      const now = Date.now();
      if (a.quitMode === 'future') a.quitAt = a.futureDate;
      else if (a.when === 'now') a.quitAt = now;
      else if (a.when === 'morning') { const d = new Date(); d.setHours(8, 0, 0, 0); a.quitAt = Math.min(d.getTime(), now); }
      else if (a.when === 'yesterday') a.quitAt = now - 864e5;
      else a.quitAt = Math.min(a.pastDate || now, now);
      a.assessedAt = now;
      root.classList.add('leave');
      document.body.style.overflow = '';
      setTimeout(() => root.remove(), 520);
      resolve(a);
    }

    render();
  });
}
