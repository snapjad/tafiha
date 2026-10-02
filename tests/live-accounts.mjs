// Explicit live check: creates isolated, disposable accounts and deletes them in finally.
// Does not send emails; refuses to run unless email auto-confirm is already enabled.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SUPABASE_URL, SUPABASE_ANON } from '../js/config.js';
import { createState, addDeposit } from '../js/store.js';

if (process.env.TAFIHA_LIVE_TEST !== '1') throw new Error('Set TAFIHA_LIVE_TEST=1 to run the live account check.');
const accounts = [];
async function request(path, { method = 'GET', body, token = SUPABASE_ANON } = {}) {
  const res = await fetch(SUPABASE_URL + path, {
    method, headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${data?.code || data?.error_code || 'request failed'}`);
  return data;
}
const rpc = (name, account, body = {}) => request(`/rest/v1/rpc/${name}`, { method: 'POST', token: account.access_token, body });
async function denied(path, { token = SUPABASE_ANON, body } = {}) {
  const res = await fetch(SUPABASE_URL + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  assert.ok([400, 401, 403, 404].includes(res.status), `Expected denial for ${path}, received ${res.status}`);
  await res.body?.cancel();
}

try {
  const settings = await request('/auth/v1/settings');
  assert.equal(settings.mailer_autoconfirm, true, 'Refusing to trigger confirmation emails');
  for (const fn of ['tafiha_me_pull', 'tafiha_me_delete']) await denied(`/rest/v1/rpc/${fn}`, { body: {} });
  for (const table of ['tafiha_accounts', 'tafiha_profiles', 'tafiha_pair_codes']) await denied(`/rest/v1/${table}?select=*&limit=0`);
  console.log('PASS anonymous account access and direct-table reads denied');
  for (let i = 0; i < 2; i++) {
    const password = randomUUID() + 'Aa9!';
    const email = `tafiha-qa-${randomUUID()}@example.com`;
    const account = await request('/auth/v1/signup', { method: 'POST', body: { email, password, data: { full_name: 'Account test' } } });
    assert.ok(account.access_token);
    accounts.push(account);
    const login = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    assert.equal(login.user.id, account.user.id);
    account.cleanupToken = login.access_token;
  }
  console.log('PASS live signup and password login');
  const [a, b] = accounts;
  assert.equal(await rpc('tafiha_me_pull', a), null);
  const state = createState({ name: 'Isolated QA', habits: ['vape'] });
  const deposit = addDeposit(state, { cents: 425, note: 'Disposable QA ledger' });
  assert.equal(await rpc('tafiha_me_push', a, { d: state, base: 0 }), 1);
  assert.equal((await rpc('tafiha_me_pull', a)).data.name, 'Isolated QA');
  assert.deepEqual((await rpc('tafiha_me_pull', a)).data.deposits, [deposit]);
  assert.equal(await rpc('tafiha_me_pull', b), null);
  assert.equal(await rpc('tafiha_me_push', a, { d: state, base: 0 }), -1);
  console.log('PASS live save, restore, account isolation and revision conflict');
  for (const table of ['tafiha_accounts', 'tafiha_profiles', 'tafiha_pair_codes']) await denied(`/rest/v1/${table}?select=*&limit=0`, { token: a.access_token });
  await denied('/rest/v1/rpc/tafiha_me_pull', { token: b.access_token, body: { user_id: a.user.id } });
  await denied('/rest/v1/rpc/tafiha_me_push', { token: a.access_token, body: { d: [], base: 1 } });
  await denied('/rest/v1/rpc/tafiha_me_push', { token: a.access_token, body: { d: { large: 'x'.repeat(300000) }, base: 1 } });
  const invalidLedger = structuredClone(state); invalidLedger.deposits[0].cents = 1.5;
  await denied('/rest/v1/rpc/tafiha_me_push', { token: a.access_token, body: { d: invalidLedger, base: 1 } });
  assert.equal((await rpc('tafiha_me_pull', a)).rev, 1, 'Rejected writes do not change the journey');
  console.log('PASS authenticated table reads, identity spoofing and invalid payloads denied');
  const profile = await request('/auth/v1/user', { method: 'PUT', token: a.access_token, body: { data: { full_name: 'Updated QA' } } });
  assert.equal(profile.user_metadata.full_name, 'Updated QA');
  console.log('PASS live profile update');
  if (process.env.TAFIHA_SESSION_GUARD === '1') {
    await request('/auth/v1/logout?scope=local', { method: 'POST', token: b.access_token });
    await denied('/rest/v1/rpc/tafiha_me_pull', { token: b.access_token, body: {} });
    await denied('/rest/v1/rpc/tafiha_me_push', { token: b.access_token, body: { d: state, base: 0 } });
    await denied('/rest/v1/rpc/tafiha_me_delete', { token: b.access_token, body: {} });
    // b also has the independent password-login session created above for cleanup.
    b.access_token = b.cleanupToken;
    console.log('PASS logged-out session cannot read, write or delete');
  }
} finally {
  let failed = false;
  for (const a of accounts) {
    try { await rpc('tafiha_me_delete', { access_token: a.cleanupToken || a.access_token }); console.log('PASS test account deleted'); }
    catch (error) { failed = true; console.error(`Cleanup failed for test user ${a.user.id}: ${error.message}`); }
  }
  if (failed) process.exitCode = 1;
}
