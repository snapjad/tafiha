-- طفّيها — admin area, part 1: staff roles, two-step sign-in, audit log, numbers,
-- accounts and app settings (2026-10-03).
-- Apply after schema.sql, accounts.sql, security.sql, privacy.sql and hardening.sql.
--
-- Every admin call checks, on the server:
--   * a live session (public.tafiha_require_session),
--   * that the session passed the second step (TOTP, JWT claim aal = aal2),
--   * an active staff row with an allowed role.
-- Staff never read journey details (health answers) per person: the numbers are totals,
-- and the accounts list shows account details and the quit date only.
begin;

-- ---------------------------------------------------------------- staff and audit

create table if not exists public.tafiha_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'doctor', 'editor')),
  display_name text not null default '' check (length(display_name) <= 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.tafiha_staff enable row level security;
revoke all on table public.tafiha_staff from anon, authenticated;

create table if not exists public.tafiha_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb
);
alter table public.tafiha_audit enable row level security;
revoke all on table public.tafiha_audit from anon, authenticated;
create index if not exists tafiha_audit_at on public.tafiha_audit (at desc);

create or replace function public.tafiha_audit_add(actor uuid, action text, target text, details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = ''
as $$ insert into public.tafiha_audit (actor, action, target, details) values (actor, action, target, coalesce(details, '{}'::jsonb)); $$;
revoke all on function public.tafiha_audit_add(uuid, text, text, jsonb) from public, anon, authenticated;

-- The caller's role when they're active staff, signed in with the second step; otherwise an error.
create or replace function public.tafiha_staff_check(allowed text[]) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := public.tafiha_require_session(); r text;
begin
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'second step required' using errcode = '42501';
  end if;
  select role into r from public.tafiha_staff where user_id = uid and active;
  if r is null or not (r = any (allowed)) then raise exception 'forbidden' using errcode = '42501'; end if;
  return r;
end $$;
revoke all on function public.tafiha_staff_check(text[]) from public, anon, authenticated;

-- What the admin page needs before anything else. Works before the second step, so the
-- page knows whether to ask for it. Null for anyone who isn't active staff.
create or replace function public.tafiha_admin_me() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := public.tafiha_require_session(); s record;
begin
  select role, display_name into s from public.tafiha_staff where user_id = uid and active;
  if not found then return null; end if;
  return jsonb_build_object(
    'user_id', uid,
    'role', s.role,
    'name', s.display_name,
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'totp', exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.factor_type = 'totp' and f.status = 'verified')
  );
end $$;
revoke all on function public.tafiha_admin_me() from public, anon;
grant execute on function public.tafiha_admin_me() to authenticated;

-- ---------------------------------------------------------------- numbers (totals only)

create or replace function public.tafiha_admin_stats() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  now_ms numeric := extract(epoch from now()) * 1000;
  day_ms numeric := 86400000;
  result jsonb;
