# Klect Autofill & Comprehension Fixes: Implementation Plan

Three fixes to the share-sheet/link-autofill pipeline (`web/src/lib/core/metadata.ts`
and friends): a bug where a slow Mapbox geocode call discards an already-successful AI
comprehension result, missing timeouts across several upstream fetchers that can hang
indefinitely, inconsistent/raw titles out of the JSON-LD fast path, and Instagram links
producing boilerplate in the bookmark Name and noisy raw caption text in the Description.
Full reasoning (why each fix is shaped this way, the two corrections the final planning
pass made to the draft, and every decision Ryan made) lives in this conversation's
history with `klect-manager`, summarized in the vault at
`10 - Klect/Klect Manager.md`'s Decision Log, 2026-10-22 entries. This file tracks the
5-stage build only.

## Architectural constraints these stages must respect

- **One brain, two transports.** `core()` functions in `web/src/lib/core/*` stay the
  single source of truth; a `"use server"` action wrapper and/or a tRPC procedure call
  the same `core()`. All five stages here are read-only query code
  (`metadata.fetch`/`extract`/`comprehend`, `places.*`) behind `requireUser()` /
  `protectedProcedure` — no Prisma, no mutations, no `assertRole` surface, no schema
  changes anywhere in this plan.
- **No test runner exists in this repo.** Correctness rests on TypeScript, the build and
  lint gates, and manual verification. Two of these stages (title cleaning, and the
  deterministic half of Instagram parsing) get a disposable `tsx` fixture script instead,
  mirroring the existing `web/scripts/verify-move-plan.ts` precedent — which is also why
  the two new modules (`title-clean.ts`, `instagram.ts`) must NOT `import "server-only"`.
- **Shared `Deadline`, not independent timeouts.** Stage 1 introduces one `Deadline`
  object per unfurl, threaded through every fetcher via `slice(deadline, ownTimeout)`.
  Stage 2's geocode stage must draw from the *same* deadline, not a fresh independent
  budget — two independent budgets stack latency instead of bounding it.

## Stage 1: Shared deadline + upstream timeouts

**Goal**: Replace the flat `COMPREHENSION_TIMEOUT_MS = 10_000` with
`UNFURL_BUDGET_MS = 8_000` and a `Deadline` object created once per unfurl in
`fetchLinkMetadata()`. Add `AbortController`-based timeouts to every upstream fetcher that
currently has none: `searchPlaces`/`retrievePlace`/`reverseGeocode` in `places.ts` (5s
each, matching `page-text.ts`'s existing pattern), `fetchYouTube` (4s),
`fetchLinkPreview`/`fetchMicrolink` (6s each) in `metadata.ts`, and `fetchPage`/`fetchHtml`
in `page-text.ts` (a whole-operation `budgetMs` cap threaded through its per-hop redirect
loop — the real worst case is ~27s today, not ~17s, because the existing 5s timeout
applies per redirect hop, 3 hops max).

**Success Criteria**: A normal URL's happy path is byte-for-byte unchanged (first redirect
hop still gets a full 5s). A URL on a host that hangs indefinitely now answers by
~8s instead of hanging ~27s+. The live `LocationInput`/`NearbyFinder` autocomplete (which
shares `places.ts`) is unaffected on the happy path and now bounded on the unhappy one.

**Tests**: No test runner — `tsc`/lint/`next build` plus manual verification: paste a
normal article/YouTube/Instagram link and confirm autofill still fills (no new false
timeouts); point at a deliberately slow endpoint and confirm the budget-exhausted warning
logs and the answer lands near the new budget instead of the old worst case.

**Status**: Complete — `tsc`/lint clean. Manual slow-endpoint verification still pending
(code-complete, not yet exercised against a real hanging host).

## Stage 2: Decouple geocoding from comprehension

