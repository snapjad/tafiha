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
| editor (محرر محتوى) | content and announcements (next phase) |

A team member needs a Tafiha account with the same email first; the owner adds them in «الفريق». Removing or stopping a member ends their sessions. Nobody can change or delete their own account or role from the admin area. The first owner was added directly in SQL (`insert into public.tafiha_staff (user_id, role, display_name) ...`).

## Settings (`tafiha_config`)
- `signups_open`: also enforced on the server by the auth hook `tafiha_hook_before_user_created` (Authentication → Hooks → Before User Created), for email and Google sign-ups. The app shows «إنشاء الحسابات موقّف هلأ».
- `consult_enabled`: for «اسأل دكتور» (not built yet).
- `min_version`: for the store apps later (an older app asks to update).
- Public read: `tafiha_app_config()` (no secrets in this table).

## QA
Local preview serves `admin.html` and `js/admin/`. Use a scratch copy with a fake `js/vendor/supabase.js` (admin RPCs, `auth.mfa`) and Turnstile test keys; never test against the live project with real accounts.

## Next
1. Content and announcements (`tafiha_content`, fetched and cached by the app).
2. «اسأل دكتور»: request (call or Google Meet, preferred times, optional note, consent to share the plan summary) → doctor queue in the admin area → schedule, Meet link, done; emails through Resend from an Edge Function. Terms and privacy updates before launch.
