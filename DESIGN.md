# Klect — Design Doc

> Bookmarks organized into shareable lists, with tags, filtering, and collaboration.
> Ships as two clients over one backend — a Next.js **web** app and an Expo/React Native
> **mobile** app. This document is the single source of truth for the design; update it whenever a
> decision changes.
> See also: `docs/FEATURES.md` (core user features + web/mobile parity).

**Status:** Live. Web deploys from `main`; mobile ships to TestFlight/App Store via EAS.
**Last updated:** 2026-07-14

## Overview

Klect is a bookmarking app where bookmarks live inside **lists** that can be shared with other
people. A bookmark is richer than a URL — it has a name, description, multiple URLs (the first is
the original source), extracted **photos**, free-form notes, a location, a 0–5 rating, a
visited flag, and user-scoped **tags**. Lists can be organized (per-user drag-reorder) and
searched (by name, and by tag with OR filtering), and each is **public or private** (owner-only
toggle, private by default). Lists are shared by inviting people as **viewers** (view + comment) or
**collaborators** (full edit + comment); the **owner** manages membership, and invites are
**request-based** (the invitee approves them). Users add each other as **friends** and can
bulk-invite a friend to their lists. Both lists and bookmarks support **comments**, and a list's
bookmarks can be spun into a **poll** to vote on. Pasting a link (YouTube/TikTok/blogs) auto-fills a
bookmark from the page's metadata and detects a playable video. A **Near me** view finds geocoded
bookmarks near you. It wears one of **six themes** (pixel / modern / journal, each light + dark);
the web app is an installable **PWA** and the iOS app adds a native **share extension**.

For a benefit-first, non-technical summary and narrative use cases, see the **Product overview** and
**Use cases** sections of `docs/FEATURES.md` (kept in sync as features ship).

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

**Aesthetic:** three theme families, each with a light + dark variant, stored per-user (the
`Theme` enum: `PIXEL_LIGHT` / `PIXEL_DARK` / `MODERN_LIGHT` / `MODERN_DARK` /
`JOURNAL_LIGHT` / `JOURNAL_DARK`; **`MODERN_LIGHT` is the default**):
- **Pixel** (the original) — retro 8-bit: pixel fonts ("Press Start 2P" / VT323), chunky
  borders, hard offset drop-shadows.
- **Modern** (the default) — sleek/minimalist: clean sans (Inter), thin/rounded borders, soft
  shadows, monochrome palette with pastel gradients.
- **Journal** — warm "scrapbook": serif titles (Newsreader) + sans body (Work Sans), soft
  rounded cards, warm beige/brown palette, solid (non-gradient) primary buttons.

Themes are swapped via a `data-theme` attribute on `<html>`; see §7 for how the modern skin
reuses the same components/tokens without any layout change.

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
- **`location`**: address/business type-ahead via Mapbox Search Box (server-proxied); stores the display
  address plus `latitude`/`longitude`. On the bookmark page the address is tappable and opens the
  place in a maps app (Apple Maps / Google Maps chooser on Apple devices, Google Maps elsewhere).
  Free-typed text still saves with no coordinates. No in-app map UI.
- **Realtime**: out of scope — comments/edits refresh on action. Supabase realtime can
  come later.

---

## 3. Data model (Prisma)

better-auth manages its own `user` / `session` / `account` / `verification` tables. Our app
fields extend the user record; app entities below.

