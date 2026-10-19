# Klect Monetization: Implementation Plan

Freemium build. Free tier is capped at **3 owned lists** and **20 bookmarks** across
those owned lists; paid tier ("pro") is unlimited. Billing runs through RevenueCat
(App Store IAP on iOS, RevenueCat Web Billing / Stripe on web) at **$1.99/month or
$19.99/year**, with **no free trial**. When a paying subscriber lapses while over
either cap, nothing is deleted: the user picks which lists and bookmarks stay active
and the rest are locked (preserved, read-only) until they re-subscribe or trim down.

Collaboration is never gated. Joining, viewing, or editing someone else's list, plus
comments, DMs, group chat, polls, friends, and Near me, stay free regardless of count.
Only the capacity to *own* lists and bookmarks is capped.

Full product rationale (competitor pricing research, why RevenueCat, why capacity caps
instead of a rate cap) lives in the vault at `10 - Klect/Klect Monetization Plan.md`.
That document is the source of truth for the decisions; this file tracks the build.

## Architectural constraints these stages must respect

- **One brain, two transports.** Every mutation stays a pure `core(userId, input)`
  function in `web/src/lib/core/*`. The `"use server"` action wrapper and the tRPC
  procedure both call the same `core()`, so web and mobile can never drift on business
  logic. Cap enforcement therefore goes in `core()`, never in a UI component or a
  route handler.
- **Server-side re-check, always.** Every mutation re-verifies authorization
  server-side regardless of what the UI already gated. A paywall screen that hides the
  "new list" button is a courtesy; `core.createList` refusing the write is the rule.
- **Swappable purchase initiation.** Which SDK kicks off checkout (native StoreKit vs.
  an external Stripe link) must stay a detail behind the entitlement check, so a change
  in Apple's external-payment rules never forces touching `core()` or the schema.
- **No test runner exists in this repo.** Correctness rests on TypeScript, the build and
  lint gates, and manual verification (`docs/DEVELOPMENT.md` section 6). Each stage's
  "Tests" line below therefore describes manual verification unless a runner is adopted
  first, which is a separate decision nobody should make inside a feature slice.
- **Prisma 7 gotcha.** `migrate dev` does not reliably regenerate the client. Always run
  `npx prisma generate` after a schema change, then restart the dev server.

## Stage 1: Schema + entitlement helper

**Goal**: An `Entitlement` Prisma model (one row per user, synced from RevenueCat in
Stage 5), `lockedAt` lock-state fields on `List` and `Bookmark`, and a new
`web/src/lib/core/entitlements.ts` exposing the free-tier constants, `getEntitlement`,
`isPro`, `assertCanCreateList`, and `assertCanCreateBookmark`. Local database reads
only, no RevenueCat API calls (that is Stage 5). The new guards are written and correct
but deliberately left uncalled: wiring them into the mutations is Stage 3.

**Success Criteria**: Migration applied to the dev database and the Prisma client
regenerated. `npx tsc --noEmit` and `npm run lint` both clean in `web/`. `isPro` returns
true only for an entitlement row with `status: "active"` and an `expiresAt` that is null
or in the future. The cap counts exclude locked rows, so a locked item never consumes
quota. No existing behavior changes, because nothing calls the new guards yet.

**Tests**: No test runner exists (see constraints above), so verification is the type
checker, the lint gate, and manual inspection of the generated migration SQL. The
helpers are written as thin, single-responsibility functions over Prisma counts so they
drop straight into a runner if one is adopted later.

**Status**: Complete

## Stage 2: RevenueCat project setup (non-code, Ryan's account work)

**Goal**: A configured RevenueCat project: App Store Connect connected for iOS IAP,
Stripe connected for Web Billing, one entitlement named `klect_pro`, and the monthly and
annual products created at $1.99 and $19.99 with no trial period. Produces the API keys
and the webhook signing secret that Stages 5, 6, and 7 need. iOS and web only: Google
Play / Android is explicitly out of scope for this stage.

**Success Criteria**: The `klect_pro` entitlement exists and is attached to both products
on both stores. Sandbox purchase is possible on iOS and in Stripe test mode. Keys are
stored in a password manager and referenced by item name, never pasted into a doc, a
note, or a commit.

**Tests**: Not applicable. This is account configuration, not code. Verified by a
sandbox purchase in Stage 8.

