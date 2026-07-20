@AGENTS.md

# Klect — mobile app

Expo (**SDK 54**) / React Native client. It now requires a **custom dev build** (`npx expo
prebuild` → `npx expo run:ios` / `run:android`) because the **share extension** feature adds a native
iOS Share Extension (`expo-share-extension`) — which renders a React save UI inside the share sheet —
that **cannot run in Expo Go**. Everything else still hot-reloads via `npx expo start` against the
dev client. It is a **thin
client** of the web app's tRPC API — it owns
no database, no auth server, and no business logic. Product, data model, permissions, and the API
contract are the shared source of truth in `../DESIGN.md` and `../CLAUDE.md`; this file covers
mobile-specific implementation only.

**Docs:** `docs/ARCHITECTURE.md` (structure, navigation, screens + feature set) · `docs/design.md`
(the "Journal" theme visual design + mockups).

## How it talks to the backend
- **Data**: web's tRPC API at `/api/trpc` (see `../DESIGN.md` "API contract"). The typed client is
  `src/client/api.ts`, which imports web's `AppRouter` **type only** — erased at compile time, so
  there is no runtime coupling to web. `EXPO_PUBLIC_API_URL` sets the web base URL.
- **Auth**: `@better-auth/expo` against the same better-auth server web hosts (web uses
  `better-auth/react`). Tokens live in `expo-secure-store`. The tRPC client authenticates with
  `Authorization: Bearer <sessionToken>` (server runs better-auth's `bearer()` plugin), resolved by
  `resolveBearerToken()` in `src/client/auth.ts` — **not** the session cookie, which iOS release
  builds swallow (`Secure` Set-Cookie is intercepted by native networking before the client can
  store it, so it only breaks in TestFlight/store builds, not dev). Two capture paths, both required:
  email/password → the `set-auth-token` response header; Google OAuth → parsed from the stored
  cookie (`getCookie()`). **Don't revert to a `Cookie` header.** Full rationale: `docs/ARCHITECTURE.md` Auth.
- **Realtime (DMs)**: `src/client/realtime.ts` uses **`@supabase/supabase-js`** to subscribe to
  Supabase Realtime broadcast channels (`dm:user:<id>` / `dm:conv:<id>`) purely as a "refetch now"
  signal — no message content on the socket; actual DM data comes over the `dms.*` tRPC procedures.
  Env: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`; **degrades to focus/interval
  polling** when unset. DM UI: an in-screen Friends|DMs segmented switch on `(tabs)/friends.tsx`
  (`components/dms/dm-inbox.tsx`) + pushed thread screens `src/app/dm/[conversationId].tsx` &
  `src/app/dm/new.tsx`.
- Never add business logic or direct DB access here — new backend work lands once in `web/` (see the
  per-feature workflow in `../CLAUDE.md`), then you build the screen consuming the procedure.

## Design & theming
**Mobile design source of truth: `docs/design.md`** (the "Journal" redesign + mockups). Theming lives
in `src/theme/` — `tokens.ts` (`THEME_TOKENS`, per-family skin) + `theme-provider.tsx` (applies a
theme's tokens as CSS vars via NativeWind `vars()`; persisted to secure-store). **Six themes across
three families** — **Modern** (the default), **Journal** (warm scrapbook), Pixel — each light + dark;
only palette/skin/font differ, the screen *structure* is shared. Style with the semantic classes
(`bg-bg`/`text-ink`/`bg-primary`/`border-skin`/`rounded-skin`) + fonts (`font-serif` = Newsreader,
`font-sans[-medium|-semibold]` = Work Sans). Photo-forward cards use `components/photo-card.tsx` +
`theme/shadows.ts`; tag pills use `components/tag-pill.tsx`.

**Action feedback = toasts.** Call `toast.success/error/info(...)` from `@/client/toast` inside a
screen's `try/catch` mutation handler (imperative singleton — there's no React Query layer to hook);
the global `<ToastHost />` mounted in `_layout.tsx` renders them (3s countdown bar, press-hold to
pause, swipe-up to dismiss, haptics). Mirrors web's `toast` API.

## Stack
Expo SDK 54 (RN 0.81, React 19), expo-router (file-based routes in `src/app`; the `(tabs)` group is a
bottom-positioned **swipeable** `@react-navigation/material-top-tabs` pager on
**`react-native-pager-view`**, wired via `withLayoutContext`),
react-native-reanimated 4 + gesture-handler, **`expo-haptics`** (tab-press feedback), `expo-image`,
**NativeWind**, `@trpc/client`,
`@better-auth/expo`, **`@gorhom/bottom-sheet`** (tag filter + Near me results drawer),
**`react-native-reorderable-list`** (drag-to-reorder lists on home; JS-only, builds on reanimated +
gesture-handler), **expo-font + `@expo-google-fonts/*`**
(Newsreader, Work Sans), `@expo/vector-icons` (tab icons — outline/filled pairs crossfaded by swipe
position in the custom tab bar, plus a red attention badge on the Friends tab from
`client/notifications.tsx`), **`expo-blur`** (frosted glass behind
the floating tab bar **and the status bar** — needs a native build to render; the pushed-screen
header + status bar mask it with **`expo-linear-gradient` + `@react-native-masked-view/masked-view`**
so the blur fades out gradually with no hard line), `expo-location`,
**`@rnmapbox/maps`** (the Near me screen's full-screen Mapbox map + numbered pins; needs a public
`EXPO_PUBLIC_MAPBOX_TOKEN` at runtime and a secret `MAPBOX_DOWNLOAD_TOKEN` injected by `app.config.js`
at build time — both in `.env` for dev, see `.env.example`; requires the custom dev build. For
**release builds** the public `EXPO_PUBLIC_MAPBOX_TOKEN` is stored as an **EAS environment variable**
(`production` env; `eas build` pulls it) rather than committed to `eas.json` — GitHub push protection
rejects Mapbox tokens. The untracked `.env` isn't in the EAS build, so if the token is missing from
EAS the map ships blank; the secret download token stays in local `.env`, supplied at build),
`expo-secure-store`,
**`expo-share-extension`** (native iOS share extension — reuses `BookmarkForm` to save a shared URL
as a bookmark *inside the share sheet*, authenticating via a shared-keychain bearer token; entry is
`index.share.js` → `src/share-extension.tsx`; requires the custom dev build noted above),
**`expo-video` + `react-native-webview`** (bookmark
detail video player — `expo-video` for direct media files, a WebView-hosted iframe for
YouTube/Vimeo/TikTok/Instagram embeds; both also need the custom dev build).
