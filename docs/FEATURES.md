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
- **Tag and filter.** Add tags to bookmarks (shown as `#hashtags` on mobile) and filter to exactly what you're looking for.
- **Search everything.** Find any list or bookmark fast.
- **Share and collaborate.** Invite people to a list as a **viewer** (can look and comment) or a
  **collaborator** (can add and edit) — they get a **request** to accept, so nobody's added without
  opting in. You stay in control as the owner.
- **Make a list public.** Flip any list to **public** (they start private) so anyone can view it
  read-only and it shows up on your profile — editing still needs an invite.
- **Add friends.** Add people by their **@handle** and, once they accept, bulk-invite a friend to any
  of your lists in one step.
- **Message your friends.** Chat privately 1:1 with any friend — a **Messages** tab sits right next to
  your friends list, with an inbox that flags unread chats. Conversations load instantly and new
  messages arrive in real time. Delete a chat to clear it from your side; if the friendship ends the
  history stays readable but you can't send until you're friends again.
- **Chat inside a list.** Every list has its own **group chatroom** — tap the chat icon in the list
  header (it shows a badge when there's something new) to open a live thread where everyone on the list
  can talk. Each message shows who sent it and their role, so you know at a glance who's a collaborator
  vs. a viewer. Only the owner can wipe the history.
- **Show off a profile.** Everyone has a profile page with their photo/icon, stats, and public
  lists — visit a friend's or a list owner's profile and add them as a friend right there.
- **Comment together.** Leave comments on lists and individual bookmarks to plan and discuss.
- **Vote with polls.** Can't decide? Create a poll from bookmarks in a list and have the group vote
  (great for "where should we eat?").
- **Know your action worked.** Quick, unobtrusive pop-up messages confirm when something saves,
  sends, or fails — they slide in, count down, and disappear on their own, colored green for success
  or red for errors.
- **Find things near you.** The "Near me" feature surfaces your saved spots within a chosen distance
  of wherever you are.
- **Add a bookmark to several lists at once.** Save something to multiple lists in a single step.
- **Make it yours.** Choose from six themes across three looks — **Pixel** (retro 8-bit), **Modern**
  (clean and minimal), and **Journal** (warm scrapbook) — each in light and dark.
- **Get notified.** On the mobile app, Klect sends you a notification when a friend messages you,
  someone posts in a list chat, you get a friend request or list invite, or a comment or poll lands —
  right on your lock screen, with a count on the app icon. Mute any category you don't care about in
  Settings.
- **Use it anywhere.** Available as a web app (installable to your home screen) and a mobile app —
  where you can also **share links straight into Klect** from any other app.
- **Stay in control of your data.** A plain-language privacy policy explains what's collected, and
  you can **permanently delete your account** — and everything in it — at any time from Settings.

---

## Use cases — stories to spark ideas

> **Maintainers:** narrative use cases for **beta-tester onboarding and marketing** — safe to copy
> and adapt. Each leads with a scenario (not a feature list), then names the features it showcases
> and why it matters. Keep it honest: only dramatize capabilities that actually ship above.

Klect isn't one workflow — it bends to whatever you save. A few pictures of it in real life:

### 1. The foodie's living map
Maya saves every restaurant worth remembering into one "Eats" list. She tags each by cuisine —
`ramen`, `tacos`, `date-night`, `cheap-eats` — so when a craving hits she filters down to exactly the
mood in a tap. Every spot carries her star rating and a "visited" check, so the places she's loved
stay separate from the ones still on the hit list. Stuck on a random corner downtown, she opens
**Near me** and Klect surfaces the three saved spots within walking distance.
**Features in play:** tags & filtering · ratings · visited flag · location + Near me.
**Why it lands:** turns a graveyard of saved links into a personal, filterable map she actually uses
in the moment — the difference between "I know I saved something good around here" and *walking there*.

### 2. The trip everyone actually shows up for
Dev is planning Tokyo with four friends. He spins up a "Tokyo 2026" list and **bulk-invites** the
whole group as collaborators in one step. Everyone piles in the spots they've been eyeing — pasting a
link **auto-fills** the name, photo, and neighborhood, so nobody's typing details by hand. They
**comment** on each entry to sort must-dos from maybes, and when the group deadlocks on which
neighborhood to base the first night, Dev spins the shortlist into a **poll** and lets everyone vote.
**Features in play:** collaborators & roles · friends bulk-invite · metadata autofill · comments · polls.
**Why it lands:** one shared surface to collect, discuss, and *decide* — the whole plan in one place
instead of scattered across a group chat that scrolls away by morning.

### 3. The recipe box that fills itself in
Priya keeps a "Weeknight Dinners" list. She pastes a recipe URL and Klect pulls the title, the hero
photo, and even breaks the **ingredients and steps** out into the description — so she isn't fighting
a cluttered food blog at 6pm. She adds a note ("kid-approved, halve the chili") and tags it `30-min`
and `veggie`. Next Tuesday she filters to `30-min` and dinner's decided in seconds.
**Features in play:** metadata autofill (recipe detail extraction) · notes · tags · photos.
**Why it lands:** paste-and-go removes the friction that kills most "save it for later" habits — the
save is instantly useful, not a link she has to re-open and decode later.

### 4. Save it the second you see it
Jordan's deep in a TikTok scroll when a hole-in-the-wall bakery stops him. Instead of screenshotting
it into a camera roll he'll never reopen, he taps **Share → Klect** and the save sheet appears
*right there, without leaving TikTok* — pre-filled with the video and a suggested tag. He drops it in
"Bakeries to Try" and keeps scrolling. Later, the clip **plays inline** when he opens the bookmark.
**Features in play:** iOS share extension (save inside the share sheet) · video detection & inline
player · autofill.
**Why it lands:** captures inspiration at the exact instant it strikes, with zero context switch —
plugging the #1 leak where saves quietly get lost.

### 5. A public list that does your recommending for you
Sam is the friend everyone texts for coffee recommendations. So she flips her "Best Coffee in the
City" list to **public** — now it lives on her **profile** for anyone to browse, read-only, no sign-up
gate. She drops the link in her bio; curious strangers browse, friends she invites can comment, and
the list stays entirely hers to edit.
**Features in play:** public/private lists · profile as a home for public lists · viewer role + comments.
**Why it lands:** turns personal taste into a shareable guide without building a blog or a spreadsheet
— your curation, published in a tap.

### 6. The "what do you want to do tonight" solver
Alex and Sam keep a shared "Date Night" list — bars, a museum late-night, that pop-up they keep
missing. It's **collaborative**, so either can add to it any time. On a free Friday they check
**Near me** for what's close, tick the **visited** box on the wine bar they finally tried (off the
someday pile it goes), and when they're torn between two options, a quick **poll** breaks the tie.
**Features in play:** shared list · Near me · visited flag · polls.
**Why it lands:** kills the recurring decision paralysis of "what should we do tonight" with a
running shortlist you both feed and prune.

