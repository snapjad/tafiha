# Savings ledger

Updated 2026-10-02. Frontend changes are local and have not been published.

## Accounting

- The dashboard shows net savings: avoided habit costs minus the existing gum/patch usage costs. Buying a pack does not immediately deduct its full purchase price; existing per-use accounting is unchanged.
- Deposits are manual records, not bank transfers. Integer cents avoid fractional currency errors.
- Earned savings continue accruing independently of deposits. Amount due is `max(0, earned - deposited)`; excess deposits appear as credit.
- A journey restart carries earned savings forward and preserves deposits. Retaking the assessment preserves deposits and synchronization deletion history.
- Savings goals use actual deposits. Share images use the same earned total as the dashboard.
- Each deposit has its own UUID, timestamp and optional plain-text note. Deleting a record requires confirmation and creates a synchronization tombstone.
- Records follow the existing per-account local storage and cloud synchronization. Offline records upload when synchronization resumes; they are not guaranteed on another device until upload succeeds.

## Validation

- Client and server validate ledger shape, positive integer cents, UUIDs, duplicate IDs and note length.
- The updated `supabase/security.sql` was checked transactionally, then applied. Existing stored documents passed compatibility validation without returning personal data.
- Live disposable-account tests passed save/restore with deposits, account isolation, rejection of malformed records and denial of logged-out sessions. Both test accounts were deleted.

## Verification

- Live counters now update savings and avoided units every second. Full panels refresh on the quit-date transition or an epoch-minute change (including same-minute-of-hour clock jumps).
- The wallet explains zero balances before the saved quit date, zero configured spending, and replacement costs exceeding accrued savings. It offers a settings action without silently changing the user's quit date.
- Browser time-travel checks cover a future quit date, crossing it without reload, one/two-day accrual, a 3 JOD advance deposit, remaining dues and reload persistence.

- `npm test`: calculation, plans, reports, merge, account storage, sync boundaries, security and savings checks passed.
- `tests/browser-features.mjs`: timer order at 1440/390/320 widths, Arabic amounts, validation, duplicate submission, reload, history deletion, credit, goal progress, gum/patch logging and undo, craving flow, share image, restart and future quit dates passed.
- `tests/browser-accounts.mjs`: account UI, recovery, import, profile, logout, deletion, offline account and responsive layout checks passed with mocked auth.
- `tests/browser-security.mjs`: text escaping, CSP, real five-page PDF and responsive assets passed.
- `tests/browser-offline.mjs`: actual service worker install, offline reload and callback exclusion passed.

These checks are not an exhaustive security certification. Remaining deployment and account-provider considerations are documented in `SECURITY_REVIEW.md` and `ACCOUNTS.md`.

## Follow-up - 2026-10-02 (Claude)

`savings()` had been half-changed to compute the amount due from the **gross** habit cost (`targetCents`), so the amount due ignored gum and patch costs. The UI, this document and `tests/savings.test.mjs` all describe it as net, and two savings tests were failing. It now uses net again: due = max(0, earned − deposited), and credit = max(0, deposited − earned). With gross, the app would ask for a deposit larger than the money actually saved, because NRT is paid from the same budget. If Jad decides due should be the full habit cost, change it in one place and update the tests and the status text together.

Browser check against a fake backend: 3 days at 2.85 JOD/day with 2 gum pieces shows 8.15 due. A deposit typed as «١٠» is saved as 10.00 and shows 1.85 credit. The deposit syncs, with no repeated writes. Animated numbers stay at 0 only while the tab is hidden (requestAnimationFrame is paused).