**Goal**: Split `comprehend()` into a text-only step (`comprehendText`, returns
title/description/tags/location — no coordinates) and a separately-bounded,
separately-cached (`geo:${location}`) coordinate-resolution tail step, both drawing from
the Stage 1 `Deadline`. `comprehensionWithinBudget` races only the text step against the
remaining budget; geocoding gets `min(3000ms, remaining)` afterward. A slow/hung Mapbox
call now degrades to "location string, null coordinates" instead of discarding an
already-successful title/description/tags. The timeout must wrap the *call to*
`cached(...)`, not live inside it, so the real geocode keeps running and populates the
cache for the next paste of the same URL.

**Success Criteria**: `getLinkComprehension()`'s public return shape (`LinkComprehension`)
is unchanged, so `web/src/lib/actions/metadata.ts` and
`web/src/server/trpc/routers/external.ts`'s `metadataRouter.comprehend` need zero changes,
and mobile's type-only `AppRouter` import doesn't move. A fast comprehension + slow geocode
now returns title/description/tags/location-string with `latitude`/`longitude: null`,
where today it would return `EMPTY_COMPREHENSION` entirely. Pasting the same URL again
after a degraded answer now returns full coordinates from the warmed cache.

**Tests**: No test runner — manual: a venue URL where comprehension is fast and
coordinates land normally; force the geocode stage to lose its race and confirm
Name/Description/Tags/Location still arrive with no map pin, then repaste and confirm the
pin now appears. Also run `cd mobile && npm run lint` to confirm the type-only `AppRouter`
import still resolves cleanly (should be a no-op diff).

**Status**: Complete — `tsc`/lint clean; `web/src/lib/actions/metadata.ts` and
`web/src/server/trpc/routers/external.ts` confirmed unchanged (zero diff); `cd mobile &&
npm run lint` confirmed clean, `AppRouter` type-only import unaffected. Manual
degrade/repaste verification still pending.

**Depends on**: Stage 1 (shares the `Deadline` object).

## Stage 3: JSON-LD + og:title cleaning

**Goal**: New pure module `web/src/lib/title-clean.ts` exporting
`cleanTitle(raw: string | null | undefined): string | null` — deliberately conservative
(strip at most one trailing brand-shaped tail; never split on a bare unspaced `-`/`:`;
never strip when the head is short or the tail is longer than the head). Applied at four
points: once in `structuredDataFromJsonLd` (`structured-data.ts`, between `map(node)` and
the usefulness check — covers all five mappers with one line), and in `fromPage`,
`fetchLinkPreview`, and `fetchMicrolink` in `metadata.ts` (NOT `fetchYouTube` — oEmbed
returns a video title, not an SEO-suffixed page title). Confirmed by Ryan: applies to both
unfurl fallback paths, not just the JSON-LD path.

**Success Criteria**: A recipe/how-to/event/product/place page's JSON-LD-derived title no
longer carries a trailing `" | Site Name"`/`" - Home"` suffix. A generic page's title is
cleaned consistently regardless of which of `fromPage`/`fetchLinkPreview`/`fetchMicrolink`
happened to answer. `fromPlace`'s/`fromEvent`'s `location` field (built from the raw name)
is deliberately left uncleaned — geocoding wants the fullest string.

