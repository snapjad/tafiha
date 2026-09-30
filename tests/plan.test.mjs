import { ftnd, psecdi, argilehIndex, buildReport, patchStepFor, planWeek, gumStageFor } from '../js/plan.js';
let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
  if (!ok) fails++;
};

// Fagerström: 20/day, first within 5 min, hard in forbidden places, first is hardest, more in morning, not when ill
const heavy = { cig_perDay: 20, ftnd_ttfc: '5', ftnd_forbidden: true, ftnd_hate: 'first', ftnd_morning: true, ftnd_ill: false };
eq('FTND score', ftnd(heavy).score, 7);
eq('FTND label', ftnd(heavy).label, 'عالي');
eq('HSI', [ftnd(heavy).hsi, ftnd(heavy).hsiLabel], [4, 'متوسط']);
eq('FTND light smoker', ftnd({ cig_perDay: 8, ftnd_ttfc: 'more', ftnd_hate: 'other' }).score, 0);
eq('FTND 31+/day adds 3', ftnd({ cig_perDay: 35, ftnd_ttfc: 'more' }).score, 3);
eq('FTND max', ftnd({ cig_perDay: 40, ftnd_ttfc: '5', ftnd_forbidden: true, ftnd_hate: 'first', ftnd_morning: true, ftnd_ill: true }).score, 10);
// bands: 0–2 very low, 3–4 low, 5 medium, 6–7 high, 8–10 very high
const at = (score) => { // build answers that add up to an exact score
  const a = { cig_perDay: 10, ftnd_ttfc: 'more', ftnd_hate: 'other' };
  let left = score;
  const take = (k, v, pts) => { if (left >= pts) { a[k] = v; left -= pts; } };
  take('ftnd_ttfc', '5', 3); take('cig_perDay', 35, 3); take('ftnd_forbidden', true, 1);
  take('ftnd_hate', 'first', 1); take('ftnd_morning', true, 1); take('ftnd_ill', true, 1);
  return ftnd(a);
};
eq('FTND band edges', [2, 3, 4, 5, 6, 7, 8, 10].map((n) => `${at(n).score}:${at(n).label}`), ['2:منخفض جداً', '3:منخفض', '4:منخفض', '5:متوسط', '6:عالي', '7:عالي', '8:عالي جداً', '10:عالي جداً']);

// Penn State e-cig index
const vHeavy = { vp_times: '20-29', vp_ttfu: '5', vp_night: true, vp_nights: '2-3', vp_hard: true, vp_crave: true, vp_urge: 'high', vp_forbidden: true, vp_irritable: true, vp_anxious: true };
eq('PSECDI heavy', [psecdi(vHeavy).score, psecdi(vHeavy).label], [18, 'عالي']);
eq('PSECDI nights ignored without night waking', psecdi({ ...vHeavy, vp_night: false }).score, 16);
eq('PSECDI light', [psecdi({ vp_times: '0-4', vp_ttfu: 'more', vp_urge: 'none' }).score, psecdi({ vp_times: '0-4', vp_ttfu: 'more' }).label], [0, 'بدون اعتماد']);
eq('PSECDI medium', psecdi({ vp_times: '10-14', vp_ttfu: '30', vp_crave: true, vp_urge: 'mid', vp_hard: true, vp_irritable: true, vp_anxious: true }).label, 'متوسط');

// Argileh approximate index
eq('argileh daily, long, 3 signs', [argilehIndex({ ar_perWeek: 7, ar_minutes: 'long', ar_alone: true, ar_first: true, ar_stopHard: true }).score, argilehIndex({ ar_perWeek: 7, ar_minutes: 'long', ar_alone: true, ar_first: true, ar_stopHard: true }).label], [6, 'عالي']);
eq('argileh weekly social', argilehIndex({ ar_perWeek: 1, ar_minutes: 'mid' }).label, 'منخفض');