**Status**: In Progress — iOS/App Store Connect done; Stripe/Web Billing connection
scheduled for 2026-10-18; Google Play dropped, not pursued.

**iOS half (done)**: The "Klect iOS" app is connected in RevenueCat against bundle id
`com.klect.app`, an In-App Purchase key is uploaded, and RevenueCat confirmed the app was
created successfully.

**Stripe / Web Billing (scheduled, not blocked)**: Ryan clicks "Connect Stripe" in the
RevenueCat dashboard himself on Sunday, 2026-10-18. This is a calendared step, not an
open blocker and not a forgotten one.

**Google Play / Android (dropped)**: No Google Play service account, no Android app in
RevenueCat, no Android configuration of any kind. Klect is iOS-only for now, consistent
with the existing "Android is not currently prioritized" decision. Do not pursue it here.

**Note**: Non-code stage. No engineering delegation. Stages 5, 6, and 7 are blocked on
the keys this produces, though Stage 3 is not.

## Stage 3: Enforce the caps server-side

**Goal**: Wire the Stage 1 guards into `core.createList`, `core.createBookmark`, and
`core.createBookmarkInLists`, so the Next.js server action and the tRPC procedure both
enforce identically on web and mobile with no duplicated logic. Also refuse mutations
that target a locked list or bookmark (edit, invite, comment, and so on): locked means
read, export, and delete only, not writable.

**Success Criteria**: A free user at 3 owned lists cannot create a fourth through either
transport. A free user at 20 bookmarks cannot create a 21st, including through the
multi-list create path, which must be checked against the *total* it would add rather
than one list at a time. A pro user is never blocked. The thrown error is specific
enough for the paywall stages to branch on without matching strings against a message.

**Tests**: Manual verification on both web and mobile against a seeded free account at
each boundary (under, exactly at, and over the cap), plus a pro account. Add unit tests
here if a runner has been adopted by this point.

**Status**: Complete

**Note**: Locked-item enforcement landed only in `core/lists.ts` (`updateList`) and
`core/bookmarks.ts` (`updateBookmark`), since nothing can be locked until Stage 4
ships the flow that sets `lockedAt`; the full
audit of every remaining mutation path (invites, comments, polls, chat, tags,
visibility, and writes into a locked list) is a deferred follow-up on Stage 4.

**Follow-up fixes (applied after the stage first landed)**: `deleteList` and
`deleteBookmark` no longer refuse a locked target, because deleting your own content is
the only trim-down path an over-cap user has until the Stage 4 selection screen ships, so
locked now means "cannot add to or modify", never "cannot remove". `duplicateList` had no
cap enforcement at all and now calls `assertCanCreateList(userId, 1)` plus
`assertCanCreateBookmark(userId, source.bookmarks.length)` before any write, so a free
user can no longer clear both caps in one duplicate.

## Stage 4: Downgrade-selection flow

**Goal**: When an account is flagged as over-cap after a lapse, prompt the user on
whichever platform they next open and let them pick which 3 lists, then which 20
bookmarks within those lists, stay active. Everything unselected gets `lockedAt` set.
Needs core commit functions (`core.selectActiveLists` / `core.selectActiveBookmarks`,
re-validated server-side against the real caps like every other mutation) plus a
dedicated screen on both web and mobile.

**Success Criteria**: Locked rows are preserved in the database, excluded from normal
queries or surfaced in a distinct read-only state, and never deleted. Locks clear
automatically when the user re-subscribes or trims below the cap themselves. The
selection commit is re-validated server-side, so a tampered client cannot keep 10 lists.

**Tests**: Manual end-to-end on both platforms: exceed the caps, force a lapse, confirm
the prompt appears, confirm the commit rejects an over-cap selection, confirm locked
data survives and reappears intact on re-subscribe.

**Status**: Complete

**Backend half (done)**: `web/src/lib/core/active-selection.ts` exposes
`getSelectionStatus(userId)` (the shared read behind both the selection screen and the
Stage 6/7 paywalls), `selectActiveLists(userId, listIds)`, `selectActiveBookmarks(userId,
bookmarkIds)`, and `clearLocks(userId)`. Both commits re-validate the caps and ownership
server-side and are a no-op for pro users. Bookmark selection is hard-constrained to
bookmarks inside the user's own *unlocked* lists, so the list step must run first; an id
from a locked list is rejected rather than silently skipped. Exposed over tRPC as the
`entitlements` router (`status`, `selectActiveLists`, `selectActiveBookmarks`), registered
in `web/src/server/trpc/router.ts`. `npx tsc --noEmit` and `npm run lint` clean in `web/`.

