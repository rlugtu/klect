# Klect — Development & Maintenance Guide

How to run, change, and extend Klect. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) first for
the mental model; this doc is the practical companion.

The repo is three independent apps under one root: **`web/`** (Next.js — the backend + web UI),
**`mobile/`** (Expo/React Native — a thin client of web's API), and **`extension/`** (Chrome MV3,
Vite + React — a third transport, scoped to lists only and deliberately not at parity). They share
the spec in the root `CLAUDE.md`/`DESIGN.md`, not code.

---

## 1. Prerequisites

- **Node** (v20+), npm.
- **Postgres** via Supabase (connection strings in `web/.env`).
- **Xcode** (+ CocoaPods) for the mobile app. It runs as a **custom dev build**, not Expo Go —
  the native share extension, `expo-video` player, and `expo-blur` tab bar aren't in Expo Go — so
  you build the dev client once (`npx expo prebuild && npx expo run:ios`), then hot-reload against it.
- Secrets: copy `web/.env.example` → `web/.env` and fill in `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `MAPBOX_TOKEN`, `ANTHROPIC_API_KEY`,
  `LINKPREVIEW_API_KEY`. Mobile reads only `EXPO_PUBLIC_API_URL` (the web base URL; defaults to
  `http://localhost:3000`).

---

## 2. Running & building

### Web (`cd web`)
```
npm run dev            # dev server (http://localhost:3000)
npm run build          # prisma generate && next build  — keep green before committing
npm run lint
npx prisma migrate dev --name <x>  &&  npx prisma generate   # after any schema change
```
> **Prisma 7 gotcha:** `migrate dev` does *not* reliably regenerate the client — always run
> `npx prisma generate` explicitly, then restart dev. The service worker is prod-only, so use
> `npm run build && npm start` to exercise PWA install/offline.

### Mobile (`cd mobile`) — runs as a custom dev build
```
npx expo prebuild                                    # generate native projects (first time / after native deps)
npx expo run:ios                                     # build + install the dev client on a simulator/device
npx expo start --dev-client                          # thereafter: hot-reload JS against the installed dev client
npx tsc --noEmit                                     # typecheck (the primary local gate — includes cross-folder types)
npx expo export --platform ios --output-dir /tmp/x   # bundle check (catches Metro/resolution errors)
```
The gotcha to respect:

- **This is a dev build, not Expo Go.** The app pulls in native modules Expo Go doesn't ship
  (`expo-share-extension`, `expo-video`, `expo-blur`), so it must run on a dev/EAS build. After
  adding a native module or changing an `app.json` config plugin (permissions, the share extension),
  re-run `npx expo prebuild && npx expo run:ios` — a JS-only reload won't pick up native changes.

For the mobile app to load data, the web dev server must be reachable at `EXPO_PUBLIC_API_URL`
(the iOS **simulator** reaches your Mac's `localhost`; a **physical device** needs your Mac's
LAN IP, and `BETTER_AUTH_URL` + the Google redirect URI must match that host).

### Extension (`cd extension`) — loaded unpacked in Chrome
```
npm run build:dev    # dev build → dist-dev/ (API + host permission = http://localhost:3000)
npm run build        # production build → dist/ (API + host permission = klect.vercel.app)
npm run dev          # same as build:dev, in --watch mode
npm run typecheck    # tsc --noEmit (includes the cross-folder AppRouter type)
npm run lint
```
Then **chrome://extensions → Developer mode → Load unpacked →** pick `dist/` (or `dist-dev/`).
After a rebuild, hit the reload arrow on the extension card; a popup-only change needs just a
reopen, but a service-worker change needs the reload.

The gotchas to respect:

- **The manifest is generated, not checked in.** `manifest.config.ts` + `vite.config.ts` emit it
  per environment so the API base URL and `host_permissions` come from one value. A **production**
  build must never carry the localhost host permission — that is both a Web Store review flag and a
  real attack surface.
- **The extension authenticates off the browser's own session**, so to use it against dev you must
  be signed in to `http://localhost:3000` in that same Chrome profile (and against prod, signed in
  to klect.vercel.app). There is no sign-in UI inside the extension.
- **Every API call must originate in the background service worker.** See §6's row and
  `CLAUDE.md`; a call from a popup or (worse) a content script fails as an opaque CORS error.

---

## 3. The golden rule: build every feature in **both** apps

Backend logic is written **once** in web and served to both clients. A feature is one pass
through the backend, then two thin UI builds:

