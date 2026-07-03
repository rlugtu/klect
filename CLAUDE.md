@AGENTS.md

# Saive

Bookmarking app where bookmarks live inside shareable **lists**. A bookmark has a name,
description, multiple URLs (`urls[0]` = original source), extracted **photos** (`images[]`),
notes, location, 0–5 rating, visited flag, and user-scoped **tags**. Lists are drag-reorderable
(per-user), searchable (name + OR tag filter), and shareable by inviting **viewers** (view +
comment) or **collaborators** (edit + comment); the **owner** manages membership. Lists and
bookmarks both support **comments**. Pasting a link auto-fills a bookmark from page metadata (and
detects a playable video). Two selectable **themes** — **pixel** (retro 8-bit) and **modern**
(sleek/minimalist), each light + dark. Installable **PWA**.

**Full design doc: `DESIGN.md`** (data model, permissions, routes, architecture, RN-portability).

## Stack
Next.js 16 (App Router, RSC + server actions), React 19, TypeScript, Tailwind v4, Framer Motion,
Prisma 7 (pg driver adapter) → Supabase Postgres, better-auth (Google + email/password). Deploys
from `main`.

## Commands
- `npm run dev` — dev server (note: the service worker is registered **prod-only**, so use
  `npm run build && npm start` to exercise PWA install/offline locally).
- `npm run build` / `npm run lint` — keep both green before committing.
- `npx prisma migrate dev --name <x>` then **`npx prisma generate`** — see gotcha below.

## Architecture / conventions
- **Server-first, no separate HTTP API.** Pages are RSC that read via `lib/<entity>.ts` data
  access; mutations are server actions in `lib/actions/<entity>.ts` (`"use server"`: parse
  FormData → validate → `assertRole` → Prisma → `revalidatePath`/`redirect`), bound with
  `.bind(null, id)` and handed to client components.
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
  `PIXEL_LIGHT|PIXEL_DARK|MODERN_LIGHT|MODERN_DARK`; registry + enum↔`data-theme` map + validation
  in `src/lib/theme.ts`. The `.pixel-*` primitives are the retro skin; **unlayered**
  `[data-theme^="modern"]` CSS overrides them for the modern skin (adding a theme is pure CSS).

## Gotchas
- **Prisma 7**: `migrate dev` does NOT reliably regenerate the client — run `npx prisma generate`
  explicitly after any schema change, then restart dev. (Verify: `grep -c <field>
  src/generated/prisma/models/<Model>.ts`.)
- `.env` holds Supabase + Google + better-auth secrets (gitignored); `.env.example` documents them.
- Link autofill uses **Microlink** (free tier is IP-rate-limited) with YouTube via oEmbed;
  `fetchLinkMetadata` logs `[link-metadata]` on the server.
- Bookmark **images are hotlinked remote URLs** (can break if the source blocks hotlinking).
