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

- **`expo-share-intent`** — a native iOS Share Extension + Android intent-filter (share a URL into
  Klect from any app).
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
  - **Google OAuth deep-link gotcha.** The social flow only returns to the app if the whole OAuth
    round-trip stays on the origin the app calls. The deployed web app's **`BETTER_AUTH_URL` must
    equal `EXPO_PUBLIC_API_URL`** (`https://klect.vercel.app`), and Google Cloud Console must list
    `https://klect.vercel.app/api/auth/callback/google` as an authorized redirect URI. If
    `BETTER_AUTH_URL` points at a different domain (e.g. the old `saive-three.vercel.app`), Google
    signs in but redirects to *that* web app instead of firing the `klect://` deep link that closes
    the in-app browser — so the user lands on the web app rather than back in the native app.
    Because web + mobile share that redirect URI, a Google failure that happens *only on mobile*
    (prod web Google works) is **not** a Google Cloud Console issue — look at token capture above.

## Navigation

**expo-router** (file-based, `src/app/`, `experiments.typedRoutes`). Root `_layout.tsx` renders
`AppStack` — a `Stack` extracted into a child of the app `ThemeProvider` so its `screenOptions` can
read the active palette. Pushed screens use a **seamless "floating" header**: the header background
is the page `bg` token with no shadow (`headerShadowVisible: false`), the title is `ink` in
Newsreader, the back button is chevron-only (`headerBackButtonDisplayMode: 'minimal'` — no route-name
text), and the tint (back chevron) is `primary` — mirroring the header-less homepage look. The
`(tabs)` group is a bottom `Tabs` navigator. Editors are presented as **modals**
(`presentation: 'modal'`).

- **Tabs** (`(tabs)/_layout.tsx`, Ionicons), left→right: **Nearby**, **Friends**, **Lists**
  (`index`), **Profile**, **Settings** — order is deliberate so **Lists sits dead-center** of the
  five tabs and Profile sits just before Settings (React Navigation renders tabs in `<Tabs.Screen>`
  declaration order). Uses a
  **custom floating glass pill** tab bar (`components/floating-tab-bar.tsx`, an Instagram-style
  content-hugging pill — icon-only, vertically centered, `expo-blur` frosted background over a
  translucent `panel` fallback, `cardShadow`) so tab content scrolls behind it. It **shrinks on
  scroll-down and grows back on scroll-up** via a shared reanimated value in
  `theme/tab-bar-scroll.tsx` (`TabBarScrollProvider` wraps the navigator; each tab's
  `Animated.FlatList`/`Animated.ScrollView` feeds `useTabBarScrollHandler`). Each scroll container
  pads its bottom to clear the pill. (Real blur needs a native build; dev shows the fallback.)