```
User            id, email, handle (unique, lowercase; the public @handle),
                firstName, lastName, birthday?, icon (emoji),
                theme (Theme enum), createdAt
                — handle is the sole public identity, shown as @handle everywhere a
                  user is mentioned (comments, members, friends, search, polls,
                  profiles). Nullable in the DB but required via the onboarding gate
                  (like the old displayName). firstName/lastName are collected but
                  never displayed.

List            id, name, description, icon, isPublic (bool), ownerId, createdAt
                — isPublic defaults **false** (private); public = read-only viewable by
                  anyone signed in (and shown on the owner's profile). Membership still
                  gates every write.

ListMembership  id, listId, userId, role (OWNER|COLLABORATOR|VIEWER),
                position (int — per-user ordering), createdAt

ListInvite      id, listId, email, role, token, status (PENDING|ACCEPTED|REJECTED),
                invitedById, createdAt
                — a PENDING invite is a **join request**: the invitee approves/rejects it
                  on their home page ("collab requests"); nobody is added until approval.
                  A new signup's pending invites surface as requests (no auto-join).

Friendship      id, requesterId, addresseeId, status (PENDING|ACCEPTED), createdAt
                — unique per (requesterId, addresseeId); a directed friend request that
                  becomes mutual on ACCEPTED. "My friends" = ACCEPTED rows on either side.

Conversation    id, pairKey (unique), lastMessageAt, createdAt
                — a 1:1 direct-message thread. pairKey = the two user ids sorted + joined,
                  so get-or-create is atomic/race-safe. lastMessageAt is denormalized for
                  inbox sort. Independent of Friendship (no cascade on unfriend) → history
                  survives; sending is gated on a *live* friendship at write time.
ConversationParticipant
                id, conversationId, userId, clearedAt?, lastReadAt?
                — one row per member (mirrors ListMembership). clearedAt hides messages
                  at/before it from that user (drives clear + delete; the thread reappears
                  on newer activity). lastReadAt drives the unread flag. unique per
                  (conversationId, userId).
Message         id, conversationId, senderId, body, createdAt
                — indexed on (conversationId, createdAt) for keyset pagination.

ListChatMessage id, listId, senderId, body, createdAt
                — a message in a list's group chatroom (shared by all the list's members;
                  the list *is* the room, ListMembership the participant analogue). Indexed
                  on (listId, createdAt) for keyset pagination. Owner-only clear hard-deletes
                  rows. Per-member read state lives on ListMembership.chatLastReadAt (unread =
                  messages from others newer than it).

Bookmark        id, listId, name, description, urls (string[]),
                images (string[]), notes, location, latitude?, longitude?,
                rating (0–5), visited (bool), videoUrl, videoType,
                createdAt, updatedAt
                -- no icon (removed); urls[0] = original source link;
                -- images = extracted photo URLs;
                -- location = display address; latitude/longitude set only when
                --   picked from Mapbox autocomplete (null for free text);
                -- videoUrl/videoType = detected playable video ("iframe"|"file")

Tag             id, name, color, userId   — unique per (userId, name); color = random hex assigned at creation
BookmarkTag     bookmarkId, tagId         — join table

Comment         id, authorId, value, createdAt,
                bookmarkId?, listId?      — exactly one of the two set

Poll            id, listId, creatorId, name, description, startAt,
                endAt?, maxVotes?, revotesAllowed, isAnonymous, timestamps
                                          — maxVotes null = unlimited; endAt null = open;
                                            isAnonymous set only at creation (immutable)
PollOption      id, pollId, bookmarkId    — unique per (pollId, bookmarkId); a list bookmark as a choice
PollVote        id, pollId, optionId, userId — unique per (optionId, userId); unweighted (one/option/user)
```

**Relationships & rules**
- A user sees a list on their home page if they own it **or** have a `ListMembership`.
- **List visibility** (`isPublic`, owner-only toggle): a **public** list is read-only viewable
  by any signed-in user (its bookmarks + comments are readable without a membership) and appears
  on the owner's profile. A **private** list (the default) is visible only to members. Reads use
  a public fallback (`getViewerAccess` / `assertCanView`); **every mutation still requires a real
  `ListMembership`** via `assertRole`, so public viewers cannot edit, comment, or leave.
