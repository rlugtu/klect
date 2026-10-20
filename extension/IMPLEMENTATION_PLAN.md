# Klect Chrome Extension: Implementation Plan

A Manifest V3 Chrome extension as a **third transport** onto the existing Klect backend.
Deliberately **not** feature parity with web or mobile: the whole scope is **lists** —
save the current page into one or more lists, and view the lists and bookmarks you
already have. Everything else Klect does (comments, polls, friends, DMs, chat, Near me,
poll voting, tag management) is explicitly out of scope for this build. Setting a rating
and typing tags *on the page you are saving* came back in on 2026-10-19 (see Stage 2).

This exists because a browser extension is where link-saving actually happens on
desktop. `Klect Launch Audit.md` (vault, 2026-10-14) already lists "a browser extension"
under what neither platform has; this is the first time it has been scoped.

**This file tracks only the extension build.** The root `IMPLEMENTATION_PLAN.md` is the
monetization build's tracker and is still in use until its Stage 8 QA finishes. Do not
merge, cross-reference for status, or delete that file from this build.

## Scope

**In:** save the active tab into existing lists (or new lists created inline), with
server-side metadata autofill and the save form's own notes / rating / tags fields;
read-only browsing of your lists and their bookmarks; free-tier cap awareness; sign-in by
inheriting the browser's existing klect.vercel.app session.

**Out:** any content script; editing or deleting bookmarks; comments, polls, friends,
DMs, list chat, Near me, visited toggles, rating or re-tagging a bookmark you *already*
saved, list reordering, membership management; all six themes (Modern light/dark only for
MVP); an offline write queue; a right-click "Save link to Klect" context menu; Firefox or
Safari ports.

## Architectural constraints these stages must respect

- **No backend work. None.** Every procedure this build needs already exists:
  `lists.mine`, `lists.get`, `bookmarks.forList`, `bookmarks.create`,
  `bookmarks.createInLists`, `metadata.fetch`, `entitlements.status`. If a stage finds
  itself wanting a new tRPC procedure or a schema change, that is a signal the scope
  crept, not that the API is missing something. The one exception is the Stage 1 fallback
  path, and even that is a web *page*, not a new endpoint.
- **A third transport, not a third app with opinions.** The repo is not a monorepo
  (`docs/ARCHITECTURE.md` §2). `extension/` is a new independent top-level app with its
  own `package.json`, build, and release cadence, sharing exactly the two seams web and
  mobile share: the spec (`CLAUDE.md` + `DESIGN.md`) and the typed runtime API. It
  imports web's tRPC `AppRouter` **type-only** — erased at compile time, zero runtime
  coupling — and shares no component code with web or mobile.
- **All network calls originate in the background service worker.** This is the load-
  bearing rule of the whole build. MV3 extension pages (service worker, popup, side
  panel) are exempt from page-level CORS for origins declared in `host_permissions`;
  content scripts are not, and `/api/trpc` has no CORS configuration at all today
  (`web/next.config.ts` sets no headers). So the service worker owns the tRPC client and
  resolves the auth token; the UI talks to it over `chrome.runtime.sendMessage` or a port
  and never calls `fetch` against klect.vercel.app itself. Breaking this rule does not
  fail loudly in dev — it fails as an opaque CORS error that tempts someone into adding
  CORS headers to the server, which this build must not do.
- **Never match on error message text.** A free-tier refusal arrives as
  `error.data.freeLimit` with `code: "FREE_LIMIT"`, flattened by web's tRPC
  `errorFormatter` (`web/src/server/trpc/trpc.ts`). Port the reading logic from
  `mobile/src/client/free-limit.ts`, which is deliberately import-free except for types
  for exactly this kind of secondary surface.
- **Locked lists are never offered as a save target.** `List.lockedAt` non-null means
  frozen by the monetization build's downgrade flow: the server refuses writes into one,
  and the cap count ignores its contents, so offering it would let a free user pile up
  bookmarks the cap never sees. Mobile's `list-picker.tsx` still has this bug (recorded
  under "Known follow-ups" in the monetization plan). The extension must filter
  `lockedAt == null` in its picker from the first commit rather than inherit the gap.
