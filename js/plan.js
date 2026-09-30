// طفّيها — the intake assessment: dependence scores, safety checks and the personal plan.
//
// Scales:
//   Cigarettes: Fagerström Test for Nicotine Dependence (FTND; Heatherton et al., 1991), 0–10.
//               Heaviness of Smoking Index (HSI) = time to first cigarette + cigarettes/day, 0–6.
//   Vape:       Penn State Electronic Cigarette Dependence Index (Foulds et al., 2015), 0–20.
//   Argileh:    no validated scale is used here; an approximate index (frequency, session length,
//               dependence signs), labelled as approximate in the report.
// Treatment guidance follows NRT product labels (patch step-down, gum strength by time to first
// cigarette) and Cochrane reviews (NRT, combination NRT). It is guidance, not a prescription.

const WEEK = 7 * 86400000;

// ---------------------------------------------------------------- scores
export function ftnd(a) {
  const cpd = Number(a.cig_perDay) || 0;
  const q1 = { 5: 3, 30: 2, 60: 1, more: 0 }[a.ftnd_ttfc] ?? 0;
  const q4 = cpd <= 10 ? 0 : cpd <= 20 ? 1 : cpd <= 30 ? 2 : 3;
  const score = q1 + (a.ftnd_forbidden ? 1 : 0) + (a.ftnd_hate === 'first' ? 1 : 0) + q4
    + (a.ftnd_morning ? 1 : 0) + (a.ftnd_ill ? 1 : 0);
  const band = score <= 2 ? 0 : score <= 4 ? 1 : score === 5 ? 2 : score <= 7 ? 3 : 4;
  const hsi = q1 + q4;
  return {
    score, max: 10, band,
    label: ['منخفض جداً', 'منخفض', 'متوسط', 'عالي', 'عالي جداً'][band],
    level: [0, 1, 2, 3, 3][band],
    hsi, hsiLabel: hsi <= 1 ? 'منخفض' : hsi <= 4 ? 'متوسط' : 'عالي',
  };
}

export function psecdi(a) {
  const times = { '0-4': 0, '5-9': 1, '10-14': 2, '15-19': 3, '20-29': 4, '30+': 4 }[a.vp_times] ?? 0;
  const first = { 5: 5, 15: 4, 30: 3, 60: 2, 120: 1, more: 0 }[a.vp_ttfu] ?? 0;
  const nights = a.vp_night ? ({ '0-1': 0, '2-3': 1, '4+': 2 }[a.vp_nights] ?? 0) : 0;
  const urge = { none: 0, mid: 1, high: 2 }[a.vp_urge] ?? 0;
  const score = times + first + (a.vp_night ? 1 : 0) + nights + (a.vp_hard ? 1 : 0) + (a.vp_crave ? 1 : 0)
    + urge + (a.vp_forbidden ? 1 : 0) + (a.vp_irritable ? 1 : 0) + (a.vp_anxious ? 1 : 0);
  const band = score <= 3 ? 0 : score <= 8 ? 1 : score <= 12 ? 2 : 3;
  return { score, max: 20, band, label: ['بدون اعتماد', 'منخفض', 'متوسط', 'عالي'][band], level: band };
}

export function argilehIndex(a) {
  const perWeek = Number(a.ar_perWeek) || 0;
  const freq = perWeek >= 7 ? 2 : perWeek >= 3 ? 1 : 0;
  const long = a.ar_minutes === 'long' ? 1 : 0;
  const signs = ['ar_alone', 'ar_first', 'ar_stopHard', 'ar_nervous', 'ar_priority'].filter((k) => a[k]).length;
  const score = freq + long + signs;
  const band = score <= 2 ? 0 : score <= 5 ? 1 : 2;
  return { score, max: 8, band, label: ['منخفض', 'متوسط', 'عالي'][band], level: [1, 2, 3][band], daily: perWeek >= 7 };
}

// ---------------------------------------------------------------- safety
export const CONDITIONS = [
  { id: 'cardiac_recent', label: 'جلطة قلبية أو دماغية بآخر أسبوعين', block: true },
  { id: 'cardiac_unstable', label: 'ذبحة صدرية مش مستقرة أو اضطراب نبض شديد', block: true },
  { id: 'bp', label: 'ضغط عالي مش مضبوط' },
  { id: 'diabetes', label: 'سكري' },
  { id: 'ulcer', label: 'قرحة بالمعدة أو ارتجاع قوي' },
  { id: 'skin', label: 'مشاكل جلد (إكزيما أو صدفية)' },
  { id: 'dentures', label: 'طقم أسنان أو مشاكل بالفك' },
  { id: 'mental', label: 'حالة نفسية بتتعالج منها (اكتئاب، قلق...)' },
];