- **List sharing is request-based**: `inviteToList` creates a PENDING `ListInvite`; the invitee
  approves it (→ `ListMembership` with the invite's role) or rejects it (→ REJECTED) from the
  home-page "collab requests" section. Inviting a non-friend also offers to send a friend request.
- **Friends** (`Friendship`) are added by **@handle** as a PENDING request the addressee accepts.
  Friends can be bulk-added to lists (which sends per-list join requests) from the Friends page.
- **Direct messages** (`Conversation` / `Message`): friends can privately message each other 1:1.
  Opening a chat and sending both require a *live* ACCEPTED friendship; unfriending stops new
  messages but the thread + history remain readable (re-friending re-enables sending). **Clearing**
  (a.k.a. deleting) a chat sets the user's `clearedAt`, hiding it + its past messages from **them
  only**; a later message reappears the thread showing only messages after the clear. History
  **paginates** via a keyset cursor on `(createdAt, id)`.
- **List chatrooms** (`ListChatMessage`): every list has one group chatroom shared by all its
  members (owner + collaborators + viewers). Reading and posting both require **membership** —
  a public list's non-member viewers get no chat. Each message shows the sender's @handle with a
  soft role suffix (owner/collaborator/viewer). Unread is derived per-member from
  `ListMembership.chatLastReadAt`. Only the **owner** can **clear** the room, which **hard-deletes
  every message** for everyone (no soft/per-user clear, unlike DMs). History **paginates** via a
  keyset cursor on `(createdAt, id)`; delivery reuses the DM realtime pattern (content-free ping on
  `chat:list:<id>` + polling fallback).
- Deleting a user cascades their friendships (both sides), conversation participation, messages,
  and their list-chat messages. Deleting a list cascades its chatroom messages.
- Tags are user-scoped and shared across all of a user's lists (OR-matching in filters).
- Deleting a list cascades its bookmarks, comments, memberships, invites, **and polls**.
- Deleting a bookmark cascades its `BookmarkTag` links, comments, **and poll options** (each
  removed `PollOption` cascades its `PollVote`s, so the voter's spent vote is freed —
  "refund" is derived as `maxVotes − current votes`, not stored).
- **Anonymous polls** (`isAnonymous`, set only at creation — never editable): `PollVote.userId`
  is still stored (it enforces one-vote-per-user, `maxVotes`, and revote rules), but
  `getPollForUser` strips voter identity from the payload so **no one** — creator or owner
  included — sees who voted for what. Per-option vote **counts stay visible**.

---

## 4. Permissions

| Action | Owner | Collaborator | Viewer |
|---|:---:|:---:|:---:|
| View list & bookmarks | ✓ | ✓ | ✓ |
| Comment (list & bookmark) | ✓ | ✓ | ✓ |
| Toggle list visibility (public/private) | ✓ | — | — |
| Create/edit/delete bookmarks | ✓ | ✓ | — |
| Edit list metadata (name/icon/desc) | ✓ | ✓ | — |
| Invite (send join request) / change roles / remove members | ✓ | — | — |
| Approve / reject a join request addressed to you | invitee only | invitee only | invitee only |
| Delete list | ✓ | — | — |
| Add/accept/remove friends; add a friend to your lists | any signed-in user (self) | | |
| Start a chat / send a DM | current friends only (live friendship re-checked per message) | | |
| Read DM history / clear (delete) a chat | either participant (clear affects only you) | | |
| Read & post in the list chatroom | ✓ | ✓ | ✓ |
| Clear the list chatroom (hard-delete all messages) | ✓ | — | — |
| Delete a comment | own + any on their list | own only | own only |
| Reorder lists on **own** home page | ✓ | ✓ | ✓ |
| Create a poll | ✓ | ✓ | — |
| Vote in a poll | ✓ | ✓ | ✓ |
| Edit / delete a poll | any on their list | own only | — |

Plus: **any signed-in user can view a public list** (its bookmarks + comments) read-only, even
with no membership — see List visibility above.

Enforced **server-side on every mutation** via a shared `assertRole(listId, userId, minRole)`
helper — never rely on UI gating alone. Read-only public access uses `assertCanView` /
`getViewerAccess`, which grant a guest `VIEWER` role when the list is public.

**Convention:** every participant — including the owner — has a `ListMembership` row
(the owner's has role `OWNER`). This makes access checks and per-user ordering uniform;
`List.ownerId` remains the canonical owner pointer.

---

## 5. Pages / routes

| Route | Purpose |
|---|---|
| `/login` | Google + email/password (better-auth) |
| `/onboarding` | First login only: handle (required, unique @handle), first/last name (optional), birthday (optional), icon, theme |
| `/` | **Home**: all lists you own or belong to; reorderable (web: Framer Motion drag · mobile: long-press drag) + unified search bar; a **List requests** button above the search opens `/requests` |
| `/requests` | **List requests**: all open incoming list-join (collab) requests, approve/reject (empty state when none) |
| `/friends` | **Friends**: add friends by **@handle**; always-visible **Requests** link → `/friends/requests` and **Pending** link → `/friends/pending`; friends list — each row can **remove** the friend, open their **profile**, and **add** them to a multiselect of your lists + role → send join requests (mobile packs these into one tap-to-expand actions panel; web uses row controls) |
| `/friends/requests` | **Friend requests**: all incoming friend requests, accept/decline (empty state when none) |
| `/friends/pending` | **Pending requests**: outgoing friend requests you've sent, withdraw each (empty state when none) |
| `/friends/dms` | **Messages**: the DM inbox — a Friends \| Messages tab switch tops both pages; lists conversations (unread dot + last-message preview), each deletable (clears it for you); **New chat** starts one with a friend. The Messages tab shows an unread-count attention badge. |
| `/friends/dms/new` | **New chat**: pick a friend to open (or resume) a 1:1 conversation |
| `/friends/dms/[conversationId]` | **Chat thread**: message history (older loads on demand via keyset cursor) + composer; composer is disabled with a note when you're no longer friends. Mobile equivalents: the DMs view is an in-screen tab on the Friends screen; threads are `/dm/[conversationId]` and `/dm/new`. |
| `/nearby` | **Near me**: find geocoded bookmarks within a chosen radius of your current location, closest→farthest |
| `/bookmarks/new` | **New bookmark**: standalone create flow; pick/create one or more target lists and add the bookmark independently to each. Reached from a **＋ Bookmark** item in the primary nav (web home header · mobile tab bar) |
| `/lists/[id]` | Bookmarks in a list; filter/search within (incl. a **Show only unvisited** toggle above the search row); list-level comments; a rounded-pill **List \| Polls** tab bar (the Polls face renders inline at `?tab=polls` — header/details/tabs stay mounted). The list-name row carries a louder **New bookmark** button (collaborator+, before the actions) + owner **Members** button + a **⋮ actions menu** (Edit / Duplicate / Clear). A **chat icon** in the top header (with an unread badge) opens the **list chatroom** — a slide-up drawer (web) / 70%-height bottom sheet (mobile) with a DM-style group chat: members read + post (each message tagged with the sender's @handle + soft role suffix), owner can clear all history. |
| `/lists/[id]/bookmarks/[bid]` | Bookmark detail: 8-bit layout, tag pills, comments newest-first; **← Back** returns to the previous page (list / nearby / search), falling back to the list on direct load |
| `/lists/[id]?tab=polls` | Polls in a list (newest first, with status + counts); **New poll** for collaborators+; the **Polls** tab of the list view, rendered inline so `/lists/[id]`'s header/details/tab bar stay mounted. The legacy `/lists/[id]/polls` route redirects here. |
| `/lists/[id]/polls/new` | Create a poll: fields + a searchable/tag-filterable bookmark option picker (≥2) |
| `/lists/[id]/polls/[pollId]` | Poll detail: **Vote**/**Results** toggle; edit/delete for the creator or list owner |
| `/lists/[id]/polls/[pollId]/edit` | Edit a poll (creator or list owner); reconciles options |
| `/users/[handle]` | **Profile** (reachable by @handle or id): a user's identity (avatar/icon, @handle, member-since), stats (public lists · friends), their **public lists**, and an Add-friend action on others' profiles. Your own profile is linked from a **Profile** item in the primary nav; on your own profile a **settings gear** opens `/settings`. |
| `/settings` | Edit profile/theme/icon; manage/leave shared lists; pending requests. Reached via the **gear icon on your own profile** (no longer a primary-nav item). Links to the share-sheet how-to and the privacy policy; hosts the **Danger zone** (delete account). |
| `/settings/share-extension` | **"Share to Klect"** — a static, illustrated how-to for adding the iOS share extension to the system share sheet (four steps). Mirrored on mobile as the pushed `share-help` screen (iOS-only entry). |
| `/privacy` | **Privacy policy** — a plain-language static page (data collected, use, sharing, retention/deletion, contact). **Public: no auth guard**, so it doubles as the App Store Connect privacy-policy URL. Mobile opens this same URL in an in-app browser from Settings. |
| `/invite/[token]` | Accept an invite |

**Home search bar behavior** (unified control):
- Typing shows two sections — **Lists** (by name) then **Matched tags**.
- Clicking a **list** navigates to it; clicking a **tag** adds a pill below the bar.
- Selected tags render as pills with an ✕ to remove; a **Clear all** button empties the input
  and deselects every tag.
- Multiple tags = OR filter across all of the user's bookmarks.

**Near me behavior** (`/nearby`, reached from a header button on Home):
- Pick a **radius** (miles: 0.5 / 1 / 2 / 5 / 10) and toggle which **lists** to include (all on
  by default; Select-all / Clear-all). Tapping **Find near me** requests the browser's
  geolocation, then a server action (`findNearbyBookmarks`) haversine-filters the user's geocoded
  bookmarks and returns them closest→farthest, each with its list tag and distance ("2.3 mi away").
- Only bookmarks with stored `latitude`/`longitude` (picked from location autocomplete) can match;
  ones with a typed location but no coordinates are excluded and surfaced as an "N skipped" note.
- **Web** renders results as a list. **Mobile** renders a full-screen **Mapbox** map: it
  auto-locates on open, drops a numbered pin per result, and floats the radius selector over the
  map; a **bottom drawer** holds the same result list, and tapping a pin expands the drawer and
  scrolls to that row. Both clients call the same `nearby.find` (results now carry `lat`/`lon`).

---

## 6. Feature set

The capabilities the app ships today. Product-level coverage (and web/mobile parity) lives in
`docs/FEATURES.md`; the implementation notes below are the load-bearing ones.

- **Lists & bookmarks** — CRUD for both. Lists carry a name/description/emoji icon, a role badge,
  and bookmark + member counts; bookmarks carry the fields in §3 (multiple URLs, extracted photos,
  notes, location, rating, visited, tags). The home page shows every list you own or belong to with
  per-user **drag-reorder** (web: Framer Motion `Reorder`; mobile: long-press drag).
- **Tags** — user-scoped, each auto-assigned a `color` at creation from a fixed palette
  (`src/lib/tag-colors.ts`) and rendered as a colored pill (luminance-computed text color, legible
  on every theme). Filtering is OR-based; the home search filters across all lists (web) and each
  list page has its own tag filter (web dropdown · mobile bottom sheet).
- **Search** — a unified home `SearchBar` combobox: a **Lists** section navigates by name; a
  **Matched tags** section adds tag pills that OR-filter bookmarks across all lists (`?tags=` in the
  URL, server-rendered).
- **Link autofill** — paste a URL and it runs in **two phases** so the form fills fast then enriches.
  **Phase 1 — extraction** (`getLinkExtraction`, `metadata.extract`): we fetch the page **once**
  ourselves (`core/page-text.ts` `fetchPage`, SSRF-guarded) and read OG/meta → title, description,
  image, and a detected playable video (`detectVideo`); this warms a shared page cache. Falls back to
  **LinkPreview → Microlink** when the self-fetch is blocked/empty; YouTube still uses oEmbed; social
  reels (IG/TikTok/FB) still prefer Microlink. No LLM — returns immediately, and the clients drop the
  loading overlay here. **Phase 2 — comprehension** (`getLinkComprehension`, `metadata.comprehend`,
  non-blocking): from the same cached fetch it takes a **JSON-LD fast path** — schema.org
  Recipe/HowTo/Event/Product/LocalBusiness parsed straight into detail sections (Ingredients, Steps,
  Hours, Event Details, …) with **no LLM** — otherwise runs `comprehendMetadata` (`claude-haiku-4-5`)
  on the readable text (for YouTube, the video description) to clean the title, write a
  `Link Summary:`-prefixed description with those detail sections, and add up to 3 `tags` + an inferred
  `location`. The location is then **geocoded** (`searchPlaces`→`retrievePlace`) to `latitude`/
  `longitude` so autofilled bookmarks appear in **Near me**. Both phases are cached + coalesced by URL
  (`core/cache.ts`, in-memory); the clients patch phase-2 fields in as they arrive. Every stage
  degrades gracefully when its key is unset. (`fetchLinkMetadata` / `metadata.fetch` still compose
  both phases for one-shot callers.)
- **Video** — a detected playable video (YouTube/Vimeo/TikTok/Instagram embeds + direct media files)
  is stored as `videoUrl`/`videoType` and shown as an inline click-to-play player (web: trusted-host
  `<iframe>` behind a poster facade; mobile: `expo-video` for files, WebView iframe for embeds). The
  trusted-host whitelist is re-checked on both write and render.
- **Location** — the bookmark `location` is an address/business type-ahead via **Mapbox Search Box**
  (server-proxied), storing `latitude`/`longitude`; picking a business also autofills the name/URL/
  description. The address opens the place in a maps app. Free-typed text saves with no coordinates.
- **Standalone multi-list create** (`/bookmarks/new`) — the normal bookmark form plus a list
  selector/creator; `createBookmarkInLists` writes **one independent bookmark row per target list**
  (own tag links), so editing or deleting one copy never touches the others. New lists created inline
  take a public/private toggle (`newListsPublic`).
- **Sharing** — invite by **@handle** as VIEWER or COLLABORATOR; every invite is a **request-based**
  PENDING `ListInvite` the invitee approves/rejects from a **List requests** view (no auto-join).
  Inviting a non-friend can also send a friend request. Owners manage membership (role change,
  remove, revoke); non-owners can leave.
- **Friends** — **@handle**-based friend requests the addressee accepts (mutual once accepted), with
  incoming/outgoing (withdrawable) request views. A friend row can remove the friend, open their
  profile, and bulk-add them to a multiselect of your lists + role (per-list join requests).
- **Direct messages** — private 1:1 chat between friends. A **Friends | Messages** tab switch tops
  the Friends page (web + mobile); the DM inbox lists conversations (unread dot + preview, deletable),
  and the Messages tab carries an unread-count attention badge. Threads paginate history on demand,
  disable the composer when you're no longer friends (history stays readable), and deliver new
  messages in near-real-time (Supabase Realtime broadcast, polling fallback). Clearing/deleting a
  chat only affects you; it reappears on the next incoming message showing only newer messages.
- **List chatrooms** — every list has one **group chat** shared by all its members. A chat icon in
  the list header (with an unread badge) opens a slide-up drawer (web) / 70%-height bottom sheet
  (mobile) with a DM-style thread: members read + post, each message tagged with the sender's @handle
  and a soft **role suffix** (owner/collaborator/viewer). Reuses the DM realtime pattern (content-free
  `chat:list:<id>` ping, polling fallback) and keyset history pagination. Members-only (public
  non-members get no chat); only the **owner** can clear, which hard-deletes all history for everyone.
- **Profiles** (`/users/[handle]`, also resolvable by id) — identity (@handle, avatar/icon, "member
  since"), stats (public lists · friends), and the user's public lists, with an add-friend action on
  others' profiles.
- **Comments** — on both lists and bookmarks, newest-first; any member (viewer+) can post; author or
  list owner can delete (a DB check constraint enforces exactly one target).
- **Polls** — pick 2+ bookmarks in a list as options; set start/end, max votes, revote rule, and (at
  creation only) anonymity; vote and see ranked results. Anonymous polls hide who voted from everyone
  (counts still show) — see §3.
- **Near me** (`/nearby`) — haversine-filters the user's coordinate-bearing bookmarks within a chosen
  radius of the current location (web: browser geolocation, 0.5–10 mi; mobile: native GPS, 1–25 mi),
  returned closest→farthest. Bookmarks with a typed-but-not-geocoded location are excluded and counted
  in an "N skipped" note.
- **Themes** — six across three families (pixel / modern / journal), each light + dark, stored per
  user; **`MODERN_LIGHT` is the web default** (mobile defaults to Journal Light). Each theme is a
  CSS-token block swapped via `data-theme` on `<html>` (web) / NativeWind `vars()` (mobile).
- **Platform extras** — the web app is an installable **PWA** (manifest, prod-only service worker,
  `/offline` fallback) and has an AI **caption extraction** procedure (`comprehend.caption`). The iOS
  app adds a native **share extension** that saves a shared link into a list from inside the OS share
  sheet. A short, illustrated **"Share to Klect"** how-to (in Settings on both apps —
  `/settings/share-extension` on web, the `share-help` screen on mobile) walks users through adding
  and favoriting the extension in the iOS share sheet.

---

## 7. Architecture & code structure

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
- **Styling / theming**: Tailwind v4 with design tokens (`--bg`, `--ink`, `--primary`, …) as CSS
  variables in `globals.css` (`@theme inline`), swapped per theme via `data-theme` on `<html>`.
  Each theme is a token block (`[data-theme="pixel-light"]`, `…="modern-dark"`, etc.); the shared
  `.pixel-*` primitives give the retro skin, and **unlayered** `[data-theme^="modern"]` rules
  override them (borders/shadows/radius/font/gradients) for the modern skin — so a new theme is
  pure CSS, no component/layout changes. Theme registry + enum↔`data-theme` mapping +
  validation live in `src/lib/theme.ts` (`THEME_OPTIONS`, `themeDataAttr`, `coerceTheme`).
- **Prisma 7 gotcha**: `migrate dev` does **not** reliably regenerate the client — always run
  `npx prisma generate` after a schema change, then restart the dev server.

---

## 8. Web + mobile split (two-app architecture)

Klect is **two independent apps in one repo** (`web/`, `mobile/`), sharing a spec and a runtime
API — **not** a monorepo with shared code packages (no workspace tooling, no shared packages). This
section is the shared contract both apps build against; see the top-level `CLAUDE.md` for the
per-feature workflow.

**Topology**
- **`web/`** owns the database, auth, and **all** business logic (Prisma schema + migrations, read
  queries, `permissions.ts`, tag-sync, invite/auto-link, external-service calls). It keeps its
  server-first model (RSC reads + server actions) unchanged, and *additionally* hosts a **tRPC**
  API at `/api/trpc`.
- **`mobile/`** (Expo) is a **thin client**: it calls the tRPC API and rebuilds only the UI. No DB
  access, no business logic of its own.
- Backend logic is written **once** in web. Each mutation is a pure `core(input)` function
  (validate → `assertRole` → Prisma → return); the `"use server"` `action(formData)` wrapper and
  the tRPC procedure both call the same `core()` — never duplicated.

**What web owns vs. what mobile rebuilds**
- Owned by web (shared via the API, not copied): data model, read queries, `permissions.ts`, auth
  server (better-auth), and the external-service integrations (Mapbox places, LinkPreview/Microlink
  metadata, Anthropic comprehension) — mobile reaches these through procedures, so no keys ship in
  the app.
- Rebuilt in mobile: everything in `components/` (DOM + Tailwind + Framer Motion) →
  RN views + **NativeWind** (same token palette) + **react-native-reanimated**; `next/link` + App
  Router → **expo-router**; `<img>`/remote images → **expo-image**; the pixel-border look → shared
  style helpers. Auth client: `better-auth/react` (web) → `@better-auth/expo` (mobile), same server.
- Design **tokens** (the palette for the 6 themes) are defined once as data in web and mirrored by
  mobile's NativeWind config.

**Type sharing:** mobile imports web's tRPC `AppRouter` **type-only** for end-to-end types; this is
erased at compile time (no runtime coupling). Fallback if the cross-folder reference is unwanted:
plain REST + types redeclared in mobile, with the API contract below as the only guard against drift.

### API contract (tRPC surface)

The tRPC router lives in `web/src/server/trpc/` (mounted at `/api/trpc`, alongside the auth
handler). Every procedure is a thin wrapper over `web/src/lib/core/*` (mutations) or
`web/src/lib/*` read modules (queries); mobile imports the `AppRouter` type only. All procedures
are `protectedProcedure` (require a signed-in user; `ctx.user` is the session user). **Keep this
table in sync whenever a procedure is added or changed.**

**Auth transport:** web calls the API with the better-auth session **cookie**; mobile sends the
session token as `Authorization: Bearer` (server runs better-auth's `bearer()` plugin) because iOS
release builds don't reliably persist `Secure` cookies. `auth.api.getSession()` resolves either.

| Procedure | Kind | Input | Auth beyond sign-in | Delegates to |
|---|---|---|---|---|
| `lists.mine` | query | – | – | `getUserLists` |
| `lists.get` | query | `{ listId }` | member role **or** guest VIEWER if public (null if private + non-member) | `getListForViewer` |
| `lists.create` | mutation | `ListInput` (incl. optional `isPublic`) | – | `core.createList` |
| `lists.update` | mutation | `{ listId, data: ListInput }` | COLLABORATOR (in core); ignores `isPublic` | `core.updateList` |
| `lists.delete` | mutation | `{ listId }` | OWNER (in core) | `core.deleteList` |
| `lists.setVisibility` | mutation | `{ listId, isPublic }` | OWNER (in core) | `core.setListVisibility` |
| `lists.reorder` | mutation | `{ orderedListIds }` | user-scoped | `core.reorderLists` |
| `lists.duplicate` | mutation | `{ listId, name? }` | member VIEWER+ (in core) | `core.duplicateList` — new owner copy, bookmarks+tags only (no members/polls/comments); private; returns the new list |
| `lists.clearBookmarks` | mutation | `{ listId }` | OWNER (in core) | `core.clearListBookmarks` — deletes all bookmarks (cascades tags/comments/poll options) |
| `bookmarks.forList` | query | `{ listId }` | `assertCanView` (member **or** public list) | `getBookmarksForList` |
| `bookmarks.get` | query | `{ bookmarkId }` | member or public list (or null) | `getBookmarkForUser` |
| `bookmarks.byTags` | query | `{ tagNames }` | user-scoped | `getBookmarksByTags` |
| `bookmarks.create` | mutation | `{ listId, data: BookmarkInput }` | COLLABORATOR (in core) | `core.createBookmark` |
| `bookmarks.createInLists` | mutation | `{ existingListIds, newListNames, data, newListsPublic? }` | COLLABORATOR per existing list (in core) | `core.createBookmarkInLists` — `newListsPublic` sets the visibility of any lists created inline (default private) |
| `bookmarks.update` | mutation | `{ bookmarkId, data: BookmarkInput }` | COLLABORATOR (in core) | `core.updateBookmark` |
| `bookmarks.delete` | mutation | `{ bookmarkId }` | COLLABORATOR (in core) | `core.deleteBookmark` |
| `bookmarks.toggleVisited` | mutation | `{ bookmarkId }` | COLLABORATOR (in core) | `core.toggleVisited` |
| `comments.forList` | query | `{ listId }` | `assertCanView` (member **or** public list) | `getListComments` |
| `comments.forBookmark` | query | `{ bookmarkId }` | membership check | `getBookmarkComments` |
| `comments.addToList` | mutation | `{ listId, value }` | VIEWER (in core) | `core.addListComment` |
| `comments.addToBookmark` | mutation | `{ bookmarkId, value }` | VIEWER (in core) | `core.addBookmarkComment` |
| `comments.delete` | mutation | `{ commentId }` | author or OWNER (in core) | `core.deleteComment` |
| `polls.forList` | query | `{ listId }` | `assertRole` VIEWER | `getListPolls` |
| `polls.get` | query | `{ pollId }` | membership check (NOT_FOUND) | `getPollForUser` |
| `polls.create` | mutation | `{ listId, data: PollInput }` | COLLABORATOR (in core) | `core.createPoll` |
| `polls.update` | mutation | `{ pollId, data: PollInput }` | creator or OWNER (in core) | `core.updatePoll` |
| `polls.delete` | mutation | `{ pollId }` | creator or OWNER (in core) | `core.deletePoll` |
| `polls.submitVotes` | mutation | `{ pollId, optionIds }` | VIEWER (in core) | `core.submitVotes` |
| `sharing.members` | query | `{ listId }` | `assertRole` VIEWER | `getListMembers` |
| `sharing.pendingInvites` | query | `{ listId }` | `assertRole` OWNER | `getPendingInvites` |
| `sharing.invite` | mutation | `{ listId, handle, role, alsoFriend? }` | OWNER (in core) | `core.inviteToList` — resolves the @handle to a user, sends a PENDING join request; may also send a friend request |
| `sharing.incomingRequests` | query | – | self (by email) | `getIncomingRequests` |
| `sharing.approveRequest` | mutation | `{ inviteId }` | invitee (email match, in core) | `core.approveRequest` |
| `sharing.rejectRequest` | mutation | `{ inviteId }` | invitee (email match, in core) | `core.rejectRequest` |
| `sharing.changeRole` | mutation | `{ listId, userId, role }` | OWNER (in core) | `core.changeMemberRole` |
| `sharing.removeMember` | mutation | `{ listId, userId }` | OWNER (in core) | `core.removeMember` |
| `sharing.revokeInvite` | mutation | `{ inviteId }` | OWNER (in core) | `core.revokeInvite` |
| `sharing.leave` | mutation | `{ listId }` | non-owner member (in core) | `core.leaveList` |
| `sharing.accept` | mutation | `{ token }` | any signed-in user w/ link | `core.acceptInvite` |
| `friends.list` | query | – | self | `getFriends` + `getIncomingFriendRequests` + `getOutgoingFriendRequests` → `{ friends, incoming, outgoing }` |
| `friends.friendListIds` | query | `{ friendId, listIds }` | self | `getFriendListIds` |
| `friends.sendRequest` | mutation | `{ handle }` | self | `core/friends.sendFriendRequest` — resolves the @handle to a user |
| `friends.requestByUser` | mutation | `{ userId }` | self | `core/friends.sendFriendRequestById` (from a profile page) |
| `friends.accept` | mutation | `{ id }` | addressee (in core) | `core/friends.acceptFriendRequest` |
| `friends.decline` | mutation | `{ id }` | addressee (in core) | `core/friends.declineFriendRequest` |
| `friends.cancel` | mutation | `{ id }` | requester (in core) | `core/friends.cancelFriendRequest` — withdraw a pending request you sent |
| `friends.remove` | mutation | `{ id }` | either party (in core) | `core/friends.removeFriend` |
| `friends.addToLists` | mutation | `{ friendId, listIds, role }` | OWNER per list (in core) | `core.addFriendToLists` |
| `dms.conversations` | query | – | self | `getConversations` — inbox: other participant + last-message preview + `unread`, cleared-empty threads omitted |
| `dms.messages` | query | `{ conversationId, cursor?, limit? }` | participant (in data access) | `getMessages` — keyset page (oldest→newest) + `nextCursor` + `other` + `canSend` (live friendship) |
| `dms.unreadCount` | query | – | self | `getUnreadConversationCount` — drives the Messages tab badge |
| `dms.start` | mutation | `{ userId }` | **friends only** (in core) | `core/dms.startConversation` — get-or-create the 1:1 thread (atomic via `pairKey`) |
| `dms.send` | mutation | `{ conversationId, body }` | participant + **live friendship** (in core) | `core/dms.sendMessage` — returns `{ message }` or `{ error }`; bumps `lastMessageAt`, fires a realtime ping |
| `dms.clear` | mutation | `{ conversationId }` | participant (self only) | `core/dms.clearConversation` — clears/deletes the thread for the caller |
| `dms.markRead` | mutation | `{ conversationId }` | participant (self only) | `core/dms.markRead` |
| `listChat.messages` | query | `{ listId, cursor?, limit? }` | member (in data access) | `getChatMessages` — keyset page (oldest→newest) + `nextCursor` + `canSend`; each message carries the sender's identity + role |
| `listChat.unread` | query | `{ listId }` | member (0 for non-members) | `getChatUnreadCount` — drives the chat-icon badge |
| `listChat.send` | mutation | `{ listId, body }` | **member** (in core) | `core/list-chat.sendChatMessage` — returns `{ message }` or `{ error }`; bumps sender read state, fires a realtime ping |
| `listChat.clear` | mutation | `{ listId }` | **OWNER** (in core) | `core/list-chat.clearChat` — hard-deletes every message in the room |
| `listChat.markRead` | mutation | `{ listId }` | member (self only) | `core/list-chat.markChatRead` |
| `profile.update` | mutation | `ProfileInput` | self | `core.saveProfile` |
| `profile.get` | query | `{ handleOrId }` | signed-in (public data only) | `getPublicProfile` — resolves by @handle or id; identity + public lists + friend count + viewer↔target friendship state |
| `account.delete` | mutation | – | self | `core.deleteAccount` — permanently deletes the caller and everything they own; a single `prisma.user.delete` cascades to all owned rows (sessions, accounts, owned lists → bookmarks/comments/polls/chat, memberships, invites, tags, comments, polls, votes, friendships, DMs, list-chat). Idempotent. Irreversible |
| `tags.mine` | query | – | user-scoped | `getUserTags` |
| `nearby.find` | query | `{ lat, lon, radiusMiles, listIds }` | user-scoped | `core.findNearbyBookmarks` — each result carries `lat`/`lon` (for map pins) alongside `distanceMiles` |
| `places.search` | query | `{ text, sessionToken }` | signed-in | `core/places.searchPlaces` |
| `places.retrieve` | query | `{ id, sessionToken }` | signed-in | `core/places.retrievePlace` |
| `places.reverseGeocode` | query | `{ lat, lon }` | signed-in | `core/places.reverseGeocode` |
| `metadata.extract` | query | `{ url }` | signed-in | **Phase 1** — `core/metadata.getLinkExtraction`: self-fetch (`fetchPage`)→OG/meta, falling back to LinkPreview→Microlink; YouTube oEmbed. Fast, no LLM. Returns `LinkMetadata` with empty `tags`/`location`/coords |
| `metadata.comprehend` | query | `{ url }` | signed-in | **Phase 2** — `core/metadata.getLinkComprehension`: JSON-LD fast path or `comprehendMetadata` (`claude-haiku-4-5`), then geocode. Returns `{ title, description, tags, location, latitude, longitude }` (nulls when unavailable) |
| `metadata.fetch` | query | `{ url }` | signed-in | One-shot — `core/metadata.fetchLinkMetadata` composes extract + comprehend into one `LinkMetadata` |
| `comprehend.caption` | query | `{ caption, author?, sourceUrl? }` | signed-in | `core/comprehend.comprehendCaption` |

The external-service lookups (`places` — Mapbox, `metadata` — LinkPreview/Microlink + Anthropic, `comprehend` — Anthropic)
run server-side so mobile gets autocomplete/autofill/AI-extract without shipping any API keys; the
secrets stay in `web/`'s env.

**DM & chatroom realtime:** new messages are delivered near-instantly via **Supabase Realtime
broadcast** — already in-stack (Postgres is Supabase-hosted), which suits serverless (Vercel can't
hold sockets) and better-auth (not Supabase Auth). The server posts a tiny **content-free ping**
(just the conversation/list id) to public channels — DMs use `dm:user:<recipientId>` and
`dm:conv:<conversationId>`, list chatrooms use `chat:list:<listId>`; clients treat it purely as a
"refetch now" trigger and pull the actual data over the authenticated tRPC procedures above, so no
message content rides the socket and a spoofed/missed ping is harmless. The whole path **degrades to
polling** when the Supabase env vars are unset (`SUPABASE_URL` / `SUPABASE_ANON_KEY` server-side;
`NEXT_PUBLIC_SUPABASE_*` / `EXPO_PUBLIC_SUPABASE_*` on the clients).

---

## 9. Open questions / future

- **Web PWA share target** (deferred): a manifest `share_target` + `/share` route for
  Android/desktop PWAs. iOS Safari can't receive shares (Apple limitation) — which is why sharing
  into the app on iOS is handled by the **native share extension** in the mobile app instead.
- **Android share-to-app** (deferred): the iOS share extension has no Android equivalent yet.
- **Realtime collaboration** (Supabase realtime): comments/edits currently refresh on action.
- **Pagination** for lists with many bookmarks — add when needed.
- **Image durability**: photos are hotlinked remote URLs; move to Supabase Storage if links rot.
- **Reel caption extraction**: Instagram/TikTok reel captions are often truncated/login-walled;
  reliable extraction needs a social-scraper API (`comprehend.caption` is stubbed for this).