- **No test runner exists in this repo.** Correctness rests on TypeScript, the lint and
  build gates, and manual verification (`docs/DEVELOPMENT.md` §6). Every "Tests" line
  below describes manual verification. Adopting a runner is a separate decision nobody
  should make inside a feature slice — though note that an extension is the first surface
  in this repo with genuinely unit-testable pure logic (cookie-name matching, token
  resolution, cap-message assembly) if that decision ever gets made.
- **Dates arrive as ISO strings.** The router has no superjson transformer, so every
  `Date` in a procedure's return type is a string on the wire despite the type. Parse
  with `new Date(value)` before formatting (`docs/DEVELOPMENT.md` §7).

## Open product decision: popup or side panel

**Ryan decides this before Stage 2 starts.** It changes the UI architecture of Stages 2
and 3, not just a surface, so it cannot be deferred past Stage 1.

- **Popup** (`action.default_popup`): closes on blur, every open is a cold mount, and it
  cannot stay visible while the user keeps browsing. Fine for save-and-dismiss, which is
  the single most common action. It also opens only on a user gesture, which means
  **`activeTab` is sufficient** to read the current tab's URL and title — a much softer
  permission than `tabs` and a materially easier Chrome Web Store review.
- **Side panel** (`chrome.sidePanel`): persists across navigation and tab switches, which
  is the right home for "viewing lists" — the second half of this build's scope. But it
  can be open without a per-tab gesture and has to follow the active tab as the user moves
  around, which **forces the broader `tabs` permission** and a corresponding justification
  at review.

The honest framing: the popup is the better *saving* surface and the side panel is the
better *browsing* surface, and this build contains both jobs. A third option is to ship
both (the popup for save, the side panel for browse) off one shared UI bundle, which is
less work than it sounds since both are just extension pages — but it doubles the surfaces
to polish in Stage 4 and still pays the `tabs` permission cost. Recommendation if Ryan has
no strong preference: **popup only for MVP**, because it keeps permissions minimal for the
first store review and saving is the feature that justifies installing an extension at
all; revisit the side panel as a follow-up once the extension is live and reviewed.

## Stage 1: Auth + CORS spike (throwaway)

**Goal**: Prove, in a real loaded extension against the real deployed backend, that (a)
`chrome.cookies` can read better-auth's `httpOnly` session cookie, (b) its value
authenticates a tRPC call as a Bearer token, and (c) a `fetch` from an MV3 service worker
to `https://klect.vercel.app/api/trpc` is not blocked by CORS. These are the two
unvalidated assumptions the entire rest of the build rests on, so they get validated
first, in throwaway code that is deleted before Stage 2 writes anything real.

The approach under test, stated precisely so a failure is diagnosable:
`chrome.cookies.getAll({ domain: "klect.vercel.app" })`, pick the cookie whose name
**ends with** `session_token`, and send its value verbatim as
`Authorization: Bearer <value>`. The name must be matched by suffix, not hardcoded:
`web/src/lib/auth.ts` overrides neither `advanced.cookiePrefix` nor `useSecureCookies`, so
better-auth 1.6.23's defaults give **`__Secure-better-auth.session_token`** in production
(https baseURL) and **`better-auth.session_token`** in dev on `http://localhost:3000`. This
is the same suffix match `sessionTokenFromCookie` in `mobile/src/client/auth.ts` already
uses. Pass the value through **whole** — do not split on the `.`: better-auth's `bearer()`
plugin treats a dotted value as the signed cookie, percent-decodes it if needed,
HMAC-verifies `<token>.<signature>` against `BETTER_AUTH_SECRET`, and re-injects it as a
request cookie before `auth.api.getSession()` runs. `createContext` resolves the session
through exactly that path, which is why no server change is needed and why mobile's
Google-OAuth fallback (which sends the same signed cookie value) already proves the
server half works.

**Success Criteria**: A minimal unpacked extension with `host_permissions` for
`https://klect.vercel.app/*` and the `cookies` permission, holding nothing but a service
worker, demonstrates all of the following from the worker's console:

