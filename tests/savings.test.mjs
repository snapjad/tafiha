import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/store.js';
import { merge, snapshot, touch } from '../js/merge.js';
import { assertState } from '../js/security.js';
const now = 1700000000000;
const journey = () => S.createState({ quitAt: now - 3 * S.DAY, nrt: { logs: [now - 1000], mg: 4 } });

test('net savings grows with time; deposits only lower the amount due', () => {
  const s = journey();
  assert.equal(S.savings(s, now).earnedCents, 835);
  S.addDeposit(s, { cents: 285, at: now }, now);
  assert.deepEqual(S.savings(s, now), { earnedCents: 835, depositedCents: 285, dueCents: 550, aheadCents: 0 });
  assert.equal(S.savings(s, now + S.DAY).dueCents, 835);
  s.nrt.logs.push(now);
  assert.equal(S.savings(s, now).earnedCents, 815, 'Nicotine replacement remains deducted');
});

test('money parsing accepts Arabic digits without floating-point rounding or partial inputs', () => {
  for (const [input, cents] of [['2.85', 285], ['٢٫٨٥', 285], ['۲,۸۵', 285], ['.5', 50], ['0.01', 1], [' 10 ', 1000]]) assert.equal(S.parseMoneyCents(input), cents);
  for (const input of ['', '0', '-1', '1.234', '1e3', 'Infinity', '2abc', '1,000.00', '1000000']) assert.equal(S.parseMoneyCents(input), null);
});

test('over-deposit is shown as credit, not negative debt; records survive restarts', () => {
  const s = journey();
  S.addDeposit(s, { cents: 1000, at: now }, now);
  assert.equal(S.savings(s, now).dueCents, 0);
  assert.equal(S.savings(s, now).aheadCents, 165);
  S.restartJourney(s, now);
  assert.equal(S.elapsed(s, now), 0);
  assert.deepEqual(S.savings(s, now), { earnedCents: 835, depositedCents: 1000, dueCents: 0, aheadCents: 165 });
  assert.equal(S.savings(s, now + S.DAY).earnedCents, 1120);
});

test('two devices merge same-millisecond deposits by id and keep deletions', () => {
  const a = journey(), b = structuredClone(a);
  const x = S.addDeposit(a, { cents: 100, at: now }, now);
  S.addDeposit(b, { cents: 200, at: now }, now);
  const c = merge(a, b);
  assert.equal(c.deposits.length, 2);
  assert.equal(S.savings(c, now).depositedCents, 300);
  assert.equal(merge(c, b).deposits.length, 2, 'No duplicate after another sync');
  const before = snapshot(c);
  c.deposits = c.deposits.filter((v) => v.id !== x.id);
  touch(c, before, now + 1);
  const d = merge(c, a);
  assert.equal(d.deposits.length, 1);
  assert.equal(d.deposits[0].cents, 200);
  assertState(d);
});

test('legacy journeys start with no deposits and malformed records fail validation', () => {
  const old = journey(); delete old.deposits; delete old.savingsCarryCents;
  assert.equal(S.savings(old, now).depositedCents, 0);
  assertState(old);
  const s = journey();
  S.addDeposit(s, { cents: 100, at: now, note: '<b>plain text</b>' }, now);
  assertState(s);
  for (const bad of [-1, 0, 1.5, '100', Infinity]) {
    const copy = structuredClone(s); copy.deposits[0].cents = bad;
    assert.throws(() => assertState(copy));
  }
  s.deposits.push(s.deposits[0]);
  assert.throws(() => assertState(s));
});
