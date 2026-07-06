# Plan: Autofill a bookmark from a selected business (location search)

> Status: **shipped.** Both autofill entry points — **paste a link** and **search a place/
> business** — live together in one titled **"✨ Autofill"** section at the top of `BookmarkForm`
> (a tinted `pixel-box-sm` card with a header, the link row, an "or" divider, then the place search
> + hint). Picking a business **overwrites** the managed fields (name, source URL, description,
> images, video) to reflect the newly-picked business — on both the create and edit forms (see
> "Behavior" below). Earlier revisions used a "fill empty only" pass and kept the two inputs as
> separate plain fields; both have been superseded.

## Context
The bookmark form already has a Mapbox Search Box location field (`LocationInput`) and a
separate "paste a link to autofill" flow (`fetchLinkMetadata`). We want selecting a **business**
in the location search to also autofill the rest of the bookmark: name, description, a relevant
URL, and the location — so a user can create a bookmark just by searching for a place.

Today `LocationInput` is self-contained (sets only location/lat/lon) and `retrievePlace`
**discards** the business data it gets back. The fix: surface the POI data from retrieve, let
`LocationInput` notify the parent form on pick, and have `BookmarkForm` fill the empty fields.

**Confirmed decisions:** when a business has a website, **unfurl it** via the existing
`fetchLinkMetadata` for a real description + images (fall back to a category-based description when
there's no website). Website/phone from Mapbox `metadata` is best-effort (undocumented, present for
some POIs).

## Behavior (as shipped)
Each business pick **overwrites** the managed fields to reflect that business, on both the create
and edit forms (re-picking a different business fully replaces the previous one's data):
- **name** ← `place.name` (or the unfurled `<title>` if the POI has no name).
- **urls** ← `place.website` (cleared when the business has no site).
- **description** ← unfurled description, else `place.category` (e.g. "Restaurant").
- **images / video** ← from the unfurl; cleared when there's no website or the unfurl fails.
- **location / lat / lon** ← set by `LocationInput` itself (unchanged).

Picking a plain **address** (`isPoi === false`) still fills location only. The clear-then-enrich
step is hidden behind the existing "Fetching link…" overlay while the website unfurls.

## Changes

### 1. `src/lib/actions/places.ts` — return business data from retrieve
- Extend the `RetrieveFeature` `properties` type with `feature_type?: string`,
  `poi_category?: string[]`, `metadata?: { website?: string; phone?: string }`.
- Extend `RetrievedPlace` with `name: string`, `category: string` (first `poi_category`,
  title-cased), `website: string` (`metadata?.website ?? ""`), `isPoi: boolean`
  (`feature_type === "poi"`). Keep `label/address/lat/lon`.
- Populate them in `retrievePlace` (defensive — all optional in Mapbox).

### 2. `src/components/bookmarks/LocationInput.tsx` — notify parent on pick
- Add optional prop `onAutofill?: (place: RetrievedPlace) => void`. In `pick()`, after a
  successful `retrievePlace`, call `onAutofill?.(result.data)`. All existing behavior
  (location/lat/lon + hidden inputs) is unchanged; the callback is purely additive.

### 3. `src/components/bookmarks/BookmarkForm.tsx` — fill the empty fields
- Pass `onAutofill={handleLocationAutofill}` to `<LocationInput>`.
- `handleLocationAutofill(place)` (only acts when `place.isPoi`):
  - **name** ← `place.name` if the `name` field is empty.
  - **url** ← `place.website` (via the existing `addSourceUrl`) if `urls` is empty.
  - **description / images / video**: if `place.website` present, reuse the existing autofill
    path — `setLoading(true)` (existing overlay: "Fetching link…"), `fetchLinkMetadata(website)`,
    then fill `description` (if empty) ← `d.description`, `images` (if empty) ← `d.images`,
    `video` (if empty) ← `d.video`, and `name` (if still empty) ← `d.title`. On no-website or
    unfurl failure, set `description` (if empty) ← `place.category` (e.g. "Restaurant"). No error
    surfaced — the pick itself succeeded.
  - location/lat/lon are already set by `LocationInput` (that's the field's job).
- Reuses existing state/util already in this file: `name/urls/description/images/videoUrl/
  videoType`, `addSourceUrl`, `loading`, and the `fetchLinkMetadata` import.

## Scope / notes
- Change is internal to `LocationInput` ↔ `BookmarkForm`, so it applies everywhere the form is
  used (list create panel, `/bookmarks/new`, and the detail edit form) with no host changes.
  "Fill empty only" keeps the edit form safe (won't clobber an existing bookmark).
- Picking a plain **address** (not a POI) behaves exactly as today — location only.
- Best-effort: if Mapbox returns no `website` for a business, description falls back to its
  category and no URL/images are added.

## Verification
1. `npm run lint` + `npm run build` (green).
2. `npm run dev` → Home → **＋ New bookmark** (and also test the list-page create panel):
   - In the Location field, search a business with a website (e.g. a known restaurant) and pick
     it → name fills with the business name, the location fills with its address (pin set), the
     URL fills with its website, and description/images populate from the unfurl (brief "Fetching
     link…" overlay).
   - Pick a business with no website → name + location + a category description ("Restaurant"),
     no URL/images.
   - Pick a plain street address → only the location fills (unchanged behavior).
   - Type a name/description first, then pick a business → your typed values are kept (fill-empty).
3. Save → the bookmark shows the autofilled data and the location opens in a maps app.
