-- طفّيها — the account's realtime channel becomes private (2026-11-08).
-- Apply after hardening.sql (it uses public.tafiha_me_channel from there).
--
-- Until now the channel was public: its name (an HMAC of the user id, hardening.sql) was the
-- only thing keeping others out. With these rules Realtime lets a signed-in person join, hear
-- and send on one channel only: their own account's. The app joins it with private: true
-- (js/sync.js). Once every copy of the app does, public channels are switched off in the
-- project's Realtime settings, so the name alone no longer opens anything.
begin;

drop policy if exists "tafiha own channel: listen" on realtime.messages;
create policy "tafiha own channel: listen" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) = (select public.tafiha_me_channel()));

drop policy if exists "tafiha own channel: send" on realtime.messages;
create policy "tafiha own channel: send" on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and (select realtime.topic()) = (select public.tafiha_me_channel()));

commit;
