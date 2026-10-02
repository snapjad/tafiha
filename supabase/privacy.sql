-- طفّيها — erase pre-accounts device copies once they live in an account.
-- Apply after schema.sql, accounts.sql and security.sql.
--
-- A journey synced before accounts existed sits in tafiha_profiles under the
-- hash of a device key. When someone adds it to their account, the app first
-- saves the merged copy in tafiha_accounts, then calls this to delete the old
-- row (and any pairing codes for it, by cascade). After that, deleting the
-- account really erases everything stored for that person.
begin;

create or replace function public.tafiha_me_retire_legacy(k text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := public.tafiha_require_session();
begin
  if k is null or k !~ '^[A-Za-z0-9_-]{43}$' then return false; end if;
  -- only once the account copy exists, so the old row is never the only copy
  if not exists (select 1 from public.tafiha_accounts where user_id = uid) then return false; end if;
  delete from public.tafiha_profiles where id = public.tafiha_hash(k);
  return true;
end $$;

revoke all on function public.tafiha_me_retire_legacy(text) from public, anon;
grant execute on function public.tafiha_me_retire_legacy(text) to authenticated;

commit;
