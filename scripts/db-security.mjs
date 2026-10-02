// Administrative audit for this project only. Credentials never leave this process.
// Install the optional client under .qa/db; it is not part of the shipped app.
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createState, addDeposit } from '../js/store.js';
const { default: pg } = await import('../.qa/db/node_modules/pg/lib/index.js');
const env = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
if (!env.TAFIHA_DB_PASSWORD) throw new Error('Missing project database password');
// Published by Supabase Studio's ssl:certificate_url configuration.
const caResponse = await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt', { signal: AbortSignal.timeout(15000) });
if (!caResponse.ok) throw new Error('Cannot load the Supabase CA');
const ca = await caResponse.text();
if (!ca.startsWith('-----BEGIN CERTIFICATE-----')) throw new Error('Invalid Supabase CA');
const client = new pg.Client({
  host: 'db.wgwbgutzwqkrugfkcchc.supabase.co', port: 5432, database: 'postgres', user: 'postgres',
  password: env.TAFIHA_DB_PASSWORD, ssl: { rejectUnauthorized: true, ca },
  connectionTimeoutMillis: 10000, statement_timeout: 15000,
});
try {
  await client.connect();
  const { rows: tables } = await client.query("select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('tafiha_accounts','tafiha_profiles','tafiha_pair_codes') order by relname");
  console.log(JSON.stringify({ tables }));
  const { rows: functions } = await client.query("select p.oid::regprocedure::text as signature, p.prosecdef, p.proconfig, p.proacl::text, pg_get_functiondef(p.oid) as definition from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'tafiha_%' order by p.proname");
  console.log(JSON.stringify({ functions: functions.map(({ definition, ...p }) => p) }));
  if (process.argv.includes('--apply') || process.argv.includes('--check')) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await writeFile(new URL(`../.qa/database-functions-before-${stamp}.sql`, import.meta.url), functions.map((p) => p.definition).join('\n'), { flag: 'wx' });
    const migration = await readFile(new URL('../supabase/security.sql', import.meta.url), 'utf8');
    await client.query(migration.replace(/commit;\s*$/i, ''));
    // Validate existing documents inside Postgres without fetching personal data.
    await client.query(`do $$ declare r record; n bigint; begin
      select (select count(*) from public.tafiha_profiles) + (select count(*) from public.tafiha_accounts) into n;
      if n > 1000 then raise exception 'Manual compatibility review required'; end if;
      for r in select data, rev from public.tafiha_profiles union all select data, rev from public.tafiha_accounts loop
        perform public.tafiha_check_document(r.data, r.rev);
      end loop;
    end $$`);
    await client.query('select public.tafiha_check_document($1::jsonb, 0)', [JSON.stringify(createState())]);
    const ledger = createState(); addDeposit(ledger, { cents: 285 });
    await client.query('select public.tafiha_check_document($1::jsonb, 0)', [JSON.stringify(ledger)]);
    const badLedger = structuredClone(ledger); badLedger.deposits[0].cents = 1.5;
    for (const bad of [badLedger, {}, { ...createState(), nrt: { ...createState().nrt, dailyMax: '<img>' } }, JSON.parse('{"__proto__":{}}')]) {
      await client.query('savepoint invalid_data_test');
      let rejected = false;
      try { await client.query('select public.tafiha_check_document($1::jsonb, 0)', [JSON.stringify(bad)]); }
      catch { rejected = true; }
      await client.query('rollback to savepoint invalid_data_test');
      if (!rejected) throw new Error('Validation regression');
    }
    const apply = process.argv.includes('--apply');
    await client.query(apply ? 'commit' : 'rollback');
    console.log(apply ? 'Applied tested security migration. Original function definitions saved in .qa.' : 'Migration syntax and payload checks passed; rolled back without changing live functions.');
  }
} catch (error) {
  // Do not print connection objects or authentication responses containing secrets.
  console.error(`Database audit failed: ${error.code || error.name}`);
  await client.query('rollback').catch(() => {});
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
