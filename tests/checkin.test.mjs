// The daily check-in: a run of days, broken by a gap or by a slip; merged across devices.
import { createState, checkIn, undoCheckIn, checkinStreak, checkedToday, startOfDay, DAY } from '../js/store.js';
import { merge } from '../js/merge.js';
import { assertState } from '../js/security.js';

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `: ${JSON.stringify(got)}  (want ${JSON.stringify(want)})`}`);
  if (!ok) fails++;
};
const noon = (d) => startOfDay(Date.now()) - d * DAY + 12 * 3600e3; // d days ago, midday
const s = createState({ quitAt: noon(10) });
eq('no check-ins: streak 0', checkinStreak(s, noon(0)), 0);
for (const d of [4, 3, 2, 1]) checkIn(s, noon(d));
eq('four days up to yesterday: streak 4 before today is in', checkinStreak(s, noon(0)), 4);
checkIn(s, noon(0));
eq('and today: 5', checkinStreak(s, noon(0)), 5);
eq('checked today', checkedToday(s, noon(0)), true);
checkIn(s, noon(0));
eq('checking in twice the same day counts once', s.checkins.length, 5);
s.slips.push({ at: noon(2), n: 1 });
eq('a slip two days ago breaks the run', checkinStreak(s, noon(0)), 2);
undoCheckIn(s, noon(0));
eq('undo today', [checkedToday(s, noon(0)), checkinStreak(s, noon(0))], [false, 1]);
const before = createState({ quitAt: noon(1) });
checkIn(before, noon(3));
eq('days before the quit day do not count', checkinStreak(before, noon(3)), 0);
const a = createState({ quitAt: noon(10) }); checkIn(a, noon(1));
const b = JSON.parse(JSON.stringify(a)); checkIn(b, noon(0));
eq('two devices merge their days', merge(a, b).checkins.length, 2);
eq('state with check-ins is valid', !!assertState(merge(a, b)), true);
const old = createState({ quitAt: noon(3) }); delete old.checkins;
eq('an old state without check-ins still works', [checkinStreak(old, noon(0)), !!assertState(old)], [0, true]);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