export const MEDS = [
  { id: 'antipsychotic', label: 'كلوزابين أو أولانزابين' },
  { id: 'theophylline', label: 'ثيوفيلين (للربو)' },
  { id: 'insulin', label: 'إنسولين أو أدوية سكري' },
  { id: 'warfarin', label: 'وارفارين (مميّع دم)' },
];

function safety(a) {
  const cond = a.conditions || [];
  const meds = a.meds || [];
  const stop = [];
  const notes = [];
  if (a.age === 'u18') stop.push('عمرك أقل من 18: العلاج البديل بيكون بس بإشراف دكتور.');
  if (a.pregnancy === 'pregnant') stop.push('بالحمل: ترك الدخان من أهم الأشياء لصحتك وصحة الجنين، والعلاج البديل بيكون بس بعد ما تحكي مع دكتورتك.');
  if (a.pregnancy === 'breastfeeding') stop.push('بالرضاعة: احكي مع دكتورك قبل العلاج البديل، وغالباً بيفضّلوا الأنواع السريعة زي العلكة بعد الرضعة.');
  if (cond.includes('cardiac_recent') || cond.includes('cardiac_unstable')) stop.push('عندك حالة قلب حديثة أو مش مستقرة: لا تبلّش أي علاج بديل قبل ما يشوفك دكتور.');
  if (cond.includes('bp')) notes.push('الضغط مش مضبوط: خلّي دكتورك يتابعك وإنت عم تترك.');
  if (cond.includes('diabetes')) notes.push('السكري: راقب السكر أكتر أول أسابيع، لأن ترك الدخان والعلاج البديل ممكن يأثروا عليه.');
  if (cond.includes('ulcer')) notes.push('القرحة أو الارتجاع: العلكة ممكن تزيد الحرقة، فاللزقة غالباً أريح إلك.');
  if (cond.includes('skin')) notes.push('مشاكل الجلد: اللزقة ممكن تهيّج جلدك، فالعلكة أنسب.');
  if (cond.includes('dentures')) notes.push('طقم الأسنان أو الفك: العلكة ممكن تلزق أو توجع، فاللزقة أنسب.');
  if (cond.includes('mental')) notes.push('الحالة النفسية: ترك الدخان بيحسّن المزاج على المدى البعيد، بس خبّر دكتورك إنك تارك، ولا توقف أدويتك.');
  if (meds.length) notes.push('ترك الدخان بيغيّر مستوى بعض الأدوية بالدم (منها اللي اخترتها). احكي مع دكتورك أو الصيدلاني ليراجعوا الجرعة أول ما تترك.');
  return { stop, notes, noPatch: cond.includes('skin'), noGum: cond.includes('dentures') };
}

// ---------------------------------------------------------------- treatment
const GUM_ALONE = [
  { weeks: '1–6', text: 'حبة كل ساعة لساعتين (تقريباً 8–12 حبة باليوم)' },
  { weeks: '7–9', text: 'حبة كل ساعتين لـ 4 ساعات' },
  { weeks: '10–12', text: 'حبة كل 4 لـ 8 ساعات، وبعدين وقّفها' },
];

