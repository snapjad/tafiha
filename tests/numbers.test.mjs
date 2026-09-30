import * as S from '../js/store.js';
let fails = 0;
const eq = (name, got, want, tol = 1e-6) => {
  const ok = typeof want === 'number' ? Math.abs(got - want) <= tol : got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(got)}${ok ? '' : `  (want ${JSON.stringify(want)})`}`);
  if (!ok) fails++;
};
const DAY = S.DAY, H = 3600000, NOW = new Date(2026, 8, 30, 15, 0).getTime();

// Jad: pack a day at 2.85, quit 3.5 days ago, gum 6 JD / 30
const jad = S.createState({ name: 'جاد', habits: ['cig'], quitAt: NOW - 3.5 * DAY,
  cig: { perDay: 20, packSize: 20, packPrice: 2.85 }, nrt: { mg: 4, packPrice: 6, packCount: 30, dailyMax: 15 } });
jad.nrt.logs = [NOW - 4 * DAY, NOW - 3.8 * DAY, NOW - 5 * H, NOW - 4 * H, NOW - 2 * H, NOW - 1 * H];
eq('cost per day', S.dailyCost(jad), 2.85);
eq('gum price', S.gumPrice(jad), 0.2);
eq('gross saved (3.5 days)', S.money(jad, NOW).gross, 9.975);
eq('gum counted only after quit (4 × 0.20)', S.money(jad, NOW).nrt, 0.8);
eq('net saved', S.money(jad, NOW).net, 9.175);
eq('cigarettes not smoked', S.avoided(jad, NOW).units, 70);
eq('packs not bought', S.avoided(jad, NOW).packs, 3.5);
eq('gum today', S.gumToday(jad, NOW), 4);
jad.nrt.packs = [NOW - 4.5 * DAY];
eq('gum left in pack (30 - 6 chewed)', S.gumStock(jad), 24);

// one slip = one cigarette
jad.slips.push({ at: NOW - 1 * DAY, n: 1 });
eq('after a slip: cigarettes', S.avoided(jad, NOW).units, 69);
eq('after a slip: gross', S.money(jad, NOW).gross, 9.975 - 0.1425);

// starting over resets money, gum and slips
jad.slips.push({ at: NOW, reset: true });
jad.quitAt = NOW;
eq('restart: gross', S.money(jad, NOW).gross, 0);
eq('restart: old gum not charged', S.money(jad, NOW).nrt, 0);
eq('restart: old slip ignored', S.slipUnits(jad), 0);

// vape: disposable, 8 JD, lasts 4 days, 6000 puffs; 10 days clean
const v = S.createState({ habits: ['vape'], quitAt: NOW - 10 * DAY, vape: { kind: 'disposable', unitPrice: 8, daysPerUnit: 4, puffs: 6000 } });
eq('vape cost per day', S.dailyCost(v), 2);
eq('vape saved', S.money(v, NOW).net, 20);
eq('vape puffs avoided', S.avoided(v, NOW).units, 15000);
eq('vape devices not bought', S.avoided(v, NOW).packs, 2.5);
eq('vape milestones have no CO/smell items', S.milestonesFor(v).some((m) => m.smoke), false);

// argileh 3 heads a week at 3.5
const a = S.createState({ habits: ['argileh'], quitAt: NOW - 7 * DAY, argileh: { perWeek: 3, price: 3.5 } });
eq('argileh saved in a week', S.money(a, NOW).net, 10.5);
eq('argileh heads avoided', S.avoided(a, NOW).units, 3);

// cigarettes + vape together add up
const both = S.createState({ habits: ['cig', 'vape'], quitAt: NOW - 1 * DAY });
eq('two habits: cost per day', S.dailyCost(both), 2.85 + 2);

// milestones
const nm = S.nextMilestone(S.createState({ habits: ['cig'], quitAt: NOW - 3.5 * DAY }), NOW);
eq('next milestone at 3.5 days', nm.name, 'أسبوع');
eq('progress to it', nm.progress, 0.125);
eq('time left', S.duration(nm.left), '3 أيام و12 ساعة');

// Arabic wording
eq('1 minute', S.duration(60000), 'دقيقة');
eq('2 hours', S.duration(2 * H), 'ساعتين');
eq('90 minutes', S.duration(90 * 60000), 'ساعة و30 دقيقة');
eq('11 days', S.duration(11 * DAY), '11 يوم');
eq('label 3', S.word(3, 'يوم', 'أيام'), 'أيام');
eq('label 11', S.word(11, 'يوم', 'أيام'), 'يوم');

// per-day buckets
const days = S.perDayCounts([NOW - 1 * H, NOW - 2 * H, NOW - 1 * DAY], NOW);
eq('today bucket', days[6].n, 2);
eq('yesterday bucket', days[5].n, 1);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
