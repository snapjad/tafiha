# Google Play

How طفّيها gets from this repo to Google Play. The Android app is the same web app inside a
Capacitor shell (see `capacitor.config.json`, `scripts/build-app.mjs`); this file covers signing,
the store build and the Play Console forms.

## Builds (automatic)

`.github/workflows/android.yml` runs on every push to `main` that touches the app, and on demand:

| Artifact             | What                                                        | Kept    |
| -------------------- | ----------------------------------------------------------- | ------- |
| `tafiha-debug-apk`   | test APK, installs directly on a phone                      | 30 days |
| `tafiha-play-bundle` | `app-release.aab` signed with the upload key, for Play      | 90 days |

- **Version code** = the workflow's run number (`TAFIHA_VERSION_CODE`), so every build is higher
  than the last, as Play requires. The version name stays in `android/app/build.gradle`; bump it
  for releases people will notice.
- **Signing**: Play App Signing. Google keeps the app signing key; we sign uploads with our
  *upload key*. Gradle reads it from `TAFIHA_UPLOAD_STORE` / `TAFIHA_UPLOAD_PASSWORD` (PKCS#12,
  alias `upload`), which the workflow takes from the `ANDROID_UPLOAD_KEY` secret.
- Without that secret the workflow signs with a throwaway key, only to prove the release build
  works, and keeps nothing.

## The upload key (once)

1. On the owner's computer: `node scripts/release-key.mjs`. It writes the key, a note with its
   password and fingerprints, and the secret value to a Desktop folder «مفتاح طفّيها», and copies
   the secret value to the clipboard. It never overwrites an existing key.
2. GitHub → repo Settings → Secrets and variables → Actions → New repository secret:
   name `ANDROID_UPLOAD_KEY`, value = the clipboard.
3. Back the folder up somewhere private (not this repo, which is public). A lost upload key can
   be reset through Play support, which takes days.

## Play Console (first release)

Developer account: personal, created by the owner. New personal accounts must run a
**closed test with at least 12 testers for 14 days** before they can apply for production.

Create app: name «طفّيها», default language Arabic, App, Free.

### App content

| Form                  | Answer |
| --------------------- | ------ |
| Privacy policy        | https://tafiha.com/privacy.html |
| App access            | Some features need an account: give a reviewer login (an account the owner makes and confirms, with the interview done). |
| Ads                   | No ads |
| Content rating        | Category: reference, news or educational / health. No violence, sex, gambling, user-to-user chat or location sharing. Tobacco: references only, in a quit-smoking context, no use or sale. |
| Target audience       | 18 and over |
| News app              | No |
| Health apps           | Health & fitness: smoking cessation; not a medical device; no prescription or diagnosis (see terms.html). |
| Government app        | No |
| Financial features    | None |
| Data safety           | Below |
| Account deletion URL  | https://tafiha.com/delete-account.html |

### Data safety

All data is encrypted in transit (HTTPS). Users can delete their account and data in the app,
and by email via the deletion page. Nothing is shared with third parties in Play's sense: Supabase,
Resend and Cloudflare are service providers acting for us. No ads, analytics or tracking SDKs.

| Data type                           | Collected | Required | Purpose |
| ----------------------------------- | --------- | -------- | ------- |
| Personal info: name                 | Yes       | Yes      | App functionality, account management |
| Personal info: email address        | Yes       | Yes      | Account management, app functionality |
| Personal info: phone number         | Yes       | Yes      | Account management |
| Health and fitness: health info     | Yes       | Yes      | App functionality (interview answers, plan, quit journey) |
| Financial info: other               | Yes       | Yes      | App functionality (prices entered, savings jar) |
| App activity: other user content    | Yes       | No       | App functionality (notes on savings deposits) |
| Device or other IDs                 | Yes       | Yes      | Fraud prevention and security (Turnstile check at sign-in) |

Not collected: location, contacts, photos, files, audio, messages, browsing history, purchase
history, crash or performance data.

### Store listing

Text and graphics: `assets/store/play/listing.md` (regenerate the pictures with
`node scripts/store-art.mjs`).

### Releasing

1. Testing → Closed testing → create a track, add testers (an email list or a Google Group),
   upload `app-release.aab` from the latest `tafiha-play-bundle`, roll out.
2. After 14 days with 12+ opted-in testers: Dashboard → apply for production access.
3. Each later release: push to `main`, wait for the workflow, upload the new bundle.
