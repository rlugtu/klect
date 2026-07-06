# Saive

Bookmarking app where bookmarks live inside shareable **lists**. A bookmark has a name,
description, multiple URLs (`urls[0]` = original source), extracted **photos** (`images[]`),
notes, location, 0–5 rating, visited flag, and user-scoped **tags** (each auto-assigned a color at
creation, rendered on the tag pills). Lists are drag-reorderable
(per-user), searchable (name + OR tag filter), and shareable by inviting **viewers** (view +
comment) or **collaborators** (edit + comment); the **owner** manages membership. Lists and
bookmarks both support **comments**. Pasting a link auto-fills a bookmark from page metadata (and
detects a playable video). Bookmarks are created inside a list, or via a standalone flow
(`/bookmarks/new`) that adds an **independent copy to each of several lists** at once. A **Near me**
page (`/nearby`) finds geocoded bookmarks within a chosen radius of the user's current location.
Two selectable **themes** — **pixel** (retro 8-bit) and
**modern** (sleek/minimalist), each light + dark. Installable **PWA**.

**Full design doc: `DESIGN.md`** (data model, permissions, routes, API contract, architecture).

## This repo = two apps that share a spec, not code

One git repo, two independent apps as sibling folders. **No workspace tooling** (no pnpm
workspaces, no Turborepo) and **no shared code packages**.

- **`web/`** — Next.js 16 app; owns the database, auth, and **all** business logic. Also hosts the
  HTTP API (tRPC) that mobile consumes. See `web/CLAUDE.md`.
- **`mobile/`** — Expo / React Native app; a **thin client** of web's API. UI only. *(Not built
  yet — added in the RN conversion.)* Will have its own `mobile/CLAUDE.md`.

**The two sharing seams (and only these):**
1. **The spec** — this `CLAUDE.md` + `DESIGN.md` are the single source of truth for product, data
   model, permissions, routes, and the API contract. Each app also keeps its own `CLAUDE.md` +
   `docs/` for implementation specifics.
2. **The runtime API** — web exposes tRPC at `/api/trpc`; mobile calls it. Backend logic is written
   **once** (in web); only UI is built per app. The apps never import each other's runtime code —
   the only cross-folder reference is a **type-only** import of web's tRPC `AppRouter` (erased at
   compile time, so no runtime coupling).

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
