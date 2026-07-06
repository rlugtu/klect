# Saive — Architecture & Design Overview

A human-readable tour of what Saive is and how it's built. For the canonical data
model, permission matrix, and the full tRPC procedure list, see [`../DESIGN.md`](../DESIGN.md).
For "how do I run/change/extend it," see [`DEVELOPMENT.md`](./DEVELOPMENT.md).

---

## 1. What Saive is

Saive is a **bookmarking app where bookmarks live inside shareable lists**. A bookmark
has a name, description, one or more URLs (the first is the original source), extracted
photos, notes, a location, a 0–5 rating, a visited flag, and user-scoped tags (each auto-
assigned a color). Lists are drag-reorderable per user, searchable, and shareable — you
invite **viewers** (read + comment) or **collaborators** (edit + comment), and the **owner**
manages membership. Lists and bookmarks both support comments. Pasting a link auto-fills a
bookmark from page metadata. A **Near me** view finds geocoded bookmarks within a radius of
your location. There are two visual **themes** — pixel (retro 8-bit) and modern (sleek) —
each with light and dark variants.

It ships as **two clients over one backend**: a Next.js **web** app and an Expo/React
Native **mobile** app.

---

## 2. The big picture: two apps, one repo

```
saive/                        one git repo — NO monorepo tooling (no workspaces/turbo)
├─ CLAUDE.md  DESIGN.md        the SHARED SPEC (source of truth for both apps)
├─ docs/                       cross-cutting docs (this file, DEVELOPMENT.md, plans)
├─ web/                        Next.js 16 app — owns the DB, auth, ALL business logic,
│                              and hosts the HTTP API. Deploys independently.
└─ mobile/                     Expo (RN) app — a THIN CLIENT of web's API. UI only.
```

The two apps are **independent** (own `package.json`, build, deploy, release cadence) and
**never import each other's runtime code**. They are kept in sync by two seams, and only
these two:

1. **The spec** — `CLAUDE.md` + `DESIGN.md` at the root describe the product, data model,
   permissions, and the API contract. Both apps build against it.
2. **The runtime API** — `web` exposes a typed **tRPC** API at `/api/trpc`; `mobile`
   consumes it. Backend logic is written **once** (in web); only the UI is built per platform.

The one compile-time link is a **type-only import**: mobile imports web's tRPC `AppRouter`
*type* for end-to-end type safety. Because it's `import type`, it's erased at build time —
there is **no runtime dependency** on web (see §6).

> **Why not a monorepo with shared packages?** That was considered and rejected (see the
> superseded [`monorepo-migration.md`](./monorepo-migration.md)). The chosen model keeps the
> apps genuinely decoupled while still writing backend logic once, because the backend lives
> wholly inside `web` and mobile reaches it only over HTTP.

---

## 3. How a request flows

The backbone is the same for both clients: **all business logic lives in one place**
(`web/src/lib/core`) and is reached by two different transports.

```
                    ┌───────────────────────── web/src/lib/core/*  ─────────────────────────┐
                    │   pure functions: validate → assertRole → Prisma → return result       │
                    └───────────────▲─────────────────────────────────────▲──────────────────┘
                                    │ (direct call, same process)          │ (thin wrapper)
        WEB                         │                                      │            MOBILE
   RSC page / server action ────────┘                          tRPC procedure ◄──── HTTP ──── tRPC client
   (web/src/lib/actions/*)                                     (web/src/server/trpc)     (mobile/src/client/api.ts)
```

- **Web** is server-first. Pages are React Server Components that read data directly via the
  `lib/<entity>.ts` read modules; mutations are **server actions** that call `core` and then
  `revalidatePath`/`redirect`. No network hop.
- **Mobile** has no database access. Every read and write is a **tRPC call** over HTTP to
  web's `/api/trpc`, carrying the better-auth session cookie.
- Both a web action and its tRPC procedure delegate to the **same** `core()` function — the
  logic is never duplicated between transports.

---

## 4. The web app (the backend + its own UI)

**Stack:** Next.js 16 (App Router, RSC + server actions), React 19, TypeScript, Tailwind v4,
Framer Motion, Prisma 7 (pg driver adapter) → Supabase Postgres, better-auth.

### Layered `src/lib`

| Layer | Files | Role |
|---|---|---|
| DB | `db.ts` (Prisma singleton), `prisma/schema.prisma` | Data model + client |
| Reads | `lists.ts`, `bookmarks.ts`, `comments.ts`, `sharing.ts`, `tags.ts` | Pure Prisma read queries (`import "server-only"`) |
| **Core (writes/logic)** | `core/*.ts` | `core(userId, input)`: validate → `assertRole` → Prisma → return |
| Permissions | `permissions.ts` | `Role` rank, `assertRole`, `getMembership` |
| Actions | `actions/*.ts` | `"use server"` wrappers: FormData → core → revalidate/redirect |
| Utilities | `geo.ts`, `video.ts`, `theme.ts`, `tag-colors.ts`, `types.ts`, `utils.ts` | Pure, portable helpers |
| Auth | `auth.ts` (server), `auth-client.ts`, `session.ts` | better-auth config + guards |