**Lock-clear-on-resubscribe contract (decided here, Stage 5 builds to it)**: locks are
**physically cleared**, not treated as dormant. The Stage 5 webhook must call
`clearLocks(userId)` from `@/lib/core/active-selection` on any transition into an active
entitlement; it nulls `lockedAt` on every list and bookmark the user owns and is
idempotent. `getSelectionStatus` additionally self-heals stale locks on a pro account,
covering a missed or out-of-order webhook. Chosen so `lockedAt` is self-describing in
every read path (non-null means locked, no entitlement lookup needed) and so a second
lapse never snaps an old, unchosen set of rows back to locked.

**UI half (done)**: the selection screen landed on both platforms, built against the
tRPC contract above.

- **Web**: `web/src/app/downgrade/page.tsx` plus
  `web/src/components/entitlements/DowngradeSelection.tsx`. It is gated by a check added
  to the home page's existing data fetch, which redirects to `/downgrade` when
  `needsSelection` is true. Deliberately *not* added to the shared `requireOnboardedUser`
  guard, since that would cost an extra read on every page for a state that is rare.
- **Mobile**: `mobile/src/components/downgrade-screen.tsx`, built as a gate component
  rather than a route. It renders before the navigator mounts, the same tier as the
  existing `LoginScreen` / `OnboardingScreen` gates, so this stage's "a dedicated screen
  on both web and mobile" is satisfied as a gate, not as a URL.

### Locked-state surfacing (completed as part of this wave)

Both platforms now visually distinguish a locked list or bookmark from an active one: a
"Locked" badge matching each platform's existing role-badge pattern, and write
affordances that are visibly disabled rather than present-but-silently-refused. This was
a real gap against this stage's own success criteria ("excluded from normal queries or
surfaced in a distinct read-only state") that the original UI build did not close. It is
closed now.

## Stage 5: Webhook ingestion

**Goal**: A route handler receiving RevenueCat subscription lifecycle events. Validates
the signature, upserts the `Entitlement` row idempotently keyed by event ID, and stops
there. A downgrade or expiration that leaves the user over either cap sets no extra
flag: "not pro, over the cap, nothing locked yet" is itself the condition the Stage 4
selection flow reads, so a separate column would give one fact two homes that can
disagree.

**Success Criteria**: Replaying the same event twice produces no duplicate side effects.
An unsigned or badly signed request is rejected. Initial purchase, renewal, cancellation,
expiration, billing issue, and grace period all map to the right `status` value. A
lapse that leaves the user under the caps locks nothing and prompts nothing.

**Tests**: Manual verification using RevenueCat's webhook test sender plus replayed
captured payloads, checking the resulting `Entitlement` row. Blocked on Stage 2: there
is no project to send from and no secret to sign with, so none of it has run yet.

**Status**: Complete (code) - blocked on Stage 2 for live verification

The signature check, the event mapping, and the upsert are real working code, not
stubs. `npx tsc --noEmit` and `npm run lint` are both clean in `web/`. What has *not*
happened is any live traffic: no RevenueCat project exists, so `REVENUECAT_WEBHOOK_SECRET`
is blank and this endpoint has never received an actual webhook. The handler fails closed
while the secret is blank (it rejects every delivery rather than trusting it), so flipping
the stage on is purely a matter of setting that one env var once Stage 2 lands. Nothing in
the code needs to change.

Shipped in this stage:

- `web/src/app/api/webhooks/revenuecat/route.ts` - HTTP only: raw body, authentication,
  status codes.
- `web/src/lib/core/revenuecat.ts` - the brain: payload schema, event-type mapping, the
  supersede rule, the dedupe cache, and the `Entitlement` upsert.
- `REVENUECAT_WEBHOOK_SECRET` added to `web/.env.example` as an empty placeholder.

Three things a later stage has to honour:

