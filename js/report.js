// طفّيها — the personal report and quit plan, shown after the interview and from the dashboard.
import { buildReport, patchStepFor, gumStageFor, WITHDRAWAL, REASONS, APPROACHES, targetText } from './plan.js';
import { assertAssessment } from './security.js';
import * as Content from './content.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (v) => Math.round(v).toLocaleString('en-US');

const FORM = {
  both: { t: 'لزقة + علكة', d: 'اللزقة بتعطي نيكوتين ثابت طول اليوم، والعلكة للرغبات القوية.', icon: 'patch' },
  patch: { t: 'لزقة نيكوتين', d: 'نيكوتين ثابت طول اليوم بجرعة بتنزل تدريجياً.', icon: 'patch' },
  gum: { t: 'علكة نيكوتين', d: 'نيكوتين سريع وقت الحاجة، بجدول بيخف أسبوع ورا أسبوع.', icon: 'gum' },
  none: { t: 'بدون علاج بديل', d: 'خطة سلوكية بس. العلاج البديل موجود إذا احتجته.', icon: 'shield' },
};
const YEARS = { '<1': 'أقل من سنة', '1-5': 'من 1–5 سنين', '6-10': 'من 6–10 سنين', '11-20': 'من 11–20 سنة', '20+': 'من أكتر من 20 سنة' };
const PRODUCT = { cig: 'السجاير', vape: 'الفيب', argileh: 'الأرجيلة' };
const PRODUCT_ICON = { cig: 'cig', vape: 'vape', argileh: 'hookah' };

