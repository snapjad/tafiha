-- طفّيها — reminder emails on the days that matter: the day before the quit day, the quit day, and
-- days 3, 7 and 30 after it. One of each per account, ever. Sent through Resend from the database
-- (pg_cron every hour 9:00–20:00 Amman, pg_net for the call). Nothing is sent until the Resend key
-- is stored (scripts/mail-key.mjs) — tafiha_mail_run() returns 0 without it.
-- Every email carries a link that stops them (unsubscribe.html → tafiha_mail_unsubscribe), and the
-- settings sheet has a switch (tafiha_me_mail). Only confirmed, not banned accounts get them.
begin;

create extension if not exists pg_net;

create table if not exists public.tafiha_mail_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  request_id bigint,
  primary key (user_id, kind)
);
create table if not exists public.tafiha_mail_optout (
  user_id uuid primary key references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.tafiha_mail_log enable row level security;
alter table public.tafiha_mail_optout enable row level security;
revoke all on public.tafiha_mail_log, public.tafiha_mail_optout from public, anon, authenticated;

-- the key that signs unsubscribe links
insert into public.tafiha_secrets (name, value)
select 'mail', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (select 1 from public.tafiha_secrets where name = 'mail');

create or replace function public.tafiha_mail_token(uid uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select uid::text || '.' || left(encode(extensions.hmac(uid::text, (select value from public.tafiha_secrets where name = 'mail'), 'sha256'), 'hex'), 32)
$$;
revoke all on function public.tafiha_mail_token(uuid) from public, anon, authenticated;

-- from the link in an email: no sign-in needed, the signature is the proof
create or replace function public.tafiha_mail_unsubscribe(t text) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare uid uuid;
begin
  if t is null or t !~ '^[0-9a-f-]{36}\.[0-9a-f]{32}$' then return false; end if;
  uid := split_part(t, '.', 1)::uuid;
  if public.tafiha_mail_token(uid) <> t then return false; end if;
  insert into public.tafiha_mail_optout (user_id) values (uid) on conflict (user_id) do nothing;
  return true;
end $$;
revoke all on function public.tafiha_mail_unsubscribe(text) from public;
grant execute on function public.tafiha_mail_unsubscribe(text) to anon, authenticated;

-- the switch in the settings: null reads it, true/false sets it. Returns whether emails are on.
create or replace function public.tafiha_me_mail(want boolean default null) returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare uid uuid := public.tafiha_require_session();
begin
  if want is true then delete from public.tafiha_mail_optout where user_id = uid; end if;
  if want is false then insert into public.tafiha_mail_optout (user_id) values (uid) on conflict (user_id) do nothing; end if;
  return not exists (select 1 from public.tafiha_mail_optout where user_id = uid);
end $$;
revoke all on function public.tafiha_me_mail(boolean) from public, anon;
grant execute on function public.tafiha_me_mail(boolean) to authenticated;

create or replace function public.tafiha_mail_esc(v text) returns text
language sql immutable set search_path = ''
as $$ select replace(replace(replace(replace(replace(coalesce(v, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;') $$;

-- subject and body for one kind
create or replace function public.tafiha_mail_body(kind text, name text, token text) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  n text := public.tafiha_mail_esc(nullif(trim(name), ''));
  hi text := case when n = '' then 'مرحبا،' else 'مرحبا ' || n || '،' end;
  subject text; lines text[]; cta text := 'افتح خطتك';
  link text := 'https://tafiha.com/?utm_source=email&utm_campaign=' || kind;
  stop text := 'https://tafiha.com/unsubscribe.html?t=' || token;
  html text; plain text;
begin
  case kind
    when 'eve' then
      subject := 'بكرا يومك';
      lines := array['بكرا يوم الإقلاع. الليلة جهّز حالك بثلاث خطوات:',
        '١. شيل السجاير والولاعات والطفّايات من البيت والسيارة.',
        '٢. إذا خطتك فيها علكة نيكوتين، خلّيها جاهزة معك.',
        '٣. قرر شو رح تعمل أول ساعة الصبح بدل السيجارة.'];
    when 'day0' then
      subject := 'اليوم يومك';
      lines := array['اليوم يوم الإقلاع. أول رغبة رح تيجي، وبتعدّي خلال دقايق.',
        'لما تيجي، افتح طفّيها واكبس «عندي رغبة»، وخلّينا نعدّيها سوا.',
        'وبآخر اليوم سجّل يومك بكبسة.'];
      cta := 'افتح طفّيها';
    when 'day3' then
      subject := 'صارلك ٣ أيام';
      lines := array['صارلك ٣ أيام من يوم الإقلاع. هاي أصعب أيام، وعم تعدّيها.',
        'خلال هالأيام النيكوتين بيطلع من جسمك، والنفَس بيصير أسهل.',
        'إذا زلّيت، عادي. سجّلها وارجع لخطتك من هلأ.'];
    when 'week1' then
      subject := 'أسبوع كامل';
      lines := array['صارلك أسبوع من يوم الإقلاع.',
        'افتح طفّيها وشوف قديش وفّرت، وحط التوفير بالحصّالة لهدف بتحبه.',
        'الأسابيع الجاية الرغبات بتقل، بس السهرات بتضل صعبة. جهّز حالك قبلها.'];
    when 'month1' then
      subject := 'شهر من يوم الإقلاع';
      lines := array['صارلك شهر. هاد إنجاز كبير.',
        'كافئ حالك من المصاري اللي وفّرتها، وخلّي خطتك للحظات الصعبة جاهزة.',
        '«وحدة بس» هي أشهر سبب للرجوع. لا تجرّبها.'];
    else return null;
  end case;
  plain := hi || E'\n\n' || array_to_string(lines, E'\n') || E'\n\n' || cta || ': ' || link || E'\n\nطفّيها\nما بدك هالإيميلات؟ ' || stop;
  html := '<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;padding:0;background:#f3f3f4">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f3f4"><tr><td align="center" style="padding:24px 12px">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;font-family:Tahoma,Arial,sans-serif;color:#1b1716;text-align:right" dir="rtl">'
    || '<tr><td style="padding:22px 24px 6px;font-size:22px;font-weight:bold;color:#e1261c">طفّيها</td></tr>'
    || '<tr><td style="padding:6px 24px 0;font-size:20px;font-weight:bold">' || subject || '</td></tr>'
    || '<tr><td style="padding:14px 24px 0;font-size:16px;line-height:1.9">' || hi || '<br>' || array_to_string(lines, '<br>') || '</td></tr>'
    || '<tr><td style="padding:22px 24px"><a href="' || link || '" style="display:inline-block;background:#e1261c;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:13px 26px;border-radius:12px">' || cta || '</a></td></tr>'
    || '<tr><td style="padding:0 24px 22px;font-size:12px;line-height:1.8;color:#726c69">وصلك هالإيميل لأنه عندك حساب على طفّيها. <a href="' || stop || '" style="color:#726c69">ما بدي إيميلات التذكير</a></td></tr>'
    || '</table></td></tr></table></body></html>';
  return jsonb_build_object('subject', subject, 'html', html, 'text', plain);
end $$;
revoke all on function public.tafiha_mail_body(text, text, text) from public, anon, authenticated;

-- which emails are due now (Amman calendar days from the quit day), at most `lim`
create or replace function public.tafiha_mail_due(lim integer default 200)
returns table (user_id uuid, email text, name text, kind text)
language sql stable security definer set search_path = ''
as $$
  with j as (
    select u.id, u.email, u.created_at, a.data->>'name' as name,
      to_timestamp((a.data->>'quitAt')::numeric / 1000) as quit_at
    from auth.users u
    join public.tafiha_accounts a on a.user_id = u.id
    where u.email is not null and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until < now())
      and jsonb_typeof(a.data->'quitAt') = 'number'
      and not exists (select 1 from public.tafiha_mail_optout o where o.user_id = u.id)
  ), d as (
    select j.*, ((j.quit_at at time zone 'Asia/Amman')::date - (now() at time zone 'Asia/Amman')::date) as days
    from j
  ), k as (
    select d.id, d.email, d.name,
      case
        when d.days = 1 then 'eve'
        when d.days = 0 and d.quit_at <= now() + interval '3 hours' and d.created_at < d.quit_at - interval '12 hours' then 'day0'
        when d.days = -3 then 'day3'
        when d.days = -7 then 'week1'
        when d.days = -30 then 'month1'
      end as kind
    from d
  )
  select k.id, k.email, k.name, k.kind from k
  where k.kind is not null
    and not exists (select 1 from public.tafiha_mail_log l where l.user_id = k.id and l.kind = k.kind)
  limit greatest(1, least(coalesce(lim, 200), 500))
$$;
revoke all on function public.tafiha_mail_due(integer) from public, anon, authenticated;

-- send what's due; returns how many went out
create or replace function public.tafiha_mail_run() returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare key text; r record; b jsonb; req bigint; n integer := 0; stop text;
begin
  select value into key from public.tafiha_secrets where name = 'resend';
  if key is null or key = '' then return 0; end if;
  for r in select * from public.tafiha_mail_due(200) loop
    b := public.tafiha_mail_body(r.kind, r.name, public.tafiha_mail_token(r.user_id));
    if b is null then continue; end if;
    stop := 'https://tafiha.com/unsubscribe.html?t=' || public.tafiha_mail_token(r.user_id);
    select net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'from', 'طفّيها <no-reply@tafiha.com>',
        'to', jsonb_build_array(r.email),
        'subject', b->>'subject', 'html', b->>'html', 'text', b->>'text',
        'headers', jsonb_build_object('List-Unsubscribe', '<' || stop || '>')),
      timeout_milliseconds := 10000) into req;
    insert into public.tafiha_mail_log (user_id, kind, request_id) values (r.user_id, r.kind, req)
    on conflict (user_id, kind) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.tafiha_mail_run() from public, anon, authenticated;

-- every hour at :05 from 06:00 to 17:00 UTC = 9:00–20:00 in Amman
select cron.unschedule(jobid) from cron.job where jobname = 'tafiha-mail';
select cron.schedule('tafiha-mail', '5 6-17 * * *', 'select public.tafiha_mail_run()');

commit;
