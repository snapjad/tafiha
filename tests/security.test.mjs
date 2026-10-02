// Journeys the app itself writes must always pass the data checks in security.js;
// a false alarm there would lock someone out of their own app.
import { assertState, assertAssessment } from '../js/security.js';
import * as S from '../js/store.js';
import { buildReport } from '../js/plan.js';
import { touch, snapshot, merge } from '../js/merge.js';

let fails = 0;
const check = (name, fn) => {
  let ok = false;
  try { ok = fn() !== false; } catch (e) { ok = false; }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) fails++;
};
const rejects = (fn) => { try { fn(); return false; } catch (e) { return true; } };

const now = Date.now();
const vaper = {
  name: 'سارة', age: '18-24', pregnancy: 'no', products: ['vape'], years: '1-5',
  vp_kind: 'disposable', vp_price: 8, vp_days: 4, vp_puffs: 6000, vp_nicotine: 50,
  vp_times: '20-29', vp_ttfu: '5', vp_night: true, vp_nights: '2-3', vp_hard: true, vp_crave: true,
  vp_urge: 'high', vp_forbidden: true, vp_irritable: true, vp_anxious: true,
  attempts: '0', triggers: ['bored', 'phone', 'night'], homeSmokers: false, friends: 'some',
  importance: 7, confidence: 3, reasons: ['freedom', 'money'], conditions: [], meds: [], rx: 'none',
  nrt_now: 'none', nrt_pref: 'advise', quitMode: 'future', approach: 'gradual-long',
  futureDate: now + 5 * 864e5, quitAt: now + 84 * 864e5, assessedAt: now,
};
const smoker = {
  name: '', age: '25-34', pregnancy: 'no', products: ['cig', 'argileh'], years: '6-10',
  cig_perDay: 20, cig_packPrice: 2.85, cig_packSize: 20, ar_perWeek: 3, ar_price: 3.5, ar_minutes: 'long',
  ftnd_ttfc: '5', ftnd_forbidden: true, ftnd_hate: 'first', ftnd_morning: true, ftnd_ill: false,
  attempts: '1-2', longest: '1-4w', methods: ['gum'], relapse: ['stress'], withdrawal: ['irritable', 'sleep'],
  triggers: ['coffee', 'meal'], places: ['car'], homeSmokers: false, friends: 'most',
  importance: 9, confidence: 6, reasons: ['health'], conditions: [], meds: [], rx: 'none',
  nrt_now: 'both', gum_mg: 4, gum_max: 15, gum_price: 6, gum_count: 30, patch_mg: 21, patch_price: 12, patch_count: 7,
  quitMode: 'done', when: 'custom', pastDate: now - 3 * 864e5, quitAt: now - 3 * 864e5, assessedAt: now,
};

check('interview answers pass (vape, cut-down plan)', () => assertAssessment(vaper));
check('interview answers pass (cigarettes + argileh, gum + patch)', () => assertAssessment(smoker));

function lived(a) {
  let s = S.createFromAssessment(a, buildReport(a).tx);
  let snap = snapshot(null);
  snap = touch(s, snap);
  s.nrt.logs.push(now - 3600e3, now - 1800e3);
  s.nrt.packs.push(now - 864e5);
  if (s.patch) { s.patch.logs.push(now - 7200e3); s.patch.packs.push(now - 864e5); }
  s.smokes = [now - 600e3];
  s.cravings.push({ at: now - 900e3, dur: 180000, outcome: 'beaten', before: 8, after: 3, trigger: 'coffee', gum: true });
  s.cravings.push({ at: now - 500e3, dur: 60000, outcome: 'beaten' });
  s.slips.push({ at: now - 400e3, n: 1 }, { at: now - 300e3, reset: true });
  s.goal = { title: 'سفرة للعقبة', amount: 150 };
  s.prep = { ...(s.prep || {}), tell: true, clean: false };
  s.nrt.logs.pop(); // an undo leaves a tombstone
  touch(s, snap);
  return s;
}
const a = lived(vaper);
const b = lived(smoker);
check('a lived-in vape journey passes', () => assertState(a));
check('a lived-in smoker journey passes', () => assertState(b));
check('two devices merged still pass', () => assertState(merge(a, b)));
check('a journey after a re-take passes', () => assertState(S.createFromAssessment(smoker, buildReport(smoker).tx, b)));
check('a re-take preserves deposits, carried savings and deletion history', () => {
  const saved = structuredClone(b);
  S.addDeposit(saved, { cents: 285, at: now }, now);
  saved.savingsCarryCents = 900;
  const result = S.createFromAssessment(smoker, buildReport(smoker).tx, saved);
  assertState(result);
  return JSON.stringify(result.deposits) === JSON.stringify(saved.deposits)
    && result.savingsCarryCents === 900
    && JSON.stringify(result._del) === JSON.stringify(saved._del);
});
check('saved and loaded through JSON still passes', () => assertState(JSON.parse(JSON.stringify(a))));

// the very first version had no assessment, patch, prep or smokes
const first = {
  v: 1, name: 'جاد', quitAt: now - 5 * 864e5,
  habits: {
    cig: { active: true, perDay: 20, packSize: 20, packPrice: 2.85 },
    vape: { active: false, kind: 'disposable', unitPrice: 8, daysPerUnit: 4, puffs: 6000 },
    argileh: { active: false, perWeek: 3, price: 3.5 },
  },
  nrt: { active: true, mg: 4, packPrice: 6, packCount: 30, dailyMax: 15, packs: [now - 4 * 864e5], logs: [now - 864e5] },
  cravings: [{ at: now - 864e5, dur: 300000, outcome: 'beaten', rounds: 4 }],
  slips: [],
  goal: null,
};
check('a journey from the first version passes', () => assertState(first));

check('a prototype-polluting key is refused', () => rejects(() => assertState(JSON.parse('{"__proto__":{"x":1}}'))));
check('script text in an answer id is refused', () => rejects(() => assertAssessment({ ...vaper, friends: '<img onerror=alert(1)>' })));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
