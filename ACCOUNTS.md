# Accounts handoff - 2026-10-02

Continues the account work started by Claude. No deployment or Git commit was made in this session.

## Implemented

- Responsive Arabic signup/login, phone country selection, password visibility, email confirmation, recovery codes and reset-link callbacks.
- Account screen: edit name/phone, request a password reset, sign out, and explicitly confirm account deletion.
- Google OAuth appears only when the provider is enabled in Supabase. The frontend integration is present.
- An existing account can use its cached journey offline. A failed server read on a new device is not treated as an empty account.
- `store.js` owns scoped storage: the original `tafiha.v1` is a guest journey, and `tafiha.v1:<user id>` belongs only to that account.
- Importing a guest journey requires an explicit choice. The local guest copy and pairing key are retired only after the account copy is saved. Failed remote migration retains a retry marker.
- Legacy server rows are retained during migration as a recovery source; `tafiha_me_adopt` is deliberately not called because its previous implementation deletes the source before the frontend has saved the merged result. Deleting an account deletes its account document, not separately retained legacy-device rows.
- Sync uses the bundled Supabase client, optimistic revisions, conflict merging, abortable requests, and guards against responses from a previous account. JSON object key ordering does not trigger redundant writes.
- Service worker cache v10 includes the account modules and bundled SDK.

## Verified

- `npm test`: existing number/plan/report/merge checks plus account-storage, international-number and sync regression tests.
- `tests/browser-accounts.mjs`: Playwright against a local preview with mocked transport. Covers signup, repeated tab switches, errors, recovery, reset callback, migration, editing, logout, deletion, offline cache, failed sync, keyboard focus and 320/375/844/1440px layouts. Screenshots are in ignored `.qa/`.
- `tests/live-accounts.mjs`: real signup/password login, profile edit, account RPCs, revision conflicts and separation of two disposable accounts. Both test accounts were deleted. This script refuses to run unless `TAFIHA_LIVE_TEST=1` and the server already has email auto-confirm enabled, so it cannot accidentally send confirmation emails.

Browser checks need `PLAYWRIGHT_MODULE` (absolute path to Playwright's `index.mjs`) and `TAFIHA_CDP` (a dedicated test browser's CDP URL). `TAFIHA_PREVIEW` defaults to `http://127.0.0.1:5186`.

## External setup still needed

Read-only provider check on this date returned: Google disabled, email enabled, phone disabled, email auto-confirm enabled. These settings were not changed.

- Configure the project's Google OAuth client and enable Google in Supabase. No Google secret is available in this codebase.
- ~~Transactional email~~: done 2026-10-03, see "Email" below.
- Phone is stored in user metadata only. It is not verified and cannot be used to log in yet.
- Native Capacitor packaging and native OAuth callbacks remain future work. Existing font/PDF CDN dependencies are also unchanged.