### The `core(input)` + `action(formData)` pattern

This split is the heart of the architecture. Each mutation is two pieces:

```ts
// web/src/lib/core/lists.ts — transport-agnostic, reusable
export async function updateList(userId, listId, input) {
  await assertRole(userId, listId, "COLLABORATOR");     // authz
  await prisma.list.update({ where: { id: listId }, data: normalizeListInput(input) });
}

// web/src/lib/actions/lists.ts — the WEB transport wrapper only
export async function updateList(listId, formData) {
  const user = await requireUser();
  await core.updateList(user.id, listId, listInputFromFormData(formData));
  revalidatePath("/"); revalidatePath(`/lists/${listId}`);
}
```

`core` contains **all** the business rules (validation, tag-color assignment, invite
auto-linking, bookmark field normalization). It has no FormData, no `revalidatePath`/
`redirect`, and no session lookup — those are transport concerns handled by the caller.

### The tRPC API (`src/server/trpc`)

The mobile-facing surface, mounted at `/api/trpc` beside the auth handler.

- `trpc.ts` — context (resolves the better-auth session) + `protectedProcedure` (requires a
  signed-in user, narrows `ctx.user`).
- `inputs.ts` — reusable zod input schemas (the typed contract mobile sends).
- `routers/*.ts` — one router per domain; **35 procedures** total. Each is a thin wrapper
  over a `core` mutation or a `lib` read.
- `router.ts` — combines them into `appRouter` and `export type AppRouter`.

**Security note:** the read modules have no built-in authz (RSC pages gate before reading),
so **query** procedures add explicit `assertRole` (e.g. `bookmarks.forList` requires VIEWER,
`sharing.pendingInvites` requires OWNER). Mutations are already safe because `core` calls
`assertRole` internally.

### Ownership model

Every participant — including the owner — has a `ListMembership` row, which gives uniform
per-user ordering and access checks. `List.ownerId` is the canonical owner. Permissions are
a simple rank: `VIEWER (1) < COLLABORATOR (2) < OWNER (3)`; `assertRole` throws below the
required rank. See `DESIGN.md §4`.

---

## 5. Auth

better-auth backs both apps against **one** server (in `web/src/lib/auth.ts`): Google +
email/password, with a `databaseHooks.user.create.after` hook that auto-attaches any pending
list invites when a user signs up, and profile `additionalFields` (firstName, lastName,
displayName, birthday, icon, theme).

- **Web** uses `better-auth/react` (`auth-client.ts`) and server guards in `session.ts`
  (`requireUser`, `requireOnboardedUser`) plus the `nextCookies()` plugin.
- **Mobile** uses `@better-auth/expo` (`mobile/src/client/auth.ts`) against the same server,
  storing tokens in `expo-secure-store`.
- **Google on mobile** goes *through* the web server: the app opens the server's OAuth URL,
  the server runs Google with its existing web client, then deep-links back to the app's
  `saive://` scheme. This needs the `expo()` **server** plugin and
  `trustedOrigins: ["saive://"]` in web's auth config — no separate native Google client id.

---

## 6. The mobile app (a thin, typed client)

**Stack:** Expo SDK 57, expo-router (file-based routes), React 19, react-native-reanimated,
`expo-image`, NativeWind, `@trpc/client`, `@better-auth/expo`, `expo-location`,
`expo-secure-store`.

### Talking to the backend — the typed client

`mobile/src/client/api.ts` builds a tRPC client and imports web's `AppRouter` **type only**:

```ts
import type { AppRouter } from "@web/server/trpc/router";   // erased at build — no runtime link
export const trpc = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url, headers })] });
```

