-- طفّيها — accounts.
-- For a new setup, apply security.sql AFTER this file and schema.sql.
--
-- Every person signs in (Google, or email + password). Their whole app state is
-- one JSON document keyed by their auth user id. The table is closed to the API
-- (RLS on, no policies); the functions below only ever touch the caller's own
-- row (auth.uid()), and only signed-in users may call them.
-- Name and phone live in the auth user's metadata (full_name, phone, phone_country);
-- phone sign-in with a one-time code will attach a verified number later.

create table if not exists public.tafiha_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  rev bigint not null default 1,                -- bumps on every save (optimistic concurrency)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tafiha_accounts enable row level security;
revoke all on table public.tafiha_accounts from anon, authenticated;

-- the caller's document + revision, or null when nothing is stored yet
create or replace function public.tafiha_me_pull() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r record;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select data, rev into r from tafiha_accounts where user_id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object('data', r.data, 'rev', r.rev);
end $$;

-- save if nobody saved since `base`; returns the new revision, or -1 on conflict
create or replace function public.tafiha_me_push(d jsonb, base bigint) returns bigint
language plpgsql security definer set search_path = public
as $$
declare n bigint;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if d is null or jsonb_typeof(d) <> 'object' then raise exception 'bad data'; end if;
  if pg_column_size(d) > 262144 then raise exception 'too big'; end if;
  insert into tafiha_accounts as t (user_id, data) values (auth.uid(), d)
  on conflict (user_id) do update set data = excluded.data, rev = t.rev + 1, updated_at = now()
    where t.rev = base
  returning t.rev into n;
  return coalesce(n, -1);
end $$;

-- move a pre-accounts device copy (synced under a device key) into the account:
-- returns that copy for the app to merge, and removes it from the old table
create or replace function public.tafiha_me_adopt(k text) returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare old jsonb;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if k is null or length(k) < 40 then return null; end if;
  delete from tafiha_profiles where id = tafiha_hash(k) returning data into old;
  return old;
end $$;

-- delete the account and everything stored for it (required by both stores)
create or replace function public.tafiha_me_delete() returns void
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.tafiha_accounts where user_id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.tafiha_me_pull(), public.tafiha_me_push(jsonb, bigint),
  public.tafiha_me_adopt(text), public.tafiha_me_delete() from public, anon;
grant execute on function public.tafiha_me_pull(), public.tafiha_me_push(jsonb, bigint),
  public.tafiha_me_adopt(text), public.tafiha_me_delete() to authenticated;
