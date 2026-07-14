# Klect — Core User Features (Web vs Mobile)

What a user can actually do in Klect, feature by feature, and where the two apps differ. Klect is
one repo with two independent clients — **`web/`** (Next.js, owns the DB/auth/business logic + the
tRPC API) and **`mobile/`** (Expo/React Native, a thin client of that API). The principle (see the
root `CLAUDE.md`) is that every feature is built for **both** apps on the same typed tRPC contract;
this doc is where you can see how close to that the two platforms actually are.

> For the **spec** (data model, permissions, routes, full API contract) see `../DESIGN.md`. For the
> **architecture** (how a request flows, the two-app split) see `ARCHITECTURE.md`. This doc is
> product coverage, not spec.

---

## Product overview (shareable, non-technical)

> **Maintainers:** this is the plain-language, platform-agnostic pitch — safe to copy and send to
> someone curious about the app. **Keep it in sync with the per-feature detail below:** whenever a
> feature is added, removed, or changed, update both this overview and the matrix + detail sections
> in the same edit.

**Klect — save the places and things worth remembering**

Klect is a bookmarking app where everything you save lives inside **lists** you can share with other
people. Think of it as a shared notebook for restaurants, travel spots, videos, products — anything
with a link or a location.

**What you can do:**

- **Save rich bookmarks.** Each bookmark holds a name, description, photos, notes, a rating (0–5
  stars), a location, a "visited" checkmark, and multiple links — not just a bare URL.
- **Paste a link, get everything filled in.** Drop in a URL and Klect pulls the title, description,
  and photos automatically — and detects videos so they play right inside the app (YouTube, Vimeo,
  TikTok, Instagram, and more).
- **Organize with lists.** Group bookmarks into lists (e.g. "Tokyo trip," "Date night spots") and
  reorder them however you like.
- **Tag and filter.** Add colorful tags to bookmarks and filter to exactly what you're looking for.
- **Search everything.** Find any list or bookmark fast.
- **Share and collaborate.** Invite people to a list as a **viewer** (can look and comment) or a
  **collaborator** (can add and edit) — they get a **request** to accept, so nobody's added without
  opting in. You stay in control as the owner.
- **Make a list public.** Flip any list to **public** (they start private) so anyone can view it
  read-only and it shows up on your profile — editing still needs an invite.
- **Add friends.** Add people by email and, once they accept, bulk-invite a friend to any of your
  lists in one step.
- **Show off a profile.** Everyone has a profile page with their photo/icon, stats, and public
  lists — visit a friend's or a list owner's profile and add them as a friend right there.
- **Comment together.** Leave comments on lists and individual bookmarks to plan and discuss.
- **Vote with polls.** Can't decide? Create a poll from bookmarks in a list and have the group vote
  (great for "where should we eat?").
- **Find things near you.** The "Near me" feature surfaces your saved spots within a chosen distance
  of wherever you are.
- **Add a bookmark to several lists at once.** Save something to multiple lists in a single step.
- **Make it yours.** Choose from six themes across three looks — **Pixel** (retro 8-bit), **Modern**
  (clean and minimal), and **Journal** (warm scrapbook) — each in light and dark.
- **Use it anywhere.** Available as a web app (installable to your home screen) and a mobile app —
  where you can also **share links straight into Klect** from any other app.

---

**Legend:** ✅ full · ⚠️ present but differs / partial · ➖ not present

## At-a-glance parity matrix