1. **Schema** (if the data changes) → `web/prisma/schema.prisma` + `npx prisma migrate dev` +
   `npx prisma generate`.
2. **Business logic** → a `core(userId, input)` function in `web/src/lib/core/<entity>.ts`
   (validate → `assertRole` → Prisma → return). Reads go in `web/src/lib/<entity>.ts`.
3. **Expose it** → an input schema in `web/src/server/trpc/inputs.ts` + a procedure in
   `web/src/server/trpc/routers/<entity>.ts` (query = read + explicit `assertRole`;
   mutation = call `core`). Add it to the **API contract table in `DESIGN.md §8`.**
4. **Web UI** → a `"use server"` action wrapper in `web/src/lib/actions/*` + RSC/components.
5. **Mobile UI** → a screen/component in `mobile/src/app` or `mobile/src/components` that calls
   `trpc.<router>.<proc>`.

Steps 1–3 are done once and serve both apps; only 4 and 5 are per-platform, and both sit on
the same typed surface — so the clients can't silently drift.

---

## 4. How-to recipes

### Add a read (query) procedure
1. Read fn in `web/src/lib/<entity>.ts` (pure Prisma, `import "server-only"`).
2. Procedure in `web/src/server/trpc/routers/<entity>.ts` — **gate it**: `await assertRole(ctx.user.id, listId, "VIEWER")` (or OWNER) before returning, since reads aren't self-gating.
3. Consume in mobile: `const data = await trpc.<router>.<proc>.query(input)`.

### Add a mutation
1. `core(userId, input)` in `web/src/lib/core/<entity>.ts` — do `assertRole` + the write; put
   all normalization/business rules here.
2. Web action wrapper in `web/src/lib/actions/<entity>.ts` (parse FormData → `core` →
   `revalidatePath`/`redirect`).
3. tRPC mutation in `web/src/server/trpc/routers/<entity>.ts` (`.input(zodSchema).mutation(...)`).
4. Mobile: `await trpc.<router>.<proc>.mutate(input)`, then re-fetch (screens use
   `useFocusEffect`, so a `router.back()` after a modal is often enough).

### Add a mobile screen (expo-router)
1. Create `mobile/src/app/<path>.tsx`; register non-tab routes in the root Stack in
   `_layout.tsx` (`<Stack.Screen name="..." options={{ presentation: 'modal', title }} />`).
2. Navigate with `router.push({ pathname: '/lists/[id]', params: { id, name } })`.
3. **Typed routes:** after adding a route file, run `npx expo export` (or start the dev server)
   once to regenerate `.expo/types` — otherwise tsc flags the new pathname as invalid.
4. Style with the token/skin classes (`bg-bg text-ink rounded-skin border-skin border-border`);
   infer data types from the procedure (`Awaited<ReturnType<typeof trpc.x.y.query>>`).

### Change the theme palette / add a theme
- Web: edit the CSS-var blocks in `web/src/app/globals.css` (per `data-theme`).
- Mobile: mirror the same hex values in `mobile/src/theme/tokens.ts` (`THEME_TOKENS`), and, if
  adding a theme, extend the `ThemeName` union + the Settings switcher list. Skin knobs
  (`--border-w`, `--radius`) are set by family in `themeVars()`.

### Expose an external service to mobile
Extract the logic into `web/src/lib/core/<svc>.ts` (no `requireUser` gate — the caller gates),
keep a thin `"use server"` wrapper, and add a `protectedProcedure` in
`web/src/server/trpc/routers/external.ts`. Secrets stay in web's env.

---

## 5. Conventions

- **File placement:** non-UI logic in `src/lib` (web); mobile app code lives in
  `src/app` / `src/components` / `src/client` / `src/theme` — **never `mobile/src/lib`**
  (reserved so it can't shadow web's server graph through the `@/*` alias fallback).
- **Auth:** guard web RSC with `requireUser`/`requireOnboardedUser`; gate every mutation with
  `assertRole` **inside `core`**; gate query procedures explicitly. The one deliberate exception is
  `app/privacy/page.tsx` — a **public** page with **no** guard so it can serve as the App Store
  Connect privacy-policy URL (mobile opens the same URL in an in-app browser).
- **Account deletion:** `core.deleteAccount` is a single `prisma.user.delete` — every `User`
  relation is `onDelete: Cascade`, so all owned rows go in one transaction. Exposed via the
  `account.delete` procedure + `deleteAccountAction`; both web and mobile gate it behind a
  type-your-@handle confirmation in the Settings "Danger zone".
