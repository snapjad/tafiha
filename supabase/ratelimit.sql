-- طفّيها — a ceiling on saves per account (2026-11-08).
-- Apply after security.sql (it replaces tafiha_me_push from there).
--
-- The app saves at most about once a second while someone is busy in it (js/sync.js waits
-- 700 ms after a change), so a real person stays far below 600 saves an hour. Each save is up
-- to 256 KB and is checked field by field, so without a ceiling one account could keep the
-- database busy in a loop. Past the ceiling the save is refused until the hour is over; the
-- app treats it like any failed save (it keeps the change on the phone and tries again later).
begin;

alter table public.tafiha_accounts
  add column if not exists push_window timestamptz,
  add column if not exists push_count integer not null default 0;

create or replace function public.tafiha_me_push(d jsonb, base bigint) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare n bigint; c integer; uid uuid := public.tafiha_require_session();
begin
  -- count this save in the account's current hour (rolled back with the save if it fails)
  update public.tafiha_accounts set
    push_count = case when push_window > now() - interval '1 hour' then push_count + 1 else 1 end,
    push_window = case when push_window > now() - interval '1 hour' then push_window else now() end
  where user_id = uid
  returning push_count into c;
  if c > 600 then raise exception 'too many saves' using errcode = '54000'; end if;

  perform public.tafiha_check_document(d, base);
  insert into public.tafiha_accounts as t (user_id, data) values (uid, d)
  on conflict (user_id) do update set data = excluded.data, rev = t.rev + 1, updated_at = now() where t.rev = base
  returning t.rev into n;
  return coalesce(n, -1);
end $$;

revoke all on function public.tafiha_me_push(jsonb, bigint) from public, anon;
grant execute on function public.tafiha_me_push(jsonb, bigint) to authenticated;

commit;
