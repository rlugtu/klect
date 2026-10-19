# Klect

Bookmarking app where bookmarks live inside shareable **lists**. A bookmark has a name,
description, multiple URLs (`urls[0]` = original source), extracted **photos** (`images[]`),
notes, location, 0–5 rating, visited flag, and user-scoped **tags** (stored lowercase — casing
variants are normalized on save so they can't duplicate — each auto-assigned a color at creation;
web renders them as colored pills, mobile as uniform `#hashtags` where the `#` is display-only and
never stored; a **collaborator** can remove a tag from a list, a list-scoped delete that strips it
from every bookmark in that list). Lists are drag-reorderable
(per-user), searchable (name + OR tag filter), and shareable by inviting **viewers** (view +
comment) or **collaborators** (edit + comment); the **owner** manages membership. Each list is
**public or private** (owner-only toggle; **private by default**) — a public list is read-only
viewable by anyone and appears on the owner's profile, while writes always require membership.
Invites are
**request-based** — the invitee approves/rejects a join request from their home page (nobody is
auto-added). Every user has a required, unique **@handle** (lowercase; the `@` is display-only) —
their public identity, shown everywhere a user is mentioned (comments, members, friends, search,
polls, profiles) in place of any name/email; users are invited and friended **by handle**. Users can
add each other as **friends** (`/friends`, request + accept) and bulk-invite a friend to their lists.
Friends can **direct-message** each other 1:1 (`/friends/dms`): a Friends|Messages tab switch, a DM
inbox with unread badges, paginated history, near-real-time delivery (Supabase Realtime, polling
fallback), and per-user clear/delete; sending requires a live friendship (unfriending stops new
messages but history stays readable). Every list also has a **group chatroom** shared by all its
members — a header chat icon (with unread badge) opens a slide-up drawer (web) / bottom sheet (mobile)
where members read + post (each message tagged with the sender's @handle + role); it reuses the DM
realtime pattern, is **members-only**, and only the **owner** can clear it (a hard delete).
Every user has a **profile** (`/users/[handle]`, also resolvable by id) showing their identity, stats,
and public lists, with an add-friend action; reachable from a Profile nav button.
Lists and bookmarks both support **comments**. Pasting a link auto-fills a bookmark from page metadata (and
detects a playable video). Bookmarks are created inside a list, or via a standalone flow
(`/bookmarks/new`) that adds an **independent copy to each of several lists** at once. A **Near me**
page (`/nearby`) finds geocoded bookmarks within a chosen radius of the user's current location.
Bookmarks in a list can also be spun into a **poll** to vote on. Six selectable **themes** across
three families — **pixel** (retro 8-bit), **modern** (sleek/minimalist), and **journal** (warm
scrapbook) — each in light + dark. The web app is an installable **PWA**; the iOS app adds a native
**share extension** that saves a shared link into a list from inside the OS share sheet; and a
**Chrome extension** saves the page you're on into your lists from a toolbar popup (Modern
light/dark only — it mirrors one theme family, not all six).

**Docs:** `DESIGN.md` (data model, permissions, routes, API contract) · `docs/ARCHITECTURE.md`
(human-readable design + architecture overview) · `docs/DEVELOPMENT.md` (run/build/extend +
conventions + gotchas) · `docs/FEATURES.md` (core user features, web vs mobile parity).

## This repo = three apps that share a spec, not code

One git repo, three independent apps as sibling folders. **No workspace tooling** (no pnpm
workspaces, no Turborepo) and **no shared code packages**.

- **`web/`** — Next.js 16 app; owns the database, auth, and **all** business logic. Also hosts the
  HTTP API (tRPC) the other two consume. See `web/CLAUDE.md`.
- **`mobile/`** — Expo / React Native app (iOS + Android); a **thin client** of web's API. UI only.
  See `mobile/CLAUDE.md`.
- **`extension/`** — Chrome (Manifest V3) extension; a **third transport**, deliberately not at
  parity with the other two. Its whole scope is **lists**: save the current page into one or more
  lists, and browse the lists you have. Vite + React + Tailwind, popup only (no side panel, no
  content script). Authenticates by reading the browser's own klect.vercel.app session cookie
  via `chrome.cookies` and sending it as `Authorization: Bearer`. See
  `extension/IMPLEMENTATION_PLAN.md` while the build is in progress.

**The two sharing seams (and only these):**
1. **The spec** — this `CLAUDE.md` + `DESIGN.md` are the single source of truth for product, data
   model, permissions, routes, and the API contract. Each app also keeps its own `CLAUDE.md` +
   `docs/` for implementation specifics.
2. **The runtime API** — web exposes tRPC at `/api/trpc`; mobile and the extension call it. Backend
   logic is written **once** (in web); only UI is built per app. The apps never import each other's
   runtime code — the only cross-folder reference is a **type-only** import of web's tRPC
   `AppRouter` (erased at compile time, so no runtime coupling).

**Extension-specific rule:** every network call to the API originates in the extension's
**background service worker**. MV3 extension pages are exempt from page-level CORS for origins in
`host_permissions`; content scripts are not, and `/api/trpc` has no CORS configuration at all. A
call from anywhere else fails as an opaque CORS error that tempts someone into adding CORS headers
to the server. Don't.

## Building a feature — do it for BOTH apps

1. **Schema** change (if any) → `web/prisma` + migration.
2. **Business logic** → `web/src/lib` as a pure `core(input)` function.
3. **Expose** → add a tRPC procedure in `web` that wraps `core`; **document it in the DESIGN.md API
   contract**.
4. **Web UI** → web server-action wrapper + RSC/components.
5. **Mobile UI** → mobile screen consuming the tRPC procedure.

Steps 1–3 are done once and serve both apps; 4 and 5 are per-platform on the same typed surface, so
the two clients can't silently drift. Because there is no compiler-enforced shared package, drift is
prevented by (a) this shared spec, (b) the typed tRPC contract, and (c) landing both apps'
UI in the same change.

**`extension/` is NOT part of this parity loop.** It is deliberately scoped to lists only, so most
features have no extension step at all — and when one does, it is a separate, explicit decision, not
an automatic sixth step. The extension still consumes the same typed `AppRouter`, so a contract
change that breaks it breaks its typecheck.
