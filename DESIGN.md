# Saive — Design Doc

> Bookmarks organized into shareable lists, with tags, filtering, and collaboration.
> Retro 8-bit aesthetic. This document is the single source of truth for the design;
> update it whenever a decision changes.

**Status:** ✅ Feature-complete (all 8 build steps) + post-v1 additions (link autofill,
photos, installable PWA). Deployed from `main`.
**Last updated:** 2026-07-02

## Overview

Saive is a bookmarking app where bookmarks live inside **lists** that can be shared with other
people. A bookmark is richer than a URL — it has a name, description, multiple URLs (the first is
the original source), extracted **photos**, free-form notes, a location, a 0–5 rating, a
visited flag, and user-scoped **tags**. Lists can be organized (per-user drag-reorder) and
searched (by name, and by tag with OR filtering). Lists are shared by inviting people as
**viewers** (view + comment) or **collaborators** (full edit + comment); the **owner** manages
membership. Both lists and bookmarks support **comments**. Pasting a link (YouTube/TikTok/blogs)
auto-fills a bookmark from the page's metadata. The whole thing wears a **retro 8-bit** skin and
is an installable **PWA**.

---

## 1. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS with a custom 8-bit token set |
| Animation | Framer Motion (drag-reorder, page/pill transitions) |
| Auth | better-auth — Google OAuth **and** email/password |
| Database | Supabase (Postgres) |
| ORM | Prisma |

**Aesthetic:** retro 8-bit — pixel font (e.g. "Press Start 2P"), chunky borders, hard
drop shadows, limited palette. Two palette variants (`LIGHT` / `DARK`) live *within* the
8-bit theme and are stored per-user.

---

## 2. Decisions log

Resolved during planning (most-recent context in parentheses):

