-- طفّيها — sync storage.
-- For a new setup, apply accounts.sql, then security.sql after this file.
--
-- Each person's whole app state is one JSON document. There are no accounts:
-- a device holds a random secret key (32 bytes) and the row id is its SHA-256,
-- so the database never stores the key itself. Tables are closed to the API
-- (RLS on, no policies); the only way in is these functions, which need the key.
-- Linking a second device hands the key over through a short-lived pairing code.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.tafiha_profiles (
  id text primary key,                          -- sha256(key), hex
  data jsonb not null,
  rev bigint not null default 1,                -- bumps on every save (optimistic concurrency)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tafiha_profiles enable row level security;

create table if not exists public.tafiha_pair_codes (
  code text primary key,
  profile_id text not null references public.tafiha_profiles(id) on delete cascade,
  sync_key text not null,                       -- held for at most 10 minutes
  expires_at timestamptz not null
);
alter table public.tafiha_pair_codes enable row level security;

revoke all on table public.tafiha_profiles, public.tafiha_pair_codes from anon, authenticated;

create or replace function public.tafiha_hash(k text) returns text
language sql immutable set search_path = public, extensions
as $$ select encode(extensions.digest(k, 'sha256'), 'hex') $$;

-- current document + revision, or null when nothing is stored yet
create or replace function public.tafiha_pull(k text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare r record;
begin
  if k is null or length(k) < 40 then raise exception 'bad key'; end if;
  select data, rev into r from tafiha_profiles where id = tafiha_hash(k);
  if not found then return null; end if;
  return jsonb_build_object('data', r.data, 'rev', r.rev);
end $$;

-- save if nobody saved since `base`; returns the new revision, or -1 on conflict
create or replace function public.tafiha_push(k text, d jsonb, base bigint) returns bigint
language plpgsql security definer set search_path = public, extensions
as $$
declare h text; n bigint;
begin
  if k is null or length(k) < 40 then raise exception 'bad key'; end if;
  if d is null or jsonb_typeof(d) <> 'object' then raise exception 'bad data'; end if;
  if pg_column_size(d) > 262144 then raise exception 'too big'; end if;
  h := tafiha_hash(k);
  insert into tafiha_profiles as p (id, data) values (h, d)
  on conflict (id) do update set data = excluded.data, rev = p.rev + 1, updated_at = now()
    where p.rev = base
  returning p.rev into n;
  return coalesce(n, -1);
end $$;

-- an 8-character code (no look-alike letters) valid for 10 minutes
create or replace function public.tafiha_make_code(k text) returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  h text;
  c text;
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if k is null or length(k) < 40 then raise exception 'bad key'; end if;
  h := tafiha_hash(k);
  if not exists (select 1 from tafiha_profiles where id = h) then raise exception 'nothing to link yet'; end if;
  delete from tafiha_pair_codes where expires_at < now() or profile_id = h;
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(abc, 1 + get_byte(extensions.gen_random_bytes(1), 0) % 32, 1);
    end loop;
    begin
      insert into tafiha_pair_codes (code, profile_id, sync_key, expires_at)
      values (c, h, k, now() + interval '10 minutes');
      exit;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
  return c;
end $$;

-- trade a code for the key (once); null when wrong or expired
create or replace function public.tafiha_claim_code(c text) returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare k text;
begin
  delete from tafiha_pair_codes where expires_at < now();
  delete from tafiha_pair_codes where code = upper(replace(replace(coalesce(c, ''), '-', ''), ' ', ''))
  returning sync_key into k;
  return k;
end $$;

revoke all on function public.tafiha_hash(text) from public, anon, authenticated;
revoke all on function public.tafiha_pull(text), public.tafiha_push(text, jsonb, bigint),
  public.tafiha_make_code(text), public.tafiha_claim_code(text) from public;
grant execute on function public.tafiha_pull(text), public.tafiha_push(text, jsonb, bigint),
  public.tafiha_make_code(text), public.tafiha_claim_code(text) to anon, authenticated;
