# Klect mobile — architecture & features

Human-readable overview of the Expo / React Native app: what it does, how it's wired, and where
things live. Product, data model, permissions, and the API contract are the shared source of truth
in `../../DESIGN.md` and `../../CLAUDE.md`; the Journal visual design lives in `design.md`; this doc
covers the mobile app's structure and its shipped feature set.

## What this app is

A **thin client** of the web app. Mobile owns **no** database, auth server, or business logic — it
renders UI and calls web's tRPC API. Backend work is written once in `web/`; mobile only builds the
screen that consumes the procedure (see the per-feature workflow in `../../CLAUDE.md`).

Built on **Expo SDK 54** (RN 0.81, React 19, the React Compiler enabled via
`experiments.reactCompiler`). It **requires a custom dev build** — it is **not** an Expo Go app
anymore, because three features add native code that Expo Go can't load:

- **`expo-share-extension`** — a native iOS Share Extension that renders a React save UI *inside*
  the share sheet (save a shared URL as a bookmark without opening the app; iOS only).
- **`expo-video`** — the native player for direct media files in the bookmark video player.
- **`react-native-webview`** — hosts provider iframes (YouTube/Vimeo/TikTok/Instagram) in that same
  player.

Everything else hot-reloads normally against the dev client.

## Build & run

- **First build / native change**: `npx expo prebuild` → `npx expo run:ios` / `npx expo run:android`
  (scripts: `npm run ios` / `npm run android`). This produces the custom dev client with the Share
  Extension + video native modules.
- **Day-to-day JS**: `npx expo start` (`npm start`) against the installed dev client — hot reload.
- `EXPO_PUBLIC_API_URL` (in `.env`) points at the web app that hosts better-auth + tRPC; it defaults
  to `http://localhost:3000`.
- **Type check / lint**: `npx tsc --noEmit -p tsconfig.json` and `npx expo lint`. (Editors' TS
  servers may surface `web/` module-resolution errors from the cross-import; the mobile `tsc` run
  using this `tsconfig.json` is the source of truth.)

## How it talks to the backend

- **Data — tRPC.** `src/client/api.ts` builds a typed `@trpc/client` (`httpBatchLink` →
  `${EXPO_PUBLIC_API_URL}/api/trpc`). It imports web's `AppRouter` as a **type-only** import
  (`@web/*` → web's `src/*` path alias, erased at compile time — zero runtime coupling), so every
  call is end-to-end typed against the exact procedures web exposes. Each request's `headers()`
  attaches the better-auth session as an `Authorization: Bearer <sessionToken>` header
  (`resolveBearerToken()`) so `protectedProcedure` sees the signed-in user. **It must be a Bearer
  token, not a `Cookie` header** — see the transport gotcha under **Auth** below.
- **Data-fetching pattern.** Screens call the vanilla client directly — `trpc.<router>.<proc>.query(…)`
  inside `useFocusEffect` (refetch on focus so lists/bookmarks refresh after a modal closes), and
  `trpc.<router>.<proc>.mutate(…)` in event handlers, then `router.back()` or a manual refetch.
  Screens hold their own `useState` for data/loading/error; there is no global store. (`@tanstack/react-query`
  is a dependency but the app currently uses the vanilla client, not the React Query hooks.)
- **Types, never DTOs.** Screens derive their data shapes from the procedures themselves, e.g.
  `type Bookmarks = Awaited<ReturnType<typeof trpc.bookmarks.forList.query>>`,
  `type BookmarkData = Parameters<typeof trpc.bookmarks.create.mutate>[0]['data']`, and
  `Extract<…, { ok: true }>` to narrow result unions (Nearby). No hand-written interfaces that could
  drift from web. A couple of shared web value-types are imported type-only where the shape is needed
  in props (`RetrievedPlace` / `PlaceSuggestion` from `@web/lib/core/places`).
- **Auth.** `src/client/auth.ts` — `@better-auth/expo` client against the same better-auth server web
  hosts (`API_URL`, deep-link `scheme: "klect"`, `storagePrefix: "klect"`), tokens in
  `expo-secure-store`. It adds `inferAdditionalFields({ user: … })` mirroring web's
  `user.additionalFields`, so the session user is typed with the profile fields — notably
  `displayName`, the "onboarded" signal. The root layout gates on `authClient.useSession()`: pending →
  blank view, signed-out → `<LoginScreen>`, signed-in **without** a `displayName` → `<OnboardingScreen>`,
  otherwise → the navigator. `LoginScreen` toggles **sign in ⇄ create account** — email/password
  (`signIn.email` / `signUp.email` with a name + password ≥ 8) and Google social sign-in
  (`signIn.social`); after onboarding saves, the layout `refetch()`es the session so the gate advances.
  Sign-out lives on Settings.
  - **API transport = Bearer token, not cookie (release-build gotcha).** The tRPC client
    (`src/client/api.ts`) authenticates with `Authorization: Bearer <sessionToken>`; the server
    runs better-auth's `bearer()` plugin to accept it. **Never revert this to
    `Cookie: authClient.getCookie()`.** In an iOS **release/TestFlight** build over HTTPS, native
    networking swallows `Secure` `Set-Cookie` headers before `@better-auth/expo` persists them, so
    `getCookie()` returns empty and every protected call fails with *"Sign in required"* — while
    dev/simulator (plain-HTTP localhost, cookie kept) works fine, so it slips through local testing.
  - **`resolveBearerToken()` handles both sign-in paths.** Email/password captures the token from
    the `set-auth-token` **response header** (`authClient` `fetchOptions.onSuccess`, mirrored to
    `expo-secure-store` + memory). Google OAuth never emits that header — its session arrives as a
    `cookie` query param on the `klect://` deep-link redirect — so the resolver falls back to the
    session-token value parsed out of `authClient.getCookie()` (the stored cookie), which the
    `bearer()` plugin accepts (incl. URL-encoded). Both paths must stay covered.
  - **Shared-keychain token for the share extension.** `klect_bearer` is stored/read with
    `SecureStore`'s `accessGroup: "group.com.klect.app"` (`SHARED_KEYCHAIN_ACCESS_GROUP` in
    `client/bearer-store.ts`) — an App Group iOS also treats as a keychain access group — so the share
    extension's separate process can read it. `resolveBearerToken()` mirrors the OAuth cookie token
    into that keychain on resolve (de-duped), since OAuth never populates the in-memory token. The
    extension has no cookie/memory state, so `readStoredBearerToken()` is its only token source.
  - **Token storage is split out of `auth.ts` — the extension must never load the auth client.**
    Constructing the `@better-auth/expo` client (`expoClient`) wires up deep-link / web-browser
    native APIs that **don't exist in an iOS app-extension process**, so importing `client/auth.ts`
    into the extension crashes its JS bundle before React mounts (symptom: a transparent black
    overlay covers the share sheet and blocks all touches). The token primitives therefore live in a
    dependency-light **`src/client/bearer-store.ts`** (imports only `expo-secure-store`):
    `readStoredBearerToken`, `persistBearer`, `clearBearerToken`, `getCachedToken`, the keychain
    access group, and `API_URL`. `client/api.ts` imports **only** `bearer-store` (never `auth.ts`)
    and exposes `setLiveTokenResolver` — the app registers the cookie-aware `resolveBearerToken`
    from `auth.ts` at startup (via `app/_layout.tsx`), while the extension, which never loads
    `auth.ts`, cleanly falls back to the shared-keychain read. **Keep `bearer-store.ts` free of any
    import that reaches the better-auth client.** The extension's host `backgroundColor` (app.json)
    is opaque (not `alpha: 0`) so a pre-mount frame is a plain surface, never an invisible
    tap-blocker.
  - **Google OAuth deep-link gotcha.** The social flow only returns to the app if the whole OAuth
    round-trip stays on the origin the app calls. The deployed web app's **`BETTER_AUTH_URL` must
    equal `EXPO_PUBLIC_API_URL`** (`https://klect.vercel.app`), and Google Cloud Console must list
    `https://klect.vercel.app/api/auth/callback/google` as an authorized redirect URI. If
    `BETTER_AUTH_URL` points at a different domain (e.g. the old `saive-three.vercel.app`), Google
    signs in but redirects to *that* web app instead of firing the `klect://` deep link that closes
    the in-app browser — so the user lands on the web app rather than back in the native app.
    Because web + mobile share that redirect URI, a Google failure that happens *only on mobile*
    (prod web Google works) is **not** a Google Cloud Console issue — look at token capture above.