function treatment(a, dep, safe) {
  const products = a.products || [];
  const cig = products.includes('cig');
  const vape = products.includes('vape');
  const arg = products.includes('argileh');
  const cpd = Number(a.cig_perDay) || 0;
  const nic = Number(a.vp_nicotine) || 0;
  const arg_ = dep.argileh;

  // strong starting dose: >10 cigarettes/day, or equivalent dependence from vape/argileh
  const heavy = (cig && cpd > 10) || (vape && (dep.vape?.band >= 2 || nic >= 20)) || (arg && arg_?.daily && arg_?.band >= 1);
  // 4 mg gum when the first use is within 30 minutes of waking (label rule), or high dependence
  const early = (cig && ['5', '30'].includes(a.ftnd_ttfc)) || (vape && ['5', '15', '30'].includes(a.vp_ttfu));
  const gumMg = early || dep.level >= 3 ? 4 : 2;
  const patchSteps = heavy ? [{ mg: 21, weeks: 6 }, { mg: 14, weeks: 2 }, { mg: 7, weeks: 2 }] : [{ mg: 14, weeks: 6 }, { mg: 7, weeks: 2 }];

  const notes = [];
  let form = a.nrt_now && a.nrt_now !== 'none' ? a.nrt_now : a.nrt_pref || 'advise';
  const socialOnly = arg && !cig && !vape && !arg_?.daily;

  if (form === 'advise') {
    if (dep.level <= 0) form = 'none';
    else if (socialOnly) form = 'gum';
    else if (dep.level >= 2) form = 'both';
    else form = heavy ? 'patch' : 'gum';
  }
  if (form !== 'none' && socialOnly && form !== 'gum') {
    notes.push('بما إنك ما بتشرب أرجيلة كل يوم، اللزقة اليومية مش ضرورية. العلكة وقت الرغبة بتكفي.');
    form = 'gum';
  }
  if (safe.noPatch && (form === 'patch' || form === 'both')) {
    notes.push('بدّلنا اللزقة بالعلكة بسبب حالة الجلد.');
    form = 'gum';
  }
  if (safe.noGum && (form === 'gum' || form === 'both')) {
    notes.push('بدّلنا العلكة باللزقة بسبب الأسنان أو الفك. في كمان حبوب مص (lozenges) إذا توفرت.');
    form = 'patch';
  }
  if (dep.level >= 3 && (form === 'gum' || form === 'patch')) {
    notes.push('اعتمادك عالي، والجمع بين لزقة وعلكة أقوى من نوع واحد. فكّر فيها.');
  }
  if (form === 'none' && dep.level >= 1) {
    notes.push('اخترت بدون علاج. تمام، بس العلاج البديل بيرفع فرصة النجاح بشكل واضح، والخيار موجود أي وقت.');
  }

  const out = { form, notes, gumMg, patchSteps, gumSchedule: null, patchWeeks: 0 };
  if (form === 'patch' || form === 'both') out.patchWeeks = patchSteps.reduce((s, x) => s + x.weeks, 0);
  if (form === 'gum') out.gumSchedule = socialOnly ? [{ weeks: 'وقت الحاجة', text: 'حبة لما تجيك الرغبة أو قبل القعدة اللي بتتوقع فيها رغبة' }] : GUM_ALONE;
  if (form === 'both') out.gumSchedule = [{ weeks: 'مع اللزقة', text: 'حبة وقت الرغبة القوية بس، واللزقة بتغطي باقي اليوم' }];
  out.vapeTaper = vape && nic > 0 && form === 'none';
  return out;
}

// ---------------------------------------------------------------- behaviour
export const TRIGGERS = [
  { id: 'coffee', label: 'مع القهوة أو الشاي', plan: 'اشرب قهوتك بمكان جديد، وامسك الكاسة بالإيد اللي كنت تمسك فيها السيجارة، وخلّي جنبك مي.' },
  { id: 'meal', label: 'بعد الأكل', plan: 'قوم عن السفرة فوراً، اغسل سنانك أو امضغ علكة، وتمشّى 5 دقايق.' },
  { id: 'wake', label: 'أول ما أصحى', plan: 'اشرب كاسة مي قبل ما تقوم، غيّر ترتيب الصبح، وإذا عندك لزقة حطها أول إشي.' },
  { id: 'friends', label: 'مع الأصحاب', plan: 'خبّرهم إنك تارك قبل ما تطلع، اقعد بعيد عن اللي بيدخّنوا، وخلّي معك علكة.' },
  { id: 'stress', label: 'بالتوتر والضغط', plan: 'التدخين بريّح أعراض الانسحاب بس، مش التوتر نفسه. اضغط «عندي رغبة» وخذ 4 أنفاس عميقة.' },
  { id: 'bored', label: 'بالملل', plan: 'جهّز قائمة أشياء بتاخد 5 دقايق: مشي، رسالة لحدا، دوش، لعبة.' },
  { id: 'car', label: 'بالسيارة', plan: 'شيل الولاعة والطفّاية، نظّف ريحة السيارة، وحط جنبك علكة أو مكسرات.' },
  { id: 'work', label: 'بالشغل أو البريك', plan: 'غيّر مكان البريك، اطلع مع ناس ما بيدخّنوا، أو خلّيه مشي قصير.' },
  { id: 'phone', label: 'عالتلفون', plan: 'حط إشي بإيدك التانية وإنت عالتلفون: قلم، كرة ضغط، أو كاسة مي.' },
  { id: 'night', label: 'بالسهر', plan: 'أول أسبوعين نام بكير وخفّف السهرات الطويلة، لأنها من أكتر الأوقات اللي بيرجع فيها الناس.' },
];

