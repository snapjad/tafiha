-- طفّيها — security hardening after accounts went live (2026-10-03).
-- Apply after schema.sql, accounts.sql, security.sql and privacy.sql.
begin;

-- 1. Retire the anonymous, pre-accounts endpoints. Anyone holding the public key could
--    create unlimited 256 KB rows through tafiha_push and fill the database. Pairing codes
--    are replaced by signing in. Reading an old device copy stays possible, but only for a
--    signed-in user moving it into their account.
revoke execute on function public.tafiha_push(text, jsonb, bigint) from public, anon, authenticated;
revoke execute on function public.tafiha_make_code(text) from public, anon, authenticated;
revoke execute on function public.tafiha_claim_code(text) from public, anon, authenticated;
delete from public.tafiha_pair_codes;

create or replace function public.tafiha_pull(k text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r record;
begin
  perform public.tafiha_require_session();
  if k is null or k !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
  select data, rev into r from public.tafiha_profiles where id = public.tafiha_hash(k);
  if not found then return null; end if;
  return jsonb_build_object('data', r.data, 'rev', r.rev);
end $$;
revoke all on function public.tafiha_pull(text) from public, anon;
grant execute on function public.tafiha_pull(text) to authenticated;

-- 2. A private realtime channel name per account. The old name was the user id, so anyone
--    who learned an id could listen for activity pings or send fake ones. The name is now an
--    HMAC of the user id with a server-side secret: every device of the account gets the
--    same name from this function, nobody else can work it out.
create table if not exists public.tafiha_secrets (name text primary key, value text not null);
alter table public.tafiha_secrets enable row level security;
revoke all on table public.tafiha_secrets from anon, authenticated;
insert into public.tafiha_secrets (name, value)
values ('channel', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

create or replace function public.tafiha_me_channel() returns text
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := public.tafiha_require_session(); s text;
begin
  select value into s from public.tafiha_secrets where name = 'channel';
  return 'tf-' || encode(extensions.hmac(uid::text, s, 'sha256'), 'hex');
end $$;
revoke all on function public.tafiha_me_channel() from public, anon;
grant execute on function public.tafiha_me_channel() to authenticated;

commit;

-- 3. Retention: pre-accounts device copies that nobody has opened for 60 days are deleted
--    nightly (their device still keeps its own local copy). Expired pairing rows go too.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'tafiha-retention';
select cron.schedule('tafiha-retention', '15 2 * * *', $$
  delete from public.tafiha_profiles where updated_at < now() - interval '60 days';
  delete from public.tafiha_pair_codes where expires_at < now();
$$);
