# Structuring Saive for a shared web + React Native codebase

> **⚠️ SUPERSEDED.** This proposed a pnpm + Turborepo **monorepo** with shared `packages/*`
> (`db`, `core`, `api`, `validators`, `tokens`, `auth`). We chose a different topology instead:
> **two independent apps in one repo** (`web/`, `mobile/`), **no workspace tooling and no shared
> code packages** — sharing happens only via the root spec (`CLAUDE.md`/`DESIGN.md`) and web's
> runtime tRPC API. Backend logic is single-sourced in `web/`; mobile is a thin API client. See
> the current plan and `DESIGN.md` §9. Kept for historical context and the still-useful
> `core(input)`/`action(formData)` refactor and Expo/Metro notes.

## Context

Saive today is a single Next.js 16 app (server-first: RSC reads + server actions,
no HTTP API). We want to add a React Native (Expo) client so that **the two apps
are independent** (build/deploy/release on their own) **but a feature can be built
for both at the same time** rather than twice.

The tension resolves cleanly: independence comes from keeping the two *apps*
separate and never importing each other; simultaneous feature work comes from
pushing everything platform-agnostic *down* into shared workspace packages, so the
bulk of a feature (schema → business logic → typed API) is written once and only
the UI layer is built per platform.

DESIGN.md §9 already commits to the pieces (shared `lib/`, tRPC boundary,
NativeWind, expo-router). This plan is the **physical project topology** that §9
doesn't specify. Confirmed decisions:
- **One monorepo** (pnpm + Turborepo workspaces), apps deploy independently.
- **Web keeps RSC + server actions**; both web actions and the tRPC router call
  the same `packages/core` functions. Mobile talks to `core` over tRPC/HTTP.
  `core` is the single shared unit; only *transport* differs per platform.

## Target structure

```
saive/                         # one repo, pnpm workspaces + Turborepo
  package.json                 # workspace root: pnpm-workspace.yaml, turbo.json
  apps/
    web/                       # today's Next.js app, moved here ~as-is
    mobile/                    # Expo app (expo-router + NativeWind), added later
  packages/
    db/                        # prisma/schema.prisma + migrations + Prisma client singleton
    core/                      # data access (read queries) + business logic + permissions
    api/                       # tRPC router: thin wrappers over core (mobile's surface)
    tokens/                    # palette / design tokens (single source of truth)
    validators/                # Zod schemas for mutation inputs (shared web action + tRPC)
    auth/                      # better-auth server config (shared); clients live per-app
```

**The sharing boundary (why this answers "build in both at once"):**

| Layer | Where | Written once? |
|---|---|---|
| Data model / migrations | `packages/db` | ✅ once |
| Read queries, permissions, tag/invite logic | `packages/core` | ✅ once |
| Input validation (Zod) | `packages/validators` | ✅ once |
| Typed API surface | `packages/api` (tRPC) | ✅ once |
| Design tokens / palette | `packages/tokens` | ✅ once |
| **UI** | `apps/web` (DOM+Tailwind) / `apps/mobile` (RN+NativeWind) | per-platform |

A feature = one pass through `db → core → validators → api` (shared), then two
thin UI tasks that both consume the same typed `core`/tRPC surface. Roughly the
bottom 60–70% is authored a single time.

**Independence guarantees:**
- Each app has its own `package.json`, build, env, CI/deploy pipeline, release cadence.
- Apps **never import each other** — only `packages/*`.
- Shared packages are **internal workspace packages** (`workspace:*`), *not*
  published — so editing `core` is instantly visible to both apps with no
  version-bump/publish/install step. This is the mechanism that makes parallel
  feature work cheap (vs. the two-repo alternative, which was rejected for exactly
  this friction).

## Web transport model

```
packages/core  ← single source of truth for logic
     |                          |
 apps/web                   apps/mobile
 server actions / RSC       tRPC client (HTTP)
 call core() directly       → packages/api (tRPC) → core()
 (no network hop)
```

Web keeps its server-first advantage: RSC reads call `core` read queries directly;
server actions call `core` mutation functions directly. The tRPC router in
`packages/api` is a thin wrapper over the *same* `core` functions, existing mainly
to give mobile a typed HTTP surface. No logic is duplicated between the action and
the tRPC procedure — both delegate to `core`.

## Migration steps (incremental; app stays shippable throughout)

Do these in order; each is independently reviewable. Web keeps working after every step.

