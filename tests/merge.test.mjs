// Two devices editing at the same time must end up with the same, complete data.
import { merge, touch, snapshot } from '../js/merge.js';
import { createState } from '../js/store.js';

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `: ${JSON.stringify(got)} (want ${JSON.stringify(want)})`}`);
  if (!ok) fails++;
};
const clone = (x) => JSON.parse(JSON.stringify(x));

const base = createState({ name: 'جاد', habits: ['cig'], quitAt: 1000, nrt: { mg: 4, packPrice: 6, packCount: 30, dailyMax: 15 } });
base.nrt.logs = [100, 200];
let snapA = snapshot(base);
let snapB = snapshot(base);
const A = clone(base);
const B = clone(base);

// laptop logs a gum piece and a craving; phone logs another gum piece and changes the price
A.nrt.logs.push(300);
A.cravings.push({ at: 5000, before: 8, after: 3, trigger: 'coffee', outcome: 'beaten' });
snapA = touch(A, snapA, 10);
B.nrt.logs.push(400);
B.habits.cig.packPrice = 3;
snapB = touch(B, snapB, 20);

const AB = merge(A, B);
const BA = merge(B, A);
eq('gum logs from both devices', AB.nrt.logs, [100, 200, 300, 400]);
eq('craving from the laptop kept', AB.cravings.length, 1);
eq('price change from the phone wins', AB.habits.cig.packPrice, 3);
eq('both merge orders agree', JSON.stringify(AB.nrt.logs) + AB.habits.cig.packPrice, JSON.stringify(BA.nrt.logs) + BA.habits.cig.packPrice);

// undo on one device must not be resurrected by the other
const C = clone(AB);
let snapC = snapshot(C);
C.nrt.logs = C.nrt.logs.filter((t) => t !== 300);
snapC = touch(C, snapC, 30);
const back = merge(clone(AB), C);
eq('undone gum stays removed', back.nrt.logs, [100, 200, 400]);
eq('tombstone recorded', Object.keys(C._del).includes('nrt.logs:300'), true);

// newer setting wins, older one does not overwrite it
const D = clone(back);
let snapD = snapshot(D);
D.name = 'جاد ي.';
snapD = touch(D, snapD, 50);
const stale = clone(back);
stale._t.name = 40;
stale.name = 'قديم';
eq('newer name wins', merge(stale, D).name, 'جاد ي.');
eq('older name loses', merge(D, stale).name, 'جاد ي.');

// a fuller craving record wins over a partial one with the same time
const p1 = clone(back); p1.cravings = [{ at: 7000, outcome: 'beaten' }];
const p2 = clone(back); p2.cravings = [{ at: 7000, outcome: 'beaten', trigger: 'stress', before: 7, after: 2 }];
eq('fuller craving record kept', merge(p1, p2).cravings[0].trigger, 'stress');

// nothing on the other side
eq('merge with nothing returns local', merge(A, null), A);
eq('fresh device takes remote', merge(null, B), B);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
