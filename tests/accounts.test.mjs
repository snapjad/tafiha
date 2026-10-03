import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/store.js';
import { parsePhone, latinDigits, passwordOk, authError } from '../js/validate.js';

const values = new Map();
globalThis.localStorage = {
  getItem: (k) => values.get(k) ?? null,
  setItem: (k, v) => values.set(k, v),
  removeItem: (k) => values.delete(k),
};
const journey = (name) => S.createState({ name });

test('account switches never inherit another account or the legacy guest', () => {
  S.selectAccount();
  S.save(journey('Guest'));
  S.selectAccount('alice');
  assert.equal(S.load(), null);
  S.save(journey('Alice'));
  S.selectAccount('bob');
  assert.equal(S.load(), null);
  S.save(journey('Bob'));
  S.selectAccount('alice');
  assert.equal(S.load().name, 'Alice');
  S.reset();
  assert.equal(S.load(), null);
  S.selectAccount('bob');
  assert.equal(S.load().name, 'Bob');
  assert.equal(S.loadGuest().name, 'Guest');
});

test('legacy data cannot be retired before an account copy exists', () => {
  S.selectAccount('new-account');
  assert.equal(S.retireGuest(), false);
  const original = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('quota'); };
  assert.equal(S.save(S.loadGuest()), false);
  assert.equal(S.retireGuest(), false);
  assert.equal(S.loadGuest().name, 'Guest');
  localStorage.setItem = original;
  assert.equal(S.save(S.loadGuest()), true);
  assert.equal(S.retireGuest(), true);
  assert.equal(S.loadGuest(), null);
  assert.equal(S.load().name, 'Guest');
});

test('international phone input accepts Arabic digits and explicit country codes', () => {
  assert.deepEqual(parsePhone('JO', '٠٧٩١٢٣٤٥٦٧'), { e164: '+962791234567', iso: 'JO' });
  assert.deepEqual(parsePhone('JO', '+966 50 123 4567'), { e164: '+966501234567', iso: 'SA' });
  assert.deepEqual(parsePhone('JO', '00962791234567'), { e164: '+962791234567', iso: 'JO' });
  assert.equal(parsePhone('JO', '07912'), null);
  assert.equal(latinDigits('۱۲٣٤٥٦'), '123456');
  assert.equal(passwordOk('short'), false);
  assert.match(authError({ code: 'invalid_credentials' }), /غلط/);
  assert.match(authError({ status: 429 }), /استنّى/);
});

test('passwords follow the server rule (8+, a Latin letter and a digit) and common ones are refused', async () => {
  const { passwordOk, passwordProblem } = await import('../js/validate.js');
  for (const weak of ['short1', '12345678', 'password', 'abcdefgh', '١٢٣٤٥٦٧٨ab', 'password1', 'Qwerty123', 'tafiha123']) {
    assert.equal(passwordOk(weak), false, weak);
    assert.ok(passwordProblem(weak).length > 0, weak);
  }
  for (const fine of ['Jad-quits-2026', 'sunflower7', 'k9mPq2xz']) assert.equal(passwordOk(fine), true, fine);
});
