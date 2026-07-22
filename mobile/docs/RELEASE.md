# Release checklist — TestFlight → App Store

How to get the Klect mobile app (Expo SDK 54 / EAS) onto **TestFlight** and then the
**App Store**. Build/signing is handled by **EAS** (`eas build` / `eas submit`); app version
comes from `appVersionSource: "remote"` and `production.autoIncrement` in `eas.json`.

## Config gaps to close first

These are wrong/placeholder in the repo today and block a real production build:

- [x] **Bundle identifier** — set to `com.klect.app` across `ios.bundleIdentifier`,
      `android.package`, and the share-extension **App Group** (`group.com.klect.app`).
- [x] **Production API URL** — `eas.json` `production` profile sets
      `env.EXPO_PUBLIC_API_URL = https://klect.vercel.app` (the deployed web app), so
      device builds hit the live API instead of localhost. The local `mobile/.env` stays dev-only.
- [x] **Near me map token** — the **public** `pk.` Mapbox token is stored as an **EAS environment
      variable** `EXPO_PUBLIC_MAPBOX_TOKEN` on the `production` environment (`eas env:create
      --environment production --name EXPO_PUBLIC_MAPBOX_TOKEN --value pk... --visibility plaintext`),
      *not* committed to `eas.json` — GitHub push protection rejects Mapbox tokens even public ones.
      `EXPO_PUBLIC_*` values are inlined at bundle time; the untracked `mobile/.env` is **not** in the
      EAS build, so without this the token ships as `null` → the Near me map renders blank (logo only,
      no tiles). `eas build` (incl. `--local`) pulls EAS env vars automatically. The **secret**
      `MAPBOX_DOWNLOAD_TOKEN` (`sk.`) is build-time only (fetches the native SDK via `app.config.js`)
      and stays in local `mobile/.env` for the local build. Verify a build inlines the runtime token:
      `strings <bundle>.hbc | grep pk.eyJ`.
- [ ] **iOS icon** — `app.json` `ios.icon` is `./assets/expo.icon`; confirm it resolves to a real
      1024×1024 PNG (root `icon` is `./assets/images/icon.png`).
- [x] **`eas.json` `submit.production.ascAppId`** — set to `6789320507` (the App Store Connect
      Apple ID for the new `com.klect.app` app). The old `6788942895` was the `com.saive.app` record
      and can't accept a `com.klect.app` build. Apple ID `ryanlugtu@gmail.com` + Team ID
      `UMPLL5A8L3` are unchanged.
- [ ] **Web deployment auth config (mobile Google login depends on it)** — the deployed web app's
      **`BETTER_AUTH_URL` must equal the mobile build's `EXPO_PUBLIC_API_URL`**
      (`https://klect.vercel.app`), and Google Cloud Console must list
      `https://klect.vercel.app/api/auth/callback/google` as an authorized redirect URI. If
      `BETTER_AUTH_URL` points elsewhere (e.g. the old `saive-three.vercel.app`), the mobile Google
      flow completes but loads the web app instead of deep-linking back via `klect://`. Config only —
      no rebuild needed. Verify: `curl -s -X POST https://klect.vercel.app/api/auth/sign-in/social -H
      'Content-Type: application/json' -d '{"provider":"google","callbackURL":"klect://"}'` — the
      returned Google URL's `redirect_uri` must be on `klect.vercel.app`.

## Phase 1 — TestFlight