| Feature | Web | Mobile | Notes |
|---|:---:|:---:|---|
| Auth (email/password + Google) | ✅ | ✅ | Same better-auth backend |
| Onboarding (profile setup) | ✅ | ✅ | Name, emoji avatar, theme |
| Lists — CRUD | ✅ | ✅ | |
| Lists — public/private visibility | ✅ | ✅ | Owner-only toggle; **private by default**; public = read-only for anyone (`lists.setVisibility`) |
| Lists — drag-reorder | ✅ | ✅ | Per-user order (`lists.reorder`); web: Framer Motion · mobile: long-press drag (`react-native-reorderable-list`) |
| Home search | ⚠️ | ⚠️ | Web: unified list + cross-list tag filter · Mobile: local name search |
| Bookmarks — CRUD & fields | ✅ | ✅ | URLs, images, notes, rating, visited, location, tags |
| Standalone multi-list bookmark create | ✅ | ✅ | One independent copy per selected list |
| Link metadata autofill | ✅ | ✅ | Paste URL → LinkPreview extract + LLM comprehension → clean name/description/tags/location/images/video |
| Location autocomplete + business autofill | ✅ | ✅ | Mapbox Search Box |
| Video detection & player | ⚠️ | ⚠️ | Web iframe click-to-play · Mobile `expo-video` + WebView |
| Tags (user-scoped, auto-colored, OR filter) | ✅ | ✅ | Per-list filter: web dropdown · mobile bottom sheet |
| Ratings / Visited / Notes | ✅ | ✅ | |
| Sharing & permissions | ✅ | ✅ | Owner / Collaborator / Viewer; **request-based** invites (invitee approves/rejects) |
| Friends | ✅ | ✅ | Add by email (request + accept); bulk-add a friend to your lists |
| User profiles | ✅ | ✅ | `/users/[id]` (web) · Profile tab + `users/[id]` (mobile); identity + stats + public lists + add-friend (`profile.get`) |
| Comments (lists & bookmarks) | ✅ | ✅ | |
| Polls | ✅ | ✅ | Create / vote / edit / delete |
| Nearby / geolocation | ⚠️ | ⚠️ | Web browser geo (0.5–10 mi) · Mobile native GPS (1–25 mi) |
| Profile & settings | ✅ | ✅ | Theme picker (all 6 themes) |
| Themes | ✅ | ✅ | All 6 both; **default differs** (web Modern Light · mobile Journal Light) |
| Native share intent | ➖ | ✅ | Mobile-only (OS share sheet → new bookmark) |
| PWA install | ✅ | ➖ | Web-only (mobile is a native app) |
| AI caption extraction | ✅ | ➖ | Web-only (`comprehend.caption`, Claude-backed) |

---

## Per-feature detail

### Authentication
**Description.** Sign up / sign in with email + password or Google. Sessions persist so the user
stays logged in.
**Web.** `/login` (`web/src/components/auth/LoginForm.tsx`), better-auth with the Google provider,
session cookies; `?next=` redirect is same-origin-guarded.
**Mobile.** `src/components/login-screen.tsx`, `@better-auth/expo` against the same server; tokens in
`expo-secure-store`. Dual-mode sign-in/sign-up toggle.

### Onboarding
**Description.** First-run profile setup for a new user: display name (required), optional
first/last name and birthday, an emoji avatar, and a starting theme.
**Web.** `/onboarding` → `ProfileForm`; `completeOnboarding` action. Gated by whether the user has a
`displayName`.
**Mobile.** `src/components/onboarding-screen.tsx`, gated by the root layout; saves via
`trpc.profile.update`.
**Differences.** None functionally — same fields, same procedure.

### Lists — CRUD & browse
**Description.** Lists are the containers bookmarks live in. Create/edit (name, description, emoji
icon), delete (owner-only, cascades bookmarks/comments/members/polls), and browse all lists you own
or belong to with bookmark + member counts and a role badge.
**Web.** Home `/` renders `HomeLists`; detail `/lists/[id]`; edit/delete via `ListControls`.
`lists.mine` / `lists.get` / `lists.create` / `lists.update` / `lists.delete`.
**Mobile.** `src/app/(tabs)/index.tsx` (home cards), `src/app/lists/[id].tsx` (detail),
`lists/new.tsx` + `lists/edit.tsx` modals. Same procedures.

### Lists — public/private visibility
**Description.** Each list is **public or private** — **private by default**. A public list is
read-only viewable by any signed-in user (its bookmarks + comments load without a membership) and
appears on the owner's profile; **writes always require a membership**. Only the **owner** can flip
visibility. Reads use a public fallback (`getViewerAccess`/`assertCanView` in `permissions.ts`);
mutations stay gated by `assertRole`. Toggling is separate from list edit — `lists.update` ignores
`isPublic`; `lists.setVisibility` (owner-only) changes it.
**Web.** Create toggle in `ListForm` (`showVisibility`); owner toggle on `/lists/[id]` via
`ListVisibilityToggle` → `setListVisibility` action. Non-members see a read-only detail
("Public · view only", no edit/comment controls).
**Mobile.** `list-form.tsx` `Switch` (create); owner `Switch` on `src/app/lists/[id].tsx` →
`lists.setVisibility`. Non-members get the read-only detail. Same `lists.setVisibility` procedure.