1. The session cookie is readable while signed into klect.vercel.app in that browser
   profile, and the resolved name is recorded in the stage notes for both dev and prod.
2. A `fetch` to `https://klect.vercel.app/api/trpc/lists.mine?input=%7B%7D` with the
   Bearer header returns **200** and the caller's real list data — not a CORS failure, not
   a 401. The response having the user's actual lists is the proof; a 200 with an empty
   array could also mean a brand-new account, so test on an account with lists.
3. The same call **without** the header returns **401 UNAUTHORIZED**, matching the
   existing API auth-wiring check in `docs/DEVELOPMENT.md` §6. This rules out the far
   worse outcome of discovering the endpoint is open.
4. A **POST** (a real mutation, not just a GET query) also succeeds, because the CORS
   exemption and the preflight behavior are the thing in doubt and a GET is the easy case.
   Create a throwaway bookmark in a throwaway list and delete it afterward.
5. Signing out on klect.vercel.app makes the cookie disappear and the call start returning
   401, confirming the extension's auth state is genuinely derived from the browser
   session rather than a snapshot.
6. The same flow is confirmed against **dev** (`http://localhost:3000`) too, since every
   subsequent stage is developed against dev and an approach that only works in prod would
   be discovered far too late.

**If any of that fails**, the stage's output is instead a decision between these fallbacks,
in this preference order, recorded in the stage notes with the observed failure:

- **(a) A web-hosted connect page.** A new signed-in page on web (natural home:
  `/settings/extension`, alongside the existing `/settings/share-extension` help page,
  which is the established precedent for a page that exists to support a secondary
  surface) renders the session token and hands it to the extension via
  `externally_connectable` + `chrome.runtime.onMessageExternal`, or as a copy button for
  manual paste. **This needs no new server endpoint**: `auth.api.getSession()` already
  returns the unsigned `session.token`, and the `bearer()` plugin's unsigned branch
  re-signs it with the server secret, so it authenticates like the cookie value does. That
  holds only while `bearer()` stays configured without `requireSignature` (it is today) —
  so if this fallback ships, `web/src/lib/auth.ts` gets a comment saying so, or a future
  "let's tighten bearer auth" change silently breaks the extension.
- **(b) Manual token paste alone**, if `externally_connectable` also proves troublesome.
  Same token source, more friction, and a long-lived credential sitting in
  `chrome.storage.local` with no rotation story — which is precisely why it is the
  fallback and not the plan.
- **(c) `chrome.identity.launchWebAuthFlow`** against better-auth's OAuth flow. Most work
  by a wide margin, and it would need `chrome-extension://<id>/` added to
  `trustedOrigins` in `web/src/lib/auth.ts` — the first actual server change in this
  build. Last resort.

**Tests**: Manual, in a real Chrome profile, in both a signed-in and signed-out state,
against both dev and prod, covering the six checks above. No automated coverage: the thing
being tested is Chrome's own permission and CORS behavior, which is unmockable and is the
entire point of the spike.

**Status**: Complete (2026-10-19)

**Result: the cookie-read approach works end-to-end, no fallback needed.** Validated with
a real throwaway extension loaded unpacked by Ryan, against the real production backend:

- **Cookie name confirmed**: `__Secure-better-auth.session_token` in production, exactly
  as predicted from reading `web/src/lib/auth.ts`'s unoverridden defaults.
- **Check 2 (authenticated GET)**: 200, with real list data — not just "some data," the
  four lists returned were verifiably the real account's own (`QA List 1`-`4`, matching
  data independently known to exist for that account), so this isn't a false positive.
- **Check 3 (unauthenticated GET)**: 401 with the expected `UNAUTHORIZED` /
  "Sign in required" shape — the endpoint is genuinely closed, not open-but-returning-
  something-else-that-looked-like-success.
