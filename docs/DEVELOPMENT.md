# Saive — Development & Maintenance Guide

How to run, change, and extend Saive. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) first for
the mental model; this doc is the practical companion.

The repo is two independent apps under one root: **`web/`** (Next.js — the backend + web UI)
and **`mobile/`** (Expo/React Native — a thin client of web's API). They share the spec in
the root `CLAUDE.md`/`DESIGN.md`, not code.

---

## 1. Prerequisites

- **Node** (v20+), npm.
- **Postgres** via Supabase (connection strings in `web/.env`).
- **Xcode 26+ / Swift 6.2+** and an **iOS 26+ simulator runtime** for the mobile native build
  (Expo SDK 57 requires Swift 6.2). Install a simulator runtime with `xcodebuild -downloadPlatform iOS`.
- Secrets: copy `web/.env.example` → `web/.env` and fill in `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `MAPBOX_TOKEN`, `ANTHROPIC_API_KEY`.
  Mobile reads only `EXPO_PUBLIC_API_URL` (the web base URL; defaults to `http://localhost:3000`).

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

### Mobile (`cd mobile`)
```
npx expo run:ios       # native build + run in the simulator (needed for the dev client)
npx tsc --noEmit       # typecheck (the primary local gate — includes the cross-folder types)
npx expo export --platform ios --output-dir /tmp/x   # bundle check (catches Metro/resolution errors)
```
Two native gotchas that will bite you:

1. **Native dependencies require a rebuild.** Adding a package with native code
   (`expo-location`, `expo-network`, …) means `npx expo run:ios` again — a Metro reload is not
   enough. JS-only changes hot-reload.
2. **`app.json` config-plugin changes require a prebuild.** Permissions and other native config
   (e.g. the location usage string) only reach `ios/Info.plist` on a fresh prebuild. If a
   plugin change "isn't taking effect," run `npx expo prebuild -p ios --clean` (safe — there's
   no hand-edited native code), then `npx expo run:ios`.

For the mobile app to load data, the web dev server must be reachable at `EXPO_PUBLIC_API_URL`
(the iOS **simulator** reaches your Mac's `localhost`; a **physical device** needs your Mac's
LAN IP, and `BETTER_AUTH_URL` + the Google redirect URI must match that host).

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
   mutation = call `core`). Add it to the **API contract table in `DESIGN.md §9`.**
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
  `assertRole` **inside `core`**; gate query procedures explicitly.
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
| mobile | runtime | `npx expo run:ios` + exercise the flow in the simulator |
| API | auth wiring | unauthenticated `GET /api/trpc/lists.mine` → `401 UNAUTHORIZED` |

`tsc` + `expo export` catch nearly everything on the mobile side; **NativeWind runtime styling
and native modules can only be confirmed in the simulator** — visual/skin changes and anything
using `expo-location`/camera/etc. need a real run.

There is no automated test suite yet; correctness relies on the type system + these gates +
manual verification.

---

## 7. Gotchas (the accumulated list)

- **Prisma 7:** run `npx prisma generate` explicitly after `migrate dev` (verify with
  `grep -c <field> web/src/generated/prisma/models/<Model>.ts`).
- **Mobile native dep → rebuild;** **`app.json` plugin change → `expo prebuild --clean`.**
- **Expo SDK 57 needs Swift 6.2** (Xcode 26) + an installed iOS simulator runtime.
- **Bookmark images are hotlinked remote URLs** — they can break if the source blocks hotlinking.
- **Nearby only sees geocoded bookmarks** (location picked from autocomplete); free-typed/legacy
  locations have no coordinates and show as an "N skipped" note.
- **Dates over tRPC** arrive as ISO strings (no transformer) though typed as `Date` — parse with
  `new Date(value)` before formatting (see `comments-section.tsx`).
- **Microlink** free tier is IP-rate-limited; **Mapbox** degrades to plain text without a token.

---

## 8. Release & deployment

- **Web** deploys from `main` (Supabase Postgres backend). Ensure the deploy host has all
  `web/.env` secrets set (notably `MAPBOX_TOKEN`, `BETTER_AUTH_URL`, Google creds), and register
  the prod Google redirect URI `https://<host>/api/auth/callback/google`.
- **Mobile** ships via EAS Build → TestFlight/App Store. Before a real build: set a proper
  `ios.bundleIdentifier` (currently the `com.anonymous.saive` placeholder), app icon/splash,
  and point `EXPO_PUBLIC_API_URL` at the deployed web host.
- **Current state:** all of the two-app work lives on the branch `restructure-two-apps` and has
  **not** been merged to `main` or pushed. Merging is the gate to shipping web with the API +
  restructure.

---

## 9. Known follow-ups

Retro **pixel font** (needs `expo-font` + a bitmap font, native rebuild); **standalone
multi-list bookmark create** on mobile (the `bookmarks.createInLists` procedure already exists);
optionally sync the mobile theme choice to `user.theme` via `profile.update` (it's local
secure-store today). See `DESIGN.md §10` for longer-horizon ideas.
