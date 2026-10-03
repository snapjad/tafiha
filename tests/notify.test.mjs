import test from 'node:test';
import assert from 'node:assert/strict';
import { plan, DANGER, daytime } from '../js/notify.js';
import * as Content from '../js/content.js';
import { createState } from '../js/store.js';
import { TRIGGERS } from '../js/plan.js';

const DAY = 86400000;
const NOW = new Date('2026-10-04T12:00:00').getTime();
const all = { danger: true, milestones: true, daily: true, news: true };
const journey = (quitAt, extra = {}) => ({ ...createState({ quitAt: Math.min(quitAt, NOW) }), quitAt, assessment: { triggers: ['coffee', 'night', 'stress'] }, ...extra });

test('every trigger with a usual time has a reminder; stress has no fixed time', () => {
  for (const t of TRIGGERS) if (t.id !== 'stress') assert.ok(DANGER[t.id], `missing ${t.id}`);
  const list = plan(journey(NOW - 2 * DAY), all, NOW);
  const danger = list.filter((n) => n.id >= 3000);
  assert.equal(danger.length, 2);
  assert.deepEqual(danger.map((n) => n.schedule.on), [{ hour: 9, minute: 0 }, { hour: 22, minute: 30 }]);
  assert.ok(danger.every((n) => n.extra.open === 'craving'));
});

test('milestones are only in the future, and a future quit day gets the eve and the morning', () => {
  const started = plan(journey(NOW - 2 * DAY), all, NOW);
  assert.ok(started.filter((n) => n.id >= 1000 && n.id < 1900).every((n) => n.schedule.at.getTime() > NOW));
  assert.ok(!started.some((n) => n.id === 1900 || n.id === 1901));
  const upcoming = plan(journey(new Date('2026-10-08T09:00:00').getTime()), all, NOW);
  assert.ok(upcoming.some((n) => n.id === 1900 && n.title === 'بكرا يوم الطفي'));
  assert.ok(upcoming.some((n) => n.id === 1901));
});

test('the day message follows the journey day and stops where there is no message', () => {
  Content._set([{ kind: 'daily', key: '3', body: 'اليوم التالت' }, { kind: 'daily', key: '4', body: 'اليوم الرابع' }]);
  const morning = new Date('2026-10-04T08:00:00').getTime();
  const list = plan(journey(new Date('2026-10-02T08:00:00').getTime()), all, morning);
  const daily = list.filter((n) => n.id >= 2000 && n.id < 2100);
  // at 8 in the morning, today's 10:00 is still ahead: 4 Oct is day 3, 5 Oct day 4; the rest have no message
  assert.deepEqual(daily.map((n) => [n.title, n.body]), [['يوم 3', 'اليوم التالت'], ['يوم 4', 'اليوم الرابع']]);
  Content._set([]);
});

test('switched-off kinds schedule nothing, and there is always room under the 64-reminder limit', () => {
  const list = plan(journey(NOW - DAY, { patch: { active: true } }), { danger: false, milestones: false, daily: false }, NOW);
  assert.equal(list.length, 0);
  const busy = plan(journey(NOW + 3600000, { assessment: { triggers: TRIGGERS.map((t) => t.id) }, patch: { active: true } }), all, NOW);
  assert.ok(busy.length <= 64, `${busy.length} reminders`);
  assert.equal(new Set(busy.map((n) => n.id)).size, busy.length, 'ids are unique');
});

test('nothing wakes anyone: night-time milestones and nudges move to 9 in the morning', () => {
  assert.equal(daytime(new Date('2026-10-05T00:37:00')).toString(), new Date('2026-10-05T09:00:00').toString());
  assert.equal(daytime(new Date('2026-10-05T23:10:00')).toString(), new Date('2026-10-06T09:00:00').toString());
  assert.equal(daytime(new Date('2026-10-05T15:20:00')).toString(), new Date('2026-10-05T15:20:00').toString());
  const list = plan(journey(new Date('2026-10-02T00:37:00').getTime()), all, NOW);
  for (const n of list.filter((x) => x.schedule.at)) {
    const h = n.schedule.at.getHours() + n.schedule.at.getMinutes() / 60;
    assert.ok(h >= 9 && h < 21.5, `${n.title} at ${n.schedule.at}`);
  }
});
