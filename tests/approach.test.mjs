// Quit approaches: abrupt vs gradual schedules, and when medicines start.
import { chooseApproach, gradualQuitAt, reductionSchedule, stepAt, buildReport } from '../js/plan.js';

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
  if (!ok) fails++;
};
const DAY = 86400000;
const START = new Date(2026, 9, 2, 10, 0).getTime(); // Fri 2 Oct, 10:00

// choosing an approach
eq('already quit → abrupt', chooseApproach({ quitMode: 'done', approach: 'gradual-long' }), 'abrupt');
eq('picked short gradual', chooseApproach({ products: ['cig'], quitMode: 'future', approach: 'gradual-short' }), 'gradual-short');
eq('cytisine forces abrupt (quit within 5 days)', chooseApproach({ quitMode: 'future', approach: 'gradual-long', rx: 'cytisine' }), 'abrupt');
eq('low confidence never automatically delays quitting 12 weeks', chooseApproach({ quitMode: 'future', approach: 'advise', confidence: 3 }), 'abrupt');
eq('advise, confident → abrupt', chooseApproach({ quitMode: 'future', approach: 'advise', confidence: 7 }), 'abrupt');

// quit day of a gradual plan
eq('short plan quits on day 15 at 08:00', new Date(gradualQuitAt('gradual-short', START)).toString().slice(0, 21), 'Fri Oct 16 2026 08:00');
eq('long plan quits after 12 weeks', Math.round((gradualQuitAt('gradual-long', START) - new Date(2026, 9, 2).getTime()) / DAY * 10) / 10, 84.3);

// cigarettes: 20 a day
const cig = { products: ['cig'], cig_perDay: 20, rx: 'varenicline' };
eq('short: half, then a quarter (Lindson-Hawley)', reductionSchedule(cig, 'gradual-short', START).map((s) => s.targets[0].value), [10, 5]);
const long = reductionSchedule(cig, 'gradual-long', START).map((s) => s.targets[0].value);
eq('long: weekly allowances', long, [18, 15, 13, 10, 9, 8, 7, 5, 4, 3, 2, 2]);
eq('long: 50% by week 4 (varenicline label)', long[3], 10);
eq('long: a further 50% by week 8', long[7], 5);
eq('never below 1 a day before the quit day', Math.min(...reductionSchedule({ ...cig, cig_perDay: 4 }, 'gradual-long', START).map((s) => s.targets[0].value)), 1);

// vape: sessions a day and nicotine strength
const vape = { products: ['vape'], vp_times: '20-29', vp_kind: 'liquid', vp_nicotine: 20 };
const vs = reductionSchedule(vape, 'gradual-long', START);
eq('no cigarette-derived 12-week vape schedule', vs, []);
eq('no cigarette-derived two-week vape schedule', reductionSchedule(vape, 'gradual-short', START), []);
eq('no generic long plan without varenicline', reductionSchedule({ ...cig, rx: 'none' }, 'gradual-long', START), []);

// argileh: heads a week
eq('no cigarette-derived argileh schedule', reductionSchedule({ products: ['argileh'], ar_perWeek: 3 }, 'gradual-long', START), []);

// which step applies today
const sched = reductionSchedule(cig, 'gradual-short', START);
eq('day 3 is week 1', stepAt(sched, START + 3 * DAY).targets[0].value, 10);
eq('day 9 is week 2', stepAt(sched, START + 9 * DAY).targets[0].value, 5);
eq('after the last step: none (quit day)', stepAt(sched, START + 15 * DAY), null);

// treatment details
const base = { products: ['cig'], cig_perDay: 25, cig_packSize: 20, cig_packPrice: 2.85, ftnd_ttfc: 'more', ftnd_hate: 'other', conditions: [], meds: [], nrt_now: 'none', nrt_pref: 'gum', quitMode: 'future', assessedAt: START, quitAt: START + 7 * DAY };
const low = buildReport({ ...base, approach: 'advise', confidence: 0 }, START);
eq('low confidence preserves chosen quit date', low.quitAt, base.quitAt);
eq('low confidence adds support referral', low.refer, true);
const old = buildReport({ ...base, approach: 'advise', confidence: 3, quitAt: START + 84 * DAY }, START);
eq('legacy auto-long plan requests review', !!old.reviewReason, true);
eq('legacy saved date is not silently overwritten', old.quitAt, START + 84 * DAY);
eq('legacy plan has no unsupported schedule', old.schedule, []);
const done = buildReport({ ...base, quitMode: 'done', approach: 'gradual-long', quitAt: START - 3 * DAY }, START);
eq('already quit has no countdown or reduction plan', [done.future, done.schedule.length, done.reviewReason], [false, 0, '']);
eq('more than 20 a day → 4 mg gum (UK SmPC)', buildReport(base, START).tx.gumMg, 4);
const vare = buildReport({ ...base, rx: 'varenicline', approach: 'abrupt' }, START);
eq('on varenicline: no NRT added', vare.tx.form, 'none');
eq('varenicline starts a week before the quit day', vare.meds.some((m) => m.includes('اليوم الثامن')), true);
const vareLong = buildReport({ ...base, rx: 'varenicline', approach: 'gradual-long' }, START);
eq('varenicline with the 12-week plan: 24 weeks in total', vareLong.meds.some((m) => m.includes('24 أسبوع')), true);
eq('gradual plan sets its own quit day', new Date(vareLong.quitAt).toDateString(), new Date(gradualQuitAt('gradual-long', START)).toDateString());
const patchPlan = buildReport({ ...base, nrt_pref: 'both', approach: 'gradual-short' }, START);
eq('patch preloading before the quit day', patchPlan.meds.some((m) => m.includes('تحميل مسبق')), true);
eq('gum between cigarettes while cutting down', patchPlan.meds.some((m) => m.includes('بين السجاير')), true);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