- **Supplementary batch-shape probe also passed**: 200, same real data, confirming the
  `httpBatchLink` wire format (what Stage 2's real client will actually send, per
  `mobile/src/client/api.ts`'s pattern) works too — not just the simpler non-batched shape.
- Not yet run: the dev/localhost environment check, the POST/mutation check, and the
  sign-out-detection check (all three were explicitly out of scope for this pass, see the
  spike's own scope note). None of the three blocks Stage 2 — the two things that gated
  the whole build (can the cookie be read, does it authenticate) are both proven.

The spike lived at `extension/_stage1-spike/` and has been deleted, per "throwaway by
design" below — its value was the recorded answer, not its code. The answer is now also
in `docs/ARCHITECTURE.md` §5.

**Note**: Throwaway by design. The spike extension is deleted at the end of this stage,
not grown into Stage 2's scaffold — its value is the recorded answer (exact cookie name
per environment, confirmed CORS behavior, confirmed 401 behavior), not its code. The
answer gets written into `docs/ARCHITECTURE.md` §5 alongside the existing mobile Bearer
explanation, because "how does the third transport authenticate" belongs with the other
two and because the iOS cookie landmine documented there is exactly the kind of hard-won
detail that gets re-litigated if it is not written down.

## Stage 2: Scaffold + save the current page

**Goal**: A real `extension/` app that loads unpacked and saves the active tab into one or
more lists. This is the MVP's reason to exist; if the build stopped here it would still be
worth shipping.

Scaffold decisions this stage makes and records:

- **Vite + React 19 + TypeScript + Tailwind v4.** React rather than vanilla or Preact
  because the type-only `AppRouter` import requires TypeScript anyway, the repo is already
  entirely React so there is no new idiom to learn, and bundle size is close to irrelevant
  for a locally-loaded extension page (there is no network cost to a popup). Tailwind v4
  to match both existing apps.
- **Modern light/dark only.** The six-theme system is mirrored data, not shared code
  (`docs/ARCHITECTURE.md` §7, "Design tokens are data"), and mirroring all six into a
  third app for an MVP is cost with no payoff. Mirror the Modern palette, follow the
  system color scheme, and leave a note that reading the user's actual chosen theme (it is
  on the session user as `theme`) is a Stage 4-or-later nicety.
- **Mobile's exact tsconfig trick, reproduced.** `@web/*` → `../web/src/*` for the router
  import, and `@/*` → `["./src/*", "../web/src/*"]` so web's own internal `@/lib/...`
  imports resolve when `tsc` follows the `AppRouter` type into web's server graph, plus a
  `types/server-only.d.ts` stub to satisfy the `import "server-only"` those modules begin
  with. Extension app code **never lives under `src/lib`**, which stays reserved so it
  cannot shadow web's server graph. Skipping any one of these three produces a typecheck
  failure that looks like a broken import rather than a path-resolution problem; mobile
  already paid for this lesson (`docs/ARCHITECTURE.md` §6).
- **Per-environment manifests.** Dev needs `host_permissions` for
  `http://localhost:3000/*`; a published build must not ship a localhost permission, both
  because it is a review flag and because it is a real (if small) attack surface. Generate
  the manifest per environment from one source with the API base URL threaded through as a
  build-time variable, the way mobile threads `EXPO_PUBLIC_API_URL`.
- **Manifest shape**: `manifest_version: 3`; `background.service_worker` with
  `type: "module"`; `permissions: ["cookies", "storage"]` plus either `activeTab` (popup)
  or `tabs` (side panel) per the decision above; `host_permissions` for the API origin;
  no `content_scripts` key at all.

The save flow itself: the worker reads the active tab's `url` and `title` via
`chrome.tabs.query({ active: true, currentWindow: true })`, calls `metadata.fetch(url)`
for autofill, and submits through `bookmarks.createInLists` — the same mutation the iOS
share extension and web's `/bookmarks/new` use, never a new one. Two details that matter:
`metadata.fetch` is a **query that hits paid third-party APIs** (LinkPreview/Microlink plus
Anthropic Haiku comprehension), so it fires once on open and never per keystroke; and it
can be slow, so the picker and the tab title paint immediately and the richer fields fill
in when it resolves, mirroring mobile's `autofillOnMount` behavior. `bookmarkInput` is a
full object, not a partial — all twelve fields are required by the zod schema — so the
extension needs an `EMPTY_BOOKMARK` equivalent to spread over.