- **Push notifications (iOS).** `src/client/push.ts` (`expo-notifications`). After sign-in the
  authenticated branch of `app/_layout.tsx` calls `registerForPushNotificationsAsync()` — guards
  `Device.isDevice`, requests permission, mints an Expo push token (`getExpoPushTokenAsync`, EAS
  `projectId` from `expo-constants`) and registers it via `notifications.registerDevice` (cached in
  `expo-secure-store` to skip redundant re-registration). Notification **taps deep-link** through
  `Notifications.useLastNotificationResponse()` in `_layout.tsx`, routing to the payload's
  `data.route` (covers cold-start + warm). The **app-icon badge** is set from
  `notifications.badgeCount` inside `client/notifications.tsx` (`AttentionProvider`). **Settings →
  Notifications** shows a permission prompt (or iOS-Settings deep link when denied) + a `Switch` per
  category bound to `notifications.getPreferences` / `updatePreferences`; sign-out calls
  `unregisterPushNotificationsAsync()` before clearing the bearer token. Send logic lives once in web
  (`web/src/lib/core/push.ts`); requires the custom dev build + an APNs key on first push-enabled
  `eas build`.

## Navigation

**expo-router** (file-based, `src/app/`, `experiments.typedRoutes`). Root `_layout.tsx` renders
`AppStack` — a `Stack` extracted into a child of the app `ThemeProvider` so its `screenOptions` can
read the active palette. Full-screen pushed screens use a **fully transparent, gradient-blur header**
that matches the tab screens' floating status bar: `headerTransparent: true` + a `headerBackground`
rendering `components/header-blur-background.tsx`. That surface has **no solid tint and no bottom
border** — it's an `expo-blur` `BlurView` masked by a top→bottom alpha gradient
(`expo-linear-gradient` + `@react-native-masked-view/masked-view`) so the blur **fades out
gradually** instead of ending on a hard line. The floating status bar uses the same shared surface,
so home and pushed pages read identically. There's no shadow (`headerShadowVisible: false`), and
**no centered title** — `headerTitle: ''` (an **empty string**, not a function) is set once in the
Stack's `screenOptions` in `_layout.tsx`, so it's the default for **every** route (pushed, modal,
registered, unregistered, or added later). It *must* be a string: native-stack derives the native
title bar text via `getHeaderTitle({ title, headerTitle }, route.name)`, which only uses `headerTitle`
when it's a string — a **function** value (e.g. `() => null`) is ignored and it falls back to
`route.name`, so the raw segment (`lists/[id]`, `lists/members`, …) leaks through as the title. An
empty string resolves to a blank native title. Only the back chevron + any header-right button appear
to *float*.
The page name instead lives in the **scrolling page body** (a `font-serif text-3xl` heading at the
top of the content — screens whose name was header-only, like list detail / members / polls / settings
/ the three request views, gained one; bookmark detail, poll detail, and profiles already rendered
theirs). The back button is chevron-only (`headerBackButtonDisplayMode: 'minimal'` — no route-name
text) and the tint (back chevron) is `primary`. Because the header is transparent, each full-screen
screen **pads its scroll container by `useHeaderHeight() + 8`** so content scrolls *under* the blur.
The `(tabs)` group is a **bottom-positioned swipeable pager** (`@react-navigation/material-top-tabs`
with `tabBarPosition="bottom"`, `react-native-pager-view` under the hood, wired into expo-router via
`withLayoutContext`). Editors are presented as **modals** (`presentation: 'modal'`) with a **solid,
titleless** header — they override `headerTransparent` off (a modal card has no room to scroll under a
translucent bar) but inherit the global `headerTitle: ''` like every other screen, so **no page shows
a centered title anywhere in the app**.

