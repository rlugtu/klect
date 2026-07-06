@AGENTS.md

# Saive — mobile app

Expo (SDK 57) / React Native client. It is a **thin client** of the web app's tRPC API — it owns
no database, no auth server, and no business logic. Product, data model, permissions, and the API
contract are the shared source of truth in `../DESIGN.md` and `../CLAUDE.md`; this file covers
mobile-specific implementation only.

## How it talks to the backend
- **Data**: web's tRPC API at `/api/trpc` (see `../DESIGN.md` "API contract"). The typed client is
  `src/client/api.ts`, which imports web's `AppRouter` **type only** — erased at compile time, so
  there is no runtime coupling to web. `EXPO_PUBLIC_API_URL` sets the web base URL.
- **Auth**: `@better-auth/expo` against the same better-auth server web hosts (web uses
  `better-auth/react`). Tokens live in `expo-secure-store`.
- Never add business logic or direct DB access here — new backend work lands once in `web/` (see the
  per-feature workflow in `../CLAUDE.md`), then you build the screen consuming the procedure.

## Design & theming
**Mobile design source of truth: `docs/design.md`** (the "Journal" redesign + mockups). Theming lives
in `src/theme/` — `tokens.ts` (`THEME_TOKENS`, per-family skin) + `theme-provider.tsx` (applies a
theme's tokens as CSS vars via NativeWind `vars()`; persisted to secure-store). **Six themes across
three families** — **Journal** (warm scrapbook; the default), Pixel, Modern — each light + dark;
only palette/skin/font differ, the screen *structure* is shared. Style with the semantic classes
(`bg-bg`/`text-ink`/`bg-primary`/`border-skin`/`rounded-skin`) + fonts (`font-serif` = Newsreader,
`font-sans[-medium|-semibold]` = Work Sans). Photo-forward cards use `components/photo-card.tsx` +
`theme/shadows.ts`; tag pills use `components/tag-pill.tsx`.

## Stack
Expo SDK 57, expo-router (file-based routes in `src/app`), React 19, react-native-reanimated +
gesture-handler, `expo-image`, **NativeWind**, `@trpc/client`, `@better-auth/expo`,
**`@gorhom/bottom-sheet`** (tag filter), **expo-font + `@expo-google-fonts/*`** (Newsreader, Work
Sans), `expo-location`, `expo-secure-store`.
