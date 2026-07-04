# Near me: find bookmarks near your current location

## Overview
`/nearby` lets a user find bookmarks close to where they are right now. The user picks a **radius**
and (optionally) narrows to a subset of their lists, taps **Find near me**, and — after granting
the browser's geolocation prompt — sees the in-range bookmarks ordered **closest→farthest**, each
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

1. **`src/app/nearby/page.tsx`** (RSC) — `requireOnboardedUser()` → `getUserLists()` → passes the
   user's lists to the client island.
2. **`src/components/bookmarks/NearbyFinder.tsx`** (`"use client"`) — radius `<select>`
   (`NEARBY_RANGES_MI`), per-list toggle chips (all selected by default; Select-all / Clear-all),
   and the **Find near me** button. On click it calls `navigator.geolocation.getCurrentPosition`,
   then the server action, and renders results with `BookmarkCard` (its `listLabel` +
   `distanceLabel` props). Handles locating/searching/empty/skipped/no-lists/permission-error states.
3. **`src/lib/actions/nearby.ts`** — `findNearbyBookmarks({ lat, lon, radiusMiles, listIds })`:
   `requireUser()`, fetch candidate bookmarks, haversine-filter to the radius, sort ascending, and
   return `{ ok, data: NearbyBookmark[], skipped }`. `NearbyBookmark` carries the card data, list
   id/label, and `distanceMiles`.

## Supporting pieces
- **`src/lib/geo.ts`** — `haversineMiles(lat1, lon1, lat2, lon2)`, `NEARBY_RANGES_MI`
  (`[0.5, 1, 2, 5, 10]`, miles), and `formatMiles(mi)`.
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
