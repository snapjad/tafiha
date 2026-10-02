// طفّيها — the personal report and quit plan, shown after the interview and from the dashboard.
import { buildReport, patchStepFor, gumStageFor, WITHDRAWAL, REASONS, APPROACHES, targetText } from './plan.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = (v) => Math.round(v).toLocaleString('en-US');

const FORM = {
  both: { t: 'لزقة + علكة', d: 'العلاج المشترك: اللزقة بتعطي نيكوتين ثابت طول اليوم، والعلكة للرغبات القوية.' },
  patch: { t: 'لزقة نيكوتين', d: 'نيكوتين ثابت طول اليوم بجرعة بتنزل تدريجياً.' },
  gum: { t: 'علكة نيكوتين', d: 'نيكوتين سريع وقت الحاجة، بجدول بيخف أسبوع ورا أسبوع.' },
  none: { t: 'بدون علاج بديل', d: 'خطة سلوكية بس. العلاج البديل موجود إذا احتجته.' },
};
const YEARS = { '<1': 'أقل من سنة', '1-5': 'من 1–5 سنين', '6-10': 'من 6–10 سنين', '11-20': 'من 11–20 سنة', '20+': 'من أكتر من 20 سنة' };
const PRODUCT = { cig: 'السجاير', vape: 'الفيب', argileh: 'الأرجيلة' };