**Success Criteria**: `extension/` loads unpacked in Chrome with no manifest or worker
errors. With a signed-in klect.vercel.app session, opening the extension on an arbitrary
web page shows the user's unlocked lists (locked ones filtered out), prefilled with the
page's URL and title and then enriched by `metadata.fetch`. Saving creates the bookmark in
every selected list, and it is visible in web and mobile afterward with the same fields
either of those clients would have produced from the same URL — proving the server did the
metadata work, not the extension. Creating a new list inline works. Signed out, the UI says
so and links to klect.vercel.app rather than failing opaquely. `npx tsc --noEmit` clean in
`extension/`, and the production build produces a loadable unpacked directory. No
`fetch` call to the API exists anywhere outside the service worker — grep for it as part
of verifying the stage, since this is the constraint most likely to be violated by
accident.

**Tests**: Manual. Save from a content-rich page (an article with good OG tags), a
JavaScript-heavy page with sparse metadata, a YouTube video (the video-detection path), a
page already saved, and a `chrome://` page or the New Tab page — the last of these has no
saveable URL and must degrade to a clear message rather than submitting garbage. Confirm
cross-client: save from the extension, see it on web and in the iOS app.

**Status**: Complete (code) — blocked on Ryan's manual Chrome pass for live verification

**Built (2026-10-19), uncommitted and pending review.** The real `extension/` app exists and
every automated gate passes:

- **Scaffold**: Vite 7 + React 19 + TypeScript 5.9 + Tailwind v4, own `package.json`, own
  eslint flat config (typescript-eslint + react-hooks — web's `eslint-config-next` and
  mobile's `eslint-config-expo` presets don't apply to a Vite MV3 build).