### Lists — drag-reorder
**Description.** Reorder your lists on the home screen; the order is saved per-user.
**Web.** Framer-Motion `Reorder` in `HomeLists`, debounced `reorderLists` → `lists.reorder`
(persists `ListMembership.position`).
**Mobile.** `react-native-reorderable-list` on the home screen (`(tabs)/index.tsx`): long-press a
card to drag; `onReorder` optimistically updates then persists `lists.reorder`. Dragging is
disabled while a search query is active (reordering a filtered subset is ambiguous).
**Differences.** Same procedure + persistence; different drag implementation per platform.

### Home search
**Description.** Find lists and bookmarks from the home screen.
**Web.** Unified `SearchBar`: type to jump to matching **lists**, and select **tags** to OR-filter
bookmarks **across all lists** (tags live in the URL; server renders the filtered set).
**Mobile.** Client-side substring search over **list names** only. Tag filtering exists but is
**per-list** (bottom sheet on the list detail screen), not global.
**Differences.** Web has cross-list tag search on home; mobile does not.

### Bookmarks — CRUD & fields
**Description.** A bookmark has a name, description, multiple URLs (`urls[0]` = primary "open"
target), extracted photos (`images[]`), free-form notes, a location, a 0–5 rating, a visited flag,
and user tags.
**Web.** Inline create in `/lists/[id]` (`CreateBookmarkPanel`), detail at
`/lists/[id]/bookmarks/[bid]`, shared `BookmarkForm`. `bookmarks.forList/get/create/update/delete`.
**Mobile.** `src/app/bookmarks/[id].tsx` (detail), `bookmarks/new.tsx` + `bookmarks/edit.tsx`,
shared `src/components/bookmark-form.tsx`. Same procedures. Edit preserves fields the form doesn't
surface (notes, coords, video, extra URLs).
**Differences.** None material — same data model and procedures; UI layout differs by platform.

### Standalone multi-list bookmark creation
**Description.** Create one bookmark and drop an **independent copy into several lists at once**
(separate tags per copy, no shared edits afterward). When you create lists inline during this flow,
a **Public/Private toggle** (default private) sets those new lists' visibility — threaded through as
`newListsPublic` to `createBookmarkInLists` → `createListRecord`.
**Web.** `/bookmarks/new` → `CreateBookmarkFlow` (pick/create lists + new-list visibility toggle) →
`bookmarks.createInLists`.
**Mobile.** `bookmarks/new.tsx` with no `listId` param → `ListPicker` (with the new-list visibility
toggle) → `bookmarks.createInLists`.
**Differences.** None — same procedure, same behavior.

### Link metadata autofill
**Description.** Paste a link and the bookmark auto-fills with clean, readable fields — a
tidied name, a `Link Summary:`-prefixed description that also breaks out vital details
(Ingredients, Steps, Hours, Event Details, …) when the page has them, up to 3 suggested tags, and
an inferred location — plus images and a detected playable video.
**Web / Mobile.** Both call `metadata.fetch`, a two-stage pipeline: **extraction** (YouTube via
fast oEmbed; everything else via **LinkPreview**, falling back to **Microlink**) + `detectVideo`,
then a **comprehension** layer (`comprehendMetadata`, `claude-haiku-4-5`) that cleans the
title, summarizes, and adds `tags` + `location`. For articles it also fetches the page's readable
text server-side (`core/page-text.ts`, SSRF-guarded) so the LLM can extract those detail sections.
Web: button in `BookmarkForm`. Mobile: manual button **and** auto-trigger when opened with a
`?url=` param (e.g. from a share). Both keys are optional — autofill degrades to raw metadata
when they're unset.
**Differences.** Mobile also auto-fires autofill on mount for shared URLs; otherwise identical.

### Location autocomplete + business autofill
**Description.** Type-ahead for addresses and businesses (POIs). Picking a plain address stores the
text + coordinates; picking a **business** additionally auto-fills the bookmark name, website URL,
and description (and unfurls the site for images/video).
**Web.** `LocationInput` + `places.search` / `places.retrieve` (Mapbox Search Box), Mapbox session
tokens for billing. Degrades to plain text if no Mapbox token.
**Mobile.** `src/components/bookmark-form.tsx` location search, same procedures, rotating session
tokens; free typing clears coordinates. A business pick fills name/description/URL/photos **only when
those fields are empty** (the location/address + coordinates always overwrite), so it never clobbers
what the user already typed.
**Differences.** Mobile's business autofill is empty-field-only; web still overwrites those fields on
a business pick.

