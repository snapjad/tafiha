// The report for a heavy vaper who picked a quit day 5 days from now and asked for advice.
import { reportHTML } from '../js/report.js';
import { buildReport } from '../js/plan.js';

let fails = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) fails++;
};

const a = {
  age: '18-24', pregnancy: 'no', products: ['vape'], years: '1-5',
  vp_kind: 'disposable', vp_price: 8, vp_days: 4, vp_puffs: 6000, vp_nicotine: 50,
  vp_times: '20-29', vp_ttfu: '5', vp_night: true, vp_nights: '2-3', vp_hard: true, vp_crave: true,
  vp_urge: 'high', vp_forbidden: true, vp_irritable: true, vp_anxious: true,
  attempts: '0', triggers: ['bored', 'phone', 'night'], homeSmokers: false, friends: 'some',
  importance: 7, confidence: 3, reasons: ['freedom', 'money'],
  conditions: [], meds: [], nrt_now: 'none', nrt_pref: 'advise',
  quitMode: 'future', quitAt: Date.now() + 5 * 864e5, assessedAt: Date.now(),
};

const r = buildReport(a);
check('advice for a heavy vaper is patch + gum', r.tx.form === 'both');
check('patch starts at 21 mg', r.tx.patchSteps[0].mg === 21);
check('gum is 4 mg (first use within 5 minutes)', r.tx.gumMg === 4);
check('quit day is in the future', r.future === true);
check('low confidence → suggest a clinic', r.refer === true);

const text = reportHTML(a).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
[
  'قبل يوم الترك', 'مقياس Penn State', 'لزقة + علكة', 'الأسبوع 1–6', 'اشتري العلاج البديل',
  'ثقتك قليلة', 'بنصحك تزور عيادة إقلاع', 'بالملل', 'عالتلفون', 'بالسهر', '2.00',
].forEach((k) => check(`report mentions «${k}»`, text.includes(k)));
check('no "undefined" or "NaN" anywhere', !/undefined|NaN/.test(text));

// someone who already quit with cigarettes, on gum
const b = {
  age: '25-34', pregnancy: 'no', products: ['cig'], years: '6-10', cig_perDay: 20, cig_packPrice: 2.85, cig_packSize: 20,
  ftnd_ttfc: '5', ftnd_forbidden: true, ftnd_hate: 'first', ftnd_morning: true, ftnd_ill: false,
  attempts: '1-2', longest: '1-4w', withdrawal: ['irritable', 'sleep'], triggers: ['coffee', 'meal'], places: ['car'],
  homeSmokers: false, friends: 'most', importance: 9, confidence: 6, reasons: ['health'], conditions: [], meds: [],
  nrt_now: 'gum', gum_mg: 4, gum_max: 15, gum_price: 6, gum_count: 30,
  quitMode: 'done', quitAt: Date.now() - 3 * 864e5, assessedAt: Date.now(),
};
const tb = reportHTML(b).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
check('gum schedule steps down inside weeks 5–8', tb.includes('ومن الأسبوع 7'));
check('cost per year 1,040', tb.includes('1,040'));
check('no "قبل يوم الترك" for someone who already quit', !tb.includes('قبل يوم الترك'));
check('no "undefined" or "NaN" (smoker)', !/undefined|NaN/.test(tb));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