- **Tabs** (`(tabs)/_layout.tsx`), left→right in the bar: **Nearby**, **Create** (＋), **Lists**
  (`index`), **Friends**, **Profile**. The **swipe pager** holds only the four real pages in swipe
  order — **Nearby → Lists → Friends → Profile** — so you can drag horizontally between screens.
  **Create** is an **action button injected by the tab bar** (not a pager page, so there's no
  `create.tsx`): it pushes the standalone new-bookmark modal (`/bookmarks/new`). Settings is **not** a
  tab — it's a pushed stack route (`src/app/settings.tsx`) reached via the **gear icon on the Profile
  screen**.
- **Instagram-style tab bar** (`components/floating-tab-bar.tsx`): a **custom floating glass pill** —
  icon-only, vertically centered, `expo-blur` frosted background over a translucent `panel` fallback,
  `cardShadow` — so tab content scrolls behind it. Each tab renders an **outline (inactive) → filled
  (active) Ionicons pair** inside a **concentric ring**; the outline→fill crossfade + ring are driven
  by the pager's swipe `position`, so an icon **fills in proportion to how far you've dragged toward
  it** (`location-outline`/`location`, `albums-outline`/`albums` for Lists, `people-outline`/`people`,
  `person-circle-outline`/`person-circle`). Presses run a reanimated **spring squash on touch-down +
  elastic rebound on release**, synchronized with an **`expo-haptics`** pulse (selection for tabs,
  light impact for Create). The pill still **shrinks on scroll-down and grows back on scroll-up** via a
  shared reanimated value in `theme/tab-bar-scroll.tsx` (`TabBarScrollProvider` wraps the navigator;
  each tab's `Animated.FlatList`/`Animated.ScrollView` feeds `useTabBarScrollHandler`). Each scroll
  container pads its bottom to clear the pill. (Real blur + haptics need a native build; dev shows the
  fallback and no haptics on the Simulator.) The **Friends** tab shows a **red count badge**
  (`t.danger`) at the top-right of its icon combining **unread DMs + incoming friend requests**; the
  counts come from `client/notifications.tsx` (`AttentionProvider`/`useAttention`, mounted around the
  navigator in `(tabs)/_layout.tsx`), which polls `dms.unreadCount` + `friends.list` and refetches off
  the DM realtime channel and on app-foreground.
- **Frosted status bar.** Tab screens drop the `top` safe-area edge, pad their scroll content by the
  top inset, and render `components/floating-status-bar.tsx` — a top-pinned strip whose glass surface
  is `components/header-blur-background.tsx` (an `expo-blur` `BlurView` masked to a top→bottom
  gradient fade, no tint or border) so content scrolls **under** a blurred status bar that tapers off
  instead of ending on a hard line. A theme-aware `expo-status-bar` `<StatusBar>` (translucent,
  light/dark by theme) lives in the root `AppStack`. Full-screen **pushed** screens get the same look
  via the transparent navigation header described above (same `header-blur-background` surface), so every
  page's top bar is consistent.
- **Stack screens**: `lists/[id]` (list detail), `lists/members`, `bookmarks/[id]` (detail),
  `users/[id]` (another user's profile, pushed from friend rows), `requests` (incoming list-join
  requests), `friend-requests` (incoming friend requests), `pending-requests` (outgoing friend
  requests you've sent — cancel to withdraw), `dm/[conversationId]` (a DM chat thread) and `dm/new`
  (friend picker to start a chat).
- **Modal screens**: `lists/new`, `lists/edit`, `bookmarks/new`, `bookmarks/edit`. `bookmarks/new`
  hides the nav header (`headerShown: false`) and draws its own compact in-drawer top bar (title
  **"New Bookmark"** + a **Cancel** that `router.back()`s) so there's no empty chevron-only header.
  It uses `presentation: 'formSheet'` (not plain `modal`) pinned to a full-height detent
  (`sheetAllowedDetents: [1.0]`, grabber hidden) purely so its top corners can use a milder
  `sheetCornerRadius: 16` — a tunable curve the native `modal` presentation doesn't expose.
- **`+native-intent.tsx`** — `redirectSystemPath` intercepts the Share Extension's re-open deep link
  (`klect://dataUrl=<key>…`, not a real route) and rewrites it to `/`, so expo-router doesn't render
  the not-found screen; the share payload is then picked up by the provider (see Share intent below).

Navigate with `router.push({ pathname, params })`; read params with `useLocalSearchParams`; dismiss a
modal with `router.back()` (or `router.dismissAll()` after leaving a list).

## Screens & features

- **Home / Lists** (`(tabs)/index.tsx`) — the user's lists (`lists.mine`) as cards showing icon,
  name, and `_count` bookmark/member counts; client-side name search (input carries a leading search
  icon + panel fill). Lists the user only **collaborates on or views** (non-`OWNER` `role` on the
  membership) carry a small **Collab / Viewer** pill next to the name (parity with web's `ListCard`),
  so shared lists read differently from your own; owned lists show no badge. A slim toolbar row under the title pairs a **Requests** inbox link (with a
  pending count → the pushed `requests` screen) with the **＋ List** action (→ `lists/new`), divided
  off from the cards below so it doesn't read as another list card. Cards are
  **drag-reorderable** (`react-native-reorderable-list`): long-press a card to drag; `onReorder`
  optimistically reorders then persists `lists.reorder`. Dragging is disabled while searching (the same
  `ReorderableList` renders the filtered subset with `draggable={false}`, and `onReorder` guards against
  the filtered indices). It is deliberately the **same** list component whether or not a search is
  active — swapping component types on the first keystroke would unmount the search `TextInput` (which
  lives in the list header) and drop keyboard focus. Cards carry the `cardShadow`.
- **List requests** (`requests.tsx`) — all open incoming list-join requests
  (`sharing.incomingRequests`) with approve/reject (`approveRequest`/`rejectRequest`).
- **Friends** (`(tabs)/friends.tsx`) — a **Friends | Messages** segmented switch (`SegmentedTabs`,
  with a **red** (`t.danger`) unread badge on Messages, matching the navbar badge) tops the screen.
  **Friends** view: add a friend by @handle
  (`friends.sendRequest`), the **Pending** + **Requests** pills, and your friends list. Each
  `FriendCard` is **tap-to-expand** (chevron affordance): pressing the row opens an **actions panel**
  with a **Remove** (→ `Alert` confirm → `friends.remove`) + **View profile** (→ pushed `users/[id]`)
  row above an **Add to lists** multiselect (list chips + Viewer/Collaborator role →
  `friends.addToLists`). Lists the friend **already belongs to** (`friends.friendListIds`) render
  **dimmed + checkmarked and non-tappable** — only genuinely new lists are selectable, and **Send
  requests** is disabled until at least one new list is picked.
- **Direct messages** — the **Messages** segment renders `components/dms/dm-inbox.tsx`
  (`dms.conversations`): a `FlatList` of chats with unread dot + last-message preview + timestamp,
  **swipe-free delete** (`Alert` → `dms.clear`), and a **New chat** button → `dm/new` (friend picker
  → `dms.start`). A chat thread (`dm/[conversationId].tsx`) loads history via `dms.messages` (keyset
  cursor, **Load older**), sends via `dms.send`, marks read on focus (`dms.markRead`), and disables
  the composer when the friendship has ended. The thread drops the `bottom` safe-area edge and only
  adds the home-indicator inset to the composer **when the keyboard is hidden** (a `Keyboard`
  listener tracks visibility) so the input sits **flush on the keyboard** while typing rather than
  floating an inset above it. New messages arrive via `client/realtime.ts`
  (Supabase broadcast) or focus/interval polling. The DMs unread total drives the segment badge
  (`dms.unreadCount`, refreshed on focus + realtime).
- **List chatrooms** — each list's screen (`app/lists/[id].tsx`) has a **chat icon in `headerRight`**
  (with an unread badge from `listChat.unread`, kept live off `subscribeListChat` + polling) that
  presents `components/list-chat/list-chat-sheet.tsx` — a `@gorhom/bottom-sheet` modal at a **70%**
  snap point holding a DM-style group thread (`BottomSheetFlatList` + `BottomSheetTextInput`). It
  loads history via `listChat.messages` (keyset **Load older**), sends via `listChat.send`, marks read
  while open (`listChat.markRead`), tags each message with the sender's **@handle + soft role suffix**,
  and — for the **owner** — offers **Clear** (`listChat.clear`, hard-deletes all). The composer
  applies the safe-area **bottom inset only when the keyboard is hidden** (`useSafeAreaInsets` +
  keyboard show/hide listeners) so it clears the iOS home indicator without double-spacing above the
  keyboard — the same pattern as the DM thread composer. The former
  `headerRight` **add-bookmark** action moved to the **list-name row** as a louder filled "New" button
  (before the ⋮ actions); the chat icon took its place. Members-only.
- **Friend requests** (`friend-requests.tsx`) — all incoming friend requests (`friends.list().incoming`)
  with accept/decline (`friends.accept`/`friends.decline`). Reached from a compact **Requests** pill
  below the Friends header — the trailing pill in a `justify-between` row.
- **Pending requests** (`pending-requests.tsx`) — outgoing friend requests you've sent and that are
  still unanswered (`friends.list().outgoing`), each with a **Cancel** action to withdraw
  (`friends.cancel`). Reached from a **Pending** pill on the Friends screen — the **leading** pill,
  pushed to the opposite edge from the Requests pill.
  *(Header note: `friend-requests`, `pending-requests`, and the pushed `users/[id]` profile use the
  home-style **fully transparent** navigation header — floating back chevron, no title — and take
  their gradual blur from the screen's own `FloatingStatusBar` (the `transparentHeader` option in
  `_layout.tsx`), rather than the pushed-header `HeaderBlurBackground`.)*
- **List detail** (`lists/[id].tsx`) — bookmark feed (`bookmarks.forList`) as `PhotoCard`s (first
  image, name, description, rating stars, `#hashtag` tags). The feed always shows a static thumbnail, never
  a player. When the extracted image is missing **or fails to load** (reel `og:image`s are often
  hotlink-blocked/expiring social-CDN URLs), `PhotoCard` walks a fallback chain on error — a derived
  YouTube poster (`videoPosterUrl`) then a no-key page screenshot (`screenshotThumbUrl`, WordPress
  mShots), both in `lib/video-embed.ts`. The nav header holds a single **flat Add** button (a
  borderless primary-colored **＋** glyph, no filled pill → `bookmarks/new?listId=`, editors); the **⋮** button — opening a `@gorhom/bottom-sheet` **actions
  menu** (Edit list → `lists/edit`, owner Members → `lists/members`, Duplicate list → `lists/actions`,
  owner destructive Clear list → native confirm → `lists.clearBookmarks`) — now sits on the
  **list-name row**, right-justified beside the title. Below the identity block, in the `FlatList`
  header: a **center-aligned** rounded-pill **List | Polls** segmented control (echoes the floating nav bar). Polls
  render **inline** — tapping the tab swaps the feed to the list's polls (`polls.forList`, via the
  shared `components/poll-row.tsx`) with a **Create poll** button (editors), no route push, so the
  header/details/tab bar stay mounted; poll detail/create stay their own pushed routes. On the **List**
  tab, below the tabs: a **Show only unvisited** toggle, then a **filter
  row** — a left-justified **search box** (filters the feed by bookmark name, case-insensitive
  substring) that fills the remaining width, with a **Tags ▾** button on its right (only when the
  list has tags) that opens a `@gorhom/bottom-sheet` tag filter (multi-select **OR**, distinct tags
  across the list). In that sheet, **collaborators** get a trash icon per tag that removes it from
  every bookmark in the list (`tags.removeFromList`, confirmed via `Alert` with the affected count).
  Name search, the tag filter, and the unvisited toggle combine with **AND**. Selected tags render below
  as a removable `#hashtag` row (tap to remove); a **Clear all** control appears whenever a tag is selected **or** the
  search box has text, and clears **both**. Footer is the list `CommentsSection` (List tab only). Access comes from
  `lists.get` (`{ list, role, isMember }`): **non-members of a public list** get a read-only view —
  the Add button, action row, and comment composer are all hidden and a "Public · view only" note
  shows. (The owner's public/private control lives on the **edit** screen, not here.)
- **Bookmark detail** (`bookmarks/[id].tsx`) — `bookmarks.get` (`{ bookmark, role } | null`): hero
  photos (first image large + a horizontal thumbnail strip for the rest), rating, a **Mark visited**
  toggle (optimistic `bookmarks.toggleVisited`), tags, description, tappable source URLs
  (`Linking.openURL`), a 📍 location row that opens the address in the device maps app
  (`maps.apple.com` deep link with coords when present), notes, the bookmark `CommentsSection`, and a
  confirm-dialog **Delete**. Edit is a header-right pencil icon (Ionicons `create-outline`, centered
  in a 32×32 hit target → `bookmarks/edit`). When the bookmark has a detected video
  (`videoUrl`/`videoType`, set by autofill), a `BookmarkVideo` player **replaces** the hero image.
- **New bookmark** (`bookmarks/new.tsx`) — **dual-mode**, keyed on the `listId` param:
  - *In-list* (`?listId=`, from a list's **Add**): saves one bookmark via `bookmarks.create`.
  - *Standalone* (no param, from home **＋ Bookmark**): shows the **list picker** (`ListPicker`) —
    multi-select editable lists (owner/collaborator) **and** create new lists inline — then writes an
    independent bookmark into every target via `bookmarks.createInLists`. When lists are created
    inline, the picker shows a **Public** `Switch` (default off) that sets those new lists' visibility
    (`newListsPublic`). Requires ≥1 target (enforced by throwing from `onSubmit`).
  Both render the shared `BookmarkForm`. Also accepts a `url` param (from the share intent) — it
  seeds the form's URL and sets `autofillOnMount` so metadata is fetched immediately.
- **Edit bookmark** (`bookmarks/edit.tsx`) — same `BookmarkForm`, `bookmarks.update`.
- **New / edit list** (`lists/new.tsx`, `lists/edit.tsx`) — `ListForm` (icon, name, description);
  both create **and edit** show a **Public** `Switch` (`showVisibility`) — on edit it's shown only to
  the **owner** and persists via `lists.setVisibility` (metadata still goes through `lists.update`,
  which ignores `isPublic`); `lists.create` / `lists.update`; edit also offers **Delete list**.
- **Members** (`lists/members.tsx`) — sharing UI. Owner-only invite by email as **Viewer** or
  **Collaborator** (`sharing.invite`), member list with role toggle + remove (`sharing.changeRole` /
  `sharing.removeMember`), pending-invite revoke (`sharing.pendingInvites` / `sharing.revokeInvite`);
  non-owners see a **Leave list** action (`sharing.leave`). Pending-invite/owner-only queries swallow
  the 403 for non-owners.
- **Nearby** (`(tabs)/nearby.tsx`) — a **full-screen Mapbox map** (`@rnmapbox/maps`, `MapView` +
  `Camera`; style follows light/dark theme, tiles need `EXPO_PUBLIC_MAPBOX_TOKEN`). On open it
  **auto-locates** (`expo-location` foreground permission → `getCurrentPositionAsync`), centers the
  camera on the user, and resolves a "Your location" label via `places.reverseGeocode` (falling back
  to a raw coordinate readout; the reverse-geocoded address is trimmed client-side to
  street/city/region — ZIP and country are dropped). A **floating radius selector** (glass pill, chips 1/5/10/25 mi) sits
  over the top of the map (`zIndex` below the drawer, so dragging the drawer to full height covers
  the chips rather than letting them float over it); tapping a chip runs `nearby.find` (haversine-filters the user's
  coordinate-bearing bookmarks) and `fitBounds` frames the user + all results. Each result is a
  **numbered pin** (`MarkerView`); tapping one expands the drawer and scrolls to its row (briefly
  ringed). A persistent **bottom drawer** (`@gorhom/bottom-sheet` non-modal `BottomSheet` +
  `BottomSheetFlatList`, snap points 45% / 90%) holds the result list — compact rows, each carrying
  a **number badge that matches its map pin** (row N ↔ pin N), an emphasized distance, and up to 3
  `#hashtag` tags (`TagPill`), plus the location label. Tapping a row opens the bookmark. Only
  bookmarks given coordinates via location search appear (coordinate-less ones are silently omitted). (`app.config.js` injects the Mapbox **download** token
  from `MAPBOX_DOWNLOAD_TOKEN` at build time; see `.env.example`.)
- **Profile** (`(tabs)/profile.tsx` own · `users/[id].tsx` others, both render
  `components/profile-view.tsx`) — a user's avatar/icon, name, "Member since", stats (public lists ·
  friends), and their public lists (`profile.get`). Others' profiles show an **Add friend** button
  (`friends.requestByUser`); your own omits it but shows a **settings gear** (top-right) that pushes
  the Settings screen.
- **Settings** (`settings.tsx`, a pushed stack route reached via the Profile gear) — account summary
  (name/email from the session); **theme picker** (all six themes, four-swatch preview + check); an
  iOS-only **"Add Klect to your Share Sheet"** row (gated on `Platform.OS === 'ios'`) that pushes the
  help screen; sign out.
- **Share to Klect** (`share-help.tsx`, a pushed stack route from Settings) — a static, illustrated
  walkthrough for surfacing/favoriting the share extension in the iOS share sheet: four steps, one
  screenshot each (`assets/images/share-help/step-1..4.png`, the same PNGs the web help page serves).
  No data fetching; theme-aware via the semantic classes.
- **Share-sheet nudge popup** (`components/share-nudge-popup.tsx`, mounted in `AppStack` in
  `app/_layout.tsx`) — a **launch-time** centered dialog (RN `Modal`) that points new users at the
  one setup step the app can't do for them: enabling Klect in the iOS share sheet. It offers a CTA
  into `share-help`, notes the same steps live in Settings, and carries an **acknowledge toggle** +
  a single close button whose label flips between "Remind me again later" (off) and "All set!" (on).
  Shows on every launch until acknowledged; the ack is persisted to `expo-secure-store` under
  `klect.share-nudge-ack` (toggling on writes it immediately, off clears it). **iOS only** (the
  share extension / walkthrough don't exist on Android).
- **Login / sign-up** (`components/login-screen.tsx`) — shown when signed out. A mode toggle switches
  between **Sign in** and **Create account** (the latter adds a Name field; password ≥ 8), mirroring
  web's `LoginForm`; Google is available in both. `signUp.email` creates the account, then the
  onboarding gate takes over.
- **Onboarding** (`components/onboarding-screen.tsx`) — the mobile analogue of web's `/onboarding`.
  Rendered by the root layout when a signed-in user has no `displayName` yet (new email or Google
  accounts). Collects display name (required), first/last name, birthday (`YYYY-MM-DD` text), an emoji
  avatar (web's `ICON_CHOICES`), and a theme (the six-theme picker, applied locally via `setTheme`).
  Saves through the shared **`trpc.profile.update`** procedure (same `saveProfile` core web's
  onboarding uses), then calls back to refetch the session and enter the app. **Theme caveat:** mobile
  themes are local (`secure-store`) and include Journal, but the server `Theme` enum is only
  Pixel/Modern — a Journal pick is `coerceTheme`d to Pixel server-side (affecting web only; mobile
  keeps its local theme).
- **Share extension** (`expo-share-extension`, **iOS only**) — Klect appears in other apps' native
  share sheets (web URLs / text; activation rules in `app.json`). Instead of opening the app, the
  extension **renders a React save UI right in the share sheet** (`index.share.js` registers the
  `shareExtension` root → `src/share-extension.tsx`). It reuses the shared `BookmarkForm` + `ListPicker`
  (full editor, autofill, multi-list create) and saves via `bookmarks.createInLists`, then dismisses
  with `close()`. The extension is a **separate process** with no in-memory token or better-auth
  cookie, so it authenticates by reading the bearer token from the **shared keychain** (App Group
  `group.com.klect.app`, which iOS also treats as a keychain access group — see Auth). If no token is
  present (e.g. an OAuth session never surfaced to the shared keychain, or signed out) it shows an
  "Open Klect" prompt (`openHostApp`), since the extension can't run the OAuth deep-link flow. Metro
  builds the extension as a second bundle via `withShareExtension`; requires the custom dev build.
  For perceived speed the drawer never blocks: on-mount metadata autofill is **non-blocking** (the
  list picker stays interactive while the link is fetched — see `BookmarkForm` below), and the list
  picker **hydrates instantly** from a snapshot the app write-mirrors into the shared keychain
  (`client/shared-lists-cache.ts`) before the live `lists.mine` refresh returns.

### The shared `BookmarkForm` (`components/bookmark-form.tsx`)

Reusable editor for create + edit. Surfaces a URL with **Autofill** (`metadata.fetch` unfurls
title/description/images **and any detected `video`**, stored as `videoUrl`/`videoType` so the detail
player has data), a **location search** (`LocationInput`), name, description, comma-separated tags,
and a 0–5 star rating. It **merges edited fields over `initial`**, preserving fields it doesn't
surface (notes, coords when free-typed, extra urls, visited) so editing never wipes them. `EMPTY_BOOKMARK`
is the create baseline. An optional `header` slot renders above the form — the standalone flow passes
`<ListPicker>` into it so the picker shares the form's keyboard-aware scroll and single submit button.
When a `header` is present the two areas are labelled with matching uppercase section headers — an
**"Add to lists"** header over the picker and a **"Bookmark"** header sharing the divider row above the
fields — visually splitting the drawer into its list and bookmark sections.
`onSubmit(data)` is provided by each screen; throwing from it surfaces the message inline (used to
enforce "pick at least one list"). A **manual** Autofill button press is blocking (a full-screen
overlay while it overwrites the fields); `autofillOnMount` (guarded to run once, for a shared URL)
is **non-blocking** instead — it shows only an inline "Fetching link…" indicator so the rest of the
drawer (notably the list picker) stays usable, and it fills/refines name & description **without
clobbering** anything the user hand-edited meanwhile (tracked via dirty refs). Tags are entered
comma-separated; a leading `#` is stripped on input
(the `#` is display-only) and web's core lowercases + dedupes on save, so casing variants never
create duplicate tags. The scroll view uses `automaticallyAdjustKeyboardInsets` (not a
`KeyboardAvoidingView`) so the focused field always sits above the keyboard — this is what keeps the
form visible inside the fixed-height iOS share sheet, where the old padding-based avoider pushed it
off-screen.

- **`LocationInput`** (`components/location-input.tsx`) — Mapbox Search Box autocomplete via web's
  `places.search` / `places.retrieve` procedures (token stays server-side). Carries a **"Location"**
  section label and a *"Search an address or business…"* placeholder so it's clear you can add an
  address (geocoding a bookmark is what surfaces it on **Near me**). Debounced suggest
  (≥3 chars, 350 ms) → pick → `retrieve` coordinates, with request-id guarding against stale
  responses and a rotating session token for Mapbox billing. Free typing clears the parent's
  coordinates (text no longer matches the pin); picking a **business** (POI) autofills
  name/description/URL/images **only into empty fields** (and unfurls its website for the same empty
  fields), while location + coordinates always overwrite; a plain address sets location + coordinates
  only.
- **`ListPicker`** (`components/list-picker.tsx`) — multi-list target picker (standalone + share
  flows). **Compact by design:** the form body shows only the *selected* lists as chips plus an
  **"Add to a list"** button; the full, **searchable** list of editable lists (OWNER/COLLABORATOR)
  lives behind a bottom-anchored picker — a plain RN `<Modal>` (not `@gorhom/bottom-sheet`, which has
  no provider in the share-extension process), with inline new-list creation (dismissible "(new)"
  badges, committed on submit/blur). Consumes a minimal `ListOption[]` (`{ id, name, icon, role }`,
  from `client/shared-lists-cache.ts`) rather than full membership rows, so it renders identically
  from the network or from the shared-keychain cache.

### `BookmarkVideo` (`components/bookmark-video.tsx`)

The RN analogue of web's `BookmarkVideo`, shown on bookmark detail when a video was detected. A
**click-to-play facade** (poster + ▶) so nothing heavy mounts until tapped. `videoType === 'iframe'`
loads the provider embed in a **WebView**-hosted iframe (autoplay injected, 16:9 for YouTube/Vimeo,
9:16 for TikTok/Instagram); `videoType === 'file'` uses **`expo-video`**'s `useVideoPlayer`/`VideoView`.
The trusted-host whitelist (`isTrustedIframeUrl` in `lib/video-embed.ts` — a defense-in-depth mirror
of web's `lib/video.ts`, deliberately **not** named `video.ts` so it can't shadow web's file through
the `@/*` fallback) is re-checked before mounting the WebView.

### Shared components

`photo-card.tsx` (photo-forward card + `theme/shadows.ts` drop shadow, with the image → fallback →
emoji-placeholder error walk), `tag-pill.tsx` (a `#hashtag` in uniform muted/secondary text — no pill/color),
`comments-section.tsx` (add/delete/list with relative timestamps, newest first), `list-form.tsx`,
`login-screen.tsx`.

## Theming

`src/theme/` reproduces web's token system as data (mobile can't import web at runtime, so
`tokens.ts` mirrors web's values — keep in sync). **Six themes across three families** — **Journal**
(warm scrapbook, the default), **Pixel**, **Modern** — each light + dark; only palette/skin/font
differ, screen structure is shared.

- **`tokens.ts`** — `THEME_TOKENS` (11 semantic colors per theme) + per-family `SKIN` (border width +
  corner radii: Pixel 2px/4px/2px, Modern 1px/16px/8px, Journal 1px/20px/12px). `themeVars(name)`
  produces the CSS-variable map (colors + `--border-w` / `--radius` / `--radius-sm`).
- **`theme-provider.tsx`** — applies `themeVars` via NativeWind `vars()` on a root wrapper (web's
  `data-theme` swap, ported). Defaults to **Modern** following system light/dark; an explicit pick is
  persisted to secure-store (`klect.theme`). `useTheme()` exposes `{ theme, setTheme }`. The app root
  passes `mirrorToShared`, which write-mirrors the active theme into the **shared keychain group**
  (`klect.theme.shared`, `SHARED_THEME_KEY` — same App Group the bearer token uses) so the Share
  Extension's separate process can render in the user's real theme. The extension reads that mirror
  and passes it as `initialTheme`; if it's absent/unreadable (e.g. the app hasn't run since the
  feature shipped, or a brand-new user), the provider falls back to system light/dark → **Modern**.
  The same App-Group-keychain mirror pattern backs the share extension's instant list picker —
  `client/shared-lists-cache.ts` write-mirrors the user's lists (`klect.lists.shared`) so the
  extension hydrates them without waiting on the network.
- **`tailwind.config.js`** — maps the semantic classes to the CSS vars and registers the skin
  utilities + per-weight font families.
- **Styling** — semantic NativeWind classes only: `bg-bg` / `bg-panel` / `text-ink` / `text-muted` /
  `bg-primary` / `text-primary-ink` / `text-accent` / `text-danger`, shape via `border-skin` /
  `rounded-skin[-sm]`. Fonts: `font-serif` / `font-serif-italic` (Newsreader, titles/names/empty
  states), `font-sans[-medium|-semibold]` (Work Sans, UI/body) — loaded per weight in the root layout
  via `expo-font` before the splash hides (RN doesn't synthesize weights, so weight = family). For
  colors NativeWind can't reach cross-platform (tab bar, bottom sheet, `placeholderTextColor`,
  spinners) read raw values from `THEME_TOKENS[theme]`.
- **`theme/shadows.ts`** — `cardShadow`, a platform-selected soft drop shadow applied via `style=`
  (NativeWind shadow utilities are inconsistent cross-platform).

## Layout & providers

Root `_layout.tsx` wraps the tree in `GestureHandlerRootView` → app `ThemeProvider` →
`@react-navigation/native` theme → `BottomSheetModalProvider`, holds the native splash until the
Journal fonts load, and gates the tree on the auth session (blank / `LoginScreen` / `Stack`). The
**share extension** bundle (`src/share-extension.tsx`) replicates the minimum of this tree it needs —
`SafeAreaProvider` → `GestureHandlerRootView` → app `ThemeProvider` — without expo-router or the
bottom-sheet provider.

**Toasts.** A global `<ToastHost />` (`components/toast/ToastHost.tsx`) is mounted as a sibling
overlay inside the theme provider so it floats above every screen and reads the active palette. It
subscribes to an imperative singleton store (`client/toast.ts`) — call `toast.success/error/info(...)`
straight from a screen's `try/catch` mutation handler (there's no React Query layer to hook). Each
toast auto-dismisses in 3s with a Reanimated countdown bar, pauses on press-and-hold, swipes up to
dismiss, and fires a haptic + screen-reader announcement. Mirrors web's `toast` API
(`web/src/lib/toast.ts`).

## Conventions & gotchas

- **UI only.** Never add business logic or DB access here — it lands once in `web/` and is exposed as
  a tRPC procedure. The only cross-folder reference is the **type-only** `@web/*` import.
- **Not Expo Go.** The app needs the custom dev build (Share Extension + `expo-video` +
  `react-native-webview`). After changing native config (`app.json` plugins, new native deps) re-run
  `expo prebuild` + `expo run:*`; JS-only changes just need `expo start`.
- **Keep `tokens.ts` in sync** with web's palette values when themes change on either side.
- **Secrets stay in web.** Mapbox / Microlink / Anthropic are reached through tRPC procedures; no keys
  ship in the app.
- **`lib/video-embed.ts` is named deliberately** — `@/lib/video` would resolve to web's
  `src/lib/video.ts` via the shared path fallback, so the mobile mirror must not be called `video.ts`.
- **Expo-template leftovers.** `src/constants/theme.ts` (`Colors`/`Fonts`/`Spacing`) and
  `src/hooks/use-color-scheme*.ts` are unused scaffolding from `create-expo-app`; the real theming is
  `src/theme/`. `README.md` is likewise the generic Expo starter readme — this doc + `../CLAUDE.md`
  are the real onboarding.
