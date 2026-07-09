@AGENTS.md

# Klect — web app

The Next.js client (and, for now, the whole backend). Product description, data model,
permissions, routes, and the API contract that `mobile/` consumes live in the **shared**
`../DESIGN.md` and `../CLAUDE.md` (the parent-repo source of truth for both apps). This
file covers web-specific implementation only.

`web/` owns the database, auth, and all business logic, and exposes it over an HTTP API
(tRPC) that the mobile app consumes. Backend logic is written **once, here**; mobile
duplicates only UI. See `../CLAUDE.md` for the two-app relationship and the per-feature
workflow.

## Stack
Next.js 16 (App Router, RSC + server actions), React 19, TypeScript, Tailwind v4, Framer Motion,
Prisma 7 (pg driver adapter) → Supabase Postgres, better-auth (Google + email/password). Deploys
from `main`.

## Commands
Run these from `web/` (the app no longer lives at the repo root).
- `npm run dev` — dev server (note: the service worker is registered **prod-only**, so use
  `npm run build && npm start` to exercise PWA install/offline locally).
- `npm run build` / `npm run lint` — keep both green before committing.
- `npx prisma migrate dev --name <x>` then **`npx prisma generate`** — see gotcha below.

## Architecture / conventions
- **Server-first.** Pages are RSC that read via `lib/<entity>.ts` data access; mutations are
  server actions in `lib/actions/<entity>.ts` (`"use server"`: parse FormData → validate →
  `assertRole` → Prisma → `revalidatePath`/`redirect`), bound with `.bind(null, id)` and handed to
  client components. The web has **no HTTP API of its own for its own use** — but it also hosts the
  **tRPC API surface** that `mobile/` calls (procedures are thin wrappers over the same `core()`
  logic the actions use; never duplicate logic between an action and a procedure).
- **`src/lib/`** = all non-UI logic (db, auth, session, permissions, data access, actions, types,
  utils). **`src/components/`** = UI grouped by domain, with `ui/` holding the pixel primitives
  (`Pixel*`, `Skeleton`, `EmojiField`, `SubmitButton`, `ConfirmDeleteButton`). **`src/app/`** =
  routes.
- **Auth**: `requireUser` / `requireOnboardedUser` guard server components; **every mutation
  re-checks `assertRole(userId, listId, minRole)`** — never trust UI gating.
- **Ownership**: every participant (incl. owner) has a `ListMembership` row (uniform ordering +
  access); `List.ownerId` is the canonical owner.
- **Styling / themes**: design tokens are CSS vars in `src/app/globals.css` (`@theme inline`),
  swapped per theme via `data-theme` on `<html>` (from `user.theme`). Themes = `Theme` enum
  `PIXEL_LIGHT|PIXEL_DARK|MODERN_LIGHT|MODERN_DARK|JOURNAL_LIGHT|JOURNAL_DARK` (**default
  `MODERN_LIGHT`**); registry + enum↔`data-theme` map + validation in `src/lib/theme.ts`. The
  `.pixel-*` primitives are the retro skin; **unlayered** `[data-theme^="modern"]` /
  `[data-theme^="journal"]` CSS overrides them for the modern/journal skins (adding a theme is pure
  CSS — journal also adds Newsreader + Work Sans fonts in `layout.tsx`).

## Gotchas
- **Prisma 7**: `migrate dev` does NOT reliably regenerate the client — run `npx prisma generate`
  explicitly after any schema change, then restart dev. (Verify: `grep -c <field>
  src/generated/prisma/models/<Model>.ts`.)
- `.env` holds Supabase + Google + better-auth + **Mapbox** secrets (gitignored); `.env.example`
  documents them. `MAPBOX_TOKEN` must also be set in the deploy host's env (not just local). These
  secrets stay **only in web** — mobile reaches Mapbox/Microlink/Anthropic capabilities through
  tRPC procedures, so no keys ship in the app.
- Link autofill uses **Microlink** (free tier is IP-rate-limited) with YouTube via oEmbed;
  `fetchLinkMetadata` logs `[link-metadata]` on the server.
- Location field is a **Mapbox Search Box** autocomplete (`lib/actions/places.ts`, proxied
  server-side, `[places]` log prefix, `proximity=ip` bias). It's two-step: `searchPlaces`
  (/suggest) returns coordinate-less suggestions, `retrievePlace` (/retrieve) resolves the
  picked one's `latitude`/`longitude`; both share a client `session_token` for session billing.
  The address opens in a maps app via `LocationLink`. Degrades to plain text if the token is
  unset. No in-app map.
- **Near me** (`/nearby`, `docs/nearby.md`): client island (`NearbyFinder`) reads browser
  geolocation, a server action (`findNearbyBookmarks` in `lib/actions/nearby.ts`, `[nearby]` log
  prefix) haversine-filters (`lib/geo.ts`) the user's coordinate-bearing bookmarks. Only bookmarks
  picked from location autocomplete have coordinates, so free-typed/legacy ones never appear (they
  show as an "N skipped" note).
- Bookmark **images are hotlinked remote URLs** (can break if the source blocks hotlinking).
