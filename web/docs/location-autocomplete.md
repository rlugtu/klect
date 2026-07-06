# Bookmark location: address / business autocomplete

## Overview
A bookmark's `location` is a type-ahead field that searches for either an **address** or the
**name of a business/POI**, so entries are accurate and structured. Picking a suggestion stores
the display address plus its `latitude`/`longitude`. On the bookmark detail page the address is
tappable and hands off to a native maps app. Free-typed text is still accepted (saved without
coordinates).

## Data
`model Bookmark` (in `prisma/schema.prisma`) stores:
- `location String @default("")` — the display address, or free text.
- `latitude Float?` / `longitude Float?` — set only when a suggestion is picked; `null` for free
  text and legacy rows.

## Search — Mapbox Search Box API
Search is proxied through server actions in `src/lib/actions/places.ts` so the token never reaches
the client (`await requireUser()` first, discriminated-union results, `cache: "no-store"`, `[places]`
log prefix). `MAPBOX_TOKEN` (a public `pk.*` token) must be set in `.env` **and** the deploy host
env; if unset the feature degrades to plain text (the action returns "not configured", no crash).

The API is two-step:
1. **`searchPlaces(text, sessionToken)`** → `GET /search/searchbox/v1/suggest` — returns up to 6
   suggestions `{ id, label, address }` **without** coordinates. No `types` filter, so results
   include both addresses and businesses/POIs. Biased toward the request origin via `proximity=ip`.
2. **`retrievePlace(id, sessionToken)`** → `GET /search/searchbox/v1/retrieve/{id}` — resolves the
   picked suggestion's `latitude`/`longitude` (+ address).

Both calls share a client-generated `session_token` (UUIDv4) so the whole type-ahead counts as one
Mapbox billing session; the token is rotated after each pick.

## UI
- **`src/components/bookmarks/LocationInput.tsx`** (`"use client"`) — the visible `PixelInput` plus
  three hidden inputs (`location`, `latitude`, `longitude`) so the bookmark form submits by name.
  Debounced search (350 ms, min 3 chars, stale-response guard). On pick it fills the text
  immediately, then calls `retrievePlace` to fill the coordinates; free typing clears the
  coordinates (the text no longer matches a pin) and still saves via the hidden `location` input.
- **`src/components/bookmarks/BookmarkForm.tsx`** — renders `<LocationInput>` for the Location
  field; `BookmarkDefaults` carries `latitude`/`longitude`.
- **`src/lib/actions/bookmarks.ts`** — `parseBookmarkFields` parses `latitude`/`longitude` as
  float-or-null; create/update spread them onto the row.
- **`src/components/bookmarks/LocationLink.tsx`** (`"use client"`) — on the detail page the address
  is a tappable button that hands off to a maps app with the place pre-loaded (stored coordinates →
  exact pin, else the location text as a search query). Apple platforms get an Apple Maps / Google
  Maps chooser; everywhere else opens Google Maps directly. There is no in-app map.

## Verification
1. Set `MAPBOX_TOKEN` in `.env`; run `npm run build` + `npm run lint`.
2. Create/edit a bookmark: type a business ("Ramen Nagi") and a street address → the debounced
   dropdown shows ≤6 suggestions → pick one → the field fills with the formatted address and the
   hidden `latitude`/`longitude` populate (the `retrieve` call resolves in DevTools Network).
3. Save → detail page: tapping the address opens the maps app on the exact pin.
4. A bookmark with no coordinates (free text): the form still saves; the address opens as a maps
   search.
5. DevTools Network: the browser only calls the Next server action, never `api.mapbox.com` (token
   stays server-side).

## Notes
- Without the token the feature is inert but safe (action returns "not configured"; plain text
  still saves).
- `proximity=ip` biases by the server's IP (the proxy origin), not the end user's.
- Search Box bills per session (a suggest run + its retrieve), not per keystroke.