function dateAr(t) {
  return new Date(t).toLocaleDateString('ar-JO-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
}

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

function gauge(score, max, bands) {
  const p = Math.max(0, Math.min(1, score / max));
  return `<div class="gauge" style="--p:${p.toFixed(3)}" aria-hidden="true">
    <div class="g-track">${bands.map((b) => `<i style="flex:${b}"></i>`).join('')}</div>
    <span class="g-mark"></span>
  </div>`;
}

const LEVEL_TEXT = [
  'اعتمادك على النيكوتين منخفض. التحدي الأكبر عندك هو العادة والمواقف، مش الجسم.',
  'اعتمادك منخفض. الأصعب عليك رح يكون العادات اليومية واللحظات المرتبطة بالتدخين.',
  'اعتماد متوسط. جسمك رح يطالب بالنيكوتين أول أسابيع، والعلاج البديل بيفرق معك كتير.',
  'اعتماد عالي. جسمك متعوّد على كمية نيكوتين كبيرة، فالعلاج البديل مهم جداً إلك، والأفضل لزقة مع علكة.',
];

export function reportHTML(a) {
  const r = buildReport(a);
  const tx = r.tx;
  const products = a.products || [];
  const blocked = r.safe.stop.length > 0;
  const form = blocked ? { t: 'استشير دكتور أولاً', d: 'بسبب وضعك الصحي، العلاج البديل بيكون بإشراف دكتور.' } : FORM[tx.form];
  const levelLabel = ['منخفض', 'منخفض', 'متوسط', 'عالي'][r.dep.level];
  const amount = [
    products.includes('cig') ? `${a.cig_perDay} سيجارة باليوم` : '',
    products.includes('vape') ? `فيب${a.vp_nicotine > 0 ? ` ${a.vp_nicotine} ملغ/مل` : ''}` : '',
    products.includes('argileh') ? `${a.ar_perWeek} راس بالأسبوع` : '',
  ].filter(Boolean).join(' · ');

  // ---- dependence
  const depRows = [];
  if (r.dep.cig) {
    const d = r.dep.cig;
    depRows.push(`<div class="dep">
      <div class="dep-head"><b>السجاير</b><span>مقياس فاغرستروم</span><strong dir="ltr">${d.score}<small>/10</small></strong></div>
      ${gauge(d.score, 10, [2.5, 2, 1, 2, 2.5])}
      <p>اعتماد <b>${d.label}</b>. مؤشر كثافة التدخين (HSI): ${d.hsi} من 6، ${d.hsiLabel}.</p>
    </div>`);
  }
  if (r.dep.vape) {
    const d = r.dep.vape;
    depRows.push(`<div class="dep">
      <div class="dep-head"><b>الفيب</b><span>مقياس Penn State</span><strong dir="ltr">${d.score}<small>/20</small></strong></div>
      ${gauge(d.score, 20, [4, 5, 4, 8])}
      <p>اعتماد <b>${d.label}</b>${a.vp_nicotine >= 35 ? '، والتركيز العالي اللي بتستعمله بيعطي نيكوتين أكتر من سيجارة عادية بكتير' : ''}.</p>
    </div>`);
  }
  if (r.dep.argileh) {
    const d = r.dep.argileh;
    depRows.push(`<div class="dep">
      <div class="dep-head"><b>الأرجيلة</b><span>مؤشر تقريبي</span><strong dir="ltr">${d.score}<small>/8</small></strong></div>
      ${gauge(d.score, 8, [3, 3, 3])}
      <p>اعتماد <b>${d.label}</b>. حسب منظمة الصحة العالمية، قعدة أرجيلة ساعة ممكن تسحب فيها دخان بحجم 100 لـ 200 ضعف سيجارة وحدة.</p>
    </div>`);
  }

  // ---- treatment
  let txBody = '';
  if (blocked) {
    txBody = `<div class="alert"><b>قبل أي علاج بديل</b><ul>${r.safe.stop.map((s) => `<li>${s}</li>`).join('')}</ul><p>الخطة السلوكية تحت بتنفعك من هلأ.</p></div>`;
  } else {
    if (tx.form === 'patch' || tx.form === 'both') {
      let w = 1;
      const steps = tx.patchSteps.map((s) => {
        const range = `الأسبوع ${w}${s.weeks > 1 ? `–${w + s.weeks - 1}` : ''}`;
        w += s.weeks;
        return `<div class="step"><strong>${s.mg}<small> ملغ</small></strong><span>${range}</span></div>`;
      }).join('<i class="step-arrow" aria-hidden="true"></i>');
      txBody += `<h4>اللزقة (24 ساعة)</h4><div class="steps">${steps}</div>
        <p class="small">إذا لزقتك 16 ساعة، القوة المقابلة 25 ثم 15 ثم 10 ملغ. اتّبع نشرة العلبة.</p>`;
    }
    if (tx.gumSchedule) {
      txBody += `<h4>العلكة ${tx.gumMg} ملغ</h4><div class="rows">${tx.gumSchedule.map((g) => `<div><b>${g.weeks === 'مع اللزقة' || g.weeks === 'وقت الحاجة' ? g.weeks : `الأسبوع ${g.weeks}`}</b><span>${g.text}</span></div>`).join('')}</div>
        <p class="small">لا تتعدى الحد اليومي المكتوب على علبتك.</p>`;
    }
    if (tx.form !== 'none') {
      txBody += `<h4>الاستعمال الصح</h4><ul class="tips">
        ${tx.form !== 'gum' ? '<li>حط اللزقة الصبح على جلد نضيف وناشف وبلا شعر: فوق الذراع أو الكتف أو الصدر، وغيّر مكانها كل يوم.</li><li>إذا صار عندك أحلام مزعجة أو أرق مع لزقة الـ 24 ساعة، شيلها قبل النوم.</li>' : ''}
        ${tx.form !== 'patch' ? '<li>العلكة مش علكة عادية: امضغ لحد ما تحس بطعم لاذع، حطها بين خدّك ولثّتك، وكرّر حوالي نص ساعة.</li><li>لا قهوة ولا عصير ولا غازي قبلها وخلالها بربع ساعة.</li>' : ''}
        <li>${r.future ? 'اشتري العلاج قبل يوم الترك، وبلّش فيه من أول يوم.' : 'خلّي العلاج معك دايماً: بالبيت وبالشغل وبالسيارة.'}</li>
        <li>كمّل الخطة لآخرها. أكتر غلطة إن الناس بيوقفوا العلاج بكير.</li>
      </ul>`;
    }
    if (tx.notes.length) txBody += `<ul class="notes">${tx.notes.map((n) => `<li>${n}</li>`).join('')}</ul>`;
    if (tx.vapeTaper) txBody += '<p class="small">بدون علاج بديل، بتقدر تنزّل تركيز النيكوتين بالفيب تدريجياً كل أسبوع لأسبوعين (مثلاً 20 ← 12 ← 6 ← 3 ← 0) وبعدين توقف.</p>';
    txBody += '<p class="evidence">العلاج البديل بيرفع فرصة النجاح بحوالي 50–60%، والجمع بين لزقة وعلكة أقوى من نوع واحد، والدعم فوق العلاج بيزيدها كمان (مراجعات كوكرين).</p>';
  }
  if (r.dep.level >= 2 || a.attempts === '3+') {
    txBody += '<p class="small">في كمان أدوية بوصفة طبية زي الفارينكلين والبوبروبيون بتعطي نسب نجاح عالية. اسأل عنها بعيادة الإقلاع.</p>';
  }

  // ---- how to quit
  const ap = APPROACHES[r.approach];
  const schedRows = r.schedule.map((s) => {
    const what = s.targets.map(targetText).join(' · ');
    return `<div><span>${s.label}</span><b>${what}</b>${s.nic != null ? `<small>ليكويد ${s.nic} ملغ/مل</small>` : ''}</div>`;
  }).join('');
  const approachSec = `<section class="rp-sec">
    <h3>طريقتك للترك: ${ap.t}</h3>
    <p class="rp-lead">${ap.d}</p>
    ${schedRows ? `<div class="sched">${schedRows}<div class="quit"><span>يوم الترك</span><b>${dateAr(r.quitAt)}</b></div></div>` : ''}
    ${r.approach !== 'abrupt' ? '<p class="small">خلال التخفيف سجّل كل وحدة بالتطبيق، وأجّل أول وحدة الصبح، ولا تدخّن نصها وتحسبها أقل. وإذا قدرت توقف قبل الموعد، وقف.</p>' : ''}
    ${r.meds.length ? `<h4>إيمتى تبلّش العلاج</h4><ul class="tips">${r.meds.map((m) => `<li>${m}</li>`).join('')}</ul>` : ''}
  </section>`;

  // ---- timeline
  const top = r.triggers[0]?.label;
  const phases = [];
  if (r.future) {
    phases.push({ t: 'قبل يوم الترك', sub: dateAr(r.quitAt), items: [
      tx.form !== 'none' && !blocked ? 'اشتري العلاج البديل وخلّيه جاهز.' : '',
      'خبّر 2–3 ناس قريبين منك إنك رح تترك، واطلب منهم ما يدخّنوا جنبك.',
      'ليلة الترك: شيل كل السجاير والولاعات والطفّايات والفيب من البيت والسيارة.',
      'اقرأ خطتك للحظات الصعبة تحت، وقرر شو رح تعمل أول ساعة بيوم الترك.',
      r.approach !== 'abrupt' ? 'امشي على جدول التخفيف، وسجّل كل وحدة بالتطبيق.' : '',
    ] });
  }
  const nl = (f, t) => (blocked ? [] : nrtLine(tx, f, t));
  phases.push({ t: 'الأيام 1–3', sub: 'ذروة الانسحاب', items: ['كل رغبة بتخلص خلال دقايق. اضغط «عندي رغبة» وخلّيها تعدّي.', ...nl(1, 1), top ? `ابعد عن لحظة «${top}» قد ما بتقدر، أو غيّر شكلها.` : '', 'اشرب مي كتير، وخفّف القهوة للنص.'] });
  phases.push({ t: 'الأسبوع 1–2', sub: 'كسر العادة', items: ['غيّر روتينك بالأماكن والأوقات اللي كنت تدخّن فيها.', 'القاعدة الذهبية: ولا سحبة. حتى سحبة وحدة بترجّع الرغبة بقوة.', ...nl(1, 2)] });
  phases.push({ t: 'الأسبوع 3–4', sub: 'المواقف الاجتماعية', items: ['الرغبات بتقل، بس السهرات والطلعات بتضل صعبة. جهّز حالك قبلها.', ...nl(3, 4)] });
  phases.push({ t: 'الأسبوع 5–8', sub: 'الثقة الزايدة', items: ['«وحدة بس» هي أشهر سبب للرجوع. لا تجرّبها.', ...nl(5, 8)] });
  phases.push({ t: 'الأسبوع 9–12', sub: 'إنهاء العلاج', items: [tx.form !== 'none' && !blocked ? 'كمّل العلاج لآخره ونزّل تدريجياً، لا توقفه فجأة.' : 'خلّي خطتك للحظات الصعبة جاهزة دايماً.', ...nl(9, 12)] });
  phases.push({ t: 'بعد 3 شهور', sub: 'الحفاظ', items: ['كافئ حالك من المصاري اللي وفّرتها.', 'إذا زلّيت، سجّلها وارجع فوراً. الزلّة مش فشل.', 'بعد 30 يوم بتصير حارس وبتقدر تفزع لغيرك.'] });

  // ---- withdrawal (what they felt before first)
  const felt = r.withdrawal.length ? r.withdrawal : WITHDRAWAL.filter((w) => ['irritable', 'sleep', 'appetite', 'cravings'].includes(w.id));

  // ---- environment
  const env = [];
  if (a.homeSmokers) env.push('في حدا بيدخّن بالبيت: اطلب منه ما يدخّن جوّا ولا جنبك، وما يترك دخانه قدامك.');
  if (a.friends === 'most') env.push('أغلب أصحابك بيدخّنوا: خبّرهم إنك تارك، وأول كم أسبوع خلّي الطلعات بأماكن ما فيها تدخين.');
  if (a.friends === 'some') env.push('بعض أصحابك بيدخّنوا: اقعد جنب اللي ما بيدخّنوا، وخلّي معك علكة.');
  if ((a.places || []).includes('car')) env.push('السيارة: نظّفها من الريحة وشيل الطفّاية والولاعة منها.');
  if ((a.places || []).includes('home_in')) env.push('البيت: هوّي الغرف واغسل الأغطية، الريحة لحالها بتذكّرك.');

  const refer = [];
  if (blocked) refer.push('وضعك الصحي بيحتاج دكتور قبل العلاج البديل.');
  if (r.dep.level >= 3) refer.push('اعتمادك عالي.');
  if (a.attempts === '3+') refer.push('حاولت أكتر من مرتين قبل.');
  if ((a.conditions || []).includes('mental')) refer.push('عندك حالة نفسية بتتعالج منها.');
  if (r.confidence < 4) refer.push('ثقتك قليلة، والدعم المباشر بيفرق.');

  const monthly = r.perDay * 30.4;
  const yearly = r.perDay * 365;

  return `
  <header class="rp-head">
    <p class="rp-kicker">تقرير الإقلاع · ${dateAr(a.assessedAt || Date.now())}</p>
    <h2>${a.name ? `خطة ${esc(a.name)}` : 'خطتك'} لتطفّيها</h2>
    <p class="rp-line">${amount}${a.years ? ` · ${YEARS[a.years]}` : ''}</p>
    <div class="rp-tiles">
      <div><span>الاعتماد</span><b>${levelLabel}</b></div>
      <div><span>العلاج</span><b>${form.t}</b></div>
      <div><span>${r.future ? 'يوم الترك' : 'تركت'}</span><b>${dateAr(r.quitAt)}</b></div>
    </div>
  </header>

  <section class="rp-sec">
    <h3>مستوى اعتمادك على النيكوتين</h3>
    ${depRows.join('')}
    <p class="rp-lead">${LEVEL_TEXT[r.dep.level]}</p>
  </section>

  <section class="rp-sec">
    <h3>كم بيكلّفك</h3>
    <div class="cost">
      <div><strong>${money(r.perDay)}</strong><span>د.أ باليوم</span></div>
      <div><strong>${whole(monthly)}</strong><span>د.أ بالشهر</span></div>
      <div class="big"><strong>${whole(yearly)}</strong><span>د.أ بالسنة</span></div>
    </div>
  </section>

  <section class="rp-sec">
    <h3>العلاج المقترح: ${form.t}</h3>
    <p class="rp-lead">${form.d}</p>
    ${txBody}
  </section>

  ${approachSec}

  <section class="rp-sec">
    <h3>أدوية بوصفة الدكتور</h3>
    <p class="rp-lead">في كمان أدوية بوصفة طبية: الفارينكلين والسيتيسين بيخففوا الرغبة ومتعة التدخين، والبوبروبيون بيخفف أعراض الانسحاب. منظمة الصحة العالمية بتعتبرهم علاجات معتمدة، والإرشادات البريطانية بتحط الفارينكلين والسيتيسين مع العلاج البديل المشترك من أنجح الخيارات.</p>
    <p class="small">بيحتاجوا تقييم ووصفة ومتابعة دكتور، وما بتنوصف للكل. اسأل عنهم بعيادة الإقلاع، خصوصاً إذا اعتمادك عالي أو جرّبت قبل وما زبط.</p>
  </section>

  <section class="rp-sec">
    <h3>خطتك أسبوع بأسبوع</h3>
    <ol class="phases">${phases.map((p) => `<li><div class="ph-t"><b>${p.t}</b><span>${p.sub}</span></div><ul>${p.items.filter(Boolean).map((i) => `<li>${i}</li>`).join('')}</ul></li>`).join('')}</ol>
  </section>

  ${r.triggers.length ? `<section class="rp-sec">
    <h3>لحظاتك الصعبة وخطة لكل وحدة</h3>
    <div class="trg">${r.triggers.map((t) => `<div><b>${t.label}</b><p>${t.plan}</p></div>`).join('')}</div>
  </section>` : ''}

  <section class="rp-sec">
    <h3>شو ممكن تحس فيه</h3>
    <p class="rp-lead">${r.withdrawal.length ? 'هاي الأعراض اللي حسّيت فيها بمحاولاتك قبل، وكيف تتعامل معها:' : 'أشهر أعراض الانسحاب، وكلها مؤقتة:'}</p>
    <div class="trg">${felt.map((w) => `<div><b>${w.label}</b><p>${w.tip}</p></div>`).join('')}</div>
  </section>

  ${env.length ? `<section class="rp-sec"><h3>محيطك</h3><ul class="tips">${env.map((e) => `<li>${e}</li>`).join('')}</ul></section>` : ''}

  <section class="rp-sec">
    <h3>دافعك</h3>
    <div class="mot">
      <div><span>قديش مهم</span><div class="bar"><i style="--p:${r.importance / 10}"></i></div><b>${r.importance}/10</b></div>
      <div><span>قديش واثق</span><div class="bar"><i style="--p:${r.confidence / 10}"></i></div><b>${r.confidence}/10</b></div>
    </div>
    <p class="rp-lead">${r.motivation}</p>
    ${(a.reasons || []).length ? `<div class="chips-static">${a.reasons.map((x) => `<span>${REASONS[x] || x}</span>`).join('')}</div>` : ''}
  </section>

  ${r.safe.notes.length ? `<section class="rp-sec"><h3>ملاحظات صحية</h3><ul class="notes">${r.safe.notes.map((n) => `<li>${n}</li>`).join('')}</ul></section>` : ''}

  ${refer.length ? `<section class="rp-sec rp-refer">
    <h3>بنصحك تزور عيادة إقلاع</h3>
    <ul>${refer.map((x) => `<li>${x}</li>`).join('')}</ul>
    <p>العيادة بتعطيك متابعة، وممكن أدوية بوصفة. في عيادات إقلاع بمراكز وزارة الصحة وبمركز الحسين للسرطان. خذ معك هالتقرير.</p>
  </section>` : ''}

  <section class="rp-sec rp-sources">
    <h3>المصادر</h3>
    <ul>${r.sources.map((x) => `<li>${x}</li>`).join('')}</ul>
  </section>

  <p class="rp-foot">تقرير إرشادي مبني على مقاييس علمية (فاغرستروم، Penn State) وإرشادات نشرات العلاج البديل ومراجعات كوكرين. مش بديل عن استشارة الدكتور أو الصيدلاني. ${products.map((p) => PRODUCT[p]).join(' و')}.</p>`;
}

// ---------------------------------------------------------------- PDF
// Each block of the report is rendered to an image at a fixed width, then laid
// out on A4 pages so a section only splits when it is taller than a page.
const LIBS = {
  html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
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
        <button class="btn btn-soft rp-pdf" type="button">نزّل PDF</button>
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
      setTimeout(() => { pdfBtn.disabled = false; pdfBtn.textContent = 'نزّل PDF'; }, 3000);
    };
    root.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !first) close(); });
    setTimeout(() => root.querySelector('.rp-done').focus({ preventScroll: true }), 60);
  });
}