1. **Introduce the workspace shell.** Add `pnpm-workspace.yaml` + `turbo.json` at
   root; move the current app under `apps/web/` unchanged (adjust paths/CI). Verify
   `apps/web` still builds and runs from the monorepo root via Turborepo. No code
   changes to app logic yet.

2. **Extract `packages/db`.** Move `prisma/` and the `src/lib/db.ts` Prisma client
   singleton into `packages/db`; export the client + generated types. Point
   `apps/web` at `@saive/db`. Re-run `npx prisma generate` (Prisma 7 gotcha — regen
   explicitly).

3. **Extract `packages/core` (the key step).** Move the data-access modules
   (`lib/lists.ts`, `bookmarks.ts`, `comments.ts`, `sharing.ts`, `tags.ts`),
   `permissions.ts`, and `lib/types.ts` into `packages/core`. Then **split each
   mutation** in `src/lib/actions/*` into:
   - a pure `core(input)` function in `packages/core` (validate → `assertRole` →
     Prisma write → return result), and
   - a thin `action(formData)` wrapper that stays in `apps/web` (parse FormData →
     call `core` → `revalidatePath`/`redirect`).
   This is the DESIGN.md §9 `core(input)` + `action(formData)` refactor. Web
   behaviour is unchanged; the logic just moved down one layer.

4. **Extract `packages/validators` and `packages/tokens`.** Pull mutation-input Zod
   schemas into `validators` (imported by both the web action wrappers and, later,
   tRPC). Extract the palette into `tokens.ts` as the single source of truth;
   `globals.css` reads from it now, NativeWind reads from it later.

5. **Add `packages/api` (tRPC).** Build a tRPC router whose procedures are thin
   wrappers over `packages/core`, reusing `packages/validators` for input schemas
   and `packages/core/permissions` for auth. Mount it in `apps/web` as a route
   handler (alongside the existing better-auth handler) so mobile has an endpoint.
   Web keeps using RSC/actions — tRPC is additive, not a web rewrite.

6. **Extract `packages/auth`.** Move the better-auth *server* config into
   `packages/auth`; `apps/web` uses `better-auth/react`, `apps/mobile` will use
   `@better-auth/expo` — same server, different client.

7. **Scaffold `apps/mobile` (Expo).** expo-router + NativeWind (fed the same
   `packages/tokens` palette) + `expo-image` + Moti/Reanimated. Wire a tRPC client
   pointed at `packages/api`, and `@better-auth/expo` at `packages/auth`. Build the
   first screen against an already-shared feature to prove the loop end-to-end.

## Per-feature workflow after the split (the payoff)

For any new feature going forward:
1. Schema change (if any) → `packages/db` + migration.
2. Business logic → `packages/core` as `core(input)`.
3. Input schema → `packages/validators`.
4. Expose → add a tRPC procedure in `packages/api` (wraps `core`).
5. **Web UI** → `apps/web` server action wrapper + RSC/components.
6. **Mobile UI** → `apps/mobile` screen consuming the tRPC procedure.

Steps 1–4 are done once and immediately serve both apps; only 5 and 6 are
per-platform, and both sit on the identical typed surface — so the two clients
can't silently drift.

## Tooling notes / gotchas

- **pnpm + Turborepo** is the standard web+Expo monorepo stack; Expo has
  first-party monorepo docs. **Metro** needs monorepo config (`watchFolders` for
  the repo root + symlinked `node_modules` resolution) or the mobile app won't
  resolve `packages/*` — budget time for this; it's the usual friction point.
- Keep `packages/*` as **internal** `workspace:*` deps (never published) so shared
  edits need no publish/version step.
- `packages/core` and `packages/db` stay **free of React/DOM** so both a Next
  server runtime and a tRPC server can import them.

## Verification

- After **each** migration step: `pnpm --filter web build` and `pnpm --filter web lint`
  stay green, and the web app runs under Turborepo with no behaviour change.
  Exercise a mutation (create/edit a bookmark) to confirm the `core`/`action` split
  preserved behaviour.
- After step 5: hit a tRPC procedure directly and confirm it returns the same
  result as the equivalent web action path — proving both transports share one `core`.
- After step 7: run `apps/mobile` in Expo Go / simulator, sign in via
  `@better-auth/expo`, and load one screen through tRPC end-to-end.
- Whole-repo gate before any commit: `turbo run build lint` across all packages.

## Rejected alternatives

- **Two separate repos** — gives isolation but every shared change needs publish +
  reinstall in both, which fights the "build in both at once" goal.
- **Migrating web fully onto tRPC** — throws away server-first RSC for a
  network/serialization hop the web doesn't need. Web shares via `core`, not tRPC.
