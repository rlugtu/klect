# Bookmark location: address / business autocomplete + mini map

> **Status: planned, not yet implemented.** Approved plan saved for later execution.

## Context
Today a bookmark's `location` is a single free-text `String @default("")` — typed manually,
displayed only as `📍 {location}` on the detail page, and used in no search. We want the
location field to become a **type-ahead search** that matches either an **address** or the
**name of a business/POI** at that address, so entries are accurate and structured. We'll also
store coordinates and show a small map, laying groundwork for future map/location features.

**Decisions (chosen with the user):**
- Provider: **Geoapify** Geocoding Autocomplete (free tier, key kept server-side).
- Behavior: autocomplete the location field on create/edit (no bookmark filtering-by-location).
- Storage: keep the display address string **plus** `latitude`/`longitude`; render a **Leaflet
  + free OpenStreetMap tiles** mini-map with a marker on the bookmark detail page.

## Dependencies to add
```
npm install react-leaflet@^5.0.0 leaflet@^1.9.4
npm install -D @types/leaflet
```
react-leaflet 5 peers on React 19 (matches 19.2.4); use leaflet 1.9.4 (NOT the 2.0-alpha the
react-leaflet master references). Add `GEOAPIFY_API_KEY=` to `.env` (real key from a free
geoapify.com account) and `.env.example` (empty + comment). Server-side only — never
`NEXT_PUBLIC_`.

## Approach

**A. Schema** — `prisma/schema.prisma`, add to `model Bookmark` (after `location`):
`latitude Float?` and `longitude Float?` (nullable — old rows + free-typed entries have none).
Then `npx prisma migrate dev --name add_bookmark_coordinates` → **`npx prisma generate`**
(required; Prisma 7 doesn't regenerate on migrate) → restart dev.

**B. Server action** — new `src/lib/actions/places.ts`, modeled on `src/lib/actions/metadata.ts`
(`"use server"`, `await requireUser()` first, discriminated-union result, `cache:"no-store"`,
`429` handling, `[places]` log prefix). Proxies Geoapify so the key never reaches the client:
- Endpoint: `GET https://api.geoapify.com/v1/geocode/autocomplete?text=<q>&format=json&limit=6&lang=en&apiKey=<key>`
  (leave `type` unset so results include both addresses AND business/POIs).
- Return `{ ok:true, data: PlaceSuggestion[] } | { ok:false, error }` where
  `PlaceSuggestion = { label /*address_line1*/, address /*formatted*/, lat, lon }`.
- Guard: return `{ok:true,data:[]}` for `text.length < 3`; `{ok:false,"…not configured."}` if
  key unset (feature degrades to plain text, no crash).

**C. Autocomplete component** — new `src/components/bookmarks/LocationInput.tsx` (`"use client"`),
cloning the dropdown recipe in `src/components/search/SearchBar.tsx` (relative wrapper,
`PixelInput`, `framer-motion` `motion.div` dropdown with `onMouseDown={e=>e.preventDefault()}`,
`MAX_RESULTS=6`). Props: `initialLocation`, `initialLat`, `initialLon`.
- Renders the visible `PixelInput` (bound to `query`) **plus three hidden inputs** so the form
  still submits by name: `location` (= query), `latitude`, `longitude`.
- Debounced fetch (350 ms, min 3 chars, AbortController/stale-guard, skip unchanged) → calls
  `searchPlaces(query)`. Row shows `label` + muted `address`.
- On pick: set query=address, lat, lon, close. On free typing: clear lat/lon (text no longer
  matches a pin) — free text still saves via the hidden `location` input.

**D. Form** — `src/components/bookmarks/BookmarkForm.tsx`: extend `BookmarkDefaults` with
`latitude: number|null; longitude: number|null`; remove the local `location` state + plain
`PixelInput name="location"` block and replace the `Location` field body with `<LocationInput
initialLocation=… initialLat=… initialLon=… />`.

**E. Parse/mutation** — `src/lib/actions/bookmarks.ts`: add `latitude/longitude` to
`BookmarkFields`; in `parseBookmarkFields` parse them as float-or-null
(`v!==null && v!=="" && Number.isFinite(Number(v)) ? Number(v) : null`). create/update already
spread `...fields`, so no further change.

**F. Map** — two files in `src/components/bookmarks/`:
- `LocationMap.tsx` (`"use client"`): imports `leaflet/dist/leaflet.css`, builds an explicit
  `L.icon(...)` from the unpkg marker PNGs (avoids the broken-icon bug), renders
  `<MapContainer center={[lat,lon]} zoom={15} style={{height:220,width:"100%"}}>` with an OSM
  `TileLayer` (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` + required attribution) and a
  `Marker`. Wrap in a `pixel-box-sm` div for visual consistency.
- `LocationMapClient.tsx` (`"use client"`): `const LocationMap = dynamic(()=>import("./LocationMap"),{ssr:false})` and re-exports it. (`ssr:false` must live in a client module, not the server page.)

**G. Detail page** — `src/app/lists/[id]/bookmarks/[bid]/page.tsx`: add `latitude/longitude` to
`editDefaults` (full row is already returned by `getBookmarkForUser`); below the `📍` line render
`{bookmark.latitude!=null && bookmark.longitude!=null && <LocationMapClient lat=… lon=… label={bookmark.location||undefined} />}`.

## Critical files
- `prisma/schema.prisma` (migration)
- `src/lib/actions/places.ts` (new) — copy pattern from `src/lib/actions/metadata.ts`
- `src/components/bookmarks/LocationInput.tsx` (new) — copy dropdown from `src/components/search/SearchBar.tsx`
- `src/components/bookmarks/LocationMap.tsx` + `LocationMapClient.tsx` (new)
- `src/components/bookmarks/BookmarkForm.tsx`, `src/lib/actions/bookmarks.ts`,
  `src/app/lists/[id]/bookmarks/[bid]/page.tsx`
- `.env` / `.env.example`

## Verification
1. Put a real `GEOAPIFY_API_KEY` in `.env`; run migrate → `prisma generate` → restart.
2. `npm run build` (catches broken SSR/dynamic-import wiring), `npm run lint`, `tsc`.
3. Create/edit a bookmark: type a business name (e.g. "ramen nagi") and a street address →
   debounced dropdown shows ≤6 suggestions → pick one → field fills with the formatted address.
4. Save → detail page shows the Leaflet map + marker at the right spot with OSM attribution and
   no broken icon.
5. Edit a pre-migration bookmark (no coords): form works, free text saves, detail shows text with
   **no** map.
6. DevTools Network: browser only calls the Next server action, never `api.geoapify.com`
   (key stays server-side).

## Risks / notes
- Without the key the feature is inert but safe (action returns "not configured"; plain text still
  saves). Never expose the key or use Geoapify static-map `<img>` (would leak it) — Leaflet+OSM
  needs no key.
- Quota 3k/day: mitigated by 350 ms debounce + 3-char min + stale-guard + `429` messaging.
- React 19/Leaflet: react-leaflet@5 + leaflet@1.9.4, `ssr:false` in a client wrapper, explicit
  marker icon, import leaflet CSS, give `MapContainer` an explicit height.