- **Stack screens**: `lists/[id]` (list detail), `lists/members`, `bookmarks/[id]` (detail),
  `users/[id]` (another user's profile, pushed from friend rows).
- **Modal screens**: `lists/new`, `lists/edit`, `bookmarks/new`, `bookmarks/edit`.
- **`+native-intent.tsx`** — `redirectSystemPath` intercepts the Share Extension's re-open deep link
  (`klect://dataUrl=<key>…`, not a real route) and rewrites it to `/`, so expo-router doesn't render
  the not-found screen; the share payload is then picked up by the provider (see Share intent below).

Navigate with `router.push({ pathname, params })`; read params with `useLocalSearchParams`; dismiss a
modal with `router.back()` (or `router.dismissAll()` after leaving a list).

## Screens & features

- **Home / Lists** (`(tabs)/index.tsx`) — the user's lists (`lists.mine`) as cards showing icon,
  name, and `_count` bookmark/member counts; client-side name search; header actions **＋ List**
  (→ `lists/new`) and **＋ Bookmark** (→ `bookmarks/new`, the standalone flow). Cards carry the
  `cardShadow`.
- **List detail** (`lists/[id].tsx`) — bookmark feed (`bookmarks.forList`) as `PhotoCard`s (first
  image, name, description, rating stars, tag pills). The feed always shows a static thumbnail, never
  a player. When the extracted image is missing **or fails to load** (reel `og:image`s are often
  hotlink-blocked/expiring social-CDN URLs), `PhotoCard` walks a fallback chain on error — a derived
  YouTube poster (`videoPosterUrl`) then a no-key page screenshot (`screenshotThumbUrl`, WordPress
  mShots), both in `lib/video-embed.ts`. Header holds only **Add** (→ `bookmarks/new?listId=`).
  Above the feed, in the `FlatList` header: an **Edit list / Members** action row, then a **filter
  row** — a left-justified **search box** (filters the feed by bookmark name, case-insensitive
  substring) that fills the remaining width, with a **Tags ▾** button on its right (only when the
  list has tags) that opens a `@gorhom/bottom-sheet` tag filter (multi-select **OR**, distinct tags
  across the list). Name search and the tag filter combine with **AND**. Selected tags render below
  as a removable pills row; a **Clear all** control appears whenever a tag is selected **or** the
  search box has text, and clears **both**. Footer is the list `CommentsSection`. Access comes from
  `lists.get` (`{ list, role, isMember }`): **non-members of a public list** get a read-only view —
  the Add button, action row, and comment composer are all hidden and a "Public · view only" note
  shows; the **owner** gets a public/private **Switch** (`lists.setVisibility`, optimistic).
- **Bookmark detail** (`bookmarks/[id].tsx`) — `bookmarks.get` (`{ bookmark, role } | null`): hero
  photos (first image large + a horizontal thumbnail strip for the rest), rating, a **Mark visited**
  toggle (optimistic `bookmarks.toggleVisited`), tags, description, tappable source URLs
  (`Linking.openURL`), a 📍 location row that opens the address in the device maps app
  (`maps.apple.com` deep link with coords when present), notes, the bookmark `CommentsSection`, and a
  confirm-dialog **Delete**. Edit is in the header. When the bookmark has a detected video
  (`videoUrl`/`videoType`, set by autofill), a `BookmarkVideo` player **replaces** the hero image.
- **New bookmark** (`bookmarks/new.tsx`) — **dual-mode**, keyed on the `listId` param:
  - *In-list* (`?listId=`, from a list's **Add**): saves one bookmark via `bookmarks.create`.
  - *Standalone* (no param, from home **＋ Bookmark**): shows the **list picker** (`ListPicker`) —
    multi-select editable lists (owner/collaborator) **and** create new lists inline — then writes an
    independent bookmark into every target via `bookmarks.createInLists`. Requires ≥1 target (enforced
    by throwing from `onSubmit`).
  Both render the shared `BookmarkForm`. Also accepts a `url` param (from the share intent) — it
  seeds the form's URL and sets `autofillOnMount` so metadata is fetched immediately.
- **Edit bookmark** (`bookmarks/edit.tsx`) — same `BookmarkForm`, `bookmarks.update`.
- **New / edit list** (`lists/new.tsx`, `lists/edit.tsx`) — `ListForm` (icon, name, description);
  create also shows a **Public** `Switch` (`showVisibility`, default off); `lists.create` /
  `lists.update`; edit also offers **Delete list**. (Visibility on existing lists is toggled on the
  list detail screen, owner-only — not in the edit form.)
- **Members** (`lists/members.tsx`) — sharing UI. Owner-only invite by email as **Viewer** or
  **Collaborator** (`sharing.invite`), member list with role toggle + remove (`sharing.changeRole` /
  `sharing.removeMember`), pending-invite revoke (`sharing.pendingInvites` / `sharing.revokeInvite`);
  non-owners see a **Leave list** action (`sharing.leave`). Pending-invite/owner-only queries swallow
  the 403 for non-owners.
- **Nearby** (`(tabs)/nearby.tsx`) — reads device GPS (`expo-location`, foreground permission), then
  in parallel calls `nearby.find` (haversine-filters the user's coordinate-bearing bookmarks within a
  chosen radius — full-width, evenly-spaced chips 1/5/10/25 mi) and `places.reverseGeocode` (a
  readable "Your location" label, falling back to a raw coordinate readout). Results are compact
  rows with an emphasized distance and up to 3 tag pills (`TagPill`, from `card.tags`) under the
  list label; a "N skipped (no coordinates)" note covers bookmarks without coordinates. Only
  bookmarks given coordinates via location search have them.
- **Profile** (`(tabs)/profile.tsx` own · `users/[id].tsx` others, both render
  `components/profile-view.tsx`) — a user's avatar/icon, name, "Member since", stats (public lists ·
  friends), and their public lists (`profile.get`). Others' profiles show an **Add friend** button
  (`friends.requestByUser`); your own omits it.
- **Settings** (`(tabs)/settings.tsx`) — account summary (name/email from the session); **theme
  picker** (all six themes, four-swatch preview + check); sign out.
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
- **Share intent** (`expo-share-intent`) — Klect appears in other apps' native share sheets (web
  URLs; the iOS activation rule is `NSExtensionActivationSupportsWebURLWithMaxCount: 1`). `_layout.tsx`
  wraps the app in `ShareIntentProvider`; a `ShareIntentRouter` in the **authenticated** subtree
  routes an incoming URL (`webUrl ?? text`) to the standalone New-bookmark flow (`/bookmarks/new?url=…`),
  so a share received while signed out waits until after login. Requires the custom dev build; config
  lives in `app.json` under the `expo-share-intent` plugin (+ `+native-intent.tsx`, above).