function dateAr(t) {
  return new Date(t).toLocaleDateString('ar-JO-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------------------------------------------------------------- drawings
// Line icons with their colour written in (the PDF renderer doesn't follow currentColor).
const PATHS = {
  coffee: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1 1 1.5 1 2.5M12 3.5c0 1 1 1.5 1 2.5"/>',
  meal: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 3.5-3 7h3v11"/>',
  wake: '<path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 6v3M5.6 10.6l2 1.5M18.4 10.6l-2 1.5"/>',
  friends: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2A4.5 4.5 0 0 1 21 18.5"/>',
  stress: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  bored: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
  car: '<path d="M4 16v-4l2-5h12l2 5v4zM4 16v2.5M20 16v2.5"/><circle cx="8" cy="13.5" r="1"/><circle cx="16" cy="13.5" r="1"/>',
  work: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V5.5h6v2M3.5 12.5h17"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/>',
  night: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  irritable: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 15.5c1-1 2.2-1.5 3.5-1.5s2.5.5 3.5 1.5M8 9l2.5 1M16 9l-2.5 1"/>',
  anxiety: '<path d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/>',
  sleep: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/><path d="M15 4h3l-3 3h3"/>',
  appetite: '<path d="M12 7c-4-2-7 1-7 5s3 8 7 8 7-4 7-8-3-7-7-5z"/><path d="M12 7c0-2 1-3.5 3-4"/>',
  focus: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  mood: '<path d="M7 17a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5 3.75 3.75 0 0 1 17.5 17z"/><path d="M9 20.5v-1M12 21.5v-1M15 20.5v-1"/>',
  cravings: '<path d="M12 21c-3.5 0-6-2.5-6-6 0-3 2-5 3-7 .5 2 1.5 3 2.5 3.5C12 9 12.5 6 14.5 3.5 15.5 7 18 9.5 18 15c0 3.5-2.5 6-6 6z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
  pill: '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="m9.2 8 5.6 8"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  home: '<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17v.3"/>',
  route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/>',
};
const ico = (name, color = '#1b1716', size = 22) => `<svg class="rx-ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.info}</svg>`;
const pic = (name, size = 56) => `<img class="rx-pic" src="assets/icons/${name}.webp" alt="" width="${size}" height="${size}">`;

// half-circle meter: coloured bands, a needle, the score in the middle
function meter(score, max, label) {
  const p = Math.max(0, Math.min(1, score / max));
  const arc = (from, to, color) => {
    const pt = (t) => { const a = Math.PI * (1 - t); return [100 + 80 * Math.cos(a), 100 - 80 * Math.sin(a)]; };
    const [x1, y1] = pt(from); const [x2, y2] = pt(to);
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A80 80 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${color}" stroke-width="16" fill="none" stroke-linecap="butt"/>`;
  };
  const a = Math.PI * (1 - p);
  const nx = 100 + 62 * Math.cos(a); const ny = 100 - 62 * Math.sin(a);
  return `<svg class="rx-meter" viewBox="0 0 200 118" aria-hidden="true">
    ${arc(0, 0.33, '#f6dfb4')}${arc(0.335, 0.66, '#e5a548')}${arc(0.665, 1, '#e1261c')}
    <line x1="100" y1="100" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#1b1716" stroke-width="5" stroke-linecap="round"/>
    <circle cx="100" cy="100" r="9" fill="#1b1716"/>
  </svg>
  <div class="rx-meter-n"><b dir="ltr">${score}<small>/${max}</small></b><span>${label}</span></div>`;
}

// a ring for 0–10
function ring(v, color) {
  const c = 2 * Math.PI * 34;
  return `<svg class="rx-ring" viewBox="0 0 80 80" aria-hidden="true">
    <circle cx="40" cy="40" r="34" stroke="#ece9e6" stroke-width="9" fill="none"/>
    <circle cx="40" cy="40" r="34" stroke="${color}" stroke-width="9" fill="none" stroke-linecap="round"
      stroke-dasharray="${(c * v / 10).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 40 40)"/>
    <text x="40" y="47" text-anchor="middle" font-size="22" font-weight="800" fill="#1b1716" font-family="Big Shoulders Display, sans-serif">${v}</text>
  </svg>`;
}

// ---------------------------------------------------------------- NRT lines for the journey
function patchLine(steps, from, to) {
  const seen = [];
  for (let w = from; w <= to; w++) {
    const st = patchStepFor(steps, w);
    if (st && !seen.some((x) => x.mg === st.mg)) seen.push({ mg: st.mg, from: w });
  }
  if (!seen.length) return 'اللزقة: خلصت الخطة.';
  if (seen.length === 1) return `اللزقة: ${seen[0].mg} ملغ كل يوم.`;
  return `اللزقة: ${seen[0].mg} ملغ، وبعدين ${seen[1].mg} ملغ من الأسبوع ${seen[1].from}.`;
}

function nrtLine(tx, from, to) {
  const out = [];
  if (tx.form === 'patch' || tx.form === 'both') out.push(patchLine(tx.patchSteps, from, to));
  if (tx.form === 'gum' && tx.gumSchedule?.length > 1) {
    const seen = [];
    for (let w = from; w <= to; w++) {
      const st = gumStageFor(w);
      if (st && !seen.some((x) => x.st === st)) seen.push({ st, from: w });
    }
    if (seen.length === 1) out.push(`العلكة ${tx.gumMg} ملغ: ${seen[0].st.text}.`);
    if (seen.length > 1) out.push(`العلكة ${tx.gumMg} ملغ: ${seen[0].st.text}، ومن الأسبوع ${seen[1].from}: ${seen[1].st.text}.`);
  }
  if (tx.form === 'gum' && tx.gumSchedule?.length === 1) out.push(`العلكة ${tx.gumMg} ملغ: وقت الحاجة.`);
  if (tx.form === 'both') out.push(`العلكة ${tx.gumMg} ملغ: وقت الرغبة القوية بس.`);
  return out;
}

const LEVEL_TEXT = [
  'التحدي الأكبر عندك هو العادة والمواقف، مش الجسم.',
  'الأصعب عليك رح يكون العادات اليومية واللحظات المرتبطة بالتدخين.',
  'جسمك رح يطالب بالنيكوتين أول أسابيع، والعلاج البديل بيفرق معك كتير.',
  'جسمك متعوّد على كمية نيكوتين كبيرة، فالعلاج البديل والمتابعة مع عيادة إقلاع بيفرقوا كتير.',
];

const list = (items, icon = 'check', color = '#e1261c') => `<ul class="rx-list">${items.map((x) => `<li>${ico(icon, color, 18)}<span>${x}</span></li>`).join('')}</ul>`;
const callout = (kind, title, body) => `<div class="rx-call rx-call-${kind}">${ico(kind === 'warn' ? 'alert' : 'info', kind === 'warn' ? '#a8150f' : '#7a4d12', 20)}<div>${title ? `<b>${title}</b>` : ''}${body}</div></div>`;

export function reportHTML(a) {
  assertAssessment(a);
  const r = buildReport(a);
  const tx = r.tx;
  const products = a.products || [];
  const blocked = r.safe.stop.length > 0;
  const form = blocked ? { t: 'استشير دكتور أولاً', d: 'بسبب وضعك الصحي، العلاج البديل بيكون بإشراف دكتور.', icon: 'shield' } : FORM[tx.form];
  const levelLabel = ['منخفض', 'منخفض', 'متوسط', 'عالي'][r.dep.level];
  const amount = [
    products.includes('cig') ? `${a.cig_perDay} سيجارة باليوم` : '',
    products.includes('vape') ? `فيب${a.vp_nicotine > 0 ? ` ${a.vp_nicotine} ملغ/مل` : ''}` : '',
    products.includes('argileh') ? `${a.ar_perWeek} راس بالأسبوع` : '',
  ].filter(Boolean).join(' · ');
  const qd = new Date(r.quitAt);
  const monthly = r.perDay * 30.4;
  const yearly = r.perDay * 365;

  // ---- dependence: one meter per product
  const deps = [];
  if (r.dep.cig) deps.push({ k: 'السجاير', scale: 'مقياس فاغرستروم', d: r.dep.cig, max: 10, extra: `مؤشر كثافة التدخين: ${r.dep.cig.hsi} من 6` });
  if (r.dep.vape) deps.push({ k: 'الفيب', scale: 'مقياس Penn State', d: r.dep.vape, max: 20, extra: a.vp_nicotine >= 35 ? 'تركيزك العالي بيعطي نيكوتين أكتر من سيجارة بكتير' : '' });
  if (r.dep.argileh) deps.push({ k: 'الأرجيلة', scale: 'مؤشر تقريبي', d: r.dep.argileh, max: 8, extra: 'قعدة ساعة = دخان 100 لـ 200 سيجارة' });

  // ---- treatment
  let txBody = '';
  if (blocked) {
    txBody = callout('warn', 'قبل أي علاج بديل', `${list(r.safe.stop, 'alert', '#a8150f')}<p>الخطة السلوكية تحت بتنفعك من هلأ.</p>`);
  } else {
    if (tx.form === 'patch' || tx.form === 'both') {
      let w = 1;
      const steps = tx.patchSteps.map((s) => {
        const range = `الأسبوع ${w}${s.weeks > 1 ? `–${w + s.weeks - 1}` : ''}`;
        w += s.weeks;
        return `<div class="rx-stage" style="flex:${s.weeks}"><b>${s.mg}<small> ملغ</small></b><span>${range}</span></div>`;
      }).join('');
      txBody += `<p class="rx-k">اللزقة (24 ساعة)</p><div class="rx-stages">${steps}</div>
        <p class="rx-fine">إذا لزقتك 16 ساعة، القوة المقابلة 25 ثم 15 ثم 10 ملغ. اتّبع نشرة العلبة.</p>`;
    }
    if (tx.gumSchedule) {
      const weekly = tx.gumSchedule.every((g) => /^\d/.test(g.weeks));
      if (weekly) {
        const span = (g) => { const [f, t] = g.weeks.split('–').map(Number); return (t || f) - f + 1; };
        txBody += `<p class="rx-k">جدول العلكة، 12 أسبوع</p><div class="rx-stages">${tx.gumSchedule.map((g, i) => `<div class="rx-stage rx-s${i}" style="flex:${span(g)}"><span>الأسبوع ${g.weeks}</span><b class="rx-stage-t">${g.text}</b></div>`).join('')}</div>`;
      } else {
        txBody += tx.gumSchedule.map((g) => `<div class="rx-when"><b>${g.weeks}</b><span>${g.text}</span></div>`).join('');
      }
      txBody += '<p class="rx-fine">لا تتعدى الحد اليومي المكتوب على علبتك.</p>';
    }
    if (tx.form !== 'none') {
      const how = [];
      if (tx.form !== 'patch') how.push(['امضغها', 'لحد ما تحس بطعم لاذع'], ['حطها', 'بين خدّك ولثّتك'], ['كرّر', 'حوالي نص ساعة']);
      if (tx.form !== 'gum') how.push(['اللزقة الصبح', 'على جلد نضيف وناشف، وغيّر مكانها كل يوم'], ['أرق؟', 'شيل لزقة الـ 24 ساعة قبل النوم']);
      txBody += `<p class="rx-k">الاستعمال الصح</p><ol class="rx-how">${how.map(([t, d], i) => `<li><i>${i + 1}</i><b>${t}</b><span>${d}</span></li>`).join('')}</ol>`;
      txBody += `<div class="rx-chips">
        ${tx.form !== 'patch' ? `<span>${ico('coffee', '#7a4d12', 16)}لا قهوة ولا عصير قبلها بربع ساعة</span>` : ''}
        <span>${ico('check', '#7a4d12', 16)}${r.future ? 'اشتري العلاج البديل قبل يوم الإقلاع' : 'خلّي العلاج معك دايماً'}</span>
        <span>${ico('route', '#7a4d12', 16)}كمّل الخطة لآخرها</span>
      </div>`;
    }
    if (tx.notes.length) txBody += callout('note', '', list(tx.notes, 'info', '#7a4d12'));
    if (tx.vapeTaper) txBody += '<p class="rx-fine">تخفيف الفيب ممكن يكون بتقليل التركيز أو إطالة الوقت بين مرات الاستخدام، حسب قدرتك وأعراض الانسحاب. ما في جدول واحد مناسب للجميع؛ إذا زاد استخدامك بعد تخفيض التركيز، ممكن تكون خفّضته بسرعة. ناقش الخطة مع مختص، وتجنّب الرجوع للسجائر.</p>';
    txBody += '<p class="rx-fine">العلاج البديل بيرفع فرصة النجاح بحوالي 50–60%، والدعم من عيادة إقلاع فوقه بيزيدها كمان (مراجعات كوكرين).</p>';
  }

  // ---- how to quit
  const ap = APPROACHES[r.approach];
  const maxT = Math.max(1, ...r.schedule.flatMap((s) => s.targets.map((t) => t.value)));
  const schedRows = r.schedule.map((s) => {
    const v = s.targets[0]?.value ?? 0;
    return `<div class="rx-cut"><span>${s.label}</span><i style="--w:${Math.max(4, Math.round((v / maxT) * 100))}%"></i><b>${s.targets.map(targetText).join(' · ')}</b>${s.nic != null ? `<small>ليكويد ${s.nic} ملغ/مل</small>` : ''}</div>`;
  }).join('');

  // ---- the journey
  const top = r.triggers[0]?.label;
  const nl = (f, t) => (blocked ? [] : nrtLine(tx, f, t));
  const phases = [];
  if (r.future) {
    phases.push({ t: 'قبل يوم الإقلاع', sub: dateAr(r.quitAt), todo: true, items: [
      tx.form !== 'none' && !blocked ? 'اشتري العلاج البديل وخلّيه جاهز.' : '',
      'خبّر 2–3 ناس قريبين منك إنك رح تترك.',
      'ليلة الترك: شيل السجاير والولاعات والطفّايات من البيت والسيارة.',
      r.approach !== 'abrupt' ? 'امشي على جدول التخفيف، وسجّل كل وحدة بالتطبيق.' : '',
    ] });
  }
  phases.push({ t: 'الأيام 1–3', sub: 'ذروة الانسحاب', key: 'كل رغبة بتخلص خلال دقايق. اضغط «عندي رغبة» وخلّيها تعدّي.', nrt: nl(1, 1), items: [top ? `ابعد عن لحظة «${top}» قد ما بتقدر، أو غيّر شكلها.` : '', 'اشرب مي كتير، وخفّف القهوة للنص.'] });
  phases.push({ t: 'الأسبوع 1–2', sub: 'كسر العادة', key: 'ولا سحبة. حتى سحبة وحدة بترجّع الرغبة بقوة.', nrt: nl(1, 2), items: ['غيّر روتينك بالأماكن والأوقات اللي كنت تدخّن فيها.'] });
  phases.push({ t: 'الأسبوع 3–4', sub: 'المواقف الاجتماعية', key: 'الرغبات بتقل، بس السهرات بتضل صعبة. جهّز حالك قبلها.', nrt: nl(3, 4), items: [] });
  phases.push({ t: 'الأسبوع 5–8', sub: 'الثقة الزايدة', key: '«وحدة بس» هي أشهر سبب للرجوع. لا تجرّبها.', nrt: nl(5, 8), items: [] });
  phases.push({ t: 'الأسبوع 9–12', sub: 'إنهاء العلاج', key: tx.form !== 'none' && !blocked ? 'كمّل العلاج لآخره ونزّل تدريجياً، لا توقفه فجأة.' : 'خلّي خطتك للحظات الصعبة جاهزة دايماً.', nrt: nl(9, 12), items: [] });
  phases.push({ t: 'بعد 3 شهور', sub: 'الحفاظ', key: 'كافئ حالك من المصاري اللي وفّرتها.', nrt: [], items: ['إذا زلّيت، سجّلها وارجع لخطتك فوراً. الزلّة عادية، والعدّاد بيكمّل.', 'بعد 30 يوم بتصير حارس وبتقدر تفزع لغيرك.'] });

  // the gum/patch line only where it changes, not repeated in every phase
  let lastNrt = '';
  for (const p of phases) {
    const t = (p.nrt || []).join(' ');
    if (t && t === lastNrt) p.nrt = [];
    else if (t) lastNrt = t;
  }
  const phaseHTML = phases.map((p, i) => {
    const items = p.items.filter(Boolean);
    const body = p.todo
      ? `<ul class="rx-todo">${items.map((x) => `<li><i></i><span>${x}</span></li>`).join('')}</ul>`
      : `<p class="rx-ph-key">${p.key}</p>
        ${p.nrt.length ? `<div class="rx-ph-nrt">${p.nrt.map((n) => `<span>${pic(tx.form === 'patch' ? 'patch' : 'gum', 22)}${n}</span>`).join('')}</div>` : ''}
        ${items.length ? `<details class="rx-more"><summary>كمان</summary>${list(items, 'check', '#726c69')}</details>` : ''}`;
    return `<li class="${p.todo ? 'is-todo' : ''}"><span class="rx-node">${p.todo ? ico('calendar', '#fff', 16) : i + (r.future ? 0 : 1)}</span>
      <div class="rx-ph"><div class="rx-ph-t"><b>${p.t}</b><span>${p.sub}</span></div>${body}</div></li>`;
  }).join('');

  // ---- withdrawal, environment, referral
  const felt = r.withdrawal.length ? r.withdrawal : WITHDRAWAL.filter((w) => ['irritable', 'sleep', 'appetite', 'cravings'].includes(w.id));
  const env = [];
  if (a.homeSmokers) env.push(['home', 'في حدا بيدخّن بالبيت: اطلب منه ما يدخّن جوّا ولا جنبك.']);
  if (a.friends === 'most') env.push(['friends', 'أغلب أصحابك بيدخّنوا: خبّرهم إنك تارك، وأول كم أسبوع اطلعوا لأماكن ما فيها تدخين.']);
  if (a.friends === 'some') env.push(['friends', 'بعض أصحابك بيدخّنوا: اقعد جنب اللي ما بيدخّنوا، وخلّي معك علكة.']);
  if ((a.places || []).includes('car')) env.push(['car', 'السيارة: نظّفها من الريحة وشيل الطفّاية والولاعة.']);
  if ((a.places || []).includes('home_in')) env.push(['home', 'البيت: هوّي الغرف واغسل الأغطية، الريحة لحالها بتذكّرك.']);

  const refer = [];
  if (blocked) refer.push('وضعك الصحي بيحتاج دكتور قبل العلاج البديل.');
  if (r.dep.level >= 3) refer.push('اعتمادك عالي.');
  if (a.attempts === '3+') refer.push('حاولت أكتر من مرتين قبل.');
  if ((a.conditions || []).includes('mental')) refer.push('عندك حالة نفسية بتتعالج منها.');
  if (r.confidence < 4) refer.push('ثقتك قليلة، والدعم المباشر بيفرق.');

  const mainProduct = PRODUCT_ICON[products[0]] || 'cig';

  return `
  <header class="rp-head rx-head">
    <p class="rp-kicker">تقرير الإقلاع · ${dateAr(a.assessedAt || Date.now())}</p>
    <div class="rx-head-main">
      <div>
        <h2>${a.name ? `خطة ${esc(a.name)}` : 'خطتك'} لتطفّيها</h2>
        <p class="rp-line">${amount}${YEARS[a.years] ? ` · ${YEARS[a.years]}` : ''}</p>
      </div>
      <div class="rx-cal" aria-label="${r.future ? 'يوم الإقلاع' : 'تركت'}: ${dateAr(r.quitAt)}">
        <span class="rx-cal-k">${r.future ? 'يوم الإقلاع' : 'تركت'}</span>
        <b>${qd.getDate()}</b>
        <span>${qd.toLocaleDateString('ar-JO-u-nu-latn', { month: 'long' })}</span>
        <small>${qd.toLocaleDateString('ar-JO-u-nu-latn', { weekday: 'long' })}</small>
      </div>
    </div>
    <div class="rx-facts">
      <div>${pic(mainProduct, 40)}<span>الاعتماد</span><b>${levelLabel}</b></div>
      <div>${pic(form.icon, 40)}<span>العلاج</span><b>${form.t}</b></div>
      <div>${pic('coins', 40)}<span>بتوفّر بالسنة</span><b>${whole(yearly)} د.أ</b></div>
    </div>
  </header>

  <section class="rp-sec">
    <h3>مستوى اعتمادك على النيكوتين</h3>
    <div class="rx-deps">${deps.map((x) => `<div class="rx-dep">
      ${meter(x.d.score, x.max, `اعتماد ${x.d.label}`)}
      <p class="rx-dep-k"><b>${x.k}</b> · ${x.scale}</p>
      ${x.extra ? `<p class="rx-fine">${x.extra}</p>` : ''}
    </div>`).join('')}</div>
    <p class="rx-lead">${LEVEL_TEXT[r.dep.level]}</p>
  </section>

  <section class="rp-sec">
    <h3>كم بيكلّفك</h3>
    <div class="rx-cost">
      <div><strong>${money(r.perDay)}</strong><span>د.أ باليوم</span></div>
      <div><strong>${whole(monthly)}</strong><span>د.أ بالشهر</span></div>
      <div class="big">${pic('coins', 44)}<strong>${whole(yearly)}</strong><span>د.أ بالسنة</span></div>
    </div>
    <p class="rx-fine">كل هاد بيرجع لجيبتك. التطبيق بيحسبلك ياه يوم بيوم بالحصّالة.</p>
  </section>

  <section class="rp-sec">
    <div class="rx-title">${pic(form.icon, 52)}<div><h3>العلاج المقترح: ${form.t}${!blocked && tx.gumSchedule && tx.form === 'gum' ? ` <em>${tx.gumMg} ملغ</em>` : ''}</h3><p>${form.d}</p></div></div>
    ${txBody}
  </section>

  <section class="rp-sec">
    <div class="rx-title">${ico('route', '#e1261c', 40)}<div><h3>طريقتك للترك: ${r.reviewReason ? 'راجع موعد الإقلاع' : ap.t}</h3><p>${r.reviewReason || ap.d}</p></div></div>
    ${schedRows ? `<div class="rx-cuts">${schedRows}<div class="rx-cut rx-cut-q"><span>يوم الإقلاع</span><i style="--w:0%"></i><b>${dateAr(r.quitAt)}</b></div></div>` : ''}
    ${r.approach !== 'abrupt' ? '<p class="rx-fine">خلال التخفيف سجّل كل وحدة بالتطبيق، وأجّل أول وحدة الصبح. وإذا قدرت توقف قبل الموعد، وقف.</p>' : ''}
    ${r.meds.length ? `<p class="rx-k">إيمتى تبلّش العلاج</p>${list(r.meds, 'pill', '#e1261c')}` : ''}
    <p class="rx-fine">${ico('info', '#726c69', 14)} يوم الإقلاع هو يوم وقف التدخين أو الفيب، مش نهاية استخدام البدائل؛ العلاج والمتابعة ممكن يستمروا بعده.</p>
  </section>

  <section class="rp-sec rx-slim">
    <div class="rx-title">${ico('pill', '#e1261c', 36)}<div><h3>أدوية بوصفة الدكتور</h3><p>الفارينكلين والسيتيسين بيخففوا الرغبة، والبوبروبيون بيخفف الانسحاب. معتمدين من منظمة الصحة العالمية، وبيحتاجوا وصفة ومتابعة. اسأل عنهم بعيادة الإقلاع${r.dep.level >= 2 || a.attempts === '3+' ? '، خصوصاً إنه اعتمادك عالي أو جرّبت قبل' : ''}.</p></div></div>
  </section>

  <section class="rp-sec">
    <h3>رحلتك خطوة بخطوة</h3>
    <ol class="rx-journey">${phaseHTML}</ol>
  </section>

  ${r.triggers.length ? `<section class="rp-sec">
    <h3>لحظاتك الصعبة وخطة لكل وحدة</h3>
    <div class="rx-tiles">${r.triggers.map((t) => `<div><span class="rx-tile-i">${ico(t.id, '#e1261c', 26)}</span><b>${t.label}</b><p>${Content.text('craving', t.id, t.plan)}</p></div>`).join('')}</div>
  </section>` : ''}

  <section class="rp-sec">
    <h3>شو ممكن تحس فيه</h3>
    <p class="rx-lead">${r.withdrawal.length ? 'اللي حسّيت فيه بمحاولاتك قبل، وكيف تتعامل معه. كله مؤقت:' : 'أشهر أعراض الانسحاب، وكلها مؤقتة:'}</p>
    <div class="rx-tiles rx-tiles-soft">${felt.map((w) => `<div><span class="rx-tile-i">${ico(w.id, '#7a4d12', 26)}</span><b>${w.label}</b><p>${w.tip}</p></div>`).join('')}</div>
  </section>

  ${env.length ? `<section class="rp-sec"><h3>محيطك</h3><ul class="rx-env">${env.map(([i, t]) => `<li>${ico(i, '#1b1716', 22)}<span>${t}</span></li>`).join('')}</ul></section>` : ''}

  <section class="rp-sec">
    <h3>دافعك</h3>
    <div class="rx-mot">
      <div>${ring(r.importance, '#e1261c')}<span>قديش مهم إلك</span></div>
      <div>${ring(r.confidence, '#e5a548')}<span>قديش واثق</span></div>
    </div>
    <p class="rx-lead">${r.motivation}</p>
    ${(a.reasons || []).length ? `<div class="chips-static">${a.reasons.map((x) => `<span>${esc(Object.hasOwn(REASONS, x) ? REASONS[x] : x)}</span>`).join('')}</div>` : ''}
  </section>

  ${r.safe.notes.length ? `<section class="rp-sec"><h3>ملاحظات صحية</h3>${callout('note', '', list(r.safe.notes, 'info', '#7a4d12'))}</section>` : ''}

  ${refer.length ? `<section class="rp-sec rp-refer">
    <div class="rx-title">${ico('pin', '#e1261c', 36)}<div><h3>بنصحك تزور عيادة إقلاع</h3><p>العيادة بتعطيك متابعة، وممكن أدوية بوصفة. خذ معك هالتقرير.</p></div></div>
    ${list(refer, 'check', '#e1261c')}
    <p class="rx-fine">قائمة عيادات وزارة الصحة المعتمدة بكل المحافظات موجودة بالتطبيق، بصفحة «خطتي».</p>
  </section>` : ''}

  <section class="rp-sec rp-sources">
    <details class="rx-src" data-pdf-open><summary><h3>المصادر</h3></summary>
      <ul>${r.sources.map((x) => `<li>${x}</li>`).join('')}</ul>
    </details>
  </section>

  <p class="rp-foot">تقرير إرشادي مبني على مقاييس علمية وإرشادات نشرات العلاج البديل ومراجعات كوكرين. مش بديل عن استشارة الدكتور أو الصيدلاني. ${products.map((p) => PRODUCT[p]).join(' و')}.</p>`;
}

// ---------------------------------------------------------------- PDF
// Each block of the report is rendered to an image at a fixed width, then laid
// out on A4 pages so a section only splits when it is taller than a page.
const LIBS = {
  html2canvas: new URL('./vendor/html2canvas.js', import.meta.url).href,
  jspdf: new URL('./vendor/jspdf.js', import.meta.url).href,
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(s);
  });
}