### Video detection & player
**Description.** Bookmarks with a playable video (YouTube / Vimeo / TikTok / Instagram, or a direct
media file) show an inline click-to-play player instead of the photo.
**Web.** `BookmarkVideo` renders a trusted-host `<iframe>` (nocookie/embed URLs) with a poster
facade.
**Mobile.** `src/components/bookmark-video.tsx`: `expo-video` native player for direct files;
WebView-hosted iframe for provider embeds. Aspect-ratio aware (16:9 vs 9:16), trusted-host re-check
before mount.
**Differences.** Same detection logic; player tech differs (web iframe vs mobile native + WebView).

### Tags
**Description.** User-scoped tags (shared across all your lists), each auto-assigned a color at
creation, rendered as colored pills. Filtering is OR-based (a bookmark matches if it has any selected
tag).
**Web.** `TagInput` (suggestions + quick-add chips), per-list filter dropdown in `ListBookmarks`,
color via `randomTagColor`. `tags.mine`, `bookmarks.byTags`.
**Mobile.** `TagPill` component; per-list tag filter via a `@gorhom/bottom-sheet` multi-select.
**Differences.** Per-list filter UX differs (dropdown vs bottom sheet); web additionally exposes tag
filtering on the home screen.

### Ratings / Visited / Notes
**Description.** Rate a bookmark 0–5 stars, toggle a "visited" flag, and keep multiline notes.
**Web.** `RatingInput` / `StarRating`, `VisitedToggle` (`bookmarks.toggleVisited`), notes textarea.
**Mobile.** Star control + optimistic "Mark visited" toggle on the detail screen; notes field.
**Differences.** None.

### Sharing & permissions
**Description.** Invite people to a list as **Viewer** (view + comment) or **Collaborator** (edit +
comment); the **Owner** manages membership. Inviting sends a **join request** — nobody is added
until the invitee **approves** it (or **rejects** it) from a dedicated **List requests** view
reached by a button above the home search. Invites to non-existent emails stay pending and surface
as a request when they sign up (no auto-join). Inviting a non-friend also offers to send them a
friend request. Non-owners can leave a shared list.
**Web.** `MembersPanel` + `/requests` page (linked from a home button) + `/invite/[token]`;
`sharing.*` procedures (`invite`, `incomingRequests`, `approveRequest`, `rejectRequest`, …);
`assertRole` enforced on every mutation server-side.
**Mobile.** `src/app/lists/members.tsx` + a pushed `src/app/requests.tsx` screen (reached from a
**List requests** button above the home search), same `sharing.*` procedures.
**Differences.** None — permission logic is server-side and shared.

### Friends
**Description.** Add another user by **email** to send a **friend request**; they **accept** or
**decline** it from an **always-visible Friend requests link** (→ a dedicated view). Friends are
mutual once accepted. Each friend row expands to **Edit** (remove the friend) or **Add** (a
multiselect of your lists + a Viewer/Collaborator role → sends a list-join request per selected
list; lists they already belong to are pre-selected). Removing a friend affects both parties.
**Web.** `/friends` page (`AddFriendForm`, `FriendRow`) with a **Requests** link → `/friends/requests`
page; `friends.*` procedures (`list`, `sendRequest`, `accept`, `decline`, `remove`, `addToLists`,
`friendListIds`).
**Mobile.** `src/app/(tabs)/friends.tsx` (Friends tab) with a **Friend requests** link → pushed
`src/app/friend-requests.tsx`; same `friends.*` procedures; friend rows link to the tapped user's
profile.
**Differences.** None — logic is server-side and shared.