begin
  perform public.tafiha_staff_check(array['owner']);
  with u as (select id, created_at, email_confirmed_at from auth.users),
  a as (
    select user_id, updated_at, data,
      case when jsonb_typeof(data -> 'quitAt') = 'number' then (data ->> 'quitAt')::numeric end as quit_at
    from public.tafiha_accounts
  ),
  q as (select (now_ms - quit_at) / day_ms as days from a where quit_at is not null and quit_at <= now_ms),
  cal as (select generate_series(current_date - 29, current_date, interval '1 day')::date as d)
  select jsonb_build_object(
    'accounts', (select count(*) from u),
    'confirmed', (select count(*) from u where email_confirmed_at is not null),
    'new7', (select count(*) from u where created_at > now() - interval '7 days'),
    'new30', (select count(*) from u where created_at > now() - interval '30 days'),
    'active7', (select count(*) from a where updated_at > now() - interval '7 days'),
    'active30', (select count(*) from a where updated_at > now() - interval '30 days'),
    'journeys', (select count(*) from a where quit_at is not null),
    'medianDays', (select round(percentile_cont(0.5) within group (order by days)::numeric, 1) from q),
    'over7', (select count(*) from q where days >= 7),
    'over30', (select count(*) from q where days >= 30),
    'over90', (select count(*) from q where days >= 90),
    'cig', (select count(*) from a where (data #>> '{habits,cig,active}') = 'true'),
    'vape', (select count(*) from a where (data #>> '{habits,vape,active}') = 'true'),
    'argileh', (select count(*) from a where (data #>> '{habits,argileh,active}') = 'true'),
    'nrt', (select count(*) from a where (data #>> '{nrt,active}') = 'true' or (data #>> '{patch,active}') = 'true'),
    'goals', (select count(*) from a where jsonb_typeof(data -> 'goal') = 'object'),
    'cravings7', (
      select count(*) from a, jsonb_array_elements(case when jsonb_typeof(a.data -> 'cravings') = 'array' then a.data -> 'cravings' else '[]'::jsonb end) c
      where jsonb_typeof(c -> 'at') = 'number' and (c ->> 'at')::numeric > now_ms - 7 * day_ms
    ),
    'signups', (
      select jsonb_agg(jsonb_build_object('day', to_char(cal.d, 'YYYY-MM-DD'), 'n',
        (select count(*) from u where u.created_at >= cal.d and u.created_at < cal.d + 1)) order by cal.d)
      from cal
    )
  ) into result;
  return result;
end $$;
revoke all on function public.tafiha_admin_stats() from public, anon;
grant execute on function public.tafiha_admin_stats() to authenticated;

-- ---------------------------------------------------------------- accounts

create or replace function public.tafiha_admin_users(q text default '', lim integer default 50, skip integer default 0) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  pattern text;
  items jsonb;
  total bigint;
begin
  perform public.tafiha_staff_check(array['owner']);
  lim := least(greatest(coalesce(lim, 50), 1), 100);
  skip := greatest(coalesce(skip, 0), 0);
  q := left(trim(coalesce(q, '')), 80);
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  select count(*) into total from auth.users u
  where q = '' or u.email ilike pattern or (u.raw_user_meta_data ->> 'full_name') ilike pattern or (u.raw_user_meta_data ->> 'phone') like pattern;
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) into items from (
    select u.id, u.email, u.created_at, u.last_sign_in_at,
      u.raw_user_meta_data ->> 'full_name' as name,
      u.raw_user_meta_data ->> 'phone' as phone,
      u.email_confirmed_at is not null as confirmed,
      coalesce(u.banned_until > now(), false) as banned,
      coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb) as providers,
      a.updated_at as active_at,
      case when jsonb_typeof(a.data -> 'quitAt') = 'number' then (a.data ->> 'quitAt')::numeric end as quit_at,
      s.role as staff_role
    from auth.users u
    left join public.tafiha_accounts a on a.user_id = u.id
    left join public.tafiha_staff s on s.user_id = u.id and s.active
    where q = '' or u.email ilike pattern or (u.raw_user_meta_data ->> 'full_name') ilike pattern or (u.raw_user_meta_data ->> 'phone') like pattern
    order by u.created_at desc
    limit lim offset skip
  ) x;
  return jsonb_build_object('total', total, 'rows', items);
end $$;
revoke all on function public.tafiha_admin_users(text, integer, integer) from public, anon;
grant execute on function public.tafiha_admin_users(text, integer, integer) to authenticated;

-- Stop (or allow again) signing in to an account. Stopping also ends its sessions.
create or replace function public.tafiha_admin_user_ban(target uuid, banned boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  perform public.tafiha_staff_check(array['owner']);
  if target = me then raise exception 'not on yourself'; end if;
  if exists (select 1 from public.tafiha_staff where user_id = target and active) then raise exception 'remove staff role first'; end if;
  update auth.users set banned_until = case when banned then now() + interval '100 years' end where id = target;
  if not found then raise exception 'no such account'; end if;
  if banned then delete from auth.sessions where user_id = target; end if;
  perform public.tafiha_audit_add(me, case when banned then 'user.ban' else 'user.unban' end, target::text);
end $$;
revoke all on function public.tafiha_admin_user_ban(uuid, boolean) from public, anon;
grant execute on function public.tafiha_admin_user_ban(uuid, boolean) to authenticated;

-- Deletes the account and everything stored for it (the journey row cascades).
create or replace function public.tafiha_admin_user_delete(target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); mail text;
begin
  perform public.tafiha_staff_check(array['owner']);
  if target = me then raise exception 'not on yourself'; end if;
  if exists (select 1 from public.tafiha_staff where user_id = target and active) then raise exception 'remove staff role first'; end if;
  delete from auth.users where id = target returning email into mail;
  if mail is null then raise exception 'no such account'; end if;
  -- the audit keeps the id only, not the deleted person's email
  perform public.tafiha_audit_add(me, 'user.delete', target::text);
end $$;
revoke all on function public.tafiha_admin_user_delete(uuid) from public, anon;
grant execute on function public.tafiha_admin_user_delete(uuid) to authenticated;

-- ---------------------------------------------------------------- team

create or replace function public.tafiha_admin_staff() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.tafiha_staff_check(array['owner']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', s.user_id, 'email', u.email, 'role', s.role, 'name', s.display_name, 'active', s.active,
      'created_at', s.created_at,
      'totp', exists (select 1 from auth.mfa_factors f where f.user_id = s.user_id and f.factor_type = 'totp' and f.status = 'verified')
    ) order by s.created_at)
    from public.tafiha_staff s join auth.users u on u.id = s.user_id
  ), '[]'::jsonb);
end $$;
revoke all on function public.tafiha_admin_staff() from public, anon;
grant execute on function public.tafiha_admin_staff() to authenticated;

-- Adds or changes a team member. They need a Tafiha account first (same email).
create or replace function public.tafiha_admin_staff_set(mail text, new_role text, name text, is_active boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); target uuid;
begin
  perform public.tafiha_staff_check(array['owner']);
  if new_role not in ('owner', 'doctor', 'editor') then raise exception 'invalid role'; end if;
  name := left(trim(coalesce(name, '')), 60);
  select id into target from auth.users where lower(email) = lower(trim(mail));
  if target is null then raise exception 'no such account'; end if;
  if target = me and (new_role <> 'owner' or not is_active) then raise exception 'not on yourself'; end if;
  insert into public.tafiha_staff (user_id, role, display_name, active, created_by)
  values (target, new_role, name, is_active, me)
  on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name, active = excluded.active;
  -- a removed or demoted member's sessions end, so the old role can't linger
  if not is_active then delete from auth.sessions where user_id = target; end if;
  perform public.tafiha_audit_add(me, 'staff.set', target::text, jsonb_build_object('role', new_role, 'active', is_active));
end $$;
revoke all on function public.tafiha_admin_staff_set(text, text, text, boolean) from public, anon;
grant execute on function public.tafiha_admin_staff_set(text, text, text, boolean) to authenticated;

create or replace function public.tafiha_admin_staff_remove(target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  perform public.tafiha_staff_check(array['owner']);
  if target = me then raise exception 'not on yourself'; end if;
  delete from public.tafiha_staff where user_id = target;
  if not found then raise exception 'not staff'; end if;
  perform public.tafiha_audit_add(me, 'staff.remove', target::text);
end $$;
revoke all on function public.tafiha_admin_staff_remove(uuid) from public, anon;
grant execute on function public.tafiha_admin_staff_remove(uuid) to authenticated;

create or replace function public.tafiha_admin_audit(lim integer default 100, before_id bigint default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.tafiha_staff_check(array['owner']);
  return coalesce((
    select jsonb_agg(x order by x.id desc) from (
      select l.id, l.at, l.action, l.target, l.details, coalesce(nullif(s.display_name, ''), u.email) as actor
      from public.tafiha_audit l
      left join auth.users u on u.id = l.actor
      left join public.tafiha_staff s on s.user_id = l.actor
      where before_id is null or l.id < before_id
      order by l.id desc
      limit least(greatest(coalesce(lim, 100), 1), 200)
    ) x
  ), '[]'::jsonb);
end $$;
revoke all on function public.tafiha_admin_audit(integer, bigint) from public, anon;
grant execute on function public.tafiha_admin_audit(integer, bigint) to authenticated;

-- ---------------------------------------------------------------- app settings

create table if not exists public.tafiha_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.tafiha_config enable row level security;
revoke all on table public.tafiha_config from anon, authenticated;

-- Public: what the app needs to know (no secrets live in this table).
create or replace function public.tafiha_app_config() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('signups_open', true, 'consult_enabled', false, 'min_version', '')
    || coalesce((select jsonb_object_agg(key, value) from public.tafiha_config
                 where key in ('signups_open', 'consult_enabled', 'min_version')), '{}'::jsonb);
$$;
revoke all on function public.tafiha_app_config() from public;
grant execute on function public.tafiha_app_config() to anon, authenticated;

create or replace function public.tafiha_admin_config_set(k text, v jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid();
begin
  perform public.tafiha_staff_check(array['owner']);
  if k in ('signups_open', 'consult_enabled') then
    if jsonb_typeof(v) <> 'boolean' then raise exception 'invalid value'; end if;
  elsif k = 'min_version' then
    if jsonb_typeof(v) <> 'string' or not ((v #>> '{}') ~ '^([0-9]{1,3}\.){0,2}[0-9]{1,3}$' or (v #>> '{}') = '') then
      raise exception 'invalid value';
    end if;
  else
    raise exception 'unknown setting';
  end if;
  insert into public.tafiha_config (key, value, updated_at, updated_by) values (k, v, now(), me)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = me;
  perform public.tafiha_audit_add(me, 'config.set', k, jsonb_build_object('value', v));
end $$;
revoke all on function public.tafiha_admin_config_set(text, jsonb) from public, anon;
grant execute on function public.tafiha_admin_config_set(text, jsonb) to authenticated;

-- Auth hook (Authentication → Hooks → Before User Created): closing sign-ups in the admin
-- area stops new accounts on the server too, for email and Google alike.
create or replace function public.tafiha_hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if coalesce((select value from public.tafiha_config where key = 'signups_open'), 'true'::jsonb) = 'false'::jsonb then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'signups_closed'));
  end if;
  return '{}'::jsonb;
end $$;
revoke all on function public.tafiha_hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.tafiha_hook_before_user_created(jsonb) to supabase_auth_admin;

commit;