export async function buildPDF(a) {
  if (!window.html2canvas) await loadScript(LIBS.html2canvas);
  if (!window.jspdf) await loadScript(LIBS.jspdf);
  await document.fonts.ready;

  const host = document.createElement('div');
  host.className = 'pdf-render';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = `<article class="rp-doc">${reportHTML(a)}</article>`;
  document.body.appendChild(host);
  host.querySelectorAll('details[data-pdf-open]').forEach((d) => { d.open = true; });
  document.documentElement.classList.add('h2c');
  await Promise.all([...host.querySelectorAll('img')].map((im) => (im.complete ? null : new Promise((ok) => { im.onload = ok; im.onerror = ok; }))));

  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const PW = 210;
    const PH = 297;
    const M = 12;
    const W = PW - 2 * M;
    const GAP = 4;
    let y = M;

    for (const el of host.querySelectorAll('.rp-doc > *')) {
      const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
      const mmPerPx = W / canvas.width;
      const h = canvas.height * mmPerPx;
      const room = PH - M - y;
      if (h <= PH - 2 * M) {
        if (h > room) { pdf.addPage(); y = M; }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', M, y, W, h);
        y += h + GAP;
        continue;
      }
      // taller than a page: slice it across pages
      if (y > M) { pdf.addPage(); y = M; }
      const slicePx = Math.floor((PH - 2 * M) / mmPerPx);
      for (let top = 0; top < canvas.height; top += slicePx) {
        const part = document.createElement('canvas');
        part.width = canvas.width;
        part.height = Math.min(slicePx, canvas.height - top);
        part.getContext('2d').drawImage(canvas, 0, top, canvas.width, part.height, 0, 0, canvas.width, part.height);
        if (top > 0) { pdf.addPage(); y = M; }
        pdf.addImage(part.toDataURL('image/jpeg', 0.9), 'JPEG', M, y, W, part.height * mmPerPx);
        y += part.height * mmPerPx + GAP;
      }
    }

    const n = pdf.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text(`${i} / ${n}`, PW / 2, PH - 5, { align: 'center' });
    }
    return pdf;
  } finally {
    host.remove();
    document.documentElement.classList.remove('h2c');
  }
}

