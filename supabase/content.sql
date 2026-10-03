-- طفّيها — admin area, part 2: content the team edits (2026-10-03).
-- Apply after admin.sql. Kinds:
--   announcement: a closable card on the home screen, with optional dates and an https link
--   daily:        the message for day N of the journey (key = N, 1 = quit day)
--   craving:      the plan shown for a craving trigger (key = trigger id, 'other' = generic)
--   milestone:    a health milestone's text (key = milestone id from js/store.js)
-- The app falls back to its built-in texts for anything not here. Everything is plain text and
-- is escaped by the app.
begin;

create table if not exists public.tafiha_content (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('announcement', 'daily', 'craving', 'milestone')),
  key text not null default '' check (key ~ '^[a-z0-9-]{0,20}$'),
  title text not null default '' check (length(title) <= 80),
  body text not null check (length(body) between 1 and 600),
  link text not null default '' check (link = '' or (length(link) <= 300 and link ~ '^https://[^\s<>"]+$')),
  link_label text not null default '' check (length(link_label) <= 30),
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index if not exists tafiha_content_kind_key on public.tafiha_content (kind, key) where kind <> 'announcement';
alter table public.tafiha_content enable row level security;
revoke all on table public.tafiha_content from anon, authenticated;

-- Public: what the app shows right now.
create or replace function public.tafiha_public_content() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'kind', kind, 'key', key, 'title', title, 'body', body,
      'link', link, 'link_label', link_label, 'starts_at', starts_at, 'ends_at', ends_at
    ) order by kind, key, updated_at desc), '[]'::jsonb)
  from public.tafiha_content
  where active
    and (kind <> 'announcement' or ((starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())));
$$;
revoke all on function public.tafiha_public_content() from public;
grant execute on function public.tafiha_public_content() to anon, authenticated;