1. **`app_user_id` is resolved directly as Klect's `User.id`.** Stages 6 and 7 must
   identify the user to RevenueCat with our internal id (`Purchases.logIn(user.id)` and
   the Web Billing equivalent) rather than letting it mint an anonymous id. If they do
   not, every event lands on an unknown user, which the handler logs at error level
   instead of writing a row for a stranger.
2. **Authentication covers both RevenueCat mechanisms** against the same env var: HMAC
   signing via `X-RevenueCat-Webhook-Signature`, or a fixed `Authorization` header value.
   Whichever gets enabled in Stage 2 works unchanged.
3. **Dedupe is two layers, and only one is durable.** A per-process cache of event ids
   short-circuits retries on a warm instance; underneath it, an event is dropped whenever
   it describes an older state than the row already holds (the stored `expiresAt` doubles
   as a version number, since a period end only moves forward). That makes replay and
   out-of-order delivery safe across instances without a schema change, which this stage
   deliberately avoided. The fully durable version, a `processedEventId` column or a small
   `WebhookEvent` table, is a worthwhile follow-up whenever the schema is next touched.

TRANSFER events are deliberately unhandled (logged, 200). They move an entitlement
between app user ids and carry `transferred_from` / `transferred_to` instead of a single
`app_user_id`, so treating one as a normal upsert would write the row onto the wrong user.
It needs its own handling if account merging ever ships.

## Stage 6: Mobile paywall

**Goal**: RevenueCat's Expo SDK (`react-native-purchases` and `react-native-purchases-ui`)
wired into a paywall screen shown when a free user hits a cap. No new build
infrastructure needed: the app already requires a custom EAS build for
`expo-share-extension`, `expo-video`, and `react-native-webview`.

**Success Criteria**: Hitting a cap opens the paywall instead of surfacing a raw error.
A sandbox purchase completes and the entitlement propagates to the server through the
Stage 5 webhook. Restore purchases works. Dismissing the paywall leaves the app in a
sane state. Nothing in the auth transport is touched (see `docs/ARCHITECTURE.md`
section 5: iOS uses Bearer tokens, not cookies, deliberately).

**Tests**: Manual sandbox purchase on a real device plus the simulator, covering buy,
restore, and cancel.

**Status**: Complete

**How it was built**: on `react-native-purchases` and `react-native-purchases-ui`, but
with Klect's own themed paywall UI rather than `RevenueCatUI.Paywall`. That is a
deliberate choice, not an oversight: no dashboard-configured paywall or offering exists
yet (Stage 2 is only half done), and a dashboard-rendered paywall would ignore the app's
six themes. Revisit once Stage 2 fully lands. `Purchases.logIn(user.id)` is wired in
`EntitlementsProvider`, which satisfies Stage 5's requirement that RevenueCat sees
Klect's own `User.id` rather than an anonymous one.

**Share extension**: it shows a plain message plus an "Open Klect to upgrade" nudge
instead of attempting a paywall, which is correct: the extension structurally cannot host
one.

**iOS-only for now**: No Android-specific paywall or IAP path, and no Android RevenueCat
API key. Android is not a current priority (same decision as Stage 2), so a single iOS
key and a single purchase path is the whole surface here.

**Custom URL Scheme (resolved: not needed)**: RevenueCat auto-generated the Custom URL
Scheme `rc-b900889b66` for the iOS app when it was created. Confirmed against
RevenueCat's actual documentation that the scheme is used only for paywall-preview
tooling and for Web Billing redemption links, neither of which applies here, so it was
not registered. `mobile/app.json`'s scheme stays `"klect"`.

## Stage 7: Web paywall

**Goal**: The RevenueCat Web Billing / Stripe Checkout equivalent on web, triggered by
the same cap condition as mobile, reusing the same entitlement check.

**Success Criteria**: Hitting a cap routes to checkout instead of surfacing a raw error.
A Stripe test-mode purchase completes and the entitlement propagates through the same
Stage 5 webhook path as iOS. A user who bought on iOS is already pro on web with no
second purchase, and the reverse.

**Tests**: Manual Stripe test-mode purchase, plus a cross-platform check that one
purchase unlocks both surfaces.

**Status**: Complete