export async function downloadPDF(a) {
  const pdf = await buildPDF(a);
  const d = new Date(a.assessedAt || Date.now());
  const p = (x) => String(x).padStart(2, '0');
  pdf.save(`tafiha-report-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.pdf`);
}

export function openReport(a, { first = false } = {}) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = 'report';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'تقريرك وخطتك');
    root.innerHTML = `
      <div class="rp-bar">
        <button class="btn btn-soft rp-pdf" type="button">نزّل خطتك</button>
        <button class="btn ${first ? 'btn-red' : 'btn-ink'} rp-done" type="button">${first ? 'ابدأ الخطة' : 'سكّر'}</button>
      </div>
      <article class="rp-doc">${reportHTML(a)}</article>`;
    document.body.appendChild(root);
    document.body.classList.add('rp-open');
    document.body.style.overflow = 'hidden';
    const close = () => {
      root.classList.add('leave');
      document.body.classList.remove('rp-open');
      document.body.style.overflow = '';
      setTimeout(() => root.remove(), 420);
      resolve();
    };
    root.querySelector('.rp-done').onclick = close;
    const pdfBtn = root.querySelector('.rp-pdf');
    pdfBtn.onclick = async () => {
      if (pdfBtn.disabled) return;
      pdfBtn.disabled = true;
      pdfBtn.textContent = 'عم جهّز الملف…';
      try {
        await downloadPDF(a);
        pdfBtn.textContent = 'نزل الملف ✓';
      } catch (e) {
        pdfBtn.textContent = 'ما زبط. تأكد من النت وجرّب كمان مرة';
      }
      setTimeout(() => { pdfBtn.disabled = false; pdfBtn.textContent = 'نزّل خطتك'; }, 3000);
    };
    root.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !first) close(); });
    setTimeout(() => root.querySelector('.rp-done').focus({ preventScroll: true }), 60);
  });
}
