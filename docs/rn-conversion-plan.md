# React Native / App Store conversion — effort analysis

> Estimate + plan for shipping Klect as a native iOS (and likely Android) app. Companion to
> DESIGN.md §9 (RN portability), which this quantifies. Not yet started — this is a go/no-go
> reference. Last analyzed: 2026-07-04.

## Context
Goal: estimate the work to ship Klect as a native iOS (and likely Android) app on the App
Store. Klect is a Next.js 16 App-Router web app: **server-first, no HTTP API** — pages are RSC
that read `lib/*.ts` directly and mutate via server actions bound to `FormData`. That
architecture is the crux: React Native cannot call Prisma/server actions, so a native client
needs a real network API plus a full UI rebuild. DESIGN.md §9 already lays out the strategy;
this quantifies it.

## Codebase surface (measured)
- **App routes:** 16 files (~970 LOC) across ~8 user-facing routes.
- **Components:** 41 files (~3,100 LOC); **30 are `"use client"`**.
- **lib:** 25 files (~1,884 LOC); **9 server-action files** (`bookmarks, comments, lists,
  sharing, profile, metadata, nearby, places, comprehend`).
- **Framework coupling:** `next/*` in 24 files (Link, useRouter, redirect, revalidatePath,
  next/font, notFound); Framer Motion in 7 files.
- **Web-platform APIs (small):** `navigator.geolocation` (1), service worker (PWA, 1),
  `document.*` (3). No `localStorage`. This is the good news — little deep browser coupling.
- **Server mutation coupling:** ~25 `formData.get` in bookmarks alone, `revalidatePath` ×32,
  `redirect` ×8 across action files. But **reads are already pure** (`import "server-only"`,
  no revalidate/redirect) and parsing is already factored into helpers
  (`parseBookmarkFields`, `parseTagNames`) — so the API refactor is moderate, not a rewrite.

## What transfers vs. what must be rebuilt
**Free / near-free (server + shared TS):**
- Prisma schema + migrations, Supabase DB — 100% reused.
- All `lib/*.ts` read queries, `permissions.ts` (`assertRole`), tag-sync, invite/auto-link,
  `geo.ts` haversine, `video.ts` detection, `theme.ts` registry, `types.ts`, `utils.ts`.
- Third-party integrations are already server-side HTTP (Mapbox, Microlink, Anthropic
  `comprehend`) → reused behind the new API unchanged.
- Auth server: better-auth has a first-party **`@better-auth/expo`** client → same auth server.

**Must be built new (native):**
- **HTTP API layer** (the missing transport) — the foundational blocker.
- **Entire UI** — 41 components are DOM + Tailwind + Framer Motion.
- **Native platform bindings** — geolocation, maps deep-links, images, video, secure token store.
- **App Store pipeline** — Apple account, EAS build, assets, privacy manifest, review.

## Workstreams & effort
Estimates assume **solo dev heavily using Claude Code**, Expo (managed) + expo-router +
NativeWind + Moti/Reanimated, in a shared monorepo with the web app. Units = engineering-days.

| # | Workstream | Days | Notes |
|---|---|---|---|
| A | **API/transport boundary** | 3–5 | Split each action into `core(input)` + thin `action(formData)`; expose reads+cores via tRPC or route handlers; auth via bearer/cookie. Reads already pure; parsers already isolated. |
| B | **Expo scaffold + auth + nav** | 3–5 | Expo project, expo-router mirroring the 8 routes, NativeWind fed the token palette, `@better-auth/expo` (Google + email/password), secure storage, invite deep-links. |
| C | **UI rebuild (bulk)** | 12–20 | 41 components → RN views: Pixel* primitives, all forms (drop FormData → controlled inputs), cards/lists, **drag-reorder** (Framer `Reorder` → reanimated / draggable-flatlist), search combobox, emoji picker, tag pills, comments, skeletons. Reproduce **pixel + modern × light/dark** in NativeWind. |
| D | **Native platform features** | 3–5 | expo-location + permissions, maps deep-link via Linking, expo-image (remote hotlinks), video via expo-av / react-native-webview, link-paste autofill calls the API. |
| E | **App Store prep + submission** | 3–5 | Apple Developer ($99/yr), bundle id, icons/splash, EAS Build, privacy manifest / data-safety, App Store Connect listing + screenshots, TestFlight, review iterations. |
| | **Total** | **≈ 24–40 eng-days** | ≈ **5–8 focused weeks** solo. |

**Calendar realistically ≈ 2–3 months** once App Store review cycles, device testing, and polish
are included (review itself is 1–3 weeks of latency + iteration, not effort).

### Swing factors (can move the total ±30%)
- **iOS-only vs iOS + Android** — Android roughly free on Expo except store setup/testing (+2–4 d).
- **Code-sharing** — monorepo sharing `lib/` (assumed) vs a standalone RN app (rewrite drift, +).
- **Theme fidelity** — matching all 4 skins pixel-perfect in NativeWind vs "close enough".
- **Native share extension** — the iOS share-sheet target the PWA *couldn't* do (DESIGN §10) is
  a real reason to go native; building it adds ~2–4 d but is a headline feature.

## Recommended sequencing
1. **Prep (do first, unblocks everything; also improves the web app):**
   - Extract `tokens.ts` as the single palette source (globals.css + NativeWind both read it).
   - Build workstream **A** (API boundary + `core(input)` refactor) — web can adopt it too.
2. **B** scaffold → **C** UI (route by route: auth → home/lists → bookmark detail → search →
   nearby → sharing/settings) → **D** platform features.
3. **E** store submission; ship iOS first, Android as a fast-follow.

## Key risks
- **UI rebuild is the long pole** (C) and the least reusable — budget conservatively.
- **Google OAuth native config** (URL schemes / redirect) is fiddly the first time.
- **Drag-reorder + gesture parity** on native is the trickiest single component.
- **Image durability**: hotlinked remote images (per CLAUDE.md) break the same on native; may
  want Supabase Storage before store review to avoid broken-image screenshots.

## Verification (of the eventual work)
- API: hit each `core()` via the new endpoint with auth; confirm `assertRole` still enforced.
- App: run in Expo Go / dev client; walk every route; sign in (both methods); create/edit a
  bookmark; drag-reorder; search; nearby with real geolocation; accept an invite via deep link.
- Store: EAS build installs on a physical device via TestFlight; passes App Review.
