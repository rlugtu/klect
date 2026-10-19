# Near me: find bookmarks near your current location

## Overview
`/nearby` lets a user find bookmarks close to where they are right now. The user picks a **radius**
and (optionally) narrows to a subset of their lists, taps **Find near me**, and — after granting
the browser's geolocation prompt — sees their detected location as a readable address in a banner
above the results, then the in-range bookmarks ordered **closest→farthest**, each
tagged with its list and its distance ("2.3 mi away"). Reached from a header button on Home.
Opening a result and tapping **← Back** on the bookmark page returns here (it uses browser
history), with the previous results still shown.

Only bookmarks with stored coordinates can be matched. Coordinates are set when a location is
picked from autocomplete (see `docs/location-autocomplete.md`); free-typed and legacy bookmarks
have none. Those with a typed location but no coordinates are excluded and surfaced as an
"N skipped" note.

## Flow
Geolocation is browser-only, so the page is an RSC shell around a client island, and the distance
work happens in a server action (server-first, no separate HTTP API):

1. **`src/app/(app)/nearby/page.tsx`** (RSC) — `requireOnboardedUser()` → `getUserLists()` → passes the
   user's lists to the client island.
2. **`src/components/bookmarks/NearbyFinder.tsx`** (`"use client"`) — radius `<select>`
   (`NEARBY_RANGES_MI`), per-list toggle chips (all selected by default; Select-all / Clear-all),
   and the **Find near me** button. On click it calls `navigator.geolocation.getCurrentPosition`,
   then — in parallel — the search server action and `reverseGeocode` (`lib/actions/places.ts`,
   Mapbox Geocoding v6) to turn the coordinates into a readable address, shown in a **banner above
   the results** (falls back to formatted coordinates via `formatCoords` if the lookup fails or
   `MAPBOX_TOKEN` is unset). Renders results with `BookmarkCard` (its `listLabel` +
   `distanceLabel` props). Handles locating/searching/empty/skipped/no-lists/permission-error states.
3. **`src/lib/actions/nearby.ts`** — `findNearbyBookmarks({ lat, lon, radiusMiles, listIds })`:
   `requireUser()`, fetch candidate bookmarks, haversine-filter to the radius, sort ascending, and
   return `{ ok, data: NearbyBookmark[], skipped }`. `NearbyBookmark` carries the card data, list
   id/label, `distanceMiles`, and the bookmark's `lat`/`lon` (used by the mobile map to drop pins;
   the web list ignores them).

### Desktop split (lg, 1024px and up)
At lg+ the page becomes two panes; below lg it is the single column described above, unchanged.
Left: the same controls, location banner, count and "N skipped" note, then the results as
compact numbered rows (photo, name, list, distance). Right: the selected result's detail, rendered
by the same `BookmarkPanelContent` the list page's side panel uses, with "open full page" and close
(Esc also closes). Selecting a row sets **`?b=<bookmarkId>`** on `/nearby`; the page reads it with
`getBookmarkDetail` (same permission and lock derivation as the full bookmark page), so an id the
viewer cannot read shows a "not available" note. Results are client state in `NearbyFinder` and
survive that navigation (the router keys the page segment without search params). Opening pushes a
history entry, switching replaces it, closing pops it. Modified and middle clicks on a row still
open the full bookmark page. There is **no map**: a web map is blocked on the public Mapbox token
decision (desktop strategy, Open Decision 3), and no map slot is rendered until then.

> **Mobile** consumes the same logic via the `nearby.find` tRPC procedure but renders a full-screen
> Mapbox map with a bottom drawer instead of a plain list — see `mobile/docs/ARCHITECTURE.md`.

## Supporting pieces
- **`src/lib/geo.ts`** — `haversineMiles(lat1, lon1, lat2, lon2)`, `NEARBY_RANGES_MI`
  (`[0.5, 1, 2, 5, 10]`, miles), `formatMiles(mi)`, and `formatCoords(lat, lon)` (the banner's
  coordinate fallback).
- **`src/lib/actions/places.ts`** — `reverseGeocode(lat, lon)` proxies Mapbox Geocoding v6
  `/reverse` (token stays server-side, `[places]` log prefix); best-effort, returns
  `{ ok: false }` so the client falls back to coordinates.
- **`src/lib/bookmarks.ts`** — `getBookmarksWithCoords(userId, listIds?)` (bookmarks across the
  user's lists with non-null coordinates, optional list filter; same include shape as the tag
  search so results render with a list tag) and `countBookmarksMissingCoords(userId, listIds?)`
  (in-scope bookmarks with a typed location but no coordinates — powers the skipped note).
- **`src/components/bookmarks/BookmarkCard.tsx`** — gained an optional `distanceLabel` prop shown
  beside the existing list tag; backward-compatible.

Distances are computed in-process — the dataset is a single user's bookmarks, so no SQL/PostGIS
distance is needed. No Mapbox call is involved; geolocation supplies the coordinates directly.

## Verification
1. `npm run lint` + `npm run build` (green; `/nearby` route compiles).
2. `npm run dev` (geolocation works on localhost). Ensure a couple of bookmarks have picked
   (geocoded) locations near your dev location.
3. Home → **📍 Near me** → choose a radius, keep all lists selected → **Find near me** → allow the
   prompt → results appear closest→farthest, each with a list tag and "X mi away".
4. Tighten the radius (fewer/no results), deselect a list (its bookmarks drop out), deselect all
   ("Select at least one list"), and deny the location prompt (friendly error, no crash).
5. Confirm the skipped-note count reflects bookmarks with a typed location but no coordinates.