### User profiles
**Description.** Every user has a public **profile** — avatar (uploaded image, else emoji icon),
display name, real name, "Member since {year}", a stats row (**public lists · friends**), and their
**public lists** (tap to open, read-only if you're not a member). On **another** user's profile an
**Add friend** button sends a request; your own profile omits it. Data comes from `profile.get`
(identity + public lists + friend count + viewer↔target friendship state); the add-friend action is
`friends.requestByUser`.
**Web.** `/users/[id]` page; linked from a **Profile** button in the home header (before Settings),
from a list's "owned by {owner}", and from friend rows.
**Mobile.** A **Profile** tab (own profile, `src/app/(tabs)/profile.tsx`) plus a pushed
`src/app/users/[id].tsx` for others — both render the shared `components/profile-view.tsx`. Reached
from the tab and from friend rows.
**Differences.** None functionally; layout follows each app's theme.

### Comments
**Description.** Comment threads on both lists and bookmarks (any member, viewer+); delete your own,
or any as the list owner.
**Web.** `CommentSection`; `comments.forList/forBookmark/addToList/addToBookmark/delete`.
**Mobile.** `src/components/comments-section.tsx`, same procedures, relative timestamps.
**Differences.** None.

### Polls
**Description.** Lightweight voting on bookmarks within a list — pick 2+ bookmarks as options, set
start/end dates, max votes per person, whether re-votes are allowed, and (at creation only) whether
the poll is **anonymous**; see ranked results with voters. Anonymous polls hide *who* voted for
what from everyone (counts still show) and can't be un-anonymized after creation.
**Web.** `/lists/[id]/polls[...]` routes, `PollForm` + `PollVote`; `polls.*` procedures.
**Mobile.** `src/app/polls/*` (list, detail with Vote/Results tabs, new/edit modal with a native
date picker); same procedures.
**Differences.** None functionally.

### Nearby / geolocation
**Description.** Find geocoded bookmarks within a radius of your current location, nearest first;
bookmarks with a typed (non-geocoded) location are skipped and counted.
**Web.** `/nearby` → `NearbyFinder` (browser Geolocation API), radius **0.5 / 1 / 2 / 5 / 10 mi**,
per-list toggles; `nearby.find` (haversine).
**Mobile.** `src/app/(tabs)/nearby.tsx` (native `expo-location` GPS), radius **1 / 5 / 10 / 25 mi**
(full-width, evenly-spaced chips), reverse-geocoded location label; `nearby.find`. Result rows show
an emphasized distance and up to 3 tag pills under the list label.
**Differences.** Radius options differ; web offers per-list toggles, mobile searches all.

### Profile & settings
**Description.** Edit your profile (names, birthday, emoji icon), pick a theme, sign out.
**Web.** `/settings` → `ProfileForm`; `profile.update`.
**Mobile.** `src/app/(tabs)/settings.tsx`; theme persisted to secure-store, applied locally.
**Differences.** None.

### Themes
**Description.** Selectable visual themes across three families — **Pixel** (retro 8-bit), **Modern**
(sleek/minimalist), **Journal** (warm scrapbook) — each in light + dark (six total).
**Web.** All six; `THEME_OPTIONS` in `web/src/lib/theme.ts`, CSS variables via `data-theme` on
`<html>`, fully styled (incl. Journal) in `globals.css`. Default **Modern Light** (`coerceTheme`
falls back to `MODERN_LIGHT`).
**Mobile.** All six; `src/theme/tokens.ts` + `theme-provider.tsx`, applied via NativeWind `vars()`.
Default **Journal Light**.
**Differences.** Same six themes on both; the **default** differs (web Modern Light, mobile Journal
Light).

### Native share intent
**Description.** Share a URL into Klect from any other app's native share sheet to start a new
bookmark.
**Mobile.** `expo-share-intent` (iOS Share Extension + Android intent filter) → `/bookmarks/new?url=`
→ auto-autofill; queues the intent through login if signed out. Requires the custom dev build.
**Web.** ➖ Not possible — no OS-level share sheet.
**Differences.** **Mobile-only.**

### PWA install
**Description.** Install the web app to the home screen with an offline fallback page.
**Web.** Web manifest (`manifest.ts`), service worker registered in prod (`PWARegister`), `/offline`
page.
**Mobile.** ➖ N/A — mobile ships as a native app store build.
**Differences.** **Web-only** (concept doesn't apply to the native app).

### AI caption extraction (Comprehend)
**Description.** Extract structured fields (title, location, description, tags) from a pasted social
media caption using Claude.
**Web.** `comprehend.caption` (Anthropic, `claude-haiku-4-5`), best-effort with fallback to the raw
caption.
**Mobile.** ➖ The procedure exists on the shared API but no mobile screen calls it.
**Differences.** **Web-only** in practice.