This gives full end-to-end type inference (a screen destructuring `list._count.bookmarks` is
type-checked against web's Prisma types) with **zero runtime coupling**. It's made to compile
by two tsconfig aliases in `mobile/tsconfig.json`:

- `@web/*` → `../web/src/*` (the router import)
- `@/*` → `["./src/*", "../web/src/*"]` — mobile's own `@/` resolves first; the fallback lets
  web's internal `@/lib/...` imports resolve when tsc follows the `AppRouter` type.

To keep this working, **mobile app code never lives under `src/lib`** (that path is reserved
so it can't shadow web's server graph); mobile's clients live in `src/client`, theme in
`src/theme`. A `types/server-only.d.ts` stub satisfies the `import "server-only"` that web's
modules begin with.

### Navigation (expo-router)

```
src/app/_layout.tsx           root Stack + auth gate (login when signed out); registers routes
  (tabs)/_layout.tsx          NativeTabs — Lists / Nearby / Settings (SF Symbol icons)
  (tabs)/index.tsx            Home: lists + search        → push /lists/[id]
  (tabs)/nearby.tsx           radius search (expo-location → trpc.nearby.find)
  (tabs)/settings.tsx         account + theme switcher
  lists/[id].tsx              a list's bookmarks + tag filter + comments; top action row → Edit list / Members
  lists/new.tsx  lists/edit.tsx (edit + delete)  lists/members.tsx   (modals / pushed screens)
  bookmarks/[id].tsx          bookmark detail + comments + edit/delete/visited
  bookmarks/new.tsx  bookmarks/edit.tsx
```

Reusable pieces live in `src/components`: `bookmark-form.tsx` and `list-form.tsx` (shared by
create + edit), `comments-section.tsx` (shared by bookmark + list comments), `login-screen.tsx`.

### Screen data pattern

Screens fetch on focus and re-fetch after mutations:

```ts
useFocusEffect(useCallback(() => {
  trpc.bookmarks.forList.query({ listId: id }).then(setBookmarks).catch(setErr);
}, [id]));
```

Types are inferred from the procedures — e.g.
`type Bookmarks = Awaited<ReturnType<typeof trpc.bookmarks.forList.query>>` — never hand-written.

### Theming (the two-family, four-theme system)

Web defines the palette as CSS variables per `data-theme` in `globals.css` (canonical).
Mobile mirrors those values as data in `src/theme/tokens.ts` and reproduces the runtime
swap with NativeWind:

- `theme-provider.tsx` applies the active theme's tokens as CSS variables via NativeWind's
  `vars()` on a root wrapper — the RN equivalent of web's `data-theme` swap. The choice
  persists to `expo-secure-store`; default follows the system light/dark pixel theme.
- `tailwind.config.js` maps semantic names to those vars: `bg-bg`, `text-ink`, `bg-primary`,
  `border-border`, plus **skin** knobs `border-skin` / `rounded-skin[-sm]` that differ by
  family (pixel = chunky 2px borders + blocky 4px corners; modern = thin 1px + rounded 16px).
- So a component writes `className="rounded-skin border-skin border-border bg-panel"` and it
  restyles automatically when the theme changes. (The retro pixel *font* is a pending follow-up.)

---

## 7. Recurring patterns (the idioms to follow)

- **One brain, two transports.** Business logic → `web/src/lib/core`. Web actions and tRPC
  procedures are thin callers. Never put logic in a component or duplicate it per transport.
- **Never trust UI gating.** Every mutation re-checks `assertRole` inside `core`; query
  procedures gate reads explicitly.
- **Types flow from the schema.** Prisma types → `core`/read return types → tRPC `AppRouter`
  → mobile client. UI code infers, never re-declares.
- **Mobile is UI-only.** No DB, no secrets, no business rules. New capability that touches
  data = a new `core` fn + tRPC procedure first; the mobile screen just calls it.
- **Secrets stay in web.** Mapbox, Microlink, and Anthropic keys live only in web's env;
  mobile reaches those capabilities through tRPC procedures (`places`, `metadata`,
  `comprehend`), so nothing ships in the app.
- **Design tokens are data.** Palette + skin values live once (web `globals.css`, mirrored in
  mobile `tokens.ts`) and drive styling via CSS variables.

---

## 8. External services

| Service | Used for | Where | Notes |
|---|---|---|---|
| Supabase Postgres | Data | web (Prisma) | pooled URL at runtime, direct URL for migrations |
| Mapbox | Location autocomplete + reverse geocode | `core/places.ts` | `MAPBOX_TOKEN`; degrades to plain text if unset |
| Microlink | Link/photo/video unfurl for autofill | `core/metadata.ts` | free tier is IP-rate-limited; YouTube via oEmbed |
| Anthropic | Caption → structured bookmark fields | `core/comprehend.ts` | best-effort; falls back to raw caption |

All four are reachable from mobile via their tRPC procedures — no keys leave web.

---

## 9. Where to read more

- **Data model, permissions, routes, full API contract:** [`../DESIGN.md`](../DESIGN.md)
- **How to run, build, and extend the apps:** [`DEVELOPMENT.md`](./DEVELOPMENT.md)
- **Web-specific conventions & gotchas:** [`../web/CLAUDE.md`](../web/CLAUDE.md)
- **Mobile-specific notes:** [`../mobile/CLAUDE.md`](../mobile/CLAUDE.md)
- **Feature deep-dives:** `web/docs/` (nearby, location autocomplete, autofill, video player)
