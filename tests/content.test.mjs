import test from 'node:test';
import assert from 'node:assert/strict';
import * as Content from '../js/content.js';
import { MILESTONES } from '../js/store.js';
import { TRIGGERS } from '../js/plan.js';

test('built-in texts are the fallback, and everything is escaped', () => {
  Content._set([]);
  assert.equal(Content.text('milestone', '1w', 'عدّيت أصعب أسبوع.'), 'عدّيت أصعب أسبوع.');
  assert.equal(Content.text('craving', 'coffee', '<b>x</b>'), '&#60;b&#62;x&#60;/b&#62;');
  assert.equal(Content.daily(1), '');
  assert.equal(Content.announcement(), null);
});

test('edited texts replace the built-in ones, and markup from the server stays text', () => {
  Content._set([
    { kind: 'milestone', key: '1w', body: 'نص معدّل' },
    { kind: 'craving', key: 'coffee', body: '<img src=x onerror=alert(1)>' },
    { kind: 'daily', key: '3', body: 'اليوم التالت' },
  ]);
  assert.equal(Content.text('milestone', '1w', 'الأصلي'), 'نص معدّل');
  assert.doesNotMatch(Content.text('craving', 'coffee', 'الأصلي'), /<img/);
  assert.equal(Content.daily(3), 'اليوم التالت');
  assert.equal(Content.daily(0), '');
});

test('announcements: dates, links and malformed items', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  Content._set([
    { id: 'old', kind: 'announcement', key: '', title: 'قديم', body: 'خلص', ends_at: '2026-10-01T00:00:00Z' },
    { id: 'later', kind: 'announcement', key: '', title: 'بعدين', body: 'لسا', starts_at: '2026-10-05T00:00:00Z' },
    { id: 'evil', kind: 'announcement', key: '', body: 'رابط سيء', link: 'javascript:alert(1)' },
    { id: 'live', kind: 'announcement', key: '', title: 'لايف', body: 'الليلة', link: 'https://instagram.com/tafiha', link_label: 'تابعنا' },
  ]);
  const a = Content.announcement(now);
  assert.equal(a.id, 'live');
  assert.equal(a.link, 'https://instagram.com/tafiha');
  assert.equal(a.label, 'تابعنا');
});

test('every milestone and craving trigger has a stable id the admin area can edit', () => {
  const ids = MILESTONES.map((m) => m.id);
  assert.ok(ids.every((id) => /^[a-z0-9-]{1,20}$/.test(id)));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(TRIGGERS.every((t) => /^[a-z0-9-]{1,20}$/.test(t.id)));
});