### 7. One place, every device
Nina saves a portfolio link from her laptop at work and an Instagram couch from her phone on the
couch — both land in the same synced lists. The couch fits everywhere, so she saves it into **three
lists at once** ("Living Room," "Gifts for Mom," "Design Inspo"), each with its own tags. On the web
she's **installed Klect to her home screen** like a native app; on her phone it already is one.
**Features in play:** multi-list save · web + mobile sync · PWA install.
**Why it lands:** one system of record that follows you across devices and contexts, so a save is
never trapped on the wrong screen.

> **The through-line:** every story is the same loop — *see something worth remembering → save it in
> a couple taps → find it again exactly when it matters.* Klect just makes each step frictionless,
> solo or together. (And it looks the way you like — six themes across Pixel, Modern, and Journal,
> each in light and dark.)

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
| Lists — actions (duplicate / clear) | ✅ | ✅ | Duplicate = new owner copy, bookmarks+tags only, any member (`lists.duplicate`) · Clear = delete all bookmarks, owner only (`lists.clearBookmarks`) |
| Home search | ⚠️ | ⚠️ | Web: unified list + cross-list tag filter · Mobile: local name search |
| Bookmarks — CRUD & fields | ✅ | ✅ | URLs, images, notes, rating, visited, location, tags |
| Standalone multi-list bookmark create | ✅ | ✅ | One independent copy per selected list |
| Link metadata autofill | ✅ | ✅ | Paste URL → two-phase: self-fetch/LinkPreview extract (fast) then JSON-LD/LLM comprehension + geocode → clean name/description/tags/location/coords/images/video |
| Location autocomplete + business autofill | ✅ | ✅ | Mapbox Search Box |
| Video detection & player | ⚠️ | ⚠️ | Web iframe click-to-play · Mobile `expo-video` + WebView |
| Tags (user-scoped, auto-colored, OR filter) | ✅ | ✅ | Per-list filter: web dropdown · mobile bottom sheet |
| Ratings / Visited / Notes | ✅ | ✅ | Visited also drives a **Show only unvisited** toggle on the list view (above the search row) |
| Sharing & permissions | ✅ | ✅ | Owner / Collaborator / Viewer; **request-based** invites (invitee approves/rejects) |
| Friends | ✅ | ✅ | Add by **@handle** (request + accept); bulk-add a friend to your lists |
| Direct messages | ✅ | ✅ | Friends-only 1:1 chat; Friends\|Messages tab switch + unread badge; paginated history; near-real-time (Supabase Realtime, polling fallback); per-user clear/delete; unfriend keeps history but blocks sending (`dms.*`) |
| List chatrooms | ✅ | ✅ | Per-list group chat for all members; header chat icon + unread badge → slide-up drawer (web) / 70% bottom sheet (mobile); sender @handle + soft role suffix; near-real-time (`chat:list:<id>`, polling fallback); paginated history; members-only, owner-only clear = hard-delete (`listChat.*`) |
| User profiles | ✅ | ✅ | `/users/[handle]` (web) · Profile tab + `users/[handle]` (mobile), resolvable by @handle or id; identity + stats + public lists + add-friend (`profile.get`) |
| Comments (lists & bookmarks) | ✅ | ✅ | |
| Polls | ✅ | ✅ | Create / vote / edit / delete |
| Nearby / geolocation | ⚠️ | ⚠️ | Web browser geo + list (0.5–10 mi) · Mobile native GPS + Mapbox map & drawer (1–25 mi) |
| Profile & settings | ✅ | ✅ | Theme picker (all 6 themes) |
| Themes | ✅ | ✅ | All 6 both; **default differs** (web Modern Light · mobile Journal Light) |
| Native share extension | ➖ | ✅ | Mobile-only, iOS (save a bookmark inside the OS share sheet) |
| Push notifications | ➖ | ✅ | Mobile-only, iOS — lockscreen alerts + app-icon badge; per-category toggles in Settings |
| "Share to Klect" how-to | ✅ | ✅ | Illustrated setup walkthrough in Settings (mobile entry iOS-only) |
| Privacy policy | ✅ | ✅ | Public `/privacy` page; linked from Settings (mobile opens it in an in-app browser) |
| Account deletion | ✅ | ✅ | Settings "Danger zone"; type-to-confirm; permanently deletes the user + all owned data (`account.delete`) |
| Toast notifications | ✅ | ✅ | Non-intrusive confirmation/error toasts with a 3s countdown bar + type colors (success/error/info); web bottom-right/top-center · mobile top, swipe-to-dismiss + haptics |
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
**Description.** First-run profile setup for a new user: a unique **@handle** (required — the
public identity used everywhere a user is mentioned), optional first/last name and birthday, an
emoji avatar, and a starting theme. Handles are lowercase `a–z 0–9 _`, 3–20 chars, and unique.
**Web.** `/onboarding` → `ProfileForm`; `completeOnboarding` action. Gated by whether the user has a
`handle`.
**Mobile.** `src/components/onboarding-screen.tsx`, gated by the root layout; saves via
`trpc.profile.update`.
**Differences.** None functionally — same fields, same procedure.

