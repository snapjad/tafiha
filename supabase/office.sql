-- طفّيها · «الشركة» بلوحة الإدارة: المكتب الافتراضي (فريق الذكاء الاصطناعي) لايف للمالك.
-- The office document is written by the company's tools with a private key (only its sha256 lives
-- here, in tafiha_secrets as 'office_writer'). Owners read it and answer decisions; nothing in it
-- is about app users. Apply after admin.sql and hardening.sql.

begin;

create table if not exists public.tafiha_office (
  id smallint primary key default 1 check (id = 1),
  doc jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.tafiha_office enable row level security;
revoke all on table public.tafiha_office from anon, authenticated;
insert into public.tafiha_office (id) values (1) on conflict (id) do nothing;

create table if not exists public.tafiha_office_answers (
  id bigint generated always as identity primary key,
  decision text not null check (length(decision) between 1 and 20),
  answer text not null check (length(answer) between 1 and 300),
  note text not null default '' check (length(note) <= 1000),
  at timestamptz not null default now(),
  actor uuid,
  picked_up_at timestamptz
);
alter table public.tafiha_office_answers enable row level security;
revoke all on table public.tafiha_office_answers from anon, authenticated;

-- Owner: the office and the latest answers.
create or replace function public.tafiha_admin_office() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare o record;
begin
  perform public.tafiha_staff_check(array['owner']);
  select doc, updated_at into o from public.tafiha_office where id = 1;
  return jsonb_build_object(
    'doc', coalesce(o.doc, '{}'::jsonb),
    'updated_at', o.updated_at,
    'answers', coalesce((
      select jsonb_agg(x order by x.id desc) from (
        select id, decision, answer, note, at, picked_up_at from public.tafiha_office_answers order by id desc limit 50
      ) x), '[]'::jsonb));
end $$;
revoke all on function public.tafiha_admin_office() from public, anon;
grant execute on function public.tafiha_admin_office() to authenticated;

-- Owner: answer a decision. The team reads it at its next session.
create or replace function public.tafiha_admin_office_answer(decision text, answer text, note text default '') returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.tafiha_staff_check(array['owner']);
  if decision is null or decision !~ '^[A-Za-z0-9_-]{1,20}$' then raise exception 'invalid value'; end if;
  if answer is null or length(btrim(answer)) = 0 or length(answer) > 300 or length(coalesce(note, '')) > 1000 then raise exception 'invalid value'; end if;
  insert into public.tafiha_office_answers (decision, answer, note, actor) values (decision, btrim(answer), coalesce(note, ''), auth.uid());
  perform public.tafiha_audit_add(auth.uid(), 'office.answer', decision, jsonb_build_object('answer', btrim(answer)));
end $$;
revoke all on function public.tafiha_admin_office_answer(text, text, text) from public, anon;
grant execute on function public.tafiha_admin_office_answer(text, text, text) to authenticated;

-- The company's tools: replace the office document (needs the office key).
create or replace function public.tafiha_office_check_key(k text) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare h text;
begin
  select value into h from public.tafiha_secrets where name = 'office_writer';
  if h is null or k is null or length(k) < 40 or encode(extensions.digest(k, 'sha256'), 'hex') <> h then
    raise exception 'forbidden';
  end if;
end $$;
revoke all on function public.tafiha_office_check_key(text) from public, anon, authenticated;

create or replace function public.tafiha_office_put(k text, d jsonb) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.tafiha_office_check_key(k);
  if d is null or jsonb_typeof(d) <> 'object' or pg_column_size(d) > 400000 then raise exception 'invalid value'; end if;
  update public.tafiha_office set doc = d, updated_at = now() where id = 1;
  return now();
end $$;
revoke all on function public.tafiha_office_put(text, jsonb) from public;
grant execute on function public.tafiha_office_put(text, jsonb) to anon, authenticated;

-- The company's tools: answers not picked up yet (and mark them picked up).
create or replace function public.tafiha_office_answers_pull(k text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare r jsonb;
begin
  perform public.tafiha_office_check_key(k);
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'decision', decision, 'answer', answer, 'note', note, 'at', at) order by id), '[]'::jsonb)
    into r from public.tafiha_office_answers where picked_up_at is null;
  update public.tafiha_office_answers set picked_up_at = now() where picked_up_at is null;
  return r;
end $$;
revoke all on function public.tafiha_office_answers_pull(text) from public;
grant execute on function public.tafiha_office_answers_pull(text) to anon, authenticated;

commit;

-- The key itself is NOT in this file. The owner sets its hash once (generated on the owner's computer):
--   insert into public.tafiha_secrets (name, value) values ('office_writer', '<sha256 hex>')
--   on conflict (name) do update set value = excluded.value;