- [ ] **Apple Developer Program** enrollment active ($99/yr).
- [ ] Web app deployed to a public HTTPS URL (DONE) and wired into the production build.
- [ ] Real bundle identifier set (see above).
- [ ] **Register identifiers** in the Apple Developer portal (the rename to `com.klect.app` is a
      new app identity — the old `com.saive.app` records don't transfer):
      - `com.klect.app` with the **App Groups** capability + `group.com.klect.app`.
      - `com.klect.app.ShareExtension` (the share extension) with the **same** app group
        `group.com.klect.app` (also serves as the shared **keychain access group** the extension
        reads the bearer token from). `expo-share-extension` generates + provisions this extension
        itself — **do not** add a manual `extra.eas.build.experimental.ios.appExtensions` block to
        `app.json`. A manual entry is a duplicate that crashes `expo config` / every `eas` command;
        `expo prebuild` / EAS keep re-adding it, so strip it whenever it reappears.
- [x] **App record created** in App Store Connect for **`com.klect.app`** (a *new* app, not the
      old Saive record); its Apple ID (`6789320507`) is in `eas.json` `submit.production.ascAppId`.
- [x] `eas whoami` logged in; project linked to a fresh EAS project **`@ryanlugtu/klect`**
      (projectId `1047d87e-…`) whose slug matches `app.json`, so `eas project:info` resolves clean.
- [ ] Production build: `eas build --platform ios --profile production`.
- [ ] Submit: `eas submit --platform ios --profile production`.
- [ ] TestFlight **export-compliance** answered; internal testers added.
- [ ] Smoke-test on a physical device: auth against the deployed API, share-extension (share a
      URL in), Near me / location, video playback, theme switching.

## Phase 2 — App Store submission

- [ ] **Metadata**: name, subtitle, description, keywords, category, support + marketing URLs.
- [ ] **Screenshots** for required device sizes (6.7" required; add others as needed).
- [ ] **App Privacy** nutrition label — declare **Email, Name, User ID, Precise Location, and User
      Content** (all "App Functionality", not used for tracking). This mirrors the on-device
      **privacy manifest** now declared in `app.json` `ios.privacyManifests`
      (`NSPrivacyCollectedDataTypes` + the required-reason `NSPrivacyAccessedAPITypes`) — keep the two
      in sync.
- [x] **Privacy Policy URL** (hosted, required for review) — live at
      **`https://klect.vercel.app/privacy`** (public, no login; `web/src/app/privacy/page.tsx`).
      Paste this into App Store Connect → App Privacy → Privacy Policy URL. Also linked in-app from
      Settings on both platforms.
- [x] **Terms of Use / EULA URL** (required for UGC apps, Guideline 1.2) — live at
      **`https://klect.vercel.app/terms`** (public, no login; `web/src/app/terms/page.tsx`); states
      the zero-tolerance policy + 24-hour moderation. Paste into App Store Connect → App Information →
      License Agreement (or use the default EULA). Linked in-app from Settings + the sign-in screen.
- [x] **UGC moderation** (Guideline 1.2, the top rejection risk) — **block** + **report** shipped on
      both apps: block/report a user from their profile or a DM, report a comment/DM/list-chat
      message, and a Blocked-users manager in Settings (`moderation.*`). Full block hides users from
      each other and stops DMs/requests. Mention these in App Review notes.
- [x] **Account deletion** (App Store requirement for apps with account creation) — Settings →
      Danger zone → Delete account (type-your-@handle to confirm); permanently deletes the user and
      all owned data via `account.delete`. Mention the in-app path in App Review notes.
- [x] **Unused location permission strings removed** — `app.json` `expo-location` now passes
      `locationAlwaysAndWhenInUsePermission: false` + `locationAlwaysPermission: false`, so the build
      ships **only** `NSLocationWhenInUseUsageDescription` (the app is when-in-use only).
- [ ] **Age rating** questionnaire.
- [ ] **Demo account** credentials in App Review notes (the app is auth-gated).
- [ ] Bump version, submit for **App Review**, then release (manual or automatic).

### App Review notes (paste into App Store Connect → App Review Information → Notes)

> Klect is invite/account-based; sign in with the demo account below (or create one with email +
> password). **Safety controls (Guideline 1.2):** every user profile and DM has **Block** and
> **Report**; comments, direct messages, and list-chat messages each have a **Report** action;
> blocked users are managed under **Settings → Safety & privacy → Blocked users**. Our **Terms of
> Use** (zero-tolerance policy) is at https://klect.vercel.app/terms and is linked in-app from the
> sign-in screen and Settings. **Account deletion:** Settings → Danger zone → Delete account
> (type-your-@handle to confirm). Reports are reviewed and acted on within 24 hours.

## Handy commands

```sh
eas whoami
eas build --platform ios --profile production
eas submit --platform ios --profile production
```