### Lists — CRUD & browse
**Description.** Lists are the containers bookmarks live in. Create/edit (name, description, emoji
icon), delete (owner-only, cascades bookmarks/comments/members/polls), and browse all lists you own
or belong to with bookmark + member counts and a role badge.
**Web.** Home `/` renders `HomeLists`; detail `/lists/[id]`. The detail view has a shared
`ListPageHeader` (identity block + owner-only **Members** button + a **⋮ actions menu** via
`ListToolbar`, on the list-name row) and a rounded-pill **List | Polls** segmented tab bar
(`ListTabs`: **List** = `/lists/[id]`, **Polls** = `/lists/[id]?tab=polls`, rendered inline so the
header/details/tabs stay mounted); edit/delete live in the ⋮ menu's Edit panel. `lists.mine` /
`lists.get` / `lists.create` / `lists.update` / `lists.delete`.
**Mobile.** `src/app/(tabs)/index.tsx` (home cards, with a **Collab / Viewer** pill on lists you
don't own), `src/app/lists/[id].tsx` (detail), `lists/new.tsx` + `lists/edit.tsx` modals. Same
procedures.

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

### Lists — actions (duplicate / clear)
**Description.** A **⋮ actions menu** on a list (Edit / Duplicate / Clear) with two list-level
operations besides edit. **Duplicate** forks the list into a brand-new, fully independent copy owned
by whoever duplicates it — only the **bookmarks (with their tags)** are cloned; members, invites,
polls, and comments are not carried over, and the copy is private. Any **member** (viewer+) can
duplicate; the user picks a name (defaulting to `Copy of {name}`). **Clear** deletes every bookmark
in the list and is **owner-only** (cascades tags/comments/poll options).
**Web.** `ListToolbar` ⋮ dropdown on `/lists/[id]`: **Edit list** (opens the edit panel with the
visibility toggle + delete danger zone), **Duplicate list** (a name form → `duplicateList` action →
`lists.duplicate`, redirects to the new list), and an owner-only destructive **Clear list**
(`ConfirmDeleteButton` → `clearListBookmarks` action → `lists.clearBookmarks`).
**Mobile.** A header **⋮** opens a bottom-sheet actions menu on `src/app/lists/[id].tsx`: **Edit
list** → `lists/edit`, owner-only **Members** → `lists/members`, **Duplicate list** →
`lists/actions.tsx` (duplicate field + button, `lists.duplicate`), and an owner-only destructive
**Clear list** guarded by a native confirm (`lists.clearBookmarks`, refetches in place).
**Differences.** Same procedures + permissions; web uses a dropdown + expanding panels, mobile a
bottom-sheet menu (with duplicate on a pushed screen).

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
an inferred + geocoded location — plus images and a detected playable video. It fills in **two
phases** so the visible fields appear fast (~1–2s) and the richer details patch in a moment later.
**Web / Mobile.** Both call **`metadata.extract`** (Phase 1) then **`metadata.comprehend`** (Phase 2).
Phase 1 fetches the page **once** server-side (`core/page-text.ts` `fetchPage`, SSRF-guarded) for
OG/meta → name/description/image + `detectVideo`, falling back to **LinkPreview → Microlink** when
blocked (YouTube via oEmbed; social reels prefer Microlink). Phase 2 takes a **JSON-LD fast path**
(`structuredDataFromJsonLd` — recipes/events/products/places, no LLM) or else `comprehendMetadata`
(`claude-haiku-4-5`) on the readable text (YouTube: the video description), then **geocodes** the
location to coordinates (so it shows in Near me). Both phases are cached + coalesced by URL. Web: the
loading overlay drops after Phase 1, then an "Enhancing…" indicator while Phase 2 patches via
seed+remount. Mobile: manual button **and** auto-trigger when opened with a `?url=` param (e.g. from
a share); Phase 2 fills-when-empty with an inline "Enhancing…" row. Both keys are optional — autofill
degrades to JSON-LD/raw metadata when unset. (`metadata.fetch` still does both in one call.)
**Differences.** Mobile auto-fires autofill on mount for shared URLs and fills Phase-2
tags/location only when empty (web overwrites via remount); otherwise identical.

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
**Description.** User-scoped tags (shared across all your lists), stored **lowercase** (web's core
lowercases, trims, strips any leading `#`, and dedupes on save, so casing variants like `Coffee` /
`coffee` never create duplicates), each auto-assigned a color at creation. Web renders them as colored
pills; mobile renders them as uniform `#hashtags` (the `#` is display-only and never stored).
Filtering is OR-based (a bookmark matches if it has any selected tag).
**Web.** `TagInput` (suggestions + quick-add chips), per-list filter dropdown in `ListBookmarks`,
color via `randomTagColor`. `tags.mine`, `bookmarks.byTags`.
**Mobile.** `TagPill` component (`#hashtag` text); per-list tag filter via a `@gorhom/bottom-sheet`
multi-select. The bookmark form strips a typed `#` and notes tags are saved lowercase.
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
**Description.** Add another user by their **@handle** to send a **friend request**; they **accept** or
**decline** it from a **Requests link** (→ a dedicated view). The sender can watch and **withdraw**
their own unanswered requests from a **Pending** view (both apps). Friends are
mutual once accepted. Each friend row can **remove** the friend, open the friend's **profile**, and
**add** them to a multiselect of your lists with a Viewer/Collaborator role (→ a list-join request
per selected list; lists they already belong to are surfaced as already-shared so you don't
re-invite them). Removing a friend affects both parties.
**Web.** `/friends` page (`AddFriendForm`, `FriendRow`) with a **Requests** link → `/friends/requests`
(incoming: accept/decline) and a **Pending** link → `/friends/pending` (outgoing: withdraw via
`cancelFriendRequest`); `friends.*` procedures (`list`, `sendRequest`, `accept`, `decline`, `cancel`,
`remove`, `addToLists`, `friendListIds`). `friends.list` returns `{ friends, incoming, outgoing }`.
**Mobile.** `src/app/(tabs)/friends.tsx` (Friends tab) with **Requests** and **Pending** links
(just under the header) → pushed `src/app/friend-requests.tsx` (incoming: accept/decline) and
`src/app/pending-requests.tsx` (outgoing: cancel); same `friends.*` procedures. Tapping a friend row
opens an **actions panel**: a **Remove** (confirm dialog) + **View profile** row above the
**Add to lists** section, where already-shared lists appear **dimmed + checkmarked and non-tappable**
(only new lists are selectable; **Send requests** stays disabled until one is picked). The **Friends
tab** also carries a **red badge** combining unread DMs + incoming friend requests.
**Differences.** UI only — mobile packs remove / view-profile / add-to-lists into one tap-to-expand
actions panel and shows already-shared lists as disabled chips (web pre-checks them); web keeps
separate row controls. Logic is server-side and shared.

### Direct messages
**Description.** Private **1:1 chat between friends**. A **Friends | Messages** tab switch tops the
Friends page in both apps. The **Messages** view is an inbox: each conversation shows the other user's
@handle/icon, a last-message preview, a relative timestamp, and an **unread dot**; the Messages tab
itself carries an **unread-count attention badge**. **New chat** picks a friend to open (or resume) a
thread. A thread shows history oldest→newest with **Load older** (keyset pagination — cheap indexed
reads regardless of length) and a composer. New messages arrive **near-instantly** (Supabase Realtime
broadcast used as a content-free "refetch" ping; all data still flows over authenticated tRPC, and it
**degrades to polling** when unconfigured). **Deleting/clearing** a chat sets your `clearedAt`, hiding
it + its past messages from **you only**; it reappears on the next incoming message showing only newer
messages. Starting a chat and sending both require a **live friendship** — unfriending disables the
composer (with a note) but the history stays readable; re-friending re-enables sending.
**Web.** `/friends/dms` inbox (`DmInbox`) + `/friends/dms/new` (friend picker) + `/friends/dms/[conversationId]`
thread (`DmThread`); shared `FriendsTabs` tab header. Interactive islands read/write through
`lib/actions/dms.ts` server actions (web has no browser tRPC client); realtime via
`lib/realtime/client.ts`.
**Mobile.** The DMs view is an **in-screen tab** on `src/app/(tabs)/friends.tsx` (`SegmentedTabs` +
`components/dms/dm-inbox.tsx`); threads are pushed routes `src/app/dm/[conversationId].tsx` and
`src/app/dm/new.tsx`, consuming the `dms.*` tRPC procedures; realtime via `src/client/realtime.ts`.
**Differences.** UI only — web uses separate routes for the inbox/thread with a tab header; mobile uses
an in-screen segmented switch + pushed thread screens. All logic (`dms.*` / `core/dms`) is shared.

### List chatrooms
**Description.** Every list has one **group chatroom** shared by all its members (owner +
collaborators + viewers). A **chat icon** in the list header — carrying an **unread badge** (same
behavior as the nav badges) — opens the room: a **slide-up drawer** on web / a **70%-height bottom
sheet** on mobile, styled like a DM thread. Members read and post; each message shows the sender's
**@handle** with a soft **role suffix** (`· owner|collaborator|viewer`, muted text). History loads
oldest→newest with **Load older** (keyset pagination) and new messages arrive **near-instantly**
(Supabase Realtime content-free ping on `chat:list:<id>`, all data over authenticated tRPC/actions,
**degrades to polling** when unconfigured). The chatroom is **members-only** — a public list's
non-member viewers never see the chat icon and can't read/post. Only the **owner** can **clear**,
which **hard-deletes every message for everyone** (no soft/per-user clear, unlike DMs). Also on the
list header: the **New bookmark** button moved onto the list-name row (louder styling, before the
⋮ actions) and the chat icon took its former top-header slot.
**Web.** `ListChatLauncher` (`components/lists/ListChatLauncher.tsx`) renders the header icon + badge
and a Framer-Motion slide-up drawer; it reads/writes through `lib/actions/list-chat.ts` server actions
(web has no browser tRPC client); realtime via `lib/realtime/client.ts` (`subscribeListChat`). The
moved New-bookmark button lives in `ListToolbar`.
**Mobile.** A chat icon in the list screen's `headerRight` (`src/app/lists/[id].tsx`) opens
`components/list-chat/list-chat-sheet.tsx` (a `@gorhom/bottom-sheet` modal at 70%), consuming the
`listChat.*` tRPC procedures; realtime via `src/client/realtime.ts` (`subscribeListChat`).
**Differences.** UI only — web slide-up drawer vs. mobile bottom sheet. All logic
(`listChat.*` / `core/list-chat`) is shared.

### User profiles
**Description.** Every user has a public **profile** — avatar (uploaded image, else emoji icon),
their **@handle**, "Member since {year}", a stats row (**public lists · friends**), and their
**public lists** (tap to open, read-only if you're not a member). On **another** user's profile an
**Add friend** button sends a request; your own profile omits it. Data comes from `profile.get`
(identity + public lists + friend count + viewer↔target friendship state); the add-friend action is
`friends.requestByUser`.
**Web.** `/users/[handle]` page (resolvable by @handle or id); linked from a **Profile** item in the
home-header nav, from a list's "owned by {owner}", and from friend rows. On your own profile a
**settings gear** opens `/settings`.
**Mobile.** A **Profile** tab (own profile, `src/app/(tabs)/profile.tsx`) plus a pushed
`src/app/users/[handle].tsx` for others — both render the shared `components/profile-view.tsx`. Reached
from the tab and from friend rows. On your own profile a **settings gear** (top-right) opens the
Settings screen.
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
**Web.** The poll **list** is the **Polls** tab of the list view, rendered inline at
`/lists/[id]?tab=polls` (`PollsView`) so the header/details/tabs stay mounted; detail/new/edit stay
their own `/lists/[id]/polls/[...]` routes (`PollForm` + `PollVote`). The legacy `/lists/[id]/polls`
URL redirects to the inline tab. `polls.*` procedures.
**Mobile.** The poll list renders **inline** as the **Polls** tab on the list screen (shared
`components/poll-row.tsx`); detail + new/edit are pushed `src/app/polls/*` routes (detail with
Vote/Results tabs, new/edit modal with a native date picker); same procedures.
**Differences.** None functionally.

### Nearby / geolocation
**Description.** Find geocoded bookmarks within a radius of your current location, nearest first;
bookmarks with a typed (non-geocoded) location are excluded. (Web counts and shows the skipped
total; mobile omits them silently.)
**Web.** `/nearby` → `NearbyFinder` (browser Geolocation API), radius **0.5 / 1 / 2 / 5 / 10 mi**,
per-list toggles; `nearby.find` (haversine).
**Mobile.** `src/app/(tabs)/nearby.tsx` — a **full-screen Mapbox map** (`@rnmapbox/maps`) that
auto-locates on open, with a **floating** radius selector (**1 / 5 / 10 / 25 mi**) over the map, a
numbered **pin** per result, and a **bottom drawer** (`@gorhom/bottom-sheet`) listing results, each
row showing a **number badge that matches its map pin** (row N ↔ pin N), the distance, and up to 3
tag pills; tapping a pin scrolls the drawer to that row, tapping a row opens the bookmark. Uses
native `expo-location` GPS + a reverse-geocoded label trimmed to street/city/region (no ZIP or
country); `nearby.find` (results carry `lat`/`lon`).
**Differences.** Radius options differ; web offers per-list toggles, mobile searches all. Web renders
a list; mobile renders an interactive map + drawer.

### Profile & settings
**Description.** Edit your profile (names, birthday, emoji icon), pick a theme, sign out.
**Web.** `/settings` → `ProfileForm`; `profile.update`. Reached via the settings gear on your own
profile (`/users/[id]`).
**Mobile.** `src/app/settings.tsx` (a pushed stack route, no longer a tab); reached via the settings
gear on the Profile screen. Theme persisted to secure-store, applied locally.
**Differences.** None.

### Privacy policy
**Description.** A plain-language privacy policy covering what data Klect collects, how it's used,
who it's shared with (service providers + how sharing/public lists work), data retention &
deletion, and a contact email. Written to satisfy the App Store privacy-page requirement.
**Web.** Public route `web/src/app/privacy/page.tsx` — **no auth guard**, so anyone (incl. logged
out) can read it and it serves as the App Store Connect privacy-policy URL. Linked from a "Privacy"
card in Settings.
**Mobile.** A "Privacy" row in Settings opens the same public web URL (`${API_URL}/privacy`) in an
in-app browser via `expo-web-browser` — one source of truth for the copy, no drift.
**Differences.** Web renders the page; mobile opens the web page in-app.

### Account deletion
**Description.** Permanently delete your account and **everything you own** — profile, lists,
bookmarks, comments, polls, votes, tags, friendships, DMs, and list-chat messages. Lives in a
separate **"Danger zone"** and requires **type-to-confirm** (type your exact @handle) so it can't be
triggered by accident. Irreversible.
**Backend.** `core.deleteAccount` (`web/src/lib/core/account.ts`) is a single `prisma.user.delete`
— every `User` relation is `onDelete: Cascade`, so all owned rows go in one transaction. Exposed as
`account.delete` (tRPC) and the `deleteAccountAction` server action.
**Web.** `DeleteAccountSection` client component in `/settings`; on submit the action deletes and
redirects to `/` (cascade-deleted sessions log the user out).
**Mobile.** "Danger zone" row in Settings → pushed `delete-account` screen with the type-to-confirm
field; on success calls `account.delete`, clears the bearer token, and signs out (root layout
returns to the login screen).
**Differences.** UI only — same backend on both.

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

### Native share extension
**Description.** Share a URL into Klect from any other app's native share sheet to save a bookmark —
filled out and saved **inside the share sheet**, without opening the app.
**Mobile.** `expo-share-extension` (iOS only) renders the full `BookmarkForm` + list picker in the
share sheet (auto-autofill on mount, two-phase via `metadata.extract` + `metadata.comprehend`),
saving through `bookmarks.createInLists`. Auth uses
a bearer token read from the shared keychain; if none is present it prompts to open Klect and sign in.
Requires the custom dev build.
**Setup help.** A short, illustrated **"Share to Klect"** walkthrough teaches users how to surface
and favorite the extension in the iOS share sheet — four steps, one screenshot each. It's reachable
from **Settings** on both apps: a pushed screen (`share-help.tsx`, iOS-only entry) on mobile and the
`/settings/share-extension` page on web (so web-first users discover the iOS feature too).
**Setup nudge (mobile, iOS).** So new users don't miss this last setup step, a launch-time popup
nudges them toward the walkthrough. It explains the value, links to the "Share to Klect" page, notes
the same steps live in Settings, and carries an **acknowledge toggle** + a single close button whose
label reads "Remind me again later" until the toggle is on, then "All set!". It reappears every
launch until acknowledged (persisted locally). Mobile-only, iOS-only.
**Web.** ➖ The extension itself isn't possible — no OS-level share sheet — but the how-to page is
served on web for discovery.
**Differences.** The extension is **mobile-only (iOS)**; the how-to page exists on both. Android
share-to-app is not currently supported.

### Push notifications
**Description.** Device notifications (iOS lockscreen alerts + app-icon badge) for the things worth
interrupting a user for — new direct messages, new list-chat messages, friend requests
received/accepted, list invites & approvals, new comments, and new polls.
**Mobile.** `expo-notifications`; the device registers its Expo push token after sign-in
(`src/client/push.ts` → `notifications.registerDevice`) and unregisters on sign-out. Tapping a
notification deep-links to the relevant thread/list/screen. The app-icon badge tracks the
server-computed attention count (unread DMs + friend requests + pending list invites) via
`notifications.badgeCount`. **Settings → Notifications** exposes a per-category toggle for each trigger
(stored server-side in `NotificationPreference`) plus a permission prompt / iOS-Settings deep link.
Requires the custom dev build + an APNs key in EAS.
**Web.** ➖ No device push (a browser Web Push path is future work).
**Differences.** **Mobile-only (iOS this pass).** Backend send logic lives once in web
(`web/src/lib/core/push.ts`), fired alongside the existing realtime pings, so it serves any future
client.

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

### Toast notifications
**Description.** Lightweight, non-intrusive confirmations (and clearer error reporting) that appear
when an action completes — creating/deleting a bookmark or list, sending a friend request, submitting
a vote, posting a comment, saving a profile, etc. Each toast auto-dismisses after **3 seconds** with a
shrinking **countdown progress bar**, is colored by **type** (success = green, error = red, info =
neutral/primary) on a neutral panel surface so it reads correctly in all six themes, and can carry an
optional action button. Both apps expose the same imperative API — `toast.success(...)` /
`toast.error(...)` / `toast.info(...)` — so feedback is consistent across platforms.
**Web.** A module-level store (`web/src/lib/toast.ts`) + a `<Toaster />` host mounted in the root
layout; bottom-right on desktop, top-center on narrow screens; pauses the countdown on hover; the
progress bar is a CSS keyframe. Redirecting server actions hand a toast across the navigation via a
short-lived flash cookie (`web/src/lib/toast-flash.ts`).
**Mobile.** An imperative singleton (`mobile/src/client/toast.ts`) + a `<ToastHost />` overlay mounted
in the root layout; anchored below the notch (top, clear of the floating tab bar); Reanimated
enter/exit + progress bar; **press-and-hold pauses** the countdown, **swipe-up dismisses**, and a
haptic + screen-reader announcement fire on show.
**Differences.** Same API and behavior; position (web adaptive · mobile top) and the pause gesture
(hover · press-hold) differ per platform. Some lower-traffic action sites still adopt the one-line
`toast.*` call incrementally.