- **Tags** are **user-scoped** (shared across all of a user's lists) and filter with **OR**
  matching (a bookmark matches if it has *any* selected tag).
- **Auth**: Google OAuth **+** email/password. Passwords hashed by better-auth (never store
  raw). `birthday` is optional, collected at onboarding.
- **Comments** attach to **both lists and bookmarks** (`Comment` has nullable `listId` and
  `bookmarkId`; exactly one is set).
- **Icons**: emoji picker for lists and bookmarks.
- **Search result → list click**: navigates to that List page. Tags become filter pills.
- **List ordering**: **per-user** (stored on the membership), each member arranges their own
  home page independently.
- **Sharing admin**: **owner-only** — only the owner invites, changes roles, removes members,
  and deletes the list. Collaborators have full bookmark/list-metadata edit + comment. Viewers
  view + comment only.
- **Bookmark URLs**: **multiple** (`urls: string[]`); the first is the primary "open" target.

### Defaults (low-stakes; change freely)
- **Rating**: 0–5 stars (pixel-art stars).
- **Search bar**: one unified control on the home page handles both list-name and tag search
  (no separate list-name filter box).
- **`location`**: freeform text (e.g. "Tokyo, Japan"); no map/geocoding in v1.
- **Realtime**: out of scope for v1 — comments/edits refresh on action. Supabase realtime can
  come later.

---

## 3. Data model (Prisma)

better-auth manages its own `user` / `session` / `account` / `verification` tables. Our app
fields extend the user record; app entities below.

```
User            id, email, firstName, lastName, displayName,
                birthday?, icon (emoji), theme (Theme enum), createdAt

List            id, name, description, icon, ownerId, createdAt

ListMembership  id, listId, userId, role (OWNER|COLLABORATOR|VIEWER),
                position (int — per-user ordering), createdAt

ListInvite      id, listId, email, role, token, status (PENDING|ACCEPTED),
                invitedById, createdAt
                — auto-links to a user when that email signs up

Bookmark        id, listId, name, description, urls (string[]),
                images (string[]), notes, location, rating (0–5),
                visited (bool), videoUrl, videoType, createdAt, updatedAt
                -- no icon (removed); urls[0] = original source link;
                -- images = extracted photo URLs;
                -- videoUrl/videoType = detected playable video ("iframe"|"file")

Tag             id, name, userId          — unique per (userId, name)
BookmarkTag     bookmarkId, tagId         — join table

Comment         id, authorId, value, createdAt,
                bookmarkId?, listId?      — exactly one of the two set
```

**Relationships & rules**
- A user sees a list on their home page if they own it **or** have a `ListMembership`.
- Tags are user-scoped and shared across all of a user's lists (OR-matching in filters).
- Deleting a list cascades its bookmarks, comments, memberships, invites.
- Deleting a bookmark cascades its `BookmarkTag` links and comments.

---

## 4. Permissions

| Action | Owner | Collaborator | Viewer |
|---|:---:|:---:|:---:|
| View list & bookmarks | ✓ | ✓ | ✓ |
| Comment (list & bookmark) | ✓ | ✓ | ✓ |
| Create/edit/delete bookmarks | ✓ | ✓ | — |
| Edit list metadata (name/icon/desc) | ✓ | ✓ | — |
| Invite / change roles / remove members | ✓ | — | — |
| Delete list | ✓ | — | — |
| Delete a comment | own + any on their list | own only | own only |
| Reorder lists on **own** home page | ✓ | ✓ | ✓ |

Enforced **server-side on every mutation** via a shared `assertRole(listId, userId, minRole)`
helper — never rely on UI gating alone.

**Convention:** every participant — including the owner — has a `ListMembership` row
(the owner's has role `OWNER`). This makes access checks and per-user ordering uniform;
`List.ownerId` remains the canonical owner pointer.

---

## 5. Pages / routes

| Route | Purpose |
|---|---|
| `/login` | Google + email/password (better-auth) |
| `/onboarding` | First login only: displayName, birthday (optional), icon, theme |
| `/` | **Home**: all lists you own or belong to; reorderable (Framer Motion drag) + unified search bar |
| `/lists/[id]` | Bookmarks in a list; filter/search within; list-level comments; invite UI (owner) |
| `/lists/[id]/bookmarks/[bid]` | Bookmark detail: 8-bit layout, tag pills, comments newest-first |
| `/settings` | Edit profile/theme/icon; manage/leave shared lists; pending invites |
| `/invite/[token]` | Accept an invite |

**Home search bar behavior** (unified control):
- Typing shows two sections — **Lists** (by name) then **Matched tags**.
- Clicking a **list** navigates to it; clicking a **tag** adds a pill below the bar.
- Selected tags render as pills with an ✕ to remove; a **Clear all** button empties the input
  and deselects every tag.
- Multiple tags = OR filter across all of the user's bookmarks.

---

## 6. Build plan

Pause for review after **each** step.

- [x] **1. Scaffold** — Next.js 16 + Tailwind v4 + Prisma 7 (pg driver adapter) + full domain
      schema; 8-bit design tokens + base components (PixelButton/Card/Input/Badge, ThemeToggle).
      DB/OAuth secrets pending in `.env`; better-auth tables + wiring deferred to Step 2.
- [x] **2. Auth** — better-auth wired (email/password verified end-to-end; Google wired,
      needs a real browser sign-in to confirm). Migrations applied to Supabase (init +
      comment check constraint). Route guards, onboarding, and settings live. Theme applied
      from `user.theme` in the root layout.
- [x] **3. Lists** — CRUD + home page + per-user drag-reorder (Framer Motion `Reorder`,
      debounced persistence) + client-side name filter. Owner-also-a-member convention;
      role-gated edit (COLLABORATOR+) / delete (OWNER) via `assertRole`. Render paths verified
      against Supabase; write actions covered by tsc/build.
- [x] **4. Bookmarks** — CRUD + user-scoped tags (pill `TagInput` with suggestions,
      upsert+prune sync scoped to the acting user) + interactive rating picker + visited
      toggle. List page lists bookmark cards; detail page is the "sleek 8-bit" view (hero,
      tag pills, URLs, notes). Render paths verified against Supabase.
- [x] **5. Search** — unified home `SearchBar` combobox (Lists section navigates, Matched
      tags section adds pills). Selected tags live in the URL (`?tags=`), server-rendered OR
      filter across all the user's lists. Tag pills with × + Clear all. Removed the step-3
      in-grid list filter per §4. Cross-list OR filtering verified against Supabase.
- [x] **6. Sharing** — invite by email (owner-only); existing users added instantly, unknown
      emails become pending invites that auto-link on signup (better-auth `databaseHooks`).
      `/invite/[token]` accept flow (with `?next=` login round-trip). Owner `MembersPanel`:
      invite form, role change, remove member, revoke invite; non-owners get Leave list.
      Auto-link + role + owner-only gating verified live against Supabase.
- [x] **7. Comments** — on lists and bookmarks, newest-first. Any member (viewer+) can post;
      author or list owner can delete (DB check constraint enforces exactly one target).
      React 19 auto-resets the post box. Rendering, ordering, and delete gating verified live.
- [x] **8. Polish** — page-transition `template.tsx` (with `MotionConfig reducedMotion="user"`),
      animated tag pills (AnimatePresence) in search + tag input, loading skeletons
      (home/list/bookmark), 8-bit `not-found.tsx`, responsive header pass.

### Post-v1 updates
- **Link autofill**: paste a URL in the bookmark form → `fetchLinkMetadata` unfurls it
  (YouTube via oEmbed, everything else via Microlink) to prefill name/description/photos;
  `urls[0]` keeps the original source. Bookmarks gained an `images String[]` field.
- **Bookmark UI**: removed the per-bookmark emoji icon; card thumbnails; single-list search
  (name + tag pills); create-form quick-add chips for tags already in the list.
- **PWA**: web manifest, generated icons (any + maskable + apple), a service worker with an
  offline fallback (`/offline`), prod-only registration. (Web Share Target intentionally not
  built — iOS Safari can't receive shares; see §10.)
- **Video player**: autofill detects a playable video (YouTube/Vimeo/TikTok/Instagram embeds +
  direct og:video files) via `src/lib/video.ts` `detectVideo`; stored as `videoUrl`/`videoType`
  on the bookmark; the detail page shows an optional click-to-play player (`BookmarkVideo`,
  poster facade → iframe on click; `<video>` for files). Trusted-host whitelist enforced on both
  write and render. See `docs/video-player-plan.md`.
- **Modern theme + rename**: added a sleek/minimalist theme (monochrome + pastel gradients, sans
  font) in light + dark, alongside the retro 8-bit themes (renamed to **pixel**). `Theme` enum is
  `PIXEL_LIGHT|PIXEL_DARK|MODERN_LIGHT|MODERN_DARK` (data-theme `pixel-light`/`pixel-dark`/
  `modern-light`/`modern-dark`); central registry `src/lib/theme.ts` (`THEME_OPTIONS`,
  `themeDataAttr`, `coerceTheme`); modern skin is unlayered `[data-theme^="modern"]` CSS overriding
  the `.pixel-*` primitives (no layout changes). 4-option picker in settings/onboarding.

---

## 8. Architecture & code structure

Next.js App Router, **server-first**: pages are React Server Components that read data directly
through the data-access layer; mutations are **server actions**. There is deliberately **no
separate HTTP API** for the web app — the server components/actions are the API.

```
src/
  app/                      # routes (RSC). page.tsx / layout.tsx / loading.tsx / not-found.tsx
    api/auth/[...all]/      # the only route handler — better-auth
    manifest.ts             # PWA manifest (metadata route)
  components/               # UI, grouped by domain
    ui/                     # design-system primitives (Pixel* + Skeleton, EmojiField, …)
    auth/ bookmarks/ comments/ lists/ profile/ search/ sharing/
  lib/                      # all non-UI logic
    db.ts                   # Prisma client singleton (pg driver adapter)
    auth.ts / auth-client.ts / session.ts   # better-auth server + client + session helpers
    permissions.ts          # assertRole / roleAtLeast / getMembership
    lists.ts bookmarks.ts comments.ts sharing.ts tags.ts   # data access (read queries)
    actions/                # server actions (mutations): lists, bookmarks, comments,
                            #   sharing, profile, metadata
    types.ts utils.ts       # shared serializable types + cn()/timeAgo()
  generated/prisma/         # generated client (gitignored)
prisma/                     # schema.prisma + migrations (committed)
```

**Layering & conventions**
- **Data access** (`lib/<entity>.ts`) — pure read queries; `import "server-only"`.
- **Mutations** (`lib/actions/<entity>.ts`) — `"use server"`; parse `FormData` → validate →
  `assertRole` → Prisma write → `revalidatePath`/`redirect`. Bound with `.bind(null, id)` and
  passed to client components.
- **Auth boundary**: `requireUser` / `requireOnboardedUser` (redirecting) in server components
  and at the top of every action; **every mutation re-checks `assertRole`** — UI gating is never
  trusted.
- **Ownership convention**: every participant (incl. owner) has a `ListMembership`; ordering +
  access are uniform. `List.ownerId` is the canonical owner pointer.
- **UI**: `components/ui/*` are the reusable pixel primitives; feature components compose them.
  Client components are marked `"use client"` and generally receive already-serialized data
  (see `lib/types.ts` `*CardData`) rather than Prisma objects.
- **Styling**: Tailwind v4 with 8-bit design tokens defined as CSS variables in `globals.css`
  (`@theme inline`), switched light/dark via `data-theme` on `<html>`.
- **Prisma 7 gotcha**: `migrate dev` does **not** reliably regenerate the client — always run
  `npx prisma generate` after a schema change, then restart the dev server.

---

## 9. React Native portability

The app is structured so a future React Native (Expo) client is a realistic, incremental
project rather than a rewrite. What transfers vs. what needs an RN-native equivalent:

**Reusable as-is (server / shared)**
- **Prisma schema + migrations** — the entire data model is platform-agnostic.
- **Domain logic in `lib/`** — read queries, `permissions.ts`, tag-sync, invite/auto-link logic.
  It's plain TypeScript with no React/DOM dependency.
- **Auth** — better-auth has a first-party **Expo** client/plugin, so the same auth server works;
  RN uses `@better-auth/expo` instead of `better-auth/react`.
- **Types** (`lib/types.ts`), `timeAgo()`, and the **design tokens** (palette values) can be
  shared as data.

**Needs an RN parallel (web-specific today)**
- **Transport**: the web calls Prisma via RSC/server actions directly. RN can't — it needs an
  **HTTP/typed API**. Recommended: add a **tRPC (or route-handler) layer that wraps the existing
  `lib/` functions**, so web *and* RN consume one typed surface. The mutation logic already lives
  in small functions inside `lib/actions/*`; splitting each into a pure `core(input)` + a thin
  `action(formData)` wrapper makes it directly callable by both.
- **UI**: everything in `components/` is DOM + Tailwind + Framer Motion → rebuild with RN views.
  - Tailwind classes → **NativeWind** (reuse most class names; feed it the same token palette).
  - Framer Motion → **Moti/Reanimated** (similar declarative API).
  - `next/link` + App Router → **expo-router** (same file-based mental model).
  - `<img>`/remote images → `expo-image`; the pixel-border look → shared style helpers.

**To make the eventual port smoother (recommended, not yet done)**
1. Extract a **`tokens.ts`** as the single source of truth for the palette; have `globals.css`
   and (later) NativeWind both read from it.
2. Introduce the **API boundary** (tRPC) over `lib/` before starting RN; refactor actions into
   `core(input)` + `action(formData)`.
3. Keep new business logic **out of components** and in `lib/` (already the norm).

These are optional and can be done when RN work actually starts — none block the current app.

---

## 10. Open questions / future

- **Location autocomplete + map** (planned, approved, not yet built): make the bookmark
  `location` an address/business type-ahead via Geoapify + a Leaflet/OSM mini-map. Full plan in
  **`docs/location-autocomplete-plan.md`**.
- **Share target** (deferred): manifest `share_target` + `/share` route for Android/desktop PWAs;
  iOS Safari can't receive shares (Apple limitation) — would need an iOS Shortcut forwarding to
  `/share?url=` or a native share extension.
- Realtime collaboration (Supabase realtime) — deferred past v1.
- Pagination for lists with many bookmarks — add when needed.
- Map/geocoding for `location` — deferred.
- Image durability: photos are hotlinked remote URLs; move to Supabase Storage if links rot.