- **Types:** infer from Prisma/tRPC; don't hand-write DTOs. Mobile imports web's `AppRouter`
  as `import type` only.
- **Naming:** kebab-case files in mobile (`bookmark-form.tsx`); domain-grouped folders in both.
- **Commits:** conventional, imperative subject; keep `web` build/lint and `mobile` tsc green.

---

## 6. Verifying a change

| App | Gate | Command |
|---|---|---|
| web | build + lint | `cd web && npm run build && npm run lint` |
| mobile | typecheck | `cd mobile && npx tsc --noEmit` |
| mobile | bundle (Metro/resolution) | `npx expo export --platform ios --output-dir /tmp/x` |
| mobile | runtime | `npx expo start --dev-client` → open the **dev build** + exercise the flow |
| extension | typecheck | `cd extension && npx tsc --noEmit` |
| extension | lint | `cd extension && npm run lint` |
| extension | build (loadable unpacked `dist/`) | `cd extension && npm run build` |
| extension | network-call constraint | `grep -rnE "fetch\(\|createTRPCClient\|httpBatchLink" extension/src \| grep -v "^extension/src/background/"` → **no matches** |
| extension | runtime | Load unpacked → open the popup on a real page + exercise the save |
| API | auth wiring | unauthenticated `GET /api/trpc/lists.mine` → `401 UNAUTHORIZED` |

`tsc` + `expo export` catch nearly everything on the mobile side; **NativeWind runtime styling
and native modules can only be confirmed on the dev build** — visual/skin changes, the share
extension, video playback, and anything using `expo-location` need a real run on a device/simulator.

On the extension side `tsc` + the build catch wiring, but **Chrome's own permission and CORS
behavior is unmockable** — the cookie read, the service-worker CORS exemption, and the popup's
`activeTab` access can only be confirmed in a real loaded extension with a real signed-in session.
The grep row is a gate rather than a note on purpose: an API call sneaking out of the service
worker is the single constraint most likely to be broken by accident, and it does not fail loudly.

There is no automated test suite yet; correctness relies on the type system + these gates +
manual verification. (The extension is the first surface here with genuinely unit-testable pure
logic — cookie-name matching, cap-message assembly — if adopting a runner ever gets decided; that
is a standalone decision, not something to slip into a feature slice.)

---

## 7. Gotchas (the accumulated list)

- **Prisma 7:** run `npx prisma generate` explicitly after `migrate dev` (verify with
  `grep -c <field> web/src/generated/prisma/models/<Model>.ts`).
- **Mobile is a custom dev build (Expo SDK 54)** — native modules (`expo-share-extension`,
  `expo-video`, `expo-blur`) require it; a native dep or `app.json` config-plugin change needs a
  fresh `expo prebuild` + `run:ios`, not just a JS reload.
- **Bookmark images are hotlinked remote URLs** — they can break if the source blocks hotlinking.
- **Nearby only sees geocoded bookmarks** (location picked from autocomplete); free-typed/legacy
  locations have no coordinates and show as an "N skipped" note.
- **Dates over tRPC** arrive as ISO strings (no transformer) though typed as `Date` — parse with
  `new Date(value)` before formatting (see `comments-section.tsx`).
- **Microlink** free tier is IP-rate-limited; **Mapbox** degrades to plain text without a token.

---

## 8. Release & deployment

- **Web** deploys from `main` (Supabase Postgres backend) to `https://klect.vercel.app`. Ensure the
  deploy host has all `web/.env` secrets set (notably `MAPBOX_TOKEN`, `ANTHROPIC_API_KEY`,
  `LINKPREVIEW_API_KEY`, `BETTER_AUTH_URL`, Google creds), and register the prod Google redirect URI
  `https://<host>/api/auth/callback/google`.
- **Mobile** ships via EAS Build → TestFlight/App Store. Bundle id is `com.klect.app`; the
  `production` EAS profile points `EXPO_PUBLIC_API_URL` at `https://klect.vercel.app`. The
  step-by-step checklist (identifiers, App Store Connect, share-extension provisioning) lives in
  `mobile/docs/RELEASE.md`.

---

## 9. Known follow-ups

Bundle the retro **pixel font** on mobile (needs `expo-font` + a bitmap font) so the Pixel theme
matches web; optionally sync the mobile theme choice to `user.theme` via `profile.update` (it's
local secure-store today); Android **share-to-app** (the iOS share extension has no Android
equivalent yet). See `DESIGN.md §9` for longer-horizon ideas.
