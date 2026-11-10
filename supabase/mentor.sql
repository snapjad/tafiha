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

-- true when this call fits: 150 turns an hour per address (an interview is about 40), 20000 a day in all
create or replace function public.tafiha_mentor_take(who text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare mine integer; everyone integer;
begin
  if who is null or length(who) <> 64 then return false; end if;
  insert into public.tafiha_mentor_usage as u (who, slot, n) values (who, date_trunc('hour', now()), 1)
  on conflict (who, slot) do update set n = u.n + 1 returning n into mine;
  insert into public.tafiha_mentor_usage as u (who, slot, n) values ('*', date_trunc('day', now()), 1)
  on conflict (who, slot) do update set n = u.n + 1 returning n into everyone;
  if random() < 0.01 then
    delete from public.tafiha_mentor_usage where slot < now() - interval '2 days';
  end if;
  return mine <= 150 and everyone <= 20000;
end $$;

revoke all on function public.tafiha_mentor_take(text) from public, anon, authenticated;
grant execute on function public.tafiha_mentor_take(text) to service_role;

commit;