### The shared `BookmarkForm` (`components/bookmark-form.tsx`)

Reusable editor for create + edit. Surfaces a URL with **Autofill** (`metadata.fetch` unfurls
title/description/images **and any detected `video`**, stored as `videoUrl`/`videoType` so the detail
player has data), a **location search** (`LocationInput`), name, description, comma-separated tags,
and a 0–5 star rating. It **merges edited fields over `initial`**, preserving fields it doesn't
surface (notes, coords when free-typed, extra urls, visited) so editing never wipes them. `EMPTY_BOOKMARK`
is the create baseline. An optional `header` slot renders above the form — the standalone flow passes
`<ListPicker>` into it so the picker shares the form's keyboard-aware scroll and single submit button.
`onSubmit(data)` is provided by each screen; throwing from it surfaces the message inline (used to
enforce "pick at least one list"). `autofillOnMount` (guarded to run once) fetches metadata when the
form opens with a shared URL.

- **`LocationInput`** (`components/location-input.tsx`) — Mapbox Search Box autocomplete via web's
  `places.search` / `places.retrieve` procedures (token stays server-side). Debounced suggest
  (≥3 chars, 350 ms) → pick → `retrieve` coordinates, with request-id guarding against stale
  responses and a rotating session token for Mapbox billing. Free typing clears the parent's
  coordinates (text no longer matches the pin); picking a **business** (POI) autofills
  name/description/URL/images **only into empty fields** (and unfurls its website for the same empty
  fields), while location + coordinates always overwrite; a plain address sets location + coordinates
  only.
- **`ListPicker`** (`components/list-picker.tsx`) — standalone-flow multi-list target picker: toggle
  chips for editable lists (OWNER/COLLABORATOR) + inline new-list creation (dismissible "(new)"
  badges, committed on submit/blur).

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
emoji-placeholder error walk), `tag-pill.tsx` (per-tag colored pill, lowercase, no border),
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
  `data-theme` swap, ported). Defaults to **Journal** following system light/dark; an explicit pick is
  persisted to secure-store (`klect.theme`). `useTheme()` exposes `{ theme, setTheme }`.
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

Root `_layout.tsx` wraps the tree in `ShareIntentProvider` → `GestureHandlerRootView` → app
`ThemeProvider` → `@react-navigation/native` theme → `BottomSheetModalProvider`, holds the native
splash until the Journal fonts load, and gates the tree on the auth session (blank / `LoginScreen` /
`Stack` + `ShareIntentRouter`).

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