- **The tsconfig trick works, verified rather than assumed.** `npx tsc --noEmit` is clean,
  `--listFiles` shows 98 files under `web/src/` in the program (including the generated
  Prisma models) plus web's own `zod`/`better-auth` type graph, and a deliberate negative
  probe errored with the real inferred shapes (the full 13-field `bookmarkInput` object and
  Prisma's `Role` enum) — so the `AppRouter` import genuinely resolves and has not silently
  collapsed to `any`.
- **Manifest generated per environment** from `manifest.config.ts` + a small Vite plugin.
  Prod: `host_permissions: ["https://klect.vercel.app/*"]`. Dev (`npm run build:dev` →
  `dist-dev/`): `["http://localhost:3000/*"]`, name "Klect (dev)". Both carry
  `permissions: ["cookies", "storage", "activeTab"]`, a module service worker, an
  `action.default_popup`, and **no** `content_scripts` and no `side_panel` key.
- **Both builds produce a valid unpacked directory** (`manifest.json` + `popup.html` +
  `assets/background.js` + the popup JS/CSS), with the API base URL substituted into the
  bundle from the same value the manifest's host permission came from.
- **The network-call constraint holds**: `createTRPCClient`/`httpBatchLink` appear only in
  `src/background/api.ts`, there is no `fetch(` anywhere outside `src/background/`, and the
  built popup bundle contains no tRPC runtime and no `/api/trpc` string at all.

Judgment calls worth knowing:

- **Inline new lists go through `createInLists`'s `newListNames`, not a separate
  `lists.create` call.** One mutation means the list cap and the bookmark cap are checked
  against the same moment; two calls could leave an orphan list behind when the second one
  is the one that gets refused. No new procedure, as required.
- **No icons yet.** Chrome falls back to its default action icon, which loads fine — the
  full icon set is Stage 5's submission material.
- **System font stack, not Klect's Newsreader / Work Sans / Geist.** Self-hosting webfonts
  in a popup that should paint in 40ms is cost with no payoff; revisit with the theming
  follow-up.

**Addendum, same day: notes, rating and tags added to the save form.** The first pass
surfaced name and description only. Ryan tested the popup and asked for the other three
fields back in, which reverses this plan's original "ratings / tag management out of
scope" line. A deliberate scope correction, not a miss. All three are inputs now: a
half-step 0–5 star row (`src/popup/RatingInput.tsx`, a DOM port of web's `EditableStars`),
a type-to-add chip list (`src/popup/TagInput.tsx`), and a Notes textarea distinct from
Description. Blank submits as `EMPTY_BOOKMARK`'s `""` / `0` / `[]` and never blocks a save.
Three notes:

- **No tags fetch was needed, and that is verified, not assumed.** `syncBookmarkTags`
  (`web/src/lib/core/bookmarks.ts`) upserts each name against `prisma.tag` on the
  `userId_name` key, so the server matches-or-creates by name and free text is the
  correct input. One fewer network call per popup open.
- **`tagNames` moved out of the invisible `Enrichment` object** and into the visible
  input: `metadata.fetch`'s suggested tags now seed the chip list, guarded by a
  `tagsDirty` ref the same way name and description are, instead of riding along hidden
  and overwriting what the user typed when the spread landed.
- **The save button is now `sticky bottom-0`.** Three more fields push the form past the
  600px Chrome gives a popup, and the button was already at that edge beforehand.

**Still needs Ryan's manual pass** (the Success Criteria and Tests above, none of which is
mockable, plus a rating/tags/notes round-trip to web and mobile): load `dist/` unpacked
against a signed-in prod session and save from a content-rich page, a sparse JS-heavy
page, a YouTube video, an already-saved page, and a `chrome://`/New Tab page; confirm
locked lists are absent from the picker; confirm the
bookmark appears in web and mobile with the fields the server produced; confirm the
signed-out state; and confirm the same against dev on `localhost:3000`.

**Note**: This stage also adds `extension/` to the repo's own documentation, because a
third top-level app invalidates several places that currently say "two": the root
`CLAUDE.md` topology section, `DESIGN.md` §8 and the auth-transport note above its API
contract table, `docs/ARCHITECTURE.md` §2's directory diagram, and `docs/DEVELOPMENT.md`
§6's gates table (which needs an `extension` row). Doing this in the stage that creates
the directory rather than at the end is how the repo avoids the drift its own architecture
doc warns about.

Done, in this pass: root `CLAUDE.md` (product blurb, topology section now "three apps", a
new standing rule that all API calls originate in the service worker, and an explicit note
that `extension/` is **not** in the build-it-for-both-apps parity loop); `DESIGN.md` §8
(heading, topology, type-sharing paragraph, and the auth-transport note above the API
contract table); `docs/ARCHITECTURE.md` (§2 diagram + prose, §5 Auth's three-transport
framing, §9's reading list); `docs/DEVELOPMENT.md` (intro, a new "Extension — loaded
unpacked in Chrome" run/build block with its gotchas, and §6's gates table — five
`extension` rows, including the network-call grep as a gate); and `docs/FEATURES.md`'s
intro, which says out loud that the extension is outside its web-vs-mobile parity
comparison by design. Two places deliberately left alone: a third app has no `CLAUDE.md`
of its own yet (web and mobile each do — worth deciding, but the plan doesn't call for one
before Stage 5's `extension/docs/RELEASE.md`), and the many "both apps" lines in
`DESIGN.md`/`docs/FEATURES.md` that describe web-vs-mobile *feature* parity, which are
still accurate.

## Stage 3: List and bookmark viewing

**Goal**: Read-only browsing inside the extension — the list of your lists, and the
bookmarks inside one — so the extension is a way to *reach* Klect and not only a way to
feed it. Entirely `lists.mine`, `lists.get`, and `bookmarks.forList`; no new procedures,
no mutations.

Ports the **cache-then-refresh** pattern from `mobile/src/client/shared-lists-cache.ts`:
a minimal projection of `lists.mine` (id, name, icon, role, `lockedAt` — not `_count`, not
`memberships`) is written to `chrome.storage.local` on every successful fetch and painted
immediately on the next open, with the network refresh landing behind it. A popup is a
cold mount every single time it opens, which makes this pattern more valuable here than it
is on mobile, not less. Two inherited cautions: treat an absent `lockedAt` in a stale
cached snapshot as *unlocked* (reading a stale cache as locked would empty the picker for
everyone who had one), and cap the cached entry count so a user with hundreds of lists
cannot bloat storage.

Each bookmark gets a link out to the full record on web (`/bookmarks/<id>`), which is the
scope boundary made visible: the extension shows you what you have and hands you to the
real app to do anything with it.

**Success Criteria**: Opening the extension shows every list the user participates in, in
their personal order (the `position` ordering `lists.mine` already returns — do not
re-sort), with a locked list visually distinguished as read-only the way web and mobile
both do rather than hidden or silently absent. Opening a list shows its bookmarks with
name, image, and tags. A second open paints from cache with no visible loading state, then
reconciles. A list the user is a VIEWER on is readable and shows no save affordance. The
save flow from Stage 2 still works unchanged.

**Tests**: Manual, on an account that has: a list with many bookmarks, a list with none, a
list the user only views, a locked list (seed with the monetization build's QA scripts in
`web/scripts/`), and a list containing a bookmark with no image. Confirm the cached paint
by opening twice in a row offline.

**Status**: Not Started

## Stage 4: Entitlement awareness, session lifecycle, and polish

**Goal**: The extension behaves correctly at the edges — a free user at their cap, an
expired or rotated session, a sign-out in another tab, no network — rather than only on the
happy path.

**Cap handling** follows the share extension's precedent, for the same structural reason: a
lightweight surface cannot host a paywall. On a `FREE_LIMIT` refusal the extension states
the limit plainly using the ported `capHitMessage` logic and opens
`https://klect.vercel.app/upgrade` in a tab — a route the monetization build's Stage 7
already shipped. Unlike iOS, there is no store-payment rule forcing anything here; the web
checkout is simply the right destination, and the Chrome Web Store has no payments API to
consider. `entitlements.status` is available for showing remaining capacity proactively,
but the server's refusal stays the enforcement — the UI gating is a courtesy, per the
repo's standing rule.

**Session lifecycle** is where the extension can be *better* than mobile. Mobile caches a
bearer token and self-heals on 401 because a keychain read is its only token source. The
extension's token source is a live local cookie read, so it should **not cache the token
at all** beyond the life of a single request: re-read on every call, which makes a
server-side rotation a non-event. Add a `chrome.cookies.onChanged` listener so a sign-out
on klect.vercel.app flips the extension to its signed-out state immediately instead of on
the next failed request, and keep a 401 → re-read → retry-once path as the backstop,
mirroring the intent of mobile's `clearBearerOnUnauthorized` link.

**Polish**: a success confirmation that does not require reading a toast before the popup
closes; a distinguishable offline state; a non-blank first paint; keyboard access to the
primary save action; a keyboard shortcut via `commands` if the popup path was chosen.

**Success Criteria**: A free account at 3 lists cannot create a fourth from the extension
and gets the specific numeric message rather than a raw error, with the upgrade tab
opening correctly. A free account at 20 bookmarks saving into 3 lists at once gets the
"you'd need N more" framing, because `createInLists` is checked against a total and a
single click can be several over the cap — the exact case `capHitMessage` exists for. A
pro account is never blocked. Signing out in another tab updates the extension without a
reload. A session invalidated server-side produces the signed-out state, not a retry loop.
With the network down, the extension paints its cached lists and reports the failure
plainly.

**Tests**: Manual, against a seeded free account at each cap boundary (under, exactly at,
over) and a comp-access pro account via `web/scripts/seed-comp-access.ts`. Plus: sign out
in another tab mid-session; let a session expire or invalidate it server-side; save with
DevTools offline throttling on.

**Status**: Not Started

## Stage 5: Packaging and Chrome Web Store submission

**Goal**: A reviewed, published listing, plus the release documentation that makes the
second submission cheaper than the first.

**Non-code prerequisites (Ryan's account work, like the monetization build's Stage 2):** a
Chrome Web Store developer account with its one-time **$5** registration fee paid, and a
decision about publisher identity (personal account versus a Klect organization — migrating
a published listing between publishers later is painful, so this is worth getting right
before the first submission rather than after). Nothing in this stage's code is blocked on
it; only the submission is.

**Submission material**: a single-purpose description that genuinely matches what the
extension does (the Web Store's single-purpose policy is enforced, and "saves pages into
your Klect lists" satisfies it cleanly); a **permission justification per permission**,
with `cookies` and the host permission being the two that draw actual reviewer scrutiny —
the honest justification is "reads the user's own existing Klect session cookie on
klect.vercel.app so the extension can call the Klect API as that user, and nothing else";
icons at every required size; screenshots; and a privacy-practices disclosure pointing at
the existing `klect.vercel.app/privacy`.

**Output document**: `extension/docs/RELEASE.md`, in the shape of `mobile/docs/RELEASE.md`
— a checklist of config that must be right before a build, with the gotchas recorded
inline. At minimum it should capture: the production manifest must not contain the
localhost host permission; the API base URL must be the production one; and the extension
is pinned to a specific domain in two independent places (`host_permissions` and the
cookie domain), so **a future custom-domain migration is a breaking extension update
requiring a fresh review**, not a config change. That last one is worth writing down
loudly because it is invisible until it bites.

**Success Criteria**: A production build loads clean as an unpacked extension and passes
the Stage 2 through 4 manual checks against prod (not dev). The packaged zip uploads with
no manifest validation errors. The listing is submitted with every permission justified.
`extension/docs/RELEASE.md` exists and a second person could follow it without asking a
question. Published, or in review with no outstanding reviewer request.

**Tests**: The full manual pass from Stages 2 through 4, re-run against the production
build and the production API, in a clean Chrome profile that has never had the dev
extension loaded — the cookie-read path in particular can pass for the wrong reason in a
profile with stale state.

**Status**: Not Started

**Note**: First-time Web Store review is commonly days, occasionally longer, and an
extension requesting `cookies` plus a broad host permission is more likely to get a
clarification request than a trivial one. Treat the review window as part of the stage,
not as a surprise after it.

## Known follow-ups, not yet scheduled

Recorded so they are not lost. None blocks any stage above.

- **Right-click "Save link to Klect"** via `contextMenus` — saves a link without visiting
  it, which is arguably a better fit for how people actually browse than saving the active
  tab. Deliberately excluded from MVP as scope creep, but it is the single most obvious
  next feature.
- **The side panel**, if Stage 2 shipped popup-only. Revisit once the extension is live.
- **The user's real theme.** The session user already carries `theme`; the extension
  mirrors only Modern. Reading the real value needs the other five palettes mirrored into
  a third app, which is the actual cost here.
- **Edge and Brave** take a Chromium MV3 build essentially as-is and are nearly free
  distribution. **Firefox** is a different story: its MV3 permission and CORS model
  differs enough that the Stage 1 approach needs re-validating, not assuming. Safari would
  be a separate project entirely.
- **Mobile's locked-list picker bug.** The extension filters locked lists from day one;
  `mobile/src/components/list-picker.tsx` and the share extension's hydration cache still
  do not. Already recorded in the monetization plan's follow-ups; noted here because this
  build is where the correct behavior gets written down.

## Decisions locked in (2026-10-19)

Ryan confirmed: go with the plan's own recommendations throughout, and proceed with
whatever doesn't require his direct hands.

1. **Popup, not side panel.** `activeTab`, not `tabs`. Side panel stays a documented
   follow-up, not v1 scope.
2. **Free, not Pro-gated.** No entitlement check gates the extension's save/view flows
   themselves; the server-side cap enforcement already in `core.createList`/
   `core.createBookmark` is the only gate, same as every other client.
3. **No custom domain planned.** `klect.vercel.app` is the pinned domain in both
   `host_permissions` and the cookie lookup, with no migration on the horizon. Revisit
   this file if that changes before Stage 5.
4. **Chrome Web Store account — Ryan's own action, not auto-started.** Creating an
   account and paying the $5 fee requires Ryan directly (account creation is outside what
   gets done on his behalf). Blocks only Stage 5; tracked as an open task, not a blocker
   for Stages 1 through 4.
5. **Fallback order confirmed as written:** connect-page → manual token paste →
   `launchWebAuthFlow`, in that order, if Stage 1's cookie-read spike fails.
6. **`/settings/extension` help page:** decide during Stage 1, contingent on whether the
   connect-page fallback actually ships.
7. **Chrome only for v1,** as assumed. Edge/Brave/Firefox stay follow-ups.

---

Delete this file once every stage is verified complete.