create or replace function public.tafiha_admin_content(k text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.tafiha_staff_check(array['owner', 'editor']);
  return coalesce((
    select jsonb_agg(to_jsonb(c) - 'updated_by' order by c.key, c.updated_at desc)
    from public.tafiha_content c where c.kind = k
  ), '[]'::jsonb);
end $$;
revoke all on function public.tafiha_admin_content(text) from public, anon;
grant execute on function public.tafiha_admin_content(text) to authenticated;

-- Saves one item: an announcement by id (new when id is null), the others by kind + key.
create or replace function public.tafiha_admin_content_save(item jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  k text := item ->> 'kind';
  key_ text := coalesce(item ->> 'key', '');
  saved uuid;
begin
  perform public.tafiha_staff_check(array['owner', 'editor']);
  if k = 'announcement' then key_ := '';
  elsif k = 'daily' then
    if key_ !~ '^[1-9][0-9]{0,2}$' then raise exception 'invalid value'; end if;
  elsif k in ('craving', 'milestone') then
    if key_ !~ '^[a-z0-9-]{1,20}$' then raise exception 'invalid value'; end if;
  else
    raise exception 'invalid value';
  end if;
  if k = 'announcement' and nullif(item ->> 'id', '') is not null then
    update public.tafiha_content set
      title = coalesce(item ->> 'title', ''), body = item ->> 'body',
      link = coalesce(item ->> 'link', ''), link_label = coalesce(item ->> 'link_label', ''),
      active = coalesce((item ->> 'active')::boolean, true),
      starts_at = nullif(item ->> 'starts_at', '')::timestamptz, ends_at = nullif(item ->> 'ends_at', '')::timestamptz,
      updated_at = now(), updated_by = me
    where id = (item ->> 'id')::uuid and kind = 'announcement'
    returning id into saved;
    if saved is null then raise exception 'invalid value'; end if;
  elsif k = 'announcement' then
    insert into public.tafiha_content (kind, key, title, body, link, link_label, active, starts_at, ends_at, updated_by)
    values (k, '', coalesce(item ->> 'title', ''), item ->> 'body', coalesce(item ->> 'link', ''), coalesce(item ->> 'link_label', ''),
            coalesce((item ->> 'active')::boolean, true), nullif(item ->> 'starts_at', '')::timestamptz, nullif(item ->> 'ends_at', '')::timestamptz, me)
    returning id into saved;
  else
    insert into public.tafiha_content (kind, key, body, active, updated_by)
    values (k, key_, item ->> 'body', coalesce((item ->> 'active')::boolean, true), me)
    on conflict (kind, key) where kind <> 'announcement'
    do update set body = excluded.body, active = excluded.active, updated_at = now(), updated_by = me
    returning id into saved;
  end if;
  perform public.tafiha_audit_add(me, 'content.save', k || ':' || coalesce(nullif(key_, ''), saved::text));
  return saved;
end $$;
revoke all on function public.tafiha_admin_content_save(jsonb) from public, anon;
grant execute on function public.tafiha_admin_content_save(jsonb) to authenticated;

-- Deletes an item; for craving plans and milestones the app goes back to its built-in text.
create or replace function public.tafiha_admin_content_delete(target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); k text; key_ text;
begin
  perform public.tafiha_staff_check(array['owner', 'editor']);
  delete from public.tafiha_content where id = target returning kind, key into k, key_;
  if k is null then raise exception 'invalid value'; end if;
  perform public.tafiha_audit_add(me, 'content.delete', k || ':' || coalesce(nullif(key_, ''), target::text));
end $$;
revoke all on function public.tafiha_admin_content_delete(uuid) from public, anon;
grant execute on function public.tafiha_admin_content_delete(uuid) to authenticated;

-- Starter messages for the first 30 days (edit them in the admin area).
insert into public.tafiha_content (kind, key, body) values
  ('daily', '1', 'أول يوم. مش لازم تكون بطل، بس لا تولّعها اليوم.'),
  ('daily', '2', 'اليوم التاني. كل رغبة بتعدّيها بتخلّي اللي بعدها أضعف.'),
  ('daily', '3', 'اليوم التالت غالباً الأصعب، ومن بكرا بتبلّش تخف. كمّل.'),
  ('daily', '4', 'اشرب مي كتير اليوم، وخلّي معك علكة أو إشي تقرمشه.'),
  ('daily', '5', 'خمس أيام! جرّب مشوار قصير بدل البريك.'),
  ('daily', '6', 'إذا حسّيت بعصبية، هاد طبيعي ومؤقت. خبّر اللي حواليك.'),
  ('daily', '7', 'أسبوع كامل! عدّيت أصعب أسبوع.'),
  ('daily', '8', 'الرغبة موجة: بتعلى وبتنزل. كبسة «عندي رغبة» وبتعدّي.'),
  ('daily', '9', 'شفت قديش وفّرت؟ فوت على التوفير وشوف.'),
  ('daily', '10', 'عشر أيام. عادة جديدة عم تنبني، يوم ورا يوم.'),
  ('daily', '11', 'القهوة بدونها غريبة بالأول، وبعدين بتصير عادية.'),
  ('daily', '12', 'إذا زلّيت، ما خربت الرحلة. سجّلها وكمّل.'),
  ('daily', '13', 'ريحة إيديك وتيابك صارت أحلى. حدا لاحظ؟'),
  ('daily', '14', 'أسبوعين! كل يوم بيصير أسهل من اللي قبله.'),
  ('daily', '15', 'نص شهر. فكّر بإشي بدك تشتريه من التوفير.'),
  ('daily', '16', 'السهرة جاية؟ خليك جاهز بعلكة وكاسة مي.'),
  ('daily', '17', 'الأيام الصعبة صارت أقل. وإذا إجا يوم صعب، عادي.'),
  ('daily', '18', 'حط سبب تركك خلفية لتلفونك.'),
  ('daily', '19', 'جرّب إشي جديد هالأسبوع: رياضة، طبخ، أي إشي بتحبه.'),
  ('daily', '20', 'عشرين يوم! شاركها بالستوري إذا بدك.'),
  ('daily', '21', 'تلات أسابيع. العادة صارت أضعف من أول بكتير.'),
  ('daily', '22', 'خليك لطيف مع حالك اليوم. إنت عم تعمل إشي صعب.'),
  ('daily', '23', 'إذا حدا عرض عليك: «لا شكراً، أنا تارك». بس هيك.'),
  ('daily', '24', 'نومك عم يتحسن؟ إذا لأ، خفّف القهوة بالمسا.'),
  ('daily', '25', 'خمسة وعشرين يوم بدون ما تولّعها.'),
  ('daily', '26', 'فكّر بحدا بدك تكون قدوة إله.'),
  ('daily', '27', 'إذا بتستعمل علكة أو لزقة، كمّل خطتك لآخرها.'),
  ('daily', '28', 'أربع أسابيع. الرغبات صارت أقصر، صح؟'),
  ('daily', '29', 'بكرا شهر! جهّز حالك تحتفل بإشي بتحبه.'),
  ('daily', '30', 'شهر كامل! إنت صرت من الناس اللي تركوا.')
on conflict (kind, key) where kind <> 'announcement' do nothing;

commit;
