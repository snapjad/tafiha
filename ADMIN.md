# Admin area

`tafiha.com/admin.html` (not linked from the app, `noindex`). Server side: `supabase/admin.sql` (applied 2026-10-03).

## Security
- Sign in with a Tafiha account (password + Turnstile), then a TOTP code from an authenticator app. The first visit enrolls the factor (QR code).
- Every admin function checks on the server: a live session (`tafiha_require_session`), the second step (`aal2` in the JWT) and an active row in `tafiha_staff` with an allowed role. The page only displays; it can't grant anything.
- Its own session (`localStorage['tafiha.admin']`), separate from the app's. Signed out after 30 minutes without activity.
- Every change is written to `tafiha_audit` (who, what, when). A deleted account is logged by id only.
- Staff never see one person's health answers. The numbers are totals; the accounts list shows account details and the quit date.

## Roles
| Role | Sees |
| --- | --- |
| owner (مدير) | everything: numbers, accounts, team, settings, log |
| doctor (دكتور) | «اسأل دكتور» (coming with the consultation service) |
| editor (محرر محتوى) | «المحتوى»: announcements, the day's message, craving plans, milestone texts |

A team member needs a Tafiha account with the same email first; the owner adds them in «الفريق». Removing or stopping a member ends their sessions. Nobody can change or delete their own account or role from the admin area. The first owner was added directly in SQL (`insert into public.tafiha_staff (user_id, role, display_name) ...`).

## Settings (`tafiha_config`)
- `signups_open`: also enforced on the server by the auth hook `tafiha_hook_before_user_created` (Authentication → Hooks → Before User Created), for email and Google sign-ups. The app shows «إنشاء الحسابات موقّف هلأ».
- `consult_enabled`: for «اسأل دكتور» (not built yet).
- `min_version`: for the store apps later (an older app asks to update).
- Public read: `tafiha_app_config()` (no secrets in this table).

## Content (`supabase/content.sql`, applied 2026-10-03)
Owners and content editors edit in «المحتوى»; the app fetches `tafiha_public_content()` when it opens (at most every 30 minutes), keeps a copy (`localStorage['tafiha.content']`) and falls back to its built-in texts (`js/content.js`). Everything is plain text and escaped by the app.
- **Announcements**: one closable card above the home grid (the newest running one), optional start/end time and an https link. Closed ids are remembered on the device (`tafiha.dismissed`).
- **The day's message**: one line in the hero, by journey day (day 1 = quit day). Days 1–30 were seeded with starter messages.
- **Craving plans**: per trigger id (`TRIGGERS` in `js/plan.js`, plus `other`); used in «عندي رغبة» and in the report.
- **Milestone texts**: per milestone id (`MILESTONES` in `js/store.js`). Health information: changes go through the specialist.

## QA
Local preview serves `admin.html` and `js/admin/`. Use a scratch copy with a fake `js/vendor/supabase.js` (admin RPCs, `auth.mfa`) and Turnstile test keys; never test against the live project with real accounts.

## Next
1. «اسأل دكتور»: request (call or Google Meet, preferred times, optional note, consent to share the plan summary) → doctor queue in the admin area → schedule, Meet link, done; emails through Resend from an Edge Function. Terms and privacy updates before launch.
