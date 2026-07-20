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
- **Action feedback = toasts**: surface success/error with `toast.*` from `src/lib/toast.ts` (a
  framework-agnostic singleton; `<Toaster />` mounts once in the root layout). Client islands toast
  after `await`ing an action; **redirecting** actions can't (redirect throws) so they queue one via a
  flash cookie (`setFlashToast` in `src/lib/toast-flash.ts`) that `<Toaster />` reads on mount.
- **Ownership**: every participant (incl. owner) has a `ListMembership` row (uniform ordering +
  access); `List.ownerId` is the canonical owner.
- **Styling / themes**: design tokens are CSS vars in `src/app/globals.css` (`@theme inline`),
  swapped per theme via `data-theme` on `<html>` (from `user.theme`). Themes = `Theme` enum
  `PIXEL_LIGHT|PIXEL_DARK|MODERN_LIGHT|MODERN_DARK|JOURNAL_LIGHT|JOURNAL_DARK` (**default
  `MODERN_LIGHT`**); registry + enum↔`data-theme` map + validation in `src/lib/theme.ts`. The
  `.pixel-*` primitives are the retro skin; **unlayered** `[data-theme^="modern"]` /
  `[data-theme^="journal"]` CSS overrides them for the modern/journal skins (adding a theme is pure
  CSS). Fonts are per-family (loaded in `layout.tsx`, keyed off CSS vars): modern = **Geist**
  (`--font-sans`, titles + body); journal = Newsreader + Work Sans; pixel = Press Start 2P + VT323.

## Gotchas
- **Prisma 7**: `migrate dev` does NOT reliably regenerate the client — run `npx prisma generate`
  explicitly after any schema change, then restart dev. (Verify: `grep -c <field>
  src/generated/prisma/models/<Model>.ts`.)
- `.env` holds Supabase + Google + better-auth + **Mapbox** secrets (gitignored); `.env.example`
  documents them. `MAPBOX_TOKEN` must also be set in the deploy host's env (not just local). These
  secrets stay **only in web** — mobile reaches Mapbox/Microlink/Anthropic capabilities through
  tRPC procedures, so no keys ship in the app.
- Link autofill (`core/metadata.ts`, `[link-metadata]` log) is a **two-phase** pipeline so the UI
  fills fast then enriches. **Phase 1 — extraction** (`getLinkExtraction`, `metadata.extract`):
  we fetch the page **once ourselves** (`core/page-text.ts` `fetchPage`, `[page-text]` log) and read
  OG/meta → title/description/image + `detectVideo`; this **warms a shared page cache** (`core/cache.ts`).
  Falls back to **LinkPreview** (`LINKPREVIEW_API_KEY`) → **Microlink** (free tier, IP-rate-limited)
  only when the self-fetch is blocked/empty; YouTube still uses oEmbed; social reels
  (Instagram/Facebook/TikTok, `isSocialVideo`) still prefer Microlink first (better caption coverage).
  No LLM — returns immediately. **Phase 2 — comprehension** (`getLinkComprehension`,
  `metadata.comprehend`, non-blocking): from the same cached fetch it first tries a **JSON-LD fast
  path** (`core/structured-data.ts`, `structuredDataFromJsonLd`) — schema.org
  Recipe/HowTo/Event/Product/LocalBusiness parsed straight into `{heading, items}` detail sections,
  **no LLM**; otherwise runs `comprehendMetadata` (`core/comprehend.ts`, `claude-haiku-4-5`,
  `[comprehend]` log) on the readable text (for **YouTube**, the video's `og:description`), cleaning
  the title, writing a `Link Summary:`-prefixed description with detail sections (Ingredients, Steps,
  Hours, Event Details, …), and adding up to 3 `tags` + an inferred `location`. The location is then
  **geocoded** (`searchPlaces`→`retrievePlace`, shared session token) into `latitude`/`longitude` on
  `LinkComprehension`, so autofilled bookmarks appear in **Near me**. `fetchPage` is **SSRF-guarded**
  (http(s) only; rejects hosts resolving to private/loopback/link-local IPs; manual redirects
  re-validated per hop; timeout + html-only + byte cap). Both phases are **cached + coalesced by URL**
  (in-memory, per-instance/ephemeral on serverless — dedupes double-taps + fan-out + warm repeats).
  Both clients call `metadata.extract` then `metadata.comprehend` and patch phase-2 fields in as they
  land (web reuses the `BookmarkForm` seed+remount; mobile fills-when-empty with an "Enhancing…" row).
  Everything degrades gracefully: no `ANTHROPIC_API_KEY` → JSON-LD/raw metadata only, no
  `Link Summary:`; no `LINKPREVIEW_API_KEY` → self-fetch/Microlink. Social reel captions are still
  often truncated/login-walled — reliable reel extraction needs a social-scraper API
  (`SOCIAL_SCRAPER_TOKEN` / `comprehend.caption` stubbed, not wired). `metadata.fetch` still composes
  both phases for one-shot callers.
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
- **DM & chatroom realtime** (`core/dm-realtime.ts`, `core/list-chat-realtime.ts`): a send posts a
  **content-free** ping (just the conversation/list id) to Supabase Realtime's server broadcast REST
  endpoint (`SUPABASE_URL` / `SUPABASE_ANON_KEY`) on public channels — DMs use `dm:user:<recipientId>`
  + `dm:conv:<conversationId>`, **list chatrooms** use `chat:list:<listId>`. Clients treat it as
  "refetch now" and pull real data over the `dms.*` / `listChat.*` tRPC procedures / the
  `lib/actions/{dms,list-chat}.ts` server actions, so nothing sensitive rides the socket. Everything
  **degrades to polling** when the Supabase env is unset. Browser subscribers live in
  `lib/realtime/client.ts` (`subscribeDm` / `subscribeListChat`, `NEXT_PUBLIC_SUPABASE_*`). Note the
  DM and chatroom UIs are **client islands that call server actions** (web has no browser tRPC
  client) — keep logic in `core/dms.ts` / `core/list-chat.ts`. **List chatrooms** = one group chat
  per list, shared by all members (owner/collab/viewer); reads/posts require membership; **owner-only
  clear hard-deletes** every message (`ListChatMessage`); per-member unread via
  `ListMembership.chatLastReadAt`.