export const WITHDRAWAL = [
  { id: 'irritable', label: 'عصبية', tip: 'طبيعية وبتخف خلال 2–4 أسابيع. خبّر اللي حواليك إنك تارك.' },
  { id: 'anxiety', label: 'قلق وتوتر', tip: 'التنفس البطيء بيساعد، ومع الوقت القلق بيصير أقل من أيام التدخين.' },
  { id: 'sleep', label: 'قلة نوم', tip: 'خفّف القهوة للنص، لأن جسمك بعد الترك بيصير يتأثر بالكافيين أكتر.' },
  { id: 'appetite', label: 'زيادة أكل', tip: 'طبيعي. جهّز سناك صحي ومي، وتحرّك شوي كل يوم.' },
  { id: 'focus', label: 'قلة تركيز', tip: 'بيتحسن خلال أسبوعين لـ 4. قسّم شغلك لقطع صغيرة.' },
  { id: 'mood', label: 'زعل أو اكتئاب', tip: 'إذا الزعل قوي أو طوّل، احكي مع دكتور. هاد مهم.' },
  { id: 'cravings', label: 'رغبة قوية', tip: 'كل رغبة بتخلص خلال دقايق. اضغط «عندي رغبة» وخلّيها تعدّي.' },
];

export const REASONS = { health: 'صحتي', family: 'عيلتي وولادي', money: 'المصاري', fitness: 'اللياقة', smell: 'الريحة والأسنان', freedom: 'الحرية من الاعتماد', faith: 'الدين', baby: 'الحمل أو الولاد', doctor: 'نصيحة الدكتور' };

// ---------------------------------------------------------------- report
export function buildReport(a, now = Date.now()) {
  const products = a.products || [];
  const dep = {};
  if (products.includes('cig')) dep.cig = ftnd(a);
  if (products.includes('vape')) dep.vape = psecdi(a);
  if (products.includes('argileh')) dep.argileh = argilehIndex(a);
  dep.level = Math.max(0, ...Object.values(dep).map((d) => d.level));
  const safe = safety(a);
  const tx = treatment(a, dep, safe);

  const perDay = (products.includes('cig') ? (a.cig_perDay / a.cig_packSize) * a.cig_packPrice : 0)
    + (products.includes('vape') ? a.vp_price / Math.max(0.1, a.vp_days) : 0)
    + (products.includes('argileh') ? (a.ar_perWeek * a.ar_price) / 7 : 0);

  const triggers = (a.triggers || []).map((id) => TRIGGERS.find((t) => t.id === id)).filter(Boolean);
  const withdrawal = (a.withdrawal || []).map((id) => WITHDRAWAL.find((w) => w.id === id)).filter(Boolean);

  const imp = Number(a.importance ?? 5);
  const conf = Number(a.confidence ?? 5);
  let motivation;
  if (imp >= 7 && conf >= 7) motivation = 'دافعك وثقتك عاليين، وهاد من أقوى المؤشرات على النجاح. يلا.';
  else if (conf < 5) motivation = 'ثقتك لسّا قليلة، وهاد طبيعي خصوصاً بعد محاولات قبل. الثقة بتيجي بالخطوات الصغيرة، والعلاج البديل مع الدعم بيرفعوا فرصتك كتير.';
  else if (imp < 5) motivation = 'الترك مش أولوية قوية عندك هلأ. ارجع لأسبابك وشوف قديش بتوفّر، وكل ما وضحت الفكرة بيسهل القرار.';
  else motivation = 'عندك دافع منيح. كل يوم بتعدّيه بيرفع ثقتك أكتر.';

  const attempts = a.attempts || '0';
  const refer = safe.stop.length > 0 || dep.level >= 3 || attempts === '3+' || (a.conditions || []).includes('mental') || conf < 4;

  const quitAt = a.quitAt || now;
  const future = quitAt > now + 60000;

  return { dep, safe, tx, perDay, triggers, withdrawal, motivation, refer, attempts, quitAt, future, importance: imp, confidence: conf };
}

// the week of the plan we are in (1-based), or 0 before the quit day
export function planWeek(quitAt, now = Date.now()) {
  if (now < quitAt) return 0;
  return Math.floor((now - quitAt) / WEEK) + 1;
}

// which patch strength applies this week
export function patchStepFor(steps, week) {
  let w = 0;
  for (let i = 0; i < steps.length; i++) {
    w += steps[i].weeks;
    if (week <= w) return { ...steps[i], index: i, endsWeek: w };
  }
  return null;
}

export function gumStageFor(week) {
  if (week <= 0) return null;
  if (week <= 6) return GUM_ALONE[0];
  if (week <= 9) return GUM_ALONE[1];
  if (week <= 12) return GUM_ALONE[2];
  return null;
}
