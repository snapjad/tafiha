-- طفّيها — anonymous counts for the admin area: how many devices open the site each day, how many
-- came from Instagram, how many start the interview and how many finish it.
-- Only totals per day: no id, no address, no device detail is stored. The app sends each step at
-- most once per device per day (js/track.js); the ceiling below stops a script inflating them.

begin;

create table if not exists public.tafiha_daily_counts (
  day date not null,
  step text not null check (step in ('visit', 'instagram', 'start', 'done')),
  n integer not null default 0,
  primary key (day, step)
);
alter table public.tafiha_daily_counts enable row level security;
revoke all on public.tafiha_daily_counts from public, anon, authenticated;

drop function if exists public.tafiha_count(text);
create or replace function public.tafiha_count(what text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if what not in ('visit', 'instagram', 'start', 'done') then return; end if;
  insert into public.tafiha_daily_counts as c (day, step, n)
  values ((now() at time zone 'Asia/Amman')::date, what, 1)
  on conflict (day, step) do update set n = c.n + 1
  where c.n < 200000;                -- a day's ceiling, far above real traffic
end;
$$;
revoke all on function public.tafiha_count(text) from public;
grant execute on function public.tafiha_count(text) to anon, authenticated;

-- owners only: the last «days» days, with the new accounts of each day beside them
create or replace function public.tafiha_admin_funnel(days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  first_day date;
  result jsonb;
begin
  perform public.tafiha_staff_check(array['owner']);
  days := least(greatest(coalesce(days, 30), 1), 365);
  first_day := (now() at time zone 'Asia/Amman')::date - (days - 1);
  with cal as (select generate_series(first_day, first_day + (days - 1), interval '1 day')::date as d),
  c as (select day, step, n from public.tafiha_daily_counts where day >= first_day),
  u as (select (created_at at time zone 'Asia/Amman')::date as d, count(*) as n from auth.users
        where created_at >= first_day::timestamp at time zone 'Asia/Amman' group by 1)
  select jsonb_build_object(
    'since', first_day,
    'totals', jsonb_build_object(
      'visit', coalesce((select sum(n) from c where step = 'visit'), 0),
      'instagram', coalesce((select sum(n) from c where step = 'instagram'), 0),
      'start', coalesce((select sum(n) from c where step = 'start'), 0),
      'done', coalesce((select sum(n) from c where step = 'done'), 0),
      'accounts', coalesce((select sum(n) from u), 0)),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
        'day', cal.d,
        'visit', coalesce((select n from c where c.day = cal.d and step = 'visit'), 0),
        'instagram', coalesce((select n from c where c.day = cal.d and step = 'instagram'), 0),
        'start', coalesce((select n from c where c.day = cal.d and step = 'start'), 0),
        'done', coalesce((select n from c where c.day = cal.d and step = 'done'), 0),
        'accounts', coalesce((select n from u where u.d = cal.d), 0)) order by cal.d) from cal), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.tafiha_admin_funnel(integer) from public, anon;
grant execute on function public.tafiha_admin_funnel(integer) to authenticated;

commit;
