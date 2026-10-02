-- Apply after schema.sql and accounts.sql. No journey rows are changed.
begin;

create or replace function public.tafiha_require_session() returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); sid text := auth.jwt() ->> 'session_id';
begin
  if uid is null or sid is null or not exists (
    select 1 from auth.sessions s where s.id::text = sid and s.user_id = uid
  ) then raise exception 'session expired' using errcode = '42501'; end if;
  return uid;
end $$;
revoke all on function public.tafiha_require_session() from public, anon, authenticated;

-- Bounded JSON and no object-prototype keys, even when the browser is bypassed.
create or replace function public.tafiha_check_json(d jsonb, depth integer default 0) returns void
language plpgsql immutable set search_path = ''
as $$
declare item record; value jsonb; kind text := jsonb_typeof(d);
begin
  if depth > 12 then raise exception 'data too deep'; end if;
  if kind = 'object' then
    for item in select * from jsonb_each(d) loop
      if item.key in ('__proto__', 'constructor', 'prototype') or length(item.key) > 128 then raise exception 'invalid data key'; end if;
      perform public.tafiha_check_json(item.value, depth + 1);
    end loop;
  elsif kind = 'array' then
    if jsonb_array_length(d) > 20000 then raise exception 'array too large'; end if;
    for value in select * from jsonb_array_elements(d) loop
      perform public.tafiha_check_json(value, depth + 1);
    end loop;
  elsif kind = 'string' and length(d #>> '{}') > 4096 then raise exception 'text too long';
  elsif kind = 'number' and abs((d #>> '{}')::numeric) > 9007199254740991 then raise exception 'number too large';
  end if;
end $$;
revoke all on function public.tafiha_check_json(jsonb, integer) from public, anon, authenticated;

create or replace function public.tafiha_check_savings(d jsonb) returns void
language plpgsql immutable set search_path = ''
as $$
declare entry jsonb; cents numeric; at_time numeric; carry numeric;
begin
  if d ? 'savingsCarryCents' then
    if jsonb_typeof(d->'savingsCarryCents') <> 'number' then raise exception 'invalid carried savings'; end if;
    carry := (d->>'savingsCarryCents')::numeric;
    if carry < 0 or carry <> trunc(carry) then raise exception 'invalid carried savings'; end if;
  end if;
  if not (d ? 'deposits') then return; end if;
  if jsonb_typeof(d->'deposits') <> 'array' then raise exception 'invalid deposit ledger'; end if;
  for entry in select * from jsonb_array_elements(d->'deposits') loop
    if jsonb_typeof(entry) <> 'object' or jsonb_typeof(entry->'id') is distinct from 'string'
      or (entry->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(entry->'cents') is distinct from 'number' or jsonb_typeof(entry->'at') is distinct from 'number' then raise exception 'invalid deposit'; end if;
    cents := (entry->>'cents')::numeric; at_time := (entry->>'at')::numeric;
    if cents <= 0 or cents > 99999999 or cents <> trunc(cents) or at_time <= 0 or at_time <> trunc(at_time) then raise exception 'invalid deposit amount or date'; end if;
    if entry ? 'note' and (jsonb_typeof(entry->'note') <> 'string' or length(entry->>'note') > 80) then raise exception 'invalid deposit note'; end if;
  end loop;
  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(d->'deposits')) then raise exception 'duplicate deposit'; end if;
end $$;
revoke all on function public.tafiha_check_savings(jsonb) from public, anon, authenticated;

create or replace function public.tafiha_check_document(d jsonb, base bigint) returns void
language plpgsql immutable set search_path = ''
as $$
declare section jsonb; k text; answer record;
begin
  if d is null or jsonb_typeof(d) <> 'object' or base is null or base < 0 or base > 9007199254740990 then raise exception 'invalid document'; end if;
  if octet_length(d::text) > 262144 then raise exception 'too big'; end if;
  perform public.tafiha_check_json(d);
  perform public.tafiha_check_savings(d);
  if d->'v' is distinct from '1'::jsonb or jsonb_typeof(d->'name') is distinct from 'string'
    or jsonb_typeof(d->'quitAt') is distinct from 'number' or jsonb_typeof(d->'habits') is distinct from 'object'
    or jsonb_typeof(d->'nrt') is distinct from 'object' or jsonb_typeof(d->'cravings') is distinct from 'array'
    or jsonb_typeof(d->'slips') is distinct from 'array' then raise exception 'invalid journey'; end if;
  for section in select value from jsonb_each(d->'habits') union all select d->'nrt' union all select d->'patch' loop
    if section is null or section = 'null'::jsonb then continue; end if;
    if jsonb_typeof(section) <> 'object' or jsonb_typeof(section->'active') is distinct from 'boolean' then raise exception 'invalid settings'; end if;
    foreach k in array array['perDay','packSize','packPrice','unitPrice','daysPerUnit','puffs','perWeek','price','mg','dailyMax','packCount','hours'] loop
      if section ? k and section->k <> 'null'::jsonb and jsonb_typeof(section->k) <> 'number' then raise exception 'invalid number'; end if;
    end loop;
  end loop;
  if d ? 'assessment' and d->'assessment' <> 'null'::jsonb then
    if jsonb_typeof(d->'assessment') <> 'object' then raise exception 'invalid assessment'; end if;
    for answer in select * from jsonb_each(d->'assessment') loop
      if answer.key = any(array['cig_perDay','cig_packSize','cig_packPrice','vp_nicotine','vp_price','vp_days','vp_puffs','ar_perWeek','ar_price','gum_mg','gum_max','gum_price','gum_count','patch_mg','patch_price','patch_count','importance','confidence','pastDate','futureDate','quitAt','assessedAt'])
        and answer.value <> 'null'::jsonb and jsonb_typeof(answer.value) <> 'number' then raise exception 'invalid assessment number'; end if;
    end loop;
  end if;
end $$;
revoke all on function public.tafiha_check_document(jsonb, bigint) from public, anon, authenticated;

create or replace function public.tafiha_me_pull() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare r record; uid uuid := public.tafiha_require_session();
begin
  select data, rev into r from public.tafiha_accounts where user_id = uid;
  if not found then return null; end if;
  return jsonb_build_object('data', r.data, 'rev', r.rev);
end $$;

create or replace function public.tafiha_me_push(d jsonb, base bigint) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare n bigint; uid uuid := public.tafiha_require_session();
begin
  perform public.tafiha_check_document(d, base);
  insert into public.tafiha_accounts as t (user_id, data) values (uid, d)
  on conflict (user_id) do update set data = excluded.data, rev = t.rev + 1, updated_at = now() where t.rev = base
  returning t.rev into n;
  return coalesce(n, -1);
end $$;

-- Keep the legacy backup until an explicit, separately confirmed retirement.
create or replace function public.tafiha_me_adopt(k text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare old jsonb;
begin
  perform public.tafiha_require_session();
  if k is null or k !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
  select data into old from public.tafiha_profiles where id = public.tafiha_hash(k);
  return old;
end $$;

create or replace function public.tafiha_me_delete() returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := public.tafiha_require_session();
begin
  delete from public.tafiha_accounts where user_id = uid;
  delete from auth.users where id = uid;
end $$;

-- Keep the old public client functional while accounts are being rolled out.
create or replace function public.tafiha_push(k text, d jsonb, base bigint) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare h text; n bigint;
begin
  if k is null or k !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'bad key'; end if;
  perform public.tafiha_check_document(d, base);
  h := public.tafiha_hash(k);
  insert into public.tafiha_profiles as p (id, data) values (h, d)
  on conflict (id) do update set data = excluded.data, rev = p.rev + 1, updated_at = now() where p.rev = base
  returning p.rev into n;
  return coalesce(n, -1);
end $$;

revoke all on function public.tafiha_me_pull(), public.tafiha_me_push(jsonb, bigint), public.tafiha_me_adopt(text), public.tafiha_me_delete() from public, anon;
grant execute on function public.tafiha_me_pull(), public.tafiha_me_push(jsonb, bigint), public.tafiha_me_adopt(text), public.tafiha_me_delete() to authenticated;
revoke all on function public.tafiha_push(text, jsonb, bigint) from public;
grant execute on function public.tafiha_push(text, jsonb, bigint) to anon, authenticated;

commit;
