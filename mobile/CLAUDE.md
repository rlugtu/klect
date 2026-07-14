@AGENTS.md

# Klect — mobile app

Expo (**SDK 54**) / React Native client. It now requires a **custom dev build** (`npx expo
prebuild` → `npx expo run:ios` / `run:android`) because the **share intent** feature adds a native
iOS Share Extension + Android intent-filter (`expo-share-intent`) that **cannot run in Expo Go**.
Everything else still hot-reloads via `npx expo start` against the dev client. It is a **thin
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

## Stack
Expo SDK 54 (RN 0.81, React 19), expo-router (file-based routes in `src/app`; standard `Tabs`),
react-native-reanimated 4 + gesture-handler, `expo-image`, **NativeWind**, `@trpc/client`,
`@better-auth/expo`, **`@gorhom/bottom-sheet`** (tag filter),
**`react-native-reorderable-list`** (drag-to-reorder lists on home; JS-only, builds on reanimated +
gesture-handler), **expo-font + `@expo-google-fonts/*`**
(Newsreader, Work Sans), `@expo/vector-icons` (tab icons), **`expo-blur`** (frosted glass behind
the floating tab bar **and the status bar** — needs a native build to render), `expo-location`,
`expo-secure-store`,
**`expo-share-intent`** (native share extension — share a URL into the app to create a bookmark;
requires the custom dev build noted above), **`expo-video` + `react-native-webview`** (bookmark
detail video player — `expo-video` for direct media files, a WebView-hosted iframe for
YouTube/Vimeo/TikTok/Instagram embeds; both also need the custom dev build).
