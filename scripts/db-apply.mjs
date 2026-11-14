// Applies one migration file from supabase/ to this project's database, then prints nothing personal.
//   node scripts/db-apply.mjs supabase/visits.sql
// Needs TAFIHA_DB_PASSWORD in .env.local and the pg client under .qa/db (see db-security.mjs).
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const file = process.argv[2];
if (!file || !/^supabase\/[\w-]+\.sql$/.test(file)) throw new Error('Usage: node scripts/db-apply.mjs supabase/<name>.sql');
const { default: pg } = await import('../.qa/db/node_modules/pg/lib/index.js');
const env = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
if (!env.TAFIHA_DB_PASSWORD) throw new Error('Missing project database password');
const ca = await readFile(new URL('../.qa/supabase-ca.crt', import.meta.url), 'utf8'); // cached copy of Supabase's published CA
if (!ca.startsWith('-----BEGIN CERTIFICATE-----')) throw new Error('Invalid Supabase CA');
const client = new pg.Client({
  host: 'aws-1-eu-central-1.pooler.supabase.com', port: 5432, database: 'postgres', user: 'postgres.wgwbgutzwqkrugfkcchc',
  password: env.TAFIHA_DB_PASSWORD, ssl: { rejectUnauthorized: true, ca },
  connectionTimeoutMillis: 10000, statement_timeout: 20000,
});
await client.connect();
try {
  await client.query(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
  console.log('applied', file);
} finally {
  await client.end();
}