**Tests**: `web/scripts/verify-title-clean.ts` (new, `npx tsx scripts/verify-title-clean.ts`
from `web/`, mirrors `verify-move-plan.ts`'s shape) — must cover both strip-correctly cases
and the regression set (`"Tokyo-Drift"`, `"9:16 Aspect Ratio Explained"`, a short-head
case, a tail-longer-than-head case, a sentence-punctuation-in-tail case, empty/null).
Live check: a recipe URL and a restaurant URL, confirm the Name loses its site suffix and
the JSON-LD detail sections still render.

**Status**: Complete, including the second signal — fixture script now passes 52/52
(46 fixtures, up from 31/24). **Resolved**: a second, non-length signal was added —
`tail.length > head.length` can now be overridden ONLY when the tail's last word is a
formal entity noun (association/foundation/institute/institution/society/university/
museum/council/alliance/coalition/federation/conservancy, singular only) AND the tail
reads as a proper-noun name (≤4 words, no article/determiner opener, every word
capitalized or a connector). Measured against a 58-title labeled corpus before shipping:
the entity-noun signal alone raised strip accuracy from 7/29 to 24/29 but newly destroyed
13 content titles (e.g. "Our Old Buildings - Cracks in the Foundation"); paired with the
name-shape check, it reaches the same 24/29 and newly destroys only 1 (a pre-existing
"brand-in-the-head" ambiguity class, not introduced by this change — documented with a
control case proving it predates the signal). A broader word list (Network/Trust/Group/
Press/Media/Magazine/Blog/News/Times/Post/Journal/Inc/LLC/Co, as originally floated) was
tested and rejected: 13/29 hits at the cost of 8 destroyed titles, net negative. `tsc`/
lint/build all clean. Live recipe/restaurant-URL check still pending (code-complete, not
yet run against real pages). Open offer from the implementer, not yet acted on: widening
the test corpus with real `og:title` values pulled from live URLs rather than
author-written fixtures, if Ryan wants the signal tuned further.

**Follow-up fix (landed)**: a real bug surfaced during browser verification —
`MIN_HEAD_LENGTH`'s guard returned the input completely unchanged, without even checking
the tail, whenever the head was under 15 characters, so `"Ramen - Wikipedia"` (head
"Ramen", 5 chars) never got cleaned despite "Wikipedia" being an unambiguous platform
name. Fixed with a third, tightly-scoped signal: a 12-entry allowlist of coined-trademark
platform names (wikipedia, youtube, reddit, facebook, instagram, pinterest, linkedin,
tiktok, imdb, spotify, github, etsy) matched by exact equality against the WHOLE tail
(never a substring — "Cats | Wikipedia Article Review Guidelines" must survive), with one
optional TLD normalization (`.com`/`.org`/`.net`/`.tv`). Real spec conflict found and
resolved: the original ask scoped this to override only the short-head guard, but a
platform tail is *also* almost always longer than its head (true for 42% of the
short-head range measured), so `"Ramen - Wikipedia"` couldn't fire without also waiving
the tail-longer-than-head guard — the platform signal now waives both, justified because
a closed-set exact-name match is stronger evidence than the short-head heuristic it's
overriding; the three remaining guards (max length, max words, punctuation) still apply
unchanged. Deliberately rejected from the allowlist, each with a constructed
real-content-tail counterexample: Medium (a size — "T-Shirt | Medium"), Amazon (a river —
"Macaws - Amazon"), Apple (a fruit — "Pie - Apple"), Twitter (a sound birds make, and
X/Twitter titles use an unspaced separator this module never splits on anyway), plus X/
Discord/Target/Yelp/Steam/Slack/Meta left off as ordinary words. Confirmed the new signal
composes correctly and asymmetrically with the existing organization-name signal (a short
head with a genuine org-name tail still does NOT strip — pinned by a dedicated fixture:
`"Our Mission | Washington Trails Association"`). Measured against a labeled 40-title
short-head corpus: 0/20 → 13/20 hits, 0 content titles destroyed. Fixture script grew
from 52/46 to 78/73 checks/fixtures, all original 52 reverified passing, not just visually
preserved. `tsc`/lint/build all clean; verified directly by reading both files and
hand-tracing several fixtures against the actual code, not taken on the agent's word
alone. Open question Ryan hasn't answered yet: whether to add Amazon despite the
river/rainforest ambiguity, since "| Amazon.com" is a genuinely common real-world title
format and the implementer flagged it as the one rejection with real missed-suffix cost.

**Resolved**: Ryan's call was "go with what you think is best" — decided to add
`"amazon.com"` (the literal, dotted domain string) as an exact-match entry, NOT bare
`"amazon"`, since real product titles read like `"Wireless Mouse - Amazon.com"` and no
legitimate content title ends in exactly that dotted string, while the bare word keeps
its river/rainforest/parrot-genus ambiguity. Implementation needed a second mechanism,
not just adding the string to the existing 12-entry set: the existing `PLATFORM_TAILS`
set is checked only *after* stripping an optional TLD, so `"amazon.com"` would have been
normalized to `"amazon"` before the lookup and have required the ambiguous bare word to
be listed — exactly what this was trying to avoid. Added a second set,
`EXACT_DOMAIN_TAILS = new Set(["amazon.com"])`, checked first and on the un-stripped
string, so `"amazon.org"`/`"amazon.net"` can never match it. Verified by reading the
diff and hand-tracing `"Wireless Mouse - Amazon.com"` (strips) and `"Macaws -
Amazon.org"` (correctly left alone) directly against the code. Fixture script grew
78/73 → 83/78, with the bare-`"Amazon"` regression (`"Macaws - Amazon"`) reconfirmed
passing and two new adversarial TLD cases added. `tsc`/lint/build all clean. This closes
the only open question from the prior pass — no outstanding decisions on this signal.

**Depends on**: none directly, but sequenced after Stage 2 to avoid concurrent edits to
`metadata.ts`.

## Stage 4: Client-side timeout backstops (web + Chrome extension)

**Goal**: Web calls `fetchLinkMetadata` as a plain server-action import with no `signal`
param (unlike mobile's tRPC `.query(input, {signal})`), so this is a client
**give-up-on-waiting, not a true cancel** — the server keeps running and still populates
its caches. New `withTimeout<T>(p, ms, fallback)` helper in `web/src/lib/utils.ts`
(resolves, never rejects, to `fallback`). Wire it into **both** `BookmarkForm.tsx` call
sites (`autofill()` AND the one inside `handleLocationAutofill()` — easy to miss) and
`QuickAddDialog.tsx`, at 10s. The raced promise, not the un-raced one, must be what
`QuickAddDialog`'s `autofill.current` ref stores, or Save can still hang.

For the Chrome extension: a *different*, worse gap — `send()` in
`extension/src/shared/messages.ts` is a bare `chrome.runtime.sendMessage` with no
cancellation primitive at all, and MV3 can kill the background service worker mid-flight,
in which case the response never arrives and the popup's spinner never clears. Add
`sendWithin<R>(request, ms, timeoutMessage)` next to `send()` (same `Promise.race`
give-up pattern) and wire it into `App.tsx`'s `enrich()` at 12s (looser than web's 10s
since the extension's form is non-blocking and nothing is gated on enrichment — confirmed
by Ryan). If the real response arrives after the cap fires, discard it rather than
retro-filling fields the user was just told failed.

**Success Criteria**: Throttling the network and pasting a slow link clears the loading
state at the cap with readable copy ("That's taking longer than expected...") rather than
hanging indefinitely; the pasted URL/typed name is preserved either way. `QuickAddDialog`'s
Save completes even when autofill never answers. The extension popup's hint clears at 12s
and Save still works afterward.

**Tests**: No test runner — manual, per the Success Criteria above, on both web (throttled
network) and the unpacked extension dev build.

**Status**: Complete (code) — web half: `tsc`/lint/`next build` clean, both
`BookmarkForm.tsx` call sites confirmed wrapped and verified by direct read. Extension
half: `tsc`/lint/`vite build` clean; manual browser verification not done (no
browser-driving tool available to that agent) — the throttled-network/popup check from
the Success Criteria above is still outstanding on both platforms. One pre-existing,
distinct gap surfaced and deliberately left untouched (scope discipline, not an oversight):
`enrich()` in the extension's `App.tsx` has no `try`/`catch` around the call, so a
genuinely *rejected* `send()`/`sendWithin()` (a crashed worker or a torn-down popup, as
opposed to one that never responds) is still an unhandled rejection that leaves the
"Fetching the page's details…" hint stuck. `sendWithin` races but doesn't swallow a
rejection, so this is no better and no worse than before.

**Follow-up fix (landed)**: the rejection gap above is closed. `enrich()` now wraps its
body in `try`/`catch`/`finally` — `setEnriching(true)` stays first (outside the try), the
whole `sendWithin` call through the metadata-apply logic is the `try` body unchanged, a
genuine rejection is caught and sets `enrichError` to `"something went wrong"` (matching
the existing render template's tone), and `setEnriching(false)` now lives in `finally`
exactly once instead of mid-function. Every exit path (success, both `!res.ok` branches,
the `!res.data.ok` branch, and a rejection) traced and confirmed to reach it. `tsc`/lint/
build clean. Also fixed in the same pass: a `'FormEvent' is deprecated` TypeScript
warning (the type doesn't model a real DOM event in `@types/react` 19.3.0) — swapped to
the non-deprecated `SubmitEvent<HTMLFormElement>` at the import and at `handleSave`'s
signature; confirmed by grep that no `FormEvent` reference remains in `extension/src/`.
Manual browser verification (actually killing the service worker mid-flight and watching
the hint clear) still not done by anyone — no browser-driving tool available to either
agent or to me.

**Depends on**: Stage 2 (so the client cap is honest against the new 8s server budget,
not the old 10s).

## Stage 5: Instagram-specific comprehension (gate lifted 2026-10-22, In Progress)

**Goal**: New pure module `web/src/lib/instagram.ts` (`isInstagramUrl`,
`parseInstagramMeta`, `firstSentence`, etc.) parsing Instagram's
`"[#] likes, [#] comments - [handle] on [date]: [caption]"` `og:description` format. The
extraction cache splits into a `baseExtraction` (raw unfurl) and `normalizeExtraction`
(deterministic Instagram cleanup on the way out of `getLinkExtraction`), so
`comprehendText` can still read the raw string to parse while the deterministic fast path
is also correct. A new `comprehendInstagram()` branch routes the hashtag-stripped caption
to the previously-dormant `comprehendCaption()` (confirmed zero live callers anywhere in
the repo) and wraps its output through `assembleDescription(desc, [])` to match every
other link's "Link Summary:" shape. `og:title` is read only as a handle source, never as
any part of the Name, once a caption parses.

**Status**: Complete. Built 2026-10-22 (`web/src/lib/instagram.ts`, the `baseExtraction` /
`normalizeExtraction` split and `comprehendInstagram()` in `metadata.ts`, fixture script
`web/scripts/verify-instagram.ts`, 49 checks), shipped as `d63cfef`. A live run on all 6
samples confirmed the deterministic path (caption-only Description, no likes/comments
prefix, `#` tags stripped, caption-derived Name); production logs confirmed the AI half
and Ryan confirmed it in the app on 2026-10-23.
**First-paste follow-up (2026-10-23)**: production showed every Instagram paste missing the
AI summary, because uncached Microlink takes ~6.5-7.5s on Instagram, was aborted at its 6s
slice, and the LinkPreview fallback only started after that, using the 8s budget up.
`extractInstagram()` now starts both together: a complete LinkPreview caption wins
outright, otherwise Microlink gets the whole remaining budget. Live: 9 of 11 Instagram links
extracted in under 2s. Placeholder and truncated-caption posts still wait for Microlink.
The caption prompt also now forbids @handles and account names in the title. Ryan lifted the gate on 2026-10-22 after supplying a
carousel and a static photo post (6 samples total), and said to build with what we have. The remaining
post types are deferred to future improvements (see "Deferred post types" below).
**Stage 0 history (kept for context):** No permanent code written yet; `instagram.ts` still doesn't exist and `metadata.ts`'s
Instagram handling is untouched. Ryan is supplying real sample URLs incrementally rather
than the full spread at once — proceeding per-batch rather than blocking for the complete
set. All four captures done via disposable, non-committed scripts replicating
`fetchMicrolink`'s/`fetchLinkPreview`'s exact requests against the real APIs directly
(not through our own `server-only`-guarded code, no repo changes left behind).

**Format CONFIRMED** (matches the secondhand description) across all 4 samples — Microlink's
`description` is always exactly: `<likes> likes, <comments> comments - <handle> on
<Month D, YYYY>: "<caption>".` (curly quotes U+201C/U+201D, trailing period *after* the
closing quote, ASCII hyphen separator, counts freely mixing abbreviated (`52K`) and
comma-grouped (`7,410`) forms). Microlink's `title` is always `<display name> (<@handle>) •
Instagram reel` — and the display name itself routinely contains its own `|`
(`"Joseph Munoz Ph.D. | Fitness Coach and Educator"`), which any Instagram-specific parser
must not confuse with the brand-suffix separator. `cleanTitle()` (Stage 3) already strips
the `• Instagram reel` tail on every sample, but what's left is still pure account
attribution, never post content — confirmed by tracing, not assumed.

**New findings, not anticipated in the original plan**:
1. Microlink is genuinely intermittent on Instagram (`EPROXYNEEDED` antibot block, free
   tier) — failed on first attempt for 1 of 4 samples, succeeded on retry.
2. When Microlink fails over to LinkPreview, LinkPreview can return a **false-positive
   success**: HTTP 200 with `title: "Instagram"` / `description: "Private media"` / a
   generic favicon — and today's `fetchLinkPreview` success guard doesn't catch this as a
   failure. A real, separate bug worth a line item of its own, independent of the
   Instagram-caption parsing work. **Fixed 2026-10-22**: `isPlaceholderPreview()` in
   `metadata.ts` now rejects that stand-in as a failure.
3. `data.date` is returned by Microlink on every sample but currently discarded by
   `fetchMicrolink` — the same date is being redundantly re-parsed out of the description's
   noisy prefix when it's already available structured.
4. `data.video` is `null` on every sample despite `&video=true` in the request.
5. The stored `sourceUrl` differs from what the user pasted: Microlink canonicalizes the
   URL (drops tracking params, injects the username into the path) on success; LinkPreview
   does not.
6. Long captions (sample 4) contain literal embedded newlines (recipe steps/bullet lists),
   not single-line text; LinkPreview truncates long descriptions at ~400 chars with a
   literal `...`, losing content Microlink's fuller description retains.

**Samples captured**: reels `DeGC80pC82E`, `Des3c52hloB`, `Dcs7vZ8DRpl`, `DezbXYRNIcQ`;
carousel `DeIDWwiAQC1`; static photo post `Dex748mljEc`. Raw strings for the reels are in
`09 - Managers/Klect Manager.md`'s Decision Log; the two post samples are logged there too.

**Findings from the carousel and photo samples (2026-10-22)**:
7. The description prefix format holds for `/p/` posts too (carousel and photo alike).
8. The **opening** quote is not always U+201C: the photo sample opens with U+201D (`”`).
   The caption itself also contains its own curly-quoted text. So the parser must accept
   either curly quote (or a straight `"`) as the opener and strip only the outermost quote
   plus the trailing `.` by position, never by searching for the first closing quote.
9. Post titles end in `• Instagram photos and videos` (not `• Instagram reel`).
   `cleanTitle()` already strips that tail; what's left is still account attribution only.
10. Trailing hashtag runs can lose their `#` partway through (carousel:
    `#Anime #Otaku AnimeCommunity Manga Weeb drkamui`). Only `#`-prefixed words can be
    stripped safely; bare trailing words stay in the caption and are left to the model.
11. LinkPreview has a second, *good* Instagram shape: on the carousel it returned the bare
    caption (no likes/comments prefix) as `description`, with `title` =
    `A post shared by <display name> (<@handle>)`. On the photo it returned the
    "Private media" placeholder, which the 2026-10-22 `isPlaceholderPreview()` fix now
    rejects (confirmed against this live response).
12. Microlink hit `EPROXYNEEDED` on the photo's first attempt again (2 of 6 samples now),
    succeeding on retry. `data.date` and the canonicalized `url` were present on both.

**Deferred post types (future improvements, not in this build)**: a location-tagged post,
a captionless post, and a login-walled/private post. With none of them sampled, the
parser treats any description that does not match the known prefix as "not parsed" and
falls back to today's behavior unchanged.

---

Delete this section once Stages 1-5 above are all verified complete (leave the
Monetization plan below alone — its own Stage 8 QA is still open and unrelated to this
work).

---

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
