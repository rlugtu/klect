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
- [ ] **iOS icon** — `app.json` `ios.icon` is `./assets/expo.icon`; confirm it resolves to a real
      1024×1024 PNG (root `icon` is `./assets/images/icon.png`).
- [x] **`eas.json` `submit.production`** — Apple ID `ryanlugtu@gmail.com`, ascAppId `6788942895`,
      Team ID `UMPLL5A8L3`.

## Phase 1 — TestFlight

- [ ] **Apple Developer Program** enrollment active ($99/yr).
- [ ] Web app deployed to a public HTTPS URL (DONE) and wired into the production build.
- [ ] Real bundle identifier set (see above).
- [ ] App record created in **App Store Connect** + bundle ID registered in the Developer portal.
- [ ] `eas whoami` logged in; project linked to `projectId` in `app.json` `extra.eas`.
- [ ] Production build: `eas build --platform ios --profile production`.
- [ ] Submit: `eas submit --platform ios --profile production`.
- [ ] TestFlight **export-compliance** answered; internal testers added.
- [ ] Smoke-test on a physical device: auth against the deployed API, share-extension (share a
      URL in), Near me / location, video playback, theme switching.

## Phase 2 — App Store submission

- [ ] **Metadata**: name, subtitle, description, keywords, category, support + marketing URLs.
- [ ] **Screenshots** for required device sizes (6.7" required; add others as needed).
- [ ] **App Privacy** nutrition label — declare location + account data collection.
- [ ] **Privacy Policy URL** (hosted, required for review).
- [ ] **Age rating** questionnaire.
- [ ] **Demo account** credentials in App Review notes (the app is auth-gated).
- [ ] Bump version, submit for **App Review**, then release (manual or automatic).

## Handy commands

```sh
eas whoami
eas build --platform ios --profile production
eas submit --platform ios --profile production
```