**Shipped in this stage**: the new routes `/upgrade`, `/upgrade/success`, and
`/api/checkout`. Identification to RevenueCat goes through Klect's own `User.id`,
resolved server-side only and never accepted from the client, matching Stage 5's first
requirement. With a blank key the flow degrades to a visibly disabled state rather than a
button that looks live and fails. The `duplicateList` action-wrapper gap, found while
building this stage, is fixed too (see Stage 3's follow-up fixes).

**Note**: Live Stripe test-mode purchase verification is blocked until the 2026-10-18
Stripe / Web Billing connection in Stage 2. The code itself (checkout flow, entitlement
check, paywall UI) is not blocked and should still be built now against a placeholder
key, the same pattern every other stage has used.

## Known follow-ups, not yet scheduled

Recorded here so they are not lost. None of these is resolved, and none of them blocks
Stage 8.

- **The locked-item mutation audit first flagged under Stage 3 has grown.** Server-side
  refusal of writes against a locked list or bookmark still covers only `updateList` and
  `updateBookmark`. Paths that do not enforce it yet: invites, comments, polls, chat,
  tags, the visibility toggle, `setRating`, and `toggleVisited`. Mobile's UI now disables
  `setRating` and `toggleVisited` client-side as a precaution, but the server does not
  enforce either one. Also unenforced: adding a friend to a locked list
  (`addFriendToLists`).
- **Two destination pickers still offer a locked list as a save target.** Web's
  `/bookmarks/new` and the DM share-save picker already exclude locked lists. Mobile's
  `list-picker.tsx` and the share extension's hydration cache do not, so taking that path
  today routes the user to the paywall for the wrong reason instead of telling them the
  list is locked.

These are explicitly deferred, not forgotten: flagged for a future pass at Ryan's
discretion.

## Stage 8: QA

**Goal**: Full-system verification across both stores before launch.

**Success Criteria**: Sandbox purchases succeed on App Store sandbox and Stripe test
mode. Entitlement syncs in both directions. The downgrade-selection flow works
end to end: subscribe, exceed the caps, cancel and lapse, confirm the selection prompt
appears and enforces the real limits, confirm locked data is preserved and inaccessible
rather than deleted, and confirm re-subscribing clears the locks with no data loss.

**Tests**: The scripted manual pass described above, run on web and iOS, split into the
two passes below. Stages 3 through 7 all exist, so there is a complete path to exercise;
what gates each pass is credentials, not code.

**Status**: Pass 1 Not Started (startable now) - Pass 2 blocked until 2026-10-18

**Pass 1, iOS sandbox (startable now)**: App Store Connect is already live in RevenueCat
(Stage 2's iOS half), so the client side can be tested today on a real device or the
simulator with an EAS dev build: the native purchase sheet opens from a cap, a sandbox
purchase completes, restore purchases returns the entitlement, and cancelling leaves the
app in a sane state. One honest limitation: the RevenueCat webhook signing secret still
does not exist. It is a separate project-level RevenueCat setting, independent of the App
Store Connect link, and the Stage 5 handler fails closed while it is blank. So this pass
verifies the client-side purchase and restore *experience* but cannot yet verify that a
real purchase propagates into Klect's own `Entitlement` row through the Stage 5 webhook.
That half waits on the secret being configured.

**Pass 2, Stripe and cross-platform (blocked until 2026-10-18)**: runs after Ryan
connects Stripe in the RevenueCat dashboard that Sunday. Covers a Stripe test-mode
purchase on web, web entitlement propagation through the same Stage 5 webhook path, and
the cross-platform check that a purchase on one surface (iOS or web) unlocks the other
with no second purchase.

**Note**: there is no automated test runner in this repo, so both passes are manual. For
the parts that need a pro account rather than a purchase, `web/scripts/seed-comp-access.ts`
grants permanent pro to a named allowlist of accounts (an `Entitlement` row with
`store: "comp"`, no purchase involved, idempotent on re-run), so manual QA does not have
to burn a sandbox or test-mode purchase on every run. Run it from `web/` with
`npx tsx scripts/seed-comp-access.ts`. `tsx` is a declared devDependency as of this pass;
the script previously ran through `jiti`, which worked only by accident, since `jiti` was
never a declared dependency and was merely hoisted into `node_modules` by `eslint` and
`@tailwindcss/node`. Exercising the downgrade-selection half still needs seeded over-cap
or lapsed data in the dev database.

---

Delete this file once every stage is verified complete.