// Treatment choices
const base = { products: ['cig'], cig_perDay: 20, cig_packSize: 20, cig_packPrice: 2.85, conditions: [], meds: [], age: '25-34', pregnancy: 'no', importance: 9, confidence: 6, attempts: '1-2' };
const r1 = buildReport({ ...base, ...heavy, nrt_now: 'none', nrt_pref: 'advise' });
eq('advise, high dependence → patch + gum', r1.tx.form, 'both');
eq('>10/day → 21 mg step-down', r1.tx.patchSteps.map((x) => x.mg), [21, 14, 7]);
eq('first cigarette ≤30 min → 4 mg gum', r1.tx.gumMg, 4);
eq('cost per day', r1.perDay, 2.85);
const r2 = buildReport({ ...base, cig_perDay: 8, ftnd_ttfc: 'more', ftnd_hate: 'other', nrt_now: 'none', nrt_pref: 'advise' });
eq('advise, very low dependence → no NRT', r2.tx.form, 'none');
const r2b = buildReport({ ...base, cig_perDay: 8, ftnd_ttfc: '60', ftnd_forbidden: true, ftnd_hate: 'first', ftnd_morning: true, nrt_now: 'none', nrt_pref: 'advise' });
eq('light smoker, some dependence → gum 2 mg, 14 mg patch if chosen', [r2b.tx.form, r2b.tx.gumMg, r2b.tx.patchSteps[0].mg], ['gum', 2, 14]);
const r3 = buildReport({ ...base, ...heavy, conditions: ['skin'], nrt_now: 'none', nrt_pref: 'patch' });
eq('skin condition swaps patch for gum', r3.tx.form, 'gum');
const r4 = buildReport({ ...base, ...heavy, conditions: ['dentures'], nrt_now: 'none', nrt_pref: 'gum' });
eq('dentures swap gum for patch', r4.tx.form, 'patch');
const r5 = buildReport({ ...base, ...heavy, pregnancy: 'pregnant', nrt_now: 'none', nrt_pref: 'advise' });
eq('pregnancy → see a doctor first', r5.safe.stop.length > 0 && r5.refer, true);
const r6 = buildReport({ ...base, ...heavy, conditions: ['cardiac_recent'], nrt_now: 'none', nrt_pref: 'advise' });
eq('recent heart attack → see a doctor first', r6.safe.stop.length, 1);
const r7 = buildReport({ products: ['argileh'], ar_perWeek: 2, ar_price: 3, ar_minutes: 'mid', conditions: [], meds: [], nrt_now: 'none', nrt_pref: 'patch', ar_stopHard: true });
eq('weekly argileh: patch → gum when needed', r7.tx.form, 'gum');
const r8 = buildReport({ products: ['vape'], vp_price: 8, vp_days: 4, vp_nicotine: 50, ...vHeavy, conditions: [], meds: [], nrt_now: 'none', nrt_pref: 'advise' });
eq('heavy vaper, 50 mg/ml → patch 21 + gum 4', [r8.tx.form, r8.tx.patchSteps[0].mg, r8.tx.gumMg], ['both', 21, 4]);
eq('vape cost per day', r8.perDay, 2);
const r9 = buildReport({ ...base, ...heavy, meds: ['antipsychotic'], nrt_now: 'gum', gum_mg: 4 });
eq('medication warning', r9.safe.notes.some((n) => n.includes('الأدوية')), true);
eq('already on gum keeps gum', r9.tx.form, 'gum');

// Plan timing
const Q = new Date(2026, 8, 27).getTime();
eq('week 1 on quit day', planWeek(Q, Q + 3600000), 1);
eq('week 2 after 7 days', planWeek(Q, Q + 7 * 864e5 + 1), 2);
eq('before quit day', planWeek(Q, Q - 1), 0);
const steps = [{ mg: 21, weeks: 6 }, { mg: 14, weeks: 2 }, { mg: 7, weeks: 2 }];
eq('patch week 6 → 21', patchStepFor(steps, 6).mg, 21);
eq('patch week 7 → 14', patchStepFor(steps, 7).mg, 14);
eq('patch week 10 → 7', patchStepFor(steps, 10).mg, 7);
eq('patch week 11 → done', patchStepFor(steps, 11), null);
eq('gum week 8 stage', gumStageFor(8).weeks, '7–9');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