References: [Google provider setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [transactional email](https://supabase.com/docs/guides/auth/auth-smtp).

## Follow-up - 2026-10-02 (Claude)

Product decision from Jad: **the interview comes first, and an account is required to see the report.** The flow was changed to match:

- New visitor: interview → account screen («تقريرك جاهز يا …», no skip) → report → dashboard. The first interview screen has «عندي حساب، سجّل دخول» for returning users (its back button returns to the interview). The old device-pairing button there was removed.
- The answers wait in `localStorage['tafiha.pending']` (validated with `assertAssessment`) until sign-in, so a reload or the Google redirect doesn't lose them. They're turned into the plan right after sign-in and then cleared.
- Data from before accounts (`tafiha.v1`, no session): «رحلتك بتكمّل معك» account screen. Skipping is only offered when the device is offline. After sign-in, the existing "add your journey?" choice runs.
- Removed the local-only mode (`S.localMode` / `setLocalMode`).

Fixes:
- **Write loop:** `merge.same()` treated `undefined` fields as differences. Cigarette-only journeys have some in their vape/argileh settings, so after every save `again` was set, and the app pushed every ~300 ms while the report was open (37 writes in 12 s in the browser). `same()` now compares as saved JSON. Regression test in `tests/sync.test.mjs`; it fails on the old comparison.
- **PDF:** `report.js` pointed at `js/vendor/html2canvas.js` and `js/vendor/jspdf.js`, which didn't exist, so PDF download was broken. Both are now bundled; they're byte-identical to the cdnjs files used before (html2canvas 1.4.1, jsPDF 2.5.1).
- `tests/accounts.test.mjs` saved incomplete journeys that `security.js` rejects; it now uses `createState`.
- New `tests/security.test.mjs`: journeys the app really produces (interviews, logs, cravings, slips, undo tombstones, merges, re-takes, the first-version shape) must pass `assertState`, so the checks can't lock anyone out of their data.
- `sw.js`: cache v11, now includes `security.js` and the two PDF libraries. cdnjs is no longer used.

Verified in a browser against a fake backend (no real accounts created):
- the interview → account → report → dashboard flow, and reloading on the account screen
- every validation message, and the "email already has an account" message
- Arabic digits in the phone number
- logout, then login through «عندي حساب», including a wrong password
- migrating a pre-accounts journey (days, gum, cravings kept; guest copy retired after the save)
- deleting the account
- the PDF builds from the bundled libraries (4 pages)
- 2 server writes in total after signing up

Still open: see "External setup" above (the Google OAuth client).

## Security Follow-up - 2026-10-02

See `SECURITY_REVIEW.md` for the current audit and deployment status. Supabase hardening was applied and live-tested. The adoption RPC is now non-destructive, logged-out sessions are rejected, and database input checks are stronger. Browser changes remain local: restrictive CSP, validated stored/remote data, hardened service-worker caching, jsPDF 4.2.1 from verified npm assets, restricted localhost preview, and synced-cache cleanup on logout. The current browser tests follow the interview-first flow above. Apply database files in this order for a fresh setup: `schema.sql`, `accounts.sql`, `security.sql`.

## Privacy follow-up - 2026-10-02 (Claude)

- `supabase/privacy.sql` (applied): `tafiha_me_retire_legacy(k)` deletes a pre-accounts `tafiha_profiles` row. It requires a live session and only works once the caller's account document exists. The client calls it right after the push that saved the merged legacy copy (`meta.legacyKey` → `meta.retireKey`), and retries on the next open until the server confirms. Account deletion therefore erases everything for that person. Apply order for a fresh setup: `schema.sql`, `accounts.sql`, `security.sql`, `privacy.sql`.
- Legal pages: `privacy.html`, `terms.html` and `delete-account.html` (the deletion URL Google Play needs). They're linked from the signup form and the account sheet. The contact address `support@tafiha.com` must exist before launch.
- Brand swap is prepared: see `BRAND.md` and `scripts/brand.mjs`.

## Security hardening - 2026-10-03 (Claude)

`supabase/hardening.sql` (applied):
- Closes the anonymous pre-accounts endpoints.
- `tafiha_pull` is now session-only.
- Adds `tafiha_me_channel()` (the secret realtime channel name) and a nightly retention job.

Apply order for a fresh setup: `schema.sql`, `accounts.sql`, `security.sql`, `privacy.sql`, `hardening.sql`.

Client changes:
- Without an account nothing is synced and the pairing UI is gone.
- Password rule: 8+ characters with a Latin letter and a digit (matches Supabase), plus a common-password list.
- "Sign out of all devices".
- A frame guard.
- Fonts are self-hosted.

The open items are in the local SECURITY_REVIEW.md: Turnstile CAPTCHA, HTTP headers through Cloudflare, CAA, and the HIBP check (Pro).

## Email - 2026-10-03
- DNS for tafiha.com is on Cloudflare. support@tafiha.com is forwarded by Cloudflare Email Routing.
- Auth emails go through Resend (domain tafiha.com, region eu-west-1, verified) as Supabase custom SMTP: `smtp.resend.com:465`, user `resend`, sender `طفّيها <no-reply@tafiha.com>`. The password is a Resend "sending access" key limited to tafiha.com; it lives only in Supabase.
- Templates (confirmation, recovery, email change) are Arabic, RTL, and carry only the 6-digit `{{ .Token }}`, valid 15 minutes. The app's code screen matches (no links).
- Email confirmation is on (`mailer_autoconfirm=false`). Signup → code screen → `verifyOtp({ type: 'signup' })`. Signing in to an unconfirmed account resends the code and opens the same screen.
- `tests/live-accounts.mjs` now refuses to run (it needs auto-confirm), which is intended: no test accounts on the live project.

## Bot check (Turnstile) - 2026-10-03
- Cloudflare Turnstile widget `tafiha-auth` (managed mode, hostname tafiha.com). The site key is in `js/config.js`; the secret is only in Supabase (Authentication → Attack Protection → CAPTCHA, provider Turnstile).
- `js/captcha.js` mounts one widget per auth screen, outside the steps (switching steps doesn't restart it). It solves in the background, shows itself only when a person has to click (`appearance: 'interaction-only'`, Arabic), and is reset after every request because a token works once.
- Calls that send a token: sign up, password sign-in, password reset, resend code. `verifyOtp`, `updateUser` and Google don't need one.
- It runs only on `TURNSTILE_HOSTS`. Local previews and tests use mocks. For a QA run with the widget, use Cloudflare's test site keys (`1x00000000000000000000AA` passes, `3x00000000000000000000FF` forces a click) and add `localhost` to the hosts in a scratch copy.
- CSP allows `https://challenges.cloudflare.com` in `script-src` and `frame-src` only. The page referrer policy is `strict-origin-when-cross-origin` (other sites see the origin, never the path or query).
- Capacitor later: the app's WebView origin must be one of the widget's hostnames (set Capacitor `server.hostname` to tafiha.com, or add the app hostname to the widget).
- "Change password" in the account sheet now opens the auth screen in `password` mode: a code to the account email, then the new password. The old `sendPasswordReset` (link-based) is gone.
