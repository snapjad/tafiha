-- طفّيها — ceilings for the virtual guide (the «mentor» Edge Function), so its bill is bounded.
--
-- The spoken interview happens before there is an account, so calls are counted per network
-- address (stored only as a hash, per hour) and for the whole app per day. Only the function,
-- with the service role, can call tafiha_mentor_take. Rows older than two days are cleared as
-- new ones come in.
begin;

create table if not exists public.tafiha_mentor_usage (
  who text not null,
  slot timestamptz not null,
  n integer not null default 0,
  primary key (who, slot)
);
alter table public.tafiha_mentor_usage enable row level security;
revoke all on public.tafiha_mentor_usage from public, anon, authenticated;

-- true when this call fits: 300 calls an hour per address (an interview is about 40 turns, each understood and spoken), 40000 a day in all
drop function if exists public.tafiha_mentor_take(text);
create function public.tafiha_mentor_take(caller text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare mine integer; everyone integer;
begin
  if caller is null or length(caller) <> 64 then return false; end if;
  insert into public.tafiha_mentor_usage as u (who, slot, n) values (caller, date_trunc('hour', now()), 1)
  on conflict on constraint tafiha_mentor_usage_pkey do update set n = u.n + 1 returning u.n into mine;
  insert into public.tafiha_mentor_usage as u (who, slot, n) values ('*', date_trunc('day', now()), 1)
  on conflict on constraint tafiha_mentor_usage_pkey do update set n = u.n + 1 returning u.n into everyone;
  if random() < 0.01 then
    delete from public.tafiha_mentor_usage where slot < now() - interval '2 days';
  end if;
  return mine <= 300 and everyone <= 40000;
end $$;

revoke all on function public.tafiha_mentor_take(text) from public, anon, authenticated;
grant execute on function public.tafiha_mentor_take(text) to service_role;

commit;
