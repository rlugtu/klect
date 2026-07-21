# Klect — Architecture & Design Overview

A human-readable tour of what Klect is and how it's built. For the canonical data
model, permission matrix, and the full tRPC procedure list, see [`../DESIGN.md`](../DESIGN.md).
For "how do I run/change/extend it," see [`DEVELOPMENT.md`](./DEVELOPMENT.md).

---

## 1. What Klect is

Klect is a **bookmarking app where bookmarks live inside shareable lists**. A bookmark
has a name, description, one or more URLs (the first is the original source), extracted
photos, notes, a location, a 0–5 rating, a visited flag, and user-scoped tags (each auto-
assigned a color). Lists are drag-reorderable per user, searchable, and shareable — you
invite **viewers** (read + comment) or **collaborators** (edit + comment), and the **owner**
manages membership (invites are request-based). Lists and bookmarks both support comments, and a
list's bookmarks can be spun into a **poll**. Pasting a link auto-fills a bookmark from page
metadata and detects a playable video. A **Near me** view finds geocoded bookmarks within a radius
of your location. There are **six visual themes** across three families — pixel (retro 8-bit),
modern (sleek), and journal (warm scrapbook) — each with light and dark variants.

It ships as **two clients over one backend**: a Next.js **web** app and an Expo/React
Native **mobile** app.

---

## 2. The big picture: two apps, one repo

