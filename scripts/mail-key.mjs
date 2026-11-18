// Stores the Resend sending key for the reminder emails (supabase/mail.sql) in the database.
//   1. Put RESEND_API_KEY=re_... in .env.local (a "Sending access" key limited to tafiha.com)
//   2. node scripts/mail-key.mjs          (the key is never printed)
//   3. Delete the line from .env.local.
//   node scripts/mail-key.mjs --off      removes the key: no more reminder emails
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const off = process.argv.includes('--off');
const env = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
const key = (env.RESEND_API_KEY || '').trim();
if (!off && !/^re_[A-Za-z0-9_]{20,}$/.test(key)) throw new Error('RESEND_API_KEY missing or not a Resend key (re_...) in .env.local');
const { default: pg } = await import('../.qa/db/node_modules/pg/lib/index.js');
const ca = await readFile(new URL('../.qa/supabase-ca.crt', import.meta.url), 'utf8');
const c = new pg.Client({
  host: 'aws-1-eu-central-1.pooler.supabase.com', port: 5432, database: 'postgres', user: 'postgres.wgwbgutzwqkrugfkcchc',
  password: env.TAFIHA_DB_PASSWORD, ssl: { rejectUnauthorized: true, ca }, connectionTimeoutMillis: 10000,
});
await c.connect();
try {
  if (off) {
    await c.query("delete from public.tafiha_secrets where name = 'resend'");
    console.log('reminder emails are off (key removed)');
  } else {
    await c.query("insert into public.tafiha_secrets (name, value) values ('resend', $1) on conflict (name) do update set value = excluded.value", [key]);
    console.log('key stored; reminder emails go out at the next hourly run (9:00–20:00 Amman)');
  }
} finally {
  await c.end();
}
