@AGENTS.md

# Saive — mobile app

Expo (SDK 57) / React Native client. It is a **thin client** of the web app's tRPC API — it owns
no database, no auth server, and no business logic. Product, data model, permissions, and the API
contract are the shared source of truth in `../DESIGN.md` and `../CLAUDE.md`; this file covers
mobile-specific implementation only.

## How it talks to the backend
- **Data**: web's tRPC API at `/api/trpc` (see `../DESIGN.md` "API contract"). The typed client is
  `src/lib/api.ts`, which imports web's `AppRouter` **type only** — erased at compile time, so there
  is no runtime coupling to web. `EXPO_PUBLIC_API_URL` sets the web base URL.
- **Auth**: `@better-auth/expo` against the same better-auth server web hosts (web uses
  `better-auth/react`). Tokens live in `expo-secure-store`.
- Never add business logic or direct DB access here — new backend work lands once in `web/` (see the
  per-feature workflow in `../CLAUDE.md`), then you build the screen consuming the procedure.

## Stack
Expo SDK 57, expo-router (file-based routes in `src/app`), React 19, react-native-reanimated +
gesture-handler, `expo-image`. `@trpc/client` + `@tanstack/react-query`.