```
klect/                        one git repo — NO monorepo tooling (no workspaces/turbo)
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

> **Why not a monorepo with shared packages?** A pnpm/Turborepo monorepo with shared `packages/*`
> was considered and rejected. The chosen model keeps the apps genuinely decoupled while still
> writing backend logic once, because the backend lives wholly inside `web` and mobile reaches it
> only over HTTP.

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
  web's `/api/trpc`, carrying the better-auth session as an `Authorization: Bearer` token
  (**not** a cookie — see §5).
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
| Permissions | `permissions.ts` | `Role` rank, `assertRole`, `getMembership`; **`getViewerAccess`/`assertCanView`** grant a read-only guest `VIEWER` on **public** lists (non-members) |
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
- `routers/*.ts` — one router per domain (lists, bookmarks, comments, polls, sharing, friends,
  profile, tags, nearby, and the external-service router mounted as `places`/`metadata`/`comprehend`);
  **55 procedures** total. Each is a thin wrapper over a `core` mutation or a `lib` read.
- `router.ts` — combines them into `appRouter` and `export type AppRouter`.

**Security note:** the read modules have no built-in authz (RSC pages gate before reading),
so **query** procedures add explicit checks — `assertRole` for members-only reads
(`sharing.pendingInvites` requires OWNER), or `assertCanView` for reads that also allow a
**public** list's guests (`bookmarks.forList`, `comments.forList`). Mutations are already safe
because `core` calls `assertRole` internally — including visibility, where `lists.setVisibility`
requires OWNER and `lists.update` deliberately ignores `isPublic`.

### Ownership model

Every participant — including the owner — has a `ListMembership` row, which gives uniform
per-user ordering and access checks. `List.ownerId` is the canonical owner. Permissions are
a simple rank: `VIEWER (1) < COLLABORATOR (2) < OWNER (3)`; `assertRole` throws below the
required rank. See `DESIGN.md §4`.

---

## 5. Auth

better-auth backs both apps against **one** server (in `web/src/lib/auth.ts`): Google +
email/password, with a `databaseHooks.user.create.after` hook that auto-attaches any pending
list invites when a user signs up, and profile `additionalFields` (handle, firstName, lastName,
birthday, icon, theme). The unique `handle` is the public identity and the onboarding gate.

- **Web** uses `better-auth/react` (`auth-client.ts`) and server guards in `session.ts`
  (`requireUser`, `requireOnboardedUser`) plus the `nextCookies()` plugin.
- **Mobile** uses `@better-auth/expo` (`mobile/src/client/auth.ts`) against the same server,
  storing tokens in `expo-secure-store`.
- **Mobile API transport = Bearer token, NOT cookie.** The tRPC client sends
  `Authorization: Bearer <sessionToken>`; the server runs better-auth's **`bearer()`** plugin
  (`plugins: [expo(), bearer(), nextCookies()]`) to accept it. **Do not "simplify" this back to a
  `Cookie: authClient.getCookie()` header** — in an iOS **release** build over HTTPS the native
  networking layer swallows `Secure` `Set-Cookie` headers before `@better-auth/expo` can persist
  them, so `getCookie()` returns empty and every protected call fails with *"Sign in required"*.
  This only reproduces in a store/TestFlight build (plain-HTTP localhost keeps the cookie), so it
  passes dev/simulator. The `bearer()` hook is inert unless an `Authorization` header is present,
  so web's cookie flow is untouched.
- **Two sign-in paths capture the token differently — both must keep working** (see
  `resolveBearerToken` in `mobile/src/client/auth.ts`): email/password gets the token from the
  `set-auth-token` **response header** (`fetchOptions.onSuccess`); Google OAuth never fires that
  header — its session arrives as a `cookie` query param on the `klect://` deep-link redirect, so
  the client falls back to the session-token value parsed out of the stored cookie (which the
  `bearer()` plugin accepts). Miss the Google fallback and Google users sign in but hit *"Sign in
  required"* on every list/bookmark call.
- **Google on mobile** goes *through* the web server: the app opens the server's OAuth URL,
  the server runs Google with its existing web client, then deep-links back to the app's
  `klect://` scheme. This needs the `expo()` **server** plugin and
  `trustedOrigins: ["klect://"]` in web's auth config — no separate native Google client id.
  Web and mobile share the redirect URI `https://klect.vercel.app/api/auth/callback/google`, so a
  *mobile-only* Google failure is **not** a Google Cloud Console problem (prod web Google working
  proves the OAuth client is fine).

---

## 6. The mobile app (a thin, typed client)

**Stack:** Expo SDK 54 (React Native 0.81, React 19) built as a **custom dev/EAS build** — the
native **share extension** (`expo-share-extension`), video player (`expo-video`), and frosted-glass
tab bar (`expo-blur`) can't run in Expo Go. expo-router (file-based routes),
react-native-reanimated + gesture-handler, `@gorhom/bottom-sheet` (tag filter),
`react-native-reorderable-list` (drag-reorder), `expo-image`, NativeWind, `@trpc/client`,
`@better-auth/expo`, `expo-location`, `expo-secure-store`, expo-font (Newsreader / Work Sans).

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
  (tabs)/_layout.tsx          Tabs (swipeable pager) — Nearby / Create(＋) / Lists / Friends / Profile
  (tabs)/index.tsx            Home: lists + search + drag-reorder → push /lists/[id]
  (tabs)/nearby.tsx           Mapbox map + drawer (expo-location → trpc.nearby.find)
  (tabs)/create.tsx           action-only tab: press intercepted → push /bookmarks/new (renders null)
  (tabs)/friends.tsx          friends + add-by-email; → friend-requests / pending-requests
  (tabs)/profile.tsx          own profile; settings gear → push /settings
  settings.tsx                account + theme switcher + privacy link + danger zone (pushed route, reached from Profile gear)
  delete-account.tsx          "Danger zone" account deletion; type-your-@handle to confirm → account.delete → sign out
  lists/[id].tsx              a list's bookmarks + tag filter + comments; List|Polls tabs + ⋮ actions menu (Edit/Members/Duplicate/Clear)
  lists/new.tsx  lists/edit.tsx  lists/members.tsx
  bookmarks/[id].tsx          bookmark detail + comments + video + edit/delete/visited
  bookmarks/new.tsx  bookmarks/edit.tsx
  polls/*                     list polls, poll detail (Vote/Results), new/edit
  requests.tsx                incoming list-join requests (approve/reject)
  friend-requests.tsx  pending-requests.tsx      incoming / outgoing friend requests
  users/[id].tsx              another user's profile (add-friend)
  src/share-extension.tsx     iOS share-sheet save UI (entry: index.share.js)
```

Reusable pieces live in `src/components`: `bookmark-form.tsx` and `list-form.tsx` (shared by
create + edit), `comments-section.tsx` (shared by bookmark + list comments), `profile-view.tsx`
(own + others' profiles), `list-picker.tsx`, `login-screen.tsx`.

### Screen data pattern

Screens fetch on focus and re-fetch after mutations:

```ts
useFocusEffect(useCallback(() => {
  trpc.bookmarks.forList.query({ listId: id }).then(setBookmarks).catch(setErr);
}, [id]));
```

Types are inferred from the procedures — e.g.
`type Bookmarks = Awaited<ReturnType<typeof trpc.bookmarks.forList.query>>` — never hand-written.

### Theming (three families, six themes)

Mobile has **three theme families** — **Journal** (warm scrapbook; the *default*), Pixel, and
Modern — each light + dark. Pixel/Modern mirror web's `globals.css` palettes; **Journal is
mobile-first** (see `mobile/docs/design.md`). Only palette/skin/font differ per family; the screen
*structure* (photo-forward cards, headers, bottom sheet) is shared across all of them.

- `src/theme/tokens.ts` holds `THEME_TOKENS` (the 6 palettes) + a per-family **skin** map (border
  width + corner radii — Pixel: 2px/4px, Modern: 1px/16px, Journal: 1px/20px).
- `theme-provider.tsx` applies the active theme's tokens as CSS variables via NativeWind's `vars()`
  on a root wrapper — the RN equivalent of web's `data-theme` swap. The choice persists to
  `expo-secure-store`; default follows system light/dark **Journal**.
- `tailwind.config.js` maps semantic names to those vars — `bg-bg`, `text-ink`, `bg-primary`,
  `border-border`, the skin knobs `border-skin` / `rounded-skin[-sm]`, and **fonts** `font-serif`
  (Newsreader) / `font-sans[-medium|-semibold]` (Work Sans, loaded via `expo-font` in `_layout`).
- So a component writes `className="rounded-skin border-skin border-border bg-panel font-serif"`
  and it restyles automatically when the theme changes.
- Journal component patterns: photo-forward cards (`components/photo-card.tsx` + `theme/shadows.ts`),
  lowercase colored `components/tag-pill.tsx`, and a `@gorhom/bottom-sheet` tag filter on the list
  screen.

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
- **Toasts are a shared imperative singleton, per app.** Action feedback goes through one small
  pub/sub store with a matching API on each side (`web/src/lib/toast.ts`, `mobile/src/client/toast.ts`)
  and a host mounted once in the root layout (`Toaster` / `ToastHost`). It's pure UI — no schema,
  `core`, or tRPC — so it's the rare feature built independently on each client against the same API
  shape. Call `toast.success/error/info(...)` right where an action resolves; on web, redirecting
  server actions hand the toast across navigation via a flash cookie (`lib/toast-flash.ts`).

---

## 8. External services

| Service | Used for | Where | Notes |
|---|---|---|---|
| Supabase Postgres | Data | web (Prisma) | pooled URL at runtime, direct URL for migrations |
| Mapbox | Location autocomplete + reverse geocode | `core/places.ts` | `MAPBOX_TOKEN`; degrades to plain text if unset |
| LinkPreview | Primary link/photo/video unfurl for autofill | `core/metadata.ts` | `LINKPREVIEW_API_KEY`; YouTube via oEmbed |
| Microlink | Fallback unfurler when LinkPreview key is unset or fails | `core/metadata.ts` | free tier is IP-rate-limited |
| Anthropic | Autofill comprehension + caption → structured bookmark fields | `core/comprehend.ts` | `ANTHROPIC_API_KEY`; best-effort, degrades to raw metadata |
| Supabase Realtime | Near-real-time direct-message **and list-chatroom** delivery | server: `core/dm-realtime.ts` + `core/list-chat-realtime.ts` (broadcast); clients: `web` `lib/realtime/client.ts` + `mobile` `client/realtime.ts` (`subscribeDm` / `subscribeListChat`) | Content-free "refetch" ping only (`dm:*` / `chat:list:<id>`); data still flows over tRPC. `SUPABASE_*` / `NEXT_PUBLIC_SUPABASE_*` / `EXPO_PUBLIC_SUPABASE_*`; **degrades to polling** if unset |
| Expo push (APNs) | **Mobile** device notifications — lockscreen alerts + app-icon badge | server: `core/push.ts` (`expo-server-sdk`), sent alongside the realtime pings; client: `mobile` `client/push.ts` (register/tap-route) + `notifications.*` tRPC router | Per-category `NotificationPreference` toggles; server-computed `badge`; dead tokens pruned on `DeviceNotRegistered`. iOS needs an APNs key in EAS; optional `EXPO_ACCESS_TOKEN`. **No-ops when no devices registered** |

Most are reachable from mobile via their tRPC procedures — no keys leave web. The exception is
Supabase Realtime: the server sends broadcasts (server key), but clients also **subscribe directly**
to public broadcast channels using the public anon key/URL (safe — the socket only carries content-free
pings; all real DM/chatroom data comes back over authenticated tRPC).

---

## 9. Where to read more

- **Data model, permissions, routes, full API contract:** [`../DESIGN.md`](../DESIGN.md)
- **How to run, build, and extend the apps:** [`DEVELOPMENT.md`](./DEVELOPMENT.md)
- **Web-specific conventions & gotchas:** [`../web/CLAUDE.md`](../web/CLAUDE.md)
- **Mobile-specific notes:** [`../mobile/CLAUDE.md`](../mobile/CLAUDE.md)
- **Feature deep-dives:** `web/docs/` (nearby, location autocomplete, autofill, video player)
